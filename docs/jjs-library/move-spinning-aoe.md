# Spinning area attack that walks forward

Tags: spin, spinning, aoe, multi-hit, whirlwind, 360

Spin for about 2 s, moving forward and hitting everything around you every
0.3 s.

How it works:
- 0.2 s `IFrame` at the start, `InSkill`/`NoSprint`/`NoJump`/`NoDash` for
  2.8 s, a wind-up (`WAIT 0.3`).
- Loop: `VELO "0, 0, 30"` TRACK, `ANIM "Spin"` looped at speed 2.5, an
  18×9×18 hitbox centred on you (2 damage, **`360 BLOCK`**, so it can be
  blocked from any side), trails and whirls, `WAIT 0.3`, **`LOOP back 8 × 6`**.
- The end: slow yourself briefly and play a finishing anim.

Reuse it for: any spin or aura that hits repeatedly.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 4: "Ultimate Spinning Whirlwind"

Cooldown 15 · Properties: REP, AWK, KEEP

```text
Line (runs on use)
    0  STATE IFrame for 0.2 s
    1  STATE Stun for 0.6 s
    2  STATE InSkill for 2.8 s
    3  STATE NoSprint for 2.8 s
    4  STATE NoJump for 2.8 s
    5  STATE NoDash for 2.8 s
      fx: sound 134458424867280 ×3 · FOV -20 · Mesh (Right Arm, 0.4 s) · Star (Right Arm, 0.2 s) · Circle Glow (0.2 s) · Shine (Right Arm, 0.5 s) · Clash (Right Arm, 0.1 s) · Energy Sparks (Right Arm, 0.1 s)
   14  ANIM [6,18] (Mahito.WideStrike)
   15  WAIT 0.3
      fx: FOV -7 over 2 s · Wind Expand (0.35 s) · Wind Expand
   19  VELO TRACK=true TIME=0.4 FORCE="0, 0, 30"
   20  ANIM "Spin" SPEED=2.5 LOOPED=true
      fx: Melee Trail (Right Arm) · Melee Trail (Left Arm)
   23  HITBOX DAMAGE=2 STUN ANIM=true STUN=0.8 DEBREE=2 POSITION="0, 1.6, 0" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="18, 9, 18" 360 BLOCK=true CLEAR KNOCKBACK=true
      fx: Mesh (0.4 s) · Whirl Slash (0.5 s) · Whirl Slash (0.5 s) · Wind Expand (0.3 s) · Wind Expand (0.5 s) · sound 131124326698354 ×10
   30  WAIT 0.3
   31  LOOP back 8 × 6
   32  STATE SpeedMultiplier = 0.2 for 1 s
   33  STATE NoJump = 0.2 for 1 s
   34  STATE NoDash = 0.2 for 1 s
   35  STATE NoSprint = 0.2 for 1 s
      fx: sound 134458424867280 ×3 · Whirl Slash · Wind Expand (0.35 s) · Wind Expand · FOV 0 over 2 s
   41  ANIM [3,2] (Hakari.EnergySurge) FADE OUT=0.4
   42  WAIT 0.4

Branch "OnHitTarget"
      fx: sound 115358580239461 ×0.65
    1  VELO TIME=0.2 FORCE="0, 0, 20"
      fx: Glow (0.2 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s)
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
