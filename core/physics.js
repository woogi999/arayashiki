// Roblox and JJS physics for the two characters, well enough to watch and to
// aim hitboxes with. Each character is a point at its feet (the R6 root is 3
// studs above it) integrated at a fixed 240 Hz, the rate Roblox's physics
// steps at, so a run is the same however it's sampled.
//
// What moves a character (docs/jjs-skill-builder.md, "Physics"):
//
//   * A VELO push is a BodyVelocity-style mover. While it lasts it sets the
//     horizontal velocity, and the vertical one too unless its y is exactly
//     0 (that's how "0, 0.001, 0" pins someone in the air while "0, 0, 60"
//     lets a dash fall off a ledge). FADE eases it to nothing over its TIME.
//     A newer push replaces the one in progress.
//   * When a push ends, the character keeps its velocity. Gravity (Roblox's
//     196.2 studs/s², the place's Workspace.Gravity) pulls it down, so a
//     launch keeps rising and arcs back.
//   * Standing, a character is a Humanoid: it brakes its own horizontal
//     motion within a few hundredths of a second, on the ground or in the
//     air, since a stunned player isn't steering.
//   * Ragdolled, nothing brakes it but the ground: it slides to a stop on
//     friction, and bounces off the floor and a wall. A regular ragdoll's
//     time only starts counting once it touches a surface; a TRUE RAGDOLL
//     counts from the hit (JJS's wiki). Getting up gives 0.75 s in which
//     melee hits don't stun.
//   * A grab holds someone at the grabber's part; they leave with the
//     grabber's velocity. A teleport puts someone somewhere, at rest.
//
// The numbers marked "inferred" are fitted to how Roblox and JJS feel, not
// read from JJS's code. They're in one place so they can be tuned.

export const PHYSICS = {
  rate: 240, // steps a second (Roblox's physics rate)
  gravity: 196.2, // studs/s², Roblox's default Workspace.Gravity; JJS keeps it (inferred)
  brakeGround: 0.05, // s: how fast a standing Humanoid kills horizontal speed (inferred)
  brakeAir: 0.09, // s: the same in the air (inferred)
  friction: 0.45, // a ragdoll sliding on the ground: decel = friction × gravity (inferred)
  bounce: 0.3, // a ragdoll's bounce off the floor or a wall (inferred)
  bounceMin: 14, // studs/s: slower impacts don't bounce (inferred)
  wakeupImmunity: 0.75, // s after getting up without melee stun (JJS wiki)
  halfDepth: 0.5, // studs from a character's middle to a wall
};

// Where each body part's middle is, from the feet of a character facing +z
// (studs; x left). A grab holds its victim relative to one of these.
export const PART_OFFSETS = {
  HumanoidRootPart: [0, 3, 0],
  Torso: [0, 3, 0],
  Head: [0, 4.5, 0],
  'Right Arm': [-1.5, 3, 0],
  'Left Arm': [1.5, 3, 0],
  'Right Leg': [-0.5, 1, 0],
  'Left Leg': [0.5, 1, 0],
};

const turnBy = ([x, y, z], yaw) => {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return [fz * x + fx * z, y, -fx * x + fz * z];
};

/** One character's body: its movers, its state, and what it did. */
class Body {
  constructor(home, yaw, vel = [0, 0, 0]) {
    this.pos = [...home];
    this.vel = [...vel];
    this.yaw = yaw;
    this.pushes = []; // { t0, t1, v: world velocity, fade }
    this.teleports = []; // { t, pos }
    this.grabs = []; // { t0, t1, anchor(step) → pos, from: Body }
    this.pendingRagdoll = null; // { start, seconds, true, counting: t | null }
    this.ragdolls = []; // finished: { t0, t1, landed }
    this.clears = []; // times knockback was cleared
    this.wakeUntil = -Infinity;
    this.grounded = home[1] <= 0;
    this.samples = [[...home]];
    this.velocities = [[0, 0, 0]];
  }

  // The push acting at `t`, if any.
  pushAt(t) {
    for (let i = this.pushes.length - 1; i >= 0; i--) {
      const p = this.pushes[i];
      if (t >= p.t0 && t < p.t1) return p;
    }
    return null;
  }

