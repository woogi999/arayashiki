# Close: rapid-hit rush with a finisher cutscene. Far: lunge

Tags: rush, barrage, multi-hit, range check, near far, finisher, cutscene, teleport, kill

Checks whether anyone's close. Close: a rapid flurry of small hits that ends
in a knockback, and if it kills, a cutscene. Far: a lunge punch.

How it works:
- Line: sets `CancelChase`, then a **22×22×22 detector around you → Base**;
  nobody close, the line carries on to `BRANCH Far`. (A hit moves the line on,
  so this picks close or far.)
- Base (close): stun 2.3 s, slow walk forward, and hits of 0.5 damage every
  ~0.2 s with small pushes, three sets looped (`LOOP back 39 × 2`), then a last
  hit with **`BRANCH FINISHER "SaltSplashFinisher"`** and a knockback.
- SaltSplashFinisher: two anchor projectiles, then **`TELEPORT`** you away
  (`"0, 400, 0"`: out of sight) for a 5 s overlay-and-camera cutscene, then
  `TELEPORT "0, 0, 0"` back.
- Far: back up, lunge `"0, 0, 65"`, a 7-damage hit checked 5 times.

Reuse it for: moves that change with distance (a big detector first), rapid
multi-hits, cutscenes (teleport away, overlays, teleport back).

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 1: "Table Salt Exorcism"

Cooldown 17 · Properties: REP, NOSTUN, AWK, KEEP

