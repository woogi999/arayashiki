# Special: dash, grab, launch, and hand back to the M1s

Tags: special, dash, grab, launch, air combo, setmelee, combo extender

The special move (G): hop back, dash forward; on hit, grab them, launch them,
jump after them, then set the M1 combo so your next M1 is the finisher.

How it works:
- Line: hop back `"0, 0.001, -50"`, `WAIT 0.1`, dash `"0, 0.001, 70"` with a
  detector every 0.05 s (`LOOP` × 8) → `HitCheck` (2 damage, 2 s stun).
- OnHit: pin yourself, `GRAB` them in front for 0.1 s (a reposition), launch
  them `"0.001, 62.5, 50"` (`LAST HIT 0.4`), `WAIT 0.3`, jump after them
  `"0.001, 60, 57"`, then **`SETMELEE COMBO 4, OFFSET 2.5`**: your next M1 is
  hit 4, for 2.5 s.

Reuse it for: moves that feed into the M1 finisher (`SETMELEE`), launch and
follow.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SPECIAL: "Special"

Cooldown 10 · Properties: NOSTUN

```text
Line (runs on use)
      fx: sound 123389986399408 ×1.5
    1  ANIM [20,8] (MeiMei.Flock) FADE OUT=0.4
    2  VELO TRACK=true TIME=0.1 FADE=true FORCE="0, 0.001, -50"
    3  STATE Stun for 0.3 s
    4  STATE InSkill for 0.6 s
    5  STATE NoJump for 0.8 s
    6  WAIT 0.1
      fx: Wind Streak (0.5 s) · Wind Streak (0.5 s) · FOV -6 · Mesh (0.4 s) · Mesh (0.2 s) · Wind Expand (0.4 s)
   13  VELO TRACK=true TIME=0.4 FORCE="0, 0.001, 70" FADE=true
   14  HITBOX DAMAGE=0 STUN=0 POSITION="0, 0, 2.5" BLOCKABLE=false HIT RAGDOLL=true SIZE="9, 12, 10" CAN KILL=false BRANCH="HitCheck" IGNORE WAKEUP=false
   15  WAIT 0.05
   16  LOOP back 2 × 8
   17  STATE SpeedMultiplier = 0.2 for 0.6 s
   18  STATE NoDash = 0.2 for 0.6 s
   19  SETCD (its usual cooldown)
      fx: FOV 0
   21  WAIT 0.4

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)

Branch "OnHit"
      fx: Shake Medium · sound 125914564702009 ×1.5
    2  VELO RELATIVE FROM BRANCH=false TIME=0.5 FORCE="0.001, 0.001, 0.001"
    3  STATE Stun for 0.4 s
    4  STATE DirectionLock for 0.7 s
    5  STATE InSkill for 0.6 s
    6  STATE SpeedMultiplier = 0 for 0.7 s
    7  ANIM [13,2] (Yuta.Revolve) FADE OUT=0.4 SPEED=0.8
    8  GRAB POSITION="0, 0, 4" LAST HIT=0.2 TIME=0.1
    9  WAIT 0.2
   10  VELO TIME=0.2 FORCE="0.001, 62.5, 50" LAST HIT=0.4
   11  WAIT 0.3
   12  PROJECTILE SPEED=0 ATTACK TYPE="Domain" STUN=1 CACHE=true POSITION="0, -3, 0" TIME=2 SIZE="6, 6, 6" PROJECTILE TAG="SpecialVFX"
      fx: FOV 20 over 1 s · Mesh (on SpecialVFX, 0.4 s) · Wind Expand (on SpecialVFX, 0.5 s) · Wind Expand (on SpecialVFX) · Clash (on SpecialVFX, 0.2 s) · Melee Trail (Left Leg, 0.5 s) · Melee Trail (Right Leg, 0.5 s)
   20  VELO TIME=0.2 FORCE="0.001, 60, 57"
      fx: sound 140549385369754 ×1.5
   22  SETMELEE COMBO=4 OFFSET=2.5
   23  WAIT 1
      fx: FOV 0 over 1 s

Branch "HitCheck"
    0  HITBOX DAMAGE=2 SINGLE TARGET=true CANCEL ENEMY=true STUN ANIM=true STUN=2 POSITION="0, 0, 2.5" IGNORE WAKEUP=true HIT RAGDOLL=true CAN KILL=true BRANCH TARGET="OnHitTarget" SIZE="9, 12, 10" ATTACK TYPE="Melee" BRANCH="OnHit" CLEAR KNOCKBACK=true BLOCKABLE=true
    1  STATE SpeedMultiplier = 0.2 for 0.6 s
    2  STATE NoDash = 0.2 for 0.6 s
    3  SETCD (its usual cooldown)
      fx: FOV 0 over 1 s
    5  ANIM [20,8] (MeiMei.Flock) FADE OUT=0.4
    6  WAIT 0.4
    7  VELO TIME=0.05 FORCE="0.001, 0.001, 0.001"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
