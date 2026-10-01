// What Arayashiki knows about each kind of Skill Builder node: its
// label and colour in the palette, its fields (type, default, choices) and a
// one-line summary for the timeline.
//
// The fields come from JJS itself (core/gamedata.js, read from the game's
// SkillDefault module): every field in the builder's order, with its type,
// its default and the builder's own tooltip. A field a node leaves out takes
// that default. On top of that this file adds what the game doesn't say:
// labels, choice lists (ListData, BuilderFX), and notes from the handbook
// (docs/jjs-skill-builder.md). Choice fields also take free text. A node kind
// or field that isn't listed here still loads, edits (by the type of its
// value) and exports unchanged.
import {
  ANIM_SETS,
  ATTACK_TYPES as GAME_ATTACK_TYPES,
  EFFECTS as GAME_EFFECTS,
  MOVES,
  NODE_DEFAULTS,
  PROP_DEFAULTS,
  SPECIALS,
  STATES as GAME_STATES,
} from './gamedata.js';

// ─── Skills ─────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'SKILL', label: 'Skill', color: '#ff8e8e', icon: 'swords' },
  { id: 'SPECIAL', label: 'Special', color: '#ffae7a', icon: 'sparkles' },
  { id: 'AWAKENING', label: 'Awakening', color: '#fff27a', icon: 'user-round' },
  { id: 'MELEE', label: 'Melee', color: '#b8f36a', icon: 'hand' },
  { id: 'CHASE', label: 'Chase', color: '#2ef08a', icon: 'footprints' },
];

export const categoryOf = (id) =>
  CATEGORIES.find((c) => c.id === id) ?? { id, label: id, color: '#cfcfcf', icon: 'swords' };

// A skill's own settings, by category.
export const SKILL_FIELDS = {
  common: [
    { key: 'NAME', type: 'str', label: 'Name', def: 'New skill' },
    { key: 'ADD', type: 'bool', label: 'In the moveset', def: true, hint: 'Off for list separators like “----BASE----”.' },
  ],
  SKILL: [
    { key: 'KEY', type: 'num', label: 'Key', def: 1, hint: '1–4 are the skill slots; 9 is used for passives, 15 for separators.' },
    { key: 'COOLDOWN', type: 'num', label: 'Cooldown (s)', def: 10 },
    { key: 'TOOL TIP', type: 'str', label: 'Tool tip', def: '', hint: 'Shown on the slot, like “HOLD” or “JUMP+”.' },
  ],
  SPECIAL: [{ key: 'COOLDOWN', type: 'num', label: 'Cooldown (s)', def: 10 }],
  CHASE: [{ key: 'COOLDOWN', type: 'num', label: 'Cooldown (s)', def: 6 }],
  MELEE: [],
  AWAKENING: [
    { key: 'DURATION', type: 'num', label: 'Duration (s)', def: 60 },
    { key: 'DELAY', type: 'num', label: 'Delay (s)', def: 0 },
    { key: 'COLOR', type: 'str', label: 'Colours', def: '255,119,0 255,215,38', hint: 'Two colours, “r,g,b r,g,b”: the awakening’s gradient.' },
  ],
};

