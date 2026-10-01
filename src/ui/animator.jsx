// The motion animator's panel (src/animator.js): keyframes for a VISUAL in
// the skill (a mesh or part effect, or a Camera), shown in the viewport as a
// path with a gizmo on the picked key, written into the skill as a chain of
// VISUALs as you go. A floating window: drag it by its header, size it
// from its corner.
//
// Ways in: "New camera animation" and "New visual animation" (the Nodes
// panel's Animate menu, the search, the viewport's right-click menu) start a
// draft, which goes into the skill only with "Write to skill"; "Animate"
// (Ctrl+K) opens the picked VISUAL, and its edits are written as you go.
//
// Play runs the skill from the animation's start and looks through the
// camera being animated (or "Look through it" does, while you scrub).
import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import { Matrix4, Quaternion, Vector3 } from 'three';
import * as S from '../store.js';
import { BODY_PARTS } from '../../core/schema.js';
import {
  ANIMATABLE,
  anim,
  animKey,
  animationNodes,
  cameraAt,
  cameraLegs,
  cameraLength,
  freshTag,
  fromNode,
  inChain,
  keyFrom,
  keyMatrix,
  lineTimes,
  normalize,
  poseAt,
  removeChain,
  samples,
  shakenAt,
  writeChain,
} from '../animator.js';
import { Button, IconButton, Segmented, Switch } from './controls.jsx';
import { EaseSelect, FloatingPanel, Num, Vec } from './keys-ui.jsx';

// Where the animation sits: the skill, branch and when its first node runs
// (`draft`: not in the skill yet; `index` is where it will go; `weave`: it
// goes in at `start` seconds, its pieces between the nodes already there).
const where = signal(null); // { uid, branch, index, start, draft, weave }
const gizmoMode = signal('translate');
const lookThrough = signal(false);
const previewing = signal(false); // Play: looking through it while the skill plays
const note = signal(null);

// Shake presets for the picked key: [label, studs, degrees].
const SHAKES = [
  ['None', 0, 0],
  ['Light', 0.12, 0.6],
  ['Medium', 0.3, 1.4],
  ['Heavy', 0.6, 2.8],
];

export const PART_EFFECTS = ANIMATABLE.filter((e) => e !== 'Camera');
const specKey = (w, a) => `${w.uid}:${w.branch}:${a.tag}`;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** The body part's Roblox CFrame `t` seconds into the animation. */
function frameAt(t) {
  const scene = S.sceneNow();
  const a = anim.peek();
  const w = where.peek();
  if (!scene || !a || !w) return new Matrix4();
  return scene.partFrame('user', a.part, w.start + t);
}

/** When the animation's first node runs, by the simulation (or its line). */
function startOf(index) {
  const run = S.run.peek();
  const e = run?.events.find((x) => x.kind === 'VISUAL' && x.branch === S.branch.peek() && x.index === index);
  return e ? e.t : (lineTimes(S.line.peek())[index] ?? 0);
}

/** When a node put in at `index` would run: as the node there now does, or after the last WAIT. */
function timeAt(index) {
  const line = S.line.peek();
  const e = S.run.peek()?.events.find((x) => x.branch === S.branch.peek() && x.index === index);
  if (e) return e.t;
  const times = lineTimes([...line, {}]);
  return times[Math.min(index, line.length)] ?? 0;
}

