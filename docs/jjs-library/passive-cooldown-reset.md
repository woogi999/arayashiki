# Resets another skill’s cooldown when a tag is set

Tags: passive, cooldown, reset, setcd, tag

Also sets your size (`Scale 0.9`) and a starting stance for the whole match.
Every 0.05 s it checks `JajankenCD`; when a move sets it, it clears it and
resets key 3's cooldown (`SETCD KEY 3, COOLDOWN 0`).

Reuse it for: one skill refunding another's cooldown (`SETCD` with `KEY`),
permanent states on spawn (`TIME` forever).

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `accurate-m1s-gon-freeccs.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 99: "Blink Workaround"

Cooldown 0 · Properties: USE, AWK, NOCANCEL, AWK2, NOSTUN

```text
Line (runs on use)
    0  STATE Scale = 0.9 for forever
    1  TAG add JajankenStyle += 1 (for forever)
    2  BRANCH → "Passive"

Branch "ResetCD"
    0  TAG clear JajankenCD
    1  SETCD key 3 to 0 s
    2  BRANCH → "Passive"

Branch "Passive"
    0  TAG check JajankenCD "True" → "ResetCD"
    1  WAIT 0.05
    2  BRANCH → "Passive"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WDwAhUNADaSPSbwzFgHniAzQDUZZUBP0yDDRe6wO8yI3u7Qm5gGCFfDImwDz8Dz0TEAMQA0AOfK8M1xnxOFktL31mi4U6KUDyQhQG9XoDBNZTGVZkpgqEvGcfcI4fl2sepyh5C/qQQXQ9kGe2DALXs3FI5E8uRmbEJ7x8pVert3NwLGXbh3hDz1vbnURb6bpeLeDzd6b+4CkOG7rnUjhgTKVo53y6akSnQKQBPL+CY/OqGJ35LkvXFvB00VySAulmUjjzc5cixaxCVRAZbsd488NSEprW/PMp4GHAVWXVhVHfeukeHelAgtvPh4VsYWLACeR6JKLGtszoRCYhQAA0OowZVDzlBJklS2AyBCwtCRDxJgAykOcxgKlDI1M/mWWVisG9oyEDZBTxxbMae6OpU7mdYgvk1IKszrkft/oZUiUj0VXCRQmXfnV5GlJM+gbKjDC2FZ3rgoicLiHUAa2Rb1h5SSSCtUZPoC8fV2c2GoIODxWjDjbwRPsTqAQc8w/FmFXppa82DKFrKQaGUXo5vW6GL3WtgRCxDyNzfrg4IJv/8VqVpPL2o=
```
