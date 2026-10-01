// The Progress Bar Maker's 3D preview: where the bar's billboard sits on an
// R6 character, and how it looks there. The character and floor are the 3D
// Viewport's own (src/scene.js); the billboard is a square sprite, SIZE × 2
// studs across, on the HumanoidRootPart.
//
// A JJS billboard is placed pseudo-2D (confirmed in-game): its offset is on
// the screen, not in the world. x goes across (negative is to the right), y
// up and down, and z is its layer, like a z-index: negative in front of the
// character, positive behind it. So the offset here follows the camera.

import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { baseplateTexture, buildCharacter, faceTexture } from '../scene.js';
import { vec3 } from '../../core/barskill.js';

const HOME = [-6, 6, 9];

export function mountBarScene(host) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.className = 'scene-canvas';
  host.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#202020');
  scene.fog = new Fog('#202020', 40, 140);
  const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(...HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3.5, 0);
  controls.update();
  scene.add(new HemisphereLight('#ffffff', '#3a3f45', 1.5));
  scene.add(new AmbientLight('#ffffff', 0.5));
  const sun = new DirectionalLight('#ffffff', 1.4);
  sun.position.set(-20, 40, 10);
  scene.add(sun);
  const plate = new Mesh(new PlaneGeometry(512, 512), new MeshBasicMaterial({ map: baseplateTexture() }));
  plate.rotation.x = -Math.PI / 2;
  scene.add(plate);
  const you = buildCharacter({ skin: '#f5cd30', torso: '#0d69ac', legs: '#a4bd47' }, faceTexture());
  scene.add(you.root);

  const sprite = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
  scene.add(sprite);

  let offset = [0, 0, 0];
  let loads = 0;

  // Screen right and up, from the camera, around the root part.
  function place() {
    const [x, y, z] = offset;
    camera.updateMatrixWorld();
    const centre = new Vector3();
    you.torso.getWorldPosition(centre);
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const toCamera = new Vector3().subVectors(camera.position, centre).normalize();
    sprite.position.copy(centre).addScaledVector(right, -x).addScaledVector(up, y);
    // In front: drawn over the character. Behind: pushed back past it, so the
    // body covers it. At 0: where it is, in the middle of the body.
    sprite.material.depthTest = z >= 0;
    sprite.renderOrder = z < 0 ? 10 : 0;
    if (z > 0) sprite.position.addScaledVector(toCamera, -1.5);
    sprite.material.needsUpdate = true;
  }

  const render = () => {
    place();
    renderer.render(scene, camera);
  };
  function resize() {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);
  controls.addEventListener('change', render);

  return {
    // The picture is a `canvas` (the maker's own drawing) or a `url` (a
    // Roblox image, for image IDs); `position` is the POSITION field.
    update({ canvas, url, size, position }) {
      const swap = (map) => {
        const old = sprite.material.map;
        if (map) map.colorSpace = SRGBColorSpace;
        sprite.material.map = map;
        sprite.material.color.set(map ? '#ffffff' : '#5a5a5a');
        sprite.material.needsUpdate = true;
        if (old !== map) old?.dispose();
      };
      const load = ++loads;
      if (canvas) swap(new CanvasTexture(canvas));
      else if (url)
        new TextureLoader().load(url, (map) => {
          if (load === loads) {
            swap(map);
            render();
          } else map.dispose();
        });
      else swap(null);
      offset = vec3(position);
      const s = Math.max(0.1, Number(size) || 0) * 2;
      sprite.scale.set(s, s, 1);
      render();
    },
    resetCamera() {
      camera.position.set(...HOME);
      controls.target.set(0, 3.5, 0);
      controls.update();
    },
    dispose() {
      watcher.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.map?.dispose?.();
        o.material?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
