// The desktop shell's services (src-tauri/src/lib.rs), called from the UI.
// Outside Tauri (the plain Vite dev server, used for layout work) each one
// degrades quietly: no Roblox pictures or sounds, and files go through the
// browser's own pickers.

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let api = null;
const tauri = () =>
  (api ??= Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(([core, event]) => ({
    invoke: core.invoke,
    listen: event.listen,
  })));

// ─── Roblox assets (src-tauri/src/roblox.rs) ────────────────────────────
// fetch() tries every route (the app's copy, Roblox's own cache on this PC,
// the signed-in account, asset delivery, the CDN, thumbnails) and
// says what the asset is and where it came from. The bytes come back as a
// blob URL, so pictures and sounds load as same-origin.

const fetched = new Map(); // id → Promise<{ info, url } | null>

const validId = (id) => /^\d{1,20}$/.test(String(id ?? '').trim()) && String(id).trim() !== '0';

/** Everything about an asset, and a URL for its file: { info, url } or null. */
export function robloxAsset(id) {
  if (!isDesktop || !validId(id)) return Promise.resolve(null);
  const key = String(id).trim();
  if (!fetched.has(key))
    fetched.set(
      key,
      (async () => {
        const { invoke } = await tauri();
        const info = await invoke('asset_fetch', { id: key });
        if (!info.file) return { info, url: null };
        const bytes = await invoke('asset_read', { id: info.id });
        return { info, url: URL.createObjectURL(new Blob([bytes], { type: info.mime ?? '' })) };
      })().catch((error) => ({ info: { id: key, error: String(error) }, url: null })),
    );
  return fetched.get(key);
}

/** A Roblox image ID (or a decal's) to a picture URL, or null. */
export async function robloxImage(id) {
  // The Vite dev server's stand-in (vite.config.js), in the plain browser.
  if (!isDesktop && import.meta.env?.DEV && validId(id)) return `/rbx-image/${String(id).trim()}`;
  const got = await robloxAsset(id);
  return got?.url && got.info.mime?.startsWith('image/') && got.info.mime !== 'image/ktx' ? got.url : null;
}

/** A Roblox sound as a URL to play, or null when Roblox won't hand it over. */
export async function robloxSound(id) {
  const got = await robloxAsset(id);
  return got?.url && got.info.mime?.startsWith('audio/') ? got.url : null;
}

/** A Roblox sound's file bytes (an ArrayBuffer), or null when Roblox won't hand it over. */
export async function robloxSoundBytes(id) {
  if (!isDesktop || !validId(id)) return null;
  const got = await robloxAsset(id);
  if (!got?.url || !got.info.mime?.startsWith('audio/')) return null;
  return (await tauri()).invoke('asset_read', { id: got.info.id });
}

/** A Roblox mesh's .mesh bytes (an ArrayBuffer), or null. */
export async function robloxMesh(id) {
  if (!isDesktop || !validId(id)) return null;
  const got = await robloxAsset(id);
  if (got?.info.mime !== 'application/x-roblox-mesh') return null;
  return (await tauri()).invoke('asset_read', { id: got.info.id });
}

/** A model's own bytes (an accessory's .rbxm), or null. */
export async function robloxModel(id) {
  if (!isDesktop || !validId(id)) return null;
  try {
    return await (await tauri()).invoke('model_fetch', { id: String(id).trim() });
  } catch {
    return null;
  }
}

/** An asset's name, type and creator, without fetching it. */
export async function robloxDescribe(id) {
  if (!isDesktop || !validId(id)) return null;
  try {
    return await (await tauri()).invoke('asset_describe', { id: String(id).trim() });
  } catch {
    return null;
  }
}

// ─── Signing in with Roblox (src-tauri/src/account.rs) ─────────────────

const call = async (name, args) => (await tauri()).invoke(name, args);

