# M1 string: base-game timing

Tags: m1, melee, combo, uppercut, downslam, knockback, block recoil

The four M1s, timed like JJS's own. Start here for any punch, slash or kick string.

How it works:
- Each hit: slow yourself (`SpeedMultiplier 0.75` 0.5 s, `NoJump`/`NoDash`
  0.4 s), play the swing, `WAIT 0.2`, then **two hitboxes in the same place**:
  the real one (3 damage, 0.75 s stun, blockable, → `OnHit`/`OnHitTarget`)
  and a 0-damage unblockable one → `Blocked`. The real hit moves the line on
  first, so `Blocked` only runs when the real one was blocked.
- `OnHit`: carry both of you forward a little (`VELO "0, 0, 10"` on you
  and on `LAST HIT`), then the rest of the swing.
- `Blocked`: a longer recovery (the anim at half speed, 0.3 s).
- Hit 4 is a finisher picking a variant by condition: `Up` (JUMP) uppercuts,
  `Down` (AIR) spikes them down, `Base` knocks back (`"0, 15, 23"`-ish,
  `RAGDOLL 1.2`). `NoM1` for 1.3 s ends the string.

Reuse it for: any 4-hit string; a finisher with air and jump versions; the
blocked-recoil trick (a second, unblockable detector after the real hit).

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `accurate-m1s-gon-freeccs.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### MELEE: "1"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.3 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "Base"
    0  ANIM [11,8] (Yuki.MeleeOld.Melee2)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Left Arm, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=3 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 STUN ANIM=true POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false SIZE="7, 7, 6" BRANCH="OnHit" CAN KILL=true IGNORE WAKEUP=false
    8  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0.7, 4" HIT RAGDOLL=false SIZE="7, 7, 6" BRANCH="Blocked" CAN KILL=false IGNORE WAKEUP=false
    9  WAIT 0.16

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [11,8] (Yuki.MeleeOld.Melee2) SPEED=0.5
    3  WAIT 0.3
```
### MELEE: "2"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  BRANCH → "Base"

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.3 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1

Branch "Base"
    0  ANIM [2,20] (Itadori.Melee.Melee1)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Arm, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=3 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false IGNORE WAKEUP=false CAN KILL=true BRANCH="OnHit" SIZE="7, 7, 6" STUN ANIM=true
    8  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0.7, 4" HIT RAGDOLL=false IGNORE WAKEUP=false CAN KILL=false BRANCH="Blocked" SIZE="7, 7, 6"
    9  WAIT 0.16

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [2,20] (Itadori.Melee.Melee1) SPEED=0.5
    3  WAIT 0.3
```
### MELEE: "3"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.3 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "Base"
    0  ANIM [8,23] (Todo.Melee.Melee3)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Left Arm, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=3 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 SIZE="7, 7, 6" POSITION="0, 0.7, 4" IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH TARGET="OnHitTarget" BRANCH="OnHit" STUN ANIM=true CAN KILL=true
    8  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 SIZE="7, 7, 6" POSITION="0, 0.7, 4" IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH="Blocked" CAN KILL=false
    9  WAIT 0.16

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [8,23] (Todo.Melee.Melee3) SPEED=0.5
    3  WAIT 0.3
```
### MELEE: "4"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  BRANCH → "Down"
    1  BRANCH → "Up"
    2  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.3 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1

Branch "OnHitUp"
    0  VELO TIME=0.2 FORCE="0, 36, 3" RAGDOLL=1.2 LAST HIT=0.2
      fx: Mesh
    2  WAIT 0.16

Branch "Up" — only if JUMP
    0  ANIM [1,17] (Gojo.Melee.Up)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Leg, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=4 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 CLEAR KNOCKBACK=true POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false STUN ANIM=true SIZE="7, 7, 6" BRANCH="OnHitUp" CAN KILL=true IGNORE WAKEUP=false
    8  ANIM [1,17] (Gojo.Melee.Up) SPEED=0.5
    9  STATE Stun for 0.75 s
   10  WAIT 0.8

Branch "Down" — only if AIR
    0  ANIM [1,18] (Gojo.Melee.Down)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Leg, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=4 CANCEL ENEMY=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 CAN KILL=true POSITION="0, -1, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="7, 12, 6" CLEAR KNOCKBACK=true STUN ANIM=true BRANCH="OnHitDown" IGNORE WAKEUP=true
    8  ANIM [1,18] (Gojo.Melee.Down) SPEED=0.5
    9  STATE Stun for 0.75 s
   10  WAIT 0.8

Branch "OnHitBase"
    0  VELO TIME=0.2 FORCE="0, 0, 40" RAGDOLL=1 LAST HIT=0.2
    1  WAIT 0.16

Branch "Base"
    0  ANIM [7,18] (Choso.Melee.Melee3)
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Leg, 0.4 s) · sound 101467914599270 ×2
    6  WAIT 0.2
    7  HITBOX DAMAGE=4 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1 DEBREE=2 POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false IGNORE WAKEUP=false CAN KILL=true BRANCH="OnHitBase" CLEAR KNOCKBACK=true SIZE="7, 7, 6" STUN ANIM=true
    8  ANIM [7,18] (Choso.Melee.Melee3) SPEED=0.5
    9  STATE Stun for 0.75 s
   10  WAIT 0.8

Branch "OnHitDown"
    0  VELO TIME=0.2 FORCE="0, -50, 3" RAGDOLL=1.2 LAST HIT=0.2
      fx: Mesh · Shake Light
    3  WAIT 0.16
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 4 skills.

```text
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
```
