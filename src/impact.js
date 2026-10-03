// Impact frames: the few frames of a hit that anime and manga draw as stark
// ink, focus lines and smeared silhouettes, made procedurally from the
// moment itself.
//
// The characters are rendered from the skill's camera at that moment
// (scene.silhouettes), so the picture lines up with what JJS will show; it
// goes into the skill as Overlay VISUALs (an image over the whole screen),
// one after another for a moment each. That only lines up while a Camera
// block holds the view: without one, every player's camera is somewhere
// else (the dialog says so).
//
// Everything is drawn from fields around the hit (polar: an angle and a
// distance from it), so the lines all rush to one point the way an
// animator's would:
//
//   focus lines   集中線: tapered ink wedges from the frame's edge, stopping
//                 short of the hit at a ragged edge
//   streaks       thin lines around the hit, each with its own width, start
//                 and end: what smears, edges and textures are cut from
//   smear         a silhouette pulled away from the hit (a radial trail),
//                 cut into streaks: the body drawn as speed
//
// A look is a set of options, drawn by one renderer; the presets are just
// sets of them, so "Edit the look" edits the same knobs.

/** Everything a look can set. Colours are #rrggbb. */
export const DEFAULTS = {
  who: 'both', // whose silhouettes: 'both', 'user', 'target', 'none'
  frames: 2, // how many pictures, one after another
  frameTime: 0.05, // how long each shows, in seconds
  background: '#ffffff',
  background2: null, // a second colour: a radial gradient out from the hit
  ink: '#000000', // the silhouettes and lines
  accent: '#ffffff', // rim light, flare, cracks
  // The bodies: 'solid' (flat ink), 'smear' (streaks trailing from the hit),
  // 'edges' (soft streaks off their edges, like graphite), 'rim' (dark, lit
  // round the side facing the hit), 'glow' (glowing streaky outlines).
  body: 'solid',
  smear: 60, // how far a smear or edge streak trails, in % of the frame's height
  breakup: 50, // how much of a smeared body the streaks cut away, 0–100
  userColour: '#ff9a3c', // 'glow': yours
  targetColour: '#3ce6ff', // 'glow': the enemy's
  outline: 0, // px of `accent` round the silhouettes ('solid')
  inkTone: 0, // dot size the silhouettes are drawn in (0: solid)
  focusLines: 0, // how many focus lines
  lineWidth: 6, // their widest, in px at the frame's edge
  clear: 22, // the clear space round the hit, in % of the frame's height
  lineColour: null, // null: the ink
  streaks: 0, // streak texture over the background, 0–100
  flare: 0, // a burst of light at the hit, 0–100
  halftone: 0, // dot size (px) of a screentone over the background
  cracks: 0, // how many cracks running out from the hit
  zoom: 0, // a zoom blur out from the hit over everything, 0–100
  posterize: 0, // ink levels it's cut down to after (0: off, 2–6)
  split: 0, // px of cyan / magenta offset (a misregistered print)
  glitch: 0, // how many slices shifted sideways
  scanlines: false,
  grain: 0, // 0–100
  vignette: 0, // 0–100
  alternate: false, // every other frame inverted
  fadeOut: false, // the last frame fades out
  seed: 1,
};

