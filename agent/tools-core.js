// The AI-facing layer (wherever it runs: see setEnv below): every question an agent asks about JJS skills,
// answered from the same engine the app runs (core/), in compact JSON or
// text. The CLI (agent/cli.js) and the MCP server (agent/mcp-server.js) are
// thin wrappers over these functions, so they always agree.
//
// Inputs that carry skills take any one of:
//   code    a Skill Builder code ("KLUv/…"), or a path to a .txt holding one
//   skills  an array of skills (DATA as an object or as JJS's JSON string)
//   skill   a single skill object
// and `select` picks one skill out of several: its NAME, "CATEGORY:NAME"
// (e.g. "MELEE:1"), or its index in the list.

import { decodeMoveset, encodeMoveset, branchNames, branchObject, lineOf, reqOf, newUid } from '../core/format.js';
import {
  ATTACK_TYPES,
  CATEGORIES,
  EFFECTS,
  EFFECT_INFO,
  MOVE_NAMES,
  NODES,
  GROUPS,
  PROP_FLAGS,
  PROP_NUMBERS,
  REQ_KINDS,
  SKILL_FIELDS,
  SPECIAL_NAMES,
  STATES,
  animOf,
  defaultsOf,
  withDefaults,
  effectFields,
  nodeInfo,
  nodeTitle,
  newNode,
  fieldsOf,
} from '../core/schema.js';
import { ANIM_SETS, MOVES, SPECIALS } from '../core/gamedata.js';
import { simulate, motionAt } from '../core/sim.js';
import { blankSkill } from '../core/starter.js';
import { describeSkill } from '../core/describe.js';
import { TEMPLATES, buildTemplate, fieldsOf as templateFields } from '../core/templates.js';

// What differs between Node (the CLI, the MCP server: agent/tools.js) and
// the desktop app (the in-app assistant and the app's own MCP server:
// src/ai/): where the docs come from, reading a code from a file, opening
// the app, naming Roblox assets. Set once with setEnv.
let env = {
  /** The handbook's text. */
  handbook: () => '',
  /** The library's move write-ups: [{ file, text }] (README.md left out). */
  libraryFiles: () => [],
  /** A file of docs/jjs-game as parsed JSON (an array), or []. */
  gameJson: () => [],
  /** A code from a file, when the "code" given is a path; null if it isn't one. */
  readCodeFile: () => null,
  /** Shows a code in the desktop app. */
  openInApp: async () => {
    throw new Error('Opening the desktop app isn’t available here.');
  },
  /** fetch, for asset_info. */
  fetch: (...args) => fetch(...args),
};
export function setEnv(next) {
  env = { ...env, ...next };
  libraryCache = null;
  sectionsCache = null;
  gameAssets = null;
}
const MARK = '<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->';
const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);
const BRANCH_KEYS = ['BRANCH', 'BRANCH TARGET', 'BRANCH FINISHER', 'BRANCH COLLIDED'];

// ─── Reading skills in ──────────────────────────────────────────────────

// A code as given, or read from a file when it looks like a path.
function codeText(code) {
  const text = String(code ?? '').trim();
  if (!text) throw new Error('No code given.');
  if (!text.startsWith('KLUv') && text.length < 400) {
    const fromFile = env.readCodeFile(text);
    if (fromFile != null) return String(fromFile).trim();
  }
  return text;
}

// DATA as an object, whichever way it came.
function withProgram(skill) {
  const out = { uid: skill.uid ?? newUid(), ...skill };
  if (typeof out.DATA === 'string') {
    try {
      out.DATA = JSON.parse(out.DATA);
    } catch {
      out.DATA = { __unreadable: out.DATA };
    }
  }
  return out;
}

/** Skills from { code | skills | skill }. */
export async function loadSkills(input = {}) {
  if (input.code !== undefined) return decodeMoveset(codeText(input.code));
  if (Array.isArray(input.skills)) return input.skills.map(withProgram);
  if (input.skill && typeof input.skill === 'object') return [withProgram(input.skill)];
  throw new Error('Give a Skill Builder code (`code`), a skill list (`skills`) or one skill (`skill`).');
}

/** One skill out of several, by name, "CATEGORY:NAME" or index. */
export function pickSkill(skills, select) {
  const playable = skills.filter((s) => s.DATA && !('__unreadable' in s.DATA));
  if (select === undefined || select === null || select === '') {
    if (skills.length === 1) return skills[0];
    if (playable.length === 1) return playable[0];
    throw new Error(
      `Several skills: say which with \`select\` (a name, "CATEGORY:NAME" or an index). ${skills
        .map((s, i) => `${i}: ${s.K_NAME}:${s.NAME}`)
        .join(', ')}`,
    );
  }
  if (typeof select === 'number' || /^\d+$/.test(String(select))) {
    const found = skills[Number(select)];
    if (found) return found;
  }
  const text = String(select);
  const [cat, ...rest] = text.split(':');
  const byCat = rest.length && CATEGORIES.some((c) => c.id === cat.toUpperCase());
  const found = byCat
    ? skills.find((s) => s.K_NAME === cat.toUpperCase() && String(s.NAME) === rest.join(':'))
    : (skills.find((s) => String(s.NAME) === text) ??
      skills.find((s) => String(s.NAME).toLowerCase() === text.toLowerCase()));
  if (!found)
    throw new Error(`No skill "${text}". There are: ${skills.map((s) => `${s.K_NAME}:${s.NAME}`).join(', ')}`);
  return found;
}

// ─── Overview, encode, describe ─────────────────────────────────────────

function overviewOf(skill, index) {
  const d = skill.DATA;
  const readable = d && !('__unreadable' in d);
  const branches = readable ? branchNames(d) : [];
  const nodes = readable ? lineOf(d, '').length + branches.reduce((n, b) => n + lineOf(d, b).length, 0) : 0;
  const out = { index, category: skill.K_NAME, name: skill.NAME };
  for (const key of ['KEY', 'COOLDOWN', 'TOOL TIP', 'DURATION'])
    if (key in skill) out[key.toLowerCase().replace(' ', '_')] = skill[key];
  if (skill.ADD === false) out.add = false;
  if (!d) out.separator = true;
  else if (!readable) out.unreadable = true;
  else {
    out.nodes = nodes;
    out.branches = branches;
    const req = reqOf(d, '');
    if (req.length)
      out.requires = req.map(
        (r) => `${r.FLIP ? 'not ' : ''}${r.K_NAME}${r.AMOUNT !== undefined ? ` ${r.AMOUNT}` : ''}`,
      );
    const prop = d.Prop && !Array.isArray(d.Prop) ? Object.keys(d.Prop) : [];
    if (prop.length) out.props = prop;
  }
  return out;
}

/**
 * What's in a code. detail: "overview" (default: one row per skill),
 * "text" (every skill as a readable node listing) or "json" (the skills
 * themselves, DATA parsed: edit them and pass them to encode).
 */
export async function decode({ detail = 'overview', ...input }) {
  const skills = await loadSkills(input);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, skills.filter((s) => s.K_NAME === c.id).length]));
  if (detail === 'json') return { count: skills.length, skills: skills.map(({ uid: _uid, ...s }) => s) };
  if (detail === 'text') return { count: skills.length, text: skills.map((s) => describeSkill(s)).join('\n\n') };
  return { count: skills.length, categories: counts, skills: skills.map(overviewOf) };
}

