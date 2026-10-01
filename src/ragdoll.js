// JJS's ragdolls, drawn: while the simulator (core/physics.js) has someone
// ragdolled, their six R6 parts become rigid bodies joined at the neck,
// shoulders and hips, the way JJS swaps a character's Motor6Ds for
// BallSocketConstraints. They start from the pose and the velocity the
// physics hands over, tumble under Roblox gravity, and land on the floor (and
// the wall, if there is one).
//
// Rigid-body physics runs forwards only, so each ragdoll is baked once per
// run into frames at 60 Hz; the view then shows the frame for any time,
// which keeps scrubbing exact. The torso is gently steered to where the
// simulator has the character, so what's drawn stays where the hitboxes aim.
// It's a look only: nothing here changes what the simulator decides.

import { Body, Box, ConeTwistConstraint, Material, ContactMaterial, Plane, Quaternion, Vec3, World } from 'cannon-es';
import { PHYSICS } from '../core/physics.js';
import { motionAt, RATE } from '../core/sim.js';

// Part half-sizes (studs) and middles from the feet (facing +z, x left).
const PARTS = {
  Torso: { half: [1, 1, 0.5], at: [0, 3, 0], mass: 2.8 },
  Head: { half: [0.6, 0.6, 0.6], at: [0, 4.5, 0], mass: 1.2 },
  'Right Arm': { half: [0.5, 1, 0.5], at: [-1.5, 3, 0], mass: 1.4 },
  'Left Arm': { half: [0.5, 1, 0.5], at: [1.5, 3, 0], mass: 1.4 },
  'Right Leg': { half: [0.5, 1, 0.5], at: [-0.5, 1, 0], mass: 1.4 },
  'Left Leg': { half: [0.5, 1, 0.5], at: [0.5, 1, 0], mass: 1.4 },
};
// The joints, as a point in the torso's frame and one in the part's.
const JOINTS = {
  Head: { torso: [0, 1, 0], part: [0, -0.5, 0], angle: Math.PI / 5, twist: Math.PI / 6 },
  'Right Arm': { torso: [-1.5, 0.5, 0], part: [0, 0.5, 0], angle: Math.PI / 1.6, twist: Math.PI / 3 },
  'Left Arm': { torso: [1.5, 0.5, 0], part: [0, 0.5, 0], angle: Math.PI / 1.6, twist: Math.PI / 3 },
  'Right Leg': { torso: [-0.5, -1, 0], part: [0, 1, 0], angle: Math.PI / 3, twist: Math.PI / 8 },
  'Left Leg': { torso: [0.5, -1, 0], part: [0, 1, 0], angle: Math.PI / 3, twist: Math.PI / 8 },
};
const STEP = 1 / 120;
const STEER = 30; // how firmly the torso follows the simulator (1/s)

const turn = ([x, y, z], yaw) => {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [c * x + s * z, y, -s * x + c * z];
};

/**
 * Bakes one ragdoll: `who`'s parts from `t0` to `t1` of `run`.
 * Returns { t0, t1, frames: [{ name: [x, y, z, qx, qy, qz, qw] }] }.
 */
