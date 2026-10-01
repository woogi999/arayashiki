// Export (the top bar's Export button; Ctrl+E for code, Ctrl+F12 for video,
// F12 for a picture): one window for everything that leaves the app, laid
// out like Adobe Media Encoder.
//
//   Code for JJS   the moveset (or the open skill) as the code JJS imports
//   Video          MP4, MOV, WebM, an animated GIF or a PNG sequence: a
//                  preset, the format and codec, size, frame rate, slow
//                  motion, bitrate, background (the room, transparent, a
//                  chroma key or a colour), the camera, overlays, audio. A
//                  preview of a frame, an estimate of the size, and a queue
//                  of renders.
//   Picture        the moment at the playhead as a PNG (thumbnails)
//
// The work is in src/video/capture.js, loaded when first used.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { isDesktop, revealFile, saveBlob, saveCodeFile } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Modal, Segmented, Switch } from './controls.jsx';
import { AutoCameraOptions } from './media.jsx';

const capture = () => import('../video/capture.js');
const close = () => (S.dialog.value = null);


// ─── Settings, kept between runs ────────────────────────────────────────

const DEFAULTS = {
  preset: 'custom',
  name: '',
  where: 'ask',
  format: 'mp4',
  codec: null,
  size: '1920x1080',
  w: 1920,
  h: 1080,
  fps: 60,
  speed: '1',
  customSpeed: 1,
  bitrateMode: 'quality',
  quality: 'high',
  bitrate: 12,
  keyframes: 2,
  background: 'scene',
  chroma: '#00ff00',
  colour: '#202020',
  stage: true,
  camera: 'view',
  hitboxes: false,
  popups: true,
  screenFx: true,
  audio: { enabled: true, kbps: 192, sampleRate: 48000, slow: 'slow' },
  gif: { colors: 256, loop: true },
  shotSize: '1280x720',
  shotFormat: 'png',
};
const KEY = 'arayashiki-export';
function load() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    return { ...DEFAULTS, ...kept, audio: { ...DEFAULTS.audio, ...(kept.audio ?? {}) }, gif: { ...DEFAULTS.gif, ...(kept.gif ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}
const settings = signal(load());
function set(patch) {
  settings.value = { ...settings.value, ...patch, preset: patch.preset ?? 'custom' };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    // not kept
  }
}

const SIZES = [
  { id: '1280x720', label: '720p · 1280 × 720', w: 1280, h: 720 },
  { id: '1920x1080', label: '1080p · 1920 × 1080', w: 1920, h: 1080 },
  { id: '2560x1440', label: '1440p · 2560 × 1440', w: 2560, h: 1440 },
  { id: '3840x2160', label: '4K · 3840 × 2160', w: 3840, h: 2160 },
  { id: '1080x1920', label: 'Vertical · 1080 × 1920', w: 1080, h: 1920 },
  { id: '1080x1080', label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  { id: '854x480', label: '480p · 854 × 480', w: 854, h: 480 },
  { id: '640x360', label: '360p · 640 × 360', w: 640, h: 360 },
  { id: 'view', label: 'The viewport’s size' },
  { id: 'custom', label: 'Custom' },
];
const FORMAT_OPTIONS = [
  { id: 'mp4', label: 'MP4' },
  { id: 'mov', label: 'MOV' },
  { id: 'webm', label: 'WebM' },
  { id: 'gif', label: 'GIF' },
  { id: 'png', label: 'PNG sequence' },
];
const PRESETS = [
  { id: 'custom', label: 'Custom' },
  { id: 'youtube', label: 'YouTube 1080p, 60 fps', s: { format: 'mp4', codec: 'avc', size: '1920x1080', fps: 60, bitrateMode: 'variable', bitrate: 12, background: 'scene' } },
  { id: 'youtube4k', label: 'YouTube 4K, 60 fps', s: { format: 'mp4', codec: 'avc', size: '3840x2160', fps: 60, bitrateMode: 'variable', bitrate: 45, background: 'scene' } },
  { id: 'shorts', label: 'Shorts / TikTok, vertical 60 fps', s: { format: 'mp4', codec: 'avc', size: '1080x1920', fps: 60, bitrateMode: 'variable', bitrate: 10, background: 'scene', camera: 'auto' } },
  { id: 'discord', label: 'Discord (small, under 10 MB)', s: { format: 'mp4', codec: 'avc', size: '1280x720', fps: 30, bitrateMode: 'variable', bitrate: 3, background: 'scene', audio: { enabled: true, kbps: 96, sampleRate: 48000, slow: 'slow' } } },
  { id: 'slowmo', label: 'Slow motion ¼, 1080p 60 fps', s: { format: 'mp4', codec: 'avc', size: '1920x1080', fps: 60, speed: '0.25', bitrateMode: 'variable', bitrate: 12 } },
  { id: 'alpha-mov', label: 'Editing: transparent MOV (PNG)', s: { format: 'mov', codec: 'png', size: '1920x1080', fps: 60, background: 'transparent' } },
  { id: 'alpha-webm', label: 'Editing: transparent WebM (VP9)', s: { format: 'webm', codec: 'vp9', size: '1920x1080', fps: 60, bitrateMode: 'variable', bitrate: 16, background: 'transparent' } },
  { id: 'chroma', label: 'Editing: chroma key MOV (H.264)', s: { format: 'mov', codec: 'avc', size: '1920x1080', fps: 60, bitrateMode: 'variable', bitrate: 20, background: 'chroma', chroma: '#00ff00' } },
  { id: 'gif', label: 'GIF, 480p 30 fps', s: { format: 'gif', size: '854x480', fps: 30, background: 'scene', gif: { colors: 256, loop: true } } },
  { id: 'png', label: 'PNG sequence with alpha, 1080p', s: { format: 'png', size: '1920x1080', fps: 60, background: 'transparent' } },
];

function sizeOf(id, s) {
  if (id === 'view') return S.sceneNow()?.viewSize() ?? [1280, 720];
  if (id === 'custom') return [Math.max(16, Number(s.w) || 1920), Math.max(16, Number(s.h) || 1080)];
  const found = SIZES.find((x) => x.id === id);
  return [found?.w ?? 1920, found?.h ?? 1080];
}
const speedOf = (s) => (s.speed === 'custom' ? Math.max(0.01, Number(s.customSpeed) || 1) : Number(s.speed));
const backgroundOf = (s) => (s.background === 'chroma' ? s.chroma : s.background === 'colour' ? s.colour : s.background);
const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(n > 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

// ─── Small parts ────────────────────────────────────────────────────────

function Section({ title, children, open: initial = true, aside }) {
  const [open, setOpen] = useState(initial);
  return (
    <section class={`ex-section ${open ? 'is-open' : ''}`}>
      <button type="button" class="ex-section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        <span>{title}</span>
        {aside && <span class="ex-section-aside">{aside}</span>}
      </button>
      {open && <div class="ex-section-body">{children}</div>}
    </section>
  );
}

function Row({ label, children, hint }) {
  return (
    <div class="ex-row" title={hint}>
      <span class="ex-label">{label}</span>
      <div class="ex-control">{children}</div>
    </div>
  );
}

const Select = ({ value, onChange, options, label }) => (
  <select class="input" aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
    {options.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
      </option>
    ))}
  </select>
);

// ─── Code for JJS ───────────────────────────────────────────────────────

const SCOPES = [
  { id: 'all', label: 'The whole moveset' },
  { id: 'skill', label: 'The open skill' },
];

function CodeTab() {
  const [scope, setScope] = useState('all');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let live = true;
    setCode('');
    setCopied(false);
    S.exportCode(scope).then((c) => live && setCode(c));
    return () => (live = false);
  }, [scope]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const save = async () => {
    const where = await saveCodeFile(scope === 'skill' ? String(S.skill.value?.NAME ?? 'skill') : S.name.value, code).catch(() => null);
    if (where) setSaved(where);
  };
  const count = scope === 'skill' ? 1 : S.skills.value.length;
  return (
    <div class="ex-page ex-code">
      <h3 class="ex-title">Code for JJS</h3>
      <p class="hint">Paste it into JJS’s Skill Builder with its import button.</p>
      <Segmented label="What to export" options={SCOPES} value={scope} onChange={setScope} />
      <textarea class="input code-box export-code" rows={10} readOnly spellcheck={false} aria-label="Code" value={code} onFocus={(e) => e.currentTarget.select()} />
      <p class="hint num">{code ? `${count} skill${count === 1 ? '' : 's'} · ${code.length.toLocaleString()} characters` : 'Writing the code…'}</p>
      {saved && <p class="hint ok">Saved to {saved}</p>}
      <div class="ex-footer">
        <span class="spacer" />
        <Button icon="download" disabled={!code} onClick={save}>
          Save as .txt
        </Button>
        <Button variant="primary" icon={copied ? 'check' : 'copy'} disabled={!code} onClick={copy}>
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </div>
    </div>
  );
}

