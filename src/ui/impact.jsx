// "Insert impact frame…" (the viewport's, a skill's and a node's right-click
// menus, and the search): a procedural impact frame (src/impact.js) drawn
// from the moment, picked from presets or edited, uploaded to Roblox, and
// put into the skill there as Overlay VISUALs, a moment each.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { account } from '../account.js';
import { saveBlob, uploadDecal } from '../platform.js';
import { insertAt, lineTimes } from '../animator.js';
import { DEFAULTS, PRESETS, cameraAtTime, drawFrames, impactNodes, optionsOf } from '../impact.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Modal, Segmented, Switch } from './controls.jsx';

// Where it goes: { t (seconds into the skill run), local (into the open
// branch's line), label }.
const at = signal(null);

// Posing the rigs for the frame (scene.setPose): kept while the app is open,
// so a pose isn't lost going back and forth. `posing` is the pose tool being
// up, with the dialog folded away so the view can be worked in.
const pose = signal(null);
const posing = signal(false);
const posePick = signal(null); // { who, part }
const poseMode = signal('ik');
const posePreview = signal(true);
const PART_NAMES = { Head: 'Head', Torso: 'Torso', 'Right Arm': 'Right arm', 'Left Arm': 'Left arm', 'Right Leg': 'Right leg', 'Left Leg': 'Left leg' };
const MIRROR = { 'Right Arm': 'Left Arm', 'Left Arm': 'Right Arm', 'Right Leg': 'Left Leg', 'Left Leg': 'Right Leg', Head: 'Head', Torso: 'Torso' };
const POSE_MODES = [
  { id: 'ik', label: 'Reach (IK)', title: 'Drag the hand or foot: the arm or leg points at it' },
  { id: 'rotate', label: 'Turn', title: 'Turn the joint: neck, shoulder, hip or waist' },
  { id: 'move', label: 'Move body', title: 'Move the whole character' },
];

/** The pose tool on the scene as it stands now (or off). */
function poseTool() {
  const scene = S.sceneNow();
  if (!scene?.setPoseTool) return;
  if (!posing.value) return scene.setPoseTool(null);
  const pick = posePick.value;
  scene.setPoseTool({
    who: pick?.who ?? null,
    part: poseMode.value === 'move' ? (pick ? 'Torso' : null) : (pick?.part ?? null),
    mode: poseMode.value,
    onPose: (next) => (pose.value = next),
    onPick: (who, part) => (posePick.value = who ? { who, part } : null),
  });
}

/** A joint's pose copied onto the other side, mirrored (left for right). */
function mirrorPick() {
  const pick = posePick.value;
  const q = pick && pose.value?.[pick.who]?.joints?.[pick.part];
  if (!q || MIRROR[pick.part] === pick.part) return;
  const [x, y, z, w] = q;
  const other = MIRROR[pick.part];
  const mine = pose.value[pick.who];
  pose.value = { ...pose.value, [pick.who]: { ...mine, joints: { ...mine.joints, [other]: [x, -y, -z, w] } } };
  S.sceneNow()?.setPose(pose.value);
}

