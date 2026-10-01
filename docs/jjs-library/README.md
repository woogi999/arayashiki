# JJS move library

Ready-made Jujutsu Shenanigans Skill Builder moves, taken from real exports,
for reference when understanding or making a skill. When someone asks for a
move, **find the closest one here first and build from it**: copy its
structure, its timings and its numbers, and change what's different. That
keeps new moves consistent with how JJS's own and the owner's moves feel.

The node reference (what every node and field does, and what's confirmed or
inferred) is the handbook, [../jjs-skill-builder.md](../jjs-skill-builder.md).
This folder is the examples.

Every file has:

1. **What it does, how it works, what to reuse it for** (written by hand), with
   **Tags** to search by.
2. **Nodes**: every node of the skill in order, readably (generated).
3. **Code**: the exact skill, to import into the Skill Builder or decode for
   every field (generated).

Where these came from: `data/exports/` (gitignored; only on the owner's
machine). `npm run library` (`lib/build-jjs-library.mjs`) rebuilds parts 2
and 3 of every file and keeps part 1. To add a move, add its entry to that script, run it,
and write its part 1.

## Find a move by what it does

| You want | Look at |
|---|---|
| Go up, then slam down | [move-leap-and-slam-use-twice](move-leap-and-slam-use-twice.md) (its `UseTwice` branch), [move-grab-launch-slam](move-grab-launch-slam.md) |
| Launch someone up | [move-grab-launch-slam](move-grab-launch-slam.md), [move-uppercut-carry](move-uppercut-carry.md), [move-dash-grab-launch-special](move-dash-grab-launch-special.md), the M1 finishers' `Uppercut` |
| Spike someone down | [move-grab-launch-slam](move-grab-launch-slam.md), the M1 finishers' `Downslam` |
| A punch or slash string | [m1-string-base-game](m1-string-base-game.md), [m1-string-katana](m1-string-katana.md) |
| Dash, lunge, close the gap | [chase-base-game-with-blink](chase-base-game-with-blink.md), [chase-simple](chase-simple.md), [move-dash-strike-jump-variant](move-dash-strike-jump-variant.md), [move-dropkick](move-dropkick.md), [move-charge-punch-finisher](move-charge-punch-finisher.md), [move-dash-spin-slash](move-dash-spin-slash.md) |
| Grab and hold someone | [move-command-grab-cutscene](move-command-grab-cutscene.md), [move-uppercut-carry](move-uppercut-carry.md), [move-grab-launch-slam](move-grab-launch-slam.md), [move-dropkick](move-dropkick.md) |
| Many quick hits (barrage, rush) | [move-walking-barrage-with-dodge](move-walking-barrage-with-dodge.md), [move-close-or-far-rush](move-close-or-far-rush.md), [move-spinning-aoe](move-spinning-aoe.md) |
| Hit everything around you | [move-spinning-aoe](move-spinning-aoe.md), [move-dash-spin-slash](move-dash-spin-slash.md), the landing in [move-leap-and-slam-use-twice](move-leap-and-slam-use-twice.md), [awakening-meteor](awakening-meteor.md) |
| A projectile | [move-aimed-bouncing-projectile](move-aimed-bouncing-projectile.md), [move-projectile-possess](move-projectile-possess.md), [move-katana-slash-with-stacks](move-katana-slash-with-stacks.md) (tornado), [move-charge-with-stances](move-charge-with-stances.md) (`Paper`), [awakening-meteor](awakening-meteor.md) |
| Hold the key (charge, walk) | [move-charge-with-stances](move-charge-with-stances.md), [move-walking-barrage-with-dodge](move-walking-barrage-with-dodge.md) |
| Dodge, i-frames, counter | [move-afterimage-dodge](move-afterimage-dodge.md), [passive-awakened-dodge-counter](passive-awakened-dodge-counter.md), [move-walking-barrage-with-dodge](move-walking-barrage-with-dodge.md) (`COUNTER`), the `Blink` in [chase-base-game-with-blink](chase-base-game-with-blink.md) |
| Use again, chains, stacks | [move-leap-and-slam-use-twice](move-leap-and-slam-use-twice.md), [move-three-stage-chain](move-three-stage-chain.md), [move-katana-slash-with-stacks](move-katana-slash-with-stacks.md) |
| A different version when jumping or in the air | the M1 finishers, [move-dash-strike-jump-variant](move-dash-strike-jump-variant.md), [chase-base-game-with-blink](chase-base-game-with-blink.md) (`Air`), [move-fishing-rod-grapple](move-fishing-rod-grapple.md) (`Air1`) |
| A different version close up or far away | [move-close-or-far-rush](move-close-or-far-rush.md), [move-charge-with-stances](move-charge-with-stances.md) (`RockCheck`) |
| A finisher (when the hit kills) | [move-charge-punch-finisher](move-charge-punch-finisher.md), [move-command-grab-cutscene](move-command-grab-cutscene.md), [move-close-or-far-rush](move-close-or-far-rush.md) |
| A cutscene, teleports | [move-close-or-far-rush](move-close-or-far-rush.md), [move-command-grab-cutscene](move-command-grab-cutscene.md), [awakening-meteor](awakening-meteor.md) |
| Find walls or the ground; hooks and pulls | [move-fishing-rod-grapple](move-fishing-rod-grapple.md) |
| A resource (mana, a meter) | [passive-resource-bar-and-regen](passive-resource-bar-and-regen.md), [move-charge-with-stances](move-charge-with-stances.md) (spending it) |
| Damage over time, a curse, damage through block | [move-projectile-possess](move-projectile-possess.md) (a target branch with `HPGIB`) |
| Cooldown tricks | [move-dash-strike-jump-variant](move-dash-strike-jump-variant.md), [move-three-stage-chain](move-three-stage-chain.md), [passive-cooldown-reset](passive-cooldown-reset.md), [skill-template-charging-guard](skill-template-charging-guard.md) |
| One move stopping another | [m1-string-chase-cancel](m1-string-chase-cancel.md), [chase-with-run-and-awakened](chase-with-run-and-awakened.md) |
| Awakened-only behaviour | [chase-with-run-and-awakened](chase-with-run-and-awakened.md), [passive-awakened-aura](passive-awakened-aura.md), [passive-awakened-dodge-counter](passive-awakened-dodge-counter.md), [passive-custom-block](passive-custom-block.md), [awakening-meteor](awakening-meteor.md) |
| Weapons, outfits, looks | [passive-auto-sheath](passive-auto-sheath.md), [m1-string-katana](m1-string-katana.md), [passive-cosmetics](passive-cosmetics.md) |
| A custom block | [passive-custom-block](passive-custom-block.md), [passive-stance-swap-on-block](passive-stance-swap-on-block.md) |

