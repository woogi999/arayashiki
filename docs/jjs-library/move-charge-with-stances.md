# Hold to charge, then one of three stances (resource cost)

Tags: charge, hold, stances, rock paper scissors, resource, cost, meter, near far, projectile

Hold to charge (costs 7 of a resource). Release, and what comes out depends on
a stance tag: Rock (a big punch, a lunge if nobody's close), Paper (a
projectile), Scissors. Blocking while charging swaps stance
(passive-stance-swap-on-block). Needs passive-resource-bar-and-regen for the
resource.

How it works:
- Line: `TAG check Charging → "-"` (already charging: ignore),
  **`TAG check Nen "<7" → NotEnoughNen`** (a "need 7" billboard and a short
  cooldown), then `ShowCheck`.
- ShowCheck: shows the current stance (`JajankenStyle` 1/2/3) and goes to
  `ChargeSkill`.
- ChargeSkill: locks you (`SpeedMultiplier 0`, `NoM1`… with `CANCEL ON END`),
  sets `Charging`, a slowed anim, then a **held loop**: every 0.2 s add 1 to
  `HoldPercent` and top the states up (`LOOP back 9 × 13, while held`). After
  it: `TAG check HoldPercent ">6" → JajankenCheck`, else `Cancel`.
- JajankenCheck (only when NOT HOLD, i.e. released): pay the cost (`TAG add
  Nen += -7`), clear `Charging`, pick by `JajankenStyle`: 1 → `RockCheck`
  (a 12×12×12 detector: close → `RockClose`, else `Rock` with a lunge),
  2 → `Paper` (a projectile), 3 → `Scissors`.
- Cancel (released early): refund part (`-3` rather than `-7`), clear tags,
  play the charge anim backwards (`ANIM SPEED -1`).

Reuse it for: charged moves, a move that costs a resource, stances or modes
held in a tag, early-release cancels.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `needs-fixing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 3: "Jajanken [Block to Swap]"

Cooldown 0.75 · Properties: NOSTUN, AWK

```text
Line (runs on use)
    0  TAG check Charging "True" → "-"
    1  TAG check Nen "<7" → "NotEnoughNen"
    2  BRANCH → "ShowCheck"

Branch "RockClose"
    0  STATE Stun for 0.75 s (CANCEL ON END)
    1  SETCD (its usual cooldown)
    2  TAG set BlinkVar = "True" for 1.25 s
    3  TAG clear HoldPercent
      fx: sound 138556005625982 ×2 · sound 122474599750750 ×2
    6  ANIM [16,4] (Naoya.DecisiveStrike) SPEED=0.7 FADE OUT=0.3
      fx: Screen Color (0.499 s) · Cancel "JajankenCharge" · Cancel "JajankenCharge"
   10  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   14  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1
   17  WAIT 0.5
   18  VELO TRACK=true TIME=0.8 FORCE="0, 0, 15" FADE=true
   19  STATE DirectionLock for 0.75 s
   20  BRANCH → ">Actual Effects"
      fx: particle 16676544947 ×5 · particle 8214516794 ×3 · particle 14050526759 ×6 · Mesh (0.5 s) · Mesh · Mesh (0.1 s) · Mesh (0.05 s) · Light (0.05 s) · Light (0.4 s) · Wind Streak (0.15 s) · Wind Streak (0.15 s) · Mesh (2.3 s) · Screen Color (0.75 s)
   34  HITBOX DAMAGE=10 CAN KILL=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=2 DEBREE=3 POSITION="0, 0, 12" BRANCH TARGET="RockTarget" HIT RAGDOLL=true SIZE="11, 11, 23" STUN ANIM=true CLEAR KNOCKBACK=true CANCEL ENEMY=true BRANCH="RockHit" IGNORE WAKEUP=true
      fx: Shake Medium · FOV 0 over 3 s
   37  WAIT 1

Branch "JajankenCheck" — only if not HOLD
    0  TAG add Nen += -7 (for forever)
    1  TAG clear Charging
    2  TAG check JajankenStyle "1" → "RockCheck"
    3  TAG check JajankenStyle "2" → "Paper"
    4  TAG check JajankenStyle "3" → "Scissors"
    5  BRANCH → "Cancel"

Branch "NotEnoughNen"
      fx: Cancel "Need7Nen" · Billboard (tag "Need7Nen", 0.3 s) · sound 121577114498111
    3  SETCD to 0.2 s

