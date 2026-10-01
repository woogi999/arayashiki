# Fishing rod: hook at range, pull in, or grapple to walls

Tags: hook, grapple, pull, rope, line, range, projectile probe, wall detection, branch collided, air variant, look

A cast that hooks the first one along a 60-stud line and pulls them in (the
pull is stronger the further they were), or, if the line reaches a wall or the
ground first, pulls you to it. In the air it hops up and back, and aims up or
down with the camera. The most worked-out example of detecting walls.

How it works:
- **Wall detection**: during the wind-up, tiny fast projectiles ("probes",
  `SPEED 350`, `TIME 0.02`, about 7 studs each) are fired along the line one
  6-stud stretch at a time, nearest first. The first to touch something runs
  its `BRANCH COLLIDED "Wall<N>"`, which **replaces the line**, so each
  `Wall<N>` branch carries the rest of the move itself, ending in
  `Grapple<N>` (a VELO to the wall, sized to the distance).
- **The cast**: a tip mesh and a stretched `Block` line (`SIZE 2` sets its
  length) fly out; 0-damage **unblockable** detectors of growing length
  (6, 12, … 60) follow the tip. The first to touch someone → `Catch<N>`.
- **Catch<N>**: the line reels in, and one real **blockable** hitbox decides:
  blocked, nothing; hit → `BRANCH TARGET "Pull<N>"`, a pull on them of the
  right strength (10, 38, 67, 96…).
- States can't be cancelled, so they're set in short pieces and topped up.
- **Air1** (Req AIR): a small up-and-back boost, a hover pin, and a
  `LOOK` with `CAMERA DIRECTION` on and `HORIZONTAL ONLY` off, so the whole
  cast aims up or down with the camera.

Reuse it for: anything that needs to know how far a wall is (the probe
ladder), hooks and pulls, casts along a line, air versions. The handbook's
"fishing rod techniques" section has the details.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `fishing-rod-fixed.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 2: "Fishing Rod"

Cooldown 15 · Properties: NOSTUN

```text
Line (runs on use)
    0  TAG check Charging "True" → "-"
    1  BRANCH → "Air1"
    2  BRANCH → "1"

