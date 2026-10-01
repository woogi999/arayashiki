# M1 string: cancels the chase into a punch

Tags: m1, melee, combo, chase cancel, dash cancel, tags

Four M1s like the base game's, plus a link with this moveset's chase: pressing
M1 during the chase stops the run and punches straight away.

How it works:
- The chase sets `Chase = True` while it runs. M1 1 starts with
  `TAG check Chase "True" → CancelChase`, which stops you (a small VELO),
  sets `CancelChase = True` (the chase's run loop checks it and ends) and
  clears `Chase`, then does the punch.
- `CancelChase` is this character's "stop running" signal: the chase's run
  loop checks it every step and jumps to its empty `DoNothing` branch, which
  ends the run. Its skills set it on use too. (The M1s' own
  `check CancelChase → DoNothing` does nothing: they have no such branch.)
- Hits use particles for their hit effects rather than visuals.
- Hit 4 is Downslam (AIR) / Uppercut (JUMP) / Base, as in the base game.

Reuse it for: letting one move interrupt another (a flag the other checks
each loop), dash-into-attack links.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### MELEE: "1"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  TAG check Chase "True" → "CancelChase"
    1  BRANCH → "Base"
    2  WAIT 0

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.15 s) · Billboard (0.2 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [4,15] (Megumi.Melee.Melee1) FADE OUT=0 SPEED=0.5
    3  WAIT 0.3

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "Base"
    0  TAG check CancelChase "True" → "DoNothing"
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Arm, 0.4 s) · sound 101467914599270 ×2
    6  ANIM [4,15] (Megumi.Melee.Melee1) FADE OUT=0
    7  WAIT 0.2
    8  HITBOX DAMAGE=3 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0.7, 4" STUN ANIM=true IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 6" BRANCH TARGET="OnHitTarget" BRANCH="OnHit" CAN KILL=true
    9  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0.7, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 6" BRANCH="Blocked" CAN KILL=false
   10  WAIT 0.14

Branch "CancelChase"
    0  VELO TIME=0.4 FORCE="0.001, 0, 20" FADE=true
    1  TAG set CancelChase = "True" for 1 s
    2  TAG clear Chase
    3  BRANCH → "Base"
```
### MELEE: "2"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  TAG check Chase "True" → "CancelChase"
    1  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.15 s) · Billboard (0.2 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [4,16] (Megumi.Melee.Melee2) FADE OUT=0 SPEED=0.5
    3  WAIT 0.3

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "Base"
    0  TAG check CancelChase "True" → "DoNothing"
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Left Arm, 0.4 s) · sound 101467914599270 ×2
    6  ANIM [4,16] (Megumi.Melee.Melee2) FADE OUT=0
    7  WAIT 0.2
    8  HITBOX DAMAGE=3 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" IGNORE WAKEUP=false HIT RAGDOLL=false CAN KILL=true BRANCH="OnHit" SIZE="7, 7, 6"
    9  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0.7, 4" CAN KILL=false IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 6" BRANCH="Blocked"
   10  WAIT 0.14

Branch "CancelChase"
    0  VELO TIME=0.4 FORCE="0.001, 0, 20" FADE=true
    1  TAG set CancelChase = "True" for 1 s
    2  TAG clear Chase
    3  BRANCH → "Base"
```
### MELEE: "3"

Cooldown (none) · Properties: none

