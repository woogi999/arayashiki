// The app's keyboard shortcuts, every one rebindable in Settings → Keyboard
// shortcuts and kept in this browser's storage. A binding is written like
// "Ctrl+Shift+S", "Space", "Delete", "Alt+ArrowUp" or "Shift+1" (digits by
// the key, so Shift+1 isn't "!"); "" is no shortcut.
//
// Each action has a `scope`, where its keys are read:
//   (none)     the Skill Builder: runs the command of the same id (commands.js)
//   everywhere both workspaces, the start screen and over dialogs
//   both       the Skill Builder's command, and the Meter Maker's own
//   bars       the Meter Maker only (src/barmaker/state.js)
//   view       held over the 3D view: flying (src/studio-camera.js)
//   animator   while the motion animator is open (src/ui/animator.jsx)
import { signal, effect } from '@preact/signals';

export const ACTIONS = [
  // Everywhere
  { id: 'search', group: 'General', label: 'Search everything (commands, skills, nodes, settings, help)', def: 'Ctrl+Space', scope: 'everywhere' },
  { id: 'assistant', group: 'General', label: 'AI assistant', def: 'Ctrl+J', scope: 'everywhere' },
  { id: 'manual', group: 'General', label: 'User manual', def: 'F1', scope: 'everywhere' },
  { id: 'settings', group: 'General', label: 'Settings', def: 'Ctrl+,', scope: 'everywhere' },
  { id: 'keybinds', group: 'General', label: 'Keyboard shortcuts', def: 'Ctrl+/', scope: 'everywhere' },
  { id: 'toSkills', group: 'General', label: 'Go to the Skill Builder', def: 'Ctrl+Shift+1', scope: 'everywhere' },
  { id: 'toMeter', group: 'General', label: 'Go to the Meter Maker', def: 'Ctrl+Shift+2', scope: 'everywhere' },
  { id: 'tour', group: 'General', label: 'Quick tour', def: 'Shift+F1', scope: 'everywhere' },
  { id: 'changelog', group: 'General', label: 'What’s new (changelog)', def: 'Ctrl+F1', scope: 'everywhere' },
  { id: 'checkUpdates', group: 'General', label: 'Check for updates', def: 'Alt+U', scope: 'everywhere' },
  { id: 'connectAi', group: 'General', label: 'Connect an AI app (MCP)', def: 'Ctrl+Shift+J', scope: 'everywhere' },
  { id: 'account', group: 'General', label: 'Sign in with Roblox / your avatar', def: 'Alt+A', scope: 'everywhere' },
  { id: 'zoomIn', group: 'General', label: 'Interface bigger', def: 'Ctrl+=', scope: 'everywhere' },
  { id: 'zoomOut', group: 'General', label: 'Interface smaller', def: 'Ctrl+-', scope: 'everywhere' },
  { id: 'zoomReset', group: 'General', label: 'Interface at 100%', def: 'Ctrl+Alt+0', scope: 'everywhere' },
  { id: 'exit', group: 'General', label: 'Exit Arayashiki', def: 'Ctrl+Q', scope: 'everywhere' },

  // File
  { id: 'new', group: 'File', label: 'New Character', def: 'Ctrl+N' },
  { id: 'open', group: 'File', label: 'Open a .txt', def: 'Ctrl+O', scope: 'both' },
  { id: 'import', group: 'File', label: 'Import a code', def: 'Ctrl+I' },
  { id: 'save', group: 'File', label: 'Save', def: 'Ctrl+S', scope: 'both' },
  { id: 'saveAs', group: 'File', label: 'Save As', def: 'Ctrl+Shift+S', scope: 'both' },
  { id: 'export', group: 'File', label: 'Export: code for JJS (or the meter)', def: 'Ctrl+E', scope: 'both' },
  { id: 'templates', group: 'File', label: 'Templates', def: 'Ctrl+T' },
  { id: 'start', group: 'File', label: 'Start screen', def: 'Ctrl+Shift+H' },

  // Edit
  { id: 'undo', group: 'Edit', label: 'Undo', def: 'Ctrl+Z', scope: 'both' },
  { id: 'redo', group: 'Edit', label: 'Redo', def: 'Ctrl+Y', scope: 'both' },
  { id: 'delete', group: 'Edit', label: 'Delete (in the area you last clicked)', def: 'Delete', scope: 'both' },
  { id: 'selectAll', group: 'Edit', label: 'Select all (the nodes, or the skills in the Outliner)', def: 'Ctrl+A' },
  { id: 'duplicate', group: 'Edit', label: 'Duplicate node', def: 'Ctrl+D' },
  { id: 'continueVisual', group: 'Edit', label: 'Continue the picked VISUAL from its ALT POSITION', def: 'Ctrl+Shift+D' },
  { id: 'nodeUp', group: 'Edit', label: 'Previous node', def: 'ArrowUp' },
  { id: 'nodeDown', group: 'Edit', label: 'Next node', def: 'ArrowDown' },
  { id: 'moveUp', group: 'Edit', label: 'Move node up', def: 'Alt+ArrowUp' },
  { id: 'moveDown', group: 'Edit', label: 'Move node down', def: 'Alt+ArrowDown' },

  // Skills
  { id: 'addSkill', group: 'Skills', label: 'Add a skill', def: 'Ctrl+Shift+N' },
  { id: 'duplicateSkill', group: 'Skills', label: 'Duplicate skill', def: 'Ctrl+Alt+D' },
  { id: 'deleteSkill', group: 'Skills', label: 'Delete skill', def: 'Ctrl+Shift+Delete' },
  { id: 'addBranch', group: 'Skills', label: 'Add a branch', def: 'Ctrl+B' },

  // Playback
  { id: 'play', group: 'Playback', label: 'Play / pause', def: 'Space', scope: 'both' },
  { id: 'restart', group: 'Playback', label: 'Play from the start', def: 'Shift+Space' },
  { id: 'frameBack', group: 'Playback', label: 'Back a frame (Shift: 10)', def: 'ArrowLeft' },
  { id: 'frameNext', group: 'Playback', label: 'Forward a frame (Shift: 10)', def: 'ArrowRight' },
  { id: 'toStart', group: 'Playback', label: 'To the start', def: 'Home' },
  { id: 'toEnd', group: 'Playback', label: 'To the end', def: 'End' },
  { id: 'speed1', group: 'Playback', label: 'Speed: real time', def: 'Shift+1' },
  { id: 'speedHalf', group: 'Playback', label: 'Speed: half', def: 'Shift+2' },
  { id: 'speedQuarter', group: 'Playback', label: 'Speed: quarter', def: 'Shift+3' },

  // The viewport
  { id: 'toolSelect', group: 'Viewport', label: 'Tool: Select', def: 'Ctrl+1' },
  { id: 'toolMove', group: 'Viewport', label: 'Tool: Move (the picked box or effect)', def: 'Ctrl+2' },
  { id: 'toolScale', group: 'Viewport', label: 'Tool: Scale', def: 'Ctrl+3' },
  { id: 'toolRotate', group: 'Viewport', label: 'Tool: Rotate', def: 'Ctrl+4' },
  { id: 'toolSpace', group: 'Viewport', label: 'Move and turn in world / local axes', def: 'Ctrl+L' },
  { id: 'hitboxes', group: 'Viewport', label: 'Show / hide hitboxes', def: 'H' },
  { id: 'follow', group: 'Viewport', label: 'Follow both characters on / off', def: 'Alt+F' },
  { id: 'sounds', group: 'Viewport', label: 'Sounds on / off', def: 'Alt+M' },
  { id: 'dummy', group: 'Viewport', label: 'Show / hide the dummy', def: 'Alt+D' },
  { id: 'bgNext', group: 'Viewport', label: 'Next viewport background', def: 'Alt+B' },
  { id: 'flyForward', group: 'Flying (over the viewport)', label: 'Fly forward', def: 'W', scope: 'view' },
  { id: 'flyLeft', group: 'Flying (over the viewport)', label: 'Fly left', def: 'A', scope: 'view' },
  { id: 'flyBack', group: 'Flying (over the viewport)', label: 'Fly back', def: 'S', scope: 'view' },
  { id: 'flyRight', group: 'Flying (over the viewport)', label: 'Fly right', def: 'D', scope: 'view' },
  { id: 'flyDown', group: 'Flying (over the viewport)', label: 'Fly down', def: 'Q', scope: 'view' },
  { id: 'flyUp', group: 'Flying (over the viewport)', label: 'Fly up', def: 'E', scope: 'view' },
  { id: 'frameYou', group: 'Flying (over the viewport)', label: 'Frame your character', def: 'F', scope: 'view' },

  // Camera
  { id: 'camFree', group: 'Camera', label: 'Camera: Free', def: 'Alt+1' },
  { id: 'camAuto', group: 'Camera', label: 'Camera: Auto', def: 'Alt+2' },
  { id: 'camPath', group: 'Camera', label: 'Camera: Recorded path', def: 'Alt+3' },
  { id: 'skillCamera', group: 'Camera', label: 'The skill’s own camera on / off', def: 'Alt+C' },
  { id: 'resetCamera', group: 'Camera', label: 'Reset the camera', def: 'Alt+R' },
  { id: 'resetCameraSettings', group: 'Camera', label: 'Reset camera settings', def: 'Alt+Shift+R' },
  { id: 'cameraKey', group: 'Camera', label: 'Add a key (camera path, or the open animation)', def: 'K' },
  { id: 'recordCamera', group: 'Camera', label: 'Record a camera take', def: 'Alt+K' },
  { id: 'clearCameraKeys', group: 'Camera', label: 'Clear camera keys', def: 'Alt+Shift+K' },
  { id: 'cameraPath', group: 'Camera', label: 'Edit the camera path for video', def: 'Alt+P' },

  // Animate
  { id: 'animate', group: 'Animate', label: 'Animate the picked VISUAL (keyframes)', def: 'Ctrl+K' },
  { id: 'animateCamera', group: 'Animate', label: 'New camera animation', def: 'Ctrl+Shift+K' },
  { id: 'animateVisual', group: 'Animate', label: 'New visual animation', def: 'Ctrl+Alt+K' },
  { id: 'impactFrame', group: 'Animate', label: 'Insert an impact frame at the playhead', def: 'Ctrl+Shift+I' },
  { id: 'animMove', group: 'Animate', label: 'Animator gizmo: move the key', def: 'G', scope: 'animator' },
  { id: 'animTurn', group: 'Animate', label: 'Animator gizmo: turn the key', def: 'R', scope: 'animator' },
  { id: 'animGraph', group: 'Animate', label: 'Animator: keys / easing graph', def: 'Tab', scope: 'animator' },

  // Capture
  { id: 'screenshot', group: 'Capture', label: 'Export: a picture (screenshot)', def: 'F12' },
  { id: 'quickShot', group: 'Capture', label: 'Quick screenshot to Pictures', def: 'Shift+F12' },
  { id: 'exportVideo', group: 'Capture', label: 'Export: video', def: 'Ctrl+F12' },

  // Workspace
  { id: 'resetLayout', group: 'Workspace', label: 'Reset the panel layout', def: 'Ctrl+Alt+R' },
  { id: 'saveLayout', group: 'Workspace', label: 'Save the panel layout', def: 'Ctrl+Alt+S' },
  { id: 'startOnLaunch', group: 'Workspace', label: 'Start screen on launch on / off', def: '' },

  // The Meter Maker
  { id: 'barMove', group: 'Meter Maker', label: 'Tool: Move', def: 'V', scope: 'bars' },
  { id: 'barBrush', group: 'Meter Maker', label: 'Tool: Brush', def: 'B', scope: 'bars' },
  { id: 'barEraser', group: 'Meter Maker', label: 'Tool: Eraser', def: 'E', scope: 'bars' },
  { id: 'barShape', group: 'Meter Maker', label: 'Tool: Shape', def: 'U', scope: 'bars' },
  { id: 'barText', group: 'Meter Maker', label: 'Tool: Text', def: 'T', scope: 'bars' },
  { id: 'barFit', group: 'Meter Maker', label: 'Fit the canvas in view', def: 'Ctrl+0', scope: 'bars' },
  { id: 'barPrevStep', group: 'Meter Maker', label: 'Previous step', def: ',', scope: 'bars' },
  { id: 'barNextStep', group: 'Meter Maker', label: 'Next step', def: '.', scope: 'bars' },
];

