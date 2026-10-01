# Arayashiki

**Jujutsu Shenanigans' Skill Builder, as a desktop app.** Open a moveset's
code, edit it node by node the way the in-game builder lays it out, play any
skill on a 3D character against a training dummy, read exactly what fired and
when on a frame meter, film it, and copy the code back into the game.

It's also a **knowledge base and toolset for AI**: a handbook of how JJS skills
work, 37 real moves explained node by node, and the same engine the app runs,
reachable from an assistant inside the app, from any MCP client (Claude
Desktop, Claude Code, Cursor, VS Code, Codex…), and from a CLI.

- **Using it?** Read the [user manual](docs/USER-MANUAL.md) (also inside the
  app: press <kbd>F1</kbd>).

## What it does

### Building skills

- **Lossless codes.** Reads and writes the `KLUv/…` codes JJS copies out
  (base64 of zstd JSON) byte for byte: node kinds and fields it doesn't know
  pass through untouched, and JJS's own JSON quirks are written back as JJS
  writes them.
- **The builder, laid out like Blender.** Nodes, branches and their
  conditions, every node's fields with the builder's own tooltips and
  defaults (read from the game), skill settings, Prop flags. Panels dock,
  float and resize; the layout is kept.
- **Undo for everything**, multi-select, drag to reorder, copy and paste nodes
  as JSON.
- **Templates**: a meter, an auto-sheathing weapon, accurate M1s, an accurate
  dash, percentage damage, each lifted node for node from a real export.
- **The Meter Maker**: draw a meter (a progress bar) frame by frame, upload
  the pictures to Roblox on your account, and get the skill that shows them.

### Watching skills

- **A simulator** of JJS's rules: threads, WAITs, gated branches, loops, tags,
  states, hitboxes and what a hit does to both lines, projectiles and
  collisions, LAST HIT, grabs, teleports, Roblox gravity and momentum at
  240 Hz, ragdolls. Results are deterministic and locked by golden tests.
- **A 3D viewport**: an R6 character (your own Roblox avatar, clothes and
  accessories, if you sign in) and a dummy, JJS's own VISUAL effects (a port
  of the game's BuilderFX with its templates, meshes, particles, beams and
  trails), screen effects (Camera blocks, FOV, shakes, colour grading,
  overlays), hitboxes and projectiles. Everything is a function of time, so
  you can scrub to any frame.
- **A frame meter** and a **log** of every step, each pointing at its branch
  and node.
