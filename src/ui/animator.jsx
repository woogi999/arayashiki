// The motion animator's panel (src/animator.js): keyframes for a VISUAL in
// the skill (a mesh or part effect, or a Camera), shown in the viewport as a
// path with a gizmo on the picked key, written into the skill as a chain of
// VISUALs as you go. A floating window: drag it by its header, size it
// from its corner.
//
// Ways in: "New camera animation" and "New visual animation" (the Nodes
// panel's Animate menu, the search, the viewport's right-click menu) add the
// VISUAL and open it; "Animate" (Ctrl+K) opens the picked VISUAL.
import { useEffect } from 'preact/hooks';
import { effect, signal } from '@preact/signals';
import { Matrix4, Quaternion, Vector3 } from 'three';
import * as S from '../store.js';
import { BODY_PARTS } from '../../core/schema.js';
import {
  ANIMATABLE,
  anim,
  animKey,
  chainNodes,
  freshTag,
  fromNode,
  keyFrom,
  keyMatrix,
  lineTimes,
  poseAt,
  removeChain,
  samples,
  writeChain,
} from '../animator.js';
import { Button, IconButton, Segmented, Switch } from './controls.jsx';
import { EaseSelect, FloatingPanel, Num, ShakeFields, Vec } from './keys-ui.jsx';

// Where the animation sits: the skill, branch and when its first node runs.
const where = signal(null); // { uid, branch, index, start }
const gizmoMode = signal('translate');
const lookThrough = signal(false);
const note = signal(null);

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
  const w = { uid: S.skillUid.peek(), branch: S.branch.peek(), index, start: startOf(index) };
  const saved = S.animSpecs.peek()[specKey(w, { tag })];
  where.value = w;
  anim.value = saved ?? fromNode({ ...node, 'VISUAL TAG': tag }, tag);
  animKey.value = 0;
  lookThrough.value = false;
  note.value = null;
  S.animatorOpen.value = true;
  return true;
}

/** K while the animator is open: a new key (from the view, for a camera). */
export function keyFromViewShortcut() {
  if (anim.peek()) addKey();
}

// A new VISUAL after the picked node (or at the end), opened in the animator.
function addVisual(fields) {
  if (!S.skill.peek()) {
    S.status.value = 'Open a skill first.';
    return false;
  }
  S.workspace.value = 'skills';
  S.showStart.value = false;
  S.addNode('VISUAL');
  for (const [k, v] of Object.entries(fields)) S.setNodeField(k, v);
  S.simulateNow();
  return openAnimator();
}

/** A new camera shot: two keys a second apart, both where your view is now. Fly, then set the second. */
export function newCameraAnimation() {
  if (!addVisual({ EFFECT: 'Camera', TIME: 1, 'BODY PART': 'HumanoidRootPart' })) return;
  const a = anim.peek();
  anim.value = { ...a, keys: a.keys.map((k, i) => ({ ...k, t: i, ease: 'Sine InOut' })) };
  setKeyToView(0);
  setKeyToView(1);
  S.seek(where.peek().start);
  apply();
  note.value = 'Two keys where your view is. Move the playhead, fly to the next shot, and press “Key from view” (K).';
}

/** A new animated part (a Block, unless `effect` says otherwise): from in front of you to further out. */
export function newVisualAnimation(effect = 'Block') {
  if (!addVisual({ EFFECT: effect, TIME: 1, 'BODY PART': 'HumanoidRootPart', SIZE: 2, POSITION: '0, 0, 3', ROTATION: '0, 0, 0' })) return;
  const a = anim.peek();
  anim.value = {
    ...a,
    smooth: true,
    keys: [
      { t: 0, pos: [0, 0, 3], rot: [0, 0, 0], size: 2, opacity: 0, ease: 'Sine InOut' },
      { t: 1, pos: [0, 2, 12], rot: [0, 180, 0], size: 2, opacity: 0, ease: 'Sine InOut' },
    ],
  };
  S.seek(where.peek().start);
  apply();
  note.value = 'Drag the gizmo on a key (G move, R turn), add keys along the way, and set each key’s easing.';
}

