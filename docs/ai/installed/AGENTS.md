# Arayashiki: for AI agents

This folder is an installed copy of **Arayashiki**, a desktop app for
Jujutsu Shenanigans' (Roblox) Skill Builder: it opens moveset codes, edits
them node by node, simulates skills on a 3D character, and makes progress
bars (the Meter Maker).

The app is one program, `arayashiki.exe`, with everything built in (the web
UI, the engine, the docs). There's no source code, Node or Python here, and
nothing to build. The files around the exe are written by the app itself, for
you to read.

## Working with the app: MCP

`arayashiki.exe --mcp` is an MCP server over stdio. Once it's in your MCP
settings you get every tool: reading, describing, simulating, validating and
encoding codes, the handbook, the move library, the game's animations and
sounds, and the `app_*` tools that work on what the user has open (edit the
moveset in place, simulate, take screenshots, export videos, keyframe
cameras).

```json
{ "mcpServers": { "arayashiki": { "command": "<this folder>\\arayashiki.exe", "args": ["--mcp"] } } }
```

`mcp.json` in this folder has that with the real path filled in. Inside the
app, **Connect an AI app** (Ctrl+Space, then type "connect") adds it to
Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Cline, Codex, Gemini
CLI or LM Studio for the user.

The server answers the handshake straight away; the app's window opens only
for the first tool call, if it isn't open already.

If you can't use MCP (you can only read files), use the docs below and hand
the user codes to paste into the app (Ctrl+V on the start screen) or JJS.

## What's here

| File | What it is |
|---|---|
| `AGENTS.md` | This file. |
| `mcp.json` | The MCP server entry for this copy. |
| `docs/jjs-skill-builder.md` | The handbook: every node kind, field, condition and rule of the Skill Builder, each marked confirmed, inferred or from the guides. Read the sections you need. |
| `docs/jjs-library/` | Real moves, explained node by node, with import-ready codes. `README.md` lists them by what they do and gives the usual numbers (damage, stun, timings). Use them as references for new moves (how JJS does things, the usual numbers), not templates to copy. |
| `docs/jjs-game/` | JJS's own animations and sounds with their Roblox IDs (read from the game). |
| `docs/ai-guide.md` | The tools in full, and the usual workflows (in most builds). |
| `docs/USER-MANUAL.md` | The app's user manual: every panel, key and feature. |
| `skills/arayashiki/SKILL.md` | A skill for Claude (copy it into `~/.claude/skills/` to use it everywhere). |

## Codes

A **code** is the text JJS copies out of the Skill Builder: base64 of zstd
compressed JSON, starting `KLUv/`. With the MCP tools, `decode` reads one and
`encode` writes one. Never hand-edit the base64.

## Rules

- Skills are picked by `NAME`, `"CATEGORY:NAME"` (M1s are `"MELEE:1"`…) or index.
- Keep JJS's exact key names (`"LAST HIT"`, `"BRANCH TARGET"`, spaces and
  all). Unknown kinds and fields pass through untouched.
- A field a node leaves out takes the builder's own default (a bare WAIT is
  1 s, a HITBOX with no STUN stuns 1 s). Write the fields you mean.
- The simulator is a model of JJS's rules, not the game: branching and hits
  follow tested rules; timings and damage are close, not exact. Say which
  rules you relied on are inferred (the handbook marks them).
- Hand back codes whole, in a code block, ready to paste.
