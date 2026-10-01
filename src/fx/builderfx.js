// JJS's BuilderFX, ported: each VISUAL effect built the way the game builds
// it (ReplicatedStorage.Modules.BuilderFX, read in Studio), from the same
// templates (src/assets/jjs-fx.json: npm run fx-data), with the same
// tweens, so what the view shows is what the game would.
//
// Every effect is a function of time: `make(event, ctx)` returns
// { update(t), dispose(), until }, and update can be called for any t, in any
// order, so the timeline scrubs.
//
// Where an effect sits follows BuilderFX exactly:
//   - most are placed at part.CFrame · CFrame.new(-x, y, -z) · orientation;
//   - with ALT POSITION at 0, 0, 0 they're welded there and follow the part;
//   - with any other ALT POSITION they're left in the world where they
//     started and tween from there to part.CFrame · pos · alt · alt rotation
//     (worked out when they spawn), so they don't follow;
//   - Afterimage and Afterimage2 are always left where they started;
//     Black Flash and Cleave too (they're anchored, never welded).
//
// `ctx` is what the 3D view lends: frameAt(who, part, t) (a body part's
// Roblox CFrame), shotFrameAt(shot, t), texture(id), mesh(id),
// bodyGeometry(name), cloneBody(who), group, camera.

import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import FX from '../assets/jjs-fx.json';
import { Emitter } from './particles.js';
import { Beam, Trail } from './ribbons.js';
import {
  cfAngles,
  cfComponents,
  cfLerp,
  cfOrient,
  cfPos,
  cseq2,
  isZero,
  mul,
  num,
  rgb,
  rotationOf,
  seq2,
  sizeSequence,
  tweenAt,
  TWEEN_DEFAULT,
  v3,
} from './roblox.js';

// ─── Templates ──────────────────────────────────────────────────────────

const TEMPLATES = FX.templates ?? {};
const tpl = (path) => TEMPLATES[path] ?? null;
const BFX = (name) => FX.builderfx?.children?.find((c) => c.name === name) ?? tpl(`Utils.BuilderFX.${name}`);
const child = (node, name) => node?.children?.find((c) => c.name === name) ?? null;
const childrenOf = (node, cls) => (node?.children ?? []).filter((c) => !cls || c.class === cls);
function descendants(node, cls, out = []) {
  for (const c of node?.children ?? []) {
    if (!cls || c.class === cls) out.push(c);
    descendants(c, cls, out);
  }
  return out;
}
const assetId = (s) => String(s ?? '').match(/(\d{3,})/)?.[1] ?? null;

// ─── Shared geometry ────────────────────────────────────────────────────

const UNIT = {
  Block: new BoxGeometry(1, 1, 1),
  Ball: new SphereGeometry(0.5, 24, 16),
  // A Roblox cylinder lies along its x.
  Cylinder: new CylinderGeometry(0.5, 0.5, 1, 24).rotateZ(Math.PI / 2),
  Wedge: wedge(),
};
function wedge() {
  const P = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
    [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
  ];
  const faces = [[0, 2, 1], [0, 3, 2], [3, 5, 2], [3, 4, 5], [0, 1, 5], [0, 5, 4], [0, 4, 3], [1, 2, 5]];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(faces.flat().flatMap((i) => P[i]), 3));
  g.computeVertexNormals();
  return g;
}

// Roblox's Neon: unlit, and brighter than the colour it's given.
function neon(colour, opacity = 1) {
  return new MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: DoubleSide });
}
const toColour = (c) => c.map((v) => v / 255);
const mixRgb = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const opacityOf = (transparency) => Math.max(0, Math.min(1, 1 - transparency));

// ─── What every effect reads ────────────────────────────────────────────

function fieldsOf(node) {
  const P = v3(node.POSITION);
  const A = v3(node['ALT POSITION']);
  const R = v3(node.ROTATION);
  const AR = node['ALT ROTATION'] != null && node['ALT ROTATION'] !== '' ? v3(node['ALT ROTATION']) : R;
  const size = num(node.SIZE, 1);
  return {
    P,
    A,
    R,
    AR,
    moving: !isZero(A),
    time: num(node.TIME, 1),
    size,
    altSize: size * num(node['ALT SIZE'], 1),
    amount: num(node.AMOUNT, 1),
    colour: rgb(node.COLOR),
    altColour: rgb(node['ALT COLOR'] ?? node.COLOR),
    opacity: num(node.OPACITY, 0),
    altOpacity: num(node['ALT OPACITY'], 0),
    style: node['EASING STYLE'] || 'Linear',
    direction: node['EASING DIRECTION'] || 'In',
    // CFrame.new(-x, y, -z), as getPos does, and the orientations.
    pos: cfPos(-P[0], P[1], -P[2]),
    alt: cfPos(-A[0], A[1], -A[2]),
    rot: cfOrient(...R),
    altRot: cfOrient(...AR),
    // A weld's C0 in raw axes (Slash, Whirl Slash, the energies).
    rawPos: cfPos(...P),
    rawAlt: cfPos(...A),
  };
}

/**
 * The frame an effect hangs from: the body part (or, with a PROJECTILE TAG,
 * the projectile), and how far through its tweens it is.
 */
function anchorOf(e, ctx, f) {
  const part = e.node['BODY PART'] || 'HumanoidRootPart';
  const at = e.shot != null ? (t) => ctx.shotFrameAt(e.shot, t) : (t) => ctx.frameAt(e.who, part, t);
  const t0 = e.t;
  const k = (t) => tweenAt(t - t0, f.time, f.style, f.direction);
  return { part, at, t0, k };
}

/**
 * An Attachment placed at part · pos · rot: welded (follows) with ALT
 * POSITION 0, else tweened in the world to part · pos · alt · altRot.
 */
function attachmentFrame(a, f, extra = new Matrix4(), extraEnd = new Matrix4()) {
  if (!f.moving) return (t) => mul(a.at(t), f.pos, f.rot, extra);
  const start = mul(a.at(a.t0), f.pos, f.rot, extra);
  const end = mul(a.at(a.t0), f.pos, f.alt, f.altRot, extraEnd);
  return (t) => cfLerp(start, end, a.k(t));
}

/** The standard changes BuilderFX makes to a template's emitter. */
function standard(props, f, { lifetime = true } = {}) {
  return {
    Color: cseq2(f.colour, f.altColour),
    ...(lifetime ? { Lifetime: [f.time, f.time] } : {}),
    Transparency: seq2(f.opacity, f.altOpacity),
    Size: sizeSequence(props.Size, f.size, f.altSize / (f.size || 1)),
  };
}

