// The auto-sheathing template's 3D preview: an R6 character wearing the
// weapon (and its scabbard) where the skill puts them, sheathed and drawn,
// so a POSITION or ROTATION can be checked before it goes into JJS. Click a
// mesh to drag it into place, as in Blender (Move, or Turn: G and R): its
// POSITION and ROTATION are worked out back from where it ends up.
//
// Each mesh is placed the way the 3D Viewport places a Mesh VISUAL
// (src/fx/builderfx.js, shape()): the body part's Roblox CFrame ·
// CFrame.new(-x, y, -z) · CFrame.fromOrientation(ROTATION) · SIZE, its mesh
// centred on its bounding box as Roblox draws it.

import {
  AmbientLight,
  Euler,
  Object3D,
  Quaternion,
  Raycaster,
  Vector2,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { baseplateTexture, buildCharacter, faceTexture } from '../scene.js';
import { readRobloxMesh } from '../rbxmesh.js';
import { RAD, cfOrient, cfPos, robloxFrame } from '../fx/roblox.js';
import { robloxImage, robloxMesh } from '../platform.js';
import { vec3 } from '../../core/schema.js';

const HOME = [5, 5.5, -8];

// Loaded once per ID for the dialog's life (and the app's).
const geometries = new Map();
const maps = new Map();
function geometryOf(id) {
  const key = String(id ?? '');
  if (!geometries.has(key))
    geometries.set(
      key,
      robloxMesh(key)
        .then((bytes) => (bytes ? readRobloxMesh(bytes) : null))
        .then((g) => {
          if (!g) return null;
          const centre = g.boundingBox.getCenter(new Vector3());
          g.translate(-centre.x, -centre.y, -centre.z);
          return g;
        })
        .catch(() => null),
    );
  return geometries.get(key);
}
function mapOf(id) {
  const key = String(id ?? '');
  if (!key || key === '0') return Promise.resolve(null);
  if (!maps.has(key))
    maps.set(
      key,
      robloxImage(key)
        .then((url) =>
          url
            ? new Promise((done) =>
                new TextureLoader().setCrossOrigin('anonymous').load(
                  url,
                  (map) => {
                    map.colorSpace = SRGBColorSpace;
                    map.wrapS = map.wrapT = RepeatWrapping;
                    done(map);
                  },
                  undefined,
                  () => done(null),
                ),
              )
            : null,
        )
        .catch(() => null),
    );
  return maps.get(key);
}

const r3 = (v) => Math.round(v * 1000) / 1000 || 0;

/**
 * Mounts the preview in `host`. `onEdit(index, { position, rotation })` hears
 * a mesh dragged to a new place (the item's index in the last update), as
 * the "x, y, z" text the template's fields take.
 */
export function mountSheathScene(host, { onEdit = () => {}, onPick = () => {} } = {}) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.className = 'scene-canvas';
  host.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color('#202020');
  scene.fog = new Fog('#202020', 40, 140);
  const camera = new PerspectiveCamera(50, 1, 0.05, 1000);
  camera.position.set(...HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3, 0);
  controls.update();
  scene.add(new HemisphereLight('#ffffff', '#3a3f45', 1.5));
  scene.add(new AmbientLight('#ffffff', 0.5));
  const sun = new DirectionalLight('#ffffff', 1.4);
  sun.position.set(-20, 40, 10);
  scene.add(sun);
  const plate = new Mesh(new PlaneGeometry(512, 512), new MeshBasicMaterial({ map: baseplateTexture() }));
  plate.rotation.x = -Math.PI / 2;
  scene.add(plate);
  const you = buildCharacter(faceTexture(), { textured: true });
  scene.add(you.root);

  let shown = [];
  let items = [];
  let version = 0;
  let picked = -1;
  let mode = 'translate';
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  // The gizmo, on a stand-in at the picked mesh (the mesh's own matrix
  // carries its scale, which the gizmo mustn't touch).
  const proxy = new Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSize(0.8);
  const helper = gizmo.getHelper();
  helper.visible = false;
  scene.add(helper);
  gizmo.addEventListener('change', render);
  gizmo.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (!e.value && picked >= 0) onEdit(picked, fieldsOf(picked));
  });
  gizmo.addEventListener('objectChange', () => {
    const m = shown[picked];
    if (!m) return;
    proxy.updateMatrixWorld();
    const s = m.userData.scale;
    m.matrix.copy(proxy.matrixWorld).multiply(new Matrix4().makeScale(s, s, s));
    render();
  });
  // Where the dragged stand-in is, as the item's POSITION and ROTATION on its body part.
  function fieldsOf(i) {
    const part = you.parts[items[i].part] ?? you.parts.HumanoidRootPart;
    const local = robloxFrame(part.matrixWorld).invert().multiply(proxy.matrixWorld.clone());
    const p = new Vector3();
    const q = new Quaternion();
    local.decompose(p, q, new Vector3());
    const e = new Euler().setFromQuaternion(q, 'YXZ');
    // CFrame.new(-x, y, -z) · fromOrientation(rx, ry, rz): back to x, y, z and degrees.
    return {
      position: [-p.x, p.y, -p.z].map(r3).join(', '),
      rotation: [e.x / RAD, e.y / RAD, e.z / RAD].map((v) => Math.round(v * 10) / 10 || 0).join(', '),
    };
  }
  function attach() {
    const m = shown[picked];
    if (!m) {
      gizmo.detach();
      helper.visible = false;
      return render();
    }
    const s = m.userData.scale;
    m.matrix.clone().multiply(new Matrix4().makeScale(1 / s, 1 / s, 1 / s)).decompose(proxy.position, proxy.quaternion, proxy.scale);
    proxy.updateMatrixWorld();
    gizmo.attach(proxy);
    gizmo.setMode(mode);
    gizmo.setSpace(mode === 'rotate' ? 'local' : 'world');
    helper.visible = true;
    render();
  }
  // A click (not a drag) on a mesh picks it; on nothing, lets go.
  const ray = new Raycaster();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || gizmo.axis) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(shown, false)[0];
    picked = hit ? shown.indexOf(hit.object) : -1;
    onPick(picked, picked >= 0 ? items[picked] : null);
    attach();
  });

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);

  /**
   * The meshes to wear: [{ mesh, texture, part, position, rotation, size,
   * ghost }]; `ghost` draws one see-through (the other state, for comparing).
   * Returns how many of their meshes couldn't be loaded.
   */
  async function update(list) {
    const mine = ++version;
    const loaded = await Promise.all(list.map(async (it) => ({ it, g: await geometryOf(it.mesh), map: await mapOf(it.texture) })));
    if (mine !== version) return 0;
    for (const m of shown) {
      scene.remove(m);
      m.material.dispose();
    }
    shown = [];
    you.root.updateMatrixWorld(true);
    let missing = 0;
    for (const { it, g, map } of loaded) {
      const part = you.parts[it.part] ?? you.parts.HumanoidRootPart;
      const [x, y, z] = vec3(it.position);
      const [rx, ry, rz] = vec3(it.rotation);
      const s = Number(it.size) || 1;
      const frame = robloxFrame(part.matrixWorld).multiply(cfPos(-x, y, -z)).multiply(cfOrient(rx, ry, rz));
      if (!g) missing++;
      const material = new MeshLambertMaterial({
        color: map ? '#ffffff' : '#9aa4ad',
        map,
        transparent: Boolean(it.ghost) || !g,
        opacity: it.ghost ? 0.3 : g ? 1 : 0.45,
        depthWrite: !it.ghost,
      });
      // A mesh Roblox wouldn't hand over: a small marker where it would be.
      const m = new Mesh(g ?? new SphereGeometry(0.3, 16, 12), material);
      m.matrixAutoUpdate = false;
      m.userData.scale = g ? s : 1;
      m.matrix.copy(frame).multiply(new Matrix4().makeScale(m.userData.scale, m.userData.scale, m.userData.scale));
      scene.add(m);
      shown.push(m);
    }
    items = list;
    // The picked one stays picked across a redraw (its fields changed).
    if (picked >= shown.length) picked = -1;
    attach();
    return missing;
  }

  resize();
  return {
    update,
    /** 'translate' (Move) or 'rotate' (Turn). */
    setMode(next) {
      mode = next;
      attach();
    },
    /** Picks a mesh by its index (-1: none). */
    pick(i) {
      picked = i;
      attach();
    },
    resetCamera() {
      camera.position.set(...HOME);
      controls.target.set(0, 3, 0);
      controls.update();
      render();
    },
    dispose() {
      watcher.disconnect();
      gizmo.dispose();
      controls.dispose();
      for (const m of shown) m.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
