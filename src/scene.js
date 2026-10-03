// Arayashiki's 3D view: a Roblox R6 character and a training dummy in a
// training room, playing a simulated skill (core/sim.js).
//
// Everything is drawn from the simulation at a time t, so the view can be
// scrubbed as well as played: positions come from the sampled motion, and
// each effect is a function of time. VISUAL and PARTICLE nodes are drawn by
// src/fx/builderfx.js, a port of JJS's own BuilderFX and particle handler,
// with the game's own templates, meshes and textures. The screen effects
// (Screen Color, Overlay, Camera, Field of View, shakes) show on your screen,
// as they would on the screen of the one they run on.

import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Euler,
  EdgesGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  Object3D,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { StudioCamera } from './studio-camera.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { mountGizmo } from './view-gizmo.js';
import { keyFrom, keyMatrix } from './animator.js';
import { motionAt } from '../core/sim.js';
import { vec3 } from '../core/schema.js';
import R6 from './assets/r6.json';
import rigTextureUrl from './assets/r6-texture.png';
import { bakeRagdolls, ragdollFrame } from './ragdoll.js';
import { readRobloxMesh } from './rbxmesh.js';
import { addTemplateUVs, bodyColor, composeClothing, loadImage } from './clothing.js';
import { makeEffect, screenAt } from './fx/builderfx.js';
import { robloxFrame, tweenAt, v3 as nodeVec, num } from './fx/roblox.js';
import { autoTrack, keyOf, pathAt } from './camera-rig.js';

const RAD = Math.PI / 180;
// Where the camera starts: in front of you and off to your right, three
// quarters on, so both faces and the gap between the two read at once.
const HOME_CAMERA = [-13, 7, 11];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Roblox's default field of view (vertical, degrees).
const BASE_FOV = 70;
// R6 part sizes in studs.
export const PART_SIZES = {
  HumanoidRootPart: [2, 2, 1],
  Torso: [2, 2, 1],
  Head: [2, 1, 1],
  'Right Arm': [1, 2, 1],
  'Left Arm': [1, 2, 1],
  'Right Leg': [1, 2, 1],
  'Left Leg': [1, 2, 1],
};
const BODY = ['Head', 'Torso', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg'];
const HITBOX_COLOUR = '#ff4d4f';
const SHOT_COLOUR = '#ff9f1a';

// ─── The characters ─────────────────────────────────────────────────────

export function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#111';
  x.fillRect(20, 22, 6, 10);
  x.fillRect(38, 22, 6, 10);
  x.lineWidth = 4;
  x.strokeStyle = '#111';
  x.beginPath();
  x.arc(32, 34, 14, 0.2 * Math.PI, 0.8 * Math.PI);
  x.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// The classic R6 body (src/assets/r6.json: the real part meshes, exported
// from a Roblox R6 rig in Blender), in studs, facing +z. Each limb hangs from
// the joint Roblox's Motor6Ds use, so poses rotate it the way the game does;
// each mesh sits at its part's centre, where effects on a body part attach.
const JOINTS = {
  Head: [0, 4, 0], // neck
  Torso: [0, 0, 0],
  'Right Arm': [-1.5, 3.5, 0], // shoulders
  'Left Arm': [1.5, 3.5, 0],
  'Right Leg': [-0.5, 2, 0], // hips
  'Left Leg': [0.5, 2, 0],
};
// Two sets of UVs: the rig's own (for its labelled Studio texture, on the
// dummy and on you without an avatar) and the classic clothing template's.
const partGeometry = new Map();
function geometryOf(name, variant = 'rig') {
  const key = `${name}:${variant}`;
  if (!partGeometry.has(key)) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(R6[name].position, 3));
    g.setAttribute('normal', new Float32BufferAttribute(R6[name].normal, 3));
    g.computeBoundingBox();
    const centre = g.boundingBox.getCenter(new Vector3());
    g.translate(-centre.x, -centre.y, -centre.z);
    if (variant === 'rig' && R6[name].uv) g.setAttribute('uv', new Float32BufferAttribute(R6[name].uv, 2));
    else addTemplateUVs(g, name);
    partGeometry.set(key, { g, centre });
  }
  return partGeometry.get(key);
}

let rigTexture = null;
// Views to draw again once the rig's picture has loaded.
const onRigLoaded = new Set();
function rigMaterial() {
  if (!rigTexture) {
    rigTexture = new TextureLoader().load(rigTextureUrl, () => onRigLoaded.forEach((redraw) => redraw()));
    rigTexture.colorSpace = SRGBColorSpace;
    rigTexture.anisotropy = 4;
  }
  return new MeshLambertMaterial({ map: rigTexture, transparent: true });
}

export function buildCharacter(face, { textured = true, colours } = {}) {
  const root = new Group();
  const make = (name) => {
    const { g, centre } = geometryOf(name, 'rig');
    const [jx, jy, jz] = JOINTS[name];
    const pivot = new Group();
    pivot.position.set(jx, jy, jz);
    const material = textured ? rigMaterial() : new MeshLambertMaterial({ color: colours?.[name] ?? '#a3a2a5', transparent: true });
    const mesh = new Mesh(g, material);
    mesh.position.set(centre.x - jx, centre.y - jy, centre.z - jz);
    mesh.userData.part = name;
    pivot.add(mesh);
    return pivot;
  };
  const torsoPivot = make('Torso');
  const torso = torsoPivot.children[0];
  const head = make('Head');
  const headMesh = head.children[0];
  // The face: a decal on the front of the head, as Roblox draws it (the rig
  // texture has its own, so it's hidden until an avatar's face replaces it).
  const faceMesh = new Mesh(new PlaneGeometry(0.95, 0.95), new MeshBasicMaterial({ map: face, transparent: true }));
  faceMesh.position.set(0, headMesh.position.y, 0.605);
  faceMesh.visible = !textured;
  head.add(faceMesh);
  // "Right" is the character's own right: -x when facing +z.
  const rightArm = make('Right Arm');
  const leftArm = make('Left Arm');
  const rightLeg = make('Right Leg');
  const leftLeg = make('Left Leg');
  const body = new Group();
  body.add(torsoPivot, head, rightArm, leftArm, rightLeg, leftLeg);
  root.add(body);
  const parts = {
    HumanoidRootPart: torso,
    Torso: torso,
    Head: headMesh,
    'Right Arm': rightArm.children[0],
    'Left Arm': leftArm.children[0],
    'Right Leg': rightLeg.children[0],
    'Left Leg': leftLeg.children[0],
  };
  // The same six parts, loose, for when they're ragdolled (src/ragdoll.js
  // places them in the world, frame by frame).
  const ragdoll = { group: new Group(), meshes: {} };
  for (const name of BODY) {
    const source = parts[name];
    const mesh = new Mesh(source.geometry, source.material);
    mesh.userData.part = name;
    if (name === 'Head') {
      const decal = faceMesh.clone();
      decal.position.set(0, 0, 0.605);
      mesh.add(decal);
      ragdoll.face = decal;
    }
    ragdoll.meshes[name] = mesh;
    ragdoll.group.add(mesh);
  }
  ragdoll.group.visible = false;
  return { root, body, head, rightArm, leftArm, rightLeg, leftLeg, parts, torso, ragdoll, faceMesh };
}

// Stand-in poses for JJS's animations (they're not public): the same
// animation always gets the same one, so a skill reads consistently.
const POSES = [
  (r, w) => (r.rightArm.rotation.x = -1.6 * w), // right jab
  (r, w) => (r.leftArm.rotation.x = -1.6 * w), // left jab
  (r, w) => {
    r.rightLeg.rotation.x = -1.4 * w;
    r.body.rotation.x = 0.15 * w;
  }, // kick
  (r, w) => {
    r.rightArm.rotation.x = -2.8 * w;
    r.body.position.y = 0.4 * w;
  }, // uppercut
  (r, w, p) => (r.body.rotation.y = p * Math.PI * 2 * (w > 0 ? 1 : 0)), // spin
  (r, w) => {
    r.rightArm.rotation.z = 2.6 * w;
    r.leftArm.rotation.z = -2.6 * w;
  }, // arms up
  (r, w) => {
    r.body.rotation.x = 0.5 * w;
    r.rightArm.rotation.x = -0.8 * w;
    r.leftArm.rotation.x = -0.8 * w;
  }, // lunge
  (r, w) => {
    r.rightArm.rotation.x = -2.4 * w;
    r.leftArm.rotation.x = -2.4 * w;
    r.body.rotation.x = -0.2 * w;
  }, // overhead slam
];
function poseIndex(anim) {
  const key = Array.isArray(anim) ? anim.join(',') : String(anim ?? '');
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % POSES.length;
}

function resetPose(r) {
  for (const limb of [r.head, r.rightArm, r.leftArm, r.rightLeg, r.leftLeg]) limb.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  r.body.position.set(0, 0, 0);
}

// ─── Helpers ────────────────────────────────────────────────────────────

function textSprite(text, colour = '#fff', size = 1.4) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d');
  x.font = "600 64px 'IBM Plex Sans', system-ui, sans-serif";
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = 'rgba(0,0,0,0.85)';
  x.strokeText(text, 128, 50);
  x.fillStyle = colour;
  x.fillText(text, 128, 50);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(size * 2.6, size, 1);
  return s;
}

// The training room's floor: one tile is 5 studs, with a line every stud and
// a stronger one every 5, so distances can be read off the floor.
export function baseplateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#1d1d1d';
  x.fillRect(0, 0, 160, 160);
  x.strokeStyle = '#242424';
  x.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    x.beginPath();
    x.moveTo(i * 32, 0);
    x.lineTo(i * 32, 160);
    x.moveTo(0, i * 32);
    x.lineTo(160, i * 32);
    x.stroke();
  }
  x.strokeStyle = '#2f2f2f';
  x.lineWidth = 3;
  x.strokeRect(0, 0, 160, 160);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(512 / 5, 512 / 5);
  t.anisotropy = 8;
  t.colorSpace = SRGBColorSpace;
  return t;
}