function base(e, ctx, until) {
  const objects = [];
  const emitters = [];
  const ribbons = [];
  const add = (o) => {
    ctx.group.add(o);
    objects.push(o);
    return o;
  };
  let serial = 0;
  const emitter = (node, overrides, holder, { scale = 1 } = {}) => {
    const props = { ...node.props, ...overrides };
    const em = new Emitter(props, {
      holder,
      seed: (e.id + 1) * 131 + serial++ * 7919,
      scale,
      texture: ctx.texture(assetId(props.Texture)),
    });
    add(em.mesh);
    emitters.push(em);
    return em;
  };
  const ribbon = (r) => {
    add(r.mesh);
    ribbons.push(r);
    return r;
  };
  // When it's gone: TIME, or sooner if a Cancel removes it (setUntil).
  let end = until;
  return {
    objects,
    emitters,
    add,
    emitter,
    ribbon,
    until,
    setUntil(t) {
      end = t;
    },
    // Called by each effect's own update first.
    step(t, camera) {
      const on = t >= e.t && t < end;
      for (const o of objects) o.visible = on;
      if (!on) return false;
      for (const em of emitters) em.update(t, camera);
      for (const r of ribbons) r.update(t, camera);
      return true;
    },
    update(t, camera) {
      this.step(t, camera);
    },
    dispose() {
      for (const o of objects) {
        ctx.group.remove(o);
        if (o.material && !o.userData.shared) o.material.dispose?.();
      }
      for (const em of emitters) em.dispose();
      for (const r of ribbons) r.dispose();
    },
  };
}

// A part drawn from a template or made up: geometry in its own Roblox axes,
// placed by a matrix that includes its size.
function partMesh(fx, geometry, colour, opacity) {
  const m = fx.add(new Mesh(geometry, neon(toColour(colour), opacity)));
  m.matrixAutoUpdate = false;
  return m;
}
function place(mesh, frame, size) {
  mesh.matrix.copy(frame).multiply(new Matrix4().makeScale(...size.map((s) => (Math.abs(s) < 1e-4 ? 1e-4 : s))));
  mesh.matrixWorldNeedsUpdate = true;
}

// ─── The effects ────────────────────────────────────────────────────────

// One template emitter on an attachment, emitted once (Ring, Sparks…).
const SINGLE = {
  Ring: { path: 'Utils.Itadori.CounterHit.Feint.Ring', bright: true },
  Sparks: { path: 'Utils.Itadori.CounterHit.Feint.Sparks', bright: true, speedBySize: true },
  Star: { path: 'Utils.Itadori.CounterHit.Feint.Star', bright: true },
  'Energy Sparks': { path: 'Utils.Hakari.RoughHit.Sparks', speedBySize: true },
  '360 Wind': { path: 'Utils.Hakari.RoughHit.Wind' },
  'Circle Glow': { path: 'Utils.Hakari.RoughHit.Glow' },
  Beams: { path: 'Utils.Hakari.RoughHit.Wind2' },
  'Star Outline': { path: 'Utils.Hakari.Indicators.BallFire.Ring' },
  'Wind Ring': { path: 'Utils.Hakari.Indicators.BallFire.Wind', speed: [0.01, 0.01] },
};

function singleEmitter(e, ctx, spec) {
  const node = tpl(spec.path);
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  if (!node) return fx;
  const a = anchorOf(e, ctx, f);
  const holder = { frame: attachmentFrame(a, f), size: null };
  const over = standard(node.props, f);
  if (spec.bright) Object.assign(over, { LightEmission: 0, LightInfluence: 0, Brightness: 4 });
  if (spec.speedBySize) over.Speed = (node.props.Speed ?? [5, 5]).map((s) => s * f.size);
  if (spec.speed) over.Speed = spec.speed;
  fx.emitter(node, over, holder).emit(e.t, f.amount);
  return fx;
}

// Attachment templates cloned whole (Wind Streak, Wind Expand, Shine, Clash).
function attachmentTemplate(e, ctx, path, { extra, emits, all = false, only }) {
  const root = tpl(path);
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const holder = { frame: attachmentFrame(a, f, extra ?? new Matrix4()), size: null };
  for (const em of childrenOf(root, 'ParticleEmitter')) {
    if (only && !only.includes(em.name)) continue;
    const over = all || !only || only.includes(em.name) ? standard(em.props, f) : {};
    const n = emits(em, f);
    fx.emitter(em, over, holder).emit(e.t, n);
  }
  return fx;
}

// A template Part holding emitters (Black Flash, Weak Lightning, Cleave,
// Burst, Mass Hit): where the part is at t.
function partTemplate(e, ctx, f, a, { follows }) {
  const start = mul(a.at(a.t0), f.pos, f.rot);
  if (!f.moving && follows) return (t) => mul(a.at(t), f.pos, f.rot);
  if (!f.moving) return () => start;
  const end = mul(a.at(a.t0), f.pos, f.alt, f.altRot);
  return (t) => cfLerp(start, end, a.k(t));
}

function pointLight(fx, colour, range, brightness) {
  const light = new PointLight();
  light.color.setRGB(...toColour(colour));
  light.distance = range;
  light.decay = 1;
  light.intensity = brightness;
  return fx.add(light);
}

