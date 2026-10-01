# Chase: dash into a run, awakened version

Tags: chase, dash, run, sprint, awakened, variant, cancel

A chase that dashes, checks for a hit, and if nobody's there turns into a
short run (a looped run animation and a steady forward VELO). Awakened, it's a
faster dash (`"0, 0, 85"`) with its own hit branches.

How it works:
- Line: `BRANCH Awakened` (ULT), else `BRANCH Base`.
- Base sets `Chase = True` for 1.5 s (the M1s read it to cancel into a punch,
  see m1-string-chase-cancel), dashes `"0, 0, 55"` for 0.8 s, then six hit
  checks 0.05 s apart.
- No hit: `ANIM "Psychic Run"` and `VELO "0, 0, 35"` for 1 s, looping ten
  0.1 s steps; each step first checks `CancelChase → DoNothing`, so an M1
  (or anything setting that flag) ends the run.
- `OnHit` / `Blocked` clear `Chase`, pin you, and knock or recoil.

Reuse it for: a dash that becomes a run; a loop another skill can stop with
a flag; awakened variants of a move.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### CHASE: "Chase"

Cooldown 6 · Properties: NOSTUN

```text
Line (runs on use)
    0  BRANCH → "Awakened"
    1  BRANCH → "Base"

Branch "Awakened" — only if ULT
    0  STATE SpeedMultiplier = 0.4 for 1.2 s (CANCEL ON END)
    1  STATE NoJump = 0.4 for 1.2 s (CANCEL ON END)
    2  STATE InSkill = 0.4 for 1.2 s (CANCEL ON END)
    3  ANIM [13,22] (Yuta.Melee.Chase) FADE OUT=0
      fx: sound 123389986399408 ×2 · sound 133755966655233
    6  VELO TRACK=true TIME=0.5 FADE=true FORCE="0, 0, 85"
      fx: Mesh (0.5 s) · Mesh (0.8 s) · Wind Expand (0.5 s) · FOV 20 over 1 s · Wind Streak (0.75 s) · Wind Streak (0.75 s) · Melee Trail (Right Arm) · Melee Trail (Left Arm) · Melee Trail (Right Leg) · Melee Trail (Left Leg)
   17  WAIT 0
      fx: Mesh (0.5 s)
   19  WAIT 0.1
   20  LOOP back 2 × 3
   21  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 9" BRANCH="HitCheckAwk" CAN KILL=false
   22  WAIT 0.05
   23  LOOP back 2 × 5
   24  STATE Stun for 0.36 s (CANCEL ON END)
      fx: FOV 0 over 2 s
   26  ANIM [13,22] (Yuta.Melee.Chase) FADE OUT=0
   27  WAIT 0.36

Branch "OnHit"
    0  TAG clear Chase
    1  STATE Stun for 0.2 s
    2  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
    3  VELO TIME=0.2 FORCE="0, 0, 20" LAST HIT=0.2 FADE=true
      fx: FOV 0 over 1 s · Melee Trail (Right Arm, 0.4 s) · Melee Trail (Left Arm, 0.4 s)
    7  ANIM [13,24] (Yuta.Melee.Down) FADE OUT=0 SPEED=1.75

Branch "OnHitTargetAwk"
      fx: sound 139795256698131 ×7 · sound 83754120506535 ×1.7 · Billboard (Head, 0.75 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.3 s) · Sparks (0.3 s) · Sparks (0.3 s) · Glow (0.2 s) · Glow (0.15 s) · Circle Glow (0.15 s) · Shake Light · Light (0.3 s) · Distortion (0.5 s) · Distortion (0.5 s)

Branch "BlockedAwk"
    0  TAG clear Chase
    1  STATE Stun for 0.75 s
    2  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
      fx: FOV 0 over 1 s · Melee Trail (Right Arm, 0.4 s)
    5  ANIM [13,22] (Yuta.Melee.Chase) FADE OUT=0

Branch "OnHitTarget"
      fx: sound 139795256698131 ×7 · Glow (0.15 s) · Mesh (0.4 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7

Branch "DoNothing"

Branch "Blocked"
    0  TAG clear Chase
    1  STATE Stun for 0.75 s
    2  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
      fx: FOV 0 over 1 s · Melee Trail (Right Arm, 0.4 s) · Melee Trail (Left Arm, 0.4 s)
    6  ANIM [13,24] (Yuta.Melee.Down) FADE OUT=0 SPEED=1.75

Branch "HitCheckAwk"
    0  HITBOX DAMAGE=4 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" CLEAR KNOCKBACK=true STUN=0.75 POSITION="0, 0, 4" STUN ANIM=true BRANCH TARGET="OnHitTargetAwk" HIT RAGDOLL=false SIZE="7, 7, 9" IGNORE WAKEUP=true BRANCH="OnHitAwk" CAN KILL=true
    1  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" HIT RAGDOLL=false SIZE="7, 7, 9" IGNORE WAKEUP=true BRANCH="BlockedAwk" CAN KILL=false

Branch "HitCheck"
    0  HITBOX DAMAGE=4 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" CLEAR KNOCKBACK=true STUN=0.75 POSITION="0, 0, 4" IGNORE WAKEUP=true HIT RAGDOLL=false CAN KILL=true BRANCH TARGET="OnHitTarget" BRANCH="OnHit" SIZE="7, 7, 9" STUN ANIM=true
    1  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=true HIT RAGDOLL=false CAN KILL=false BRANCH="Blocked" SIZE="7, 7, 9"

Branch "Base"
    0  STATE NoJump = 0.4 for 1.7 s (CANCEL ON END)
    1  STATE NoDash = 0.4 for 1.7 s (CANCEL ON END)
    2  STATE NoM1 = 0.4 for 0.7 s (CANCEL ON END)
    3  STATE InSkill for 0.4 s (CANCEL ON END)
    4  TAG set Chase = "True" for 1.5 s
    5  ANIM [15,38] (Mechamaru.AbsoluteDestructionAir) SPEED=1.5 FADE OUT=0
      fx: sound 123389986399408 ×2 · sound 133755966655233
    8  VELO TRACK=true TIME=0.8 FADE=true FORCE="0, 0, 55"
      fx: Mesh (0.5 s) · Mesh (0.8 s) · Wind Expand (0.5 s) · FOV 20 over 1 s · Wind Streak (0.75 s) · Wind Streak (0.75 s) · Melee Trail (Right Arm) · Melee Trail (Left Arm) · Melee Trail (Right Leg) · Melee Trail (Left Leg)
   19  WAIT 0
      fx: Mesh (0.5 s) · Afterimage
   22  WAIT 0.1
   23  LOOP back 3 × 3
   24  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=true HIT RAGDOLL=false CAN KILL=false BRANCH="HitCheck" SIZE="7, 7, 9"
   25  WAIT 0.05
   26  LOOP back 2 × 5
      fx: sound 133041752221324 ×1.5 · sound 123865446093601 ×0.4
   29  ANIM "Psychic Run" SPEED=1.2 FADE OUT=0.4
      fx: FOV 10 over 2 s
   31  TAG check CancelChase "True" → "DoNothing"
   32  VELO TRACK=true TIME=1 FORCE="0, 0, 35"
   33  TAG check CancelChase "True" → "DoNothing"
   34  WAIT 0.1
   35  LOOP back 2 × 10
      fx: FOV 0 over 2 s

Branch "OnHitAwk"
    0  STATE Stun for 0.2 s
    1  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
    2  VELO TIME=0.2 FORCE="0, 0, 20" LAST HIT=0.2 FADE=true
      fx: FOV 0 over 1 s · Melee Trail (Right Arm, 0.4 s)
    5  ANIM [13,22] (Yuta.Melee.Chase) FADE OUT=0
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
