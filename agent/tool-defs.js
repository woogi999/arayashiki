// Every tool an AI gets, defined once: its name, what it's for, and its
// input as a zod shape. Three places serve them:
//
//   agent/mcp-server.js   the MCP server in Node (this repo)
//   src/ai/registry.js    the app's own MCP server (arayashiki.exe --mcp)
//                         and the assistant inside the app
//
// ENGINE tools run on the engine alone (core/, agent/tools-core.js): codes,
// skills, the simulator, the docs. APP tools work on the running app: the
// moveset that's open, playback, the cameras, screenshots and videos.

import { z } from 'zod';

const skillsInput = {
  code: z.string().optional().describe('A Skill Builder code ("KLUv/…"), or a path to a .txt file holding one.'),
  skills: z
    .array(z.record(z.string(), z.any()))
    .optional()
    .describe('Skills as objects (e.g. from decode detail "json"); DATA may be an object or a JSON string.'),
  skill: z.record(z.string(), z.any()).optional().describe('One skill object.'),
};
const select = z
  .union([z.string(), z.number()])
  .optional()
  .describe('Which skill: its NAME, "CATEGORY:NAME" (e.g. "MELEE:1") or its index.');
const conditions = z
  .object({
    AIR: z.boolean().optional(),
    JUMP: z.boolean().optional(),
    HOLD: z.boolean().optional(),
    ULT: z.boolean().optional(),
    BAR: z.number().optional(),
  })
  .optional()
  .describe('Your character: in the air, jumping, holding the key, awakened, awakening bar 0–100.');
const hits = z.enum(['auto', 'always', 'never']).optional().describe('"auto": hits when the dummy is inside the box (default). "always" or "never" force it.');