const MAKERS = {
  ...Object.fromEntries(Object.entries(SINGLE).map(([k, spec]) => [k, (e, ctx) => singleEmitter(e, ctx, spec)])),

  'Wind Streak': (e, ctx) =>
    attachmentTemplate(e, ctx, 'Utils.Itadori.RushWind.Dash1', { emits: (_, f) => f.amount }),

  // The extra quarter turn is only on where it starts (BuilderFX's own quirk).
  'Wind Expand': (e, ctx) =>
    attachmentTemplate(e, ctx, 'Utils.Megumi.Mahoraga.RitualStart.Attachment', {
      extra: cfOrient(0, 0, 90),
      all: true,
      emits: (_, f) => f.amount,
    }),

  Shine: (e, ctx) =>
    attachmentTemplate(e, ctx, 'Utils.Megumi.Mahoraga.Cursed.Shine', {
      extra: cfPos(0, -2, 0),
      only: ['Shine'],
      emits: (_, f) => f.amount,
    }),

  Clash: (e, ctx) =>
    attachmentTemplate(e, ctx, 'Utils.Misc.Items.Clash.Attachment', {
      all: true,
      emits: (em, f) => num(em.attrs?.EmitCount, 0) * f.amount,
    }),

  'Black Flash': (e, ctx) => {
    const root = tpl('Utils.Itadori.DivergentFist.BlackFlashHit');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + 0.8 * f.time);
    if (!root) return fx;
    const a = anchorOf(e, ctx, f);
    const frame = partTemplate(e, ctx, f, a, { follows: false });
    const holder = { frame, size: root.props.Size };
    const counts = { Blast: 8, Sparks: 15, Lightning: 6, Wind: 7 };
    for (const em of childrenOf(root, 'ParticleEmitter')) {
      const life = em.props.Lifetime ?? [1, 1];
      const over = {
        Lifetime: life.map((x) => x * f.time),
        Size: sizeSequence(em.props.Size, f.size, f.altSize / (f.size || 1)),
      };
      if (em.name !== 'Wind') Object.assign(over, { Color: cseq2(f.colour, f.altColour), Transparency: seq2(f.opacity, f.altOpacity) });
      fx.emitter(em, over, holder).emit(e.t, (counts[em.name] ?? 0) * f.amount);
    }
    const lightNode = child(root, 'PointLight');
    const light = lightNode && pointLight(fx, f.colour, (lightNode.props.Range ?? 9) * f.size, lightNode.props.Brightness ?? 15);
    return {
      ...fx,
      update(t, camera) {
        if (!fx.step(t, camera)) return;
        if (light) {
          const k = tweenAt(t - e.t, 1, f.style, f.direction);
          light.position.setFromMatrixPosition(frame(t));
          light.intensity = (lightNode.props.Brightness ?? 15) * (1 - k) * 0.2;
          light.distance = (lightNode.props.Range ?? 9) * (f.size + (f.altSize - f.size) * k);
          light.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, k)));
        }
      },
    };
  },

  'Weak Lightning': (e, ctx) => {
    const root = tpl('Utils.Megumi.NueShock');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    if (!root) return fx;
    const a = anchorOf(e, ctx, f);
    const frame = partTemplate(e, ctx, f, a, { follows: true });
    const holder = { frame, size: root.props.Size };
    const electric = child(root, 'Electric');
    if (electric) {
      const em = fx.emitter(electric, standard(electric.props, f), holder);
      // Rate 20 × AMOUNT, tweened to 0 over TIME.
      em.run(e.t, e.t + f.time, (t) => 20 * f.amount * (1 - tweenAt(t - e.t, f.time, f.style, f.direction)));
    }
    return fx;
  },

  Cleave: (e, ctx) => {
    const root = tpl('Utils.Itadori.MalevolantShrine.Hit');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    if (!root) return fx;
    const a = anchorOf(e, ctx, f);
    const frame = partTemplate(e, ctx, f, a, { follows: false });
    const holder = { frame, size: root.props.Size };
    for (const name of ['Slash1', 'Slash2']) {
      const em = child(root, name);
      if (!em) continue;
      const over = standard(em.props, f);
      if (f.moving) over.LockedToPart = true;
      fx.emitter(em, over, holder).emit(e.t, f.amount);
    }
    return fx;
  },

  Burst: (e, ctx) => {
    const root = tpl('Utils.DashCancel');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    if (!root) return fx;
    const a = anchorOf(e, ctx, f);
    // Welded by a Motor6D (C0 = pos, C1 = rot) when it doesn't move; C0
    // tweens to pos · alt, C1 to the alt rotation.
    let frame;
    if (!f.moving) {
      frame = (t) => {
        const k = a.k(t);
        return mul(a.at(t), cfLerp(f.pos, mul(f.pos, f.alt), k), cfLerp(f.rot, f.altRot, k).invert());
      };
    } else frame = partTemplate(e, ctx, f, a, { follows: false });
    const scale = f.size; // Model:ScaleTo(SIZE)
    const holder = { frame, size: (root.props.Size ?? [1, 1, 1]).map((s) => s * scale) };
    const counts = { Burst: 8, Sparks: 20 };
    for (const em of childrenOf(root, 'ParticleEmitter')) {
      const over = { ...standard(em.props, f), LockedToPart: true };
      fx.emitter(em, over, holder, { scale }).emit(e.t, (counts[em.name] ?? 0) * f.amount);
    }
    return fx;
  },

  'Mass Hit': (e, ctx) => {
    const root = tpl('Utils.Yuki.MassHit');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    if (!root) return fx;
    const a = anchorOf(e, ctx, f);
    const hrp = a.at(a.t0);
    const from = new Vector3().setFromMatrixPosition(mul(hrp, f.pos));
    const to = new Vector3().setFromMatrixPosition(mul(hrp, f.pos, f.alt));
    let frame = hrp;
    if (isZero(f.P) === false || f.moving) {
      const look = new Matrix4().lookAt(from, to.distanceTo(from) > 1e-4 ? to : from.clone().add(new Vector3(0, 0, -1)), new Vector3(0, 1, 0));
      frame = look.setPosition(from);
    }
    for (const att of childrenOf(root, 'Attachment')) {
      const local = cfComponents(att.props.CFrame);
      const holder = { frame: () => mul(frame, local), size: null };
      for (const em of childrenOf(att, 'ParticleEmitter'))
        fx.emitter(em, standard(em.props, f), holder).emit(e.t, num(em.attrs?.EmitCount, 0) * f.amount);
    }
    return fx;
  },

  Flames: (e, ctx) => {
    const node = tpl('Utils.Damage.Flames');
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time + 2);
    if (!node) return fx;
    const part = e.node['BODY PART'] || 'HumanoidRootPart';
    // On a projectile: one emitter in its part. On the root part: every body
    // part. Otherwise the one.
    const parts =
      e.shot != null
        ? [{ name: null, size: ctx.shotSize(e.shot) }]
        : part === 'HumanoidRootPart'
          ? ctx.bodyParts(e.who)
          : [ctx.bodyParts(e.who).find((p) => p.name === part)].filter(Boolean);
    for (const p of parts) {
      const over = {
        Color: cseq2(f.colour, f.altColour),
        Transparency: seq2(f.opacity, f.altOpacity),
        Size: [
          [0, f.size, 0],
          [1, f.size, 0],
        ],
      };
      const holder = {
        frame: e.shot != null ? (t) => ctx.shotFrameAt(e.shot, t) : (t) => ctx.frameAt(e.who, p.name, t),
        size: p.size,
      };
      fx.emitter(node, over, holder).run(e.t, e.t + f.time, () => (node.props.Rate ?? 10) * f.amount);
    }
    return fx;
  },

  // Parts: a Ball (or Block, Wedge, Cylinder) sized SIZE, tweened.
  Sphere: (e, ctx) => shape(e, ctx, 'Ball'),
  Block: (e, ctx) => shape(e, ctx, 'Block'),
  Wedge: (e, ctx) => shape(e, ctx, 'Wedge'),
  Cylinder: (e, ctx) => shape(e, ctx, 'Cylinder'),
  Mesh: (e, ctx) => shape(e, ctx, 'Mesh'),
  Distortion: (e, ctx) => shape(e, ctx, 'Distortion'),

  Beam: (e, ctx) => {
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    const a = anchorOf(e, ctx, f);
    const model = ctx.mesh('14425625600');
    const mesh = partMesh(fx, UNIT.Block, f.colour, opacityOf(f.opacity));
    const startWorld = mul(a.at(a.t0), f.pos, f.rot);
    const endWorld = mul(a.at(a.t0), f.pos, f.alt, f.altRot);
    const p0 = new Vector3().setFromMatrixPosition(startWorld);
    const p1 = new Vector3().setFromMatrixPosition(endWorld);
    const length = p0.distanceTo(p1);
    // CFrame.lookAt(start, end) · CFrame.new(0, 0, -length / 2)
    const look = new Matrix4().lookAt(p0, length > 1e-4 ? p1 : p0.clone().add(new Vector3(0, 0, -1)), new Vector3(0, 1, 0)).setPosition(p0);
    const placed = mul(look, cfPos(0, 0, -length / 2));
    // Welded (so it follows) when ALT POSITION is 0, which makes it 0 long.
    const local = mul(f.pos, f.rot);
    return {
      ...fx,
      update(t, camera) {
        if (!fx.step(t, camera)) return;
        const k = a.k(t);
        if (model.geometry && mesh.geometry !== model.geometry) mesh.geometry = model.geometry;
        const s = f.size + (f.altSize - f.size) * k;
        const frame = f.moving ? placed : mul(a.at(t), local);
        const g = model.geometry?.boundingBox;
        const meshSize = g ? g.getSize(new Vector3()).toArray() : [1, 1, 1];
        place(mesh, frame, [s, s, Math.max(length, 0.001)].map((v, i) => (model.geometry ? v / (meshSize[i] || 1) : v)));
        mesh.material.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, k)));
        mesh.material.opacity = opacityOf(f.opacity + (f.altOpacity - f.opacity) * k);
      },
    };
  },

  Light: (e, ctx) => {
    const f = fieldsOf(e.node);
    const fx = base(e, ctx, e.t + f.time);
    const a = anchorOf(e, ctx, f);
    const frame = attachmentFrame(a, f);
    const light = pointLight(fx, f.colour, f.size, f.opacity);
    return {
      ...fx,
      update(t, camera) {
        if (!fx.step(t, camera)) return;
        const k = a.k(t);
        light.position.setFromMatrixPosition(frame(t));
        // Roblox's lights are tone-mapped; here a brightness of 1 is a
        // gentle light, so 10 brightens without washing everything out.
        light.intensity = Math.max(0, f.opacity + (f.altOpacity - f.opacity) * k) * 0.12;
        light.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, k)));
      },
    };
  },

  Slash: (e, ctx) => slash(e, ctx),
  'Whirl Slash': (e, ctx) => whirl(e, ctx),
  'Melee Trail': (e, ctx) => meleeTrail(e, ctx),
  'Rough Energy': (e, ctx) => energy(e, ctx, 'Utils.Hakari.RoughEnergy'),
  'Cursed Energy': (e, ctx) => energy(e, ctx, 'Utils.Itadori.DivergentFist.DivergentFist'),
  Glow: (e, ctx) => glow(e, ctx, false),
  Afterimage: (e, ctx) => glow(e, ctx, true),
  Afterimage2: (e, ctx) => afterimage2(e, ctx),
  Dismantle: (e, ctx) => dismantle(e, ctx),
  Billboard: (e, ctx) => billboard(e, ctx),
};

