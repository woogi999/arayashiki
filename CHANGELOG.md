# Changelog

What changed in each version of Arayashiki, newest first. The app shows this
under Help → What's new.

## 1.0.3

### Impact frames

- **Insert impact frame…**, in the viewport's right-click menu, a skill's, and
  a node's (or Ctrl+Shift+I): the few frames of a hit that anime draws as
  stark silhouettes, made from the moment itself. The characters are drawn
  from the skill's camera at that moment, then stylised, uploaded, and put
  into the skill there as Overlay VISUALs, one after another for a moment
  each.
- **Presets**: Basic, Negative, Flicker, Anime (speed lines and a burst),
  Halftone, Manga ink, Red flash, Colourful, Spider-Verse (comic dots,
  misprinted colour, glitches), Cursed, Glitch, Shatter and Sketch. **Edit the
  look** makes your own: colours, a gradient, outline, speed lines,
  screentone, dotted silhouettes, cracks, colour split, glitch slices,
  scanlines, grain, vignette, a starburst, inverted alternate frames, a fade.
- Choose who's in it (both, only you, only the enemy, or nobody), how many
  frames and how long each, and the screen shape. **Shuffle** gives another
  take, and **Flash it** previews them at speed.
- An overlay sits on the screen, not in the world, so it only lines up while
  a Camera block holds the view. The dialog says whether that moment has one,
  and recommends impact frames for skills with a camera scene.

### Meter Maker

- **A health bar.** "Moved by: Your health" makes the meter show your own
  health. A passive finds which step it's on with Has Health checks, the way
  the Percentage damage template does (five checks for twenty steps), and puts
  the bar there. Set the max health and how often it looks.
- **Every font on your PC, and Google Fonts.** The font menu is now a font
  browser with three tabs: the built-in fonts and the ones you've added; the
  fonts installed on this PC; and Google Fonts' whole catalogue (searchable,
  by category, most popular first). Each font is previewed in its own letters,
  in a line of text you choose. Picking a Google font adds it: it's
  downloaded once and kept, so designs that use it draw with it offline too.
- **The catch-up trail, in layers, is the meter's own step**, not ahead of it:
  it only flashes when the meter goes down, so it shows where the meter was.
  The preview shows it that way too.

### Keyboard

- **Your keyboard layout, first.** The welcome now starts by asking which
  keyboard you use (QWERTY, AZERTY, QWERTZ, Dvorak or Colemak), picking the one
  it detects. The shortcuts' defaults follow it: flying is ZQSD on AZERTY, for
  one, and a shortcut whose key needs Shift there gets one that doesn't. It's
  also in Settings → Keyboard shortcuts; shortcuts you changed by hand stay.

### AI

- **Local models can keep up to 1M tokens in mind.** The context now goes to
  128K, 256K, 512K and 1M, with the memory it would take and a warning as it
  gets unsafe: past what most PCs have, and past what most models are
  trained for.

### Everywhere

- **Clicking outside a window no longer closes it**, so a stray click can't
  lose what you were doing. Esc or the × closes it.

## 1.0.2

### Updates

- **Arayashiki updates itself**, as a game launcher does. A few seconds after
  it opens, it checks GitHub. A newer version downloads in the background, and
  a window says so, with what's new in it. **Restart now** puts it in within a
  few seconds; **Later** carries on, and it installs itself the next time you
  open the app. No installer to run. Settings → Updates can turn off the check
  or the download.
- **A new installer that never goes out of date.** `Arayashiki-Setup.exe`
  asks GitHub for the latest version, installs it in your user folder (no
  administrator needed, WebView2 too if the PC lacks it), and adds it to the
  Start menu, the desktop and Settings → Apps. It's the same file for every
  release.
- The first time a new version opens, it shows **What's new**.

### Viewport

- **No more "To show your cursor, press Esc" banner.** Right-drag to look still
  keeps the cursor where it was: it's hidden while you turn and comes back to
  the same spot when you let go.
- **Move, scale and rotate things in the view**, as in Roblox Studio or
  Blender. Pick a hitbox, projectile or effect, then drag the handles of the
  **Move**, **Scale** or **Rotate** tool (the strip down the view's left side,
  or Ctrl+2, Ctrl+3 and Ctrl+4; Ctrl+1 is Select). Its POSITION, SIZE and
  ROTATION follow. Hold Ctrl while you drag to snap to half a stud, 15° or a
  tenth. Ctrl+L switches between world and local axes. Each drag is one undo
  step.

### Camera and visual animations

- **Play goes all the way through.** Play used to stop where the skill
  ended, often around the second key. Now it runs to the animation's last key,
  even past the skill's end or for a draft that isn't written yet. The timeline
  plays along, and a band on it shows where the animation's blocks will run,
  with a mark at each key. There's a second of room after the last key, for
  placing the next one.
- **Pen-tool handles.** **Bend with handles** puts two handles on the picked
  key. Drag the white dots in the view to bend the path through it; Alt drags
  one handle without its partner. You can now also drag the key pins
  themselves, straight across the screen.
- **A graph editor for the easing.** Switch the animator from **Keys** to
  **Graph** (or press Tab) to see each stretch between keys as a curve. Pick a
  stretch from the strip along the top. Drag the curve's two handles to shape it
  into a custom curve, or pick one of JJS's easings. A custom curve is written
  as a few blocks of JJS's own easings that follow it. For a camera, a dashed
  line shows those blocks as JJS will run them, and **Nearest JJS easing**
  turns the stretch back into a single block.

### Editing