/** Skills to a code JJS imports (DATA may be an object or a string). */
export async function encode(input) {
  const skills = await loadSkills(input);
  return { code: await encodeMoveset(skills), count: skills.length };
}

/**
 * One skill (or all) as readable markdown. `branches` limits the branches
 * shown; `fold: false` lists every effect on its own indexed line.
 */
export async function describe({ select, branches, fold = true, ...input }) {
  const skills = await loadSkills(input);
  if (select === undefined && skills.length > 1)
    return { text: skills.map((s) => describeSkill(s, branches, { fold })).join('\n\n') };
  return { text: describeSkill(pickSkill(skills, select), branches, { fold }) };
}

// ─── Simulate ───────────────────────────────────────────────────────────

const WHO = { user: 'you', target: 'dummy' };
const at3 = (p) => p.map((v) => round(v));

function labelOf(event) {
  if (event.kind === 'HIT') return `hit for ${event.damage} (${event.how})`;
  const node = event.node;
  if (!node) return event.kind;
  const { label, detail } = nodeTitle(node);
  return detail ? `${label} ${detail}` : label;
}

/**
 * Runs one skill in the simulator and summarises what happened.
 *
 * conditions  { AIR, JUMP, HOLD, ULT, BAR } for your character
 * hits        "auto" (by the boxes, default), "always" or "never"
 * start       a branch to start from instead of the skill's own line
 * seed        for RANDOM branches (default 7)
 * distance    studs from you to the dummy (default 5)
 * wall        studs to a wall in front (none by default)
 * maxTime     seconds to cut a skill that never ends (default 12)
 * detail      "summary" (default), "events" (+ every timed event) or
 *             "full" (+ positions 10 times a second)
 */
export async function simulateSkill({
  select,
  conditions = {},
  hits = 'auto',
  start = '',
  seed = 7,
  distance = 5,
  wall = null,
  maxTime = 12,
  detail = 'summary',
  ...input
}) {
  const skills = await loadSkills(input);
  const skill = pickSkill(skills, select);
  if (!skill.DATA || '__unreadable' in skill.DATA)
    throw new Error(`"${skill.NAME}" has no program to run (a separator, or unreadable).`);
  const run = simulate(skill, { conditions, hits, start, seed, distance, wall, maxTime });
  const hitsList = run.events
    .filter((e) => e.kind === 'HIT')
    .map((e) => ({
      t: round(e.t),
      by: WHO[e.by],
      on: WHO[e.who],
      damage: e.damage,
      how: e.how,
      branch: e.branch || 'Default',
      node: e.index,
    }));
  const branchesRun = { you: [], dummy: [] };
  for (const l of run.log) {
    const m = /^(?:starts |.*→ )([^:“”]+)$/.exec(l.text);
    if (m && !l.text.includes('no such branch')) {
      const list = branchesRun[WHO[l.who]];
      const name = m[1].trim();
      if (!list.includes(name)) list.push(name);
    }
  }
  const tagsNow = {};
  for (const t of run.tags) tagsNow[`${WHO[t.who]}:${t.tag}`] = t.value;
  const motion = {};
  for (const who of ['user', 'target']) {
    const samples = run.motion[who];
    const end = motionAt(samples, run.duration);
    const peak = Math.max(...samples.map((p) => p[1]));
    let travelled = 0;
    for (let i = 1; i < samples.length; i++)
      travelled += Math.hypot(
        samples[i][0] - samples[i - 1][0],
        samples[i][1] - samples[i - 1][1],
        samples[i][2] - samples[i - 1][2],
      );
    motion[WHO[who]] = { end: at3(end), peak_height: round(peak), travelled: round(travelled) };
  }
  const out = {
    skill: { category: skill.K_NAME, name: skill.NAME },
    options: { conditions, hits, start: start || 'Default', seed, distance, wall },
    duration: round(run.duration),
    warnings: run.warnings,
    outcome: {
      hits: hitsList.length,
      damage_to_dummy: 100 - (run.hp.at(-1)?.hp ?? 100),
      dummy_hp: run.hp.at(-1)?.hp ?? 100,
      dummy_distance_at_end: round(Math.hypot(...motion.dummy.end.map((v, i) => v - motion.you.end[i]))),
    },
    hits: hitsList,
    branches_run: branchesRun,
    states: run.events
      .filter((e) => e.kind === 'STATE')
      .map((e) => ({ t: round(e.t), on: WHO[e.who], state: e.node.STATE ?? 'Stun', for: round(e.end - e.t) })),
    tags: tagsNow,
    projectiles: run.shots.map((s) => ({
      tag: s.tag,
      by: WHO[s.who],
      t: round(s.t0),
      until: round(s.t1),
      speed: s.speed,
      from: at3(s.origin),
      dir: at3(s.dir),
    })),
    motion,
    log: run.log.map(
      (l) =>
        `${l.t.toFixed(2)} ${WHO[l.who].padEnd(5)} ${l.text}${l.branch !== undefined ? `  [${l.branch || 'Default'}${l.index !== undefined ? ` #${l.index}` : ''}]` : ''}`,
    ),
  };
  if (detail === 'events' || detail === 'full')
    out.events = run.events.map((e) => ({
      t: round(e.t),
      end: round(e.end),
      who: WHO[e.who],
      kind: e.kind,
      what: labelOf(e),
      branch: e.branch === undefined ? undefined : e.branch || 'Default',
      node: e.index,
    }));
  if (detail === 'full')
    out.positions = Object.fromEntries(
      ['user', 'target'].map((who) => [
        WHO[who],
        run.motion[who].filter((_, i) => i % 6 === 0).map((p, i) => [round(i / 10, 1), ...at3(p)]),
      ]),
    );
  return out;
}

// ─── Validate ───────────────────────────────────────────────────────────

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