/** Opens the animator on the picked node (a VISUAL the animator can drive). */
export function openAnimator() {
  const node = S.selectedNode.peek();
  if (node?.K_NAME !== 'VISUAL' || !ANIMATABLE.includes(node.EFFECT)) {
    S.status.value = `To animate, pick a VISUAL node whose effect is ${PART_EFFECTS.join(', ')} or Camera, or start a new animation from the Animate menu.`;
    return false;
  }
  import('./campath.jsx').then((m) => m.closeCameraPath());
  const index = S.nodeIndex.peek();
  let tag = node['VISUAL TAG'];
  if (!tag) {
    tag = freshTag(S.program.peek(), S.branch.peek());
    S.setNodeField('VISUAL TAG', tag);
  }
  const w = { uid: S.skillUid.peek(), branch: S.branch.peek(), index, start: startOf(index), draft: false, weave: false };
  const saved = S.animSpecs.peek()[specKey(w, { tag })];
  // A woven animation goes on being woven, from where its first piece runs.
  if (saved?.weave != null) Object.assign(w, { weave: true, start: lineTimes(S.line.peek())[index] ?? saved.weave });
  where.value = w;
  anim.value = normalize(saved ?? fromNode({ ...node, 'VISUAL TAG': tag }, tag));
  animKey.value = 0;
  lookThrough.value = false;
  previewing.value = false;
  note.value = null;
  S.animatorOpen.value = true;
  return true;
}

/** K while the animator is open: a new key (from the view, for a camera). */
export function keyFromViewShortcut() {
  if (anim.peek()) addKey();
}

// A draft animation of a new VISUAL, to go after the picked node (or at the
// end) once it's written. Nothing changes in the skill until then.
function startDraft(fields) {
  if (!S.skill.peek()) {
    S.status.value = 'Open a skill first.';
    return false;
  }
  S.workspace.value = 'skills';
  S.showStart.value = false;
  import('./campath.jsx').then((m) => m.closeCameraPath());
  const line = S.line.peek();
  const index = line.length ? Math.min(S.nodeIndex.peek() + 1, line.length) : 0;
  const tag = freshTag(S.program.peek(), S.branch.peek());
  const node = { K_NAME: 'VISUAL', ...fields, 'VISUAL TAG': tag };
  where.value = { uid: S.skillUid.peek(), branch: S.branch.peek(), index, start: timeAt(index), draft: true, weave: false };
  anim.value = fromNode(node, tag);
  animKey.value = 0;
  lookThrough.value = false;
  previewing.value = false;
  S.animatorOpen.value = true;
  return true;
}

/** A new camera shot: two keys a second apart, both where your view is now. Fly, then set the second. */
export function newCameraAnimation() {
  // Keys are set from your own view: the Free camera.
  S.camMode.value = 'free';
  if (!startDraft({ EFFECT: 'Camera', TIME: 1, 'BODY PART': 'HumanoidRootPart' })) return;
  const a = anim.peek();
  // Straight key to key: each stretch one Camera block, eased by JJS (Smooth curve adds blocks).
  anim.value = { ...a, smooth: false, keys: a.keys.map((k, i) => ({ ...k, t: i, ease: 'Sine InOut' })) };
  setKeyToView(0);
  setKeyToView(1);
  S.seek(where.peek().start);
  note.value = 'A draft: two keys where your view is. Move the playhead, fly to the next shot and press “Key from view” (K); Play to watch it. “Write to skill” puts it in.';
}

/** A new animated part (a Block, unless `effect` says otherwise): from in front of you to further out. */
export function newVisualAnimation(effect = 'Block') {
  if (!startDraft({ EFFECT: effect, TIME: 1, 'BODY PART': 'HumanoidRootPart', SIZE: 2, POSITION: '0, 0, 3', ROTATION: '0, 0, 0' })) return;
  const a = anim.peek();
  anim.value = {
    ...a,
    smooth: true,
    keys: [
      { t: 0, pos: [0, 0, 3], rot: [0, 0, 0], size: 2, opacity: 0, ease: 'Sine InOut', shake: 0, turn: 0 },
      { t: 1, pos: [0, 2, 12], rot: [0, 180, 0], size: 2, opacity: 0, ease: 'Sine InOut', shake: 0, turn: 0 },
    ],
  };
  S.seek(where.peek().start);
  note.value = 'A draft: drag the gizmo on a key (G move, R turn), add keys along the way and set each key’s easing. “Write to skill” puts it in.';
}

