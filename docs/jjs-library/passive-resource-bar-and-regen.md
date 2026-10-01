# A resource bar (0 to 20) with regeneration

Tags: passive, resource, meter, bar, mana, energy, hud, regen, safety rails

A 21-step bar on the screen showing the `Nen` tag, kept between 0 and 20
(Safety Rails), and a regen passive adding 1 every 2.5 s. Moves spend it
(move-charge-with-stances costs 7). The Progress Bar workspace builds
this kind of bar from your own pictures.

How it works:
- Nen Bar: the `-` dispatcher checks `Nen == 20, 19, … 0` from the top and
  shows that step's picture (a `Billboard` tagged `Nen<N>`, worn forever,
  with every other step's tag cancelled). `"<0"` and `">20"` go to the Safety Rails,
  which **clear then set** the tag back into range.
- Nen Regen: `TAG add Nen += 1`, `WAIT 2.5`, loop.
- The handbook's "Displaying a value" section explains the bar step by step.

Reuse it for: any meter; spending a resource (`TAG check "<cost"`, then
`TAG add -cost`).

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `needs-fixing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 99: "Nen Bar"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL

```text
Line (runs on use)
    0  TAG add JajankenStyle += 1 (for forever)
    1  TAG add Nen += 20 (for forever)
    2  STATE Scale = 0.9 for forever
    3  BRANCH → "-"

Branch "0"
      fx: Billboard (tag "Nen0", forever) · Cancel "NenLesser" · Cancel "NenGreater" · Cancel "Nen1" · Cancel "Nen2" · Cancel "Nen3" · Cancel "Nen4" · Cancel "Nen5" · Cancel "Nen6" · Cancel "Nen7" · Cancel "Nen8" · Cancel "Nen9" · Cancel "Nen10" · Cancel "Nen11" · Cancel "Nen12" · Cancel "Nen13" · Cancel "Nen14" · Cancel "Nen15" · Cancel "Nen16" · Cancel "Nen17" · Cancel "Nen18" · Cancel "Nen19" · Cancel "Nen20"
   23  BRANCH → ">Exhausted"
      fx: sound 83989830855885 · sound 137683561404754 · sound 120008174551190 ×4
   27  ANIM [19,4] (Haruta.BackstabTargetBack) FADE OUT=0 SPEED=0.6
   28  STATE Stun for 2.5 s
   29  STATE DirectionLock = 0.3 for 2.5 s
   30  STATE SpeedMultiplier = 0.3 for 3.5 s
   31  STATE NoJump = 0.3 for 3.5 s
   32  STATE NoDash = 0.3 for 3.5 s
   33  STATE NoBlock = 0.3 for 3.5 s
      fx: Overlay (5 s)
   35  BRANCH → ">Checks"
   36  TAG check Nen "20" → "20"
   37  TAG check Nen "19" → "19"
   38  TAG check Nen "18" → "18"
   39  TAG check Nen "17" → "17"
   40  TAG check Nen "16" → "16"
   41  TAG check Nen "15" → "15"
   42  TAG check Nen "14" → "14"
   43  TAG check Nen "13" → "13"
   44  TAG check Nen "12" → "12"
   45  TAG check Nen "11" → "11"
   46  TAG check Nen "10" → "10"
   47  TAG check Nen "9" → "9"
   48  TAG check Nen "8" → "8"
   49  TAG check Nen "7" → "7"
   50  TAG check Nen "6" → "6"
   51  TAG check Nen "5" → "5"
   52  TAG check Nen "4" → "4"
   53  TAG check Nen "3" → "3"
   54  TAG check Nen "2" → "2"
   55  TAG check Nen "1" → "1"
   56  BRANCH → ">Safety Rails"
   57  TAG check Nen "<0" → "SafetyLesser"
   58  TAG check Nen ">20" → "SafetyGreater"
   59  WAIT 0.05
   60  LOOP back 25 × forever

