# Slash that builds stacks; at 2 stacks, a tornado

Tags: slash, sword, stacks, enhanced, tornado, projectile, setmelee, combo, cooldown short

A quick forward slash (3 s cooldown). Each hit adds a stack; with 2 stacks
the next use is enhanced: it sends out a tornado that carries them up.

How it works:
- Line: `TAG check EnhancedStacks "2" → Enhanced`, `TAG check IsAttacking →
  SetMelee` (in the middle of an M1 string: `SETMELEE OFFSET 1.5` keeps the
  string going after the skill), then `Base`.
- Base: sets `UseKatana` (passive-auto-sheath draws the blade), a short lunge,
  4-damage hit → `OnHit`: **`TAG add EnhancedStacks += 1 (for 8 s)`**.
  Blocked: recoil 0.7 s.
- Enhanced: clear the stacks, then **two projectiles at `SPEED 45`**: one only
  for visuals (`TornadoVisuals`) and the real one (4 damage, `FILTER
  INTERVAL 3`, `REFLECT COUNT 99`, `ATTACK TYPE "Explosion"`) whose
  `BRANCH TARGET "OnHitTornado"` lifts them (`"0, 30, 25"`, TRUE RAGDOLL).
  The tornado's whirl effects are re-spawned on its tag in a loop (`LOOP back
  8 × 12`).
- passive-stacks-visual shows an aura while `EnhancedStacks` is 2.

Reuse it for: stacking buffs, "every Nth use is stronger", slow travelling
projectiles with looping effects.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 1: "Tempest Steel"

Cooldown 3 · Properties: NOSTUN, AWK, KEEP

```text
Line (runs on use)
    0  STATE InSkill for 0.2 s (DISABLE BURST)
    1  TAG check EnhancedStacks "2" → "Enhanced"
    2  TAG check IsAttacking "True" → "SetMelee"
    3  BRANCH → "Base"

Branch "SetMelee"
    0  SETMELEE COMBO=-1 OFFSET=1.5
    1  TAG set IsAttacking = "True" for 1.5 s
    2  BRANCH → "Base"

Branch "OnHitTornado"
    0  VELO TIME=0.75 TRUE RAGDOLL=true FORCE="0, 30, 25" RAGDOLL=2 FADE=true
      fx: sound 140728595235867 ×0.7 · Glow (0.3 s) · Shake Light · Whirl Slash

Branch "Blocked"
    0  ANIM [6,1] (Mahito.BodyRepel) FADE IN=0.2 FADE OUT=0.3
    1  STATE Stun for 0.5 s
    2  STATE SpeedMultiplier = 0.4 for 0.7 s
      fx: sound 7029643523 ×0.7 · Cancel "KatanaHand" · Mesh (tag "KatanaHand", Right Arm, forever) · Sparks (0.2 s) · Energy Sparks (0.05 s) · Circle Glow (0.1 s)
    9  WAIT 0.7

Branch "OnHitTarget"
      fx: sound 137418191870543 ×1.7 · Billboard (0.6 s) · Mass Hit · Mass Hit · Glow (0.2 s) · Glow (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Energy Sparks (0.15 s) · Burst (0.7 s)

Branch "OnHit"
    0  VELO TIME=0.47 FORCE="0, 0, 10" LAST HIT=0.2 FADE=true
    1  TAG add EnhancedStacks += 1 (for 8 s)
      fx: Shake Light · Screen Color
    4  WAIT 0.48
      fx: Cancel "KatanaHand" · Mesh (tag "KatanaHand", Right Arm, forever)

Branch "Base"
      fx: FOV -10 over 1 s
    1  STATE InSkill for 0.4 s
    2  STATE NoDash for 0.55 s
    3  STATE NoJump for 0.55 s
    4  STATE DirectionLock for 0.4 s
    5  STATE SpeedMultiplier = 0.2 for 0.4 s
    6  TAG set UseKatana = "True" for 4 s
    7  ANIM [19,3] (Haruta.Backstab)
    8  VELO TRACK=true TIME=0.4 FORCE="0, 0, 20" FADE=true
    9  WAIT 0.2
      fx: Cursed Energy (Right Arm, 0.13 s) · Cursed Energy (Right Arm, 0.13 s) · Cursed Energy (Right Arm, 0.13 s) · Cursed Energy (Right Arm, 0.13 s) · Cursed Energy (Right Arm, 0.13 s)
   15  WAIT 0.03
   16  SETCD (its usual cooldown)
      fx: Cancel "KatanaHand" · Mesh (tag "KatanaHand", Right Arm, 3 s) · Wind Streak · Wind Streak (0.5 s) · Wind Streak (0.75 s) · Mesh (3 s) · Wind Expand (0.2 s) · Burst (0.2 s) · Burst (0.5 s) · Light · FOV 0 over 3 s · Whirl Slash (2 s) · Whirl Slash (2 s) · Mass Hit (0.5 s) · Mass Hit (0.6 s) · Mass Hit · sound 135176783308337 ×2
   34  HITBOX DAMAGE=4 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 0, 5.5" IGNORE WAKEUP=false BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true SIZE="9, 9, 12" STUN ANIM=true BRANCH="OnHit" CANCEL ENEMY=true
   35  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 5.5" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="9, 9, 12" BRANCH="Blocked"
   36  WAIT 0.48
      fx: Cancel "KatanaHand" · Mesh (tag "KatanaHand", Right Arm, forever)

Branch "Enhanced"
    0  TAG clear EnhancedStacks
    1  STATE Stun for 0.5 s
      fx: FOV -20 over 1 s · Flames (0.1 s) · Billboard (0.6 s) · Light (0.5 s) · Mesh (4 s) · Mesh (2 s) · Glow · Wind Expand (0.5 s) · 360 Wind · sound 70471027717563 ×1.5 · sound 99927276851878 ×2 · sound 116338527674024 ×2
   14  ANIM [13,26] (Yuta.Outburst) FADE IN=0.2 FADE OUT=0.2 SPEED=1.4
   15  WAIT 0.4
   16  STATE DirectionLock for 0.3 s
   17  TAG set UseKatana = "True" for 4 s
   18  PROJECTILE SPEED=45 ATTACK TYPE="Explosion" CONTINUE=true FILTER INTERVAL=3 POSITION="0, 3, 0" REFLECT COUNT=99 TIME=3 SIZE="11, 12, 11" PROJECTILE TAG="TornadoVisuals"
   19  PROJECTILE DAMAGE=4 SPEED=45 CANCEL ENEMY=true ATTACK TYPE="Explosion" CONTINUE=true CLEAR KNOCKBACK=true STUN=2 FILTER INTERVAL=3 STUN ANIM=true BRANCH TARGET="OnHitTornado" POSITION="0, 3, 0" REFLECT COUNT=99 HIT RAGDOLL=true TIME=1.3 SIZE="11, 12, 11" CAN KILL=true PROJECTILE TAG="Tornado" IGNORE WAKEUP=true
      fx: sound 138466406484615 ×1.5
   21  SETCD (its usual cooldown)
      fx: FOV 0 over 2 s · Light (tag "nil", on TornadoVisuals, 1.3 s) · Mesh (on TornadoVisuals) · Mesh (on TornadoVisuals) · Mesh (on TornadoVisuals, 2 s) · Whirl Slash (tag "nil", on TornadoVisuals) · Whirl Slash (tag "nil", on TornadoVisuals) · Whirl Slash (tag "nil", on TornadoVisuals) · Whirl Slash (tag "nil", on TornadoVisuals)
   31  WAIT 0.1
   32  LOOP back 8 × 12
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
