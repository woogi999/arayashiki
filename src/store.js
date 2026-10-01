// The editor's state and everything that changes it. Signals, so a change
// re-renders only what reads it: the playhead moves 60 times a second
// without touching the node list or the inspector.
//
// Movesets come in and go out as the codes the Skill Builder copies; in
// between, skills are edited node by node (branches along the top, a line of
// nodes, their conditions and properties) and played in the simulator. The
// rules come from real JJS exports: docs/jjs-skill-builder.md.

import { signal, computed, batch, effect } from '@preact/signals';
import {
  decodeMoveset,
  encodeMoveset,
  branchNames,
  lineOf,
  reqOf,
  linePath,
  reqPath,
  branchObject,
  newProgram,
  newUid,
  setIn,
} from '../core/format.js';
import {
  CATEGORIES,
  categoryOf,
  NODES,
  GROUPS,
  PROP_FLAGS,
  PROP_NUMBERS,
  REQ_KINDS,
  VAR_NONE,
  SKILL_FIELDS,
  nodeTitle,
  newNode,
} from '../core/schema.js';
import { simulate } from '../core/sim.js';
import { starterMoveset, blankSkill } from '../core/starter.js';
import { dbGet, dbSet } from './persist.js';
import { isDesktop, openCodeFile, readCodeFile, robloxSound, saveCodeFile, writeCodeFile } from './platform.js';
import { look } from './account.js';
import { ease } from './fx/roblox.js';
import { appearance } from './prefs.js';
import { crashed, restoreWork } from './session.js';
import { thin, withKey } from './camera-keys.js';
import { continuation } from './animator.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BRANCH_FIELDS = ['BRANCH', 'BRANCH TARGET', 'BRANCH FINISHER', 'BRANCH COLLIDED'];
export const DEFAULT_NAME = 'My character';

// ─── State ──────────────────────────────────────────────────────────────

const first = starterMoveset();
export const skills = signal(first);
export const name = signal(DEFAULT_NAME);
export const category = signal('SKILL');
export const skillUid = signal(first[0].uid);
export const branch = signal('');
// The Properties editor's tab: 'node', 'branch', 'skill' or 'sim'.
export const tab = signal('node');
export const TABS = ['node', 'branch', 'skill', 'sim'];
// The bottom editor: 'timeline' (the frame meter) or 'log'.
export const bottomTab = signal('timeline');
// Area sizes in px (the old fixed layout, kept for its restore).
export const areas = signal({ left: 330, right: 340, bottom: 230, outliner: 300 });
// How the panels are arranged (src/ui/dock.jsx): a tree of splits, and the
// ones floating. null until restored, then always a whole layout.
export const layout = signal(null);
// Outliner categories that are open.
export const openCategories = signal(['SKILL']);
export const nodeIndex = signal(0);
export const past = signal([]);
export const future = signal([]);
export const dialog = signal(null);
// The workspace, as Blender's tabs along the top: 'skills' (the moveset
// editor) or 'bars' (the Meter Maker, src/barmaker/).
export const workspace = signal('skills');
export const status = signal(null);
// The .txt the moveset was opened from or last saved to (desktop only).
export const filePath = signal(null);
// The start screen (src/ui/start.jsx): shown at launch unless turned off,
// and from the mark in the top bar.
export const showStart = signal(readStartPref());
function readStartPref() {
  try {
    return localStorage.getItem('arayashiki-start-on-launch') !== 'false';
  } catch {
    return true;
  }
}
export function setStartOnLaunch(on) {
  try {
    localStorage.setItem('arayashiki-start-on-launch', String(on));
  } catch {
    // not kept
  }
}
export const startOnLaunch = () => readStartPref();
// .txt files opened or saved lately, newest first: [{ path, name, at }].
export const recent = signal(readRecent());
function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem('arayashiki-recent') ?? '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r?.path === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
function rememberFile(path, label) {
  if (!path) return;
  const next = [{ path, name: label || path.split(/[\\/]/).pop().replace(/\.txt$/i, ''), at: Date.now() }, ...recent.value.filter((r) => r.path !== path)].slice(0, 8);
  recent.value = next;
  try {
    localStorage.setItem('arayashiki-recent', JSON.stringify(next));
  } catch {
    // not kept
  }
}
export function forgetRecent(path) {
  recent.value = recent.value.filter((r) => r.path !== path);
  try {
    localStorage.setItem('arayashiki-recent', JSON.stringify(recent.value));
  } catch {
    // not kept
  }
}
/** Opens a recent .txt again. */
export async function openRecent(path) {
  try {
    const file = await readCodeFile(path);
    return openText(file);
  } catch (e) {
    status.value = `Couldn’t open ${path}: ${e.message ?? e}`;
    forgetRecent(path);
    return false;
  }
}
export const dirty = signal(false);
// The area last clicked or focused ('nodes', 'outliner', 'viewport'…): keys
// like Delete act on what it shows.
export const activeArea = signal('nodes');
// What the Outliner last had clicked: 'skill' or 'branch'.
export const outlined = signal('skill');

// Playback and the simulator's settings.
export const run = signal(null);
export const time = signal(0);
export const playing = signal(false);
export const speed = signal(1);
export const fromBranch = signal(false);
export const hits = signal('auto');
export const wall = signal(''); // studs to a wall in front; '' is none
export const distance = signal(5);
export const conds = signal({ AIR: false, JUMP: false, HOLD: false, ULT: false, AIM: true, DOMAIN: false, BAR: 100 });
export const follow = signal(true);
// The camera the view shows (src/camera-rig.js): 'free' (yours), 'auto' (a
// cinematographer) or 'path' (keys you recorded), the auto camera's
// settings, the recorded keys, whether a skill's Camera blocks, FOV and
// shakes take over, and whether a live take is being recorded.
export const camMode = signal('free');
export const autoCam = signal({});
export const camKeys = signal([]);
// How the recorded path moves: a curve through the keys or straight lines,
// and a shake ({ amount, turn, freq, from, to, decay }) or none.
export const camPath = signal({ smooth: true, shake: null });
export const skillCamera = signal(true);
export const recordingCam = signal(false);
// The motion animator's animations (src/animator.js), by "skill uid:branch:tag",
// so their keys come back when they're opened again.
export const animSpecs = signal({});
// Floating panels: the motion animator and the AI assistant; the Settings tab.
export const animatorOpen = signal(false);
export const camPathOpen = signal(false);
export const assistantOpen = signal(false);
export const settingsTab = signal('keys');
// The Export window's page: 'code', 'video' or 'image'.
export const exportTab = signal('code');
/** Opens the Export window on a page. */
export function openExport(tab = 'code') {
  exportTab.value = tab;
  dialog.value = 'export';
}
// The user manual's section to open at (the search's help results).
export const manualSection = signal(null);
export const sounds = signal(false);
// The viewport: hitboxes and projectiles drawn or not, and the shape of the
// picture ('' fills the area; else a width:height like '16:9').
export const showHitboxes = signal(true);
export const aspect = signal('');
// The dummy: there or not, and whether it blocks, counters or evades.
export const dummy = signal({ present: true, block: false, counter: false, evasive: false });
// Seconds each node takes before the next (JJS's server runs them one by one).
export const nodeDelay = signal(0.0001);
// Tags already set when the skill starts ("NAME=value" per line), and whether
// the moveset's Use When Obtained skills run alongside it.
export const simTags = signal('');
export const runPassives = signal(false);
// Nodes and skills picked together (Ctrl-click), besides the current one.
export const nodeSelection = signal([0]);
export const skillSelection = signal([]);