export const ENGINE_TOOLS = [
  {
    name: 'decode',
    title: 'Read a moveset code',
    description:
      'What is in a Skill Builder code. detail "overview" (default): one row per skill (category, name, key, cooldown, branches, node count, props). "text": every skill as a readable node listing. "json": the skills themselves with DATA parsed, to edit and pass to encode.',
    shape: { ...skillsInput, detail: z.enum(['overview', 'text', 'json']).optional() },
    readOnly: true,
    run: (T, a) => T.decode(a),
  },
  {
    name: 'describe',
    title: 'Read one skill node by node',
    description:
      'A skill as readable text: its line and every branch, one line per node with its index, effects folded into "fx:" lines (fold false lists every effect on its own line). Without select and with several skills, describes them all.',
    shape: { ...skillsInput, select, branches: z.array(z.string()).optional().describe('Only show these branches.'), fold: z.boolean().optional() },
    readOnly: true,
    run: (T, a) => T.describe(a).then((r) => r.text),
  },
  {
    name: 'simulate',
    title: 'Play a skill in the simulator',
    description:
      'Runs one skill against a training dummy 5 studs ahead and reports what happened: hits and damage, the branches each side ran, states, tags, projectiles, where both ended up, warnings, and a timed log (each line says which branch and node index fired). detail "events" adds every timed event; "full" adds positions 10 times a second.',
    shape: {
      ...skillsInput,
      select,
      conditions,
      hits,
      start: z.string().optional().describe("Start from this branch instead of the skill's own line."),
      seed: z.number().optional().describe('For RANDOM branches.'),
      distance: z.number().optional().describe('Studs from you to the dummy (default 5).'),
      wall: z.number().optional().describe('Studs to a wall in front (default none), for BRANCH COLLIDED.'),
      maxTime: z.number().optional().describe('Seconds to cut off a skill that never ends (default 12).'),
      detail: z.enum(['summary', 'events', 'full']).optional(),
    },
    readOnly: true,
    run: (T, a) => T.simulateSkill(a),
  },
  {
    name: 'validate',
    title: 'Check skills for mistakes',
    description:
      "Checks skills as JJS would read them: unreadable programs (error), branch names that go nowhere and look like typos (warning), fields of the wrong type (warning), unknown kinds (info, kept as is), that the code round-trips losslessly, and (simulate true, default) the simulator's warnings such as loops without a WAIT.",
    shape: { ...skillsInput, simulate: z.boolean().optional() },
    readOnly: true,
    run: (T, a) => T.validate(a),
  },
  {
    name: 'encode',
    title: 'Write a moveset code',
    description:
      'Skills to a code JJS\'s Skill Builder imports. Pass skills (e.g. edited output of decode detail "json") or one skill. Unknown kinds and fields pass through untouched; JJS\'s quirks (empty Branch/Prop as [], 1e38) are written as JJS writes them.',
    shape: skillsInput,
    readOnly: true,
    run: (T, a) => T.encode(a),
  },
  {
    name: 'node_reference',
    title: 'Node kinds and their fields',
    description:
      'The node schema. With kind (a K_NAME like "HITBOX" or a palette label like "VELOCITY"): its fields with types, defaults and hints, plus a new node as the palette makes it. Without: every kind in one line, the branch conditions, the Prop flags and the skill categories.',
    shape: { kind: z.string().optional() },
    readOnly: true,
    run: (T, a) => T.nodeReference(a),
  },
  {
    name: 'skill_template',
    title: 'An empty skill',
    description: 'A new, empty skill of a category (SKILL, SPECIAL, AWAKENING, MELEE, CHASE), with the fields the builder gives it.',
    shape: { category: z.string().optional(), name: z.string().optional() },
    readOnly: true,
    run: (T, a) => T.skillTemplate(a),
  },
  {
    name: 'build_template',
    title: 'Build a ready-made skill',
    description:
      'Ready-made skills from a form: a meter (one picture per step of a tag), an auto-sheathing weapon, accurate M1s, an accurate dash, percentage damage. Each is lifted node for node from a real export. No id: the templates with every field and default. With an id and values: the skills it builds and their import-ready code.',
    shape: { id: z.string().optional(), values: z.record(z.string(), z.any()).optional().describe('Field values by key; the rest keep their defaults.') },
    readOnly: true,
    run: (T, a) => T.buildFromTemplate(a),
  },
  {
    name: 'search_library',
    title: 'Find a real move to build from',
    description:
      'Searches 37 real moves (M1 strings, dashes, leaps and slams, grabs, barrages, projectiles, counters, passives…) by what they do, e.g. "launch", "grab slam", "projectile wall", "resource bar". Every word must match. No query lists them all. Build new moves from the closest one.',
    shape: { query: z.string().optional(), limit: z.number().optional() },
    readOnly: true,
    run: (T, a) => T.searchLibrary(a),
  },
  {
    name: 'get_library_move',
    title: 'One library move',
    description: 'A library move by slug: part "about" (what it does, how, what to reuse it for), "nodes" (every node), "code" (import-ready) or "all" (default).',
    shape: { slug: z.string(), part: z.enum(['all', 'about', 'nodes', 'code']).optional() },
    readOnly: true,
    run: (T, a) => T.getLibraryMove(a),
  },
  {
    name: 'handbook',
    title: 'Look something up in the handbook',
    description:
      'The JJS Skill Builder handbook: the code format, every node and field, how programs run, patterns, confirmed vs inferred rules. No query: the table of contents. A query (e.g. "LAST HIT", "PROJECTILE", "Req conditions"): the best-matching sections, the top one in full.',
    shape: { query: z.string().optional(), limit: z.number().optional(), max_chars: z.number().optional() },
    readOnly: true,
    run: (T, a) => T.handbook(a),
  },
  {
    name: 'asset_info',
    title: 'What Roblox asset IDs are',
    description:
      'Names Roblox assets: for each ID (a SFX ID, a TEXTURE…) its name, type (Audio, Image, Decal…), creator, and whether it downloads without signing in. Pass `ids`, or a skill (code/skills + select) to name every asset it uses.',
    shape: { ids: z.array(z.union([z.string(), z.number()])).optional(), ...skillsInput, select },
    readOnly: true,
    openWorld: true,
    run: (T, a) => T.assetInfo(a),
  },
  {
    name: 'game_assets',
    title: 'JJS’s own animations and sounds',
    description:
      'Finds Jujutsu Shenanigans’ own animations and sounds by words in their path ("gojo chase", "black flash", "block"), with their Roblox IDs, read from the game. Animations the Skill Builder can play come with their ANIM_USE [set, n]; pass anim_use to name one.',
    shape: {
      query: z.string().optional().describe('Words that must all appear in the path, e.g. "itadori divergent".'),
      kind: z.enum(['animation', 'sound']).optional(),
      anim_use: z.array(z.number()).length(2).optional().describe('An ANIM_USE [set, n] to name.'),
      limit: z.number().optional(),
    },
    readOnly: true,
    run: (T, a) => T.gameAssetsSearch(a),
  },
];

