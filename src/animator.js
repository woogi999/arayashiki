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
// is baked into the camera's own path: many short pieces jittering about it.
// Each key has its own shake (studs) and turn (degrees), eased from key to
// key like everything else, so a shake can build, hit and die away.
//
// A key can be a jump cut: the animation holds the key before it until the
// cut's moment, then is at the cut key at once, rather than moving there.
//
// Keys are in the body part's frame at their own moment, in the builder's
// terms: position (x left, y up, z forward, studs), rotation (degrees, as
// ROTATION takes them), size, opacity, shake, turn, cut. The math is BuilderFX's (src/fx/builderfx.js):
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

export const EASINGS = [
  'Linear',
  'Sine',
  'Quad',
  'Cubic',
  'Quart',
  'Quint',
  'Exponential',
  'Circular',
  'Back',
  'Bounce',
  'Elastic',
];

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
  const first = { t: 0, pos, rot, size, opacity: Number(n.OPACITY ?? 0) || 0, ease, shake: 0, turn: 0 };
  const moving = alt.some((c) => Math.abs(c) > EPS);
  let second = {
    ...first,
    t: time,
    size: size * (Number(n['ALT SIZE'] ?? 1) || 1),
    opacity: Number(n['ALT OPACITY'] ?? 0) || 0,
  };
  if (moving) {
    const P = cfPos(-pos[0], pos[1], -pos[2]);
    const A = cfPos(-alt[0], alt[1], -alt[2]);
    // A camera ends at pos · alt · altRot; a part at pos · rot · pos · alt · altRot.
    const end =
      n.EFFECT === 'Camera'
        ? P.clone()
            .multiply(A)
            .multiply(cfOrient(...altRot))
        : keyMatrix(first)
            .multiply(P)
            .multiply(A)
            .multiply(cfOrient(...altRot));
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
    shakeFreq: 14, // shakes a second
  };
}

/**
 * An animation in today's terms: animations kept from before shakes were
 * keyed carry one shake ({ amount, turn, freq, from, to, decay }); it
 * becomes each key's shake and turn (faded as it was).
 */
export function normalize(a) {
  if (!a) return a;
  const old = a.shake;
  if (old === undefined && a.shakeFreq != null) return a;
  const live = old && (old.amount > 0 || old.turn > 0) && old.to > old.from;
  const keys = a.keys.map((k) => {
    if (k.shake != null) return k;
    if (!live) return { ...k, shake: 0, turn: 0 };
    const inside = k.t >= old.from - EPS && k.t <= old.to + EPS;
    const fade = old.decay !== false ? Math.max(0, 1 - (k.t - old.from) / (old.to - old.from)) : 1;
    return { ...k, shake: inside ? r3((old.amount ?? 0) * fade) : 0, turn: inside ? r3((old.turn ?? 0) * fade) : 0 };
  });
  const { shake: _old, ...rest } = a;
  return { ...rest, keys, shakeFreq: a.shakeFreq ?? old?.freq ?? 14 };
}

// ─── Sampling the keys ──────────────────────────────────────────────────

function catmull(p0, p1, p2, p3, k) {
  const k2 = k * k;
  const k3 = k2 * k;
  return p1.map(
    (_, i) =>
      0.5 *
      (2 * p1[i] +
        (-p0[i] + p2[i]) * k +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * k2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * k3),
  );
}

function quatOf(rot) {
  return new Quaternion().setFromEuler(new Euler(rot[0] * RAD, rot[1] * RAD, rot[2] * RAD, 'YXZ'));
}
function rotOf(q) {
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return [e.x / RAD, e.y / RAD, e.z / RAD];
}

/**
 * A custom easing curve, drawn in the animator's graph: a cubic Bézier from
 * (0, 0) to (1, 1) through [x1, y1, x2, y2], as CSS's cubic-bezier. JJS has
 * no such easing, so a stretch eased this way is cut into pieces of its own
 * easings that follow it (cameraLegs, samples).
 */
