// Appearance settings, kept in this browser's storage: the UI's scale and
// the viewport's background.
import { signal, effect } from '@preact/signals';

const KEY = 'arayashiki-appearance';
const DEFAULTS = { scale: 1, viewportBg: '#202020' };
function load() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
export const appearance = signal(load());
export const BACKGROUNDS = [
  ['#202020', 'Blender grey'],
  ['#0b0b0b', 'Black'],
  ['#8fb8de', 'Roblox sky'],
  ['#3d3d3d', 'Studio grey'],
];
effect(() => {
  const a = appearance.value;
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // not kept
  }
  document.documentElement.style.zoom = String(a.scale);
});
export const setAppearance = (patch) => (appearance.value = { ...appearance.value, ...patch });