The Woogi Tools website also generates some of these, with forms (JJS Stuff
→ Templates, its `app/utils/jjs-templates.js`): Progress bar, Auto-sheathing weapon,
Accurate M1s, Accurate dash, and **Percentage damage** (a share of the
target's current or missing health, which isn't in any export here).

## The usual numbers

Taken from these moves; start from them unless the request says otherwise.

| What | Usual |
|---|---|
| M1 | swing, `WAIT 0.2`, hitbox `"7, 7, 6"` at `"0, 0.7, 4"`, 3 damage, `STUN 0.75`, blockable; `SpeedMultiplier 0.75` 0.5 s, `NoJump`/`NoDash` 0.4 s |
| M1 finisher | 4 damage, `STUN 1.2`, knockback `"0, 15, 23"` with `RAGDOLL 1.2`; uppercut `"0, 36–40, 2"`; downslam `"0, -50…-100, 5–20"`; then `NoM1` 1–1.3 s |
| Blocked recoil | the unblockable detector → a branch with 0.3–0.75 s of stun or slow anim |
| Dash | `VELO "0, 0, 55–85"` for 0.5–0.8 s, `TRACK` and `FADE`; a detector every 0.05 s, 5–9 times |
| Skill hit | 4–12 damage, `STUN 1–1.5`, `CANCEL ENEMY`, `CLEAR KNOCKBACK`; big ones 14–21; awakenings 20–80 |
| Knockback (a `VELO` with `LAST HIT`) | `"0, 5–15, 25–60"`, `RAGDOLL 1–1.5`; launch `"0, 40–85, 0–30"`; spike `"0, -50…-200, 5–90"` |
| Pin (hold still) | `VELO "0.001, 0.001, 0.001"` (or `"0, 0.001, 0"`) for the time |
| Your own lock during a skill | `Stun` (or `InSkill` with `NoJump`/`NoDash`/`SpeedMultiplier 0–0.4`) for about the move's length |
| Cooldowns | chase 6, skills 10–20, quick ones 3; awakening needs `BAR 99.99` |
| Hit effects on `OnHitTarget` | a sound, `Glow`, two `Clash`, `Sparks` (light); add `Circle Glow`, `Black Flash`, `Billboard`, `Screen Color`, `Shake Heavy` for heavy |
| Wind-up / impact camera | `Field of View` to -15…-35 before, +20 on the dash, back to 0 after |

