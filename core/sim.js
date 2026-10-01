// Runs a Skill Builder skill outside Roblox, well enough to watch it.
//
// Two characters: you ("user"), at the origin facing +z, and a training
// dummy ("target") a few studs in front, facing you. Each runs lines of nodes
// on its own threads, in time order:
//
//   WAIT      moves the thread's clock on
//   BRANCH    jumps to a branch if that branch's conditions (Req) hold, and
//             otherwise carries on; a missing branch is a comment
//   LOOP      goes back LOOP BACK nodes, LOOP AMOUNT times
//   TAG       checks / sets / adds to a named value, with an expiry
//   STATE     puts a character in a state, or checks for one
//   HITBOX    hits the other character if it's inside the box (or always, or
//             never, as asked); a hit moves the attacker's line on to BRANCH
//             (BRANCH FINISHER on a kill), leaving the rest of it, and starts
//             BRANCH TARGET on the one hit
//   PROJECTILE flies forward (its ROTATION's x pitches it, positive up) and,
//             when it passes through the dummy, moves the line that fired it
//             on to BRANCH and starts BRANCH TARGET; when it meets the ground
//             or a wall, it moves that line on to BRANCH COLLIDED
//   VELO / TELEPORT / GRAB move a character through core/physics.js:
//             Roblox gravity and momentum, a Humanoid braking itself,
//             JJS's ragdolls (a newer VELO replaces an older one); LAST HIT
//             picks who. Hitboxes aim at where the physics has them.
//
// Everything else (animations, sounds, effects) becomes a timed event for
// the 3D view to draw. This is a model of the rules read from real exports
// (docs/jjs-skill-builder.md), not JJS's code: timings, physics and damage
// are close, not exact.

import { branchObject, lineOf, reqOf } from './format.js';
import { vec3, withDefaults } from './schema.js';
import { PART_OFFSETS, World } from './physics.js';

// The HumanoidRootPart's middle, from the feet: an R6 character's legs are 2
// studs and its root part 2 more, so 3 studs up. Hitboxes and projectiles
// start from it.
const ROOT = PART_OFFSETS.HumanoidRootPart[1];

const MAX_STEPS = 50000;
const MAX_EVENTS = 6000;
export const RATE = 60;

// A small seeded generator. The seed is mixed first: consecutive seeds would
// otherwise start almost the same.
function random(seed) {
  let s = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35;
  s = Math.imul(s ^ (s >>> 13), 0x27d4eb2f) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// A local offset (x left, y up, z forward) turned by a heading. The
// character's right is -x, as the game's guides and billboards agree.
export function toWorld([x, y, z], yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return [fz * x + fx * z, y, -fx * x + fz * z];
}

// A local vector (x left, y up, z forward) turned by a visual's ROTATION
// ("x, y, z" degrees), as Roblox's CFrame.Angles does: z first, then y, then
// x. A visual's ALT POSITION is a move along its own turned axes, so it goes
// through this: with ROTATION "-90, 180, 0", ALT y -55 is 55 forward and ALT
// z +4 is 4 down (owner's fishing rod). At "0, 0, 0" nothing changes.
export function turn([x, y, z], [rx, ry, rz] = [0, 0, 0]) {
  const r = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx * r), Math.sin(rx * r), Math.cos(ry * r), Math.sin(ry * r), Math.cos(rz * r), Math.sin(rz * r)];
  [x, y] = [cz * x - sz * y, sz * x + cz * y];
  [x, z] = [cy * x + sy * z, -sy * x + cy * z];
  [y, z] = [cx * y - sx * z, sx * y + cx * z];
  return [x, y, z].map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
}


// ─── Boxes ──────────────────────────────────────────────────────────────
// Oriented boxes: { c: centre, axes: [x, y, z] unit vectors, h: half sizes }.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A heading's axes: x (left), y (up), z (forward). */
export const yawAxes = (yaw) => [toWorld([1, 0, 0], yaw), [0, 1, 0], toWorld([0, 0, 1], yaw)];

/** A heading's axes turned by an orientation (degrees; y, then x, then z). */
export function rotatedAxes(yaw, rx, ry, rz) {
  const r = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx * r), Math.sin(rx * r), Math.cos(ry * r), Math.sin(ry * r), Math.cos(rz * r), Math.sin(rz * r)];
  // Ry · Rx · Rz, row by row; its columns are the turned axes.
  const m = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  return [0, 1, 2].map((j) => toWorld([m[0][j], m[1][j], m[2][j]], yaw));
}

