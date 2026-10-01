// Roblox's ParticleEmitter, drawn in three.js: the same properties (Size,
// Transparency, Color, Squash, Lifetime, Speed, SpreadAngle, Acceleration,
// Drag, Rotation, RotSpeed, Orientation, EmissionDirection, Shape, flipbooks,
// LockedToPart, LightEmission, Brightness, ZOffset, TimeScale) read from the
// game's own emitters (src/assets/jjs-fx.json).
//
// It is scrubbed, not stepped: every particle is decided up front from a
// seeded random (when it's born, how long it lives, where it goes), and its
// state at any time is worked out in closed form. So the view can jump to any
// moment and show exactly what playing up to it would.

import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector3,
} from 'three';
import { colorSeq, numberSeq, RAD, seeded } from './roblox.js';

const LN2 = Math.log(2);
// Flipbook grids: Roblox's Grid2x2/4x4/8x8, or a custom "GridXxY".
const grid = (layout) => {
  const m = /^Grid(\d+)x(\d+)$/.exec(layout ?? '');
  return m ? [Math.max(1, Number(m[1])), Math.max(1, Number(m[2]))] : [1, 1];
};
const DIRECTIONS = {
  Top: [0, 1, 0],
  Bottom: [0, -1, 0],
  Front: [0, 0, -1],
  Back: [0, 0, 1],
  Right: [1, 0, 0],
  Left: [-1, 0, 0],
};
const MAX_PARTICLES = 4000;

const VERTEX = /* glsl */ `
attribute vec4 tint;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vUv = uv;
  vTint = tint;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
// Premultiplied, so LightEmission can slide from normal blending (0) to
// additive (1): the colour always adds, the alpha only covers what's behind
// as much as it isn't light.
const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
uniform float brightness;
uniform float emission;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vec4 tex = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0, 1.0, 1.0, pow(max(0.0, 1.0 - length(vUv - 0.5) * 2.0), 1.6));
  float a = tex.a * vTint.a;
  if (a < 0.002) discard;
  vec3 c = min(tex.rgb * vTint.rgb * brightness, vec3(1.0));
  gl_FragColor = vec4(c * a, a * (1.0 - emission));
}`;

