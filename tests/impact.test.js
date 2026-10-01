// Impact frames (src/impact.js): the Overlay VISUALs they go into the skill as,
// and when a camera scene lets them line up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraAtTime, impactNodes, optionsOf, PRESETS } from '../src/impact.js';

test('each frame is an Overlay for its moment, one after another', () => {
  const nodes = impactNodes(['111', '222', '333'], { frameTime: 0.04, fadeOut: true });
  assert.deepEqual(
    nodes.map((n) => n.at),
    [0, 0.04, 0.08],
  );
  for (const { node } of nodes) {
    assert.equal(node.EFFECT, 'Overlay');
    assert.equal(node.SIZE, 1, 'the whole screen');
    assert.equal(node.TIME, 0.04);
  }
  assert.deepEqual(
    nodes.map((n) => n.node.TEXTURE),
    [111, 222, 333],
  );
  assert.deepEqual(
    nodes.map((n) => n.node['ALT OPACITY']),
    [0, 0, 1],
    'only the last fades',
  );
});

test('a camera scene is when a Camera block has the view', () => {
  const run = { events: [{ kind: 'VISUAL', who: 'user', t: 0.5, node: { EFFECT: 'Camera', TIME: 1 } }] };
  assert.equal(cameraAtTime(run, 0.4), false);
  assert.equal(cameraAtTime(run, 0.9), true);
  assert.equal(cameraAtTime(run, 1.5), false);
});

test('every preset is a full look', () => {
  for (const p of PRESETS) {
    const o = optionsOf(p.id);
    assert.ok(o.frames >= 1 && o.frameTime > 0, p.id);
    assert.match(o.background, /^#[0-9a-f]{6}$/i, p.id);
  }
});