function resetPick(all) {
  const pick = posePick.value;
  if (all || !pick) pose.value = null;
  else {
    const mine = { ...pose.value?.[pick.who] };
    if (poseMode.value === 'move') {
      delete mine.move;
      delete mine.turn;
    } else if (mine.joints) {
      const { [pick.part]: _gone, ...rest } = mine.joints;
      mine.joints = rest;
    }
    pose.value = { ...pose.value, [pick.who]: mine };
  }
  S.sceneNow()?.setPose(pose.value);
  poseTool();
}
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
const BODIES = [
  { id: 'solid', label: 'Solid', title: 'Flat ink silhouettes' },
  { id: 'toon', label: 'Shaded', title: 'Lit from the hit and cut to two tones, inked outlines and folds' },
  { id: 'lines', label: 'Lines', title: 'Line art: outlines, folds and hatched shadows' },
  { id: 'smear', label: 'Smear', title: 'Torn into streaks rushing out of the hit' },
  { id: 'rim', label: 'Rim lit', title: 'Dark, lit along the side facing the hit' },
];
// The plain rigs (no avatar accessories) for the frame: kept between openings.
const plainRigs = signal(true);
// Pictures of your own (made elsewhere, say in Blender) in place of the drawn frames.
const ownPictures = signal(null);
// The preview is drawn smaller (it's redrawn as you change things); the
// pictures that go to Roblox are drawn full size.
const PREVIEW_WIDTH = 640;
const FULL_WIDTH = 1024;

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
  const [preset, setPreset] = useState('manga');
  const [opts, setOpts] = useState(() => optionsOf('manga'));
  const [shape, setShape] = useState(SHAPES[S.aspect.peek()] ? S.aspect.peek() : '16:9');
  const [editing, setEditing] = useState(false);
  const [ids, setIds] = useState('');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [flash, setFlash] = useState(-1);
  const close = () => {
    posing.value = false;
    const scene = S.sceneNow();
    scene?.setPoseTool?.(null);
    scene?.setPose?.(null);
    S.dialog.value = null;
  };
  // The rigs take the pose while the dialog is up.
  useEffect(() => {
    S.sceneNow()?.setPose?.(pose.peek());
    return () => {
      S.sceneNow()?.setPoseTool?.(null);
      S.sceneNow()?.setPose?.(null);
    };
  }, []);
  useEffect(() => {
    poseTool();
  }, [posing.value, posePick.value, poseMode.value]);
  const set = (patch) => {
    setOpts((o) => ({ ...o, ...patch }));
    setPreset('custom');
  };

  // The characters as JJS's screen will have them at that moment.
  const moment = (width) => S.sceneNow()?.silhouettes(where.t, { width, height: Math.round(width / SHAPES[shape]), plain: plainRigs.value });
  useEffect(() => {
    let gone = false;
    if (!S.sceneNow() || !where) return;
    // A moment after the pose stops changing.
    const timer = setTimeout(() => moment(PREVIEW_WIDTH).then((d) => !gone && setData(d)), pose.value ? 150 : 0);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [where?.t, shape, pose.value, plainRigs.value]);

  // Redrawn a moment after the last change, not on every step of a slider.
  const [drawn, setFrames] = useState([]);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => setFrames(drawFrames(opts, data)), 90);
    return () => clearTimeout(timer);
  }, [data, opts]);
  // Your own pictures, when you've loaded some, are the frames.
  const frames = ownPictures.value ?? drawn;
  /** The pictures at full size, for Roblox or a file. */
  const fullFrames = async () => {
    if (ownPictures.value) return ownPictures.value;
    const d = await moment(FULL_WIDTH);
    return d ? drawFrames(opts, d) : frames;
  };

  /** Saves the frame on show (or the first) as a PNG, full size. */
  async function saveFrame() {
    const full = await fullFrames();
    const i = Math.max(0, flash);
    const c = full[i] ?? full[0];
    if (!c) return;
    const saved = await saveBlob(await canvasBlob(c), `impact_frame_${i + 1}.png`, 'PNG picture');
    if (saved) setNote(`Saved frame ${i + 1}.`);
  }

  /** Loads pictures of your own as the frames, fitted to the screen's shape. */
  async function loadOwn(files) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const W = FULL_WIDTH;
    const H = Math.round(W / SHAPES[shape]);
    const canvases = [];
    for (const f of list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const img = await createImageBitmap(f);
      const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const g = c.getContext('2d');
      // Covers the screen, as an Overlay does: cropped, never stretched.
      const k = Math.max(W / img.width, H / img.height);
      g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      canvases.push(c);
    }
    ownPictures.value = canvases;
    setNote(`Using ${canvases.length} picture${canvases.length === 1 ? '' : 's'} of your own as the frames.`);
  }
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
      setBusy('Drawing them full size…');
      const full = await fullFrames();
      for (const [i, c] of full.entries()) {
        setBusy(`Uploading frame ${i + 1} of ${full.length}…`);
        const { imageId } = await uploadDecal(await canvasBlob(c), {
          name: `Impact frame ${i + 1}/${full.length}`,
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
    const full = await fullFrames();
    for (const [i, c] of full.entries())
      entries[`impact_${i + 1}.png`] = new Uint8Array(await (await canvasBlob(c)).arrayBuffer());
    const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
    const saved = await saveBlob(zip, 'impact-frame.zip', 'Zip archive');
    if (saved) setNote(`Saved ${full.length} pictures. Upload them, paste their image IDs below, and insert.`);
  }

  const typed = String(ids).match(/\d+/g) ?? [];
  const signedIn = account.value?.signedIn;
  if (!where) return null;
  if (posing.value)
    return (
      <PoseBar
        where={where}
        frame={frames[0]}
        onDone={() => (posing.value = false)}
        onClose={close}
      />
    );
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
          <Button
            icon="person-standing"
            onClick={() => {
              S.seek(where.t);
              posing.value = true;
            }}
          >
            {pose.value ? 'Pose the fighters (posed)' : 'Pose the fighters'}
          </Button>
          <label class="prop-row" title="Draw the plain R6 rigs, without your avatar’s accessories (hats, hair, gear)">
            <span>Default dummy models</span>
            <Switch checked={plainRigs.value} label="Default dummy models" onChange={(on) => (plainRigs.value = on)} />
          </label>
          <div class="prop-row">
            <span>Your own pictures</span>
            {ownPictures.value ? (
              <Button variant="ghost" icon="x" onClick={() => ((ownPictures.value = null), setNote(null))}>
                Back to the drawn frames
              </Button>
            ) : (
              <label class="btn btn-ghost" title="Use pictures made elsewhere (Blender, Photoshop…) as the frames: one per frame, in name order">
                <Icon name="upload" size={15} />
                <span>Load pictures…</span>
                <input type="file" accept="image/*" multiple class="sr-only" onChange={(e) => (loadOwn(e.currentTarget.files), (e.currentTarget.value = ''))} />
              </label>
            )}
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
              <div class="prop-row imp-stack">
                <span>Bodies</span>
                <Segmented label="Bodies" options={BODIES} value={opts.body} onChange={(body) => set({ body })} />
              </div>
              {(opts.body === 'toon' || opts.body === 'lines' || opts.body === 'smear') && (
                <>
                  {opts.body !== 'lines' && <Range label="Shadow" value={opts.cut ?? 45} min={0} max={100} unit="%" onChange={(cut) => set({ cut })} />}
                  {opts.body === 'toon' && <Colour label="Lit side" value={opts.light ?? '#ffffff'} onChange={(light) => set({ light })} />}
                  <Range label="Ink lines" value={opts.lineWeight ?? 3} min={0} max={14} unit="px" onChange={(lineWeight) => set({ lineWeight })} />
                  <Range label="Folds" value={opts.creases ?? 60} min={0} max={100} onChange={(creases) => set({ creases })} />
                  {opts.body === 'toon' && <Range label="Screentone" value={opts.tone ?? 0} min={0} max={16} unit="px" onChange={(tone) => set({ tone })} />}
                  <Range label="Hatching" value={opts.hatch ?? 0} min={0} max={16} unit="px" onChange={(hatch) => set({ hatch })} />
                </>
              )}
              {(opts.body === 'smear' || opts.body === 'edges' || opts.body === 'glow') && (
                <Range label="Smear length" value={opts.smear} min={0} max={150} unit="%" onChange={(smear) => set({ smear })} />
              )}
              {opts.body === 'smear' && <Range label="Torn up" value={opts.breakup} min={0} max={100} onChange={(breakup) => set({ breakup })} />}
              {opts.body === 'glow' && (
                <>
                  <Colour label="Your glow" value={opts.userColour} onChange={(userColour) => set({ userColour })} />
                  <Colour label="Enemy’s glow" value={opts.targetColour} onChange={(targetColour) => set({ targetColour })} />
                </>
              )}
              <Range label="Focus lines" value={opts.focusLines} min={0} max={500} onChange={(focusLines) => set({ focusLines })} />
              <Range label="Line width" value={opts.lineWidth} min={1} max={30} unit="px" onChange={(lineWidth) => set({ lineWidth })} />
              <Range label="Clear round the hit" value={opts.clear} min={0} max={60} unit="%" onChange={(clear) => set({ clear })} />
              <Range label="Streaks" value={opts.streaks} min={0} max={100} onChange={(streaks) => set({ streaks })} />
              <Range label="Flare" value={opts.flare} min={0} max={100} onChange={(flare) => set({ flare })} />
              <Range label="Zoom blur" value={opts.zoom} min={0} max={100} onChange={(zoom) => set({ zoom })} />
              <Range label="Shockwave" value={opts.shock ?? 0} min={0} max={100} onChange={(shock) => set({ shock })} />
              <Range label="Ink levels" value={opts.posterize} min={0} max={6} onChange={(posterize) => set({ posterize })} />
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
            <Button variant="ghost" icon="download" disabled={!frames.length} onClick={saveFrame} title="The frame on show, as a PNG">
              Download frame
            </Button>
            <Button variant="ghost" icon="download" disabled={!frames.length} onClick={savePictures} title="Every frame, in a zip">
              All frames
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

/**
 * The pose tool, over the view: the dialog folds into this bar so the rigs
 * can be clicked and dragged. A small preview of the frame can stay up.
 */
function PoseBar({ where, frame, onDone, onClose }) {
  const preview = useRef(null);
  useEffect(() => {
    const c = preview.current;
    if (!c || !frame) return;
    c.width = frame.width;
    c.height = frame.height;
    c.getContext('2d').drawImage(frame, 0, 0);
  }, [frame, posePreview.value]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (posePick.value) posePick.value = null;
        else onDone();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  const pick = posePick.value;
  const who = pick ? (pick.who === 'user' ? 'You' : 'Dummy') : null;
  return (
    <>
      <div class="imp-posebar" role="toolbar" aria-label="Pose the fighters">
        <strong>Posing at {where.t}s</strong>
        <span class="imp-posepick">
          {pick ? `${who} · ${poseMode.value === 'move' ? 'whole body' : PART_NAMES[pick.part] ?? pick.part}` : 'Click a body part on you or the dummy'}
        </span>
        <Segmented label="Pose tool" options={POSE_MODES} value={poseMode.value} onChange={(m) => (poseMode.value = m)} />
        <Button variant="ghost" icon="copy" disabled={!pick || MIRROR[pick.part] === pick.part || poseMode.value === 'move'} title="Copy this joint’s pose to the other side, mirrored" onClick={mirrorPick}>
          Mirror
        </Button>
        <Button variant="ghost" icon="undo" disabled={!pick} title="Put this joint (or the body’s place) back" onClick={() => resetPick(false)}>
          Reset
        </Button>
        <Button variant="ghost" icon="trash-2" disabled={!pose.value} title="Put both back as the skill has them" onClick={() => resetPick(true)}>
          Reset all
        </Button>
        <Switch checked={posePreview.value} label="Show the impact frame" onChange={(on) => (posePreview.value = on)} />
        <span class="hint">Preview</span>
        <Button variant="primary" icon="check" onClick={onDone}>
          Back to the frame
        </Button>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      {posePreview.value && frame && <canvas ref={preview} class="imp-posepreview" aria-label="The impact frame with this pose" />}
    </>
  );
}