function checkSkill(skill, issues) {
  const where = `${skill.K_NAME}:${skill.NAME}`;
  const add = (level, message, at) => issues.push({ level, skill: where, ...(at ? { at } : {}), message });
  if (!CATEGORIES.some((c) => c.id === skill.K_NAME)) add('warning', `Unknown category ${skill.K_NAME}.`);
  const d = skill.DATA;
  if (!d) return;
  if ('__unreadable' in d) return add('error', 'DATA is not readable JSON: JJS would not load it.');
  const names = branchNames(d);
  const referenced = new Set();
  const refer = (name, at, field) => {
    if (!name || name === 'nil') return;
    referenced.add(name);
    if (names.includes(name)) return;
    const close = names.find((b) => b.toLowerCase() === name.toLowerCase() || lev(b, name) <= 2);
    if (close)
      add(
        'warning',
        `${field} "${name}" isn't a branch; did you mean "${close}"? (A missing branch does nothing.)`,
        at,
      );
    else add('info', `${field} "${name}" isn't a branch, so it does nothing (JJS uses this for comments).`, at);
  };
  for (const branch of ['', ...names]) {
    const place = branch || 'Default';
    for (const req of reqOf(d, branch))
      if (!REQ_KINDS.some((k) => k.id === req?.K_NAME))
        add('info', `Condition ${req?.K_NAME} is one this doesn't know; it's kept as is.`, place);
    lineOf(d, branch).forEach((node, i) => {
      const at = `${place} #${i}`;
      const info = nodeInfo(node?.K_NAME);
      if (info.group === 'Other')
        add('info', `Node kind ${node?.K_NAME} is one this doesn't know; it's kept and exported as is.`, at);
      for (const field of info.fields) {
        if (!(field.key in node)) continue;
        const v = node[field.key];
        if (field.type === 'num' && typeof v !== 'number' && !Number.isFinite(Number(v)))
          add('warning', `${field.key} should be a number, not ${JSON.stringify(v)}.`, at);
        if (field.type === 'bool' && typeof v !== 'boolean')
          add('warning', `${field.key} should be true or false, not ${JSON.stringify(v)}.`, at);
        if (field.type === 'vec3' && typeof v === 'string' && v.split(',').length !== 3)
          add('warning', `${field.key} should be three numbers "x, y, z", not ${JSON.stringify(v)}.`, at);
      }
      // Branch-typed fields the node carries (the simulator, like JJS, only
      // follows the ones that are written).
      for (const field of info.fields.filter((f) => f.type === 'branch')) {
        if (!(field.key in node) || (node.K_NAME === 'BRANCH' && node.RANDOM)) continue;
        const v = node[field.key];
        refer(typeof v === 'string' ? v : '', at, `${node.K_NAME} ${field.key}`);
      }
      if (node.K_NAME === 'BRANCH' && node.RANDOM)
        for (const option of String(node.RANDOM)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean))
          refer(option, at, 'BRANCH RANDOM');
      if (node.K_NAME === 'LOOP' && num(node['LOOP BACK']) > i)
        add('warning', `LOOP BACK ${node['LOOP BACK']} goes back past the start of the line.`, at);
      checkAgainstGame(node, at, add);
    });
  }
  for (const name of names)
    if (!referenced.has(name) && !['OnHit', 'OnHitTarget'].includes(name))
      add('info', `Branch "${name}" is never jumped to from this skill.`, name);
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// What JJS's own tables say about a node: fields its builder doesn't have
// (every real export uses only the builder's fields, so these are typos JJS
// ignores), and choices the game doesn't know.
function checkAgainstGame(node, at, add) {
  const info = nodeInfo(node?.K_NAME);
  if (info.group === 'Other') return;
  const known = info.fields.map((f) => f.key);
  for (const key of Object.keys(node)) {
    if (key === 'K_NAME' || known.includes(key)) continue;
    const close = known.find((k) => lev(k, key) <= 2);
    add(
      close ? 'warning' : 'info',
      `${node.K_NAME} has no field ${key} in JJS's builder, so JJS ignores it${close ? `; did you mean ${close}?` : '.'}`,
      at,
    );
  }
  const choice = (key, list, what) => {
    const v = node[key];
    if (typeof v !== 'string' || v === '' || list.includes(v)) return;
    const close = list.find((o) => o.toLowerCase() === v.toLowerCase() || lev(o, v) <= 2);
    add('warning', `${key} "${v}" isn't ${what}${close ? `; did you mean "${close}"?` : '.'}`, at);
  };
  switch (node.K_NAME) {
    case 'VISUAL': {
      choice('EFFECT', EFFECTS, 'an effect JJS draws, so nothing shows');
      const reads = effectFields(node.EFFECT);
      if (!reads || node.EFFECT === 'Cancel') break;
      const defs = defaultsOf('VISUAL');
      const ignored = Object.keys(node).filter(
        (k) => k !== 'K_NAME' && known.includes(k) && !reads.has(k) && JSON.stringify(node[k]) !== JSON.stringify(defs[k]),
      );
      if (ignored.length) add('info', `${node.EFFECT} doesn't read ${ignored.join(', ')} (BuilderFX), so they do nothing.`, at);
      break;
    }
    case 'STATE':
      choice('STATE', STATES, 'a state in JJS’s list');
      break;
    case 'HITBOX':
    case 'PROJECTILE':
      choice('ATTACK TYPE', ATTACK_TYPES, 'an attack type');
      break;
    case 'COUNTER':
      for (const t of String(node['ATTACK TYPE2'] ?? '').split(',').map((x) => x.trim()).filter(Boolean))
        if (!ATTACK_TYPES.includes(t)) add('warning', `ATTACK TYPE2 "${t}" isn't an attack type (${ATTACK_TYPES.join(', ')}).`, at);
      break;
    case 'SKILL':
      choice('MOVE', ['Cancel', ...MOVE_NAMES], 'a base-game move');
      break;
    case 'SPECIAL':
      choice('SPEC', SPECIAL_NAMES, 'a base-game special');
      break;
    case 'ANIM':
      if (Array.isArray(node.ANIM_USE) && !animOf(node.ANIM_USE))
        add('warning', `ANIM_USE [${node.ANIM_USE}] isn't in JJS's animation list (${ANIM_SETS.length} sets): nothing plays.`, at);
      break;
  }
}

/**
 * Camera VISUALs that are still running when the next one on the same
 * screen starts. BuilderFX hands the view back to the player when ANY
 * Camera block's TIME runs out, even while a newer one is running, so an
 * overlap shows as the view snapping to the player for a frame (a jitter).
 */
function cameraOverlaps(events) {
  const cams = events.filter((e) => e.kind === 'VISUAL' && e.node?.EFFECT === 'Camera').sort((a, b) => a.t - b.t);
  const out = [];
  for (const who of new Set(cams.map((e) => e.who))) {
    const list = cams.filter((e) => e.who === who);
    list.forEach((e, i) => {
      const next = list[i + 1];
      const end = e.t + (Number(e.node.TIME) || 1);
      if (next && end > next.t + 0.002)
        out.push(
          `Camera VISUAL at ${e.t.toFixed(2)}s runs until ${end.toFixed(2)}s, past the next one (${next.t.toFixed(2)}s): when its TIME runs out JJS gives the view back to the player mid-shot (a jitter). End it where the next begins.`,
        );
    });
  }
  return out.slice(0, 5);
}

/**
 * Checks skills the way JJS would read them: unreadable programs, branch
 * references that go nowhere (and look like typos), fields of the wrong
 * type, unknown kinds, and that the code round-trips losslessly. Each issue
 * is "error" (JJS won't load it), "warning" (probably a mistake) or "info".
 * `simulate: true` also runs every skill once and adds the simulator's
 * warnings (endless loops, conditions that stop it starting).
 */
