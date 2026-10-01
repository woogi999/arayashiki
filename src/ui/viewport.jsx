// The 3D Viewport: the centre of the window, as in Blender. Your R6 character
// and the dummy play the simulated skill; their plates sit in the corners.
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { robloxImage, robloxMesh } from '../platform.js';
import { IconButton, Toggle } from './controls.jsx';
import { Area } from './area.jsx';
import { lazy } from './lazy.jsx';

const AutoCameraOptions = lazy(() => import('./media.jsx'), 'AutoCameraOptions');
const camMenu = signal(false);

const CAMERAS = [
  ['free', 'Free', 'Your camera: right-drag to look, WASD to fly'],
  ['auto', 'Auto', 'A cinematographer that frames the fight'],
  ['path', 'Recorded', 'Your camera keys (K) or a recorded take'],
];

// The camera menu: the skill's own camera, the auto camera's settings, and
// the recorded path for videos.
function CameraMenu() {
  if (!camMenu.value) return null;
  const keys = S.camKeys.value;
  return (
    <div class="cam-menu" role="dialog" aria-label="Camera">
      <div class="cam-menu-head">
        <strong>Camera</strong>
        <span class="spacer" />
        <IconButton icon="x" size={12} label="Close" onClick={() => (camMenu.value = false)} />
      </div>
      <label class="prop-row">
        <span>The skill’s own camera</span>
        <input
          type="checkbox"
          checked={S.skillCamera.value}
          title="Camera blocks, FOV and shakes take over while they run"
          onChange={(e) => (S.skillCamera.value = e.currentTarget.checked)}
        />
      </label>
      {S.camMode.value === 'auto' && <AutoCameraOptions />}
      <h4 class="section-title">Recorded path ({keys.length} key{keys.length === 1 ? '' : 's'})</h4>
      <p class="hint">A camera for videos and screenshots, flown and keyed like a camera animation. It doesn’t change the skill.</p>
      <div class="cam-menu-actions">
        <button
          type="button"
          class="btn btn-default"
          onClick={() => {
            camMenu.value = false;
            import('./campath.jsx').then((m) => m.openCameraPath());
          }}
        >
          Edit the camera path…
        </button>
        <button type="button" class={`btn ${S.recordingCam.value ? 'btn-primary' : 'btn-default'}`} onClick={S.recordCamera}>
          {S.recordingCam.value ? 'Stop recording' : 'Record a take'}
        </button>
      </div>
    </div>
  );
}

const viewState = signal('loading'); // 'loading' | 'ready' | error text

function Plate({ who, label, hp, items }) {
  return (
    <div class={`plate plate-${who} ${hp !== undefined && hp <= 30 ? 'is-low' : ''}`}>
      <div class="plate-top">
        <span class="plate-name">{label}</span>
        {hp !== undefined && <span class="plate-hp num">{hp}</span>}
      </div>
      {hp !== undefined && (
        <div
          class="hp"
          role="meter"
          aria-label="The dummy’s health"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hp}
        >
          <span style={{ transform: `scaleX(${hp / 100})` }} />
        </div>
      )}
      <ul class="plate-states">
        {items.map((s, i) => (
          <li key={i} class={s.tag ? 'is-tag' : ''}>
            <span>{s.label}</span>
            <span class="num">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Plates() {
  const hud = S.hud.value;
  return (
    <div class="plates">
      <Plate who="you" label="You" items={hud.user} />
      {S.dummy.value.present !== false && <Plate who="dummy" label="Dummy" hp={S.targetHp.value} items={hud.target} />}
    </div>
  );
}

// Shapes to frame the view as, to see a move the way a player's screen would.
const ASPECTS = [
  ['', 'Fill'],
  ['16:9', '16:9'],
  ['16:10', '16:10'],
  ['4:3', '4:3'],
  ['1:1', '1:1'],
  ['21:9', '21:9'],
  ['2.39:1', '2.39:1'],
  ['9:16', '9:16 (phone)'],
];

export function Viewport() {
  const host = useRef(null);
  useEffect(() => {
    let gone = false;
    let scene = null;
    import('../scene.js')
      .then(({ mountSkillScene }) => {
        if (gone) return;
        scene = mountSkillScene(host.current, { textureUrl: robloxImage, meshData: robloxMesh, onPick: S.pickInView });
        S.attachScene(scene);
        viewState.value = 'ready';
      })
      .catch((error) => (viewState.value = error?.message ?? 'The 3D view couldn’t start.'));
    return () => {
      gone = true;
      S.attachScene(null);
      scene?.dispose();
    };
  }, []);
  const state = viewState.value;
  const tools = (
    <>
      <span class="spacer" />
      <div class="segmented view-cams" role="group" aria-label="Camera">
        {CAMERAS.map(([id, label, title]) => (
          <button
            type="button"
            key={id}
            title={title}
            aria-pressed={S.camMode.value === id}
            disabled={id === 'path' && !S.camKeys.value.length}
            onClick={() => (S.camMode.value = id)}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" class={`head-btn ${camMenu.value ? 'is-on' : ''}`} aria-expanded={camMenu.value} onClick={() => (camMenu.value = !camMenu.value)}>
        Camera…
      </button>
      {S.recordingCam.value && <span class="rec-dot" title="Recording the camera">REC</span>}
      <Toggle checked={S.follow.value} onChange={(on) => (S.follow.value = on)} title="Keep both characters in view">
        Follow
      </Toggle>
      <Toggle
        checked={S.showHitboxes.value}
        onChange={(on) => (S.showHitboxes.value = on)}
        title="Draw hitboxes (red) and projectiles (orange)"
      >
        Hitboxes
      </Toggle>
      <select
        class="input view-aspect"
        aria-label="Screen shape"
        title="Frame the view as a screen of this shape"
        value={S.aspect.value}
        onChange={(e) => (S.aspect.value = e.currentTarget.value)}
      >
        {ASPECTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <Toggle
        checked={S.sounds.value}
        onChange={(on) => (S.sounds.value = on)}
        title="Play the skill’s Roblox sounds, where they’re public"
      >
        Sounds
      </Toggle>
      <IconButton icon="locate-fixed" label="Reset the camera" size={14} onClick={S.resetCamera} />
    </>
  );
  return (
    <Area name="view" icon="box" title="Viewport" tools={tools}>
      <div class="viewport" ref={host}>
        {state !== 'ready' && <p class="view-note">{state === 'loading' ? 'Loading the viewport…' : state}</p>}
        <Plates />
        <CameraMenu />
        <p class="view-hint">
          {S.camMode.value === 'free'
            ? 'Click an effect to open its node · Right-drag to look · Middle-drag to pan · Wheel to zoom · WASD QE to fly · F to frame you · K to key the camera'
            : `Camera: ${S.camMode.value === 'auto' ? 'Auto' : 'Recorded'} · pick Free to fly`}
        </p>
      </div>
    </Area>
  );
}