/** The looks to start from, each { id, label, hint, options }. */
export const PRESETS = [
  {
    id: 'smear',
    label: 'Ink smear',
    hint: 'Manga ink: bodies torn into streaks rushing out of the hit, heavy focus lines.',
    options: { body: 'smear', smear: 55, breakup: 55, focusLines: 220, lineWidth: 9, clear: 24, frames: 2 },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    hint: 'Soft pencil streaks off the bodies’ edges, a white-hot core.',
    options: { body: 'edges', ink: '#3a3a3a', smear: 45, flare: 70, focusLines: 120, lineWidth: 3, clear: 30, lineColour: '#7a7a7a', grain: 18, frames: 2 },
  },
  {
    id: 'zoom',
    label: 'Zoom ink',
    hint: 'Everything blown outward in a zoom blur and cut into grey ink.',
    options: {
      background: '#e6e6e6',
      background2: '#6a6a6a',
      ink: '#101010',
      body: 'smear',
      smear: 30,
      breakup: 60,
      streaks: 55,
      focusLines: 160,
      lineWidth: 5,
      lineColour: '#f5f5f5',
      zoom: 55,
      posterize: 4,
      grain: 30,
      frames: 2,
    },
  },
  {
    id: 'neon',
    label: 'Neon streak',
    hint: 'Black, the fighters as glowing streaky outlines, one colour each.',
    options: { background: '#000000', ink: '#000000', body: 'glow', smear: 25, streaks: 25, lineColour: '#1a2a3a', focusLines: 0, frames: 2 },
  },
  {
    id: 'crimson',
    label: 'Crimson rim',
    hint: 'Red, streaked; dark bodies rim-lit by a white flare at the hit.',
    options: { background: '#b3202c', background2: '#3b0508', ink: '#120304', accent: '#ffffff', body: 'rim', flare: 85, streaks: 60, vignette: 35, frames: 2 },
  },
  {
    id: 'blackflash',
    label: 'Black flash',
    hint: 'Black and red sparks cracking out of the hit, inverted between frames.',
    options: {
      background: '#000000',
      background2: '#2a0006',
      ink: '#000000',
      accent: '#ff1f3d',
      body: 'rim',
      flare: 60,
      cracks: 14,
      focusLines: 140,
      lineWidth: 4,
      lineColour: '#ff1f3d',
      split: 6,
      frames: 3,
      alternate: true,
      frameTime: 0.04,
    },
  },
  {
    id: 'screentone',
    label: 'Screentone',
    hint: 'Manga page: dotted tone, smeared ink, cracks and focus lines.',
    options: { body: 'smear', smear: 35, breakup: 40, halftone: 5, focusLines: 160, lineWidth: 6, cracks: 6, vignette: 45, grain: 15, frames: 2 },
  },
  { id: 'basic', label: 'Basic', hint: 'Black silhouettes on white: the classic.', options: { frames: 1 } },
  { id: 'negative', label: 'Negative', hint: 'White on black.', options: { background: '#000000', ink: '#ffffff', frames: 1 } },
  { id: 'flicker', label: 'Flicker', hint: 'Black on white, then inverted: a strobe.', options: { body: 'smear', smear: 30, focusLines: 120, frames: 3, alternate: true, frameTime: 0.04 } },
];

export const optionsOf = (id) => ({ ...DEFAULTS, ...(PRESETS.find((p) => p.id === id)?.options ?? {}) });

// A small seeded random, so the same look draws the same pictures.
function random(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(String(hex ?? '#000000').slice(i, i + 2), 16) || 0);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The silhouettes the look wants, as one mask (0–255 a pixel). */
function chosenMask(data, who) {
  const { masks, width: w, height: h } = data;
  const out = new Uint8ClampedArray(w * h);
  const take = who === 'both' ? ['user', 'target'] : who === 'none' ? [] : [who];
  for (const k of take) {
    const m = masks?.[k];
    if (m) for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], m[i]);
  }
  return out;
}