- **Cameras**: fly freely (Roblox Studio's controls), let an **auto camera**
  frame the fight (eight angles, framing, smoothing, punch-in, shake and dutch
  tilt on hits), or **record a camera path** with keys or a live take.

### Filming skills

One **Export** window, laid out like Adobe Media Encoder: the code for JJS,
videos and pictures.

- **Videos** as **MP4**, **MOV** or **WebM** (H.264, H.265, AV1, VP9, VP8, or
  PNG in a MOV), an animated **GIF**, or a **PNG sequence**; 24 to 120 fps;
  720p to 4K, vertical, square or any size; **in slow motion** (½, ¼, ⅛ or any
  speed); by quality or at a target bitrate (VBR or CBR) with a keyframe
  interval.
- **With the skill's sounds**: every SFX node mixed with its volume, start,
  speed and fades, slowed with the picture or at normal speed in slow motion
  (AAC, Opus or PCM; a .wav with a PNG sequence).
- **Backgrounds**: the room, **transparent** (PNG MOV, VP9 WebM, GIF, PNG
  sequence; an MP4 asked for it renders on black, with a warning), a
  **chroma key** in any colour, or a flat colour.
- **Cameras**: the viewport's, the auto camera, or a **camera path** you key
  by flying the viewport, with per-key easing, field of view, smoothing and
  shake.
- **Presets** (YouTube, Shorts/TikTok, Discord, editing with alpha…), a live
  **preview** frame, a **size estimate**, and a **render queue**.
- **Pictures** at any size up to 4K, for thumbnails.

Frames are rendered offline, so slow motion is smooth and nothing depends on
your frame rate; encoding uses the GPU and streams to disk.

### Animating with keyframes

- **The motion animator** turns a VISUAL into a Blender-style animation:
  start a **new camera animation** or a **new visual animation** (a moving
  Block, Sphere, Cylinder, Wedge or Mesh) from the Nodes panel's Animate menu,
  or animate the picked VISUAL (<kbd>Ctrl+K</kbd>). Keys at times, dragged
  with a gizmo in the viewport or typed in, each with its own easing (any of
  Roblox's), on a smooth curve or not. It writes the chain of VISUAL nodes JJS
  needs (each a straight A-to-B move), splitting WAITs so every piece fires on
  time without moving anything else. A floating window you can move and size.
- **Fly-to-place cameras**: fly the viewport to each shot and key it.
- **Baked camera shake**: a Camera block ignores JJS's screen shakes, so the
  shake is written into the camera's own path.

### Getting around

- **Search everything** (<kbd>Ctrl+Space</kbd>): commands, skills, branches,
  nodes, nodes and effects to add, templates, settings, shortcuts, recent
  files and the manual, with a fuzzy matcher that forgives typos, missing
  spaces, initials and word order. Favourites and recents.
- **Right-click menus** for nodes, skills, branches, the viewport, the
  timeline and text fields.
- **Every shortcut is rebindable.**
- **A start screen** with both workspaces, recent files, and a nudge to sign
  in with Roblox (without it, many assets can't load).
- **Nothing lost to a crash**: work is autosaved as you go and comes back
  after a crash or power cut; exiting through "Don't save" starts fresh.

### Working with AI

- **An assistant inside the app** (<kbd>Ctrl+J</kbd>): bring a key for Claude,
  OpenAI, Google Gemini, OpenRouter, Groq, xAI, DeepSeek or Mistral, or run a
  free local model with Ollama or LM Studio. It reads and edits the open
  moveset, simulates, takes screenshots and looks at them, exports videos and
  animates cameras. Every change is one undo step. Keys live in Windows'
  Credential Manager and never reach the web view.
- **MCP for the AI app you already use**: a wizard detects Claude Desktop,
  Claude Code, Cursor, VS Code, Windsurf, Cline, Codex CLI, Gemini CLI and LM
  Studio, writes Arayashiki into its settings, and shows that app's steps.
  `arayashiki.exe --mcp` *is* the MCP server: no Node needed, and it starts
  the app if it isn't open.
- **29 tools**: 13 that work on codes alone (decode, describe, simulate,
  validate, encode, the node reference, templates, the move library, the
  handbook, Roblox asset info, JJS's own animations and sounds) and 15 that
  drive the running app (its state, editing the moveset in place, selection,
  simulation, playback, the viewport and cameras, camera keys, screenshots,
  video export, keyframe animation, undo, save).
- **A CLI**, `sbs`, with the same answers.

#### Connecting an MCP client

In the app, open search (<kbd>Ctrl+Space</kbd>) and choose **Connect an AI
app**. The wizard configures supported clients, including Claude Desktop,
Claude Code, Cursor, VS Code, Windsurf, Cline, Codex CLI, Gemini CLI and LM
Studio.

The installed Windows app can serve MCP over stdio without Node. Configure the
client to run `arayashiki.exe` from the install folder with the `--mcp`
argument; it starts the app if needed.

For clients using this repository, `.mcp.json` registers the Node server for
Claude Code. Other MCP clients can use:

```json
{
  "mcpServers": {
    "arayashiki": {
      "command": "node",
      "args": ["<path to this repo>/agent/mcp-server.js"]
    }
  }
}
```

The repository MCP server and `sbs` CLI need Node 22.15 or later and `npm install`.
Run CLI commands with `npm run sbs -- <command>`, for example
`npm run sbs -- decode moveset.txt`.

## Building and running

```sh
npm install
npm run dev        # the app, with hot reload (Tauri + Vite)
npm run build      # the release app (src-tauri/target/release/arayashiki.exe)
npm run release    # the app, the setup and the notes, gathered in release/
npm test           # engine, golden simulations, agent tools, MCP, search
```

Needs Node 22.15 or later, Rust (stable, MSVC) and WebView2 (part of Windows
11).

**Installing and updating.** There's no installer to rebuild per version.
`Arayashiki-Setup.exe` (`src-tauri/setup/`, `npm run build:setup`) asks
GitHub's API for the latest release, downloads its `arayashiki.exe` into
`%LOCALAPPDATA%\Arayashiki` and runs it with `--install`, and the app makes its
own shortcuts and Settings → Apps entry (`src-tauri/src/install.rs`). From
then on the app updates itself (`src-tauri/src/updates.rs`): it checks at
launch, downloads a newer `arayashiki.exe` in the background, and swaps it in
when you restart, or at the next launch. The setup's link never changes:
`https://github.com/woogi999/arayashiki/releases/latest/download/Arayashiki-Setup.exe`.

**Releasing.** Bump the version in `package.json`, `src-tauri/tauri.conf.json`
and `src-tauri/Cargo.toml`, add its section to `CHANGELOG.md`, and run
`npm run release` (with `-- --publish` and a `GITHUB_TOKEN`, it makes the
GitHub release too). Publish a release tagged `vX.Y.Z` with `arayashiki.exe`
and `Arayashiki-Setup.exe` attached: installed copies update to it by
themselves. (`npx tauri build` still makes the old NSIS installer, in
`src-tauri/target/release/bundle/nsis/`, if it's ever wanted.)

For agents working from the repo:

```sh
npm run sbs -- decode path/to/moveset.txt
npm run sbs -- sim path/to/moveset.txt "MELEE:1" --always
npm run sbs -- lib grab slam
npm run sbs -- docs LAST HIT
```

In this repo, Claude Code picks up the MCP server from `.mcp.json`; other
clients can use the configuration above.

## How it was built: porting JJS

JJS runs on Roblox's servers and clients; none of it is public. Arayashiki
rebuilds the parts a creator needs from three sources: real exports, the
game's own data read out of Roblox Studio, and testing in-game.

### The code format

A code is `base64(zstd(JSON))` of an array of skills, each with its program
as a JSON string inside. The JSON is Roblox's encoder writing Lua tables, with
quirks: an empty table is `[]` even where an object belongs, "forever" is
`1e38`, and some floats have 17 digits. `core/format.js` keeps everything it
doesn't need to touch exactly as written, key order included, so a code
round-trips byte for byte (tested on every fixture). zstd runs natively in
Node 22 and as WebAssembly in the app.

### The builder's own tables

The node kinds, their fields in the builder's order, their types, defaults
and tooltips, the lists of states, moves, specials, attack types and
characters, the 47 VISUAL effects and which fields each one reads, and the
`ANIM_USE` table of animations were all **read out of the game in Roblox
Studio** through Studio's MCP server (`lib/extract-jjs-game.mjs`) and
generated into `core/gamedata.js`. So the editor offers exactly the fields JJS
has, and the validator knows when a field is a typo.

### The rules

How a program runs isn't documented anywhere. The handbook
([docs/jjs-skill-builder.md](docs/jjs-skill-builder.md)) reconstructs it from
hundreds of real nodes in real movesets, community guides, and the owner's
in-game tests, and marks every rule as confirmed, inferred, or from the
guides. The simulator (`core/sim.js`, `core/physics.js`) implements exactly
the handbook: gated BRANCH jumps that don't come back, a hit moving the
attacker's line on and starting the target's, LAST HIT windows, tags with
expiry, a field left out taking the builder's default, Roblox's 196.2 studs/s²
gravity, a Humanoid braking itself, BodyVelocity-style pushes, ragdolls whose
timer only starts on landing, and so on. `tests/sim-golden.test.js` hashes
250 simulations of real characters, so no change slips in unnoticed.

### The effects

JJS's VISUAL nodes are drawn by its `BuilderFX` client module, cloning
templates (parts, meshes, decals, particle emitters, beams, trails, lights)
and tweening them. `lib/extract-jjs-fx.mjs` read every template and its
properties out of the game (`src/assets/jjs-fx.json`), and `src/fx/` ports
the module: each effect's placement (welded to the limb, an attachment on the
part, or a free part tweened from `part · pos · rot` to `start · pos · alt ·
altRot`, a detail the handbook explains), Roblox's TweenService easing,
ParticleEmitters (size, transparency and colour sequences, spread, drag,
flipbooks, LockedToPart…), Trails and Beams, and the screen effects. Particles
are solved in closed form from a seeded random, so any frame can be drawn
directly, which is what makes scrubbing and offline video export exact.

### Roblox itself

- **Assets** (`src-tauri/src/roblox.rs`): the app's own cache, then the
  Roblox client's cache on the PC (indexed in the background by content
  hash), asset delivery (as the signed-in account when there is one), the
  CDN, and thumbnails as a last resort. Decals and models are unwrapped to the
  image or sound inside them, including binary `.rbxm` files with LZ4/zstd
  chunks (`src/rbxm.js`).
- **Meshes**: every `.mesh` version, 1.00 to 7.00, including Draco-compressed
  ones (`src/rbxmesh.js`).
- **Signing in** (`src-tauri/src/account.rs`): Roblox's own login page in an
  isolated window; the session goes to Windows' Credential Manager, is sent
  only to `*.roblox.com`, and the editor's page never sees it.
- **Avatars**: body colours, classic clothing folded onto the R6 body from
  the 585×559 template (`src/clothing.js`), faces, and accessories hung on
  the R6 attachments (`src/accessories.js`).
- **Ragdolls** (`src/ragdoll.js`): the six R6 parts become rigid bodies with
  ball-socket joints (cannon-es), baked at 60 Hz per run so they scrub.
- **Uploads**: the Meter Maker uploads PNGs as decals on the signed-in
  account and resolves their image IDs.

### Video and pictures

Frames are rendered off screen at the export's size with 4× MSAA into a
half-float target, then one pass applies JJS's colour grading, un-premultiplies
alpha, converts to sRGB and flips the rows; the result is read back
asynchronously. MP4, MOV (H.264) and WebM (VP9, with alpha as a second stream)
go through WebCodecs and [mediabunny](https://mediabunny.dev), written
straight to disk through the Rust shell. Browsers can't encode ProRes, so a
transparent MOV is QuickTime's PNG codec: `src/video/mov-png.js` writes the
container by hand, and a pool of workers compresses frames in parallel while
the GPU draws the next ones.

### Cameras and keyframes

The auto camera (`src/camera-rig.js`) is a critically damped spring chasing an
angle around the fight, precomputed per run so it's a pure function of time
like everything else. Recorded paths are centripetal Catmull-Rom through the
keys with slerped rotations. The motion animator (`src/animator.js`) inverts
BuilderFX's math: for each stretch between samples it solves for the
`POSITION`, `ROTATION`, `ALT POSITION` and `ALT ROTATION` that land exactly on
the next key, given where the body part will be at that moment, then threads
the pieces into the line by splitting WAITs.

### AI

The tools (`agent/tool-defs.js`, `agent/tools-core.js`) run in Node for the
CLI and the repo's MCP server, and inside the app with the docs bundled
(`src/ai/registry.js`). The app listens on `127.0.0.1` behind a random token
kept in a file only your Windows account can read
(`src-tauri/src/bridge.rs`); `arayashiki.exe --mcp` is a small stdio proxy
to it that starts the app if needed. The assistant uses the official Anthropic
SDK for Claude and OpenAI-compatible chat completions for everything else,
both with their HTTP routed through the Rust shell so it can add the API key
from Credential Manager.

### Search

The universal search is a port of the author's Blender add-on (Wooctrl):
an inverted index over titles, keywords and descriptions with prefix,
substring, initials, subsequence and optimal-string-alignment typo matching
(`src/search/fuzzy.js`, tested with the original's cases).

## Limitations

- **It's a model, not JJS.** Timings, physics and damage are close, not
  exact. Blocking, the dummy acting on its own, counters triggering and
  cooldowns aren't modelled. Test the final move in the game.
- **Animations are stand-ins.** JJS's animations aren't public, so `ANIM`
  nodes play simple poses (the same animation always gets the same pose).
- **Private assets stay private.** Meshes, textures and sounds their creator
  hasn't shared can't be loaded, signed in or not; most audio needs signing
  in.
- **Sounds need Roblox's say-so.** A video's sounds come through the same
  pipeline as the viewport's: sign in for most of them; ones private to their
  creator stay out. The effects are drawn by three.js, not Roblox's renderer:
  lighting and materials are close, not identical.
- **Rendering speed depends on the graphics card.** Every frame is drawn at
  full quality (4× antialiasing); an integrated GPU manages about 20 frames a
  second at 720p.
- **ChatGPT's apps can't use MCP servers on your PC** (use the in-app
  assistant with an OpenAI key).
- **Windows only** (WebView2, Credential Manager, the Roblox client's cache).

## What's where

```text
core/                   the engine: plain ESM, runs in the app and in Node
  format.js             reading and writing codes, losslessly
  schema.js, gamedata.js every node kind and field (gamedata: generated from JJS)
  sim.js, physics.js    the simulator
  describe.js           skills as readable node listings
  templates.js          the ready-made skills
agent/                  the AI layer
  tools-core.js         the tools, wherever they run
  tools.js              their Node setup (docs from disk, opening the app)
  tool-defs.js          every tool's name, description and input schema
  mcp-server.js, cli.js the MCP server (Node) and the sbs CLI
  app-bridge.js         reaching the running app from Node
src/                    the desktop UI (Preact + signals, built by Vite)
  store.js              the editor's state and every edit
  scene.js              the 3D view (three.js), off-screen capture, overlays
  camera-rig.js         the auto camera and recorded paths
  animator.js           the motion animator's math
  commands.js           every command (shortcuts, search, menus)
  search/, ui/search.jsx the universal search
  video/                screenshots and video export
  ai/                   the assistant, the bridge, the connect wizard
  fx/                   BuilderFX, particles, trails and beams, Roblox math
  barmaker/             the Meter Maker
  ui/                   panels, dialogs, menus, the start screen, the manual
src-tauri/              the Rust shell: Roblox assets and sign-in, files,
                        the AI bridge and MCP proxy, AI keys and requests
docs/
  USER-MANUAL.md        for people using the app
  jjs-skill-builder.md  the handbook
  jjs-library/          37 real moves, node by node (for AI and reference)
  jjs-game/             JJS's animations and sounds (generated)
lib/                    the generators (library, game data, effects)
tests/                  node:test: engine, golden simulations, tools, MCP, search
data/                   (git-ignored) real exports everything is checked against
```

## Accuracy

The simulator's results are locked: `tests/sim-golden.test.js` runs every
skill of four real characters under five settings and fails if any result
changes. When a rule deliberately changes, regenerate with
`UPDATE_GOLDEN=1 npm test` and update the handbook with it.

## License

MIT.
