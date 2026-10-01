# Awakening: a cutscene, then a huge falling projectile

Tags: awakening, ultimate, cutscene, meteor, giant projectile, aoe, collided

Needs a full awakening bar. A short cutscene locks everyone near you, then a
huge projectile (80 damage) comes down at an angle in front of you; where it
lands, an explosion.

How it works:
- Usable only with `BAR 99.99` (a full bar). Line: `BRANCH random "V1, V2"`,
  a random voice line, each ending in `BRANCH Base`.
- Base: overlays, camera and light effects; stun, `IFrame` and
  `DirectionLock` 2 s on you (`DISABLE BURST`); a 30×30×30 **Domain**
  hitbox around you (5 s stun, 20 damage) catches everyone near.
- Then an anchor projectile far behind, and the meteor: `PROJECTILE`
  30×30×30 from `"0, 20, -7"`, `ROTATION "-20, 0, 0"` (down), `SPEED 120`,
  80 damage, `BRANCH COLLIDED "Collision"` (an explosion where it lands).
- `ULTGIB` (Add Awakening, -100 by default) empties the bar.

Reuse it for: awakenings, big falling projectiles, cutscene openers.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### AWAKENING: "Great Yamada Attack"

Cooldown (none) · Properties: REP2, NOSTUN, AWK2, NOCANCEL, KEEP · Usable only if BAR 99.99

```text
Line (runs on use)
    0  BRANCH random of "V1, V2"

Branch "OnHitTarget"
      fx: sound 77425156242780 ×0.65 · sound 101240729433536 ×2.3
    2  VELO TIME=0.2 TRUE RAGDOLL=true FORCE="0, 50, 70" RAGDOLL=3
      fx: Shake Heavy · Screen Color (0.05 s) · Melee Trail · Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)

Branch "V2"
      fx: sound 109468966167362 ×1.3
    1  BRANCH → "Base"

Branch "Collision"
      fx: sound 82891453696514 ×5 · Shake Heavy · Wind Expand (tag "nil", on Yamada, 2 s) · Wind Expand (on Yamada, 2 s) · Circle Glow (on Yamada) · Sparks (on Yamada, 2 s) · Clash (on Yamada, 1.2 s) · Clash (on Yamada, 1.2 s) · Mesh (on Yamada, 2 s)
    9  ULTGIB AMOUNT=-100
   10  WAIT 1

Branch "Base"
      fx: FOV -20 over 2.35 s · Overlay (1.8 s) · Camera (2.35 s) · Mesh · Mesh · Sparks (0.4 s) · Sparks (0.4 s) · Whirl Slash · Flames (0.4 s) · Glow (0.3 s) · Light (1.3 s)
   11  STATE Stun for 2 s (DISABLE BURST)
   12  STATE IFrame for 2 s
   13  STATE InSkill for 2 s
   14  STATE IFrame for 2 s
   15  STATE DirectionLock for 2 s
      fx: sound 71014838506616
   17  ANIM [2,17] (Itadori.Ultimate) FADE OUT=0.4
   18  WAIT 1
   19  PROJECTILE SIZE="6, 6, 6" SPEED=0 ATTACK TYPE="Domain" CONTINUE=true CACHE=true POSITION="0, -3, -36" TIME=5 PROJECTILE TAG="UltStart"
   20  HITBOX SIZE="30, 30, 30" CANCEL ENEMY=true BLOCKABLE=false ATTACK TYPE="Domain" CLEAR KNOCKBACK=true STUN=5 DEBREE=-5 POSITION="0, 15, 0" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true CAN KILL=true IGNORE WAKEUP=true DAMAGE=20 PROJECTILE TAG="UltStart"
      fx: sound 82891453696514 ×5 · sound 138298203151744 ×2 · sound 7971842732 ×7 · Shake Heavy · Wind Expand (tag "nil", on UltStart, 2 s) · Wind Expand (on UltStart, 2 s) · Circle Glow (on UltStart) · Sparks (on UltStart, 2 s) · Clash (on UltStart, 1.2 s) · Clash (on UltStart, 1.2 s) · Mesh (on UltStart, 2 s) · Mesh (on UltStart, 0.75 s)
   33  WAIT 0.6
      fx: Overlay (0.3 s)
   35  WAIT 0.25
      fx: Camera (0.05 s) · Overlay (0.3 s)
   38  PROJECTILE DAMAGE=80 SPEED=120 CANCEL ENEMY=true STUN ANIM=true CONTINUE=true CLEAR KNOCKBACK=true FILTER INTERVAL=2 CACHE=true STUN=3 DEBREE=-5 CAN KILL=true POSITION="0, 20, -7" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true BRANCH COLLIDED="Collision" TIME=2 ROTATION="-20, 0, 0" IGNORE WAKEUP=true ATTACK TYPE="Domain" PROJECTILE TAG="Yamada" SIZE="30, 30, 30"
      fx: FOV 0 over 1.35 s · Mesh (on Yamada, 2 s) · Flames (on Yamada, 2 s)
   42  ULTGIB AMOUNT=-100
   43  WAIT 1

Branch "V1"
      fx: sound 110874461493329 ×1.3
    1  BRANCH → "Base"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