/** A field (0–1 a pixel) as a canvas, `colour` where it's set. */
function fieldCanvas(field, w, h, colour, alpha = 1) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const [r, gg, b] = rgbOf(colour);
  for (let i = 0; i < field.length; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = clamp01(field[i]) * 255 * alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ─── Streaks: thin lines round the hit ───────────────────────────────────

/**
 * A field of streaks round `point`: `count` lines round the circle, each
 * with its own width, place, strength, start and length (`start` and
 * `length` are [min, max] shares of `far`), tapered at both ends. Two
 * layers of lines, so they don't look evenly spaced. Returns a function
 * (angle, distance) → 0–1.
 */
function streaks(rnd, count, { far, start = [0, 0.45], length = [0.25, 1.15], thin = 1 }) {
  const layers = [count, Math.round(count * 2.37)].map((n) => {
    const lines = Array.from({ length: n }, () => {
      const r0 = start[0] + rnd() * (start[1] - start[0]);
      return {
        c: 0.2 + rnd() * 0.6,
        w: (0.12 + rnd() ** 2 * 0.75) * thin,
        r0,
        r1: r0 + length[0] + rnd() * (length[1] - length[0]),
        k: 0.35 + rnd() * 0.65,
      };
    });
    return { n, lines };
  });
  return (angle, dist) => {
    const rn = dist / far;
    let v = 0;
    for (const { n, lines } of layers) {
      const u = (angle / (Math.PI * 2) + 0.5) * n;
      const i = Math.floor(u) % n;
      const L = lines[i < 0 ? i + n : i];
      const d = Math.abs(u - Math.floor(u) - L.c) / (L.w / 2);
      if (d >= 1 || rn < L.r0 || rn > L.r1) continue;
      const along = Math.min(1, (rn - L.r0) / 0.04, (L.r1 - rn) / 0.15);
      v = Math.max(v, (1 - d * d) * along * L.k);
    }
    return v;
  };
}

/**
 * The silhouettes pulled away from the hit: each pixel takes the strongest
 * mask on its way back toward the hit, fading over `length` px. `inward`
 * pulls toward it as well.
 */
function smearOf(mask, w, h, point, length, inward = 0) {
  const out = new Float32Array(w * h);
  // A sample every 2 px or so, so thin edges aren't stepped over.
  const steps = Math.max(4, Math.min(90, Math.round(length / 2)));
  const [px, py] = point;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] > 127) {
        out[i] = 1;
        continue;
      }
      const dx = x - px;
      const dy = y - py;
      const r = Math.hypot(dx, dy) || 1;
      const ux = dx / r;
      const uy = dy / r;
      let v = 0;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const s = t * Math.min(length, r);
        const qx = Math.round(x - ux * s);
        const qy = Math.round(y - uy * s);
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && mask[qy * w + qx] > 127) {
          v = 1 - t;
          break;
        }
      }
      if (inward && v < 1)
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const s = t * length * inward;
          const qx = Math.round(x + ux * s);
          const qy = Math.round(y + uy * s);
          if (qx >= 0 && qy >= 0 && qx < w && qy < h && mask[qy * w + qx] > 127) {
            v = Math.max(v, (1 - t) * 0.8);
            break;
          }
        }
      out[i] = v;
    }
  return out;
}

/** The mask's edge, `band` px wide (inside it), as 0/1. */
function edgeOf(mask, w, h, band) {
  const out = new Uint8Array(w * h);
  const d = Math.max(1, Math.round(band));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x] > 127);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!(mask[y * w + x] > 127)) continue;
      if (!at(x - d, y) || !at(x + d, y) || !at(x, y - d) || !at(x, y + d) || !at(x - d, y - d) || !at(x + d, y + d)) out[y * w + x] = 1;
    }
  return out;
}

// ─── The parts of a frame ───────────────────────────────────────────────