- **Continue from ALT POSITION.** A VISUAL now has a button (also Ctrl+Shift+D
  and in its right-click menu) that adds a copy of it after a WAIT. The copy
  starts where the VISUAL ends and makes the same move again. The WAIT is the
  VISUAL's TIME less 0.05, so the two overlap and the effect doesn't blink. A
  Camera's WAIT is its whole TIME instead, because overlapping Camera blocks
  make the view jitter in JJS. Press it again on the copy to keep going.
- **Drag number fields to change them**, as in Blender. Hold and drag left or
  right on any number. Shift gives finer steps and Ctrl bigger ones. A plain
  click still types. "x, y, z" fields (POSITION, SIZE, ROTATION…) are now three
  boxes, one per axis.
- **Fold a skill's branches in the Outliner.** The arrow beside a skill hides
  or shows its branches, and the skill stays selected.

### Keyboard

- **Every command has a shortcut now**, and every one can be changed in
  Settings → Keyboard shortcuts (Ctrl+/). This includes flying with **W A S D
  Q E**, framing with **F**, the viewport tools, the cameras (Alt+1, Alt+2,
  Alt+3), playback speed (Shift+1, Shift+2, Shift+3), the animator's G, R and
  Tab, and the Meter Maker's tools. The list is grouped, any shortcut can be
  cleared, and two that clash are marked.

### Meter Maker

- **A picture can be the bar.** The new **Picture** bar shape fills across the
  picture's own outline, not just one segment's. It fills in the picture's own
  colours or the fill's, and the part still to fill is the picture faded or
  the background.
- **Render in layers**, under Export → Pictures: one container picture (the
  background, outline and anything else that never changes), then a folder
  each of the meter, its leading edge and its catch-up trail, one picture per
  step.
- **Complex Separate**, a new skill style. The meter is built from separate
  billboards, each 0.001 studs apart in z (the more negative, the further in
  front). The container is shown once, at the back, and only the meter is
  swapped as the tag changes. When the value goes down, the step it came from
  flashes its catch-up trail behind the meter and fades. It asks for the
  container's image ID, the meter's, and the trail's (if the trail is on), and
  the upload makes all of them.
- **The 3D preview is centred again.** It was shifted up and to the left, and
  the character was out of view. It now places the billboard the way JJS does.
- **Settings and Save As are in the Meter Maker's top bar.** Save As saves
  the design to a file.

### AI

- **Models on this PC are easier to find.** Settings → AI now lists the
  built-in models to download and use. "On this PC" is first in the
  assistant's list of services, and a "Run a free model on this PC" button
  starts you off. If the app can't read its models folder, it now says why
  instead of waiting forever.

## 1.0.1

### Camera animations

- **No more jitter in JJS where camera blocks met.** In JJS, the newest Camera
  block moves the view, but when any older block's time runs out the game hands
  the view back to the player, even mid-shot. Camera chains used to be dozens of
  tiny blocks (some shorter than a frame), so their ends kept landing inside the
  next block and the view snapped about. A camera animation is now written in
  whole frames (60 a second), never a block under three frames, each block ending
  on the frame the next begins, with no overlaps and no gaps.
- **Other camera blocks are kept apart too.** When a camera animation is written,
  any Camera block in the line still running when the next one starts is cut to
  end there, at the pose it had reached. Validate (and the AI tools) now warn
  about overlapping Camera blocks.
- **JJS's own easing, far fewer nodes.** A stretch between two keys is now one
  Camera block eased with that key's easing (Sine, Quad, Back…), where it used
  to be a WAIT and a block every 0.05 s. A curve through the keys only adds
  blocks where it bends away from a straight line, each taking whichever of
  JJS's easings follows it best. A shake still needs short blocks, but never
  under three frames. A typical three-key shot went from 53 nodes to 7.
- **DirectionLock while the camera plays.** A camera animation now puts a
  `STATE DirectionLock` on you for its whole length, hold included, so you don't
  turn mid-shot. Turn it off with "Lock your direction while it plays".
- **Weave an animation into a skill.** Placement in the animator: "After node N"
  puts the chain at that node as before; **Weave in** starts it at a time in the
  skill (or at the playhead) and puts each block between the nodes already
  there, at its moment, splitting the WAITs it falls in.
- The animator's preview and path now show the blocks exactly as JJS will run
  them.

### Viewport

- **The cursor stays put while you look around.** Right-drag locks the pointer,
  as Roblox Studio does: the cursor no longer wanders off while you turn, and
  it's where you left it when you let go. A plain right-click still opens the
  menu.
- **Fly freely while stopped.** With playback stopped, the Free camera stays
  yours even where a Camera block is running, so you can fly around that moment.
  Playing, the block takes the view as it does in JJS. (The Auto and Recorded
  cameras, and video exports, still show the skill's camera.)

### Editing

- **Ctrl+A selects every node** in the Nodes panel (with the Outliner last
  clicked, every skill in the category). It's also in the nodes' right-click
  menus and rebindable in Settings → Keyboard shortcuts.

### Help

- **The quick tour now visits the Meter Maker** after the Skill Builder: the
  canvas, its tools, the steps, properties and layers, and exporting to Roblox.
- **This changelog**, under Help → What's new (in the search, the start screen
  and Settings → Updates).

## 1.0.0

- The first release: the Skill Builder as a desktop app (node editor, 3D
  viewport, simulator and frame meter, templates, the motion and camera
  animator, video and picture export), the Meter Maker, sign-in with Roblox,
  the AI assistant with local models, the MCP server and CLI, onboarding, and
  updates from GitHub releases.
