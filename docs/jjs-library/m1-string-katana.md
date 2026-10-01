# M1 string: katana, drawn on the first swing

Tags: m1, melee, sword, weapon, sheath, combo, 3-hit

A three-hit sword string that works with passive-auto-sheath: every swing sets
`UseKatana = True` for 4 s, so the passive draws the blade and puts it away
once you stop. Hit 1 has an "unsheath" version when the blade isn't out yet.

How it works:
- M1 1: `TAG check UseKatana "True" → Base`, otherwise `UnsheathVariant`
  (a draw-slash animation). Both set `UseKatana` and deal 3 damage, with the
  usual unblockable `Blocked` detector.
- Swings also set `IsAttacking = True` for 1.5 s; the skills read it to
  continue the string (`SETMELEE` in move-katana-slash-with-stacks).
- M1 3 is the finisher: Downslam (AIR), Uppercut (not AIR, JUMP), Base, each
  with its own blocked recoil (`BlockedUppercut`, `BlockedBase`).

Reuse it for: weapon strings, a first hit that differs when the weapon is
away, 3-hit strings.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### MELEE: "1"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  TAG check UseKatana "True" → "Base"
    1  BRANCH → "UnsheathVariant"

Branch "OnHitTarget"
      fx: sound 127083126906441 ×1.5 · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s)

Branch "Blocked"
    0  ANIM [13,18] (Yuta.Melee.Melee1) FADE OUT=0.2 FADE IN=0.05 SPEED=0.5
    1  STATE NoJump for 0.4 s
      fx: sound 7029643523 ×0.7 · Sparks (0.2 s) · Energy Sparks (0.05 s) · Circle Glow (0.1 s)
    6  WAIT 0.31

Branch "UnsheathVariant"
    0  STATE NoJump for 0.4 s
    1  STATE NoDash for 0.4 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [13,18] (Yuta.Melee.Melee1) FADE OUT=0
      fx: sound 140203539654892 ×3 · sound 129132458685715 ×1.4
    6  WAIT 0.2
    7  TAG set UseKatana = "True" for 4 s
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   15  HITBOX DAMAGE=3 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false CANCEL ENEMY=true BRANCH="OnHit" SIZE="9, 9, 7" BRANCH TARGET="OnHitTarget" STUN ANIM=true
   16  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH="Blocked" SIZE="9, 9, 7"
   17  WAIT 0.16

Branch "OnHit"
    0  VELO TRACK=true TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.2
    2  WAIT 0.16

Branch "Base"
    0  STATE NoJump for 0.44 s
    1  STATE NoDash for 0.44 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [19,11] (Haruta.Melee.Melee1) FADE OUT=0
      fx: sound 129132458685715 ×1.4
    5  WAIT 0.2
    6  TAG set UseKatana = "True" for 4 s
    7  TAG set IsAttacking = "True" for 1.5 s
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   15  HITBOX DAMAGE=3 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" CANCEL ENEMY=true IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH TARGET="OnHitTarget" STUN ANIM=true BRANCH="OnHit" SIZE="9, 9, 7"
   16  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH="Blocked" SIZE="9, 9, 7"
   17  WAIT 0.16
```
### MELEE: "2"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 90072340210870 ×1.5 · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s)

Branch "OnHit"
    0  VELO TRACK=true TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.2
    2  WAIT 0.16

Branch "Base"
    0  STATE NoJump for 0.44 s
    1  STATE NoDash for 0.44 s
    2  STATE SpeedMultiplier = 0.75 for 0.5 s
    3  ANIM [23,10] (Kurourushi.Melee.Melee3) FADE OUT=0
      fx: sound 129132458685715 ×1.4
    5  WAIT 0.2
    6  TAG set UseKatana = "True" for 4 s
    7  TAG set IsAttacking = "True" for 1.5 s
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   15  HITBOX DAMAGE=3 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false SIZE="9, 9, 7" STUN ANIM=true BRANCH="OnHit" IGNORE WAKEUP=false CANCEL ENEMY=true
   16  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" HIT RAGDOLL=false SIZE="9, 9, 7" BRANCH="Blocked" IGNORE WAKEUP=false
   17  WAIT 0.16

Branch "Blocked"
    0  ANIM [23,10] (Kurourushi.Melee.Melee3) SPEED=0.5
    1  STATE NoJump for 0.4 s
      fx: sound 7029643523 ×0.7 · Sparks (0.2 s) · Energy Sparks (0.05 s) · Circle Glow (0.1 s)
    6  WAIT 0.31
```
### MELEE: "3"

