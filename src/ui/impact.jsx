// "Insert impact frame…" (the viewport's, a skill's and a node's right-click
// menus, and the search): a procedural impact frame (src/impact.js) drawn
// from the moment, picked from presets or edited, uploaded to Roblox, and
// put into the skill there as Overlay VISUALs, a moment each.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { account } from '../account.js';
import { saveBlob, uploadDecal } from '../platform.js';
import { insertAt, lineTimes } from '../animator.js';
import { DEFAULTS, PRESETS, cameraAtTime, drawFrames, impactNodes, optionsOf } from '../impact.js';
import { Icon } from '../icons.jsx';
import { Button, Modal, Segmented, Switch } from './controls.jsx';

// Where it goes: { t (seconds into the skill run), local (into the open
// branch's line), label }.
const at = signal(null);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Opens the dialog for the playhead, or for node `index` of the open branch. */
export function openImpactFrame({ index } = {}) {
  if (!S.skill.peek()) {
    S.status.value = 'Open a skill first.';
    return;
  }
  const run = S.run.peek();
  const branch = S.branch.peek();
  const line = S.line.peek();
  let t;
  let local;
  if (index != null) {
    local = lineTimes(line)[index] ?? 0;
    const e = run?.events.find((x) => x.branch === branch && x.index === index);
    t = e ? e.t : local;
  } else {
    t = S.time.peek();
    // The playhead is in the run; the line counts from where its branch began.
    const start = Math.min(...(run?.events.filter((e) => e.branch === branch).map((e) => e.t) ?? []), Infinity);
    local = Math.max(0, t - (Number.isFinite(start) && branch ? start : 0));
  }
  at.value = { t: r3(t), local: r3(local), label: index != null ? `node ${index + 1}` : `the playhead` };
  S.dialog.value = 'impact';
}

const WHO = [
  { id: 'both', label: 'Both', title: 'You and the enemy' },
  { id: 'user', label: 'You', title: 'Only you' },
  { id: 'target', label: 'Enemy', title: 'Only the enemy' },
  { id: 'none', label: 'None', title: 'Nobody: the background alone' },
];
const SHAPES = { '16:9': 16 / 9, '16:10': 16 / 10, '21:9': 21 / 9, '4:3': 4 / 3 };

function Colour({ label, value, onChange, optional }) {
  return (
    <label class="imp-field">
      <span>{label}</span>
      <span class="imp-colour">
        {optional && (
          <input
            type="checkbox"
            checked={value != null}
            onChange={(e) => onChange(e.currentTarget.checked ? '#000000' : null)}
            aria-label={`${label} on`}
          />
        )}
        {(value != null || !optional) && (
          <input
            type="color"
            value={value ?? '#000000'}
            onInput={(e) => onChange(e.currentTarget.value)}
            aria-label={label}
          />
        )}
      </span>
    </label>
  );
}

function Range({ label, value, min, max, step = 1, onChange, unit = '' }) {
  return (
    <label class="imp-field">
      <span>{label}</span>
      <span class="imp-range">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => onChange(Number(e.currentTarget.value))}
        />
        <input
          type="number"
          class="input num"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value) || 0)}
        />
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}

const canvasBlob = (c) => new Promise((done) => c.toBlob(done, 'image/png'));