// A program's Properties (Prop), as the builder lists them (its defaultProp:
// DMG, KNOCK, KEEP, REP, INV, REP2, AWK, AWK2, USE, USEONDEATH, NOSTUN,
// NOCANCEL, VAR). The meanings are the guides' Properties list, matched to
// the builder's own keys; USE, KEEP, NOSTUN and NOCANCEL are confirmed.
export const PROP_FLAGS = [
  { key: 'USE', label: 'USE', hint: 'Use when obtained: runs as soon as you get the skill, e.g. on spawn.' },
  { key: 'USEONDEATH', label: 'USEONDEATH', hint: 'Use on death: runs when you die (death effects, final blasts).' },
  { key: 'KEEP', label: 'KEEP', hint: 'Keep when the moveset switches: for weapons and arsenal.' },
  { key: 'REP', label: 'REP', hint: 'Replace the skill in its slot if the key is occupied.' },
  { key: 'REP2', label: 'REP2', hint: 'Prevent override: another skill can’t replace this one.' },
  { key: 'AWK', label: 'AWK', hint: 'Hide in awakening: for base moves.' },
  { key: 'AWK2', label: 'AWK2', hint: 'Hide in base: for awakened moves.' },
  { key: 'INV', label: 'INV', hint: 'Invincible for the move’s duration.' },
  { key: 'NOSTUN', label: 'NOSTUN', hint: 'No stun: you can move and use other skills while it runs.' },
  { key: 'NOCANCEL', label: 'NOCANCEL', hint: 'No cancel: being hit doesn’t interrupt it.' },
];
// Number Properties: absent means the default.
export const PROP_NUMBERS = [
  { key: 'DMG', label: 'Damage ×', def: PROP_DEFAULTS.DMG ?? 1, hint: 'Damage multiplier for the move; negative heals.' },
  { key: 'KNOCK', label: 'Knockback ×', def: PROP_DEFAULTS.KNOCK ?? 1, hint: 'Knockback multiplier; negative reverses it.' },
];
// VAR's default: "-" is no variant tag.
export const VAR_NONE = PROP_DEFAULTS.VAR ?? '-';

// Branch conditions (Req). FLIP turns one into its opposite. `field` is the
// number a condition takes (and its default, from the builder).
const reqDef = (kind, key) => NODE_DEFAULTS[kind]?.find((f) => f.key === key)?.def;
export const REQ_KINDS = [
  { id: 'AIR', label: 'In the air' },
  { id: 'JUMP', label: 'Jumping' },
  { id: 'HOLD', label: 'Holding the key' },
  { id: 'ULT', label: 'Awakened' },
  { id: 'AIM', label: 'Has a target' },
  { id: 'DOMAIN', label: 'In a domain' },
  { id: 'BAR', label: 'Awakening bar above', field: 'AMOUNT', def: 99.99 },
  { id: 'HP', label: 'Health above', field: 'AMOUNT', def: reqDef('HP', 'AMOUNT') ?? 10 },
  { id: 'DUR', label: 'Durability (uses before it’s lost)', field: 'DURABILITY', def: reqDef('DUR', 'DURABILITY') ?? 1 },
];

// ─── Choice lists ───────────────────────────────────────────────────────