function dots(g, w, h, size, colour, point, falloff = true) {
  g.fillStyle = colour;
  const step = size * 1.6;
  const reach = Math.hypot(w, h);
  for (let y = 0; y < h + step; y += step)
    for (let x = (Math.round(y / step) % 2) * (step / 2); x < w + step; x += step) {
      const d = falloff ? 1 - Math.min(1, Math.hypot(x - point[0], y - point[1]) / (reach * 0.6)) : 1;
      const r = (size / 2) * (falloff ? 0.25 + 0.75 * d : 1);
      if (r < 0.3) continue;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
}

/**
 * Focus lines: tapered wedges from beyond the frame's edge, each stopping
 * at its own distance from the hit, so the clear space round it is ragged.
 * Some lines come in bunches, as drawn ones do.
 */
function focusLines(g, w, h, point, o, rnd) {
  const far = Math.hypot(w, h) * 1.1;
  const clear = (o.clear / 100) * h;
  g.fillStyle = o.lineColour ?? o.ink;
  const turn = rnd() * Math.PI * 2;
  for (let i = 0; i < o.focusLines; i++) {
    // Even round the circle, nudged about, so some bunch up and some part.
    const angle = turn + ((i + (rnd() - 0.5) * 1.6) / o.focusLines) * Math.PI * 2;
    const inner = clear * (0.75 + rnd() ** 1.5 * 1.6);
    const width = Math.max(0.6, o.lineWidth * (rnd() < 0.2 ? 1.2 + rnd() : 0.15 + rnd() ** 2 * 0.9));
    const half = width / 2 / far;
    const ex = point[0] + Math.cos(angle) * far;
    const ey = point[1] + Math.sin(angle) * far;
    const nx = -Math.sin(angle) * width * 0.5;
    const ny = Math.cos(angle) * width * 0.5;
    g.beginPath();
    g.moveTo(point[0] + Math.cos(angle + half) * inner, point[1] + Math.sin(angle + half) * inner);
    g.lineTo(ex + nx, ey + ny);
    g.lineTo(ex - nx, ey - ny);
    g.closePath();
    g.fill();
  }
}

/** A burst of light at the hit: a glow, and thin rays. */
function flareAt(g, w, h, point, o, rnd) {
  const k = o.flare / 100;
  const R = Math.min(w, h) * (0.25 + 0.35 * k);
  const glow = g.createRadialGradient(point[0], point[1], 0, point[0], point[1], R);
  const [r, gg, b] = rgbOf(o.accent);
  glow.addColorStop(0, `rgba(${r},${gg},${b},${0.95 * k + 0.05})`);
  glow.addColorStop(0.25, `rgba(${r},${gg},${b},${0.6 * k})`);
  glow.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // Thin rays, each fading out along its length, softened.
  g.save();
  g.filter = `blur(${Math.max(1, h / 300)}px)`;
  const rays = 24 + Math.round(rnd() * 16);
  for (let i = 0; i < rays; i++) {
    const a = rnd() * Math.PI * 2;
    const len = R * (0.6 + rnd() ** 2 * 2.6);
    const wd = 0.002 + rnd() ** 2 * 0.012;
    const ray = g.createRadialGradient(point[0], point[1], 0, point[0], point[1], len);
    ray.addColorStop(0, `rgba(${r},${gg},${b},${0.9 * k})`);
    ray.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(point[0], point[1]);
    g.lineTo(point[0] + Math.cos(a - wd) * len, point[1] + Math.sin(a - wd) * len);
    g.lineTo(point[0] + Math.cos(a + wd) * len, point[1] + Math.sin(a + wd) * len);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function cracksFrom(g, w, h, point, o, rnd) {
  g.save();
  g.strokeStyle = o.accent;
  g.lineCap = 'round';
  g.lineJoin = 'miter';
  g.shadowColor = o.accent;
  g.shadowBlur = Math.max(4, h / 60);
  const crack = (x, y, a, len, width, depth) => {
    let px = x;
    let py = y;
    const steps = 14;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(px, py);
    for (let s = 0; s < steps; s++) {
      // Jagged: a sharp kink now and then, kept heading outward.
      a += (rnd() - 0.5) * (rnd() < 0.3 ? 1.6 : 0.5);
      px += Math.cos(a) * (len / steps);
      py += Math.sin(a) * (len / steps);
      g.lineTo(px, py);
      width *= 0.93;
      g.lineWidth = width;
      if (depth < 2 && rnd() < 0.14) {
        g.stroke();
        crack(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.5), len * 0.5, width * 0.6, depth + 1);
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(px, py);
      }
    }
    g.stroke();
  };
  const reach = Math.max(w, h) * 0.55;
  const base = Math.max(1.5, h / 220);
  for (let i = 0; i < o.cracks; i++) crack(point[0], point[1], rnd() * Math.PI * 2, reach * (0.5 + rnd() * 0.6), base * (1 + rnd() * 1.5), 0);
  g.restore();
}

/** Blends `colour` into the picture by a field (0–1 a pixel). */
function paintField(g, w, h, field, colour, mode = 'normal') {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const [r, gg, b] = rgbOf(colour);
  for (let i = 0; i < field.length; i++) {
    const a = clamp01(field[i]);
    if (!a) continue;
    const j = i * 4;
    if (mode === 'add') {
      d[j] = Math.min(255, d[j] + r * a);
      d[j + 1] = Math.min(255, d[j + 1] + gg * a);
      d[j + 2] = Math.min(255, d[j + 2] + b * a);
    } else {
      d[j] += (r - d[j]) * a;
      d[j + 1] += (gg - d[j + 1]) * a;
      d[j + 2] += (b - d[j + 2]) * a;
    }
  }
  g.putImageData(img, 0, 0);
}

/** The bodies, in the look's style. */
function drawBodies(g, data, o, point, rnd) {
  const { width: w, height: h } = data;
  const mask = chosenMask(data, o.who);
  if (!mask.some((v) => v)) return;
  const far = Math.hypot(w, h);
  const length = (o.smear / 100) * h;
  const angleAt = (i) => Math.atan2(Math.floor(i / w) - point[1], (i % w) - point[0]);
  const distAt = (i) => Math.hypot((i % w) - point[0], Math.floor(i / w) - point[1]);

  if (o.body === 'smear') {
    // Solid where the body is, cut by a few gaps along the lines; past it,
    // the trail kept only where a streak runs.
    // Each streak runs as far as its strength lets it: next to the body
    // nearly all of them, far out only the strongest, so they taper away.
    const trail = smearOf(mask, w, h, point, length, 0.3);
    const lines = streaks(rnd, 300, { far, start: [0, 0], length: [3, 3], thin: 1.15 });
    const gaps = streaks(rnd, 160, { far, start: [0, 0.3], length: [0.05, 0.4], thin: 0.45 });
    const cut = o.breakup / 100;
    const ink = new Float32Array(w * h);
    for (let i = 0; i < ink.length; i++) {
      const t = trail[i];
      if (!t) continue;
      const a = angleAt(i);
      const r = distAt(i);
      if (mask[i] > 127) ink[i] = 1 - smooth(0.25, 0.45, gaps(a, r) * cut * 1.4);
      else ink[i] = smooth(0.02, 0.12, lines(a, r) - (1 - t) * 0.95);
    }
    paintField(g, w, h, ink, o.ink);
  } else if (o.body === 'edges') {
    // Soft streaks off the edges, both ways, like a pencil dragged outward.
    const edge = edgeOf(mask, w, h, Math.max(2, h / 180));
    const trail = smearOf(edge.map((v) => v * 255), w, h, point, length, 0.6);
    const lines = streaks(rnd, 260, { far, start: [0, 0], length: [3, 3], thin: 1 });
    const ink = new Float32Array(w * h);
    for (let i = 0; i < ink.length; i++) {
      const t = trail[i];
      if (!t) continue;
      const v = smooth(0, 0.35, lines(angleAt(i), distAt(i)) - (1 - t) * 0.8);
      ink[i] = Math.min(1, edge[i] * 0.85 + v * 0.75 + (mask[i] > 127 ? 0.08 : 0));
    }
    const soft = fieldCanvas(ink, w, h, o.ink);
    g.filter = 'blur(1.2px)';
    g.drawImage(soft, 0, 0);
    g.filter = 'none';
    g.drawImage(soft, 0, 0);
  } else if (o.body === 'rim') {
    // Dark bodies, lit along the side that faces the hit.
    const ink = new Float32Array(w * h);
    const rim = new Float32Array(w * h);
    const band = Math.max(3, h / 110);
    for (let i = 0; i < ink.length; i++) {
      if (!(mask[i] > 127)) continue;
      ink[i] = 1;
      const x = i % w;
      const y = Math.floor(i / w);
      const r = distAt(i) || 1;
      // Out of the body a little way toward the hit: this pixel is lit.
      const qx = Math.round(x - ((x - point[0]) / r) * band);
      const qy = Math.round(y - ((y - point[1]) / r) * band);
      if (qx < 0 || qy < 0 || qx >= w || qy >= h || !(mask[qy * w + qx] > 127)) rim[i] = 1;
    }
    paintField(g, w, h, ink, o.ink);
    const lit = fieldCanvas(rim, w, h, o.accent);
    g.globalCompositeOperation = 'lighter';
    g.filter = `blur(${Math.max(2, h / 90)}px)`;
    g.drawImage(lit, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    g.drawImage(lit, 0, 0);
  } else if (o.body === 'glow') {
    // Streaky outlines in each fighter's colour, glowing.
    for (const who of o.who === 'both' ? ['user', 'target'] : o.who === 'none' ? [] : [o.who]) {
      const m = data.masks?.[who];
      if (!m) continue;
      const edge = edgeOf(m, w, h, Math.max(2, h / 200));
      const field = new Float32Array(w * h);
      // The edge, broken into dashes along it, with streaks of light
      // trailing off it away from the hit.
      const lines = streaks(rnd, 240, { far, start: [0, 0], length: [3, 3], thin: 0.9 });
      const dashes = streaks(rnd, 500, { far, start: [0, 0], length: [3, 3], thin: 2.2 });
      const trail = smearOf(edge.map((v) => v * 255), w, h, point, length, 0.35);
      for (let i = 0; i < field.length; i++) {
        const t = trail[i];
        if (!t) continue;
        const a = angleAt(i);
        const r = distAt(i);
        if (edge[i]) field[i] = 0.45 + 0.55 * smooth(0.1, 0.4, dashes(a, r));
        else field[i] = smooth(0.02, 0.2, lines(a, r) - (1 - t) * 0.9) * 0.85;
      }
      const lit = fieldCanvas(field, w, h, who === 'user' ? o.userColour : o.targetColour);
      g.globalCompositeOperation = 'lighter';
      g.filter = `blur(${Math.max(3, h / 70)}px)`;
      g.drawImage(lit, 0, 0);
      g.filter = 'none';
      g.drawImage(lit, 0, 0);
      g.drawImage(fieldCanvas(edge, w, h, '#ffffff', 0.55), 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
  } else {
    if (o.outline > 0) {
      const ring = fieldCanvas(Float32Array.from(mask, (v) => (v > 127 ? 1 : 0)), w, h, o.accent);
      const r = o.outline;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        g.drawImage(ring, Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    const ink = fieldCanvas(Float32Array.from(mask, (v) => (v > 127 ? 1 : 0)), w, h, o.ink);
    if (o.inkTone > 0) {
      // Drawn in dots of the ink, clipped to the silhouettes.
      const tone = canvas(w, h);
      const tg = tone.getContext('2d');
      dots(tg, w, h, o.inkTone, o.ink, point, false);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(ink, 0, 0);
      g.drawImage(tone, 0, 0);
    } else g.drawImage(ink, 0, 0);
  }
  if (o.split > 0) {
    g.globalCompositeOperation = 'multiply';
    const solid = Float32Array.from(mask, (v) => (v > 127 ? 1 : 0));
    g.drawImage(fieldCanvas(solid, w, h, '#00e5ff'), -o.split, 0);
    g.drawImage(fieldCanvas(solid, w, h, '#ff2bd6'), o.split, o.split * 0.3);
    g.globalCompositeOperation = 'source-over';
  }
}

/** A zoom blur out from the hit: the picture laid over itself, larger each time. */
function zoomBlur(c, point, amount) {
  const g = c.getContext('2d');
  const copy = canvas(c.width, c.height);
  copy.getContext('2d').drawImage(c, 0, 0);
  const passes = 14;
  const spread = (amount / 100) * 0.35;
  for (let k = 1; k <= passes; k++) {
    const s = 1 + (k / passes) * spread;
    g.globalAlpha = 1 / (k + 1);
    g.setTransform(s, 0, 0, s, point[0] * (1 - s), point[1] * (1 - s));
    g.drawImage(copy, 0, 0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
}

/** Cuts the picture's lightness to a few levels of ink (keeping its hue). */
function posterized(g, w, h, levels) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const n = Math.max(2, Math.round(levels)) - 1;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const q = Math.round(l * n) / n;
    const k = l > 0.001 ? q / l : 0;
    d[i] = Math.min(255, d[i] * k);
    d[i + 1] = Math.min(255, d[i + 1] * k);
    d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  g.putImageData(img, 0, 0);
}

/**
 * Draws picture `frame` (0…frames-1) of a look over `data`
 * ({ masks, point, width, height } from scene.silhouettes); a canvas.
 * Each frame has its own lines, so a few frames in a row flicker the way
 * hand-drawn ones do.
 */
export function drawImpact(options, data, frame = 0) {
  const o = { ...DEFAULTS, ...options };
  const { width: w, height: h } = data;
  const point = data.point ?? [w / 2, h / 2];
  const rnd = random(o.seed * 97 + frame * 13 + 1);
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });

  // The background: a colour, or a gradient out from the hit.
  if (o.background2) {
    const grad = g.createRadialGradient(point[0], point[1], 0, point[0], point[1], Math.hypot(w, h) * 0.75);
    grad.addColorStop(0, o.background);
    grad.addColorStop(1, o.background2);
    g.fillStyle = grad;
  } else g.fillStyle = o.background;
  g.fillRect(0, 0, w, h);

  // Streaks over the background, darker away from the hit.
  if (o.streaks > 0) {
    const far = Math.hypot(w, h);
    const lines = streaks(rnd, 320, { far, start: [0.05, 0.5], length: [0.3, 1.4], thin: 0.9 });
    const field = new Float32Array(w * h);
    const k = o.streaks / 100;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = x - point[0];
        const dy = y - point[1];
        const r = Math.hypot(dx, dy);
        field[y * w + x] = lines(Math.atan2(dy, dx), r) * k * (0.35 + 0.65 * Math.min(1, r / (far * 0.5)));
      }
    paintField(g, w, h, field, o.lineColour ?? o.ink);
  }
  if (o.halftone > 0) {
    g.globalAlpha = 0.55;
    dots(g, w, h, o.halftone, o.ink, point);
    g.globalAlpha = 1;
  }
  if (o.flare > 0) flareAt(g, w, h, point, o, rnd);
  if (o.focusLines > 0) focusLines(g, w, h, point, o, rnd);
  if (o.cracks > 0) cracksFrom(g, w, h, point, o, rnd);
  drawBodies(g, data, o, point, rnd);
  if (o.flare > 0 && o.body !== 'rim') {
    // The core of the light stays over everything.
    const [r, gg, b] = rgbOf(o.accent);
    const core = g.createRadialGradient(point[0], point[1], 0, point[0], point[1], Math.min(w, h) * 0.08 * (0.5 + o.flare / 100));
    core.addColorStop(0, `rgba(${r},${gg},${b},${o.flare / 100})`);
    core.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = core;
    g.fillRect(0, 0, w, h);
  }
  if (o.zoom > 0) zoomBlur(c, point, o.zoom);
  if (o.posterize >= 2) posterized(g, w, h, o.posterize);

  // Slices of the picture torn sideways.
  if (o.glitch > 0) {
    const copy = canvas(w, h);
    copy.getContext('2d').drawImage(c, 0, 0);
    for (let i = 0; i < o.glitch; i++) {
      const y = rnd() * h;
      const bh = 4 + rnd() * h * 0.06;
      const dx = (rnd() - 0.5) * w * 0.12;
      g.drawImage(copy, 0, y, w, bh, dx, y, w, bh);
    }
  }
  if (o.scanlines) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
  }
  if (o.grain > 0) {
    const img = g.getImageData(0, 0, w, h);
    const k = (o.grain / 100) * 90;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - 0.5) * k;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }
  if (o.vignette > 0) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${o.vignette / 100})`);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
  // Every other frame inverted, for a strobe.
  if (o.alternate && frame % 2 === 1) {
    const copy = canvas(w, h);
    copy.getContext('2d').drawImage(c, 0, 0);
    g.clearRect(0, 0, w, h);
    g.filter = 'invert(1)';
    g.drawImage(copy, 0, 0);
    g.filter = 'none';
  }
  return c;
}

/** The look's pictures, one canvas a frame. */
export const drawFrames = (options, data) =>
  Array.from({ length: Math.max(1, Math.min(8, Math.round(options.frames ?? 1))) }, (_, i) => drawImpact(options, data, i));

/**
 * The Overlay VISUALs that show the pictures (image IDs, in order), each
 * `frameTime` after the last, as { at, node }: `at` seconds from the first.
 */
export function impactNodes(ids, options) {
  const o = { ...DEFAULTS, ...options };
  const time = Math.max(1 / 60, Number(o.frameTime) || 0.05);
  return ids.map((id, i) => ({
    at: Math.round(i * time * 1000) / 1000,
    node: {
      K_NAME: 'VISUAL',
      EFFECT: 'Overlay',
      TEXTURE: Number(id),
      SIZE: 1,
      'ALT SIZE': 1,
      OPACITY: 0,
      'ALT OPACITY': o.fadeOut && i === ids.length - 1 ? 1 : 0,
      COLOR: '255, 255, 255',
      'ALT COLOR': '255, 255, 255',
      TIME: Math.round(time * 1000) / 1000,
      'EASING STYLE': 'Linear',
      'EASING DIRECTION': 'In',
      'BODY PART': 'HumanoidRootPart',
      'VISUAL TAG': 'Impact',
    },
  }));
}

/** Whether a Camera block (on you) has the view at t: when an impact frame lines up. */
export function cameraAtTime(run, t) {
  return Boolean(
    run?.events.some(
      (e) => e.kind === 'VISUAL' && e.who === 'user' && e.node?.EFFECT === 'Camera' && e.t <= t + 1e-6 && t < e.t + (Number(e.node.TIME) || 1) - 1e-6,
    ),
  );
}