// ─── The preview ────────────────────────────────────────────────────────

// A frame drawn with the export's settings, small, at a moment you pick.
function Preview({ s, at, setAt, range }) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const [w, h] = sizeOf(s.size, s);
  const scale = Math.min(1, 560 / Math.max(w, h));
  const bg = backgroundOf(s);
  const key = `${s.size}:${s.w}:${s.h}:${bg}:${s.stage}:${s.camera}:${s.hitboxes}:${s.popups}:${s.screenFx}:${at.toFixed(3)}:${S.run.value ? S.run.value.duration : 0}:${JSON.stringify(S.autoCam.value)}:${S.camKeys.value.length}`;
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const scene = S.sceneNow();
      if (!scene) return;
      setBusy(true);
      try {
        const { screenshot } = await capture();
        const blob = await screenshot(scene, at, {
          width: Math.max(32, Math.round(w * scale)),
          height: Math.max(32, Math.round(h * scale)),
          background: s.format === 'mp4' && bg === 'transparent' ? '#000000' : bg,
          stage: s.stage,
          camera: s.camera,
          hitboxes: s.hitboxes,
          popups: s.popups,
          screenFx: s.screenFx,
        });
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        // the view isn't ready: no preview
      } finally {
        setBusy(false);
      }
    }, 160);
    return () => clearTimeout(timer.current);
  }, [key]);
  return (
    <div class="ex-preview">
      <div class={`ex-preview-frame ${bg === 'transparent' && s.format !== 'mp4' ? 'is-alpha' : ''}`} style={{ aspectRatio: `${w} / ${h}` }}>
        {url ? <img src={url} alt="A frame of the export" /> : <span class="hint">{S.sceneNow() ? 'Drawing a frame…' : 'Open the Skill Builder’s viewport to see a preview.'}</span>}
        {busy && url && <span class="ex-preview-busy" aria-hidden="true" />}
      </div>
      <div class="ex-scrub">
        <span class="num">{at.toFixed(2)}s</span>
        <input type="range" min={range[0]} max={Math.max(range[0] + 0.001, range[1])} step="0.01" value={at} aria-label="Preview time" onInput={(e) => setAt(Number(e.currentTarget.value))} />
        <span class="num">{range[1].toFixed(2)}s</span>
      </div>
    </div>
  );
}