```text
Line (runs on use)
    0  TAG add CancelChase += True (for 1 s)
    1  HITBOX SIZE="22, 22, 22" CAN KILL=false BLOCKABLE=false STUN=0 POSITION="0, 0, 0" HIT RAGDOLL=true DAMAGE=0 BRANCH="Base" ATTACK TYPE="Domain"
    2  BRANCH → "Far"

Branch "OnHitTarget"
      fx: sound 78274373977168 · Billboard (0.3 s) · Flames (0.07 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s)

Branch "Far"
    0  STATE Stun for 1.2 s (CANCEL ON END)
    1  STATE InSkill for 1.2 s (CANCEL ON END)
      fx: sound 140324602533286 ×5 · sound 121324505673291 ×2.7 · Melee Trail (Right Arm) · Flames (Right Arm) · FOV -5 over 1 s
    7  VELO TRACK=true TIME=0.2 FORCE="0, 0, -30" FADE=true
    8  ANIM [7,6] (Choso.PlasmaWave) FADE OUT=0.3 SPEED=1.5
    9  WAIT 0.3
      fx: FOV 14 over 1 s
   11  VELO TRACK=true TIME=0.6 FORCE="0, 0, 65" FADE=true
   12  ANIM [6,17] (Mahito.Ultimate2) FADE OUT=0.3
   13  WAIT 0.23
   14  HITBOX DAMAGE=7 SINGLE TARGET=true CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.5 POSITION="0, 0, 4" IGNORE WAKEUP=true BRANCH TARGET="OnHitTargetPunch" HIT RAGDOLL=false SIZE="8, 8, 10" STUN ANIM=true BRANCH="FarHit" CANCEL ENEMY=true CLEAR KNOCKBACK=true
   15  WAIT 0.05
   16  LOOP back 2 × 4
   17  HITBOX DAMAGE=7 SINGLE TARGET=true CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.5 POSITION="0, 0, 4" IGNORE WAKEUP=true BRANCH TARGET="OnHitTargetPunch" HIT RAGDOLL=false SIZE="8, 8, 10" STUN ANIM=true BRANCH="FarHit" CANCEL ENEMY=true CLEAR KNOCKBACK=true
      fx: Whirl Slash (0.8 s) · 360 Wind (0.4 s) · Wind Expand (0.5 s) · FOV 0 over 1 s
   22  STATE Stun for 0.3 s
      fx: sound 137523124067289 ×5
   24  ANIM [11,2] (Yuki.GarudaStab) FADE OUT=0.2 FADE IN=0.2

Branch "SaltSplashFinisher"
    0  STATE NoDash for 1.8 s
    1  STATE NoJump for 1.8 s
    2  STATE InSkill for 1.8 s
    3  ANIM [6,17] (Mahito.Ultimate2) FADE OUT=0
    4  SETCD (its usual cooldown)
      fx: sound 104168085061939 ×0.6 · Shake Light · Overlay (0.42 s)
    8  WAIT 0.4
      fx: FOV 0 over 2 s · Overlay (0.15 s)
   11  ANIM [12,5] (Heian.Kamutoke) FADE OUT=0 FADE IN=0 SPEED=0
   12  WAIT 0.1
      fx: Overlay (0.11 s) · Overlay
   15  PROJECTILE SPEED=0 ATTACK TYPE="Domain" CONTINUE=true CACHE=true POSITION="0, 0, 0" CANCEL PROJECTILE=true TIME=7 SIZE="6, 6, 6" PROJECTILE TAG="SaltSplashOGP"
   16  PROJECTILE SPEED=0 ATTACK TYPE="Domain" CONTINUE=true CACHE=true POSITION="0, 0, 0" TIME=7 SIZE="6, 6, 6" PROJECTILE TAG="SaltSplashOGP"
      fx: Afterimage2 (5 s)
   18  STATE Stun for 5 s
   19  STATE DirectionLock for 5 s
      fx: sound 106319241458969 ×0.8 · sound 133057911988563 ×1.7 · sound 133057911988563 ×1.7
   23  VELO TRACK=true TIME=5 FORCE="0.001, 0.001, 0.001"
   24  TELEPORT POSITION="0, 400, 0" IGNORE WALLS=true
      fx: Screen Color (5 s) · Mesh (5 s) · Camera (5 s) · Billboard (5 s) · Billboard (5 s) · Billboard (5 s) · Billboard (5 s)
   32  WAIT 0.1
      fx: Overlay (2 s) · Overlay (0.5 s)
   35  WAIT 2
      fx: Overlay (0.5 s)
   37  WAIT 2.4
      fx: Overlay (0.6 s)
   39  WAIT 0.5
      fx: Camera (0.05 s) · Cancel "SaltSplash" · Overlay (0.8 s)
   43  TELEPORT POSITION="0, 0, 0" IGNORE WALLS=true PROJECTILE TAG="SaltSplashOGP"
   44  ANIM [12,5] (Heian.Kamutoke) FADE OUT=0 FADE IN=0

Branch "Base"
    0  STATE Stun for 2.3 s
    1  STATE InSkill for 2.3 s
      fx: sound 72774659872589
    3  VELO TRACK=true TIME=0.4 FORCE="0, 0, -10" FADE=true
      fx: FOV -14 over 1 s · Billboard (0.5 s)
    6  ANIM [2,4] (Itadori.Variants.DivergentFist1)
    7  WAIT 0.4
    8  STATE SpeedMultiplier = 0 for 2.6 s
    9  STATE NoJump for 2.7 s
      fx: Melee Trail (Right Arm, 2.8 s) · Melee Trail (Left Arm, 2.8 s) · sound 133057911988563 ×1.7 · sound 122348469111015 ×7
   14  VELO TRACK=true TIME=2 FADE=true FORCE="0, 0, 10"
   15  ANIM [10,25] (Hiromi.GavelThrow) FADE OUT=0 SPEED=2 LOOPED=true
      fx: Clash (0.2 s) · Wind Expand (0.5 s)
   18  WAIT 0.1
   19  HITBOX DAMAGE=0.5 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 1, 5" CAN KILL=false IGNORE WAKEUP=true HIT RAGDOLL=true STUN ANIM=true SIZE="9, 7, 12" BRANCH TARGET="OnHitTarget"
   20  VELO TIME=0.2 LAST HIT=0.1 FORCE="0, 0, 7.5"
      fx: Clash (0.2 s) · Shake Light · Mass Hit · Circle Glow (0.3 s) · Wind Expand (0.5 s)
   26  WAIT 0.1
      fx: Afterimage2 (0.7 s)
   28  ANIM [15,20] (Mechamaru.PigeonViola) FADE OUT=0 SPEED=2
      fx: Clash (0.2 s) · Wind Expand (0.5 s)
   31  WAIT 0.1
   32  HITBOX DAMAGE=0.5 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 1, 5" CAN KILL=false IGNORE WAKEUP=true HIT RAGDOLL=true STUN ANIM=true SIZE="9, 7, 12" BRANCH TARGET="OnHitTarget"
   33  VELO TIME=0.2 LAST HIT=0.1 FORCE="0, 0, 7.5"
      fx: Clash (0.2 s) · Shake Light · Mass Hit · Circle Glow (0.3 s) · Wind Expand (0.5 s)
   39  WAIT 0.1
      fx: Afterimage2 (0.7 s)
   41  ANIM [6,17] (Mahito.Ultimate2) FADE OUT=0 SPEED=2
      fx: Clash (0.2 s) · Wind Expand (0.5 s)
   44  WAIT 0.1
   45  HITBOX DAMAGE=0.5 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 1, 5" CAN KILL=false IGNORE WAKEUP=true HIT RAGDOLL=true STUN ANIM=true SIZE="9, 7, 12" BRANCH TARGET="OnHitTarget"
   46  VELO TIME=0.2 LAST HIT=0.1 FORCE="0, 0, 7.5"
      fx: Clash (0.2 s) · Shake Light · Mass Hit · Circle Glow (0.3 s) · Wind Expand (0.5 s)
   52  WAIT 0.1
      fx: Afterimage2 (0.7 s)
   54  LOOP back 39 × 2
   55  WAIT 0.01
   56  HITBOX DAMAGE=0.5 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=0.75 POSITION="0, 1, 5" CAN KILL=true IGNORE WAKEUP=true HIT RAGDOLL=true BRANCH TARGET="OnHitTargetLast" SIZE="9, 7, 12" BRANCH FINISHER="SaltSplashFinisher" STUN ANIM=true
   57  SETCD (its usual cooldown)
      fx: sound 104168085061939 ×0.6 · Shake Light
   60  ANIM [1,2] (Gojo.InfiniteVoid) FADE OUT=0.4 SPEED=2
   61  WAIT 0.2
      fx: FOV 0 over 2 s · Billboard (0.5 s) · Circle Glow (0.3 s)
   65  WAIT 1

Branch "OnHitTargetLast"
      fx: sound 138269694368715 ×2 · sound 104447550323585 ×0.3
    2  STATE Stun for 1 s
    3  STATE DirectionLock for 1.5 s
    4  VELO TIME=0.8 FORCE="0, 0, 30" FADE=true
      fx: Flames · Clash (0.1 s) · Clash (0.1 s)
    8  ANIM [19,5] (Haruta.BackstabTargetFront) FADE OUT=0 SPEED=0.5

Branch "OnHitTargetPunch"
      fx: sound 137499859855978 ×1.5 · sound 104447550323585 ×0.8
    2  STATE Stun for 1 s
    3  STATE DirectionLock for 1 s
      fx: Shake Heavy · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s) · Flames
   12  ANIM [17,5] (Nanami.StabilizeTarget) FADE OUT=0 SPEED=1.5

Branch "FarHit"
    0  STATE Stun for 0.1 s (CANCEL ON END)
    1  STATE InSkill for 0.1 s (CANCEL ON END)
    2  VELO TIME=0.8 FORCE="0, 0, 43" LAST HIT=0.2 FADE=true
    3  VELO TRACK=true TIME=0.5 FORCE="0, 0, 13" FADE=true
    4  ANIM [6,17] (Mahito.Ultimate2) FADE OUT=0.3
    5  SETCD (its usual cooldown)
      fx: FOV 0 over 1 s · Mesh (0.5 s) · Mesh (0.3 s) · Whirl Slash (0.8 s) · Clash (0.2 s) · Shake Heavy · Mass Hit · Mass Hit · Mass Hit
   15  WAIT 0.3
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
