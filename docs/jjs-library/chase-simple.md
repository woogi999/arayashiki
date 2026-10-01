# Chase: short dash with a hit check

Tags: chase, dash, simple, detector

The simplest chase here: a 0.5 s dash (`"0, 0.01, 70"`, TRACK, FADE) with a
detector every 0.05 s, the real hit on contact, and a recoil if blocked.

How it works:
- Line: stun 0.3 s, `InSkill`, the dash VELO, an effects anchor projectile
  (`SPEED 0`), then `HITBOX → HitCheck` · `WAIT 0.05` · `LOOP` × 6.
- HitCheck: real hit (3 damage, 0.75 s, blockable) → `OnHit`, and the
  unblockable detector → `Blocked`.
- OnHit: bounce yourself back (`"0, -30, -20"`) and push them `"0, 0.01, 20"`.

Reuse it for: a minimal hitting dash to build on.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### CHASE: "Wild Assault"

Cooldown 6 · Properties: REP, KEEP

```text
Line (runs on use)
      fx: sound 81951458219518 ×4
    1  STATE Stun for 0.3 s
    2  STATE InSkill for 0.3 s
    3  VELO TRACK=true TIME=0.5 FADE=true FORCE="0, 0.01, 70"
    4  PROJECTILE SPEED=0 ATTACK TYPE="Domain" CONTINUE=true POSITION="0, 0, -3" PROJECTILE TAG="DashFX"
      fx: FOV 20 · Mesh (on DashFX, 0.2 s) · Mesh (on DashFX) · Mesh (1.5 s) · Glow (0.5 s) · Wind Expand (tag "nil", on DashFX, 0.4 s)
   11  ANIM [20,18] (MeiMei.Melee.Chase)
      fx: Afterimage (0.4 s)
   13  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false STUN=0 POSITION="0, 0, 5.5" SIZE="8, 8, 12" BRANCH="HitCheck" IGNORE WAKEUP=false
   14  WAIT 0.05
   15  LOOP back 3 × 6
      fx: FOV 0 over 2 s

Branch "HitCheck"
    0  HITBOX SIZE="8, 8, 12" SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" CLEAR KNOCKBACK=true STUN=0.75 POSITION="0, 0, 5.5" CAN KILL=true IGNORE WAKEUP=true HIT RAGDOLL=false STUN ANIM=true BRANCH="OnHit" BRANCH TARGET="OnHitTarget" DAMAGE=3
    1  HITBOX SIZE="8, 8, 12" SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 5.5" CAN KILL=false IGNORE WAKEUP=false HIT RAGDOLL=false BRANCH="Blocked" DAMAGE=0

Branch "OnHit"
    0  STATE Stun for 0.2 s
    1  VELO TIME=0.2 FORCE="0, -30, -20"
    2  VELO TIME=0.2 FORCE="0, 0.01, 20" LAST HIT=0.2
      fx: FOV 0 over 2 s
    4  ANIM [20,18] (MeiMei.Melee.Chase) FADE OUT=0

Branch "OnHitTarget"
      fx: sound 77425156242780 ×0.65 · Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)

Branch "Blocked"
    0  STATE Stun for 0.75 s
    1  VELO TIME=0.2 FORCE="0, -30, -20"
      fx: FOV 0 over 2 s
    3  ANIM [20,18] (MeiMei.Melee.Chase) FADE OUT=0
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
