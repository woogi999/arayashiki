// The motion animator (src/animator.js): the chains it writes land exactly
// on the keys under BuilderFX's own math, and splitting WAITs to fit them
// changes nothing else in the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, Quaternion } from 'three';
import {
  chainNodes,
  insertAt,
  keyMatrix,
  lineTimes,
  normalize,
  poseAt,
  removeChain,
  samples,
  writeChain,
} from '../src/animator.js';
import { cfOrient, cfPos } from '../src/fx/roblox.js';

const v3 = (s) => String(s).split(',').map(Number);
const close = (a, b, eps = 2e-3) => {
  const pa = new Vector3();
  const pb = new Vector3();
  const qa = new Quaternion();
  const qb = new Quaternion();
  a.decompose(pa, qa, new Vector3());
  b.decompose(pb, qb, new Vector3());
  assert.ok(pa.distanceTo(pb) < eps, `position ${pa.toArray()} vs ${pb.toArray()}`);
  assert.ok(Math.abs(Math.abs(qa.dot(qb)) - 1) < eps, `rotation ${qa.toArray()} vs ${qb.toArray()}`);
};

const keys = [
  { t: 0, pos: [0, 3, 2], rot: [0, 0, 0], size: 1, opacity: 0 },
  { t: 0.5, pos: [4, 5, -1], rot: [20, 90, 0], size: 2, opacity: 0.2 },
  { t: 1.2, pos: [-3, 1, 6], rot: [-10, 200, 30], size: 1.5, opacity: 1 },
];
const base = {
  tag: 'anim1',
  part: 'HumanoidRootPart',
  template: { K_NAME: 'VISUAL' },
  keys,
  smooth: false,
  rate: 20,
  easing: 'Quad',
  direction: 'Out',
  hold: 0,
  shake: null,
};

test('a part effect lands on every key (start · pos · alt · altRot)', () => {
  // The body part moves between keys: the chain must still meet them.
  const frameAt = (t) => new Matrix4().makeTranslation(t * 10, 0, t * 3).multiply(new Matrix4().makeRotationY(t));
  const nodes = chainNodes({ ...base, effect: 'Mesh' }, frameAt);
  assert.equal(nodes.length, 2);
  nodes.forEach(({ at, node }, i) => {
    const P = v3(node.POSITION);
    const A = v3(node['ALT POSITION']);
    const start = frameAt(at)
      .multiply(cfPos(-P[0], P[1], -P[2]))
      .multiply(cfOrient(...v3(node.ROTATION)));
    const end = start
      .clone()
      .multiply(cfPos(-P[0], P[1], -P[2]))
      .multiply(cfPos(-A[0], A[1], -A[2]))
      .multiply(cfOrient(...v3(node['ALT ROTATION'])));
    close(start, frameAt(keys[i].t).multiply(keyMatrix(keys[i])));
    close(end, frameAt(keys[i + 1].t).multiply(keyMatrix(keys[i + 1])));
    assert.ok(Math.abs(node.SIZE * node['ALT SIZE'] - keys[i + 1].size) < 1e-3);
    assert.equal(node['ALT OPACITY'], keys[i + 1].opacity);
  });
});

test('a camera lands on every key (pos · alt · altRot, carried by the part)', () => {
  const nodes = chainNodes({ ...base, effect: 'Camera' });
  nodes.forEach(({ node }, i) => {
    const P = v3(node.POSITION);
    const A = v3(node['ALT POSITION']);
    close(cfPos(-P[0], P[1], -P[2]).multiply(cfOrient(...v3(node.ROTATION))), keyMatrix(keys[i]));
    close(
      cfPos(-P[0], P[1], -P[2])
        .multiply(cfPos(-A[0], A[1], -A[2]))
        .multiply(cfOrient(...v3(node['ALT ROTATION']))),
      keyMatrix(keys[i + 1]),
    );
  });
});

test('a smoothed, shaken path writes more, shorter pieces that still end on the last key', () => {
  const nodes = chainNodes({
    ...base,
    effect: 'Camera',
    smooth: true,
    shake: { amount: 0.3, turn: 1, freq: 12, from: 0.2, to: 0.9, decay: true },
  });
  assert.ok(nodes.length > 20);
  const last = nodes.at(-1).node;
  const P = v3(last.POSITION);
  const A = v3(last['ALT POSITION']);
  close(
    cfPos(-P[0], P[1], -P[2])
      .multiply(cfPos(-A[0], A[1], -A[2]))
      .multiply(cfOrient(...v3(last['ALT ROTATION']))),
    keyMatrix(keys.at(-1)),
  );
  assert.ok(nodes.every(({ node }) => node.TIME > 0));
});

