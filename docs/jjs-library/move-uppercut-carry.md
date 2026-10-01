# Uppercut that carries them up, then knocks them away

Tags: uppercut, launch, grab, carry, air, knockback

A big uppercut (10 damage) that, on hit, rises with them held in front of you,
hangs a moment, then knocks them up and away.

How it works:
- Line: sets `CancelChase` (see chase-with-run-and-awakened), stun 0.7 s,
  `WAIT 0.5` wind-up, hitbox → `UppercutHit`, and a small rising
  `VELO "0, 40, 20"` either way.
- UppercutHit: stun you 1.2 s and them 1.6 s (`STATE … LAST HIT 0.1`), slow
  both animations to a crawl (`ANIM SPEED 0.13` / `0.1` on them), **`GRAB`
  them at `"0, 2.3, 2"` for 1.25 s**, rise `VELO "0, 40, 10"` (FADE), hover
  (`"0, 10, 0"`), then knock them `"0, 45, 15"` and hop yourself.

Reuse it for: holding someone mid-air, slow-motion moments (`ANIM SPEED`
near 0), launchers.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 2: "Get a Job!"

Cooldown 19 · Properties: REP, NOSTUN, AWK, KEEP

```text
Line (runs on use)
    0  TAG add CancelChase += True (for 1 s)
    1  STATE Stun for 0.7 s
    2  STATE InSkill for 0.7 s
      fx: Melee Trail (Right Arm, 0.7 s) · FOV -20 · sound 109424299164139 ×2
    6  ANIM [8,6] (Todo.ElbowDrop) SPEED=1.1 FADE OUT=0.3 FADE IN=0.2
    7  WAIT 0.5
      fx: sound 124837936201770 ×4 · Wind Expand (0.3 s) · Mesh · Mesh (0.5 s) · Billboard (0.5 s) · Billboard (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Mesh (0.5 s)
   17  HITBOX DAMAGE=10 BLOCKABLE=false STUN ANIM=true CLEAR KNOCKBACK=true STUN=1.5 DEBREE=2 POSITION="0, 2.7, 4" BRANCH TARGET="OnHitTargetUp" HIT RAGDOLL=true SIZE="7, 8, 8" BRANCH="UppercutHit"
      fx: FOV 0
   19  ANIM [8,6] (Todo.ElbowDrop) FADE OUT=0.3
   20  VELO TRACK=true TIME=0.2 FORCE="0, 40, 20"
   21  SETCD (its usual cooldown)
   22  WAIT 0

Branch "UppercutHit"
    0  STATE InSkill for 1.2 s
    1  STATE Stun for 1.2 s
    2  STATE Stun for 1.6 s on the one hit (LAST HIT 0.1)
    3  STATE DirectionLock for 1.6 s
      fx: sound 102984516497790 ×4
    5  ANIM [8,6] (Todo.ElbowDrop) FADE IN=0 FADE OUT=0.3 SPEED=0.13
    6  ANIM [4,12] (Megumi.ShadowSwarmHit) FADE OUT=0 LAST HIT=0.2 SPEED=0.1
    7  GRAB POSITION="0, 2.3, 2" LAST HIT=0.2 TIME=1.25
    8  VELO TRACK=true TIME=0.3 FORCE="0, 40, 10" FADE=true
      fx: FOV -35 over 1 s · Wind Expand (0.4 s) · Mesh (0.3 s) · Mesh · Mesh (0.5 s) · Mesh (0.5 s) · Shake Heavy (0.1 s) · Screen Color (0.05 s) · Screen Color (0.4 s)
   18  WAIT 0.3
   19  VELO TRACK=true TIME=0.5 FORCE="0, 10, 0"
      fx: sound 124568963640138 ×0.7
   21  WAIT 0.5
   22  VELO TIME=0.2 FORCE="0, 45, 15" RAGDOLL=1.2 LAST HIT=1.5
   23  VELO TIME=0.2 FORCE="0, 40, 5"
      fx: Mesh · FOV 0 over 2.3 s · Shake Heavy (0.1 s) · Mesh (0.2 s)
   28  ANIM [8,6] (Todo.ElbowDrop) FADE OUT=0.3

Branch "OnHitTargetUp"
      fx: sound 7823511893 ×2 · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.8 s) · Glow (0.15 s) · Shake Heavy (0.1 s) · Screen Color (0.05 s) · Screen Color (0.4 s)
   11  WAIT 0.8
      fx: Melee Trail (Right Arm) · Melee Trail (Left Arm) · Melee Trail (Right Leg) · Melee Trail (Left Leg)
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
