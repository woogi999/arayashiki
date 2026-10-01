// Locks the simulator's output. Every skill in the fixture characters is run
// under several settings and its whole result (events, log, motion, hits,
// tags) is hashed; the hashes were taken from the original simulator. Any
// change to what the simulator computes, including an "optimisation", fails
// here. After a deliberate rule change, regenerate with:
//
//   UPDATE_GOLDEN=1 npm test
import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { decodeMoveset } from '../core/format.js';
import { simulate } from '../core/sim.js';
import { CHARACTER_1, CHARACTER_2, KATANA, GON } from './fixtures/jjs-characters.js';

const GOLDEN = new URL('./fixtures/sim-golden.json', import.meta.url);
const SETTINGS = {
  auto: {},
  always: { hits: 'always' },
  never: { hits: 'never' },
  air: { hits: 'always', conditions: { AIR: true, BAR: 100 } },
  awakened: { conditions: { ULT: true, HOLD: true, BAR: 100 }, wall: 12, seed: 3 },
};

// Floats to 9 digits, so the hash doesn't hang on the last bit of a double.
const stable = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(9)) : v));

it('the simulator gives exactly the results it always has', async () => {
  const hashes = {};
  for (const [name, code] of Object.entries({ CHARACTER_1, CHARACTER_2, KATANA, GON })) {
    const skills = await decodeMoveset(code);
    skills.forEach((skill, i) => {
      if (!skill.DATA || '__unreadable' in skill.DATA) return;
      for (const [setting, options] of Object.entries(SETTINGS)) {
        const run = simulate(skill, options);
        hashes[`${name}/${i}:${skill.K_NAME}:${skill.NAME}/${setting}`] = crypto
          .createHash('sha256')
          .update(stable(run))
          .digest('hex')
          .slice(0, 16);
      }
    });
  }
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) {
    fs.writeFileSync(GOLDEN, `${JSON.stringify(hashes, null, 1)}\n`);
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const changed = Object.keys(golden).filter((k) => golden[k] !== hashes[k]);
  assert.deepEqual(changed, [], `simulations that changed: ${changed.join(', ')}`);
  assert.equal(Object.keys(hashes).length, Object.keys(golden).length);
});
