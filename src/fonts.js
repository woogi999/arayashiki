// Fonts for the Meter Maker's text (src/barmaker/): the ones built in
// (draw.js FONTS), the ones installed on this PC, and any added from Google
// Fonts. Fonts are drawn on a canvas by name, so a PC font just works; a
// Google one is fetched (src-tauri/src/fonts.rs on the desktop, straight
// from Google in the browser), registered with the FontFace API, and kept in
// the list of added fonts, so a design using it draws with it next time.
import { signal } from '@preact/signals';
import { isDesktop } from './platform.js';

const call = async (name, args) => (await import('@tauri-apps/api/core')).invoke(name, args);

// ─── This PC ────────────────────────────────────────────────────────────

/** The families installed here, or null until read. */
export const systemFonts = signal(null);
export async function loadSystemFonts() {
  if (systemFonts.peek()) return systemFonts.peek();
  let list = [];
  try {
    if (isDesktop) list = await call('fonts_system');
    // In a browser, the Local Font Access API (it asks first).
    else if (window.queryLocalFonts) list = [...new Set((await window.queryLocalFonts()).map((f) => f.family))];
  } catch {
    list = [];
  }
  systemFonts.value = list.sort((a, b) => a.localeCompare(b));
  return systemFonts.peek();
}

// ─── Google Fonts ───────────────────────────────────────────────────────

// For the browser preview, which can't read Google's catalogue: the popular ones.
const POPULAR = [
  ['Roboto', 'Sans Serif'],
  ['Open Sans', 'Sans Serif'],
  ['Montserrat', 'Sans Serif'],
  ['Poppins', 'Sans Serif'],
  ['Inter', 'Sans Serif'],
  ['Oswald', 'Sans Serif'],
  ['Bebas Neue', 'Display'],
  ['Anton', 'Sans Serif'],
  ['Bangers', 'Display'],
  ['Permanent Marker', 'Handwriting'],
  ['Press Start 2P', 'Display'],
  ['Russo One', 'Sans Serif'],
  ['Black Ops One', 'Display'],
  ['Orbitron', 'Sans Serif'],
  ['Audiowide', 'Display'],
  ['Bungee', 'Display'],
  ['Creepster', 'Display'],
  ['Luckiest Guy', 'Display'],
  ['Rubik Mono One', 'Sans Serif'],
  ['Teko', 'Sans Serif'],
  ['Playfair Display', 'Serif'],
  ['Merriweather', 'Serif'],
  ['Cinzel', 'Serif'],
  ['Noto Serif JP', 'Serif'],
  ['Noto Sans JP', 'Sans Serif'],
  ['Zen Antique', 'Serif'],
  ['Shippori Mincho', 'Serif'],
  ['Dela Gothic One', 'Display'],
  ['Pacifico', 'Handwriting'],
  ['Caveat', 'Handwriting'],
  ['Dancing Script', 'Handwriting'],
  ['Rock Salt', 'Handwriting'],
  ['Fira Code', 'Monospace'],
  ['JetBrains Mono', 'Monospace'],
  ['Space Mono', 'Monospace'],
  ['VT323', 'Monospace'],
].map(([family, category], i) => ({ family, category, popularity: i, weights: ['400'] }));

/** Google's families ({ family, category, popularity, weights }), or null until fetched. */
export const googleFonts = signal(null);
export const googleError = signal(null);
export async function loadGoogleFonts() {
  if (googleFonts.peek()) return googleFonts.peek();
  try {
    googleFonts.value = isDesktop ? await call('fonts_google_list') : POPULAR;
    googleError.value = null;
  } catch (e) {
    googleError.value = String(e?.message ?? e);
    googleFonts.value = POPULAR;
  }
  return googleFonts.peek();
}

// The browser fetches Google's stylesheet itself (it allows that), and the
// file it points at.
async function browserFile(family, weight, text) {
  const q = new URLSearchParams({ family: `${family}:wght@${weight}`, display: 'swap' });
  if (text) q.set('text', text);
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${q}`)).text();
  const blocks = css.split('@font-face');
  const pick =
    blocks.find((b, i) => /\/\*\s*latin\s*\*\//.test(blocks[i - 1] ?? '')) ?? blocks.find((b) => b.includes('url('));
  const url = pick?.match(/url\(([^)]+)\)/)?.[1];
  if (!url) throw new Error('Google Fonts sent no font file.');
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

const fileOf = (family, weight, text = null) =>
  isDesktop
    ? call('fonts_google_file', { family, weight: String(weight), italic: false, text })
    : browserFile(family, weight, text);

const loaded = new Map(); // "family|weight" → Promise
async function register(name, family, weight, text) {
  const key = `${name}|${weight}`;
  if (!loaded.has(key))
    loaded.set(
      key,
      (async () => {
        const bytes = await fileOf(family, weight, text);
        const face = new FontFace(name, bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes), {
          weight: String(weight),
        });
        await face.load();
        document.fonts.add(face);
      })().catch((e) => {
        loaded.delete(key);
        throw e;
      }),
    );
  return loaded.get(key);
}

/**
 * A family drawn in its own letters for a preview: the letters of `text`
 * only (a few KB), under a name of its own. Resolves the CSS family to use.
 */
export async function previewFont(family, text) {
  const name = `Preview ${family}`;
  await register(name, family, 400, text);
  return name;
}

// ─── Added fonts ────────────────────────────────────────────────────────

const KEY = 'arayashiki-fonts';
const readAdded = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') ?? [];
  } catch {
    return [];
  }
};
/** Google families added: [{ family, category }]. */
export const addedFonts = signal(readAdded());
/** Bumped when a font finishes loading, so drawings redraw with it. */
export const fontsVersion = signal(0);

function keep() {
  try {
    localStorage.setItem(KEY, JSON.stringify(addedFonts.peek()));
  } catch {
    // not kept
  }
}

/** Loads an added family (regular and bold, where it has bold). */
export async function ensureFont(family) {
  const f = addedFonts.peek().find((x) => x.family === family);
  if (!f) return;
  // Regular it must have; bold where it has one (and not where it doesn't).
  await register(family, family, '400');
  if ((f.weights ?? []).includes('700')) await register(family, family, '700').catch(() => {});
  fontsVersion.value++;
}

/** Adds a Google family and loads it. */
export async function addFont({ family, category, weights }) {
  if (!addedFonts.peek().some((x) => x.family === family)) {
    addedFonts.value = [...addedFonts.peek(), { family, category, weights: weights?.filter((w) => /^\d+$/.test(w)) }];
    keep();
  }
  await ensureFont(family);
}

export function removeFont(family) {
  addedFonts.value = addedFonts.peek().filter((x) => x.family !== family);
  keep();
}

/** Every added family loaded (before drawing or exporting with them). */
export const ensureAll = () => Promise.allSettled(addedFonts.peek().map((f) => ensureFont(f.family)));
