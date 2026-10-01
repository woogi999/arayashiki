// Keeping Arayashiki up to date from GitHub (src-tauri/src/updates.rs), the
// way game launchers do: a quiet check a few seconds after launch; a newer
// release downloads by itself in the background (the app's own exe, swapped
// in at a restart, or at the next launch if you carry on); and a window says
// so, with what's new and "Restart now". Settings → Updates turns either
// part off. Releases without the exe, or copies that can't replace
// themselves, fall back to downloading and running the installer.
import { signal, computed } from '@preact/signals';
import * as S from './store.js';
import { checkForUpdate, downloadUpdate, installUpdate, isDesktop, restartToUpdate, stageUpdate } from './platform.js';

const KEY = 'arayashiki-updates';
const DEFAULTS = { auto: true, download: true, skipped: null, seen: null };
function load() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
export const updatePrefs = signal(load());
export function setUpdatePrefs(patch) {
  updatePrefs.value = { ...updatePrefs.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(updatePrefs.value));
  } catch {
    // not kept
  }
}

/** The last answer from GitHub (see platform.js checkForUpdate), or null. */
export const release = signal(null);
/**
 * Where the update is: 'idle', 'checking', 'error', 'downloading', 'ready'
 * (downloaded, swapped in at a restart), 'restarting'; or, for the
 * installer, 'downloaded' and 'installing'. With { error, got, total, path }.
 */
export const updateState = signal({ phase: 'idle' });

/** A newer release the user hasn't skipped: the top bar shows it. */
export const pendingUpdate = computed(() => {
  const r = release.value;
  return r?.newer && r.latest !== updatePrefs.value.skipped ? r : null;
});

/** Whether this release can be swapped in (rather than run as an installer). */
export const inPlace = (r = release.peek()) => !!(isDesktop && r?.selfUpdate && r.app);

const busy = () =>
  ['downloading', 'ready', 'restarting', 'downloaded', 'installing'].includes(updateState.peek().phase);

export async function checkNow() {
  if (updateState.peek().phase === 'checking') return release.peek();
  if (busy()) return release.peek();
  updateState.value = { phase: 'checking' };
  try {
    const r = await checkForUpdate();
    release.value = r;
    updateState.value = r.staged && r.staged === r.latest ? { phase: 'ready' } : { phase: 'idle' };
  } catch (e) {
    updateState.value = { phase: 'error', error: String(e?.message ?? e) };
  }
  return release.peek();
}

/** Opens the Updates window and checks (again) unless a download is under way. */
export function openUpdates() {
  S.dialog.value = 'updates';
  if (!busy()) checkNow();
}

export const skipVersion = (version) => setUpdatePrefs({ skipped: version });

/** Fetches the update: the app's exe to swap in, or else the installer. */
export async function download() {
  const r = release.peek();
  if (!r || busy()) return;
  if (inPlace(r)) {
    updateState.value = { phase: 'downloading', got: 0, total: r.app.size };
    try {
      await stageUpdate(r.app.url, r.latest, ({ got, total }) => {
        updateState.value = { phase: 'downloading', got, total: total || r.app.size };
      });
      updateState.value = { phase: 'ready' };
    } catch (e) {
      updateState.value = { phase: 'error', error: String(e?.message ?? e) };
    }
    return;
  }
  const installer = r.installer;
  if (!installer) return;
  updateState.value = { phase: 'downloading', got: 0, total: installer.size };
  try {
    const path = await downloadUpdate(installer.url, ({ got, total }) => {
      updateState.value = { phase: 'downloading', got, total: total || installer.size };
    });
    updateState.value = { phase: 'downloaded', path };
  } catch (e) {
    updateState.value = { phase: 'error', error: String(e?.message ?? e) };
  }
}

/** Swaps the update in and starts it (or runs the installer); the app closes. */
export async function install() {
  const st = updateState.peek();
  updateState.value = { phase: st.phase === 'ready' ? 'restarting' : 'installing', path: st.path };
  try {
    if (st.phase === 'ready') await restartToUpdate();
    else await installUpdate(st.path);
  } catch (e) {
    updateState.value = { phase: 'error', error: String(e?.message ?? e) };
  }
}

/** Runs `then` once nothing else is up: no dialog, no welcome, no tour. */
function whenFree(then) {
  const free = () => !S.dialog.peek() && !document.querySelector('.tw, .tt-card');
  if (free()) return then();
  const timer = setInterval(() => {
    if (!free()) return;
    clearInterval(timer);
    then();
  }, 1000);
}

/** Opens the Updates window when it won't get in the way, once per version. */
function announce(version) {
  if (updatePrefs.peek().seen === version) return;
  whenFree(() => {
    setUpdatePrefs({ seen: version });
    S.dialog.value = 'updates';
  });
}

/** At launch: one quiet check a few seconds in; a newer release downloads and says so. */
export function checkOnLaunch() {
  whatsNewAfterUpdate();
  if (!isDesktop || !updatePrefs.peek().auto) return;
  setTimeout(async () => {
    const r = await checkForUpdate().catch(() => null); // offline: say nothing
    if (!r) return;
    release.value = r;
    if (!r.newer || r.latest === updatePrefs.peek().skipped) return;
    if (r.staged === r.latest) updateState.value = { phase: 'ready' };
    else if (inPlace(r) && updatePrefs.peek().download) await download();
    announce(r.latest);
  }, 4000);
}

/** The first launch of a new version shows what's new in it. */
function whatsNewAfterUpdate() {
  const KEY_RAN = 'arayashiki-last-version';
  let last = null;
  try {
    last = localStorage.getItem(KEY_RAN);
    localStorage.setItem(KEY_RAN, __APP_VERSION__);
  } catch {
    return;
  }
  if (!last || last === __APP_VERSION__) return;
  S.status.value = `Updated to Arayashiki ${__APP_VERSION__}.`;
  setTimeout(() => whenFree(() => (S.dialog.value = 'changelog')), 800);
}
