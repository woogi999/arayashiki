// The motion animator: keyframes for a VISUAL, the way Blender animates an
// object, turned into the nodes JJS needs.
//
// A VISUAL only goes from A to B (POSITION → ALT POSITION over TIME), so a
// mesh that moves along a path, or a camera that travels shot to shot, is
// built in JJS as a chain: one VISUAL per stretch, each starting where the
// last one ends, at the moment it ends. That's tedious and easy to get
// wrong by hand (ALT POSITION is a move in the effect's own turned axes,
// POSITION counts twice, the body part moves in between). Here you set keys
// instead (a time, a position, a turn, a size, a transparency, or for a
// camera, a view you flew to) and the chain is written for you, with WAITs
// split so each piece fires exactly on time without moving anything else in
// the line.
//
// A camera block also ignores the screen shakes while it runs, so a shake
// can be baked into the camera's own path: many short pieces jittering
// about it.
//
// Keys are in the body part's frame at their own moment, in the builder's
// terms: position (x left, y up, z forward, studs), rotation (degrees, as
// ROTATION takes them). The math is BuilderFX's (src/fx/builderfx.js):
//   a part effect starts at  part · pos · rot  and tweens to  start · pos · alt · altRot
//   a camera is              part(t) · lerp(pos · rot, pos · alt · altRot)
// where pos = CFrame.new(-x, y, -z).

import { signal } from '@preact/signals';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { linePath } from '../core/format.js';
import { withDefaults } from '../core/schema.js';
import { cfOrient, cfPos, tweenAt } from './fx/roblox.js';

const RAD = Math.PI / 180;
const EPS = 1e-6;
const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (text, d = [0, 0, 0]) => {
  const parts = String(text ?? '')
    .split(',')
    .map((x) => Number(x.trim()));
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : [...d];
};
const str = (v) => v.map((x) => String(r3(x) === 0 ? 0 : r3(x))).join(', ');

/** Effects the animator can drive: the part effects (placed in the world) and the camera. */
export const ANIMATABLE = ['Mesh', 'Block', 'Sphere', 'Cylinder', 'Wedge', 'Camera'];

export const EASINGS = ['Linear', 'Sine', 'Quad', 'Cubic', 'Quart', 'Quint', 'Exponential', 'Circular', 'Back', 'Bounce', 'Elastic'];

// The animation being edited: { tag, effect, part, keys, ...options } or null.
export const anim = signal(null);
// Which key is picked (for the viewport's gizmo).
export const animKey = signal(0);

// ─── Matrices ───────────────────────────────────────────────────────────

/** A key's local CFrame: CFrame.new(-x, y, -z) · fromOrientation(rotation). */
export const keyMatrix = (k) => cfPos(-k.pos[0], k.pos[1], -k.pos[2]).multiply(cfOrient(...k.rot));

/** A local CFrame back to { pos, rot } in the builder's terms. */
export function keyFrom(m) {
  const p = new Vector3();
  const q = new Quaternion();
  m.decompose(p, q, new Vector3());
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return { pos: [-p.x, p.y, -p.z].map(r3), rot: [e.x / RAD, e.y / RAD, e.z / RAD].map(r3) };
}

// ─── Reading a node into keys ───────────────────────────────────────────