  ragdolledAt(t) {
    for (const r of this.ragdolls) if (t >= r.t0 && t < r.t1) return true;
    const r = this.pendingRagdoll;
    return Boolean(r && t >= r.start);
  }

  step(t, dt, world) {
    // Teleports land exactly on their step.
    while (this.teleports.length && this.teleports[0].t <= t + 1e-9) {
      this.pos = [...this.teleports.shift().pos];
      this.vel = [0, 0, 0];
    }
    const grab = this.grabs.find((g) => t >= g.t0 && t < g.t1);
    if (grab) {
      this.pos = grab.anchor();
      this.vel = [...grab.from.vel];
      this.grounded = this.pos[1] <= 1e-6;
      return;
    }
    const ragdoll = this.pendingRagdoll && t >= this.pendingRagdoll.start ? this.pendingRagdoll : null;
    const push = this.pushAt(t);
    const g = PHYSICS.gravity;
    if (push) {
      const k = push.fade ? 1 - (t - push.t0) / (push.t1 - push.t0 || 1) : 1;
      this.vel[0] = push.v[0] * k;
      this.vel[2] = push.v[2] * k;
      if (push.v[1] !== 0) this.vel[1] = push.v[1] * k;
      else this.vel[1] -= g * dt;
    } else {
      this.vel[1] -= g * dt;
      const speed = Math.hypot(this.vel[0], this.vel[2]);
      if (ragdoll) {
        if (this.grounded && speed > 0) {
          const next = Math.max(0, speed - PHYSICS.friction * g * dt);
          this.vel[0] *= next / speed;
          this.vel[2] *= next / speed;
        }
      } else {
        const keep = Math.exp(-dt / (this.grounded ? PHYSICS.brakeGround : PHYSICS.brakeAir));
        this.vel[0] *= keep;
        this.vel[2] *= keep;
      }
    }
    for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;

    // The ground, and the wall if there is one.
    let touched = false;
    if (this.pos[1] <= 0) {
      this.pos[1] = 0;
      if (this.vel[1] < 0) {
        this.vel[1] = ragdoll && this.vel[1] < -PHYSICS.bounceMin ? -this.vel[1] * PHYSICS.bounce : 0;
        touched = true;
      }
      if (this.vel[1] <= 0) touched = true;
    }
    this.grounded = this.pos[1] <= 1e-6;
    if (world.wall !== null && this.pos[2] > world.wall - PHYSICS.halfDepth) {
      this.pos[2] = world.wall - PHYSICS.halfDepth;
      if (this.vel[2] > 0) this.vel[2] = ragdoll ? -this.vel[2] * PHYSICS.bounce : 0;
      touched = true;
    }

    // A regular ragdoll starts counting on its first touch.
    if (ragdoll) {
      if (ragdoll.counting === null && touched) ragdoll.counting = t;
      if (ragdoll.counting !== null && t >= ragdoll.counting + ragdoll.seconds) this.endRagdoll(t);
    }
  }

  endRagdoll(t) {
    const r = this.pendingRagdoll;
    if (!r) return;
    this.ragdolls.push({ t0: r.start, t1: t, landed: r.counting });
    this.pendingRagdoll = null;
    this.wakeUntil = t + PHYSICS.wakeupImmunity;
  }
}

/** Both characters, stepped together so a grab can follow its grabber. */
export class World {
  constructor({ user, target, wall = null }) {
    this.wall = wall;
    this.bodies = { user: new Body(user.pos, user.yaw, user.vel), target: new Body(target.pos, target.yaw, target.vel) };
    this.time = 0;
    this.stepCount = 0;
  }

  body(who) {
    return this.bodies[who];
  }

  /** Steps both bodies until `t`. Time only moves forward. */
  advanceTo(t) {
    const dt = 1 / PHYSICS.rate;
    while (this.time + dt <= t + 1e-9) {
      this.bodies.user.step(this.time, dt, this);
      this.bodies.target.step(this.time, dt, this);
      this.time += dt;
      this.stepCount++;
      // A sample for the view every 4 steps: 60 a second.
      if (this.stepCount % 4 === 0)
        for (const b of Object.values(this.bodies)) {
          b.samples.push([...b.pos]);
          b.velocities.push([...b.vel]);
        }
    }
  }