export async function validate({ simulate: runSim = true, ...input }) {
  const skills = await loadSkills(input);
  const issues = [];
  for (const skill of skills) checkSkill(skill, issues);
  const again = await decodeMoveset(await encodeMoveset(skills));
  const strip = (list) => JSON.stringify(list.map(({ uid: _uid, ...s }) => s));
  const lossless = strip(again) === strip(skills);
  if (!lossless) issues.push({ level: 'error', message: 'The code does not round-trip unchanged.' });
  if (runSim)
    for (const skill of skills) {
      if (!skill.DATA || '__unreadable' in skill.DATA) continue;
      // A full awakening bar, so awakenings (Req BAR 99.99) start.
      const run = simulate(skill, { maxTime: 12, conditions: { BAR: 100 } });
      for (const w of run.warnings)
        issues.push({
          level: /for ever|conditions don’t hold/.test(w) ? 'info' : 'warning',
          skill: `${skill.K_NAME}:${skill.NAME}`,
          message: `Simulator: ${w}`,
        });
      for (const message of cameraOverlaps(run.events))
        issues.push({ level: 'warning', skill: `${skill.K_NAME}:${skill.NAME}`, message });
    }
  const count = (level) => issues.filter((i) => i.level === level).length;
  return {
    ok: count('error') === 0,
    skills: skills.length,
    lossless,
    errors: count('error'),
    warnings: count('warning'),
    issues,
  };
}

// ─── Lint ───────────────────────────────────────────────────────────────
// A linter for movesets, the way one checks code: everything validate
// finds (JJS won't load it, typos, wrong types…), plus mistakes that load
// fine but don't do what was meant (code that never runs, a tag nothing
// sets, an effect nothing can take off, a combo the dummy escapes from), and
// recommendations: simpler or sturdier ways to write the same thing. Each
// problem says where it is (skill, branch, node) and how to fix it.
//
//   level  "error" (JJS won't load it) · "warning" (a bug) · "info" (worth
//          knowing) · "tip" (a better way)
//   rule   a short id, to look a kind of problem up or turn it off

const FOREVER = 1e9;
const isForever = (v) => Number(v) >= FOREVER;
const nodeKey = (n) => JSON.stringify(n);

/** Which branches each line jumps to, for "what runs" checks. */
function jumpsOf(node) {
  if (!node) return [];
  const out = [];
  for (const f of nodeInfo(node.K_NAME).fields.filter((f) => f.type === 'branch')) if (typeof node[f.key] === 'string' && node[f.key]) out.push(node[f.key]);
  if (node.K_NAME === 'BRANCH' && node.RANDOM)
    for (const o of String(node.RANDOM).split(',').map((s) => s.trim()).filter(Boolean)) out.push(o);
  return out;
}

function lintSkill(skill, all, add) {
  const d = skill.DATA;
  if (!d || '__unreadable' in d) return;
  const names = branchNames(d);
  const lines = ['', ...names].map((b) => ({ branch: b, place: b || 'Default', line: lineOf(d, b) }));
  const total = lines.reduce((n, l) => n + l.line.length, 0);
  if (!total) add('warning', 'empty-skill', 'The skill has no nodes: pressing it does nothing.', null, 'Add nodes, or delete the skill.');

  for (const { branch, place, line } of lines) {
    // Nodes after a jump that always happens never run: a BRANCH to a
    // branch that exists and has no conditions (one with conditions that
    // don't hold, or a missing one, carries on to the next node).
    const stop = line.findIndex(
      (n) => n?.K_NAME === 'BRANCH' && !n.RANDOM && names.includes(n.BRANCH) && !reqOf(d, n.BRANCH).length,
    );
    if (stop >= 0 && stop < line.length - 1)
      add(
        'warning',
        'unreachable',
        `${line.length - stop - 1} node${line.length - stop - 1 === 1 ? '' : 's'} after the BRANCH at #${stop} never run: it always goes to "${line[stop].BRANCH}" (no conditions), and a branch doesn't come back (inferred: everything seen so far fits).`,
        { branch, index: stop + 1 },
        'Move them before the BRANCH, or into the branch it goes to.',
      );
    let waits = 0;
    line.forEach((node, i) => {
      const at = { branch, index: i };
      const n = withDefaults(node ?? {});
      // Two WAITs in a row are one WAIT.
      if (node?.K_NAME === 'WAIT') {
        waits++;
        if (waits === 2) add('tip', 'merge-waits', `WAITs at #${i - 1} and #${i} in a row: one WAIT of their sum does the same.`, at, 'Merge them into one WAIT.');
      } else waits = 0;
      // The same node three times running: a LOOP says it once.
      if (i >= 2 && nodeKey(line[i]) === nodeKey(line[i - 1]) && nodeKey(line[i]) === nodeKey(line[i - 2]) && nodeKey(line[i + 1]) !== nodeKey(line[i]))
        add('tip', 'use-loop', `The same ${node?.K_NAME} repeats ${countRun(line, i)} times running (ending at #${i}).`, { branch, index: i - countRun(line, i) + 1 }, 'Write it once and add a LOOP (LOOP BACK 1) for the rest: shorter, and one place to change it.');
      switch (node?.K_NAME) {
        case 'VISUAL': {
          if (isForever(n.TIME) && n.EFFECT !== 'Cancel' && !node['VISUAL TAG'] && !['Camera', 'Overlay', 'Screen Color'].includes(n.EFFECT))
            add('warning', 'forever-untagged', `This ${n.EFFECT} lasts for ever and has no VISUAL TAG, so nothing can ever take it off: it stays on the player.`, at, 'Give it a VISUAL TAG, and Cancel that tag when it should go.');
          if (n.EFFECT === 'Cancel') {
            const tag = node['VISUAL TAG'];
            if (!tag) add('warning', 'cancel-untagged', 'A Cancel with no VISUAL TAG takes nothing off.', at, 'Set the VISUAL TAG of the effects it should remove.');
            else if (!tagged(all, 'VISUAL', 'VISUAL TAG', tag, (x) => x.EFFECT !== 'Cancel'))
              add('warning', 'cancel-nothing', `Cancel "${tag}": no VISUAL in the moveset has that VISUAL TAG, so it does nothing.`, at, 'Check the spelling against the VISUAL it should remove.');
          }
          break;
        }
        case 'TAG': {
          if (node.CHECK && !tagged(all, 'TAG', 'TAG', node.TAG, (x) => !x.CHECK))
            add('warning', 'tag-never-set', `Checks tag "${node.TAG}", but nothing in the moveset sets it, so this never passes (unless another moveset sets it).`, at, 'Set the tag somewhere (a TAG node with CHECK off), or fix the name.');
          if (!node.CHECK && !tagged(all, 'TAG', 'TAG', node.TAG, (x) => x.CHECK) && !hasTagReq(all, node.TAG))
            add('info', 'tag-never-read', `Sets tag "${node.TAG}", but nothing in the moveset checks it.`, at, 'Fine if another moveset reads it; else it can go.');
          break;
        }
        case 'VELO':
          if (vec(n.FORCE).every((c) => c === 0) && !(Number(n.RAGDOLL) > 0))
            add('info', 'velo-nothing', 'A VELOCITY with FORCE 0, 0, 0 and no ragdoll: it only stops the push in progress.', at, 'If that’s meant, a CLEAR KNOCKBACK says it more plainly.');
          break;
        case 'GRAB':
          if (!branch && !line.slice(0, i).some((x) => x?.K_NAME === 'HITBOX' || x?.K_NAME === 'PROJECTILE'))
            add('warning', 'grab-before-hit', 'A GRAB holds the last one hit, but nothing in the line has hit anyone yet here: it grabs nobody.', at, 'Put the GRAB in the hitbox’s OnHit branch (or after a hit).');
          break;
        case 'HITBOX':
          if (!(Number(n.DAMAGE) > 0) && !(Number(n.STUN) > 0) && !node.BRANCH && !node['BRANCH TARGET'])
            add('info', 'hitbox-nothing', 'A HITBOX with no damage, no stun and no branch: a hit does nothing.', at, 'If it’s a detector, give it a BRANCH to go to on a hit.');
          break;
      }
    });
  }

  // Branches nothing jumps to (validate says so too, as info).
  const reached = new Set(['', 'OnHit', 'OnHitTarget']);
  for (const { line } of lines) for (const node of line) for (const b of jumpsOf(node)) reached.add(b);

  // Recommendations for the skill as a whole.
  const nodes = lines.flatMap((l) => l.line);
  const hasCamera = nodes.some((n) => n?.K_NAME === 'VISUAL' && n.EFFECT === 'Camera');
  const locked = nodes.some((n) => n?.K_NAME === 'STATE' && /DirectionLock/i.test(String(n.STATE)));
  if (hasCamera && !locked)
    add('tip', 'camera-no-lock', 'This skill moves the camera but doesn’t lock your direction: if you turn while the shot plays, it plays at the wrong angle.', null, 'Add a STATE DirectionLock on you for as long as the camera runs.');
  const passive = d.Prop?.USE || (d.Prop?.AWK && d.Prop?.AWK2);
  if (skill.K_NAME === 'SKILL' && !passive && !(Number(skill.COOLDOWN) > 0) && skill.KEY !== 99 && !d.Prop?.REP2 && !/^-+.*-+$/.test(skill.NAME ?? ''))
    add('tip', 'no-cooldown', 'No COOLDOWN: the skill can be used again the moment it ends.', null, 'Give it a cooldown (most moves use 5–15 s), unless spamming it is the point.');
}