export const closeAnimator = () => {
  if (where.peek()?.draft) S.status.value = 'The draft animation was closed without writing it to the skill.';
  anim.value = null;
  where.value = null;
  previewing.value = false;
  S.animatorOpen.value = false;
};

// ─── Changing it ────────────────────────────────────────────────────────

// A draft only changes the panel and the viewport's path; an animation in
// the skill is written again as you go.
function setAnim(patch, { now = false } = {}) {
  anim.value = { ...anim.value, ...patch };
  if (where.peek()?.draft) return;
  if (now) apply();
  else applySoon();
}
function setKey(i, patch) {
  const keys = anim.value.keys.map((k, j) => (j === i ? { ...k, ...patch } : k));
  const picked = keys[i];
  keys.sort((a, b) => a.t - b.t);
  animKey.value = keys.indexOf(picked);
  setAnim({ keys });
}

// Your view (the viewport camera) as a key's pose, in the part's frame at `t`.
function viewPose(t) {
  const scene = S.sceneNow();
  const cam = scene.cameraKey(S.time.peek());
  const world = new Matrix4().compose(new Vector3(...cam.p), new Quaternion(...cam.q), new Vector3(1, 1, 1));
  return keyFrom(frameAt(t).invert().multiply(world));
}

/** Puts key `i` where your view is. */
function setKeyToView(i) {
  const a = anim.peek();
  if (!a || !S.sceneNow()) return;
  const k = a.keys[i];
  anim.value = { ...a, keys: a.keys.map((x, j) => (j === i ? { ...x, ...viewPose(k.t) } : x)) };
}

/**
 * Adds a key after the last one, the newest at the bottom of the list, and
 * picks it: at the playhead when that's past the last key, else half a
 * second after it. A camera's new key is your view; a part's is where the
 * animation has it then. The playhead moves to the new key.
 */
function addKey() {
  const a = anim.peek();
  const w = where.peek();
  if (!a || !w) return;
  const last = a.keys.at(-1);
  let t = r3(S.time.peek() - w.start);
  if (!(t > last.t + 0.02)) t = r3(last.t + 0.5);
  const base = poseAt(a, t);
  const key = { ...base, t, pos: base.pos.map(r3), rot: base.rot.map(r3), shake: last.shake ?? 0, turn: last.turn ?? 0, cut: false, ease: last.ease ?? 'Sine InOut' };
  if (a.effect === 'Camera' && S.sceneNow()) Object.assign(key, viewPose(t));
  const keys = [...a.keys, key].sort((x, y) => x.t - y.t);
  animKey.value = keys.indexOf(key);
  S.seek(w.start + t);
  setAnim({ keys });
}

function deleteKey(i) {
  const a = anim.peek();
  if (a.keys.length <= 2) {
    note.value = 'An animation needs two keys at least.';
    return;
  }
  const keys = a.keys.filter((_, j) => j !== i);
  animKey.value = Math.min(i, keys.length - 1);
  setAnim({ keys });
}

/** Changes what it animates (a Block into a Sphere, say), or which part it's on. */
function setLook(patch) {
  const a = anim.peek();
  const removed = where.peek()?.draft ? null : removeChain(S.line.peek(), a);
  if (removed) {
    S.replaceLine(removed.line, `anim:${a.tag}`);
    where.value = { ...where.peek(), index: removed.index };
  }
  anim.value = { ...a, ...patch, template: { ...a.template, ...(patch.effect ? { EFFECT: patch.effect } : {}), ...(patch.part ? { 'BODY PART': patch.part } : {}), ...(patch.template ?? {}) } };
  if (!where.peek()?.draft) apply();
}

/**
 * Where it goes in the line: after a node (`weave` off: the chain starts at
 * that node), or woven in (`weave` on): starting `start` seconds into the
 * skill, each piece going in between the nodes already there, at its moment.
 */