const appSelect = z.union([z.string(), z.number()]).optional().describe('A skill in the open moveset: NAME, "CATEGORY:NAME" or index. Default: the one open in the app.');
const background = z
  .string()
  .optional()
  .describe('"scene" (the room, default), "transparent" (alpha in PNG, GIF, MOV or WebM; MP4 renders it on black), "green" (a #00FF00 chroma key) or a colour like "#202020" (also a chroma key colour).');
const camera = z.enum(['view', 'auto', 'path']).optional().describe('"view": what the viewport shows (default); "auto": the cinematic auto camera; "path": the recorded camera keys.');

export const APP_TOOLS = [
  {
    name: 'app_state',
    title: 'What the app has open',
    description:
      'The desktop app right now: the moveset (name, file, unsaved changes, every skill with its category, name and node count), the open skill, branch and node, the playhead, the simulation settings and result summary, and the camera. Start here when working with what the user sees.',
    shape: {},
    readOnly: true,
  },
  {
    name: 'app_get_skills',
    title: 'The open moveset’s skills',
    description: 'The skills in the app as JSON (DATA parsed), all of them or one (select). Edit them and hand them back with app_put_skills.',
    shape: { select: appSelect.describe('One skill (NAME, "CATEGORY:NAME" or index); omit for all.') },
    readOnly: true,
  },
  {
    name: 'app_put_skills',
    title: 'Put skills into the app',
    description:
      'Puts skills into the open moveset as one undoable change (the user can Ctrl+Z it). mode "merge" (default): a skill with the same category and NAME is replaced in place, the rest are added. "append": all added. "replace": the whole moveset becomes these. Each is validated first; errors stop it, warnings come back. The first one is opened and simulated.',
    shape: {
      skills: z.array(z.record(z.string(), z.any())).optional().describe('Skills (DATA as an object or JSON string).'),
      code: z.string().optional().describe('Or a Skill Builder code.'),
      mode: z.enum(['merge', 'append', 'replace']).optional(),
      name: z.string().optional().describe('With mode "replace": the moveset’s name.'),
    },
  },
  {
    name: 'app_delete_skills',
    title: 'Delete skills from the app',
    description: 'Deletes skills from the open moveset (undoable).',
    shape: { select: z.array(z.union([z.string(), z.number()])).describe('Skills: NAME, "CATEGORY:NAME" or index.') },
  },
  {
    name: 'app_select',
    title: 'Open a skill, branch or node',
    description: 'Shows a skill (and a branch, and a node by index) in the app, as if the user clicked it.',
    shape: { skill: appSelect, branch: z.string().optional().describe('"" for the default line.'), node: z.number().optional().describe('A node index in that branch.') },
  },
  {
    name: 'app_simulate',
    title: 'Simulate in the app',
    description:
      'Sets the app’s simulation (conditions, hits, distance, wall, the dummy blocking…) and runs the open skill (or select), returning the result like simulate. The user sees it in the viewport and timeline.',
    shape: {
      select: appSelect,
      conditions,
      hits,
      distance: z.number().optional(),
      wall: z.number().nullable().optional().describe('Studs to a wall in front; null for none.'),
      dummy: z.object({ present: z.boolean().optional(), block: z.boolean().optional(), counter: z.boolean().optional(), evasive: z.boolean().optional() }).optional(),
      detail: z.enum(['summary', 'events', 'full']).optional(),
    },
  },
  {
    name: 'app_playback',
    title: 'Play, pause or seek',
    description: 'Controls playback in the app: play, pause, restart, or seek to a time (seconds). speed sets the playback rate (0.25 = quarter speed).',
    shape: { action: z.enum(['play', 'pause', 'restart', 'seek']), time: z.number().optional(), speed: z.number().optional() },
  },
  {
    name: 'app_view',
    title: 'Set up the viewport',
    description:
      'Viewport options: follow, hitboxes, sounds, the dummy shown, the camera mode ("free", "auto", "path"), the auto camera (angle: three-quarter, side, front, behind, low, high, top, orbit; framing: tight, medium, wide; subject: both, you, dummy; smooth 0–1; punch, shake 0–1, dutch degrees, fov), and whether the skill’s own camera blocks take over.',
    shape: {
      follow: z.boolean().optional(),
      hitboxes: z.boolean().optional(),
      sounds: z.boolean().optional(),
      dummy: z.boolean().optional(),
      camera: z.enum(['free', 'auto', 'path']).optional(),
      auto: z.record(z.string(), z.any()).optional(),
      skillCamera: z.boolean().optional(),
    },
  },
  {
    name: 'app_camera_keys',
    title: 'The recorded camera path',
    description:
      'The camera keys the "path" camera flies through ({ t, p: [x,y,z], q: [x,y,z,w] quaternion, fov }, world space, y up). action "list"; "add" (a key at time from where the user’s camera is now); "set" (replace all with keys); "clear".',
    shape: {
      action: z.enum(['list', 'add', 'set', 'clear']),
      time: z.number().optional(),
      keys: z.array(z.object({ t: z.number(), p: z.array(z.number()).length(3), q: z.array(z.number()).length(4), fov: z.number().optional() })).optional(),
    },
  },
  {
    name: 'app_screenshot',
    title: 'Take a screenshot',
    description:
      'Draws the open skill at a moment (time, default the playhead) and returns the picture, so you can see what the user sees. Also saves it to Pictures\\Arayashiki when save is true (a thumbnail, say).',
    shape: {
      time: z.number().optional(),
      width: z.number().optional().describe('Default 960 (1280 when saving).'),
      height: z.number().optional().describe('Default 540 (720 when saving).'),
      background,
      camera,
      hitboxes: z.boolean().optional(),
      save: z.boolean().optional(),
    },
    readOnly: true,
  },
  {
    name: 'app_export_video',
    title: 'Export a video',
    description:
      'Renders the open skill (or select) to Videos\Arayashiki, with its sounds: format mp4, mov, webm, gif or png (a PNG sequence folder); fps; speed (1 real time, 0.5 or 0.25 slow motion); size; background (transparent needs mov, webm, gif or png); camera; time range; quality or a bitrate in Mbps. Returns where it went.',
    shape: {
      select: appSelect,
      format: z.enum(['mp4', 'mov', 'webm', 'gif', 'png']).optional(),
      fps: z.number().optional(),
      speed: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      background,
      camera,
      hitboxes: z.boolean().optional(),
      from: z.number().optional(),
      to: z.number().optional(),
      quality: z.enum(['low', 'medium', 'high', 'best']).optional(),
      bitrate: z.number().optional().describe('Target video bitrate in Mbps (VBR); omit to encode by quality.'),
      audio: z.boolean().optional().describe('Include the skill’s sounds (default true).'),
    },
  },
  {
    name: 'app_animate',
    title: 'Keyframe a VISUAL',
    description:
      'Writes a keyframed animation for a VISUAL (a Mesh/Block/Sphere/Cylinder/Wedge part effect, or a Camera) into the open branch as a chain of VISUAL nodes, splitting WAITs so each piece fires on time. node: the index of the VISUAL to animate (its effect, part and look are kept). keys: [{ t (seconds from the node), pos [x left, y up, z forward] on the body part, rot [degrees, as ROTATION], size, opacity }], at least two. For a Camera, rot [0, 0, 0] looks the way the character faces and [0, 180, 0] looks back at them; positive y turns toward their left, negative x looks down (a camera 10 studs behind and 4 up looking at them: pos [0, 4, -10], rot [-15, 0, 0]). smooth runs a curve through the keys; shake adds a camera shake ({ amount studs, turn degrees, freq, from, to }).',
    shape: {
      node: z.number(),
      keys: z
        .array(z.object({ t: z.number(), pos: z.array(z.number()).length(3), rot: z.array(z.number()).length(3).optional(), size: z.number().optional(), opacity: z.number().optional() }))
        .min(2),
      smooth: z.boolean().optional(),
      easing: z.string().optional(),
      hold: z.number().optional(),
      shake: z.object({ amount: z.number().optional(), turn: z.number().optional(), freq: z.number().optional(), from: z.number().optional(), to: z.number().optional() }).optional(),
    },
  },
  {
    name: 'app_undo',
    title: 'Undo or redo',
    description: 'Undoes (or redoes) the last change to the moveset in the app.',
    shape: { redo: z.boolean().optional(), steps: z.number().optional() },
  },
  {
    name: 'app_save',
    title: 'Save the moveset',
    description: 'Saves the open moveset to its .txt (or asks the user where, the first time).',
    shape: {},
  },
  {
    name: 'app_notify',
    title: 'Tell the user something',
    description: 'Shows a short message in the app’s status bar.',
    shape: { message: z.string() },
    readOnly: true,
  },
];