Branch "1"
      fx: FOV -10 over 1 s · sound 74818885604525 · sound 105642977095124 ×2 · sound 135464316856078 ×1.5
    4  ANIM [17,1] (Nanami.CleavingWhirlwind) FADE IN=0.2
    5  STATE SpeedMultiplier = 0.4 for 0.35 s
    6  STATE InSkill for 0.35 s
    7  STATE NoJump for 0.35 s
    8  PROJECTILE PROJECTILE TAG="RodProbe1" POSITION="0, -0.5, 0" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall6" ATTACK TYPE="Bullet"
    9  WAIT 0.02
   10  PROJECTILE PROJECTILE TAG="RodProbe2" POSITION="0, -0.5, 6" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall12" ATTACK TYPE="Bullet"
   11  WAIT 0.02
   12  PROJECTILE PROJECTILE TAG="RodProbe3" POSITION="0, -0.5, 12" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall18" ATTACK TYPE="Bullet"
   13  WAIT 0.02
   14  PROJECTILE PROJECTILE TAG="RodProbe4" POSITION="0, -0.5, 18" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall24" ATTACK TYPE="Bullet"
   15  WAIT 0.02
   16  PROJECTILE PROJECTILE TAG="RodProbe5" POSITION="0, -0.5, 24" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall30" ATTACK TYPE="Bullet"
   17  WAIT 0.02
   18  WAIT 0.1
      fx: Melee Trail (Right Arm, 0.5 s) · Mesh (Right Arm, 0.35 s)
   21  STATE DirectionLock for 0.45 s
   22  STATE SpeedMultiplier = 0.4 for 0.45 s
   23  STATE InSkill for 0.45 s
   24  STATE NoJump for 0.45 s
      fx: sound 123194443755778 ×1.5 · sound 119135010875996 ×2
   27  PROJECTILE PROJECTILE TAG="RodProbe6" POSITION="0, -0.5, 30" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall36" ATTACK TYPE="Bullet"
   28  WAIT 0.02
   29  PROJECTILE PROJECTILE TAG="RodProbe7" POSITION="0, -0.5, 36" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall42" ATTACK TYPE="Bullet"
   30  WAIT 0.02
   31  PROJECTILE PROJECTILE TAG="RodProbe8" POSITION="0, -0.5, 42" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall48" ATTACK TYPE="Bullet"
   32  WAIT 0.02
   33  PROJECTILE PROJECTILE TAG="RodProbe9" POSITION="0, -0.5, 48" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall54" ATTACK TYPE="Bullet"
   34  WAIT 0.02
   35  PROJECTILE PROJECTILE TAG="RodProbe10" POSITION="0, -0.5, 54" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="Wall60" ATTACK TYPE="Bullet"
   36  WAIT 0.02
   37  WAIT 0.25
   38  VELO TIME=0.3 FORCE="0, 0.001, 0"
   39  SETCD (its usual cooldown)
   40  HITBOX DAMAGE=2 CAN KILL=false BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.5 SIZE="6, 6, 6" POSITION="0, 0, 4" BRANCH TARGET="OnHitTargetClose" HIT RAGDOLL=false STUN ANIM=true IGNORE WAKEUP=false CANCEL ENEMY=true
      fx: FOV 10 over 2 s · Mesh (Right Arm) · Mesh (tag "RodTipCast", 0.4 s) · Block (tag "RodLineCast", 0.4 s) · Mesh (0.1 s) · Mesh
   47  STATE InSkill for 0.3 s
   48  STATE NoJump for 0.3 s
   49  STATE DirectionLock for 0.3 s
   50  STATE SpeedMultiplier = 0.4 for 0.3 s
   51  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 3" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch6" SIZE="5, 5, 6"
   52  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 6" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch12" SIZE="5, 5, 12"
   53  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 9" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch18" SIZE="5, 5, 18"
   54  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 12" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch24" SIZE="5, 5, 24"
   55  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 15" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch30" SIZE="5, 5, 30"
   56  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 18" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch36" SIZE="5, 5, 36"
   57  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 21" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch42" SIZE="5, 5, 42"
   58  WAIT 0.01
   59  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 24" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch48" SIZE="5, 5, 48"
   60  WAIT 0.03
   61  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 27" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch54" SIZE="5, 5, 54"
   62  STATE InSkill for 0.15 s
   63  STATE NoJump for 0.15 s
   64  STATE DirectionLock for 0.15 s
   65  STATE SpeedMultiplier = 0.4 for 0.15 s
   66  VELO TIME=0.15 FORCE="0, 0.001, 0"
   67  WAIT 0.07
   68  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 30" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch60" SIZE="5, 5, 60"
   69  STATE InSkill for 0.4 s
   70  STATE NoJump for 0.4 s
   71  STATE DirectionLock for 0.7 s
   72  STATE SpeedMultiplier = 0.4 for 0.2 s
   73  VELO TIME=0.35 FORCE="0, 0.001, 0"
   74  WAIT 0.05
   75  ANIM [22,16] (Ryu.WerentInvited) FADE OUT=0.4 SPEED=1.6
      fx: Mesh (0.2 s) · Block (0.2 s) · sound 9114451544 ×0.5 · sound 112668720141878 ×2
   80  WAIT 0.3
      fx: FOV 0 over 1 s
   82  WAIT 0.5

Branch "AirGrapple12"
    0  STATE InSkill for 0.15 s
    1  STATE NoJump for 0.15 s
    2  STATE DirectionLock for 0.15 s
    3  ANIM [22,16] (Ryu.WerentInvited) FADE OUT=0.4 SPEED=1.6
      fx: Cancel "RodTipCast" · Cancel "RodLineCast" · sound 9114451544 ×0.5 · sound 112668720141878 ×2 · Mesh (0.2 s) · Block (0.1 s)
   10  VELO TIME=0.1 FORCE="0, 2, 85"
   11  WAIT 0.1

Branch "Catch24"
    0  STATE InSkill for 0.35 s
    1  STATE NoJump for 0.35 s
    2  STATE DirectionLock for 0.35 s
    3  STATE SpeedMultiplier = 0.4 for 0.35 s
    4  VELO TIME=0.35 FORCE="0, 0.001, 0"
    5  ANIM [22,16] (Ryu.WerentInvited) FADE OUT=0.4 SPEED=1.6
      fx: Cancel "RodTipCast" · Cancel "RodLineCast" · Mesh (0.2 s) · Block (0.2 s)
   10  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=true ATTACK TYPE="Bullet" STUN=0.75 STUN ANIM=true POSITION="0, 0, 12" BRANCH TARGET="Pull24" HIT RAGDOLL=true IGNORE WAKEUP=true CLEAR KNOCKBACK=true BRANCH="OnHit" SIZE="5, 5, 24" CANCEL ENEMY=true
      fx: sound 9114451544 ×0.5 · sound 112668720141878 ×2

Branch "Pull24"
      fx: sound 101247420510723 ×2 · sound 8255873204 ×0.75 · Clash (0.1 s) · particle 16678929169 ×1
    4  STATE Wakeup for 0.1 s
    5  STATE Stun for 0.75 s
    6  VELO TIME=0.5 TRUE RAGDOLL=true FORCE="0, 0.1, -96" FADE=true
    7  ANIM [19,4] (Haruta.BackstabTargetBack) FADE OUT=0.4

