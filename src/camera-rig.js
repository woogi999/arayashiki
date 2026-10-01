// Cameras for watching, recording and screenshotting a skill, besides the
// one you fly yourself:
//
//   Auto      a cinematographer that frames the fight: an angle (three
//             quarters, side, front, over the shoulder, low hero shot, high,
//             top, orbit), how tight, how smooth, and what it does on a hit
//             (punch in, shake, a dutch tilt).
//   Recorded  a path you lay down: camera keys at times on the timeline,
//             flown to in the viewport, or a take recorded live while the
//             skill plays. Catmull-Rom through the positions, slerp between
//             the turns.
//
// Both are a pure function of the playhead, like everything else in the
// view, so scrubbing, playing and exporting a video all see the same shot.
// The auto camera's smoothing is a spring, so its track is worked out once
// per run (60 samples a second) and read back by time.

import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { tweenAt } from './fx/roblox.js';

const RATE = 60;
const UP = new Vector3(0, 1, 0);
const RAD = Math.PI / 180;

export const AUTO_DEFAULTS = {
  angle: 'three-quarter',
  framing: 'medium',
  subject: 'both',
  smooth: 0.6, // 0 snaps, 1 drifts
  orbitSpeed: 25, // degrees a second, for the orbit angle
  height: 0, // studs added to the camera's height
  punch: true, // dolly in on each hit
  shake: 0.5, // 0–1: a jolt on each hit
  dutch: 0, // degrees of roll, all the time
  dutchOnHit: true, // a little roll that kicks on hits
  fov: 70,
};

export const AUTO_ANGLES = [
  ['three-quarter', 'Three-quarter'],
  ['side', 'Side on'],
  ['front', 'Front'],
  ['behind', 'Over the shoulder'],
  ['low', 'Low hero shot'],
  ['high', 'High'],
  ['top', 'Top down'],
  ['orbit', 'Orbit'],
];
export const AUTO_FRAMINGS = [
  ['tight', 'Tight'],
  ['medium', 'Medium'],
  ['wide', 'Wide'],
];
export const AUTO_SUBJECTS = [
  ['both', 'Both'],
  ['you', 'You'],
  ['dummy', 'The dummy'],
];

// Where the camera sits around the subject: a heading in the character's
// own frame (degrees, 0 in front of them, 90 to their right) and an
// elevation (degrees above the subject).
const ANGLES = {
  'three-quarter': [55, 16],
  side: [90, 6],
  front: [0, 8],
  behind: [165, 14],
  low: [40, -12],
  high: [35, 45],
  top: [10, 84],
  orbit: [55, 18],
};
const FRAMING = { tight: 0.7, medium: 1, wide: 1.55 };

// Smooth noise in -1…1 (the shake).
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * u;
}

/**
 * Works out the auto camera for a run: `sample(t)` gives
 * { user: Vector3, target: Vector3, yaw, dummy } at a time (the chests of
 * the two, your heading, whether the dummy is there). Returns a track:
 * `at(t)` → { position, quaternion, fov }.
 */
