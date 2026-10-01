// Pictures and videos of the 3D view: the Screenshot dialog (F12) and the
// Export Video dialog (Ctrl+F12), and the auto camera's settings they share
// with the viewport. The work is in src/video/capture.js, loaded when first
// used (it carries the encoders).
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { isDesktop, revealFile, saveBlob } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, Modal, Segmented, Switch } from './controls.jsx';

const close = () => (S.dialog.value = null);
const capture = () => import('../video/capture.js');

export const AUTO_ANGLES = [
  ['three-quarter', 'Three-quarter'],
  ['side', 'Side on'],
  ['front', 'Front'],
  ['behind', 'Over the shoulder'],
  ['low', 'Low hero shot'],
  ['high', 'High'],
  ['top', 'Top down'],
  ['orbit', 'Orbit'],
];
const AUTO_DEFAULTS = { angle: 'three-quarter', framing: 'medium', subject: 'both', smooth: 0.6, orbitSpeed: 25, height: 0, punch: true, shake: 0.5, dutch: 0, dutchOnHit: true, fov: 70 };

const SIZES = [
  { id: '1280x720', label: '720p · 1280 × 720', w: 1280, h: 720 },
  { id: '1920x1080', label: '1080p · 1920 × 1080', w: 1920, h: 1080 },
  { id: '2560x1440', label: '1440p · 2560 × 1440', w: 2560, h: 1440 },
  { id: '3840x2160', label: '4K · 3840 × 2160', w: 3840, h: 2160 },
  { id: '1080x1920', label: 'Vertical · 1080 × 1920', w: 1080, h: 1920 },
  { id: '1080x1080', label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  { id: 'view', label: 'The viewport’s size' },
  { id: 'custom', label: 'Custom…' },
];
const FORMATS = [
  { id: 'mp4', label: 'MP4', title: 'H.264: plays everywhere (no transparency)' },
  { id: 'mov', label: 'MOV', title: 'QuickTime: H.264, or PNG frames with transparency' },
  { id: 'webm', label: 'WebM', title: 'VP9, with transparency if asked' },
];
const BACKGROUNDS = [
  { id: 'scene', label: 'The room', title: 'The viewport’s background, floor and wall' },
  { id: 'transparent', label: 'Transparent', title: 'Only the characters and effects, with alpha (MOV or WebM)' },
  { id: 'green', label: 'Green screen', title: 'Pure #00FF00 behind the characters, to key out in an editor' },
  { id: 'colour', label: 'Colour', title: 'A flat colour of your choice' },
];
const SPEEDS = [
  { id: '1', label: 'Real time' },
  { id: '0.5', label: '½ slow-mo' },
  { id: '0.25', label: '¼ slow-mo' },
  { id: '0.125', label: '⅛' },
];

// The last settings, kept for next time.
const KEY = 'arayashiki-media';
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
const remembered = signal({
  format: 'mp4',
  background: 'scene',
  colour: '#202020',
  stage: true,
  size: '1920x1080',
  w: 1920,
  h: 1080,
  fps: 60,
  speed: '1',
  customSpeed: 1,
  quality: 'high',
  camera: 'view',
  hitboxes: false,
  popups: true,
  screenFx: true,
  shotSize: '1280x720',
  ...loadSettings(),
});
function remember(patch) {
  remembered.value = { ...remembered.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(remembered.value));
  } catch {
    // not kept
  }
}

function sizeOf(id, s) {
  if (id === 'view') {
    const [w, h] = S.sceneNow()?.viewSize() ?? [1280, 720];
    return [w, h];
  }
  if (id === 'custom') return [Math.max(16, Number(s.w) || 1920), Math.max(16, Number(s.h) || 1080)];
  const found = SIZES.find((x) => x.id === id);
  return [found?.w ?? 1920, found?.h ?? 1080];
}
const backgroundOf = (s) => (s.background === 'colour' ? s.colour : s.background);

function Row({ label, children, hint }) {
  return (
    <div class="prop-row media-row" title={hint}>
      <span>{label}</span>
      <div class="media-control">{children}</div>
    </div>
  );
}

