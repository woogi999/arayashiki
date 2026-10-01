# Grab, launch up, jump after them, slam down

Tags: grab, launch, air combo, jump, slam, spike, downslam, cutscene

A forward hit that, on contact, grabs them, launches them high, jumps up after
them and spikes them into the ground with a huge hitbox.

How it works:
- Line: lock yourself down 1.2 s (`NoM1`, `InSkill`, `NoSprint`, `NoJump`,
  `NoDash`, `DisableChase`, `SpeedMultiplier 0.2`), `WAIT 0.2`, lunge
  `"0, 0, 30"`, hitbox (2 damage, 1.5 s stun) → `OnHit`.
- OnHit: `GRAB` them 4 studs in front for 0.65 s, pin yourself, `IFrame` and
  stun 2 s, a slow wind-up anim, then a 4-damage hit and **launch them
  `VELO "0, 85, 30"` (TRUE RAGDOLL)**.
- Jump after them: an effects anchor, then **`VELO "0, 80, 70"` on yourself**,
  `WAIT 0.5`.
- Slam: a 20×30×30 hitbox (6 damage, 2 s stun) and **`VELO "0, -200, 90"` on
  them** (`LAST HIT 1`, `RAGDOLL 2`), with a shake and screen colours.

Reuse it for: launchers, air follow-ups, spiking someone down.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 2: "Overhead Kiss"

Cooldown 18 · Properties: NOCANCEL

```text
Line (runs on use)
      fx: sound 135965089902527 ×1.7 · Melee Trail (Left Arm)
    2  STATE NoM1 for 1.2 s
    3  STATE InSkill for 1.2 s
    4  STATE NoSprint for 1.2 s
    5  STATE NoJump for 1.2 s
    6  STATE NoDash for 1.2 s
    7  STATE DisableChase for 1.2 s
    8  STATE SpeedMultiplier = 0.2 for 1.2 s
    9  ANIM [2,21] (Itadori.Melee.Melee2) FADE OUT=0.3 SPEED=1.2
   10  WAIT 0.2
   11  VELO TRACK=true TIME=0.2 FORCE="0, 0, 30" FADE=true
      fx: Whirl Slash
   13  HITBOX DAMAGE=2 BLOCKABLE=false STUN=1.5 BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="9, 12, 11" BRANCH="OnHit" CLEAR KNOCKBACK=true
   14  ANIM [2,21] (Itadori.Melee.Melee2) FADE OUT=0.3

Branch "OnHitTargetMassive"
      fx: sound 82923924208217 ×0.7 · Melee Trail · Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)

Branch "OnHit"
      fx: sound 130523338620564 ×1.3 · sound 91141689302916
    2  GRAB POSITION="0, 0, 4" TIME=0.65 LAST HIT=1
    3  VELO RELATIVE FROM BRANCH=false TIME=1.1 FORCE="0.001, 0.001, 0.001"
    4  STATE Stun for 2 s
    5  STATE IFrame for 2 s
    6  STATE InSkill for 2 s
      fx: FOV -30 over 2 s · Overlay (0.7 s) · Star (Head, 0.7 s) · Shine (Head, 0.7 s)
   11  ANIM [20,16] (MeiMei.Melee.Up) FADE OUT=0 SPEED=0.2
   12  WAIT 0.7
   13  STATE DirectionLock for 1.7 s
      fx: Melee Trail (Right Arm, 0.5 s) · Overlay (0.3 s)
   16  HITBOX DAMAGE=4 SINGLE TARGET=true CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.5 DEBREE=2 POSITION="0, 0, 4" CLEAR KNOCKBACK=true BRANCH TARGET="OnHitTargetHeavy" HIT RAGDOLL=true SIZE="10, 10, 10" STUN ANIM=true CANCEL ENEMY=true IGNORE WAKEUP=true
   17  VELO TIME=0.2 TRUE RAGDOLL=true FORCE="0, 85, 30" RAGDOLL=1 LAST HIT=1
   18  ANIM [20,16] (MeiMei.Melee.Up) FADE OUT=0
      fx: Whirl Slash · FOV 0 over 1 s
   21  WAIT 0.33
   22  PROJECTILE SPEED=0 CONTINUE=true IGNORE WAKEUP=true POSITION="0, -3, 0" ATTACK TYPE="Domain" TIME=1 CACHE=true PROJECTILE TAG="OKiss" SIZE="6, 6, 6"
   23  ANIM [4,2] (Megumi.GreatSerpent) FADE OUT=0 SPEED=2
   24  WAIT 0.2
      fx: sound 138488212707530 ×2 · FOV 20 over 0.4 s · Mesh (on OKiss, 0.4 s) · Wind Expand (on OKiss, 0.5 s) · 360 Wind (on OKiss, 0.5 s) · Wind Expand (on OKiss) · Clash (on OKiss, 0.1 s) · Clash (on OKiss, 0.2 s) · Melee Trail (Left Leg, 0.5 s) · Melee Trail (Right Leg, 0.5 s)
   35  VELO TIME=0.2 FORCE="0, 80, 70" LAST HIT=0
   36  ANIM [20,3] (MeiMei.Bounding) FADE OUT=0
   37  WAIT 0.5
      fx: sound 103995877001414 ×1.7
   39  HITBOX DAMAGE=6 SINGLE TARGET=true CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=2 POSITION="0, -2, 7" CLEAR KNOCKBACK=true BRANCH TARGET="OnHitTargetMassive" HIT RAGDOLL=true SIZE="20, 30, 30" STUN ANIM=true CANCEL ENEMY=true IGNORE WAKEUP=true
   40  VELO TIME=0.1 FORCE="0, -200, 90" RAGDOLL=2 LAST HIT=1
   41  VELO TIME=0.2 FORCE="0, 0, 40"
      fx: FOV 0 over 2 s · Shake Medium · Screen Color (0.05 s) · Screen Color (0.05 s) · Whirl Slash · Whirl Slash · 360 Wind (0.2 s) · 360 Wind (0.2 s)
   50  ANIM [20,17] (MeiMei.Melee.Down) FADE OUT=0 SPEED=1.5

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65 · Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)
    5  ANIM [19,10] (Haruta.Hand.JawbreakerVictim)

Branch "OnHitTargetHeavy"
      fx: sound 77425156242780 ×0.65 · Melee Trail · Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
