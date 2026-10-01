// Roblox's Trail and Beam, drawn as ribbons with the particles' material
// (src/fx/particles.js): texture, Color and Transparency along their length,
// WidthScale, FaceCamera, LightEmission and Brightness.
//
// A Trail is worked out from where its two attachments were over the last
// Lifetime seconds, so it scrubs like everything else.

import { BufferAttribute, BufferGeometry, Mesh, Vector3 } from 'three';
import { colorSeq, numberSeq } from './roblox.js';
import { particleMaterial } from './particles.js';

class Ribbon {
  constructor(props, texture) {
    this.p = props;
    this.texture = texture;
    this.material = particleMaterial();
    this.material.uniforms.brightness.value = props.Brightness ?? 1;
    this.material.uniforms.emission.value = Math.max(0, Math.min(1, props.LightEmission ?? 0));
    this.geometry = new BufferGeometry();
    this.capacity = 0;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  allocate(points) {
    this.capacity = points;
    const index = new Uint32Array(Math.max(0, points - 1) * 6);
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2;
      index.set([a, a + 1, a + 3, a, a + 3, a + 2], i * 6);
    }
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(points * 6), 3));
    this.geometry.setAttribute('uv', new BufferAttribute(new Float32Array(points * 4), 2));
    this.geometry.setAttribute('tint', new BufferAttribute(new Float32Array(points * 8), 4));
  }

  /** points: [{ a: Vector3, b: Vector3, u, x (0 → 1 along), alpha multiplier }] */
  draw(points, camera, faceCamera) {
    const n = points.length;
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    if (n > this.capacity) this.allocate(Math.max(n, this.capacity * 2, 32));
    const P = this.geometry.attributes.position.array;
    const UV = this.geometry.attributes.uv.array;
    const C = this.geometry.attributes.tint.array;
    const cam = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    for (let i = 0; i < n; i++) {
      const q = points[i];
      let { a, b } = q;
      if (faceCamera) {
        // Keep the width, but turn it square to the view and the run.
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const next = points[Math.min(n - 1, i + 1)];
        const prev = points[Math.max(0, i - 1)];
        const along = next.a.clone().add(next.b).sub(prev.a).sub(prev.b);
        const side = along.cross(cam.clone().sub(mid)).normalize();
        const half = a.distanceTo(b) / 2;
        if (side.lengthSq() > 0.5) {
          a = mid.clone().addScaledVector(side, -half);
          b = mid.clone().addScaledVector(side, half);
        }
      }
      P.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      UV.set([q.u, 1, q.u, 0], i * 4);
      const col = colorSeq(this.p.Color, q.x);
      const alpha = (1 - Math.max(0, Math.min(1, numberSeq(this.p.Transparency, q.x)))) * (q.alpha ?? 1);
      C.set([...col, alpha, ...col, alpha], i * 8);
    }
    this.geometry.setDrawRange(0, (n - 1) * 6);
    for (const k of ['position', 'uv', 'tint']) this.geometry.attributes[k].needsUpdate = true;
    const tex = this.texture?.map ?? null;
    if (this.material.uniforms.map.value !== tex) {
      this.material.uniforms.map.value = tex;
      this.material.uniforms.hasMap.value = tex ? 1 : 0;
    }
    this.mesh.visible = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * A Trail between two attachments. `ends(t)` → [Vector3, Vector3] (world),
 * emitting from `from` until `until`; `widthScale` overrides the property.
 */
export class Trail extends Ribbon {
  constructor(props, texture, { ends, from, until = Infinity, widthScale }) {
    super(props, texture);
    this.ends = ends;
    this.from = from;
    this.until = until;
    this.widthScale = widthScale ?? props.WidthScale;
  }

  update(t, camera) {
    const life = Math.max(0.02, this.p.Lifetime ?? 0.5);
    const newest = Math.min(t, this.until);
    const oldest = Math.max(this.from, t - life);
    if (newest <= oldest) {
      this.mesh.visible = false;
      return;
    }
    const steps = Math.max(2, Math.min(90, Math.ceil((newest - oldest) * 120)));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const s = newest - ((newest - oldest) * i) / steps;
      const age = (t - s) / life;
      const [a, b] = this.ends(s);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const w = Math.max(0, numberSeq(this.widthScale, age));
      points.push({
        a: mid.clone().lerp(a, w),
        b: mid.clone().lerp(b, w),
        x: age,
        u: this.p.TextureMode === 'Stretch' ? age : (age * life) / Math.max(0.01, this.p.TextureLength ?? 1),
      });
    }
    this.draw(points, camera, this.p.FaceCamera !== false);
  }
}

/**
 * A Beam: a cubic curve from one attachment to another (CurveSize0/1 along
 * each one's x), Width0 → Width1. `ends(t)` → [Matrix4, Matrix4] (world);
 * `width(t)` → [w0, w1] to tween them; `on(t)` whether it's shown.
 */
export class Beam extends Ribbon {
  constructor(props, texture, { ends, width, on = () => true, scale = 1 }) {
    super(props, texture);
    this.ends = ends;
    this.width = width ?? (() => [props.Width0 ?? 1, props.Width1 ?? 1]);
    this.on = on;
    this.scale = scale;
  }

  update(t, camera) {
    if (!this.on(t)) {
      this.mesh.visible = false;
      return;
    }
    const [m0, m1] = this.ends(t);
    const p0 = new Vector3().setFromMatrixPosition(m0);
    const p3 = new Vector3().setFromMatrixPosition(m1);
    const x0 = new Vector3().setFromMatrixColumn(m0, 0).normalize();
    const x1 = new Vector3().setFromMatrixColumn(m1, 0).normalize();
    const p1 = p0.clone().addScaledVector(x0, (this.p.CurveSize0 ?? 0) * this.scale);
    const p2 = p3.clone().addScaledVector(x1, -(this.p.CurveSize1 ?? 0) * this.scale);
    const [w0, w1] = this.width(t).map((w) => w * this.scale);
    const up = new Vector3().setFromMatrixColumn(m0, 1).normalize();
    const segments = Math.max(2, Math.min(64, this.p.Segments ?? 10));
    const scroll = t * (this.p.TextureSpeed ?? 0);
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const x = i / segments;
      const y = 1 - x;
      const at = p0
        .clone()
        .multiplyScalar(y * y * y)
        .addScaledVector(p1, 3 * y * y * x)
        .addScaledVector(p2, 3 * y * x * x)
        .addScaledVector(p3, x * x * x);
      const half = (w0 + (w1 - w0) * x) / 2;
      points.push({
        a: at.clone().addScaledVector(up, -half),
        b: at.clone().addScaledVector(up, half),
        x,
        u: (this.p.TextureMode === 'Stretch' ? x : x * p0.distanceTo(p3) / Math.max(0.01, this.p.TextureLength ?? 1)) - scroll,
      });
    }
    this.draw(points, camera, this.p.FaceCamera !== false);
  }
}
