// The physics: Roblox gravity and momentum, the Humanoid braking itself, and
// JJS's ragdolls, through the simulator as a skill would drive them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, motionAt } from '../core/sim.js';
import { PHYSICS } from '../core/physics.js';

const program = (line, branch = {}) => ({ DATA: { Req: [], Line: line, Prop: {}, Branch: branch } });
const at = (run, who, t) => motionAt(run.motion[who], t);
const peak = (run, who) => Math.max(...run.motion[who].map((p) => p[1]));

describe('physics', () => {
  it('a TELEPORT lands at once: a HITBOX right after it is where it put you', () => {
    // 20 studs forward, then a hitbox in front, in the same frame (no WAIT).
    const run = simulate(
      program([
        { K_NAME: 'TELEPORT', POSITION: '0, 0, 20' },
        { K_NAME: 'HITBOX', POSITION: '0, 0, 3', SIZE: '4, 4, 4' },
        { K_NAME: 'WAIT', TIME: 0.5 },
      ]),
      { hits: 'never' },
    );
    const box = run.events.find((e) => e.kind === 'HITBOX');
    const tp = run.events.find((e) => e.kind === 'TELEPORT');
    assert.ok(tp.t <= box.t, 'the teleport comes first');
    // The hitbox is 3 in front of where you landed, not of where you started.
    const start = at(run, 'user', 0);
    const along = Math.hypot(box.at[0] - start[0], box.at[2] - start[2]);
    assert.ok(Math.abs(along - 23) < 0.5, `hitbox ${along.toFixed(2)} studs from the start, expected 23`);
  });

  it('a launch keeps rising after the push, then falls at Roblox gravity', () => {
    const run = simulate(
      program([
        { K_NAME: 'VELO', FORCE: '0, 40, 0', TIME: 0.2 },
        { K_NAME: 'WAIT', TIME: 2 },
      ]),
    );
    // 8 studs under the push, then 40²/(2 × 196.2) ≈ 4.08 more on momentum.
    const expected = 8 + 40 ** 2 / (2 * PHYSICS.gravity);
    assert.ok(Math.abs(peak(run, 'user') - expected) < 0.3, `peak ${peak(run, 'user')} ≈ ${expected}`);
    assert.equal(at(run, 'user', 2)[1], 0, 'and lands');
  });

  it('a push with y 0 lets gravity work; a tiny y holds you in the air', () => {
    const up = { K_NAME: 'VELO', FORCE: '0, 30, 0', TIME: 0.3 };
    const wait = { K_NAME: 'WAIT', TIME: 0.3 };
    const dash = simulate(
      program([up, wait, { K_NAME: 'VELO', FORCE: '0, 0, 40', TIME: 0.5 }, { K_NAME: 'WAIT', TIME: 1 }]),
    );
    const pin = simulate(
      program([up, wait, { K_NAME: 'VELO', FORCE: '0, 0.001, 0', TIME: 0.5 }, { K_NAME: 'WAIT', TIME: 1 }]),
    );
    assert.ok(at(dash, 'user', 0.75)[1] < at(pin, 'user', 0.75)[1] - 3, 'the dash falls, the pin hovers');
    assert.ok(Math.abs(at(pin, 'user', 0.75)[1] - 9) < 0.2, 'held where the launch stopped');
  });

  it('a standing Humanoid brakes itself; a ragdoll slides on', () => {
    const shove = (ragdoll) =>
      simulate(
        program([
          { K_NAME: 'VELO', FORCE: '0, 0, 50', TIME: 0.1, RAGDOLL: ragdoll },
          { K_NAME: 'WAIT', TIME: 3 },
        ]),
      );
    const standing = at(shove(0), 'user', 3)[2];
    const ragdolled = at(shove(3), 'user', 3)[2];
    assert.ok(standing < 8, `standing stops soon after the push (${standing})`);
    // 5 studs under the push, then 50² / (2 × friction × g) sliding.
    const slide = 5 + 50 ** 2 / (2 * PHYSICS.friction * PHYSICS.gravity);
    assert.ok(Math.abs(ragdolled - slide) < 1, `ragdoll slides to ${ragdolled} ≈ ${slide}`);
  });

  it('a regular ragdoll counts from landing; a true ragdoll from the hit', () => {
    const launch = (isTrue) =>
      simulate(
        program([
          { K_NAME: 'VELO', FORCE: '0, 40, 0', TIME: 0.2, RAGDOLL: 1, 'TRUE RAGDOLL': isTrue },
          { K_NAME: 'WAIT', TIME: 4 },
        ]),
      ).ragdolls.user[0];
    const regular = launch(false);
    const trueOne = launch(true);
    assert.ok(regular.landed > 0.6, `lands after its flight (${regular.landed})`);
    assert.ok(Math.abs(regular.t1 - (regular.landed + 1)) < 0.01, 'then lies there for its 1 s');
    assert.ok(Math.abs(trueOne.t1 - 1) < 0.01, 'a true ragdoll ends 1 s after the hit, mid-air or not');
  });

  it('ragdolled targets need HIT RAGDOLL; CLEAR KNOCKBACK picks them up', () => {
    const knock = {
      K_NAME: 'HITBOX',
      SIZE: '10, 10, 10',
      POSITION: '0, 0, 4',
      DAMAGE: 1,
      BRANCH: '',
      'BRANCH TARGET': 'Down',
    };
    const down = { Down: { Req: [], Line: [{ K_NAME: 'VELO', FORCE: '0, 0, -5', TIME: 0.05, RAGDOLL: 3 }] } };
    const again = (extra) =>
      simulate(program([knock, { K_NAME: 'WAIT', TIME: 0.3 }, { ...knock, 'BRANCH TARGET': '', ...extra }], down));
    const plain = again({});
    assert.ok(plain.log.some((l) => l.text === 'hitbox misses: they’re ragdolled'));
    const allowed = again({ 'HIT RAGDOLL': true });
    assert.equal(allowed.events.filter((e) => e.kind === 'HIT').length, 2);
    const cleared = again({ 'HIT RAGDOLL': true, 'CLEAR KNOCKBACK': true });
    assert.ok(cleared.ragdolls.target[0].t1 < 0.35, 'the ragdoll ends at the hit');
  });

  it('a wall stops a knockback, and a ragdoll bounces off it', () => {
    const run = simulate(
      program([
        { K_NAME: 'VELO', FORCE: '0, 0, 60', TIME: 0.5, RAGDOLL: 2 },
        { K_NAME: 'WAIT', TIME: 1 },
      ]),
      {
        wall: 10,
      },
    );
    const furthest = Math.max(...run.motion.user.map((p) => p[2]));
    assert.ok(furthest <= 10 - PHYSICS.halfDepth + 1e-6, `never through the wall (${furthest})`);
  });

  it('a grab holds them to you, and they leave with your speed', () => {
    const run = simulate(
      program(
        [
          {
            K_NAME: 'HITBOX',
            SIZE: '10, 10, 10',
            POSITION: '0, 0, 4',
            DAMAGE: 1,
            STUN: 1,
            BRANCH: 'Held',
            'BRANCH TARGET': '',
          },
        ],
        {
          Held: {
            Req: [],
            Line: [
              { K_NAME: 'GRAB', POSITION: '0, 0, 3', TIME: 0.5, 'LAST HIT': 0.3 },
              { K_NAME: 'VELO', FORCE: '0, 0, 20', TIME: 0.5 },
              { K_NAME: 'WAIT', TIME: 0.6 },
            ],
          },
        },
      ),
    );
    const you = at(run, 'user', 0.4);
    const them = at(run, 'target', 0.4);
    assert.ok(Math.abs(them[2] - you[2] - 3) < 0.2, `3 studs in front of you (${them[2] - you[2]})`);
  });
});