function setPlacement(weave) {
  const w = where.peek();
  if (!w || Boolean(w.weave) === weave) return;
  where.value = { ...w, weave };
  if (!w.draft) apply();
}
function setStart(t) {
  const w = where.peek();
  if (!w) return;
  where.value = { ...w, weave: true, start: Math.max(0, r3(t)) };
  if (!w.draft) applySoon();
  else anim.value = { ...anim.peek() }; // the path follows the new start
}

let timer = 0;
function applySoon() {
  clearTimeout(timer);
  timer = setTimeout(apply, 140);
}

/** Writes the animation into the skill as a chain of VISUALs (one undo step per burst of edits). */
function apply() {
  clearTimeout(timer);
  const a = anim.peek();
  const w = where.peek();
  if (!a || !w) return;
  if (S.skillUid.peek() !== w.uid || S.branch.peek() !== w.branch) {
    note.value = 'This animation is in another skill or branch: open that one to change it.';
    return;
  }
  const nodes = animationNodes(a, frameAt);
  const lineStart = lineTimes([...S.line.peek(), {}])[w.index] ?? 0;
  const { line, extended, trimmed } = writeChain(
    S.line.peek(),
    a,
    nodes,
    w.weave ? { time: w.start, weave: true } : { index: w.index, time: lineStart },
  );
  S.replaceLine(line, `anim:${a.tag}`);
  S.animSpecs.value = { ...S.animSpecs.peek(), [specKey(w, a)]: { ...a, weave: w.weave ? w.start : undefined } };
  const first = line.findIndex((n) => inChain(n, a));
  if (first >= 0) {
    S.nodeIndex.value = first;
    where.value = { ...w, index: first, draft: false };
  }
  const visuals = nodes.filter((n) => n.node.K_NAME === 'VISUAL').length;
  const parts = [
    `${visuals} VISUAL node${visuals === 1 ? '' : 's'} in the skill${w.weave ? `, woven in from ${r3(w.start)}s` : ''}`,
    a.effect === 'Camera' && a.lock !== false ? `a DirectionLock for ${r3(cameraLength(a))}s` : '',
    trimmed ? `${trimmed} other Camera block${trimmed === 1 ? '' : 's'} cut to end where the next begins (overlapping, JJS hands the view back to the player mid-shot)` : '',
    extended ? `the line now waits ${extended}s longer at the end to fit it` : '',
  ].filter(Boolean);
  note.value = `${parts.join('; ')}. Changes are written as you make them now.`;
}

function removeAnimation() {
  const a = anim.peek();
  const w = where.peek();
  if (w.draft) return closeAnimator();
  const removed = removeChain(S.line.peek(), a);
  if (removed) S.replaceLine(removed.line);
  const { [specKey(w, a)]: _gone, ...rest } = S.animSpecs.peek();
  S.animSpecs.value = rest;
  closeAnimator();
  S.status.value = 'Animation removed from the skill (Ctrl+Z brings it back).';
}

// ─── The viewport ───────────────────────────────────────────────────────

effect(() => {
  const a = anim.value;
  const w = where.value;
  const picked = animKey.value;
  const mode = gizmoMode.value;
  S.run.value; // re-place when the simulation changes
  const scene = S.sceneNow();
  if (!scene) return;
  if (!a || !w) {
    if (!S.camPathOpen.peek()) scene.setAnimOverlay(null);
    return;
  }
  const world = (k) => frameAt(k.t).multiply(keyMatrix(k));
  const keys = a.keys.map(world);
  // A camera's path is the blocks JJS will run; a part's, its samples.
  const along = a.effect === 'Camera'
    ? cameraLegs(a).flatMap((l) => [0, 0.25, 0.5, 0.75].map((k) => l.from.t + (l.to.t - l.from.t) * k)).concat(a.keys.at(-1).t).map((t) => ({ t, ...cameraAt(a, t) }))
    : samples(a);
  const path = along.map((p) => new Vector3().setFromMatrixPosition(world(p)));
  scene.setAnimOverlay({
    keys,
    path,
    selected: picked,
    mode,
    camera: a.effect === 'Camera',
    sizes: a.keys.map((k) => [k.size, k.size, k.size].map((v) => Math.max(0.2, Math.min(40, v)))),
    onDrag(i, m) {
      const k = anim.peek().keys[i];
      const local = frameAt(k.t).invert().multiply(m);
      anim.value = { ...anim.peek(), keys: anim.peek().keys.map((x, j) => (j === i ? { ...x, ...keyFrom(local) } : x)) };
    },
    onDragEnd: () => !where.peek()?.draft && apply(),
  });
});

