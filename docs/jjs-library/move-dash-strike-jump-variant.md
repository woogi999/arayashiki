# Dash strike, with an upward version when jumping

Tags: dash, strike, detector, jump variant, anti-air, rebound, random sound, cooldown

A dash that hits the first one it reaches; used while jumping it goes up
instead. On hit you rebound back, and the cooldown depends on a tag the M1s
set.

How it works:
- Line: `BRANCH UpVariant` (JUMP), else `BRANCH random "V1, V2"`: one of
  two voice lines, each ending in `BRANCH Base`.
- Base: an effects anchor, stun 0.5 s, **`VELO "0, 15, 70"` TRACK**, then a
  detector ladder (hitbox → `HitCheck`, `WAIT 0.05`, `LOOP` × 9).
- UpVariant: the same with **`VELO "0, 60, 30"`** and a taller box →
  `UpHitCheck`.
- HitCheck: 7 damage, blockable, → `OnHit`: push them `"0, 2, 30"`,
  rebound yourself `"0, -10, -35"`, and
  `TAG check TotsugekiCD "Yes" → OnHitIncreasedCD`; otherwise
  `SETCD to 0.5` (a hit gives the move back almost at once).

Reuse it for: dash attacks, jump/air variants, rebounding off a hit,
cooldowns that depend on what you did before.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 3: "Totsugeki!"

Cooldown 6 · Properties: REP, AWK, KEEP

