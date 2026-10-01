import { animOf } from './schema.js';

// Skills as readable text: one line per node, effects folded into `fx:`
// lines, fields at their usual values left out. This is the format of the
// "Nodes" sections in docs/jjs-library/, and what the CLI and the MCP server
// answer with, so a skill reads the same everywhere.

// Fields left out when they hold these values (what JJS writes when a field
// is untouched); everything else is shown. The code has every field.
const QUIET_ALL = {
  'LAST HIT': -1,
  'CLIENT SIDED': false,
  'RUN ON SERVER': false,
  'CANCEL ON INTERRUPT': false,
};
const QUIET = {
  STATE: { 'DISABLE BURST': false, 'CANCEL ON END': false, 'STATE TAG': 'nil' },
  VELO: {
    TRACK: false,
    FADE: false,
    'TRUE RAGDOLL': false,
    RAGDOLL: 0,
    'RELATIVE FROM BRANCH': true,
  },
  ANIM: { 'FADE IN': 0.1, 'FADE OUT': 0.1, LOOPED: false, SPEED: 1 },
  HITBOX: {
    'LINK USER': 0,
    '360 BLOCK': false,
    'HIT USER': false,
    DEBREE: 0,
    ROTATION: '0, 0, 0',
    'CLEAR KNOCKBACK': false,
    'CANCEL ENEMY': false,
    'STUN ANIM': false,
    'SINGLE TARGET': false,
  },
  PROJECTILE: {
    'REFLECT COUNT': 0,
    'CANCEL PROJECTILE': false,
    CACHE: false,
    'HIT USER': false,
    '360 BLOCK': false,
    DEBREE: 0,
    'ID CHECK': true,
    'AIM LAST HIT': -1,
    'FILTER INTERVAL': 1,
    ROTATION: '0, 0, 0',
    'CLEAR KNOCKBACK': false,
    'CANCEL ENEMY': false,
    'STUN ANIM': false,
    'HIT RAGDOLL': false,
    'IGNORE WAKEUP': false,
    'CAN KILL': false,
    BLOCKABLE: false,
    DAMAGE: 0,
    STUN: 0,
    CONTINUE: false,
  },
  LOOK: { GROUNDED: false, 'RELATIVE FROM BRANCH': false },
  TELEPORT: { ROTATION: '0, 0, 0', 'RELATIVE FROM BRANCH': false },
  GRAB: {
    ROTATION: '0, 180, 0',
    'BODY PART': 'HumanoidRootPart',
    'BODY PART2': 'HumanoidRootPart',
  },
};
const NONE = new Set(['', 'nil']);
const EMPTYISH = new Set([
  'PROJECTILE TAG',
  'BRANCH',
  'BRANCH TARGET',
  'BRANCH FINISHER',
  'BRANCH COLLIDED',
  'VISUAL TAG',
]);
const val = (v) => (v === 1e38 || v === 1e250 ? 'forever' : JSON.stringify(v));
function fields(n, skip = []) {
  const quiet = { ...QUIET_ALL, ...(QUIET[n.K_NAME] ?? {}) };
  return Object.entries(n)
    .filter(([k]) => k !== 'K_NAME' && k !== 'PREVIEW' && !skip.includes(k))
    .filter(([k, v]) => !(k in quiet && quiet[k] === v))
    .filter(([k, v]) => !(EMPTYISH.has(k) && NONE.has(v)))
    .map(([k, v]) => `${k}=${val(v)}`)
    .join(' ');
}
const time = (t) => (t === 1e38 || t === 1e250 ? 'forever' : `${t ?? 1} s`);

/** One node as one line of text. */
export function describeNode(n) {
  switch (n?.K_NAME) {
    case 'WAIT':
      return `WAIT ${n.TIME ?? 0}`;
    case 'BRANCH':
      if (n.RANDOM) return `BRANCH random of ${JSON.stringify(n.RANDOM)}`;
      return `BRANCH → ${JSON.stringify(n.BRANCH ?? '')}${n['LAST HIT'] !== undefined && n['LAST HIT'] !== -1 ? ` (run by the one hit, LAST HIT ${n['LAST HIT']})` : ''}`;
    case 'LOOP':
      return `LOOP back ${n['LOOP BACK']} × ${n['LOOP AMOUNT'] === 1e38 ? 'forever' : n['LOOP AMOUNT']}${n.HOLD ? ', while held' : ''}`;
    case 'TAG': {
      const who =
        n['LAST HIT'] !== undefined && n['LAST HIT'] !== -1
          ? ` (LAST HIT ${n['LAST HIT']})`
          : '';
      if (n.CHECK)
        return `TAG check ${n.TAG} ${JSON.stringify(n.VALUE)} → ${JSON.stringify(n.BRANCH ?? '')}${who}`;
      if (n.SET)
        return n.TIME === 0
          ? `TAG clear ${n.TAG}${who}`
          : `TAG set ${n.TAG} = ${JSON.stringify(n.VALUE)} for ${time(n.TIME)}${who}`;
      return `TAG add ${n.TAG} += ${n.VALUE} (for ${time(n.TIME)})${who}`;
    }
    case 'STATE': {
      const who =
        n['LAST HIT'] !== undefined && n['LAST HIT'] !== -1
          ? ` on the one hit (LAST HIT ${n['LAST HIT']})`
          : '';
      if (n.CHECK)
        return `STATE check ${n.STATE} → ${JSON.stringify(n.BRANCH ?? '')}`;
      const v = ['1', 1, undefined].includes(n.VALUE) ? '' : ` = ${n.VALUE}`;
      return `STATE ${n.STATE ?? 'Stun'}${v} for ${time(n.TIME)}${n['CANCEL ON END'] ? ' (CANCEL ON END)' : ''}${n['DISABLE BURST'] ? ' (DISABLE BURST)' : ''}${who}`;
    }
    case 'SETCD':
      return `SETCD${n.KEY !== undefined && n.KEY !== -1 ? ` key ${n.KEY}` : ''}${n.COOLDOWN !== undefined && n.COOLDOWN !== -1 ? ` to ${n.COOLDOWN} s` : ' (its usual cooldown)'}`;
    case 'ANIM': {
      // The animation by name: ANIM_USE [set, n] in JJS's own list.
      const a = animOf(n.ANIM_USE);
      const rest = fields(n, ['ANIM_USE']);
      return `ANIM ${JSON.stringify(n.ANIM_USE)}${a ? ` (${a.path})` : ''}${rest ? ` ${rest}` : ''}`;
    }
    default:
      return `${n?.K_NAME} ${fields(n ?? {})}`.trim();
  }
}