const countRun = (line, i) => {
  let k = 0;
  while (i - k >= 0 && nodeKey(line[i - k]) === nodeKey(line[i])) k++;
  return k;
};
const vec = (v) => String(v ?? '0, 0, 0').split(',').map((x) => Number(x) || 0);

/** Whether any node of `kind` in the moveset has `field` = `value` (and passes `also`). */
function tagged(all, kind, field, value, also = () => true) {
  for (const s of all) {
    const d = s.DATA;
    if (!d || '__unreadable' in d) continue;
    for (const b of ['', ...branchNames(d)]) for (const n of lineOf(d, b)) if (n?.K_NAME === kind && n[field] === value && also(n)) return true;
  }
  return false;
}
/** Whether a skill's or branch's conditions read tag `name` (a TAG condition). */
function hasTagReq(all, name) {
  for (const s of all) {
    const d = s.DATA;
    if (!d || '__unreadable' in d) continue;
    for (const b of ['', ...branchNames(d)]) if (reqOf(d, b).some((r) => r?.TAG === name)) return true;
  }
  return false;
}

/** Problems across the moveset: two skills on one key, two skills with one name. */
function lintMoveset(skills, push) {
  const seen = new Map();
  for (const s of skills) {
    if (!s.NAME || /^-+.*-+$/.test(s.NAME)) continue; // separators like "----BASE----"
    const k = `${s.K_NAME}:${s.NAME}`;
    if (seen.has(k)) push({ level: 'warning', rule: 'duplicate-name', skill: k, message: `Two ${s.K_NAME} skills are named "${s.NAME}": tools (and you) can't tell them apart.`, fix: 'Rename one.' });
    seen.set(k, true);
  }
  // Two skills on one key only clash when both can be pressed at once: in
  // base (not hidden there by AWK2) or awakened (not hidden by AWK).
  // Passives (USE, or hidden in both) aren't pressed at all.
  for (const [mode, hiddenBy] of [
    ['base', 'AWK2'],
    ['awakened', 'AWK'],
  ]) {
    const keys = new Map();
    for (const s of skills) {
      const prop = s.DATA && !('__unreadable' in s.DATA) ? (s.DATA.Prop ?? {}) : {};
      if (s.K_NAME !== 'SKILL' || s.KEY == null || [99, -1, 0].includes(Number(s.KEY)) || /^-+.*-+$/.test(s.NAME ?? '')) continue;
      if (prop.USE || (prop.AWK && prop.AWK2) || prop[hiddenBy]) continue;
      const k = Number(s.KEY);
      if (keys.has(k))
        push({ level: 'warning', rule: 'duplicate-key', skill: `SKILL:${s.NAME}`, message: `"${s.NAME}" and "${keys.get(k)}" are both on key ${k} ${mode === 'base' ? 'out of awakening' : 'in awakening'}: only one of them can be used.`, fix: `Move one to a free key, or hide one ${mode === 'base' ? 'in base (AWK2)' : 'in awakening (AWK)'}.` });
      else keys.set(k, s.NAME);
    }
  }
}

/**
 * The combo checks: each skill run with every hit landing; between two hits
 * on the dummy, is it still stunned when the next one comes? If not, it can
 * block or run in that gap, and the combo drops.
 */
function lintCombos(skill, push) {
  const d = skill.DATA;
  if (!d || '__unreadable' in d) return;
  const run = simulate(skill, { hits: 'always', maxTime: 8, conditions: { BAR: 100 } });
  const hits = run.events.filter((e) => e.kind === 'HIT' && e.who === 'target').sort((a, b) => a.t - b.t);
  for (let k = 0; k + 1 < hits.length; k++) {
    const a = hits[k];
    const b = hits[k + 1];
    const node = lineOf(d, a.branch ?? '')[a.index];
    if (!node || node.K_NAME !== 'HITBOX') continue;
    const stun = Number(withDefaults(node).STUN) || 0;
    const free = b.t - (a.t + stun);
    if (stun > 0 && free > 0.05)
      push({
        level: 'warning',
        rule: 'combo-drops',
        skill: `${skill.K_NAME}:${skill.NAME}`,
        at: { branch: a.branch ?? '', index: a.index },
        message: `The dummy is free for ${free.toFixed(2)} s between the hit at ${a.t.toFixed(2)} s and the next at ${b.t.toFixed(2)} s (STUN ${stun} s): it can block or get away, and the combo drops.`,
        fix: `Raise this hitbox's STUN to at least ${(b.t - a.t + 0.05).toFixed(2)} s, or land the next hit sooner.`,
      });
  }
}

const LEVEL_ORDER = { error: 0, warning: 1, info: 2, tip: 3 };

/**
 * Lints a moveset (or one skill: `select`). Returns { problems, errors,
 * warnings, infos, tips }, problems sorted worst first; each { level, rule,
 * skill, at?: { branch, index }, message, fix? }. `simulate: false` skips
 * the checks that run the simulator (faster: for typing as you go).
 * `ignore`: rules to leave out.
 */