/** The auto camera's settings (the viewport's camera menu and the export dialog). */
export function AutoCameraOptions() {
  const o = { ...AUTO_DEFAULTS, ...S.autoCam.value };
  const set = (patch) => (S.autoCam.value = { ...o, ...patch });
  return (
    <div class="auto-cam">
      <Row label="Angle">
        <select class="input" value={o.angle} onChange={(e) => set({ angle: e.currentTarget.value })}>
          {AUTO_ANGLES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Framing">
        <Segmented
          label="Framing"
          value={o.framing}
          onChange={(framing) => set({ framing })}
          options={[
            { id: 'tight', label: 'Tight' },
            { id: 'medium', label: 'Medium' },
            { id: 'wide', label: 'Wide' },
          ]}
        />
      </Row>
      <Row label="Follow">
        <Segmented
          label="Follow"
          value={o.subject}
          onChange={(subject) => set({ subject })}
          options={[
            { id: 'both', label: 'Both' },
            { id: 'you', label: 'You' },
            { id: 'dummy', label: 'Dummy' },
          ]}
        />
      </Row>
      <Row label="Smoothness" hint="How lazily the camera catches up: 0 snaps, 1 drifts">
        <input type="range" min="0" max="1" step="0.05" value={o.smooth} onInput={(e) => set({ smooth: Number(e.currentTarget.value) })} />
      </Row>
      {o.angle === 'orbit' && (
        <Row label="Orbit speed (°/s)">
          <input type="range" min="-120" max="120" step="5" value={o.orbitSpeed} onInput={(e) => set({ orbitSpeed: Number(e.currentTarget.value) })} />
        </Row>
      )}
      <Row label="Height (studs)">
        <input type="range" min="-3" max="12" step="0.5" value={o.height} onInput={(e) => set({ height: Number(e.currentTarget.value) })} />
      </Row>
      <Row label="Field of view">
        <input type="range" min="30" max="110" step="1" value={o.fov} onInput={(e) => set({ fov: Number(e.currentTarget.value) })} />
      </Row>
      <Row label="Punch in on hits">
        <Switch checked={o.punch} label="Punch in on hits" onChange={(punch) => set({ punch })} />
      </Row>
      <Row label="Shake on hits">
        <input type="range" min="0" max="1" step="0.05" value={o.shake} onInput={(e) => set({ shake: Number(e.currentTarget.value) })} />
      </Row>
      <Row label="Dutch tilt (°)">
        <input type="range" min="-25" max="25" step="1" value={o.dutch} onInput={(e) => set({ dutch: Number(e.currentTarget.value) })} />
      </Row>
      <Row label="Tilt kick on hits">
        <Switch checked={o.dutchOnHit} label="Tilt kick on hits" onChange={(dutchOnHit) => set({ dutchOnHit })} />
      </Row>
    </div>
  );
}

function CameraChoice({ value, onChange }) {
  const keys = S.camKeys.value.length;
  return (
    <Segmented
      label="Camera"
      value={value}
      onChange={onChange}
      options={[
        { id: 'view', label: 'Viewport', title: 'Whatever the viewport shows (your camera, carried by Follow)' },
        { id: 'auto', label: 'Auto', title: 'A cinematographer that frames the fight' },
        { id: 'path', label: keys ? `Recorded (${keys})` : 'Recorded', title: keys ? 'Your camera keys' : 'No keys yet: add some with K, or record a take' },
      ]}
    />
  );
}

function Common({ s, set }) {
  return (
    <>
      <Row label="Background">
        <Segmented
          label="Background"
          value={s.background}
          onChange={(background) => set({ background })}
          options={BACKGROUNDS.map((b) => ({ ...b, label: b.label }))}
        />
        {s.background === 'colour' && <input type="color" class="input media-colour" value={s.colour} onInput={(e) => set({ colour: e.currentTarget.value })} />}
      </Row>
      {s.background === 'scene' && (
        <Row label="Floor and wall">
          <Switch checked={s.stage} label="Show the floor and wall" onChange={(stage) => set({ stage })} />
        </Row>
      )}
      <Row label="Camera">
        <CameraChoice value={s.camera} onChange={(camera) => set({ camera })} />
      </Row>
      {s.camera === 'auto' && <AutoCameraOptions />}
      {s.camera === 'path' && !S.camKeys.value.length && (
        <p class="hint">No camera keys yet. In the viewport, fly somewhere and press K at a few moments, or record a take from the camera menu.</p>
      )}
      <Row label="Hitboxes">
        <Switch checked={s.hitboxes} label="Draw hitboxes" onChange={(hitboxes) => set({ hitboxes })} />
      </Row>
      <Row label="Damage numbers">
        <Switch checked={s.popups} label="Damage numbers" onChange={(popups) => set({ popups })} />
      </Row>
      <Row label="Screen effects" hint="The skill’s Camera blocks, field of view, shakes, Screen Color and Overlays">
        <Switch checked={s.screenFx} label="Screen effects" onChange={(screenFx) => set({ screenFx })} />
      </Row>
    </>
  );
}

function captureOptions(s, w, h) {
  return { width: w, height: h, background: backgroundOf(s), stage: s.stage, camera: s.camera, hitboxes: s.hitboxes, popups: s.popups, screenFx: s.screenFx };
}

/** Saves a screenshot to Pictures\Arayashiki without asking (Shift+F12). */
export async function quickScreenshot() {
  const scene = S.sceneNow();
  if (!scene) return;
  const s = remembered.peek();
  const [w, h] = sizeOf(s.shotSize, s);
  const { screenshot } = await capture();
  const blob = await screenshot(scene, S.time.peek(), captureOptions(s, w, h));
  const path = await saveBlob(blob, `${S.name.peek()} ${S.time.peek().toFixed(2)}s.png`, 'PNG picture', isDesktop ? 'pictures' : 'ask');
  S.status.value = path ? `Screenshot saved to ${path}` : null;
}