## The patterns they share

- **The hit moves the line on.** A connecting hitbox jumps the line to its
  `BRANCH` (usually `OnHit`) and starts `BRANCH TARGET` (usually
  `OnHitTarget`: their effects) on the one hit. So a **detector** (0 damage,
  small stun, `BRANCH "HitCheck"`) in a `WAIT · LOOP` finds someone, and the
  real hit is in `HitCheck`.
- **Blocked recoil**: after the real hitbox, the same box again, 0 damage and
  unblockable, `BRANCH "Blocked"`. It only runs if the real one didn't land.
- **Variants**: the line is a list of `BRANCH`es to try (`Downslam` with
  `AIR`, `Uppercut` with `JUMP`, `Base`), or `TAG check`s (`UseTwice`,
  stances, stacks).
- **Tags carry state between skills**: set by one (`OnHit` sets
  `S3UseTwice`, the chase sets `Chase`), checked by another. Clear then set
  when it must take.
- **`LAST HIT`** makes a node act on the one you hit: a `VELO` (knockback), a
  `STATE` (their stun), an `ANIM` (their pose), a `GRAB`.
- **Effects** mostly ride on `HumanoidRootPart` or a limb; anything placed in
  the world hangs on an anchor projectile (`SPEED 0`, a `PROJECTILE TAG`).

## Reading the timelines

```text
Line (runs on use)
    0  TAG check S3UseTwice "1" → "UseTwice"
    1  BRANCH → "Base"

Branch "UseTwice"
   12  VELO TIME=0.2 FORCE="0, 70, 50"
      fx: Shake Heavy · Melee Trail (Right Arm, 0.5 s)
   17  VELO TRACK=true TIME=0.2 FORCE="0, -90, 120"
```

- The number is the node's index in its line (`LOOP BACK` counts these).
- `Branch "X" — only if AIR` is a branch with conditions (`not AIR` is
  flipped). `BRANCH → "X"` goes there if it exists and its conditions hold;
  otherwise the line carries on.
- `TAG check`, `TAG set … for`, `TAG clear`, `TAG add … +=` are the TAG
  node's four jobs; `STATE X for t` sets a state, `STATE check X → "Y"` tests
  it.
- Other nodes show their fields, leaving out the ones at their usual values
  (`LAST HIT -1`, `TRACK false`, `DEBREE 0`, …).
- `fx:` lines fold runs of effects: a visual's `EFFECT` (with its tag, body
  part and time when they're not the usual), `sound <id> ×volume`,
  `particle <texture>`, `FOV <amount>`. The exact fields are in the code.