```text
Line (runs on use)
    0  ANIM [19,16] (Haruta.Melee.MeleeChase) FADE OUT=0.2
    1  WAIT 0.1
    2  BRANCH → "UpVariant"
    3  BRANCH random of "V1, V2"
    4  WAIT 0

Branch "UpVariant" — only if JUMP
    0  PROJECTILE SPEED=0 CONTINUE=true CACHE=true POSITION="0, -3, 0" SIZE="6, 6, 6" TIME=1 ATTACK TYPE="Domain" PROJECTILE TAG="Totsugeki"
      fx: sound 82891453696514 ×5 · sound 76755443877611 ×20 · FOV 20 over 1 s · Wind Expand (on Totsugeki) · Wind Expand (on Totsugeki) · Circle Glow (on Totsugeki, 0.2 s) · Sparks (on Totsugeki) · Clash (on Totsugeki, 0.7 s) · Clash (on Totsugeki, 0.7 s) · Mesh (on Totsugeki, 0.5 s)
   11  STATE Stun for 0.5 s
   12  STATE InSkill for 0.5 s
   13  STATE DirectionLock for 0.5 s
      fx: Flames (Right Leg, 0.35 s) · Mesh (tag "Dolphin", 0.1 s)
   16  VELO TIME=0.2 FORCE="0, 60, 30"
   17  ANIM [20,1] (MeiMei.BirdCall) FADE OUT=0.2 SPEED=0.8
      fx: Mesh (tag "Dolphin", 0.45 s)
   19  HITBOX DAMAGE=0 SINGLE TARGET=true CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 1, 5" HIT RAGDOLL=false IGNORE WAKEUP=false BRANCH="UpHitCheck" SIZE="7, 14, 10"
   20  WAIT 0.05
   21  LOOP back 2 × 9
      fx: FOV 0 over 1 s · Mesh (tag "Dolphin", 0.45 s)
   24  STATE NoM1 for 1.3 s
   25  ANIM [20,8] (MeiMei.Flock) FADE IN=0.2 FADE OUT=0.2

Branch "V1"
      fx: sound 125718343828728 ×1.3
    1  BRANCH → "Base"

Branch "V2"
      fx: sound 18844019899
    1  BRANCH → "Base"

Branch "OnHit"
      fx: FOV 0 over 1 s · Cancel "Dolphin" · Mesh (0.6 s)
    3  VELO RELATIVE FROM BRANCH=false TIME=0.2 FORCE="0, 2, 30" LAST HIT=1
    4  VELO TIME=0.2 FORCE="0, -10, -35"
    5  TAG check TotsugekiCD "Yes" → "OnHitIncreasedCD"
    6  SETCD to 0.5 s
    7  ANIM [9,2] (Locust.BugFlight) FADE OUT=0.3

Branch "OnHitIncreasedCD"
      fx: FOV 0 over 1 s
    1  STATE NoDash for 0.8 s
    2  ANIM [9,2] (Locust.BugFlight) FADE OUT=0.3

Branch "HitCheck"
    0  HITBOX DAMAGE=7 SINGLE TARGET=true CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.6 POSITION="0, -2, 5" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false SIZE="7, 12, 12" STUN ANIM=true BRANCH="OnHit" IGNORE WAKEUP=false
    1  STATE InSkill for 0.75 s
    2  STATE SpeedMultiplier = 0.3 for 0.75 s
      fx: FOV 0 over 1 s · Cancel "Dolphin" · Mesh (0.6 s)
    6  VELO RELATIVE FROM BRANCH=false TIME=0.2 FORCE="0, 2, 30" LAST HIT=1
    7  VELO TIME=0.2 FORCE="0, -10, -35"
    8  ANIM [6,1] (Mahito.BodyRepel) FADE OUT=0.3

Branch "OnHitTarget"
      fx: sound 77425156242780 ×0.65 · Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)

Branch "OnHitVariant"
      fx: Cancel "Dolphin" · Mesh (0.6 s) · FOV 0 over 1 s
    3  VELO TIME=0.2 LAST HIT=1 FORCE="0, 30, 4"
    4  VELO TIME=0.2 FORCE="0, 30, -10"
    5  SETCD to 2 s
    6  STATE NoM1 for 1.1 s
    7  STATE NoDash for 1 s
    8  ANIM [9,2] (Locust.BugFlight) FADE OUT=0.3

Branch "UpHitCheck"
    0  HITBOX DAMAGE=7 SINGLE TARGET=true CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.8 POSITION="0, 1, 5" CANCEL ENEMY=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false IGNORE WAKEUP=false BRANCH="OnHitVariant" STUN ANIM=true SIZE="7, 14, 10"
      fx: Cancel "Dolphin" · Mesh (0.6 s) · FOV 0 over 1 s
    4  VELO TIME=0.2 LAST HIT=1 FORCE="0, 30, 4"
    5  VELO TIME=0.2 FORCE="0, 30, -10"
    6  STATE NoM1 for 1.1 s
    7  STATE NoDash for 1 s
    8  STATE InSkill for 0.75 s
    9  STATE SpeedMultiplier = 0.3 for 0.75 s
   10  ANIM [6,1] (Mahito.BodyRepel) FADE OUT=0.3

Branch "Base"
    0  PROJECTILE SPEED=0 CONTINUE=true ATTACK TYPE="Domain" POSITION="0, -3, 0" SIZE="6, 6, 6" TIME=1 CACHE=true PROJECTILE TAG="Totsugeki"
      fx: sound 82891453696514 ×5 · FOV 20 over 1 s · Wind Expand (on Totsugeki) · Wind Expand (on Totsugeki) · Circle Glow (on Totsugeki, 0.2 s) · Sparks (on Totsugeki) · Clash (on Totsugeki, 0.7 s) · Clash (on Totsugeki, 0.7 s) · Mesh (on Totsugeki, 0.5 s)
   10  STATE Stun for 0.5 s
   11  STATE InSkill for 0.5 s
   12  STATE DirectionLock for 0.5 s
      fx: Flames (Right Leg, 0.35 s) · Mesh (tag "Dolphin", 0.1 s)
   15  VELO TRACK=true TIME=0.2 FORCE="0, 15, 70"
   16  ANIM [19,16] (Haruta.Melee.MeleeChase) FADE OUT=0.2 SPEED=0
      fx: Mesh (tag "Dolphin", 0.45 s)
   18  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, -2, 5" HIT RAGDOLL=false SIZE="7, 12, 12" BRANCH="HitCheck" IGNORE WAKEUP=false
   19  WAIT 0.05
   20  LOOP back 2 × 9
      fx: Mesh (tag "Dolphin", 0.2 s) · FOV 0 over 1 s
   23  ANIM [8,6] (Todo.ElbowDrop) FADE IN=0.3 FADE OUT=0.3 SPEED=0.2
   24  WAIT 0.1
   25  PROJECTILE SPEED=0 CONTINUE=true ATTACK TYPE="Domain" POSITION="0, -3, 0" SIZE="6, 6, 6" TIME=1 CACHE=true PROJECTILE TAG="TotsugekiEnd"
      fx: Wind Expand (tag "nil", on TotsugekiEnd) · Wind Expand (on TotsugekiEnd) · Circle Glow (on TotsugekiEnd, 0.2 s) · Sparks (on TotsugekiEnd) · Clash (on TotsugekiEnd, 0.7 s) · Clash (on TotsugekiEnd, 0.7 s) · Mesh (on TotsugekiEnd, 0.5 s)
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