/** Makes the effect for a VISUAL or PARTICLE event, or null if it draws nothing in the world. */
export function makeEffect(e, ctx) {
  if (e.kind === 'PARTICLE') return particleNode(e, ctx);
  const maker = MAKERS[e.node?.EFFECT];
  return maker ? maker(e, ctx) : null;
}

// ─── PARTICLE nodes: JJS's customParticle (HandicapController) ──────────

// "1, 0.5, 0" → keypoints spread evenly from 0 to 1.
function evenSeq(text, d = 0) {
  const values = String(text ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return [[0, d, 0], [1, d, 0]];
  if (values.length === 1) return [[0, values[0], 0], [1, values[0], 0]];
  return values.map((v, i) => [i / (values.length - 1), v, 0]);
}
// "255,255,255 0,0,0" → colours spread evenly.
function evenColours(text) {
  const colours = String(text ?? '')
    .split(' ')
    .map((s) => s.split(',').map((c) => Number(c.trim())))
    .filter((c) => c.length >= 3 && c.slice(0, 3).every(Number.isFinite))
    .map((c) => c.slice(0, 3).map((v) => Math.max(0, Math.min(255, v))));
  if (!colours.length) return [[0, [255, 255, 255]], [1, [255, 255, 255]]];
  if (colours.length === 1) return [[0, colours[0]], [1, colours[0]]];
  return colours.map((c, i) => [i / (colours.length - 1), c]);
}
function numRange(text) {
  const [a, b] = String(text ?? '')
    .split(',')
    .map((s) => Number(s.trim()));
  const lo = Number.isFinite(a) ? a : 0;
  const hi = Number.isFinite(b) ? b : lo;
  return lo > hi ? [hi, lo] : [lo, hi];
}
const ORIENTATIONS = ['FacingCamera', 'FacingCameraWorldUp', 'VelocityParallel', 'VelocityPerpendicular'];
const FACES = ['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right'];

function particleNode(e, ctx) {
  const n = e.node;
  if (n.CANCEL === true) return null;
  const part = n['BODY PART'] || 'HumanoidRootPart';
  // No such body part: the attachment has no parent and nothing shows.
  if (e.shot == null && !ctx.hasPart(e.who, part)) return null;
  const P = v3(n.POSITION);
  const partSize = v3(n['PART SIZE']);
  const count = Math.max(0, num(n['EMIT COUNT'], 0));
  const duration = Math.max(0, num(n.DURATION, 0));
  const life = numRange(n.LIFETIME);
  const fx = base(e, ctx, e.t + duration + life[1] + 1);
  // An Attachment at (-x, y, -z) on the part, or a Part that size welded
  // there: either way it moves with the part.
  const at = e.shot != null ? (t) => ctx.shotFrameAt(e.shot, t) : (t) => ctx.frameAt(e.who, part, t);
  const offset = cfPos(-P[0], P[1], -P[2]);
  const holder = { frame: (t) => mul(at(t), offset), size: isZero(partSize) ? null : partSize };
  const spread = v3(n['SPREAD ANGLE']);
  const flip = evenSeq(n['FLIPBOOK SIZE']);
  const fx0 = flip[0][1];
  const fy0 = flip[flip.length - 1][1];
  const props = {
    Texture: num(n.TEXTURE, 0) ? `rbxassetid://${num(n.TEXTURE, 0)}` : '',
    Rate: num(n.RATE, 0),
    Color: evenColours(n.COLOR),
    Transparency: evenSeq(n.TRANSPARENCY),
    Squash: evenSeq(n.SQUASH),
    Size: evenSeq(n.SIZE, 1),
    Lifetime: life,
    Speed: numRange(n.SPEED),
    Rotation: numRange(n.ROTATION),
    RotSpeed: numRange(n['ROT SPEED']),
    SpreadAngle: [spread[0], spread[1]],
    Acceleration: v3(n.ACCELERATION),
    Drag: num(n.DRAG, 0),
    LightEmission: num(n['LIGHT EMISSION'], 0),
    LightInfluence: num(n['LIGHT INFLUENCE'], 1),
    ZOffset: num(n.ZOFFSET, 0),
    LockedToPart: n['LOCK TO PART'] === true,
    Orientation: ORIENTATIONS.includes(n['ORIENTATION TYPE']) ? n['ORIENTATION TYPE'] : 'FacingCamera',
    EmissionDirection: FACES.includes(n['EMISSION DIRECTION']) ? n['EMISSION DIRECTION'] : 'Front',
    Shape: n.SHAPE || 'Box',
    ShapeInOut: n['SHAPE INOUT'] || 'Outward',
    FlipbookLayout: fx0 > 0 && fy0 > 0 ? `Grid${Math.round(fx0)}x${Math.round(fy0)}` : 'None',
    FlipbookMode: n['FLIPBOOK MODE'] || 'OneShot',
    FlipbookFramerate: numRange(n['FLIPBOOK FRAMERATE']),
    // BRIGHTNESS isn't passed on by JJS: the emitter keeps Roblox's 1.
    Brightness: 1,
  };
  const em = fx.emitter({ props }, {}, holder);
  if (count > 0) em.emit(e.t, count);
  if (duration > 0) em.run(e.t, e.t + duration);
  return { ...fx, update: (t, camera) => fx.step(t, camera) };
}

// ─── Parts ──────────────────────────────────────────────────────────────

function shape(e, ctx, kind) {
  const n = e.node;
  const f = fieldsOf(n);
  const fx = base(e, ctx, e.t + f.time);
  const a = anchorOf(e, ctx, f);
  const axes = (text) => (text == null || String(text).trim() === '' ? [-1, -1, -1] : v3(text, [-1, -1, -1]));
  const unset = (v) => v.every((c) => c === -1);
  const size2 = axes(n['SIZE 2']);
  const altSize2 = axes(n['ALT SIZE 2']);
  const isMesh = kind === 'Mesh';
  const model = isMesh ? ctx.mesh(String(n.AMOUNT)) : kind === 'Distortion' ? ctx.mesh('4729380505') : null;
  const tex = isMesh && num(n.TEXTURE, 0) !== 0 ? ctx.texture(String(n.TEXTURE)) : null;
  const geometry = model ? UNIT.Ball : UNIT[kind] ?? UNIT.Ball;
  const mesh = partMesh(fx, geometry, f.colour, opacityOf(f.opacity));
  // Welded with C0 = pos · rot when it doesn't move; else it tweens its own
  // CFrame from where it started to start · pos · alt · alt rotation.
  const start = mul(a.at(a.t0), f.pos, f.rot);
  const end = f.moving ? mul(start, f.pos, f.alt, f.altRot) : null;
  // Distortion is Glass at Transparency 2 + OPACITY → 1 + ALT OPACITY.
  const fade = kind === 'Distortion' ? [2 + f.opacity, 1 + f.altOpacity] : [f.opacity, f.altOpacity];
  // With ALT SIZE 2 set, BuilderFX starts a second tween on the part for
  // Size alone. Both run to the end (checked in Studio): the part still
  // moves, fades and changes colour with the first, while its size follows
  // the second, to ALT SIZE 2, so it stretches about its middle as it goes.
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      const frame = end ? cfLerp(start, end, k) : mul(a.at(t), f.pos, f.rot);
      // Size: SIZE (or SIZE 2) → SIZE × ALT SIZE, or → ALT SIZE 2 when set.
      const from = unset(size2) ? [f.size, f.size, f.size] : size2;
      const to = unset(altSize2) ? [f.altSize, f.altSize, f.altSize] : altSize2;
      let size = from.map((v, i) => v + (to[i] - v) * k);
      if (model) {
        if (model.geometry && mesh.geometry !== model.geometry) mesh.geometry = model.geometry;
        // A mesh Roblox wouldn't hand over: a faint ball its size stands in,
        // so the effect is still seen (its mesh ID is in the node).
        mesh.visible = Boolean(model.geometry) || model.failed;
        // A MeshPart (Distortion) fits its mesh to its Size; a SpecialMesh
        // (Mesh) is the file's own units times Scale.
        if (kind === 'Distortion' && model.geometry) {
          const g = model.geometry.boundingBox.getSize(new Vector3());
          size = size.map((s, i) => s / ([g.x, g.y, g.z][i] || 1));
        }
      }
      place(mesh, frame, size);
      if (tex?.map && mesh.material.map !== tex.map) {
        mesh.material.map = tex.map;
        mesh.material.needsUpdate = true;
      }
      // A SpecialMesh's texture shows as is (VertexColor 1, 1, 1): the part's
      // colour only shows without one.
      if (tex?.map) mesh.material.color.setRGB(1, 1, 1);
      else mesh.material.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, k)));
      mesh.material.opacity = opacityOf(fade[0] + (fade[1] - fade[0]) * k) * (model?.failed && !model.geometry ? 0.3 : 1);
      mesh.material.depthWrite = mesh.material.opacity > 0.98;
    },
  };
}

