// Impact frames: the few frames of a hit that anime draws as stark
// silhouettes, ink and lines, made procedurally from the moment itself.
//
// The characters are rendered from the skill's camera at that moment
// (scene.silhouettes), so the picture lines up with what JJS will show; it
// goes into the skill as Overlay VISUALs (an image over the whole screen),
// one after another for a moment each. That only lines up while a Camera
// block holds the view: without one, every player's camera is somewhere
// else (the dialog says so).
//
// A look is a set of options, drawn by one renderer; the presets are just
// sets of them, so "Custom" edits the same knobs.

/** Everything a look can set. Colours are #rrggbb. */
export const DEFAULTS = {
  who: 'both', // whose silhouettes: 'both', 'user', 'target', 'none'
  frames: 2, // how many pictures, one after another
  frameTime: 0.05, // how long each shows, in seconds
  background: '#ffffff',
  background2: null, // a second colour: a radial gradient out from the hit
  ink: '#000000', // the silhouettes
  accent: '#ff2a2a',
  outline: 0, // px of `accent` round the silhouettes
  speedLines: 0, // how many lines rushing in to the hit
  lineColour: null, // null: the ink
  burst: false, // a starburst behind the hit
  halftone: 0, // dot size (px) of a screentone over the background
  inkTone: 0, // dot size the silhouettes are drawn in (0: solid)
  cracks: 0, // how many cracks running out from the hit
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
  { id: 'basic', label: 'Basic', hint: 'Black silhouettes on white: the classic.', options: { frames: 1 } },
  {
    id: 'negative',
    label: 'Negative',
    hint: 'White on black.',
    options: { background: '#000000', ink: '#ffffff', frames: 1 },
  },
  {
    id: 'flicker',
    label: 'Flicker',
    hint: 'Black on white, then inverted: a strobe.',
    options: { frames: 3, alternate: true, frameTime: 0.04 },
  },
  {
    id: 'anime',
    label: 'Anime',
    hint: 'Speed lines rushing to the hit, a burst, ink silhouettes.',
    options: { speedLines: 140, burst: true, frames: 2, alternate: true },
  },
  {
    id: 'halftone',
    label: 'Halftone',
    hint: 'Screentone dots, darker toward the hit.',
    options: { halftone: 7, inkTone: 4, frames: 2 },
  },
  {
    id: 'manga',
    label: 'Manga ink',
    hint: 'Ink, screentone and cracks, vignetted.',
    options: { halftone: 5, speedLines: 90, cracks: 7, vignette: 60, grain: 25, frames: 2 },
  },
  {
    id: 'redflash',
    label: 'Red flash',
    hint: 'Red and black, a black-flash crack.',
    options: {
      background: '#c8001e',
      background2: '#000000',
      ink: '#000000',
      accent: '#ffffff',
      outline: 3,
      cracks: 10,
      frames: 3,
      alternate: true,
      frameTime: 0.04,
    },
  },
  {
    id: 'colourful',
    label: 'Colourful',
    hint: 'A loud gradient, white silhouettes outlined.',
    options: {
      background: '#ff3d7f',
      background2: '#3d2bff',
      ink: '#ffffff',
      accent: '#000000',
      outline: 6,
      burst: true,
      speedLines: 60,
      lineColour: '#ffe14d',
      frames: 2,
    },
  },
  {
    id: 'spiderverse',
    label: 'Spider-Verse',
    hint: 'Comic dots, misprinted colour, glitches.',
    options: {
      background: '#fff4d6',
      background2: '#ff3fb4',
      ink: '#111111',
      accent: '#2ee6ff',
      halftone: 6,
      split: 10,
      glitch: 7,
      outline: 3,
      burst: true,
      frames: 3,
      frameTime: 0.04,
    },
  },
  {
    id: 'cursed',
    label: 'Cursed',
    hint: 'Purple and black, cracked.',
    options: {
      background: '#12001f',
      background2: '#7a1dff',
      ink: '#000000',
      accent: '#d6a8ff',
      outline: 4,
      cracks: 12,
      grain: 35,
      vignette: 70,
      frames: 2,
    },
  },
  {
    id: 'glitch',
    label: 'Glitch',
    hint: 'Torn slices and scanlines.',
    options: {
      background: '#000000',
      ink: '#ffffff',
      split: 14,
      glitch: 12,
      scanlines: true,
      grain: 30,
      frames: 3,
      frameTime: 0.035,
    },
  },
  {
    id: 'shatter',
    label: 'Shatter',
    hint: 'The screen cracking out from the hit.',
    options: { background: '#e9eef5', ink: '#0b0b0b', cracks: 22, vignette: 40, frames: 2, alternate: true },
  },
  {
    id: 'sketch',
    label: 'Sketch',
    hint: 'Pencil lines and grain, on paper.',
    options: { background: '#f2ead8', ink: '#2b2622', speedLines: 220, lineColour: '#8a8070', grain: 45, frames: 2 },
  },
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

/** A mask (one byte a pixel) as a canvas, `colour` where it's set. */
function maskCanvas(mask, w, h, colour) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i] > 127 ? 255 : 0;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The silhouettes the look wants, as one mask. */
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
 * Draws picture `frame` (0…frames-1) of a look over `data`
 * ({ masks, point, width, height } from scene.silhouettes); a canvas.
 */