export function ImpactDialog() {
  const where = at.value;
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState('anime');
  const [opts, setOpts] = useState(() => optionsOf('anime'));
  const [shape, setShape] = useState(SHAPES[S.aspect.peek()] ? S.aspect.peek() : '16:9');
  const [editing, setEditing] = useState(false);
  const [ids, setIds] = useState('');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [flash, setFlash] = useState(-1);
  const close = () => (S.dialog.value = null);
  const set = (patch) => {
    setOpts((o) => ({ ...o, ...patch }));
    setPreset('custom');
  };

  // The characters as JJS's screen will have them at that moment.
  useEffect(() => {
    let gone = false;
    const scene = S.sceneNow();
    if (!scene || !where) return;
    const width = 1024;
    scene.silhouettes(where.t, { width, height: Math.round(width / SHAPES[shape]) }).then((d) => !gone && setData(d));
    return () => (gone = true);
  }, [where?.t, shape]);

  const frames = useMemo(() => (data ? drawFrames(opts, data) : []), [data, opts]);
  const camera = cameraAtTime(S.run.peek(), where?.t ?? 0);
  const big = useRef(null);
  useEffect(() => {
    const c = big.current;
    if (!c || !frames.length) return;
    const pick = frames[Math.max(0, flash)] ?? frames[0];
    c.width = pick.width;
    c.height = pick.height;
    c.getContext('2d').drawImage(pick, 0, 0);
  }, [frames, flash]);

  // Plays the frames at their real speed, over the moment they cover.
  const play = () => {
    let i = 0;
    const step = () => {
      setFlash(i);
      if (++i < frames.length) setTimeout(step, opts.frameTime * 1000);
      else setTimeout(() => setFlash(-1), opts.frameTime * 1000 + 400);
    };
    step();
  };

  /** Puts the Overlay VISUALs in the open branch at the moment, after what's already there. */
  function insert(list) {
    const nodes = impactNodes(list, opts);
    let line = S.line.peek();
    let from = 0;
    for (const { at: dt, node } of nodes) {
      line = insertAt(line, where.local + dt, node, from, { after: true });
      from = line.indexOf(node) + 1;
    }
    S.replaceLine(line, 'impact');
    S.status.value = `Impact frame in: ${nodes.length} Overlay VISUAL${nodes.length === 1 ? '' : 's'} at ${where.local}s, ${opts.frameTime}s each.`;
    close();
  }

  async function uploadAndInsert() {
    setBusy('Uploading…');
    setNote(null);
    try {
      const got = [];
      for (const [i, c] of frames.entries()) {
        setBusy(`Uploading frame ${i + 1} of ${frames.length}…`);
        const { imageId } = await uploadDecal(await canvasBlob(c), {
          name: `Impact frame ${i + 1}/${frames.length}`,
          description: "An impact frame, made with Arayashiki's impact frame maker.",
        });
        got.push(imageId);
      }
      setIds(got.join('\n'));
      insert(got);
    } catch (e) {
      setNote(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function savePictures() {
    const { zipSync } = await import('fflate');
    const entries = {};
    for (const [i, c] of frames.entries())
      entries[`impact_${i + 1}.png`] = new Uint8Array(await (await canvasBlob(c)).arrayBuffer());
    const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
    const saved = await saveBlob(zip, 'impact-frame.zip', 'Zip archive');
    if (saved) setNote(`Saved ${frames.length} pictures. Upload them, paste their image IDs below, and insert.`);
  }

  const typed = String(ids).match(/\d+/g) ?? [];
  const signedIn = account.value?.signedIn;
  if (!where) return null;
  return (
    <Modal title="Insert impact frame" class="modal-wide modal-impact" onClose={close}>
      <div class="imp">
        <div class="imp-preview">
          <canvas ref={big} class="imp-canvas" aria-label="The impact frame" />
          {!data && <p class="hint imp-wait">Drawing the moment…</p>}
          <div class="imp-strip">
            {frames.map((c, i) => (
              <img
                key={i}
                src={c.toDataURL()}
                alt={`Frame ${i + 1}`}
                class={flash === i ? 'is-on' : ''}
                onClick={() => setFlash(i)}
              />
            ))}
            <Button icon="play" onClick={play} disabled={!frames.length}>
              Flash it
            </Button>
          </div>
          <p class={camera ? 'hint' : 'warn imp-camera'}>
            <Icon name={camera ? 'camera' : 'warning'} size={13} />{' '}
            {camera
              ? `At ${where.t}s (${where.label}) a Camera block has the view, so the silhouettes line up with what JJS will show.`
              : `At ${where.t}s (${where.label}) no Camera block has the view. An overlay sits on the screen, not in the world, and without a camera scene every player's camera is somewhere else, so the silhouettes won't line up. Impact frames are best on skills with a camera scene: add one with Animate → New camera animation.`}
          </p>
        </div>

        <div class="imp-side">
          <h4 class="section-title">Look</h4>
          <div class="imp-presets" role="radiogroup" aria-label="Presets">
            {PRESETS.map((p) => (
              <button
                type="button"
                role="radio"
                key={p.id}
                class="chip"
                aria-checked={preset === p.id}
                title={p.hint}
                onClick={() => {
                  setPreset(p.id);
                  setOpts({ ...optionsOf(p.id), who: opts.who, seed: opts.seed });
                }}
              >
                {p.label}
              </button>
            ))}
            <button type="button" class="chip" aria-checked={preset === 'custom'} onClick={() => setEditing(true)}>
              Custom
            </button>
          </div>
          <div class="prop-row">
            <span>Who’s in it</span>
            <Segmented
              label="Who’s in it"
              options={WHO}
              value={opts.who}
              onChange={(who) => setOpts((o) => ({ ...o, who }))}
            />
          </div>
          <Range label="Frames" value={opts.frames} min={1} max={8} onChange={(frames) => set({ frames })} />
          <Range
            label="Each for"
            value={opts.frameTime}
            min={0.017}
            max={0.3}
            step={0.001}
            unit="s"
            onChange={(frameTime) => set({ frameTime })}
          />
          <div class="prop-row">
            <span>Screen shape</span>
            <Segmented
              label="Screen shape"
              options={Object.keys(SHAPES).map((id) => ({ id, label: id }))}
              value={shape}
              onChange={setShape}
            />
          </div>
          <div class="prop-row">
            <span>Another take</span>
            <Button variant="ghost" icon="refresh" onClick={() => setOpts((o) => ({ ...o, seed: o.seed + 1 }))}>
              Shuffle
            </Button>
          </div>

          <button type="button" class="imp-more" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            <Icon name={editing ? 'chevron-down' : 'chevron-right'} size={12} /> Edit the look
          </button>
          {editing && (
            <div class="imp-edit">
              <Colour label="Background" value={opts.background} onChange={(background) => set({ background })} />
              <Colour
                label="Gradient to"
                optional
                value={opts.background2}
                onChange={(background2) => set({ background2 })}
              />
              <Colour label="Silhouettes" value={opts.ink} onChange={(ink) => set({ ink })} />
              <Colour label="Accent" value={opts.accent} onChange={(accent) => set({ accent })} />
              <Colour
                label="Line colour"
                optional
                value={opts.lineColour}
                onChange={(lineColour) => set({ lineColour })}
              />
              <Range
                label="Outline"
                value={opts.outline}
                min={0}
                max={20}
                unit="px"
                onChange={(outline) => set({ outline })}
              />
              <Range
                label="Speed lines"
                value={opts.speedLines}
                min={0}
                max={400}
                onChange={(speedLines) => set({ speedLines })}
              />
              <Range
                label="Screentone"
                value={opts.halftone}
                min={0}
                max={20}
                unit="px"
                onChange={(halftone) => set({ halftone })}
              />
              <Range
                label="Silhouette dots"
                value={opts.inkTone}
                min={0}
                max={14}
                unit="px"
                onChange={(inkTone) => set({ inkTone })}
              />
              <Range label="Cracks" value={opts.cracks} min={0} max={40} onChange={(cracks) => set({ cracks })} />
              <Range
                label="Colour split"
                value={opts.split}
                min={0}
                max={40}
                unit="px"
                onChange={(split) => set({ split })}
              />
              <Range
                label="Glitch slices"
                value={opts.glitch}
                min={0}
                max={30}
                onChange={(glitch) => set({ glitch })}
              />
              <Range label="Grain" value={opts.grain} min={0} max={100} onChange={(grain) => set({ grain })} />
              <Range
                label="Vignette"
                value={opts.vignette}
                min={0}
                max={100}
                onChange={(vignette) => set({ vignette })}
              />
              <label class="prop-row">
                <span>Starburst</span>
                <Switch checked={opts.burst} label="Starburst" onChange={(burst) => set({ burst })} />
              </label>
              <label class="prop-row">
                <span>Scanlines</span>
                <Switch checked={opts.scanlines} label="Scanlines" onChange={(scanlines) => set({ scanlines })} />
              </label>
              <label class="prop-row">
                <span>Every other frame inverted</span>
                <Switch
                  checked={opts.alternate}
                  label="Every other frame inverted"
                  onChange={(alternate) => set({ alternate })}
                />
              </label>
              <label class="prop-row">
                <span>The last frame fades out</span>
                <Switch
                  checked={opts.fadeOut}
                  label="The last frame fades out"
                  onChange={(fadeOut) => set({ fadeOut })}
                />
              </label>
              <Button variant="ghost" onClick={() => (setOpts({ ...DEFAULTS, who: opts.who }), setPreset('custom'))}>
                Start from blank
              </Button>
            </div>
          )}

          <h4 class="section-title">Into the skill</h4>
          <p class="hint">
            {frames.length} Overlay VISUAL{frames.length === 1 ? '' : 's'} at {where.local}s in this line,{' '}
            {opts.frameTime}s each ({r3(frames.length * opts.frameTime)}s in all), after the nodes already there.
            Overlays only show on the screen of whoever runs them: here, you.
          </p>
          <textarea
            class="input num imp-ids"
            rows={2}
            spellcheck={false}
            placeholder="Image IDs, one per frame (the upload fills them in)"
            value={ids}
            onInput={(e) => setIds(e.currentTarget.value)}
          />
          {note && <p class="hint">{note}</p>}
          <div class="modal-actions">
            <Button variant="ghost" icon="download" disabled={!frames.length} onClick={savePictures}>
              Save pictures
            </Button>
            <span class="spacer" />
            {typed.length === frames.length && frames.length > 0 ? (
              <Button variant="primary" icon="plus" onClick={() => insert(typed)}>
                Insert with these IDs
              </Button>
            ) : signedIn ? (
              <Button
                variant="primary"
                icon="upload"
                disabled={!frames.length || Boolean(busy)}
                onClick={uploadAndInsert}
              >
                {busy ?? `Upload ${frames.length} and insert`}
              </Button>
            ) : (
              <Button icon="user-round" onClick={() => (S.dialog.value = 'account')}>
                Sign in to upload them
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