```text
Line (runs on use)
    0  TAG check Chase "True" → "CancelChase"
    1  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 75771399170221 ×1.7 · Glow (0.15 s) · Billboard (0.2 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7

Branch "Blocked"
    0  STATE NoJump for 0.5 s
    1  STATE NoDash for 0.3 s
    2  ANIM [4,17] (Megumi.Melee.Melee3) FADE OUT=0 SPEED=0.5
    3  WAIT 0.3

Branch "OnHit"
    0  VELO TIME=0.2 FORCE="0, 0, 10"
    1  VELO TIME=0.2 FORCE="0, 0, 10" LAST HIT=0.1
    2  WAIT 0.14

Branch "Base"
    0  TAG check CancelChase "True" → "DoNothing"
    1  STATE NoJump for 0.4 s
    2  STATE NoDash for 0.4 s
    3  STATE SpeedMultiplier = 0.75 for 0.5 s
      fx: Melee Trail (Right Arm, 0.4 s) · sound 101467914599270 ×2
    6  ANIM [4,17] (Megumi.Melee.Melee3) FADE OUT=0
    7  WAIT 0.2
    8  HITBOX SIZE="7, 7, 6" SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0.7, 4" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false DAMAGE=5 BRANCH="OnHit" IGNORE WAKEUP=false
    9  HITBOX DAMAGE=0 BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0.7, 4" IGNORE WAKEUP=false HIT RAGDOLL=false CAN KILL=false BRANCH="Blocked" SIZE="7, 7, 6"
   10  WAIT 0.14

Branch "CancelChase"
    0  VELO TIME=0.4 FORCE="0.001, 0, 20" FADE=true
    1  TAG set CancelChase = "True" for 1 s
    2  TAG clear Chase
    3  BRANCH → "Base"
```
### MELEE: "4"

Cooldown (none) · Properties: NOSTUN

```text
Line (runs on use)
    0  TAG check CancelChase "True" → "DoNothing"
    1  VELO TIME=0.001 FORCE="0.001, 0, 0.001"
    2  BRANCH → "Downslam"
    3  BRANCH → "Uppercut"
    4  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 96359585058783 ×1.2 · Glow (0.15 s) · Billboard (0.2 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7 · Melee Trail (Torso) · Melee Trail (Right Arm) · Melee Trail (Left Arm) · Melee Trail (Right Leg) · Melee Trail (Left Leg)

Branch "Downslam" — only if AIR
    0  STATE Stun for 0.4 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.5 s
    4  STATE NoDash for 0.5 s
      fx: Melee Trail (Right Leg) · sound 101467914599270 ×2
    7  ANIM [1,18] (Gojo.Melee.Down) FADE OUT=0
    8  WAIT 0.2
    9  HITBOX SIZE="7, 12, 6" SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 STUN ANIM=true POSITION="0, 0, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true DAMAGE=4 IGNORE WAKEUP=true BRANCH="OnHitDownslam" CAN KILL=true
   10  WAIT 1

Branch "OnHitDownslam"
    0  VELO TIME=0.2 FORCE="0, -50, 5" RAGDOLL=1.2 LAST HIT=0.1
      fx: Mesh · Shake Light
    3  WAIT 1

Branch "Uppercut" — only if JUMP
    0  STATE Stun for 0.3 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.5 s
    4  STATE NoDash for 0.5 s
      fx: Melee Trail (Left Leg, 0.3 s) · sound 101467914599270 ×2
    7  ANIM [3,16] (Hakari.Melee.Up) FADE OUT=0
    8  WAIT 0.2
    9  HITBOX SIZE="7, 7, 6" SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 IGNORE WAKEUP=false POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false STUN ANIM=true CAN KILL=true DAMAGE=4
   10  VELO TIME=0.2 FORCE="0, 36, 2" RAGDOLL=1.2 LAST HIT=0.1
      fx: Mesh
   12  WAIT 1

Branch "Base" — only if not AIR and not JUMP
    0  STATE Stun for 0.4 s
    1  STATE NoM1 for 1.3 s
    2  STATE SpeedMultiplier = 0 for 0.8 s
    3  STATE NoJump for 0.5 s
    4  STATE NoDash for 0.5 s
      fx: Melee Trail (Right Leg, 0.3 s) · sound 101467914599270 ×2
    7  ANIM [2,23] (Itadori.Melee.Melee4) FADE OUT=0
    8  WAIT 0.2
    9  HITBOX SIZE="7, 7, 6" SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 DEBREE=2 POSITION="0, 0.7, 4" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false CAN KILL=true STUN ANIM=true IGNORE WAKEUP=false DAMAGE=4
   10  VELO TIME=0.2 FORCE="0, 15, 23" RAGDOLL=1.2 LAST HIT=0.1
   11  WAIT 1
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 4 skills.

```text
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
```