export async function lint({ select, simulate: runSim = true, ignore = [], ...input } = {}) {
  const all = await loadSkills(input);
  const skills = select !== undefined && select !== null && select !== '' ? [pickSkill(all, select)] : all;
  const problems = [];
  const push = (p) => problems.push(p);
  // validate's findings, with a place to jump to where they have one.
  const v = await validate({ skills, simulate: runSim });
  for (const i of v.issues) {
    const m = /^(.+) #(\d+)$/.exec(i.at ?? '');
    const at = m ? { branch: m[1] === 'Default' ? '' : m[1], index: Number(m[2]) } : i.at ? { branch: i.at === 'Default' ? '' : i.at } : undefined;
    push({ level: i.level, rule: i.message.startsWith('Simulator:') ? 'simulator' : i.message.startsWith('Camera VISUAL') ? 'camera-overlap' : 'validate', skill: i.skill, ...(at ? { at } : {}), message: i.message });
  }
  for (const skill of skills) {
    const where = `${skill.K_NAME}:${skill.NAME}`;
    lintSkill(skill, all, (level, rule, message, at, fix) => push({ level, rule, skill: where, ...(at ? { at } : {}), message, ...(fix ? { fix } : {}) }));
    if (runSim) lintCombos(skill, push);
  }
  if (!select) lintMoveset(all, push);
  const kept = problems.filter((p) => !ignore.includes(p.rule)).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const count = (l) => kept.filter((p) => p.level === l).length;
  return { problems: kept, errors: count('error'), warnings: count('warning'), infos: count('info'), tips: count('tip') };
}

// ─── A moveset's style ──────────────────────────────────────────────────
// What a moveset tends to do, in numbers: how long its moves are, how hard
// and how long they hit, how fast they come out, what effects and
// animations they use, how they're named. For an AI to build in the same
// style (and its memories, src/ai/memory.js, to keep as a reference).

const median = (list) => {
  const v = list.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 1000) / 1000;
};
const top = (counts, n = 6) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => `${k} ×${c}`);

/** A moveset's style profile: { counts, numbers, uses, names, summary }. */
export async function profile(input = {}) {
  const skills = (await loadSkills(input)).filter((s) => s.DATA && !('__unreadable' in s.DATA));
  const kinds = {};
  const effects = {};
  const anims = {};
  const tags = new Set();
  const damage = [];
  const stun = [];
  const firstHit = [];
  const cooldowns = [];
  const lengths = [];
  const hitSizes = [];
  let cameras = 0;
  for (const s of skills) {
    const d = s.DATA;
    if (s.K_NAME === 'SKILL' && Number(s.COOLDOWN) > 0) cooldowns.push(Number(s.COOLDOWN));
    let camera = false;
    for (const b of ['', ...branchNames(d)]) {
      for (const node of lineOf(d, b)) {
        const n = withDefaults(node ?? {});
        kinds[node?.K_NAME] = (kinds[node?.K_NAME] ?? 0) + 1;
        if (node?.K_NAME === 'HITBOX') {
          damage.push(Number(n.DAMAGE));
          stun.push(Number(n.STUN));
          hitSizes.push(String(n.SIZE));
        }
        if (node?.K_NAME === 'VISUAL') {
          effects[n.EFFECT] = (effects[n.EFFECT] ?? 0) + 1;
          if (n.EFFECT === 'Camera') camera = true;
        }
        if (node?.K_NAME === 'ANIM' && node.ANIM_USE) {
          const a = animOf(node.ANIM_USE);
          const key = a ? `${a.character ?? ''}${a.name ? `.${a.name}` : ''}` || String(node.ANIM_USE) : String(node.ANIM_USE);
          anims[key] = (anims[key] ?? 0) + 1;
        }
        if (node?.K_NAME === 'TAG' && node.TAG) tags.add(node.TAG);
      }
    }
    if (camera) cameras++;
    // How long it runs and when it first hits, simulated (moves branch
    // straight away, so the line alone doesn't say). Not passives.
    const passive = d.Prop?.USE || (d.Prop?.AWK && d.Prop?.AWK2) || /^-+.*-+$/.test(s.NAME ?? '');
    if (!passive && ['SKILL', 'MELEE', 'AWAKENING', 'CHASE', 'SPECIAL'].includes(s.K_NAME)) {
      const run = simulate(s, { hits: 'always', maxTime: 6, conditions: { BAR: 100 } });
      const hit = run.events.find((e) => e.kind === 'HIT' && e.who === 'target');
      if (hit) firstHit.push(hit.t);
      const end = Math.max(0, ...run.events.filter((e) => e.who === 'user').map((e) => e.t));
      if (end > 0) lengths.push(Math.round(end * 1000) / 1000);
    }
  }
  const categories = {};
  for (const s of skills) categories[s.K_NAME] = (categories[s.K_NAME] ?? 0) + 1;
  const sizes = {};
  for (const sz of hitSizes) sizes[sz] = (sizes[sz] ?? 0) + 1;
  const numbers = {
    damage: median(damage),
    stun: median(stun),
    first_hit_s: median(firstHit),
    move_length_s: median(lengths),
    cooldown_s: median(cooldowns),
  };
  const out = {
    skills: skills.length,
    categories,
    numbers,
    hitbox_sizes: top(sizes, 3),
    node_kinds: top(kinds, 8),
    effects: top(effects, 8),
    animations: top(anims, 6),
    tags: [...tags].slice(0, 20),
    camera_skills: cameras,
    names: skills.filter((s) => s.K_NAME === 'SKILL' && !/^-+.*-+$/.test(s.NAME ?? '')).map((s) => s.NAME).slice(0, 16),
  };
  const bits = [
    `${skills.length} skills`,
    numbers.damage !== null && `hits ~${numbers.damage} dmg, stun ${numbers.stun}s`,
    numbers.first_hit_s !== null && `first hit at ~${numbers.first_hit_s}s`,
    numbers.cooldown_s !== null && `cooldowns ~${numbers.cooldown_s}s`,
    cameras > 0 && `${cameras} with camera work`,
    out.effects.length > 0 && `favourite effects ${out.effects.slice(0, 3).map((e) => e.split(' ×')[0]).join(', ')}`,
  ].filter(Boolean);
  out.summary = bits.join(' · ');
  return out;
}

// ─── Reference ──────────────────────────────────────────────────────────

/**
 * The node schema. With `kind` (a K_NAME like "HITBOX", or its palette
 * label like "VELOCITY"): that node's fields, types, defaults and hints, and
 * a new node as the palette makes it. Without: every kind in one line each,
 * plus conditions, property flags and categories.
 */
export function nodeReference({ kind } = {}) {
  if (kind) {
    const k = String(kind).toUpperCase();
    const entry = NODES.find((n) => n.kind === k || n.label === k);
    if (!entry) throw new Error(`No node kind "${kind}". Kinds: ${NODES.map((n) => n.kind).join(', ')}`);
    return {
      kind: entry.kind,
      palette_label: entry.label,
      group: entry.group,
      about: entry.about,
      fields: entry.fields.map((f) => ({
        key: f.key,
        type: f.type,
        default: f.def,
        ...(f.label ? { label: f.label } : {}),
        ...(f.hint ? { hint: f.hint } : {}),
        ...(f.options ? { options: f.options } : {}),
      })),
      new_node: newNode(entry.kind),
      ...referenceExtras(entry.kind),
      field_types:
        'num · str · bool · vec3 "x, y, z" (x left, y up, z forward) · color "r, g, b" · pair [a, b] · anim [set, n] or a name · branch (a branch name) · choice (listed values, free text allowed)',
    };
  }
  return {
    groups: GROUPS,
    nodes: NODES.map((n) => ({ kind: n.kind, palette_label: n.label, group: n.group, about: n.about })),
    conditions: REQ_KINDS.map((r) => ({ kind: r.id, means: r.label, ...(r.field ? { takes: r.field, default: r.def } : {}) })),
    prop_flags: PROP_FLAGS.map((p) => ({ flag: p.key, means: p.hint })),
    prop_numbers: PROP_NUMBERS.map((p) => ({ key: p.key, default: p.def, means: p.hint })),
    categories: CATEGORIES.map((c) => ({
      category: c.id,
      fields: [...SKILL_FIELDS.common, ...(SKILL_FIELDS[c.id] ?? [])].map((f) => f.key),
    })),
    notes:
      "Call again with `kind` for a node's fields. Fields, types, defaults and hints are JJS's own (its SkillDefault module). A field a node leaves out takes that default. Unknown kinds and fields pass through untouched.",
  };
}