// ─── Slash and Whirl Slash: welds in raw axes ───────────────────────────

// A weld: Part1 = Part0 · C0 · C1⁻¹.
const weld = (part0, c0, c1) => mul(part0, c0, c1.clone().invert());

function weldAnchor(e, ctx, f, a) {
  // With ALT POSITION set, Part0 becomes an anchored part where the body
  // part was when it spawned.
  const fixed = a.at(a.t0);
  return (t) => (f.moving ? fixed : a.at(t));
}

function slash(e, ctx) {
  const root = BFX('Slash');
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const part0 = weldAnchor(e, ctx, f, a);
  const halfTurn = cfAngles(0, Math.PI, 0);
  const c1From = mul(f.rot, halfTurn);
  const c1To = mul(f.altRot, halfTurn);
  const model = ctx.mesh('3188638000');
  const layers = [];
  for (const [partName, colour] of [
    ['Part1', f.colour],
    ['Part2', f.altColour],
  ]) {
    const partNode = child(root, partName);
    const meshNode = child(partNode, 'Mesh');
    const scale0 = meshNode?.props.Scale ?? [12, 1, 12];
    for (const decal of childrenOf(partNode, 'Decal')) {
      const tex = ctx.texture(assetId(decal.props.Texture));
      const m = fx.add(
        new Mesh(
          UNIT.Ball,
          new MeshBasicMaterial({ color: toColour(colour), transparent: true, depthWrite: false, side: DoubleSide, opacity: 0 }),
        ),
      );
      m.matrixAutoUpdate = false;
      layers.push({ m, tex, scale0 });
    }
  }
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      const c0 = cfLerp(f.rawPos, f.rawAlt, k);
      const c1 = cfLerp(c1From, c1To, k);
      const frame = weld(part0(t), c0, c1);
      const s = f.size + (f.altSize - f.size) * k;
      const opacity = opacityOf(f.opacity + (f.altOpacity - f.opacity) * k);
      for (const L of layers) {
        if (model.geometry && L.m.geometry !== model.geometry) L.m.geometry = model.geometry;
        L.m.visible = Boolean(model.geometry && L.tex?.map);
        if (L.tex?.map && L.m.material.map !== L.tex.map) {
          L.m.material.map = L.tex.map;
          L.m.material.needsUpdate = true;
        }
        L.m.material.opacity = opacity;
        place(L.m, frame, L.scale0.map((v) => v * s));
      }
    },
  };
}

