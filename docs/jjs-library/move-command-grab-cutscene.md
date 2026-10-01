# Command grab: hold them by the head, then blast them away

Tags: grab, command grab, cutscene, hold, i-frames, kill, finisher, look

A short-range grab (21 damage). On hit, you hold them up by the head for
about 3 s, then a big blast sends them flying. A finisher version sends them
further.

How it works:
- Line: stun, `WAIT 0.3`, a 7×12×7 hitbox → `OnHit` (`BRANCH FINISHER
  "OnHitFinisher"`).
- OnHit: `InSkill`/`IFrame`/`Stun` 3.4 s on you, stun 4 s on them,
  `LOOK` 3.8 s, a pin VELO, then **`GRAB` with `BODY PART "Right Arm"`,
  `BODY PART2 "Head"`, `ROTATION "-90, 180, 45"`** for 3.45 s (their head in
  your hand). Both play slow animations (`ANIM SPEED 0.04`; theirs
  "Killbind" with `LAST HIT`). After `WAIT 2.5` and more, a 25×25×50 box and
  `VELO "0, 15, 100"` on them (`LAST HIT 3.6`, to reach back that far).

Reuse it for: holding someone by a body part, long grabs, a finisher
variant.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 2: "Take Off Your Mask"

Cooldown 20 · Properties: REP, AWK2, KEEP

```text
Line (runs on use)
      fx: sound 135885041705374 ×1.5 · Melee Trail (Right Arm, 0.4 s)
    2  STATE Stun for 1 s
    3  ANIM [23,2] (Kurourushi.Detach) FADE OUT=0.2
    4  WAIT 0.3
    5  HITBOX SIZE="7, 12, 7" CAN KILL=false BLOCKABLE=false STUN ANIM=true CLEAR KNOCKBACK=true BRANCH FINISHER="OnHitFinisher" BRANCH TARGET="OnHitTargetGrab" HIT RAGDOLL=true DAMAGE=21 BRANCH="OnHit"
      fx: Melee Trail (Right Arm, 0.7 s)
    7  ANIM [23,3] (Kurourushi.Reattach) FADE OUT=0.2 SPEED=0.7

Branch "OnHit"
    0  STATE InSkill for 3.4 s
    1  STATE IFrame for 3.4 s
    2  STATE Stun for 3.4 s
    3  STATE Stun for 4 s on the one hit (LAST HIT 0.2)
    4  LOOK CAMERA DIRECTION=false TIME=3.8 HORIZONTAL ONLY=false SMOOTHNESS=150
      fx: sound 121384393901723 ×2.2 · sound 108440308823101 ×0.5 · sound 83527155232603 ×0.5
    8  VELO TRACK=true TIME=3.8 FORCE="0.001, 0.001, 0.001"
      fx: FOV -25 over 3 s · Screen Color (2.45 s) · Shake Medium
   12  GRAB POSITION="0, -1, 0" ROTATION="-90, 180, 45" BODY PART="Right Arm" BODY PART2="Head" TIME=3.45 LAST HIT=0.3
   13  ANIM [23,2] (Kurourushi.Detach) SPEED=0.04 FADE IN=0.4 FADE OUT=0.2
   14  ANIM "Killbind" SPEED=0.3 FADE OUT=0 LAST HIT=0.2
   15  WAIT 2.5
      fx: Screen Color · FOV 20 over 2 s
   18  ANIM [9,2] (Locust.BugFlight) SPEED=-0.5 FADE OUT=0.4
      fx: sound 85208802172802 ×5
   20  WAIT 0.4
      fx: Melee Trail (Right Arm, 0.4 s) · sound 136954171690114 ×0.5
   23  ANIM [2,11] (Itadori.Dismantle) FADE OUT=0.4
   24  WAIT 0.6
      fx: sound 80662828882624 ×2 · sound 102109874814687
   27  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Domain" STUN=0 DEBREE=3 POSITION="0, 0, 25" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="25, 25, 50"
      fx: Clash (0.1 s) · Clash (0.1 s) · FOV 0 over 2 s · Shake Heavy · Screen Color (0.05 s) · Screen Color (0.3 s) · 360 Wind (0.3 s) · Wind Streak (0.5 s) · Wind Streak (0.5 s) · Billboard · Mesh (2 s)
   39  VELO TIME=0.2 FORCE="0, 15, 100" RAGDOLL=1.5 LAST HIT=3.6
      fx: Wind Expand
   41  WAIT 0.1
      fx: Wind Expand
   43  WAIT 0.1
      fx: Wind Expand
   45  WAIT 0.05

Branch "OnHitFinisher"
    0  STATE InSkill for 3.4 s
    1  STATE IFrame for 3.4 s
    2  STATE Stun for 3.4 s
    3  STATE Stun for 4 s on the one hit (LAST HIT 0.2)
    4  LOOK CAMERA DIRECTION=false SMOOTHNESS=150 TIME=3.8 HORIZONTAL ONLY=false
      fx: sound 121384393901723 ×2.2 · sound 108440308823101 ×0.5 · sound 83527155232603 ×0.5
    8  VELO TRACK=true TIME=3.8 FORCE="0.001, 0.001, 0.001"
      fx: FOV -25 over 3 s · Screen Color (2.45 s) · Shake Medium
   12  GRAB POSITION="0, -1, 0" LAST HIT=0.3 BODY PART="Right Arm" TIME=3.45 BODY PART2="Head" ROTATION="-90, 180, 45"
   13  ANIM [23,2] (Kurourushi.Detach) SPEED=0.04 FADE OUT=0.2 FADE IN=0.4
   14  ANIM "Killbind" SPEED=0.3 FADE OUT=0 LAST HIT=0.2
   15  WAIT 2.5
      fx: Screen Color · FOV 20 over 2 s
   18  ANIM [9,2] (Locust.BugFlight) SPEED=-0.5 FADE OUT=0.4
      fx: sound 85208802172802 ×5
   20  WAIT 0.4
      fx: Melee Trail (Right Arm, 0.4 s) · sound 136954171690114 ×0.5
   23  ANIM [2,11] (Itadori.Dismantle) FADE OUT=0.4
   24  WAIT 0.6
      fx: sound 80662828882624 ×2 · sound 102109874814687
   27  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Domain" STUN=0 DEBREE=3 POSITION="0, 0, 25" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="25, 25, 50"
      fx: Clash (0.1 s) · Clash (0.1 s) · FOV 0 over 2 s · Shake Heavy · Screen Color (0.05 s) · Screen Color (0.3 s) · 360 Wind (0.3 s) · Wind Streak (0.5 s) · Wind Streak (0.5 s) · Billboard · Mesh (2 s)
   39  VELO TIME=0.2 FORCE="0, 15, 300" RAGDOLL=1.5 LAST HIT=3.6
      fx: Wind Expand
   41  WAIT 0.1
      fx: Wind Expand
   43  WAIT 0.1
      fx: Wind Expand
   45  WAIT 0.05

Branch "OnHitTargetGrab"
      fx: sound 139795256698131 ×7 · sound 83754120506535 ×1.7 · Billboard (Head, 0.75 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.3 s) · Sparks (0.3 s) · Sparks (0.3 s) · Glow (0.2 s) · Glow (0.15 s) · Circle Glow (0.15 s) · Shake Light · Light (0.3 s) · Distortion (0.5 s) · Distortion (0.5 s)
   16  WAIT 3.5
      fx: Melee Trail (Right Arm) · Melee Trail (Left Arm) · Melee Trail (Right Leg) · Melee Trail (Left Leg)
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
