# Changelog

What changed in each version of Arayashiki, newest first. The app shows this
under Help → What's new.

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