// ─── Derived ────────────────────────────────────────────────────────────

export const skill = computed(() => skills.value.find((s) => s.uid === skillUid.value) ?? null);
export const program = computed(() => skill.value?.DATA ?? null);
export const branches = computed(() => branchNames(program.value));
export const line = computed(() => lineOf(program.value, branch.value));
export const selectedNode = computed(() => line.value[nodeIndex.value] ?? null);
// A stretch the timeline must reach past the skill's own end, and shows as
// a band: the animation open in the animator ({ start, end, keys, label,
// room }, in seconds into the skill), so a camera longer than the skill (or
// a draft not in it yet) plays all the way through, in step with the skill.
// `room` is time past its end the playhead can go to, for the next key;
// playing stops at the end.
export const extent = signal(null);
const reach = (r, ex) => (r ? Math.max(r.duration, ex ? ex.end + (ex.room ?? 0) : 0) : 0);
export const duration = computed(() => reach(run.value, extent.value));
/** Where playing stops: the skill's end, or the animation's if that's later. */
const playEnd = () => Math.max(run.peek()?.duration ?? 0, extent.peek()?.end ?? 0);

export const categoryRows = computed(() =>
  CATEGORIES.map((c) => ({
    ...c,
    count: skills.value.filter((s) => s.K_NAME === c.id).length,
    active: c.id === category.value,
  })),
);

export const skillRows = computed(() => {
  const colour = categoryOf(category.value);
  return skills.value
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.K_NAME === category.value)
    .map(({ s, index }) => ({
      uid: s.uid,
      index,
      name: String(s.NAME ?? ''),
      separator: s.ADD === false && !s.DATA,
      active: s.uid === skillUid.value,
      key: s.KEY,
      color: colour.color,
      icon: colour.icon,
      nodes: s.DATA
        ? lineOf(s.DATA, '').length + branchNames(s.DATA).reduce((n, b) => n + lineOf(s.DATA, b).length, 0)
        : 0,
    }));
});

export const nodes = computed(() => line.value.map((node, index) => ({ index, ...nodeTitle(node) })));

// The nodes of the open branch whose events are live at the playhead, as a
// string so it only changes when the set does.
export const playingKey = computed(() => {
  const r = run.value;
  if (!r) return '';
  const t = time.value;
  const b = branch.value;
  const out = [];
  for (const e of r.events)
    if (e.branch === b && e.index !== undefined && t >= e.t && t < e.end && !out.includes(e.index)) out.push(e.index);
  return out.sort((a, c) => a - c).join(',');
});

export const palette = GROUPS.map((group) => ({ group, nodes: NODES.filter((n) => n.group === group) }));

export const reqs = computed(() =>
  reqOf(program.value, branch.value).map((req, index) => {
    const known = REQ_KINDS.find((k) => k.id === req.K_NAME);
    // The number a condition takes: AMOUNT, or DURABILITY for Durability.
    const field = known?.field ?? ('AMOUNT' in req ? 'AMOUNT' : null);
    return {
      index,
      kind: req.K_NAME,
      flip: Boolean(req.FLIP),
      field,
      amount: field ? (req[field] ?? known?.def) : undefined,
      hasAmount: Boolean(field),
      label: known?.label ?? req.K_NAME,
    };
  }),
);

export const skillFields = computed(() => {
  const s = skill.value;
  return [...SKILL_FIELDS.common, ...(SKILL_FIELDS[s?.K_NAME] ?? [])].map((f) => ({
    ...f,
    value: s?.[f.key] ?? f.def,
  }));
});

export const props = computed(() => {
  const prop = program.value?.Prop;
  const obj = prop && !Array.isArray(prop) ? prop : {};
  return {
    flags: PROP_FLAGS.map((f) => ({ ...f, on: Boolean(obj[f.key]) })),
    numbers: PROP_NUMBERS.map((f) => ({ ...f, value: obj[f.key] ?? f.def, set: f.key in obj })),
    variable: obj.VAR === VAR_NONE ? '' : (obj.VAR ?? ''),
    others: Object.entries(obj)
      .filter(([k]) => k !== 'VAR' && !PROP_FLAGS.some((f) => f.key === k) && !PROP_NUMBERS.some((f) => f.key === k))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
  };
});

export const targetHp = computed(() => {
  if (!run.value) return 100;
  const t = time.value;
  let hp = 100;
  for (const h of run.value.hp) if (h.t <= t) hp = h.hp;
  return hp;
});

// States and tags live at the playhead, for the overlay on the view.
export const hud = computed(() => {
  const out = { user: [], target: [] };
  const r = run.value;
  if (!r) return out;
  const t = time.value;
  for (const e of r.events)
    if (e.kind === 'STATE' && !e.node.CHECK && t >= e.t && t < e.end)
      out[e.who].push({ label: e.node.STATE ?? 'Stun', value: `${Math.max(0, e.end - t).toFixed(1)}s` });
  // Ragdolled: how long until they get up, or "in the air" before a regular
  // ragdoll lands and starts counting.
  for (const who of ['user', 'target'])
    for (const rd of r.ragdolls?.[who] ?? [])
      if (t >= rd.t0 && t < rd.t1)
        out[who].unshift({
          label: 'Ragdoll',
          value: rd.landed === null || t < rd.landed ? 'airborne' : `${(rd.t1 - t).toFixed(1)}s`,
        });
  const tags = new Map();
  for (const tag of r.tags) if (tag.t <= t) tags.set(`${tag.who}:${tag.tag}`, tag);
  for (const tag of tags.values())
    if (tag.value !== null) out[tag.who].push({ label: tag.tag, value: tag.value, tag: true });
  return out;
});

