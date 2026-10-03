// The moveset linter (agent/tools-core.js lint): each rule on a skill made
// to break it, and real characters stay quiet where they're fine.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../agent/tools.js';
import { CHARACTER_1, KATANA } from './fixtures/jjs-characters.js';

const skill = (Line, Branch = {}, extra = {}) => ({ K_NAME: 'SKILL', NAME: extra.NAME ?? 'Test', KEY: extra.KEY ?? 1, COOLDOWN: extra.COOLDOWN ?? 10, DATA: { Req: [], Line, Prop: extra.Prop ?? {}, Branch } });
const rules = async (skills, opts = {}) => (await lint({ skills, simulate: false, ...opts })).problems.map((p) => p.rule);

describe('lint', () => {
  it('nodes after a BRANCH that always jumps never run; one with conditions carries on', async () => {
    const always = skill([{ K_NAME: 'BRANCH', BRANCH: 'Go' }, { K_NAME: 'WAIT', TIME: 1 }], { Go: { Line: [{ K_NAME: 'WAIT', TIME: 1 }], Req: [] } });
    assert.ok((await rules([always])).includes('unreachable'));
    const maybe = skill([{ K_NAME: 'BRANCH', BRANCH: 'Air' }, { K_NAME: 'WAIT', TIME: 1 }], { Air: { Line: [{ K_NAME: 'WAIT', TIME: 1 }], Req: [{ K_NAME: 'AIR' }] } });
    assert.ok(!(await rules([maybe])).includes('unreachable'), 'a branch with conditions may not be taken');
    const comment = skill([{ K_NAME: 'BRANCH', BRANCH: '>a comment' }, { K_NAME: 'WAIT', TIME: 1 }]);
    assert.ok(!(await rules([comment])).includes('unreachable'), 'a missing branch is a comment');
  });

  it('a tag checked but never set, and a permanent effect nothing can cancel', async () => {
    const r = await rules([skill([{ K_NAME: 'TAG', TAG: 'Ghost', VALUE: 'True', CHECK: true, BRANCH: 'X' }, { K_NAME: 'VISUAL', EFFECT: 'Mesh', TIME: 1e38 }], { X: { Line: [], Req: [] } })]);
    assert.ok(r.includes('tag-never-set'));
    assert.ok(r.includes('forever-untagged'));
  });

  it('a Cancel whose VISUAL TAG nothing sets', async () => {
    const r = await rules([skill([{ K_NAME: 'VISUAL', EFFECT: 'Cancel', 'VISUAL TAG': 'Nope', TIME: 1e38 }])]);
    assert.ok(r.includes('cancel-nothing'));
  });

  it('a GRAB before anyone was hit', async () => {
    assert.ok((await rules([skill([{ K_NAME: 'GRAB', TIME: 1 }])])).includes('grab-before-hit'));
  });

  it('two skills pressed on one key clash, but not base and awakened ones', async () => {
    const a = skill([{ K_NAME: 'WAIT', TIME: 1 }], {}, { NAME: 'A', KEY: 2 });
    const b = skill([{ K_NAME: 'WAIT', TIME: 1 }], {}, { NAME: 'B', KEY: 2 });
    assert.ok((await rules([a, b])).includes('duplicate-key'));
    const base = skill([{ K_NAME: 'WAIT', TIME: 1 }], {}, { NAME: 'Base', KEY: 2, Prop: { AWK: true } });
    const awk = skill([{ K_NAME: 'WAIT', TIME: 1 }], {}, { NAME: 'Awk', KEY: 2, Prop: { AWK2: true } });
    assert.ok(!(await rules([base, awk])).includes('duplicate-key'));
  });

  it('tips: WAITs in a row, a node repeated, a camera without a direction lock, no cooldown', async () => {
    const v = { K_NAME: 'VISUAL', EFFECT: 'Sparks', TIME: 0.2 };
    const r = await rules([skill([{ K_NAME: 'WAIT', TIME: 0.1 }, { K_NAME: 'WAIT', TIME: 0.2 }, v, v, v, { K_NAME: 'VISUAL', EFFECT: 'Camera', TIME: 1 }], {}, { COOLDOWN: 0 })]);
    for (const rule of ['merge-waits', 'use-loop', 'camera-no-lock', 'no-cooldown']) assert.ok(r.includes(rule), rule);
  });

  it('a combo the dummy escapes from (simulated)', async () => {
    const hit = { K_NAME: 'HITBOX', DAMAGE: 3, STUN: 0.3, SIZE: '20, 20, 20' };
    const out = await lint({ skills: [skill([hit, { K_NAME: 'WAIT', TIME: 1 }, hit, { K_NAME: 'WAIT', TIME: 0.5 }])] });
    const drop = out.problems.find((p) => p.rule === 'combo-drops');
    assert.ok(drop, 'the 0.7 s gap after a 0.3 s stun drops the combo');
    assert.deepEqual(drop.at, { branch: '', index: 0 });
  });

  it('every problem says where it is and worst comes first; ignore drops a rule', async () => {
    const out = await lint({ code: CHARACTER_1, simulate: false });
    const order = { error: 0, warning: 1, info: 2, tip: 3 };
    for (let i = 1; i < out.problems.length; i++) assert.ok(order[out.problems[i - 1].level] <= order[out.problems[i].level]);
    const fewer = await lint({ code: CHARACTER_1, simulate: false, ignore: ['tag-never-read'] });
    assert.ok(fewer.problems.every((p) => p.rule !== 'tag-never-read'));
  });

  it('a well-made real moveset has no warnings of its own', async () => {
    const out = await lint({ code: KATANA, simulate: false });
    assert.equal(out.problems.filter((p) => p.level === 'warning' && p.rule !== 'validate').length, 0);
  });
});