/** A new animation from a VISUAL node: its start, and its end if it moves. */
export function fromNode(node, tag) {
  const n = withDefaults(node);
  const pos = vec(n.POSITION);
  const rot = vec(n.ROTATION);
  const alt = vec(n['ALT POSITION']);
  const altRot = n['ALT ROTATION'] != null && n['ALT ROTATION'] !== '' ? vec(n['ALT ROTATION']) : rot;
  const size = Number(n.SIZE ?? 1) || 1;
  const time = Math.max(0.05, Number(n.TIME ?? 1) || 1);
  const ease = `${n['EASING STYLE'] || 'Linear'} ${n['EASING DIRECTION'] || 'In'}`;
  const first = { t: 0, pos, rot, size, opacity: Number(n.OPACITY ?? 0) || 0, ease };
  const moving = alt.some((c) => Math.abs(c) > EPS);
  let second = { ...first, t: time, size: size * (Number(n['ALT SIZE'] ?? 1) || 1), opacity: Number(n['ALT OPACITY'] ?? 0) || 0 };
  if (moving) {
    const P = cfPos(-pos[0], pos[1], -pos[2]);
    const A = cfPos(-alt[0], alt[1], -alt[2]);
    // A camera ends at pos · alt · altRot; a part at pos · rot · pos · alt · altRot.
    const end = n.EFFECT === 'Camera' ? P.clone().multiply(A).multiply(cfOrient(...altRot)) : keyMatrix(first).multiply(P).multiply(A).multiply(cfOrient(...altRot));
    second = { ...second, ...keyFrom(end) };
  }
  return {
    tag,
    effect: n.EFFECT,
    part: n['BODY PART'] || 'HumanoidRootPart',
    template: { ...node },
    keys: [first, second],
    smooth: true,
    rate: 20, // pieces a second along a smoothed path
    easing: n['EASING STYLE'] || 'Linear',
    direction: n['EASING DIRECTION'] || 'InOut',
    hold: 0,
    shake: { amount: 0, turn: 0, freq: 14, from: 0, to: time, decay: true },
  };
}

// ─── Sampling the keys ──────────────────────────────────────────────────

function catmull(p0, p1, p2, p3, k) {
  const k2 = k * k;
  const k3 = k2 * k;
  return p1.map((_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * k + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * k2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * k3));
}

function quatOf(rot) {
  return new Quaternion().setFromEuler(new Euler(rot[0] * RAD, rot[1] * RAD, rot[2] * RAD, 'YXZ'));
}
function rotOf(q) {
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return [e.x / RAD, e.y / RAD, e.z / RAD];
}

/** How far through the stretch from key A to key B a moment is, by A's easing. */
function eased(A, B, t) {
  const [style, direction] = String(A.ease ?? 'Linear In').split(' ');
  return tweenAt(t - A.t, Math.max(EPS, B.t - A.t), style || 'Linear', direction || 'In');
}

/** The key pose at time t (smooth: through the keys; else straight between them), eased as each key says. */
export function poseAt(a, t) {
  const keys = a.keys;
  if (t <= keys[0].t) return { ...keys[0], t };
  if (t >= keys.at(-1).t) return { ...keys.at(-1), t };
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const A = keys[i];
  const B = keys[i + 1];
  const k = eased(A, B, t);
  const P0 = keys[Math.max(0, i - 1)];
  const P3 = keys[Math.min(keys.length - 1, i + 2)];
  const pos = a.smooth ? catmull(P0.pos, A.pos, B.pos, P3.pos, k) : A.pos.map((v, j) => v + (B.pos[j] - v) * k);
  const rot = rotOf(quatOf(A.rot).slerp(quatOf(B.rot), k));
  return { t, pos, rot, size: A.size + (B.size - A.size) * k, opacity: A.opacity + (B.opacity - A.opacity) * k, ease: Math.abs(t - A.t) < EPS ? A.ease : 'Linear In' };
}

// Smooth noise in -1…1, seeded per axis.
function noise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const v = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * u;
}

/**
 * The poses the chain goes through: the keys, plus points along a smoothed
 * path, plus the shake's jitter (in the camera's own right/up axes).
 */