/** Axes for a box flying along `dir` (its z), kept level. */
export function flightAxes(dir) {
  const up = Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const x = cross(up, dir);
  const lx = Math.hypot(...x) || 1;
  const xn = x.map((v) => v / lx);
  return [xn, cross(dir, xn), dir];
}

/** Whether two oriented boxes overlap (separating axes). */
export function boxesOverlap(a, b) {
  const d = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
  const axes = [...a.axes, ...b.axes];
  for (const u of a.axes)
    for (const v of b.axes) {
      const c = cross(u, v);
      if (Math.hypot(...c) > 1e-6) axes.push(c);
    }
  for (const axis of axes) {
    const ra = a.h.reduce((sum, h, i) => sum + h * Math.abs(dot(a.axes[i], axis)), 0);
    const rb = b.h.reduce((sum, h, i) => sum + h * Math.abs(dot(b.axes[i], axis)), 0);
    if (Math.abs(dot(d, axis)) > ra + rb + 1e-9) return false;
  }
  return true;
}

const other = (who) => (who === 'user' ? 'target' : 'user');

/**
 * Runs `skill` (a decoded skill, DATA parsed).
 *
 * options.conditions  { AIR, JUMP, HOLD, ULT, BAR } for your character
 * options.hits        'auto' (by the boxes), 'always' or 'never'
 * options.start       branch to start from ('' is the skill's own line)
 * options.maxTime     seconds to run a skill that never ends (a passive)
 * options.seed        for RANDOM branches
 * options.distance    how far in front the dummy stands
 * options.wall        how far in front a wall stands (none if unset); the
 *                     ground is always there, for BRANCH COLLIDED
 * options.nodeDelay   seconds each node takes before the next runs (JJS's
 *                     server steps nodes one after another; 0 is instant)
 * options.dummy       { present, block, counter, evasive }: whether the
 *                     dummy is there, and whether it blocks, counters or
 *                     evades (bursts out of a combo) every hit it can
 * options.tags        { user: { NAME: value }, target: {…} }: tags already
 *                     set when the skill starts
 * options.passives    other skills (decoded, DATA parsed) running from the
 *                     start alongside it, as Use When Obtained skills do;
 *                     they share your tags and states
 */
