# The JJS Skill Builder: a working handbook

Everything known about the **Skill Builder** in *Jujutsu Shenanigans* (JJS,
a Roblox game): the code format, the skill and node structure, how programs
run, and the patterns creators use. It lives with **Arayashiki**
(this project: the Skill Builder as a desktop app, with a simulator, a CLI and
an MCP server for AI agents). Two tools that began on the Woogi Tools
website also write JJS skills, and now live here too: the **Progress Bar
Maker** (the app's Progress Bar workspace, `src/barmaker/`, building its
skill with `core/barskill.js`) and the **Templates** (`core/templates.js`,
the Templates dialog, and the `build_template` tool).

**Making a move?** Start from the closest example in
[jjs-library/](jjs-library/README.md): 37 real moves (M1 strings, dashes,
leaps and slams, grabs, barrages, projectiles, passives…), each explained,
listed node by node, and with its exact code, plus the usual numbers
(damage, stun, timings) to stay consistent with.

**How sure is each thing?**

- **Confirmed**: read from real exports made in JJS, or checked in-game by
  the owner. The exports kept as test fixtures (see
  [Testing](#10-testing-and-fixtures)) are four complete characters and a
  progress bar skill.
- **From the game's code**: read from JJS's own Skill Builder modules in
  Roblox Studio (September 2026; see [section 12](#12-jjss-own-code)). The
  builder's node table (`SkillDefault`), its lists (`ListData`) and the
  client that draws every VISUAL (`BuilderFX`). The server half of the
  runtime isn't in the place, so how the server runs nodes stays inferred.
- **Inferred**: a reading of what the data shows, not checked against JJS's
  code or in-game. Treat these as hypotheses, and move them to confirmed (or
  correct them) when you learn more.
- **From the guides**: community write-ups kept in the git-ignored
  `data/guides/` ("Skill-Builder Tutorial.md", a node-by-node rundown
  from February 2026; "CB Notes.md" and "Variants.md", notes from the JJS
  Discord). They fill gaps, but **when they disagree with the owner or with
  what's confirmed here, the owner and this file win**. Where they disagree,
  this file says so.

---

## 1. The code format (confirmed)

The text the Skill Builder copies out (and imports) is:

```
base64( zstd( JSON.stringify(skills) ) )
```

- `skills` is a **JSON array** of skill objects, written compactly.
- Compression is **Zstandard**, with a standard frame. Codes always start
  `KLUv/`, the base64 of zstd's magic number.
- Each skill's program is **JSON inside JSON**: a string in its `DATA` field.

Reading one (Node, from the repo root):

```js
import { init, decompress } from '@bokuweb/zstd-wasm';
await init();
const skills = JSON.parse(Buffer.from(decompress(Buffer.from(CODE, 'base64'))).toString());
for (const s of skills) console.log(s.K_NAME, s.NAME, s.DATA && JSON.parse(s.DATA));
```

Here: `decodeMoveset` / `encodeMoveset` in `core/format.js` (for any
moveset), or without writing code, `npm run sbs -- decode <code|file>` or
the MCP server's `decode` tool ([ai/README.md](ai/README.md)).

### Quirks to copy when writing (confirmed)

JJS's JSON comes from Roblox's encoder writing Lua tables:

- **An empty table is `[]`**, whatever it stands for, so an empty `Branch` or
  `Prop` is written `"Branch":[]`, not `{}`. Readers must accept both.
- **"For ever" is `1e38`.** JJS itself writes both `1e38` and `1e+38`, and
  reads both. The writers here produce `1e38`.
- **Floats** sometimes have 17 significant digits (`0.20510204081632656`)
  where JavaScript writes the shortest form that reads back as the same
  double (`…655`). The values are identical. Apart from this and `1e38`, a
  decode → encode round trip is **byte-for-byte identical** on both fixture
  characters.
- **Fields are sparse.** A node often leaves out fields that are at their
  usual value (e.g. a `WAIT` with no `TIME`), so readers must default them.
  Older nodes carry fewer fields than ones made recently.
- **Unknown fields and kinds must pass through untouched.** Skill Builder
  Sim keeps anything it doesn't recognise.

---

## 2. Skills

```json
{ "ADD": true, "NAME": "Arisugawa Sparkle", "K_NAME": "SKILL", "KEY": 1,
  "COOLDOWN": 12, "TOOL TIP": "", "DATA": "{…}" }
```

`K_NAME` is the **category**, one of the five columns in the builder:

| Category | Fields besides NAME / DATA | Notes |
|---|---|---|
| `SKILL` | `KEY`, `COOLDOWN`, `TOOL TIP`, `ADD` | The numbered skills. `KEY` 1–4 are the slots. |
| `SPECIAL` | `COOLDOWN` | One per character seen. |
| `AWAKENING` | `DURATION`, `DELAY`, `COLOR` | `COLOR` is a gradient: `"255,119,0 255,215,38"` (two `r,g,b`, space-separated). `Req` is usually `BAR ≥ 99.99`. |
| `MELEE` | none | Named `"1"`–`"4"`: the M1 combo's hits. |
| `CHASE` | `COOLDOWN` | One per character seen. |

- **`KEY` conventions (confirmed):** 1–9 are the skill slots, though vanilla or base JJS characters only use 1-4.
- **99** is a key nobody presses, which is how **passives** run all the time. **99** can also be used for **separators**, as by nature it is an unpressable key.
- **Separators** like `----BASE----` are `ADD: false`, `KEY 99 (or an unpressable value like 15)`, with **no
  `DATA` at all**: they're just labels in the skill list.
- **`TOOL TIP`** is the slot's hint: `"JUMP+"`, `"CLOSE+"`, `"HOLD"`,
  `"USE TWICE"`.
- `ADD` is `true` for everything that's part of the moveset.

**Character block vs moveset block** (from the guides): a *character* block
in build mode holds a whole character (M1s, skills, special, awakening,
chase), and with "Show in List" it joins the character list. The older
*moveset*, *special* and *awakening* blocks replace a single slot. A `CHASE`
replaces the forward dash, and needn't be a dash at all.

---

## 3. A program (`DATA`)

```json
{
  "Req": [ …conditions to start… ],
  "Line": [ …nodes, run first ("Default" in the builder)… ],
  "Prop": { "REP": true, "KEEP": true, … },
  "Branch": { "OnHit": { "Line": […], "Req": […] }, … }
}
```

### `Req`: conditions (confirmed shapes)

A list of conditions that must **all** hold: on the program, to use the
skill; on a branch, to **enter** it.

```json
{ "K_NAME": "AIR", "FLIP": true }     // not in the air
{ "K_NAME": "BAR", "AMOUNT": 99.99 }  // awakening bar at least 99.99
```

| `K_NAME` | Holds when | Seen on |
|---|---|---|
| `AIR` | in the air | melee Downslam branch; `FLIP` on a skill = "not usable in the air" |
| `JUMP` | jumping | melee Uppercut branch |
| `HOLD` | the key is held | a barrage's "Walk" branch |
| `ULT` | awakened | "Awakened" branches of passives, chase and special |
| `BAR` | awakening bar ≥ `AMOUNT` | awakenings |
| `HP` | Has Health: more health than `AMOUNT` (flipped, less). `AMOUNT` defaults to 10 | the owner's export, written bare as `{"K_NAME":"HP"}` with its defaults |
| `DUR` | Durability: the skill is lost after `DURABILITY` uses (default 1). It has no `FLIP` | the owner's ODM gear, on its spawn-in passives (bare, `{"K_NAME":"DUR"}`) |
| `AIM` | Has Target (the guides: facing a player or NPC) | the builder's table only |
| `DOMAIN` | Is In Domain | the builder's table only |

The builder's own table (section 12) lists exactly these nine: `AIR`,
`JUMP`, `AIM`, `ULT`, `HP`, `BAR`, `DOMAIN`, `DUR`, `HOLD`. Every one but
`DUR` has `FLIP`; `HP` and `BAR` take `AMOUNT` (defaults 10 and 5), `DUR`
takes `DURABILITY`.

`FLIP: true` inverts a condition. Melee 4's `Base` branch has
`[NOT AIR, NOT JUMP]`: the ground version. The builder shows `FLIP` as a
green toggle and "off" as red, which the guides call "backwards": In Air
*red* means only in the air, *green* only on the ground.

Durability (`DUR`), with Use When Obtained, is how a spawn-in move runs
once. Has Awk Bar is `BAR`: more than `AMOUNT`, or with `FLIP`, less.

### `Prop`: flags

An object of flags, or `[]`. The builder's own defaults (section 12) are
`DMG 1`, `KNOCK 1`, `KEEP`, `REP`, `INV`, `REP2`, `AWK`, `AWK2`, `USE`,
`USEONDEATH`, `NOSTUN`, `NOCANCEL` (all false), and `VAR "-"` (no
variant). That is the guides' Properties list, in its order, key for key:
Damage Multiplier, Knockback Multiplier, Keep, Replace if Occupied,
Invincible, Prevent Override, Hide in Awakening, Hide in Base, Use When
Obtained, Use on Death, No Stun, No Cancel, Variant. The first four rows
below are **confirmed by the owner**. The rest match the builder's keys to
the guides' names.

| Flag | Properties toggle | Meaning |
|---|---|---|
| `USE` | Use When Obtained | the skill is used **as soon as it's obtained**, i.e. on spawn. Every passive has it. |
| `KEEP` | Keep when moveset switches | the skill stays when the moveset changes (a character block or another custom event): for **weapons and arsenal** |
| `NOSTUN` | No Stun | the skill **doesn't stun you**: you can move, dash and use other skills while it runs |
| `NOCANCEL` | No Cancel | being hit **doesn't interrupt it** |
| `VAR` | Variant | a tag name. While that tag is active, the skill **can be used even on cooldown** (confirmed) and through stun (guides). `"S3UseTwice"` is the tag the skill checks for its second use. |
| `REP` | Replace Skill if Occupied | takes the key's slot even if something's in it. On nearly every keyed skill. |
| `REP2` | Prevent Override | can't be replaced by another skill. On an awakening and the regen passive. |
| `AWK` | Hide in Awakening | on **every base skill** in character 2, and on passives |
| `AWK2` | Hide in Base | on **every awakened skill** in character 2, and on passives |
| `INV` | Invincible | invulnerable for the move's duration (guides) |
| `USEONDEATH` | Use on Death | runs when you die: death effects, final blasts (guides) |
| `DMG` | Damage Multiplier (a number, default 1) | multiplies the move's damage; negative heals (guides) |
| `KNOCK` | Knockback Multiplier (a number, default 1) | negative reverses knockback (guides) |

That's why passives have **both `NOSTUN` and `NOCANCEL`** (owner): a
passive runs for ever, so it mustn't stun you or be cut off when you're hit.
Passives also carry both `AWK` and `AWK2`, harmless on a key nobody presses.

None of `DMG`, `KNOCK`, `INV` or `USEONDEATH` appears in an export yet;
the simulator doesn't apply them.

---

## 4. How a program runs

This model is **inferred**, but everything in the fixtures fits it, and the
owner's Safety Rails and progress bar skills depend on it working this way.
Arayashiki's simulator (`core/sim.js`) implements exactly this.

0. **A field a node leaves out takes the builder's default** (section 12's
   table: a bare `{"K_NAME":"WAIT"}` waits 1 s, a bare `STATE` is a 1 s
   Stun, a `TAG` with no `SET` sets). Confirmed for VISUAL: the client fills
   each missing field from that table before drawing. For the rest it's
   inferred, and the exports fit it: every sparse node reads naturally as a
   palette node left at its defaults (a 1 s endlag, `CancelChase = "True"`
   for 1 s). The simulator does this since September 2026 (`withDefaults`
   in `core/schema.js`).
1. Using a skill runs its `Line` from the top. Nodes run in order; only
   `WAIT` takes real time, though the guides say each node is spaced about
   **0.01 s** from the next, which adds up in long loops. (The simulator
   counts nodes as instant.)
2. **`BRANCH` is a gated jump.** If the named branch exists and its `Req`
   holds, control **goes there and doesn't come back**. Otherwise the line
   **carries on to the next node**. So a line of
   `BRANCH Base · BRANCH Downslam · BRANCH Uppercut` picks whichever variant's
   conditions hold (melee 4, both characters).
3. **A missing branch does nothing**, so a `BRANCH` to a name like
   `">Safety Rails"` is a **comment** (confirmed by the owner).
4. When a branch's line ends, that thread of execution ends.
5. **Loops** are a branch that ends by branching to itself
   (`1Looper: WAIT 0.1 → BRANCH Awakened → BRANCH 1Looper`), or a `LOOP` node.
6. **A hit moves the line on.** A `HITBOX` that connects sends the
   **attacker's** line to its `BRANCH` (e.g. "OnHit": follow-ups, camera
   shake, knockback applied to the target), and **the rest of the line is
   dropped** (guides). It also starts `BRANCH TARGET` on the **one hit**
   ("OnHitTarget": their stun, hit effects, their reaction), alongside
   whatever they were doing. `BRANCH FINISHER` replaces `BRANCH` when the
   hit leaves them on 1 HP or less. The fixtures depend on this: the
   blocked-recoil detector after every M1, and the dash's "nobody there"
   stun, are only reached when the real hit didn't land. **A projectile's
   `BRANCH` and `BRANCH COLLIDED` do the same** when they happen, later:
   they replace the line that fired the projectile, wherever it has got to.
   (`BRANCH COLLIDED` is confirmed by the owner. The guides say it of
   `BRANCH`, and the simulator follows both.) A skill runs one line at a time.
7. **`LAST HIT` picks who a node affects.** `-1` means whoever runs it, and
   so does **`0`** (a zero-second window fits nobody; Overhead Kiss's rising
   kick is a `VELO` with `LAST HIT 0` that has to lift you, so the simulator
   treats it as you: inferred). A positive
   number (0.1–3.6 seen) means "the ones I last hit, if within that many
   seconds" (several, for most nodes). That's how an attacker's OnHit branch
   pushes the *target*: `VELO FORCE "0, 2, 30" LAST HIT 1`. The guides warn
   that **a hit only counts if its `STUN` isn't 0**: any tiny stun will do,
   which is why detector hitboxes have `STUN -1` or `0.0001`. A `BRANCH` with
   `LAST HIT 1` runs the branch on the one hit (only one), and your own line
   carries on. If your line ends while they're still in it, you're free and
   the cooldown starts (bleeds, blinds).
8. **`RELATIVE FROM BRANCH`** (on VELO, VISUAL, TELEPORT…): directions are
   taken from the character that started the branch (the attacker, in a
   target branch), not the one it's applied to (inferred).
9. **`PROJECTILE TAG`** links things to a projectile. Effects and sounds with
   the same tag and `RELATIVE FROM BRANCH` follow it, and `TELEPORT` with it
   moves you to it. A projectile with `SPEED 0` is an **anchor**: a fixed
   point to hang effects on.

---

### Movement and physics (the simulator's model)

`core/physics.js` moves both characters, at Roblox's 240 steps a second.
The hitboxes aim at where it puts them, and the 3D view draws it. Each rule
says where it comes from.

| Rule | Source |
|---|---|
| Gravity is **196.2 studs/s²** (Roblox's default `Workspace.Gravity`). JJS keeps the default. | read from the place in Studio |
| While a `VELO` lasts, it **sets** the character's horizontal velocity, and the vertical one unless its y is exactly 0. `"0, 0.001, 0"` pins someone in the air; `"0, 0, 60"` lets a dash fall off a ledge. | inferred from the pin tricks (confirmed usage) |
| With the **In the air** condition you start 8 studs up, falling; with **Jumping**, just off the ground going up at 50 studs/s (Roblox's JumpPower: about 6.4 studs high). So an air move's pushes (a downslam, an air dash) act on you in the air, as in the game, instead of against the floor. (Until October 2026 the simulator started you standing whatever the conditions said.) | Roblox defaults; the height is a stand-in |
| When a push ends, the character **keeps its velocity**: a launch keeps rising (40 studs/s for 0.2 s rises 8 studs, then about 4 more) and arcs back down. | Roblox physics (Overhead Kiss's throw matches in-game this way) |
| A standing character is a Humanoid that **brakes its own horizontal motion** in about 0.05 s on the ground and 0.09 s in the air (a stunned player isn't steering). | inferred (fitted) |
| A **ragdolled** character isn't braked: it flies on its momentum, **slides** on the ground (friction 0.45, i.e. 88 studs/s² of slowing) and **bounces** (30%) off the floor and a wall. | friction and bounce fitted |
| A **regular ragdoll's** time starts counting only when it **touches a surface**; a **TRUE RAGDOLL** counts from the hit. | JJS wiki |
| Getting up gives **0.75 s** in which **melee** hits don't stun, unless the hit has `IGNORE WAKEUP`. | JJS wiki |
| A ragdolled character is only hit by hitboxes with **`HIT RAGDOLL`** ("Always hit" still forces it). | guides |
| `CLEAR KNOCKBACK` on a hit stops the knockback, zeroes the momentum and ends the ragdoll. | guides |
| A `GRAB` holds its victim at the grabber's body part (plus `POSITION`); they leave with the grabber's velocity. A `TELEPORT` leaves someone at rest. | inferred |
| A `TELEPORT` moves them at once: a `HITBOX`, `VISUAL` or anything else right after it in the line (no `WAIT` between) already happens where they landed, since a line's nodes run in the same frame. | inferred |
| A run lasts until both characters have **landed, stopped and got up**, so a whole knockback shows. | the simulator's choice |

In the 3D view, a ragdoll is a real rigid-body ragdoll (cannon-es): the
six R6 parts joined at the neck, shoulders and hips, as JJS swaps a
character's Motor6Ds for BallSocketConstraints. It's baked per run so it
can be scrubbed, and it follows the simulator's path to within a couple of
studs. It's drawn only: the rules above decide hits.

**Not modelled:** the characters bumping into each other, the dummy acting
or blocking, slopes, and the player steering in the air.

When physics was added (September 2026), outcomes (hits, branches, damage)
stayed the same in 242 of the 250 golden simulations. In the other 8,
knockback now carries a little, a launched dummy falls back into reach,
and a detector hitbox without `HIT RAGDOLL` no longer hits a ragdoll.

## 5. Nodes

Every node has `K_NAME`. The builder has **25 node kinds** (and the nine
conditions); the fixtures use 21, listed here most-used first (the counts
are from the first two characters). The other four are `HITCNCL` (HIT
CANCEL), `SPECIAL`, `CONNECT` and `EVGIB` (Add Evasion), under
[Palette names](#palette-names-in-the-game). Every field of every kind, with
its type, default and the builder's own tooltip, is in `core/gamedata.js`
(`NODE_DEFAULTS`, read from the game); `core/schema.js` builds the editor's
catalogue on it. **Every field in every real export is one of the builder's**
(checked against all of `data/exports/`), so a field that isn't is a typo
JJS ignores, and `validate` says so. Field types: `num`, `str`, `bool`,
`"x, y, z"` (a string), `"r, g, b"`, `[a, b]` (an array); particles also take
number sequences (`"1, 0"`), colour sequences (`"255,255,255 0,0,0"`) and
ranges (`"min, max"`).

### VISUAL (868 uses): an effect

`EFFECT` (37 seen), `TIME`, `BODY PART`, `TEXTURE` (a Roblox **image** ID, for
Billboard/Overlay/Mesh), `SIZE`→`ALT SIZE`, `POSITION`→`ALT POSITION`,
`ROTATION`→`ALT ROTATION`, `COLOR`→`ALT COLOR`, `OPACITY`→`ALT OPACITY`
(transparency: 0 is solid), `EASING STYLE` (Linear, Quad, Cubic, Exponential,
Sine, Back), `EASING DIRECTION` (In, Out, InOut), `SIZE 2`/`ALT SIZE 2`
(`"-1, -1, -1"` = unused), `AMOUNT`, `PROJECTILE TAG`, `VISUAL TAG` (a name a
`Cancel` effect removes it by), `RELATIVE FROM BRANCH`, `CAN COLLIDE`,
`CLIENT SIDED`, `RUN ON SERVER`, `CANCEL ON INTERRUPT`, `LAST HIT`.

The effect **eases towards its `ALT` values over `TIME`** (with `EASING
STYLE`, any of Roblox's: Linear, Sine, Quad, Cubic, Quart, Quint,
Exponential, Circular, Back, Bounce, Elastic). Each `ALT` works differently.
These rules are **from the game's code** (`BuilderFX`, section 12) unless
marked, and they agree with what the owner found in-game:

- **Where an effect goes depends on the effect.** BuilderFX places them in
  three ways (`EFFECT_INFO[effect].origin` in `core/gamedata.js`, and
  `node_reference VISUAL` lists each):
  - **Parts (`effect`)**: Sphere, Mesh, Block, Wedge, Cylinder. It starts
    at `part * CFrame.new(POSITION) * Angles(ROTATION)` and tweens to
    **`start * CFrame.new(POSITION) * CFrame.new(ALT POSITION) *
    Angles(ALT ROTATION)`**: the move is `POSITION + ALT POSITION`, in the
    effect's own turned axes. So `POSITION` is applied **twice**. At
    `POSITION "0, 0, 0"` that's the plain move the owner measured on the
    fishing rod (in the rod's turned axes: `ROTATION "-90, 180, 0"` makes
    `(x, y, z)` → `(right, back, down)`). With a `POSITION`, the end is
    further out than a plain sum. (This file used to say the move is just
    `ALT POSITION`, added: that's only right when `POSITION` is zero.)
  - **On the part (`part`)**: the particle effects (Sparks, Ring, Star,
    Clash, 360 Wind, Wind Streak, Light…). An attachment at `POSITION`,
    tweened to `part * CFrame.new(POSITION) * CFrame.new(ALT POSITION)`:
    a plain move in the **body part's** axes, not turned.
  - **Welded (`weld`)**: Slash and Whirl Slash. Their weld's `C0` is
    `CFrame.new(POSITION)` in Roblox's raw axes (x right, z **back**), and
    it tweens to `CFrame.new(ALT POSITION)`: **a destination**, even when
    it's `0, 0, 0`.
- **`ALT POSITION` other than `0, 0, 0` unanchors the visual**: it stays in
  the world where it started instead of following the part (a part effect
  with none is welded to the limb). The exceptions are **Billboard**
  (below) and **immovable visuals** such as **Wind Expand** (owner).
- **`ALT ROTATION` is added to `ROTATION`**, and only turns anything when
  there is an `ALT POSITION`: with none, the effect is welded and never
  tweened. So **a visual can't both spin and stay pinned to a limb**; a
  tiny move like `ALT POSITION "0, 0.0001, 0"` lets it spin (the dash's
  wind streaks use `"0, 0.001, 0"`). With `ALT ROTATION` absent, JJS fills
  its default `0, 0, 0`, so the effect keeps its `ROTATION`.
- **`ALT SIZE` is a multiplier** of `SIZE`: `SIZE 25, ALT SIZE 2` ends at 50.
  To end at a size *s*, use *s* / `SIZE`. A part effect's size is `SIZE` on
  every axis (a Mesh's `SpecialMesh.Scale`).
- **`SIZE 2` replaces the size whole, not per axis**: anything but
  `"-1, -1, -1"` is used as the `x, y, z` size (a `-1` in it is a size of
  -1, not "leave this axis"). It tweens to `ALT SIZE 2` if that isn't
  `-1, -1, -1`, **else back to `SIZE × ALT SIZE`**, uniform. So squash and
  stretch wants both. Only part effects read them.
- **`ALT SIZE 2` is a second tween on the part, and both run** (tested in
  Studio with BuilderFX's own calls on its Ball template): the first still
  moves the part, fades it and changes its colour, and the second takes its
  size to `ALT SIZE 2`. The part grows about its **middle** while it moves,
  so a block stretching along its travel has a front edge that races ahead
  and a back edge that lags (SIZE 2 `2, 2, 10` → `2, 2, 30` while moving 20
  studs: the front goes 30, the back 10).
- **Which fields an effect reads** is in `EFFECT_INFO` too: Sparks has no
  `ALT SIZE`, Flames no `POSITION`, and so on. The app dims the ones the
  chosen effect ignores, and `validate` points out set ones.
- **`ALT OPACITY` defaults to 0** (solid), like `OPACITY`: an effect only
  fades out if you set it.
- **`TIME` is also its life**: the effect is removed after `TIME`.
- `OPACITY` → `ALT OPACITY` and `COLOR` → `ALT COLOR` fade as you'd expect.
- **`BODY PART`**: the guides say most effects need `POSITION "0, -1, 0.15"`
  to sit in the hand on an arm.
- **`RUN ON SERVER`** runs it on the server rather than on each client.
  That's heavier, so it's for auras, weapons and states, not attack effects.
  It's a different thing from **`CLIENT SIDED`** (only the user sees it).
- **`TEXTURE`** wants the **image** (texture) ID, not the decal's (see
  [section 8](#8-roblox-pictures-for-textures)).

- **`Billboard`** is placed **pseudo-2D** (confirmed by the owner in-game): its
  `POSITION` is on the screen around the body part, not in the world.
  **x** goes across, and negative is to the **right**. **y** goes up and down
  (negative is down). **z** is a **layer**, like a z-index: negative draws it
  in front of the character, positive behind. A y only sticks if **`ALT
  POSITION`** holds **minus twice** that y: `POSITION "0, 4, 0"` wants
  `ALT POSITION "0, -8, 0"`. The code shows why: it's a BillboardGui on
  the **HumanoidRootPart** (whatever `BODY PART` says) whose image starts at
  `-y / 10 + 0.5` of its height but tweens to `+(y + ALT y) / 10 + 0.5`, a
  sign slip in JJS. The Gui is `15 × AMOUNT` studs across and the image
  `0.15 × SIZE` of it, so the picture is **`2.25 × SIZE × AMOUNT` studs**.
  With `TEXTURE 0` it shows image `14978581240`. The Progress Bar Maker writes the pair for you
  (`billboardAlt` in `core/barskill.js`), and its 3D preview
  (`src/barmaker/preview3d.js`) places the billboard this way.
- **`Mesh`**: `AMOUNT` is the **mesh ID** and `TEXTURE` its texture (inferred:
  a katana is `AMOUNT 10447572102, TEXTURE 10447572165`). With `TIME 1e38`,
  `CANCEL ON INTERRUPT` and a `VISUAL TAG`, it's a **worn item**. `SIZE`
  scales the mesh's own units: that katana's mesh is 50 studs long, and
  `SIZE 0.12` makes it 6 (inferred from how it looks in-game). `SIZE 2`
  overrides it on each axis it sets; `-1` leaves the axis to `SIZE`. The
  mesh is centred on its bounding box, as Roblox draws meshes, and
  `ROTATION` turns it in Roblox's own frame for the body part (facing -z),
  not the flipped x-left, z-forward frame positions are given in (the
  owner: meshes drawn in that frame faced the wrong way).
- **`Cancel`**: removes the effects with the same `VISUAL TAG` (confirmed by
  the auto-sheathing passive, which moves a sword between back and hand this
  way). **The Cancel must be on the same `BODY PART`** as the visual it
  cancels (owner). The guides add that its `RUN ON SERVER` must match too.
  Most of its other fields do nothing.
- **Screen effects** only show to the character the node runs on, on their
  own screen (so to the one hit, with `LAST HIT`): Field of View, Screen
  Color, Overlay, Camera and the Shakes (code).
  - **Field of View** tweens the camera to **`69 + AMOUNT`** over `TIME`
    and **stays there**: nothing sets it back, so a move ends with a second
    FOV (`AMOUNT 0`). Positive zooms out.
  - **Screen Color** is a ColorCorrectionEffect for `TIME`: Brightness
    `AMOUNT`, Saturation `OPACITY` → `ALT OPACITY`, Contrast `SIZE` →
    `SIZE × ALT SIZE`, TintColor `COLOR` → `ALT COLOR` (code). The guides'
    "negative inverts the colours" is a negative contrast.
  - **Overlay**: an image `SIZE` × the screen (→ `× ALT SIZE`), centred, from
    `OPACITY` to `ALT OPACITY`, tinted `COLOR` → `ALT COLOR`; nothing without a
    `TEXTURE`.
  - **Shake Light / Medium / Heavy**: `AMOUNT` is how many of that shake
    start at once.
  - **Camera**: the view is fixed to the body part at `POSITION`/`ROTATION`,
    easing to the ALT ones, for `TIME`. From BuilderFX's code: each block
    runs on RenderStepped and stamps `CameraStart`, so **the newest block
    moves the view**; but **any** block whose `TIME` runs out sets the camera
    back to `Custom` (the player's), even while a newer one is running. So
    Camera blocks that overlap, or leave a gap, snap the view to the player
    for a frame (a jitter). Chain them back to back: each `TIME` ending where
    the next block starts, in whole frames (a WAIT lasts at least one frame,
    1/60 s). The tween is `CFrame:Lerp` by `TweenService:GetValue` with
    `EASING STYLE`/`EASING DIRECTION`, so one block can ease a whole move.
- **Blood**: `AMOUNT` drops, each a random size between `SIZE / 2` and
  `SIZE` (code).
- From the guides: **Dismantle** only shows with an `ALT POSITION` (even
  `0, 0, 0.01`); **Mass Hit** only shows with a `POSITION`, and its `ALT
  POSITION` turns it.

**The effects**: BuilderFX's table has 47 entries, `Cancel` and these 46: 360 Wind, Afterimage,
Afterimage2, Beam, Beams, Billboard, Black Flash, Block, Blood, Burst,
Camera, Circle Glow, Clash, Cleave, Cursed Energy, Cylinder, Dismantle,
Distortion, Energy Sparks, Field of View, Flames, Glow, Light, Mass Hit,
Melee Trail, Mesh, Overlay, Ring, Rough Energy, Screen Color, Shake Heavy,
Shake Light, Shake Medium, Shine, Slash, Sparks, Sphere, Star, Star Outline,
Visibility, Weak Lightning, Wedge, Whirl Slash, Wind Expand, Wind Ring, Wind
Streak. **An `EFFECT` not in the list draws nothing.** Most are one of the
game's own effects reused (Black Flash is Itadori's, Clash an item's, Wind
Expand Mahoraga's ritual); the template each clones is in `EFFECT_INFO`.
Body parts (R6): HumanoidRootPart, Head, Torso, Right/Left Arm, Right/Left
Leg.

### STATE (200): a state for a time, or a check for one

`STATE`, `VALUE` (1, or a multiplier like 0.2; "used for SpeedMultiplier,
JumpMultiplier, and Scale"), `TIME`, `CANCEL ON END`, `DISABLE BURST`,
`LAST HIT`, `STATE TAG`; and `CHECK` + `BRANCH`: **if in that state, jump**
(a custom block is `STATE Block CHECK → BRANCH Block` in a passive loop;
with `LAST HIT` it checks the one hit, per the builder's tooltip).

**The builder's 28 states** (ListData): Cancel, Stun, IFrame, NoM1,
NoSprint, NoJump, NoDash, NoBlock, NoParkour, NoMass, NoDeath,
DisableChase, Block, DirectionLock, SpeedMultiplier, JumpMultiplier,
DamageMultiplier, HealthMultiplier, KnockbackMultiplier, Scale (`VALUE
"0.9"` for ever: a smaller character), InSkill, CameraMaxZoomDistance,
Wakeup, Ragdoll, Character, Projection, Bleed, LastHit. (The guides' NoChase
isn't one: the state is DisableChase.)

**`Cancel` and `STATE TAG`** (from the game's code): a state set with a
`STATE TAG` can be removed by a `STATE Cancel` node with the same `STATE
TAG`, per the builder's tooltip. The owner's finding that "a state can't be
cancelled" predates this or concerns untagged states; the top-up pattern
below still works either way. The simulator removes tagged states on a
Cancel.

- **`CANCEL ON END`**: the builder's tooltip says "The State gets cancelled
  when the skill ends". The guides read it the other way round (the line
  ends when the state runs out, which is how they explain the dash's 1.2 s
  states capping it). Trust the tooltip; the simulator does neither yet.
- **`Stun`** stops new actions but not a move already running.
- **`Block`** blocks without the animation.
- **`DirectionLock`** stops turning.
- **`NoChase`** stops only the forward dash; **`NoDash`** stops every dash.
- **`SpeedMultiplier`** and **`JumpMultiplier`** multiply walk speed (16)
  and jump power (40).
- **`DISABLE BURST`** blocks burst for the time.

**A state can't be cancelled** (owner): once set, it lasts its whole `TIME`.
If a move can end early (say, a hook that catches someone close), don't give
it one long `InSkill`. Set short states and top them up along the line, and
have each branch it can jump to set its own. When the line leaves, the top-ups
stop, and what's left runs out within one short interval.

### WAIT (185)

`TIME`. The only thing that moves a line's time on.

### SFX (146): a sound

`ID` (Roblox sound), `VOLUME`, `START`, `END` (500 = to the end), `SPEED`,
`FADE IN`, `FADE OUT`, `PROJECTILE TAG`, `GLOBAL`, `CANCEL`, `CLIENT SIDED`,
`LAST HIT`. `CANCEL` stops the sounds with the same `ID` (guides, and the
client's code: it removes the playing sounds whose ID matches; the builder's
tooltip says "all"). Most sounds need `VOLUME` 2–3 to be heard: the
builder's default is **0.5**. `GLOBAL` drops the 3D falloff, so everyone
hears it at the same volume. The game's own sounds, with their IDs and the
volumes JJS plays them at, are in `docs/jjs-game/sounds.json` (`game_assets`).

How the client plays one (HandicapController's customSFX, read in Studio):
`Volume = VOLUME`, `PlaybackSpeed = SPEED`, and `START`–`END` become a
**PlaybackRegion**, so the sound simply stops at `END`. **`FADE IN`** tweens
the volume up from 0 over that many seconds. **`FADE OUT`** waits
`TimeLength - START - FADE OUT` seconds, measured against the **whole
file's** length (not `END`), then tweens the volume to 0: so a sound cut
short by `END` never fades. `CANCEL` removes that character's sounds whose
ID matches (on the workspace with `GLOBAL`). The simulator's playback
follows these rules.

### ANIM (130): an animation

`ANIM_USE`: JJS's **own animation library**, as `[set, number]`
(e.g. `[20, 17]`), or a **name** (`"Killbind"`). **`[set, n]` is the n-th
animation of the set-th character in the builder's `AnimList`** (from the
game's code; 25 sets, 515 animations): set 1 Gojo, 2 Itadori, 3 Hakari,
4 Megumi, 5 Mahoraga, 6 Mahito, 7 Choso, 8 Todo, 9 Locust, 10 Hiromi,
11 Yuki, 12 Heian, 13 Yuta, 14 Charles, 15 Mechamaru, 16 Naoya, 17 Nanami,
18 Goku, 19 Haruta, 20 MeiMei, 21 Hanami, 22 Ryu, 23 Kurourushi, 24 Reggie,
25 Uro. So the dash's `[1, 19]` is Gojo's `Melee.Chase` and the sheath's
`[13, 4]` is Yuta's `Sheath`. `core/gamedata.js` (`ANIM_SETS`) has every one
with its animation ID; `game_assets` / `sbs game` finds them by name. How a
name like `"Killbind"` resolves isn't in the place. `PREVIEW`: the `[start, end]`
seconds of the clip to play. `SPEED` (can be negative, to play backwards),
`LOOPED`, `FADE IN`, `FADE OUT`, `LAST HIT`. `PREVIEW [0,0]` with speed 1 is
used to cancel an animation. An animation stops when the skill does; on the
one hit (`LAST HIT 1`), it plays while they're stunned (guides).

### VELO (113): push a character

`FORCE` `"x, y, z"`: studs/second, **x left** (negative is right), y up,
z forward. `TIME`, `FADE` (slows to a stop), `TRACK` (follows facing),
`RELATIVE FROM BRANCH` (on a target, directions come from whoever started
the branch), `RAGDOLL` (seconds), `TRUE RAGDOLL` (can't be ragdoll-cancelled),
`LAST HIT`.
`"0.001, 0.001, 0.001"` for a long time **pins a character in place** (seen
during grabs).

**A newer VELO replaces the one in progress** (inferred; the simulator does
this). The dash's OnHit pin stops the dash, and in the owner's air fishing
rod a hover pin holds a boost where it ends. Pushes don't add up, so a pin
set while a boost is still running cuts the boost off.

### HITBOX (64): hit what's in a box

`SIZE`, `POSITION` (in front is +z), `ROTATION`, `DAMAGE`, `STUN` (seconds),
`BRANCH` (attacker), `BRANCH TARGET` (the one hit), `BRANCH FINISHER` (on a
kill), `ATTACK TYPE` (Melee, Bullet, Explosion, Swarm, Domain: the
builder's list), `BLOCKABLE`, `SINGLE TARGET`, `HIT RAGDOLL`, `STUN ANIM`,
`CAN KILL`, `CANCEL ENEMY`, `CLEAR KNOCKBACK`, `IGNORE WAKEUP`, `360 BLOCK`,
`HIT USER`, `DEBREE`, `PROJECTILE TAG`, `LINK USER`, `PREVIEW` (`[0, 15]`
always). `"nil"` or `""` as a branch means none. A zero-damage hitbox is
often a **detector**: its `BRANCH` ("HitCheck") decides what to do next.

The builder's defaults (a field left out takes them): `SIZE "6, 6, 6"`,
`POSITION "0, 0, 4"`, `DAMAGE 1`, `STUN 1`, `SINGLE TARGET` **on**,
`IGNORE WAKEUP` **on** ("disable for accurate M1s"), `CANCEL ENEMY` on,
`BLOCKABLE` on, `CAN KILL` on, the rest off. Its tooltips add:

- **`STUN -1`** is "no stun but still mark as LAST HIT": the detector's
  value.
- **`LINK USER`** is how long the hitbox can be hit itself, passing the
  attack on to the user.
- **`DEBREE`** is the debris fidelity (2 by default when on); negative
  breaks without debris.
- **`CAN KILL`** off: "cannot receive more damage than their current
  health".
- **`PROJECTILE TAG`**: "If matched with an existing projectile, the
  hitbox's origin is set to the projectile's position." The simulator puts
  it there (plus `POSITION`), instead of on your root part.

The simulator checks a hitbox once, when its node runs: the box (`SIZE`,
turned by your heading then `ROTATION`) against the target's body box (4 ×
5 × 1 studs standing, lying on the ground when ragdolled). Any overlap hits,
as a Roblox part query would.

From the guides:

- `CAN KILL` off leaves them on 1 HP (finisher variants).
- `SINGLE TARGET` hits the one nearest the box's centre.
- `360 BLOCK` on lets it be blocked from any side; off, it breaks a block
  from behind.
- `HIT RAGDOLL` hits ragdolled characters.
- `CANCEL ENEMY` cancels their move (with a stun of 0.1 or less and it off,
  it doesn't).
- `CLEAR KNOCKBACK` stops their knockback and picks them up from a ragdoll.
- `DEBREE` is debris size: 0 none, -1 breaks the ground without debris.
- A long box usually wants its z `POSITION` at half its z `SIZE`, so it
  starts at you.

### BRANCH (53): gated jump

`BRANCH`, `RANDOM` (`"V1, V2"`: pick one at random; `BRANCH` is then `""`),
`LAST HIT`. See [section 4](#4-how-a-program-runs). Branch names are
**case-sensitive**. `RANDOM` is typed `V1,V2` with no spaces, and the game
spaces it out itself.

### TAG (38): named values

`TAG`, `VALUE`, `TIME`, `SET`, `ADD/REMOVE`, `CHECK`, `BRANCH`, `LAST HIT`.

| Job | Fields | Example |
|---|---|---|
| Check | `CHECK true`, `BRANCH` | `VALUE "2"` exact; `"<0"`, `">20"` compare (confirmed) |
| Add | `SET false`, `ADD/REMOVE true`, numeric `VALUE` | `"1"`, `"-1"`: debug skills, regen |
| Subtract | `SET false`, `ADD/REMOVE false` | takes `VALUE` away (the builder's tooltip) |
| Set | `SET true` (**the default**: a TAG with no `SET` sets) | sets the value, whatever it was |
| Clear | `SET true`, `TIME 0` | expires at once |

`TIME` is how long a written value lasts (`1e38` for ever; **the default is
1 s**). Non-numeric values (`"True"`, `"Yes"`) are flags, set and checked by
equality. The builder's defaults are `SET true`, `ADD/REMOVE true`, `CHECK
false`, `TIME 1`.

**Bug: a plain `SET` sometimes doesn't take** (owner). The sure way is to
**clear, then set**: `SET` with `TIME 0`, then `SET` the value for as long
as you want. The tag is **reactivated** rather than added to or rewritten,
which dodges the bug. The Safety Rails do exactly this, and so should
anything that must land. (The guides suggest other workarounds, such as
adding 0 for 0.0001 s and waiting it out before adding the value; the
owner's clear-then-set is the one used here.)

More from the guides:

- The **latest write's `TIME` wins**: set 1 for 3 s and then add 0 for 2 s,
  and the tag is gone after 2 s.
- **An expired tag is gone**: no check matches it, not even `"0"` or `""`.
  Tags also go when their owner dies.
- `CHECK` with `LAST HIT` (checking someone else's tag) is reported as
  buggy: keep `LAST HIT -1`.
- One guide (April 2026) warned that `<`/`>` checks were broken. **The
  owner's bars use them and work**, so this file treats them as working.
- "For ever" is `1e38` here. The guides use `1e+250` (or `1e+20` if that
  fails); `1e38` is what the game itself writes.

### PARTICLE (29): a Roblox ParticleEmitter

Mirrors Roblox's ParticleEmitter: `TEXTURE`, `EMIT COUNT`, `LIFETIME`
(`"min, max"`), `SIZE`, `SPEED`, `SPREAD ANGLE`, `COLOR`, `TRANSPARENCY`,
`BRIGHTNESS`, `LIGHT EMISSION`, `LIGHT INFLUENCE`, `ZOFFSET`, `SHAPE`,
`SHAPE INOUT`, `SHAPE PARTIAL`, `EMISSION DIRECTION`, `ORIENTATION TYPE`,
`ROTATION`, `ROT SPEED`, `ACCELERATION`, `DRAG`, `RATE`, `DURATION`,
`LOCK TO PART`, `FLIPBOOK MODE/SIZE/FRAMERATE`, `SQUASH`, `BODY PART`,
`POSITION`, `PART SIZE`, `PROJECTILE TAG`, `CLIENT SIDED`, `CANCEL`,
`CANCEL TAG`, `CANCEL ON INTERRUPT`, `RUN ON SERVER`, `LAST HIT`.

From the game's code (the client that makes it): `PART SIZE` `0, 0, 0`
emits from an attachment, anything else from an invisible part of that
size. `EMIT COUNT` particles come out at once; with `DURATION` above 0 it
emits at `RATE` a second for that long instead. `SIZE`, `TRANSPARENCY` and
`SQUASH` are number sequences (`"1, 0.5, 0"`, spread evenly), `COLOR` a
colour sequence (`"255,0,0 0,0,255"`), `LIFETIME`, `SPEED`, `ROTATION`,
`ROT SPEED` and `FLIPBOOK FRAMERATE` ranges. `CANCEL` with a `CANCEL TAG`
removes this skill's emitters with that tag.

### LOOP (17)

`LOOP BACK` (nodes to go back), `LOOP AMOUNT` (times), `HOLD` (only while
the key is held). `HITBOX · WAIT 0.05 · LOOP BACK 2 × 9` = a hitbox every
0.05s, ten times (inferred: the first pass plus 9 repeats; the guides agree
that the first pass counts). The guides call loop timing with `HOLD`
unreliable, and suggest a short `WAIT` inside every loop.

### PROJECTILE (13)

`PROJECTILE TAG`, `SPEED` (0 = anchor), `TIME`, `SIZE`, `POSITION`,
`ROTATION`, `DAMAGE`, `STUN`, `BRANCH TARGET`, `BRANCH COLLIDED`, `CONTINUE`
(keeps going after a hit), `ATTACK TYPE`, `AIM LAST HIT`, `REFLECT COUNT`,
`CAN KILL`, `BLOCKABLE`, `HIT RAGDOLL`, `STUN ANIM`, `CANCEL ENEMY`,
`CLEAR KNOCKBACK`, `IGNORE WAKEUP`, `CANCEL PROJECTILE`, `FILTER INTERVAL`,
`CACHE`, `HIT USER`, `360 BLOCK`, `DEBREE`, `ID CHECK`, and two the
exports haven't used: **`BRANCH`** (yours, on a hit) and **`SPAWN AT
PROJECTILE TAG`** (starts it from an existing projectile with that tag).

The builder's tooltips (from the game's code):

- **`BRANCH COLLIDED`**: "If empty, the projectile ignores collisions".
- **`CONTINUE`** keeps it going after a target **or the environment**.
- **`CANCEL PROJECTILE`** removes every projectile with the same tag,
  except a cached one. **`CACHE`** keeps a projectile's tag usable after it's
  gone. **`ID CHECK`** (on) keeps the tag to this move's projectiles.
- **`REFLECT COUNT`** is how many times it bounces off the environment.
- Defaults: `SPEED 1`, `TIME 1`, `SIZE "6, 6, 6"`, `DAMAGE 1`, `STUN 1`,
  `ATTACK TYPE "Melee"`, `BLOCKABLE`, `CAN KILL`, `CANCEL ENEMY`, `IGNORE
  WAKEUP`, `ID CHECK` and `CACHE` on; `CONTINUE` off.

From the owner's tests (the fishing rod, below):

- **`BRANCH COLLIDED` works**, and it's the only node that can
  detect the ground or a wall. One guide calls it non-functional; the owner
  says otherwise. It runs **as you** (a `VELO` in it launched the owner), and
  it appears to **replace your line**, like a hitbox's `BRANCH`: a rod whose
  probes collided during the wind-up just stopped there (owner). So the
  collided branch has to carry the rest of the move itself. (An earlier
  test seemed to show the line carrying on; the stopped rod is the clearer
  evidence.) A Field of View in it didn't show, nor did a Glow with the
  projectile's `PROJECTILE TAG`, but a Mesh with that tag did.
- **`ROTATION` steers it**: `"30, 0, 0"` flew upwards, so to aim down,
  use a negative x. That's the **opposite** of a visual's `ROTATION`, where
  a positive x tilts the forward axis down (inferred: projectiles seem to be
  turned in Roblox's own axes, visuals in JJS's).
- A `TIME` as short as **0.02 s** works: the rod's probes (`SPEED 350`,
  about 7 studs each) find walls.

From the guides:

- It flies along your +z. `POSITION` is from your root part with +z in
  front (the rod's probes at z 6…42 find walls ahead; Great Yamada Attack's
  meteor starts behind and above at `"0, 20, -7"` and falls in front, seen
  in-game). `ROTATION` x pitches it, and y turns it (positive to your left).
  Effects with its `PROJECTILE TAG` ride on it, not on you.
- `ROTATION` turns its hitbox and affects where it is going forward.
  Its hitbox is a **box** of `SIZE`, not a ball: the simulator sweeps that
  box, turned along its flight, and hits when it meets the target's body
  (4 × 5 × 1 studs standing, lying down when ragdolled).
- `SPEED` is studs per second, for `TIME` seconds.
- `AIM LAST HIT 1` aims at whoever you last hit.
- `CONTINUE` off stops it at the first wall or character.
- `FILTER INTERVAL` sets the i-frames between its hits (0 hits every tick).

### SETCD (12): start a cooldown

`KEY` (-1 = this skill), `COOLDOWN` (-1 = its usual; or seconds). Often
bare (`{K_NAME:"SETCD"}`), meaning "start my cooldown now".

### GRAB (8): hold the one hit

`BODY PART` (yours), `BODY PART2` (theirs), `POSITION`, `ROTATION`, `TIME`,
`LAST HIT` (grabs whoever was hit within that window).

From the guides:

- **The one held can't be hurt** for `TIME`.
- A very short `TIME` (0.01) just repositions them.
- `"0, 0, 4"` with `ROTATION "0, 180, 0"` holds them in front, facing you.
- As with every `LAST HIT`, the hit must have had a stun.

### Rarer kinds (1–2 uses each)

- **COUNTER**: `TIME` window; being hit by `ATTACK TYPE2` (`"Melee,Bullet"`)
  cancels the damage and runs `BRANCH`. Also `REFLECT`, `REMOVE ON HIT` (the
  window closes on the first counter), `CONTINUE`, `CANCEL ENEMY`, `STUN`
  (on the one countered). Used for a dodge ("SwayAway"). No base counter
  takes Explosion or Domain attacks.
- **TELEPORT**: `POSITION`, `ROTATION`, `IGNORE WALLS`,
  `RELATIVE FROM BRANCH`, `PROJECTILE TAG` (to a projectile), `LAST HIT`.
- **LOOK**: face the target for `TIME`: `SMOOTHNESS`, `CAMERA DIRECTION`,
  `HORIZONTAL ONLY`, `GROUNDED`, `RELATIVE FROM BRANCH`, `LAST HIT`.
  With `CAMERA DIRECTION` on and `HORIZONTAL ONLY` off, you face where the
  camera points, **pitch included**. Everything placed relative to you
  (hitboxes, projectiles, visuals, VELO) then aims up or down with you
  (owner, the air fishing rod). The owner on pairing it with a
  `DirectionLock`: "look + directionlock makes it so that your look works
  with shift lock, not the other way around". The lock doesn't stop the LOOK.
  With a `PROJECTILE TAG` (and `CAMERA DIRECTION` off) it faces that
  projectile instead: a `SPEED 0` projectile is then a point to turn to, and
  a forward `VELO` pulls you at it. The owner: it works "to a degree", with a
  `DirectionLock`, "but it's kinda jank". A Gon export has one
  (`"LookAnchorPoint"`).
- **HPGIB**: change health by `AMOUNT`; `CAN KILL`.
- **ULTGIB**: change the awakening bar by `AMOUNT` (`-100` empties it:
  awakenings use it).
- **SETMELEE**: `COMBO`, `OFFSET`: sets the M1 combo state.
- **SKILL** (the palette's SKILL): uses a **base-game move**: `MOVE`,
  `START` (how far in to start, e.g. only a move's impact), `SPEED` (0
  freezes it), `HOLD FOR` (seconds held, for hold variants),
  `ENABLE VARIANTS` (e.g. aerial ones), `CANCEL LAST` (cancels every earlier
  SKILL and SPECIAL). **`MOVE "Cancel"`** does the same as `CANCEL LAST`.
  It's seen once, in Gon's "Swap Block": blocking cancels the move in
  progress and swaps stance.

### Palette names in the game

The node palette, in the guides' order: **WAIT, HIT CANCEL, LOOP, SKILL,
SPECIAL, ANIMATION, SOUND, VELOCITY, CONNECT, HITBOX, BRANCH, GRAB, VISUAL,
PROJECTILE, COUNTER, TAG, STATE**, and the misc nodes **Add Awakening**
(`ULTGIB`), **Add Health** (`HPGIB`) and **Add Evasion** (`EVGIB`).
ANIMATION = `ANIM`, SOUND = `SFX`, VELOCITY = `VELO`. The four not yet seen
in an export, with their `K_NAME`s and fields **from the game's code**:

- **HIT CANCEL** is `HITCNCL`: `TIME` (1), `FLIP` (false), `ENDLAG` (1),
  `BRANCH`. Off: if you hit someone in the last `TIME`, go to `BRANCH`; with
  `FLIP`, if you didn't. With no `BRANCH` the move is cancelled and you're
  stunned for `ENDLAG` (the guides: put it after a `WAIT` of the same
  length). The simulator does this.
- **SPECIAL** is `SPECIAL`: `SPEC` (a special's name, default
  `"Limitless"`), `SPEED`, `CANCEL LAST`, `ENABLE VARIANTS`. It doesn't
  replace your own special (guides). The 29 names are in `SPECIALS`.
- **CONNECT** is `CONNECT`: `SIGNAL` (`"Nothing"`), `TIME` (0.1), `RANGE`
  (studs, default infinite). It sends the signal to build-mode blocks. (The
  guides called the range `DISTANCE`.)
- **Add Evasion** is `EVGIB`: `AMOUNT` (5). It changes the ragdoll-cancel
  meter.

**SKILL's moves** (`MOVE`, default `"Divergent Fist"`): the builder lists
every base move by character (`MOVES` in `core/gamedata.js`: Lapse Blue …
Thin Ice Breaker, 184 in all), plus `"Cancel"`.

Arayashiki labels `SETCD` "COOLDOWN", `SETMELEE` "MELEE",
`HPGIB` "HEALTH" and `ULTGIB` "AWK BAR". (It used to label `GRAB`
"CONNECT"; now it's "GRAB".)

---

## 6. Patterns (confirmed from the fixtures)

- **Variants by condition**: default line
  `BRANCH Base · BRANCH Downslam · BRANCH Uppercut`, each branch gated by
  `Req` (ground / `AIR` / `JUMP`).
- **Passive loop**: `KEY 9` or `99`, `Prop USE`. Default line `BRANCH 1Looper`,
  and `1Looper: WAIT 0.1 · BRANCH Awakened · BRANCH 1Looper`, with
  `Awakened` gated by `ULT`.
- **Random variant**: `BRANCH "" RANDOM "V1, V2"` (an awakening), or
  `RANDOM "S1, S2, S3"` (a dodge's three animations).
- **Custom block**: passive loop with `STATE Block CHECK → BRANCH Block`.
- **Use twice**: `Prop VAR "S3UseTwice"`, and the line starts with
  `TAG S3UseTwice = 1 CHECK → UseTwice`, else `BRANCH Base`.
- **Detector hitbox**: a 0-damage hitbox in a `LOOP` whose `BRANCH` is
  "HitCheck": the move continues differently when something is in front.
- **Grab-and-throw**: hit → OnHit pins you (`VELO 0.001`, `STATE IFrame`),
  `GRAB` holds them, then a finisher hitbox and a big `LAST HIT` knockback.
- **Projectile anchors**: `PROJECTILE SPEED 0` with a tag, then many
  `VISUAL`s with that tag: a whole effect built around a point.
- **Comments**: `BRANCH ">Some label"`.
- **Blocked recoil** (every M1 in both later characters): after the real
  hitbox (blockable, `BRANCH OnHit`, `BRANCH TARGET OnHitTarget`), a second,
  0-damage, unblockable hitbox in the same place with `BRANCH "Blocked"`.
  Blocked leaves you open: `NoJump`/`NoDash`, the swing replayed from the
  hit moment at half speed, and a wait.
- **Stacks**: a hit adds 1 to a tag for 8 s (`ADD/REMOVE true`, `SET false`,
  `VALUE "1"`); moves check `== 2` for an enhanced version, which clears the
  tag (`SET`, `TIME 0`); a passive loop shows an aura while it's 2.
- **Tag as a flag with a timeout**: set `UseKatana = "True"` for 4 s from
  every move; a passive notices it's gone (see Auto-sheathing below).
- **Separators**: `ADD false`, `KEY 15`, no DATA.

### The fishing rod: techniques confirmed in-game

The owner's hook-and-grapple skill (built node by node in this project; the
source is in `data/exports/`) put several tricks to work:

- **A detector ladder instead of a counter.** Ten 0-damage, unblockable
  `STUN -1` hitboxes, 6, 12, … 60 studs long, fired shortest first. The
  first to touch someone jumps to its own `CatchN` branch, and the hit
  drops the rest of the line, so *which* hitbox hit is the distance. Pace
  them with `WAIT`s to trail an eased visual.
- **Detect, then really hit.** Detectors are unblockable, so blocking
  doesn't spam the block sound. `CatchN` fires one blockable hitbox of the
  same size: if it lands, pull; if it's blocked, just reel in.
- **Take a travelling visual off and redraw it.** The cast's tip and line
  carry `VISUAL TAG`s, and `CatchN` cancels them (Cancels on the same body
  part) and draws them again at length N.
- **Short states, topped up.** A state can't be cancelled, so the line sets
  0.15–0.45 s at a time, and each branch it can jump to sets its own.
- **A probe ladder for walls.** Ten 0.02 s projectiles, one per 6-stud
  stretch, nearest first, each with `BRANCH COLLIDED "WallN"`. The collided
  branch replaces the line, so each `WallN` *is* the rest of the move (the
  remaining wind-up with the later probes turned into plain `WAIT`s, the
  cast, the detectors up to N, then `GrappleN`). The first wall found
  wins, and no tag has to carry the news.
- **An air variant**: `BRANCH Air1` (with `Req AIR`) before `BRANCH 1`. It
  adds a faded boost (`"0, 25, -20"` for 0.2 s: about 2.5 up and 2 back),
  hover pins until the cast's own pin, and a pitch-following `LOOK`.

### Momentum and ODM gear (from the owner's ODM gear)

The owner's Attack on Titan style gear uses these (an attempt built from
them here was scrapped):

- **Momentum is a tag.** A passive keeps it between 0 and 50: every 0.1 s it
  drains 1, clamps anything over 50 (clear, then set 50), and fires a small
  downward projectile (`ROTATION "-90, 0, 0"`, `SIZE 6`, `TIME 0.05`) whose
  `BRANCH COLLIDED` resets it to 0: **touching the ground loses your speed**.
  Swinging and gas add to it.
- **Gears.** Every pull checks `Momentum "<10"`, `"<20"`… and jumps to one
  branch per gear, each with its own `VELO` speed (50, 60, 75, 90, 110) and
  Field of View `AMOUNT` (4 to 20). Those branches need `HOLD`, so when the
  key is let go every check falls through to the line's end, which is the
  **carry**: a non-tracking `VELO` at that gear's speed, so you fly on.
- **The swing arc.** `LOOK` at an anchor projectile with a low `SMOOTHNESS`
  (40) and a tracking `VELO` forward: you turn onto the anchor gradually, so
  the path curves.
- **Placing the anchor.** Everything the fishing rod's collided branches made
  appeared relative to *you* (inferred from its hitboxes and visuals). An
  anchor spawned in a collided branch at `"0, 0, 0"` is then at your feet,
  not at the hook, which may be why the owner's felt "kinda jank". Placing it
  by distance would fix that: a probe ladder says which 6-stud stretch
  caught.
- A `"Cylinder"` visual exists (the owner's cables), with `SIZE 2` as its
  size.

### Variant recipes (from the guides)

Not seen in the fixtures, but standard in the community. Wherever a recipe
sets a tag that must land, use the owner's clear-then-set
([TAG](#tag-38-named-values)).

- **Use twice.** Name a tag in `Prop VAR` ("use-twice"). The default line
  starts `TAG use-twice == 1 CHECK → variant`. After the first use's move,
  set the tag to 1 for the window you allow. The `variant` branch sets it
  back to 0, then does the second move. For more uses, chain more values.
- **Hold for a time.**
  1. Set a counter tag to 0.
  2. Loop over `WAIT 0.01 · add 1 · CHECK counter == N → held` with a `HOLD`
     loop, so it only runs while the key is down.
  3. Letting go early falls through to the normal move.
- **Hold to repeat.** `SKILL … · WAIT 0.1 · LOOP BACK 2 × 50, HOLD`.
- **Modes.** The special adds 1 to a "mode" tag on its first use and -1 on
  its second (a use-twice). Moves start with `CHECK mode == 1 → mode1`.
- **Press R mid-move.** The move has `NOSTUN`, with a `STATE Stun` standing
  in for real stun. It sets `r-variant = 1` for the window. The special
  checks it, clears it, and does the variant.
- **Random.** `BRANCH "" RANDOM "b1,b2,b3"`.
- **Changes after use.** At the end, set `variant = 1` for cooldown + the
  window. At the start, `CHECK variant == 1 → variant`, which clears it.

### Base-game timings (from the guides)

These are replicas, where no export shows the real thing:

- **Vanilla M1**: `WAIT 0.25`, the hitbox, `STATE NoM1` 0.15 s. The owner's
  Accurate M1s (below) come from a real export and win where they differ.
- **Vanilla dash**:
  1. `VELO "0, 0, 50"` for 0.1 s.
  2. A blockable hitbox.
  3. HIT CANCEL 0.1 s (red).
  4. `LOOP BACK 3 × 25`.

  The Accurate dash below is the real one.

### Displaying a value: the progress bar skill (confirmed in-game)

The Progress Bar Maker's export (`core/barskill.js`) is a passive state
machine on one tag, in one of three styles. All start the same way and share
the `-` dispatcher (the checks from the top step down, the rails, `BRANCH "-"`).

**Complex** (the default; the owner's lag-proof version, matched exactly by a
test). Each step is shown **once, for ever**, and taken off by `Cancel`
effects that name its `VISUAL TAG`, so nothing is drawn again until the tag
changes:

```
"N":           VISUAL Billboard, step N's image, TIME 1e38, VISUAL TAG "BarN"
               VISUAL Cancel "BarLesser", "BarGreater" (the rails' billboards)
               VISUAL Cancel, VISUAL TAG "BarK"   for every other step K
               BRANCH ">Checks"                    (comment)
               TAG Bar == K CHECK → "K"            for every other K, top down
               BRANCH ">Safety Rails"              (comment, with the rails)
               TAG Bar "<0" → SafetyLesser; TAG Bar ">top" → SafetyGreater
               WAIT 0.05
               LOOP BACK (other steps + 2 rails + 3), LOOP AMOUNT 1e38
SafetyLesser:  the empty picture under its own tag "BarLesser"; Cancel every
               step; BRANCH "SafetyLesserHold"
SafetyLesserHold:
               the tag cleared and set to 0 (SET, TIME 0; SET, for ever:
               the clear-then-set that dodges the SET bug);
               then the same checks (not for 0) and loop, but "<0" comes back
               here: a pseudo-min
SafetyGreater / SafetyGreaterHold: the same with the full picture,
               "BarGreater" and the top step: a pseudo-max
```

**Why the Holds** (a fix on the owner's version): in that version a rail's own
loop sent a second push past its end back to the rail, which drew another
billboard on top of the first without cancelling it. A bar kept at full by
regen (or spammed past an end) piled them up, and the picture thickened. The
Hold re-clamps the tag without drawing, so a billboard is only drawn when the
picture on show changes. (Cancelling the rail's own tag before drawing would
also stop the pile-up, but it would redraw on every push, and could flicker.)

`LOOP BACK` counts the nodes from `>Checks` to the `WAIT`: the checks, the two
comments and the wait (without rails: the checks, `>Checks` and the wait). It
lands on `>Checks`, so the loop only ever checks.

**Complex Separate** (a variant of Complex; built here, not yet checked
in-game). The meter is drawn in layers, each a billboard of its own, stacked
by POSITION z a thousandth of a stud apart (a billboard's z is its layer: the
more negative, the further in front):

```
entry:      VISUAL Cancel + Billboard, the container's image, TIME 1e38,
            VISUAL TAG "BarBox", at z          (shown once, at the back)
            TAG Bar = start; BRANCH "-"
"N":        as Complex, but the meter's image (no container) at z − 0.002;
            the checks for steps under N, and "<0", go to "DropN" instead
"DropN":    VISUAL Cancel "BarTrail"; VISUAL Billboard, step N's trail image,
            VISUAL TAG "BarTrail", at z − 0.001, TIME = the trail time,
            OPACITY 0 → ALT OPACITY 1 (Quad Out: a flash fading); BRANCH "-"
```

So only the meter is swapped as the tag changes, and when it goes down the
step it left flashes its catch-up trail between the container and the meter,
then fades, before the dispatcher finds the new step. Without trail images
there are no Drop branches: it's Complex with the container apart. The Meter
Maker renders the three picture sets (`render(doc, step, { part })` in
`src/barmaker/draw.js`: `container`, `meterLead`, `trail`) and uploads them.

**A health bar** (any style, "Moved by: Your health"). The tag is set from
the runner's own health by a passive, `<name> Health`, which searches it with
`HP` (Has Health) conditions on branches, as the Percentage damage template
does: `Watch` → a binary ladder (a BRANCH line tries the upper half, whose
Req needs health above its bottom, then the lower) → a leaf per step that
skips if the tag is already that step (TAG CHECK → hold), else clears and
sets it → `WAIT`, back to `Watch`. Step k is health in (max·(k−1)/n,
max·k/n]; 0 is none. No regen or debug skills (they'd fight it).

**Legacy** (the first version). Each step is shown briefly and the dispatcher
runs again, which draws it again, for ever:

```
entry:   TAG Bar = top step (for ever); BRANCH "-"
"-":     TAG Bar == N CHECK → "N"   for N from the top down to 0
         BRANCH ">Safety Rails"          (comment)
         TAG Bar "<0" CHECK → SafetyLesser
         TAG Bar ">top" CHECK → SafetyGreater
         BRANCH "-"
"N":     VISUAL Billboard TEXTURE = step N's image (TIME 0.12); WAIT 0.1; BRANCH "-"
Safety*: VISUAL (the end's image); TAG clear (SET, TIME 0); TAG set to the end
         (for ever); WAIT; BRANCH "-"
```

It comes with **`<name> Regen`** (a passive, `Prop REP2`, adding `+n` every
`s` seconds) and **`Debug: Add / Remove <name>`** (keys 1 and 2, one TAG node
each, `Prop []`). All four match the owner's hand-built versions exactly
(tests), and are the same in both styles.

### Auto-sheathing (confirmed from the owner's katana export)

A passive (`KEY 9`, the usual passive `Prop`) with two loops on one tag:

```
default:     wear Katana (Mesh on Torso) and Scabbard, for ever; → Looper
Looper:      WAIT 0.02; TAG UseKatana == "True" → Unsheath; → Looper
Unsheath:    Cancel "Katana"; wear "KatanaHand" (Mesh on Right Arm); → KeepKatana
KeepKatana:  WAIT 0.02; TAG UseKatana == "True" → KeepKatana; → Sheath
Sheath:      sound, animation [13,4], WAIT 0.3, Cancel "KatanaHand",
             wear "Katana" again, a red flash at the hip; → Looper
```

Every move that uses the sword sets `UseKatana = "True"` (`SET`, 4 s), so
the sword comes out with the first swing and goes back 4 s after the last.

### Accurate M1s (confirmed from the owner's Gon export)

M1s timed like JJS's own. Hits 1–3 are identical apart from the animation
and the trailing limb: `BRANCH Base`; Base = animation, `NoJump`/`NoDash`
0.4 s, `SpeedMultiplier 0.75` 0.5 s, a Melee Trail, the swing sound,
`WAIT 0.2`, a 3-damage 0.75 s-stun `7, 7, 6` hitbox at `0, 0.7, 4`, the
blocked-recoil hitbox, `WAIT 0.16`. OnHit pushes both forward (`0, 0, 10`,
0.2 s). Hit 4 tries `Down` (`AIR`), `Up` (`JUMP`), then `Base`: 4 damage,
knockback (`0, 0, 40`, uppercut `0, 36, 3`, downslam `0, -50, 3`,
unblockable, taller box), then recovery: the swing at half speed, a
self-`Stun` 0.75 s and `WAIT 0.8`.

### Accurate dash (confirmed from the owner's Gon export)

The `CHASE` skill (cooldown 6, `Prop NOSTUN`). Its line tries `Air` (`AIR`),
then `Base`; the export also had a `Blink` variant, switched on by a
`BlinkVar` tag, which the template leaves out.

```
Base:      SpeedMultiplier 0.4 / NoJump / InSkill for 1.2 s (CANCEL ON END),
           two sounds, VELO "0, 0, 80" for 0.5 s (TRACK, FADE), animation [1,19],
           dust, FOV 15, wind streaks, trails on every limb, wind meshes,
           3 gusts 0.1 s apart (LOOP),
           a 0-damage single-target detector (STUN -1, "7, 7, 9") → HitCheck,
           WAIT 0.05, LOOP back 2 × 5  (six looks in front),
           nobody there: Stun 0.36 (CANCEL ON END), the animation's end, FOV back
Air:       the same without the dust and streaks
HitCheck:  the real hit (4 damage, 0.75 s stun) → OnHit / OnHitTarget,
           and the blocked detector → Blocked
OnHit:     Stun 0.24, pinned (VELO 0.001), knock them "0, 0, 25", the end
Blocked:   Stun 0.75, pinned, the end at half speed
```

`CANCEL ON END` is set on the dash's own 1.2 s states: when they run out,
the dash's line ends, which caps how long the dash lasts (guides).

### Percentage damage (built here, untested in-game)

Damage is always a fixed number, so a share of someone's **health left**
takes a lookup. What it rests on:

- A branch sent to the one hit (`BRANCH TARGET`, or a `BRANCH` with
  `LAST HIT`) is **run by them** (confirmed: character 2's "Possess" is a
  projectile's `BRANCH TARGET` whose `HPGIB -2` hurts the one hit). So an
  `HPGIB` there changes *their* health, and a branch's conditions there
  should read *their* Has Health (inferred).
- **Has Health** is the only way to read health. It's `HP` (confirmed,
  from the owner's export, which wrote it bare with its defaults left out).
  The template writes `{ "K_NAME": "HP", "AMOUNT": n, "FLIP": false }`,
  the shape of `BAR`: that its value is `AMOUNT` is **inferred**. The name
  is one constant, `HAS_HEALTH`.

The ladder is a **binary search**: health is cut into steps `(lo, hi]` (1 HP
by default, up to a highest health), and each branch tries its upper half
(`Req` Has Health above the half's low end) before falling into its lower
half. 100 steps take 7 hops, not 100 (each node costs about 0.01 s). The
last branch takes the share of its step's `hi` with `HPGIB`, so the damage
is exact for whole health and rounds up within a step. Above the highest
health, they lose the share of the highest.

```
"20%":            BRANCH "20% over 100" (Req HP > 100) → HPGIB -20
                  BRANCH "20% 0-100"
"20% 0-100":      BRANCH "20% 50-100" (Req HP > 50), else BRANCH "20% 0-50"
…
"20% 57-58":      (Req HP > 57) HPGIB -11.6
```

Two modes. **Current HP** takes the share of what they have (above), and
hurts most at full. **Missing HP** is the reverse: the share of what they've
lost from the max health you give, so each step `(lo, hi]` takes
`share × (max − hi)`, full health takes nothing (the branch is empty), and so
does anything above the max.

A **minimum damage** raises every step's `HPGIB` to at least that much, so a
low share still hurts: missing HP at full health (and above the max) takes
the minimum, not nothing, and current HP on someone low takes the minimum
when the share is less. A **maximum damage** caps every step's `HPGIB` the
same way. Either is off when left blank, or written `nil` or `-1`.

`HPGIB` isn't a hit: it goes through blocks, i-frames and damage
multipliers, and only kills with `CAN KILL`. Two ways to start it:

- **One skill**: the hitbox's `BRANCH TARGET "20%"`, with a stun.
- **Any move**: a passive (key 9) loops `WAIT 0.05 · TAG PctDamage == "20"
  CHECK → Take 20%`. Take clears the tag and runs `BRANCH "20%"` with
  `LAST HIT 1` on whoever you last hit, then loops. Moves clear the tag and
  set it to `"20"` for 0.3 s in their OnHit. The tag's value picks the
  share, so one passive holds up to four. Whether a passive's `LAST HIT`
  sees a hit made by another skill is inferred.

---

## 7. Arayashiki

This project (it began as a page of Woogi Tools, then a standalone web page).
A Windows desktop app (Tauri) laid out like Blender, with two workspaces as
tabs along the top. **Skills** is the moveset editor: the Nodes editor, the
3D Viewport (a training room), the Outliner and Properties, and the Timeline
(a frame meter) and log. **Progress Bar** is the Progress Bar Maker. Its
engine also runs without the app, for AI agents: a CLI (`sbs`) and an MCP
server, both over `agent/tools.js` ([ai/README.md](ai/README.md)).

| File | What it is |
|---|---|
| `core/format.js` | lossless decode/encode; branch and line helpers |
| `core/gamedata.js` | JJS's own builder tables, read from the game ([section 12](#12-jjss-own-code)); generated |
| `core/schema.js` | the node catalogue ([section 5](#5-nodes)) as code, built on `gamedata.js` |
| `core/sim.js` | the simulator ([section 4](#4-how-a-program-runs)) |
| `core/describe.js` | skills as readable node listings (the library's format) |
| `core/starter.js` | the starter moveset, blank skills |
| `core/barskill.js` | the progress bar skill, from one image ID per step |
| `core/templates.js` | the templates: a form each, and the skills it builds |
| `core/codec-*.js` | zstd: Node's built-in one, or wasm in the app |
| `agent/tools.js` | decode, describe, simulate, validate, encode, reference, library, handbook, for agents |
| `agent/mcp-server.js`, `agent/cli.js` | the MCP server and the `sbs` CLI over those |
| `src/store.js` | the editor's state and every edit (Preact signals) |
| `src/scene.js` | the 3D view (Three.js, loaded after the first paint) |
| `src/rbxmesh.js` | Roblox `.mesh` files (every version, Draco included) to geometry |
| `src/barmaker/` | the Progress Bar workspace: drawing (`draw.js`), state, UI |
| `src/ui/templates.jsx` | the Templates dialog |
| `src/ui/meter.jsx` | the frame meter |
| `src-tauri/src/lib.rs` | the desktop shell: Roblox fetches, file dialogs, `--open` |
| `lib/extract-jjs-game.mjs`, `lib/studio-mcp.mjs` | `npm run game-data`: reads the tables out of JJS in Roblox Studio |
| `docs/jjs-game/` | every animation and sound in the game, with IDs (generated) |

What it does:

- **Import / export** moveset codes (whole, or one skill), by paste or .txt
  file. Saves in the app (IndexedDB) and remembers the working copy. The
  **Library** opens any of the 37 real moves as a moveset or adds it to one.
- **Edit** skills, branches (renaming updates every reference), conditions
  (with FLIP), flags, and nodes. Nodes can be added from the palette,
  dragged or moved, duplicated and deleted, with undo/redo and keyboard
  shortcuts.
- **Play**: runs the skill against a dummy (5 studs ahead by default), with
  toggles for Air / Jump / Hold / Awakened / bar %, a wall distance, and hits
  "in range", "always" or "whiff". The **frame meter** shows every timed node
  as a bar on a You or Dummy lane, hits as red marks, and counts frames (60 a
  second); click or drag it to scrub, click a bar to jump to its node, and
  step frame by frame with ← / →. The log jumps to a line's node too, and
  the plates over the view show the dummy's health and live states and tags.
- **The Viewport's camera** works like Roblox Studio's: right-drag to
  look, middle-drag to pan, the wheel to move toward the cursor, W A S D
  and Q E to fly (Shift slows), F to frame you. Nothing clamps it. Follow
  carries it along with the pair. The axis gizmo in the corner (as in
  Blender) snaps to a view along X, Y or Z when an end is clicked, and
  turns the view when dragged.
- **Templates** (Ctrl+T): a ready-made skill from a form, added to the
  moveset (a skill of the same name and category is replaced) or copied as
  a code. See [below](#templates).
- **Progress Bar workspace**: draw a bar that fills (layers, bars and rings,
  text bars, shapes, pictures, a brush, clipping, effects), then upload every
  step to Roblox as the signed-in account and put the skill that shows them
  straight into the moveset. See [section 8](#uploading-the-progress-bar-maker).
- **Take movesets from outside**: `arayashiki --open <file>` (what
  `sbs open` and the MCP server's `open_in_app` run) opens a code in the app,
  or hands it to the window already open.

The simulator follows what's been learned in-game: a projectile's `ROTATION`
x pitches it (positive up). `BRANCH` and `BRANCH COLLIDED` replace the line
that fired it. The **ground** is always there for `BRANCH COLLIDED`, and a
**wall** can be set in the settings ("Wall", studs in front). A newer VELO
replaces the one in progress. A field a node leaves out takes the
builder's default. The 3D view places each visual the way BuilderFX does
(section 5's three ways), draws Sphere, Block, Wedge and Cylinder as those
parts, holds a Field of View until the next one, and shows Screen Color as a
colour correction and Overlay at its size. The Node properties dim the
fields the chosen effect doesn't read, and name an `ANIM_USE`'s animation.

What the simulator **doesn't** do, deliberately or because it's unknown:
blocking, the other character acting on its own, real physics or
collisions (a wall stops projectiles, not characters), a `LOOK`'s pitch, `COUNTER` triggers, damage multipliers, cooldown enforcement,
or JJS's timing to the frame. **Animations are stand-ins**: JJS's library
isn't public, so each `ANIM_USE` gets one of eight procedural poses (always
the same one for the same animation). **Effects are drawn by family**
(glow, ring, sparks, trail), except what Roblox
hands over: **Mesh effects are the real mesh** (`AMOUNT`) with its texture,
scaled by `SIZE` / `SIZE 2` and placed in its body part's frame (a sword in
a hand follows the arm); Billboard and Overlay effects use the **real
picture**; and **sounds** play when switched on. The desktop shell fetches
them by every route it has, including Roblox's own cache on the PC (section
8). A Billboard whose picture won't come shows as a soft glow, not a blank
square. The Node properties show what each asset ID is, with a preview.

**Scale** (studs, as Roblox's R6): the legs are 2 tall, the torso and root
part 2, the head 1.2 (its mesh), 5.2 in all. The **HumanoidRootPart's middle
is 3 studs up**, which is where hitboxes, projectiles and effects on it are
centred (it was 2.5 until September 2026; no hit or miss changed). The floor
has a line every stud and a stronger one every 5.

### Templates

`core/templates.js` (brought over from Woogi Tools' JJS Stuff): a form per
template, and the skills it builds. The app shows them in the Templates
dialog; agents use the `build_template` tool or `sbs tpl`. Each template was
lifted node for node from a real export, and with its defaults builds
exactly that export (`tests/templates.test.js`). A template never names
where it came from, or whose it was: each has a figurative tagline instead
(`from`).

| Template | From | Makes |
|---|---|---|
| Progress bar | the Progress Bar Maker (`buildSkill`) | the bar, regen and debug skills |
| Auto-sheathing weapon | the katana's `SheathPassive` | the passive, and a key-1 debug skill that draws the weapon |
| Accurate M1s | Gon's M1s | MELEE 1–4 |
| Accurate dash | Gon's chase, without its blink | CHASE |
| Percentage damage | built here, not lifted (section 6) | the passive and try-out punches on keys 1–4, or a skill per share with its own ladder |

To add one: add the export as a fixture, write its `build` from the export's
nodes, and test that its defaults reproduce the export.

---

## 8. Roblox: pictures for textures

### Decal IDs vs image IDs (confirmed)

Uploading a picture creates **two assets**: an **Image** (what `TEXTURE`
needs) and a **Decal** wrapping it. Roblox's upload API only returns the
**decal** ID. The decal's content is a tiny model whose `Decal.Texture` is
`rbxassetid://<imageId>`, and `inner_asset` in `src-tauri/src/roblox.rs`
reads it, from XML or from binary models with LZ4 or zstd chunks.

### Fetching assets in the desktop app (src-tauri/src/roblox.rs)

For a `SFX` `ID` or a `TEXTURE`, the app tries, in order:

1. **Its own copy** (`%LOCALAPPDATA%\dev.woogi.skillbuildersim\assets`, or
   the app's cache folder), with a `.json` of what it learned.
2. **The details**: `GET economy.roblox.com/v2/assets/{id}/details` (name,
   type, creator). It answers without signing in (checked September 2026).
3. **Where the file is**: `GET apis.roblox.com/asset-delivery-api/v1/assetId/{id}`
   with `x-api-key` when the user has saved an **Open Cloud key**
   (Settings; the key needs the Legacy Assets API, `legacy-asset:manage`, and
   is kept in Windows Credential Manager). Then, without a key,
   `assetdelivery.roblox.com/v2/assetId/{id}` and `v1/assetId/{id}`. Roblox
   announced in April 2025 that these need authentication. In September 2026
   they still hand over older images, decals and models, but answer **401
   for most audio and many recent images**.
4. **The bytes**: first from the **Roblox client's own cache**
   (`%LOCALAPPDATA%\Roblox\rbx-storage.db` plus `rbx-storage\xx\<id>`), then
   from the CDN. Each cache entry is `RBXH`, a version, the URL it came from,
   a status (200, or 302 for a redirect), a few lengths and a checksum, and
   the body (sometimes zstd or gzip). The app indexes the cache by the
   content hash at the end of each URL (about 51k entries the first time,
   only new ones after), read-only and `immutable`, and never writes to it.
   **What it can and can't do (measured September 2026):** the delivery
   API's URL ends in the MD5 of the file, but for most assets Roblox caches
   only a **302 marker** under that hash (no target stored), with the file
   itself under a second CDN URL. That URL can't be worked out from the
   asset ID, and asking the CDN ourselves returns the file directly instead
   of redirecting. Entries without a URL (textures converted to KTX) carry
   other hashes. So the cache supplies a file only when Roblox stored it
   directly under the delivery hash. It saves some downloads; it can't
   unlock private audio.
5. **Decals and models** are unwrapped. Their XML (`<url>…?id=</url>`) or
   binary model (chunks compressed with LZ4 or zstd) names the image or
   sound inside, and that is fetched.
6. **Thumbnails** (`thumbnails.roblox.com/v1/assets`, 420×420) for pictures
   that won't come any other way.

Not done on purpose: signing in with the `.ROBLOSECURITY` cookie. It gives
full access to the account, and stealing it is how accounts are lost; an
Open Cloud key does the job, is scoped, and can be revoked.

Agents can name assets without the app: the MCP tool `asset_info` (or
`sbs asset <id…>`) returns the name, type, creator, and whether the file
downloads without a key.

### Signing in with Roblox (src-tauri/src/account.rs)

Arayashiki signs in the way a browser does. It opens Roblox's own login
page (`https://www.roblox.com/login`) in a separate window, where the user
signs in as usual (captcha and 2-step included). The app then keeps the
session Roblox gives that window (the `.ROBLOSECURITY` cookie, read through
WebView2's cookie store) and sends it with its own requests to Roblox, as
the website does. Many third-party Roblox tools work the same way. Because
the session is full access to the account, it's handled narrowly:

- The login window has its own browser profile (`roblox-login` in the
  app's local data), apart from the editor's. It gets no access to the
  app's commands (the capability covers only the `main` window), and its
  browsing data is wiped as soon as the session is taken.
- The session lives in **Windows Credential Manager** (service
  `Arayashiki`), never in a file, and never reaches the editor's page. The
  page only sees the name, user ID and pictures.
- It's only ever sent over HTTPS to `*.roblox.com`.
- **Sign out** posts to `auth.roblox.com/v2/logout` (with the CSRF token
  Roblox asks for), which ends the session on Roblox's side, and then
  forgets it.
- At startup, `users.roblox.com/v1/users/authenticated` checks the session
  is still good; if Roblox has ended it, the app forgets it.

Signed in, asset delivery asks as the account first
(`assetdelivery.roblox.com/v2/assetId/{id}` with the session), then with an
Open Cloud key, then anonymously. Roblox gives the account what it's
allowed to use: public assets and the user's own. It still refuses audio
that another creator keeps private to their own experience, and the app
does **not** try to get around that (for example by posing as a game
client in a place that may use the asset).

**Avatars** are public: `avatar.roblox.com/v2/avatar/users/{id}/avatar`
(body colours as hex, the avatar type, what's worn), and the
`thumbnails.roblox.com/v1/users/avatar-headshot` and `…/avatar` pictures.
The signed-in user's avatar, or any user's by ID ("Preview a user's
avatar"), dresses "You" in the viewport. It uses the body colours plus
classic **shirt, pants and T-shirt** (each a Shirt/Pants asset whose XML
names its template image) and the **face**. The clothing is folded onto
the R6 parts with the regions of Roblox's 585×559 template, measured from
Roblox's own template (`src/clothing.js`): torso R/FRONT/L/BACK at x 165,
231, 361, 427 (y 74), UP and DOWN at (231, 8) and (231, 204); right arm or
leg L/B/R/F at x 19, 85, 151, 217 (y 355), U at (217, 289), D at (217, 485);
left arm or leg F/L/B/R at x 308, 374, 440, 506, U at (308, 289), D at
(308, 485). Accessories and R15 body shapes aren't drawn.

### Privacy: Open Use (confirmed as of 2026)

New accounts upload images and decals as **Restricted**, and **JJS can't
show a Restricted picture**. They need **Open Use**: turn off Creator Hub →
Settings → Advanced → "Opt-in to restrict assets on creation" *before*
uploading, or set each asset to Open Use in the Creator Dashboard. **Open Use
can't be undone. No OAuth API sets it**: the asset-permissions API takes API
keys or a logged-in session only, and grants per game.

### Uploading: the Progress Bar Maker

The Progress Bar workspace's Export → JJS skill uploads every step as the
signed-in account (section 7's Sign in with Roblox), one after another, and
fills the image IDs in itself:

- Upload: `POST https://apis.roblox.com/assets/user-auth/v1/assets` (multipart:
  a `request` JSON with `assetType "Decal"`, the name, the description and
  `creationContext.creator.userId`; and `fileContent`, the PNG), with the
  session cookie and the `x-csrf-token` Roblox hands back on the first try,
  as Creator Hub does. Then poll `/assets/user-auth/v1/{operation path}`
  until `done`; `response.assetId` is the **decal**. When the session is
  refused and an Open Cloud key is saved, the same request goes to
  `/assets/v1/assets` with `x-api-key`.
- Decal → image: the decal is read back (asset delivery, as the account) and
  its `Texture` gives the image ID. A new decal can take a few seconds to
  read, so it's retried.
- Every step's decal and image are kept in the design (`jjs.uploads`), with a
  fingerprint of the drawing: a retry skips the steps already up, and a
  changed drawing says so.
- When every step is up, the skill is built (`core/barskill.js`) and put
  into the moveset: skills of the same name and category are replaced, so
  uploading again updates them.
- Risks: moderation can leave a picture blank until it's approved, and the
  pictures must be Open Use for JJS to show them (above).

**Status:** the owner confirmed the manual path (pictures uploaded by hand,
IDs pasted in) works in-game. The upload as the signed-in account is built
on the requests Creator Hub makes, and hasn't yet run end to end.

---

## 9. Numbers and axes

- Positions and sizes are in **studs**; an R6 character is about 5 studs
  tall.
- Local axes: **x left (negative is right), y up, z forward**. The owner
  confirmed negative x is right for billboards, and both guides say it for
  every position. (This file used to say x right; the simulator and 3D
  view now follow x left.) A hitbox at `"0, 0, 4"` sits 4 studs in front.
- `VELO FORCE` is studs per second for `TIME` seconds. `FORCE "0, 40, 2"`
  launches upwards (an uppercut), `"0, -100, 20"` slams down (a downslam).
- `STUN` / `TIME` values are seconds.

---

## 10. Testing and fixtures

`npm test` runs everything in Node (`node:test`), in a few seconds, with no
browser.

- `tests/fixtures/jjs-characters.js`: **four complete characters**
  exported by the owner: `CHARACTER_1`, `CHARACTER_2` (12 and 20 skills),
  `KATANA` (auto-sheathing) and `GON` (accurate M1s). The originals are in
  the git-ignored `data/exports/`. They're the contract for:
  - `tests/core.test.js`: decode → encode is lossless; every node kind is
    known; the simulator picks melee variants by condition, forks
    OnHit/OnHitTarget, loops, random branches, tags, `BRANCH COLLIDED`, and
    Has Health.
  - `tests/sim-golden.test.js`: every skill of the four characters, under
    five settings, hashed: **250 simulations that must not change** unless
    a rule is deliberately changed (then `UPDATE_GOLDEN=1 npm test`, and say
    why in this file). Last changed for the builder's defaults (section
    4, rule 0, September 2026): 28 of 250 runs changed, all from fields
    their nodes leave out (a hitbox with no `POSITION` is now at `0, 0, 4`,
    with no `STUN` stuns 1 s; a bare `WAIT` or `STATE` lasts 1 s).
  - `tests/physics.test.js`: gravity and momentum, pins, braking, ragdoll
    sliding and timing, HIT RAGDOLL, CLEAR KNOCKBACK, walls, grabs.
  - `tests/agent.test.js`: the agent tools and the MCP server over stdio.
  - `tests/gamedata.test.js`: the game's own tables (section 12): every
    builder kind is in the palette, every field of every export is one of
    the builder's, `ANIM_USE` resolves, missing fields take the defaults,
    HIT CANCEL, tag subtraction, STATE Cancel, and the checks `validate` and
    `game_assets` build on them.
- `tests/fixtures/site-skills.js`: two skills made by Woogi Tools (the
  Progress Bar Maker's bar and the Percentage damage template), frozen, for
  the simulator's tests.
  - `tests/barskill.test.js`, `tests/templates.test.js`: the progress bar
    skill and every template, checked against the exports they were lifted
    from (brought over from Woogi Tools; `tests/qunit-shim.js` runs them).

**When you learn something new about JJS: add the real export to
`data/exports/` (and as a fixture if a test should hold to it), write the
test, then update this file,** moving things from inferred to confirmed.

## 11. Open questions

- Whether a branch **returns** to its caller when it ends (everything so
  far fits "no").
- How the **server** runs nodes: it isn't in the place, so rule 0 (missing
  fields take the builder's defaults) is only confirmed for VISUAL, and
  `CANCEL ON END`, `STATE Cancel`, `LINK USER`, `DMG`/`KNOCK` are read
  from tooltips, not seen working.
- Whether `HP` is health or a percentage of it (its field is `AMOUNT`,
  default 10).
- How an `ANIM_USE` **name** (`"Killbind"`) resolves, and the animations'
  lengths (Roblox won't load another creator's animations in Studio).
- Whether a projectile's `BRANCH` replaces the line as `BRANCH COLLIDED`
  does (the guides say so, and the simulator assumes it).
- Why a Field of View and a Glow didn't show from a collided branch or on
  a projectile, when sounds, VELOs and Meshes did. (Field of View only shows
  to the one it runs on: a collided branch may run it as someone else.)

## 12. JJS's own code

In September 2026 the owner opened a copy of the JJS place in Roblox Studio,
with Studio's built-in MCP server on (Assistant → MCP servers;
`StudioMCP.exe` ships with Studio). Its server scripts aren't in a place
file, but the shared modules and the client are: 622 scripts. The Skill
Builder's parts:

| Module | What it holds | Where it's used here |
|---|---|---|
| `ReplicatedStorage.Modules.SkillDefault` | `LineItems`: every node kind and condition (34), each field as `{ key, type code, default, Desc }` in the builder's order; `defaultProp`: the Properties | `NODE_DEFAULTS`, `PROP_DEFAULTS`: the schema's fields, defaults and tooltips; `withDefaults` |
| `ReplicatedStorage.Modules.ListData` | `MoveList` (every base move, by character and colour), `SpecialList`, `AttackTypes`, `States`, `Characters`, `Materials`, and `AnimList` (the `ANIM_USE` table) | `MOVES`, `SPECIALS`, `ATTACK_TYPES`, `STATES`, `ANIM_SETS` |
| `ReplicatedStorage.Modules.BuilderFX` | the client that draws every VISUAL: one function per effect, cloning templates from `ReplicatedStorage.Utils` | `EFFECTS` (what each reads, how it's placed), section 5's VISUAL rules, `src/scene.js` |
| `StarterPlayerScripts.Controllers.Combat.HandicapController` | the client end of the runtime: `CustomService`'s SFX, FX, PARTICLE and LOOK signals, played on the client | SFX `CANCEL` (same ID only), PARTICLE's fields, LOOK (`SMOOTHNESS` clamped 10–200, the cursor at `LAST HIT -1`) |

The builder's field type codes: 1 bool, 2 number, 3 text, 4 and 7 a
preview pair, 5 a vector, 6 a colour, 8 the random list, 9 a number
sequence, 10 a colour sequence, 11 a range. A VISUAL reaches the client as
a list in that order, and a missing value (or `✿`) becomes its default:
that is rule 0.

`npm run game-data` reads it all again (`lib/extract-jjs-game.mjs`) and
rewrites `core/gamedata.js` and `docs/jjs-game/`; run it after a JJS
update, then `npm test`. No script source is kept, only the tables and IDs.
The `CC1` workspace attribute clamps sizes (40), times (10) and counts (20)
in BuilderFX: it's on in some modes, so very large effects may be cut down
there.
