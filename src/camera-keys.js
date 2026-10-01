// Recorded camera keys ({ t, p, q, fov }) as plain data, without three.js,
// so the store can keep them without loading the 3D view.

/** Puts a key in a list (sorted by time), replacing one within a frame of it. */
export function withKey(keys, key) {
  const out = keys.filter((k) => Math.abs(k.t - key.t) > 1 / 120);
  out.push(key);
  return out.sort((a, b) => a.t - b.t);
}

/** Thins a live take (a key every frame) to one every `step` seconds, keeping the ends. */
export function thin(keys, step = 1 / 30) {
  const out = [];
  for (const k of keys) if (!out.length || k.t - out.at(-1).t >= step - 1e-6) out.push(k);
  if (keys.length && out.at(-1) !== keys.at(-1)) out.push(keys.at(-1));
  return out;
}
