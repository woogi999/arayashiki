# Lunging punch with a finisher variant

Tags: punch, lunge, heavy hit, finisher, kill, grab, beam, knockback

A wind-up, a long lunge (`"0, 0, 90"` for 0.9 s) with a detector, then an
18-damage hit that holds them, freezes the pose and blasts them away. If the
hit would kill, a finisher version sends them much further.

How it works:
- Line: back up `"0, 0, -10"`, `WAIT 0.4`, lunge, detector (`HITBOX → OnHit`,
  `WAIT 0.1`, `LOOP` × 6).
- OnHit: the real hit, with **`BRANCH FINISHER "OnHitFinisher"`** (used
  instead of `BRANCH` when they're left on 1 HP or less). Then `GRAB` them in
  front 0.4 s, a hitch in the animation (`ANIM SPEED 0` for 0.3 s), and knock
  them `"0, 10, 60"`; a 25×25×50 debris box and beams down the line.
- OnHitFinisher: the same, knocking them `"0, 10, 200"`.

Reuse it for: finisher versions of a move (`BRANCH FINISHER`), a hit-stop
freeze, lunges.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 1: "Eat fist, Mascot!"

Cooldown 17 · Properties: REP, AWK2, NOSTUN, KEEP

```text
Line (runs on use)
    0  STATE Stun for 1.5 s
      fx: sound 100028253760589 ×3 · sound 100955761804052 ×2.3 · FOV -20
    4  VELO TRACK=true TIME=0.3 FORCE="0, 0, -10" FADE=true
    5  ANIM [6,11] (Mahito.IdleTransfig) SPEED=1.4
    6  WAIT 0.4
      fx: sound 137322083927464 ×1.5 · Wind Streak (0.5 s) · Wind Streak (0.5 s) · Shake Heavy · FOV 40 over 2 s · Screen Color (0.05 s) · Screen Color (0.3 s) · Wind Expand
   15  VELO TRACK=true TIME=0.9 FORCE="0, 0, 90" FADE=true
   16  ANIM [1,19] (Gojo.Melee.Chase)
      fx: Mesh (0.5 s)
   18  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false STUN=0 POSITION="0, 2, 6" HIT RAGDOLL=true SIZE="12, 9, 15" BRANCH="OnHit"
   19  WAIT 0.1
   20  LOOP back 3 × 6
   21  STATE DirectionLock for 0.5 s
      fx: FOV 0 over 2 s
   23  ANIM [8,2] (Todo.BruteForce) FADE OUT=0.2

Branch "OnHitTarget"
    0  ANIM [2,2] (Itadori.CursedStrikeHit) FADE OUT=0 SPEED=0.6
      fx: Distortion (0.4 s) · FOV -15 over 1 s · Beams (0.6 s) · Circle Glow (0.6 s)
    5  WAIT 0.5
      fx: sound 9113225986 ×2 · sound 73783611925162 ×2 · sound 101781549792382 ×2 · Screen Color (0.05 s) · Screen Color · Billboard (1.2 s) · Billboard (1.2 s) · Billboard (0.3 s) · Clash (0.1 s) · Clash (0.1 s) · Clash (0.1 s) · Sparks (0.5 s) · Sparks (0.5 s) · Sparks (0.5 s) · Glow (0.2 s) · Glow (0.2 s) · Mesh (0.3 s) · Circle Glow (0.15 s) · Shake Heavy · FOV 0 over 1 s · Light (0.3 s) · Distortion (0.5 s) · Distortion (0.5 s)

Branch "OnHitFinisher"
    0  GRAB POSITION="0, 0, 6" LAST HIT=0.3 TIME=0.4
    1  STATE DirectionLock for 1.3 s
      fx: FOV -30 over 1 s · Screen Color (0.5 s) · Overlay (0.5 s) · sound 113760812587530 ×2 · sound 140684498459080 ×3
    7  VELO RELATIVE FROM BRANCH=false TIME=0.5 FORCE="0, 0.001, 30" FADE=true
    8  ANIM [8,2] (Todo.BruteForce) FADE OUT=0.2
    9  WAIT 0.2
   10  ANIM [8,2] (Todo.BruteForce) SPEED=0 FADE OUT=0.2 LOOPED=true
   11  WAIT 0.3
   12  ANIM [8,2] (Todo.BruteForce) FADE OUT=0.2
   13  VELO TIME=0.2 FORCE="0, 10, 200" RAGDOLL=1.5 LAST HIT=1
   14  STATE Stun for 0.4 s
      fx: sound 90262831981998 ×3
   16  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 DEBREE=3 POSITION="0, 0, 25" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="25, 25, 50"
      fx: Clash (0.1 s) · Clash (0.1 s) · Beam (0.05 s) · Beam (0.05 s) · Wind Expand · Wind Expand · Wind Expand · Screen Color (0.05 s) · Screen Color · Shake Heavy · Light · Light · Light · Weak Lightning · Weak Lightning (0.3 s) · Weak Lightning (0.3 s) · Weak Lightning (0.2 s)
   34  WAIT 0.3
      fx: FOV 0 over 2 s
   36  WAIT 0.6

Branch "OnHit"
    0  HITBOX DAMAGE=18 CAN KILL=true BLOCKABLE=true ATTACK TYPE="Melee" STUN=1.5 BRANCH FINISHER="OnHitFinisher" POSITION="0, 2, 6" CLEAR KNOCKBACK=true IGNORE WAKEUP=true HIT RAGDOLL=true SIZE="13, 9, 20" STUN ANIM=true CANCEL ENEMY=true BRANCH TARGET="OnHitTarget"
    1  GRAB POSITION="0, 0, 6" LAST HIT=0.3 TIME=0.4
    2  STATE DirectionLock for 1.3 s
      fx: FOV -30 over 1 s · Screen Color (0.5 s) · Overlay (0.5 s) · sound 113760812587530 ×2 · sound 140684498459080 ×3
    8  VELO RELATIVE FROM BRANCH=false TIME=0.5 FORCE="0, 0.001, 30" FADE=true
    9  ANIM [8,2] (Todo.BruteForce) FADE OUT=0.2
   10  WAIT 0.2
   11  ANIM [8,2] (Todo.BruteForce) SPEED=0 FADE OUT=0.2 LOOPED=true
   12  WAIT 0.3
   13  ANIM [8,2] (Todo.BruteForce) FADE OUT=0.2
   14  VELO TIME=0.2 FORCE="0, 10, 60" RAGDOLL=1.5 LAST HIT=1
   15  STATE Stun for 0.4 s
      fx: sound 90262831981998 ×3
   17  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 DEBREE=3 POSITION="0, 0, 25" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="25, 25, 50"
      fx: Clash (0.1 s) · Clash (0.1 s) · Beam (0.05 s) · Beam (0.05 s) · Wind Expand · Wind Expand · Wind Expand · Screen Color (0.05 s) · Screen Color · Shake Heavy · Light · Light · Light · Weak Lightning · Weak Lightning (0.3 s) · Weak Lightning (0.3 s) · Weak Lightning (0.2 s)
   35  WAIT 0.3
      fx: FOV 0 over 2 s
   37  WAIT 0.6
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