export const closeAnimator = () => {
  anim.value = null;
  where.value = null;
  S.animatorOpen.value = false;
};

// ─── Changing it ────────────────────────────────────────────────────────

function setAnim(patch, { now = false } = {}) {
  anim.value = { ...anim.value, ...patch };
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
 * Adds a key: at the playhead, or, when the playhead is on a key already
 * (or before the first), half way to the next key or half a second after the
 * last. Never replaces one. A camera's new key is your view; a part's is
 * where the animation has it then. The playhead moves to the new key.
 */
function addKey() {
  const a = anim.peek();
  const w = where.peek();
  if (!a || !w) return;
  let t = r3(S.time.peek() - w.start);
  const near = (x) => a.keys.findIndex((k) => Math.abs(k.t - x) < 0.02);
  if (t < 0 || near(t) >= 0) {
    const at = t < 0 ? 0 : near(t);
    const next = a.keys[at + 1];
    t = r3(next ? (a.keys[at].t + next.t) / 2 : a.keys.at(-1).t + 0.5);
  }
  const base = poseAt({ ...a, shake: null }, t);
  const key = { ...base, t, pos: base.pos.map(r3), rot: base.rot.map(r3), ease: a.keys.findLast((k) => k.t <= t)?.ease ?? 'Sine InOut' };
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
  const removed = removeChain(S.line.peek(), a);
  if (removed) {
    S.replaceLine(removed.line, `anim:${a.tag}`);
    where.value = { ...where.peek(), index: removed.index };
  }
  anim.value = { ...a, ...patch, template: { ...a.template, ...(patch.effect ? { EFFECT: patch.effect } : {}), ...(patch.part ? { 'BODY PART': patch.part } : {}), ...(patch.template ?? {}) } };
  apply();
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
  const nodes = chainNodes(a, frameAt);
  const lineStart = lineTimes(S.line.peek())[w.index] ?? 0;
  const { line, extended } = writeChain(S.line.peek(), a, nodes, { index: w.index, time: lineStart });
  S.replaceLine(line, `anim:${a.tag}`);
  S.animSpecs.value = { ...S.animSpecs.peek(), [specKey(w, a)]: a };
  const first = line.findIndex((n) => n?.K_NAME === 'VISUAL' && n['VISUAL TAG'] === a.tag && n.EFFECT === a.effect);
  if (first >= 0) {
    S.nodeIndex.value = first;
    where.value = { ...w, index: first };
  }
  note.value = `${nodes.length} VISUAL node${nodes.length === 1 ? '' : 's'} in the skill${extended ? `; the line now waits ${extended}s longer at the end to fit it` : ''}.`;
}

function removeAnimation() {
  const a = anim.peek();
  const w = where.peek();
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
  const path = samples(a).map((p) => new Vector3().setFromMatrixPosition(world(p)));
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
    onDragEnd: () => apply(),
  });
});
S.setAnimPick((i) => {
  if (!anim.peek()) return import('./campath.jsx').then((m) => m.pickCameraKey(i));
  animKey.value = i;
  const k = anim.peek().keys[i];
  if (k && where.peek()) S.seek(where.peek().start + k.t);
});
// While flying to set camera keys, the skill's own camera stays out of the
// way (unless you ask to look through it).
let hadCamera = false;
effect(() => {
  const a = anim.value;
  const through = lookThrough.value;
  if (a?.effect === 'Camera') {
    hadCamera = true;
    S.skillCamera.value = through;
  } else if (hadCamera) {
    hadCamera = false;
    S.skillCamera.value = true;
  }
});

// ─── The panel ──────────────────────────────────────────────────────────