  /** Where someone's feet are at `t` (at or after the last step). */
  positionAt(who, t) {
    this.advanceTo(t);
    const b = this.bodies[who];
    const extra = Math.max(0, t - this.time);
    const p = b.pos.map((c, i) => c + b.vel[i] * extra);
    p[1] = Math.max(0, p[1]);
    return p;
  }

  /** A push from `t`; it replaces whatever push was in progress. */
  push(who, t, { v, time, fade }) {
    this.advanceTo(t);
    const b = this.bodies[who];
    for (const p of b.pushes) if (p.t1 > t) p.t1 = Math.max(p.t0, t);
    b.pushes.push({ t0: t, t1: t + time, v, fade: Boolean(fade) });
  }

  ragdoll(who, t, seconds, isTrue) {
    this.advanceTo(t);
    const b = this.bodies[who];
    const r = b.pendingRagdoll;
    // A new ragdoll on a ragdolled body extends it; a true one counts now.
    if (r && isTrue) b.pendingRagdoll = { ...r, seconds: Math.max(seconds, (r.counting ?? t) + r.seconds - t), counting: t };
    else if (r) r.seconds = Math.max(r.seconds, seconds);
    else b.pendingRagdoll = { start: t, seconds, true: Boolean(isTrue), counting: isTrue ? t : null };
  }

  isRagdolled(who, t) {
    this.advanceTo(t);
    return Boolean(this.bodies[who].pendingRagdoll);
  }

  inWakeup(who, t) {
    this.advanceTo(t);
    return t < this.bodies[who].wakeUntil;
  }

  /** CLEAR KNOCKBACK: pushes stop, momentum goes, a ragdoll ends. */
  clearKnockback(who, t) {
    this.advanceTo(t);
    const b = this.bodies[who];
    for (const p of b.pushes) if (p.t1 > t) p.t1 = Math.max(p.t0, t);
    b.vel = [0, 0, 0];
    b.clears.push(t);
    if (b.pendingRagdoll) b.endRagdoll(t);
  }

  teleport(who, t, pos) {
    this.advanceTo(t);
    const b = this.bodies[who];
    for (const p of b.pushes) if (p.t1 > t) p.t1 = Math.max(p.t0, t);
    b.teleports.push({ t, pos: [...pos] });
  }

  /** `who` held at `by`'s body part (with an offset in `by`'s frame) from t0 to t1. */
  grab(who, by, t0, t1, part, offset) {
    this.advanceTo(t0);
    const holder = this.bodies[by];
    const at = PART_OFFSETS[part] ?? PART_OFFSETS.HumanoidRootPart;
    const local = [at[0] + offset[0], at[1] + offset[1] - 3, at[2] + offset[2]];
    this.bodies[who].grabs.push({
      t0,
      t1,
      from: holder,
      anchor: () => {
        const o = turnBy(local, holder.yaw);
        return holder.pos.map((c, i) => c + o[i]);
      },
    });
  }

  /**
   * Steps on until both characters have settled (on the ground, still, and
   * standing) and nothing is pushing or holding them, or until `limit`.
   * Returns the time they settled. A regular ragdoll only starts counting
   * when it lands, so this is when a knockback is really over.
   */
  settle(from, limit) {
    this.advanceTo(from);
    const dt = 1 / PHYSICS.rate;
    const busy = (b) =>
      b.pendingRagdoll ||
      !b.grounded ||
      Math.hypot(...b.vel) > 0.05 ||
      b.pushes.some((p) => p.t1 > this.time) ||
      b.grabs.some((g) => g.t1 > this.time);
    while (this.time < limit && Object.values(this.bodies).some(busy)) this.advanceTo(this.time + dt);
    return this.time;
  }

  /** Steps on to `end` and hands back what the view needs. */
  finish(end) {
    this.advanceTo(end);
    const out = {};
    for (const [who, b] of Object.entries(this.bodies)) {
      const ragdolls = [...b.ragdolls];
      if (b.pendingRagdoll) ragdolls.push({ t0: b.pendingRagdoll.start, t1: end, landed: b.pendingRagdoll.counting });
      out[who] = { samples: b.samples, velocities: b.velocities, ragdolls };
    }
    return out;
  }
}
