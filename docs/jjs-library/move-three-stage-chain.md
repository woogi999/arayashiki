# One key, three different slashes in a row

Tags: chain, stages, sequence, multi-use, cooldown, tags, slash

Each use within 3 s of a hit does the next slash: 1, 2, 3. Missing, or
waiting, puts the move on cooldown and starts over.

How it works:
- Line: `TAG check UpheavalUse "1" → 2`, `… "2" → 3`, else `1`.
- Each stage: its own animation, lunge and hitbox. On hit (`1OnHit`,
  `2OnHit`): knock them (up for stage 1, down-forward for stage 2),
  **`SETCD to 0`** (usable again at once), **`TAG add UpheavalUse += 1 (for
  3 s)`**, then `WAIT 3`: if the next stage wasn't used by then (it would have
  set `UseUpheavalVar`, which the check jumps to an empty `DoNothing` on),
  clear `UpheavalUse` and `SETCD` to 5 or 8 s.
- Stage 3 ends it with the full cooldown.

Reuse it for: sequences on one key, "hit to keep going" chains, cooldowns
that depend on how far you got.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 2: "Upheaval"

Cooldown 15 · Properties: NOSTUN, AWK, KEEP

```text
Line (runs on use)
    0  STATE InSkill for 0.2 s (DISABLE BURST)
    1  TAG check UpheavalUse "1" → "2"
    2  TAG check UpheavalUse "2" → "3"
    3  BRANCH → "1"

Branch "1"
    0  STATE Stun for 0.6 s
    1  TAG set UseKatana = "True" for 4 s
    2  ANIM [20,19] (MeiMei.ImpetusNew) FADE OUT=0.2
      fx: FOV -15 over 1 s
    4  VELO TRACK=true TIME=0.5 FORCE="0, 0, 15" FADE=true
    5  WAIT 0.3
      fx: sound 74215939319319 ×5 · sound 9119035665 ×2 · Light (2 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (3 s) · Slash (0.8 s) · Mesh (1.5 s) · Mesh (0.5 s) · Mesh (2 s) · Mesh (1.6 s) · Mesh · Clash (0.2 s) · Clash (0.2 s) · Burst (0.5 s) · FOV 0 over 2 s
   25  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1 DEBREE=2 POSITION="0, 3, 4" CANCEL ENEMY=true BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true STUN ANIM=true BRANCH="1OnHit" IGNORE WAKEUP=true SIZE="8, 12, 12"
   26  SETCD (its usual cooldown)
   27  WAIT 0.5

Branch "2"
    0  STATE Stun for 0.6 s
    1  TAG add UseUpheavalVar += 1 (for 4 s)
    2  TAG set UseKatana = "True" for 4 s
    3  ANIM [17,1] (Nanami.CleavingWhirlwind) FADE OUT=0.2
      fx: FOV -15 over 1 s
    5  VELO TRACK=true TIME=0.5 FORCE="0, 0, 35" FADE=true
    6  WAIT 0.4
      fx: sound 74215939319319 ×5 · Light (2 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (3 s) · Slash (0.8 s) · Mesh (1.5 s) · Mesh (0.5 s) · Mesh (2 s) · Mesh (1.6 s) · Mesh · Clash (0.2 s) · Clash (0.2 s) · Burst (0.5 s) · FOV 0 over 2 s
   25  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1 POSITION="0, 2, 4" STUN ANIM=true IGNORE WAKEUP=true HIT RAGDOLL=true CANCEL ENEMY=true SIZE="8, 12, 12" BRANCH="2OnHit" BRANCH TARGET="OnHitTarget"
   26  SETCD (its usual cooldown)
   27  WAIT 0.5

Branch "3"
    0  STATE Stun for 0.8 s
    1  STATE SpeedMultiplier = 0.4 for 1.2 s
    2  TAG add UseUpheavalVar += 1 (for 4 s)
    3  TAG set UseKatana = "True" for 4 s
    4  ANIM [10,2] (Hiromi.Execution) FADE OUT=0.4
      fx: FOV -15 over 1 s
    6  VELO TRACK=true TIME=0.5 FORCE="0, 0, 40" FADE=true
    7  WAIT 0.4
      fx: sound 74215939319319 ×5 · Light (2 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash · Whirl Slash (1.3 s) · Whirl Slash (3 s) · Slash (0.8 s) · Mesh (1.5 s) · Mesh (0.5 s) · Mesh (2 s) · Burst (0.5 s) · FOV 0 over 2 s
   22  HITBOX DAMAGE=5 CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.5 DEBREE=2 POSITION="0, 2, 4" IGNORE WAKEUP=true HIT RAGDOLL=true SIZE="8, 12, 12" BRANCH TARGET="OnHitTarget" BRANCH="3OnHit" CANCEL ENEMY=true STUN ANIM=true
   23  VELO TIME=0.2 FORCE="0, 5, 30" RAGDOLL=1.5 LAST HIT=0.2
   24  SETCD (its usual cooldown)
   25  WAIT 1

Branch "OnHitTarget"
      fx: sound 127083126906441 ×1.5 · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s)

Branch "3OnHit"
    0  VELO TIME=0.2 FORCE="0, 15, 27" RAGDOLL=1 LAST HIT=0.2
    1  SETCD (its usual cooldown)
      fx: FOV -30 over 0.1 s · Shake Medium · Screen Color (0.05 s) · Screen Color
    6  WAIT 0.2
      fx: FOV 0 over 2 s
    8  WAIT 0.8

Branch "1OnHit"
    0  VELO TIME=0.2 FORCE="0, 45, 15" RAGDOLL=1 LAST HIT=0.2
    1  SETCD to 0 s
      fx: Shake Medium · Screen Color
    4  TAG add UpheavalUse += 1 (for 3 s)
    5  WAIT 3
    6  TAG check UseUpheavalVar "1" → "DoNothing"
    7  TAG check UseUpheavalVar "2" → "DoNothing"
    8  TAG clear UpheavalUse
    9  SETCD to 5 s

Branch "2OnHit"
    0  VELO TIME=0.2 FORCE="0, -10, 27" RAGDOLL=1 LAST HIT=0.2
    1  SETCD to 0 s
      fx: Shake Medium · Screen Color
    4  TAG add UpheavalUse += 1 (for 3 s)
    5  WAIT 3
    6  TAG check UseUpheavalVar "2" → "DoNothing"
    7  TAG clear UpheavalUse
    8  SETCD to 8 s

Branch "DoNothing"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
