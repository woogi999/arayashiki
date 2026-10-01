# Rush punch, then a second use that leaps up and slams down

Tags: leap, jump, slam, ground pound, aoe, use twice, second use, variant, VAR, rush, punch

**The reference for "goes up and slams down".** First use: a rush punch that
accelerates forward and knocks them back. Landing it opens a short window
where the same key does the second move: leap up and forward, then dive down
into a big area hit.

How it works:
- Line: `TAG check S3UseTwice "1" → UseTwice`, else `Base`. The skill has
  `VAR "S3UseTwice"`: while that tag is active it can be used on cooldown.
- Base: stun yourself 1.4 s, speed up in steps (`VELO` 10, 20, 30, 45, 60
  with TRACK, 0.1 s apart), then a 6-damage hitbox → `OnHitBase`.
- OnHitBase: knock them `"0, 5, 60"`, then `TAG set S3UseTwice = "1" for
  0.75 s` (the window) and show an "UseAgain" overlay.
- UseTwice: clear the tag, `SETCD to 0` (so the window doesn't burn the
  cooldown), **leap `VELO "0, 70, 50"` for 0.2 s**, `WAIT 0.7` (the arc),
  **dive `VELO "0, -90, 120"` with TRACK for 0.2 s**, `WAIT 0.4`, then the
  landing: a 35×35×35 hitbox around you (14 damage) and `VELO "0, 60, 0"` on
  them (`LAST HIT`), with shake, screen colour and lightning.

Reuse it for: leap-and-slam moves (the UseTwice branch alone), any
"use again within N seconds" follow-up, ramping speed.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 3: "Double Strike"

Cooldown 15 · Properties: REP, VAR="S3UseTwice", NOSTUN, AWK2, KEEP

```text
Line (runs on use)
    0  TAG check S3UseTwice "1" → "UseTwice"
    1  BRANCH → "Base"

Branch "OnHitTarget"
      fx: sound 139795256698131 ×7 · sound 83754120506535 ×1.7 · Billboard (0.75 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.3 s) · Sparks (0.3 s) · Sparks (0.3 s) · Glow (0.2 s) · Glow (0.15 s) · Circle Glow (0.15 s) · Shake Light · Light (0.3 s) · Distortion (0.5 s) · Distortion (0.5 s)

Branch "OnHitBase"
    0  VELO TIME=0.2 FORCE="0, 5, 60" RAGDOLL=1.5 LAST HIT=0.2
      fx: Shake Heavy · Screen Color (0.3 s) · Overlay (1.5 s) · Overlay (tag "UseAgain", 0.8 s) · Clash (0.1 s) · Wind Expand (0.75 s) · 360 Wind (0.3 s)
    8  WAIT 0.1
      fx: Wind Expand (0.75 s)
   10  WAIT 0.1
   11  TAG set S3UseTwice = "1" for 0.75 s
   12  WAIT 0.2
      fx: FOV 0 over 2 s
   14  WAIT 0.4
      fx: Overlay (tag "UseAgain", 0.2 s)
   16  WAIT 0.15

Branch "OnHitTargetTwice"
      fx: sound 139795256698131 ×7 · sound 83754120506535 ×1.7 · Shake Heavy · Screen Color (0.05 s) · Screen Color (0.5 s) · Billboard (0.75 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.3 s) · Sparks (0.3 s) · Sparks (0.3 s) · Glow (0.2 s) · Glow (0.15 s) · Circle Glow (0.15 s) · Light (0.3 s) · Distortion (0.5 s) · Distortion (0.5 s)

Branch "Base"
      fx: sound 77188240384448 ×3
    1  STATE Stun for 1.4 s
    2  ANIM [10,7] (Hiromi.FinalJudgement) SPEED=1.4 FADE OUT=0.3
      fx: FOV 20 over 3 s
    4  VELO TRACK=true TIME=0.15 FORCE="0, 0, 10"
    5  WAIT 0.1
    6  VELO TRACK=true TIME=0.15 FORCE="0, 0, 20"
    7  WAIT 0.1
    8  VELO TRACK=true TIME=0.15 FORCE="0, 0, 30"
    9  WAIT 0.1
   10  VELO TRACK=true TIME=0.15 FORCE="0, 0, 45"
   11  WAIT 0.1
   12  VELO TRACK=true TIME=1 FADE=true FORCE="0, 0, 60"
   13  WAIT 0.5
      fx: FOV -20 over 1.7 s
   15  WAIT 0.2
      fx: Melee Trail (Right Arm, 0.5 s)
   17  WAIT 0.1
   18  HITBOX DAMAGE=6 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.5 DEBREE=3 POSITION="0, 0, 4" IGNORE WAKEUP=true HIT RAGDOLL=true CANCEL ENEMY=true BRANCH="OnHitBase" SIZE="11, 10, 14" BRANCH TARGET="OnHitTarget"
   19  SETCD (its usual cooldown)
   20  WAIT 0.4
      fx: FOV 0 over 2 s

Branch "UseTwice"
    0  STATE Stun for 1.4 s
      fx: Cancel "UseAgain" · Wind Expand (0.5 s) · Mesh (0.4 s) · Clash (0.1 s) · Clash (0.1 s) · 360 Wind (0.4 s) · FOV 35 over 1 s · Melee Trail (Right Leg, 0.65 s) · Melee Trail (Left Leg, 0.65 s)
   10  TAG clear S3UseTwice
   11  SETCD to 0 s
   12  VELO TIME=0.2 FORCE="0, 70, 50"
   13  ANIM [17,27] (Nanami.Collapse) FADE OUT=0 SPEED=0.9
   14  WAIT 0.7
      fx: Shake Heavy · Melee Trail (Right Arm, 0.5 s)
   17  VELO TRACK=true TIME=0.2 FORCE="0, -90, 120"
   18  WAIT 0.4
   19  SETCD (its usual cooldown)
      fx: Shake Heavy · Wind Expand · 360 Wind (0.4 s) · Sphere (0.2 s) · Light · Billboard (0.4 s) · Billboard (0.6 s) · Weak Lightning · Clash (Right Arm, 0.1 s) · Clash (Right Arm, 0.1 s) · Mesh (0.4 s) · Mesh (1.5 s) · Screen Color (0.05 s) · Screen Color (0.5 s) · FOV 0 over 2 s
   35  HITBOX DAMAGE=14 CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.5 DEBREE=3 POSITION="0, 0, 0" STUN ANIM=true IGNORE WAKEUP=true HIT RAGDOLL=true BRANCH TARGET="OnHitTargetTwice" CLEAR KNOCKBACK=true SIZE="35, 35, 35" CANCEL ENEMY=true
   36  VELO TIME=0.2 FORCE="0, 60, 0" RAGDOLL=1.5 LAST HIT=0.2
   37  WAIT 0.5
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
