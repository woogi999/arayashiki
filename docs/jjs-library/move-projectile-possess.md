# Special: a homing projectile whose hit takes over the target

Tags: special, projectile, homing, summon, target branch, damage over time, hpgib, possession

Throw a slow homing projectile. Whoever it hits runs a long branch themselves:
they're stunned, act out a scripted sequence of animations, and lose health
twice.

How it works:
- Dimple: stun 0.65 s, then `PROJECTILE` `SPEED 35`, `ATTACK TYPE "Swarm"`,
  **`AIM LAST HIT 10`**, **`BRANCH TARGET "Possess"`**.
- Possess runs **on the one hit** (a `BRANCH TARGET` branch is run by them):
  stun and `DirectionLock` 4 s, several animations with waits, and two
  **`HPGIB`** (Add Health, -2 each) with small knockbacks. HPGIB changes the
  health of whoever runs it: here, theirs.
- `Awakened` (ULT) exists but is empty.

Reuse it for: debuffs, bleeds and curses (a target branch with waits),
damage that goes through blocks (`HPGIB` in a target branch), making them
play animations.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SPECIAL: "Assist"

Cooldown 25 · Properties: NOCANCEL

```text
Line (runs on use)
    0  BRANCH → "Awakened"
    1  BRANCH → "Dimple"

Branch "Possess"
    0  STATE Stun for 4 s
    1  STATE DirectionLock for 4 s
      fx: sound 126169967152516 ×5 · sound 131541868159787 · sound 140545058424460 · Mesh (Head, 4 s) · Billboard (0.6 s) · Clash (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.2 s) · Sparks (0.4 s) · 360 Wind (0.4 s) · Wind Expand · Whirl Slash (0.5 s) · Distortion (0.5 s) · Distortion (0.5 s) · Glow (0.1 s) · Glow (0.4 s) · Light · Light (4 s) · Circle Glow (0.5 s) · Shake Light
   23  ANIM [15,25] (Mechamaru.Absolute.Stagger) FADE OUT=0.4
   24  WAIT 0.68
   25  ANIM [15,25] (Mechamaru.Absolute.Stagger) FADE OUT=0.2
   26  WAIT 0.49
      fx: Melee Trail (Right Arm, 0.4 s) · Melee Trail (Left Arm, 0.4 s)
   29  ANIM [6,16] (Mahito.Ultimate) FADE OUT=0
   30  WAIT 0.56
   31  HPGIB CAN KILL=true AMOUNT=-2
   32  VELO RELATIVE FROM BRANCH=false TIME=0.4 FORCE="0, 0, -10" FADE=true
      fx: Shake Medium · sound 140712924060867 ×5 · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s)
   42  ANIM [17,5] (Nanami.StabilizeTarget) FADE OUT=0.2
   43  WAIT 1.23
   44  ANIM [2,20] (Itadori.Melee.Melee1) FADE OUT=0.2 SPEED=0.5
      fx: Melee Trail (Right Arm, 0.4 s)
   46  WAIT 0.3
   47  ANIM [1,11] (Gojo.Ultimate) FADE OUT=0.2 SPEED=3
   48  WAIT 0.1
   49  HPGIB CAN KILL=true AMOUNT=-2
   50  VELO RELATIVE FROM BRANCH=false TIME=0.2 FORCE="0, 2, -20"
      fx: Shake Medium · Mesh (2 s) · Light (0.4 s) · sound 137848807573884 ×5 · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s)
   62  ANIM [4,12] (Megumi.ShadowSwarmHit) SPEED=0.5
   63  WAIT 0.18
   64  VELO RELATIVE FROM BRANCH=false TIME=0.1 FORCE="0, 0, -20" RAGDOLL=1

Branch "Dimple"
    0  STATE Stun for 0.65 s
    1  STATE DirectionLock for 0.65 s
      fx: sound 73849314635978 ×15 · sound 82554005159781 ×2 · Billboard (0.6 s) · Mesh (0.4 s) · Light (0.4 s)
    7  VELO TIME=0.45 FORCE="0, 0.001, 0"
    8  ANIM [12,7] (Heian.WCS) SPEED=2 FADE OUT=0.2
    9  WAIT 0.4
   10  PROJECTILE SIZE="6, 6, 6" SPEED=35 ATTACK TYPE="Swarm" CLEAR KNOCKBACK=true CACHE=true STUN=1 CANCEL ENEMY=true POSITION="-2, 3, 0" BRANCH TARGET="Possess" HIT RAGDOLL=true TIME=1 IGNORE WAKEUP=true ROTATION="-2, 0, 0" PROJECTILE TAG="Dimple" AIM LAST HIT=10
      fx: Mesh (tag "nil", on Dimple) · Cursed Energy (on Dimple, 0.75 s) · Light (on Dimple, 0.75 s)
   14  ANIM [12,7] (Heian.WCS) FADE IN=0.2 FADE OUT=0.2 SPEED=0.7

Branch "Awakened" — only if ULT
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
