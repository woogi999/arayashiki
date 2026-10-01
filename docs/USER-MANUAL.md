# Arayashiki user manual

Arayashiki is Jujutsu Shenanigans' Skill Builder on your desktop. You open a
moveset, edit its skills node by node the way the in-game builder lays them
out, play any skill on a 3D character against a training dummy, and paste the
code back into JJS. It also films your skills (screenshots and videos), lets
you animate meshes and cameras with keyframes, makes meters (progress bars),
and works with AI, either an assistant inside the app or the AI app you
already use.

Press <kbd>F1</kbd> anywhere to open this manual, and <kbd>Ctrl+Space</kbd> to
search for anything, including the sections of this manual.

## Getting started

### Installing

Run `Arayashiki-Setup.exe` (from
[GitHub](https://github.com/woogi999/arayashiki/releases/latest)). It fetches
the latest version, installs it for your Windows account only (no
administrator needed) and adds Arayashiki to the Start menu and the desktop.
Windows 11 already has what it needs (WebView2); on a PC without it, the
setup installs it too. After that, Arayashiki updates itself (see
[Installing and updates](#installing-and-updates)).

### The quick tour

The first time you open Arayashiki, it asks whether you'd like a quick tour.
The tour lights up each part of the window in turn (the menus, the
workspaces, the Outliner, Nodes, the Viewport, the Timeline, Properties,
Export and signing in) and says what it's for, then goes on to the Meter
Maker (its canvas, tools, steps, properties and layers, and exporting). Use <kbd>→</kbd> and
<kbd>←</kbd> (or Next and Back) to move through it, and <kbd>Esc</kbd> to
leave. It ends by pointing you here.

To take it again, pick **Quick tour** at the bottom of the start screen,
search for "tour" with <kbd>Ctrl+Space</kbd>, or use the button in Settings →
Updates.

### What's new

**What's new** lists what changed in each version: pick it at the bottom of
the start screen, in Settings → Updates, or search for "changelog".

### Installing and updates

To install Arayashiki, download **Arayashiki-Setup.exe** from
[GitHub](https://github.com/woogi999/arayashiki/releases/latest) and run it.
It fetches the latest version, puts it in your user folder (no administrator
needed), adds it to the Start menu and the desktop, and opens it. To remove
it, use Windows' Settings → Apps.

After that, Arayashiki keeps itself up to date, as a game launcher does. A few
seconds after it opens, it checks GitHub for a newer version. If there is
one, it downloads it in the background and a window tells you, with what's
new in it:

- **Restart now** saves any unsaved work and restarts into the new version,
  in a few seconds. Your movesets, settings and sign-in stay as they are.
- **Later** carries on: the update installs itself the next time you open
  Arayashiki.
- **Skip this version** (before it downloads) hides it until the next one.
- **On GitHub** opens the release page in your browser.

While a newer version is waiting, an **Update** button at the top right opens
the window again. The first time a new version opens, it shows **What's new**.

To check yourself, search for "check for updates", or use Settings → Updates,
where the check at launch, and downloading by itself, can be turned off.

### Signing in with Roblox

The first time you open Arayashiki, the start screen asks you to sign in with
Roblox. **Do it**: without signing in, many visuals won't show correctly.
Roblox only hands some meshes and textures to an account, so they stay as grey
stand-ins, and most sounds stay silent. Arayashiki never sees your password:
Roblox's own sign-in page opens in its own window, and the app keeps only the
session it gives back, in Windows' Credential Manager.

Signing in also puts your own avatar (body colours, clothes, face,
accessories) on "You" in the viewport. Turn that off from the account button
at the top right.

### The start screen

The start screen is what Arayashiki opens on. Pick a workspace on the right:

- **Skill Builder**: movesets, skills and the simulator.
- **Meter Maker**: draw a meter (a progress bar) and make the skill that shows it.

Then pick how to start. In the Skill Builder, **New Character** comes first: a
blank moveset, with one empty skill to start adding nodes to. You can also open a `.txt`
holding a code, paste a code from JJS (**Import a code**), or start from a
**Template**. Files you opened lately are listed under **Recent**.

The katana at the top left of the window brings the start screen back. To
skip it at launch, turn off **Start screen on launch** in Settings →
Appearance.

### Exiting, saving, and recovering after a crash

When you close Arayashiki with unsaved work, it asks first and lists what
isn't saved (the moveset, the meter design):

- **Save and exit** saves everything, then closes.
- **Don't save and exit** closes without saving. Next time, Arayashiki starts
  fresh: that work is gone.
- **Cancel** keeps the window open.

If Arayashiki closes without asking (a crash, a power cut, the task manager),
nothing is lost: your work is saved as you go, and the next launch brings it
back. The start screen then says the app didn't close properly and offers
**Continue where you left off**.

## The Skill Builder

The window is laid out like Blender. Every panel has a header strip; drag a
header onto another panel to dock it at that side (or onto its middle to swap
them), use the button at the right of a header to float a panel, and drag the
gaps between panels to resize them.

| Panel | What it's for |
|---|---|
| **Outliner** (top left) | The moveset: categories, skills, and the open skill's branches. |
| **Nodes** (bottom left) | The open skill's line of nodes, its branches along the top, and **Add** for new nodes. |
| **Viewport** (middle) | Your character and the dummy playing the skill. |
| **Timeline** (under the viewport) | The frame meter: what fired when, on you and on the dummy. The **Log** tab lists every step. |
| **Properties** (right) | The picked node's fields, the branch's conditions, the skill's settings, and the simulation's settings. |

**Layout** in the top bar keeps your arrangements:

- **Reset to the default layout** puts every panel back where it starts.
- **Save this layout…** keeps where the panels are and how big, under a name
  ("Animating", "Big viewport").
- Your saved layouts are listed under it: pick one to switch to it. **Delete a
  saved layout** removes one.

The same menu is under **Panel layout** when you right-click an empty spot,
and **Save the panel layout** and **Reset the panel layout** are in the
search.

### Opening and saving movesets

A moveset is the code JJS's Skill Builder copies out (it starts with
`KLUv/`). Arayashiki keeps movesets in `.txt` files holding that code, the
same thing JJS reads and writes.

- **Import** (<kbd>Ctrl+I</kbd>): paste a code. Choose to replace the moveset
  or add the skills to it.
- **Open** (<kbd>Ctrl+O</kbd>): a `.txt` holding a code.
- **Save** (<kbd>Ctrl+S</kbd>): back to its `.txt` (the first time, it asks
  where). **Save As** (<kbd>Ctrl+Shift+S</kbd>) picks a new file.
- **Export…** (<kbd>Ctrl+E</kbd>), then **Code for JJS**: the code to paste
  into JJS, for the whole moveset or just the open skill. Copy it, then use
  the import button in JJS's Skill Builder.

Everything you don't recognise in a code (node kinds or fields Arayashiki
hasn't seen) is kept exactly as it was, so a code always goes back into JJS
unchanged except for what you edited.

### Editing skills and nodes

- Click a skill in the Outliner to open it. The plus at the Outliner's top
  adds a skill to the open category; the other buttons move, duplicate and
  delete it.
- The Nodes panel shows the open branch's line. Click a node to pick it
  (Ctrl-click for several, Shift-click for a run), drag to reorder, and edit
  its fields in Properties → Node. Fields a VISUAL's effect ignores are dimmed.
- **Add** inserts a node after the picked one. Or press <kbd>Ctrl+Space</kbd>
  and type its name ("hitbox", "velocity", "slash"): every node kind and every
  VISUAL effect is there.
- Branches are the tabs along the top of the Nodes panel. Their conditions
  (Req) are in Properties → Branch. Renaming a branch keeps every BRANCH,
  BRANCH TARGET and RANDOM that pointed at it.
- <kbd>Ctrl+Z</kbd> undoes, <kbd>Ctrl+Y</kbd> redoes. <kbd>Ctrl+A</kbd>
  picks every node (with the Outliner last clicked, every skill in the
  category), <kbd>Ctrl+D</kbd> duplicates the picked nodes,
  <kbd>Delete</kbd> deletes them, <kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd> move
  them.
- The arrow beside the open skill in the Outliner folds its branches away
  (and back); the skill stays picked.
- **Number fields drag**: hold and drag left or right on any number to change
  it (Shift for fine steps, Ctrl for big ones); a plain click types in it.
  "x, y, z" fields (POSITION, SIZE, ROTATION…) are three boxes, one per axis.
- **Continue from ALT POSITION** (a VISUAL's button in Properties, its
  right-click menu, or <kbd>Ctrl+Shift+D</kbd>) carries the picked VISUAL on:
  it adds a WAIT and a copy that starts where it ends (its ALT POSITION, ALT
  ROTATION, size and transparency) and makes the same move again. The WAIT is
  its TIME less 0.05, so the two overlap and it doesn't blink between them; a
  Camera's WAIT is its whole TIME (overlapping Camera blocks hand the view back
  to the player in JJS). Press it again on the copy to keep going.

### Playing a skill

Press <kbd>Space</kbd> to play the open skill and <kbd>Shift+Space</kbd> to
play it from the start. Click the timeline to scrub, click a bar to jump to
its node, and step a frame with <kbd>←</kbd> / <kbd>→</kbd> (with Shift, ten
frames). The speed buttons on the timeline play at ½ or ¼ speed.

In the viewport, click an effect or a hitbox to open the node that made it.
The plates in the corners show each character's states, tags and the dummy's
health. Turn on **Sounds** to hear the skill's Roblox sounds (most need you to
be signed in).

The simulation's settings are in Properties → Simulation: your conditions (in
the air, jumping, holding the key, awakened, the awakening bar), whether hits
land (by the box, always, or never), how far the dummy stands, a wall in
front, whether the dummy blocks, counters or evades, tags already set, and the
moveset's passive skills running alongside.

> The simulator is a model of JJS's rules, built from real exports, not the
> game itself. Branching, conditions, loops, tags and hits follow tested
> rules; timings, physics and damage are close, not exact. Test the final
> move in JJS.

### Moving around the viewport

| Do this | To |
|---|---|
| Right-drag | Look around from where the camera is (the cursor hides, and is back where it was when you let go) |
| Middle-drag | Pan |
| Wheel | Move toward what's under the cursor |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>, <kbd>Q</kbd> <kbd>E</kbd> (pointer over the view) | Fly forward, left, back, right, down, up (Shift: slower) |
| <kbd>F</kbd> | Frame your character |
| The axis gizmo (top right) | Click an axis to look along it, drag to orbit |

### Moving, scaling and turning things in the view

The tools down the viewport's left side work as Roblox Studio's do. Pick a
hitbox, projectile or effect (click it in the view, or its node), then:

| Tool | Key | Does |
|---|---|---|
| Select | <kbd>Ctrl+1</kbd> | Click to pick; no handles |
| Move | <kbd>Ctrl+2</kbd> | Drag an arrow (or the plane between two) to move it: its POSITION |
| Scale | <kbd>Ctrl+3</kbd> | Drag a handle to size it: its SIZE (one number for an effect, x, y, z for a hitbox) |
| Rotate | <kbd>Ctrl+4</kbd> | Drag a ring to turn it: its ROTATION |

Hold <kbd>Ctrl</kbd> while dragging to snap (half a stud, 15°, a tenth in
scale). The globe (<kbd>Ctrl+L</kbd>) switches between the world's axes and
the thing's own. Each drag is one undo step. The handles stay hidden while the
skill plays, and while the animator or the camera path is open (they have
their own).

**Follow** carries your camera along with the two characters. **Hitboxes**
(<kbd>H</kbd>) shows hitboxes in red and projectiles in orange. The shape
menu frames the view as a screen of that shape (16:9, a phone…).

### Cameras

The viewport's header has three cameras:

- **Free**: yours, flown with the controls above.
- **Auto**: a cinematographer that frames the fight for you. Open
  **Camera…** in the viewport's header to pick its angle (three-quarter, side
  on, front, over the shoulder, low hero shot, high, top down, orbit), how
  tight it frames, who it follows, how smoothly it moves, and what it does on
  a hit (punch in, shake, a dutch tilt kick).
