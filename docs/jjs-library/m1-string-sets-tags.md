# M1 string: hits feed other skills (tags)

Tags: m1, melee, combo, passive trigger, cooldown link, VAR

Four M1s whose hits set tags other skills read: `ApplyPassive = Yes` and
`TotsugekiCD = Yes` in every `OnHit`. The dash strike
(move-dash-strike-jump-variant) checks `TotsugekiCD` on its own hit to take
a longer cooldown path.

How it works:
- Same shape as the base game: slow down, swing, `WAIT 0.2`, real hitbox
  (3 damage, 0.75 s stun) and an unblockable `Blocked` detector.
- The M1s carry `VAR "Skill1Able"`: while that tag is active the M1s can be
  used on cooldown and through stun (the Variant property).
- Hit 4 picks Base (not AIR, not JUMP), Downslam (AIR), Uppercut (JUMP).
  Downslam's `OnHitDownslam` spikes them with `VELO "0, -100, 20"`.

Reuse it for: moves that change once you've landed M1s (combo-dependent
enhancements), marking hits for a passive to react to.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### MELEE: "1"

Cooldown (none) · Properties: REP, VAR="Skill1Able", AWK, KEEP

```text
Line (runs on use)
    0  STATE NoDash for 0.4 s
    1  STATE NoJump for 0.4 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [6,29] (Mahito.Variants.MeleeClub.Melee2) SPEED=2.3
      fx: Melee Trail (Left Arm, 0.33 s)
    5  WAIT 0.2
      fx: sound 134420729993623 · Mesh (0.2 s) · Mesh (0.2 s) · Wind Expand (0.4 s) · Energy Sparks (0.1 s) · Sparks (0.2 s)
   12  HITBOX DAMAGE=3 STUN=0.75 POSITION="0, 0.8, 4.5" IGNORE WAKEUP=false BRANCH TARGET="OnHitTarget" SIZE="8, 8, 9" BRANCH="OnHit" STUN ANIM=true
   13  HITBOX DAMAGE=0 BLOCKABLE=false STUN=0 POSITION="0, 0.8, 4.5" CAN KILL=false IGNORE WAKEUP=false SIZE="8, 8, 9" BRANCH="Blocked"
   14  WAIT 0.14

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)

Branch "OnHit"
    0  TAG set ApplyPassive = "Yes" for 1 s
    1  TAG set TotsugekiCD = "Yes" for 1 s
    2  VELO TIME=0.2 FORCE="0, 0, 15" FADE=true
    3  VELO TIME=0.2 FORCE="0, 0, 15" LAST HIT=1 FADE=true
    4  WAIT 0.14

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [6,29] (Mahito.Variants.MeleeClub.Melee2) SPEED=1.15 FADE OUT=0
    3  WAIT 0.3
```
### MELEE: "2"

Cooldown (none) · Properties: REP, VAR="Skill1Able", AWK, KEEP

```text
Line (runs on use)
    0  STATE NoDash for 0.4 s
    1  STATE NoJump for 0.4 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [20,12] (MeiMei.Melee.Melee1)
      fx: Melee Trail (Right Arm, 0.33 s)
    5  WAIT 0.2
      fx: sound 138360859882473 · Whirl Slash
    8  HITBOX DAMAGE=3 STUN=0.75 POSITION="0, 0.8, 4.5" BRANCH TARGET="OnHitTarget" IGNORE WAKEUP=false SIZE="8, 8, 9" BRANCH="OnHit" STUN ANIM=true
    9  HITBOX SIZE="8, 8, 9" CAN KILL=false BLOCKABLE=false STUN=0 POSITION="0, 0.8, 4.5" IGNORE WAKEUP=false DAMAGE=0 BRANCH="Blocked"
   10  WAIT 0.14

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)

Branch "OnHit"
    0  TAG set ApplyPassive = "Yes" for 1 s
    1  TAG set TotsugekiCD = "Yes" for 1 s
    2  VELO TIME=0.2 FORCE="0, 0, 15" FADE=true
    3  VELO TIME=0.2 FORCE="0, 0, 15" LAST HIT=1 FADE=true
    4  WAIT 0.14

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [20,12] (MeiMei.Melee.Melee1) FADE OUT=0 SPEED=0.5
    3  WAIT 0.3
```
### MELEE: "3"

Cooldown (none) · Properties: REP, VAR="Skill1Able", AWK, KEEP