function bakeOne(run, who, { t0, t1 }) {
  const world = new World({ gravity: new Vec3(0, -PHYSICS.gravity, 0) });
  world.allowSleep = false;
  const skin = new Material('body');
  const floor = new Material('floor');
  world.addContactMaterial(
    new ContactMaterial(skin, floor, { friction: PHYSICS.friction, restitution: PHYSICS.bounce }),
  );
  world.addContactMaterial(new ContactMaterial(skin, skin, { friction: 0.3, restitution: 0.1 }));
  const ground = new Body({ mass: 0, material: floor, shape: new Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  if (run.room?.wall !== null && run.room?.wall !== undefined) {
    const wall = new Body({ mass: 0, material: floor, shape: new Plane() });
    wall.quaternion.setFromEuler(0, Math.PI, 0); // facing -z, at z = wall
    wall.position.set(0, 0, run.room.wall);
    world.addBody(wall);
  }

  const yaw = run.yaw[who];
  const feet = motionAt(run.motion[who], t0);
  // The velocity just after the hit: a VELO that ragdolls pushes on the
  // same step, so the sample at t0 is still the one from before it.
  const velocities = run.velocity?.[who] ?? [];
  const vel = velocities[Math.min(velocities.length - 1, Math.round(t0 * RATE) + 1)] ?? [0, 0, 0];
  const turnQ = new Quaternion().setFromEuler(0, yaw, 0);
  const bodies = {};
  for (const [name, p] of Object.entries(PARTS)) {
    const at = turn(p.at, yaw);
    const body = new Body({
      mass: p.mass,
      material: skin,
      shape: new Box(new Vec3(...p.half)),
      linearDamping: 0.05,
      angularDamping: 0.2,
    });
    body.position.set(feet[0] + at[0], feet[1] + at[1], feet[2] + at[2]);
    body.quaternion.copy(turnQ);
    body.velocity.set(...vel);
    world.addBody(body);
    bodies[name] = body;
  }
  // A small tip backwards, so a knockback doesn't balance the body upright.
  bodies.Torso.angularVelocity.set(...turn([-3, 0, 0], yaw));
  for (const [name, j] of Object.entries(JOINTS))
    world.addConstraint(
      new ConeTwistConstraint(bodies.Torso, bodies[name], {
        pivotA: new Vec3(...j.torso),
        pivotB: new Vec3(...j.part),
        axisA: new Vec3(0, name === 'Head' ? 1 : -1, 0),
        axisB: new Vec3(0, name === 'Head' ? 1 : -1, 0),
        angle: j.angle,
        twistAngle: j.twist,
        collideConnected: false,
      }),
    );

  const frames = [];
  const perFrame = Math.round(1 / RATE / STEP);
  let t = t0;
  let n = 0;
  // A frame; if the solver ever blows up (NaN), the last good one again,
  // so the body never vanishes or freezes mid-air.
  const record = () => {
    const frame = Object.fromEntries(
      Object.entries(bodies).map(([name, b]) => [
        name,
        [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
      ]),
    );
    const ok = Object.values(frame).every((v) => v.every(Number.isFinite));
    frames.push(ok || !frames.length ? frame : frames[frames.length - 1]);
  };
  record();
  while (t < t1) {
    // Steer the torso towards where the simulator has them (sideways only:
    // the height is the ragdoll's own).
    const want = motionAt(run.motion[who], t);
    const flow = run.velocity?.[who]?.[Math.min(run.velocity[who].length - 1, Math.round(t * RATE))] ?? [0, 0, 0];
    const torso = bodies.Torso;
    for (const [axis, i] of [
      ['x', 0],
      ['z', 2],
    ]) {
      const desired = flow[i] + (want[i] - torso.position[axis]) * STEER;
      torso.velocity[axis] += (desired - torso.velocity[axis]) * 0.5;
    }
    // Up and down too while the simulator has them in the air (launched,
    // or held up by a push): otherwise a launch would only show sideways.
    if (want[1] > 0.05 || Math.abs(flow[1]) > 0.5) {
      const desired = flow[1] + (want[1] + 1.5 - torso.position.y) * STEER;
      torso.velocity.y += (desired - torso.velocity.y) * 0.5;
    }
    // Keep the solver sane.
    for (const b of Object.values(bodies)) {
      const v = b.velocity.length();
      if (v > 600) b.velocity.scale(600 / v, b.velocity);
    }
    world.step(STEP);
    t += STEP;
    if (++n % perFrame === 0) record();
  }
  return { t0, t1, frames };
}

/** Every ragdoll in a run, baked: { user: [...], target: [...] }. */
export function bakeRagdolls(run) {
  const out = { user: [], target: [] };
  if (!run?.ragdolls) return out;
  for (const who of ['user', 'target'])
    for (const r of run.ragdolls[who]) if (r.t1 > r.t0) out[who].push(bakeOne(run, who, r));
  return out;
}

/** The baked frame for `t`, or null when `who` isn't ragdolled then. */
export function ragdollFrame(baked, who, t) {
  for (const r of baked[who]) {
    if (t < r.t0 || t >= r.t1) continue;
    const i = Math.min(r.frames.length - 1, Math.max(0, Math.round((t - r.t0) * RATE)));
    return r.frames[i];
  }
  return null;
}