// ─── The queue ──────────────────────────────────────────────────────────

const queue = signal([]); // { id, label, skillUid, skillName, settings, state, frame, frames, result, error }
let running = false;
let stopFlag = false;

function snapshot(s, range) {
  const [w, h] = sizeOf(s.size, s);
  return {
    format: s.format,
    codec: s.codec,
    width: w,
    height: h,
    fps: Number(s.fps),
    speed: speedOf(s),
    from: range[0],
    to: range[1],
    bitrateMode: s.bitrateMode,
    quality: s.quality,
    bitrate: Number(s.bitrate),
    keyframes: Number(s.keyframes),
    background: s.background,
    chroma: s.chroma,
    colour: s.colour,
    stage: s.stage,
    camera: s.camera,
    hitboxes: s.hitboxes,
    popups: s.popups,
    screenFx: s.screenFx,
    audio: s.audio,
    gif: s.gif,
    where: s.where,
    name: s.name || `${S.name.peek()} - ${S.skill.peek()?.NAME ?? 'skill'}${speedOf(s) !== 1 ? ` (${speedOf(s)}x)` : ''}`,
  };
}

function updateJob(id, patch) {
  queue.value = queue.value.map((j) => (j.id === id ? { ...j, ...patch } : j));
}

async function runQueue() {
  if (running) return;
  running = true;
  stopFlag = false;
  try {
    for (;;) {
      const job = queue.peek().find((j) => j.state === 'waiting');
      if (!job || stopFlag) break;
      updateJob(job.id, { state: 'rendering', frame: 0 });
      try {
        // The job's skill, open and simulated.
        if (S.skillUid.peek() !== job.skillUid && S.skills.peek().some((x) => x.uid === job.skillUid)) {
          const skill = S.skills.peek().find((x) => x.uid === job.skillUid);
          S.pickCategory(skill.K_NAME);
          S.pickSkill(job.skillUid);
        }
        S.stop();
        S.simulateNow();
        const scene = S.sceneNow();
        if (!scene) throw new Error('Open the Skill Builder’s viewport first.');
        const { exportVideo } = await capture();
        const started = performance.now();
        const result = await exportVideo(scene, job.settings, {
          clips: S.audioClips(S.run.peek()),
          onProgress: (p) => updateJob(job.id, { frame: p.frame, frames: p.frames, phase: p.phase, rate: p.frame / ((performance.now() - started) / 1000) }),
          cancelled: () => stopFlag || queue.peek().find((j) => j.id === job.id)?.state === 'cancelled',
        });
        updateJob(job.id, result ? { state: 'done', result } : { state: 'cancelled' });
      } catch (e) {
        updateJob(job.id, e?.name === 'AbortError' ? { state: 'cancelled' } : { state: 'failed', error: e?.message ?? String(e) });
      }
    }
  } finally {
    running = false;
  }
}

function addToQueue(s, range) {
  const skill = S.skill.peek();
  if (!skill) return;
  const settingsNow = snapshot(s, range);
  const fmt = FORMAT_OPTIONS.find((f) => f.id === s.format)?.label;
  queue.value = [
    ...queue.value,
    { id: Date.now() + Math.random(), label: settingsNow.name, skillUid: skill.uid, skillName: String(skill.NAME), format: fmt, settings: settingsNow, state: 'waiting', frame: 0, frames: 0 },
  ];
}

