// The motion animator (src/animator.js): the chains it writes land exactly
// on the keys under BuilderFX's own math, and splitting WAITs to fit them
// changes nothing else in the line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, Quaternion } from 'three';
import {
  animationNodes,
  bezierEase,
  cameraLegs,
  continuation,
  chainNodes,
  FPS,
  insertAt,
  keyMatrix,
  lineTimes,
  normalize,
  poseAt,
  removeChain,
  samples,
  separateCameras,
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

// ─── Cameras as JJS runs them ───────────────────────────────────────────
// BuilderFX: the newest Camera block moves the view, and ANY block whose
// TIME runs out hands the view back to the player. So a camera chain must be
// back to back, in whole frames, with no overlaps and no gaps.

const camLine = [{ K_NAME: 'ANIM' }, { K_NAME: 'WAIT', TIME: 0.5 }, { K_NAME: 'HITBOX' }, { K_NAME: 'WAIT', TIME: 1 }];
const windows = (line) => {
  const times = lineTimes(line);
  return line.map((n, i) => [n, times[i]]).filter(([n]) => n.K_NAME === 'VISUAL' && n.EFFECT === 'Camera');
};
const onFrame = (t) => Math.abs(t * FPS - Math.round(t * FPS)) < 0.06;

for (const [name, extra] of [
  ['straight', { smooth: false }],
  ['smoothed', { smooth: true }],
  [
    'smoothed and shaken',
    {
      smooth: true,
      shakeFreq: 14,
      keys: keys.map((k, i) => ({ ...k, shake: i === 1 ? 0.3 : 0, turn: i === 1 ? 1 : 0 })),
    },
  ],
]) {
  test(`a ${name} camera is back to back in whole frames: no overlaps, no gaps, no piece under three frames`, () => {
    const a = { ...base, effect: 'Camera', hold: 0.3, ...extra };
    const { line } = writeChain(camLine, a, animationNodes(a), { index: 1, time: 0 });
    const cams = windows(line);
    cams.forEach(([n, t], i) => {
      assert.ok(onFrame(t), `starts on a frame (${t})`);
      assert.ok(n.TIME >= 3 / FPS - 0.001, `at least three frames (${n.TIME})`);
      const next = cams[i + 1];
      if (next)
        assert.ok(
          Math.abs(t + n.TIME - next[1]) <= 0.0011,
          `ends where the next begins (${t} + ${n.TIME} vs ${next[1]})`,
        );
    });
    // The HITBOX still runs at 0.5 s.
    assert.ok(Math.abs(lineTimes(line)[line.findIndex((n) => n.K_NAME === 'HITBOX')] - 0.5) < 1e-9);
  });
}

test('a straight stretch is one Camera block with its key’s own easing', () => {
  const eased = keys.map((k, i) => ({ ...k, ease: i === 0 ? 'Quad Out' : 'Back InOut' }));
  const nodes = chainNodes({ ...base, keys: eased, effect: 'Camera', smooth: true });
  assert.equal(cameraLegs({ ...base, keys: eased, effect: 'Camera' }).length, 2);
  assert.deepEqual(
    chainNodes({ ...base, keys: eased, effect: 'Camera' }).map(
      ({ node }) => `${node['EASING STYLE']} ${node['EASING DIRECTION']}`,
    ),
    ['Quad Out', 'Back InOut'],
  );
  // A curve through three keys needs a few more blocks, far fewer than a piece every 0.05 s.
  assert.ok(nodes.length >= 2 && nodes.length <= 10, `${nodes.length} blocks`);
});

test('a camera puts a DirectionLock on you for its whole length, and it comes out with the chain', () => {
  const a = { ...base, effect: 'Camera', hold: 0.3 };
  const nodes = animationNodes(a);
  const lock = nodes[0].node;
  assert.equal(lock.K_NAME, 'STATE');
  assert.equal(lock.STATE, 'DirectionLock');
  assert.equal(lock['STATE TAG'], 'anim1');
  assert.equal(lock.TIME, 1.5); // 1.2 s of keys and 0.3 s of hold
  const { line } = writeChain(camLine, a, nodes, { index: 1, time: 0 });
  assert.equal(line.filter((n) => n.K_NAME === 'STATE').length, 1);
  assert.deepEqual(removeChain(line, a).line, camLine);
  // Off, there's no state.
  assert.ok(animationNodes({ ...a, lock: false }).every(({ node }) => node.K_NAME === 'VISUAL'));
});

test('weaving puts each piece between the nodes already there, at its moment', () => {
  const a = { ...base, effect: 'Mesh' };
  const { line, start } = writeChain(camLine, a, chainNodes(a), { time: 0.3, weave: true });
  assert.equal(start, 0.3);
  const times = lineTimes(line);
  const pieces = line.map((n, i) => [n, times[i]]).filter(([n]) => n['VISUAL TAG'] === 'anim1');
  assert.deepEqual(
    pieces.map(([, t]) => t),
    [0.3, 0.8],
  );
  // The first piece is before the HITBOX (0.5 s), the second after it.
  const hit = line.findIndex((n) => n.K_NAME === 'HITBOX');
  assert.ok(line.indexOf(pieces[0][0]) < hit && line.indexOf(pieces[1][0]) > hit);
  assert.equal(times[hit], 0.5);
  assert.deepEqual(removeChain(line, a).line, camLine);
  // At a moment that has nodes already, a woven piece goes after them.
  const atZero = writeChain(camLine, a, chainNodes(a), { time: 0, weave: true }).line;
  assert.equal(atZero[0].K_NAME, 'ANIM');
  assert.equal(atZero[1]['VISUAL TAG'], 'anim1');
});

test('a Camera block still running when the next starts is cut to end there, at the pose it had reached', () => {
  const cam = (extra) => ({
    K_NAME: 'VISUAL',
    EFFECT: 'Camera',
    'EASING STYLE': 'Linear',
    'EASING DIRECTION': 'In',
    ...extra,
  });
  const line = [
    cam({ TIME: 2, POSITION: '0, 0, 0', ROTATION: '0, 0, 0', 'ALT POSITION': '0, 0, 10', 'ALT ROTATION': '0, 90, 0' }),
    { K_NAME: 'WAIT', TIME: 0.5 },
    cam({ TIME: 1, POSITION: '0, 5, 0', 'ALT POSITION': '0, 0, 0' }),
    cam({ TIME: 1, 'LAST HIT': 2 }), // on the one hit's screen: a different camera
  ];
  const { line: out, trimmed } = separateCameras(line);
  assert.equal(trimmed, 1);
  assert.equal(out[0].TIME, 0.5);
  assert.equal(out[0]['ALT POSITION'], '0, 0, 2.5');
  assert.deepEqual(
    v3(out[0]['ALT ROTATION']).map((v) => Math.round(v * 10) / 10),
    [0, 22.5, 0],
  );
  assert.deepEqual(out.slice(1), line.slice(1));
});

test('a VISUAL carries on from its ALT POSITION, with a WAIT 0.05 short of its TIME', () => {
  const block = {
    K_NAME: 'VISUAL',
    EFFECT: 'Block',
    TIME: 0.5,
    POSITION: '0, 0, 3',
    'ALT POSITION': '0, 0, 5',
    SIZE: 2,
    'ALT SIZE': 1.5,
    OPACITY: 0,
    'ALT OPACITY': 0.5,
  };
  const a = continuation(block);
  assert.equal(a.wait, 0.45);
  // It ends at start · pos · alt (POSITION counts twice): 3 + 3 + 5 = 11.
  assert.equal(a.node.POSITION, '0, 0, 11');
  assert.equal(a.node.SIZE, 3);
  assert.equal(a.node.OPACITY, 0.5);
  // And makes the same 8-stud move again: 11 + 11 + alt = 19.
  assert.equal(a.node['ALT POSITION'], '0, 0, -3');
  const b = continuation(a.node);
  assert.equal(b.node.POSITION, '0, 0, 19');
  // A camera block's WAIT is its whole TIME: overlapping, JJS hands the view back mid-shot.
  const cam = continuation({
    K_NAME: 'VISUAL',
    EFFECT: 'Camera',
    TIME: 1,
    POSITION: '0, 4, -10',
    'ALT POSITION': '2, 0, 0',
    ROTATION: '-15, 0, 0',
    'ALT ROTATION': '-15, 20, 0',
  });
  assert.equal(cam.wait, 1);
  assert.equal(cam.node.POSITION, '2, 4, -10');
  assert.equal(cam.node.ROTATION, '-15, 20, 0');
});

test('a custom easing curve becomes blocks of JJS easings that follow it', () => {
  assert.equal(bezierEase([0.42, 0, 0.58, 1], 0.5).toFixed(3), '0.500');
  assert.ok(bezierEase([0.9, 0, 0.1, 1], 0.25) < 0.1, 'slow to start');
  const a = {
    ...base,
    effect: 'Camera',
    smooth: false,
    hold: 0,
    keys: [
      // Fast, a pause in the middle, fast again: no one JJS easing does that.
      {
        t: 0,
        pos: [0, 4, -10],
        rot: [0, 0, 0],
        size: 1,
        opacity: 0,
        ease: 'Custom',
        curve: [0.1, 0.9, 0.9, 0.1],
        shake: 0,
        turn: 0,
      },
      { t: 1, pos: [10, 4, -10], rot: [0, 0, 0], size: 1, opacity: 0, ease: 'Linear In', shake: 0, turn: 0 },
    ],
  };
  const legs = cameraLegs(a);
  assert.ok(legs.length > 1, 'more than one block');
  for (const l of legs)
    assert.match(
      l.ease,
      /^(Linear|Sine|Quad|Cubic|Quart|Quint|Exponential|Circular|Back|Bounce|Elastic) (In|Out|InOut)$/,
    );
  for (let i = 1; i < legs.length; i++) assert.equal(legs[i].from.t, legs[i - 1].to.t, 'back to back');
  // A curve close to one of JJS's own is that easing, one block.
  const near = { ...a, keys: [{ ...a.keys[0], curve: [0.87, 0, 0.13, 1] }, a.keys[1]] };
  assert.equal(cameraLegs(near).length, 1);
});

test('pen handles bend the path through a key', () => {
  const keys = [
    {
      t: 0,
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      size: 1,
      opacity: 0,
      ease: 'Linear In',
      shake: 0,
      turn: 0,
      hout: [0, 6, 0],
    },
    {
      t: 1,
      pos: [10, 0, 0],
      rot: [0, 0, 0],
      size: 1,
      opacity: 0,
      ease: 'Linear In',
      shake: 0,
      turn: 0,
      hin: [0, 6, 0],
    },
  ];
  const a = { ...base, effect: 'Camera', smooth: false, hold: 0, keys };
  const mid = poseAt(a, 0.5);
  assert.ok(mid.pos[1] > 4, 'it arcs up between the keys');
  assert.ok(cameraLegs(a).length > 1, 'and the camera needs more than one block for it');
  const part = { ...a, effect: 'Block', smooth: false };
  assert.ok(samples(part).length > 2, 'a part samples along it too');
});