export function samples(a) {
  const keys = a.keys;
  const end = keys.at(-1).t;
  const times = new Set(keys.map((k) => r3(k.t)));
  if (a.smooth && keys.length > 2)
    for (let i = 0; i < keys.length - 1; i++) {
      const n = Math.max(1, Math.round((keys[i + 1].t - keys[i].t) * a.rate));
      for (let j = 1; j < n; j++) times.add(r3(keys[i].t + ((keys[i + 1].t - keys[i].t) * j) / n));
    }
  const sh = a.shake ?? {};
  const shaking = (sh.amount > 0 || sh.turn > 0) && sh.to > sh.from;
  if (shaking) {
    const step = 1 / Math.max(2, sh.freq * 2);
    for (let t = Math.max(0, sh.from); t <= Math.min(end, sh.to) + EPS; t += step) times.add(r3(t));
    times.add(r3(Math.min(end, sh.to)));
  }
  return [...times]
    .filter((t) => t >= 0 && t <= end + EPS)
    .sort((x, y) => x - y)
    .map((t) => {
      const p = poseAt(a, t);
      if (!shaking || t <= sh.from + EPS || t >= sh.to - EPS) return p;
      const life = (t - sh.from) / (sh.to - sh.from);
      const fade = sh.decay ? 1 - life : 1;
      const x = t * sh.freq;
      const q = quatOf(p.rot);
      const right = new Vector3(1, 0, 0).applyQuaternion(q);
      const up = new Vector3(0, 1, 0).applyQuaternion(q);
      const off = right.multiplyScalar(noise(x, 1) * sh.amount * fade).add(up.multiplyScalar(noise(x, 2) * sh.amount * fade));
      // Roblox x is the builder's -x (and z its -z).
      const pos = [p.pos[0] - off.x, p.pos[1] + off.y, p.pos[2] - off.z];
      const rot = [p.rot[0] + noise(x, 3) * sh.turn * fade, p.rot[1] + noise(x, 4) * sh.turn * fade, p.rot[2] + noise(x, 5) * sh.turn * fade * 0.5];
      return { ...p, pos, rot };
    });
}

// ─── Writing the chain ──────────────────────────────────────────────────

/**
 * The VISUAL nodes for an animation: one per stretch between samples (plus a
 * hold), each { at: seconds after the start, node }. `frameAt(t)` is the
 * body part's CFrame at t seconds after the start (the 3D view's); without
 * it the part is taken as standing still.
 */
export function chainNodes(a, frameAt = null) {
  const pts = samples(a);
  const out = [];
  const camera = a.effect === 'Camera';
  // Only key to key: each piece eases as its key says, in JJS itself.
  // Otherwise the pieces are short and Linear, and the easing is in where
  // they're sampled.
  const plain = pts.length === a.keys.length;
  const F = (t) => (frameAt ? frameAt(t) : new Matrix4());
  const legs = pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]);
  if (a.hold > 0) legs.push([pts.at(-1), { ...pts.at(-1), t: pts.at(-1).t + a.hold }]);
  for (const [from, to] of legs) {
    const time = Math.max(0.001, to.t - from.t);
    let alt;
    let altRot;
    if (camera) {
      // part(t) · lerp(pos·rot, pos·alt·altRot): alt is the move in place, altRot the end turn.
      alt = to.pos.map((v, i) => v - from.pos[i]);
      altRot = to.rot;
    } else {
      // start · pos · alt · altRot must land on the next key, where the part is then.
      const start = F(from.t).multiply(keyMatrix(from));
      const goal = F(to.t).multiply(keyMatrix(to));
      const D = start.clone().invert().multiply(goal);
      const d = new Vector3();
      const q = new Quaternion();
      D.decompose(d, q, new Vector3());
      // D = CFrame.new(p + a) · altRot, p in Roblox axes (-x, y, -z).
      const a3 = [d.x + from.pos[0], d.y - from.pos[1], d.z + from.pos[2]];
      alt = [-a3[0], a3[1], -a3[2]];
      altRot = rotOf(q);
    }
    // A move of exactly zero would weld it to the part (and freeze its turn).
    if (alt.every((c) => Math.abs(c) < 0.0005)) alt = [0, 0.001, 0]; // as the dash's wind streaks do
    const node = {
      ...a.template,
      K_NAME: 'VISUAL',
      EFFECT: a.effect,
      'BODY PART': a.part,
      'VISUAL TAG': a.tag,
      TIME: r3(time) || 0.001,
      POSITION: str(from.pos),
      ROTATION: str(from.rot),
      'ALT POSITION': str(alt),
      'ALT ROTATION': str(altRot),
      SIZE: r3(from.size),
      'ALT SIZE': from.size ? Math.round((to.size / from.size) * 10000) / 10000 : 1,
      OPACITY: r3(from.opacity),
      'ALT OPACITY': r3(to.opacity),
      'EASING STYLE': plain ? String(from.ease ?? 'Linear In').split(' ')[0] || 'Linear' : 'Linear',
      'EASING DIRECTION': plain ? String(from.ease ?? 'Linear In').split(' ')[1] || 'In' : 'In',
    };
    out.push({ at: from.t, node });
  }
  return out;
}