Branch "1"
      fx: Billboard (tag "Nen1", forever) · Cancel "NenLesser" · Cancel "NenGreater" · Cancel "Nen0" · Cancel "Nen2" · Cancel "Nen3" · Cancel "Nen4" · Cancel "Nen5" · Cancel "Nen6" · Cancel "Nen7" · Cancel "Nen8" · Cancel "Nen9" · Cancel "Nen10" · Cancel "Nen11" · Cancel "Nen12" · Cancel "Nen13" · Cancel "Nen14" · Cancel "Nen15" · Cancel "Nen16" · Cancel "Nen17" · Cancel "Nen18" · Cancel "Nen19" · Cancel "Nen20"
   23  BRANCH → ">Checks"
   24  TAG check Nen "20" → "20"
   25  TAG check Nen "19" → "19"
   26  TAG check Nen "18" → "18"
   27  TAG check Nen "17" → "17"
   28  TAG check Nen "16" → "16"
   29  TAG check Nen "15" → "15"
   30  TAG check Nen "14" → "14"
   31  TAG check Nen "13" → "13"
   32  TAG check Nen "12" → "12"
   33  TAG check Nen "11" → "11"
   34  TAG check Nen "10" → "10"
   35  TAG check Nen "9" → "9"
   36  TAG check Nen "8" → "8"
   37  TAG check Nen "7" → "7"
   38  TAG check Nen "6" → "6"
   39  TAG check Nen "5" → "5"
   40  TAG check Nen "4" → "4"
   41  TAG check Nen "3" → "3"
   42  TAG check Nen "2" → "2"
   43  TAG check Nen "0" → "0"
   44  BRANCH → ">Safety Rails"
   45  TAG check Nen "<0" → "SafetyLesser"
   46  TAG check Nen ">20" → "SafetyGreater"
   47  WAIT 0.05
   48  LOOP back 25 × forever

Branch "20"
      fx: Billboard (tag "Nen20", forever) · Cancel "NenLesser" · Cancel "NenGreater" · Cancel "Nen0" · Cancel "Nen1" · Cancel "Nen2" · Cancel "Nen3" · Cancel "Nen4" · Cancel "Nen5" · Cancel "Nen6" · Cancel "Nen7" · Cancel "Nen8" · Cancel "Nen9" · Cancel "Nen10" · Cancel "Nen11" · Cancel "Nen12" · Cancel "Nen13" · Cancel "Nen14" · Cancel "Nen15" · Cancel "Nen16" · Cancel "Nen17" · Cancel "Nen18" · Cancel "Nen19"
   23  BRANCH → ">Checks"
   24  TAG check Nen "19" → "19"
   25  TAG check Nen "18" → "18"
   26  TAG check Nen "17" → "17"
   27  TAG check Nen "16" → "16"
   28  TAG check Nen "15" → "15"
   29  TAG check Nen "14" → "14"
   30  TAG check Nen "13" → "13"
   31  TAG check Nen "12" → "12"
   32  TAG check Nen "11" → "11"
   33  TAG check Nen "10" → "10"
   34  TAG check Nen "9" → "9"
   35  TAG check Nen "8" → "8"
   36  TAG check Nen "7" → "7"
   37  TAG check Nen "6" → "6"
   38  TAG check Nen "5" → "5"
   39  TAG check Nen "4" → "4"
   40  TAG check Nen "3" → "3"
   41  TAG check Nen "2" → "2"
   42  TAG check Nen "1" → "1"
   43  TAG check Nen "0" → "0"
   44  BRANCH → ">Safety Rails"
   45  TAG check Nen "<0" → "SafetyLesser"
   46  TAG check Nen ">20" → "SafetyGreater"
   47  WAIT 0.05
   48  LOOP back 25 × forever

Branch "SafetyLesserHold"
    0  TAG clear Nen
    1  TAG set Nen = "0" for forever
    2  BRANCH → ">Checks"
    3  TAG check Nen "20" → "20"
    4  TAG check Nen "19" → "19"
    5  TAG check Nen "18" → "18"
    6  TAG check Nen "17" → "17"
    7  TAG check Nen "16" → "16"
    8  TAG check Nen "15" → "15"
    9  TAG check Nen "14" → "14"
   10  TAG check Nen "13" → "13"
   11  TAG check Nen "12" → "12"
   12  TAG check Nen "11" → "11"
   13  TAG check Nen "10" → "10"
   14  TAG check Nen "9" → "9"
   15  TAG check Nen "8" → "8"
   16  TAG check Nen "7" → "7"
   17  TAG check Nen "6" → "6"
   18  TAG check Nen "5" → "5"
   19  TAG check Nen "4" → "4"
   20  TAG check Nen "3" → "3"
   21  TAG check Nen "2" → "2"
   22  TAG check Nen "1" → "1"
   23  BRANCH → ">Safety Rails"
   24  TAG check Nen "<0" → "SafetyLesserHold"
   25  TAG check Nen ">20" → "SafetyGreater"
   26  WAIT 0.05
   27  LOOP back 25 × forever