// ─── Looking through it ─────────────────────────────────────────────────

/** Plays the skill from the animation's start, looking through the camera. */
function playPreview() {
  const w = where.peek();
  if (!w) return;
  if (previewing.peek() && S.playing.peek()) {
    S.stop();
    return;
  }
  previewing.value = true;
  S.seek(w.start);
  S.play();
}
// The camera to look through: the animation's, from its start to its end
// (and its hold), shake and all; outside that, your own.
effect(() => {
  const a = anim.value;
  const w = where.value;
  const on = a?.effect === 'Camera' && w && (previewing.value || lookThrough.value);
  const scene = S.sceneNow();
  if (!scene) return;
  if (!on) return scene.setPreviewCamera(null);
  const end = a.keys.at(-1).t + (a.hold ?? 0);
  scene.setPreviewCamera((t) => {
    const local = t - w.start;
    if (local < -1e-6 || local > end + 1e-6) return null;
    // The blocks as JJS runs them (whole frames, its easings), else the keys.
    const pose = cameraAt(a, local) ?? shakenAt(a, Math.min(local, a.keys.at(-1).t));
    const m = frameAt(local).multiply(keyMatrix(pose));
    const position = new Vector3();
    const quaternion = new Quaternion();
    m.decompose(position, quaternion, new Vector3());
    return { position, quaternion };
  });
});
// Play's look-through ends with the playback.
effect(() => {
  if (!S.playing.value && previewing.peek()) previewing.value = false;
});
S.setAnimPick((i) => {
  if (!anim.peek()) return import('./campath.jsx').then((m) => m.pickCameraKey(i));
  animKey.value = i;
  const k = anim.peek().keys[i];
  if (k && where.peek()) S.seek(where.peek().start + k.t);
});
// While flying to set camera keys, the skill's own camera stays out of the
// way (the preview looks through the animation instead).
let hadCamera = false;
effect(() => {
  const a = anim.value;
  if (a?.effect === 'Camera') {
    hadCamera = true;
    S.skillCamera.value = false;
  } else if (hadCamera) {
    hadCamera = false;
    S.skillCamera.value = true;
  }
});

// ─── The panel ──────────────────────────────────────────────────────────

