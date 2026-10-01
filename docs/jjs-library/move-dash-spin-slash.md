# Dash and spin slash, with an enhanced version

Tags: dash, spin, slash, aoe, 360, enhanced, stacks, sword

Hop back, dash forward (`"0, 0, 75"`), and slash all around you (a 27×8×27
box, 8 damage, `360 BLOCK`). With 2 `EnhancedStacks` it's a taller, heavier
slash (12 damage) that lifts them.

How it works:
- Line: `STATE InSkill` 0.2 s (DISABLE BURST), `TAG check IsAttacking →
  SetMelee` (`SETMELEE OFFSET 2` to keep the M1 string alive), `TAG check
  EnhancedStacks "2" → Enhanced`, else `Base`.
- Base: stun 0.7 s, `SpeedMultiplier 0`, a small back step (`"0, 0, -5"`),
  `WAIT 0.15`, the dash (0.45 s, FADE), `WAIT 0.3`, the round slash centred
  on you, `SETCD`.
- Enhanced: clears the stacks; the hitbox is 27×20×27 at `"0, 5, 0"` and
  `OnHitEnhanced` lifts them `"0, 30, 0"`.

Reuse it for: dash-then-area slashes, enhanced versions keyed on a tag.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 3: "Crescent Slash"

Cooldown 12 · Properties: NOSTUN, AWK, KEEP

```text
Line (runs on use)
    0  STATE InSkill for 0.2 s (DISABLE BURST)
    1  TAG check IsAttacking "True" → "SetMelee"
    2  TAG check EnhancedStacks "2" → "Enhanced"
    3  BRANCH → "Base"

Branch "SetMelee"
    0  SETMELEE OFFSET=2 COMBO=-1
    1  TAG set IsAttacking = "True" for 2 s
    2  TAG check EnhancedStacks "2" → "Enhanced"
    3  BRANCH → "Base"

Branch "Enhanced"
    0  TAG clear EnhancedStacks
    1  STATE Stun for 0.7 s
    2  STATE SpeedMultiplier = 0 for 0.9 s
    3  STATE NoJump for 0.9 s
      fx: FOV 10 over 2 s · Flames (0.1 s) · Billboard (0.6 s) · Light (0.5 s) · Mesh (4 s) · Mesh (2 s) · Glow · Wind Expand (0.5 s) · 360 Wind
   13  ANIM [13,14] (Yuta.ElbowBeatdown) SPEED=1.6
      fx: sound 70471027717563 ×1.5 · sound 1845250508 ×1.3 · sound 138625622703057 ×7.5 · sound 5276811184 ×3
   18  VELO TRACK=true TIME=0.2 FORCE="0, 0, -5"
   19  WAIT 0.15
   20  VELO TRACK=true TIME=0.45 FORCE="0, 0, 75" FADE=true
      fx: Wind Expand (0.5 s) · Wind Expand (0.5 s) · Wind Streak (0.5 s) · Wind Streak (0.5 s)
   25  WAIT 0.3
   26  TAG set UseKatana = "True" for 4 s
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash (2 s) · Whirl Slash (1.3 s) · Whirl Slash · Whirl Slash · Mesh (tag "nil", 2 s) · Mesh · Slash (1.5 s) · Mesh (2 s) · Mesh (1.5 s) · Mesh (0.5 s) · Mesh (3 s) · Wind Ring (2 s) · Burst (0.5 s) · Light · FOV -20 over 1 s
   45  HITBOX SIZE="27, 20, 27" CANCEL ENEMY=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=1.5 POSITION="0, 5, 0" STUN ANIM=true IGNORE WAKEUP=true HIT RAGDOLL=true CAN KILL=true BRANCH="OnHitEnhanced" BRANCH TARGET="OnHitTarget" DAMAGE=12 CLEAR KNOCKBACK=true
   46  SETCD (its usual cooldown)
   47  WAIT 0.5
      fx: FOV 0 over 3 s

Branch "OnHitTarget"
      fx: sound 127083126906441 ×1.5 · Screen Color (0.75 s) · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s)

Branch "Base"
      fx: FOV 10 over 2 s
    1  STATE Stun for 0.7 s
    2  STATE SpeedMultiplier = 0 for 0.9 s
    3  STATE NoJump for 0.9 s
    4  ANIM [13,14] (Yuta.ElbowBeatdown) SPEED=1.6
      fx: sound 1845250508 ×1.3 · sound 138625622703057 ×7.5 · sound 5276811184 ×3
    8  VELO TRACK=true TIME=0.2 FORCE="0, 0, -5"
    9  WAIT 0.15
   10  VELO TRACK=true TIME=0.45 FORCE="0, 0, 75" FADE=true
      fx: Wind Expand (0.5 s) · Wind Expand (0.5 s) · Wind Streak (0.5 s) · Wind Streak (0.5 s)
   15  WAIT 0.3
   16  TAG set UseKatana = "True" for 4 s
      fx: Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Cursed Energy (Right Arm, 0.1 s) · Whirl Slash (2 s) · Whirl Slash (1.3 s) · Whirl Slash · Whirl Slash · Slash (1.5 s) · Mesh (2 s) · Mesh (1.5 s) · Mesh (0.5 s) · Mesh (3 s) · Wind Ring (2 s) · Burst (0.5 s) · Light · FOV -20 over 1 s
   33  HITBOX SIZE="27, 8, 27" CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 0" IGNORE WAKEUP=true HIT RAGDOLL=true STUN ANIM=true 360 BLOCK=true DAMAGE=8 BRANCH="OnHitBase" BRANCH TARGET="OnHitTarget" CAN KILL=true
   34  SETCD (its usual cooldown)
   35  WAIT 0.5
      fx: FOV 0 over 3 s

Branch "OnHitBase"
    0  VELO TIME=0.2 LAST HIT=0.2 FORCE="0, 0, 15"
      fx: Shake Medium · Screen Color
    3  SETCD (its usual cooldown)
    4  WAIT 0.5
      fx: FOV 0 over 3 s

Branch "OnHitEnhanced"
    0  VELO TIME=0.6 FADE=true RAGDOLL=1.5 LAST HIT=0.2 FORCE="0, 30, 0"
      fx: sound 140728595235867 ×0.7 · Shake Medium · Screen Color (0.05 s) · Screen Color (1.3 s)
    5  SETCD (its usual cooldown)
    6  WAIT 0.5
      fx: FOV 0 over 3 s
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