test('a piece that does not move still unpins (never an ALT POSITION of zero)', () => {
  const still = [keys[0], { ...keys[0], t: 1 }];
  const [{ node }] = chainNodes({ ...base, effect: 'Camera', keys: still });
  assert.ok(v3(node['ALT POSITION']).some((c) => c !== 0));
});

test('WAITs are split to fit, and joined again when the chain goes', () => {
  const line = [{ K_NAME: 'ANIM' }, { K_NAME: 'WAIT', TIME: 1 }, { K_NAME: 'HITBOX' }, { K_NAME: 'WAIT', TIME: 0.5 }];
  const a = { ...base, effect: 'Mesh' };
  const nodes = chainNodes(a);
  const { line: written } = writeChain(line, a, nodes, { index: 1, time: 0 });
  const times = lineTimes(written);
  const pieces = written.map((n, i) => [n, times[i]]).filter(([n]) => n['VISUAL TAG'] === 'anim1');
  assert.deepEqual(
    pieces.map(([, t]) => t),
    [0, 0.5],
  );
  // The HITBOX still runs at 1 s.
  assert.equal(times[written.findIndex((n) => n.K_NAME === 'HITBOX')], 1);
  const back = removeChain(written, a).line;
  assert.deepEqual(back, line);
});

test('inserting past the end waits for it', () => {
  const out = insertAt([{ K_NAME: 'WAIT', TIME: 0.2 }], 0.5, { K_NAME: 'X' });
  assert.deepEqual(out, [{ K_NAME: 'WAIT', TIME: 0.2 }, { K_NAME: 'WAIT', TIME: 0.3 }, { K_NAME: 'X' }]);
});

test('each stretch eases as its key says', () => {
  const eased = keys.map((k, i) => ({ ...k, ease: i === 0 ? 'Quad Out' : 'Back InOut' }));
  const nodes = chainNodes({ ...base, keys: eased, effect: 'Mesh' });
  assert.deepEqual(
    nodes.map(({ node }) => [node['EASING STYLE'], node['EASING DIRECTION']]),
    [
      ['Quad', 'Out'],
      ['Back', 'InOut'],
    ],
  );
});

test('a jump cut holds the key before, then starts the next piece at the cut key', () => {
  const cut = keys.map((k, i) => (i === 2 ? { ...k, cut: true } : k));
  const a = { ...base, keys: cut, effect: 'Camera' };
  // Between the second key and the cut, it holds the second key.
  assert.deepEqual(poseAt(a, 0.9).pos, keys[1].pos);
  const nodes = chainNodes(a);
  // Key 1 → key 2, then key 2 held until the cut, then the cut key held to the end.
  assert.deepEqual(
    nodes.map(({ at }) => at),
    [0, 0.5],
  );
  const held = nodes[1].node;
  assert.equal(held.POSITION, keys[1].pos.join(', '));
  assert.ok(v3(held['ALT POSITION']).every((c) => Math.abs(c) <= 0.001));
  // With a hold after it, the last piece starts exactly at the cut key.
  const withHold = chainNodes({ ...a, hold: 0.5 });
  assert.equal(withHold.at(-1).at, 1.2);
  assert.equal(withHold.at(-1).node.POSITION, keys[2].pos.join(', '));
});

test('shake is keyed: it eases between keys and only shakes where a key asks', () => {
  const k = keys.map((x, i) => ({ ...x, shake: i === 1 ? 0.4 : 0, turn: 0 }));
  const a = { ...base, keys: k, effect: 'Camera', shakeFreq: 10 };
  assert.ok(Math.abs(poseAt(a, 0.25).shake - 0.2) < 1e-9);
  const pts = samples(a);
  assert.ok(pts.length > keys.length + 10);
  // The first and last keys don't shake, so they're exactly where they were set.
  assert.deepEqual(pts[0].pos, keys[0].pos);
  assert.deepEqual(pts.at(-1).pos, keys.at(-1).pos);
});

test('an animation kept with the old single shake gets it on its keys', () => {
  const old = { ...base, shake: { amount: 0.3, turn: 1, freq: 12, from: 0, to: 1.2, decay: true } };
  const a = normalize(old);
  assert.equal(a.shake, undefined);
  assert.equal(a.shakeFreq, 12);
  assert.deepEqual(
    a.keys.map((x) => x.shake),
    [0.3, 0.175, 0],
  );
});