function whirl(e, ctx) {
  const root = BFX('SlashWhirl');
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const part0 = weldAnchor(e, ctx, f, a);
  const halfTurn = cfAngles(0, Math.PI, 0);
  const c1From = mul(f.rot, halfTurn);
  const c1To = mul(f.altRot, halfTurn);
  const scale = f.size; // Model:ScaleTo(SIZE)
  const emitPart = (t) => {
    const k = a.k(t);
    return weld(part0(t), cfLerp(f.rawPos, f.rawAlt, k), cfLerp(c1From, c1To, k));
  };
  const scaled = (m) => {
    const out = m.clone();
    const p = new Vector3().setFromMatrixPosition(m).multiplyScalar(scale);
    return out.setPosition(p);
  };
  // SlashEmit's attachment, and SlashBeam (welded to SlashEmit, same place).
  const emitNode = child(root, 'SlashEmit');
  const emitAtt = child(emitNode, 'Attachment');
  const attFrame = (t) => mul(emitPart(t), scaled(cfComponents(emitAtt?.props.CFrame)));
  const timeScale = 1 / Math.max(0.01, f.time);
  for (const em of childrenOf(emitAtt, 'ParticleEmitter')) {
    const over = { Color: cseq2(f.colour, f.altColour), Transparency: seq2(f.opacity, f.altOpacity), TimeScale: timeScale };
    fx.emitter(em, over, { frame: attFrame, size: null }, { scale }).emit(e.t, num(em.attrs?.EmitCount, 0));
  }
  // The beams: widths tween to 0 over TIME × 0.2, then they're switched off.
  const beamRoot = child(root, 'SlashBeam');
  const chain = (node, path = []) => {
    const out = [];
    for (const c of childrenOf(node, 'Attachment')) {
      const here = [...path, cfComponents(c.props.CFrame)];
      out.push({ node: c, path: here }, ...chain(c, here));
    }
    return out;
  };
  const atts = chain(beamRoot);
  const frameOf = (name, t) => {
    const found = atts.find((x) => x.node.name === name);
    return found ? mul(emitPart(t), ...found.path.map(scaled)) : emitPart(t);
  };
  const beamTime = f.time * 0.2;
  for (const { node } of atts)
    for (const b of childrenOf(node, 'Beam')) {
      const props = { ...b.props, Color: cseq2(f.colour, f.colour), Transparency: seq2(f.opacity, f.opacity) };
      const a0 = String(b.props.Attachment0 ?? '').split('.').pop();
      const a1 = String(b.props.Attachment1 ?? '').split('.').pop();
      fx.ribbon(
        new Beam(props, ctx.texture(assetId(b.props.Texture)), {
          ends: (t) => [frameOf(a0, t), frameOf(a1, t)],
          width: (t) => {
            const k = 1 - tweenAt(t - e.t, beamTime, ...TWEEN_DEFAULT);
            return [(b.props.Width0 ?? 1) * k, (b.props.Width1 ?? 1) * k];
          },
          on: (t) => t - e.t < beamTime,
          scale,
        }),
      );
    }
  return { ...fx, update: (t, camera) => fx.step(t, camera) };
}

// ─── Trails ─────────────────────────────────────────────────────────────

function meleeTrail(e, ctx) {
  const root = tpl('Utils.Damage.CombatTrail');
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time + 0.2);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const part0 = weldAnchor(e, ctx, f, a);
  const partSize = ctx.partSize(e.who, a.part);
  const trailNode = child(root, 'Trail');
  const atts = childrenOf(root, 'Attachment').map((x) => cfComponents(x.props.CFrame));
  // The part: C0 = pos · rot, tweened to pos · alt · alt rotation.
  const c0At = (t) => {
    const k = a.k(t);
    return cfLerp(mul(f.pos, f.rot), mul(f.pos, f.alt, f.altRot), k);
  };
  const partAt = (t) => weld(part0(t), c0At(t), new Matrix4());
  const box = partMesh(fx, UNIT.Block, f.colour, opacityOf(0.7));
  if (trailNode) {
    const props = {
      ...trailNode.props,
      Color: cseq2(f.colour, f.altColour),
      Transparency: seq2(f.opacity, f.altOpacity),
    };
    fx.ribbon(
      new Trail(props, ctx.texture(assetId(trailNode.props.Texture)), {
        ends: (t) => atts.slice(0, 2).map((m) => new Vector3().setFromMatrixPosition(mul(partAt(t), m))),
        from: e.t,
        until: e.t + f.time,
        widthScale: sizeSequence(trailNode.props.WidthScale, f.size, f.altSize / (f.size || 1)),
      }),
    );
  }
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      const s = f.size + (f.altSize - f.size) * k;
      place(box, partAt(t), partSize.map((v) => v * 1.1 * s));
      box.material.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, k)));
      // The part tweens from the template's 0.7 to ALT OPACITY, then fades
      // out over 0.1 s once the trail stops.
      let transparency = 0.7 + (f.altOpacity - 0.7) * k;
      if (t > e.t + f.time) transparency += (1 - transparency) * Math.min(1, (t - e.t - f.time) / 0.1);
      box.material.opacity = opacityOf(transparency);
    },
  };
}

function energy(e, ctx, path) {
  const root = tpl(path);
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time + 2);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  // Welded to the body part at C0 = POSITION (raw axes).
  const partAt = (t) => mul(a.at(t), f.rawPos);
  const core = child(root, 'Core');
  const coreAt = (t) => mul(partAt(t), cfComponents(core?.props.CFrame));
  const off = e.t + f.time * 0.8;
  for (const em of childrenOf(core, 'ParticleEmitter')) {
    const over = { Color: cseq2(f.colour, f.altColour), Transparency: seq2(f.opacity, f.altOpacity), Size: sizeSequence(em.props.Size, f.size, f.altSize / (f.size || 1)) };
    fx.emitter(em, over, { frame: coreAt, size: null }).run(e.t, off);
  }
  const trail = child(root, 'Trail');
  if (trail) {
    const a0 = cfComponents(child(root, 'A0')?.props.CFrame);
    const a1 = cfComponents(child(root, 'A1')?.props.CFrame);
    const props = { ...trail.props, Color: cseq2(f.colour, f.altColour), Transparency: seq2(f.opacity, f.altOpacity) };
    fx.ribbon(
      new Trail(props, ctx.texture(assetId(trail.props.Texture)), {
        ends: (t) => [a0, a1].map((m) => new Vector3().setFromMatrixPosition(mul(partAt(t), m))),
        from: e.t,
        until: off + f.time * 0.05,
        widthScale: sizeSequence(trail.props.WidthScale, f.size, f.altSize / (f.size || 1)),
      }),
    );
  }
  return { ...fx, update: (t, camera) => fx.step(t, camera) };
}

