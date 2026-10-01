# Wind-up, flying dropkick, pin and kick away

Tags: dropkick, kick, lunge, flying, pin, grab, knockback

Hop back, then fly forward feet first; on contact you ride them along for a
moment, then kick off them, sending them away and you back.

How it works:
- Base: stun 1.8 s, set `CancelChase`, hop back `"0, 0, -30"`, `WAIT 0.6`,
  then **`VELO "0, 10, 70"` for 0.4 s** with a 12-damage hitbox checked 5
  times 0.1 s apart, then a falling `"0, -30, 70"` part checked 5 more.
- OnHit: stun and `DirectionLock` you both (`LAST HIT 0.2` for them),
  `GRAB` them below you for 0.2 s, **slide together**: the same
  `VELO "0.001, 0.001, 20"` TRUE RAGDOLL on you and on them, freeze your
  pose (`ANIM SPEED 0`), `WAIT 0.5`, then kick them `"0, 5, 50"` and push
  yourself `"0, 50, -30"`.

Reuse it for: moving together with the one hit (the same VELO on both), a
two-phase lunge, kick-offs.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 4: "Anti-Esper Dropkick"

Cooldown 20 · Properties: REP, AWK, KEEP

```text
Line (runs on use)
    0  BRANCH → "Base"

Branch "OnHit"
    0  STATE Stun for 1 s
    1  STATE Stun for 1 s on the one hit (LAST HIT 0.2)
    2  STATE DirectionLock for 1 s
    3  STATE DirectionLock for 1 s on the one hit (LAST HIT 0.2)
    4  GRAB POSITION="0, -2.7, 1" LAST HIT=0.2 TIME=0.2
    5  VELO TIME=0.5 TRUE RAGDOLL=true FORCE="0.001, 0.001, 20" FADE=true
    6  VELO TIME=0.5 TRUE RAGDOLL=true FORCE="0.001, 0.001, 20" LAST HIT=0.2 FADE=true
      fx: sound 82268741947997 ×2
    8  ANIM [4,12] (Megumi.ShadowSwarmHit) FADE OUT=0 LAST HIT=0.2 SPEED=0.1
      fx: Screen Color (0.05 s) · Screen Color (0.5 s) · FOV -20 over 1 s
   12  ANIM [6,4] (Mahito.DrillSplit) FADE IN=0 FADE OUT=0 SPEED=0 LOOPED=true
   13  WAIT 0.5
   14  ANIM [13,5] (Yuta.Veilstep) FADE OUT=0 SPEED=2
   15  VELO TIME=0.2 FORCE="0, 5, 50" RAGDOLL=1.2 LAST HIT=1.5
   16  VELO TRACK=true TIME=0.2 FORCE="0, 50, -30"
      fx: Screen Color (0.05 s) · Shake Heavy · Circle Glow (0.1 s) · Wind Expand · Wind Expand (0.6 s) · 360 Wind (0.6 s) · 360 Wind (0.6 s) · Wind Expand · Wind Expand · Mesh (0.3 s)
   27  WAIT 0.2
      fx: FOV 0 over 2 s

Branch "Base"
    0  STATE Stun for 1.8 s
    1  TAG set CancelChase = "True" for 1 s
    2  VELO TIME=0.45 FORCE="0, 0, -30" FADE=true
      fx: FOV -15 over 0.8 s · sound 100319271621569 ×1.5
    5  ANIM [7,6] (Choso.PlasmaWave) FADE OUT=0.4
    6  WAIT 0.6
    7  STATE DirectionLock for 1.3 s
    8  ANIM [6,4] (Mahito.DrillSplit) FADE OUT=0.4 SPEED=1.2
      fx: sound 93151948309429 ×2 · Wind Streak (0.4 s) · Wind Streak (0.4 s) · FOV 20 over 1 s
   13  VELO TIME=0.4 FORCE="0, 10, 70"
      fx: Mesh (0.5 s) · Afterimage
   16  HITBOX DAMAGE=12 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=false STUN ANIM=true STUN=1.5 POSITION="0, -2, 4" SIZE="7, 11, 8" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false ATTACK TYPE="Melee" IGNORE WAKEUP=true CAN KILL=true BRANCH="OnHit" CLEAR KNOCKBACK=true
   17  WAIT 0.1
   18  LOOP back 4 × 4
   19  VELO TIME=0.2 FORCE="0, -30, 70" FADE=true
      fx: Mesh (0.5 s) · Wind Expand (0.3 s)
   22  HITBOX DAMAGE=12 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=false STUN ANIM=true STUN=1.5 POSITION="0, -2, 4" SIZE="7, 11, 8" BRANCH TARGET="OnHitTarget" HIT RAGDOLL=false ATTACK TYPE="Melee" IGNORE WAKEUP=true CAN KILL=true BRANCH="OnHit" CLEAR KNOCKBACK=true
   23  WAIT 0.05
   24  LOOP back 2 × 4
   25  WAIT 0.1
      fx: FOV 0 over 1 s
   27  STATE Stun for 0.3 s
   28  STATE SpeedMultiplier = 0.4 for 1 s
   29  ANIM [16,13] (Naoya.MoonPalace) FADE OUT=0.4 SPEED=1.4

Branch "OnHitTarget"
      fx: Screen Color (0.05 s) · Screen Color (0.5 s) · FOV -20 over 1 s
    3  WAIT 0.5
      fx: sound 95188236442257 ×5 · Screen Color (0.05 s) · Shake Heavy · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.2 s) · Glow (0.15 s) · Black Flash (0.1 s)
   14  WAIT 0.2
      fx: FOV 0 over 2 s
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