export function autoTrack(run, sample, options = {}) {
  const o = { ...AUTO_DEFAULTS, ...options };
  const duration = Math.max(0.1, run?.duration ?? 1);
  const n = Math.ceil(duration * RATE) + 1;
  const hits = (run?.events ?? []).filter((e) => e.kind === 'HIT').map((e) => e.t);
  const [heading, elevation] = ANGLES[o.angle] ?? ANGLES['three-quarter'];
  const fovRad = o.fov * RAD;
  const stiffness = MathUtils.lerp(26, 2.2, MathUtils.clamp(o.smooth, 0, 1));
  const positions = new Float32Array(n * 3);
  const looks = new Float32Array(n * 3);
  const rolls = new Float32Array(n);
  const dt = 1 / RATE;

  const pos = new Vector3();
  const look = new Vector3();
  const vPos = new Vector3();
  const vLook = new Vector3();
  const want = new Vector3();
  const wantLook = new Vector3();
  // A critically damped spring: no overshoot, settles in about 4 / stiffness s.
  const spring = (x, v, goal) => {
    const w = stiffness;
    const f = 1 + 2 * dt * w;
    const oo = w * w;
    const hoo = dt * oo;
    const det = 1 / (f + dt * hoo);
    const nx = x.clone().multiplyScalar(f).addScaledVector(v, dt).addScaledVector(goal, dt * hoo).multiplyScalar(det);
    const nv = v.clone().addScaledVector(goal.clone().sub(x), hoo).multiplyScalar(det);
    x.copy(nx);
    v.copy(nv);
  };

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const s = sample(t);
    const a = s.user;
    const b = s.dummy ? s.target : s.user;
    const focus =
      o.subject === 'you' ? a.clone() : o.subject === 'dummy' && s.dummy ? b.clone() : a.clone().add(b).multiplyScalar(0.5);
    const spread = o.subject === 'both' ? a.distanceTo(b) / 2 : 0;
    // Far enough that a sphere around the subject (half the gap, plus a body)
    // fills the frame as the framing asks.
    const radius = (spread + 3.6) * (FRAMING[o.framing] ?? 1);
    let dist = radius / Math.tan(fovRad / 2);
    // A hit: dolly in, fast, then ease back out.
    let jolt = 0;
    let kick = 0;
    for (const h of hits) {
      if (t < h) continue;
      const age = t - h;
      if (o.punch) dist *= 1 - 0.16 * Math.exp(-age * 5);
      jolt += Math.exp(-age * 9);
      kick += Math.exp(-age * 4) * Math.sin(age * 18);
    }
    // You face (sin yaw, 0, cos yaw) and your right is (-cos yaw, 0, sin yaw),
    // so heading h round from your front is the direction at yaw - h.
    const around = s.yaw - (heading + (o.angle === 'orbit' ? o.orbitSpeed * t : 0)) * RAD;
    const el = elevation * RAD;
    const dir = new Vector3(Math.sin(around) * Math.cos(el), Math.sin(el), Math.cos(around) * Math.cos(el));
    want.copy(focus).addScaledVector(dir, dist);
    want.y = Math.max(o.angle === 'low' ? 0.8 : 1.5, want.y + o.height);
    wantLook.copy(focus);
    if (o.angle === 'behind' && s.dummy) wantLook.lerp(b, 0.35);
    if (i === 0) {
      pos.copy(want);
      look.copy(wantLook);
    } else {
      spring(pos, vPos, want);
      spring(look, vLook, wantLook);
    }
    const shake = o.shake * jolt * 0.35;
    positions[i * 3] = pos.x + noise(t * 31) * shake;
    positions[i * 3 + 1] = pos.y + noise(t * 29 + 7) * shake;
    positions[i * 3 + 2] = pos.z + noise(t * 37 + 13) * shake;
    looks[i * 3] = look.x;
    looks[i * 3 + 1] = look.y;
    looks[i * 3 + 2] = look.z;
    rolls[i] = (o.dutch + (o.dutchOnHit ? kick * 4 * Math.max(0.3, o.shake) : 0)) * RAD;
  }

  const m = new Matrix4();
  return {
    duration,
    at(t) {
      const x = MathUtils.clamp(t * RATE, 0, n - 1);
      const i = Math.min(n - 2, Math.floor(x));
      const k = n > 1 ? x - i : 0;
      const j = Math.min(n - 1, i + 1);
      const lerp = (arr, c) => arr[i * 3 + c] + (arr[j * 3 + c] - arr[i * 3 + c]) * k;
      const position = new Vector3(lerp(positions, 0), lerp(positions, 1), lerp(positions, 2));
      const target = new Vector3(lerp(looks, 0), lerp(looks, 1), lerp(looks, 2));
      m.lookAt(position, target, UP);
      const quaternion = new Quaternion().setFromRotationMatrix(m);
      const roll = rolls[i] + (rolls[j] - rolls[i]) * k;
      if (roll) quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll));
      return { position, quaternion, fov: o.fov };
    },
  };
}

// ─── Recorded paths ──────────────────────────────────────────────────────