Branch "ChargeSkill"
    0  STATE SpeedMultiplier = 0 for 0.5 s (CANCEL ON END)
    1  STATE NoM1 for 0.5 s (CANCEL ON END)
    2  STATE NoJump for 0.5 s (CANCEL ON END)
    3  STATE NoDash for 0.5 s (CANCEL ON END)
    4  STATE DisableChase for 0.5 s (CANCEL ON END)
    5  TAG set Charging = "True" for 0.5 s
      fx: sound 71219485680485 ×2 · sound 100719595855360 ×0.75 · sound 132059531098537 ×1.5
    9  VELO TRACK=true TIME=0.5 FORCE="0, 0, -5"
   10  ANIM [2,4] (Itadori.Variants.DivergentFist1) FADE OUT=0 SPEED=0.5
   11  WAIT 0.2
   12  ANIM [2,4] (Itadori.Variants.DivergentFist1) FADE OUT=0 SPEED=0.05
      fx: FOV -15 over 1 s · Shake Medium · Screen Color (tag "JajankenCharge", 1.5 s)
   16  BRANCH → ">Burst Effects"
      fx: particle 10365552890 ×1 · Mesh · Light (0.3 s) · Light (0.05 s) · Cursed Energy (tag "JajankenCharge", Right Arm, 2 s) · Clash (Right Arm, 0.1 s) · Distortion (Right Arm, 0.5 s) · particle 15267978808 ×1 · particle 11828156780 ×1
   26  BRANCH → ">Wind"
      fx: particle 80599775746898 ×1 · particle 14412529554 ×1 · particle 16950679789 ×1 · particle 15268221891 ×1
   31  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   35  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1
   38  WAIT 0.1
   39  WAIT 0.1
   40  TAG add HoldPercent += 1 (for 1 s)
   41  STATE SpeedMultiplier = 0 for 0.5 s (CANCEL ON END)
   42  STATE NoM1 for 0.5 s (CANCEL ON END)
   43  STATE NoJump for 0.5 s (CANCEL ON END)
   44  STATE NoDash for 0.5 s (CANCEL ON END)
   45  STATE DisableChase for 0.5 s (CANCEL ON END)
   46  TAG set Charging = "True" for 0.2 s
      fx: Shake Light
   48  LOOP back 9 × 13, while held
   49  BRANCH → ">Last Effect"
      fx: particle 11828156780 ×1
   51  BRANCH → ">Wind"
      fx: particle 14412529554 ×1 · particle 16950679789 ×1 · particle 15268221891 ×1
   55  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   59  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1
   62  BRANCH → ">last"
      fx: particle 0
   64  TAG check HoldPercent ">6" → "JajankenCheck"
   65  BRANCH → "Cancel"
   66  BRANCH → ">Extended Hold"
      fx: Screen Color (tag "JajankenCharge", 0.5 s) · Screen Color (tag "JajankenCharge", 1.5 s) · Shake Medium · FOV 7 over 2 s · Overlay (2 s)
   72  BRANCH → ">Burst Effects"
      fx: particle 10365552890 ×1 · Mesh · Light (0.3 s) · Light (0.05 s) · Cursed Energy (tag "JajankenCharge", Right Arm, 2 s) · Clash (Right Arm, 0.1 s) · Distortion (Right Arm, 0.5 s) · particle 15267978808 ×1 · particle 11828156780 ×1
   82  BRANCH → ">Wind"
      fx: particle 80599775746898 ×1 · particle 14412529554 ×1 · particle 16950679789 ×1 · particle 15268221891 ×1
   87  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   91  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1
   94  WAIT 0.1
   95  WAIT 0.1
   96  TAG add HoldPercent += 1 (for 1 s)
   97  STATE SpeedMultiplier = 0 for 0.5 s (CANCEL ON END)
   98  STATE NoM1 for 0.5 s (CANCEL ON END)
   99  STATE NoJump for 0.5 s (CANCEL ON END)
  100  STATE NoDash for 0.5 s (CANCEL ON END)
  101  STATE DisableChase for 0.5 s (CANCEL ON END)
  102  TAG set Charging = "True" for 0.2 s
      fx: Shake Light
  104  LOOP back 9 × 13, while held
  105  BRANCH → ">Last Effect"
      fx: particle 11828156780 ×1
  107  BRANCH → ">Wind"
      fx: particle 80599775746898 ×1 · particle 14412529554 ×1 · particle 16950679789 ×1 · particle 15268221891 ×1
  112  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
  116  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1
  119  BRANCH → ">Last Hold Check"
      fx: particle 0
  121  TAG check HoldPercent ">6" → "JajankenCheck"
  122  TAG clear HoldPercent
  123  BRANCH → "Cancel"

