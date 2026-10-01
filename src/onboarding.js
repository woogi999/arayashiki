// The quick start (src/ui/tour.jsx): the first launch asks whether to take
// a short tour of the window; Help → Quick tour (or the start screen) runs
// it again any time.
import * as S from './store.js';

const KEY = 'arayashiki-onboarding';

/** True until the welcome has been answered once (tour taken or skipped). */
export function firstRun() {
  try {
    return !localStorage.getItem(KEY);
  } catch {
    return false; // no storage: don't ask on every launch
  }
}

export function markOnboarded(how) {
  try {
    localStorage.setItem(KEY, how);
  } catch {
    // not kept
  }
}

/** The tour runs over the Skill Builder, so it goes there first. */
export function startTour() {
  S.workspace.value = 'skills';
  S.showStart.value = false;
  S.dialog.value = 'tour';
}

/** At launch: the welcome, once the window has settled, if nothing else is open. */
export function welcomeOnFirstRun() {
  if (!firstRun()) return;
  setTimeout(() => {
    if (!S.dialog.peek()) S.dialog.value = 'welcome';
  }, 700);
}