// Effects are folded into one line per run: what shows and for how long.
const FX = new Set(['VISUAL', 'SFX', 'PARTICLE']);
function fx(n) {
  if (n.K_NAME === 'SFX')
    return `sound ${n.ID}${n.VOLUME !== undefined && n.VOLUME !== 1 ? ` ×${n.VOLUME}` : ''}${n.CANCEL ? ' (stop)' : ''}`;
  if (n.K_NAME === 'PARTICLE')
    return `particle ${n.TEXTURE ?? ''}${n['EMIT COUNT'] ? ` ×${n['EMIT COUNT']}` : ''}`.trim();
  const e = n.EFFECT ?? 'VISUAL';
  if (e === 'Cancel') return `Cancel ${JSON.stringify(n['VISUAL TAG'] ?? '')}`;
  if (e === 'Field of View')
    return `FOV ${n.AMOUNT ?? ''}${n.TIME !== undefined ? ` over ${n.TIME} s` : ''}`;
  const bits = [];
  if (n['VISUAL TAG']) bits.push(`tag ${JSON.stringify(n['VISUAL TAG'])}`);
  if (n['BODY PART'] && n['BODY PART'] !== 'HumanoidRootPart')
    bits.push(n['BODY PART']);
  if (n['PROJECTILE TAG'] && !NONE.has(n['PROJECTILE TAG']))
    bits.push(`on ${n['PROJECTILE TAG']}`);
  if (n.TIME !== undefined && n.TIME !== 1) bits.push(`${time(n.TIME)}`);
  return bits.length ? `${e} (${bits.join(', ')})` : e;
}

/** A line of nodes as text lines, index first; `fold` folds effects. */
export function describeLine(list, { fold = true } = {}) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length) out.push(`      fx: ${run.join(' · ')}`);
    run = [];
  };
  list.forEach((n, i) => {
    if (fold && FX.has(n?.K_NAME)) return run.push(fx(n));
    flush();
    out.push(`  ${String(i).padStart(3)}  ${fold || !FX.has(n?.K_NAME) ? describeNode(n) : fx(n)}`);
  });
  flush();
  return out;
}

const req = (r) =>
  (r ?? []).length
    ? ` — only if ${r.map((c) => `${c.FLIP ? 'not ' : ''}${c.K_NAME}${c.AMOUNT !== undefined ? ` ${c.AMOUNT}` : ''}${c.DURABILITY !== undefined ? ` ${c.DURABILITY}` : ''}`).join(' and ')}`
    : '';

const programOf = (skill) =>
  typeof skill.DATA === 'string' ? JSON.parse(skill.DATA) : skill.DATA;

/**
 * A whole skill as markdown: heading, settings, and a text block with its
 * line and every branch (or only the branches in `only`). `fold: false`
 * lists every effect on its own line with its index.
 */
export function describeSkill(skill, only, { fold = true } = {}) {
  const slot =
    skill.K_NAME === 'SKILL' ? `SKILL on key ${skill.KEY}` : skill.K_NAME;
  const d = programOf(skill);
  if (!d || d.__unreadable !== undefined)
    return `### ${slot}: "${skill.NAME}"\n\n${d ? 'Its program is not readable JSON.' : 'A separator: no program.'}`;
  const out = [];
  const props = Array.isArray(d.Prop)
    ? 'none'
    : Object.entries(d.Prop ?? {})
        .map(([k, v]) => (v === true ? k : `${k}=${JSON.stringify(v)}`))
        .join(', ');
  out.push(`### ${slot}: "${skill.NAME}"`, '');
  out.push(
    `Cooldown ${skill.COOLDOWN ?? '(none)'} · Properties: ${props}${req(d.Req).replace(' — only if', ' · Usable only if')}`,
    '',
  );
  out.push('```text', 'Line (runs on use)', ...describeLine(d.Line ?? [], { fold }));
  const branches = Object.entries(
    d.Branch && !Array.isArray(d.Branch) ? d.Branch : {},
  );
  const shown = only
    ? branches.filter(([name]) => only.includes(name))
    : branches;
  for (const [name, b] of shown)
    out.push(
      '',
      `Branch ${JSON.stringify(name)}${req(b.Req)}`,
      ...describeLine(b.Line ?? [], { fold }),
    );
  out.push('```');
  if (only && shown.length < branches.length) {
    const rest = branches
      .filter(([name]) => !only.includes(name))
      .map(([name]) => JSON.stringify(name));
    out.push(
      '',
      `Not shown (${rest.length} more branches, all in the code): ${rest.join(', ')}.`,
    );
  }
  return out.join('\n');
}