```text
Line (runs on use)
    0  STATE NoDash for 0.4 s
    1  STATE NoJump for 0.4 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [20,13] (MeiMei.Melee.Melee2)
      fx: Melee Trail (Right Arm, 0.33 s)
    5  WAIT 0.2
      fx: sound 138360859882473 · Whirl Slash
    8  HITBOX SIZE="8, 8, 9" STUN=0.75 POSITION="0, 0.8, 4.5" IGNORE WAKEUP=false BRANCH TARGET="OnHitTarget" DAMAGE=3 BRANCH="OnHit" STUN ANIM=true
    9  HITBOX SIZE="8, 8, 9" CAN KILL=false BLOCKABLE=false STUN=0 POSITION="0, 0.8, 4.5" IGNORE WAKEUP=false DAMAGE=0 BRANCH="Blocked"
   10  WAIT 0.14

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)

Branch "OnHit"
    0  TAG set ApplyPassive = "Yes" for 1 s
    1  TAG set TotsugekiCD = "Yes" for 1 s
    2  VELO TIME=0.2 FORCE="0, 0, 15" FADE=true
    3  VELO TIME=0.2 FORCE="0, 0, 15" LAST HIT=1 FADE=true
    4  WAIT 0.14

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [20,13] (MeiMei.Melee.Melee2) FADE OUT=0 SPEED=0.5
    3  WAIT 0.3
```
### MELEE: "4"

Cooldown (none) · Properties: REP, VAR="Skill1Able", AWK, NOSTUN, KEEP

```text
Line (runs on use)
    0  BRANCH → "Base"
    1  BRANCH → "Downslam"
    2  BRANCH → "Uppercut"

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Melee Trail · Shake Light

Branch "Downslam" — only if AIR
    0  STATE SpeedMultiplier = 0 for 1 s
    1  STATE Stun for 0.6 s
    2  STATE NoDash for 0.4 s
    3  STATE NoJump for 0.4 s
    4  ANIM [20,17] (MeiMei.Melee.Down)
      fx: Melee Trail (Right Arm, 0.33 s)
    6  WAIT 0.2
      fx: sound 138360859882473 · Whirl Slash
    9  HITBOX DAMAGE=4 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, -2, 4.5" IGNORE WAKEUP=true HIT RAGDOLL=true STUN ANIM=true SIZE="8, 12, 9" CAN KILL=false BRANCH="OnHitDownslam" BRANCH TARGET="OnHitTarget"
   10  STATE NoM1 for 1 s
   11  STATE Stun for 1 s
   12  ANIM [20,17] (MeiMei.Melee.Down) SPEED=0.7
   13  WAIT 0.7

Branch "OnHitUppercut"
    0  VELO TIME=0.2 FORCE="0, 40, 2" RAGDOLL=1.2 LAST HIT=1
      fx: Mesh · Shake Light
    3  STATE NoM1 for 1 s
    4  WAIT 0.7

Branch "Uppercut" — only if JUMP
    0  STATE SpeedMultiplier = 0 for 1 s
    1  STATE Stun for 0.6 s
    2  STATE NoDash for 0.4 s
    3  STATE NoJump for 0.4 s
    4  ANIM [20,16] (MeiMei.Melee.Up)
      fx: Melee Trail (Right Arm, 0.33 s)
    6  WAIT 0.2
      fx: sound 138360859882473 · Whirl Slash
    9  HITBOX DAMAGE=4 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, 0.8, 4.5" SIZE="8, 8, 9" IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH TARGET="OnHitTarget" BRANCH="OnHitUppercut" STUN ANIM=true CAN KILL=true
   10  STATE NoM1 for 1 s
   11  STATE Stun for 1 s
   12  ANIM [20,16] (MeiMei.Melee.Up) SPEED=0.3
   13  WAIT 0.7

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 2, 30" RAGDOLL=1.2 LAST HIT=1
      fx: Shake Light
    2  WAIT 0.2
    3  ANIM [16,13] (Naoya.MoonPalace) FADE OUT=0.3
    4  STATE NoM1 for 1 s
    5  WAIT 0.5

Branch "Base" — only if not AIR and not JUMP
    0  VELO TRACK=true TIME=0.3 FADE=true FORCE="0, 0, 40"
    1  STATE SpeedMultiplier = 0 for 1 s
    2  STATE Stun for 0.6 s
    3  ANIM [6,4] (Mahito.DrillSplit) FADE OUT=0.3
      fx: Melee Trail (Left Leg, 0.33 s) · Melee Trail (Right Leg, 0.33 s)
    6  WAIT 0.2
      fx: sound 137298186656357 · Energy Sparks (0.2 s) · Sparks (0.24 s) · Wind Expand (0.4 s) · Mesh (1.5 s) · Mesh (0.2 s)
   13  HITBOX SIZE="8, 8, 9" CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, 0.8, 4.5" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false STUN ANIM=true DAMAGE=4 BRANCH="OnHit" IGNORE WAKEUP=false
   14  WAIT 0.2
   15  ANIM [16,13] (Naoya.MoonPalace) SPEED=0.7 FADE OUT=0.3
   16  STATE NoM1 for 1 s
   17  STATE Stun for 1 s
   18  WAIT 1

Branch "OnHitDownslam"
    0  VELO TIME=0.2 FORCE="0, -100, 20" RAGDOLL=1.2 LAST HIT=1
      fx: Mesh · Shake Light
    3  STATE NoM1 for 1 s
    4  WAIT 0.7
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 4 skills.

```text
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
```