Branch "Cancel" — only if not HOLD
    0  TAG add Nen += -3 (for forever)
    1  TAG set BlinkVar = "True" for 0.5 s
    2  TAG clear Charging
      fx: Screen Color (0.2 s) · Overlay (2 s) · Cancel "JajankenCharge" · Cancel "JajankenCharge" · FOV 0 over 1.5 s · sound 137955546699156 ×5
    9  TAG clear HoldPercent
   10  ANIM [2,4] (Itadori.Variants.DivergentFist1) SPEED=-1 FADE OUT=0.25

Branch "ShowRock"
      fx: Billboard (0.6 s) · Glow (0.7 s)
    2  BRANCH → "ChargeSkill"

Branch "Paper"
    0  STATE Stun for 0.75 s (CANCEL ON END)
    1  SETCD (its usual cooldown)
    2  TAG set BlinkVar = "True" for 1.5 s
    3  TAG clear HoldPercent
      fx: sound 138556005625982 ×2
    5  ANIM [18,3] (Goku.StaffExtend) FADE OUT=0.3
      fx: Screen Color (0.499 s) · Cancel "JajankenCharge" · Cancel "JajankenCharge"
    9  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   13  BRANCH → ">shine"
      fx: particle 14684195806 ×1 · particle 14684195806 ×1 · sound 104029275121774 ×1.5
   17  WAIT 0.4
   18  STATE DirectionLock for 0.85 s
   19  WAIT 0.1
   20  BRANCH → ">Actual Effects"
      fx: particle 16676544947 ×5 · particle 14050526759 ×6 · Mesh · Mesh (2.3 s) · Screen Color (0.75 s)
   26  PROJECTILE DAMAGE=5 SPEED=53 CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Bullet" CLEAR KNOCKBACK=true STUN=1 IGNORE WAKEUP=true CACHE=true BRANCH TARGET="PaperTarget" POSITION="0, 0, 4" HIT RAGDOLL=true STUN ANIM=true TIME=2 SIZE="6, 6, 6" CAN KILL=true PROJECTILE TAG="Paper"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1 · Cursed Energy (on Paper, 2 s) · Shake Light · FOV 0 over 3 s
   33  WAIT 1

Branch "RockTarget"
    0  VELO TIME=0.2 FORCE="0, 15, 53" RAGDOLL=2
    1  STATE Stun for 1 s
      fx: Overlay (2 s) · Glow (0.7 s) · Glow · Shake Heavy · Screen Color (0.05 s) · Screen Color (0.75 s) · Distortion (0.5 s) · Light (0.3 s) · Clash (0.1 s) · Melee Trail (Right Arm, 0.5 s) · Melee Trail (Left Arm, 0.5 s) · Melee Trail (Right Leg, 0.5 s) · Melee Trail (Left Leg, 0.5 s) · particle 16678929169 ×1 · particle 16937107174 ×1 · sound 111412627816301 ×0.75 · sound 137801102288848 ×2
   19  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   23  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   27  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   31  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1
   35  BRANCH → ">Fiery"
      fx: particle 16668936898 ×1 · particle 16669046762 ×1 · particle 16676544947 ×1

Branch "ShowCheck"
    0  STATE Stun for 0.2 s
    1  TAG check JajankenStyle "1" → "ShowRock"
    2  TAG check JajankenStyle "2" → "ShowPaper"
    3  TAG check JajankenStyle "3" → "ShowScissors"

Branch "RockCheck"
    0  HITBOX DAMAGE=0 CAN KILL=false BLOCKABLE=false ATTACK TYPE="Domain" STUN=0 POSITION="0, 0, 5" IGNORE WAKEUP=true HIT RAGDOLL=true SIZE="12, 12, 12" BRANCH="RockClose"
    1  BRANCH → "Rock"
```

Not shown (8 more branches, all in the code): "Rock", "Scissors", "RockHit", "-", "PaperHit", "PaperTarget", "ShowScissors", "ShowPaper".

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
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
```
