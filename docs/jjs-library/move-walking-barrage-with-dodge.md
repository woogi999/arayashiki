# Hold to walk forward (dodging hits), then a barrage

Tags: barrage, hold, walk, counter, dodge, multi-hit, random sound, tags

Hold the key to walk forward; hits aimed at you are dodged. Let go, or reach
someone, and you throw a barrage of punches ending in a launcher.

How it works:
- Line: sets `CancelChase`, a detector → `Barrage` (someone right there),
  then `BRANCH Walk` (needs HOLD), then `Barrage`.
- Walk: `InSkill`/`NoJump` 10 s (`CANCEL ON END`), a looped walk anim,
  `VELO "0, 0, 13.5"`, a **`COUNTER`** (Melee, Bullet) → `DodgeBarrage`, a
  detector → `Barrage`, `WAIT 0.1`, **`LOOP back 4 × 30, while held`**.
- DodgeBarrage: `IFrame` 0.4 s, a quick lean anim played forward then
  backward (`ANIM SPEED -0.8`), then the barrage.
- Barrage: stun 1.8 s, then hits of 1 damage every 0.2 s (4 per set, looped
  once), a final hit and `VELO "0, 15, 25"` on them.
- Hit sounds cycle with a counter tag: each hit adds 1 to `HitSound` and
  checks `== 1/2/3` to play one of three sounds; `Sound3` clears it.

Reuse it for: hold-to-charge walks, counters inside a move, barrages,
rotating through sounds with a counter.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 3: "Self Defense Rush"

Cooldown 16 · Properties: REP, AWK, KEEP