/** A camera key from a three.js camera: { t, p, q, fov }. */
export const keyOf = (t, camera) => ({
  t: Math.round(t * 1000) / 1000,
  p: camera.position.toArray().map((v) => Math.round(v * 1000) / 1000),
  q: camera.quaternion.toArray().map((v) => Math.round(v * 1e5) / 1e5),
  fov: Math.round(camera.fov * 10) / 10,
});

// Centripetal Catmull-Rom between p1 and p2 (p0 and p3 the neighbours).
function catmull(p0, p1, p2, p3, k) {
  const t01 = Math.sqrt(p0.distanceTo(p1)) || 1e-4;
  const t12 = Math.sqrt(p1.distanceTo(p2)) || 1e-4;
  const t23 = Math.sqrt(p2.distanceTo(p3)) || 1e-4;
  const m1 = p2
    .clone()
    .sub(p1)
    .add(
      p1
        .clone()
        .sub(p0)
        .divideScalar(t01)
        .sub(p2.clone().sub(p0).divideScalar(t01 + t12))
        .multiplyScalar(t12),
    );
  const m2 = p2
    .clone()
    .sub(p1)
    .add(
      p3
        .clone()
        .sub(p2)
        .divideScalar(t23)
        .sub(p3.clone().sub(p1).divideScalar(t12 + t23))
        .multiplyScalar(t12),
    );
  const k2 = k * k;
  const k3 = k2 * k;
  return p1
    .clone()
    .multiplyScalar(2 * k3 - 3 * k2 + 1)
    .addScaledVector(m1, k3 - 2 * k2 + k)
    .addScaledVector(p2, -2 * k3 + 3 * k2)
    .addScaledVector(m2, k3 - k2);
}

/**
 * A recorded path's pose at t: { position, quaternion, fov }, or null with
 * no keys. Each key may say how the camera eases into the next one
 * (`ease`: "Linear", "Sine InOut", "Quad Out"…, as TweenService names them).
 * `options.smooth` runs a curve through the positions (else straight lines);
 * `options.shake` jitters the camera ({ amount studs, turn degrees, freq,
 * from, to, decay }).
 */
export function pathAt(keys, t, { smooth = true, shake = null } = {}) {
  if (!keys?.length) return null;
  const P = (k) => new Vector3(...k.p);
  const Q = (k) => new Quaternion(...k.q);
  let pose;
  if (keys.length === 1 || t <= keys[0].t) pose = { position: P(keys[0]), quaternion: Q(keys[0]), fov: keys[0].fov ?? 70 };
  else if (t >= keys.at(-1).t) pose = { position: P(keys.at(-1)), quaternion: Q(keys.at(-1)), fov: keys.at(-1).fov ?? 70 };
  else {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const [style, direction] = String(a.ease ?? 'Sine InOut').split(' ');
    const k = tweenAt(t - a.t, Math.max(1e-6, b.t - a.t), style || 'Linear', direction || 'InOut');
    const p0 = P(keys[Math.max(0, i - 1)]);
    const p1 = P(a);
    const p2 = P(b);
    const p3 = P(keys[Math.min(keys.length - 1, i + 2)]);
    pose = {
      position: smooth ? catmull(p0, p1, p2, p3, k) : p1.lerp(p2, k),
      quaternion: Q(a).slerp(Q(b), k),
      fov: (a.fov ?? 70) + ((b.fov ?? 70) - (a.fov ?? 70)) * k,
    };
  }
  if (shake && (shake.amount > 0 || shake.turn > 0) && t > shake.from && t < shake.to) {
    const life = (t - shake.from) / Math.max(1e-6, shake.to - shake.from);
    const fade = shake.decay === false ? 1 : 1 - life;
    const x = t * (shake.freq ?? 14);
    const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    pose.position.addScaledVector(right, noise(x + 11) * shake.amount * fade).addScaledVector(up, noise(x + 23) * shake.amount * fade);
    const turn = ((shake.turn ?? 0) * fade * Math.PI) / 180;
    pose.quaternion.multiply(new Quaternion().setFromEuler(new Euler(noise(x + 37) * turn, noise(x + 41) * turn, noise(x + 53) * turn * 0.5)));
  }
  return pose;
}

export { thin, withKey } from './camera-keys.js';