Branch "SafetyLesser"
      fx: Billboard (tag "NenLesser", forever) · Cancel "Nen0" · Cancel "Nen1" · Cancel "Nen2" · Cancel "Nen3" · Cancel "Nen4" · Cancel "Nen5" · Cancel "Nen6" · Cancel "Nen7" · Cancel "Nen8" · Cancel "Nen9" · Cancel "Nen10" · Cancel "Nen11" · Cancel "Nen12" · Cancel "Nen13" · Cancel "Nen14" · Cancel "Nen15" · Cancel "Nen16" · Cancel "Nen17" · Cancel "Nen18" · Cancel "Nen19" · Cancel "Nen20"
   22  BRANCH → "SafetyLesserHold"

Branch "SafetyGreaterHold"
    0  TAG clear Nen
    1  TAG set Nen = "20" for forever
    2  BRANCH → ">Checks"
    3  TAG check Nen "19" → "19"
    4  TAG check Nen "18" → "18"
    5  TAG check Nen "17" → "17"
    6  TAG check Nen "16" → "16"
    7  TAG check Nen "15" → "15"
    8  TAG check Nen "14" → "14"
    9  TAG check Nen "13" → "13"
   10  TAG check Nen "12" → "12"
   11  TAG check Nen "11" → "11"
   12  TAG check Nen "10" → "10"
   13  TAG check Nen "9" → "9"
   14  TAG check Nen "8" → "8"
   15  TAG check Nen "7" → "7"
   16  TAG check Nen "6" → "6"
   17  TAG check Nen "5" → "5"
   18  TAG check Nen "4" → "4"
   19  TAG check Nen "3" → "3"
   20  TAG check Nen "2" → "2"
   21  TAG check Nen "1" → "1"
   22  TAG check Nen "0" → "0"
   23  BRANCH → ">Safety Rails"
   24  TAG check Nen "<0" → "SafetyLesser"
   25  TAG check Nen ">20" → "SafetyGreaterHold"
   26  WAIT 0.05
   27  LOOP back 25 × forever

Branch "SafetyGreater"
      fx: Billboard (tag "NenGreater", forever) · Cancel "Nen0" · Cancel "Nen1" · Cancel "Nen2" · Cancel "Nen3" · Cancel "Nen4" · Cancel "Nen5" · Cancel "Nen6" · Cancel "Nen7" · Cancel "Nen8" · Cancel "Nen9" · Cancel "Nen10" · Cancel "Nen11" · Cancel "Nen12" · Cancel "Nen13" · Cancel "Nen14" · Cancel "Nen15" · Cancel "Nen16" · Cancel "Nen17" · Cancel "Nen18" · Cancel "Nen19" · Cancel "Nen20"
   22  BRANCH → "SafetyGreaterHold"

Branch "-"
    0  TAG check Nen "20" → "20"
    1  TAG check Nen "19" → "19"
    2  TAG check Nen "18" → "18"
    3  TAG check Nen "17" → "17"
    4  TAG check Nen "16" → "16"
    5  TAG check Nen "15" → "15"
    6  TAG check Nen "14" → "14"
    7  TAG check Nen "13" → "13"
    8  TAG check Nen "12" → "12"
    9  TAG check Nen "11" → "11"
   10  TAG check Nen "10" → "10"
   11  TAG check Nen "9" → "9"
   12  TAG check Nen "8" → "8"
   13  TAG check Nen "7" → "7"
   14  TAG check Nen "6" → "6"
   15  TAG check Nen "5" → "5"
   16  TAG check Nen "4" → "4"
   17  TAG check Nen "3" → "3"
   18  TAG check Nen "2" → "2"
   19  TAG check Nen "1" → "1"
   20  TAG check Nen "0" → "0"
   21  BRANCH → ">Safety Rails"
   22  TAG check Nen "<0" → "SafetyLesser"
   23  TAG check Nen ">20" → "SafetyGreater"
   24  BRANCH → "-"
```

Not shown (18 more branches, all in the code): "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19".
### SKILL on key 99: "Nen Regen"

Cooldown 0 · Properties: USE, REP2, NOSTUN, AWK2, AWK, NOCANCEL

```text
Line (runs on use)
    0  BRANCH → "-"

Branch "-"
    0  TAG add Nen += 1 (for forever)
    1  WAIT 2.5
    2  BRANCH → "-"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 2 skills.

```text
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
```
