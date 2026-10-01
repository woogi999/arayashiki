// What the app keeps between runs, in the webview's IndexedDB: the moveset
// being edited (so closing the window loses nothing) and a shelf of saved
// movesets. Every call resolves rather than throws: if storage refuses, the
// app carries on without it.

// The app's first name: kept so saved movesets survive the rename to Arayashiki.
const DB_NAME = 'skill-builder-sim';
const STORE = 'kv';
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage refused'));
  });
}

export const dbGet = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);
export const dbSet = (key, value) =>
  run('readwrite', (s) => s.put(value, key)).then(
    () => true,
    () => false,
  );
export const dbDelete = (key) => run('readwrite', (s) => s.delete(key)).catch(() => {});

async function entries(prefix) {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const values = store.getAll(range);
      tx.oncomplete = () => resolve(values.result);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return [];
  }
}

/**
 * A shelf of saved things under a name ("shelf" for movesets, "bars" for
 * progress bar designs). Each is two records: a small summary (all the list
 * reads) and the thing itself (read only when it's opened).
 */
export function makeShelf(name) {
  return {
    async list() {
      return (await entries(`${name}:meta:`)).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    },
    load: (id) => dbGet(`${name}:data:${id}`),
    async store(id, summary, data) {
      if (!(await dbSet(`${name}:data:${id}`, data))) return false;
      return dbSet(`${name}:meta:${id}`, { ...summary, id, savedAt: Date.now() });
    },
    async forget(id) {
      await dbDelete(`${name}:meta:${id}`);
      await dbDelete(`${name}:data:${id}`);
    },
  };
}

/** Saved movesets. */
export const shelf = makeShelf('shelf');
