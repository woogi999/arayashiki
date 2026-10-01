// Roblox's building blocks for the effects, in three.js terms: CFrames,
// TweenService's easing, NumberSequence / ColorSequence, and a seeded random
// so a scrubbed effect looks the same every time.
//
// Frames: the 3D view's world is Roblox's, turned so a character facing +z
// here faces -z (its LookVector) in its own frame. A body part's Roblox CFrame
// is its matrix here times a half turn about y (`robloxFrame`), so offsets
// and rotations written for Roblox (`CFrame.new(-x, y, -z)`,
// `CFrame.fromOrientation`) apply to it unchanged.

import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

export const RAD = Math.PI / 180;
const HALF_TURN = new Matrix4().makeRotationY(Math.PI);

/** A body part's matrix here → its Roblox CFrame. */
export const robloxFrame = (m) => m.clone().multiply(HALF_TURN);

/** CFrame.new(x, y, z) */
export const cfPos = (x, y, z) => new Matrix4().makeTranslation(x, y, z);

/** CFrame.fromOrientation(rx, ry, rz), degrees: y, then x, then z. */
export const cfOrient = (rx, ry, rz) => new Matrix4().makeRotationFromEuler(new Euler(rx * RAD, ry * RAD, rz * RAD, 'YXZ'));

/** CFrame.Angles(rx, ry, rz), radians: x, then y, then z. */
export const cfAngles = (rx, ry, rz) => new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz, 'XYZ'));

/** CFrame from GetComponents(): x y z R00 R01 R02 R10 R11 R12 R20 R21 R22. */
export function cfComponents(c) {
  if (!c || c.length < 12) return new Matrix4();
  const [x, y, z, a, b, cc, d, e, f, g, h, i] = c;
  return new Matrix4().set(a, b, cc, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1);
}

export const mul = (...ms) => ms.reduce((acc, m) => acc.multiply(m), new Matrix4());

/** CFrame:Lerp: position straight, rotation by slerp. */
export function cfLerp(a, b, k) {
  const pa = new Vector3();
  const pb = new Vector3();
  const qa = new Quaternion();
  const qb = new Quaternion();
  const s = new Vector3();
  a.decompose(pa, qa, s);
  b.decompose(pb, qb, s);
  return new Matrix4().compose(pa.lerp(pb, k), qa.slerp(qb, k), new Vector3(1, 1, 1));
}

/** Only the rotation of a CFrame (cf - cf.Position). */
export function rotationOf(m) {
  const r = m.clone();
  r.setPosition(0, 0, 0);
  return r;
}

// ─── TweenService ───────────────────────────────────────────────────────

const STYLES = {
  Linear: (x) => x,
  Quad: (x) => x * x,
  Cubic: (x) => x * x * x,
  Quart: (x) => x ** 4,
  Quint: (x) => x ** 5,
  Exponential: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
  Sine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  Back: (x) => 2.70158 * x * x * x - 1.70158 * x * x,
  Circular: (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)),
  Bounce: (x) => 1 - bounceOut(1 - x),
  Elastic: (x) => (x === 0 || x === 1 ? x : -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * ((2 * Math.PI) / 3))),
};
function bounceOut(x) {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

/** TweenService:GetValue(alpha, style, direction). */
export function ease(style, direction, x) {
  const f = STYLES[style] ?? STYLES.Linear;
  x = Math.max(0, Math.min(1, x));
  if (direction === 'Out') return 1 - f(1 - x);
  if (direction === 'InOut') return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2;
  return f(x);
}

/** How far a tween of `time` seconds has got at `age`: 0 → 1, eased. */
export function tweenAt(age, time, style = 'Linear', direction = 'In') {
  if (!(time > 0)) return age >= 0 ? 1 : 0;
  return ease(style, direction, age / time);
}

// TweenInfo.new(time) with nothing else: Quad, Out.
export const TWEEN_DEFAULT = ['Quad', 'Out'];

// ─── Sequences ──────────────────────────────────────────────────────────

/** A NumberSequence ([[time, value, envelope]…]) at x, with an envelope pick in -1…1. */
export function numberSeq(seq, x, pick = 0) {
  if (!seq?.length) return 0;
  if (x <= seq[0][0]) return seq[0][1] + pick * (seq[0][2] ?? 0);
  for (let i = 1; i < seq.length; i++) {
    const [t1, v1, e1 = 0] = seq[i];
    if (x <= t1) {
      const [t0, v0, e0 = 0] = seq[i - 1];
      const k = t1 > t0 ? (x - t0) / (t1 - t0) : 1;
      return v0 + (v1 - v0) * k + pick * (e0 + (e1 - e0) * k);
    }
  }
  const last = seq[seq.length - 1];
  return last[1] + pick * (last[2] ?? 0);
}

/** A ColorSequence ([[time, [r, g, b]]…], 0–255) at x, as 0–1 floats. */
export function colorSeq(seq, x) {
  if (!seq?.length) return [1, 1, 1];
  const at = (c) => c.map((v) => v / 255);
  if (x <= seq[0][0]) return at(seq[0][1]);
  for (let i = 1; i < seq.length; i++) {
    const [t1, c1] = seq[i];
    if (x <= t1) {
      const [t0, c0] = seq[i - 1];
      const k = t1 > t0 ? (x - t0) / (t1 - t0) : 1;
      return c0.map((v, j) => (v + (c1[j] - v) * k) / 255);
    }
  }
  return at(seq[seq.length - 1][1]);
}

/** NumberSequence.new(a, b) */
export const seq2 = (a, b) => [
  [0, a, 0],
  [1, b, 0],
];
/** ColorSequence.new(a, b) */
export const cseq2 = (a, b) => [
  [0, a],
  [1, b],
];

/**
 * BuilderFX's sizeSequence: each keypoint of a template's size sequence
 * times SIZE, easing to SIZE × ALT SIZE along the particle's life.
 */
export function sizeSequence(keypoints, size, altSize = 1) {
  const from = size;
  const to = size * altSize;
  return (keypoints ?? []).map(([t, v, e = 0]) => {
    const s = from + (to - from) * Math.max(0, Math.min(1, t));
    return [t, v * s, e * s];
  });
}

// ─── Random ─────────────────────────────────────────────────────────────

/** A seeded generator: the same seed, the same effect. */
export function seeded(seed) {
  let s = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35) | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Node fields ────────────────────────────────────────────────────────

const splitNums = (text, n, d = 0) => {
  const parts = String(text ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  return Array.from({ length: n }, (_, i) => (Number.isFinite(parts[i]) ? parts[i] : d));
};
export const v3 = (text, d = [0, 0, 0]) => (text == null || text === '' ? [...d] : splitNums(text, 3));
export const rgb = (text) => splitNums(text ?? '255, 255, 255', 3, 255).map((c) => Math.max(0, Math.min(255, c)));
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const isZero = (v) => v.every((c) => c === 0);