Cooldown (none) · Properties: NOSTUN

```text
Line (runs on use)
    0  BRANCH → "Downslam"
    1  BRANCH → "Uppercut"
    2  BRANCH → "Base"

Branch "Downslam" — only if AIR
    0  STATE Stun for 0.4 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.6 s
    4  STATE NoDash for 0.6 s
    5  ANIM [13,24] (Yuta.Melee.Down)
      fx: sound 129132458685715 ×1.4
    7  WAIT 0.2
    8  TAG set UseKatana = "True" for 4 s
    9  TAG clear IsAttacking
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   17  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, -2, 4" CANCEL ENEMY=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true STUN ANIM=true IGNORE WAKEUP=true BRANCH="OnHitDownslam" SIZE="9, 13, 7" CLEAR KNOCKBACK=true
   18  WAIT 1

Branch "OnHitDownslam"
    0  VELO TIME=0.2 FORCE="0, -30, 7" RAGDOLL=1.2 LAST HIT=0.2
      fx: Shake Light · Mesh
    3  WAIT 1

Branch "OnHitBase"
    0  VELO TIME=0.2 FORCE="0, 5, 30" RAGDOLL=1.2 LAST HIT=0.2
    1  WAIT 1

Branch "BlockedUppercut"
    0  ANIM [13,23] (Yuta.Melee.Up) SPEED=0.5
      fx: sound 7029643523 ×0.7 · Sparks (0.2 s) · Energy Sparks (0.05 s) · Circle Glow (0.1 s)
    5  WAIT 1

Branch "OnHitTarget"
      fx: sound 87776360409294 ×1.5 · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s) · Flames (0.5 s)

Branch "OnHitUppercut"
    0  VELO TIME=0.2 FORCE="0, 35, 3" RAGDOLL=1.2 LAST HIT=0.2
      fx: Mesh
    2  WAIT 1

Branch "BlockedBase"
    0  ANIM [17,16] (Nanami.Melee.Melee4) SPEED=0.5
      fx: sound 7029643523 ×0.7 · Sparks (0.2 s) · Energy Sparks (0.05 s) · Circle Glow (0.1 s)
    5  WAIT 1

Branch "Base"
    0  STATE Stun for 0.4 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.6 s
    4  STATE NoDash for 0.6 s
    5  ANIM [13,20] (Yuta.Melee.Melee3) FADE OUT=0
      fx: sound 129132458685715 ×1.4
    7  WAIT 0.2
    8  TAG set UseKatana = "True" for 4 s
    9  TAG clear IsAttacking
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   17  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, 1, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false SIZE="9, 7, 7" STUN ANIM=true BRANCH="OnHitBase" IGNORE WAKEUP=true CANCEL ENEMY=true
   18  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 1, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="9, 7, 7" BRANCH="BlockedBase"
   19  WAIT 1

Branch "Uppercut" — only if not AIR and JUMP
    0  STATE Stun for 0.4 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.6 s
    4  STATE NoDash for 0.6 s
    5  ANIM [20,16] (MeiMei.Melee.Up)
      fx: sound 129132458685715 ×1.4
    7  WAIT 0.2
    8  TAG set UseKatana = "True" for 4 s
    9  TAG clear IsAttacking
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (2 s) · Slash (0.8 s)
   17  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, 1, 4" IGNORE WAKEUP=true HIT RAGDOLL=false CANCEL ENEMY=true BRANCH="OnHitUppercut" BRANCH TARGET="OnHitTarget" STUN ANIM=true SIZE="9, 7, 7"
   18  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" SIZE="9, 9, 7" HIT RAGDOLL=false IGNORE WAKEUP=false BRANCH="BlockedUppercut"
   19  WAIT 1
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 3 skills.

```text
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
```