// ─── Into the line ──────────────────────────────────────────────────────

const isWait = (n) => n?.K_NAME === 'WAIT';
const waitTime = (n) => Math.max(0, Number(withDefaults(n).TIME) || 0);

/** When each node of a line runs, counting only WAITs (as JJS does). */
export function lineTimes(line) {
  let t = 0;
  return line.map((n) => {
    const at = t;
    if (isWait(n)) t += waitTime(n);
    return at;
  });
}

/** Whether a node belongs to the animation `tag` (a VISUAL of that effect with that tag). */
export const inChain = (n, a) => n?.K_NAME === 'VISUAL' && n['VISUAL TAG'] === a.tag && n.EFFECT === a.effect;

/**
 * Takes an animation's nodes out of a line, joining the WAITs that were
 * split around them. Returns { line, at } (where the first one was, and
 * when it ran), or null if there are none.
 */
export function removeChain(line, a) {
  const times = lineTimes(line);
  const first = line.findIndex((n) => inChain(n, a));
  if (first < 0) return null;
  const out = [];
  let gap = false;
  for (const n of line) {
    if (inChain(n, a)) {
      gap = true;
      continue;
    }
    const prev = out.at(-1);
    if (gap && isWait(n) && isWait(prev)) out[out.length - 1] = { ...prev, TIME: r3(waitTime(prev) + waitTime(n)) };
    else out.push(n);
    gap = false;
  }
  return { line: out, index: first, time: times[first] };
}

/** Puts `node` into a line at `t` seconds, splitting the WAIT it falls in (or waiting at the end). */
export function insertAt(line, t, node, from = 0) {
  const out = [...line];
  let acc = 0;
  for (let i = 0; i < out.length; i++) {
    if (i >= from && acc >= t - EPS) {
      out.splice(i, 0, node);
      return out;
    }
    const n = out[i];
    if (!isWait(n)) continue;
    const w = waitTime(n);
    if (i >= from && acc + w > t + EPS && t > acc + EPS) {
      out.splice(i, 1, { ...n, TIME: r3(t - acc) }, node, { ...n, TIME: r3(acc + w - t) });
      return out;
    }
    acc += w;
  }
  if (t > acc + EPS) out.push({ K_NAME: 'WAIT', TIME: r3(t - acc) });
  out.push(node);
  return out;
}

/**
 * The line with the animation written in: the old chain out, the new one in,
 * starting where the old one started (or at `index`, `time` for a new one).
 * Returns { line, start, extended } (extended: seconds of WAIT added at the end).
 */
export function writeChain(line, a, nodes, { index, time } = {}) {
  const removed = removeChain(line, a);
  let base = removed?.line ?? [...line];
  const start = removed?.time ?? time ?? 0;
  const at = removed?.index ?? index ?? base.length;
  const endBefore = lineTimes(base).at(-1) ?? 0;
  const lastWait = base.length && isWait(base.at(-1)) ? waitTime(base.at(-1)) : 0;
  // The first piece goes where the old one was; the rest by their time.
  base.splice(Math.min(at, base.length), 0, nodes[0].node);
  for (const { at: t, node } of nodes.slice(1)) base = insertAt(base, start + t, node, at + 1);
  const endAfter = (lineTimes(base).at(-1) ?? 0) + (base.length && isWait(base.at(-1)) ? waitTime(base.at(-1)) : 0);
  return { line: base, start, extended: Math.max(0, r3(endAfter - endBefore - lastWait)) };
}

/** A tag for a new animation that the line doesn't use yet. */
export function freshTag(program, branch) {
  const used = new Set();
  const walk = (list) => list?.forEach((n) => n?.['VISUAL TAG'] && used.add(n['VISUAL TAG']));
  walk(program?.Line);
  for (const b of Object.values(program?.Branch && !Array.isArray(program.Branch) ? program.Branch : {})) walk(b?.Line);
  void branch;
  let i = 1;
  while (used.has(`anim${i}`)) i++;
  return `anim${i}`;
}

export { linePath };