function dismantle(e, ctx) {
  const root = tpl('Utils.Itadori.Dismantle.DismantleFly');
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time + 0.05);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const hrp = a.at(a.t0);
  const from = new Vector3().setFromMatrixPosition(mul(hrp, f.pos, f.rot));
  const endCf = mul(hrp, f.pos, f.alt, f.altRot);
  const to = new Vector3().setFromMatrixPosition(endCf);
  const look = new Matrix4().lookAt(from, to.distanceTo(from) > 1e-4 ? to : from.clone().add(new Vector3(0, 0, -1)), new Vector3(0, 1, 0)).setPosition(from);
  const startCf = mul(look, f.rot);
  const moved = startCf.clone().setPosition(to);
  const model = ctx.mesh(assetId(root.props.MeshId));
  const mesh = partMesh(fx, UNIT.Block, f.colour, 1);
  const size0 = root.props.Size ?? [2, 0.4, 35];
  const meshSize = root.props.MeshSize ?? [50, 2.2, 18.4];
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      if (model.geometry && mesh.geometry !== model.geometry) mesh.geometry = model.geometry;
      mesh.visible = Boolean(model.geometry) && t < e.t + f.time;
      // Size × SIZE → (15, 0, 0) × SIZE × ALT SIZE, flying to the end.
      const s0 = size0.map((v) => v * f.size);
      const s1 = [15 * f.altSize, 0, 0];
      const size = s0.map((v, i) => v + (s1[i] - v) * k);
      place(mesh, cfLerp(startCf, moved, k), size.map((v, i) => v / (meshSize[i] || 1)));
      mesh.material.color.setRGB(...toColour(f.colour));
      mesh.material.opacity = opacityOf(0 + (f.altOpacity - 0) * k);
    },
  };
}

// ─── Glow, Afterimage, Afterimage2 ──────────────────────────────────────

function glow(e, ctx, afterimage) {
  const root = tpl('Utils.Damage.HitGlow');
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  if (!root) return fx;
  const a = anchorOf(e, ctx, f);
  const bodyPart = a.part;
  const scale = afterimage ? f.size : 1.1 * f.size; // Model:ScaleTo
  const altScale = afterimage ? f.altSize : 1.1 * f.altSize;
  const hrp0 = ctx.frameAt(e.who, 'HumanoidRootPart', e.t);
  const hrpRot = rotationOf(hrp0);
  const parts = [];
  for (const p of childrenOf(root).filter((c) => c.class === 'Part' || c.class === 'MeshPart')) {
    // Afterimage on one body part: just that part, at it.
    const onPart = bodyPart !== 'HumanoidRootPart';
    const target = afterimage && onPart ? bodyPart : p.name;
    if (!ctx.hasPart(e.who, target)) continue;
    const coloured = !onPart || p.name === bodyPart || (afterimage && onPart);
    const geometry = p.class === 'MeshPart' ? ctx.bodyGeometry('Head') : UNIT.Block;
    const size = p.class === 'MeshPart' ? [1.2, 1.2, 1.2] : p.props.Size ?? [1, 2, 1];
    const mesh = partMesh(fx, geometry, f.colour, coloured ? opacityOf(f.opacity) : 0);
    let frameAt;
    if (afterimage) {
      // Anchored at the part, moved by POSITION in the root's axes, then
      // tweened by ALT POSITION (in the root's axes) and ALT ROTATION.
      const src = ctx.frameAt(e.who, target, e.t);
      const shift = new Vector3(...f.P).applyMatrix4(hrpRot);
      const start = src.clone().setPosition(new Vector3().setFromMatrixPosition(src).add(shift));
      const endPos = new Vector3().setFromMatrixPosition(start).add(new Vector3(...f.A).applyMatrix4(hrpRot));
      const end = mul(start, cfOrient(...v3(e.node['ALT ROTATION']))).setPosition(endPos);
      frameAt = (t) => cfLerp(start, end, a.k(t));
    } else if (!f.moving) frameAt = (t) => ctx.frameAt(e.who, p.name, t);
    else {
      // Anchored at part · CFrame.new(ALT POSITION), then the model pivots
      // (on its Torso) to root · pos · alt · alt rotation.
      const start = mul(ctx.frameAt(e.who, p.name, e.t), cfPos(...f.A));
      const torso0 = mul(ctx.frameAt(e.who, 'Torso', e.t), cfPos(...f.A));
      const pivotEnd = mul(hrp0, f.pos, f.alt, f.altRot);
      const rel = mul(torso0.clone().invert(), start);
      frameAt = (t) => mul(cfLerp(torso0, pivotEnd, a.k(t)), rel);
    }
    parts.push({ mesh, frameAt, size, coloured });
    if (afterimage && onPart) break;
  }
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      const s = scale + (altScale - scale) * k;
      const colour = toColour(mixRgb(f.colour, f.altColour, k));
      const opacity = opacityOf(f.opacity + (f.altOpacity - f.opacity) * k);
      for (const p of parts) {
        place(p.mesh, p.frameAt(t), p.size.map((v) => v * s));
        p.mesh.material.color.setRGB(...colour);
        p.mesh.material.opacity = p.coloured ? opacity : 0;
        p.mesh.material.depthWrite = false;
      }
    },
  };
}

function afterimage2(e, ctx) {
  const f = fieldsOf(e.node);
  const fx = base(e, ctx, e.t + f.time);
  const a = anchorOf(e, ctx, f);
  const hrpRot = rotationOf(ctx.frameAt(e.who, 'HumanoidRootPart', e.t));
  const clone = ctx.cloneBody(e.who);
  const parts = [];
  for (const [name, mesh] of Object.entries(clone)) {
    fx.add(mesh);
    mesh.matrixAutoUpdate = false;
    const src = ctx.meshFrameAt(e.who, name, e.t);
    const shift = new Vector3(...f.P).applyMatrix4(hrpRot);
    const start = src.clone().setPosition(new Vector3().setFromMatrixPosition(src).add(shift));
    const endPos = new Vector3().setFromMatrixPosition(start).add(new Vector3(...f.A).applyMatrix4(hrpRot));
    const end = mul(start, cfOrient(...v3(e.node['ALT ROTATION']))).setPosition(endPos);
    parts.push({ mesh, start, end });
  }
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const k = a.k(t);
      const s = f.size + (f.altSize - f.size) * k;
      const opacity = opacityOf(f.opacity + (f.altOpacity - f.opacity) * k);
      for (const p of parts) {
        p.mesh.matrix.copy(cfLerp(p.start, p.end, k)).multiply(new Matrix4().makeScale(s, s, s));
        p.mesh.matrixWorldNeedsUpdate = true;
        p.mesh.traverse((o) => {
          if (o.material) {
            o.material.transparent = true;
            o.material.opacity = opacity;
            o.material.depthWrite = opacity > 0.98;
          }
        });
      }
    },
  };
}