function QueueList() {
  const jobs = queue.value;
  if (!jobs.length) return <p class="hint ex-queue-empty">Renders you queue show here. Add a few (different skills, formats, cameras) and start them together.</p>;
  return (
    <ul class="ex-queue">
      {jobs.map((j) => {
        const pct = j.frames ? Math.round((100 * j.frame) / j.frames) : 0;
        return (
          <li key={j.id} class={`ex-job is-${j.state}`}>
            <div class="ex-job-top">
              <span class="ex-job-name" title={j.label}>
                {j.label}
              </span>
              <span class="ex-job-format">{j.format}</span>
              {j.state === 'waiting' || j.state === 'rendering' ? (
                <IconButton icon="x" size={11} label="Cancel this render" onClick={() => updateJob(j.id, { state: 'cancelled' })} />
              ) : (
                <IconButton icon="x" size={11} label="Remove from the list" onClick={() => (queue.value = queue.value.filter((x) => x.id !== j.id))} />
              )}
            </div>
            <div class="media-bar">
              <span style={{ transform: `scaleX(${j.state === 'done' ? 1 : pct / 100})` }} />
            </div>
            <div class="ex-job-state hint num">
              {j.state === 'waiting' && 'Waiting'}
              {j.state === 'rendering' &&
                (j.phase === 'sound' ? 'Mixing the sound…' : j.phase === 'finishing' ? 'Finishing the file…' : `${pct}% · frame ${j.frame} of ${j.frames}${j.rate ? ` · ${j.rate.toFixed(0)} fps` : ''}`)}
              {j.state === 'done' && (
                <>
                  Done in {j.result.seconds.toFixed(1)}s
                  {j.result.audio?.used ? ` · ${j.result.audio.used} sound${j.result.audio.used === 1 ? '' : 's'}` : ''}
                  {j.result.audio?.missing ? ` · ${j.result.audio.missing} couldn’t be downloaded` : ''}{' '}
                  {isDesktop && (
                    <button type="button" class="link" onClick={() => revealFile(j.result.path)}>
                      Show in folder
                    </button>
                  )}
                </>
              )}
              {j.state === 'failed' && <span class="error-text">{j.error}</span>}
              {j.state === 'cancelled' && 'Cancelled'}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────

function VideoTab() {
  const s = settings.value;
  const duration = S.duration.value;
  const [range, setRange] = useState([0, duration]);
  const [at, setAt] = useState(Math.min(S.time.value, duration));
  const [codecs, setCodecs] = useState([]);
  const [acodec, setAcodec] = useState(null);
  useEffect(() => setRange(([a]) => [Math.min(a, duration), duration]), [duration]);
  const [w, h] = sizeOf(s.size, s);
  useEffect(() => {
    let live = true;
    capture().then(async (m) => {
      const list = await m.availableCodecs(s.format, { width: w, height: h });
      const audio = await m.audioCodecFor(s.format);
      if (!live) return;
      setCodecs(list);
      setAcodec(audio);
      if (!list.includes(s.codec)) set({ codec: s.format === 'mov' && s.background === 'transparent' && list.includes('png') ? 'png' : list[0] ?? null, preset: s.preset });
    });
    return () => (live = false);
  }, [s.format, w, h]);
  const speed = speedOf(s);
  const fps = s.format === 'gif' ? Math.min(50, s.fps) : s.fps;
  const frames = Math.ceil((Math.max(0, range[1] - range[0]) / speed) * fps) + 1;
  const est = useMemo(() => {
    let estimate = 0;
    try {
      // the same rough sum capture.js does, without loading it
      const pixels = w * h;
      const seconds = frames / fps;
      if (s.format === 'gif') estimate = frames * pixels * 0.35;
      else if (s.format === 'png' || s.codec === 'png') estimate = frames * pixels * (s.background === 'transparent' ? 0.9 : 1.6);
      else {
        const bits = s.bitrateMode === 'quality' ? pixels * fps * { low: 0.04, medium: 0.07, high: 0.12, best: 0.2 }[s.quality] : s.bitrate * 1e6;
        estimate = ((bits + (s.audio.enabled ? s.audio.kbps * 1000 : 0)) * seconds) / 8;
      }
    } catch {
      // no estimate
    }
    return estimate;
  }, [s, w, h, frames, fps]);
  const isVideo = ['mp4', 'mov', 'webm'].includes(s.format);
  const alphaFormat = s.format !== 'mp4' && !(s.format === 'mov' && s.codec !== 'png');
  const transparentOnMp4 = s.background === 'transparent' && s.format === 'mp4';
  const transparentNoAlpha = s.background === 'transparent' && s.format === 'mov' && s.codec !== 'png';
  const audioPossible = s.format !== 'gif';
  return (
    <div class="ex-page ex-video">
      <div class="ex-left">
        <Preview s={s} at={Math.min(Math.max(at, range[0]), range[1])} setAt={setAt} range={range} />
        <div class="ex-source">
          <div>
            <strong>{String(S.skill.value?.NAME ?? 'No skill open')}</strong>
            <span class="hint num">
              {S.name.value} · {duration.toFixed(2)}s
            </span>
          </div>
          <div class="ex-range">
            <label>
              In
              <input class="input num" type="number" step="0.05" min="0" value={range[0].toFixed(2)} onChange={(e) => setRange([Math.max(0, Math.min(range[1], Number(e.currentTarget.value) || 0)), range[1]])} />
            </label>
            <label>
              Out
              <input class="input num" type="number" step="0.05" min="0" value={range[1].toFixed(2)} onChange={(e) => setRange([range[0], Math.max(range[0], Math.min(duration, Number(e.currentTarget.value) || duration))])} />
            </label>
            <button type="button" class="link" onClick={() => setRange([0, duration])}>
              Whole skill
            </button>
          </div>
        </div>
        <div class="ex-queue-head">
          <strong>Queue</strong>
          <span class="spacer" />
          <Button disabled={!queue.value.some((j) => j.state === 'waiting')} onClick={runQueue}>
            Start queue
          </Button>
        </div>
        <QueueList />
      </div>

      <div class="ex-right">
        <div class="ex-settings">
          <Section title="Preset">
            <Row label="Preset">
              <Select
                label="Preset"
                value={s.preset}
                options={PRESETS}
                onChange={(id) => {
                  const p = PRESETS.find((x) => x.id === id);
                  if (p?.s) set({ ...p.s, preset: id });
                  else set({ preset: id });
                }}
              />
            </Row>
            <Row label="File name">
              <input class="input" placeholder={`${S.name.value} - ${S.skill.value?.NAME ?? 'skill'}`} value={s.name} onInput={(e) => set({ name: e.currentTarget.value, preset: s.preset })} />
            </Row>
            <Row label="Save to">
              <Segmented
                label="Save to"
                value={s.where}
                onChange={(where) => set({ where, preset: s.preset })}
                options={[
                  { id: 'ask', label: 'Ask each time' },
                  { id: 'videos', label: 'Videos\\Arayashiki' },
                ]}
              />
            </Row>
          </Section>

          <Section title="Format">
            <Row label="Format">
              <Segmented label="Format" value={s.format} onChange={(format) => set({ format })} options={FORMAT_OPTIONS} />
            </Row>
            {codecs.length > 0 && (
              <Row label="Codec">
                <Select
                  label="Codec"
                  value={s.codec ?? codecs[0]}
                  onChange={(codec) => set({ codec })}
                  options={codecs.map((c) => ({ id: c, label: { avc: 'H.264', hevc: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', png: 'PNG (lossless, alpha)', gif: 'GIF' }[c] ?? c }))}
                />
              </Row>
            )}
          </Section>

          <Section title="Video" aside={`${w} × ${h} · ${fps} fps`}>
            <Row label="Size">
              <Select label="Size" value={s.size} options={SIZES} onChange={(size) => set({ size })} />
            </Row>
            {s.size === 'custom' && (
              <Row label="Width × height">
                <span class="ex-pair">
                  <input class="input num" type="number" min="16" value={s.w} onChange={(e) => set({ w: Number(e.currentTarget.value) })} />
                  ×
                  <input class="input num" type="number" min="16" value={s.h} onChange={(e) => set({ h: Number(e.currentTarget.value) })} />
                </span>
              </Row>
            )}
            <Row label="Frame rate">
              <Select
                label="Frame rate"
                value={String(s.fps)}
                onChange={(v) => set({ fps: Number(v) })}
                options={['24', '25', '30', '50', '60', '120'].map((id) => ({ id, label: `${id} fps` }))}
              />
            </Row>
            {s.format === 'gif' && s.fps > 50 && <p class="hint">GIFs play at 50 fps at most; this one will be 50.</p>}
            <Row label="Speed" hint="Slow motion draws more frames for each second of the skill, so it stays smooth">
              <Segmented
                label="Speed"
                value={s.speed}
                onChange={(speed) => set({ speed })}
                options={[
                  { id: '1', label: 'Real time' },
                  { id: '0.5', label: '½' },
                  { id: '0.25', label: '¼' },
                  { id: '0.125', label: '⅛' },
                  { id: 'custom', label: 'Custom' },
                ]}
              />
              {s.speed === 'custom' && <input class="input num ex-narrow" type="number" step="0.05" min="0.01" value={s.customSpeed} onChange={(e) => set({ customSpeed: Number(e.currentTarget.value) })} />}
            </Row>
          </Section>

          {isVideo && s.codec !== 'png' && (
            <Section title="Bitrate" aside={s.bitrateMode === 'quality' ? `Quality: ${s.quality}` : `${s.bitrateMode === 'constant' ? 'CBR' : 'VBR'} · ${s.bitrate} Mbps`}>
              <Row label="Encoding">
                <Segmented
                  label="Bitrate encoding"
                  value={s.bitrateMode}
                  onChange={(bitrateMode) => set({ bitrateMode })}
                  options={[
                    { id: 'quality', label: 'By quality', title: 'The encoder picks the bitrate for the quality' },
                    { id: 'variable', label: 'VBR', title: 'Variable bitrate around a target' },
                    { id: 'constant', label: 'CBR', title: 'Constant bitrate' },
                  ]}
                />
              </Row>
              {s.bitrateMode === 'quality' ? (
                <Row label="Quality">
                  <Segmented
                    label="Quality"
                    value={s.quality}
                    onChange={(quality) => set({ quality })}
                    options={[
                      { id: 'low', label: 'Low' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'high', label: 'High' },
                      { id: 'best', label: 'Best' },
                    ]}
                  />
                </Row>
              ) : (
                <Row label="Target bitrate">
                  <input type="range" min="0.5" max="80" step="0.5" value={s.bitrate} aria-label="Target bitrate" onInput={(e) => set({ bitrate: Number(e.currentTarget.value) })} />
                  <span class="ex-pair">
                    <input class="input num ex-narrow" type="number" min="0.1" step="0.5" value={s.bitrate} onChange={(e) => set({ bitrate: Math.max(0.1, Number(e.currentTarget.value) || 1) })} />
                    Mbps
                  </span>
                </Row>
              )}
              <Row label="Keyframe every" hint="A full picture every this many seconds: shorter seeks faster in editors, longer is smaller">
                <span class="ex-pair">
                  <input class="input num ex-narrow" type="number" min="0.1" step="0.5" value={s.keyframes} onChange={(e) => set({ keyframes: Math.max(0.1, Number(e.currentTarget.value) || 2) })} />
                  seconds
                </span>
              </Row>
            </Section>
          )}

          {s.format === 'gif' && (
            <Section title="GIF">
              <Row label="Colours">
                <Segmented label="Colours" value={String(s.gif.colors)} onChange={(v) => set({ gif: { ...s.gif, colors: Number(v) } })} options={['256', '128', '64', '32'].map((id) => ({ id, label: id }))} />
              </Row>
              <Row label="Loop">
                <Switch checked={s.gif.loop} label="Loop the GIF" onChange={(loop) => set({ gif: { ...s.gif, loop } })} />
              </Row>
            </Section>
          )}

          <Section title="Background">
            <Row label="Type">
              <Segmented
                label="Background"
                value={s.background}
                onChange={(background) => set({ background, ...(background === 'transparent' && s.format === 'mov' && codecs.includes('png') ? { codec: 'png' } : {}) })}
                options={[
                  { id: 'scene', label: 'The room' },
                  { id: 'transparent', label: 'Transparent' },
                  { id: 'chroma', label: 'Chroma key' },
                  { id: 'colour', label: 'Colour' },
                ]}
              />
            </Row>
            {s.background === 'chroma' && (
              <Row label="Key colour" hint="A flat colour behind everything, with the room hidden, to key out in an editor">
                <span class="ex-pair">
                  <input type="color" class="ex-swatch" value={s.chroma} onInput={(e) => set({ chroma: e.currentTarget.value })} aria-label="Chroma key colour" />
                  <span class="num">{s.chroma.toUpperCase()}</span>
                  {['#00ff00', '#0047bb', '#ff00ff'].map((c) => (
                    <button key={c} type="button" class="ex-chip-swatch" style={{ background: c }} title={c} aria-label={`Use ${c}`} onClick={() => set({ chroma: c })} />
                  ))}
                </span>
              </Row>
            )}
            {s.background === 'colour' && (
              <Row label="Colour">
                <span class="ex-pair">
                  <input type="color" class="ex-swatch" value={s.colour} onInput={(e) => set({ colour: e.currentTarget.value })} aria-label="Background colour" />
                  <span class="num">{s.colour.toUpperCase()}</span>
                </span>
              </Row>
            )}
            {s.background === 'scene' && (
              <Row label="Floor and wall">
                <Switch checked={s.stage} label="Show the floor and wall" onChange={(stage) => set({ stage })} />
              </Row>
            )}
            {(transparentOnMp4 || transparentNoAlpha) && (
              <div class="ex-warning" role="alert">
                <Icon name="warning" size={14} />
                <div>
                  {transparentOnMp4 ? 'MP4 can’t hold transparency' : 'H.264 in a MOV can’t hold transparency'}: it will render on black. Use{' '}
                  <button type="button" class="link" onClick={() => set({ format: 'mov', codec: 'png' })}>
                    MOV (PNG)
                  </button>{' '}
                  or{' '}
                  <button type="button" class="link" onClick={() => set({ format: 'webm', codec: 'vp9' })}>
                    WebM (VP9)
                  </button>{' '}
                  to keep it.
                </div>
              </div>
            )}
          </Section>

          <Section title="Camera" aside={{ view: 'Viewport', auto: 'Auto', path: 'Recorded' }[s.camera]}>
            <Row label="Camera">
              <Segmented
                label="Camera"
                value={s.camera}
                onChange={(camera) => set({ camera })}
                options={[
                  { id: 'view', label: 'Viewport', title: 'Whatever the viewport shows' },
                  { id: 'auto', label: 'Auto', title: 'A cinematographer that frames the fight' },
                  { id: 'path', label: `Recorded (${S.camKeys.value.length})`, title: 'Your camera path' },
                ]}
              />
            </Row>
            {s.camera === 'auto' && <AutoCameraOptions />}
            {s.camera === 'path' && (
              <Row label="Path">
                <Button
                  onClick={() => {
                    close();
                    import('./campath.jsx').then((m) => m.openCameraPath());
                  }}
                >
                  Edit the camera path…
                </Button>
                {!S.camKeys.value.length && <span class="hint">No keys yet.</span>}
              </Row>
            )}
          </Section>

          <Section title="Overlays" open={false}>
            <Row label="Hitboxes">
              <Switch checked={s.hitboxes} label="Draw hitboxes" onChange={(hitboxes) => set({ hitboxes })} />
            </Row>
            <Row label="Damage numbers">
              <Switch checked={s.popups} label="Damage numbers" onChange={(popups) => set({ popups })} />
            </Row>
            <Row label="Screen effects" hint="The skill’s Camera blocks, field of view, shakes, Screen Color and Overlays">
              <Switch checked={s.screenFx} label="Screen effects" onChange={(screenFx) => set({ screenFx })} />
            </Row>
          </Section>

          {audioPossible && (
            <Section title="Audio" aside={s.audio.enabled ? (acodec ? { aac: 'AAC', opus: 'Opus', pcm: 'PCM', wav: 'WAV file' }[acodec] : 'none here') : 'Off'}>
              <Row label="Sound">
                <Switch checked={s.audio.enabled} label="Export the skill’s sounds" onChange={(enabled) => set({ audio: { ...s.audio, enabled } })} />
              </Row>
              {s.audio.enabled && (
                <>
                  {speed !== 1 && (
                    <Row label="In slow motion">
                      <Segmented
                        label="Sound in slow motion"
                        value={s.audio.slow}
                        onChange={(slow) => set({ audio: { ...s.audio, slow } })}
                        options={[
                          { id: 'slow', label: 'Slowed down', title: 'Slowed with the picture, lower pitch' },
                          { id: 'real', label: 'Normal speed', title: 'Each sound at its own speed from when it starts' },
                          { id: 'mute', label: 'None' },
                        ]}
                      />
                    </Row>
                  )}
                  {(acodec === 'aac' || acodec === 'opus') && (
                    <Row label="Audio bitrate">
                      <Select
                        label="Audio bitrate"
                        value={String(s.audio.kbps)}
                        onChange={(v) => set({ audio: { ...s.audio, kbps: Number(v) } })}
                        options={['96', '128', '160', '192', '256', '320'].map((id) => ({ id, label: `${id} kbps` }))}
                      />
                    </Row>
                  )}
                  <Row label="Sample rate">
                    <Segmented
                      label="Sample rate"
                      value={String(s.audio.sampleRate)}
                      onChange={(v) => set({ audio: { ...s.audio, sampleRate: Number(v) } })}
                      options={[
                        { id: '44100', label: '44.1 kHz' },
                        { id: '48000', label: '48 kHz' },
                      ]}
                    />
                  </Row>
                  <p class="hint">
                    The skill’s SFX nodes, mixed with their volume and fades. Sounds Roblox only hands to an account need you signed in;
                    private ones stay out.{s.format === 'png' ? ' Saved as a .wav next to the frames.' : ''}
                  </p>
                </>
              )}
            </Section>
          )}
        </div>
        <div class="ex-footer">
          <span class="ex-estimate hint num">
            {w} × {h} · {fps} fps · {frames} frames · {((frames - 1) / fps).toFixed(2)}s · about {bytes(est)}
          </span>
          <span class="spacer" />
          <Button disabled={!S.skill.value || !duration} onClick={() => addToQueue(s, range)}>
            Add to queue
          </Button>
          <Button
            variant="primary"
            icon="download"
            disabled={!S.skill.value || !duration}
            onClick={() => {
              addToQueue(s, range);
              runQueue();
            }}
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Picture ────────────────────────────────────────────────────────────

function PictureTab() {
  const s = settings.value;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [at, setAt] = useState(S.time.value);
  const duration = S.duration.value;
  const shot = { ...s, size: s.shotSize, format: 'png' };
  const [w, h] = sizeOf(s.shotSize, s);
  const take = async (to) => {
    const scene = S.sceneNow();
    if (!scene) return setError('Open the Skill Builder’s viewport first.');
    setBusy(true);
    setError(null);
    try {
      const { screenshot, copyPng } = await capture();
      const blob = await screenshot(scene, at, { width: w, height: h, background: backgroundOf(s), stage: s.stage, camera: s.camera, hitboxes: s.hitboxes, popups: s.popups, screenFx: s.screenFx });
      if (to === 'copy') {
        await copyPng(blob);
        setDone({ text: 'Copied to the clipboard.' });
      } else {
        const name = `${S.name.peek()} ${S.skill.peek()?.NAME ?? ''} ${at.toFixed(2)}s`.trim();
        const path = await saveBlob(blob, `${name}.png`, 'PNG picture', s.where === 'videos' && isDesktop ? 'pictures' : 'ask');
        if (path) setDone({ text: `Saved to ${path}`, path });
      }
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="ex-page ex-video">
      <div class="ex-left">
        <Preview s={shot} at={at} setAt={setAt} range={[0, Math.max(0.01, duration)]} />
        <p class="hint">A still of any moment, drawn fresh at the size you pick: sharp enough for a thumbnail.</p>
      </div>
      <div class="ex-right">
        <div class="ex-settings">
          <Section title="Picture" aside={`${w} × ${h}`}>
            <Row label="Size">
              <Select label="Size" value={s.shotSize} options={SIZES} onChange={(shotSize) => set({ shotSize })} />
            </Row>
            {s.shotSize === 'custom' && (
              <Row label="Width × height">
                <span class="ex-pair">
                  <input class="input num" type="number" min="16" value={s.w} onChange={(e) => set({ w: Number(e.currentTarget.value) })} />
                  ×
                  <input class="input num" type="number" min="16" value={s.h} onChange={(e) => set({ h: Number(e.currentTarget.value) })} />
                </span>
              </Row>
            )}
          </Section>
          <Section title="Background">
            <Row label="Type">
              <Segmented
                label="Background"
                value={s.background}
                onChange={(background) => set({ background })}
                options={[
                  { id: 'scene', label: 'The room' },
                  { id: 'transparent', label: 'Transparent' },
                  { id: 'chroma', label: 'Chroma key' },
                  { id: 'colour', label: 'Colour' },
                ]}
              />
            </Row>
            {s.background === 'chroma' && (
              <Row label="Key colour">
                <input type="color" class="ex-swatch" value={s.chroma} onInput={(e) => set({ chroma: e.currentTarget.value })} aria-label="Chroma key colour" />
              </Row>
            )}
            {s.background === 'colour' && (
              <Row label="Colour">
                <input type="color" class="ex-swatch" value={s.colour} onInput={(e) => set({ colour: e.currentTarget.value })} aria-label="Background colour" />
              </Row>
            )}
          </Section>
          <Section title="Camera and overlays">
            <Row label="Camera">
              <Segmented
                label="Camera"
                value={s.camera}
                onChange={(camera) => set({ camera })}
                options={[
                  { id: 'view', label: 'Viewport' },
                  { id: 'auto', label: 'Auto' },
                  { id: 'path', label: 'Recorded' },
                ]}
              />
            </Row>
            <Row label="Hitboxes">
              <Switch checked={s.hitboxes} label="Draw hitboxes" onChange={(hitboxes) => set({ hitboxes })} />
            </Row>
            <Row label="Damage numbers">
              <Switch checked={s.popups} label="Damage numbers" onChange={(popups) => set({ popups })} />
            </Row>
            <Row label="Screen effects">
              <Switch checked={s.screenFx} label="Screen effects" onChange={(screenFx) => set({ screenFx })} />
            </Row>
          </Section>
          {error && (
            <p class="error" role="alert">
              <Icon name="warning" size={14} />
              {error}
            </p>
          )}
          {done && (
            <p class="hint ok">
              {done.text}{' '}
              {done.path && isDesktop && (
                <button type="button" class="link" onClick={() => revealFile(done.path)}>
                  Show in folder
                </button>
              )}
            </p>
          )}
        </div>
        <div class="ex-footer">
          <span class="ex-estimate hint num">
            {w} × {h} PNG at {at.toFixed(2)}s
          </span>
          <span class="spacer" />
          <Button icon="copy" disabled={busy} onClick={() => take('copy')}>
            Copy
          </Button>
          <Button variant="primary" icon="download" disabled={busy} onClick={() => take('save')}>
            {busy ? 'Drawing…' : 'Save PNG'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── The window ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'code', label: 'Code for JJS', icon: 'file-text' },
  { id: 'video', label: 'Video', icon: 'film' },
  { id: 'image', label: 'Picture', icon: 'image' },
];

export function ExportDialog() {
  const tab = S.exportTab.value;
  const rendering = queue.value.some((j) => j.state === 'rendering');
  return (
    <Modal title="Export" class="modal-export" onClose={() => (rendering ? null : close())}>
      <div class="ex">
        <nav class="ex-nav" aria-label="What to export" role="tablist">
          {TABS.map((t) => (
            <button type="button" role="tab" key={t.id} aria-selected={tab === t.id} onClick={() => (S.exportTab.value = t.id)}>
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
            </button>
          ))}
          {rendering && <p class="hint ex-nav-note">Rendering… keep this open.</p>}
        </nav>
        {tab === 'code' ? <CodeTab /> : tab === 'video' ? <VideoTab /> : <PictureTab />}
      </div>
    </Modal>
  );
}