export const GROUPS = [...new Set(ACTIONS.map((a) => a.group))];

// ─── Keyboard layouts ───────────────────────────────────────────────────
// Shortcuts are written by the letter a key types, so on another layout the
// defaults move to keep their place: flying is WASD on the keys where QWERTY
// has them (ZQSD on AZERTY), and a shortcut whose key needs Shift there
// gets one that doesn't. Asked on the first launch (src/ui/tour.jsx) and in
// Settings → Keyboard shortcuts; the shortcuts changed by hand stay.
export const LAYOUTS = [
  { id: 'qwerty', label: 'QWERTY', hint: 'US, UK, and most keyboards' },
  { id: 'azerty', label: 'AZERTY', hint: 'French, Belgian' },
  { id: 'qwertz', label: 'QWERTZ', hint: 'German, Swiss, Central European' },
  { id: 'dvorak', label: 'Dvorak', hint: 'Dvorak Simplified' },
  { id: 'colemak', label: 'Colemak', hint: 'Colemak and Colemak-DH' },
];
const LAYOUT_DEFAULTS = {
  qwerty: {},
  azerty: {
    flyForward: 'Z',
    flyLeft: 'Q',
    flyDown: 'A',
    // "/" and "." need Shift on AZERTY.
    keybinds: 'Ctrl+F2',
    barNextStep: ';',
  },
  qwertz: {
    // "/" and "=" need Shift on QWERTZ; "+" doesn't.
    keybinds: 'Ctrl+F2',
    zoomIn: 'Ctrl++',
  },
  dvorak: {
    flyForward: ',',
    flyLeft: 'A',
    flyBack: 'O',
    flyRight: 'E',
    flyDown: "'",
    flyUp: '.',
    // Dvorak's "." and "," fly, so the Meter Maker's steps go on the brackets' keys.
    barPrevStep: '[',
    barNextStep: ']',
  },
  colemak: {
    flyBack: 'R',
    flyRight: 'S',
    flyUp: 'F',
    frameYou: 'T',
    // R flies back, so the animator turns on the key where QWERTY has R.
    animTurn: 'P',
  },
};
const LAYOUT_KEY = 'arayashiki-keyboard';
const readLayout = () => {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
};
/** The layout picked, or null before anyone's said (QWERTY's defaults meanwhile). */
export const layoutChosen = signal(readLayout());
export const layout = { get value() { return LAYOUT_DEFAULTS[layoutChosen.value] ? layoutChosen.value : 'qwerty'; } };
export function setLayout(id) {
  if (!LAYOUT_DEFAULTS[id]) return;
  layoutChosen.value = id;
  try {
    localStorage.setItem(LAYOUT_KEY, id);
  } catch {
    // not kept
  }
}