```text
Line (runs on use)
    0  TAG add CancelChase += True (for 1 s)
    1  HITBOX BLOCKABLE=false STUN=0 CAN KILL=false IGNORE WAKEUP=false DAMAGE=0 BRANCH="Barrage"
    2  WAIT 0.1
    3  BRANCH → "Walk"
    4  BRANCH → "Barrage"

Branch "Sound2"
      fx: sound 121166537529192 ×0.5

Branch "DodgeBarrage"
    0  STATE IFrame for 0.4 s
    1  STATE Stun for 0.4 s
      fx: sound 138149044086182 ×4
    3  ANIM [10,15] (Hiromi.Dodge.Dodge2) FADE OUT=1 SPEED=0.5
    4  WAIT 0.15
    5  ANIM [10,15] (Hiromi.Dodge.Dodge2) FADE OUT=1 SPEED=-0.8
    6  WAIT 0.15
    7  BRANCH → "Barrage"

Branch "Sound3"
      fx: sound 123740905736210
    1  TAG clear HitSound

Branch "Walk" — only if HOLD
    0  STATE InSkill for 10 s (CANCEL ON END)
    1  STATE NoJump for 10 s (CANCEL ON END)
      fx: FOV 0 over 1 s
    3  ANIM "Stomp" FADE IN=0.2 FADE OUT=0.2 SPEED=1.5 LOOPED=true
    4  VELO TRACK=true TIME=0.2 FORCE="0, 0, 13.5"
    5  COUNTER REFLECT=false CANCEL ENEMY=false REMOVE ON HIT=true TIME=0.2 CONTINUE=false ATTACK TYPE2="Melee,Bullet" BRANCH="DodgeBarrage" STUN=0
    6  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="6, 6, 6" BRANCH="Barrage"
    7  WAIT 0.1
    8  LOOP back 4 × 30, while held
    9  BRANCH → "Barrage"

Branch "Sound1"
      fx: sound 120483835720741 ×0.5

Branch "OnHitTargetLast"
      fx: sound 8595984380 ×3 · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s)

Branch "OnHitTarget"
    0  VELO TIME=0.2 FORCE="0, 0, 3.5"
      fx: Glow (0.15 s) · Billboard (0.2 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · Sparks (0.3 s)
    8  TAG add HitSound += 1 (for 2 s)
    9  TAG check HitSound "1" → "Sound1"
   10  TAG check HitSound "2" → "Sound2"
   11  TAG check HitSound "3" → "Sound3"

Branch "Barrage"
    0  ANIM [3,17] (Hakari.Melee.Chase) FADE OUT=0
      fx: sound 87664014193053 ×1.5 · FOV -23 over 1 s
    3  WAIT 0.2
    4  VELO RELATIVE FROM BRANCH=false TRACK=true TIME=2 FORCE="0, 0, 4" FADE=true
    5  STATE Stun for 1.8 s
    6  STATE InSkill for 1.8 s
      fx: sound 84297573626629 ×5 · sound 100605576958565 ×2 · FOV -15 over 1 s · Melee Trail (Right Arm, 2.8 s) · Melee Trail (Left Arm, 2.8 s) · Wind Expand (0.4 s) · Cleave (0.1 s) · Shake Light · 360 Wind (0.2 s)
   16  HITBOX DAMAGE=1 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="8, 8, 7" CLEAR KNOCKBACK=true STUN ANIM=true IGNORE WAKEUP=true
   17  ANIM [2,21] (Itadori.Melee.Melee2) SPEED=1.5 FADE OUT=0
   18  WAIT 0.1
      fx: Wind Expand (0.4 s) · Glow (Right Arm, 0.7 s) · Glow (Left Arm, 0.7 s) · Cleave (0.1 s)
   23  WAIT 0.1
      fx: Glow (Left Arm, 0.7 s) · Glow (Right Arm, 0.7 s) · Afterimage2 (0.7 s) · Wind Expand (0.4 s) · Cleave (0.1 s) · Shake Light · 360 Wind (0.2 s)
   31  HITBOX DAMAGE=1 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="8, 8, 7" CLEAR KNOCKBACK=true STUN ANIM=true IGNORE WAKEUP=true
   32  ANIM [9,8] (Locust.Melee.Melee1) SPEED=1.5 FADE OUT=0
   33  WAIT 0.1
      fx: Wind Expand (0.4 s) · Glow (Right Arm, 0.7 s) · Glow (Left Arm, 0.7 s) · Cleave (0.1 s)
   38  WAIT 0.1
      fx: Glow (Left Arm, 0.7 s) · Glow (Right Arm, 0.7 s) · Afterimage2 (0.7 s) · Wind Expand (0.4 s) · Cleave (0.1 s) · Shake Light · 360 Wind (0.2 s)
   46  HITBOX DAMAGE=1 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="8, 8, 7" CLEAR KNOCKBACK=true STUN ANIM=true IGNORE WAKEUP=true
   47  ANIM [8,22] (Todo.Melee.Melee2) SPEED=1.5 FADE OUT=0
   48  WAIT 0.1
      fx: Wind Expand (0.4 s) · Glow (Right Arm, 0.7 s) · Glow (Left Arm, 0.7 s) · Cleave (0.1 s)
   53  WAIT 0.1
      fx: Glow (Left Arm, 0.7 s) · Glow (Right Arm, 0.7 s) · Afterimage2 (0.7 s) · Wind Expand (0.4 s) · Cleave (0.1 s) · Shake Light · 360 Wind (0.2 s)
   61  HITBOX DAMAGE=1 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 4" CAN KILL=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="8, 8, 7" CLEAR KNOCKBACK=true STUN ANIM=true IGNORE WAKEUP=true
   62  ANIM [1,14] (Gojo.Melee.Melee2) SPEED=1.5 FADE OUT=0
   63  WAIT 0.1
      fx: Wind Expand (0.4 s) · Glow (Right Arm, 0.7 s) · Glow (Left Arm, 0.7 s) · Cleave (0.1 s)
   68  WAIT 0.1
      fx: Glow (Left Arm, 0.7 s) · Glow (Right Arm, 0.7 s) · Afterimage2 (0.7 s)
   72  LOOP back 60 × 1
   73  WAIT 0.1
   74  HITBOX DAMAGE=0.5 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.2 POSITION="0, 0, 4" CAN KILL=true BRANCH TARGET="OnHitTargetLast" HIT RAGDOLL=true SIZE="8, 8, 7" CLEAR KNOCKBACK=true STUN ANIM=true IGNORE WAKEUP=true
   75  VELO TIME=0.2 FORCE="0, 15, 25" RAGDOLL=1.2 LAST HIT=0.2
      fx: FOV 0 over 2 s · Whirl Slash (2 s)
   78  ANIM [2,6] (Itadori.Variants.DivergentFist3) FADE OUT=0.4
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
