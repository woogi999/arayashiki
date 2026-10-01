// The recorded camera path for watching and exporting (not the skill's own
// camera): keys you fly to in the viewport, laid on the timeline, edited the
// way the skill animator edits a Camera block. Each key has a time, a place,
// a turn, a field of view and how it eases into the next; the path can run a
// curve through them and shake. Drag a key's gizmo in the viewport, or type.
//
// The keys live in the store (camKeys, camPath) with the rest of the
// session; src/camera-rig.js plays them.
import { effect, signal } from '@preact/signals';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import * as S from '../store.js';
import { pathAt } from '../camera-rig.js';
import { Button, IconButton, Switch } from './controls.jsx';
import { EaseSelect, FloatingPanel, Num, ShakeFields, Vec } from './keys-ui.jsx';

const picked = signal(0);
const note = signal(null);
const RAD = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

const turnOf = (q) => {
  const e = new Euler().setFromQuaternion(new Quaternion(...q), 'YXZ');
  return [e.x / RAD, e.y / RAD, e.z / RAD].map((v) => Math.round(v * 100) / 100);
};
const quatOf = ([x, y, z]) => new Quaternion().setFromEuler(new Euler(x * RAD, y * RAD, z * RAD, 'YXZ')).toArray().map((v) => Math.round(v * 1e5) / 1e5);

export function openCameraPath() {
  import('./animator.jsx').then((m) => m.closeAnimator());
  S.camPathOpen.value = true;
  if (S.camMode.peek() === 'path') S.camMode.value = 'free';
  if (!S.camKeys.peek().length) note.value = 'Fly the viewport to the first shot, move the playhead, and press “Key from view” (K). Repeat for each shot.';
}
export const closeCameraPath = () => (S.camPathOpen.value = false);
export const pickCameraKey = (i) => {
  picked.value = i;
  const k = S.camKeys.peek()[i];
  if (k) S.seek(k.t);
};

function setKeys(keys) {
  S.camKeys.value = [...keys].sort((a, b) => a.t - b.t);
}
function setKey(i, patch) {
  const keys = S.camKeys.peek().map((k, j) => (j === i ? { ...k, ...patch } : k));
  const mine = keys[i];
  setKeys(keys);
  picked.value = S.camKeys.peek().indexOf(mine);
}

/** A key from your view: at the playhead, or after the key the playhead is on. */
export function addViewKey() {
  const scene = S.sceneNow();
  if (!scene) return;
  if (S.camMode.peek() !== 'free') S.camMode.value = 'free';
  const keys = S.camKeys.peek();
  let t = r3(S.time.peek());
  const on = keys.findIndex((k) => Math.abs(k.t - t) < 0.02);
  if (on >= 0) {
    const next = keys[on + 1];
    t = r3(next ? (keys[on].t + next.t) / 2 : Math.min(S.duration.peek() || keys[on].t + 0.5, keys[on].t + 0.5));
    if (Math.abs(t - keys[on].t) < 0.02) t = r3(keys[on].t + 0.5);
  }
  const key = { ...scene.cameraKey(t), t, ease: keys.findLast((k) => k.t <= t)?.ease ?? 'Sine InOut' };
  setKeys([...keys, key]);
  picked.value = S.camKeys.peek().indexOf(key);
  S.seek(Math.min(t, S.duration.peek()));
  note.value = `Key ${picked.value + 1} at ${t.toFixed(2)}s.`;
}

function setToView(i) {
  const scene = S.sceneNow();
  const k = S.camKeys.peek()[i];
  if (!scene || !k) return;
  const v = scene.cameraKey(k.t);
  setKey(i, { p: v.p, q: v.q, fov: v.fov });
}

function deleteKey(i) {
  const keys = S.camKeys.peek().filter((_, j) => j !== i);
  setKeys(keys);
  picked.value = Math.max(0, Math.min(i, keys.length - 1));
  if (!keys.length && S.camMode.peek() === 'path') S.camMode.value = 'free';
}

// ─── The viewport ───────────────────────────────────────────────────────

effect(() => {
  const open = S.camPathOpen.value;
  const keys = S.camKeys.value;
  const options = S.camPath.value;
  const sel = picked.value;
  const scene = S.sceneNow();
  if (!scene) return;
  if (!open) {
    if (!S.animatorOpen.peek()) scene.setAnimOverlay(null);
    return;
  }
  const world = (k) => new Matrix4().compose(new Vector3(...k.p), new Quaternion(...k.q), new Vector3(1, 1, 1));
  const path = [];
  if (keys.length > 1)
    for (let t = keys[0].t; t <= keys.at(-1).t + 1e-6; t += 1 / 30) path.push(pathAt(keys, t, { smooth: options.smooth }).position);
  scene.setAnimOverlay({
    keys: keys.map(world),
    path,
    selected: sel,
    mode: 'translate',
    camera: true,
    onDrag(i, m) {
      const p = new Vector3();
      const q = new Quaternion();
      m.decompose(p, q, new Vector3());
      S.camKeys.value = S.camKeys.peek().map((k, j) => (j === i ? { ...k, p: p.toArray().map(r3), q: q.toArray().map((v) => Math.round(v * 1e5) / 1e5) } : k));
    },
    onDragEnd: () => {},
  });
});