// The game's lists that go with a kind.
function referenceExtras(kind) {
  switch (kind) {
    case 'VISUAL':
      return {
        effects: Object.fromEntries(
          Object.entries(EFFECT_INFO).map(([name, e]) => [
            name,
            {
              reads: e.fields.filter((f) => !['BODY PART', 'TIME', 'EASING STYLE', 'EASING DIRECTION', 'VISUAL TAG'].includes(f)),
              placed:
                { effect: 'from its own frame: ends at start · POSITION · ALT POSITION (POSITION applied twice, turned by ROTATION)', part: 'on the body part: ends at POSITION + ALT POSITION, in the part’s axes', weld: 'welded in Roblox’s raw axes (x right, z back); ALT POSITION is where it ends' }[e.origin] ?? 'not placed in the world',
              ...(e.screen ? { screen: 'only the character it runs on sees it' } : {}),
            },
          ]),
        ),
      };
    case 'STATE':
      return { states: STATES };
    case 'HITBOX':
    case 'PROJECTILE':
    case 'COUNTER':
      return { attack_types: ATTACK_TYPES };
    case 'SKILL':
      return { moves: Object.fromEntries(MOVES.map((c) => [c.name, c.moves])) };
    case 'SPECIAL':
      return { specials: SPECIALS };
    case 'ANIM':
      return {
        anim_sets: ANIM_SETS.map((s, i) => ({ set: i + 1, character: s.character, count: s.anims.length })),
        anim_note: 'ANIM_USE [set, n]: the n-th animation of that set; game_assets lists them by name (e.g. "Gojo Chase" → [1, 19]).',
      };
    default:
      return {};
  }
}

/** An empty skill of a category, as the builder's "+" makes one. */
export function skillTemplate({ category = 'SKILL', name } = {}) {
  const id = String(category).toUpperCase();
  if (!CATEGORIES.some((c) => c.id === id))
    throw new Error(`Category is one of ${CATEGORIES.map((c) => c.id).join(', ')}.`);
  const { uid: _uid, ...skill } = blankSkill(id, name ?? (id === 'MELEE' ? '1' : 'New skill'));
  return { skill };
}

/**
 * Ready-made skills, each a form and the skills it builds (core/templates.js:
 * a progress bar, an auto-sheathing weapon, accurate M1s, an accurate dash,
 * percentage damage). No `id`: the list, with every field and its default.
 * An `id` (and `values` for any fields to change): the skills and their code.
 */
export async function buildFromTemplate({ id, values = {} } = {}) {
  if (!id)
    return {
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        about: t.blurb,
        fields: templateFields(t).map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          default: f.def,
          ...(f.options ? { options: f.options } : {}),
          ...(f.when ? { when: f.when } : {}),
          ...(f.hint ? { hint: f.hint } : {}),
        })),
      })),
      next: 'Call again with an id (and values) to build its skills.',
    };
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`No template "${id}": one of ${TEMPLATES.map((t) => t.id).join(', ')}.`);
  const skills = buildTemplate(template, values);
  return {
    template: template.name,
    usage: template.usage({ ...Object.fromEntries(templateFields(template).map((f) => [f.key, f.def])), ...values }),
    skills: skills.map((s) => ({ category: s.K_NAME, name: s.NAME, key: s.KEY })),
    code: await encodeMoveset(skills),
  };
}

// ─── Library ────────────────────────────────────────────────────────────

// Docs as text with \n line ends, whatever an editor saved them with.
const lf = (text) => String(text).replace(/\r\n?/g, '\n');