export function bezierEase(curve, x) {
  const [x1, y1, x2, y2] = curve ?? [0.42, 0, 0.58, 1];
  const at = (p1, p2, t) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // x(t) only rises (x1, x2 in 0…1): halve the gap until it's found.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(Math.min(1, Math.max(0, x1)), Math.min(1, Math.max(0, x2)), mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}
export const isCustom = (k) => String(k?.ease ?? '').startsWith('Custom');

/** How far through the stretch from key A to key B a moment is, by A's easing. */
function eased(A, B, t) {
  if (isCustom(A)) return bezierEase(A.curve, (t - A.t) / Math.max(EPS, B.t - A.t));
  const [style, direction] = String(A.ease ?? 'Linear In').split(' ');
  return tweenAt(t - A.t, Math.max(EPS, B.t - A.t), style || 'Linear', direction || 'In');
}

// ─── The path's handles (the animator's pen tool) ───────────────────────
//
// A key can carry Bézier handles, as a pen tool's anchor does: `hout`
// leaving it toward the next key, `hin` arriving from the one before, each
// an offset from the key's position (studs, in the key's terms). A stretch
// with a handle at either end bends along the Bézier between them; one
// without is straight (or the smooth curve).

/** The smooth curve's tangent at key j, as Bézier handles: { hin, hout }. */
export function autoHandles(a, j) {
  const keys = a.keys;
  const K = keys[j];
  const prev = j > 0 && !K.cut ? keys[j - 1] : K;
  const next = keys[j + 1] && !keys[j + 1].cut ? keys[j + 1] : K;
  const m = K.pos.map((_, i) => (next.pos[i] - prev.pos[i]) / 2);
  // A third of the tangent each way (Catmull-Rom as Bézier), scaled to the stretch it reaches into.
  const span = (from, to) => Math.max(EPS, Math.abs(to.t - from.t));
  const around = span(prev, next) / 2 || 1;
  const outK = span(K, next) / around;
  const inK = span(prev, K) / around;
  return {
    hin: m.map((v) => r3((-v / 3) * (prev === K ? 0 : inK))),
    hout: m.map((v) => r3((v / 3) * (next === K ? 0 : outK))),
  };
}
const curved = (a, A, B) => A.hout != null || B.hin != null;

function bezier(p0, p1, p2, p3, k) {
  const u = 1 - k;
  return p0.map((_, i) => u * u * u * p0[i] + 3 * u * u * k * p1[i] + 3 * u * k * k * p2[i] + k * k * k * p3[i]);
}

/**
 * The key pose at time t (smooth: through the keys; else straight between
 * them), eased as each key says. Before a jump cut it holds the key before.
 * Shake and turn (how hard it shakes there) come along; the jitter itself
 * is shakenAt's.
 */
export function poseAt(a, t) {
  const keys = a.keys;
  if (t <= keys[0].t) return { ...keys[0], t };
  if (t >= keys.at(-1).t) return { ...keys.at(-1), t };
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const A = keys[i];
  const B = keys[i + 1];
  if (B.cut) return { ...A, t, ease: 'Linear In' };
  const k = eased(A, B, t);
  const u = (t - A.t) / Math.max(EPS, B.t - A.t);
  // A curve doesn't reach across a cut: it starts again at the cut key.
  const P0 = i > 0 && !A.cut ? keys[i - 1] : A;
  const P3 = keys[i + 2] && !keys[i + 2].cut ? keys[i + 2] : B;
  let pos;
  if (curved(a, A, B)) {
    // The pen tool's handles; a missing one follows the smooth curve (or none, straight).
    const out = A.hout ?? (a.smooth ? autoHandles(a, i).hout : [0, 0, 0]);
    const inn = B.hin ?? (a.smooth ? autoHandles(a, i + 1).hin : [0, 0, 0]);
    pos = bezier(
      A.pos,
      A.pos.map((v, j) => v + out[j]),
      B.pos.map((v, j) => v + inn[j]),
      B.pos,
      k,
    );
  } else pos = a.smooth ? catmull(P0.pos, A.pos, B.pos, P3.pos, k) : A.pos.map((v, j) => v + (B.pos[j] - v) * k);
  const rot = rotOf(quatOf(A.rot).slerp(quatOf(B.rot), k));
  return {
    t,
    pos,
    rot,
    size: A.size + (B.size - A.size) * k,
    opacity: A.opacity + (B.opacity - A.opacity) * k,
    shake: (A.shake ?? 0) + ((B.shake ?? 0) - (A.shake ?? 0)) * u,
    turn: (A.turn ?? 0) + ((B.turn ?? 0) - (A.turn ?? 0)) * u,
    ease: Math.abs(t - A.t) < EPS ? A.ease : 'Linear In',
  };
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

/** A pose moved by its shake: smooth noise in the camera's own right/up axes, and a wobble in its turn. */
function jitter(a, p) {
  const amount = p.shake ?? 0;
  const turn = p.turn ?? 0;
  if (!(amount > 0 || turn > 0)) return p;
  const x = p.t * (a.shakeFreq ?? 14);
  const q = quatOf(p.rot);
  const right = new Vector3(1, 0, 0).applyQuaternion(q);
  const up = new Vector3(0, 1, 0).applyQuaternion(q);
  const off = right.multiplyScalar(noise(x, 1) * amount).add(up.multiplyScalar(noise(x, 2) * amount));
  // Roblox x is the builder's -x (and z its -z).
  const pos = [p.pos[0] - off.x, p.pos[1] + off.y, p.pos[2] - off.z];
  const rot = [p.rot[0] + noise(x, 3) * turn, p.rot[1] + noise(x, 4) * turn, p.rot[2] + noise(x, 5) * turn * 0.5];
  return { ...p, pos, rot };
}

/** Where the animation is at t, shake and all (what the preview looks through). */
export const shakenAt = (a, t) => jitter(a, poseAt(normalize(a), t));

const shaky = (k) => (k.shake ?? 0) > 0 || (k.turn ?? 0) > 0;

/**
 * The poses the chain goes through: the keys, plus points along a smoothed
 * path, plus the shake's jitter. A jump cut has two at its moment: the held
 * pose arriving, then the cut key (`key` marks the poses that are keys).
 */
export function samples(anim) {
  const a = normalize(anim);
  const keys = a.keys;
  const freq = a.shakeFreq ?? 14;
  const out = [];
  keys.forEach((K, i) => {
    if (i > 0 && K.cut) out.push({ ...jitter(a, { ...keys[i - 1], t: K.t }), key: true });
    out.push({ ...jitter(a, { ...K }), key: true });
    const N = keys[i + 1];
    if (!N || N.t - K.t < EPS) return;
    const times = new Set();
    // A curve (smooth, or the pen's handles) or a custom easing: points along it, Linear between.
    if (!N.cut && ((a.smooth && keys.length > 2) || curved(a, K, N) || isCustom(K))) {
      const n = Math.max(1, Math.round((N.t - K.t) * a.rate));
      for (let j = 1; j < n; j++) times.add(r3(K.t + ((N.t - K.t) * j) / n));
    }
    if (shaky(K) || (shaky(N) && !N.cut)) {
      const step = 1 / Math.max(2, freq * 2);
      for (let t = K.t + step; t < N.t - 0.002; t += step) times.add(r3(t));
    }
    for (const t of [...times].filter((t) => t > K.t + EPS && t < N.t - EPS).sort((x, y) => x - y))
      out.push(jitter(a, poseAt(a, t)));
  });
  return out;
}

// ─── A camera's pieces ──────────────────────────────────────────────────
//
// BuilderFX runs each Camera block on RenderStepped: the newest one moves
// the view, and when ANY block's TIME runs out it sets the camera back to
// Custom (the player's), even while a newer block is still running. So a
// camera chain must hand over exactly: no two blocks' times overlapping and
// no gap between them, or the view snaps to the player for a frame (the
// jitter). JJS can't wait less than a frame either (60 a second), so a WAIT
// of 0.007 s lasts a whole frame and the chain drifts off its own TIMEs.
//
// So a camera is written in whole frames, never a piece under three, each
// ending on the frame the next begins. And each piece leans on JJS's own
// easing: a stretch between keys is one block with the key's easing when a
// straight move covers it (it always does, without a curve or a shake), and
// is only cut in pieces where a curve bends away from a straight line, each
// piece taking whichever of JJS's easings follows the curve best.

export const FPS = 60;
const MIN_PIECE = 3 / FPS;
const POS_TOL = 0.2; // studs a piece may stray from the curve
const ROT_TOL = 1.5; // degrees
const REL_TOL = 0.06; // or this share of the piece's own move, if more
const frames = (t) => r3(Math.round(t * FPS) / FPS);
const CANDIDATES = EASINGS.flatMap((s) =>
  s === 'Linear' ? [['Linear', 'In']] : ['In', 'Out', 'InOut'].map((d) => [s, d]),
);

/** A straight move from pose A to pose B, `k` of the way (as CFrame:Lerp: position straight, turn slerped). */
function lerpPose(A, B, k) {
  return {
    pos: A.pos.map((v, i) => v + (B.pos[i] - v) * k),
    rot: rotOf(quatOf(A.rot).slerp(quatOf(B.rot), k)),
  };
}

/** How far apart two poses are: [studs, degrees]. */
function poseError(P, Q) {
  const d = Math.hypot(P.pos[0] - Q.pos[0], P.pos[1] - Q.pos[1], P.pos[2] - Q.pos[2]);
  const dot = Math.min(1, Math.abs(quatOf(P.rot).dot(quatOf(Q.rot))));
  return [d, (2 * Math.acos(dot)) / RAD];
}

/**
 * The easing that best makes one straight piece from t0 to t1 follow
 * `pose(t)`: { ease, ok }. `prefer` (the key's own easing) wins whenever it
 * follows well enough.
 */
function fitPiece(pose, t0, t1, from, to, prefer = null) {
  const n = 8;
  const span = t1 - t0;
  const truth = Array.from({ length: n - 1 }, (_, j) => pose(t0 + (span * (j + 1)) / n));
  // A small miss doesn't show on a big, fast move: the tolerance grows with the piece's own move.
  const [moved, turned] = poseError(from, to);
  const posTol = Math.max(POS_TOL, moved * REL_TOL);
  const rotTol = Math.max(ROT_TOL, turned * REL_TOL);
  const judge = (style, direction) => {
    let pos = 0;
    let rot = 0;
    for (let j = 0; j < n - 1; j++) {
      const k = tweenAt((span * (j + 1)) / n, span, style, direction);
      const [dp, dr] = poseError(lerpPose(from, to, k), truth[j]);
      pos = Math.max(pos, dp);
      rot = Math.max(rot, dr);
    }
    return { ease: `${style} ${direction}`, score: pos / posTol + rot / rotTol, ok: pos <= posTol && rot <= rotTol };
  };
  if (prefer) {
    const [style, direction] = prefer.split(' ');
    const own = judge(style || 'Linear', direction || 'In');
    if (own.ok) return own;
  }
  let best = null;
  for (const [style, direction] of CANDIDATES) {
    const j = judge(style, direction);
    if (!best || j.score < best.score - 1e-9) best = j;
  }
  return best;
}

const legsCache = new WeakMap();

/**
 * A camera animation as the blocks JJS will run: [{ from, to, ease }], from
 * and to poses at whole frames (t in seconds from the start), back to back.
 */
export function cameraLegs(anim) {
  if (legsCache.has(anim)) return legsCache.get(anim);
  const a = normalize(anim);
  const keys = a.keys.map((k) => ({ ...k, t: frames(k.t) }));
  const at = { ...a, keys };
  const freq = a.shakeFreq ?? 14;
  const pose = (t) => jitter(at, poseAt(at, t));
  const legs = [];
  const leg = (from, to, ease) =>
    legs.push({
      from: { ...from, pos: from.pos.map(r3), rot: from.rot.map(r3) },
      to: { ...to, pos: to.pos.map(r3), rot: to.rot.map(r3) },
      ease,
    });
  for (let i = 0; i < keys.length - 1; i++) {
    const K = keys[i];
    const N = keys[i + 1];
    const span = N.t - K.t;
    if (span < 1 / FPS - EPS) continue;
    const start = jitter(at, { ...K });
    // A jump cut: hold the key before until the cut, then the next piece starts at the cut key.
    if (N.cut) {
      leg({ ...start, t: K.t }, { ...start, t: N.t }, 'Linear In');
      continue;
    }
    const most = Math.max(1, Math.floor(span / MIN_PIECE + EPS));
    const plan = (n) => {
      const ts = [...new Set(Array.from({ length: n + 1 }, (_, j) => frames(K.t + (span * j) / n)))];
      ts[0] = K.t;
      ts[ts.length - 1] = N.t;
      return ts.slice(0, -1).map((t0, j) => {
        const t1 = ts[j + 1];
        const from = j === 0 ? { ...start, t: t0 } : { ...pose(t0), t: t0 };
        const to = j === ts.length - 2 ? { ...jitter(at, { ...N }), t: t1 } : { ...pose(t1), t: t1 };
        // A whole stretch eases as its key says when that follows (exact, in JJS itself).
        return {
          from,
          to,
          fit: fitPiece(pose, t0, t1, from, to, ts.length === 2 && !isCustom(K) ? (K.ease ?? 'Linear In') : null),
        };
      });
    };
    let pieces;
    if (shaky(K) || shaky(N)) {
      // A shake is jitter at `freq` a second: a piece per half shake, never under three frames.
      const step = Math.max(MIN_PIECE, 1 / Math.max(2, freq * 2));
      pieces = plan(Math.min(most, Math.max(1, Math.round(span / step))));
    } else {
      // The fewest pieces that follow the curve: 1, 2, 3, 4, 6, 8, 12…
      for (let n = 1; ; n = n < 4 ? n + 1 : Math.ceil(n * 1.5)) {
        const m = Math.min(n, most);
        pieces = plan(m);
        if (m >= most || pieces.every((p) => p.fit.ok)) break;
      }
    }
    for (const p of pieces) leg(p.from, p.to, p.fit.ease);
  }
  const last = keys.at(-1);
  const hold = frames(a.hold ?? 0);
  if (hold > 0) {
    const end = jitter(at, { ...last });
    leg({ ...end, t: last.t }, { ...end, t: last.t + hold }, 'Linear In');
  }
  // One key, or keys all on one frame: one still block.
  if (!legs.length) {
    const only = jitter(at, { ...keys[0] });
    leg({ ...only, t: keys[0].t }, { ...only, t: keys[0].t + MIN_PIECE }, 'Linear In');
  }
  legsCache.set(anim, legs);
  return legs;
}

/** Where a camera animation's blocks have the view at t (what JJS shows): { pos, rot } or null outside it. */
export function cameraAt(anim, t) {
  const legs = cameraLegs(anim);
  if (!legs.length || t < legs[0].from.t - EPS || t > legs.at(-1).to.t + EPS) return null;
  const L = legs.find((l) => t <= l.to.t + EPS) ?? legs.at(-1);
  const [style, direction] = L.ease.split(' ');
  const span = Math.max(EPS, L.to.t - L.from.t);
  return lerpPose(L.from, L.to, tweenAt(Math.max(0, t - L.from.t), span, style, direction));
}

/** How long a camera animation runs, its hold included (whole frames). */
export const cameraLength = (anim) => {
  const legs = cameraLegs(anim);
  return legs.length ? r3(legs.at(-1).to.t - legs[0].from.t) : 0;
};

// ─── Writing the chain ──────────────────────────────────────────────────

/**
 * The VISUAL nodes for an animation: one per stretch between samples (plus a
 * hold), each { at: seconds after the start, node }. `frameAt(t)` is the
 * body part's CFrame at t seconds after the start (the 3D view's); without
 * it the part is taken as standing still. A camera's are its legs
 * (cameraLegs): whole frames, back to back, eased by JJS.
 */
export function chainNodes(a, frameAt = null) {
  const out = [];
  const camera = a.effect === 'Camera';
  let legs;
  let plain = false;
  if (camera) {
    legs = cameraLegs(a).map((l) => [l.from, l.to, l.ease]);
  } else {
    const pts = samples(a);
    // Only key to key: each piece eases as its key says, in JJS itself.
    // Otherwise the pieces are short and Linear, and the easing is in where
    // they're sampled.
    plain = pts.every((p) => p.key);
    // A jump cut's two poses share a moment: no piece between them, the next
    // piece simply starts at the cut key.
    legs = pts
      .slice(0, -1)
      .map((p, i) => [p, pts[i + 1]])
      .filter(([from, to]) => to.t - from.t > 0.0005);
    if (a.hold > 0) legs.push([pts.at(-1), { ...pts.at(-1), t: pts.at(-1).t + a.hold }]);
  }
  const F = (t) => (frameAt ? frameAt(t) : new Matrix4());
  for (const [from, to, legEase] of legs) {
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
    const ease = String(legEase ?? (plain ? (from.ease ?? 'Linear In') : 'Linear In')).split(' ');
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
      'EASING STYLE': ease[0] || 'Linear',
      'EASING DIRECTION': ease[1] || 'In',
    };
    out.push({ at: from.t, node });
  }
  return out;
}

/**
 * Everything an animation puts in the line: its VISUALs and, for a camera
 * (unless `lock` is off), a DirectionLock on you for the whole of it, so you
 * don't turn while the shot plays. The state carries the animation's tag as
 * its STATE TAG, so it comes out with the chain.
 */
export function animationNodes(a, frameAt = null) {
  const nodes = chainNodes(a, frameAt);
  if (a.effect !== 'Camera' || a.lock === false || !nodes.length) return nodes;
  const length = r3(nodes.at(-1).at + Number(nodes.at(-1).node.TIME) - nodes[0].at);
  const lock = {
    K_NAME: 'STATE',
    STATE: 'DirectionLock',
    VALUE: 1,
    TIME: length,
    'CANCEL ON END': false,
    'DISABLE BURST': false,
    'LAST HIT': -1,
    CHECK: false,
    'STATE TAG': a.tag,
  };
  return [{ at: nodes[0].at, node: lock }, ...nodes];
}

/** Whether a node is an animation's DirectionLock (its STATE TAG is the animation's tag). */
const isLock = (n, a) =>
  a.effect === 'Camera' && n?.K_NAME === 'STATE' && n.STATE === 'DirectionLock' && n['STATE TAG'] === a.tag;

/**
 * Camera blocks that run into the next one (on the same screen): BuilderFX
 * gives the view back to the player when a block's TIME runs out, even mid
 * way through a newer block, so each is cut to end where the next begins.
 * A moving one is cut at the pose it had reached then. Returns { line,
 * trimmed: how many were cut }.
 */
export function separateCameras(line) {
  const times = lineTimes(line);
  const screen = (n) => (Number(withDefaults(n)['LAST HIT']) > 0 ? 'hit' : 'you');
  const cams = line
    .map((n, i) => ({ n, i, t: times[i] }))
    .filter(({ n }) => n?.K_NAME === 'VISUAL' && n.EFFECT === 'Camera');
  const out = [...line];
  let trimmed = 0;
  for (const who of ['you', 'hit']) {
    const list = cams.filter((c) => screen(c.n) === who);
    list.forEach((c, k) => {
      const next = list[k + 1];
      if (!next) return;
      const n = withDefaults(c.n);
      const time = Math.max(0, Number(n.TIME) || 0);
      const gap = r3(next.t - c.t);
      if (c.t + time <= next.t + 0.0005 || gap <= 0) return;
      const patch = { TIME: gap };
      const alt = vec(n['ALT POSITION']);
      if (alt.some((v) => Math.abs(v) > EPS)) {
        // Where it had got to by then: k of the way, as its easing has it.
        const k = tweenAt(gap, Math.max(EPS, time), n['EASING STYLE'] || 'Linear', n['EASING DIRECTION'] || 'In');
        const rot = vec(n.ROTATION);
        const altRot = n['ALT ROTATION'] != null && n['ALT ROTATION'] !== '' ? vec(n['ALT ROTATION']) : rot;
        const cut = alt.map((v) => v * k);
        patch['ALT POSITION'] = str(cut.every((v) => Math.abs(v) < 0.0005) ? [0, 0.001, 0] : cut);
        patch['ALT ROTATION'] = str(rotOf(quatOf(rot).slerp(quatOf(altRot), k)));
      }
      out[c.i] = { ...c.n, ...patch };
      trimmed++;
    });
  }
  return { line: out, trimmed };
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

/** Whether a node belongs to the animation `tag` (a VISUAL of that effect with that tag, or a camera's DirectionLock). */
export const inChain = (n, a) =>
  (n?.K_NAME === 'VISUAL' && n['VISUAL TAG'] === a.tag && n.EFFECT === a.effect) || isLock(n, a);

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

/**
 * Puts `node` into a line at `t` seconds, splitting the WAIT it falls in (or
 * waiting at the end). `after`: at a moment that already has nodes, it goes
 * after them (just before the next WAIT) instead of before them.
 */
export function insertAt(line, t, node, from = 0, { after = false } = {}) {
  const out = [...line];
  let acc = 0;
  for (let i = 0; i < out.length; i++) {
    if (i >= from && acc >= t - EPS && !(after && acc <= t + EPS && !isWait(out[i]))) {
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
 * `weave`: start at `time` seconds into the line instead, wherever that falls
 * among the nodes already there, every piece going in between them at its
 * moment. Camera blocks are kept from running into each other
 * (separateCameras). Returns { line, start, extended, trimmed } (extended:
 * seconds of WAIT added at the end; trimmed: other camera blocks cut short).
 */
export function writeChain(line, a, nodes, { index, time, weave = false } = {}) {
  const removed = removeChain(line, a);
  let base = removed?.line ?? [...line];
  const start = weave ? Math.max(0, time ?? 0) : (removed?.time ?? time ?? 0);
  const endBefore = lineTimes(base).at(-1) ?? 0;
  const lastWait = base.length && isWait(base.at(-1)) ? waitTime(base.at(-1)) : 0;
  let next;
  if (weave) {
    // Each piece at its moment, after the nodes already there and the piece before it.
    next = 0;
    for (const { at: t, node } of nodes) {
      base = insertAt(base, start + t, node, next, { after: true });
      next = base.indexOf(node) + 1;
    }
  } else {
    // The first piece goes where the old one was; the rest by their time.
    const at = removed?.index ?? index ?? base.length;
    base.splice(Math.min(at, base.length), 0, nodes[0].node);
    next = Math.min(at, base.length - 1) + 1;
    for (const { at: t, node } of nodes.slice(1)) {
      base = insertAt(base, start + t, node, next);
      next = base.indexOf(node) + 1;
    }
  }
  let trimmed = 0;
  if (a.effect === 'Camera') ({ line: base, trimmed } = separateCameras(base));
  const endAfter = (lineTimes(base).at(-1) ?? 0) + (base.length && isWait(base.at(-1)) ? waitTime(base.at(-1)) : 0);
  return { line: base, start, extended: Math.max(0, r3(endAfter - endBefore - lastWait)), trimmed };
}

// ─── Carrying a VISUAL on ───────────────────────────────────────────────

/** How long a VISUAL's WAIT before its continuation is: its TIME, less this overlap (none for a camera). */
export const CONTINUE_OVERLAP = 0.05;

/**
 * The VISUAL that carries `node` on from where it ends: it starts at its
 * ALT POSITION (and ALT ROTATION, size, transparency, colour) and makes the
 * same move again from there, in its own axes, as one more piece of a
 * chain would. With the WAIT to put before it: the node's TIME less 0.05,
 * so the two overlap a moment and the effect doesn't blink between them;
 * a Camera's WAIT is its whole TIME (overlapping, JJS hands the view back
 * to the player mid-shot).
 */
export function continuation(node) {
  const n = withDefaults(node);
  const camera = n.EFFECT === 'Camera';
  const pos = vec(n.POSITION);
  const rot = vec(n.ROTATION);
  const alt = vec(n['ALT POSITION']);
  const altRot = n['ALT ROTATION'] != null && n['ALT ROTATION'] !== '' ? vec(n['ALT ROTATION']) : rot;
  const P = cfPos(-pos[0], pos[1], -pos[2]);
  const start = keyMatrix({ pos, rot });
  // Where it ends, in the body part's frame: a camera at pos · alt · altRot,
  // a part at its start · pos · alt · altRot (POSITION counts twice).
  const move = P.clone()
    .multiply(cfPos(-alt[0], alt[1], -alt[2]))
    .multiply(cfOrient(...altRot));
  const end = camera ? move.clone() : start.clone().multiply(move);
  const next = keyFrom(end);
  // The same move from there, in its own axes: end' = start' · (start⁻¹ · end),
  // so alt' · altRot' = rot' · delta for a camera, pos'⁻¹ · delta for a part.
  const delta = start.clone().invert().multiply(end);
  const P2 = cfPos(-next.pos[0], next.pos[1], -next.pos[2]);
  const R2 = cfOrient(...next.rot);
  const rest = keyFrom(camera ? R2.clone().multiply(delta) : P2.clone().invert().multiply(delta));
  const moving = alt.some((c) => Math.abs(c) > EPS) || altRot.some((c, i) => Math.abs(c - rot[i]) > EPS);
  const out = { ...node, POSITION: str(next.pos), ROTATION: str(next.rot) };
  if (moving) {
    out['ALT POSITION'] = str(rest.pos);
    out['ALT ROTATION'] = str(rest.rot);
  }
  const size = Number(n.SIZE ?? 1);
  const altSize = Number(n['ALT SIZE'] ?? 1);
  if (node.SIZE != null && Number.isFinite(size) && Number.isFinite(altSize)) out.SIZE = r3(size * altSize);
  if (node['ALT SIZE 2'] != null && String(node['ALT SIZE 2']).trim() !== '') out['SIZE 2'] = node['ALT SIZE 2'];
  if (node['ALT OPACITY'] != null) out.OPACITY = node['ALT OPACITY'];
  if (node['ALT COLOR'] != null && node['ALT COLOR'] !== '') out.COLOR = node['ALT COLOR'];
  const time = Math.max(0, Number(n.TIME ?? 1) || 0);
  const wait = camera ? time : Math.max(0, time - CONTINUE_OVERLAP);
  return { node: out, wait: r3(wait) };
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