- Directions are JJS's: x left, y up, z forward (see the handbook).
- `BRANCH → ">…"` names that don't exist are comments.

## Decoding

A code is base64 of zstd-compressed JSON: an array of skills, each with its
program as a JSON string in `DATA`. The easy way is the project's own tools,
which also write JJS's quirks back correctly ([MCP and CLI setup](../../README.md#connecting-an-mcp-client)):
the MCP server's `decode` / `describe` / `encode`, or

```sh
npm run sbs -- decode "<code>" --json     # the skills, DATA parsed
npm run sbs -- encode skills.json         # and back to a code
```

By hand, with Node 22.15 or later:

```sh
node -e "const z=require('zlib');const s=JSON.parse(z.zstdDecompressSync(Buffer.from(process.argv[1],'base64')));for(const k of s)console.log(k.NAME,JSON.stringify(JSON.parse(k.DATA),null,1))" "<code>"
```

To make a new code: build the skills (with `DATA` as a string), then
`zlib.zstdCompressSync(Buffer.from(JSON.stringify(skills))).toString('base64')`.
The handbook's section 1 lists the quirks JJS expects (`[]` for empty tables,
`1e38` for forever).

## All the moves

**M1 strings:** [m1-string-base-game](m1-string-base-game.md) ·
[m1-string-chase-cancel](m1-string-chase-cancel.md) ·
[m1-string-sets-tags](m1-string-sets-tags.md) ·
[m1-string-katana](m1-string-katana.md)

**Chases:** [chase-base-game-with-blink](chase-base-game-with-blink.md) ·
[chase-with-run-and-awakened](chase-with-run-and-awakened.md) ·
[chase-simple](chase-simple.md)

**Moves:** [move-leap-and-slam-use-twice](move-leap-and-slam-use-twice.md) ·
[move-grab-launch-slam](move-grab-launch-slam.md) ·
[move-uppercut-carry](move-uppercut-carry.md) ·
[move-dash-strike-jump-variant](move-dash-strike-jump-variant.md) ·
[move-dropkick](move-dropkick.md) ·
[move-charge-punch-finisher](move-charge-punch-finisher.md) ·
[move-close-or-far-rush](move-close-or-far-rush.md) ·
[move-walking-barrage-with-dodge](move-walking-barrage-with-dodge.md) ·
[move-command-grab-cutscene](move-command-grab-cutscene.md) ·
[move-spinning-aoe](move-spinning-aoe.md) ·
[move-aimed-bouncing-projectile](move-aimed-bouncing-projectile.md) ·
[move-dash-grab-launch-special](move-dash-grab-launch-special.md) ·
[move-projectile-possess](move-projectile-possess.md) ·
[move-afterimage-dodge](move-afterimage-dodge.md) ·
[move-charge-with-stances](move-charge-with-stances.md) ·
[move-katana-slash-with-stacks](move-katana-slash-with-stacks.md) ·
[move-three-stage-chain](move-three-stage-chain.md) ·
[move-dash-spin-slash](move-dash-spin-slash.md) ·
[move-fishing-rod-grapple](move-fishing-rod-grapple.md) ·
[awakening-meteor](awakening-meteor.md)

**Passives and systems:** [passive-custom-block](passive-custom-block.md) ·
[passive-awakened-dodge-counter](passive-awakened-dodge-counter.md) ·
[passive-awakened-aura](passive-awakened-aura.md) ·
[passive-stacks-visual](passive-stacks-visual.md) ·
[passive-auto-sheath](passive-auto-sheath.md) ·
[passive-stance-swap-on-block](passive-stance-swap-on-block.md) ·
[passive-cooldown-reset](passive-cooldown-reset.md) ·
[passive-resource-bar-and-regen](passive-resource-bar-and-regen.md) ·
[passive-cosmetics](passive-cosmetics.md) ·
[skill-template-charging-guard](skill-template-charging-guard.md)
