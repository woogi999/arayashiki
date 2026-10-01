// What Arayashiki takes from JJS's own Skill Builder tables (core/gamedata.js,
// read from the game in Roblox Studio): the catalogue, the defaults a node
// leaves out, the nodes only the game's tables name, and the agent checks
// built on them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM_SETS, NODE_DEFAULTS } from '../core/gamedata.js';
import { EFFECTS, NODES, REQ_KINDS, animOf, newNode, nodeInfo, withDefaults } from '../core/schema.js';
import { simulate } from '../core/sim.js';
import { decodeMoveset } from '../core/format.js';
import * as T from '../agent/tools.js';
import { CHARACTER_1, CHARACTER_2, KATANA, GON } from './fixtures/jjs-characters.js';

const skill = (Line, Branch = {}) => ({
  K_NAME: 'SKILL',
  NAME: 'T',
  KEY: 1,
  DATA: { Req: [], Line, Prop: [], Branch },
});

describe('the game’s tables', () => {
  it('every builder kind has a palette entry, and every condition a Req kind', () => {
    const conditions = ['AIR', 'JUMP', 'AIM', 'ULT', 'HP', 'BAR', 'DOMAIN', 'DUR', 'HOLD'];
    for (const kind of Object.keys(NODE_DEFAULTS))
      if (conditions.includes(kind))
        assert.ok(
          REQ_KINDS.some((r) => r.id === kind),
          kind,
        );
      else assert.notEqual(nodeInfo(kind).group, 'Other', kind);
    assert.equal(NODES.length, Object.keys(NODE_DEFAULTS).length - conditions.length);
  });

  it('every field of every real export is one of the builder’s', async () => {
    for (const code of [CHARACTER_1, CHARACTER_2, KATANA, GON])
      for (const s of await decodeMoveset(code)) {
        if (!s.DATA || '__unreadable' in s.DATA) continue;
        const lines = [s.DATA.Line ?? [], ...Object.values(s.DATA.Branch ?? {}).map((b) => b.Line ?? [])];
        for (const n of lines.flat()) {
          const known = nodeInfo(n.K_NAME).fields.map((f) => f.key);
          for (const key of Object.keys(n)) if (key !== 'K_NAME') assert.ok(known.includes(key), `${n.K_NAME}.${key}`);
          if (n.K_NAME === 'VISUAL') assert.ok(EFFECTS.includes(n.EFFECT), n.EFFECT);
          if (n.K_NAME === 'ANIM' && Array.isArray(n.ANIM_USE)) assert.ok(animOf(n.ANIM_USE), String(n.ANIM_USE));
        }
      }
  });

  it('ANIM_USE is the builder’s AnimList: the dash and the sheath', () => {
    assert.equal(animOf([1, 19]).path, 'Gojo.Melee.Chase');
    assert.equal(animOf([13, 4]).path, 'Yuta.Sheath');
    assert.equal(animOf([99, 1]), null);
    assert.equal(ANIM_SETS.length, 25);
  });

  it('a new node and a missing field take the builder’s defaults', () => {
    assert.deepEqual(newNode('WAIT'), { K_NAME: 'WAIT', TIME: 1 });
    const hitbox = newNode('HITBOX');
    assert.equal(hitbox.SIZE, '6, 6, 6');
    assert.equal(hitbox['SINGLE TARGET'], true);
    assert.ok(!('BRANCH' in hitbox), 'unset fields are left out');
    assert.equal(withDefaults({ K_NAME: 'TAG', TAG: 'X', VALUE: '1' }).SET, true);
    assert.equal(withDefaults({ K_NAME: 'MYSTERY', A: 1 }).A, 1);
  });
});