Branch "Grapple24"
    0  STATE InSkill for 0.2 s
    1  STATE NoJump for 0.2 s
    2  STATE DirectionLock for 0.2 s
    3  ANIM [22,16] (Ryu.WerentInvited) FADE OUT=0.4 SPEED=1.6
      fx: Cancel "RodTipCast" · Cancel "RodLineCast" · sound 9114451544 ×0.5 · sound 112668720141878 ×2 · Mesh (0.25 s) · Block (0.15 s)
   10  VELO TIME=0.15 FORCE="0, 2, 120"
   11  WAIT 0.15

Branch "Wall24"
    0  WAIT 0.02
    1  WAIT 0.02
    2  WAIT 0.1
      fx: Melee Trail (Right Arm, 0.5 s) · Mesh (Right Arm, 0.35 s)
    5  STATE DirectionLock for 0.45 s
    6  STATE SpeedMultiplier = 0.4 for 0.45 s
    7  STATE InSkill for 0.45 s
    8  STATE NoJump for 0.45 s
      fx: sound 123194443755778 ×1.5 · sound 119135010875996 ×2
   11  WAIT 0.02
   12  WAIT 0.02
   13  WAIT 0.02
   14  WAIT 0.02
   15  WAIT 0.02
   16  WAIT 0.25
   17  VELO TIME=0.3 FORCE="0, 0.001, 0"
   18  SETCD (its usual cooldown)
   19  HITBOX DAMAGE=2 CAN KILL=false BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.5 SIZE="6, 6, 6" POSITION="0, 0, 4" BRANCH TARGET="OnHitTargetClose" HIT RAGDOLL=false STUN ANIM=true IGNORE WAKEUP=false CANCEL ENEMY=true
      fx: FOV 10 over 2 s · Mesh (Right Arm) · Mesh (tag "RodTipCast", 0.4 s) · Block (tag "RodLineCast", 0.4 s) · Mesh (0.1 s) · Mesh
   26  STATE InSkill for 0.3 s
   27  STATE NoJump for 0.3 s
   28  STATE DirectionLock for 0.3 s
   29  STATE SpeedMultiplier = 0.4 for 0.3 s
   30  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 3" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch6" SIZE="5, 5, 6"
   31  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 6" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch12" SIZE="5, 5, 12"
   32  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 9" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch18" SIZE="5, 5, 18"
   33  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 12" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch24" SIZE="5, 5, 24"
   34  BRANCH → "Grapple24"

