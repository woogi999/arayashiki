# Skill template: a key that does nothing while charging

Tags: template, guard, charging, cooldown, starter

The starting point every skill in that moveset was copied from:
`TAG check Charging "True" → "-"`, then `BRANCH "1"`. Put the move in `1`.
`-` is `SETCD to 0`: while another move is charging, pressing this key
does nothing and costs no cooldown.

Reuse it for: any moveset where one move holds a state that others must
respect.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `accurate-m1s-gon-freeccs.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 0: "Skill Template"

Cooldown 0 · Properties: none

```text
Line (runs on use)
    0  TAG check Charging "True" → "-"
    1  BRANCH → "1"

Branch "1"

Branch "-"
    0  SETCD to 0 s
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WCsAOUHAEINKyMgyTgHKAn/Wf+lblJpG97qUbs6TPdTXa/vLZhwFUIMQAiArpJprx8NaHDvQavnnIn1GQYbpDisf6lTrk8poKJqoRCfqZA6/XipAtyC+BovlWX9hjUGOzCYs56Fr7BBvvoTSppUEYX56wMs6L9BnqM9iMtISc5XSWT9SkL18KXXCy7GEXiMe49ZE+uB5lyjIWisjpZoqiBEaJgm6QDyujmWY40LU2SwZphlGQkfAHwcEloCA7u0G6JVFotCOTBMi015VA2BSgCsDl0GbGZzM/Z+SHDYAFwXq8ODDFU1YVMuqoOkDQQGA42aYQdFN0TzJXCYV2nanCZmGQ==
```
