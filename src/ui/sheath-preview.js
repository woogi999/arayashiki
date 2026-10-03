// The auto-sheathing template's 3D preview: an R6 character wearing the
// weapon (and its scabbard) where the skill puts them, sheathed and drawn,
// so a POSITION or ROTATION can be checked before it goes into JJS.
//
// Each mesh is placed the way the 3D Viewport places a Mesh VISUAL
// (src/fx/builderfx.js, shape()): the body part's Roblox CFrame ·
// CFrame.new(-x, y, -z) · CFrame.fromOrientation(ROTATION) · SIZE, its mesh
// centred on its bounding box as Roblox draws it.

import {
  AmbientLight,
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
import { baseplateTexture, buildCharacter, faceTexture } from '../scene.js';
import { readRobloxMesh } from '../rbxmesh.js';
import { cfOrient, cfPos, robloxFrame } from '../fx/roblox.js';
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

export function mountSheathScene(host) {
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
  let version = 0;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

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
  async function update(items) {
    const mine = ++version;
    const loaded = await Promise.all(items.map(async (it) => ({ it, g: await geometryOf(it.mesh), map: await mapOf(it.texture) })));
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
      m.matrix.copy(frame).multiply(new Matrix4().makeScale(g ? s : 1, g ? s : 1, g ? s : 1));
      scene.add(m);
      shown.push(m);
    }
    render();
    return missing;
  }

  resize();
  return {
    update,
    resetCamera() {
      camera.position.set(...HOME);
      controls.target.set(0, 3, 0);
      controls.update();
      render();
    },
    dispose() {
      watcher.disconnect();
      controls.dispose();
      for (const m of shown) m.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
