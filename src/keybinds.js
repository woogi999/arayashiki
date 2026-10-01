// The app's keyboard shortcuts (the ones marked `everywhere` work in both
// workspaces and over the start screen), rebindable in Settings and kept
// in this browser's storage. A binding is written like "Ctrl+Shift+S",
// "Space", "Delete" or "Alt+ArrowUp".
import { signal, effect } from '@preact/signals';

export const ACTIONS = [
  { id: 'search', label: 'Search everything (commands, skills, nodes, settings, help)', def: 'Ctrl+Space', everywhere: true },
  { id: 'assistant', label: 'AI assistant', def: 'Ctrl+J', everywhere: true },
  { id: 'manual', label: 'User manual', def: 'F1', everywhere: true },
  { id: 'play', label: 'Play / pause', def: 'Space' },
  { id: 'restart', label: 'Play from the start', def: 'Shift+Space' },
  { id: 'frameBack', label: 'Back a frame', def: 'ArrowLeft' },
  { id: 'frameNext', label: 'Forward a frame', def: 'ArrowRight' },
  { id: 'delete', label: 'Delete (in the area you last clicked)', def: 'Delete' },
  { id: 'duplicate', label: 'Duplicate node', def: 'Ctrl+D' },
  { id: 'selectAll', label: 'Select all (the nodes, or the skills in the Outliner)', def: 'Ctrl+A' },
  { id: 'undo', label: 'Undo', def: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', def: 'Ctrl+Y' },
  { id: 'save', label: 'Save', def: 'Ctrl+S' },
  { id: 'saveAs', label: 'Save As', def: 'Ctrl+Shift+S' },
  { id: 'open', label: 'Open a .txt', def: 'Ctrl+O' },
  { id: 'import', label: 'Import a code', def: 'Ctrl+I' },
  { id: 'export', label: 'Export: code for JJS', def: 'Ctrl+E' },
  { id: 'templates', label: 'Templates', def: 'Ctrl+T' },
  { id: 'new', label: 'New Character', def: 'Ctrl+N' },
  { id: 'nodeUp', label: 'Previous node', def: 'ArrowUp' },
  { id: 'nodeDown', label: 'Next node', def: 'ArrowDown' },
  { id: 'moveUp', label: 'Move node up', def: 'Alt+ArrowUp' },
  { id: 'moveDown', label: 'Move node down', def: 'Alt+ArrowDown' },
  { id: 'hitboxes', label: 'Show / hide hitboxes', def: 'H' },
  { id: 'cameraKey', label: 'Add a key (camera path, or the open animation)', def: 'K' },
  { id: 'animate', label: 'Animate the picked VISUAL (keyframes)', def: 'Ctrl+K' },
  { id: 'screenshot', label: 'Export: a picture (screenshot)', def: 'F12' },
  { id: 'quickShot', label: 'Quick screenshot to Pictures', def: 'Shift+F12' },
  { id: 'exportVideo', label: 'Export: video', def: 'Ctrl+F12' },
];

const KEY = 'arayashiki-keybinds';
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
/** Only the changed ones: { action: combo }. */
export const custom = signal(load());
effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom.value));
  } catch {
    // not kept
  }
});

export const bindingOf = (id) => custom.value[id] ?? ACTIONS.find((a) => a.id === id)?.def ?? '';

const NAMES = { ' ': 'Space', Del: 'Delete', Esc: 'Escape' };
/** The combo a key press makes: "Ctrl+Shift+S". */
export function comboOf(event) {
  let key = NAMES[event.key] ?? event.key;
  if (key.length === 1) key = key.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  const mods = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

/** The action a key press is bound to, if any. Shift-arrows count as their arrow (10 frames). */
export function actionOf(event) {
  const combo = comboOf(event);
  if (!combo) return null;
  const plain = combo.replace(/^Shift\+(Arrow\w+)$/, '$1');
  for (const a of ACTIONS) {
    const b = bindingOf(a.id);
    if (b === combo || b === plain) return a.id;
  }
  // Backspace deletes too, as it always has.
  if (combo === 'Backspace' && bindingOf('delete') === 'Delete') return 'delete';
  return null;
}

export function rebind(id, combo) {
  const def = ACTIONS.find((a) => a.id === id)?.def;
  const { [id]: _old, ...rest } = custom.value;
  custom.value = combo && combo !== def ? { ...rest, [id]: combo } : rest;
}
export const resetBinds = () => (custom.value = {});