export const logRows = computed(() =>
  (run.value?.log ?? []).slice(0, 500).map((l, i) => ({
    ...l,
    i,
    place: `${l.branch ? l.branch : 'Default'}${l.index !== undefined ? ` #${l.index + 1}` : ''}`,
  })),
);

// How many log rows the playhead has passed.
export const pastCount = computed(() => {
  const t = time.value;
  const rows = run.value?.log ?? [];
  let n = 0;
  while (n < rows.length && n < 500 && rows[n].t <= t) n++;
  return n;
});

// ─── History ────────────────────────────────────────────────────────────

let lastKey = null;
let lastAt = 0;

function remember(key = null) {
  const now = performance.now();
  const same = key && key === lastKey && now - lastAt < 1000;
  lastKey = key;
  lastAt = now;
  if (same) return;
  past.value = [...past.value.slice(-99), skills.value];
  future.value = [];
}

function change(next, key) {
  batch(() => {
    remember(key);
    skills.value = next;
    dirty.value = true;
    status.value = null;
  });
  resimulate();
}

export function undo() {
  if (!past.value.length) return;
  batch(() => {
    future.value = [skills.value, ...future.value];
    skills.value = past.value.at(-1);
    past.value = past.value.slice(0, -1);
    afterHistory();
  });
}

export function redo() {
  if (!future.value.length) return;
  batch(() => {
    past.value = [...past.value, skills.value];
    skills.value = future.value[0];
    future.value = future.value.slice(1);
    afterHistory();
  });
}

function afterHistory() {
  lastKey = null;
  if (!skill.value) skillUid.value = skills.value[0]?.uid ?? null;
  if (branch.value && !branches.value.includes(branch.value)) branch.value = '';
  nodeIndex.value = clamp(nodeIndex.value, 0, Math.max(0, line.value.length - 1));
  resimulate();
}

// ─── Editing ────────────────────────────────────────────────────────────

function editSkill(fnOf, key) {
  const uid = skillUid.value;
  change(
    skills.value.map((s) => (s.uid === uid ? fnOf(s) : s)),
    key,
  );
}

// Changes the program at a path, making one if the skill has none.
function editProgram(path, value, key) {
  editSkill((s) => {
    let data = s.DATA ?? newProgram();
    if (path[0] === 'Branch' && Array.isArray(data.Branch)) data = { ...data, Branch: {} };
    if (path[0] === 'Prop' && Array.isArray(data.Prop)) data = { ...data, Prop: {} };
    return { ...s, DATA: setIn(data, path, value) };
  }, key);
}

const setLine = (next, key) => editProgram(linePath(branch.value), next, key);
/** Replaces the open branch's line in one step (the motion animator's chains). */
export const replaceLine = (next, key) => setLine(next, key);

export function pickCategory(id) {
  category.value = id;
  if (!openCategories.value.includes(id)) openCategories.value = [...openCategories.value, id];
  const found = skills.value.find((s) => s.K_NAME === id);
  if (found && skill.value?.K_NAME !== id) pickSkill(found.uid);
}

export function pickSkill(uid, { toggle = false } = {}) {
  batch(() => {
    skillSelection.value = toggle
      ? skillSelection.value.includes(uid)
        ? skillSelection.value.filter((u) => u !== uid)
        : [...skillSelection.value, uid]
      : [uid];
    if (toggle && !skillSelection.value.includes(uid) && skillSelection.value.length) return;
    skillUid.value = uid;
    branch.value = '';
    nodeIndex.value = 0;
    nodeSelection.value = [0];
  });
  stop();
  resimulate();
}

export function pickBranch(nameOf) {
  batch(() => {
    branch.value = nameOf;
    nodeIndex.value = 0;
    nodeSelection.value = [0];
  });
  if (fromBranch.value) resimulate();
}

/** Picks a node; Ctrl adds or removes it, Shift takes the run from the last. */
export function pickNode(index, { toggle = false, range = false } = {}) {
  batch(() => {
    const now = nodeSelection.value;
    if (range) {
      const from = nodeIndex.value;
      const [a, b] = from < index ? [from, index] : [index, from];
      nodeSelection.value = [...new Set([...now, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)])];
    } else if (toggle) {
      nodeSelection.value = now.includes(index) ? now.filter((i) => i !== index) : [...now, index];
      if (!nodeSelection.value.length) nodeSelection.value = [index];
    } else nodeSelection.value = [index];
    nodeIndex.value = nodeSelection.value.includes(index) ? index : nodeSelection.value.at(-1);
  });
}
/**
 * Picks every node of the open branch (Ctrl+A), or with the Outliner the
 * area last clicked, every skill of the category.
 */
export function selectAll() {
  if (activeArea.peek() === 'outliner') {
    skillSelection.value = skillRows.peek().map((r) => r.uid);
    status.value = `${skillSelection.value.length} skills picked.`;
    return;
  }
  const n = line.peek().length;
  if (!n) return;
  batch(() => {
    nodeSelection.value = Array.from({ length: n }, (_, i) => i);
    nodeIndex.value = clamp(nodeIndex.peek(), 0, n - 1);
  });
  status.value = `All ${n} nodes picked.`;
}
const selectedIndices = () => {
  const n = line.value.length;
  const list = [...new Set([...nodeSelection.value, nodeIndex.value])].filter((i) => i >= 0 && i < n);
  return list.sort((a, b) => a - b);
};

export function addNode(kind) {
  const next = [...line.value];
  const at = next.length ? clamp(nodeIndex.value + 1, 0, next.length) : 0;
  next.splice(at, 0, newNode(kind));
  setLine(next);
  nodeIndex.value = at;
}

export function moveNode(step) {
  const i = nodeIndex.value;
  const j = i + step;
  const next = [...line.value];
  if (j < 0 || j >= next.length) return;
  [next[i], next[j]] = [next[j], next[i]];
  setLine(next);
  nodeIndex.value = j;
}