export function AnimatorPanel() {
  const a = anim.value;
  const w = where.value;
  const table = useRef(null);
  // The picked key stays in sight (a new key lands at the bottom).
  useEffect(() => {
    table.current?.querySelector('.key-row.is-picked')?.scrollIntoView({ block: 'nearest' });
  }, [animKey.value, a?.keys.length]);
  useEffect(() => {
    if (!a) return;
    const key = (e) => {
      if (e.target?.closest?.('input, textarea, select') || e.ctrlKey || e.altKey) return;
      if (e.key === 'g' || e.key === 'G') gizmoMode.value = 'translate';
      if (e.key === 'r' || e.key === 'R') gizmoMode.value = 'rotate';
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [Boolean(a)]);
  if (!a || !w) return null;
  const camera = a.effect === 'Camera';
  const picked = animKey.value;
  const pk = a.keys[picked] ?? a.keys[0];
  const playingPreview = previewing.value && S.playing.value;
  return (
    <FloatingPanel
      key={camera ? 'cam' : 'vis'}
      id={camera ? 'animator-camera-2' : 'animator-visual-2'}
      icon={camera ? 'camera' : 'wand'}
      title={camera ? 'Camera animation' : 'Visual animation'}
      badge={w.draft ? `${a.tag} · draft` : a.tag}
      onClose={closeAnimator}
      width={camera ? 900 : 1000}
      height={620}
    >
      <div class="key-toolbar">
        <Button icon="plus" onClick={addKey} title={`A new key after the last one (${camera ? 'your view' : 'the pose there'}), at the playhead if it's past the last key (K)`}>
          {camera ? 'Key from view' : 'Add key'}
        </Button>
        {camera && (
          <Button icon="camera" onClick={() => (setKeyToView(picked), w.draft ? (anim.value = { ...anim.value }) : applySoon())} title="Put the picked key where your view is">
            Set key {picked + 1} to view
          </Button>
        )}
        <Button
          icon={playingPreview ? 'pause' : 'play'}
          onClick={playPreview}
          title={camera ? 'Play the skill from the animation’s start, looking through this camera' : 'Play the skill from the animation’s start'}
        >
          {playingPreview ? 'Stop' : 'Play'}
        </Button>
        <span class="spacer" />
        {!camera && (
          <Segmented
            label="Gizmo"
            value={gizmoMode.value}
            onChange={(m) => (gizmoMode.value = m)}
            options={[
              { id: 'translate', label: 'Move (G)' },
              { id: 'rotate', label: 'Turn (R)' },
            ]}
          />
        )}
      </div>

      {!camera && (
        <div class="key-grid key-look">
          <label>Effect</label>
          <select class="input" value={a.effect} onChange={(e) => setLook({ effect: e.currentTarget.value })}>
            {PART_EFFECTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label>Body part</label>
          <select class="input" value={a.part} onChange={(e) => setLook({ part: e.currentTarget.value })}>
            {BODY_PARTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {a.effect === 'Mesh' && (
            <>
              <label>Mesh ID</label>
              <input class="input num" value={a.template.AMOUNT ?? ''} placeholder="AMOUNT" onChange={(e) => setLook({ template: { AMOUNT: Number(e.currentTarget.value) || 0 } })} />
              <label>Texture ID</label>
              <input class="input num" value={a.template.TEXTURE ?? ''} placeholder="TEXTURE" onChange={(e) => setLook({ template: { TEXTURE: Number(e.currentTarget.value) || 0 } })} />
            </>
          )}
        </div>
      )}

      <div class="key-table" role="table" aria-label="Keys" ref={table}>
        <div class={`key-row is-head ${camera ? 'is-camera' : ''}`} role="row">
          <span>#</span>
          <span>Time</span>
          <span title="x left, y up, z forward, on the body part">Position</span>
          <span>Rotation (°)</span>
          {!camera && <span>Size</span>}
          {!camera && <span>Transp.</span>}
          {camera && <span title="How hard the camera shakes at this key, in studs; it eases to the next key's">Shake</span>}
          {camera && <span title="How much the shake turns the camera at this key, in degrees">Turn</span>}
          <span>Easing to next</span>
          <span title="Jump cut: be at this key at once, instead of moving there from the key before">Cut</span>
          <span />
        </div>
        {a.keys.map((k, i) => (
          <div key={i} role="row" class={`key-row ${i === picked ? 'is-picked' : ''} ${camera ? 'is-camera' : ''}`} onPointerDown={() => (animKey.value = i)}>
            <button type="button" class="key-n num" title="Go to this key" onClick={() => S.seek(w.start + k.t)}>
              {i + 1}
            </button>
            <Num label="Time (s)" step={0.05} min={0} value={k.t} onChange={(v) => setKey(i, { t: Math.max(0, v) })} />
            <Vec label="Position" step={0.25} value={k.pos} onChange={(pos) => setKey(i, { pos })} />
            <Vec label="Rotation" step={5} value={k.rot} onChange={(rot) => setKey(i, { rot })} />
            {!camera && <Num label="Size" step={0.1} value={k.size} onChange={(v) => setKey(i, { size: v })} />}
            {!camera && <Num label="Transparency (0 solid, 1 gone)" step={0.1} width={48} min={0} max={1} value={k.opacity} onChange={(v) => setKey(i, { opacity: v })} />}
            {camera && <Num label="Shake (studs)" step={0.05} width={50} min={0} value={k.shake ?? 0} onChange={(v) => setKey(i, { shake: Math.max(0, v) })} />}
            {camera && <Num label="Shake turn (degrees)" step={0.2} width={50} min={0} value={k.turn ?? 0} onChange={(v) => setKey(i, { turn: Math.max(0, v) })} />}
            {i < a.keys.length - 1 ? (
              a.keys[i + 1].cut ? (
                <span class="hint" title="The next key is a jump cut: this key holds until it">holds, then cuts</span>
              ) : (
                <EaseSelect value={k.ease} onChange={(ease) => setKey(i, { ease })} />
              )
            ) : (
              <span class="hint">last</span>
            )}
            <input
              type="checkbox"
              class="key-cut"
              disabled={i === 0}
              checked={Boolean(k.cut) && i > 0}
              aria-label={`Key ${i + 1}: jump cut`}
              title={i === 0 ? 'The first key is where it starts' : 'Jump cut: be at this key at once, instead of moving there'}
              onChange={(e) => setKey(i, { cut: e.currentTarget.checked })}
            />
            <IconButton icon="trash-2" class="danger" size={12} label={`Delete key ${i + 1}`} onClick={() => deleteKey(i)} />
          </div>
        ))}
      </div>

      <div class="key-options">
        <label class="prop-row">
          <span
            title={
              camera
                ? 'A curve through the keys: more Camera blocks, only where the curve bends away from a straight line. Off, each stretch between keys is one block, eased by JJS'
                : 'A curve through the keys (the chain gets more, shorter pieces); off, straight lines key to key'
            }
          >
            Smooth curve through the keys
          </span>
          <Switch checked={a.smooth} label="Smooth curve" onChange={(on) => setAnim({ smooth: on })} />
        </label>
        {a.smooth && !camera && (
          <label class="prop-row">
            <span>Pieces a second</span>
            <Num label="Pieces a second" step={1} min={2} max={60} value={a.rate} onChange={(v) => setAnim({ rate: Math.max(2, Math.min(60, Math.round(v))) })} />
          </label>
        )}
        {camera && (
          <p class="hint">
            {(() => {
              const n = cameraLegs(a).length;
              return `${n} Camera block${n === 1 ? '' : 's'}, back to back in whole frames, each eased by JJS. A stretch between keys is one block with its key’s easing unless a curve or a shake needs more.`;
            })()}
          </p>
        )}
        <label class="prop-row">
          <span>Hold at the end (s)</span>
          <Num label="Hold at the end" step={0.1} min={0} value={a.hold} onChange={(v) => setAnim({ hold: Math.max(0, v) })} />
        </label>
        <div class="prop-row">
          <span title="After a node: the chain starts at that node. Weave in: it starts at a time in the skill, each piece going in between the nodes already there, at its moment">
            Placement
          </span>
          <Segmented
            label="Placement"
            value={w.weave ? 'weave' : 'after'}
            onChange={(m) => setPlacement(m === 'weave')}
            options={[
              { id: 'after', label: w.draft ? `After node ${Math.min(w.index, S.line.value.length)}` : 'Where it is' },
              { id: 'weave', label: 'Weave in' },
            ]}
          />
        </div>
        {w.weave && (
          <div class="prop-row">
            <span>Starts at (s into the skill)</span>
            <span class="anim-start">
              <Num label="Starts at (s)" step={0.05} min={0} value={r3(w.start)} onChange={setStart} />
              <Button variant="ghost" icon="locate-fixed" title="Start it at the playhead" onClick={() => setStart(S.time.peek())}>
                Playhead
              </Button>
            </span>
          </div>
        )}
        {camera && (
          <label class="prop-row">
            <span title="A STATE DirectionLock on you for the whole animation (its hold too), so you don't turn while the shot plays">
              Lock your direction while it plays
            </span>
            <Switch checked={a.lock !== false} label="DirectionLock while it plays" onChange={(on) => setAnim({ lock: on }, { now: true })} />
          </label>
        )}
        {camera && (
          <>
            <h4 class="section-title">Shake</h4>
            <p class="hint">
              Each key has its own shake (studs) and turn (degrees), easing to the next key’s: key a shake up and down to
              make it hit and die away. (JJS’s screen shakes don’t move a Camera block’s view, so it goes into the camera’s
              own path.)
            </p>
            <div class="key-shake-presets" role="group" aria-label={`Shake at key ${picked + 1}`}>
              <span class="hint">Key {picked + 1}:</span>
              {SHAKES.map(([label, shake, turn]) => (
                <button
                  key={label}
                  type="button"
                  class="chip"
                  aria-pressed={(pk.shake ?? 0) === shake && (pk.turn ?? 0) === turn}
                  onClick={() => setKey(picked, { shake, turn })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label class="prop-row">
              <span>Shakes a second</span>
              <Num label="Shakes a second" step={1} min={1} max={30} value={a.shakeFreq ?? 14} onChange={(v) => setAnim({ shakeFreq: Math.max(1, Math.min(30, v)) })} />
            </label>
            <label class="prop-row">
              <span>Look through it while editing</span>
              <Switch checked={lookThrough.value} label="Look through the animated camera" onChange={(on) => (lookThrough.value = on)} />
            </label>
          </>
        )}
      </div>
      {note.value && <p class="hint key-note">{note.value}</p>}
      <div class="modal-actions">
        <Button variant="ghost" class="danger" icon="trash-2" onClick={removeAnimation}>
          {w.draft ? 'Discard draft' : 'Remove animation'}
        </Button>
        {w.draft && <span class="hint">Not in the skill yet.</span>}
        <span class="spacer" />
        <Button variant="primary" icon="check" onClick={apply}>
          Write to skill
        </Button>
      </div>
    </FloatingPanel>
  );
}

/**
 * The AI tool's way in (app_animate): animates node `node` of the open
 * branch with the keys given, and writes it into the skill. `weave` (seconds
 * into the skill) weaves it in from then; `lock: false` leaves a camera
 * without its DirectionLock.
 */
export async function runAnimation({ node, keys, smooth = true, easing = 'Linear', hold = 0, shake, shakeFreq, weave, lock }) {
  const line = S.line.peek();
  if (!line[node]) throw new Error(`The open branch has no node ${node} (it has ${line.length}).`);
  S.pickNode(node);
  if (!openAnimator()) throw new Error(S.status.peek() ?? 'That node can’t be animated.');
  const a = anim.peek();
  const base = a.keys[0];
  const ease = easing.includes(' ') ? easing : `${easing} InOut`;
  // `shake` (one shake from..to) is the older way: it lands on the keys.
  anim.value = normalize({
    ...a,
    smooth,
    hold,
    keys: keys
      .map((k) => ({
        t: k.t,
        pos: k.pos,
        rot: k.rot ?? base.rot,
        size: k.size ?? base.size,
        opacity: k.opacity ?? base.opacity,
        ease: k.ease ?? ease,
        shake: k.shake,
        turn: k.turn,
        cut: Boolean(k.cut),
      }))
      .sort((x, y) => x.t - y.t),
    shakeFreq: shakeFreq ?? shake?.freq ?? a.shakeFreq ?? 14,
    ...(shake ? { shake: { amount: 0, turn: 0, freq: 14, from: 0, to: keys.at(-1).t, decay: true, ...shake } } : {}),
    ...(lock === false ? { lock: false } : {}),
  });
  if (Number.isFinite(weave)) where.value = { ...where.peek(), weave: true, start: Math.max(0, weave) };
  apply();
  return { tag: anim.peek().tag, keys: anim.peek().keys.length, note: note.peek() };
}
