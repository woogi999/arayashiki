// Checking for a newer Arayashiki on GitHub (src-tauri/src/updates.rs): a
// quiet check a few seconds after launch (Settings → Updates turns it off),
// the "Update" button in the top bar when a newer release is out, and the
// Updates window that downloads and runs the installer.
import { signal, computed } from '@preact/signals';
import * as S from './store.js';
import { checkForUpdate, downloadUpdate, installUpdate, isDesktop } from './platform.js';

const KEY = 'arayashiki-updates';
function load() {
  try {
    return { auto: true, skipped: null, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}) };
  } catch {
    return { auto: true, skipped: null };
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
 * Where the update is: 'idle', 'checking', 'error', 'downloading',
 * 'downloaded' or 'installing', with { error, got, total, path }.
 */
export const updateState = signal({ phase: 'idle' });

/** A newer release the user hasn't skipped: the top bar shows it. */
export const pendingUpdate = computed(() => {
  const r = release.value;
  return r?.newer && r.latest !== updatePrefs.value.skipped ? r : null;
});

export async function checkNow() {
  if (updateState.peek().phase === 'checking') return release.peek();
  updateState.value = { phase: 'checking' };
  try {
    release.value = await checkForUpdate();
    updateState.value = { phase: 'idle' };
  } catch (e) {
    updateState.value = { phase: 'error', error: String(e?.message ?? e) };
  }
  return release.peek();
}

/** Opens the Updates window and checks (again) unless a download is under way. */
export function openUpdates() {
  S.dialog.value = 'updates';
  if (!['downloading', 'downloaded', 'installing'].includes(updateState.peek().phase)) checkNow();
}

export const skipVersion = (version) => setUpdatePrefs({ skipped: version });

export async function download() {
  const installer = release.peek()?.installer;
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

export async function install() {
  const { path } = updateState.peek();
  updateState.value = { phase: 'installing', path };
  try {
    await installUpdate(path); // the app closes
  } catch (e) {
    updateState.value = { phase: 'error', error: String(e?.message ?? e) };
  }
}

/** At launch: one quiet check, a few seconds in, if it's on. */
export function checkOnLaunch() {
  if (!isDesktop || !updatePrefs.peek().auto) return;
  setTimeout(() => {
    checkForUpdate()
      .then((r) => (release.value = r))
      .catch(() => {}); // offline: say nothing
  }, 4000);
}
