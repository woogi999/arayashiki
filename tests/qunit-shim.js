// Runs tests written for QUnit (brought over from Woogi Tools) under
// node:test: module() is a describe, test() an it, and `assert` has the
// QUnit methods they use.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const qunitAssert = {
  deepEqual: (a, b, message) => assert.deepStrictEqual(a, b, message),
  notDeepEqual: (a, b, message) => assert.notDeepStrictEqual(a, b, message),
  strictEqual: (a, b, message) => assert.strictEqual(a, b, message),
  true: (v, message) => assert.strictEqual(v, true, message),
  false: (v, message) => assert.strictEqual(v, false, message),
  throws: (fn, expected, message) => assert.throws(fn, expected, message),
};

export const module = (name, body) => describe(name, () => body({ beforeEach() {}, afterEach() {} }));
export const test = (name, body) => it(name, () => body(qunitAssert));