export function drawImpact(options, data, frame = 0) {
  const o = { ...DEFAULTS, ...options };
  const { width: w, height: h } = data;
  const point = data.point ?? [w / 2, h / 2];
  const rnd = random(o.seed * 97 + frame * 13 + 1);
  const c = canvas(w, h);
  const g = c.getContext('2d');

  // The background: a colour, or a gradient out from the hit.
  if (o.background2) {
    const grad = g.createRadialGradient(point[0], point[1], 0, point[0], point[1], Math.hypot(w, h) * 0.75);
    grad.addColorStop(0, o.background);
    grad.addColorStop(1, o.background2);
    g.fillStyle = grad;
  } else g.fillStyle = o.background;
  g.fillRect(0, 0, w, h);
  if (o.halftone > 0) {
    g.globalAlpha = 0.55;
    dots(g, w, h, o.halftone, o.ink, point);
    g.globalAlpha = 1;
  }

  // A starburst behind the hit.
  if (o.burst) {
    const spikes = 18;
    const R = Math.max(w, h) * 0.32;
    g.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + rnd() * 0.05;
      const r = i % 2 ? R * (0.35 + rnd() * 0.15) : R * (0.8 + rnd() * 0.4);
      g.lineTo(point[0] + Math.cos(a) * r, point[1] + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = o.accent;
    g.globalAlpha = 0.85;
    g.fill();
    g.globalAlpha = 1;
  }

  // Speed lines: thin wedges rushing in to the hit, leaving it clear.
  if (o.speedLines > 0) {
    g.fillStyle = o.lineColour ?? o.ink;
    const far = Math.hypot(w, h);
    const clear = Math.min(w, h) * 0.18;
    for (let i = 0; i < o.speedLines; i++) {
      const a = rnd() * Math.PI * 2;
      const spread = 0.004 + rnd() * 0.012;
      const inner = clear * (0.8 + rnd() * 1.6);
      g.beginPath();
      g.moveTo(point[0] + Math.cos(a) * inner, point[1] + Math.sin(a) * inner);
      g.lineTo(point[0] + Math.cos(a - spread) * far, point[1] + Math.sin(a - spread) * far);
      g.lineTo(point[0] + Math.cos(a + spread) * far, point[1] + Math.sin(a + spread) * far);
      g.closePath();
      g.fill();
    }
  }

  // Cracks running out from the hit, forking.
  if (o.cracks > 0) {
    g.strokeStyle = o.accent;
    g.lineCap = 'round';
    const crack = (x, y, a, len, width, depth) => {
      let px = x;
      let py = y;
      const steps = 8;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < steps; s++) {
        a += (rnd() - 0.5) * 0.7;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        g.lineTo(px, py);
        if (depth < 2 && rnd() < 0.18) {
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
    for (let i = 0; i < o.cracks; i++)
      crack(point[0], point[1], rnd() * Math.PI * 2, reach * (0.5 + rnd() * 0.6), 2 + rnd() * 3, 0);
  }

  // The silhouettes: outlined, misregistered, toned or solid.
  const mask = chosenMask(data, o.who);
  if (mask.some((v) => v)) {
    if (o.outline > 0) {
      const ring = maskCanvas(mask, w, h, o.accent);
      const r = o.outline;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        g.drawImage(ring, Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    if (o.split > 0) {
      g.globalCompositeOperation = 'multiply';
      g.drawImage(maskCanvas(mask, w, h, '#00e5ff'), -o.split, 0);
      g.drawImage(maskCanvas(mask, w, h, '#ff2bd6'), o.split, o.split * 0.3);
      g.globalCompositeOperation = 'source-over';
    }
    const ink = maskCanvas(mask, w, h, o.ink);
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
  Array.from({ length: Math.max(1, Math.min(8, Math.round(options.frames ?? 1))) }, (_, i) =>
    drawImpact(options, data, i),
  );

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
      (e) =>
        e.kind === 'VISUAL' &&
        e.who === 'user' &&
        e.node?.EFFECT === 'Camera' &&
        e.t <= t + 1e-6 &&
        t < e.t + (Number(e.node.TIME) || 1) - 1e-6,
    ),
  );
}