describe('the simulator with the game’s rules', () => {
  it('a bare WAIT waits 1 s; a TAG with no SET sets, for 1 s', () => {
    const run = simulate(
      skill([
        { K_NAME: 'TAG', TAG: 'N', VALUE: '5', SET: true, TIME: 1e38 },
        { K_NAME: 'TAG', TAG: 'N', VALUE: '3' },
        { K_NAME: 'WAIT' },
        { K_NAME: 'TAG', TAG: 'N', VALUE: '1', SET: false, 'ADD/REMOVE': false },
      ]),
    );
    const said = run.log.map((l) => `${l.t} ${l.text}`);
    assert.ok(said.includes('0 tag N = 3'), said.join('\n'));
    // 1 s later the value set for 1 s has run out: subtracting starts from 0.
    assert.ok(said.includes('1 tag N = -1'), said.join('\n'));
  });

  it('HIT CANCEL: to its branch after a hit, else the move ends in endlag', () => {
    const line = [
      { K_NAME: 'HITBOX', SIZE: '8, 8, 8', POSITION: '0, 0, 4', DAMAGE: 1, BRANCH: 'nil' },
      { K_NAME: 'HITCNCL', TIME: 0.5, BRANCH: 'Next' },
      { K_NAME: 'HITCNCL', TIME: 0.5, FLIP: true, ENDLAG: 0.7 },
      { K_NAME: 'SETCD' },
    ];
    const hit = simulate(skill(line, { Next: { Req: [], Line: [{ K_NAME: 'SETCD' }] } }), { hits: 'always' });
    assert.ok(hit.log.some((l) => /hit cancel \(hit\) → Next/.test(l.text)));
    const whiff = simulate(skill(line, { Next: { Req: [], Line: [] } }), { hits: 'never' });
    assert.ok(whiff.log.some((l) => /0.7s endlag/.test(l.text)));
    assert.ok(!whiff.events.some((e) => e.kind === 'SETCD'), 'the line stops at the endlag');
  });

  it('STATE Cancel removes the states with its STATE TAG', () => {
    const run = simulate(
      skill(
        [
          { K_NAME: 'STATE', STATE: 'NoJump', TIME: 5, 'STATE TAG': 'lock' },
          { K_NAME: 'STATE', STATE: 'Cancel', 'STATE TAG': 'lock' },
          { K_NAME: 'STATE', STATE: 'NoJump', CHECK: true, BRANCH: 'Still' },
        ],
        { Still: { Req: [], Line: [] } },
      ),
    );
    assert.ok(run.log.some((l) => l.text === 'cancel states tagged lock'));
    assert.ok(!run.log.some((l) => /→ Still/.test(l.text)));
  });
});

describe('agent checks from the game’s tables', () => {
  it('validate flags effects, states, animations and fields the game doesn’t have', async () => {
    const { issues } = await T.validate({
      simulate: false,
      skill: skill([
        { K_NAME: 'VISUAL', EFFECT: 'Sparkz' },
        { K_NAME: 'STATE', STATE: 'NoChase' },
        { K_NAME: 'ANIM', ANIM_USE: [40, 1] },
        { K_NAME: 'WAIT', TIMe: 1 },
        { K_NAME: 'VISUAL', EFFECT: 'Sparks', 'ALT SIZE': 3 },
      ]),
    });
    const said = issues.map((i) => i.message).join('\n');
    assert.match(said, /EFFECT "Sparkz" .*did you mean "Sparks"/);
    assert.match(said, /STATE "NoChase" isn't a state/);
    assert.match(said, /ANIM_USE \[40,1\] isn't in JJS's animation list/);
    assert.match(said, /WAIT has no field TIMe .*did you mean TIME/);
    assert.match(said, /Sparks doesn't read ALT SIZE/);
  });

  it('game_assets finds the game’s own animations and sounds', () => {
    const chase = T.gameAssetsSearch({ query: 'gojo melee chase', kind: 'animation' });
    assert.deepEqual(chase.animations[0].anim_use, [1, 19]);
    assert.ok(/^\d+$/.test(chase.animations[0].id));
    assert.ok(T.gameAssetsSearch({ query: 'black flash', kind: 'sound' }).sounds.length > 0);
    assert.equal(T.gameAssetsSearch({ anim_use: [13, 4] }).animation, 'Yuta.Sheath');
  });
});