/**
 * The layout this keyboard seems to be, where the browser can tell
 * (Chrome's and WebView2's keyboard map): what the keys at Q, Y, S type.
 */
export async function detectLayout() {
  try {
    const map = await navigator.keyboard?.getLayoutMap?.();
    if (!map) return null;
    const at = (code) => String(map.get(code) ?? '').toLowerCase();
    if (at('KeyQ') === 'a' && at('KeyW') === 'z') return 'azerty';
    if (at('KeyY') === 'z') return 'qwertz';
    if (at('KeyQ') === "'" || at('KeyS') === 'o') return 'dvorak';
    if (at('KeyS') === 'r' && at('KeyD') === 's') return 'colemak';
    return 'qwerty';
  } catch {
    return null;
  }
}

/** An action's default on the layout in use. */
export const defaultOf = (id) => LAYOUT_DEFAULTS[layout.value]?.[id] ?? ACTIONS.find((a) => a.id === id)?.def ?? '';

const KEY = 'arayashiki-keybinds';
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
/** Only the changed ones: { action: combo } ("" for none). */
export const custom = signal(load());
effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom.value));
  } catch {
    // not kept
  }
});

export const bindingOf = (id) => {
  void layoutChosen.value; // re-read when the layout changes
  return custom.value[id] ?? defaultOf(id);
};

