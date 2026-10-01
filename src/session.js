// Whether the last run ended on purpose. The work in progress is always kept
// (IndexedDB, a moment after every change), but it only comes back on the
// next launch when the app didn't close properly: a crash, a power cut, the
// task manager. Closing through the "Save your changes?" dialog, whichever
// button, is a clean exit, and the next launch starts fresh.
//
// The marker lives in localStorage because it has to be written
// synchronously, right before the window goes.
import { isDesktop } from './platform.js';

const KEY = 'arayashiki-session';

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // not kept: the next launch restores, the safe side
  }
}

const last = read();

/**
 * The last run was still marked open: it didn't get to close. `null` (never
 * marked: the first run of a version that keeps this) counts as not
 * crashed but still restores, so an update loses nothing.
 */
export const crashed = last === 'open';

/** Whether to bring the last session's work back. The browser preview has no exit dialog, so it always does. */
export const restoreWork = !isDesktop || last !== 'closed';

write('open');

/** Called on the way out through the exit dialog (or with nothing unsaved). */
export function markClosed() {
  write('closed');
}

/** The window came back (a cancelled exit): still open. */
export function markOpen() {
  write('open');
}