export function moveNodeTo(from, to) {
  if (from === to || from == null) return;
  const next = [...line.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setLine(next);
  nodeIndex.value = to;
}

/** Duplicates the picked nodes, each copy after the last of them. */
export function duplicateNode() {
  const picked = selectedIndices();
  if (!picked.length) return;
  const next = [...line.value];
  const copies = picked.map((i) => structuredClone(line.value[i]));
  const at = picked.at(-1) + 1;
  next.splice(at, 0, ...copies);
  setLine(next);
  batch(() => {
    nodeSelection.value = copies.map((_, k) => at + k);
    nodeIndex.value = at + copies.length - 1;
  });
}

/**
 * Carries the picked VISUAL on from its ALT POSITION: a WAIT (its TIME less
 * 0.05, so the two overlap and it doesn't blink; a Camera's whole TIME) and
 * a copy that starts where it ends and makes the same move again (see
 * continuation in animator.js), right after it. Pressed again on the copy,
 * it goes on further, a piece at a time.
 */
export function continueVisual() {
  const i = nodeIndex.value;
  const node = line.value[i];
  if (node?.K_NAME !== 'VISUAL') {
    status.value = 'Pick a VISUAL node to carry on from its ALT POSITION.';
    return;
  }
  const { node: next, wait } = continuation(node);
  const out = [...line.value];
  out.splice(i + 1, 0, { K_NAME: 'WAIT', TIME: wait }, next);
  setLine(out);
  batch(() => {
    nodeIndex.value = i + 2;
    nodeSelection.value = [i + 2];
  });
  status.value =
    node.EFFECT === 'Camera'
      ? `Camera carried on: a WAIT ${wait}s (its whole TIME: Camera blocks mustn't overlap) and a block from where it ended.`
      : `Carried on: a WAIT ${wait}s (its TIME less 0.05, so they overlap) and a VISUAL starting at its ALT POSITION.`;
}

/** Sets several fields of the picked node at once (the viewport's gizmo); `key` joins a drag into one undo step. */
export function setNodeFields(fields, key) {
  const i = nodeIndex.value;
  const node = line.value[i];
  if (!node) return;
  editProgram([...linePath(branch.value), i], { ...node, ...fields }, key);
}

/** Deletes the picked nodes. */
export function deleteNode() {
  const picked = new Set(selectedIndices());
  if (!picked.size) return;
  const next = line.value.filter((_, i) => !picked.has(i));
  setLine(next);
  batch(() => {
    nodeIndex.value = clamp(Math.min(...picked), 0, Math.max(0, next.length - 1));
    nodeSelection.value = [nodeIndex.value];
  });
}

export function setNodeField(key, value) {
  const i = nodeIndex.value;
  editProgram([...linePath(branch.value), i, key], value, `${skillUid.value}:${branch.value}:${i}:${key}`);
}

export function clearNodeField(key) {
  const i = nodeIndex.value;
  const { [key]: _gone, ...rest } = line.value[i];
  editProgram([...linePath(branch.value), i], rest);
}

// Branches.
export function addBranch() {
  const names = new Set(branches.value);
  let n = names.size + 1;
  while (names.has(`Branch${n}`)) n++;
  const nameOf = `Branch${n}`;
  editProgram(['Branch', nameOf], { Line: [], Req: [] });
  batch(() => {
    branch.value = nameOf;
    nodeIndex.value = 0;
  });
}

// Renaming keeps every BRANCH, BRANCH TARGET… and RANDOM that pointed at it.
// Returns false (and changes nothing) when the name can't be used.
export function renameBranch(to) {
  const from = branch.value;
  to = to.trim();
  if (!from || !to || to === from || branches.value.includes(to)) return false;
  const rename = (node) => {
    let out = node;
    for (const key of BRANCH_FIELDS) if (out[key] === from) out = { ...out, [key]: to };
    if (typeof out.RANDOM === 'string' && out.RANDOM.split(',').some((s) => s.trim() === from))
      out = {
        ...out,
        RANDOM: out.RANDOM.split(',')
          .map((s) => (s.trim() === from ? to : s.trim()))
          .join(', '),
      };
    return out;
  };
  editSkill((s) => {
    const data = s.DATA;
    const renamed = {};
    for (const [nameOf, b] of Object.entries(branchObject(data)))
      renamed[nameOf === from ? to : nameOf] = { ...b, Line: (b.Line ?? []).map(rename) };
    return { ...s, DATA: { ...data, Line: (data.Line ?? []).map(rename), Branch: renamed } };
  });
  branch.value = to;
  return true;
}

export function deleteBranch() {
  const nameOf = branch.value;
  if (!nameOf) return;
  editSkill((s) => {
    const { [nameOf]: _gone, ...rest } = branchObject(s.DATA);
    return { ...s, DATA: { ...s.DATA, Branch: rest } };
  });
  batch(() => {
    branch.value = '';
    nodeIndex.value = 0;
  });
}

// Conditions.
export function addReq(kind) {
  const known = REQ_KINDS.find((k) => k.id === kind);
  const req = kind === 'DUR' ? { K_NAME: kind } : { FLIP: false, K_NAME: kind };
  if (known?.field) req[known.field] = known.def;
  editProgram(reqPath(branch.value), [...reqOf(program.value, branch.value), req]);
}

export function toggleReqFlip(index) {
  const list = [...reqOf(program.value, branch.value)];
  list[index] = { ...list[index], FLIP: !list[index].FLIP };
  editProgram(reqPath(branch.value), list);
}

export function setReqAmount(index, value) {
  const list = [...reqOf(program.value, branch.value)];
  const field = REQ_KINDS.find((k) => k.id === list[index].K_NAME)?.field ?? 'AMOUNT';
  list[index] = { ...list[index], [field]: Number(value) || 0 };
  editProgram(reqPath(branch.value), list, `req:${index}`);
}

export function removeReq(index) {
  editProgram(
    reqPath(branch.value),
    reqOf(program.value, branch.value).filter((_, i) => i !== index),
  );
}

// Skill settings and flags.
export function setSkillField(field, raw) {
  let value = raw;
  if (field.type === 'num') value = Number(value) || 0;
  editSkill((s) => ({ ...s, [field.key]: value }), `skill:${field.key}`);
}

export function toggleFlag(key) {
  const prop = program.value?.Prop;
  const on = prop && !Array.isArray(prop) && prop[key];
  if (on) {
    const { [key]: _gone, ...rest } = prop;
    editProgram(['Prop'], rest);
  } else editProgram(['Prop', key], true);
}

// A number Property (DMG, KNOCK): back at its default, it's left out.
export function setPropNumber(key, raw) {
  const def = PROP_NUMBERS.find((f) => f.key === key)?.def ?? 1;
  const n = Number(raw);
  const value = raw === '' || !Number.isFinite(n) ? def : n;
  const prop = program.value?.Prop;
  const base = prop && !Array.isArray(prop) ? prop : {};
  const { [key]: _old, ...rest } = base;
  editProgram(['Prop'], value === def ? rest : { ...rest, [key]: value });
}

export function setVariable(raw) {
  const value = raw.trim();
  const prop = program.value?.Prop;
  const base = prop && !Array.isArray(prop) ? prop : {};
  const { VAR: _old, ...rest } = base;
  editProgram(['Prop'], value ? { ...rest, VAR: value } : rest);
}

// Skills.
export function addSkill() {
  const cat = category.value;
  const count = skills.value.filter((s) => s.K_NAME === cat).length;
  const made = blankSkill(cat, cat === 'MELEE' ? String(count + 1) : 'New skill');
  const lastOfCategory = skills.value.findLastIndex((s) => s.K_NAME === cat);
  const next = [...skills.value];
  next.splice(lastOfCategory < 0 ? next.length : lastOfCategory + 1, 0, made);
  change(next);
  pickSkill(made.uid);
}

export function duplicateSkill() {
  const s = skill.value;
  if (!s) return;
  const copy = { ...structuredClone(s), uid: newUid(), NAME: `${s.NAME} copy` };
  const i = skills.value.indexOf(s);
  const next = [...skills.value];
  next.splice(i + 1, 0, copy);
  change(next);
  pickSkill(copy.uid);
}

export function deleteSkill() {
  const s = skill.value;
  if (!s) return;
  const gone = new Set([s.uid, ...skillSelection.value]);
  const i = skills.value.indexOf(s);
  const next = skills.value.filter((x) => !gone.has(x.uid));
  change(next);
  skillSelection.value = [];
  const after =
    next.slice(i).find((x) => x.K_NAME === category.value) ??
    next.findLast((x) => x.K_NAME === category.value) ??
    next[0];
  batch(() => {
    skillUid.value = after?.uid ?? null;
    branch.value = '';
    nodeIndex.value = 0;
  });
  status.value =
    gone.size > 1 ? `Deleted ${gone.size} skills. Ctrl+Z brings them back.` : `Deleted “${s.NAME}”. Ctrl+Z brings it back.`;
}

/** Deletes skills by uid in one undoable step (the AI tools). */
export function removeSkills(uids) {
  const gone = new Set(uids);
  const next = skills.value.filter((s) => !gone.has(s.uid));
  change(next);
  if (!skill.value) {
    const after = next.find((x) => x.K_NAME === category.value) ?? next[0];
    batch(() => {
      skillUid.value = after?.uid ?? null;
      branch.value = '';
      nodeIndex.value = 0;
    });
  }
  return gone.size;
}

/** Delete in the Outliner: the branch it has picked, or else the skill. */
export function deleteOutlined() {
  if (outlined.value === 'branch' && branch.value) deleteBranch();
  else deleteSkill();
}

// Up or down among the skills of the same category.
export function moveSkill(step) {
  const rows = skillRows.value;
  const at = rows.findIndex((r) => r.uid === skillUid.value);
  const other = rows[at + step];
  if (at < 0 || !other) return;
  const next = [...skills.value];
  [next[rows[at].index], next[other.index]] = [next[other.index], next[rows[at].index]];
  change(next);
}

export function setName(raw) {
  name.value = raw.trim().slice(0, 60) || DEFAULT_NAME;
  dirty.value = true;
}

// ─── Codes in and out, saving ───────────────────────────────────────────

/** Puts decoded skills in: replacing the moveset, or added to it. */
function takeSkills(incoming, mode, label) {
  if (mode === 'append') change([...skills.value, ...incoming]);
  else {
    change(incoming);
    filePath.value = null;
    if (label) name.value = label.slice(0, 60);
  }
  const firstPlayable = incoming.find((s) => s.DATA) ?? incoming[0];
  if (firstPlayable) {
    category.value = firstPlayable.K_NAME;
    pickSkill(firstPlayable.uid);
  }
}

/**
 * Puts skills (DATA parsed) into the moveset: one with the same name and
 * category as a skill already there replaces it, keeping its place; the
 * rest are added at the end. For generated skills (the Progress Bar Maker's,
 * templates) that are made again after a change.
 */
export function mergeSkills(incoming) {
  showStart.value = false;
  const next = [...skills.value];
  let added = 0;
  let replaced = 0;
  for (const skill of incoming) {
    const at = next.findIndex((s) => s.K_NAME === skill.K_NAME && s.NAME === skill.NAME);
    if (at >= 0) {
      next[at] = { ...skill, uid: next[at].uid };
      replaced++;
    } else {
      next.push({ ...skill, uid: newUid() });
      added++;
    }
  }
  change(next);
  const first = next.find((s) => s.K_NAME === incoming[0]?.K_NAME && s.NAME === incoming[0]?.NAME);
  if (first) {
    category.value = first.K_NAME;
    pickSkill(first.uid);
  }
  return { added, replaced };
}

/** Imports a code; throws a readable error for anything that isn't one. */
export async function importCode(code, mode = 'replace', label) {
  const incoming = await decodeMoveset(code);
  showStart.value = false;
  takeSkills(incoming, mode, label);
  status.value = `${mode === 'append' ? 'Added' : 'Imported'} ${incoming.length} skill${incoming.length === 1 ? '' : 's'}.`;
  return incoming.length;
}

export const exportCode = (scope) => encodeMoveset(scope === 'skill' && skill.value ? [skill.value] : skills.value);

/**
 * Save (Ctrl+S): the code back into the .txt it came from, or, the first
 * time, into one you pick (Save As). Movesets live in .txt files now, the
 * same code JJS copies out, not inside the app.
 */
export async function saveHere({ as = false } = {}) {
  let code;
  try {
    code = await encodeMoveset(skills.value);
  } catch (e) {
    status.value = `Couldn’t write the code: ${e.message}`;
    return false;
  }
  try {
    if (!as && filePath.value && isDesktop) await writeCodeFile(filePath.value, code);
    else {
      const where = await saveCodeFile(name.value, code);
      if (!where) return false; // cancelled
      if (isDesktop) filePath.value = where;
      if (isDesktop) rememberFile(where, name.value);
    }
  } catch (e) {
    status.value = `Couldn’t save: ${e.message ?? e}`;
    return false;
  }
  dirty.value = false;
  status.value = `Saved “${name.value}”${filePath.value ? ` to ${filePath.value}` : ''}.`;
  return true;
}

/** Open (Ctrl+O): a .txt holding a code, straight from a file picker. */
export async function openFile() {
  const file = await openCodeFile().catch((e) => {
    status.value = String(e);
    return null;
  });
  if (!file?.text) return false;
  return openText(file);
}

/** A code from a file (picked, or handed over at launch): it becomes the moveset. */
export async function openText({ text, name: label, file }) {
  try {
    await importCode(text, 'replace', label ?? undefined);
  } catch (e) {
    status.value = `Couldn’t open that: ${e.message}`;
    return false;
  }
  batch(() => {
    filePath.value = file ?? null;
    dirty.value = false;
    showStart.value = false;
  });
  if (file) rememberFile(file, label);
  return true;
}

/** New Character: a blank moveset, one empty skill to start adding nodes to. */
export function newMoveset() {
  change([blankSkill('SKILL')]);
  batch(() => {
    name.value = DEFAULT_NAME;
    filePath.value = null;
    dirty.value = false;
    category.value = 'SKILL';
  });
  pickSkill(skills.value[0].uid);
  status.value = 'New moveset. Ctrl+Z brings the last one back.';
}

// ─── Playing ────────────────────────────────────────────────────────────

let scene = null;
let simTimer = 0;
let frame = 0;

/** The 3D view registers itself here once it's up (or null when it goes). */
export function attachScene(next) {
  scene = next;
  if (import.meta.env?.DEV) window.__arayashikiScene = next; // for poking at it in dev tools
  if (scene) {
    scene.setFollow(follow.value);
    scene.setPlaying(playing.peek());
    scene.setCamera({ mode: camMode.peek(), auto: autoCam.peek(), keys: camKeys.peek(), path: camPath.peek(), skillCamera: skillCamera.peek() });
    scene.setShowHitboxes(showHitboxes.peek());
    scene.setBackground(appearance.peek().viewportBg);
    scene.setDummy(dummy.peek().present !== false);
    scene.setAspect(aspectRatio(aspect.peek()));
    scene.setRun(run.value);
    scene.show(time.peek());
    if (look.peek()) scene.setLook(look.peek());
    syncEditTool();
  }
}

const aspectRatio = (text) => {
  const [w, h] = String(text ?? '').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : null;
};

// The motion animator (src/ui/animator.jsx) hears clicks on its key markers.
let animPick = null;
export const setAnimPick = (fn) => (animPick = fn);

// ─── Moving things in the view ──────────────────────────────────────────

// The viewport's tool, as Roblox Studio's: 'select' (click to pick),
// 'translate', 'scale' or 'rotate' (a gizmo on the picked node's box or
// effect: drag it and the node's POSITION, SIZE or ROTATION follow), in
// world or local axes.
const readTool = () => {
  try {
    return JSON.parse(localStorage.getItem('arayashiki-view-tool') ?? 'null') ?? {};
  } catch {
    return {};
  }
};
export const editTool = signal(readTool().mode ?? 'translate');
export const editSpace = signal(readTool().space ?? 'world');
effect(() => {
  try {
    localStorage.setItem('arayashiki-view-tool', JSON.stringify({ mode: editTool.value, space: editSpace.value }));
  } catch {
    // not kept
  }
});
let gizmoDrag = 0;
function syncEditTool() {
  const mode = editTool.value;
  const space = editSpace.value;
  const i = nodeIndex.value;
  const b = branch.value;
  const uid = skillUid.value;
  const busy = animatorOpen.value || camPathOpen.value || workspace.value !== 'skills';
  if (!scene) return;
  scene.setEditTool(
    busy || !uid
      ? null
      : {
          branch: b,
          index: i,
          mode,
          space,
          onEdit: (fields) => setNodeFields(fields, `${uid}:${b}:${i}:gizmo:${gizmoDrag}`),
          onEnd: () => {
            gizmoDrag++;
            status.value = `Moved in the view: ${line.peek()[i]?.K_NAME ?? 'node'} ${i}. Ctrl snaps while you drag; Ctrl+Z undoes it.`;
          },
        },
  );
}
effect(syncEditTool);
const TOOL_NAMES = { select: 'Select', translate: 'Move', scale: 'Scale', rotate: 'Rotate' };
export function setEditTool(mode) {
  editTool.value = mode;
  status.value = `Tool: ${TOOL_NAMES[mode]}${mode === 'select' ? '' : ' (pick a hitbox, projectile or effect, then drag its handles)'}.`;
}
export function toggleEditSpace() {
  editSpace.value = editSpace.peek() === 'world' ? 'local' : 'world';
  status.value = `Moving and turning in ${editSpace.peek()} axes.`;
}

/** A click in the viewport: an effect or a box takes you to its node. */
export function pickInView({ kind, event, additive, index }) {
  if (kind === 'anim-key') return animPick?.(index);
  if (kind !== 'event' || !event || event.p) return;
  if (event.branch !== undefined && event.branch !== branch.value && (event.branch === '' || branches.value.includes(event.branch))) {
    batch(() => {
      branch.value = event.branch;
      nodeSelection.value = [];
    });
  }
  if (event.index !== undefined) {
    pickNode(event.index, { toggle: additive });
    tab.value = 'node';
  }
}
export const resetCamera = () => scene?.resetCamera();

/**
 * The viewport's camera settings back to how they start: the Free camera,
 * Follow on, the skill's own camera on, the auto camera's defaults, and the
 * view framed again. Recorded keys stay (Clear camera keys removes them).
 */
export function resetCameraSettings() {
  batch(() => {
    camMode.value = 'free';
    follow.value = true;
    skillCamera.value = true;
    autoCam.value = {};
    camPath.value = { ...camPath.peek(), shake: null };
  });
  resetCamera();
  status.value = 'Camera settings reset.';
}
/** The 3D view, once it's up (capture, camera keys): null before. */
export const sceneNow = () => scene;

// ─── Cameras ────────────────────────────────────────────────────────────

/** Adds a camera key at the playhead from where your camera is (K). */
export function addCameraKey() {
  if (!scene) return;
  if (camMode.peek() !== 'free') camMode.value = 'free';
  const key = scene.cameraKey(time.peek());
  camKeys.value = withKey(camKeys.peek(), key);
  status.value = `Camera key ${camKeys.value.length} at ${key.t.toFixed(2)}s. Fly somewhere else, move the playhead and press ${'K'} again; pick “Recorded” to watch the path.`;
}
export function removeCameraKey(t) {
  camKeys.value = camKeys.peek().filter((k) => Math.abs(k.t - t) > 1e-4);
}
export function clearCameraKeys() {
  camKeys.value = [];
  if (camMode.peek() === 'path') camMode.value = 'free';
  status.value = 'Camera keys cleared.';
}
export function goToCameraKey(key) {
  seek(key.t);
  if (camMode.peek() !== 'free') camMode.value = 'free';
  scene?.goToKey(key);
}

// A live take: the skill plays from the start (at the speed set) while you
// fly; every frame's camera becomes a key, thinned to 30 a second.
let take = null;
export function recordCamera() {
  if (!scene) return;
  if (recordingCam.peek()) return stopRecording();
  camMode.value = 'free';
  take = [];
  recordingCam.value = true;
  stop();
  time.value = 0;
  status.value = 'Recording the camera: fly with right-drag and WASD. It stops at the end of the skill (or press Record again).';
  play();
}
function stopRecording() {
  recordingCam.value = false;
  if (take?.length) {
    camKeys.value = thin(take);
    camMode.value = 'path';
    status.value = `Recorded ${camKeys.value.length} camera keys. The view now plays your take (Camera: Recorded).`;
  }
  take = null;
}
function recordFrame(t) {
  if (take && scene) take.push(scene.cameraKey(t));
}

effect(() => {
  const r = run.value;
  scene?.setRun(r);
  scene?.show(time.peek());
});
// Read the signal before touching the scene: `scene?.show(time.value)` never
// reads `time` while there's no scene yet, so the effect would never
// subscribe and the view would stay frozen while the clock runs.
effect(() => {
  const t = time.value;
  scene?.show(t);
});
effect(() => {
  const on = follow.value;
  scene?.setFollow(on);
});
effect(() => {
  const on = playing.value;
  scene?.setPlaying(on);
});
effect(() => {
  const camera = { mode: camMode.value, auto: autoCam.value, keys: camKeys.value, path: camPath.value, skillCamera: skillCamera.value };
  scene?.setCamera(camera);
});
effect(() => {
  const on = showHitboxes.value;
  scene?.setShowHitboxes(on);
});
effect(() => {
  const colour = appearance.value.viewportBg;
  scene?.setBackground(colour);
});
effect(() => {
  const ratio = aspectRatio(aspect.value);
  scene?.setAspect(ratio);
});
effect(() => {
  const here = dummy.value.present !== false;
  scene?.setDummy(here);
});
// The events of the picked nodes glow in the view.
effect(() => {
  const r = run.value;
  const b = branch.value;
  const picked = new Set([...nodeSelection.value, nodeIndex.value]);
  const ids = (r?.events ?? []).filter((e) => !e.p && e.branch === b && picked.has(e.index)).map((e) => e.id);
  scene?.setSelected(ids);
});
// The signed-in account's avatar on "You" (account.js).
effect(() => {
  const l = look.value;
  scene?.setLook(l);
});

export function resimulate() {
  clearTimeout(simTimer);
  simTimer = setTimeout(simulateNow, 90);
}

export function simulateNow() {
  clearTimeout(simTimer);
  const s = skill.value;
  const next =
    s?.DATA && !('__unreadable' in s.DATA)
      ? simulate(s, {
          conditions: conds.value,
          hits: hits.value,
          wall: wall.value === '' ? null : Number(wall.value),
          distance: distance.value,
          start: fromBranch.value ? branch.value : '',
          nodeDelay: Math.max(0, Number(nodeDelay.value) || 0),
          dummy: dummy.value,
          tags: { user: parseTags(simTags.value) },
          passives: runPassives.value
            ? skills.value.filter((x) => x.uid !== s.uid && x.DATA && !('__unreadable' in x.DATA) && x.DATA.Prop?.USE)
            : [],
        })
      : null;
  batch(() => {
    run.value = next;
    time.value = Math.min(time.peek(), reach(next, extent.peek()));
  });
}

export function play() {
  if (playing.value) return stop();
  simulateNow();
  const r = run.value;
  if (!r) return;
  const end = time.value < playEnd() - 0.01 ? playEnd() : duration.peek();
  if (time.value >= end - 0.01) time.value = 0;
  playing.value = true;
  let last = performance.now();
  const tick = (now) => {
    if (!playing.value) return;
    const next = Math.min(end, time.value + ((now - last) / 1000) * speed.value);
    last = now;
    time.value = next;
    syncSounds(next);
    if (recordingCam.peek()) recordFrame(next);
    if (next >= end) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

export function stop() {
  playing.value = false;
  cancelAnimationFrame(frame);
  pauseSounds();
  if (recordingCam.peek()) stopRecording();
}

export function restart() {
  stop();
  time.value = 0;
  play();
}

export function seek(t) {
  stop();
  time.value = clamp(t, 0, duration.value);
}

/** Steps the playhead by whole frames (60 a second). */
export function stepFrames(n) {
  seek(Math.round(time.value * 60 + n) / 60);
}

export function setCond(key, value) {
  conds.value = { ...conds.value, [key]: key === 'BAR' ? clamp(Number(value) || 0, 0, 100) : Boolean(value) };
  simulateNow();
}

export function setWall(raw) {
  const value = String(raw).trim();
  wall.value = value === '' || !Number.isFinite(Number(value)) ? '' : String(Math.max(0, Number(value)));
  simulateNow();
}

export function setDistance(raw) {
  const n = Number(raw);
  distance.value = Number.isFinite(n) ? clamp(n, 0, 200) : 5;
  simulateNow();
}

/** "NAME=value" lines (or commas) → { NAME: value }. */
export function parseTags(text) {
  const out = {};
  for (const part of String(text ?? '').split(/[\n,]+/)) {
    const m = /^\s*([^=:]+?)\s*[=:]\s*(.*?)\s*$/.exec(part);
    if (m && m[1]) out[m[1]] = m[2];
  }
  return out;
}

export function setDummy(patch) {
  dummy.value = { ...dummy.value, ...patch };
  simulateNow();
}

export function setNodeDelay(raw) {
  const n = Number(raw);
  nodeDelay.value = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
  simulateNow();
}

export function setSimTags(text) {
  simTags.value = text;
  simulateNow();
}

export function toggleRunPassives() {
  runPassives.value = !runPassives.value;
  simulateNow();
}

export function setHits(mode) {
  hits.value = mode;
  simulateNow();
}

export function toggleFromBranch() {
  fromBranch.value = !fromBranch.value;
  simulateNow();
}

// Sounds follow the playhead like a video's: each SFX node is a clip that
// starts at its node, from START, and stops at END, at a later SFX node with
// CANCEL, or when its file runs out. FADE IN and FADE OUT ramp its volume at
// either end. Pausing pauses them; playing again picks them up where the
// playhead is. Sounds come from Roblox when it hands them over (many are
// private; those stay silent).
const num0 = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const urls = new Map(); // sound ID → Promise<url | null>
const voices = new Map(); // event id → { el: HTMLAudioElement | null }

/** When each SFX event's sound stops, on the simulation's clock. */
function clips(r) {
  if (r.clips) return r.clips;
  // An SFX with CANCEL stops that character's sounds with the same ID
  // (JJS's customSFX), not every sound.
  const cancels = r.events.filter((e) => e.kind === 'SFX' && e.node.CANCEL === true);
  r.clips = r.events
    .filter((e) => e.kind === 'SFX' && e.node.CANCEL !== true && String(e.node.ID ?? '0') !== '0')
    .map((e) => {
      const rate = clamp(num0(e.node.SPEED, 1) || 1, 0.25, 4);
      const from = Math.max(0, num0(e.node.START, 0));
      const to = num0(e.node.END, 500);
      const cut = cancels.find((c) => c.t > e.t && c.who === e.who && String(c.node.ID) === String(e.node.ID))?.t ?? Infinity;
      return { e, rate, from, stop: Math.min(e.t + Math.max(0, to - from) / rate, cut) };
    });
  return r.clips;
}

/**
 * A run's sounds as clips, for a video's soundtrack (src/video/audio.js):
 * { id (sound ID), t (starts), stop, rate, from (seconds into the file),
 * volume, fadeIn, fadeOut }.
 */
export const audioClips = (r) =>
  clips(r).map(({ e, rate, from, stop: until }) => ({
    id: String(e.node.ID),
    t: e.t,
    stop: until,
    rate,
    from,
    volume: clamp(num0(e.node.VOLUME, 0.5), 0, 1),
    fadeIn: num0(e.node['FADE IN'], 0),
    fadeOut: num0(e.node['FADE OUT'], 0),
  }));

function voice(clip) {
  const key = clip.e.id;
  if (voices.has(key)) return voices.get(key);
  const v = { el: null };
  voices.set(key, v);
  const id = String(clip.e.node.ID);
  if (!urls.has(id)) urls.set(id, robloxSound(id).catch(() => null));
  urls.get(id).then((url) => {
    if (!url || voices.get(key) !== v) return;
    v.el = Object.assign(new Audio(url), { preload: 'auto' });
    if (playing.peek()) syncSounds(time.peek());
  });
  return v;
}

function syncSounds(t) {
  const r = run.peek();
  if (!sounds.peek() || !r) return pauseSounds();
  for (const clip of clips(r)) {
    const { e, rate, from, stop: until } = clip;
    const on = t >= e.t && t < until;
    if (!on) {
      const v = voices.get(e.id);
      if (v?.el && !v.el.paused) v.el.pause();
      continue;
    }
    const el = voice(clip).el;
    if (!el) continue;
    const want = from + (t - e.t) * rate;
    if (Number.isFinite(el.duration) && want >= el.duration) {
      if (!el.paused) el.pause();
      continue;
    }
    // JJS (customSFX): Volume is VOLUME; FADE IN tweens it up from 0
    // (TweenInfo.new: Quad Out); FADE OUT waits TimeLength - START - FADE OUT
    // seconds (the whole file's length, whatever END says) and tweens it
    // down; END is a PlaybackRegion, so the sound just stops there.
    const fadeIn = num0(e.node['FADE IN'], 0);
    const fadeOut = num0(e.node['FADE OUT'], 0);
    let gain = 1;
    if (fadeIn > 0) gain *= ease('Quad', 'Out', (t - e.t) / fadeIn);
    if (fadeOut > 0 && Number.isFinite(el.duration)) {
      const begins = e.t + Math.max(0, el.duration - from - fadeOut);
      if (t > begins) gain *= 1 - ease('Quad', 'Out', (t - begins) / fadeOut);
    }
    try {
      el.playbackRate = rate * speed.peek();
      el.volume = clamp(num0(e.node.VOLUME, 0.5) * gain, 0, 1);
      if (el.paused || Math.abs(el.currentTime - want) > 0.12) el.currentTime = want;
      if (el.paused) el.play().catch(() => {});
    } catch {
      // not playable
    }
  }
}

function pauseSounds() {
  for (const v of voices.values()) if (v.el && !v.el.paused) v.el.pause();
}

// A new run is new clips: drop the old voices.
effect(() => {
  run.value;
  pauseSounds();
  voices.clear();
});
effect(() => {
  if (!sounds.value) pauseSounds();
});

/** A log row or an event takes you to its node and its moment. */
export function jumpTo({ t, branch: at, index }) {
  seek(t);
  if (at !== undefined && (at === '' || branches.value.includes(at)))
    batch(() => {
      branch.value = at ?? '';
      if (index !== undefined) nodeIndex.value = index;
      tab.value = 'node';
    });
}

// ─── Keeping it between runs ────────────────────────────────────────────

const KEPT = {
  skills,
  name,
  category,
  skillUid,
  branch,
  tab,
  hits,
  conds,
  filePath,
  dirty,
  follow,
  sounds,
  showHitboxes,
  aspect,
  dummy,
  nodeDelay,
  simTags,
  runPassives,
  speed,
  distance,
  bottomTab,
  areas,
  layout,
  openCategories,
  camMode,
  autoCam,
  camKeys,
  camPath,
  skillCamera,
  animSpecs,
};

// What the moveset is (rather than how the window is set up): it only comes
// back after a crash (src/session.js); a clean exit starts the next run fresh.
const WORK = new Set(['skills', 'name', 'category', 'skillUid', 'branch', 'tab', 'filePath', 'dirty']);

// The work brought back after the app didn't close properly, for the start
// screen's "Continue where you left off": { name, skills, file, dirty }.
export const recovered = signal(null);

/** Puts back what was open last time. Resolves once it's in. */
export async function restore() {
  const saved = await dbGet('state');
  const withWork = restoreWork && Array.isArray(saved?.skills) && saved.skills.length > 0;
  if (saved && typeof saved === 'object')
    batch(() => {
      for (const [key, sig] of Object.entries(KEPT)) {
        if (WORK.has(key) && !withWork) continue;
        const value = saved[key];
        if (value === undefined || (typeof value !== typeof sig.value && sig.value != null)) continue;
        sig.value = value;
      }
      if (!TABS.includes(tab.value)) tab.value = 'node';
      if (!Array.isArray(openCategories.value)) openCategories.value = [category.value];
      if (!Array.isArray(skills.value) || !skills.value.length) skills.value = starterMoveset();
      skills.value = skills.value.map((s) => (s.uid ? s : { ...s, uid: newUid() }));
      if (!skill.value) skillUid.value = skills.value[0]?.uid ?? null;
      if (branch.value && !branches.value.includes(branch.value)) branch.value = '';
      nodeIndex.value = 0;
    });
  if (withWork && crashed)
    recovered.value = { name: name.value, skills: skills.value.length, file: filePath.value, dirty: dirty.value };
  simulateNow();
  // From here on, keep saving (at most every 600 ms, and when the window hides).
  let lastSaved = '';
  const save = () => {
    const snapshot = Object.fromEntries(Object.entries(KEPT).map(([k, sig]) => [k, sig.peek()]));
    let text;
    try {
      text = JSON.stringify(snapshot);
    } catch {
      return;
    }
    if (text === lastSaved) return;
    lastSaved = text;
    dbSet('state', snapshot);
  };
  let timer = 0;
  effect(() => {
    for (const sig of Object.values(KEPT)) sig.value; // subscribe
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  });
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', save);
}
