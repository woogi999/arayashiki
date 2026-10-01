# Block while charging to cycle a stance tag

Tags: passive, stance, mode, swap, block, tag cycle, rock paper scissors

While `Charging` is set (move-charge-with-stances holds it), pressing block
cycles `JajankenStyle` 1 → 2 → 3 → 1 and shows the new stance.

How it works:
- `1Loop`: `TAG check Charging "True" → BlockCheck`, loop.
- BlockCheck: `STATE check Block → Swap`.
- Swap: `SKILL "Cancel"` (stops the block), `NoBlock` 0.15 s, then by the
  current value, `SwitchPaper`/`SwitchScissors`/`SwitchRock`: **clear then
  set** the tag to the next value (the sure way to set a tag), a billboard
  and sound, back to the loop.

Reuse it for: mode switches, cycling a value, using block as an input.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `needs-fixing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 99: "Swap Block"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL

```text
Line (runs on use)
    0  BRANCH → "1Loop"

Branch "Swap"
    0  SKILL SPEED=1 HOLD FOR=0 MOVE="Cancel" START=0 ENABLE VARIANTS=true CANCEL LAST=false
    1  STATE NoBlock for 0.15 s
    2  TAG check JajankenStyle "1" → "SwitchPaper"
    3  TAG check JajankenStyle "2" → "SwitchScissors"
    4  TAG check JajankenStyle "3" → "SwitchRock"

Branch "ShowPaper"
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    4  BRANCH → "BlockCheck"

Branch "SwitchPaper"
    0  TAG clear JajankenStyle
    1  TAG set JajankenStyle = "2" for forever
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    6  WAIT 0.1
    7  BRANCH → "1Loop"

Branch "BlockCheck"
    0  STATE check Block → "Swap"
    1  BRANCH → "1Loop"

Branch "SwitchRock"
    0  TAG clear JajankenStyle
    1  TAG set JajankenStyle = "1" for forever
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    6  WAIT 0.1
    7  BRANCH → "1Loop"

Branch "ShowRock"
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    4  BRANCH → "BlockCheck"

Branch "ShowScissors"
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    4  BRANCH → "BlockCheck"

Branch "SwitchScissors"
    0  TAG clear JajankenStyle
    1  TAG set JajankenStyle = "3" for forever
      fx: Billboard (0.6 s) · Glow (0.7 s) · sound 128745237817126 ×3 · sound 126045816584299
    6  WAIT 0.1
    7  BRANCH → "1Loop"

Branch "1Loop"
    0  TAG check Charging "True" → "BlockCheck"
    1  BRANCH → "1Loop"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WB4MZUrAMZqhifgzMwDFrGljIADpRqMIjheV5m8SG2Z3TIRGwUwvG4C4eEZZphhxjh4AHsAeQA6M2J2s+P7I7HvWa3arlA+Llx8fzq3UjxpxtFDMvHGd8YPyfy+t+8cLNQ6/fl+AcErv2PfHRRPvfjO6T7vfn8MCrDvD53+znnsJ5/ZPxD2WJKzmzP957qwn9R77ePg8c83UEDLIl64zX7sK2TifzpNmME+y+ZzCgK5ZvbeTCOeNEKyZsQasXzeqgnsBqxsSUeYEMRgPMoOuwunVSgZb7O/Y50lIrO/ruHjGDiBxuS16oAsmw9aHVR+3+6MgPg7BmAdsfLJ9yQTEMTyDNeIs94W22bfOU+nw1g4hT1v3BxPq2ck1ruYuHI9+bZ0lI+j3yMZ0gMJbdO6cmwpHoKGfr8TvhNCDkSwWLwFrQxGndu2kQxXe2nIaRkQ1Ake+HEOGsd3LU6yTCUgBfZd14iuG286o8m0apvFBrZ7VgnA7qzFB/qeLZ8868gv3jJkxmeaou830/hIgO8x8itZMpIsWUUXRV1S6o0PVD7hlk4tBp1/7DXL482Z//OdTqcJ+cLnLYRchUqSJFWUNFESJBWUJDdgJZLSJFGyUigmqLouyJJTIhOykpbUyQhroHQV+v26IoU1UdKaFBAlI7nItwFZKpKVtCopmhSVFUm73RwZYOwnSkBbjjWbDGiycF7m6z7wAlE3oKVRSQiS0JSAroFKqDGaIRoREUmSFLIcUQQEQRSSSkrtBhLA8TCMxEiQgiijjDGEEEMMIcQQEZERCUZGhFhjrOeTg6GpAGn/ujn6V4eeNNMLCP5YewoeilEc6anP6qkC9Mr1/e763PRQZ8pyO2ffQz1wpgBVhI7v+T2nllQ9rPRH1n42yEBPe5blfXy9EHv2uF6OvNwcLHnlmIujknJwA3F/6ngLxS+xz4s/oP3hWzb8PAiQbu2BwFAi8V8nd0n8TId9NRRXoDKvBtaokVb6rZ5MqJRvEZb5S+d7f6iSocloY/qlwwJ72C9t9az4IrD15ULMofEFYrkZIVJZUD7vOllzRK3Osn8Cvi7h7wO+TFN1ELRNtY21Q2g6iYbx8v4ROQgpPplHrSN8KTxnKUUEJAtZ0xg22ANCtBQA54TsNgsWUUgeYfiyYTAOLkbJyUHQChnrAnuvd79A47VGQAnX+fboaKOPpAtI2gjMg+1PUBjH9sm5eLX0GT+eh3WJ4QlqvxvdjZZ+iSU3oDJL2u/LHaCBqUaAwlWQWfor/bTLOOv8aZsDT/yDnmQuyQdy/WLOnyl4NpW9HrjBKf1qlEXu6LBZzA4buATjhdNY+Bu0rU+DsOGNE1teRDSzHcth1VsoPD9sP7S/WmDhLw5LGQSM6wBuHIxyQKJo4FEShZI+DuJqBTiGvXBmz1MLY5DYFnoojLBwWTbdfEUAVRIRagUP0tBgIuyt3bOrzMiXFXeBjDpAA/OQUYFLyFCZIdJgfXNmx8XXvY7yrE6xkB5QBmNwnhHDJeM09nAgc8E1VgJoh9oaaqj95kAcgBqiUi4fqJMlapSnQUccUuAHqATK0n6fsBTWzg51kH0s9N6YYm68FS+SoDxugrK3aUAPGqY/n48+iO7wMLtfArkecoHZhU8t5tI5gNMvw7jqe2ptyhipsf9wRi/YniCLeW6TI8DQhecrY7zGKbTrWL6PBAE43C3/XmWUzjVB2bx5bSCv6YrmzfUohA1n2tlNc0Cpca86oYfnsc9lBN4oSTRdjqsB3nLs+uzslokNgMI04cZZpJP2Na5TScjN9LgLkInHk/LAASIGGRTyZL1XsJ/JAHqW19Pa67MkI7D0abVBHbLSxGCTKe4RYz6iKr83f/9Q1F5nlgQ1
```