// A box drawn the way hitboxes are: a faint fill and solid edges.
const unitBox = new BoxGeometry(1, 1, 1);
const UNIT_BOX = unitBox;
const unitEdges = new EdgesGeometry(unitBox);
function outlinedBox(colour) {
  const g = new Group();
  const fill = new Mesh(unitBox, new MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18, depthWrite: false }));
  const edges = new LineSegments(unitEdges, new LineBasicMaterial({ color: colour, transparent: true }));
  g.add(fill, edges);
  g.userData.fill = fill;
  g.userData.edges = edges;
  return g;
}

// Roblox's ColorCorrectionEffect, as a pass over the rendered view: tint,
// brightness, contrast, saturation (in display space, as Roblox grades).
const GRADE = new ShaderMaterial({
  uniforms: {
    view: { value: null },
    tint: { value: new Vector3(1, 1, 1) },
    brightness: { value: 0 },
    contrast: { value: 0 },
    saturation: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D view;
    uniform vec3 tint;
    uniform float brightness, contrast, saturation;
    varying vec2 vUv;
    vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec3 c = toSrgb(clamp(texture2D(view, vUv).rgb, 0.0, 1.0));
      c *= tint;
      c += brightness;
      c = (c - 0.5) * (1.0 + contrast) + 0.5;
      float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(grey), c, 1.0 + saturation);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

// The last pass of a picture or a video frame: the rendered view (linear,
// premultiplied by its alpha) graded like GRADE when a Screen Color is on,
// unpremultiplied (so transparent pixels keep their real colour), turned to
// sRGB and flipped to top-down rows, as an image file and a video frame want.
const EXPORT_PASS = new ShaderMaterial({
  uniforms: {
    view: { value: null },
    graded: { value: 0 },
    tint: { value: new Vector3(1, 1, 1) },
    brightness: { value: 0 },
    contrast: { value: 0 },
    saturation: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D view;
    uniform float graded, brightness, contrast, saturation;
    uniform vec3 tint;
    varying vec2 vUv;
    vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec4 px = texture2D(view, vec2(vUv.x, 1.0 - vUv.y));
      float a = clamp(px.a, 0.0, 1.0);
      vec3 c = a > 0.0001 ? px.rgb / a : vec3(0.0);
      c = toSrgb(clamp(c, 0.0, 1.0));
      if (graded > 0.5) {
        c *= tint;
        c += brightness;
        c = (c - 0.5) * (1.0 + contrast) + 0.5;
        float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(grey), c, 1.0 + saturation);
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), a);
    }`,
  depthTest: false,
  depthWrite: false,
});

/**
 * Mounts the view in `host`. `textureUrl(id)` resolves a Roblox image ID to a
 * URL (or null); `meshData(id)` a mesh ID to its .mesh bytes (or null).
 * `onPick({ kind, event?, who? })` hears what a click in the view landed on.
 */
export function mountSkillScene(host, { textureUrl = async () => null, meshData = async () => null, onPick = () => {} } = {}) {
  let grade = null; // the Screen Color at the playhead, if any
  let overlaysOn = false;
  // Until everything below is set up, a camera move only redraws.
  let ready = false;
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.className = 'scene-canvas';
  host.append(renderer.domElement);

  const scene = new Scene();
  // Blender's viewport grey, fading the floor out into it.
  scene.background = new Color('#202020');
  scene.fog = new Fog('#202020', 60, 200);
  const camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 2000);
  // Roblox Studio's controls (src/studio-camera.js), and Blender's axis
  // gizmo in the corner (src/view-gizmo.js).
  let gizmo = null;
  const controls = new StudioCamera(camera, renderer.domElement, {
    // Moving the camera (paused or not) re-poses what faces it: particles,
    // billboards, beams and trails turn to the new view.
    onChange: () => (ready ? show(time) : render()),
    onFocus: () => new Vector3().setFromMatrixPosition(frameNow('user', 'HumanoidRootPart')),
  });
  controls.set(new Vector3(...HOME_CAMERA), new Vector3(0, 3, 2.5));
  gizmo = mountGizmo(host, controls);
  scene.add(new HemisphereLight('#ffffff', '#3a3f45', 1.5));
  scene.add(new AmbientLight('#ffffff', 0.5));
  const sun = new DirectionalLight('#ffffff', 1.4);
  sun.position.set(-20, 40, -10);
  scene.add(sun);
  const plate = new Mesh(new PlaneGeometry(512, 512), new MeshBasicMaterial({ map: baseplateTexture() }));
  plate.rotation.x = -Math.PI / 2;
  scene.add(plate);
  // The wall (the simulation's `wall` studs in front of you), when there is one.
  const wall = new Mesh(
    new BoxGeometry(80, 40, 1),
    new MeshLambertMaterial({ color: '#3b3f46', transparent: true, opacity: 0.92 }),
  );
  const wallEdges = new LineSegments(new EdgesGeometry(wall.geometry), new LineBasicMaterial({ color: '#6b7280' }));
  wall.add(wallEdges);
  wall.visible = false;
  scene.add(wall);

  const face = faceTexture();
  const redrawOnRig = () => show(time);
  onRigLoaded.add(redrawOnRig);
  const user = buildCharacter(face);
  const target = buildCharacter(face);
  scene.add(user.root, target.root, user.ragdoll.group, target.ragdoll.group);
  const people = { user, target };
  let baked = { user: [], target: [] };
  let dummyShown = true;

  const fx = new Group();
  scene.add(fx);
  // The screen overlays (Overlay effects), drawn over the view.
  const hud = new Scene();
  const hudCamera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);
  const hudPlanes = [];
  // Colour correction: the view renders to a texture, then through GRADE.
  let gradeTarget = null;
  const gradeScene = new Scene();
  const gradeQuad = new Mesh(new PlaneGeometry(2, 2), GRADE);
  gradeQuad.frustumCulled = false;
  gradeScene.add(gradeQuad);
  const gradeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const live = new Map(); // event id → drawn object (hitboxes, shots, popups)
  const effectsLive = new Map(); // event id → builderfx effect
  const textures = new Map();
  const meshes = new Map();

  let run = null;
  let time = 0;
  let follow = true;
  let showHitboxes = true;
  let showPopups = true;
  let selected = new Set();
  // Where Follow last had the pair's middle: the camera moves with it.
  let followFrom = null;
  // Which camera the view shows (src/camera-rig.js): 'free' (yours),
  // 'auto' or 'path' (a recorded one), and whether a skill's Camera blocks,
  // FOV and shakes take over while they run.
  let camMode = 'free';
  let autoOptions = {};
  let pathKeys = [];
  let pathOptions = { smooth: true, shake: null };
  let skillCamera = true;
  // Whether the skill is playing: stopped, a Camera block doesn't take the
  // Free camera's view, so you can fly around a moment that has one.
  let playing = false;
  // The move/turn/scale gizmo's state (see "Moving things in the view"),
  // up here because show() reaches it before that part has run.
  let editReady = false;
  let editState = null; // { branch, index, mode, space, onEdit, onEnd }
  let editDrag = null; // the frame at the drag's start
  // The impact frame's pose tool (see Posing, below).
  let pose = null;
  let poseState = null; // { who, part, mode: 'rotate' | 'ik' | 'move', onPose(pose), onPick(who, part) }
  let poseDrag = null;
  let track = null; // the auto camera's track for this run, made when first needed
  // A camera to look through while editing one (the animator's preview):
  // t → { position, quaternion, fov } or null. It comes before any mode.
  let previewCamera = null;
  // The camera effects face (billboards, particles): the view's, or an export's.
  let drawingFor = camera;

  function texture(id) {
    if (!id || id === '0') return null;
    if (textures.has(id)) return textures.get(id);
    const entry = { map: null };
    textures.set(id, entry);
    textureUrl(id)
      .then((url) => {
        if (!url) return;
        new TextureLoader().setCrossOrigin('anonymous').load(url, (map) => {
          map.colorSpace = SRGBColorSpace;
          map.wrapS = map.wrapT = RepeatWrapping;
          entry.map = map;
          entry.url = url;
          show(time);
        });
      })
      .catch(() => {});
    return entry;
  }

  // A mesh by ID: { geometry } once read, { failed } if not.
  function meshOf(id) {
    const key = String(id);
    if (meshes.has(key)) return meshes.get(key);
    const entry = { geometry: null, failed: false };
    meshes.set(key, entry);
    meshData(key)
      .then((bytes) => (bytes ? readRobloxMesh(bytes) : null))
      .then((geometry) => {
        // Roblox draws a mesh centred on its bounding box, whatever its
        // file's origin.
        if (geometry) {
          const centre = geometry.boundingBox.getCenter(new Vector3());
          geometry.translate(-centre.x, -centre.y, -centre.z);
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
        }
        entry.geometry = geometry;
        entry.failed = !geometry;
      })
      .catch(() => (entry.failed = true))
      .finally(() => show(time));
    return entry;
  }

  // The size the canvas is drawn at: the area, or a letterboxed shape.
  let aspect = null; // width / height, or null for the area's own
  function resize() {
    let { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    if (aspect) {
      if (w / h > aspect) w = Math.round(h * aspect);
      else h = Math.round(w / aspect);
    }
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (gradeTarget) gradeTarget.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    render();
  }
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);

  // ─── Poses at any time ────────────────────────────────────────────────

  function place(t) {
    if (!run) return;
    for (const who of ['user', 'target']) {
      const r = people[who];
      const [x, y, z] = motionAt(run.motion[who], t);
      r.root.position.set(x, y, z);
      r.root.rotation.y = run.yaw[who];
      resetPose(r);
      // Walking legs while moving along the ground.
      const [px, , pz] = motionAt(run.motion[who], t - 1 / 30);
      const speed = Math.hypot(x - px, z - pz) * 30;
      if (speed > 2 && y < 0.2) {
        const swing = Math.sin(t * 14) * 0.7;
        r.rightLeg.rotation.x = swing;
        r.leftLeg.rotation.x = -swing;
      }
    }
    for (const e of run.events) {
      if (t < e.t || t >= e.end) continue;
      const r = people[e.who];
      const p = clamp01((t - e.t) / Math.max(0.01, e.end - e.t));
      if (e.kind === 'ANIM') POSES[poseIndex(e.node.ANIM_USE)](r, Math.sin(p * Math.PI), p);
      if (e.kind === 'STATE' && e.node.STATE === 'Stun' && e.who === 'target') r.body.rotation.x = -0.25;
    }
    for (const who of ['user', 'target']) applyPose(who, people[who]);
    // Ragdolled: the loose parts, where the baked ragdoll has them.
    for (const who of ['user', 'target']) {
      const r = people[who];
      // A posed rig stays a rig.
      const frame = pose?.[who] ? null : ragdollFrame(baked, who, t);
      const ok = frame && Object.values(frame).every((v) => v.every(Number.isFinite));
      r.body.visible = !ok;
      r.ragdoll.group.visible = Boolean(ok);
      if (!ok) continue;
      for (const [name, [x, y, z, qx, qy, qz, qw]] of Object.entries(frame)) {
        const mesh = r.ragdoll.meshes[name];
        mesh.position.set(x, y, z);
        mesh.quaternion.set(qx, qy, qz, qw);
      }
    }
    // Grabs hold the one grabbed to the grabber's part.
    for (const g of run.grabs) {
      if (t < g.t0 || t >= g.t1) continue;
      const at = new Vector3().setFromMatrixPosition(meshMatrix(g.by, g.node['BODY PART'] ?? 'HumanoidRootPart'));
      const off = localToWorld(g.by, vec3(g.node.POSITION));
      const held = people[g.who].root;
      held.position.copy(at.add(off)).add(new Vector3(0, -3, 0));
      held.rotation.y = people[g.by].root.rotation.y + vec3(g.node.ROTATION)[1] * RAD;
    }
    if (!dummyShown) {
      target.root.visible = false;
      target.ragdoll.group.visible = false;
    } else target.root.visible = true;
  }

  function localToWorld(who, [x, y, z]) {
    const yaw = people[who].root.rotation.y;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    // Local x is to the character's left, as in the simulator's toWorld.
    return new Vector3(c * x + s * z, y, -s * x + c * z);
  }

  // A part's matrix here, as placed now (ragdoll-aware). The root part has
  // only the character's heading, at the root's height.
  function meshMatrix(who, name) {
    const r = people[who];
    if (name === 'HumanoidRootPart' && !r.ragdoll.group.visible) {
      r.root.updateWorldMatrix(true, false);
      const at = new Vector3(0, 3, 0).applyMatrix4(r.root.matrixWorld);
      return new Matrix4().compose(at, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r.root.rotation.y), new Vector3(1, 1, 1));
    }
    const loose = r.ragdoll.group.visible && (r.ragdoll.meshes[name] ?? r.ragdoll.meshes.Torso);
    const mesh = loose || r.parts[name] || r.parts.Torso;
    mesh.updateWorldMatrix(true, false);
    return mesh.matrixWorld.clone();
  }

  // Poses at other times, for effects that look back (trails) or spawned
  // earlier: placed and read, then cached.
  const poses = new Map();
  let displaced = false;
  function posesAt(t) {
    const key = Math.round(t * 240);
    let got = poses.get(key);
    if (got) return got;
    place(key / 240);
    displaced = true;
    got = {};
    for (const who of ['user', 'target']) {
      got[who] = {};
      for (const name of ['HumanoidRootPart', ...BODY]) got[who][name] = meshMatrix(who, name);
    }
    if (poses.size > 6000) poses.clear();
    poses.set(key, got);
    return got;
  }
  const scenePart = (who, name, t) => posesAt(t)[who][name] ?? posesAt(t)[who].HumanoidRootPart;
  const frameAt = (who, name, t) => robloxFrame(scenePart(who, name, t));
  const frameNow = (who, name) => frameAt(who, name, time);

  function shotAt(shot, t) {
    const k = Math.max(0, Math.min(t, shot.t1) - shot.t0) * shot.speed;
    return new Vector3(...shot.origin.map((c, i) => c + shot.dir[i] * k));
  }
  // A projectile's Roblox CFrame: at its position, looking along its flight.
  function shotFrameAt(id, t) {
    const shot = run.shots[id];
    const at = shotAt(shot, t);
    const ahead = at.clone().add(new Vector3(...shot.dir));
    return new Matrix4().lookAt(at, ahead, new Vector3(0, 1, 0)).setPosition(at);
  }

  // An effect with a PROJECTILE TAG hangs from the latest projectile with
  // that tag its character fired (BuilderFX's RELATIVE), not from the body.
  function withShot(e) {
    const tag = e.node?.['PROJECTILE TAG'];
    if (!tag || e.shot != null) return e;
    const shot = run.shots.findLast((sh) => sh.tag === tag && sh.who === e.who && sh.t0 <= e.t + 1e-9);
    return shot ? { ...e, shot: shot.id } : e;
  }

  // What effects borrow from the view (src/fx/builderfx.js).
  const ctx = {
    frameAt,
    shotFrameAt,
    shotSize: (id) => run.shots[id]?.size ?? [1, 1, 1],
    meshFrameAt: (who, name, t) => scenePart(who, name, t),
    texture,
    mesh: meshOf,
    group: fx,
    get camera() {
      return drawingFor;
    },
    hasPart: (who, name) => name === 'HumanoidRootPart' || BODY.includes(name),
    partSize: (who, name) => PART_SIZES[name] ?? PART_SIZES.HumanoidRootPart,
    bodyParts: () => BODY.map((name) => ({ name, size: PART_SIZES[name] })),
    bodyGeometry: (name) => geometryOf(name).g,
    cloneBody: (who) => {
      const out = {};
      for (const name of BODY) {
        const source = people[who].parts[name];
        const m = new Mesh(source.geometry, source.material.clone());
        m.material.transparent = true;
        out[name] = m;
      }
      return out;
    },
  };

  // ─── Cancels ──────────────────────────────────────────────────────────

  // VISUAL Cancel removes the effects with its VISUAL TAG on the same body
  // part of the same character; a PARTICLE with CANCEL removes the
  // emitters with its CANCEL TAG.
  let cancels = [];
  function cancelledAt(e) {
    const n = e.node ?? {};
    let tag = null;
    let part = null;
    if (e.kind === 'VISUAL' && n['VISUAL TAG'] && n.EFFECT !== 'Cancel') {
      tag = `v:${n['VISUAL TAG']}`;
      part = n['BODY PART'] || 'HumanoidRootPart';
    } else if (e.kind === 'PARTICLE' && n['CANCEL TAG'] && !n.CANCEL) tag = `p:${n['CANCEL TAG']}`;
    if (!tag) return Infinity;
    let at = Infinity;
    for (const c of cancels) if (c.tag === tag && c.who === e.who && (!part || c.part === part) && c.t >= e.t && c.t < at) at = c.t;
    return at;
  }

  // ─── Drawing a moment ─────────────────────────────────────────────────

  function ensure(e) {
    if (live.has(e.id)) return live.get(e.id);
    let obj = null;
    if (e.kind === 'HITBOX') {
      obj = outlinedBox(HITBOX_COLOUR);
      obj.userData.family = 'hitbox';
    } else if (e.kind === 'PROJECTILE') {
      obj = outlinedBox(SHOT_COLOUR);
      obj.userData.family = 'shot';
    } else if (e.kind === 'HIT') {
      obj = textSprite(e.damage ? `-${e.damage}` : 'HIT', '#ff6b6b');
      obj.userData.family = 'popup';
    } else if (e.kind === 'COUNTER') {
      obj = outlinedBox('#7fb2ff');
      obj.userData.family = 'shield';
    } else if (e.kind === 'TELEPORT') {
      obj = outlinedBox('#5fe0c0');
      obj.userData.family = 'blink';
    }
    if (obj) {
      obj.userData.event = e;
      obj.traverse((o) => (o.userData.event = e));
      fx.add(obj);
    }
    live.set(e.id, obj);
    return obj;
  }

  function drop(id) {
    const obj = live.get(id);
    if (obj) {
      fx.remove(obj);
      obj.traverse?.((o) => {
        if (o.material?.map && o instanceof Sprite) o.material.map.dispose();
        o.material?.dispose?.();
      });
    }
    live.delete(id);
  }
  function dropEffect(id) {
    effectsLive.get(id)?.dispose();
    effectsLive.delete(id);
  }

  // Visibility effects on the characters: transparency per part at t (they
  // tween OPACITY → ALT OPACITY and stay there).
  function visibility(t) {
    const out = { user: {}, target: {} };
    for (const e of run.events) {
      if (e.kind !== 'VISUAL' || e.node.EFFECT !== 'Visibility' || e.t > t) continue;
      const n = e.node;
      const k = tweenAt(t - e.t, num(n.TIME, 1), n['EASING STYLE'] || 'Linear', n['EASING DIRECTION'] || 'In');
      const value = num(n.OPACITY, 0) + (num(n['ALT OPACITY'], 0) - num(n.OPACITY, 0)) * k;
      const part = n['BODY PART'] || 'HumanoidRootPart';
      for (const name of part === 'HumanoidRootPart' ? BODY : [part]) out[e.who][name] = value;
    }
    for (const who of ['user', 'target'])
      for (const name of BODY) {
        const opacity = clamp01(1 - (out[who][name] ?? 0));
        for (const m of [people[who].parts[name], people[who].ragdoll.meshes[name]]) {
          m.material.opacity = opacity;
          m.material.depthWrite = opacity > 0.98;
          m.visible = opacity > 0.001;
        }
      }
  }

  function effects(t) {
    const active = new Set();
    const activeFx = new Set();
    for (const e of run.events) {
      if (e.kind === 'VISUAL' || e.kind === 'PARTICLE') {
        if (e.t > t) continue;
        if (e.kind === 'VISUAL' && (e.node.EFFECT === 'Cancel' || e.node.EFFECT === 'Visibility')) continue;
        let effect = effectsLive.get(e.id);
        if (effect === undefined) {
          const linked = withShot(e);
          effect = makeEffect(linked, ctx);
          if (effect) {
            // Effects on a projectile go when it does (it's destroyed when it
            // stops: a hit or a wall without CONTINUE, or its TIME running
            // out). Ones made at or after that moment (a collided branch's)
            // stay where it ended.
            const shot = linked.shot != null ? run.shots[linked.shot] : null;
            const gone = shot && e.t < shot.t1 - 1e-6 ? shot.t1 : Infinity;
            effect.end = Math.min(effect.until, cancelledAt(e), gone);
            effect.setUntil(effect.end);
            for (const o of effect.objects ?? []) o.traverse((q) => (q.userData.event = e));
          }
          effectsLive.set(e.id, effect ?? null);
        }
        if (!effect || t >= effect.end) continue;
        activeFx.add(e.id);
        effect.update(t, drawingFor);
        continue;
      }
      if (t < e.t || t >= e.end) continue;
      if ((e.kind === 'HITBOX' || e.kind === 'PROJECTILE') && !showHitboxes) continue;
      if (e.kind === 'HIT' && !showPopups) continue;
      const obj = ensure(e);
      if (!obj) continue;
      active.add(e.id);
      const n = e.node ?? {};
      const p = clamp01((t - e.t) / Math.max(0.01, e.end - e.t));
      const fam = obj.userData.family;
      const picked = selected.has(e.id) ? 1 : 0;
      if (fam === 'hitbox') {
        // Where the simulator checked it (it's a single check): the root
        // part, or the projectile it's tagged to, plus POSITION, turned by
        // ROTATION.
        const at = e.at ?? [0, 3, 0];
        obj.position.set(...at);
        obj.rotation.set(0, 0, 0);
        obj.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), e.yaw ?? people[e.who].root.rotation.y);
        const r = nodeVec(n.ROTATION);
        obj.quaternion.multiply(new Quaternion().setFromEuler(new Euler(r[0] * RAD, r[1] * RAD, r[2] * RAD, 'YXZ')));
        obj.scale.set(...vec3(n.SIZE, [6, 6, 6]).map((s) => Math.max(0.05, s)));
        obj.userData.fill.material.opacity = (0.22 + picked * 0.2) * (1 - p * 0.6);
        obj.userData.edges.material.opacity = 1 - p * 0.6;
        obj.userData.edges.material.color.set(picked ? '#ffffff' : HITBOX_COLOUR);
      } else if (fam === 'shot') {
        const shot = run.shots[e.shot];
        if (shot) {
          obj.matrixAutoUpdate = false;
          obj.matrix.copy(shotFrameAt(e.shot, t)).multiply(new Matrix4().makeScale(...shot.size.map((s) => Math.max(0.05, s))));
          obj.userData.fill.material.opacity = 0.2 + picked * 0.2;
          obj.userData.edges.material.color.set(picked ? '#ffffff' : SHOT_COLOUR);
        }
      } else if (fam === 'popup') {
        const base = people[e.who].root.position;
        obj.position.set(base.x, base.y + 6.5 + p * 1.5, base.z);
        obj.material.opacity = 1 - p * p;
      } else if (fam === 'shield') {
        obj.position.copy(people[e.who].root.position).add(new Vector3(0, 3, 0));
        obj.scale.set(4, 6, 4);
        obj.userData.fill.material.opacity = 0.12;
      } else if (fam === 'blink') {
        obj.position.copy(people[e.who].root.position).add(new Vector3(0, 3, 0));
        obj.scale.set(2, 5, 1);
        obj.userData.edges.material.opacity = 1 - p;
        obj.userData.fill.material.opacity = 0.15 * (1 - p);
      }
    }
    for (const id of [...live.keys()]) if (!active.has(id)) drop(id);
    // Effects outside their life are dropped; they're rebuilt (the same,
    // they're seeded) if the playhead comes back.
    for (const id of [...effectsLive.keys()]) {
      const e = run.events[id];
      if (!activeFx.has(id) && (!e || t < e.t || (effectsLive.get(id) && t >= effectsLive.get(id).end + 0.5))) dropEffect(id);
      else if (!activeFx.has(id)) effectsLive.get(id)?.objects?.forEach((o) => (o.visible = false));
    }
  }

  // The Overlay effects, as ImageLabels SIZE × the screen, centred.
  function drawOverlays(list) {
    while (hudPlanes.length < list.length) {
      const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      hud.add(m);
      hudPlanes.push(m);
    }
    hudPlanes.forEach((m, i) => {
      const o = list[i];
      m.visible = Boolean(o && texture(o.texture)?.map);
      if (!m.visible) return;
      const map = texture(o.texture).map;
      if (m.material.map !== map) {
        m.material.map = map;
        m.material.needsUpdate = true;
      }
      m.scale.set(Math.max(0, o.size), Math.max(0, o.size), 1);
      m.material.color.setRGB(...o.colour);
      m.material.opacity = o.opacity;
    });
    return list.length > 0;
  }

  function render() {
    if (grade) {
      const size = renderer.getDrawingBufferSize(new Vector2());
      if (!gradeTarget) gradeTarget = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
      else if (gradeTarget.width !== size.x || gradeTarget.height !== size.y) gradeTarget.setSize(size.x, size.y);
      renderer.setRenderTarget(gradeTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      GRADE.uniforms.view.value = gradeTarget.texture;
      GRADE.uniforms.tint.value.set(...grade.tint);
      GRADE.uniforms.brightness.value = grade.brightness;
      GRADE.uniforms.contrast.value = grade.contrast;
      GRADE.uniforms.saturation.value = grade.saturation;
      renderer.render(gradeScene, gradeCamera);
    } else renderer.render(scene, camera);
    if (overlaysOn) {
      renderer.autoClear = false;
      renderer.render(hud, hudCamera);
      renderer.autoClear = true;
    }
    gizmo?.draw();
  }

  function middle() {
    const a = people.user.root.position;
    const b = dummyShown ? people.target.root.position : a;
    return new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + 3, (a.z + b.z) / 2);
  }

  // The middle of the pair at t, straight from the simulation (Follow's
  // anchor, for exports that run ahead of the playhead).
  function middleAt(t) {
    const a = new Vector3(...motionAt(run.motion.user, t));
    const b = dummyShown ? new Vector3(...motionAt(run.motion.target, t)) : a;
    return a.add(b).multiplyScalar(0.5).add(new Vector3(0, 3, 0));
  }

  // What the auto camera follows: both chests, your heading.
  function sampleFight(t) {
    const p = posesAt(t);
    return {
      user: new Vector3().setFromMatrixPosition(p.user.Torso),
      target: new Vector3().setFromMatrixPosition(p.target.Torso),
      yaw: run.yaw.user,
      dummy: dummyShown,
    };
  }

  function trackNow() {
    if (!run) return null;
    if (!track) {
      track = autoTrack(run, sampleFight, autoOptions);
      displaced = true;
    }
    return track;
  }

  /** The camera a mode gives at t, before a skill's own camera: { position, quaternion, fov } or null (yours). */
  function modeCamera(mode, t) {
    if (!run) return null;
    if (mode === 'auto') return trackNow().at(t);
    if (mode === 'path') return pathAt(pathKeys, t, pathOptions);
    return null;
  }

  // Puts `cam` where the skill's screen effects say: a Camera block's view,
  // the field of view, the shakes. `own`: the view stays yours (a Camera
  // block and the shakes leave it alone; the field of view still changes).
  function applyScreen(cam, screen, baseFov, own = false) {
    if (skillCamera && !own && screen.camera) {
      const p = new Vector3();
      const q = new Quaternion();
      screen.camera.decompose(p, q, new Vector3());
      cam.position.copy(p);
      cam.quaternion.copy(q);
    }
    cam.fov = baseFov + (skillCamera ? screen.fov - 69 : 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (skillCamera && !own && screen.shake.lengthSq() > 0) {
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, screen.shake.x).addScaledVector(up, screen.shake.y);
    }
    cam.updateMatrixWorld();
  }

  // Poses everything at t and aims `cam` (the view's or an export's):
  // the mode's camera, then the skill's. Returns the screen effects.
  function stage(t, cam, base, own = false) {
    if (camMode === 'auto' || base === 'auto') trackNow();
    place(t);
    visibility(t);
    const screen = screenAt(run.events, t, 'user', frameAt, cancelledAt);
    wall.visible = run.room?.wall !== null && run.room?.wall !== undefined;
    if (wall.visible) wall.position.set(0, 20, run.room.wall + 0.5);
    applyScreen(cam, screen, cam.userData.baseFov ?? BASE_FOV, own);
    drawingFor = cam;
    effects(t);
    drawingFor = camera;
    if (displaced) {
      place(t);
      visibility(t);
      displaced = false;
    }
    return screen;
  }

  function show(t) {
    time = t;
    if (!run) {
      grade = null;
      overlaysOn = false;
      return render();
    }
    // Follow carries your camera along with the pair's middle, as it is:
    // wherever you put it, at whatever angle and distance.
    if (follow && camMode === 'free') {
      const focus = middleAt(t);
      if (followFrom) controls.translate(focus.clone().sub(followFrom));
      followFrom = focus;
    } else followFrom = null;
    // The mode's camera or a Camera block takes the view; then it's yours again.
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    const preview = previewCamera?.(t) ?? null;
    animGroup.visible = !preview;
    const from = preview ?? modeCamera(camMode, t);
    camera.userData.baseFov = BASE_FOV;
    if (from) {
      camera.position.copy(from.position);
      camera.quaternion.copy(from.quaternion);
      camera.userData.baseFov = from.fov ?? BASE_FOV;
    }
    // Stopped, in the Free camera, the view is yours to fly even where a
    // Camera block runs; playing, the block takes it as it does in JJS.
    const screen = stage(t, camera, undefined, !playing && !from);
    grade = skillCamera ? screen.grade : null;
    overlaysOn = drawOverlays(skillCamera ? screen.overlays : []);
    placeEdit();
    render();
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.updateMatrixWorld();
  }

  // ─── Pictures and video frames ────────────────────────────────────────

  const shot = new PerspectiveCamera(BASE_FOV, 1, 0.1, 2000);
  let shotTarget = null;
  let shotOut = null;
  const passScene = new Scene();
  const passQuad = new Mesh(new PlaneGeometry(2, 2), EXPORT_PASS);
  passQuad.frustumCulled = false;
  passScene.add(passQuad);

  function targetsFor(w, h) {
    if (!shotTarget || shotTarget.width !== w || shotTarget.height !== h) {
      shotTarget?.dispose();
      shotOut?.dispose();
      shotTarget = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 });
      shotOut = new WebGLRenderTarget(w, h);
    }
  }

  /**
   * Draws the moment t at width × height, off screen, and reads it back:
   * RGBA rows, top first, alpha not premultiplied. Options:
   *   background  'scene' (the view's own), 'transparent', 'green' or a colour
   *   stage       keep the floor and wall (only with a 'scene' background)
   *   camera      'view' (where yours is now, carried by Follow), 'auto', 'path'
   *   hitboxes, popups, screenFx (Screen Color, Overlays, Camera blocks, shakes)
   */
  async function capture(t, { width, height, background = 'scene', stage: keepStage = true, camera: mode = 'view', hitboxes = false, popups = true, screenFx = true } = {}) {
    const w = Math.max(16, Math.round(width));
    const h = Math.max(16, Math.round(height));
    targetsFor(w, h);
    const keep = {
      background: scene.background,
      fog: scene.fog,
      plate: plate.visible,
      hitboxes: showHitboxes,
      popups: showPopups,
      selected,
      skillCamera,
      anim: animGroup.visible,
      gizmo: gizmoHelper.visible,
    };
    animGroup.visible = false;
    gizmoHelper.visible = false;
    const plain = background === 'scene';
    if (!plain) {
      scene.background = background === 'transparent' ? null : new Color(background === 'green' ? '#00ff00' : background);
      scene.fog = null;
    }
    plate.visible = plain && keepStage;
    showHitboxes = hitboxes;
    showPopups = popups;
    selected = new Set();
    skillCamera = screenFx;
    // Where the camera is: the mode's, else yours (moved along by Follow).
    const from = mode === 'view' ? modeCamera(camMode, t) : modeCamera(mode, t);
    shot.userData.baseFov = from?.fov ?? BASE_FOV;
    if (from) {
      shot.position.copy(from.position);
      shot.quaternion.copy(from.quaternion);
    } else {
      shot.position.copy(camera.position);
      shot.quaternion.copy(camera.quaternion);
      if (follow && camMode === 'free' && run) shot.position.add(middleAt(t).sub(middleAt(time)));
    }
    shot.aspect = w / h;
    shot.updateProjectionMatrix();
    let screen = null;
    if (run) {
      screen = stage(t, shot);
      if (!plain || !keepStage) wall.visible = false;
    }
    renderer.setRenderTarget(shotTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, shot);
    if (screenFx && screen && drawOverlays(screen.overlays)) {
      renderer.autoClear = false;
      renderer.render(hud, hudCamera);
      renderer.autoClear = true;
    }
    const g = screenFx ? screen?.grade : null;
    EXPORT_PASS.uniforms.view.value = shotTarget.texture;
    EXPORT_PASS.uniforms.graded.value = g ? 1 : 0;
    if (g) {
      EXPORT_PASS.uniforms.tint.value.set(...g.tint);
      EXPORT_PASS.uniforms.brightness.value = g.brightness;
      EXPORT_PASS.uniforms.contrast.value = g.contrast;
      EXPORT_PASS.uniforms.saturation.value = g.saturation;
    }
    renderer.setRenderTarget(shotOut);
    renderer.render(passScene, gradeCamera);
    renderer.setRenderTarget(null);
    const pixels = new Uint8Array(w * h * 4);
    await renderer.readRenderTargetPixelsAsync(shotOut, 0, 0, w, h, pixels);
    // Back as the view was.
    scene.background = keep.background;
    scene.fog = keep.fog;
    plate.visible = keep.plate;
    showHitboxes = keep.hitboxes;
    showPopups = keep.popups;
    selected = keep.selected;
    skillCamera = keep.skillCamera;
    animGroup.visible = keep.anim;
    gizmoHelper.visible = keep.gizmo;
    return { pixels, width: w, height: h };
  }

  // ─── Impact frames (src/impact.js) ────────────────────────────────────

  /**
   * The characters at t as JJS's screen will show them, for an impact
   * frame drawn over it: through the skill's camera when a Camera block runs
   * then (else the view's), a white silhouette of each on black, `width` ×
   * `height`. { masks: { user, target } (Uint8ClampedArray, one byte a pixel,
   * top row first), point: [x, y] where the dummy (or you) is on screen,
   * camera: whether a Camera block had the view }.
   */
  async function silhouettes(t, { width = 1024, height = 576 } = {}) {
    const w = Math.max(16, Math.round(width));
    const h = Math.max(16, Math.round(height));
    const target = new WebGLRenderTarget(w, h);
    const keep = { background: scene.background, fog: scene.fog, skillCamera, override: scene.overrideMaterial };
    skillCamera = true;
    // Where the camera is: the view's, as capture() does, then the skill's
    // Camera block over it (stage applies it).
    const from = modeCamera(camMode, t);
    shot.userData.baseFov = from?.fov ?? BASE_FOV;
    shot.position.copy(from?.position ?? camera.position);
    shot.quaternion.copy(from?.quaternion ?? camera.quaternion);
    shot.aspect = w / h;
    shot.updateProjectionMatrix();
    const screen = run ? stage(t, shot) : null;
    scene.background = new Color('#000000');
    scene.fog = null;
    scene.overrideMaterial = new MeshBasicMaterial({ color: '#ffffff' });
    const shown = scene.children.map((c) => [c, c.visible]);
    const masks = {};
    for (const who of ['user', 'target']) {
      const mine = new Set([people[who].root, people[who].ragdoll.group]);
      for (const [c] of shown) c.visible = mine.has(c) && (who === 'user' || dummyShown);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, shot);
      const px = new Uint8Array(w * h * 4);
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, px);
      // WebGL reads bottom row first.
      const m = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[(h - 1 - y) * w + x] = px[(y * w + x) * 4];
      masks[who] = m;
    }
    for (const [c, v] of shown) c.visible = v;
    renderer.setRenderTarget(null);
    scene.overrideMaterial.dispose();
    Object.assign(scene, { background: keep.background, fog: keep.fog, overrideMaterial: keep.override });
    skillCamera = keep.skillCamera;
    target.dispose();
    // Where the hit lands on screen: the dummy's chest, else yours, else the middle.
    const on = (who) => {
      const p = people[who].root.position.clone().add(new Vector3(0, 1.5, 0)).project(shot);
      return p.z < 1 && Math.abs(p.x) <= 1.2 && Math.abs(p.y) <= 1.2 ? [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h] : null;
    };
    const point = (dummyShown && on('target')) || on('user') || [w / 2, h / 2];
    show(time);
    return { masks, point, width: w, height: h, camera: Boolean(screen?.camera) };
  }

  function endCapture() {
    shotTarget?.dispose();
    shotOut?.dispose();
    shotTarget = shotOut = null;
    show(time);
  }

  // ─── The motion animator's overlay ────────────────────────────────────

  // Its keys in the world (markers), the path between them, and a gizmo on
  // the picked key: drag it to move or turn the key, as in Blender.
  const animGroup = new Group();
  scene.add(animGroup);
  const animLine = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.7, depthTest: false }));
  animLine.renderOrder = 10;
  animGroup.add(animLine);
  const animProxy = new Object3D();
  scene.add(animProxy);
  const gizmo3d = new TransformControls(camera, renderer.domElement);
  gizmo3d.setSize(0.8);
  const gizmoHelper = gizmo3d.getHelper();
  gizmoHelper.visible = false;
  scene.add(gizmoHelper);
  let animState = null;
  let gizmoDragging = false;
  gizmo3d.addEventListener('dragging-changed', (e) => {
    gizmoDragging = e.value;
    if (!e.value) animState?.onDragEnd?.();
  });
  gizmo3d.addEventListener('objectChange', () => {
    if (!animState?.onDrag) return;
    animProxy.updateMatrixWorld();
    animState.onDrag(animState.selected, animProxy.matrixWorld.clone());
  });
  gizmo3d.addEventListener('change', () => ready && render());

  /**
   * Shows an animation: `keys` are world matrices, `path` world points,
   * `selected` the key with the gizmo, `mode` 'translate' or 'rotate',
   * `camera` whether the keys are views. null hides it.
   */
  function setAnimOverlay(next) {
    animState = next;
    while (animGroup.children.length > 1) {
      const c = animGroup.children.at(-1);
      animGroup.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    if (!next) {
      animLine.visible = false;
      gizmo3d.detach();
      gizmoHelper.visible = false;
      return show(time);
    }
    const pts = [];
    for (let i = 0; i < next.path.length - 1; i++) pts.push(...next.path[i].toArray(), ...next.path[i + 1].toArray());
    animLine.geometry.dispose();
    animLine.geometry = new BufferGeometry();
    animLine.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    animLine.visible = pts.length > 0;
    next.keys.forEach((m, i) => {
      const picked = i === next.selected;
      const colour = picked ? '#ffffff' : '#9a9a9a';
      const marker = next.camera
        ? new Mesh(new ConeGeometry(0.45, 0.9, 4, 1, true), new MeshBasicMaterial({ color: colour, wireframe: true, depthTest: false, transparent: true }))
        : new LineSegments(unitEdges, new LineBasicMaterial({ color: colour, depthTest: false, transparent: true }));
      if (next.camera) {
        marker.geometry.rotateX(-Math.PI / 2); // the cone points where the view looks (-z)
        marker.geometry.rotateZ(Math.PI / 4);
      }
      marker.matrixAutoUpdate = false;
      marker.matrix.copy(m);
      if (!next.camera) marker.matrix.multiply(new Matrix4().makeScale(...(next.sizes?.[i] ?? [1, 1, 1])));
      marker.renderOrder = 11;
      marker.userData.animKey = i;
      marker.userData.center = new Vector3().setFromMatrixPosition(m);
      animGroup.add(marker);
    });
    // The pen tool's handles: a dot for each, on a line from its key.
    const handleLines = [];
    for (const h of next.handles ?? []) {
      handleLines.push(...h.anchor.toArray(), ...h.at.toArray());
      const dot = new Mesh(new SphereGeometry(0.2, 12, 8), new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.95 }));
      dot.position.copy(h.at);
      dot.renderOrder = 12;
      dot.userData.animHandle = { key: h.key, side: h.side };
      dot.userData.center = h.at.clone();
      animGroup.add(dot);
    }
    if (handleLines.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(handleLines, 3));
      const lines = new LineSegments(g, new LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.55 }));
      lines.renderOrder = 11;
      lines.raycast = () => {}; // not something to grab
      animGroup.add(lines);
    }
    const m = next.keys[next.selected];
    if (m && next.onDrag) {
      m.decompose(animProxy.position, animProxy.quaternion, animProxy.scale);
      animProxy.scale.set(1, 1, 1);
      animProxy.updateMatrixWorld();
      if (!gizmoDragging) {
        gizmo3d.attach(animProxy);
        gizmo3d.setMode(next.mode ?? 'translate');
        gizmo3d.setSpace('local');
      }
      gizmoHelper.visible = true;
    } else {
      gizmo3d.detach();
      gizmoHelper.visible = false;
    }
    show(time);
  }

  // ─── Moving things in the view ────────────────────────────────────────

  // The picked node's box or effect gets a gizmo, as in Roblox Studio or
  // Blender: move, turn or scale it in the view and its POSITION, ROTATION
  // and SIZE follow. Each kind is a frame it hangs from (`base`) and its
  // fields as a matrix in that frame (`local`), back and forth:
  //   HITBOX      root (or its projectile) · turned by the heading; POSITION
  //               as is, ROTATION in degrees, SIZE per axis
  //   PROJECTILE  the same, without a turn (ROTATION aims it)
  //   VISUAL      the body part (or projectile) · CFrame.new(-x, y, -z) ·
  //               ROTATION, SIZE uniform (BuilderFX's own placing)
  const editProxy = new Object3D();
  scene.add(editProxy);
  const editGizmo = new TransformControls(camera, renderer.domElement);
  editGizmo.setSize(0.85);
  const editHelper = editGizmo.getHelper();
  editHelper.visible = false;
  scene.add(editHelper);
  let snapping = false;
  editGizmo.addEventListener('change', () => ready && render());

  const fmt = (v) => v.map((x) => String(Math.round(x * 1000) / 1000 || 0)).join(', ');
  const SHAPED = new Set(['Mesh', 'Block', 'Sphere', 'Cylinder', 'Wedge', 'Distortion']);
  const NOT_PLACED = new Set(['Camera', 'Cancel', 'Visibility', 'Screen Color', 'Overlay', 'Shake', 'FOV']);
  const editable = (e) =>
    !e.p &&
    e.index != null &&
    (e.kind === 'HITBOX' || e.kind === 'PROJECTILE' || (e.kind === 'VISUAL' && !NOT_PLACED.has(e.node?.EFFECT)));

  /** The event drawn for the picked node: the one live now, else its first. */
  function editEvent() {
    if (!run || !editState) return null;
    const mine = run.events.filter((e) => e.branch === editState.branch && e.index === editState.index && editable(e));
    return mine.find((e) => time >= e.t && time < Math.max(e.end ?? e.t, e.t + 0.05)) ?? mine[0] ?? null;
  }

  /** What `e` hangs from now, and how its fields turn into a matrix there and back. */
  function editFrame(e) {
    const n = e.node;
    if (e.kind === 'HITBOX' || e.kind === 'PROJECTILE') {
      const shot = e.kind === 'PROJECTILE' ? run.shots[e.shot] : null;
      if (e.kind === 'PROJECTILE' && !shot) return null;
      const pos = vec3(n.POSITION);
      const yaw = e.yaw ?? people[e.who].root.rotation.y;
      const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      // Where the box is, less its POSITION turned by the heading.
      const at = shot ? new Vector3(...shot.origin) : new Vector3(...e.at);
      const from = at.sub(new Vector3(...pos).applyQuaternion(turn));
      const base = new Matrix4().compose(from, turn, new Vector3(1, 1, 1));
      const size = vec3(n.SIZE, e.kind === 'HITBOX' ? [5, 5, 5] : [6, 6, 6]);
      const rot = vec3(n.ROTATION);
      const local = new Matrix4().compose(
        new Vector3(...pos),
        shot ? new Quaternion() : new Quaternion().setFromEuler(new Euler(rot[0] * RAD, rot[1] * RAD, rot[2] * RAD, 'YXZ')),
        new Vector3(...size.map((v) => Math.max(0.05, Math.abs(v)))),
      );
      const fields = (m) => {
        const p = new Vector3();
        const q = new Quaternion();
        const sc = new Vector3();
        m.decompose(p, q, sc);
        const out = { POSITION: fmt(p.toArray()), SIZE: fmt(sc.toArray()) };
        if (!shot) {
          const r = new Euler().setFromQuaternion(q, 'YXZ');
          out.ROTATION = fmt([r.x / RAD, r.y / RAD, r.z / RAD]);
        }
        return out;
      };
      return { base, local, fields, turns: !shot, uniform: false, scales: true };
    }
    const part = n['BODY PART'] || 'HumanoidRootPart';
    const tag = n['PROJECTILE TAG'];
    const shot = e.shot ?? (tag ? run.shots.findLast((sh) => sh.tag === tag && sh.who === e.who && sh.t0 <= e.t + 1e-9)?.id : null);
    // A moving effect leaves from where the part was when it started.
    const moving = vec3(n['ALT POSITION']).some((c) => Math.abs(c) > 1e-6);
    const when = moving ? e.t : Math.max(e.t, time);
    const base = shot != null ? shotFrameAt(shot, when) : frameAt(e.who, part, when);
    const size = Number(n.SIZE ?? 1) || 1;
    const scales = SHAPED.has(n.EFFECT) || n.SIZE != null;
    const local = keyMatrix({ pos: vec3(n.POSITION), rot: vec3(n.ROTATION) }).multiply(
      new Matrix4().makeScale(...[size, size, size].map((v) => Math.max(0.05, Math.abs(v)))),
    );
    const fields = (m) => {
      const p = new Vector3();
      const q = new Quaternion();
      const sc = new Vector3();
      m.decompose(p, q, sc);
      const { pos, rot } = keyFrom(new Matrix4().compose(p, q, new Vector3(1, 1, 1)));
      const out = { POSITION: fmt(pos), ROTATION: fmt(rot) };
      if (scales) out.SIZE = Math.round(Math.max(0.01, sc.x) * 1000) / 1000;
      return out;
    };
    return { base, local, fields, turns: true, uniform: true, scales };
  }

  /** Puts the gizmo on the picked node's box or effect (unless it's being dragged). */
  function placeEdit() {
    if (!editReady || editDrag) return;
    const e = editState && editState.mode !== 'select' && !playing && !previewCamera && !poseState ? editEvent() : null;
    const f = e && editFrame(e);
    if (!f || (editState.mode === 'rotate' && !f.turns) || (editState.mode === 'scale' && !f.scales)) {
      editGizmo.detach();
      editHelper.visible = false;
      return;
    }
    new Matrix4().multiplyMatrices(f.base, f.local).decompose(editProxy.position, editProxy.quaternion, editProxy.scale);
    editProxy.updateMatrixWorld();
    editGizmo.attach(editProxy);
    editGizmo.setMode(editState.mode);
    editGizmo.setSpace(editState.mode === 'scale' ? 'local' : (editState.space ?? 'world'));
    editHelper.visible = true;
  }

  editGizmo.addEventListener('dragging-changed', (ev) => {
    if (ev.value) {
      const e = editEvent();
      const frame = e && editFrame(e);
      editDrag = frame && { frame, scale: editProxy.scale.clone() };
    } else {
      editDrag = null;
      editState?.onEnd?.();
      placeEdit();
      show(time);
    }
  });
  editGizmo.addEventListener('objectChange', () => {
    if (!editDrag || !editState?.onEdit) return;
    const f = editDrag.frame;
    // A single SIZE: the axis dragged furthest scales all three together.
    if (f.uniform && editState.mode === 'scale') {
      const s = editProxy.scale;
      const was = editDrag.scale;
      const ratio = [s.x / was.x, s.y / was.y, s.z / was.z].reduce((a, b) => (Math.abs(Math.log(Math.abs(b) || 1)) > Math.abs(Math.log(Math.abs(a) || 1)) ? b : a));
      s.copy(was).multiplyScalar(ratio);
    }
    editProxy.updateMatrixWorld();
    const local = f.base.clone().invert().multiply(editProxy.matrixWorld);
    editState.onEdit(f.fields(local));
  });
  // Ctrl snaps: half a stud, 15 degrees, a tenth in scale (as Studio's increments).
  const snap = (on) => {
    if (on === snapping) return;
    snapping = on;
    editGizmo.setTranslationSnap(on ? 0.5 : null);
    editGizmo.setRotationSnap(on ? 15 * RAD : null);
    editGizmo.setScaleSnap(on ? 0.1 : null);
  };
  const snapKeys = (ev) => snap(ev.ctrlKey || ev.metaKey);
  addEventListener('keydown', snapKeys);
  addEventListener('keyup', snapKeys);

  /**
   * The tool for the picked node: { branch, index, mode: 'select' |
   * 'translate' | 'rotate' | 'scale', space: 'world' | 'local', onEdit(fields),
   * onEnd() }, or null.
   */
  function setEditTool(next) {
    editState = next;
    placeEdit();
    show(time);
  }
  editReady = true;

  // ─── Posing (the impact frame's pose tool) ─────────────────────────────
  // JJS's animations aren't public, so the stand-in poses can't show a hit
  // the way the game does: for an impact frame, both rigs can be posed by
  // hand, as in Blender. A pose overrides the rig at every time while it's
  // set: { user?, target? }, each { joints: { part: [qx, qy, qz, qw] },
  // move: [x, y, z], turn: radians }. Joints turn about Roblox's Motor6D
  // points (the neck, shoulders, hips); the torso turns about the waist,
  // carrying everything with it. An arm or leg can be posed by its end
  // instead (IK): drag the hand or foot and the limb points at it.
  const WAIST = new Vector3(0, 2, 0);
  const LIMB_TIP = new Vector3(0, -2, 0);
  const LIMBS = new Set(['Right Arm', 'Left Arm', 'Right Leg', 'Left Leg']);
  const pivotOf = (r, part) =>
    ({ Head: r.head, Torso: r.body, 'Right Arm': r.rightArm, 'Left Arm': r.leftArm, 'Right Leg': r.rightLeg, 'Left Leg': r.leftLeg })[part];

  /** Puts the pose (if any) over what place() worked out for `r`. */
  function applyPose(who, r) {
    const p = pose?.[who];
    if (!p) return;
    if (p.move) r.root.position.add(new Vector3(...p.move));
    if (p.turn) r.root.rotation.y += p.turn;
    for (const [part, q] of Object.entries(p.joints ?? {})) {
      const pivot = pivotOf(r, part);
      if (!pivot || !q) continue;
      pivot.quaternion.set(...q);
      // The torso turns about the waist, not the feet.
      if (part === 'Torso') pivot.position.copy(WAIST).sub(WAIST.clone().applyQuaternion(pivot.quaternion));
    }
  }

  const poseProxy = new Object3D();
  scene.add(poseProxy);
  const poseGizmo = new TransformControls(camera, renderer.domElement);
  poseGizmo.setSize(0.75);
  const poseHelper = poseGizmo.getHelper();
  poseHelper.visible = false;
  scene.add(poseHelper);
  poseGizmo.addEventListener('change', () => ready && render());

  /** The gizmo on the picked joint: at the joint, turned as it is (or at the limb's end, for IK). */
  function placePose() {
    if (poseDrag) return;
    const r = poseState && people[poseState.who];
    if (!r || !poseState.part) {
      poseGizmo.detach();
      poseHelper.visible = false;
      return;
    }
    const { part, mode } = poseState;
    r.root.updateMatrixWorld(true);
    if (mode === 'move') {
      poseProxy.position.copy(r.root.position);
      poseProxy.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), r.root.rotation.y);
      poseGizmo.setMode('translate');
      poseGizmo.setSpace('world');
    } else if (mode === 'ik' && LIMBS.has(part)) {
      const pivot = pivotOf(r, part);
      poseProxy.position.copy(pivot.localToWorld(LIMB_TIP.clone()));
      poseProxy.quaternion.identity();
      poseGizmo.setMode('translate');
      poseGizmo.setSpace('world');
    } else {
      const pivot = pivotOf(r, part);
      poseProxy.position.copy(part === 'Torso' ? r.root.localToWorld(WAIST.clone()) : pivot.getWorldPosition(new Vector3()));
      pivot.getWorldQuaternion(poseProxy.quaternion);
      poseGizmo.setMode('rotate');
      poseGizmo.setSpace('local');
    }
    poseProxy.updateMatrixWorld();
    poseGizmo.attach(poseProxy);
    poseHelper.visible = true;
  }

  const setJoint = (who, part, q) => {
    pose = { ...pose, [who]: { ...pose?.[who], joints: { ...pose?.[who]?.joints, [part]: q.toArray().map((v) => Math.round(v * 1e5) / 1e5) } } };
  };

  poseGizmo.addEventListener('dragging-changed', (ev) => {
    poseDrag = ev.value ? { who: poseState?.who, part: poseState?.part } : null;
    if (!ev.value) {
      poses.clear();
      show(time);
      placePose();
      poseState?.onPose?.(pose);
    }
  });
  poseGizmo.addEventListener('objectChange', () => {
    if (!poseDrag || !poseState) return;
    const { who, part, mode } = poseState;
    const r = people[who];
    poseProxy.updateMatrixWorld();
    if (mode === 'move') {
      // Where the rig is with no move, to measure the move from.
      const was = new Vector3(...(pose?.[who]?.move ?? [0, 0, 0]));
      const base = r.root.position.clone().sub(was);
      const move = poseProxy.position.clone().sub(base).toArray().map((v) => Math.round(v * 1000) / 1000);
      pose = { ...pose, [who]: { ...pose?.[who], move } };
    } else if (mode === 'ik' && LIMBS.has(part)) {
      // Point the limb at the handle, turning it as little as it can.
      const pivot = pivotOf(r, part);
      const parent = pivot.parent;
      parent.updateMatrixWorld(true);
      const shoulder = pivot.getWorldPosition(new Vector3());
      const want = poseProxy.position.clone().sub(shoulder);
      if (want.lengthSq() < 1e-6) return;
      const parentQ = parent.getWorldQuaternion(new Quaternion());
      const wantLocal = want.normalize().applyQuaternion(parentQ.clone().invert());
      const nowLocal = new Vector3(0, -1, 0).applyQuaternion(pivot.quaternion);
      const q = new Quaternion().setFromUnitVectors(nowLocal, wantLocal).multiply(pivot.quaternion);
      setJoint(who, part, q);
    } else {
      const pivot = pivotOf(r, part);
      const parentQ = pivot.parent.getWorldQuaternion(new Quaternion());
      setJoint(who, part, parentQ.invert().multiply(poseProxy.quaternion));
    }
    poses.clear();
    show(time);
  });

  /** The pose tool: { who, part, mode, onPose, onPick } (null: off). */
  function setPoseTool(next) {
    poseState = next;
    placePose();
    placeEdit();
    show(time);
  }
  /** The pose the rigs take while it's set (null: none). */
  function setPose(next) {
    pose = next && (next.user || next.target) ? next : null;
    poses.clear();
    show(time);
    placePose();
  }

  // ─── Picking ──────────────────────────────────────────────────────────

  const ray = new Raycaster();
  let downAt = null;
  const rayFrom = (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const at = new Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(at, camera);
  };

  // The animator's pins (its keys) and their handles drag straight in the
  // view, across the screen at their depth, as a pen tool's anchors do.
  // Alt drags one handle alone (a corner); otherwise its partner mirrors it.
  let pinDrag = null;
  const pinPlane = new Plane();
  const onPinMove = (ev) => {
    if (!pinDrag || !animState) return;
    if (Math.hypot(ev.clientX - pinDrag.x, ev.clientY - pinDrag.y) > 3) pinDrag.moved = true;
    if (!pinDrag.moved) return;
    rayFrom(ev);
    const hit = ray.ray.intersectPlane(pinPlane, new Vector3());
    if (!hit) return;
    const at = hit.add(pinDrag.offset);
    if (pinDrag.handle) animState.onHandle?.(pinDrag.handle.key, pinDrag.handle.side, at, { alone: ev.altKey });
    else {
      const m = animState.keys[pinDrag.key]?.clone();
      if (m) animState.onDrag?.(pinDrag.key, m.setPosition(at));
    }
  };
  const onPinUp = (ev) => {
    const d = pinDrag;
    pinDrag = null;
    removeEventListener('pointermove', onPinMove, true);
    removeEventListener('pointerup', onPinUp, true);
    if (!d) return;
    if (d.moved) animState?.onDragEnd?.();
    else if (d.key != null) onPick({ kind: 'anim-key', index: d.key });
    void ev;
  };
  const onDown = (ev) => {
    if (ev.button !== 0) return;
    downAt = [ev.clientX, ev.clientY];
    if (!animState?.onDrag || gizmo3d.axis || editGizmo.axis || poseGizmo.axis || previewCamera) return;
    rayFrom(ev);
    const hit = ray.intersectObjects(animGroup.children.slice(1), false).find((h) => h.object.userData.animHandle || h.object.userData.animKey != null);
    if (!hit) return;
    const o = hit.object.userData;
    const centre = o.center.clone();
    pinPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), centre);
    const onPlane = ray.ray.intersectPlane(pinPlane, new Vector3()) ?? centre.clone();
    pinDrag = { key: o.animHandle ? null : o.animKey, handle: o.animHandle ?? null, offset: centre.sub(onPlane), x: ev.clientX, y: ev.clientY, moved: false };
    downAt = null; // not a click on what's behind it
    ev.stopImmediatePropagation();
    addEventListener('pointermove', onPinMove, true);
    addEventListener('pointerup', onPinUp, true);
  };
  const onUp = (ev) => {
    if (ev.button !== 0 || !downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 4 || gizmoDragging || gizmo3d.axis || editDrag || editGizmo.axis || poseDrag || poseGizmo.axis) return;
    rayFrom(ev);
    const additive = ev.ctrlKey || ev.metaKey;
    if (animState) {
      const key = ray.intersectObjects(animGroup.children.slice(1), false)[0];
      if (key) return onPick({ kind: 'anim-key', index: key.object.userData.animKey });
    }
    // Posing, only the rigs can be clicked.
    const hits = ray.intersectObjects(poseState ? [user.root, target.root] : [fx, user.root, target.root, user.ragdoll.group, target.ragdoll.group], true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      const e = h.object.userData.event;
      if (e) return onPick({ kind: 'event', event: e, additive });
      let o = h.object;
      while (o && !o.userData.part) o = o.parent;
      if (!o) continue;
      const inside = (r) => Boolean(r.root.getObjectById(o.id) || r.ragdoll.group.getObjectById(o.id));
      const who = inside(user) ? 'user' : inside(target) ? 'target' : null;
      if (who && poseState) return poseState.onPick?.(who, o.userData.part);
      if (who) return onPick({ kind: 'character', who, part: o.userData.part, additive });
    }
    if (poseState) return poseState.onPick?.(null, null);
    onPick({ kind: 'none', additive });
  };
  renderer.domElement.addEventListener('pointerdown', onDown, true);
  renderer.domElement.addEventListener('pointerup', onUp);
  ready = true;

  // ─── The avatar on "You" ──────────────────────────────────────────────

  // Dresses "You" as a Roblox avatar (look: { bodyColors, shirt, pants,
  // tshirt, face } from account.js), or back in the rig's texture.
  let lookVersion = 0;
  async function setLook(look) {
    const version = ++lookVersion;
    const clothes = look ? await composeClothing(look) : null;
    const faceImage = look?.face ? await loadImage(look.face) : null;
    if (version !== lookVersion) return; // a newer look arrived meanwhile
    const r = people.user;
    for (const name of BODY) {
      let material;
      let geometry;
      if (!look) {
        material = rigMaterial();
        geometry = geometryOf(name, 'rig').g;
      } else if (name !== 'Head' && clothes) {
        material = new MeshLambertMaterial({ map: clothes[name], transparent: true });
        geometry = geometryOf(name, 'clothing').g;
      } else {
        material = new MeshLambertMaterial({ color: bodyColor(look.bodyColors, name) || '#a3a2a5', transparent: true });
        geometry = geometryOf(name, 'clothing').g;
      }
      const old = r.parts[name].material;
      r.parts[name].material = material;
      r.parts[name].geometry = geometry;
      r.ragdoll.meshes[name].material = material;
      r.ragdoll.meshes[name].geometry = geometry;
      if (old.map && old.map !== rigTexture) old.map.dispose();
      old.dispose();
    }
    let map = face;
    if (faceImage) {
      map = new Texture(faceImage);
      map.colorSpace = SRGBColorSpace;
      map.needsUpdate = true;
    }
    r.faceMesh.visible = Boolean(look);
    r.ragdoll.face.visible = Boolean(look);
    dressAccessories(look?.accessories ?? []);
    for (const material of new Set([r.faceMesh.material, r.ragdoll.face.material])) {
      if (material.map !== face && material.map !== map) material.map?.dispose();
      material.map = map;
      material.needsUpdate = true;
    }
    show(time);
  }

  // Accessories hang on the body part their attachment names: the Handle
  // at part · body attachment · (handle attachment)⁻¹, in Roblox's frame,
  // on both the posed body and the ragdoll's loose parts.
  let worn = [];
  function dressAccessories(list) {
    for (const m of worn) m.parent?.remove(m);
    worn = [];
    const halfTurn = new Matrix4().makeRotationY(Math.PI);
    for (const a of list) {
      const model = meshOf(a.meshId);
      const tex = a.textureId ? texture(a.textureId) : null;
      const [x, y, z, ...rot] = a.handleCFrame;
      const handleAtt = new Matrix4().set(rot[0], rot[1], rot[2], x, rot[3], rot[4], rot[5], y, rot[6], rot[7], rot[8], z, 0, 0, 0, 1);
      const local = halfTurn.clone().multiply(new Matrix4().makeTranslation(...a.bodyAt)).multiply(handleAtt.invert());
      for (const host of [people.user.parts[a.part], people.user.ragdoll.meshes[a.part]]) {
        if (!host) continue;
        const mesh = new Mesh(UNIT_BOX, new MeshLambertMaterial({ color: '#a3a2a5', transparent: true }));
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        const fit = () => {
          if (!model.geometry) return;
          mesh.geometry = model.geometry;
          const box = model.geometry.boundingBox.getSize(new Vector3());
          // A MeshPart fits its mesh to its Size; a SpecialMesh scales the
          // file's own units by Scale and moves it by Offset.
          const scale = a.size ? a.size.map((s, i) => s / ([box.x, box.y, box.z][i] || 1)) : a.meshScale;
          mesh.matrix.copy(local).multiply(new Matrix4().makeTranslation(...a.offset)).multiply(new Matrix4().makeScale(...scale));
          if (tex?.map && mesh.material.map !== tex.map) {
            mesh.material.map = tex.map;
            mesh.material.color.set('#ffffff');
            mesh.material.needsUpdate = true;
          }
          mesh.visible = true;
        };
        fit();
        // Visible once the mesh is in (until then, draw nothing).
        mesh.visible = Boolean(model.geometry);
        const poll = setInterval(() => {
          if (model.geometry || model.failed) {
            clearInterval(poll);
            fit();
            show(time);
          }
        }, 300);
        host.add(mesh);
        worn.push(mesh);
      }
    }
  }

  function clearEffects() {
    for (const id of [...live.keys()]) drop(id);
    for (const id of [...effectsLive.keys()]) dropEffect(id);
  }

  return {
    setLook,
    setRun(next) {
      clearEffects();
      run = next;
      poses.clear();
      cancels = [];
      if (next)
        for (const e of next.events) {
          const n = e.node ?? {};
          if (e.kind === 'VISUAL' && n.EFFECT === 'Cancel' && n['VISUAL TAG'])
            cancels.push({ tag: `v:${n['VISUAL TAG']}`, who: e.who, part: n['BODY PART'] || 'HumanoidRootPart', t: e.t });
          if (e.kind === 'PARTICLE' && n.CANCEL === true && n['CANCEL TAG']) cancels.push({ tag: `p:${n['CANCEL TAG']}`, who: e.who, t: e.t });
        }
      baked = bakeRagdolls(next);
      followFrom = null;
      track = null;
      show(0);
      // An edit re-runs the skill: the camera stays where it is. (Follow
      // starts again from wherever the playhead shows next, rather than
      // carrying the camera from frame 0 to it.)
      followFrom = null;
    },
    show,
    get time() {
      return time;
    },
    setFollow(on) {
      follow = on;
      followFrom = null;
    },
    /** Which camera the view shows: { mode: 'free'|'auto'|'path', auto, keys, skillCamera }. */
    setCamera({ mode = camMode, auto = autoOptions, keys = pathKeys, path = pathOptions, skillCamera: skill = skillCamera } = {}) {
      pathOptions = path ?? { smooth: true, shake: null };
      if (auto !== autoOptions) track = null;
      camMode = mode;
      autoOptions = auto;
      pathKeys = keys ?? [];
      skillCamera = skill;
      followFrom = null;
      show(time);
    },
    /** Whether the skill is playing (stopped, the Free camera stays yours where a Camera block runs). */
    setPlaying(on) {
      if (playing === Boolean(on)) return;
      playing = Boolean(on);
      show(time);
    },
    /** Looks through `fn(t)` → { position, quaternion, fov } (null: your own camera). */
    setPreviewCamera(fn) {
      previewCamera = fn;
      show(time);
    },
    /** Your camera now, as a key at t (for a recorded path). */
    cameraKey: (t = time) => keyOf(t, camera),
    /** Flies your camera to a key's pose. */
    goToKey(key) {
      controls.setPose(new Vector3(...key.p), new Quaternion(...key.q));
      followFrom = null;
      show(time);
    },
    /** A body part's Roblox CFrame at t (src/fx/roblox.js), for the motion animator. */
    partFrame: (who, part, t) => frameAt(who, part || 'HumanoidRootPart', t),
    capture,
    endCapture,
    silhouettes,
    setAnimOverlay,
    setEditTool,
    setPose,
    setPoseTool,
    /** Whether a right-drag (look) or middle-drag (pan) is going on. */
    get navigating() {
      return controls.dragging;
    },
    /** The view's own canvas size, in device pixels. */
    viewSize: () => [renderer.domElement.width, renderer.domElement.height],
    setShowHitboxes(on) {
      showHitboxes = on;
      show(time);
    },
    setDummy(on) {
      dummyShown = on;
      track = null;
      show(time);
    },
    setSelected(ids) {
      selected = new Set(ids);
      show(time);
    },
    setBackground(colour) {
      scene.background = new Color(colour);
      scene.fog.color = new Color(colour);
      host.style.background = colour;
      show(time);
    },
    setAspect(ratio) {
      aspect = ratio || null;
      resize();
    },
    // Back to three quarters on, in front and to your right, framing both.
    resetCamera() {
      const focus = run ? middle() : new Vector3(0, 3, 2.5);
      const apart = dummyShown ? people.user.root.position.distanceTo(people.target.root.position) : 0;
      const from = new Vector3(...HOME_CAMERA).sub(new Vector3(0, 3, 2.5)).normalize();
      controls.set(focus.clone().addScaledVector(from, Math.max(18, apart * 1.2 + 8)), focus);
      followFrom = null;
      show(time);
    },
    resize,
    // For dev tools: where things are.
    inspect: () => ({
      camera: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      target: controls.target?.toArray?.(),
      user: people.user.root.position.toArray(),
      bodyVisible: people.user.body.visible,
      fov: camera.fov,
      size: [renderer.domElement.width, renderer.domElement.height],
    }),
    dispose() {
      onRigLoaded.delete(redrawOnRig);
      watcher.disconnect();
      controls.dispose();
      gizmo.dispose();
      gizmo3d.dispose();
      editGizmo.dispose();
      poseGizmo.dispose();
      removeEventListener('keydown', snapKeys);
      removeEventListener('keyup', snapKeys);
      renderer.domElement.removeEventListener('pointerdown', onDown, true);
      removeEventListener('pointermove', onPinMove, true);
      removeEventListener('pointerup', onPinUp, true);
      renderer.domElement.removeEventListener('pointerup', onUp);
      clearEffects();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material?.map !== rigTexture) o.material?.map?.dispose?.();
        o.material?.dispose?.();
      });
      for (const t of textures.values()) t.map?.dispose?.();
      for (const m of meshes.values()) m.geometry?.dispose?.();
      gradeTarget?.dispose();
      shotTarget?.dispose();
      shotOut?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/**
 * A little looping view of one animation's stand-in pose, for the
 * inspector: `setAnim(ANIM_USE)` picks it.
 */
export function mountPosePreview(host) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.append(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(-6, 4.5, 8);
  camera.lookAt(0, 2.6, 0);
  scene.add(new HemisphereLight('#ffffff', '#3a3f45', 1.6), new AmbientLight('#ffffff', 0.5));
  const body = buildCharacter(faceTexture());
  scene.add(body.root);
  let anim = null;
  let frame = 0;
  const started = performance.now();
  const size = () => {
    const w = host.clientWidth || 200;
    const h = host.clientHeight || 150;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const watcher = new ResizeObserver(size);
  watcher.observe(host);
  const tick = (now) => {
    const p = (((now - started) / 1000) % 1.2) / 1.2;
    resetPose(body);
    if (anim) POSES[poseIndex(anim)](body, Math.sin(p * Math.PI), p);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    setAnim(use) {
      anim = use;
    },
    dispose() {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