export function particleMaterial() {
  return new ShaderMaterial({
    uniforms: { map: { value: null }, hasMap: { value: 0 }, brightness: { value: 1 }, emission: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Both faces, as Roblox draws them: a velocity-aligned particle can face
    // away (Wind Expand's ring lies flat, facing down, seen from above).
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
}

const range = (r, d = [0, 0]) => (Array.isArray(r) ? r : d);

/**
 * One emitter. `props` are the ParticleEmitter's properties (as read from
 * the game, then changed the way BuilderFX changes them). `holder` says where
 * it is: frame(t) gives its parent's world CFrame (an Attachment's, or a
 * Part's), and `size` the Part's size (null for an Attachment, which emits
 * from a point). `scale` is a Model:ScaleTo on it (sizes, speeds, accelerations).
 */
export class Emitter {
  constructor(props, { holder, seed = 1, scale = 1, texture = null }) {
    this.p = props;
    this.holder = holder;
    this.scale = scale;
    this.rand = seeded(seed);
    this.spawns = [];
    this.particles = null;
    this.texture = texture;
    this.material = particleMaterial();
    this.material.uniforms.brightness.value = props.Brightness ?? 1;
    this.material.uniforms.emission.value = Math.max(0, Math.min(1, props.LightEmission ?? 0));
    this.geometry = new BufferGeometry();
    this.capacity = 0;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10 + (props.ZOffset ?? 0);
  }

  /** ParticleEmitter:Emit(count) at t. */
  emit(t, count) {
    const n = Math.max(0, Math.min(MAX_PARTICLES, Math.round(count)));
    for (let i = 0; i < n; i++) this.spawns.push(t);
    this.particles = null;
  }

  /** Enabled from t0 to t1 at `rate(t)` particles a second. */
  run(t0, t1, rate = () => this.p.Rate ?? 0) {
    let t = t0;
    let owed = 0;
    const step = 1 / 120;
    while (t < t1 && this.spawns.length < MAX_PARTICLES) {
      owed += Math.max(0, rate(t)) * step;
      while (owed >= 1) {
        this.spawns.push(t);
        owed -= 1;
      }
      t += step;
    }
    this.particles = null;
  }

  /** The longest a particle lives, in seconds of the view. */
  get span() {
    const life = range(this.p.Lifetime, [1, 1])[1];
    return life / Math.max(0.01, this.p.TimeScale ?? 1);
  }

  build() {
    const p = this.p;
    const rand = this.rand;
    const between = ([a, b]) => a + (b - a) * rand();
    const speedR = range(p.Speed, [5, 5]);
    const lifeR = range(p.Lifetime, [1, 1]);
    const rotR = range(p.Rotation);
    const spinR = range(p.RotSpeed);
    const [sx, sy] = p.SpreadAngle ?? [0, 0];
    const dir0 = DIRECTIONS[p.EmissionDirection] ?? DIRECTIONS.Top;
    const size = this.holder.size;
    const fps = range(p.FlipbookFramerate, [1, 1]);
    const [gx, gy] = grid(p.FlipbookLayout);
    this.particles = this.spawns
      .sort((a, b) => a - b)
      .map((born) => {
        // Where in the parent: a point for an Attachment, inside the Part's
        // box (or on it) for a Part.
        let local = [0, 0, 0];
        if (size) {
          local = size.map((s) => (rand() - 0.5) * s);
          if (p.ShapeStyle === 'Surface') {
            const axis = Math.floor(rand() * 3);
            local[axis] = (rand() < 0.5 ? -0.5 : 0.5) * size[axis];
          }
        }
        // Which way: the emission direction, tipped by up to SpreadAngle on
        // the two axes across it.
        const d = new Vector3(...dir0);
        const across = Math.abs(d.y) > 0.5 ? [new Vector3(1, 0, 0), new Vector3(0, 0, 1)] : [new Vector3(0, 1, 0), new Vector3(1, 0, 0)];
        d.applyAxisAngle(across[0], (rand() * 2 - 1) * sx * RAD);
        d.applyAxisAngle(across[1], (rand() * 2 - 1) * sy * RAD);
        if (p.ShapeInOut === 'Inward') d.negate();
        const frame = this.holder.frame(born);
        const rot = new Matrix4().extractRotation(frame);
        const speed = between(speedR) * this.scale;
        const accel = new Vector3(...(p.Acceleration ?? [0, 0, 0])).multiplyScalar(this.scale);
        const locked = Boolean(p.LockedToPart);
        let pos;
        let vel;
        let acc;
        if (locked) {
          // In the parent's own frame, carried along with it.
          pos = new Vector3(...local);
          vel = d.multiplyScalar(speed);
          acc = accel.applyMatrix4(rot.clone().invert());
        } else {
          pos = new Vector3(...local).applyMatrix4(frame);
          vel = d.applyMatrix4(rot).multiplyScalar(speed);
          acc = accel;
        }
        return {
          born,
          life: Math.max(0.01, between(lifeR)),
          pos,
          vel,
          acc,
          locked,
          rot: between(rotR),
          spin: between(spinR),
          sizePick: rand() * 2 - 1,
          fadePick: rand() * 2 - 1,
          fps: between(fps),
          frame0: p.FlipbookStartRandom || p.FlipbookMode === 'Random' ? Math.floor(rand() * gx * gy) : 0,
        };
      });
  }

  /** Draws the particles alive at t, facing `camera`. */
  update(t, camera) {
    if (!this.particles) this.build();
    const p = this.p;
    const scale = this.scale;
    const timeScale = Math.max(0.01, p.TimeScale ?? 1);
    const k = (p.Drag ?? 0) * LN2;
    const [gx, gy] = grid(p.FlipbookLayout);
    const frames = gx * gy;
    const mode = p.FlipbookMode ?? 'Loop';
    const orient = p.Orientation ?? 'FacingCamera';
    const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const camRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const alive = [];
    for (const q of this.particles) {
      const age = (t - q.born) * timeScale;
      if (age < 0 || age >= q.life) continue;
      alive.push([q, age]);
    }
    const n = alive.length;
    if (n > this.capacity || !this.capacity) this.allocate(Math.max(n, this.capacity * 2, 16));
    const P = this.geometry.attributes.position.array;
    const UV = this.geometry.attributes.uv.array;
    const C = this.geometry.attributes.tint.array;
    const zOffset = p.ZOffset ?? 0;
    let frameNow = null;
    const pos = new Vector3();
    const vel = new Vector3();
    const R = new Vector3();
    const U = new Vector3();
    const toCam = new Vector3();
    for (let i = 0; i < n; i++) {
      const [q, age] = alive[i];
      const x = age / q.life;
      // Position and velocity under acceleration and drag (speed halves
      // every 1/Drag seconds), in closed form.
      if (k > 0) {
        const e = Math.exp(-k * age);
        pos
          .copy(q.acc)
          .multiplyScalar(age / k)
          .add(q.pos)
          .addScaledVector(q.vel.clone().addScaledVector(q.acc, -1 / k), (1 - e) / k);
        vel.copy(q.acc).multiplyScalar(1 / k).addScaledVector(q.vel.clone().addScaledVector(q.acc, -1 / k), e);
      } else {
        pos.copy(q.pos).addScaledVector(q.vel, age).addScaledVector(q.acc, 0.5 * age * age);
        vel.copy(q.vel).addScaledVector(q.acc, age);
      }
      if (q.locked) {
        frameNow ??= this.holder.frame(t);
        pos.applyMatrix4(frameNow);
        const speed = vel.length();
        vel.transformDirection(frameNow).multiplyScalar(speed);
      }
      toCam.copy(camPos).sub(pos).normalize();
      if (zOffset) pos.addScaledVector(toCam, zOffset);
      // Size and squash: positive squash stretches up and narrows.
      const s = Math.max(0, numberSeq(p.Size, x, q.sizePick)) * scale;
      const sq = numberSeq(p.Squash, x, 0);
      const f = 1 + Math.abs(sq);
      const w = (sq >= 0 ? s / f : s * f) / 2;
      const h = (sq >= 0 ? s * f : s / f) / 2;
      const angle = (q.rot + q.spin * age) * RAD;
      if (orient === 'VelocityParallel' || orient === 'VelocityPerpendicular') {
        const v = vel.lengthSq() > 1e-8 ? vel.clone().normalize() : camUp.clone();
        if (orient === 'VelocityParallel') {
          U.copy(v);
          R.crossVectors(U, toCam).normalize();
          if (R.lengthSq() < 1e-6) R.copy(camRight);
        } else {
          const ref = Math.abs(v.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
          R.crossVectors(ref, v).normalize();
          U.crossVectors(v, R).normalize();
        }
      } else if (orient === 'FacingCameraWorldUp') {
        U.set(0, 1, 0);
        R.crossVectors(U, toCam).normalize();
        if (R.lengthSq() < 1e-6) R.copy(camRight);
      } else {
        R.copy(camRight);
        U.copy(camUp);
      }
      // Velocity-parallel particles keep the picture's up along the flight
      // and ignore Rotation, as Roblox does: Sparks' vertical streak (with
      // Rotation 90) flies point first, not sideways. The others spin.
      if (angle && orient !== 'VelocityParallel') {
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        const r2 = R.clone().multiplyScalar(c).addScaledVector(U, sn);
        U.multiplyScalar(c).addScaledVector(R, -sn);
        R.copy(r2);
      }
      const corners = [
        [-w, -h, 0, 0],
        [w, -h, 1, 0],
        [w, h, 1, 1],
        [-w, h, 0, 1],
      ];
      // Flipbook cell.
      let cell = 0;
      if (frames > 1) {
        if (mode === 'OneShot') cell = Math.min(frames - 1, Math.floor(x * frames));
        else if (mode === 'PingPong') {
          const m = Math.floor(age * q.fps + q.frame0) % (2 * frames - 2 || 1);
          cell = m < frames ? m : 2 * frames - 2 - m;
        } else if (mode === 'Random') cell = q.frame0;
        else cell = Math.floor(age * q.fps + q.frame0) % frames;
      }
      const cu = (cell % gx) / gx;
      const cv = Math.floor(cell / gx) / gy;
      const col = colorSeq(p.Color, x);
      const alpha = 1 - Math.max(0, Math.min(1, numberSeq(p.Transparency, x, q.fadePick)));
      for (let c = 0; c < 4; c++) {
        const [a, b, u, v] = corners[c];
        const o = (i * 4 + c) * 3;
        P[o] = pos.x + R.x * a + U.x * b;
        P[o + 1] = pos.y + R.y * a + U.y * b;
        P[o + 2] = pos.z + R.z * a + U.z * b;
        const ou = (i * 4 + c) * 2;
        const [tu, tv] = [u, v];
        UV[ou] = cu + tu / gx;
        UV[ou + 1] = 1 - (cv + (1 - tv) / gy);
        const oc = (i * 4 + c) * 4;
        C[oc] = col[0];
        C[oc + 1] = col[1];
        C[oc + 2] = col[2];
        C[oc + 3] = alpha;
      }
    }
    this.geometry.setDrawRange(0, n * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.attributes.tint.needsUpdate = true;
    const tex = this.texture?.map ?? null;
    if (this.material.uniforms.map.value !== tex) {
      this.material.uniforms.map.value = tex;
      this.material.uniforms.hasMap.value = tex ? 1 : 0;
    }
    this.mesh.visible = n > 0;
  }

  allocate(capacity) {
    this.capacity = capacity;
    const index = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 12), 3));
    this.geometry.setAttribute('uv', new BufferAttribute(new Float32Array(capacity * 8), 2));
    this.geometry.setAttribute('tint', new BufferAttribute(new Float32Array(capacity * 16), 4));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