let libraryCache = null;
function library() {
  if (libraryCache) return libraryCache;
  libraryCache = env
    .libraryFiles()
    .filter(({ file }) => file.endsWith('.md') && file !== 'README.md')
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(({ file, text: raw }) => {
      const text = lf(raw);
      const [top, generated = ''] = text.split(MARK);
      const title = /^# (.+)$/m.exec(top)?.[1]?.trim() ?? file;
      const tags = (/^Tags: (.+)$/m.exec(top)?.[1] ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const about = top
        .replace(/^# .+$/m, '')
        .replace(/^Tags: .+$/m, '')
        .trim();
      const nodes = /## Nodes\n([\s\S]*?)\n## Code/.exec(generated)?.[1]?.trim() ?? '';
      const code = /## Code[\s\S]*?```text\n(\S+)\n```/.exec(generated)?.[1] ?? '';
      const skills = [...nodes.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
      return { slug: file.replace(/\.md$/, ''), title, tags, about, nodes, code, skills };
    });
  return libraryCache;
}

/**
 * Finds real moves in docs/jjs-library/ by what they do ("launch", "grab
 * slam", "projectile wall"). Every word must appear in the title, tags,
 * description or skill names; the best matches come first. No query lists
 * them all.
 */
export function searchLibrary({ query = '', limit = 8 } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const scored = library()
    .map((m) => {
      const hay = {
        title: m.title.toLowerCase(),
        tags: m.tags.join(' ').toLowerCase(),
        about: m.about.toLowerCase(),
        skills: m.skills.join(' ').toLowerCase(),
      };
      let score = 0;
      for (const w of words) {
        const s =
          (hay.title.includes(w) ? 4 : 0) +
          (hay.tags.includes(w) ? 3 : 0) +
          (hay.skills.includes(w) ? 2 : 0) +
          (hay.about.includes(w) ? 1 : 0);
        if (!s) return null;
        score += s;
      }
      return { m, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return {
    total: scored.length,
    moves: scored.slice(0, words.length ? limit : 100).map(({ m }) => ({
      slug: m.slug,
      title: m.title,
      tags: m.tags,
      skills: m.skills,
      summary: m.about.split('\n\n')[0].replace(/\s+/g, ' '),
    })),
    next: 'get_library_move with a slug gives its explanation, node listing and code.',
  };
}

/** One library move: part "about", "nodes", "code" or "all" (default). */
export function getLibraryMove({ slug, part = 'all' } = {}) {
  const m = library().find((x) => x.slug === slug);
  if (!m) throw new Error(`No library move "${slug}". Search first: search_library.`);
  const out = { slug: m.slug, title: m.title, tags: m.tags };
  if (part === 'all' || part === 'about') out.about = m.about;
  if (part === 'all' || part === 'nodes') out.nodes = m.nodes;
  if (part === 'all' || part === 'code') out.code = m.code;
  return out;
}

// ─── Handbook ───────────────────────────────────────────────────────────

let sectionsCache = null;
function sections() {
  if (sectionsCache) return sectionsCache;
  const text = lf(env.handbook());
  const out = [];
  let current = { heading: 'Introduction', level: 1, lines: [] };
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && /^(#{2,3}) (.+)$/.exec(line);
    if (m) {
      out.push(current);
      current = { heading: m[2].trim(), level: m[1].length, lines: [] };
    } else current.lines.push(line);
  }
  out.push(current);
  sectionsCache = out.map((s) => ({ heading: s.heading, level: s.level, body: s.lines.join('\n').trim() }));
  return sectionsCache;
}

/**
 * The handbook (docs/jjs-skill-builder.md), a section at a time. No query:
 * its table of contents. A query ("PROJECTILE", "LAST HIT", "code format"):
 * the sections that mention every word, best first, with the top one in
 * full (up to `max_chars`).
 */
export function handbook({ query = '', limit = 3, max_chars = 8000 } = {}) {
  const all = sections();
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length)
    return {
      contents: all.map((s) => `${s.level === 3 ? '  ' : ''}${s.heading}`),
      next: 'Ask again with a query to read a section.',
    };
  const scored = all
    .map((s) => {
      const h = s.heading.toLowerCase();
      const b = s.body.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (!h.includes(w) && !b.includes(w)) return null;
        score += (h.includes(w) ? 10 : 0) + Math.min(5, b.split(w).length - 1);
      }
      // The words together, as a phrase, count most.
      const phrase = words.join(' ');
      if (words.length > 1) score += (h.includes(phrase) ? 30 : 0) + Math.min(20, 4 * (b.split(phrase).length - 1));
      return { s, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (!scored.length) return { sections: [], note: `Nothing in the handbook mentions all of: ${words.join(', ')}.` };
  return {
    sections: scored.map(({ s }, i) => ({
      heading: s.heading,
      text:
        i === 0
          ? s.body.slice(0, max_chars) + (s.body.length > max_chars ? '\n…(cut; ask with max_chars for more)' : '')
          : `${s.body.slice(0, 400)}…`,
    })),
  };
}

// ─── Roblox assets ──────────────────────────────────────────────────────

const ASSET_TYPES = {
  1: 'Image',
  3: 'Audio',
  4: 'Mesh',
  10: 'Model',
  13: 'Decal',
  24: 'Animation',
  40: 'MeshPart',
  62: 'Video',
};

/**
 * What Roblox asset IDs are (a SFX ID, a TEXTURE): name, type, creator,
 * and whether Roblox hands the file over without signing in (pictures and
 * decals do; most audio needs signing in with Roblox in the desktop app).
 * Also works through every ID in a skill: pass `code`/`skills` instead.
 */
export async function assetInfo({ ids, select, ...input } = {}) {
  let list = (Array.isArray(ids) ? ids : ids !== undefined ? [ids] : []).map(String);
  if (!list.length && (input.code !== undefined || input.skills || input.skill)) {
    const skills = await loadSkills(input);
    const chosen = select !== undefined ? [pickSkill(skills, select)] : skills;
    const found = new Set();
    for (const s of chosen)
      for (const b of ['', ...branchNames(s.DATA)])
        for (const n of lineOf(s.DATA, b)) {
          if (n.K_NAME === 'SFX' && n.ID) found.add(String(n.ID));
          if (n.TEXTURE) found.add(String(n.TEXTURE));
        }
    list = [...found];
  }
  list = list.filter((id) => /^\d{1,20}$/.test(id) && id !== '0').slice(0, 40);
  if (!list.length) throw new Error('Give asset `ids`, or a skill to read them from.');
  const one = async (id) => {
    const out = { id };
    try {
      const r = await env.fetch(`https://economy.roblox.com/v2/assets/${id}/details`);
      if (r.ok) {
        const d = await r.json();
        Object.assign(out, {
          name: d.Name,
          type: ASSET_TYPES[d.AssetTypeId] ?? `type ${d.AssetTypeId}`,
          creator: d.Creator?.Name,
        });
      }
    } catch {
      out.error = 'Roblox could not be reached.';
    }
    try {
      const r = await env.fetch(`https://assetdelivery.roblox.com/v2/assetId/${id}`);
      out.downloadable_without_key = r.ok && Boolean((await r.json()).locations?.length);
    } catch {
      // unknown
    }
    return out;
  };
  return { assets: await Promise.all(list.map(one)) };
}

// ─── The desktop app ────────────────────────────────────────────────────

/**
 * Opens skills in the desktop app for the user to see and play: a running
 * app takes them in; otherwise the app starts with them.
 */
export async function openInApp({ name, ...input }) {
  const skills = await loadSkills(input);
  const code = await encodeMoveset(skills);
  return env.openInApp({ code, name, count: skills.length });
}

// ─── The game's own assets ──────────────────────────────────────────────

let gameAssets = null;
function loadGameAssets() {
  if (gameAssets) return gameAssets;
  const read = (file) => env.gameJson(file) ?? [];
  // Animation IDs → ANIM_USE, for the ones the builder can play.
  const usable = new Map();
  ANIM_SETS.forEach((set, s) => set.anims.forEach(([p], n) => usable.set(p.replace(/^Mahoraga\./, 'Megumi.Mahoraga.'), [s + 1, n + 1])));
  const animations = read('animations.json').map((a) => ({ ...a, ...(usable.has(a.path) ? { anim_use: usable.get(a.path) } : {}) }));
  gameAssets = { animations, sounds: read('sounds.json') };
  return gameAssets;
}

/**
 * JJS's own animations and sounds (read from the game in Roblox Studio),
 * by words in their path: "gojo chase", "black flash", "block". Animations
 * the builder can play come with their ANIM_USE [set, n]; `anim_use` alone
 * ([set, n]) names one. `kind`: "animation", "sound" or both.
 */
export function gameAssetsSearch({ query = '', kind, anim_use: use, limit = 40 } = {}) {
  const { animations, sounds } = loadGameAssets();
  if (use) {
    const a = animOf(use);
    if (!a) throw new Error(`ANIM_USE [${use}] isn't in JJS's list (${ANIM_SETS.length} sets).`);
    return { anim_use: use, character: a.character, animation: a.path, id: a.id };
  }
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (list) =>
    list.filter((x) => {
      const p = x.path.toLowerCase().replace(/[._]/g, ' ');
      return words.every((w) => p.includes(w));
    });
  const out = {};
  if (kind !== 'sound') {
    const found = hits(animations);
    out.animations = found.slice(0, limit);
    if (found.length > limit) out.more_animations = found.length - limit;
  }
  if (kind !== 'animation') {
    const found = hits(sounds);
    out.sounds = found.slice(0, limit);
    if (found.length > limit) out.more_sounds = found.length - limit;
  }
  out.note =
    'IDs are JJS’s own (Roblox Studio, the live game’s place). A sound ID goes in an SFX node’s ID; an animation plays through ANIM_USE [set, n] only if it has one.';
  return out;
}