// ─── Billboard ──────────────────────────────────────────────────────────

function billboard(e, ctx) {
  const n = e.node;
  const f = fieldsOf(n);
  const fx = base(e, ctx, e.t + f.time);
  const id = num(n.TEXTURE, 0) || 14978581240;
  const tex = ctx.texture(String(id));
  const sprite = fx.add(new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 })));
  const k = (t) => tweenAt(t - e.t, f.time, f.style, f.direction);
  // A BillboardGui 15 × AMOUNT studs square on the root part (whatever BODY
  // PART says), its image 0.15 × SIZE of it, placed at x = -x/10 + 0.5,
  // y = -y/10 + 0.5, tweening to ((-x - ax)/10 + 0.5, (y + ay)/10 + 0.5).
  const gui = 15 * f.amount;
  const x0 = -f.P[0] / 10 + 0.5;
  const y0 = -f.P[1] / 10 + 0.5;
  const x1 = (-f.P[0] - f.A[0]) / 10 + 0.5;
  const y1 = (f.P[1] + f.A[1]) / 10 + 0.5;
  const z0 = -f.P[2];
  const z1 = -f.P[2] - f.A[2];
  return {
    ...fx,
    update(t, camera) {
      if (!fx.step(t, camera)) return;
      const q = k(t);
      if (tex?.map && sprite.material.map !== tex.map) {
        sprite.material.map = tex.map;
        sprite.material.needsUpdate = true;
      }
      sprite.visible = Boolean(tex?.map);
      const root = new Vector3().setFromMatrixPosition(ctx.frameAt(e.who, 'HumanoidRootPart', t));
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
      const x = x0 + (x1 - x0) * q;
      const y = y0 + (y1 - y0) * q;
      const z = z0 + (z1 - z0) * q; // StudsOffset z: towards the camera
      sprite.position
        .copy(root)
        .addScaledVector(right, (x - 0.5) * gui)
        .addScaledVector(up, (0.5 - y) * gui)
        .addScaledVector(back, z);
      const across = 0.15 * (f.size + (f.altSize - f.size) * q) * gui;
      sprite.scale.set(across, across, 1);
      sprite.material.color.setRGB(...toColour(mixRgb(f.colour, f.altColour, q)));
      sprite.material.opacity = opacityOf(f.opacity + (f.altOpacity - f.opacity) * q);
    },
  };
}

// ─── The screen: Screen Color, Overlay, Camera, Field of View, shakes ───

// JJS's CameraShaker presets: magnitude, roughness, fade in, fade out, and
// how much of it moves the view (x, y), from CameraShakePresets.
const SHAKES = {
  'Shake Light': [4, 7, 0.1, 0.75, 0.25],
  'Shake Medium': [6, 9.5, 0.1, 0.85, 0.325],
  'Shake Heavy': [8, 14, 0, 1.25, 0.5],
};

// Smooth noise in -1…1 for the shaker's math.noise.
function noise(x, y) {
  const h = (a, b) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return (a + (b - a) * v) * 0.7;
}

/**
 * What the screen of the one the effects run on (`who`) shows at t: the
 * ColorCorrection, Overlays, a Camera block's view, the field of view and
 * the shake. `frameAt` is the scene's body part lookup.
 */
export function screenAt(events, t, who, frameAt, cancelledAt = () => Infinity) {
  let grade = null;
  const overlays = [];
  let camera = null;
  let fov = 69;
  const shake = new Vector3();
  for (const e of events) {
    if (e.kind !== 'VISUAL' || e.who !== who || e.t > t) continue;
    const n = e.node;
    const f = fieldsOf(n);
    const age = t - e.t;
    const effect = n.EFFECT;
    if (effect === 'Field of View') {
      const goal = 69 + num(n.AMOUNT, 0);
      fov += (goal - fov) * tweenAt(age, f.time, f.style, f.direction);
      continue;
    }
    if (age >= f.time && !(effect in SHAKES)) continue;
    if (t >= cancelledAt(e)) continue;
    if (effect === 'Screen Color') {
      // A ColorCorrectionEffect: Brightness AMOUNT (not tweened),
      // Saturation OPACITY → ALT OPACITY, Contrast SIZE → SIZE × ALT SIZE,
      // TintColor COLOR → ALT COLOR, over TweenInfo.new(TIME): Quad Out.
      const k = tweenAt(age, f.time, ...TWEEN_DEFAULT);
      const g = {
        brightness: num(n.AMOUNT, 0),
        saturation: f.opacity + (f.altOpacity - f.opacity) * k,
        contrast: f.size + (f.altSize - f.size) * k,
        tint: mixRgb(f.colour, f.altColour, k).map((c) => c / 255),
      };
      // Several at once stack like Roblox's: tints multiply, the rest add.
      grade = grade
        ? {
            brightness: grade.brightness + g.brightness,
            saturation: grade.saturation + g.saturation,
            contrast: grade.contrast + g.contrast,
            tint: grade.tint.map((c, i) => c * g.tint[i]),
          }
        : g;
    } else if (effect === 'Overlay') {
      if (!num(n.TEXTURE, 0)) continue;
      const k = tweenAt(age, f.time, ...TWEEN_DEFAULT);
      overlays.push({
        texture: String(n.TEXTURE),
        size: f.size + (f.altSize - f.size) * k,
        colour: mixRgb(f.colour, f.altColour, k).map((c) => c / 255),
        opacity: opacityOf(f.opacity + (f.altOpacity - f.opacity) * k),
      });
    } else if (effect === 'Camera') {
      // The view is the body part's CFrame times pos · rot, lerped to
      // pos · alt · alt rotation when ALT POSITION is set.
      const part = n['BODY PART'] || 'HumanoidRootPart';
      const start = mul(f.pos, f.rot);
      const local = f.moving ? cfLerp(start, mul(f.pos, f.alt, f.altRot), tweenAt(age, f.time, f.style, f.direction)) : start;
      camera = mul(frameAt(e.who, part, t), local);
    } else if (effect in SHAKES) {
      const [magnitude, roughness, fadeIn, fadeOut, influence] = SHAKES[effect];
      const count = Math.max(0, Math.min(20, Math.round(num(n.AMOUNT, 1))));
      // Fades in, then straight out.
      const fade = fadeIn > 0 && age < fadeIn ? age / fadeIn : Math.max(0, 1 - (age - fadeIn) / fadeOut);
      if (fade <= 0) continue;
      for (let i = 0; i < count; i++) {
        const tick = (e.id * 17 + i * 31) % 200 - 100 + age * roughness;
        shake.x += noise(tick, 0) * 0.5 * magnitude * fade * influence;
        shake.y += noise(0, tick) * 0.5 * magnitude * fade * influence;
      }
    }
  }
  return { grade, overlays, camera, fov, shake };
}