const NAMES = { ' ': 'Space', Del: 'Delete', Esc: 'Escape' };
/** A key's own name: "W", "Space", "ArrowUp", "1" (by its place, whatever Shift makes it). */
export function keyName(event) {
  if (/^Digit\d$/.test(event.code ?? '')) return event.code.slice(5);
  let key = NAMES[event.key] ?? event.key;
  if (key?.length === 1) key = key.toUpperCase();
  return key;
}
/** The combo a key press makes: "Ctrl+Shift+S". */
export function comboOf(event) {
  const key = keyName(event);
  if (!key || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(key)) return null;
  const mods = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

const inScope = (a, scope) =>
  scope === 'skills'
    ? !a.scope || a.scope === 'everywhere' || a.scope === 'both'
    : scope === 'bars'
      ? a.scope === 'bars' || a.scope === 'both' || a.scope === 'everywhere'
      : a.scope === scope;

/**
 * The action a key press is bound to in `scope` ('skills', 'bars',
 * 'animator'), if any. Shift-arrows count as their arrow (10 frames).
 */
export function actionOf(event, scope = 'skills') {
  const combo = comboOf(event);
  if (!combo) return null;
  const plain = combo.replace(/^Shift\+(Arrow\w+)$/, '$1');
  for (const a of ACTIONS) {
    if (!inScope(a, scope)) continue;
    const b = bindingOf(a.id);
    if (b && (b === combo || b === plain)) return a.id;
  }
  // Backspace deletes too, as it always has.
  if (combo === 'Backspace' && bindingOf('delete') === 'Delete') return 'delete';
  return null;
}

/** The fly action a key (held, Shift or not) is bound to: flying ignores Shift, which slows it. */
export function flyActionOf(event) {
  const key = keyName(event);
  for (const a of ACTIONS) if (a.scope === 'view' && bindingOf(a.id) === key) return a.id;
  return null;
}

// Where an action's keys are heard: two actions on the same keys clash
// when they're heard in the same place (flying and the animator's keys are
// heard in the Skill Builder).
const HEARD = { everywhere: ['skills', 'bars'], both: ['skills', 'bars'], bars: ['bars'], view: ['skills'], animator: ['skills'] };
const heardIn = (a) => HEARD[a.scope] ?? ['skills'];
const overlap = (a, b) => heardIn(a).some((w) => heardIn(b).includes(w));

/** The other actions bound to the same keys as `id`, where both can be heard. */
export function clashesOf(id) {
  const b = bindingOf(id);
  const me = ACTIONS.find((a) => a.id === id);
  if (!b || !me) return [];
  return ACTIONS.filter((a) => a.id !== id && bindingOf(a.id) === b && overlap(me, a));
}

/** Binds `id` to `combo`: null puts its default back, "" leaves it without one. */
export function rebind(id, combo) {
  const def = defaultOf(id);
  const { [id]: _old, ...rest } = custom.value;
  custom.value = combo == null || combo === def ? rest : { ...rest, [id]: combo };
}
export const resetBinds = () => (custom.value = {});
