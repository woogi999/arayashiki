// JJS's own effect assets ship with the app (lib/fetch-fx-assets.mjs), so
// the game's effects show without signing in: every one the effects use is
// there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fxAssetIds } from '../lib/fetch-fx-assets.mjs';

test('every asset the built-in effects use is shipped (npm run fx-assets)', () => {
  const have = new Set(fs.readdirSync(new URL('../src/assets/jjs-fx-assets/', import.meta.url)).map((f) => f.split('.')[0]));
  const missing = fxAssetIds().filter((id) => !have.has(id));
  assert.deepEqual(missing, []);
});