// Every effect BuilderFX draws, and "Cancel". An EFFECT not in this list
// draws nothing in JJS.
export const EFFECTS = ['Cancel', ...Object.keys(GAME_EFFECTS).filter((e) => e !== 'Cancel')];
export const EFFECT_INFO = GAME_EFFECTS;
export const STATES = GAME_STATES;
export const ATTACK_TYPES = GAME_ATTACK_TYPES;
export const MOVE_NAMES = MOVES.flatMap((c) => c.moves);
export const SPECIAL_NAMES = Object.keys(SPECIALS);
export const BODY_PARTS = ['HumanoidRootPart', 'Head', 'Torso', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg'];
// BuilderFX looks these up in Roblox's Enum.EasingStyle / EasingDirection.
const EASING_STYLES = ['Linear', 'Sine', 'Quad', 'Cubic', 'Quart', 'Quint', 'Exponential', 'Circular', 'Back', 'Bounce', 'Elastic'];
const EASING_DIRECTIONS = ['In', 'Out', 'InOut'];

/** ANIM_USE [set, n] → { character, path, id }, or null. */
export function animOf(use) {
  if (!Array.isArray(use)) return null;
  const set = ANIM_SETS[Number(use[0]) - 1];
  const entry = set?.anims[Number(use[1]) - 1];
  return entry ? { character: set.character, path: entry[0], id: entry[1] } : null;
}

// ─── Field types ────────────────────────────────────────────────────────
//   num · str · bool · vec3 ("x, y, z") · color ("r, g, b") · pair ([a, b])
//   anim ([a, b] or a name) · branch (a branch's name) · choice (options)
// The builder's own type codes: 1 bool, 2 number, 3 text, 4/7 preview
// pair, 5 vector, 6 colour, 8 random, 9 number sequence, 10 colour
// sequence, 11 range.
const TYPE_OF_CODE = { 1: 'bool', 2: 'num', 3: 'str', 4: 'pair', 5: 'vec3', 6: 'color', 7: 'pair', 8: 'str', 9: 'str', 10: 'str', 11: 'str' };
const BRANCH_KEYS = new Set(['BRANCH', 'BRANCH TARGET', 'BRANCH FINISHER', 'BRANCH COLLIDED']);

// Per-kind additions to the builder's fields: label, a type or options, and
// `note` (added to the builder's tooltip) or `hint` (replaces it).
const LAST_HIT_NOTE = 'A hit only counts if its STUN wasn’t 0 (-1 marks without stunning).';
const KINDS = [
  {
    kind: 'WAIT', label: 'WAIT', color: '#c9c9c9', icon: 'clock', group: 'Flow',
    about: 'Pauses this line for a time.',
    fields: { TIME: { label: 'Seconds' } },
    summary: (n) => `${n.TIME ?? 0}s`,
  },
  {
    kind: 'BRANCH', label: 'BRANCH', color: '#e98bff', icon: 'split', group: 'Flow',
    about: 'Jumps to a branch, if its conditions hold; otherwise the line carries on. A branch that doesn’t exist does nothing, which makes a comment.',
    fields: {
      BRANCH: { label: 'Branch' },
      RANDOM: { label: 'Random from', note: 'Typed “V1,V2” with no spaces.' },
    },
    summary: (n) => (n.RANDOM ? `random: ${n.RANDOM}` : n.BRANCH || '—'),
  },
  {
    kind: 'LOOP', label: 'LOOP', color: '#d9a8ff', icon: 'repeat', group: 'Flow',
    about: 'Goes back a number of nodes, a number of times.',
    fields: {
      'LOOP BACK': { label: 'Back (nodes)' },
      'LOOP AMOUNT': { label: 'Times', note: 'The first pass counts too: × 9 runs ten times.' },
      HOLD: { label: 'Only while held' },
    },
    summary: (n) => `back ${n['LOOP BACK'] ?? 0} × ${n['LOOP AMOUNT'] ?? 0}${n.HOLD ? ' (hold)' : ''}`,
  },
  {
    kind: 'HITCNCL', label: 'HIT CANCEL', color: '#f0a0e0', icon: 'scissors', group: 'Flow',
    about: 'Checks whether you hit anyone in the last TIME seconds. When the check passes it goes to BRANCH, or with no BRANCH ends the move and stuns you for ENDLAG. FLIP checks for a miss instead.',
    fields: { BRANCH: { label: 'Branch' }, ENDLAG: { label: 'Endlag (s)' } },
    summary: (n) => `${n.FLIP ? 'missed' : 'hit'} in ${n.TIME ?? 1}s → ${n.BRANCH || `endlag ${n.ENDLAG ?? 1}s`}`,
  },
  {
    kind: 'TAG', label: 'TAG', color: '#ffd37a', icon: 'hash', group: 'Flow',
    about: 'Reads or writes a named value. Check: branch if it matches ("2", "<0", ">20"). Set: replace it. Otherwise: add to it (or subtract, with ADD/REMOVE off).',
    fields: {
      TIME: { note: '1e38 is for ever; 0 clears it. The latest write’s TIME wins.' },
      CHECK: { label: 'Check' },
      BRANCH: { label: 'Branch if it matches' },
      SET: { label: 'Set (replace)', note: 'A plain SET sometimes doesn’t take: clear it (SET, TIME 0) first.' },
    },
    summary: (n) =>
      n.CHECK
        ? `${n.TAG} ${/^[<>]/.test(n.VALUE ?? '') ? n.VALUE : `= ${n.VALUE}`} → ${n.BRANCH || '—'}`
        : `${n.TAG} ${n.SET ? '=' : n['ADD/REMOVE'] === false ? '-=' : '+='} ${n.VALUE}`,
  },
  {
    kind: 'STATE', label: 'STATE', color: '#ff9ccf', icon: 'shield', group: 'Flow',
    about: 'Puts the character in a state (stunned, no dash, i-frames…) for a time, or checks for one. The state Cancel removes the states with the same STATE TAG.',
    fields: {
      STATE: { type: 'choice', options: STATES },
      VALUE: { type: 'num' },
      CHECK: { label: 'Check' },
      BRANCH: { label: 'Branch if in it' },
    },
    summary: (n) =>
      n.CHECK
        ? `${n.STATE ?? 'Stun'}? → ${n.BRANCH || '—'}`
        : n.STATE === 'Cancel'
          ? `cancel ${n['STATE TAG'] || '—'}`
          : `${n.STATE ?? 'Stun'} ${n.VALUE ?? 1} · ${n.TIME ?? 0}s`,
  },
  {
    kind: 'SETCD', label: 'COOLDOWN', color: '#ff8e8e', icon: 'timer', group: 'Combat',
    about: 'Starts a cooldown. Key -1 is this skill; cooldown -1 is its usual one.',
    fields: {},
    summary: (n) => `key ${n.KEY ?? -1} · ${(n.COOLDOWN ?? -1) < 0 ? 'usual' : `${n.COOLDOWN}s`}`,
  },
  {
    kind: 'SETMELEE', label: 'MELEE', color: '#ffae7a', icon: 'hand', group: 'Combat',
    about: 'Sets the melee combo counter.',
    fields: {},
    summary: (n) => `combo ${n.COMBO ?? 0}`,
  },
  {
    kind: 'SKILL', label: 'SKILL', color: '#ffc38a', icon: 'zap', group: 'Combat',
    about: 'Uses a base-game move. MOVE “Cancel” cancels every earlier SKILL and SPECIAL, like CANCEL LAST.',
    fields: { MOVE: { type: 'choice', options: ['Cancel', ...MOVE_NAMES], label: 'Move' }, START: { label: 'Start at (s)' }, 'HOLD FOR': { label: 'Hold for (s)' } },
    summary: (n) => n.MOVE || '—',
  },
  {
    kind: 'SPECIAL', label: 'SPECIAL', color: '#ffb48a', icon: 'sparkles', group: 'Combat',
    about: 'Uses a base-game special. It doesn’t replace your own special.',
    fields: { SPEC: { type: 'choice', options: SPECIAL_NAMES, label: 'Special' } },
    summary: (n) => n.SPEC || '—',
  },
  {
    kind: 'ANIM', label: 'ANIMATION', color: '#fff27a', icon: 'person-standing', group: 'Look',
    about: 'Plays one of JJS’s animations, from PREVIEW’s start to end.',
    fields: {
      ANIM_USE: { type: 'anim', label: 'Animation', note: 'JJS’s own library: [character set, number], e.g. [1, 19] is Gojo’s chase.' },
      PREVIEW: { label: 'Start, end (s)' },
    },
    summary: (n) => {
      const a = animOf(n.ANIM_USE);
      return a ? a.path : Array.isArray(n.ANIM_USE) ? n.ANIM_USE.join(', ') : String(n.ANIM_USE ?? '');
    },
  },
  {
    kind: 'SFX', label: 'SOUND', color: '#b8f36a', icon: 'volume-2', group: 'Look',
    about: 'Plays a Roblox sound by ID.',
    fields: { ID: { label: 'Sound ID' }, START: { label: 'Start at (s)' }, END: { label: 'End at (s)' }, CANCEL: { note: 'Only stops sounds with the same ID.' } },
    summary: (n) => String(n.ID ?? 0),
  },
  {
    kind: 'VELO', label: 'VELOCITY', color: '#2ef08a', icon: 'navigation', group: 'Motion',
    about: 'Pushes a character: FORCE is studs per second (x left, y up, z forward) for TIME.',
    fields: { RAGDOLL: { label: 'Ragdoll (s)' } },
    summary: (n) => `${n.FORCE ?? '0, 0, 0'} · ${n.TIME ?? 0}s`,
  },
  {
    kind: 'TELEPORT', label: 'TELEPORT', color: '#5fe0c0', icon: 'locate-fixed', group: 'Motion',
    about: 'Moves the character at once, relative to itself, the last one hit or a projectile.',
    fields: {},
    summary: (n) => (n['PROJECTILE TAG'] ? `to ${n['PROJECTILE TAG']}` : n.POSITION ?? ''),
  },
  {
    kind: 'LOOK', label: 'LOOK', color: '#7ad8ff', icon: 'eye', group: 'Motion',
    about: 'Turns the character to face the cursor, the last one hit, a projectile or the camera’s direction, for a time.',
    fields: {},
    summary: (n) => `${n.TIME ?? 0}s`,
  },
  {
    kind: 'GRAB', label: 'GRAB', color: '#5b8cff', icon: 'link', group: 'Motion',
    about: 'Holds the last one hit to a body part for a time. They can’t be hurt while held.',
    fields: {
      'BODY PART': { type: 'choice', options: BODY_PARTS, label: 'Your part' },
      'BODY PART2': { type: 'choice', options: BODY_PARTS, label: 'Their part' },
    },
    summary: (n) => `${n['BODY PART2'] ?? 'them'} → ${n['BODY PART'] ?? 'you'} · ${n.TIME ?? 0}s`,
  },
  {
    kind: 'CONNECT', label: 'CONNECT', color: '#6fa8ff', icon: 'radio', group: 'Motion',
    about: 'Sends SIGNAL to build-mode blocks within RANGE studs, for TIME.',
    fields: {},
    summary: (n) => `${n.SIGNAL ?? '—'} · ${n.TIME ?? 0}s`,
  },
  {
    kind: 'HITBOX', label: 'HITBOX', color: '#9a7bff', icon: 'box', group: 'Combat',
    about: 'Hits whoever is inside a box in front of you. On a hit you leave this line for BRANCH, and they run BRANCH TARGET (BRANCH FINISHER instead if it takes them to 1 HP or less).',
    fields: {
      BRANCH: { label: 'You run' },
      'BRANCH TARGET': { label: 'They run' },
      'BRANCH FINISHER': { label: 'On a kill' },
      'ATTACK TYPE': { type: 'choice', options: ATTACK_TYPES },
      STUN: { label: 'Stun (s)', note: LAST_HIT_NOTE },
      POSITION: { note: 'A long box usually wants its z at half its z SIZE, so it starts at you.' },
    },
    summary: (n) => `${n.DAMAGE ?? 0} dmg · ${n.SIZE ?? ''}`,
  },
  {
    kind: 'PROJECTILE', label: 'PROJECTILE', color: '#8f6bff', icon: 'send', group: 'Combat',
    about: 'Fires a projectile along your +z. Speed 0 leaves it in place, as an anchor for effects with the same PROJECTILE TAG.',
    fields: {
      BRANCH: { label: 'You run' },
      'BRANCH TARGET': { label: 'They run' },
      'BRANCH COLLIDED': { label: 'On collision', note: 'Runs as you, and replaces your line, like a hit.' },
      'ATTACK TYPE': { type: 'choice', options: ATTACK_TYPES },
      ROTATION: { note: 'A positive x aims it upwards.' },
    },
    summary: (n) => `${n['PROJECTILE TAG'] || '—'} · ${n.SPEED ?? 0} studs/s`,
  },
  {
    kind: 'COUNTER', label: 'COUNTER', color: '#c0b0ff', icon: 'shield-check', group: 'Combat',
    about: 'For a time, being hit by these attack types runs a branch instead.',
    fields: {
      'ATTACK TYPE2': { label: 'Attack types', note: `Comma-separated, like “Melee,Bullet”: ${ATTACK_TYPES.join(', ')}.` },
      BRANCH: { label: 'You run' },
      'BRANCH TARGET': { label: 'They run' },
    },
    summary: (n) => `${n['ATTACK TYPE2'] ?? ''} → ${n.BRANCH || '—'} · ${n.TIME ?? 0}s`,
  },
  {
    kind: 'HPGIB', label: 'HEALTH', color: '#ff6b6b', icon: 'bomb', group: 'Combat',
    about: 'Changes health by AMOUNT.',
    fields: {},
    summary: (n) => `${n.AMOUNT ?? 0}`,
  },
  {
    kind: 'ULTGIB', label: 'AWK BAR', color: '#ffe066', icon: 'zap', group: 'Combat',
    about: 'Changes the awakening bar by AMOUNT.',
    fields: {},
    summary: (n) => `${n.AMOUNT ?? 0}`,
  },
  {
    kind: 'EVGIB', label: 'EVASION', color: '#9fe0a0', icon: 'wind', group: 'Combat',
    about: 'Changes the evasion (ragdoll cancel) meter by AMOUNT.',
    fields: {},
    summary: (n) => `${n.AMOUNT ?? 0}`,
  },
  {
    kind: 'VISUAL', label: 'VISUAL', color: '#7ae7ff', icon: 'sparkles', group: 'Look',
    about: 'Shows an effect on a body part: it eases from the plain values to the ALT ones over TIME.',
    fields: {
      EFFECT: { type: 'choice', options: EFFECTS },
      'BODY PART': { type: 'choice', options: BODY_PARTS },
      'EASING STYLE': { type: 'choice', options: EASING_STYLES },
      'EASING DIRECTION': { type: 'choice', options: EASING_DIRECTIONS },
      TEXTURE: { note: 'An image ID, not a decal’s.' },
      'ALT SIZE': { note: 'A multiplier: SIZE 25 with ALT SIZE 2 ends at 50.' },
      'ALT POSITION': {
        note: 'Not a destination but a move. Any value other than 0, 0, 0 unpins the effect from the body part. On a Billboard, a y only sticks with an ALT y of minus twice it.',
      },
      'ALT ROTATION': { note: 'Added to ROTATION. Only moves with an ALT POSITION: with none, the effect is welded to the part and doesn’t turn.' },
      'SIZE 2': { note: 'Not per axis: anything but -1, -1, -1 replaces the whole size.' },
    },
    summary: (n) => `${n.EFFECT ?? 'Slash'}${n.TEXTURE ? ` ${n.TEXTURE}` : ''}`,
  },
  {
    kind: 'PARTICLE', label: 'PARTICLE', color: '#a0f0ff', icon: 'sparkles', group: 'Look',
    about: 'Emits particles with a Roblox texture: a ParticleEmitter on the body part.',
    fields: {
      SHAPE: { type: 'choice', options: ['Box', 'Sphere', 'Cylinder', 'Disc'] },
      'SHAPE INOUT': { type: 'choice', options: ['Outward', 'Inward', 'InAndOut'] },
      'EMISSION DIRECTION': { type: 'choice', options: ['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right'] },
      'ORIENTATION TYPE': { type: 'choice', options: ['FacingCamera', 'FacingCameraWorldUp', 'VelocityParallel', 'VelocityPerpendicular'] },
      'FLIPBOOK MODE': { type: 'choice', options: ['OneShot', 'Loop', 'PingPong', 'Random'] },
      'BODY PART': { type: 'choice', options: BODY_PARTS },
    },
    summary: (n) => `${n.TEXTURE ?? 0} × ${n['EMIT COUNT'] ?? 10}`,
  },
];

const clean = (text) => text?.replace(/\s*<br \/>\s*/g, ' ').trim();

function buildFields(kind, extra) {
  return (NODE_DEFAULTS[kind] ?? []).map((g) => {
    const x = extra[g.key] ?? {};
    let type = x.type ?? TYPE_OF_CODE[g.code] ?? 'str';
    if (!x.type && BRANCH_KEYS.has(g.key)) type = 'branch';
    if (!x.type && (g.key === 'BODY PART' || g.key === 'BODY PART2')) type = 'choice';
    const hint = x.hint ?? ([clean(g.desc), x.note].filter(Boolean).join(' ') || undefined);
    return {
      key: g.key,
      type,
      // null: unset (the builder leaves it nil, and doesn't write it)
      def: g.def === null ? '' : g.def,
      ...(g.def === null ? { unset: true } : {}),
      ...(x.label ? { label: x.label } : {}),
      ...(hint ? { hint } : {}),
      ...(x.options ? { options: x.options } : type === 'choice' ? { options: BODY_PARTS } : {}),
    };
  });
}

// ─── Node kinds ─────────────────────────────────────────────────────────
// `label` is the palette's name; `kind` is JJS's K_NAME.

export const NODES = KINDS.map(({ fields, ...rest }) => ({ ...rest, fields: buildFields(rest.kind, fields) }));

export const GROUPS = ['Flow', 'Motion', 'Combat', 'Look'];

const byKind = new Map(NODES.map((n) => [n.kind, n]));

// A kind's entry, or a plain one for kinds this doesn't know yet.
export function nodeInfo(kind) {
  return (
    byKind.get(kind) ?? {
      kind,
      label: kind || '?',
      color: '#dcdcdc',
      icon: 'info',
      group: 'Other',
      about: 'A node kind Arayashiki hasn’t seen before. Its fields are kept and exported as they are.',
      fields: [],
      summary: () => '',
    }
  );
}

// The builder's defaults for a kind: { FIELD: value }, unset fields left out.
const defaultsCache = new Map();
export function defaultsOf(kind) {
  if (!defaultsCache.has(kind))
    defaultsCache.set(
      kind,
      Object.fromEntries((NODE_DEFAULTS[kind] ?? []).filter((f) => f.def !== null).map((f) => [f.key, f.def])),
    );
  return defaultsCache.get(kind);
}

/** A node (or a Req) as JJS runs it: every field it leaves out at the builder's default. */
export function withDefaults(node) {
  if (!node || typeof node !== 'object') return node;
  const defs = defaultsOf(node.K_NAME);
  for (const key in defs) if (!(key in node)) return { ...defs, ...node };
  return node;
}

// The line in the timeline: "[summary] LABEL".
export function nodeTitle(node) {
  const info = nodeInfo(node?.K_NAME);
  let detail = '';
  try {
    // JJS leaves out fields at their usual values: fill them in to describe it.
    detail = info.summary(withDefaults(node));
  } catch {
    detail = '';
  }
  return { detail, label: info.label, color: info.color, icon: info.icon };
}

// A new node as the palette makes it: every field at the builder's default
// (fields the builder leaves unset aren't written).
export function newNode(kind) {
  const node = { K_NAME: kind };
  for (const field of nodeInfo(kind).fields)
    if (!field.unset) node[field.key] = Array.isArray(field.def) ? [...field.def] : field.def;
  return node;
}

// Every field to show for a node: the known ones first, then any others it
// carries, typed by their values.
export function fieldsOf(node) {
  const info = nodeInfo(node?.K_NAME);
  const known = new Set(info.fields.map((x) => x.key));
  const extra = Object.keys(node ?? {})
    .filter((key) => key !== 'K_NAME' && !known.has(key))
    .map((key) => {
      const v = node[key];
      const type =
        typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'num' : Array.isArray(v) ? 'json' : v && typeof v === 'object' ? 'json' : 'str';
      return { key, type, def: v, unknown: true };
    });
  return [...info.fields, ...extra];
}

/** For a VISUAL: the fields its EFFECT reads (null if the effect is unknown). */
export function effectFields(effect) {
  const info = GAME_EFFECTS[effect];
  if (!info) return null;
  return new Set(['EFFECT', 'TIME', 'LAST HIT', 'VISUAL TAG', 'PROJECTILE TAG', 'RELATIVE FROM BRANCH', 'RUN ON SERVER', 'CLIENT SIDED', 'CANCEL ON INTERRUPT', 'BODY PART', ...info.fields]);
}

// "0, 1.5, -3" → [0, 1.5, -3]; anything missing is 0.
export function vec3(text, fallback = [0, 0, 0]) {
  if (Array.isArray(text)) return text.map(Number);
  const parts = String(text ?? '').split(',').map((s) => Number(s.trim()));
  return [0, 1, 2].map((i) => (Number.isFinite(parts[i]) ? parts[i] : fallback[i]));
}

export const rgbOf = (text) =>
  vec3(text, [255, 255, 255]).map((c) => Math.max(0, Math.min(255, c)));
