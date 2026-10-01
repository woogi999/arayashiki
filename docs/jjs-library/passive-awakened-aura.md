# While awakened: a looping aura

Tags: passive, awakened, aura, visuals, loop, cancel

Beams and afterimages around you, every 0.1 s, while awakened; removed when
the awakening ends.

How it works:
- `1Looper`: `WAIT 0.1`, `BRANCH Awakened` (ULT), else `Cancel "Awakened"`
  (removes the aura's tagged visuals) and loop.
- Awakened: a billboard and cursed energy tagged `Awakened`, then three waves
  of `Beams` and an `Afterimage`, and back.

Reuse it for: auras, effects that show only in some state.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 9: "AwakenedVisuals"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL, KEEP

```text
Line (runs on use)
    0  BRANCH → "1Looper"

Branch "Awakened" — only if ULT
      fx: Billboard (0.4 s) · Cursed Energy (1.5 s) · Beams (Head, 1.5 s) · Beams (Torso, 1.5 s) · Beams (Right Arm, 1.5 s) · Beams (Left Arm, 1.5 s) · Beams (Right Leg, 1.5 s) · Beams (Left Leg, 1.5 s) · Afterimage (0.4 s)
    9  WAIT 0.1
      fx: Beams (Head, 1.5 s) · Beams (Torso, 1.5 s) · Beams (Right Arm, 1.5 s) · Beams (Left Arm, 1.5 s) · Beams (Right Leg, 1.5 s) · Beams (Left Leg, 1.5 s) · Afterimage (0.4 s)
   17  WAIT 0.1
      fx: Beams (Head, 1.5 s) · Beams (Torso, 1.5 s) · Beams (Right Arm, 1.5 s) · Beams (Left Arm, 1.5 s) · Beams (Right Leg, 1.5 s) · Beams (Left Leg, 1.5 s) · Afterimage (0.4 s)
   25  WAIT 0.1
   26  BRANCH → "Awakened"
   27  BRANCH → "1Looper"

Branch "1Looper"
    0  WAIT 0.1
    1  BRANCH → "Awakened"
      fx: Cancel "Awakened"
    3  BRANCH → "1Looper"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WAuM4UeAAYhaSfwzOgBHjh3w+Hl8Ex8cVYb5kWM9p2+EozP0sUCGS1MLjwMi8PiKwFbAFoAYQCV6pdlfz/K9lvb6nf8vV/XLnwh/p6qdfzeHMTfDz3vTfzNoHDxrPF78/GlltI/J/6VYMliPP8x4k+otfVBITz+vXbhGs2KVPrVGziE/PgUIu+/rsky8SVJ/uYgdqKpq06aq+QGbqUkTcBK4ck95+Kqpcb5ib/1rTBE/n6/3YsimLG2khFF0ANBCwjhAj650gVU/36MhBN/T3SdcsJUqtbi6a6cBPPK3HAQnB2ORqqWlubfDzIIiwhL1i/qKl3LNDPxZNxRQOgeDHjcYzCcaPE2PVU5U32rpfPKWck4lnC5WI1JHQ6ayfiUwbBcsbCLYzQEv7Oc3ETCDSsrqkYegErgNCVtppFMKXexu1VWJBxI1QpWgmb+DpTtP/5UtbMY63+/USh94AsfEnkrTeH7kEiqcsCyKW7OpStcfA5I7Zy3UbLugGH2gRHkHiQl3cIxVtYzCxJC7sEIWrpd6BaTSZdhsFhZgWkZph8Nw3uDdwcKQNA9R+CJAoDJqDEWQzMjkiSpFFoDQAJClJkhk3gSIIIcR1EwxyAQRyKGEAEhxBBDhIQICCECQgSERMp4A6aTDBJwiNU4hbUu/1ONmOlZDAxpdRc8EkbTJCa6eG3FH2SYdAmzacbhFbtyarcPICBLTOV8To96oObCTT5NCvblhBDmhHJQqiOURtDfHjciyXFbDiv6lZ6FhYmbgpLekJOeRE7LpQmK5BoJUUtsTwVQDAUKHvoqF2gzNBno5ox/Ae0J8dPJetrfTSKkhrkpCcJ7LKAnF/Ofh4Jy42Pu47FgjpzMfh8O0LunBC9zmd3ALA40ZJDtr99mts/+QxKeYsiZu91GgNZZx3z63XCd8pTPmxveKY/5vLrhO+15zysbrlOe7vl2TjN80ovKwZxIRuAg4ud8aMEU790F7csMR1nigs9lGSIVmCGKxSHCxAyh4oN2ANAsCKUDGPBy/wYrITQNNsGwlAiEviQoOxEoL39kdND3CzGAQBHbMCLBhRQNfK3dMF7SEB4HNtz/IbEa2M59A2Xaq+rK7jGxoC+acf8MbA9xfDMFLPEmFTaSCpuTTCnMAHzQZIELLghcmDEYBA8T1XiCWDyFEmXH3EraNM8AhcalgChYDluIsVDK7CAEzRbqgHdF04ZbQMTxIA0e/+UpIGIFWq4OjuLBffp6RGNrSFLjyUm/Wpw/ZE+mhv74bLCsZCkKykN2UuX5Tw2UhqrCz6c0ozA5YmqXqKiEDMUbuAo=
```