/** { signedIn, user: { id, name, username }, waiting } */
export const accountStatus = () => (isDesktop ? call('account_status') : Promise.resolve(null));
/** Opens Roblox's login page in its own window; resolves with the user once signed in. */
export const signIn = () => call('account_sign_in');
export const cancelSignIn = () => call('account_cancel');
export async function signOut() {
  await call('account_sign_out');
  fetched.clear();
}
export const refreshAccount = () => (isDesktop ? call('account_refresh').catch(() => null) : Promise.resolve(null));
/** A user's avatar (the signed-in user's by default): colours, clothing, pictures. */
export const robloxAvatar = (userId) => call('roblox_avatar', { userId: userId ?? null });

// Details for a command that takes raw bytes, as a header (they can't ride
// in the body with the bytes).
const meta = (value) => ({ headers: { 'x-meta': encodeURIComponent(JSON.stringify(value)) } });

/**
 * Uploads a PNG (a Blob) as a decal on the signed-in account. Resolves
 * { decalId, imageId, moderation }: imageId is what a TEXTURE wants.
 */
export async function uploadDecal(blob, { name, description }) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return (await tauri()).invoke('roblox_upload', bytes, meta({ name, description }));
}

/** The Roblox cache index. */
export async function assetsStatus() {
  if (!isDesktop) return null;
  return (await tauri()).invoke('assets_status');
}

export const reindexRobloxCache = async () => (await tauri()).invoke('assets_reindex');

export async function clearAssets() {
  fetched.clear();
  return (await tauri()).invoke('assets_clear');
}

