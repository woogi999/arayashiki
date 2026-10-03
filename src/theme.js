// Themes. The interface is drawn from tokens (src/styles/tokens.css): its
// named colours and a grey ramp (--g0 … --g100, each grey the styles use,
// named by its lightness). A theme reshapes the ramp (light turns it over,
// midnight tints it blue…) and sets the named colours, so every surface
// follows without each stylesheet knowing about themes. A custom theme is a
// preset with colours of your own over it; it can be copied as JSON and
// pasted in on another PC.
//
// `theme` is a signal, so canvas drawing that reads the tokens (the frame
// meter) redraws when it changes.
import { effect, signal } from '@preact/signals';
import { appearance, setAppearance } from './prefs.js';

// The named greys, as the dark theme has them (tokens.css): a theme moves
// them along its ramp unless it sets them itself.
const GREYS = {
  '--ground': 11,
  '--area': 22,
  '--head': 28,
  '--panel': 32,
  '--panel-head': 38,
  '--field': 15,
  '--widget': 46,
  '--widget-hover': 57,
  '--widget-on': 76,
  '--row-hover': 33,
  '--row-selected': 51,
  '--line': 38,
  '--line-strong': 54,
  '--text': 226,
  '--text-2': 168,
  '--text-3': 138,
  '--sel-line': 242,
  '--focus': 154,
};

const hex = (v) => `#${[0, 1, 2].map(() => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const hsl = (h, s, l) => `hsl(${h} ${Math.max(0, s).toFixed(1)}% ${Math.min(100, Math.max(0, l)).toFixed(1)}%)`;

/** The themes to pick from: how each greys (L 0–100 → a colour) and its own colours. */
export const THEMES = [
  {
    id: 'dark',
    label: 'Dark',
    hint: 'Blender’s greys: the default.',
    scheme: 'dark',
    grey: (L) => hex((L / 100) * 255),
    tokens: {},
  },
  {
    id: 'light',
    label: 'Light',
    hint: 'Light greys and dark text, for bright rooms.',
    scheme: 'light',
    grey: (L) => hex(((97 - L * 0.9) / 100) * 255),
    tokens: {
      '--field': '#ffffff',
      '--play': '#8fcc00',
      '--play-ink': '#132000',
      '--hit': '#d93038',
      '--hit-soft': 'rgb(217 48 56 / 14%)',
      '--hit-text': '#b81f27',
      '--you': '#1d6fd6',
      '--dummy': '#c26a0c',
      '--warn': '#9a6d12',
      '--scrim': 'rgb(0 0 0 / 28%)',
      '--kind-chip-ink': '#111111',
      '--fg-rgb': '0 0 0',
      '--fg-rgb-c': '0, 0, 0',
      '--bg-rgb': '245 245 245',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    hint: 'Dark, with a cold blue cast.',
    scheme: 'dark',
    grey: (L) => hsl(222, 24 * (1 - L / 100), L * 0.96 + 1.5),
    tokens: { '--play': '#7cd4ff', '--play-ink': '#06202e' },
  },
  {
    id: 'oled',
    label: 'Black',
    hint: 'True black surfaces, for OLED screens.',
    scheme: 'dark',
    grey: (L) => hex(((L < 26 ? L * 0.45 : L) / 100) * 255),
    tokens: { '--ground': '#000000', '--area': '#000000', '--field': '#000000' },
  },
  {
    id: 'warm',
    label: 'Warm',
    hint: 'Dark, warmed like old paper under a lamp.',
    scheme: 'dark',
    grey: (L) => hsl(32, 16 * (1 - L / 120), L),
    tokens: { '--play': '#f2b84b', '--play-ink': '#2a1a02' },
  },
  {
    id: 'contrast',
    label: 'High contrast',
    hint: 'Black surfaces, bright lines and text.',
    scheme: 'dark',
    grey: (L) => hex(((L < 30 ? L * 0.4 : Math.min(100, L * 1.15)) / 100) * 255),
    tokens: { '--line': '#6a6a6a', '--line-strong': '#9a9a9a', '--text': '#ffffff', '--text-2': '#e6e6e6', '--text-3': '#c8c8c8', '--focus': '#ffffff' },
  },
];

/** The colours a custom theme can set over its preset, with what they're for. */
export const CUSTOM_KEYS = [
  ['--ground', 'Window'],
  ['--area', 'Editors'],
  ['--panel', 'Panels'],
  ['--field', 'Fields'],
  ['--text', 'Text'],
  ['--text-2', 'Quieter text'],
  ['--line', 'Lines'],
  ['--play', 'Accent (playback)'],
  ['--you', 'You'],
  ['--dummy', 'The dummy'],
  ['--hit', 'Hits'],
];

export const theme = signal(appearance.peek().theme ?? 'dark');

const applied = new Set();
function apply(id, custom) {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(name);
  applied.clear();
  const base = THEMES.find((t) => t.id === (id === 'custom' ? custom?.base : id)) ?? THEMES[0];
  const set = (name, value) => {
    root.style.setProperty(name, value);
    applied.add(name);
  };
  if (base.id !== 'dark') {
    for (let L = 0; L <= 100; L++) set(`--g${L}`, base.grey(L));
    for (const [name, v] of Object.entries(GREYS)) set(name, base.grey((v / 255) * 100));
  }
  for (const [name, value] of Object.entries(base.tokens)) set(name, value);
  if (id === 'custom') for (const [name, value] of Object.entries(custom?.tokens ?? {})) if (value) set(name, value);
  root.dataset.theme = id === 'custom' ? `custom-${base.id}` : base.id;
  root.style.colorScheme = base.scheme;
  applied.add('color-scheme');
}

effect(() => {
  const a = appearance.value;
  apply(a.theme ?? 'dark', a.customTheme);
  theme.value = `${a.theme ?? 'dark'}:${JSON.stringify(a.customTheme ?? {})}`;
});

export const setTheme = (id) => setAppearance({ theme: id });

/** Makes the custom theme from a preset (or changes one of its colours). */
export function setCustom(patch) {
  const was = appearance.peek().customTheme ?? { base: appearance.peek().theme && appearance.peek().theme !== 'custom' ? appearance.peek().theme : 'dark', tokens: {} };
  setAppearance({ theme: 'custom', customTheme: { ...was, ...patch, tokens: { ...was.tokens, ...(patch.tokens ?? {}) } } });
}

/** The colour a token has now (for the custom editor's swatches), as #rrggbb. */
export function tokenNow(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  const probe = document.createElement('span');
  probe.style.color = v;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  probe.remove();
  return `#${rgb.slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The custom theme as text to share, and back. */
export const themeJson = () => JSON.stringify({ arayashikiTheme: 1, ...(appearance.peek().customTheme ?? { base: appearance.peek().theme ?? 'dark', tokens: {} }) }, null, 1);
export function loadThemeJson(text) {
  const t = JSON.parse(text);
  if (!t || typeof t !== 'object' || !THEMES.some((x) => x.id === t.base)) throw new Error('That isn’t an Arayashiki theme.');
  const tokens = Object.fromEntries(Object.entries(t.tokens ?? {}).filter(([k, v]) => /^--[a-z0-9-]+$/.test(k) && typeof v === 'string' && v.length < 60));
  setAppearance({ theme: 'custom', customTheme: { base: t.base, tokens } });
}
