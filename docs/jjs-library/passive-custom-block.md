# Custom block pose (and an awakened one)

Tags: passive, block, pose, animation, state check

Replaces the block animation: while you're blocking, a frozen pose plays; an
awakened pose when awakened.

How it works:
- A passive loop: `STATE check Block → Block` every tick (`TIME 0.05`), else
  loop.
- Block: `BRANCH AwakenedBlock` (ULT), then keep checking the block state.
- AwakenedBlock: `ANIM` at `SPEED 0` (a held pose), keep checking; when the
  block ends, `CancelAnim` plays the same animation at normal speed to finish
  it.

Reuse it for: reacting to any state (`STATE … CHECK true` jumps while it's
on), custom poses.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 9: "CustomBlock"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL

```text
Line (runs on use)
    0  BRANCH → "1Looper"

Branch "AwakenedBlock" — only if ULT
    0  ANIM [8,18] (Todo.Clap.Clap1) FADE IN=0 FADE OUT=0 SPEED=0
    1  STATE check Block → "AwakenedBlock"
    2  BRANCH → "CancelAnim"

Branch "Block"
    0  BRANCH → "AwakenedBlock"
    1  STATE check Block → "Block"
    2  BRANCH → "1Looper"

Branch "CancelAnim"
    0  ANIM [8,18] (Todo.Clap.Clap1) FADE IN=0 FADE OUT=0
    1  BRANCH → "1Looper"

Branch "1Looper"
    0  STATE check Block → "Block"
    1  BRANCH → "1Looper"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WAnBQ0PAMZVRiYArVgH1HMqKGD2z8h0PssVwAcrmc4+rcHDpFUDS4vL5/3//38IAToAPAA7ABP8ttxboUJRLs7bujtXfr6/OxQrIymtX4a7AZQyOqIDx/cMlcriNFQREBLv7vDB8ztJXCLcn4dvSQJMwBhYtKY1xggIaJrWMAVbFoGxAEKg974fcfJELcj3Tq53ldLbvXsnCAslwb2hKAnelsS9HyYIwkRNDJSTIc67chVgCvaIdUJmUkbCN/nVCCI5DJQOR/F5W3tNFm0Xkkg6gCh9IISi9zaA2GBqxLJKlLn3jAx8ApOLuc8IfSSl7/uLzsYR4SnViM4Ivx2qC/Red227TA5VJdtek6thgWLLVKEor7k3lCQXvNvxYOO9t/ECSKgBllFKhgKZKUqKhTEggqZUZQcSoKIgj2IgTQkUU4IRN8FUNNHEzISKHat/XZlSpBwGN/3ST4a4JJTk7FTJ3qjIJK2fhdQUCfs6ftUdgGxPlI+dnxiQHCztrw/b54gWH3/FpQfvpFJa1b4UOOiyrhbcx8TCnHmvn/SxvBIQEmIkm8b32KYVSVsV7Z06wlY+oMhnGNjkspymSS/4m4RHxO9NR25JsgCO+N05A7mLsL1iTBX9UJRS6GF3WwcYSFVEPFXPVAM=
```