- **Recorded**: a camera path you lay down for videos and screenshots (see
  [The camera path for videos](#the-camera-path-for-videos)).

**The skill's own camera** (in **Camera…**) decides whether the skill's Camera
blocks, Field of View changes and shakes take over the view while they run,
as they would on the player's screen in JJS. With the Free camera they take
it only while the skill plays: stopped, the view stays yours, so you can fly
around a moment where a Camera block runs. The Auto and Recorded cameras,
and video exports, always show them.

**Reset camera settings** (at the bottom of **Camera…**, or in the viewport's
right-click menu) puts the cameras back as they start: the Free camera,
Follow on, the skill's own camera on, the Auto camera's defaults, and the view
framed on your character again. Recorded camera keys stay (**Clear camera
keys** removes them).

## Exporting: code, videos and pictures

Everything that leaves the app goes through one window: **Export…** at the
top right. It has three pages down its left side.

- **Code for JJS** (<kbd>Ctrl+E</kbd>): the code to paste into JJS, for the
  whole moveset or just the open skill. Copy it, or save it as a `.txt`.
- **Video** (<kbd>Ctrl+F12</kbd>): the open skill as a video, a GIF or a PNG
  sequence.
- **Picture** (<kbd>F12</kbd>): a still of any moment, for thumbnails.

### Exporting a video

The Video page works like Adobe Media Encoder. On the left, a preview of a
frame (drag the slider to see other moments), the part of the skill to
export (**In** and **Out**), and the **queue**. On the right, the settings, in
sections you can fold away.

| Section | What's in it |
|---|---|
| Preset | Ready-made setups: YouTube 1080p or 4K, Shorts/TikTok vertical, Discord (small), slow motion, transparent MOV or WebM for editing, a chroma key MOV, a GIF, a PNG sequence. Change anything after picking one. File name, and where it saves (ask each time, or `Videos\Arayashiki`). |
| Format | **MP4**, **MOV**, **WebM**, **GIF** or **PNG sequence**, and the codec: H.264, H.265 (HEVC) or AV1 in MP4; H.264, H.265 or PNG in MOV; VP9, AV1 or VP8 in WebM. Only the codecs your PC can encode are listed. |
| Video | Size (720p to 4K, vertical, square, the viewport's size, or any size), frame rate (24 to 120 fps), and speed: real time, ½, ¼, ⅛ or any speed for slow motion. |
| Bitrate | Encode **by quality** (low to best), or at a target bitrate in Mbps, **VBR** (variable) or **CBR** (constant), and how often a keyframe comes (shorter seeks faster in editors; longer is smaller). |
| GIF | How many colours (256 down to 32), and whether it loops. |
| Background | **The room** (the viewport's floor and wall, which you can hide), **Transparent** (just the characters and effects), **Chroma key** (a flat colour you pick, #00FF00 by default, to key out in an editor) or a **Colour**. |
| Camera | The viewport's camera, **Auto** (with its settings right there), or your **Recorded** path. |
| Overlays | Hitboxes, damage numbers, and the skill's screen effects (its Camera blocks, FOV, shakes, colour grading and overlays). |
| Audio | The skill's sounds, on or off; in slow motion, slowed down with the picture (lower pitch, like tape), at normal speed, or none; the audio bitrate and sample rate. |

The bottom of the settings shows the size, frame rate, number of frames, the
video's length and about how big the file will be.

**Export** renders it now. **Add to queue** saves the settings as a job
instead: queue several (other skills, formats, cameras), then **Start
queue**. Each job shows its progress, how fast it's going, and **Show in
folder** when it's done.

Videos aren't recorded off the screen: every frame is drawn on its own at the
size and time it needs, so a slow-motion video is just as smooth as a
real-time one (a ¼-speed video at 60 fps draws 240 moments of the skill for
each second of it), and nothing depends on how fast your PC is while you
watch. Encoding uses your graphics card's video encoder, and the file is
written to disk as it goes. How fast it renders depends mostly on your
graphics card.

**Transparency.** What keeps the transparent background:

- **MOV with the PNG codec**: every editor reads it with its transparency
  (After Effects, Premiere Pro, DaVinci Resolve, Vegas, CapCut desktop,
  ffmpeg). The files are big.
- **WebM (VP9)**: much smaller, read by browsers, OBS, ffmpeg and some
  editors.
- **GIF**: one-bit transparency (a pixel is there or not).
- **PNG sequence**: one PNG per frame, with transparency, in a new folder.

**MP4** (and MOV with H.264) can't hold transparency. You can still pick
Transparent: the window warns you, and the video renders on black. Pick MOV
(PNG) or WebM to keep it.

**Sound.** The skill's SFX nodes are mixed the way the app plays them: from
each sound's START, at its SPEED and VOLUME, with its FADE IN and FADE OUT,
until its END or a CANCEL. Sounds come the same way the viewport's do, so
sign in with Roblox: most sounds are only handed to an account, and sounds
private to their creator can't be used at all. The queue says how many
sounds made it in and how many couldn't be downloaded. MP4 gets AAC (or Opus
if your PC can't encode AAC), WebM gets Opus, MOV gets uncompressed PCM, a PNG
sequence gets a `.wav` next to its frames, and a GIF has no sound.

### Exporting a picture

The Picture page (<kbd>F12</kbd>) draws the moment you pick (the slider
under the preview) at any size: sharp enough for a YouTube thumbnail
(1280 × 720). It has the same backgrounds, cameras and overlays as videos.
**Copy** puts it on the clipboard; **Save PNG** saves it.
<kbd>Shift+F12</kbd> saves one straight to `Pictures\Arayashiki`.

### The camera path for videos

A camera you fly and key for videos and screenshots. It never changes the
skill (to animate the camera players see in JJS, use a camera animation:
[Animating a camera](#animating-a-camera)).

Open it from **Camera… → Edit the camera path…**, the Export window's Camera
section, or the search. It's a floating window: drag it by its header, size
it from its corner.

1. Move the playhead, fly the viewport to the shot (right-drag, WASD), and
   press **Key from view** (<kbd>K</kbd>). Repeat for each shot. If the
   playhead is on a key already, the new key goes half way to the next one
   (or half a second after the last).
2. Each key has a **time**, a **position**, a **turn** (pitch, yaw, roll), a
   **field of view**, and how it **eases** into the next key (Linear, Sine,
   Quad… In, Out or InOut). Type exact numbers, or drag a key's marker in the
   viewport.
3. **Set key to view** moves the picked key to where you're looking.
   Clicking a key's number goes there and flies you to it.
4. **Smooth curve** runs a curve through the keys (off: straight lines).
   **Shake** shakes the camera, with presets or your own strength, turn,
   speed and time.
5. **Watch through it** (or **Preview**) plays the skill through your path.

**Record a take** instead plays the skill while you fly, and every frame
becomes a key.

## Animating meshes and cameras (keyframes)

A VISUAL in JJS only moves from one place to another (POSITION to ALT
POSITION over TIME). Anything that travels along a path, like a sword flying
around you or a camera moving shot to shot, is built in JJS as a chain of
VISUALs, each starting where the last one ended, at the moment it ended.
That's slow and fiddly by hand. The **motion animator** does it for you, the
way you'd animate in Blender.

Start one from the Nodes panel's **Animate** menu:

- **New camera animation**: a Camera VISUAL, keyed by flying the viewport.
- **New visual animation**: a moving Block, Sphere, Cylinder, Wedge or Mesh.
- **Animate the picked VISUAL** (<kbd>Ctrl+K</kbd>): keys for a VISUAL that's
  already there (a Mesh, Block, Sphere, Cylinder, Wedge or Camera effect).

The animator is a floating window: drag it by its header, size it from its
corner. A **new** animation is a draft (its badge says so): nothing goes into
the skill until you press **Write to skill**, and closing it (or **Discard
draft**) leaves the skill as it was. Once it's in the skill, and for a VISUAL
you opened with **Animate**, every change is written as you make it: the
chain of VISUAL nodes, with WAITs split so each piece fires exactly on time
without moving any other node. Each write is one undo step
(<kbd>Ctrl+Z</kbd>).

**Play** runs the skill from where the animation starts (for a camera, looking
through it; press it again to stop), all the way to the animation's last key
and its hold, even past the skill's own end or before it's written. The
timeline plays along, with a band where the animation's blocks will run and a
mark at each key, and reaches a second past the last key, for the next one.

Two views, **Keys** and **Graph** (<kbd>Tab</kbd> switches):

- **Keys** is the table of keys.
- **Graph** is the easing of each stretch between keys, as a curve: how far
  along it is (up) over its time (across). Pick a stretch in the strip along
  the top. Drag the curve's two white handles to shape it: that makes it a
  custom curve (or type its four numbers). Or pick one of JJS's easings in the
  menu under it. JJS has no custom easings, so a custom curve is written as a
  few blocks of JJS's own easings that follow it; for a camera the dashed line
  is what JJS will run, and **Nearest JJS easing** makes the stretch a single
  block again.

**Bend with handles** is a pen tool: it puts two handles on the picked key.
Drag the white dots in the viewport to bend the path through the key (the
other handle turns to stay opposite; <kbd>Alt</kbd> drags one alone), and drag
a key's own pin to move the key, straight across the screen. **Remove
handles** makes it straight through the key again.

### Animating a mesh or part

1. Pick the **effect** (Block, Sphere, Cylinder, Wedge or Mesh, with its mesh
   and texture IDs) and the **body part** it hangs from.
2. **Add key** (<kbd>K</kbd>) adds a key after the last one, at the bottom of
   the list, and picks it: at the playhead if that's past the last key, or
   else half a second after it. It's posed as the animation is there. (Change
   its **Time** to move it anywhere.)
3. Pick a key (in the list, or click its box in the viewport) and drag the
   gizmo: <kbd>G</kbd> to move, <kbd>R</kbd> to turn. Or type exact numbers:
   position on the body part (x left, y up, z forward, in studs), rotation in
   degrees, size, transparency (0 solid, 1 invisible).
4. Set each key's **easing to the next** key: Linear, Sine, Quad, Cubic,
   Quart, Quint, Exponential, Circular, Back, Bounce or Elastic, In, Out or
   InOut.
5. Tick **Cut** on a key for a jump cut: instead of moving there from the key
   before, the animation holds the key before until the cut's moment, then is
   at the cut key at once. Cutscenes cut from shot to shot this way.

Every number in the table drags to change it (see
[Editing skills and nodes](#editing-skills-and-nodes)).

**Smooth curve** runs a curve through your keys (the chain gets more, shorter
pieces to follow it: set how many a second; the easing still applies). With
it off and only key to key, each piece uses JJS's own easing. **Hold at the
end** keeps the effect where it stopped for a while.

**Placement** says where the chain goes in the skill:

- **After node N** (or **Where it is**, once it's in): the chain starts at
  that node, as a new animation always has.
- **Weave in**: it starts at a time in the skill (**Starts at**, or
  **Playhead** for where the playhead is), and each of its pieces goes in
  between the nodes already there, at its moment, splitting the WAITs it
  falls in. Use it to lay a camera over a skill you've already built.

### Animating a camera

1. **Animate → New camera animation** starts a draft for a Camera VISUAL
   after the picked node, with its first keys where your view is. The
   viewport switches to the Free camera, since you key it by flying.
2. Move the playhead, fly to the next shot, and press **Key from view**
   (<kbd>K</kbd>): the new key goes at the bottom of the list, as the latest,
   and is picked. **Set key N to view** moves the picked key to your view.
3. While the animator is open, the skill's own camera stays out of the way so
   you can fly freely. **Play** plays the skill looking through the animated
   camera; **Look through it while editing** does the same while you scrub.
4. Set each key's easing, jump cuts and smoothing, as for a part.
5. **Write to skill** puts it in.

Camera keys are stored relative to your character, so the shot follows the
character as JJS's Camera blocks do. Rotation `0, 0, 0` looks the way you
face; `0, 180, 0` looks back at you.

How a camera is written, so it plays smoothly in JJS:

- **As few blocks as it can, eased by JJS.** A stretch between two keys is
  one Camera block with that key's easing. A smooth curve only adds blocks
  where it bends away from a straight line, each with whichever of JJS's
  easings follows it best; a shake needs short blocks (never under three
  frames). The panel says how many blocks it makes.
- **Back to back, in whole frames.** In JJS, when any Camera block's time
  runs out the game gives the view back to the player, even while a newer
  block is running. So the blocks never overlap and never leave a gap: each
  ends on the frame the next begins. Writing it also cuts any other Camera
  block in the line that would still be running when the next one starts.
- **Your direction is locked while it plays.** A `STATE DirectionLock` goes
  on you for the whole animation (its hold too), so you don't turn mid-shot.
  Turn off **Lock your direction while it plays** to leave it out.

The preview (**Play**, **Look through it**) shows the blocks as JJS will run
them.

### Camera shake

Screen shakes (Shake Light / Medium / Heavy) don't move a Camera block's view
in JJS, so the animator puts the shake into the camera's path itself. Shake is
keyed like everything else: each key has a **Shake** (how far it jitters, in
studs) and a **Turn** (how much it wobbles, in degrees), and they ease from
key to key. Key a shake of 0, then a hard one at the impact, then 0 again,
and the shake hits and dies away. The **Light**, **Medium** and **Heavy**
buttons set the picked key's shake; **Shakes a second** sets how fast it
jitters.

### Removing an animation

**Remove animation** takes the whole chain out of the skill and joins the
WAITs it split. For a draft, **Discard draft** closes it without changing the
skill.

## Templates

**Templates** (<kbd>Ctrl+T</kbd>) build ready-made skills from a short form,
each lifted node for node from a real moveset: a meter, an auto-sheathing
weapon, accurate M1s, an accurate dash, and percentage damage. Fill in the
form, preview it, and add the skills to your moveset.

## The Meter Maker

The Meter Maker draws a meter (a progress bar: a picture for every step of a
value, like a resource or a charge), uploads the pictures to Roblox on your
account, and makes the JJS skill that shows the right picture for the value.

1. **New** asks how many steps; start from a bar, a ring, or blank.
2. Draw it with layers: shapes and meters (<kbd>U</kbd>), the brush
   (<kbd>B</kbd>), text (<kbd>T</kbd>), and pictures. <kbd>Space</kbd> plays it
   through its steps.
3. **Export** saves the pictures, or uploads them to Roblox and makes the
   skill, ready to add to your moveset or copy into JJS.

Designs are saved inside the app (**Save**), or as `.meter.json` files to
share (**Save As**). **Settings** is in the Meter Maker's top bar too.

**A picture as the bar.** A meter's **Picture** shape (Shape tab) makes a
whole picture the bar, not one segment's shape: the fill sweeps across the
picture's own outline, the way it fills a text bar. **Filled with** is the
picture's own colours, or the Fill tab's paint; **Still to fill** is the
picture greyed and dimmed, or the Back tab's paint. A picture with a
see-through background works best (a sword, a skill icon, a logo).

**In layers.** Under Export → Pictures, **Render in layers** saves the meter
apart from its container: one container picture (the background, the outline,
and any layer that never changes), then a folder each of the meter, its
leading edge and its catch-up trail (whichever the design has), a picture per
step.

**The skill's styles** (Export → JJS skill):

- **Complex** (the default): each step's picture is shown once and kept,
  the others cancelled by their tags, then it loops on its checks. Lag-proof.
- **Complex Separate**: the meter in layers, each its own billboard, a
  thousandth of a stud apart in z (the more negative, the further in front):
  the container at the back, shown once for good when the skill starts; the
  catch-up trail; the meter in front. Only the meter is swapped as the tag
  changes. When the tag goes down, the step it came from flashes its trail
  behind the meter and fades over **Trail fades in** seconds. It asks for the
  container's image ID, the meter's (one per step, with the leading edge in
  them) and the trail's (one per step, if a bar's catch-up trail is on); the
  upload makes and fills in all of them.
- **Legacy**: each step shown again and again, every wait. Simple, but it can
  lag.

The 3D preview shows where the billboard sits on you, placed the way JJS
places it (for Complex Separate, its layers stacked).

## Search everything (Ctrl+Space)

<kbd>Ctrl+Space</kbd> opens the universal search, from anywhere. Type a few
letters of anything:

- commands ("export video", "reset layout", "auto camera"),
- the moveset's skills, the open skill's branches and every node,
- nodes and VISUAL effects to add ("add hitbox", "black flash"),
- templates, settings, keyboard shortcuts, recent files,
- and the sections of this manual ("green screen", "shake").

It forgives typos ("scrennshot"), missing spaces ("exportvideo"), initials
("ev"), and any word order.

| Key | Does |
|---|---|
| <kbd>↑</kbd> <kbd>↓</kbd> | Move through the results |
| <kbd>Enter</kbd> | Run the picked one |
| <kbd>Ctrl+Enter</kbd> | Run it and keep the search open |
| <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Next / previous category |
| <kbd>Ctrl+F</kbd> | Make it a favourite (favourites come first) |
| <kbd>Esc</kbd> | Close |

With nothing typed, it shows your favourites and what you ran lately.

## Right-click menus

Right-click shows a menu for what you clicked:

- a **node**: animate it (VISUALs), duplicate, move, copy and paste nodes as
  JSON, play from it, **Add node ▸** and **Add visual effect ▸** (after it),
  delete;
- a **skill** in the Outliner: play, **Add node ▸** and **Add visual effect
  ▸**, add, duplicate, move, copy its code for JJS, delete;
- a **branch**: add nodes to it, add a branch, play from it, delete;
- an empty spot in the **Nodes** or **Outliner** panel: add nodes (or a
  skill), and **Panel layout ▸**;
- the **viewport**: play, the cameras, camera takes, reset the camera or its
  settings, Follow, hitboxes, pictures and videos, and a new camera animation;
- the **timeline**: play and the speeds;
- a **text field**: cut, copy, paste, select all;
- anywhere else: search, undo, save, export, the panel layout, settings,
  this manual.

**Add node ▸** lists every node kind by group (Flow, Motion, Combat, Look);
**Add visual effect ▸** adds a VISUAL with that effect already set. Hover or
press <kbd>→</kbd> to open a submenu, <kbd>←</kbd> to close it.

A right-drag in the viewport turns the camera and doesn't open a menu.

## AI

Arayashiki works with AI two ways. Either way, the AI can read and change the
open moveset, simulate skills, look at the viewport, export videos and
animate cameras, and every change it makes can be undone with
<kbd>Ctrl+Z</kbd>.

### The assistant inside the app

Press <kbd>Ctrl+J</kbd>. Pick your AI and paste its API key:

- **Claude** (Anthropic), **OpenAI** (ChatGPT's models), **Google Gemini**,
  **OpenRouter** (hundreds of models with one key), **Groq**, **xAI**,
  **DeepSeek**, **Mistral**, or any OpenAI-compatible service;
- or a free model on your own PC: **On this PC** (built in, below), or
  **Ollama** or **LM Studio** if you already use them (no key; pick a model
  that supports tool use).

Keys are kept in Windows' Credential Manager, never in the app's files, and
are sent only to the service they belong to. You pay the service for what you
use.

Then ask: "what does this skill do?", "why doesn't my M1 hit?", "make a dash
that launches the dummy upward", "film this at quarter speed with a
transparent background". Click a tool line in the chat to see exactly what it
did.

### Free models on this PC

Pick **On this PC (built in, free)** in the assistant's settings (the gear;
it's first in the list, and **Run a free model on this PC** picks it), or
use Settings → AI, which lists the same models. Nothing to install separately
and nothing leaves your PC:

1. **Get the engine** (about 35 MB, once): llama.cpp, which runs the models.
   It uses your graphics card through Vulkan (NVIDIA, AMD and Intel); **CPU
   only** is for a PC whose graphics card can't.
2. **Download** a model. **Qwen3.5 4B** is the one to start with: good with
   tools and fine on most PCs (8 GB of memory). The list also has smaller
   (Qwen3.5 2B) and bigger ones (Qwen3.5 9B, Google's Gemma 4, OpenAI's
   gpt-oss 20B, Qwen3.8 27B, Qwen3 Coder, Qwen3.6 35B), each with its size and
   what it needs. A download can be paused (the ×) and picked up later.
3. Press **Use** on a downloaded model, and chat.

The model loads when you send the first message (a few seconds, longer for
big models) and stays loaded until Arayashiki closes; **Stop** frees its
memory sooner. **Context** is how much of the conversation it keeps in mind
(more needs more memory), and **Use the graphics card** off runs it on the
processor only. Any other model from Hugging Face works too: paste the link
to its `.gguf` file under **Another model from Hugging Face** (a Q4_K_M file
of a model that supports tool calling).

Small models are quicker but slip up more on long tasks than Claude or GPT:
give them one thing at a time.

### Connecting the AI app you already use (MCP)

Search for **Connect an AI app** (or Settings → AI). Pick yours: Claude
Desktop, Claude Code, Cursor, VS Code (GitHub Copilot), Windsurf, Cline, Codex
CLI, Gemini CLI or LM Studio. **Connect automatically** adds Arayashiki to
that app's MCP settings (keeping a backup of the file), and the wizard shows
the steps to see it working in that app. Nothing else to install: Arayashiki
is its own MCP server, and the AI app starts Arayashiki if it isn't open.

ChatGPT's apps can't start programs on your PC, so they can't connect this
way: use the assistant inside the app with an OpenAI key instead.

For anything else that speaks MCP, the wizard's **Other** page gives the
command (`arayashiki.exe --mcp`) and a JSON snippet.

## Settings

Settings (search for it) has five tabs:

- **Keybinds** (<kbd>Ctrl+/</kbd>): every command has a shortcut, grouped as
  in this manual. Click one and press the new keys, or clear it (×); the
  undo arrow puts its default back. Two shortcuts heard in the same place are
  marked as a clash.
- **Appearance**: the start screen on launch, the interface size, the
  viewport's background, hitboxes.
- **AI**: the assistant, the free models on this PC (download and pick one
  here too), and connecting AI apps.
- **Roblox**: the index of Roblox's own cache on your PC (assets come from
  there when Roblox already downloaded them), and deleting what Arayashiki
  downloaded.
- **Updates**: the version you have, checking for a newer one, whether to
  check at launch and to download updates by themselves, taking the quick
  tour again, and what's new.

## Keyboard shortcuts

These are the defaults; every command has one, and any can be changed (or
cleared) in Settings → Keybinds (<kbd>Ctrl+/</kbd>).

| Shortcut | Does |
|---|---|
| <kbd>Ctrl+Space</kbd> | Search everything |
| <kbd>Ctrl+J</kbd> / <kbd>Ctrl+Shift+J</kbd> | AI assistant / connect an AI app |
| <kbd>F1</kbd> / <kbd>Shift+F1</kbd> / <kbd>Ctrl+F1</kbd> | This manual / the quick tour / what's new |
| <kbd>Ctrl+,</kbd> / <kbd>Ctrl+/</kbd> | Settings / keyboard shortcuts |
| <kbd>Ctrl+Shift+1</kbd> / <kbd>Ctrl+Shift+2</kbd> | The Skill Builder / the Meter Maker |
| <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> / <kbd>Ctrl+Alt+0</kbd> | Interface bigger / smaller / 100% |
| <kbd>Alt+U</kbd> / <kbd>Alt+A</kbd> / <kbd>Ctrl+Q</kbd> | Check for updates / your Roblox account / exit |
| <kbd>Space</kbd> / <kbd>Shift+Space</kbd> | Play / pause; play from the start |
| <kbd>←</kbd> <kbd>→</kbd> | Back / forward a frame (Shift: ten) |
| <kbd>Home</kbd> / <kbd>End</kbd> | To the start / the end |
| <kbd>Shift+1</kbd> / <kbd>Shift+2</kbd> / <kbd>Shift+3</kbd> | Speed: real time / ½ / ¼ |
| <kbd>↑</kbd> <kbd>↓</kbd> | Previous / next node |
| <kbd>Alt+↑</kbd> <kbd>Alt+↓</kbd> | Move the node up / down |
| <kbd>Ctrl+A</kbd> | Select all nodes (or skills, in the Outliner) |
| <kbd>Ctrl+D</kbd> | Duplicate node |
| <kbd>Ctrl+Shift+D</kbd> | Continue the picked VISUAL from its ALT POSITION |
| <kbd>Delete</kbd> | Delete (in the panel you last clicked) |
| <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> | Undo / redo |
| <kbd>Ctrl+N</kbd> / <kbd>Ctrl+Shift+H</kbd> | New Character / the start screen |
| <kbd>Ctrl+O</kbd> / <kbd>Ctrl+I</kbd> | Open a .txt / import a code |
| <kbd>Ctrl+S</kbd> / <kbd>Ctrl+Shift+S</kbd> | Save / save as |
| <kbd>Ctrl+E</kbd> | Export: code for JJS (or the meter) |
| <kbd>Ctrl+T</kbd> | Templates |
| <kbd>Ctrl+Shift+N</kbd> / <kbd>Ctrl+Alt+D</kbd> / <kbd>Ctrl+Shift+Delete</kbd> | Add / duplicate / delete a skill |
| <kbd>Ctrl+B</kbd> | Add a branch |
| <kbd>Ctrl+1</kbd> … <kbd>Ctrl+4</kbd> | Viewport tools: Select, Move, Scale, Rotate |
| <kbd>Ctrl+L</kbd> | Move and turn in world / local axes |
| <kbd>H</kbd> | Hitboxes on / off |
| <kbd>Alt+F</kbd> / <kbd>Alt+M</kbd> / <kbd>Alt+D</kbd> / <kbd>Alt+B</kbd> | Follow / sounds / the dummy on and off; the next viewport background |
| <kbd>W A S D Q E</kbd>, <kbd>F</kbd> | Fly the viewport camera (pointer over the view), frame you |
| <kbd>Alt+1</kbd> / <kbd>Alt+2</kbd> / <kbd>Alt+3</kbd> | Camera: Free / Auto / Recorded |
| <kbd>Alt+C</kbd> | The skill's own camera on / off |
| <kbd>Alt+R</kbd> / <kbd>Alt+Shift+R</kbd> | Reset the camera / its settings |
| <kbd>K</kbd> | Add a key (the camera path, or the open animation) |
| <kbd>Alt+K</kbd> / <kbd>Alt+Shift+K</kbd> / <kbd>Alt+P</kbd> | Record a camera take / clear camera keys / edit the camera path |
| <kbd>Ctrl+K</kbd> | Animate the picked VISUAL |
| <kbd>Ctrl+Shift+K</kbd> / <kbd>Ctrl+Alt+K</kbd> | New camera animation / new visual animation |
| <kbd>G</kbd> / <kbd>R</kbd> / <kbd>Tab</kbd> | In the animator: move / turn the picked key; keys or graph |
| <kbd>F12</kbd> / <kbd>Shift+F12</kbd> | Export a picture / quick screenshot to Pictures |
| <kbd>Ctrl+F12</kbd> | Export a video |
| <kbd>Ctrl+Alt+R</kbd> / <kbd>Ctrl+Alt+S</kbd> | Reset / save the panel layout |

In the Meter Maker: <kbd>V</kbd> move, <kbd>B</kbd> brush, <kbd>E</kbd>
eraser, <kbd>U</kbd> shapes, <kbd>T</kbd> text, <kbd>Ctrl+0</kbd> fit the
canvas, <kbd>,</kbd> / <kbd>.</kbd> previous / next step, and the arrows nudge
the picked layer (Shift: ten pixels).

## Troubleshooting

### Effects show as grey shapes, or sounds are silent

Sign in with Roblox (the account button, top right). Some meshes, textures
and most sounds are only handed to an account. A few assets are private to
their creator and can't be loaded by anyone else.

### A video export says the PC can't encode that format

Arayashiki uses your graphics card's encoders through Windows. Try another
format (WebM works almost everywhere), a smaller size, or update your
graphics driver.

### A video has no sound, or some sounds are missing

Sign in with Roblox: most sounds are only handed to an account. Sounds private
to their creator can't be downloaded by anyone else. The export queue says how
many sounds made it in. A GIF never has sound, and the sound in slow motion
can be turned off (Export → Video → Audio).

### The AI app doesn't see Arayashiki

Restart the AI app completely after connecting (for Claude Desktop, quit it
from the system tray). Check its MCP list for "arayashiki". If you moved or
reinstalled Arayashiki, connect again: the settings point at the app's path.

### The assistant says the key wasn't accepted

Open the assistant's settings (the gear) and paste the key again. Check that
the key is for the service picked, and that the account has credit.

### Something looks different in JJS

The simulator is a model of the game, so timings and physics can differ a
little. The handbook (`docs/jjs-skill-builder.md` in the source) says which
rules are confirmed and which are inferred.

## What Arayashiki can't do

- It isn't JJS. Blocking, the dummy acting by itself, counters triggering,
  and cooldowns aren't modelled, and animations are stand-in poses (JJS's own
  animations aren't public).
- Roblox assets that are private to their creator can't be shown or played.
- ChatGPT's apps can't connect through MCP (use the assistant with an OpenAI
  key).
- It runs on Windows.