Branch "Air1" — only if AIR
      fx: FOV -10 over 1 s · sound 74818885604525 · sound 105642977095124 ×2 · sound 135464316856078 ×1.5
    4  ANIM [17,1] (Nanami.CleavingWhirlwind) FADE IN=0.2
    5  VELO TIME=0.2 FORCE="0, 25, -20" FADE=true
    6  LOOK TIME=0.85 SMOOTHNESS=150 CAMERA DIRECTION=true HORIZONTAL ONLY=false
    7  STATE SpeedMultiplier = 0.4 for 0.35 s
    8  STATE InSkill for 0.35 s
    9  STATE NoJump for 0.35 s
   10  PROJECTILE PROJECTILE TAG="RodProbe1" POSITION="0, -0.5, 0" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall6" ATTACK TYPE="Bullet"
   11  WAIT 0.02
   12  PROJECTILE PROJECTILE TAG="RodProbe2" POSITION="0, -0.5, 6" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall12" ATTACK TYPE="Bullet"
   13  WAIT 0.02
   14  PROJECTILE PROJECTILE TAG="RodProbe3" POSITION="0, -0.5, 12" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall18" ATTACK TYPE="Bullet"
   15  WAIT 0.02
   16  PROJECTILE PROJECTILE TAG="RodProbe4" POSITION="0, -0.5, 18" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall24" ATTACK TYPE="Bullet"
   17  WAIT 0.02
   18  PROJECTILE PROJECTILE TAG="RodProbe5" POSITION="0, -0.5, 24" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall30" ATTACK TYPE="Bullet"
   19  WAIT 0.02
   20  WAIT 0.1
   21  VELO TIME=0.45 FORCE="0, 0.001, 0"
      fx: Melee Trail (Right Arm, 0.5 s) · Mesh (Right Arm, 0.35 s)
   24  STATE SpeedMultiplier = 0.4 for 0.45 s
   25  STATE InSkill for 0.45 s
   26  STATE NoJump for 0.45 s
      fx: sound 123194443755778 ×1.5 · sound 119135010875996 ×2
   29  PROJECTILE PROJECTILE TAG="RodProbe6" POSITION="0, -0.5, 30" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall36" ATTACK TYPE="Bullet"
   30  WAIT 0.02
   31  PROJECTILE PROJECTILE TAG="RodProbe7" POSITION="0, -0.5, 36" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall42" ATTACK TYPE="Bullet"
   32  WAIT 0.02
   33  PROJECTILE PROJECTILE TAG="RodProbe8" POSITION="0, -0.5, 42" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall48" ATTACK TYPE="Bullet"
   34  WAIT 0.02
   35  PROJECTILE PROJECTILE TAG="RodProbe9" POSITION="0, -0.5, 48" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall54" ATTACK TYPE="Bullet"
   36  WAIT 0.02
   37  PROJECTILE PROJECTILE TAG="RodProbe10" POSITION="0, -0.5, 54" SIZE="1, 1, 1" SPEED=350 TIME=0.02 BRANCH COLLIDED="AirWall60" ATTACK TYPE="Bullet"
   38  WAIT 0.02
   39  WAIT 0.25
   40  VELO TIME=0.3 FORCE="0, 0.001, 0"
   41  SETCD (its usual cooldown)
   42  HITBOX DAMAGE=2 CAN KILL=false BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.5 SIZE="6, 6, 6" POSITION="0, 0, 4" BRANCH TARGET="OnHitTargetClose" HIT RAGDOLL=false STUN ANIM=true IGNORE WAKEUP=false CANCEL ENEMY=true
      fx: FOV 10 over 2 s · Mesh (Right Arm) · Mesh (tag "RodTipCast", 0.4 s) · Block (tag "RodLineCast", 0.4 s) · Mesh (0.1 s) · Mesh
   49  STATE InSkill for 0.3 s
   50  STATE NoJump for 0.3 s
   51  STATE DirectionLock for 0.3 s
   52  STATE SpeedMultiplier = 0.4 for 0.3 s
   53  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 3" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch6" SIZE="5, 5, 6"
   54  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 6" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch12" SIZE="5, 5, 12"
   55  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 9" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch18" SIZE="5, 5, 18"
   56  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 12" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch24" SIZE="5, 5, 24"
   57  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 15" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch30" SIZE="5, 5, 30"
   58  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 18" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch36" SIZE="5, 5, 36"
   59  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 21" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch42" SIZE="5, 5, 42"
   60  WAIT 0.01
   61  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 24" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch48" SIZE="5, 5, 48"
   62  WAIT 0.03
   63  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 27" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch54" SIZE="5, 5, 54"
   64  STATE InSkill for 0.15 s
   65  STATE NoJump for 0.15 s
   66  STATE DirectionLock for 0.15 s
   67  STATE SpeedMultiplier = 0.4 for 0.15 s
   68  VELO TIME=0.15 FORCE="0, 0.001, 0"
   69  WAIT 0.07
   70  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Bullet" STUN=-1 POSITION="0, 0, 30" HIT RAGDOLL=true IGNORE WAKEUP=true BRANCH="Catch60" SIZE="5, 5, 60"
   71  STATE InSkill for 0.4 s
   72  STATE NoJump for 0.4 s
   73  STATE DirectionLock for 0.7 s
   74  STATE SpeedMultiplier = 0.4 for 0.2 s
   75  VELO TIME=0.35 FORCE="0, 0.001, 0"
   76  WAIT 0.05
   77  ANIM [22,16] (Ryu.WerentInvited) FADE OUT=0.4 SPEED=1.6
      fx: Mesh (0.2 s) · Block (0.2 s) · sound 9114451544 ×0.5 · sound 112668720141878 ×2
   82  WAIT 0.3
      fx: FOV 0 over 1 s
   84  WAIT 0.5
```

Not shown (52 more branches, all in the code): "Pull", "OnHit", "OnHitTargetClose", "-", "Catch6", "Pull6", "AirGrapple6", "Catch12", "Pull12", "Grapple12", "Catch18", "Pull18", "Grapple18", "AirGrapple18", "AirGrapple24", "Catch30", "Grapple30", "AirGrapple30", "Catch36", "Grapple36", "AirGrapple36", "Catch42", "Grapple42", "AirGrapple42", "Catch48", "Grapple48", "AirGrapple48", "Catch54", "Grapple54", "AirGrapple54", "Catch60", "Grapple60", "AirGrapple60", "Wall6", "Wall12", "Wall18", "Wall30", "Wall36", "Wall42", "Wall48", "Wall54", "Wall60", "AirWall6", "AirWall12", "AirWall18", "AirWall24", "AirWall30", "AirWall36", "AirWall42", "AirWall48", "AirWall54", "AirWall60".

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
