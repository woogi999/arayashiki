---
name: arayashiki
description: Read, explain, debug, simulate, validate or write Jujutsu Shenanigans (JJS, Roblox) Skill Builder skills and moveset codes (the "KLUv/…" text JJS copies out), and work in the Arayashiki desktop app. Use whenever a JJS skill, moveset, node (HITBOX, VELO, BRANCH, TAG, LAST HIT…), move idea or Skill Builder code comes up.
---

# JJS Skill Builder work

Use the **arayashiki MCP tools** (`arayashiki.exe --mcp`; the app's
**Connect an AI app** adds them). The docs they draw on are also on disk in
the app's install folder (`%LOCALAPPDATA%\Arayashiki`): `AGENTS.md` there
says what each file is.

## Pick the tool

- A code to understand → `decode` (overview), then `describe` (nodes) and
  `simulate` (what happens: hits, branches run, log with node indexes).
- Something broken → `validate`, then `simulate` with the conditions that
  fail (`hits`, `conditions` AIR/JUMP/HOLD/ULT/BAR, `start` a branch).
- A new move → work out what it should do; `search_library` /
  `get_library_move` for real moves that do similar things, as references
  (how JJS does each part, the usual numbers), not templates to copy;
  `node_reference` for fields; `simulate` until it works; `lint`; `encode`.
- A move that needs a bar → the Meter Maker tools (`meter_new`,
  `meter_add_layer`, `meter_screenshot`, `meter_publish`), then TAG nodes in
  the moves that fill or empty it.
- A rule or field meaning → `handbook` with a query; a node's fields,
  defaults and the game's lists → `node_reference`.
- An animation or sound from the base game → `game_assets`.
- The user has the app open → `app_state`, `app_get_skills` /
  `app_put_skills` (edits in place, undoable), `app_simulate`,
  `app_screenshot`, `app_export_video`, `app_animate`.

## Rules

- Skills are selected by `NAME`, `"CATEGORY:NAME"` (M1s are `"MELEE:1"`…) or index.
- Keep JJS's exact key names (`"LAST HIT"`, `"BRANCH TARGET"`); unknown
  kinds and fields pass through untouched.
- A field a node leaves out takes the builder's own default. Write the
  fields you mean.
- The simulator is a model, not the game: say which rules you relied on
  are inferred (the handbook marks them).
- Hand back codes whole, in a code block, ready to paste into JJS.