// ─── The panel ──────────────────────────────────────────────────────────

export function CameraPathPanel() {
  if (!S.camPathOpen.value) return null;
  const keys = S.camKeys.value;
  const options = S.camPath.value;
  const sel = picked.value;
  const watching = S.camMode.value === 'path';
  const end = keys.at(-1)?.t ?? S.duration.value;
  return (
    <FloatingPanel id="campath" icon="route" title="Camera path for video" badge={`${keys.length} key${keys.length === 1 ? '' : 's'}`} onClose={closeCameraPath} width={760} height={580}>
      <p class="hint">
        The camera a video or screenshot can use (Camera: Recorded). It doesn’t change the skill. To animate the camera players see in JJS, use a camera animation instead.
      </p>
      <div class="key-toolbar">
        <Button icon="plus" onClick={addViewKey} title="A key where your view is, at the playhead (K)">
          Key from view
        </Button>
        <Button icon="camera" disabled={!keys.length} onClick={() => setToView(sel)} title="Put the picked key where your view is">
          Set key {keys.length ? sel + 1 : ''} to view
        </Button>
        <Button icon="video" onClick={S.recordCamera} title="Play the skill and record your flying, every frame a key">
          {S.recordingCam.value ? 'Stop recording' : 'Record a take'}
        </Button>
        <span class="spacer" />
        <label class="key-watch">
          <Switch
            checked={watching}
            label="Watch through the path"
            onChange={(on) => {
              if (on && !keys.length) return;
              S.camMode.value = on ? 'path' : 'free';
            }}
          />
          <span>Watch through it</span>
        </label>
      </div>
      {keys.length ? (
        <div class="key-table" role="table" aria-label="Camera keys">
          <div class="key-row is-head is-path" role="row">
            <span>#</span>
            <span>Time</span>
            <span>Position (world)</span>
            <span>Turn: pitch, yaw, roll (°)</span>
            <span>FOV</span>
            <span>Easing to next</span>
            <span />
          </div>
          {keys.map((k, i) => (
            <div key={`${i}-${k.t}`} role="row" class={`key-row is-path ${i === sel ? 'is-picked' : ''}`} onPointerDown={() => (picked.value = i)}>
              <button
                type="button"
                class="key-n num"
                title="Go to this key and fly there"
                onClick={() => {
                  picked.value = i;
                  S.goToCameraKey(k);
                }}
              >
                {i + 1}
              </button>
              <Num label="Time (s)" step={0.05} min={0} value={k.t} onChange={(v) => setKey(i, { t: Math.max(0, v) })} />
              <Vec label="Position" step={0.5} value={k.p} onChange={(p) => setKey(i, { p })} />
              <Vec label="Turn" step={5} labels={['pitch', 'yaw', 'roll']} value={turnOf(k.q)} onChange={(turn) => setKey(i, { q: quatOf(turn) })} />
              <Num label="Field of view" step={1} min={10} max={120} width={48} value={k.fov ?? 70} onChange={(fov) => setKey(i, { fov })} />
              {i < keys.length - 1 ? <EaseSelect value={k.ease ?? 'Sine InOut'} onChange={(ease) => setKey(i, { ease })} /> : <span class="hint">last</span>}
              <span class="key-actions">
                <IconButton icon="camera" size={12} label={`Set key ${i + 1} to your view`} onClick={() => setToView(i)} />
                <IconButton icon="trash-2" class="danger" size={12} label={`Delete key ${i + 1}`} onClick={() => deleteKey(i)} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p class="empty pad">No keys yet. Fly to a shot and press Key from view (K).</p>
      )}
      <div class="key-options">
        <label class="prop-row">
          <span>Smooth curve through the keys</span>
          <Switch checked={options.smooth !== false} label="Smooth curve" onChange={(smooth) => (S.camPath.value = { ...options, smooth })} />
        </label>
        <h4 class="section-title">Shake</h4>
        <ShakeFields shake={options.shake} end={end} onChange={(shake) => (S.camPath.value = { ...options, shake })} />
      </div>
      {note.value && <p class="hint key-note">{note.value}</p>}
      <div class="modal-actions">
        <Button variant="ghost" class="danger" icon="trash-2" disabled={!keys.length} onClick={S.clearCameraKeys}>
          Clear all keys
        </Button>
        <span class="spacer" />
        <Button
          variant="primary"
          icon="play"
          disabled={keys.length < 2}
          onClick={() => {
            S.camMode.value = 'path';
            S.seek(keys[0].t);
            S.play();
          }}
        >
          Preview
        </Button>
      </div>
    </FloatingPanel>
  );
}
