// Leaving the app: closing the window asks first when anything is unsaved
// (the "unsaved" dialog, src/ui/dialogs.jsx); every way out of it is a clean
// exit (src/session.js).
import * as S from './store.js';
import * as B from './barmaker/state.js';
import { quitApp } from './platform.js';
import { markClosed } from './session.js';

/** The window's close button (or Alt+F4): ask if there's unsaved work, else go. */
export function requestExit() {
  if (S.dirty.peek() || B.dirty.peek()) S.dialog.value = 'unsaved';
  else exitNow();
}

/** Goes now, cleanly: the next launch starts fresh. */
export function exitNow() {
  markClosed();
  quitApp();
}