/** Asks for a .txt; resolves { text, name } or null. */
export async function openCodeFile() {
  if (isDesktop) return (await tauri()).invoke('open_code_file');
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.txt,text/plain' });
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { text: (await file.text()).trim(), name: file.name.replace(/\.txt$/i, '') } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Saves a code as a .txt; resolves where it went (or null if cancelled). */
export async function saveCodeFile(name, text) {
  if (isDesktop) return (await tauri()).invoke('save_code_file', { name, text });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  link.download = `${name || 'moveset'}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  return link.download;
}

/** Reads a .txt the app opened or saved before: { text, name, file }. */
export async function readCodeFile(path) {
  if (!isDesktop) throw new Error('Recent files open in the desktop app');
  return (await tauri()).invoke('read_code_file', { path });
}

/** Writes a code back to a .txt the app opened or saved before. */
export async function writeCodeFile(path, text) {
  if (!isDesktop) throw new Error('Only the desktop app writes files in place');
  return (await tauri()).invoke('write_code_file', { path, text });
}

/**
 * Closing the window: the desktop shell asks first (`handler()`), and
 * `quitApp()` then closes it for good. In the browser, the page's own
 * "leave site?" prompt does it (see app.jsx).
 */
export async function onCloseRequest(handler) {
  if (!isDesktop) return;
  const { listen } = await tauri();
  await listen('close-requested', () => handler());
}
export async function quitApp() {
  if (isDesktop) await (await tauri()).invoke('quit_app');
}

/**
 * Saves bytes (a Blob) where the user picks; resolves the path, or null if
 * cancelled. `label` names the file type in the dialog.
 */
export async function saveBlob(blob, name, label = 'File', where = 'ask') {
  if (isDesktop) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return (await tauri()).invoke('save_bytes', bytes, meta({ name, label, folder: where === 'ask' ? null : where }));
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  return name;
}

/**
 * A file written in pieces as it's made (a video): asks where to save it
 * (`where` 'ask'), or puts it in Videos\Arayashiki ('videos') or
 * Pictures\Arayashiki ('pictures') without asking. Resolves null if the
 * dialog was cancelled, else { path, write(bytes, position), close() → path,
 * abort() } (abort deletes the half-written file). Desktop only.
 */
export async function openFileStream(name, label = 'File', where = 'ask') {
  const { invoke } = await tauri();
  const opened = await invoke('stream_create', { name, label, folder: where === 'ask' ? null : where });
  if (!opened) return null;
  const [id, path] = opened;
  // One write at a time, in the order they're asked for.
  let queue = Promise.resolve();
  return {
    path,
    write(bytes, position) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      queue = queue.then(() => invoke('stream_write', data, meta({ id, position })));
      return queue;
    },
    async close() {
      await queue;
      return invoke('stream_close', { id });
    },
    async abort() {
      await queue.catch(() => {});
      return invoke('stream_abort', { id }).catch(() => {});
    },
  };
}

/**
 * A new folder for an image sequence (named `name`, in a folder the user
 * picks, or in Videos\Arayashiki with `where` 'videos'): { path,
 * write(fileName, bytes) }, or null if the dialog was cancelled. In the
 * browser preview, each file downloads.
 */
export async function openFolder(name, where = 'ask') {
  if (!isDesktop)
    return {
      path: name,
      write: (file, bytes) => saveBlob(new Blob([bytes]), file),
    };
  const { invoke } = await tauri();
  const made = await invoke('folder_create', { name, folder: where === 'ask' ? null : where });
  if (!made) return null;
  const [id, path] = made;
  return {
    path,
    write: (file, bytes) => invoke('folder_write', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), meta({ id, name: file })),
  };
}

/** Shows a file in Explorer, selected. */
export async function revealFile(path) {
  if (isDesktop) return (await tauri()).invoke('reveal_file', { path });
}

/** Asks for a text file; resolves { name, text } or null. */
export async function openTextFile(label, extensions) {
  if (isDesktop) {
    const got = await (await tauri()).invoke('open_text', { label, extensions });
    return got ? { name: got[0], text: got[1] } : null;
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: extensions.map((e) => `.${e}`).join(','),
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Movesets arriving from outside (`sbs open`, the MCP server's open_in_app,
 * a .txt opened with the app): the one the app was launched with, then any
 * a later launch hands over. `handler({ text, name })`.
 */
export async function onOpenRequest(handler) {
  if (!isDesktop) return;
  const { invoke, listen } = await tauri();
  const first = await invoke('take_pending_open').catch(() => null);
  if (first) handler(first);
  await listen('open-code', (event) => handler(event.payload));
}

// ─── Updates (src-tauri/src/updates.rs) ─────────────────────────────────

const REPO = 'woogi999/arayashiki';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const newer = (a, b) => {
  const parts = (v) => String(v).replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/**
 * The latest GitHub release against this build: { current, latest, newer,
 * name, notes, page, published, installer: { name, size, url } | null }.
 */
export async function checkForUpdate() {
  if (isDesktop) return call('update_check');
  // The browser preview asks GitHub itself.
  const current = __APP_VERSION__;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (res.status === 404) return { current, latest: current, newer: false, notes: '', page: RELEASES_PAGE, installer: null };
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const r = await res.json();
  const latest = String(r.tag_name ?? '').replace(/^v/i, '');
  const exe = r.assets?.find((a) => /-setup\.exe$/i.test(a.name));
  return {
    current,
    latest,
    newer: newer(latest, current),
    name: r.name || r.tag_name,
    notes: r.body ?? '',
    page: r.html_url,
    published: r.published_at,
    installer: exe ? { name: exe.name, size: exe.size, url: exe.browser_download_url } : null,
  };
}

/** Downloads an installer; `onProgress({ got, total })`. Resolves its path. */
export async function downloadUpdate(url, onProgress) {
  const { Channel } = await import('@tauri-apps/api/core');
  const progress = new Channel();
  progress.onmessage = onProgress;
  return call('update_download', { url, progress });
}

/** Starts the downloaded installer; the app closes. */
export const installUpdate = (path) => call('update_install', { path });

/** Opens an https link in the default browser. */
export async function openExternal(url) {
  if (isDesktop) return call('open_url', { url });
  window.open(url, '_blank', 'noopener');
}
