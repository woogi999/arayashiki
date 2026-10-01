// The Meter Maker's 3D preview: where the bar's billboard sits on an R6
// character, and how it looks there. The character and floor are the 3D
// Viewport's own (src/scene.js).
//
// A JJS billboard is placed pseudo-2D (confirmed in-game): its offset is on
// the screen, not in the world. x goes across (negative is to the right), y
// up and down, and z is its layer, like a z-index: negative in front of the
// character, positive behind it. It's placed the way BuilderFX does it (and
// the 3D Viewport draws it, src/fx/builderfx.js): a BillboardGui 15 studs
// square on the root part, the picture 0.15 × SIZE of it (2.25 × SIZE
// studs), at x = -x / 10 + 0.5 and y = -y / 10 + 0.5 of it (1.5 studs a
// unit), pushed z studs away from the camera.
//
// A meter in layers ("Complex Separate") is several billboards, one in front
// of the other by their z: the container at the back, the catch-up trail,
// then the meter.

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

  // One sprite per layer: [{ canvas | url, z }], back to front.
  let sprites = [];
  let size = 2;
  let offset = [0, 0, 0];
  let loads = 0;
  const GUI = 15;

  // Screen right and up, from the camera, around the root part.
  function place() {
    camera.updateMatrixWorld();
    const centre = new Vector3();
    you.torso.getWorldPosition(centre);
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    const [x, y] = offset;
    const across = 0.15 * size * GUI;
    for (const sp of sprites) {
      const z = sp.userData.z;
      sp.position
        .copy(centre)
        .addScaledVector(right, (-x / 10) * GUI)
        .addScaledVector(up, (y / 10) * GUI)
        .addScaledVector(back, -z);
      sp.scale.set(across, across, 1);
      // In front (negative z): drawn over the character; behind, the body covers it.
      sp.material.depthTest = z >= 0;
      // The more negative, the later it's drawn: over the ones behind it.
      sp.renderOrder = 10 - z * 1000;
      sp.material.needsUpdate = true;
    }
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
    // Roblox image, for image IDs); `position` is the POSITION field. A meter
    // in layers passes `layers`: [{ canvas, z }], each z added to the
    // position's.
    update({ canvas, url, size: s, position, layers }) {
      const load = ++loads;
      offset = vec3(position);
      size = Math.max(0.1, Number(s) || 0);
      const want = layers ?? [{ canvas, url, z: 0 }];
      for (const sp of sprites) {
        scene.remove(sp);
        sp.material.map?.dispose();
        sp.material.dispose();
      }
      sprites = want.map((l) => {
        const sp = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
        sp.userData.z = offset[2] + (l.z ?? 0);
        const set = (map) => {
          if (map) map.colorSpace = SRGBColorSpace;
          sp.material.map = map;
          sp.material.color.set(map ? '#ffffff' : '#5a5a5a');
          sp.material.needsUpdate = true;
        };
        if (l.canvas) set(new CanvasTexture(l.canvas));
        else if (l.url)
          new TextureLoader().load(l.url, (map) => {
            if (load === loads) {
              set(map);
              render();
            } else map.dispose();
          });
        else set(null);
        scene.add(sp);
        return sp;
      });
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