export function simulate(skill, options = {}) {
  const {
    conditions = {},
    hits: hitsOption = 'auto',
    start = '',
    maxTime = 12,
    seed = 7,
    distance = 5,
    wall = null,
    nodeDelay = 0,
    dummy = {},
    tags: startTags = {},
    passives = [],
  } = options;
  const dummyHere = dummy.present !== false;
  const hits = dummyHere ? hitsOption : 'never';
  // Programs: the skill's own (0), then any passives running alongside.
  const programs = [skill, ...passives]
    .map((s) => s?.DATA ?? null)
    .map((program) => ({ program, branches: branchObject(program) }));
  const { program } = programs[0];
  const rand = random(seed);
  const events = [];
  const log = [];
  const warnings = [];

  const people = {
    user: { yaw: 0, hp: 100, tags: new Map(), states: new Map(), lastHit: -Infinity },
    target: { yaw: Math.PI, hp: 100, tags: new Map(), states: new Map(), lastHit: -Infinity },
  };
  // In the air, you start up there (falling from 8 studs); jumping, you
  // start just off the ground going up at Roblox's JumpPower (50 studs/s,
  // a jump about 6.4 studs high). Air moves' pushes then act on you as in
  // the game, rather than against the floor.
  const start0 = conditions.JUMP ? { pos: [0, 0.5, 0], vel: [0, 50, 0] } : conditions.AIR ? { pos: [0, 8, 0], vel: [0, 0, 0] } : { pos: [0, 0, 0], vel: [0, 0, 0] };
  const world = new World({
    user: { pos: start0.pos, vel: start0.vel, yaw: 0 },
    target: { pos: [0, 0, distance], yaw: Math.PI },
    wall,
  });
  const projectiles = new Map();
  const shots = [];
  const grabs = [];
  const hpTrack = [{ t: 0, hp: 100 }];
  const tagTrack = [];

  const conditionsOf = (who) => (who === 'user' ? conditions : {});
  function reqOk(reqs, who) {
    const c = conditionsOf(who);
    return reqs.every((given) => {
      const req = withDefaults(given);
      let ok;
      switch (req?.K_NAME) {
        case 'AIR':
        case 'JUMP':
        case 'HOLD':
        case 'ULT':
          ok = Boolean(c[req.K_NAME]);
          break;
        case 'BAR':
          ok = num(c.BAR, 0) >= num(req.AMOUNT, 0);
          break;
        case 'HP':
          // Has Health: more than AMOUNT, read on whoever enters.
          ok = people[who].hp > num(req.AMOUNT, 0);
          break;
        case 'AIM':
          // Has Target: the dummy is there unless the settings say not.
          ok = c.AIM !== false;
          break;
        case 'DOMAIN':
          ok = Boolean(c.DOMAIN);
          break;
        default:
          ok = true;
      }
      return req?.FLIP ? !ok : ok;
    });
  }

  const skillReq = reqOf(program, '');
  if (!start && skillReq.length && !reqOk(skillReq, 'user'))
    warnings.push('The skill’s own conditions don’t hold with these settings: in JJS it wouldn’t start.');

  // Where a character's feet are at `t`, from the physics.
  const posAt = (who, t) => world.positionAt(who, t);

  function emit(event) {
    if (events.length < MAX_EVENTS) events.push({ id: events.length, ...event });
  }
  let current = null; // the thread running a node, for what it logs
  function say(t, who, text, branch, index) {
    if (log.length < MAX_EVENTS) log.push({ t, who, text, branch, index, ...(current?.p ? { p: current.p } : {}) });
  }

  // ─── Threads ────────────────────────────────────────────────────────
  const threads = [];
  let serial = 0;
  function spawn(who, branch, t, origin, p = 0) {
    if (!branch || branch === 'nil') return;
    if (branch && !programs[p].branches[branch]) return say(t, who, `No branch “${branch}”: nothing runs`);
    threads.push({ n: serial++, who, branch, i: 0, t, loops: new Map(), origin: origin ?? who, p });
    say(t, who, `starts ${branch || 'Default'}`, branch, 0);
  }

  // Who a node acts on. LAST HIT -1 (or none, or 0) is whoever runs it; a
  // positive number is the one they last hit, if within that many seconds.
  // 0 is a window nobody fits: the owner's moves use it to act on
  // themselves (Overhead Kiss's rising kick is a VELO with LAST HIT 0).
  function actorOf(node, thread) {
    const window = node['LAST HIT'];
    if (window === undefined || num(window, -1) <= 0) return thread.who;
    const them = people[thread.who];
    return thread.t - them.lastHit <= Math.max(0.05, num(window)) + 1e-6 ? other(thread.who) : null;
  }

  function headingFor(node, thread, actor) {
    return node['RELATIVE FROM BRANCH'] === false ? people[actor].yaw : people[thread.origin].yaw;
  }

  function tagMatch(current, wanted) {
    const want = String(wanted ?? '');
    const now = current === undefined ? undefined : String(current);
    const m = /^([<>]=?)\s*(-?[\d.]+)$/.exec(want);
    if (m) {
      const a = num(now, 0);
      const b = Number(m[2]);
      return m[1] === '<' ? a < b : m[1] === '>' ? a > b : m[1] === '<=' ? a <= b : a >= b;
    }
    if (now === undefined) return false;
    if (now !== '' && want !== '' && Number.isFinite(Number(now)) && Number.isFinite(Number(want)))
      return Number(now) === Number(want);
    return now === want;
  }

  function jump(thread, name, why) {
    if (!name) return false;
    const { program, branches } = programs[thread.p ?? 0];
    const target = branches[name];
    if (!target) {
      say(thread.t, thread.who, `${why} → “${name}” (no such branch: a comment)`, thread.branch, thread.i);
      return false;
    }
    if (!reqOk(reqOf(program, name), thread.who)) {
      say(thread.t, thread.who, `${why} → ${name}: its conditions don’t hold, carrying on`, thread.branch, thread.i);
      return false;
    }
    say(thread.t, thread.who, `${why} → ${name}`, thread.branch, thread.i);
    thread.branch = name;
    thread.i = 0;
    thread.loops = new Map();
    return true;
  }

  // Returns true when `moves` and the attacker's line went on to BRANCH.
  function hit(thread, node, t, how, index, moves = false) {
    const attacker = thread.who;
    const victim = other(attacker);
    const them = people[victim];
    // IFrames: nothing lands.
    const iframe = them.states.get('IFrame');
    if (iframe && iframe.until > t) {
      say(t, attacker, `${how} misses: they have IFrames`, thread.branch, index);
      return false;
    }
    // The dummy's own settings: counter, block, evade.
    if (victim === 'target') {
      if (dummy.counter) {
        people[attacker].states.set('Stun', { value: 1, until: t + 1 });
        emit({ kind: 'STATE', t, end: t + 1, who: attacker, node: { K_NAME: 'STATE', STATE: 'Stun', TIME: 1 }, branch: thread.branch, index });
        emit({ kind: 'COUNTER', t, end: t + 0.4, who: victim, node: {}, branch: thread.branch, index });
        say(t, attacker, `${how} is countered: the dummy counters and stuns you for 1s`, thread.branch, index);
        return false;
      }
      if (dummy.block && node.BLOCKABLE !== false) {
        const a = posAt(attacker, t);
        const v = posAt(victim, t);
        const facing = toWorld([0, 0, 1], them.yaw);
        const front = (a[0] - v[0]) * facing[0] + (a[2] - v[2]) * facing[2] >= 0;
        if (front || node['360 BLOCK'] === true) {
          say(t, attacker, `${how} is blocked`, thread.branch, index);
          return false;
        }
      }
      const stunned = them.states.get('Stun');
      if (dummy.evasive && stunned && stunned.until > t) {
        them.states.delete('Stun');
        them.states.set('IFrame', { value: 1, until: t + 1 });
        world.clearKnockback(victim, t);
        say(t, attacker, `${how}: the dummy evades out of the combo (1s of IFrames)`, thread.branch, index);
        return false;
      }
    }
    people[attacker].lastHit = t;
    const damage = num(node.DAMAGE, 0);
    them.hp = Math.max(0, them.hp - damage);
    if (victim === 'target') hpTrack.push({ t, hp: them.hp });
    // Just up from a ragdoll, melee doesn't stun (JJS's wiki) unless the hit
    // IGNOREs WAKEUP.
    const melee = (node['ATTACK TYPE'] ?? (how === 'hitbox' ? 'Melee' : 'Bullet')) === 'Melee';
    const wakeup = melee && node['IGNORE WAKEUP'] !== true && world.inWakeup(victim, t);
    const stun = wakeup ? 0 : num(node.STUN, 0);
    if (stun > 0) them.states.set('Stun', { value: 1, until: t + stun });
    // CLEAR KNOCKBACK stops their knockback and picks them up from a ragdoll.
    if (node['CLEAR KNOCKBACK'] === true) world.clearKnockback(victim, t);
    emit({ kind: 'HIT', t, end: t + 0.25, who: victim, by: attacker, damage, how, branch: thread.branch, index });
    say(
      t,
      attacker,
      `${how} hits for ${damage}${stun ? `, stuns ${stun}s` : wakeup ? ', no stun (they just got up)' : ''}`,
      thread.branch,
      index,
    );
    const kill = them.hp <= 0 && node['CAN KILL'] !== false;
    const mine = kill && node['BRANCH FINISHER'] && node['BRANCH FINISHER'] !== 'nil' ? node['BRANCH FINISHER'] : node.BRANCH;
    const moved = moves && mine && mine !== 'nil' ? jump(thread, mine, 'on hit') : false;
    if (!moves) spawn(attacker, mine, t, attacker, thread.p ?? 0);
    spawn(victim, node['BRANCH TARGET'], t, attacker, thread.p ?? 0);
    return moved;
  }

  // A character's body as a box: 4 wide (arms), 5 tall, 1 deep standing;
  // lying on the ground when ragdolled.
  function bodyBox(who, t) {
    const p = posAt(who, t);
    const down = world.isRagdolled(who, t);
    return down
      ? { c: [p[0], p[1] + 0.5, p[2]], axes: yawAxes(people[who].yaw), h: [2, 0.5, 2.5] }
      : { c: [p[0], p[1] + 2.5, p[2]], axes: yawAxes(people[who].yaw), h: [2, 2.5, 0.5] };
  }

  function runNode(thread, given) {
    // A field a node leaves out takes the builder's default (SkillDefault).
    const node = withDefaults(given);
    const t = thread.t;
    const kind = node?.K_NAME;
    const at = { t, branch: thread.branch, index: thread.i, ...(thread.p ? { p: thread.p } : {}) };
    switch (kind) {
      case 'WAIT':
        thread.t += Math.max(0, num(node.TIME, 0));
        return;
      case 'BRANCH': {
        let name = node.BRANCH;
        if (node.RANDOM) {
          const options = String(node.RANDOM).split(',').map((s) => s.trim()).filter(Boolean);
          if (options.length) name = options[Math.floor(rand() * options.length)];
        }
        if (jump(thread, name, node.RANDOM ? 'random' : 'branch')) return 'jumped';
        return;
      }
      case 'LOOP': {
        const key = `${thread.branch}:${thread.i}`;
        const holdOff = node.HOLD && !conditionsOf(thread.who).HOLD;
        const left = thread.loops.has(key) ? thread.loops.get(key) : num(node['LOOP AMOUNT'], 0);
        if (!holdOff && left > 0) {
          thread.loops.set(key, left - 1);
          thread.i = Math.max(0, thread.i - num(node['LOOP BACK'], 0));
          return 'jumped';
        }
        thread.loops.delete(key);
        return;
      }
      case 'TAG': {
        const store = people[thread.who].tags;
        const current = store.get(node.TAG);
        const value = current && current.until > t ? current.value : undefined;
        if (node.CHECK) {
          if (tagMatch(value, node.VALUE) && jump(thread, node.BRANCH, `${node.TAG} ${node.VALUE}`)) return 'jumped';
          return;
        }
        const time = num(node.TIME, 1e38);
        let next;
        if (node.SET) next = time <= 0 ? undefined : String(node.VALUE);
        else if (Number.isFinite(Number(node.VALUE)))
          // ADD/REMOVE on adds VALUE, off subtracts it.
          next = String(num(value, 0) + (node['ADD/REMOVE'] === false ? -1 : 1) * Number(node.VALUE));
        else next = String(node.VALUE);
        if (next === undefined) store.delete(node.TAG);
        else store.set(node.TAG, { value: next, until: t + (time > 1e9 ? 1e9 : time) });
        tagTrack.push({ t, who: thread.who, tag: node.TAG, value: next ?? null });
        say(t, thread.who, `tag ${node.TAG} = ${next ?? '(cleared)'}`, thread.branch, thread.i);
        return;
      }
      case 'STATE': {
        const actor = actorOf(node, thread);
        if (!actor) return;
        const store = people[actor].states;
        const name = node.STATE ?? 'Stun';
        if (node.CHECK) {
          const s = store.get(name);
          if (s && s.until > t && jump(thread, node.BRANCH, `in ${name}`)) return 'jumped';
          return;
        }
        // The Cancel state removes the states set with the same STATE TAG.
        if (name === 'Cancel') {
          const tag = node['STATE TAG'];
          if (tag) for (const [k, s] of store) if (s.tag === tag) store.delete(k);
          say(t, actor, `cancel states tagged ${tag || '(none)'}`, thread.branch, thread.i);
          return;
        }
        const time = num(node.TIME, 0);
        store.set(name, { value: node.VALUE, until: t + time, tag: node['STATE TAG'] || undefined });
        emit({ kind, t, end: t + Math.min(time, 30), who: actor, node, ...at });
        return;
      }
      case 'VELO': {
        const actor = actorOf(node, thread);
        if (!actor) return;
        const time = Math.max(0.01, num(node.TIME, 0.2));
        const v = toWorld(vec3(node.FORCE), headingFor(node, thread, actor));
        // A newer push replaces the one in progress (the dash's OnHit pin
        // stops the dash; a hover pin holds a boost where it ends).
        world.push(actor, t, { v, time, fade: node.FADE });
        const ragdoll = num(node.RAGDOLL, 0);
        if (ragdoll > 0) world.ragdoll(actor, t, ragdoll, node['TRUE RAGDOLL'] === true);
        emit({ kind, t, end: t + Math.max(time, ragdoll), who: actor, node, ragdoll, ...at });
        return;
      }
      case 'TELEPORT': {
        const actor = actorOf(node, thread);
        if (!actor) return;
        let pos;
        const shot = node['PROJECTILE TAG'] && projectiles.get(node['PROJECTILE TAG']);
        if (shot) pos = shotPos(shot, t);
        else {
          const off = toWorld(vec3(node.POSITION), people[actor].yaw);
          pos = posAt(actor, t).map((c, i) => c + off[i]);
        }
        pos[1] = Math.min(Math.max(pos[1], 0), 60);
        world.teleport(actor, t, pos);
        emit({ kind, t, end: t + 0.3, who: actor, node, ...at });
        return;
      }
      case 'HITBOX': {
        const size = vec3(node.SIZE, [5, 5, 5]);
        const me = thread.who;
        const yaw = people[me].yaw;
        const off = toWorld(vec3(node.POSITION), yaw);
        // From the root part, or from the tagged projectile if there is one.
        const shot = node['PROJECTILE TAG'] && projectiles.get(node['PROJECTILE TAG']);
        const from = shot ? shotPos(shot, t) : posAt(me, t).map((c, i) => c + (i === 1 ? ROOT : 0));
        const center = from.map((c, i) => c + off[i]);
        // ROTATION turns it in the player's frame (Roblox's, so x and z
        // turn the other way in this x-left frame).
        const [rx, ry, rz] = vec3(node.ROTATION);
        const box = { c: center, axes: rotatedAxes(yaw, -rx, ry, -rz), h: size.map((v) => Math.abs(v) / 2) };
        emit({ kind, t, end: t + 0.2, who: me, node, at: center, yaw, rot: [-rx, ry, -rz], ...at });
        const down = world.isRagdolled(other(me), t);
        const inside = boxesOverlap(box, bodyBox(other(me), t));
        // Ragdolled characters are only hit by hitboxes with HIT RAGDOLL
        // (guides). "Always hit" still forces it.
        const shielded = down && node['HIT RAGDOLL'] !== true;
        if (hits === 'always' || (hits === 'auto' && inside && !shielded)) {
          if (hit(thread, node, t, 'hitbox', thread.i, true)) return 'jumped';
        } else say(t, me, inside && shielded ? 'hitbox misses: they’re ragdolled' : 'hitbox misses', thread.branch, thread.i);
        return;
      }
      case 'PROJECTILE': {
        const me = thread.who;
        const yaw = people[me].yaw;
        // POSITION from the root part, in front as +z (the owner's rod probes
        // at z 6…42 find walls ahead; Great Yamada Attack's meteor starts
        // behind and above at "0, 20, -7" and falls in front). ROTATION x
        // pitches it (positive up, owner); y turns it (positive to your left).
        const off = toWorld(vec3(node.POSITION), yaw);
        const origin = posAt(me, t).map((c, i) => c + off[i] + (i === 1 ? ROOT : 0));
        const speed = num(node.SPEED, 0);
        const time = Math.max(0.005, num(node.TIME, 2)); // probes fly for as little as 0.02 s
        const [rx, ry] = vec3(node.ROTATION).map((d) => (d * Math.PI) / 180);
        const dir = toWorld([Math.sin(ry), Math.sin(rx) * Math.cos(ry), Math.cos(rx) * Math.cos(ry)], yaw);
        const shot = { id: shots.length, tag: node['PROJECTILE TAG'] ?? '', t0: t, t1: t + time, origin, dir, speed, size: vec3(node.SIZE, [6, 6, 6]), node, who: me };
        shots.push(shot);
        if (shot.tag) projectiles.set(shot.tag, shot);
        emit({ kind, t, end: shot.t1, who: me, node, shot: shot.id, ...at });
        const drawn = events[events.length - 1]?.shot === shot.id ? events[events.length - 1] : null;
        // The ground (y 0) and the wall, if any, for BRANCH COLLIDED.
        let bump = null;
        if (speed > 0)
          for (let s = t; s <= shot.t1; s += 1 / 240) {
            const p = shotPos(shot, s);
            if (p[1] <= 0 || (wall !== null && p[2] >= wall)) {
              bump = s;
              break;
            }
          }
        const wantsHit = node['BRANCH TARGET'] || node.BRANCH || num(node.DAMAGE, 0) > 0;
        let when = null;
        if (hits !== 'never' && wantsHit) {
          // The projectile is a box (SIZE) flying along its direction.
          const body = bodyBox(other(me), t);
          const axes = flightAxes(dir);
          const h = shot.size.map((v) => Math.abs(v) / 2);
          for (let s = t; s <= shot.t1 + 1e-9; s += 1 / 60) {
            if (boxesOverlap({ c: shotPos(shot, s), axes, h }, body)) {
              when = s;
              break;
            }
          }
          if (when === null && hits === 'always') when = t + Math.min(time, speed > 0 ? distance / speed : 0.1);
          if (when !== null && bump !== null && bump < when) when = null; // the wall's in the way
          if (when !== null) {
            if (node.CONTINUE === false) {
              shot.t1 = when;
              if (drawn) drawn.end = when;
            }
            threads.push({ n: serial++, who: me, branch: thread.branch, i: thread.i, t: when, loops: new Map(), origin: me, shotHit: node, line: thread.line ?? thread.n, p: thread.p ?? 0 });
          }
        }
        if (bump !== null && (when === null || node.CONTINUE !== false)) {
          shot.t1 = Math.min(shot.t1, bump);
          if (drawn) drawn.end = shot.t1;
          const collided = node['BRANCH COLLIDED'];
          if (collided && collided !== 'nil')
            threads.push({ n: serial++, who: me, branch: thread.branch, i: thread.i, t: bump, loops: new Map(), origin: me, collided, line: thread.line ?? thread.n, p: thread.p ?? 0 });
        }
        return;
      }
      case 'GRAB': {
        const actor = actorOf(node, thread);
        if (actor !== other(thread.who)) {
          say(t, thread.who, 'grab: nobody hit recently', thread.branch, thread.i);
          return;
        }
        const time = num(node.TIME, 1);
        grabs.push({ t0: t, t1: t + time, by: thread.who, who: actor, node });
        world.grab(actor, thread.who, t, t + time, node['BODY PART'] ?? 'HumanoidRootPart', vec3(node.POSITION, [0, 0, 4]));
        emit({ kind, t, end: t + time, who: actor, by: thread.who, node, ...at });
        return;
      }
      case 'HITCNCL': {
        // Hit in the last TIME (FLIP: missed): go to BRANCH, or with none,
        // end the move and stun yourself for ENDLAG.
        const hitRecently = t - people[thread.who].lastHit <= num(node.TIME, 1) + 1e-6;
        const pass = node.FLIP ? !hitRecently : hitRecently;
        if (!pass) return;
        if (node.BRANCH && node.BRANCH !== 'nil') {
          if (jump(thread, node.BRANCH, node.FLIP ? 'hit cancel (missed)' : 'hit cancel (hit)')) return 'jumped';
          return;
        }
        const endlag = num(node.ENDLAG, 1);
        people[thread.who].states.set('Stun', { value: 1, until: t + endlag });
        emit({ kind: 'STATE', t, end: t + endlag, who: thread.who, node: { K_NAME: 'STATE', STATE: 'Stun', TIME: endlag }, ...at });
        say(t, thread.who, `hit cancel: the move ends, ${endlag}s endlag`, thread.branch, thread.i);
        return 'stop';
      }
      case 'HPGIB': {
        const actor = actorOf(node, thread);
        if (!actor) return;
        const p = people[actor];
        p.hp = Math.max(node['CAN KILL'] === false ? 1 : 0, Math.min(100, p.hp + num(node.AMOUNT, 0)));
        if (actor === 'target') hpTrack.push({ t, hp: p.hp });
        emit({ kind, t, end: t + 0.3, who: actor, node, ...at });
        return;
      }
      default: {
        // Timed looks and bookkeeping: drawn or listed, not simulated.
        const actor = kind === 'SETCD' || kind === 'SETMELEE' || kind === 'ULTGIB' || kind === 'COUNTER' ? thread.who : actorOf(node, thread);
        if (!actor) return;
        const dur =
          kind === 'ANIM'
            ? animLength(node)
            : kind === 'SFX'
              ? 0.6
              : Math.max(0.05, num(node.TIME, kind === 'VISUAL' ? 0.5 : 0.3));
        emit({ kind: kind ?? '?', t, end: t + Math.min(dur, 30), who: actor, node, origin: thread.origin, ...at });
      }
    }
  }

  function shotPos(shot, t) {
    const k = Math.max(0, Math.min(t, shot.t1) - shot.t0) * shot.speed;
    return shot.origin.map((c, i) => c + shot.dir[i] * k);
  }

  // ─── Run ────────────────────────────────────────────────────────────
  for (const [who, list] of Object.entries(startTags ?? {}))
    for (const [tag, value] of Object.entries(list ?? {}))
      if (people[who] && tag) {
        people[who].tags.set(tag, { value: String(value), until: 1e9 });
        tagTrack.push({ t: 0, who, tag, value: String(value) });
      }
  if (start) spawn('user', start, 0, 'user');
  else threads.push({ n: serial++, who: 'user', branch: '', i: 0, t: 0, loops: new Map(), origin: 'user', p: 0 });
  // Use When Obtained skills start with it, on their own lines.
  for (let p = 1; p < programs.length; p++)
    if (programs[p].program) threads.push({ n: serial++, who: 'user', branch: '', i: 0, t: 0, loops: new Map(), origin: 'user', p });
  let steps = 0;
  let stopped = false;
  while (threads.length) {
    threads.sort((a, b) => a.t - b.t || a.n - b.n);
    const thread = threads[0];
    if (thread.t > maxTime) {
      // A passive running for ever doesn't make the skill one.
      stopped = threads.some((th) => !th.p);
      break;
    }
    if (thread.shotHit || thread.collided) {
      threads.shift();
      // Like a hitbox's BRANCH, a projectile's BRANCH and BRANCH COLLIDED
      // replace the line that fired it, wherever it has got to (owner: a rod
      // whose probe hit a wall stopped there). BRANCH TARGET still forks.
      const name = thread.collided ?? thread.shotHit.BRANCH;
      const own = programs[thread.p ?? 0];
      const takesOver = name && name !== 'nil' && own.branches[name] && reqOk(reqOf(own.program, name), thread.who);
      if (thread.shotHit) hit(thread, { ...thread.shotHit, BRANCH: '' }, thread.t, 'projectile', thread.i);
      else say(thread.t, thread.who, 'projectile meets a wall or the ground', thread.branch, thread.i);
      if (takesOver) {
        // A skill runs one line: whatever it's on now (the line that fired,
        // or a branch that has since taken over) is replaced.
        const at = threads.findIndex((th) => (th.line ?? th.n) === thread.line && !th.shotHit && !th.collided);
        if (at >= 0) threads.splice(at, 1);
        spawn(thread.who, name, thread.t, thread.who, thread.p ?? 0);
        if (own.branches[name]) threads[threads.length - 1].line = thread.line;
      } else if (name && name !== 'nil') say(thread.t, thread.who, `No branch “${name}”: nothing runs`);
      continue;
    }
    const line = lineOf(programs[thread.p ?? 0].program, thread.branch);
    if (thread.i >= line.length) {
      threads.shift();
      continue;
    }
    if (++steps > MAX_STEPS) {
      warnings.push('Stopped after too many steps: something loops without waiting.');
      break;
    }
    current = thread;
    const result = runNode(thread, line[thread.i]);
    current = null;
    if (result === 'stop') threads.shift();
    else if (result !== 'jumped') thread.i++;
    thread.t += nodeDelay;
  }
  if (stopped) warnings.push(`Runs for ever (a passive loop): shown for the first ${maxTime} seconds.`);

  const own = (e) => !e.p;
  const lastEvent = Math.max(0.5, ...events.filter(own).map((e) => e.end), ...log.filter(own).map((l) => l.t));
  // Run on until the knockback is over: both have landed, stopped, and got up.
  const settled = world.settle(Math.min(lastEvent, maxTime), maxTime);
  const end = Math.min(maxTime, Math.max(lastEvent, settled) + 0.4);
  const bodies = world.finish(end);
  return {
    duration: end,
    events,
    log,
    warnings,
    shots,
    grabs,
    hp: hpTrack,
    tags: tagTrack,
    motion: {
      user: bodies.user.samples,
      target: bodies.target.samples,
    },
    // Velocities at the same 60 Hz, and when each one was ragdolled.
    velocity: { user: bodies.user.velocities, target: bodies.target.velocities },
    ragdolls: { user: bodies.user.ragdolls, target: bodies.target.ragdolls },
    yaw: { user: people.user.yaw, target: people.target.yaw },
    room: { wall },
  };
}

function animLength(node) {
  const [a, b] = Array.isArray(node.PREVIEW) ? node.PREVIEW.map(Number) : [0, 0.5];
  const speed = Math.abs(num(node.SPEED, 1)) || 1;
  return Math.max(0.15, Math.min(6, (b - a) / speed || 0.5));
}

// The sample for time `t`.
export const motionAt = (samples, t) =>
  samples[Math.max(0, Math.min(samples.length - 1, Math.round(t * RATE)))] ?? [0, 0, 0];