export function AnimatorPanel() {
  const a = anim.value;
  const w = where.value;
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
  const end = a.keys.at(-1).t;
  return (
    <FloatingPanel key={camera ? "cam" : "vis"} id={camera ? "animator-camera" : "animator-visual"} icon={camera ? 'camera' : 'wand'} title={camera ? 'Camera animation' : 'Visual animation'} badge={a.tag} onClose={closeAnimator} width={camera ? 740 : 900} height={600}>
      <div class="key-toolbar">
        <Button icon="plus" onClick={addKey} title={`Add a key (${camera ? 'your view' : 'the pose there'}) at the playhead, or after the last key (K)`}>
          {camera ? 'Key from view' : 'Add key'}
        </Button>
        {camera && (
          <Button icon="camera" onClick={() => (setKeyToView(picked), applySoon())} title="Put the picked key where your view is">
            Set key {picked + 1} to view
          </Button>
        )}
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

      <div class="key-table" role="table" aria-label="Keys">
        <div class={`key-row is-head ${camera ? 'is-camera' : ''}`} role="row">
          <span>#</span>
          <span>Time</span>
          <span title="x left, y up, z forward, on the body part">Position</span>
          <span>Rotation (°)</span>
          {!camera && <span>Size</span>}
          {!camera && <span>Transp.</span>}
          <span>Easing to next</span>
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
            {i < a.keys.length - 1 ? <EaseSelect value={k.ease} onChange={(ease) => setKey(i, { ease })} /> : <span class="hint">last</span>}
            <IconButton icon="trash-2" class="danger" size={12} label={`Delete key ${i + 1}`} onClick={() => deleteKey(i)} />
          </div>
        ))}
      </div>

      <div class="key-options">
        <label class="prop-row">
          <span title="A curve through the keys (the chain gets more, shorter pieces); off, straight lines key to key">Smooth curve through the keys</span>
          <Switch checked={a.smooth} label="Smooth curve" onChange={(on) => setAnim({ smooth: on })} />
        </label>
        {a.smooth && (
          <label class="prop-row">
            <span>Pieces a second</span>
            <Num label="Pieces a second" step={1} min={2} max={60} value={a.rate} onChange={(v) => setAnim({ rate: Math.max(2, Math.min(60, Math.round(v))) })} />
          </label>
        )}
        <label class="prop-row">
          <span>Hold at the end (s)</span>
          <Num label="Hold at the end" step={0.1} min={0} value={a.hold} onChange={(v) => setAnim({ hold: Math.max(0, v) })} />
        </label>
        {camera && (
          <>
            <h4 class="section-title">Shake</h4>
            <p class="hint">JJS’s screen shakes don’t move a Camera block’s view, so the shake goes into the camera’s own path.</p>
            <ShakeFields shake={a.shake} end={end} onChange={(shake) => setAnim({ shake })} />
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
          Remove animation
        </Button>
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
 * branch with the keys given, and writes it into the skill.
 */
export async function runAnimation({ node, keys, smooth = true, easing = 'Linear', hold = 0, shake }) {
  const line = S.line.peek();
  if (!line[node]) throw new Error(`The open branch has no node ${node} (it has ${line.length}).`);
  S.pickNode(node);
  if (!openAnimator()) throw new Error(S.status.peek() ?? 'That node can’t be animated.');
  const a = anim.peek();
  const base = a.keys[0];
  const ease = easing.includes(' ') ? easing : `${easing} InOut`;
  anim.value = {
    ...a,
    smooth,
    hold,
    keys: keys
      .map((k) => ({ t: k.t, pos: k.pos, rot: k.rot ?? base.rot, size: k.size ?? base.size, opacity: k.opacity ?? base.opacity, ease: k.ease ?? ease }))
      .sort((x, y) => x.t - y.t),
    shake: shake ? { amount: 0, turn: 0, freq: 14, from: 0, to: keys.at(-1).t, decay: true, ...shake } : a.shake,
  };
  apply();
  return { tag: anim.peek().tag, keys: anim.peek().keys.length, note: note.peek() };
}
