// The Progress Bar Maker's drawing code (brought over from Woogi Tools as it
// was: the tests there pin it).
//
// Jujutsu Shenanigans can't draw a progress bar, so one is made as a run of
// pictures, one per step, from empty (frame 0) to full (frame N), and swapped
// in game. A design here is a stack of layers, as in a photo editor: bars and
// rings that are drawn from how far along the frame is, plus shapes, text,
// pictures and brush strokes that dress them up. Any layer can be clipped to
// the one under it. render() is the only drawing entry point, so the preview,
// the thumbnails and the exported frames can never disagree.

// Every design is 1024×1024: the biggest picture Roblox keeps as it is (a
// larger upload is shrunk to fit), and square, so a decal is never squashed.
export const SIDE = 1024;
export const MAX_FRAMES = 200;

export const BLENDS = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiply'],
  ['screen', 'Screen'],
  ['overlay', 'Overlay'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
  ['color-dodge', 'Colour dodge'],
  ['color-burn', 'Colour burn'],
  ['hard-light', 'Hard light'],
  ['soft-light', 'Soft light'],
  ['difference', 'Difference'],
  ['exclusion', 'Exclusion'],
  ['hue', 'Hue'],
  ['saturation', 'Saturation'],
  ['color', 'Colour'],
  ['luminosity', 'Luminosity'],
  ['lighter', 'Add'],
].map(([id, label]) => ({ id, label }));

export const FONTS = [
  'Arial',
  'Arial Black',
  'Impact',
  'Verdana',
  'Trebuchet MS',
  'Georgia',
  'Courier New',
  'Comic Sans MS',
  'system-ui',
  'serif',
  'sans-serif',
  // For kanji and kana: whichever of these the computer has.
  'Yu Mincho',
  'Yu Gothic',
  'MS Mincho',
  'Meiryo',
  'Hiragino Mincho ProN',
  'Noto Serif JP',
];

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Pictures used by paints, patterns and segment shapes, looked up by src
// while a render runs. render() sets it; drawing is synchronous, so only one
// render ever uses it at a time.
let lookup = () => null;
const imageOf = (src) => (src ? lookup(src) : null);
const sizeOf = (img) => [
  img.naturalWidth || img.width || 1,
  img.naturalHeight || img.height || 1,
];

// Where a picture goes inside `box`: stretched to it, covering it, or fitted
// inside it, centred.
function fitInto(img, box, fit) {
  const [iw, ih] = sizeOf(img);
  if (fit === 'stretch') return { x: box.x, y: box.y, w: box.w, h: box.h };
  const k = (fit === 'cover' ? Math.max : Math.min)(box.w / iw, box.h / ih);
  return {
    x: box.x + (box.w - iw * k) / 2,
    y: box.y + (box.h - ih * k) / 2,
    w: iw * k,
    h: ih * k,
  };
}

let counter = 0;
export const newId = () =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ─── Paints ──────────────────────────────────────────────────────────────
// A paint is always a list of stops, whatever its type, so switching a solid
// colour to a gradient and back keeps the colours. Positions and alpha are
// 0-100; angles are degrees, clockwise, 0 pointing right for linear gradients
// and up for conic ones (so a ring's gradient starts where the ring does).

export const paint = (type, stops, angle = 0) => ({
  type,
  angle,
  stops: stops.map(([pos, color, alpha = 100]) => ({ pos, color, alpha })),
});

export const solid = (color, alpha = 100) =>
  paint('solid', [
    [0, color, alpha],
    [100, color, alpha],
  ]);

function channels(hex) {
  const n = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? parseInt(hex.slice(1), 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex, alpha = 100) =>
  `rgba(${channels(hex).join(',')},${clamp(alpha, 0, 100) / 100})`;

const sortedStops = (p) => [...(p?.stops ?? [])].sort((a, b) => a.pos - b.pos);

// The colour a gradient has at `pos` (0-100), for fills that change colour as
// they fill up rather than showing the whole gradient.
export function sampleStops(stops, pos) {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (!s.length) return 'rgba(0,0,0,0)';
  if (pos <= s[0].pos) return rgba(s[0].color, s[0].alpha);
  for (let i = 1; i < s.length; i++) {
    if (pos <= s[i].pos) {
      const a = s[i - 1];
      const b = s[i];
      const k = b.pos === a.pos ? 1 : (pos - a.pos) / (b.pos - a.pos);
      const ca = channels(a.color);
      const cb = channels(b.color);
      const mix = ca.map((c, j) => Math.round(c + (cb[j] - c) * k));
      return `rgba(${mix.join(',')},${(a.alpha + (b.alpha - a.alpha) * k) / 100})`;
    }
  }
  const last = s.at(-1);
  return rgba(last.color, last.alpha);
}

// A CSS gradient of the same stops, for the swatches in the side panel.
export function paintCss(p) {
  if (p?.type === 'image')
    return p.src ? `center / cover no-repeat url("${p.src}")` : 'transparent';
  const stops = sortedStops(p);
  if (!stops.length) return 'transparent';
  if (p.type === 'solid' || stops.length < 2) {
    const c = rgba(stops[0].color, stops[0].alpha);
    return `linear-gradient(${c},${c})`;
  }
  const list = stops
    .map((s) => `${rgba(s.color, s.alpha)} ${s.pos}%`)
    .join(',');
  return `linear-gradient(90deg,${list})`;
}

// A picture as a paint: laid over the area (stretched, covering or fitted),
// or tiled across it at a set scale.
function imagePaint(ctx, p, area) {
  const img = imageOf(p.src);
  if (!img) return 'rgba(0,0,0,0)';
  const [iw, ih] = sizeOf(img);
  const box = area.box;
  const tile = p.fit === 'tile';
  const k = (p.scale ?? 100) / 100;
  const at = tile
    ? { x: box.x, y: box.y, w: iw * k, h: ih * k }
    : fitInto(img, box, p.fit ?? 'cover');
  const pattern = ctx.createPattern(img, tile ? 'repeat' : 'no-repeat');
  pattern.setTransform(new DOMMatrix([at.w / iw, 0, 0, at.h / ih, at.x, at.y]));
  return pattern;
}

// Fills everything with a paint, except that a picture meant to repeat in
// each segment is laid into each one.
function fillWith(ctx, p, area, geo, env) {
  const cells =
    p?.type === 'image' && p.map === 'segment' ? geo.cells?.() : null;
  if (cells?.length) {
    for (const cell of cells) {
      ctx.fillStyle = paintStyle(ctx, p, { box: cell });
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    }
    return;
  }
  ctx.fillStyle = paintStyle(ctx, p, area);
  everywhere(ctx, env);
}

// `area.box` is what linear and radial gradients stretch across; `area.arc`
// (centre, start, span, direction) is what a conic one sweeps.
function paintStyle(ctx, p, area) {
  if (p?.type === 'image') return imagePaint(ctx, p, area);
  const stops = sortedStops(p);
  if (!stops.length) return 'rgba(0,0,0,0)';
  if (p.type === 'solid' || stops.length < 2)
    return rgba(stops[0].color, stops[0].alpha);
  const { x, y, w, h } = area.box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let gradient;
  let at = (q) => q;
  if (p.type === 'linear') {
    const a = rad(p.angle ?? 0);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const half = Math.max(1, (Math.abs(w * dx) + Math.abs(h * dy)) / 2);
    gradient = ctx.createLinearGradient(
      cx - dx * half,
      cy - dy * half,
      cx + dx * half,
      cy + dy * half,
    );
  } else if (p.type === 'radial') {
    gradient = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.max(1, Math.hypot(w, h) / 2),
    );
  } else {
    const arc = area.arc ?? { cx, cy, from: 0, span: 360, cw: true };
    const span = clamp(arc.span, 0.01, 360);
    const from = arc.from + (p.angle ?? 0);
    // Canvas conics always run clockwise from three o'clock.
    gradient = ctx.createConicGradient(
      rad((arc.cw ? from : from - span) - 90),
      arc.cx,
      arc.cy,
    );
    at = arc.cw ? (q) => (q * span) / 360 : (q) => ((1 - q) * span) / 360;
  }
  for (const s of stops)
    gradient.addColorStop(clamp(at(s.pos / 100), 0, 1), rgba(s.color, s.alpha));
  return gradient;
}

// ─── Layers ──────────────────────────────────────────────────────────────

// Effects any layer can have. Off until switched on.
export const newFx = () => ({
  shadow: { on: false, color: '#000000', alpha: 60, x: 0, y: 12, blur: 24 },
  outerGlow: { on: false, color: '#FFFFFF', alpha: 80, size: 30 },
  outline: { on: false, color: '#000000', alpha: 100, width: 8 },
  overlay: { on: false, color: '#FFFFFF', alpha: 50, blend: 'source-over' },
  fade: { on: false, from: 0, to: 100 },
  range: { on: false, from: 100, to: 100 },
  // Stylising (the effects block below withFx).
  halftone: { on: false, size: 14, angle: 45, shape: 'dots', tone: 'even', scale: 60, ink: 'own', color: '#000000', alpha: 100, under: 0 },
  chroma: { on: false, amount: 6, angle: 0 },
  glitch: { on: false, amount: 30, slices: 12, animate: true },
  pixelate: { on: false, size: 8 },
  blur: { on: false, amount: 4 },
  scanlines: { on: false, gap: 6, alpha: 35, color: '#000000' },
  bevel: { on: false, size: 10, depth: 70, angle: 135, highlight: '#FFFFFF', shade: '#000000' },
  tilt: { on: false, tiltX: 30, tiltY: 0, distance: 2 },
  extrude: { on: false, depth: 24, angle: 45, colour: 'own', shade: 45, color: '#000000', alpha: 100, fade: false },
});

const base = (type, name, extra) => ({
  id: newId(),
  type,
  name,
  visible: true,
  opacity: 100,
  blend: 'source-over',
  clip: false,
  rotation: 0,
  fx: newFx(),
  ...extra,
});

export const newBar = (extra = {}) =>
  base('bar', 'Bar', {
    x: 64,
    y: 462,
    w: 896,
    h: 100,
    shape: 'bar',
    direction: 'ltr',
    radius: 50,
    skew: 0,
    ringStart: 0,
    ringSweep: 360,
    thickness: 90,
    roundEnds: true,
    segments: 1,
    gap: 16,
    stepped: false,
    padding: 0,
    fillEnds: 'cut',
    fillMode: 'reveal',
    fill: paint('linear', [
      [0, '#4ADE80'],
      [100, '#22C55E'],
    ]),
    trackOn: true,
    track: solid('#1F2937'),
    // Hide the track where the fill is, for see-through fills.
    trackCut: false,
    // The shape of each segment (the whole bar, with one segment), and a
    // taper that grows or shrinks it along the bar.
    segShape: 'rect',
    segSlant: 24,
    segDepth: 50,
    taperStart: 100,
    taperEnd: 100,
    taperAlign: 'center',
    stroke: {
      on: false,
      paint: solid('#000000'),
      width: 8,
      style: 'solid',
      dash: 24,
      gap: 14,
      cap: 'butt',
      position: 'outside',
      around: 'segments',
      march: 0,
      // Its own corner roundness instead of the bar's (a square frame round
      // a pill, or the other way round).
      ownRadius: false,
      radius: 0,
    },
    fillStroke: { on: false, color: '#FFFFFF', alpha: 100, width: 4 },
    innerShadow: {
      on: false,
      color: '#000000',
      alpha: 70,
      size: 18,
      x: 0,
      y: 6,
    },
    // The fill's pattern. `anchor` says what it's fixed to: the picture
    // ('canvas'), the fill's growing end ('fill'), or neither ('drift',
    // sliding `move` pixels a step).
    stripes: {
      on: false,
      kind: 'stripes',
      color: '#FFFFFF',
      alpha: 25,
      width: 24,
      gap: 24,
      angle: 45,
      anchor: 'canvas',
      move: 4,
    },
    shine: { on: false, alpha: 35, style: 'top' },
    tip: { on: false, color: '#FFFFFF', alpha: 90, size: 60 },
    trail: { on: false, color: '#FFFFFF', alpha: 45, amount: 10 },
    grain: { on: false, alpha: 25, size: 2, animate: false },
    flash: { on: false, color: '#FFFFFF', alpha: 55 },
    glow: { on: false, color: '#FFFFFF', alpha: 70, size: 30, grow: false },
    // What layers clipped to this bar show through: just the filled part (a
    // texture on the fill), or the whole bar, track and all.
    clipTo: 'fill',
    // A picture as each segment's shape (segShape 'image').
    segImage: null,
    segImageFit: 'contain',
    // A picture as the whole bar (shape 'image'): its outline is the bar, and
    // it fills in its own colours (or the fill's) across it.
    barImage: null,
    barImageFit: 'contain',
    barImageOwn: true,
    barImageTrack: 'faded',
    // Text bars (shape 'text').
    text: '力',
    textFont: 'serif',
    textBold: true,
    textLayout: 'across',
    textSpacing: 8,
    textMode: 'wipe',
    textStyle: 'fill',
    textOutline: 6,
    textPen: 7,
    // Stroke order per character, fetched from KanjiVG and kept with the
    // design so it opens and exports without a connection.
    strokeData: {},
    ...extra,
  });

export const newRing = (extra = {}) =>
  newBar({
    name: 'Ring',
    shape: 'ring',
    direction: 'cw',
    x: 112,
    y: 112,
    w: 800,
    h: 800,
    thickness: 90,
    fill: paint(
      'conic',
      [
        [0, '#A855F7'],
        [100, '#EC4899'],
      ],
      0,
    ),
    ...extra,
  });

const SHAPE_NAMES = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  polygon: 'Polygon',
  star: 'Star',
  path: 'Shape',
};

// Custom shapes (the shape tool's library), as SVG paths in a 100 × 100
// box, stretched to the layer's box. The pen tool's own paths are kept the
// same way.
export const CUSTOM_SHAPES = [
  { id: 'heart', label: 'Heart', d: 'M50 90C20 66 4 49 4 30 4 16 15 6 28 6c10 0 18 6 22 14C54 12 62 6 72 6c13 0 24 10 24 24 0 19-16 36-46 60Z' },
  { id: 'arrow', label: 'Arrow', d: 'M4 36H58V12L96 50 58 88V64H4Z' },
  { id: 'chevron', label: 'Chevron', d: 'M4 18 50 50 96 18V44L50 78 4 44Z' },
  { id: 'lightning', label: 'Lightning', d: 'M60 2 14 56H44L34 98 88 38H56Z' },
  { id: 'bubble', label: 'Speech bubble', d: 'M12 8H88Q96 8 96 16V60Q96 68 88 68H42L18 92 24 68H12Q4 68 4 60V16Q4 8 12 8Z' },
  { id: 'shield', label: 'Shield', d: 'M50 4 92 18V46C92 72 74 88 50 96 26 88 8 72 8 46V18Z' },
  { id: 'plus', label: 'Plus', d: 'M36 4H64V36H96V64H64V96H36V64H4V36H36Z' },
  { id: 'crescent', label: 'Crescent', d: 'M64 6A46 46 0 1 0 94 72 36 36 0 1 1 64 6Z' },
  { id: 'drop', label: 'Drop', d: 'M50 4C50 4 86 46 86 64A36 36 0 0 1 14 64C14 46 50 4 50 4Z' },
  { id: 'flame', label: 'Flame', d: 'M50 4C62 24 84 36 84 62 84 82 68 96 50 96 32 96 16 82 16 62 16 46 28 38 32 24 38 36 42 40 46 42 46 28 44 16 50 4Z' },
  { id: 'kunai', label: 'Kunai', d: 'M50 2 60 40 54 44V70H62V76H54V86A7 7 0 1 1 46 86V76H38V70H46V44L40 40Z' },
  { id: 'burst', label: 'Burst', d: burstPath(14, 0.62) },
  { id: 'slash', label: 'Slash', d: 'M2 98C30 70 64 34 98 2 82 30 52 66 14 98Z' },
  { id: 'banner', label: 'Banner', d: 'M2 20H98L86 50 98 80H2L14 50Z' },
];

// A spiky burst (manga's impact bubble): `n` points, the inner ones `inner` of the way out.
function burstPath(n, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 2 ? inner : 1) * 48 * (i % 2 ? 1 : 0.9 + ((i * 37) % 10) / 100);
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

export const newShape = (shape = 'rect', extra = {}) =>
  base('shape', SHAPE_NAMES[shape] ?? 'Shape', {
    shape,
    x: 362,
    y: 412,
    w: 300,
    h: 200,
    radius: 0,
    fillOn: true,
    fill: solid('#FFFFFF'),
    stroke: 0,
    strokeColor: '#000000',
    strokeAlpha: 100,
    strokeOwnRadius: false,
    strokeRadius: 0,
    // Polygons and stars.
    sides: 6,
    points: 5,
    inner: 45,
    // A path ('path'): SVG path data in a 100 × 100 box, and whether it's closed.
    d: '',
    closed: true,
    ...extra,
  });

export const newText = (extra = {}) =>
  base('text', 'Text', {
    text: '{percent}%',
    x: 212,
    y: 442,
    w: 600,
    h: 140,
    font: 'Arial Black',
    size: 110,
    bold: false,
    italic: false,
    align: 'center',
    fill: solid('#FFFFFF'),
    stroke: 8,
    strokeColor: '#000000',
    ...extra,
  });

export const newImage = (src, w, h, extra = {}) =>
  base('image', 'Picture', { src, x: 0, y: 0, w, h, ...extra });

export const newPaint = (extra = {}) =>
  base('paint', 'Drawing', { src: null, ...extra });

// What the JJS skill export remembers with a design: the image IDs of its
// uploaded steps, and the skill's settings.
export const newJjs = () => ({
  ids: '',
  uploads: [],
  uploadedFor: null,
  name: '',
  tag: 'Bar',
  start: 'full',
  size: 2,
  position: '0, 0, 0',
  // 'complex' (lag-proof, the default), 'separate' (Complex Separate: the
  // meter in layers) or 'legacy': see core/barskill.js.
  style: 'complex',
  // Complex Separate's front (layers over the meter that never change) and
  // extras (layers on some steps only): the front's image ID, and an image
  // ID for each extra by its key ("extra:<from>-<to>", see separateParts).
  frontId: '',
  extraIds: {},
  // Complex Separate's other pictures: the container's image ID, one trail
  // image ID per step, how long a trail takes to fade, and their uploads
  // ({ fingerprint, items: { "container:0" | "meter:N" | "trail:N": { decalId, imageId } } }).
  // What moves the bar: 'tag' (your skills set it) or 'health' (your own
  // health, read by a passive: a health bar), and that one's settings.
  source: 'tag',
  healthMax: 100,
  healthEvery: 0.05,
  containerId: '',
  trailIds: '',
  trailTime: 0.4,
  layeredUploads: null,
  checkEvery: 0.05,
  showFor: 0.12,
  waitFor: 0.1,
  rails: true,
  clientSided: false,
  regen: true,
  regenAmount: 1,
  regenEvery: 1,
});

export const newDoc = (extra = {}) => ({
  name: 'Untitled bar',
  jjs: newJjs(),
  width: SIDE,
  height: SIDE,
  frames: 20,
  background: { on: false, color: '#000000' },
  layers: [],
  // Guides dragged out of the rulers: { axis: 'x' | 'y', at } in pixels.
  guides: [],
  ...extra,
});

const MAKERS = {
  bar: () => newBar(),
  shape: () => newShape(),
  text: () => newText(),
  image: () => newImage(null, 1, 1),
  paint: () => newPaint(),
};

// A design read back from storage or a project file, with anything missing
// (or added since it was saved) filled in. Null if it isn't a design at all.
export function normaliseDoc(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.layers))
    return null;
  const fresh = newDoc();
  // A design from before sizes were fixed keeps its layout, centred.
  const dx = Math.round((SIDE - (Number(raw.width) || SIDE)) / 2);
  const dy = Math.round((SIDE - (Number(raw.height) || SIDE)) / 2);
  return {
    ...fresh,
    frames: clamp(
      Math.round(Number(raw.frames) || fresh.frames),
      1,
      MAX_FRAMES,
    ),
    name: String(raw.name || fresh.name).slice(0, 80),
    jjs: {
      ...newJjs(),
      ...(raw.jjs && typeof raw.jjs === 'object' ? raw.jjs : {}),
    },
    background: { ...fresh.background, ...raw.background },
    guides: Array.isArray(raw.guides)
      ? raw.guides
          .filter((g) => (g?.axis === 'x' || g?.axis === 'y') && Number.isFinite(g.at))
          .map((g) => ({ axis: g.axis, at: g.at }))
      : [],
    layers: raw.layers
      .filter((l) => l && MAKERS[l.type])
      .map((l) => {
        const made = MAKERS[l.type]();
        const merged = { ...made, ...l, id: l.id || made.id };
        // Settings grouped in objects are merged a level down, so one saved
        // before a setting existed still gets it.
        for (const [key, value] of Object.entries(made))
          if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            l[key] &&
            typeof l[key] === 'object'
          )
            merged[key] = { ...value, ...l[key] };
        merged.fx = Object.fromEntries(
          Object.entries(made.fx).map(([k, v]) => [k, { ...v, ...l.fx?.[k] }]),
        );
        // Older bars had a plain border and always-drifting stripes.
        if (l.type === 'bar' && l.border > 0 && !l.stroke)
          merged.stroke = {
            ...made.stroke,
            on: true,
            width: l.border,
            paint: solid(l.borderColor ?? '#000000', l.borderAlpha ?? 100),
          };
        if (l.type === 'bar' && l.stripes && !('anchor' in l.stripes))
          merged.stripes.anchor = 'drift';
        if (l.type !== 'paint' && (dx || dy)) {
          merged.x = (Number(merged.x) || 0) + dx;
          merged.y = (Number(merged.y) || 0) + dy;
        }
        return merged;
      }),
  };
}

// A layer's box in document pixels. Drawings cover the whole picture.
export const boxOf = (layer, doc) =>
  layer.type === 'paint'
    ? { x: 0, y: 0, w: doc.width, h: doc.height }
    : { x: layer.x, y: layer.y, w: layer.w, h: layer.h };

// What a text layer says on a given frame.
export function fillTokens(text, frame, frames) {
  const percent = frames ? Math.round((frame / frames) * 100) : 0;
  return String(text ?? '')
    .replaceAll('{percent}', String(percent))
    .replaceAll('{frame}', String(frame))
    .replaceAll('{frames}', String(frames))
    .replaceAll('{left}', String(frames - frame));
}

// A short fingerprint of what a design draws (its name and the JJS export
// settings aside), to tell whether uploaded pictures still match it.
export function drawingFingerprint(doc) {
  const text = JSON.stringify({ ...doc, name: undefined, jjs: undefined });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// "progress_07.png": padded so the frames sort in order everywhere.
export function frameName(name, frame, frames) {
  const safe = String(name || 'progress').replace(/[\\/:*?"<>|]+/g, '_');
  return `${safe}_${String(frame).padStart(String(frames).length, '0')}.png`;
}

// Immutable set by a dotted path, "fill.stops.1.color".
export function setIn(target, path, value) {
  const [head, ...rest] = typeof path === 'string' ? path.split('.') : path;
  const copy = Array.isArray(target) ? [...target] : { ...target };
  copy[head] = rest.length ? setIn(target?.[head] ?? {}, rest, value) : value;
  return copy;
}

export function getIn(target, path) {
  return path.split('.').reduce((v, key) => v?.[key], target);
}

// ─── Bar geometry ────────────────────────────────────────────────────────
// Progress is worked out in "segment units": a bar of n segments runs from 0
// to n, whatever the gaps between them are, so the gaps never eat a frame.

// Which stretch of [0, n] is filled at t.
function filledSpan(direction, n, t) {
  const u = t * n;
  if (direction === 'rtl' || direction === 'btt') return [n - u, n];
  if (direction?.startsWith('center')) return [n / 2 - u / 2, n / 2 + u / 2];
  return [0, u];
}

// For each segment, the part of it that is filled, as [a, b] within 0-1.
export function coverage(layer, t) {
  const n = Math.max(1, Math.round(layer.segments) || 1);
  const [lo, hi] = filledSpan(layer.direction, n, clamp(t, 0, 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    let a = Math.max(lo, i) - i;
    let b = Math.min(hi, i + 1) - i;
    if (b - a <= 1e-6) continue;
    if (layer.stepped) {
      if (b - a < 1 - 1e-6) continue;
      a = 0;
      b = 1;
    }
    out.push({ i, a, b });
  }
  return { n, lo, hi, parts: out };
}

function inset(r, by) {
  return { x: r.x + by, y: r.y + by, w: r.w - by * 2, h: r.h - by * 2 };
}

function roundRectPath(ctx, r, radius) {
  if (r.w <= 0 || r.h <= 0) return;
  ctx.roundRect(r.x, r.y, r.w, r.h, clamp(radius, 0, Math.min(r.w, r.h) / 2));
}

// A closed polygon with its corners rounded by up to `radius`: each corner
// only as round as its two edges leave room for, so sharp points stay sharp.
function polyPath(ctx, pts, radius) {
  const n = pts.length;
  if (n < 3) return;
  if (!(radius > 0)) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    return;
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const p = pts[i];
    const next = pts[(i + 1) % n];
    const ax = prev[0] - p[0];
    const ay = prev[1] - p[1];
    const bx = next[0] - p[0];
    const by = next[1] - p[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const m = mid(p, next);
    if (!la || !lb) {
      ctx.lineTo(m[0], m[1]);
      continue;
    }
    const half = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)) / 2;
    const r = Math.min(radius, (Math.min(la, lb) / 2) * Math.tan(half));
    ctx.arcTo(p[0], p[1], m[0], m[1], Math.max(0, r));
  }
  ctx.closePath();
}

export const SEGMENT_SHAPES = [
  'rect',
  'slant',
  'chevron',
  'diamond',
  'hexagon',
  'ellipse',
];

// One segment's corners, `len` along the bar (pointing the way it fills) by
// `T` across.
function segmentPoints(L, len, T) {
  const d = clamp(((L.segDepth ?? 50) / 100) * T, 0, len / 2);
  switch (L.segShape) {
    case 'slant': {
      const s = clamp(L.segSlant ?? 0, -len, len);
      return s >= 0
        ? [
            [s, 0],
            [len, 0],
            [len - s, T],
            [0, T],
          ]
        : [
            [0, 0],
            [len + s, 0],
            [len, T],
            [-s, T],
          ];
    }
    case 'chevron':
      return [
        [0, 0],
        [len - d, 0],
        [len, T / 2],
        [len - d, T],
        [0, T],
        [d, T / 2],
      ];
    case 'diamond':
      return [
        [0, T / 2],
        [len / 2, 0],
        [len, T / 2],
        [len / 2, T],
      ];
    case 'hexagon':
      return [
        [d, 0],
        [len - d, 0],
        [len, T / 2],
        [len - d, T],
        [d, T],
        [0, T / 2],
      ];
    case 'ellipse':
      return Array.from({ length: 48 }, (_, k) => {
        const a = (k / 48) * Math.PI * 2;
        return [
          len / 2 + (len / 2) * Math.cos(a),
          T / 2 + (T / 2) * Math.sin(a),
        ];
      });
    default:
      return [
        [0, 0],
        [len, 0],
        [len, T],
        [0, T],
      ];
  }
}

function linearGeometry(L) {
  const horizontal = !['ttb', 'btt', 'center-v'].includes(L.direction);
  const mirrored = L.direction === 'rtl' || L.direction === 'btt';
  const center = L.direction?.startsWith('center');
  const n = Math.max(1, Math.round(L.segments) || 1);
  const gap = n > 1 ? Math.max(0, L.gap) : 0;
  const length = horizontal ? L.w : L.h;
  const seg = Math.max(0, (length - gap * (n - 1)) / n);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const o = i * (seg + gap);
    parts.push(
      horizontal
        ? { x: L.x + o, y: L.y, w: seg, h: L.h }
        : { x: L.x, y: L.y + o, w: L.w, h: seg },
    );
  }
  const pad = Math.max(0, L.padding);
  const inner = parts.map((p) => inset(p, pad));
  const radius = Math.max(0, L.radius);
  const innerRadius = Math.max(0, radius - pad);
  const barStart = horizontal ? L.x : L.y;
  const barLength = Math.max(1, length);
  const taperA = clamp(L.taperStart ?? 100, 1, 100) / 100;
  const taperB = clamp(L.taperEnd ?? 100, 1, 100) / 100;
  const plain =
    (L.segShape ?? 'rect') === 'rect' && taperA === 1 && taperB === 1;
  // A picture as the segment shape: its silhouette, fitted into each one.
  const segImg = L.segShape === 'image' ? imageOf(L.segImage) : null;
  const imageInto = (ctx, r) => {
    const at = fitInto(
      segImg,
      r,
      L.segImageFit === 'stretch' ? 'stretch' : 'contain',
    );
    ctx.drawImage(segImg, at.x, at.y, at.w, at.h);
  };

  // Where along the bar a point in segment units sits, in pixels.
  const posOf = (u) => {
    const i = clamp(Math.floor(u), 0, n - 1);
    const p = inner[i];
    const f = clamp(u - i, 0, 1);
    return horizontal ? p.x + f * p.w : p.y + f * p.h;
  };
  const piece = (p, a, b) =>
    horizontal
      ? { x: p.x + a * p.w, y: p.y, w: (b - a) * p.w, h: p.h }
      : { x: p.x, y: p.y + a * p.h, w: p.w, h: (b - a) * p.h };

  // The outline of a segment, or a piece of one, in its chosen shape, with
  // the taper worked out from where along the whole bar each corner falls.
  function outline(ctx, r, rounding) {
    if (r.w <= 0 || r.h <= 0) return;
    if (plain) return roundRectPath(ctx, r, rounding);
    const len = horizontal ? r.w : r.h;
    const T = horizontal ? r.h : r.w;
    const origin = horizontal ? r.x : r.y;
    const cross = horizontal ? r.y : r.x;
    const pts = segmentPoints(L, len, T).map(([u, v]) => {
      const along = mirrored ? origin + len - u : origin + u;
      let f = clamp((along - barStart) / barLength, 0, 1);
      if (mirrored) f = 1 - f;
      const size = T * (taperA + (taperB - taperA) * f);
      const off =
        L.taperAlign === 'start'
          ? 0
          : L.taperAlign === 'end'
            ? T - size
            : (T - size) / 2;
      const across = cross + off + (v / T) * size;
      return horizontal ? [along, across] : [across, along];
    });
    polyPath(ctx, pts, rounding);
  }

  // How far along the filled span reaches, in segment units.
  const reach = (cov) => ({
    max: Math.max(...cov.parts.map((p) => p.i + p.b)),
    min: Math.min(...cov.parts.map((p) => p.i + p.a)),
  });

  return {
    area(span) {
      if (!span) return { box: { x: L.x, y: L.y, w: L.w, h: L.h } };
      const a = posOf(span[0]);
      const b = Math.max(a + 1, posOf(span[1]));
      return {
        box: horizontal
          ? { x: a, y: L.y, w: b - a, h: L.h }
          : { x: L.x, y: a, w: L.w, h: b - a },
      };
    },
    pathless: Boolean(segImg),
    cells: () => parts,
    track(ctx) {
      if (segImg) return parts.forEach((p) => imageInto(ctx, p));
      ctx.beginPath();
      for (const p of parts) outline(ctx, p, radius);
      ctx.fill();
    },
    fillMask(ctx) {
      if (segImg) return inner.forEach((p) => imageInto(ctx, p));
      ctx.beginPath();
      for (const p of inner) outline(ctx, p, innerRadius);
      ctx.fill();
    },
    region(ctx, cov, shaped) {
      if (segImg && shaped) {
        for (const { i, a, b } of cov.parts) {
          const r = piece(inner[i], a, b);
          // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          imageInto(ctx, inner[i]);
          ctx.restore();
        }
        return;
      }
      ctx.beginPath();
      for (const { i, a, b } of cov.parts) {
        const r = piece(inner[i], a, b);
        if (shaped) outline(ctx, r, innerRadius);
        else ctx.rect(r.x, r.y, r.w, r.h);
      }
      ctx.fill();
    },
    // For a stroke: each segment's outline (or the whole bar's), moved out
    // or in by `grow`.
    outlinePath(ctx, grow, whole) {
      ctx.beginPath();
      const rects = whole ? [{ x: L.x, y: L.y, w: L.w, h: L.h }] : parts;
      const r = L.stroke?.ownRadius ? Math.max(0, Number(L.stroke.radius) || 0) : radius;
      for (const p of rects)
        outline(ctx, inset(p, -grow), r > 0 ? Math.max(0, r + grow) : 0);
    },
    // How far the fill has come, as a shift along the bar, for patterns
    // that ride along with it.
    travel(cov) {
      if (center || !cov.parts.length) return { dx: 0, dy: 0 };
      const { max, min } = reach(cov);
      const d = mirrored
        ? posOf(min) - (barStart + barLength)
        : posOf(max) - barStart;
      return horizontal ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    },
    // The fill's leading edges, where a highlight can sit.
    tip(ctx, cov, size, color) {
      if (!cov.parts.length) return;
      const { max, min } = reach(cov);
      const edges = [];
      if (!mirrored && max < n - 1e-6) edges.push([posOf(max), 1]);
      if ((mirrored || center) && min > 1e-6) edges.push([posOf(min), -1]);
      if (center && max < n - 1e-6 && !edges.some((e) => e[1] === 1))
        edges.push([posOf(max), 1]);
      for (const [p, dir] of edges) {
        const from = p - dir * size;
        const g = horizontal
          ? ctx.createLinearGradient(from, 0, p, 0)
          : ctx.createLinearGradient(0, from, 0, p);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        const lo = Math.min(from, p);
        if (horizontal) ctx.fillRect(lo, L.y, size, L.h);
        else ctx.fillRect(L.x, lo, L.w, size);
      }
    },
  };
}

function ringGeometry(L) {
  const cx = L.x + L.w / 2;
  const cy = L.y + L.h / 2;
  const R = Math.max(1, Math.min(L.w, L.h) / 2);
  const thickness = clamp(L.thickness, 1, R);
  const mid = R - thickness / 2;
  const n = Math.max(1, Math.round(L.segments) || 1);
  const sweep = clamp(L.ringSweep, 1, 360);
  const full = sweep >= 360;
  const gapDeg = n > 1 ? deg(Math.max(0, L.gap) / Math.max(1, mid)) : 0;
  const gaps = full ? (n > 1 ? n : 0) : n - 1;
  const seg = Math.max(0, (sweep - gapDeg * gaps) / n);
  const offset = full && n > 1 ? gapDeg / 2 : 0;
  const cw = L.direction !== 'ccw';
  const sign = cw ? 1 : -1;
  const center = L.direction === 'center';
  const pad = Math.max(0, L.padding);
  const innerThickness = Math.max(0, thickness - pad * 2);
  const round = Boolean(L.roundEnds);
  const whole = full && n === 1;
  // A taper, as a bar's: the ring's thickness from TAPER START to TAPER END
  // of itself round its sweep, lined up on its inside, middle or outside.
  const taperA = clamp(L.taperStart ?? 100, 1, 100) / 100;
  const taperB = clamp(L.taperEnd ?? 100, 1, 100) / 100;
  const tapered = taperA !== 1 || taperB !== 1;
  const scaleAt = (rel) => taperA + (taperB - taperA) * clamp(rel / sweep, 0, 1);
  // The band's inner and outer radius at `rel`, for a full width `width`.
  const edgesAt = (rel, width) => {
    const w = width * scaleAt(rel);
    const lineUp = L.taperAlign === 'start' ? mid - width / 2 + w / 2 : L.taperAlign === 'end' ? mid + width / 2 - w / 2 : mid;
    return [Math.max(0, lineUp - w / 2), lineUp + w / 2, lineUp, w];
  };
  // A tapered band from `from` to `to` (degrees along the sweep), round-ended or not.
  function taperedBand(ctx, from, to, width) {
    if (width <= 0 || to <= from) return;
    const steps = Math.max(8, Math.ceil((to - from) / 3));
    const at = (k) => from + ((to - from) * k) / steps;
    const pt = (rel, r) => [cx + r * Math.cos(angle(rel)), cy + r * Math.sin(angle(rel))];
    ctx.moveTo(...pt(from, edgesAt(from, width)[1]));
    for (let k = 1; k <= steps; k++) ctx.lineTo(...pt(at(k), edgesAt(at(k), width)[1]));
    if (round) {
      const [, , m, w] = edgesAt(to, width);
      const c = pt(to, m);
      ctx.arc(c[0], c[1], w / 2, angle(to), angle(to) + sign * Math.PI, !cw);
    }
    for (let k = steps; k >= 0; k--) ctx.lineTo(...pt(at(k), edgesAt(at(k), width)[0]));
    if (round) {
      const [, , m, w] = edgesAt(from, width);
      const c = pt(from, m);
      ctx.arc(c[0], c[1], w / 2, angle(from) + sign * Math.PI, angle(from) + sign * Math.PI * 2, !cw);
    }
    ctx.closePath();
  }

  const startOf = (i) => offset + i * (seg + gapDeg);
  // Degrees clockwise from twelve o'clock, turned into canvas radians.
  const angle = (rel) => rad(L.ringStart + sign * rel - 90);
  // How far a round cap reaches past the end of its arc, seen from the centre.
  const capOf = (width) =>
    round ? deg(Math.asin(clamp(width / 2 / Math.max(1, mid), 0, 1))) : 0;
  const relOf = (u) => {
    const i = clamp(Math.floor(u), 0, n - 1);
    return startOf(i) + clamp(u - i, 0, 1) * seg;
  };
  const reach = (cov) => ({
    max: Math.max(...cov.parts.map((p) => p.i + p.b)),
    min: Math.min(...cov.parts.map((p) => p.i + p.a)),
  });

  function arc(ctx, from, to, width) {
    if (width <= 0) return;
    if (tapered) {
      // Round caps sit inside the segment, as an untapered stroke's do.
      const cap = capOf(width * Math.min(scaleAt(from), scaleAt(to)));
      ctx.beginPath();
      taperedBand(ctx, from + cap, Math.max(from + cap + 0.01, to - cap), width);
      ctx.fill();
      return;
    }
    ctx.lineWidth = width;
    ctx.lineCap = round ? 'round' : 'butt';
    if (whole && to - from >= 360 - 1e-6) {
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(cx, cy, mid, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // Round caps are pulled in so they end where the segment does.
    const cap = capOf(width);
    let a = from + cap;
    let b = to - cap;
    if (b <= a) a = b = (a + b) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, mid, angle(a), angle(Math.max(b, a + 0.01)), !cw);
    ctx.stroke();
  }

  // The outline of a band of the ring, `halfW` either side of its middle.
  function band(ctx, from, to, halfW) {
    if (tapered) {
      const cap = capOf(thickness);
      return taperedBand(ctx, from + cap, Math.max(from + cap + 0.01, to - cap), halfW * 2);
    }
    const rO = mid + halfW;
    const rI = Math.max(0, mid - halfW);
    if (full && to - from >= 360 - 1e-6) {
      ctx.moveTo(cx + rO, cy);
      ctx.arc(cx, cy, rO, 0, Math.PI * 2);
      ctx.moveTo(cx + rI, cy);
      ctx.arc(cx, cy, rI, 0, Math.PI * 2, true);
      return;
    }
    const grow = halfW - thickness / 2;
    const cap = capOf(thickness);
    let a = from + cap - (round ? 0 : deg(grow / Math.max(1, mid)));
    let b = to - cap + (round ? 0 : deg(grow / Math.max(1, mid)));
    if (b < a) a = b = (a + b) / 2;
    const A = angle(a);
    const B = angle(b);
    ctx.moveTo(cx + rO * Math.cos(A), cy + rO * Math.sin(A));
    ctx.arc(cx, cy, rO, A, B, !cw);
    if (round)
      ctx.arc(
        cx + mid * Math.cos(B),
        cy + mid * Math.sin(B),
        halfW,
        B,
        B + sign * Math.PI,
        !cw,
      );
    else ctx.lineTo(cx + rI * Math.cos(B), cy + rI * Math.sin(B));
    ctx.arc(cx, cy, rI, B, A, cw);
    if (round)
      ctx.arc(
        cx + mid * Math.cos(A),
        cy + mid * Math.sin(A),
        halfW,
        A + sign * Math.PI,
        A + sign * Math.PI * 2,
        !cw,
      );
    ctx.closePath();
  }

  const stroked = (ctx, fn) => {
    ctx.strokeStyle = ctx.fillStyle;
    fn();
  };

  return {
    area(span) {
      const box = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
      if (!span)
        return { box, arc: { cx, cy, from: L.ringStart, span: sweep, cw } };
      const a = relOf(span[0]);
      const b = relOf(span[1]);
      return {
        box,
        arc: {
          cx,
          cy,
          from: L.ringStart + sign * a,
          span: Math.max(0.01, b - a),
          cw,
        },
      };
    },
    track(ctx) {
      stroked(ctx, () => {
        for (let i = 0; i < n; i++)
          arc(ctx, startOf(i), startOf(i) + seg, thickness);
      });
    },
    fillMask(ctx) {
      stroked(ctx, () => {
        for (let i = 0; i < n; i++)
          arc(ctx, startOf(i), startOf(i) + seg, innerThickness);
      });
    },
    region(ctx, cov, shaped) {
      if (shaped) {
        stroked(ctx, () => {
          for (const { i, a, b } of cov.parts)
            arc(
              ctx,
              startOf(i) + a * seg,
              startOf(i) + b * seg,
              innerThickness,
            );
        });
        return;
      }
      // Wedges from the centre, cut by the ring afterwards. Round caps sit
      // inside their segment's angles (see capOf), so a wedge needn't reach past it.
      ctx.beginPath();
      for (const { i, a, b } of cov.parts) {
        const from = startOf(i) + a * seg;
        const to = startOf(i) + b * seg;
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R * 2, angle(from), angle(to), !cw);
        ctx.closePath();
      }
      ctx.fill();
    },
    outlinePath(ctx, grow, wholeBar) {
      ctx.beginPath();
      const halfW = Math.max(0.5, thickness / 2 + grow);
      if (wholeBar) band(ctx, 0, sweep, halfW);
      else
        for (let i = 0; i < n; i++)
          band(ctx, startOf(i), startOf(i) + seg, halfW);
    },
    travel(cov) {
      if (center || !cov.parts.length) return { deg: 0 };
      return { deg: sign * relOf(reach(cov).max) };
    },
    tip(ctx, cov, size, color) {
      if (!cov.parts.length) return;
      const { max, min } = reach(cov);
      const band = deg(size / Math.max(1, mid));
      const edges = [];
      if (max < n - 1e-6) edges.push([relOf(max), 1]);
      if (center && min > 1e-6) edges.push([relOf(min), -1]);
      for (const [rel, dir] of edges) {
        // The glow lies behind the edge, on the filled side.
        const a0 = angle(rel - dir * band);
        const a1 = angle(rel);
        let d = (a1 - a0) % (Math.PI * 2);
        if (d < 0) d += Math.PI * 2;
        let g;
        if (d <= Math.PI) {
          g = ctx.createConicGradient(a0, cx, cy);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(d / (Math.PI * 2), color);
          g.addColorStop(
            Math.min(1, d / (Math.PI * 2) + 0.0005),
            'rgba(0,0,0,0)',
          );
        } else {
          const rest = Math.PI * 2 - d;
          g = ctx.createConicGradient(a1, cx, cy);
          g.addColorStop(0, color);
          g.addColorStop(rest / (Math.PI * 2), 'rgba(0,0,0,0)');
        }
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
    },
  };
}

// ─── Text as a bar ───────────────────────────────────────────────────────
// The letters are the bar: their shape is the track, and the fill reaches
// them as a sweep, one letter at a time, or stroke by stroke in the order the
// characters are written. Stroke order comes from KanjiVG (see
// utils/kanji-strokes.js); a character it doesn't know sweeps in instead.

// KanjiVG draws every character in a 109-unit square.
const KANJI_BOX = 109;
const SVG_NS = 'http://www.w3.org/2000/svg';
const strokeCache = new Map();

// A stroke's path, and how long it is, which is what the fill is measured in.
function strokeOf(d) {
  let hit = strokeCache.get(d);
  if (!hit) {
    let length = 0;
    try {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', d);
      length = el.getTotalLength();
    } catch {
      // an unreadable path counts as short
    }
    hit = { path: new Path2D(d), length: Math.max(1, length) };
    if (strokeCache.size > 5000) strokeCache.clear();
    strokeCache.set(d, hit);
  }
  return hit;
}

let scratch = null;
function measure(font, text) {
  scratch ??= document.createElement('canvas').getContext('2d');
  scratch.font = font;
  return scratch.measureText(text).width;
}

export const fontOf = (family, bold, size) => {
  const name = /\s/.test(family) ? `"${family}"` : family;
  return `${bold ? '700' : '400'} ${size}px ${name}, serif`;
};

export const TEXT_MODES = ['wipe', 'chars', 'strokes'];

function textGeometry(L) {
  const chars = [...String(L.text ?? '')].filter((c) => c.trim());
  const n = Math.max(1, chars.length);
  const down = L.textLayout === 'down';
  const gapK = Math.max(0, L.textSpacing ?? 0) / 100;
  const font = (size) => fontOf(L.textFont || 'serif', L.textBold, size);
  // Letters as big as the box allows, in a row or a column.
  let size;
  let boxes;
  if (down) {
    size = Math.max(1, Math.min(L.w * 0.95, L.h / (n + gapK * (n - 1))));
    const total = size * (n + gapK * (n - 1));
    const top = L.y + (L.h - total) / 2;
    boxes = chars.map((_, i) => ({
      x: L.x + (L.w - size) / 2,
      y: top + i * size * (1 + gapK),
      w: size,
      h: size,
    }));
  } else {
    const widths = chars.map((c) => measure(font(100), c) / 100);
    const unit = widths.reduce((a, b) => a + b, 0) + gapK * (n - 1);
    size = Math.max(1, Math.min(L.h * 0.95, L.w / Math.max(0.01, unit)));
    let x = L.x + (L.w - size * unit) / 2;
    boxes = chars.map((_, i) => {
      const b = { x, y: L.y + (L.h - size) / 2, w: widths[i] * size, h: size };
      x += b.w + gapK * size;
      return b;
    });
  }
  const extent = boxes.length
    ? {
        x: Math.min(...boxes.map((b) => b.x)),
        y: Math.min(...boxes.map((b) => b.y)),
        w:
          Math.max(...boxes.map((b) => b.x + b.w)) -
          Math.min(...boxes.map((b) => b.x)),
        h:
          Math.max(...boxes.map((b) => b.y + b.h)) -
          Math.min(...boxes.map((b) => b.y)),
      }
    : { x: L.x, y: L.y, w: L.w, h: L.h };
  const horizontal = !['ttb', 'btt', 'center-v'].includes(L.direction);
  const mirrored = L.direction === 'rtl' || L.direction === 'btt';
  const center = L.direction?.startsWith('center');
  const mode = TEXT_MODES.includes(L.textMode) ? L.textMode : 'wipe';
  const outlined = L.textStyle === 'outline';
  // Glyphs reach past their boxes (accents, brush tails), so anything cut
  // along them reaches past too.
  const slack = size * 0.4;

  function glyphs(ctx, only) {
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, ((L.textOutline ?? 6) / 100) * size);
    ctx.strokeStyle = ctx.fillStyle;
    chars.forEach((c, i) => {
      if (only !== undefined && only !== i) return;
      const b = boxes[i];
      if (outlined) ctx.strokeText(c, b.x + b.w / 2, b.y + b.h / 2);
      else ctx.fillText(c, b.x + b.w / 2, b.y + b.h / 2);
    });
  }

  // Every stroke in writing order, over all the characters. A character
  // without stroke data is one "stroke": itself, swept in.
  const strokes = [];
  chars.forEach((c, i) => {
    const data = L.strokeData?.[c];
    if (Array.isArray(data) && data.length)
      for (const d of data) strokes.push({ i, d, length: strokeOf(d).length });
    else strokes.push({ i, length: KANJI_BOX });
  });
  const totalLength = strokes.reduce((sum, k) => sum + k.length, 0) || 1;
  const pen = Math.max(0.5, ((L.textPen ?? 7) / 100) * KANJI_BOX);

  function drawStroke(ctx, k, f) {
    if (f <= 0) return;
    const b = boxes[k.i];
    // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
    ctx.save();
    if (k.d === undefined) {
      ctx.beginPath();
      ctx.rect(
        b.x - slack,
        b.y - slack,
        (b.w + slack * 2) * f,
        b.h + slack * 2,
      );
      ctx.clip();
      glyphs(ctx, k.i);
      ctx.restore();
      return;
    }
    const { path, length } = strokeOf(k.d);
    ctx.translate(b.x + (b.w - size) / 2, b.y + (b.h - size) / 2);
    ctx.scale(size / KANJI_BOX, size / KANJI_BOX);
    ctx.lineWidth = pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle;
    if (f < 1) {
      ctx.setLineDash([length, length]);
      ctx.lineDashOffset = length * (1 - f);
    }
    ctx.stroke(path);
    ctx.restore();
  }

  function strokesUpTo(ctx, t) {
    if (L.stepped) {
      const whole = Math.floor(t * strokes.length + 1e-6);
      for (const k of strokes.slice(0, whole)) drawStroke(ctx, k, 1);
      return;
    }
    let left = t * totalLength;
    for (const k of strokes) {
      if (left <= 0) break;
      drawStroke(ctx, k, Math.min(1, left / k.length));
      left -= k.length;
    }
  }

  // Sweeps work in the same segment units as bars: the whole text is one
  // segment, or each letter is one.
  const units = mode === 'chars' ? boxes : [extent];
  const unitCount = Math.max(1, units.length);
  const posOf = (u) => {
    const i = clamp(Math.floor(u), 0, unitCount - 1);
    const b = units[i] ?? extent;
    const f = clamp(u - i, 0, 1);
    return horizontal ? b.x + f * b.w : b.y + f * b.h;
  };
  const piece = (b, a, e) => {
    const lo = a === 0 ? -slack : 0;
    const hi = e === 1 ? slack : 0;
    return horizontal
      ? {
          x: b.x + a * b.w + lo,
          y: b.y - slack,
          w: (e - a) * b.w - lo + hi,
          h: b.h + slack * 2,
        }
      : {
          x: b.x - slack,
          y: b.y + a * b.h + lo,
          w: b.w + slack * 2,
          h: (e - a) * b.h - lo + hi,
        };
  };
  const reach = (cov) => ({
    max: Math.max(...cov.parts.map((q) => q.i + q.b)),
    min: Math.min(...cov.parts.map((q) => q.i + q.a)),
  });

  return {
    pathless: true,
    coverage(t) {
      if (mode === 'strokes') {
        const u = clamp(t, 0, 1);
        return {
          n: 1,
          lo: 0,
          hi: u,
          t: u,
          parts: u > 0 ? [{ i: 0, a: 0, b: u }] : [],
        };
      }
      return coverage({ ...L, segments: unitCount }, t);
    },
    cells: () => boxes,
    area(span) {
      if (!span || mode === 'strokes') return { box: extent };
      const a = posOf(span[0]);
      const b = Math.max(a + 1, posOf(span[1]));
      return {
        box: horizontal
          ? { x: a, y: extent.y, w: b - a, h: extent.h }
          : { x: extent.x, y: a, w: extent.w, h: b - a },
      };
    },
    track(ctx) {
      if (mode === 'strokes') {
        for (const k of strokes) drawStroke(ctx, k, 1);
        return;
      }
      glyphs(ctx);
    },
    fillMask(ctx) {
      this.track(ctx);
    },
    region(ctx, cov) {
      if (mode === 'strokes') return strokesUpTo(ctx, cov.t ?? cov.hi);
      for (const { i, a, b } of cov.parts) {
        const r = piece(units[i], a, b);
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    },
    travel(cov) {
      if (mode === 'strokes' || center || !cov.parts.length)
        return { dx: 0, dy: 0 };
      const { max, min } = reach(cov);
      const start = horizontal ? extent.x : extent.y;
      const end = start + (horizontal ? extent.w : extent.h);
      const d = mirrored ? posOf(min) - end : posOf(max) - start;
      return horizontal ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    },
    tip(ctx, cov, len, color) {
      if (mode === 'strokes' || !cov.parts.length) return;
      const { max, min } = reach(cov);
      const edges = [];
      if (!mirrored && max < unitCount - 1e-6) edges.push([posOf(max), 1]);
      if ((mirrored || center) && min > 1e-6) edges.push([posOf(min), -1]);
      for (const [q, dir] of edges) {
        const from = q - dir * len;
        const g = horizontal
          ? ctx.createLinearGradient(from, 0, q, 0)
          : ctx.createLinearGradient(0, from, 0, q);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        const lo = Math.min(from, q);
        if (horizontal)
          ctx.fillRect(lo, extent.y - slack, len, extent.h + slack * 2);
        else ctx.fillRect(extent.x - slack, lo, extent.w + slack * 2, len);
      }
    },
  };
}

// ─── A picture as a bar ──────────────────────────────────────────────────
// The picture is the bar: its outline (whatever isn't see-through) is the
// track, and the fill sweeps across it the way it does a text bar, in its
// own colours or the fill's. Not one segment's shape: the whole thing.

export const BAR_IMAGE_TRACKS = ['faded', 'paint'];

function imageGeometry(L) {
  const img = imageOf(L.barImage);
  const box = img ? fitInto(img, { x: L.x, y: L.y, w: L.w, h: L.h }, L.barImageFit === 'stretch' ? 'stretch' : 'contain') : { x: L.x, y: L.y, w: L.w, h: L.h };
  const horizontal = !['ttb', 'btt', 'center-v'].includes(L.direction);
  const mirrored = L.direction === 'rtl' || L.direction === 'btt';
  const center = L.direction?.startsWith('center');
  const n = Math.max(1, Math.round(L.segments) || 1);
  // The picture is cut into `segments` equal stretches along the way it fills.
  const cell = (i) =>
    horizontal
      ? { x: box.x + (i * box.w) / n, y: box.y, w: box.w / n, h: box.h }
      : { x: box.x, y: box.y + (i * box.h) / n, w: box.w, h: box.h / n };
  const posOf = (u) => (horizontal ? box.x + (u / n) * box.w : box.y + (u / n) * box.h);
  // Its silhouette in the context's fill colour.
  function silhouette(ctx) {
    if (!img) {
      ctx.fillRect(box.x, box.y, box.w, box.h);
      return;
    }
    const colour = ctx.fillStyle;
    // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
    ctx.save();
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  }
  const reach = (cov) => ({
    max: Math.max(...cov.parts.map((q) => q.i + q.b)),
    min: Math.min(...cov.parts.map((q) => q.i + q.a)),
  });
  return {
    pathless: true,
    image: img,
    box,
    coverage: (t) => coverage({ ...L, segments: n }, t),
    cells: () => Array.from({ length: n }, (_, i) => cell(i)),
    area(span) {
      if (!span) return { box };
      const a = posOf(span[0]);
      const b = Math.max(a + 1, posOf(span[1]));
      return { box: horizontal ? { x: a, y: box.y, w: b - a, h: box.h } : { x: box.x, y: a, w: box.w, h: b - a } };
    },
    track: silhouette,
    fillMask: silhouette,
    region(ctx, cov) {
      for (const { i, a, b } of cov.parts) {
        const c = cell(i);
        const r = horizontal ? { x: c.x + a * c.w, y: c.y, w: (b - a) * c.w, h: c.h } : { x: c.x, y: c.y + a * c.h, w: c.w, h: (b - a) * c.h };
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    },
    travel(cov) {
      if (center || !cov.parts.length) return { dx: 0, dy: 0 };
      const { max, min } = reach(cov);
      const start = horizontal ? box.x : box.y;
      const end = start + (horizontal ? box.w : box.h);
      const d = mirrored ? posOf(min) - end : posOf(max) - start;
      return horizontal ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    },
    tip(ctx, cov, len, color) {
      if (!cov.parts.length) return;
      const { max, min } = reach(cov);
      const edges = [];
      if (!mirrored && max < n - 1e-6) edges.push([posOf(max), 1]);
      if ((mirrored || center) && min > 1e-6) edges.push([posOf(min), -1]);
      for (const [q, dir] of edges) {
        const from = q - dir * len;
        const g = horizontal ? ctx.createLinearGradient(from, 0, q, 0) : ctx.createLinearGradient(0, from, 0, q);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        const lo = Math.min(from, q);
        if (horizontal) ctx.fillRect(lo, box.y, len, box.h);
        else ctx.fillRect(box.x, lo, box.w, len);
      }
    },
  };
}

export const geometryOf = (L) =>
  L.shape === 'text'
    ? textGeometry(L)
    : L.shape === 'ring'
      ? ringGeometry(L)
      : L.shape === 'image'
        ? imageGeometry(L)
        : linearGeometry(L);

// ─── Rendering ───────────────────────────────────────────────────────────

function blank(env) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(env.width * env.scale));
  canvas.height = Math.max(1, Math.round(env.height * env.scale));
  return canvas.getContext('2d');
}

// A layer's own transform: scale to output size, then its rotation (and a
// bar's skew) about the middle of its box.
function place(ctx, layer, env) {
  ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
  if (layer.type === 'paint') return;
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  ctx.translate(cx, cy);
  if (layer.rotation) ctx.rotate(rad(layer.rotation));
  if (layer.type === 'bar' && layer.skew)
    ctx.transform(1, 0, Math.tan(rad(layer.skew)), 1, 0, 0);
  ctx.translate(-cx, -cy);
}

// Pixel-for-pixel canvas-on-canvas, whatever transform `dst` has.
function stamp(dst, src, op = 'source-over', alpha = 1) {
  // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = op;
  dst.globalAlpha = alpha;
  dst.drawImage(src.canvas, 0, 0);
  dst.restore();
}

// Only the shadow of `src`: the picture itself is drawn far off the canvas
// and its shadow thrown back into view.
function shadowOf(dst, src, env, { color, blur, x = 0, y = 0 }, alpha = 1) {
  const away = src.canvas.width + 4096;
  // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalAlpha = alpha;
  dst.shadowColor = color;
  dst.shadowBlur = Math.max(0, blur) * env.scale;
  dst.shadowOffsetX = x * env.scale + away;
  dst.shadowOffsetY = y * env.scale;
  dst.drawImage(src.canvas, -away, 0);
  dst.restore();
}

// `src`'s shape, all in one colour.
function tinted(src, env, color) {
  const c = blank(env);
  stamp(c, src);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  c.globalCompositeOperation = 'source-over';
  return c;
}

// `src`'s shape spread out by `width` all round, in one colour: an outline
// once the original is drawn back over it. Canvas has no way to stroke a
// picture's edge, so the silhouette is stamped in a circle around itself.
function spread(src, env, width, color) {
  const sil = tinted(src, env, color);
  const out = blank(env);
  const w = Math.max(0, width) * env.scale;
  const rings = w > 6 ? [w, w * 0.66, w * 0.33] : [w];
  for (const r of rings)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      out.drawImage(sil.canvas, Math.cos(a) * r, Math.sin(a) * r);
    }
  out.drawImage(sil.canvas, 0, 0);
  return out;
}

// Covers the picture whatever the layer is rotated or skewed by.
function everywhere(ctx, env) {
  const r = Math.hypot(env.width, env.height) * 2;
  ctx.fillRect(-r, -r, r * 3, r * 3);
}

export const PATTERNS = ['stripes', 'dots', 'checker', 'crosshatch'];

const tiles = new Map();

// One repeat of a pattern, in document pixels, cached: they're drawn for
// every step of every thumbnail.
const imageTiles = new WeakMap();

// A picture repeated as a pattern: one copy per tile, fitted into `size`,
// with `gap` around it.
function imageTile(p) {
  const img = imageOf(p.src);
  if (!img) return null;
  const size = Math.max(2, Math.round(p.width));
  const gap = Math.max(0, Math.round(p.gap ?? 0));
  const key = [size, gap, p.alpha].join('|');
  let byKey = imageTiles.get(img);
  if (!byKey) imageTiles.set(img, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size + gap;
  const x = c.getContext('2d');
  x.globalAlpha = clamp(p.alpha, 0, 100) / 100;
  const at = fitInto(
    img,
    { x: gap / 2, y: gap / 2, w: size, h: size },
    'contain',
  );
  x.drawImage(img, at.x, at.y, at.w, at.h);
  byKey.set(key, c);
  return c;
}

function patternTile(p) {
  if (p.kind === 'image') return imageTile(p);
  const size = Math.max(1, Math.round(p.width));
  const gap = Math.max(0, Math.round(p.gap ?? size));
  const period = Math.max(2, size + gap);
  const color = rgba(p.color, p.alpha);
  const key = [p.kind, size, gap, color].join('|');
  if (tiles.has(key)) return tiles.get(key);
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  x.fillStyle = color;
  if (p.kind === 'dots') {
    c.width = period;
    c.height = period * 2;
    x.fillStyle = color;
    for (const [dx, dy] of [
      [period / 2, period / 2],
      [0, period * 1.5],
      [period, period * 1.5],
    ]) {
      x.beginPath();
      x.arc(dx, dy, size / 2, 0, Math.PI * 2);
      x.fill();
    }
  } else if (p.kind === 'checker') {
    c.width = c.height = size * 2;
    x.fillStyle = color;
    x.fillRect(0, 0, size, size);
    x.fillRect(size, size, size, size);
  } else if (p.kind === 'crosshatch') {
    c.width = c.height = period;
    x.fillStyle = color;
    x.fillRect(0, 0, size, period);
    x.fillRect(size, 0, period - size, size);
  } else {
    c.width = period;
    c.height = 4;
    x.fillStyle = color;
    x.fillRect(0, 0, size, 4);
  }
  if (tiles.size > 64) tiles.clear();
  tiles.set(key, c);
  return c;
}

// The pattern on a bar's fill. Pinned to the picture it stays put and the
// fill uncovers it (the Chowder look); riding with the fill it moves as the
// fill grows; drifting it slides a set amount each step.
function drawPattern(ctx, L, box, env, travel) {
  const p = L.stripes;
  const tile = patternTile(p);
  if (!tile) return;
  const reach = Math.hypot(env.width, env.height) + tile.width * 4;
  // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  if (p.anchor === 'fill') {
    if (travel.deg) ctx.rotate(rad(travel.deg));
    else ctx.translate(travel.dx ?? 0, travel.dy ?? 0);
  }
  ctx.rotate(rad(p.angle));
  if (p.anchor === 'drift')
    ctx.translate(((p.move ?? 0) * env.frame) % tile.width, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
  ctx.restore();
}

export const SHINES = ['top', 'glass', 'sheen', 'shade'];

function drawShine(ctx, L, box) {
  const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  const a = clamp(L.shine.alpha, 0, 100) / 100;
  const white = (k) => `rgba(255,255,255,${a * k})`;
  const stops = {
    top: [
      [0, white(1)],
      [0.45, white(0.35)],
      [0.5, white(0)],
      [1, white(0)],
    ],
    glass: [
      [0, white(0.1)],
      [0.3, white(1)],
      [0.55, white(0)],
      [1, white(0)],
    ],
    sheen: [
      [0, white(1)],
      [1, white(0)],
    ],
    shade: [
      [0, 'rgba(0,0,0,0)'],
      [0.5, 'rgba(0,0,0,0)'],
      [1, `rgba(0,0,0,${a})`],
    ],
  }[L.shine.style] ?? [[0, white(1)]];
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

const grains = new Map();

// Film grain: a tile of random greys from a fixed seed, so the same step
// always gets the same grain.
function grainTile(seed, size) {
  const key = `${seed}|${size}`;
  if (grains.has(key)) return grains.get(key);
  const cells = 64;
  const c = document.createElement('canvas');
  c.width = c.height = cells * size;
  const x = c.getContext('2d');
  let s = seed * 2654435761;
  const random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const v = Math.round(random() * 255);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(i * size, j * size, size, size);
    }
  if (grains.size > 32) grains.clear();
  grains.set(key, c);
  return c;
}

function drawGrain(ctx, L, env) {
  const g = L.grain;
  const tile = grainTile(
    g.animate ? env.frame + 1 : 1,
    Math.max(1, Math.round(g.size)),
  );
  // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = clamp(g.alpha, 0, 100) / 100;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// A shadow cast inwards from the edge of `mask`, for a bar that looks sunk in.
function drawInnerShadow(out, mask, fx, env) {
  const hole = blank(env);
  hole.fillStyle = '#000';
  hole.fillRect(0, 0, hole.canvas.width, hole.canvas.height);
  stamp(hole, mask, 'destination-out');
  const sh = blank(env);
  shadowOf(sh, hole, env, {
    color: rgba(fx.color, fx.alpha),
    blur: fx.size,
    x: fx.x,
    y: fx.y,
  });
  stamp(sh, mask, 'destination-in');
  stamp(out, sh);
}

// The filled part's shape, white where filled.
function filledShape(geo, L, env, cov) {
  const shape = blank(env);
  if (!cov.parts.length) return shape;
  const shaped = L.fillEnds === 'shape' && L.shape !== 'text' && L.shape !== 'image';
  place(shape, L, env);
  shape.fillStyle = '#fff';
  geo.region(shape, cov, shaped);
  if (!shaped) {
    const inner = blank(env);
    place(inner, L, env);
    inner.fillStyle = '#fff';
    geo.fillMask(inner);
    stamp(shape, inner, 'destination-in');
  }
  return shape;
}

export const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double'];

// A bar's outline as a real stroke, so it can be dashed, dotted, doubled,
// painted with a gradient, and set outside, on or inside the edge.
// `mask` shrunk by `width` all round.
function erode(mask, env, width) {
  const outside = blank(env);
  outside.fillStyle = '#000';
  outside.fillRect(0, 0, outside.canvas.width, outside.canvas.height);
  stamp(outside, mask, 'destination-out');
  const shrunk = blank(env);
  stamp(shrunk, mask);
  stamp(shrunk, spread(outside, env, width, '#000'), 'destination-out');
  return shrunk;
}

// Text and picture-shaped bars have no path to stroke, so their outline is
// traced from their shape instead: always solid.
function drawTracedStroke(out, mask, L, env, geo) {
  const s = L.stroke;
  const w = s.width;
  const [grow, shrink] =
    s.position === 'inside'
      ? [0, w]
      : s.position === 'center'
        ? [w / 2, w / 2]
        : [w, 0];
  const ring = grow ? spread(mask, env, grow, '#fff') : blank(env);
  if (!grow) stamp(ring, mask);
  stamp(ring, shrink ? erode(mask, env, shrink) : mask, 'destination-out');
  ring.globalCompositeOperation = 'source-in';
  place(ring, L, env);
  ring.fillStyle = paintStyle(ring, s.paint, geo.area());
  everywhere(ring, env);
  stamp(out, ring);
}

function drawStroke(out, geo, L, env, mask) {
  const s = L.stroke;
  if (!s?.on || !(s.width > 0)) return;
  if (geo.pathless) return drawTracedStroke(out, mask, L, env, geo);
  const c = blank(env);
  place(c, L, env);
  const w = s.width;
  const grow =
    s.position === 'outside' ? w / 2 : s.position === 'inside' ? -w / 2 : 0;
  geo.outlinePath(c, grow, s.around === 'bar');
  c.lineWidth = w;
  c.lineCap = s.cap ?? 'butt';
  c.lineJoin = s.cap === 'round' ? 'round' : 'miter';
  if (s.style === 'dashed')
    c.setLineDash([Math.max(1, s.dash), Math.max(1, s.gap)]);
  if (s.style === 'dotted') {
    c.lineCap = 'round';
    c.setLineDash([0.001, Math.max(1, s.gap) + w]);
  }
  c.lineDashOffset = -(s.march ?? 0) * env.frame;
  c.strokeStyle = paintStyle(c, s.paint, geo.area());
  c.stroke();
  if (s.style === 'double') {
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = w / 3;
    c.stroke();
  }
  stamp(out, c);
}

// The parts a meter can be drawn in, one picture each ("render in layers",
// and the Complex Separate skill, core/barskill.js): the container (the
// track, its inner shadow and outline, and every layer under the bars that
// never changes), the meter (the fill and all that comes with it, and the
// layers that change with the steps), the leading edge on its own, the
// catch-up trail at the step's own level (shown behind the meter for a
// moment when it goes down), the front (layers over the bars that never
// change), and an extra for each set of steps that a layer shows on only
// ("extra:<from>-<to>", shown on those steps and taken off the rest).
// 'meterLead' is the meter with its leading edge, as the skill shows it.
export const PARTS = ['container', 'meter', 'lead', 'trail', 'front'];
const wants = (env, part) => !env.part || env.part === part || (env.part === 'meterLead' && (part === 'meter' || part === 'lead'));

// Returns the filled part's shape (white where filled), for clipping.
function drawBar(out, L, env) {
  const geo = geometryOf(L);
  const t = env.frames ? env.frame / env.frames : 0;
  const covAt = (at) => (geo.coverage ? geo.coverage(at) : coverage(L, at));
  const cov = covAt(t);
  const shape = filledShape(geo, L, env, cov);
  const mask = blank(env);
  place(mask, L, env);
  mask.fillStyle = '#fff';
  geo.track(mask);
  // A picture bar in its own colours: the picture is the fill.
  const fill = L.shape === 'image' && L.barImageOwn && L.barImage ? { type: 'image', src: L.barImage, fit: L.barImageFit === 'stretch' ? 'stretch' : 'contain' } : L.fill;
  const fillBox = L.shape === 'image' ? { box: geo.box } : null;

  if (L.trackOn && wants(env, 'container')) {
    const tr = blank(env);
    place(tr, L, env);
    if (L.shape === 'image' && L.barImageTrack !== 'paint' && geo.image) {
      // The picture itself, greyed and dimmed, as what's still to fill.
      // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
      tr.save();
      tr.filter = 'grayscale(1) brightness(0.55)';
      tr.globalAlpha = clamp(sortedStops(L.track)[0]?.alpha ?? 100, 0, 100) / 100;
      tr.drawImage(geo.image, geo.box.x, geo.box.y, geo.box.w, geo.box.h);
      tr.restore();
    } else fillWith(tr, L.track, geo.area(), geo, env);
    stamp(tr, mask, 'destination-in');
    if (L.trackCut) stamp(tr, shape, 'destination-out');
    stamp(out, tr);
  }

  // The catch-up trail as its own picture: at this step's level, where the
  // meter was before it went down.
  if (env.part === 'trail') {
    if (L.trail?.on && cov.parts.length) stamp(out, tinted(shape, env, rgba(L.trail.color, L.trail.alpha)));
    return shape;
  }

  // The catch-up trail runs a little ahead of the fill.
  if (L.trail?.on && t < 1 && !env.part) {
    const ahead = filledShape(
      geo,
      L,
      env,
      covAt(Math.min(1, t + L.trail.amount / 100)),
    );
    stamp(out, tinted(ahead, env, rgba(L.trail.color, L.trail.alpha)));
  }

  if (cov.parts.length && env.part === 'lead') {
    // The leading edge on its own.
    if (L.tip?.on) {
      const f = blank(env);
      place(f, L, env);
      geo.tip(f, cov, Math.max(1, L.tip.size), rgba(L.tip.color, L.tip.alpha));
      stamp(f, shape, 'destination-in');
      stamp(out, f);
    }
  } else if (cov.parts.length && wants(env, 'meter')) {
    const f = blank(env);
    place(f, L, env);
    const whole = fillBox ?? geo.area();
    if (L.fillMode === 'progress' && fill.type !== 'image') {
      f.fillStyle = sampleStops(fill.stops, t * 100);
      everywhere(f, env);
    } else
      fillWith(
        f,
        fill,
        L.fillMode === 'stretch' && !fillBox ? geo.area([cov.lo, cov.hi]) : whole,
        geo,
        env,
      );
    if (L.stripes?.on) drawPattern(f, L, whole.box, env, geo.travel(cov));
    if (L.shine?.on) drawShine(f, L, whole.box);
    if (L.tip?.on && wants(env, 'lead'))
      geo.tip(f, cov, Math.max(1, L.tip.size), rgba(L.tip.color, L.tip.alpha));
    if (L.grain?.on) drawGrain(f, L, env);
    if (L.flash?.on && t >= 1) {
      f.fillStyle = rgba(L.flash.color, L.flash.alpha);
      everywhere(f, env);
    }
    stamp(f, shape, 'destination-in');

    if (L.fillStroke?.on && L.fillStroke.width > 0)
      stamp(
        out,
        spread(
          shape,
          env,
          L.fillStroke.width,
          rgba(L.fillStroke.color, L.fillStroke.alpha),
        ),
      );
    if (L.glow?.on) {
      const strength = L.glow.grow ? t : 1;
      shadowOf(out, f, env, {
        color: rgba(L.glow.color, L.glow.alpha * strength),
        blur: L.glow.size,
      });
    }
    stamp(out, f);
  }

  if (wants(env, 'container')) {
    if (L.innerShadow?.on) drawInnerShadow(out, mask, L.innerShadow, env);
    drawStroke(out, geo, L, env, mask);
  } else if (env.part !== 'trail' && cov.parts.length && (L.innerShadow?.on || L.stroke?.on)) {
    // Drawn in parts, the meter sits in front of the container and would
    // hide the container's inner shadow and outline where it covers them:
    // they're baked into the meter there, as they look all in one.
    const over = blank(env);
    if (L.innerShadow?.on) drawInnerShadow(over, mask, L.innerShadow, env);
    drawStroke(over, geo, L, env, mask);
    const cover = blank(env);
    stamp(cover, out);
    stamp(over, cover, 'destination-in');
    stamp(out, over);
  }
  return shape;
}

// The shape's outline as a Path2D, so it can be filled and stroked alike.
// Polygons and stars sit in the layer's box (an ellipse round them), their
// corners rounded by `radius`; a path is its SVG data stretched to the box.
export function shapeOutline(L, radius = L.radius) {
  const { x, y, w, h } = L;
  const p = new Path2D();
  const kind = L.shape ?? 'rect';
  const around = (n, at) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = at(i);
      pts.push([x + w / 2 + (Math.cos(a) * w * r) / 2, y + h / 2 + (Math.sin(a) * h * r) / 2]);
    }
    return pts;
  };
  if (kind === 'ellipse') p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  else if (kind === 'triangle')
    polyPath(p, [[x + w / 2, y], [x + w, y + h], [x, y + h]], radius);
  else if (kind === 'diamond')
    polyPath(p, [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]], radius);
  else if (kind === 'polygon') polyPath(p, around(clamp(Math.round(L.sides ?? 6), 3, 64), () => 1), radius);
  else if (kind === 'star') {
    const n = clamp(Math.round(L.points ?? 5), 2, 64);
    polyPath(p, around(n * 2, (i) => (i % 2 ? clamp(L.inner ?? 45, 2, 100) / 100 : 1)), radius);
  } else if (kind === 'path' && L.d) {
    const m = new DOMMatrix().translateSelf(x, y).scaleSelf(w / 100, h / 100);
    try {
      p.addPath(new Path2D(L.d), m);
    } catch {
      // not a path the browser can read
    }
  } else roundRectPath(p, { x, y, w, h }, radius);
  return p;
}

function drawShape(ctx, L) {
  const outline = shapeOutline(L);
  if (L.fillOn && L.closed !== false) {
    ctx.fillStyle = paintStyle(ctx, L.fill, { box: L });
    ctx.fill(outline, 'nonzero');
  }
  if (L.stroke > 0) {
    // The outline can round its corners on its own.
    const line = L.strokeOwnRadius && !['ellipse', 'path'].includes(L.shape) ? shapeOutline(L, L.strokeRadius ?? 0) : outline;
    ctx.lineWidth = L.stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(L.strokeColor, L.strokeAlpha);
    ctx.stroke(line);
  }
}

function drawText(ctx, L, env) {
  const lines = fillTokens(L.text, env.frame, env.frames).split('\n');
  const family = /\s/.test(L.font) ? `"${L.font}"` : L.font;
  ctx.font = `${L.italic ? 'italic ' : ''}${L.bold ? '700' : '400'} ${L.size}px ${family}, sans-serif`;
  ctx.textAlign = L.align;
  ctx.textBaseline = 'middle';
  const x =
    L.align === 'left' ? L.x : L.align === 'right' ? L.x + L.w : L.x + L.w / 2;
  const lineHeight = L.size * 1.15;
  const top = L.y + L.h / 2 - ((lines.length - 1) * lineHeight) / 2;
  ctx.fillStyle = paintStyle(ctx, L.fill, { box: L });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = L.strokeColor;
  ctx.lineWidth = L.stroke * 2;
  lines.forEach((line, i) => {
    if (L.stroke > 0) ctx.strokeText(line, x, top + i * lineHeight);
    ctx.fillText(line, x, top + i * lineHeight);
  });
}

// The layer drawn on its own, and the shape layers clipped to it show through.
function renderLayer(L, env) {
  const ctx = blank(env);
  place(ctx, L, env);
  let clipShape = ctx;
  if (L.type === 'bar') {
    const filled = drawBar(ctx, L, env);
    if (L.clipTo !== 'all') clipShape = filled;
  } else if (L.type === 'shape') drawShape(ctx, L);
  else if (L.type === 'text') drawText(ctx, L, env);
  else {
    const source =
      env.override?.id === L.id ? env.override.canvas : env.resolve?.(L.src);
    if (source) {
      if (L.type === 'paint')
        ctx.drawImage(source, 0, 0, env.width, env.height);
      else ctx.drawImage(source, L.x, L.y, L.w, L.h);
    }
  }
  return { ctx: withFx(ctx, L, env), clipShape };
}

// Whether a layer that isn't a bar looks different from step to step: text
// with a {percent} or the like in it, or a fade or range over the steps.
function changesByStep(L) {
  return (L.type === 'text' && /\{(percent|frame|frames|left)\}/.test(L.text ?? '')) || Boolean(L.fx?.fade?.on || L.fx?.range?.on || (L.fx?.glitch?.on && L.fx.glitch.animate));
}

// Which part of a meter drawn in parts a layer that isn't a bar belongs to:
// 'meter' if it changes with the steps, an extra if it only shows on some
// (and is the same on all of them), else 'container' under the bars,
// 'front' over them, and 'meter' between two bars (to keep their order).
function roleOf(L, index, doc) {
  if (changesByStep({ ...L, fx: { ...L.fx, range: { on: false } } })) return 'meter';
  if (L.fx?.range?.on) return extraKey(L.fx.range);
  const bars = doc.layers.map((l, i) => (l.type === 'bar' ? i : -1)).filter((i) => i >= 0);
  if (!bars.length || index < bars[0]) return 'container';
  if (index > bars.at(-1)) return 'front';
  return 'meter';
}

const extraKey = (range) => `extra:${Math.round(range.from * 100) / 100}-${Math.round(range.to * 100) / 100}`;

// The steps (0…frames) a range shows on, as layerAlpha has it.
function stepsIn(range, frames) {
  const out = [];
  for (let k = 0; k <= frames; k++) {
    const pct = frames ? (k / frames) * 100 : 0;
    if (pct >= range.from - 1e-6 && pct <= range.to + 1e-6) out.push(k);
  }
  return out;
}

/**
 * The pictures a meter drawn in parts needs besides the container, the
 * meter and the trail: { front, extras: [{ key, label, steps, above }] }.
 * `front` when layers over the bars never change; an extra for each set of
 * steps that layers show on only (`above`: over the bars or not).
 */
export function separateParts(doc) {
  const bars = doc.layers.map((l, i) => (l.type === 'bar' && l.visible ? i : -1)).filter((i) => i >= 0);
  let front = false;
  const extras = new Map();
  doc.layers.forEach((L, i) => {
    if (!L.visible || L.type === 'bar' || L.clip) return;
    const role = roleOf(L, i, doc);
    if (role === 'front') front = true;
    if (!role.startsWith('extra:')) return;
    const steps = stepsIn(L.fx.range, doc.frames);
    if (!steps.length) return;
    const above = bars.length > 0 && i > bars[0];
    const was = extras.get(role);
    extras.set(role, {
      key: role,
      label: `Steps ${steps[0]}${steps.length > 1 ? `–${steps.at(-1)}` : ''}`,
      steps,
      above: was ? was.above || above : above,
    });
  });
  return { front, extras: [...extras.values()] };
}

/** Whether a design has a part to draw: 'lead' (a leading edge) or 'trail' (a catch-up trail). */
export const hasPart = (doc, part) =>
  doc.layers.some((l) => l.type === 'bar' && l.visible && (part === 'lead' ? l.tip?.on : part === 'trail' ? l.trail?.on : true));

// How see-through a layer is on this step, or 0 when it's hidden on it.
function layerAlpha(L, env) {
  const pct = env.frames ? (env.frame / env.frames) * 100 : 0;
  const fx = L.fx ?? {};
  if (fx.range?.on && (pct < fx.range.from - 1e-6 || pct > fx.range.to + 1e-6))
    return 0;
  let alpha = L.opacity / 100;
  if (fx.fade?.on)
    alpha *=
      clamp(fx.fade.from + ((fx.fade.to - fx.fade.from) * pct) / 100, 0, 100) /
      100;
  return alpha;
}

// Effects that change the layer's own pixels: the stylising ones (blur,
// pixels, a bevel, halftone, scanlines, a glitch, colour fringes, a 3D
// tilt), then a colour laid over it and an outline round it.
function withFx(ctx, L, env) {
  const fx = L.fx;
  if (!fx) return ctx;
  let out = ctx;
  if (fx.blur?.on && fx.blur.amount > 0) out = blurred(out, env, fx.blur.amount);
  if (fx.pixelate?.on && fx.pixelate.size > 1) out = pixelated(out, env, fx.pixelate.size);
  if (fx.bevel?.on) out = beveled(out, env, fx.bevel);
  if (fx.halftone?.on) out = halftoned(out, env, fx.halftone);
  if (fx.scanlines?.on) out = scanlined(out, env, fx.scanlines);
  if (fx.glitch?.on && fx.glitch.amount > 0) out = glitched(out, env, fx.glitch, env.frame);
  if (fx.chroma?.on && fx.chroma.amount > 0) out = aberrated(out, env, fx.chroma);
  if (fx.tilt?.on) out = tilted(out, env, fx.tilt, L);
  if (fx.overlay?.on) {
    const tint = tinted(out, env, rgba(fx.overlay.color, fx.overlay.alpha));
    stamp(out, tint, fx.overlay.blend || 'source-over');
  }
  if (fx.outline?.on && fx.outline.width > 0) {
    const ring = spread(
      out,
      env,
      fx.outline.width,
      rgba(fx.outline.color, fx.outline.alpha),
    );
    stamp(ring, out);
    out = ring;
  }
  return out;
}

// Draws a finished layer, with its drop shadow, outer glow and extrusion
// under it (unless `under` is false).
function stampLayer(dst, src, L, env, alpha, under = true) {
  const fx = L.fx ?? {};
  if (!under) return stamp(dst, src, L.blend, alpha);
  if (fx.extrude?.on) drawExtrusion(dst, src, env, fx.extrude, alpha);
  if (fx.shadow?.on)
    shadowOf(
      dst,
      src,
      env,
      {
        color: rgba(fx.shadow.color, fx.shadow.alpha),
        blur: fx.shadow.blur,
        x: fx.shadow.x,
        y: fx.shadow.y,
      },
      alpha,
    );
  if (fx.outerGlow?.on)
    for (let k = 0; k < 2; k++)
      shadowOf(
        dst,
        src,
        env,
        {
          color: rgba(fx.outerGlow.color, fx.outerGlow.alpha),
          blur: fx.outerGlow.size,
        },
        alpha,
      );
  stamp(dst, src, L.blend, alpha);
}

// ─── Stylising effects ──────────────────────────────────────────────────
// Effects that redraw a layer's pixels: halftone, chromatic aberration, a
// glitch, pixels, blur, scanlines, a bevel, a tilt in 3D; and an extrusion
// drawn under it (stampLayer). Sizes are in document pixels, so thumbnails
// (env.scale) look the same, only smaller.

// A small seeded random, so a glitch looks the same every time a step is drawn.
function seeded(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function blurred(src, env, amount) {
  const out = blank(env);
  out.filter = `blur(${Math.max(0, amount) * env.scale}px)`;
  out.drawImage(src.canvas, 0, 0);
  out.filter = 'none';
  return out;
}

function pixelated(src, env, size) {
  const cell = Math.max(1, size * env.scale);
  const W = src.canvas.width;
  const H = src.canvas.height;
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(W / cell));
  small.height = Math.max(1, Math.round(H / cell));
  const sc = small.getContext('2d');
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(src.canvas, 0, 0, small.width, small.height);
  const out = blank(env);
  out.imageSmoothingEnabled = false;
  out.drawImage(small, 0, 0, W, H);
  return out;
}

export const HALFTONE_SHAPES = ['dots', 'lines', 'squares'];

// Printed dots (or lines, or squares) on a turned grid, each as big as the
// layer is solid there; `tone` sizes them by how light or dark it is too.
function halftoned(src, env, h) {
  const W = src.canvas.width;
  const H = src.canvas.height;
  const cell = Math.max(2, h.size * env.scale);
  const a = rad(h.angle ?? 45);
  const D = Math.ceil(Math.hypot(W, H));
  const n = Math.max(1, Math.ceil(D / cell));
  const span = n * cell;
  // The layer turned back by the grid's angle, one pixel per cell.
  const small = document.createElement('canvas');
  small.width = n;
  small.height = n;
  const sc = small.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingQuality = 'high';
  sc.scale(1 / cell, 1 / cell);
  sc.translate(span / 2, span / 2);
  sc.rotate(-a);
  sc.translate(-W / 2, -H / 2);
  sc.drawImage(src.canvas, 0, 0);
  const px = sc.getImageData(0, 0, n, n).data;
  const out = blank(env);
  const under = clamp(h.under ?? 0, 0, 100) / 100;
  if (under > 0) stamp(out, src, 'source-over', under);
  out.translate(W / 2, H / 2);
  out.rotate(a);
  out.translate(-span / 2, -span / 2);
  const ink = h.ink === 'own' ? null : rgba(h.color ?? '#000000', 100);
  const scale = clamp(h.scale ?? 100, 0, 200) / 100;
  out.globalAlpha = clamp(h.alpha ?? 100, 0, 100) / 100;
  if (ink) out.fillStyle = ink;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4;
      const alpha = px[k + 3] / 255;
      if (alpha < 0.02) continue;
      const lum = (0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) / 255;
      const tone = h.tone === 'dark' ? 1 - lum : h.tone === 'light' ? lum : 1;
      const v = alpha * tone * scale;
      if (v <= 0.01) continue;
      if (!ink) out.fillStyle = `rgb(${px[k]},${px[k + 1]},${px[k + 2]})`;
      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      if (h.shape === 'lines') {
        const t = Math.min(cell, cell * v);
        out.fillRect(i * cell, cy - t / 2, cell + 0.5, t);
      } else if (h.shape === 'squares') {
        const s = Math.min(cell, cell * Math.sqrt(v));
        out.fillRect(cx - s / 2, cy - s / 2, s, s);
      } else {
        out.beginPath();
        out.arc(cx, cy, (cell / 2) * Math.sqrt(v) * 1.42, 0, Math.PI * 2);
        out.fill();
      }
    }
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalAlpha = 1;
  return out;
}

// Red one way, blue the other, green where it was: a lens's colour fringes.
function aberrated(src, env, c) {
  const W = src.canvas.width;
  const H = src.canvas.height;
  const d = (c.amount ?? 6) * env.scale;
  const dx = Math.round(Math.cos(rad(c.angle ?? 0)) * d);
  const dy = Math.round(Math.sin(rad(c.angle ?? 0)) * d);
  const data = src.getImageData(0, 0, W, H).data;
  const out = blank(env);
  const img = out.createImageData(W, H);
  const o = img.data;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : (y * W + x) * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = at(x - dx, y - dy);
      const g = (y * W + x) * 4;
      const b = at(x + dx, y + dy);
      const ar = r < 0 ? 0 : data[r + 3];
      const ag = data[g + 3];
      const ab = b < 0 ? 0 : data[b + 3];
      const A = Math.max(ar, ag, ab);
      if (!A) continue;
      // Each channel as much as its own pixel covers, over the strongest.
      o[g] = r < 0 ? 0 : (data[r] * ar) / A;
      o[g + 1] = (data[g + 1] * ag) / A;
      o[g + 2] = b < 0 ? 0 : (data[b + 2] * ab) / A;
      o[g + 3] = A;
    }
  out.putImageData(img, 0, 0);
  return out;
}

// Horizontal slices torn sideways, different every step if it animates.
function glitched(src, env, g, frame) {
  const W = src.canvas.width;
  const H = src.canvas.height;
  const rand = seeded(g.animate ? frame + 1 : 7);
  const out = blank(env);
  const slices = Math.max(1, Math.round(g.slices ?? 12));
  const amount = (g.amount ?? 30) * env.scale;
  let y = 0;
  while (y < H) {
    const h = Math.max(1, Math.round((H / slices) * (0.3 + rand() * 1.4)));
    const torn = rand() < 0.55;
    const shift = torn ? Math.round((rand() * 2 - 1) * amount) : 0;
    out.drawImage(src.canvas, 0, y, W, h, shift, y, W, h);
    y += h;
  }
  return out;
}

function scanlined(src, env, s) {
  const out = blank(env);
  stamp(out, src);
  const gap = Math.max(2, (s.gap ?? 6) * env.scale);
  out.globalCompositeOperation = 'source-atop';
  out.fillStyle = rgba(s.color ?? '#000000', s.alpha ?? 35);
  for (let y = 0; y < out.canvas.height; y += gap) out.fillRect(0, y, out.canvas.width, Math.max(1, gap / 2));
  out.globalCompositeOperation = 'source-over';
  return out;
}

// Light from `angle` (degrees, 135 is the top left) catching the edges on
// its side, and shade on the far side: the layer looks raised.
function beveled(src, env, b) {
  const out = blank(env);
  stamp(out, src);
  const a = rad(b.angle ?? 135);
  const size = Math.max(1, b.size ?? 10);
  const depth = clamp(b.depth ?? 70, 0, 100);
  const lx = -Math.cos(a);
  const ly = Math.sin(a);
  drawInnerShadow(out, src, { color: b.highlight ?? '#FFFFFF', alpha: depth, size, x: lx * size * 0.6, y: ly * size * 0.6 }, env);
  drawInnerShadow(out, src, { color: b.shade ?? '#000000', alpha: depth, size, x: -lx * size * 0.6, y: -ly * size * 0.6 }, env);
  // Kept to the layer's own shape and see-through-ness.
  stamp(out, src, 'destination-in');
  return out;
}

// The layer leaned back in 3D: `tiltX` turns it about the horizontal axis
// (top away), `tiltY` about the vertical one (right away), seen through a
// camera `distance` away (in picture widths). Drawn a row (column) at a time.
function tilted(src, env, t, L) {
  let cur = src;
  const W = src.canvas.width;
  const H = src.canvas.height;
  const box = L.type === 'paint' ? { x: 0, y: 0, w: env.width, h: env.height } : L;
  const cx = (box.x + box.w / 2) * env.scale;
  const cy = (box.y + box.h / 2) * env.scale;
  const f = Math.max(0.3, t.distance ?? 2) * Math.max(W, H);
  const pass = (deg, rows) => {
    const th = rad(deg);
    if (Math.abs(th) < 1e-3) return;
    const out = blank(env);
    const n = rows ? H : W;
    const c = rows ? cy : cx;
    for (let i = 0; i < n; i++) {
      const u = i + 0.5 - c; // from the axis, across it
      const z = u * Math.sin(th);
      const s = f / (f + z);
      if (s <= 0) continue;
      const at = c + u * Math.cos(th) * s;
      const next = c + (u + 1) * Math.cos(th) * (f / (f + (u + 1) * Math.sin(th)));
      const thick = Math.max(1, Math.abs(next - at) + 0.5);
      if (rows) {
        const w = W * s;
        out.drawImage(cur.canvas, 0, i, W, 1, cx - cx * s, at, w, thick);
      } else {
        const h = H * s;
        out.drawImage(cur.canvas, i, 0, 1, H, at, cy - cy * s, thick, h);
      }
    }
    cur = out;
  };
  pass(t.tiltX ?? 0, true);
  pass(t.tiltY ?? 0, false);
  return cur;
}

// Copies of the layer stepped back along `angle`, darker the further they
// go (or one colour): a block of depth under it, or a long flat shadow.
function drawExtrusion(dst, src, env, e, alpha) {
  const depth = Math.max(0, Math.min(400, e.depth ?? 24));
  if (!depth) return;
  const a = rad(e.angle ?? 45);
  const dx = Math.cos(a) * env.scale;
  const dy = Math.sin(a) * env.scale;
  let side;
  if (e.colour === 'own') {
    side = blank(env);
    side.filter = `brightness(${1 - clamp(e.shade ?? 45, 0, 100) / 100})`;
    side.drawImage(src.canvas, 0, 0);
    side.filter = 'none';
  } else side = tinted(src, env, rgba(e.color ?? '#000000', 100));
  // eslint-disable-next-line warp-drive/no-legacy-request-patterns -- a canvas state push, not a data request
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  const steps = Math.ceil(depth);
  const strength = clamp(e.alpha ?? 100, 0, 100) / 100;
  for (let k = steps; k >= 1; k--) {
    dst.globalAlpha = alpha * strength * (e.fade ? 1 - (k - 1) / steps : 1);
    dst.drawImage(side.canvas, dx * k, dy * k);
  }
  dst.restore();
}

/**
 * Draws `doc` as it looks on `frame` (0 is empty, doc.frames is full).
 *
 * options.scale    output size relative to the document (thumbnails)
 * options.resolve  src → something drawImage takes, or null while loading
 * options.override { id, canvas } a drawing layer's in-progress stroke
 */
export function render(doc, frame, options = {}) {
  lookup = options.resolve ?? (() => null);
  const env = {
    width: doc.width,
    height: doc.height,
    frames: doc.frames,
    frame: clamp(frame, 0, doc.frames),
    scale: options.scale ?? 1,
    resolve: options.resolve,
    override: options.override,
    part: options.part ?? null,
  };
  const out = blank(env);
  if (doc.background?.on && wants(env, 'container')) {
    out.fillStyle = doc.background.color;
    out.fillRect(0, 0, out.canvas.width, out.canvas.height);
  }
  const layers = doc.layers;
  // Drawn in parts, an extra's picture is the same on all its steps: it's
  // drawn on one of them whatever step is asked for.
  if (env.part?.startsWith('extra:')) {
    const [from, to] = env.part.slice(6).split('-').map(Number);
    const steps = stepsIn({ from, to }, doc.frames);
    if (steps.length && !steps.includes(env.frame)) env.frame = steps[0];
  }
  const owns = (role) => env.part === role || (env.part === 'meterLead' && role === 'meter');
  const barPart = !env.part || !(env.part === 'front' || env.part.startsWith('extra:'));
  let i = 0;
  while (i < layers.length) {
    const index = i;
    const layer = layers[i++];
    // A clipped layer only shows inside the nearest unclipped one under it.
    const clipped = [];
    while (i < layers.length && layers[i].clip) clipped.push(layers[i++]);
    const alpha = layer.visible ? layerAlpha(layer, env) : 0;
    if (!alpha) continue;
    // Drawn in parts: a bar draws its own parts; anything else goes in the
    // part it belongs to (roleOf).
    const role = layer.type === 'bar' ? null : env.part ? roleOf(layer, index, doc) : null;
    if (env.part && (layer.type === 'bar' ? !barPart : !owns(role))) continue;
    const { ctx: group, clipShape } = renderLayer(layer, env);
    // What's clipped to a bar shows with the part it shows through.
    const through = layer.type === 'bar' ? (layer.clipTo === 'all' ? 'container' : 'meter') : role;
    const shown = (env.part && (layer.type === 'bar' ? !wants(env, through) : !owns(through)) ? [] : clipped)
      .filter((c) => c.visible)
      .map((c) => [c, layerAlpha(c, env)])
      .filter(([, a]) => a > 0);
    if (shown.length) {
      // A copy, since the clipped layers are drawn onto `group` itself.
      const shape = blank(env);
      stamp(shape, clipShape);
      for (const [c, a] of shown) {
        const content = renderLayer(c, env).ctx;
        stamp(content, shape, 'destination-in');
        stamp(group, content, c.blend, a);
      }
    }
    // A bar's meter in front of its container: the container carries the
    // shadow, glow and extrusion under the whole bar, so the meter doesn't
    // darken the track again.
    const under = !(env.part && layer.type === 'bar' && env.part !== 'container' && layer.trackOn);
    stampLayer(out, group, layer, env, alpha, under);
  }
  return out.canvas;
}

// ─── Examples ─────────────────────────────────────────────────────
// Starting points, each showing off a handful of the Maker's features, so
// that between them they use all of them: every bar shape, segment shape and
// fill, the patterns and effects, the shape tool's custom shapes and the
// pen's paths, text that counts, layers on some steps only, clipping, and
// the skill's styles.

// Layer effects: the defaults with some switched on (`on` unless said).
function fxWith(patch) {
  const fx = newFx();
  for (const [k, v] of Object.entries(patch)) fx[k] = { ...fx[k], on: true, ...v };
  return fx;
}
const shapeD = (id) => CUSTOM_SHAPES.find((c) => c.id === id)?.d ?? '';
const grad = (stops, angle = 0) => paint('linear', stops, angle);

export const TEMPLATES = [
  {
    id: 'health',
    label: 'Health bar',
    hint: 'Gloss, inner shadow, a catch-up trail, a leading edge, and the percentage in text that counts.',
    make: () =>
      newDoc({
        name: 'Health bar',
        frames: 20,
        jjs: { ...newJjs(), style: 'separate' },
        layers: [
          newShape('rect', {
            name: 'Frame',
            x: 40,
            y: 432,
            w: 944,
            h: 160,
            radius: 80,
            fill: solid('#0B0B0B', 85),
            stroke: 6,
            strokeColor: '#FFFFFF',
            strokeAlpha: 30,
            fx: fxWith({ shadow: { y: 10, blur: 30, alpha: 70 } }),
          }),
          newBar({
            name: 'Health',
            x: 64,
            y: 452,
            w: 896,
            h: 120,
            radius: 60,
            padding: 8,
            track: solid('#1A1A1A'),
            fill: grad([
              [0, '#16A34A'],
              [100, '#86EFAC'],
            ]),
            innerShadow: { ...newBar().innerShadow, on: true, alpha: 80 },
            shine: { on: true, alpha: 40, style: 'glass' },
            tip: { on: true, color: '#FFFFFF', alpha: 80, size: 70 },
            trail: { on: true, color: '#FDE68A', alpha: 70, amount: 12 },
          }),
          newText({
            name: 'Percent',
            text: '{percent}%',
            x: 362,
            y: 462,
            w: 300,
            h: 100,
            size: 72,
            font: 'Arial Black',
            stroke: 6,
            fx: fxWith({ shadow: { y: 4, blur: 8, alpha: 60 } }),
          }),
        ],
      }),
  },
  {
    id: 'cursed-energy',
    label: 'Cursed energy (呪力)',
    hint: 'A text bar written stroke by stroke, glowing, with scanlines and a flash when full.',
    make: () =>
      newDoc({
        name: 'Cursed energy',
        frames: 24,
        layers: [
          newBar({
            name: '呪力',
            shape: 'text',
            text: '呪力',
            x: 162,
            y: 262,
            w: 700,
            h: 500,
            textMode: 'strokes',
            textPen: 9,
            textFont: 'serif',
            track: solid('#FFFFFF', 12),
            fill: grad(
              [
                [0, '#60A5FA'],
                [100, '#A855F7'],
              ],
              45,
            ),
            glow: { on: true, color: '#7C3AED', alpha: 85, size: 40, grow: true },
            flash: { on: true, color: '#FFFFFF', alpha: 60 },
            fx: fxWith({ scanlines: { gap: 6, alpha: 25 } }),
          }),
        ],
      }),
  },
  {
    id: 'black-flash',
    label: 'Black Flash',
    hint: 'Red and black, torn by a glitch that changes every step, colour fringes, lightning on full.',
    make: () =>
      newDoc({
        name: 'Black Flash',
        frames: 20,
        background: { on: false, color: '#000000' },
        layers: [
          newBar({
            name: 'Flash',
            x: 64,
            y: 462,
            w: 896,
            h: 100,
            radius: 0,
            skew: -20,
            segments: 5,
            gap: 14,
            segShape: 'slant',
            segSlant: 40,
            track: solid('#1A0004'),
            fill: grad([
              [0, '#000000'],
              [55, '#7F0010'],
              [100, '#FF1F3D'],
            ]),
            stroke: { ...newBar().stroke, on: true, width: 5, paint: solid('#FF1F3D'), position: 'outside' },
            fx: fxWith({ glitch: { amount: 18, slices: 10, animate: true }, chroma: { amount: 5 } }),
          }),
          newShape('path', {
            name: 'Lightning',
            d: shapeD('lightning'),
            x: 820,
            y: 320,
            w: 160,
            h: 260,
            fill: solid('#FF1F3D'),
            stroke: 6,
            strokeColor: '#000000',
            fx: fxWith({ outerGlow: { color: '#FF1F3D', size: 40 }, range: { from: 100, to: 100 } }),
          }),
        ],
      }),
  },
  {
    id: 'manga',
    label: 'Manga burst',
    hint: 'Halftone and ink: a burst behind, a slash, and “MAX!” on the last step only.',
    make: () =>
      newDoc({
        name: 'Manga burst',
        frames: 16,
        layers: [
          newShape('path', {
            name: 'Burst',
            d: shapeD('burst'),
            x: 212,
            y: 162,
            w: 600,
            h: 600,
            fill: solid('#FFFFFF'),
            stroke: 10,
            strokeColor: '#000000',
            fx: fxWith({ halftone: { size: 12, angle: 45, ink: 'ink', color: '#000000', scale: 45, tone: 'even', under: 100 } }),
          }),
          newBar({
            name: 'Ink',
            x: 112,
            y: 472,
            w: 800,
            h: 80,
            radius: 4,
            skew: -12,
            track: solid('#FFFFFF'),
            fill: solid('#111111'),
            stroke: { ...newBar().stroke, on: true, width: 8, paint: solid('#000000') },
            fx: fxWith({ halftone: { size: 10, angle: 20, shape: 'lines', scale: 70 }, outline: { color: '#FFFFFF', width: 6 } }),
          }),
          newText({
            name: 'MAX!',
            text: 'MAX!',
            x: 312,
            y: 252,
            w: 400,
            h: 160,
            size: 140,
            italic: true,
            font: 'Impact',
            fill: solid('#FF2A2A'),
            stroke: 10,
            fx: fxWith({ extrude: { depth: 18, angle: 35, colour: 'ink', color: '#000000' }, range: { from: 100, to: 100 } }),
          }),
        ],
      }),
  },
  {
    id: 'ring',
    label: 'Cooldown ring',
    hint: 'A ring that tapers as it goes round, round ends, a bevel, and the steps counting down.',
    make: () =>
      newDoc({
        name: 'Cooldown ring',
        frames: 20,
        layers: [
          newRing({
            name: 'Cooldown',
            thickness: 90,
            taperStart: 35,
            taperEnd: 100,
            taperAlign: 'end',
            roundEnds: true,
            track: solid('#FFFFFF', 12),
            fill: paint('conic', [
              [0, '#22D3EE'],
              [100, '#6366F1'],
            ]),
            fx: fxWith({ bevel: { size: 12, depth: 60 } }),
          }),
          newText({ name: 'Left', text: '{left}', x: 312, y: 412, w: 400, h: 200, size: 160 }),
        ],
      }),
  },
  {
    id: 'gauge',
    label: 'Gauge',
    hint: 'A segmented dial, red to green by step, with a needle drawn with the pen.',
    make: () =>
      newDoc({
        name: 'Gauge',
        frames: 20,
        layers: [
          newRing({
            name: 'Gauge',
            ringStart: 225,
            ringSweep: 270,
            thickness: 80,
            segments: 12,
            gap: 20,
            roundEnds: false,
            fillMode: 'progress',
            track: solid('#FFFFFF', 12),
            fill: paint('solid', [
              [0, '#EF4444'],
              [50, '#FACC15'],
              [100, '#22C55E'],
            ]),
            stroke: { ...newBar().stroke, on: true, width: 3, paint: solid('#FFFFFF', 40), around: 'bar' },
          }),
          newShape('path', {
            name: 'Needle (pen)',
            d: 'M46 100L50 0 54 100Z',
            x: 492,
            y: 212,
            w: 40,
            h: 300,
            fill: solid('#FFFFFF'),
            fx: fxWith({ shadow: { y: 6, blur: 10 } }),
          }),
          newShape('ellipse', { name: 'Hub', x: 472, y: 472, w: 80, h: 80, fill: solid('#E5E5E5'), stroke: 6, strokeColor: '#111111' }),
        ],
      }),
  },
  {
    id: 'charge',
    label: 'Charge meter',
    hint: 'Upright, stripes drifting, film grain, a dashed marching outline, and depth.',
    make: () =>
      newDoc({
        name: 'Charge',
        frames: 20,
        layers: [
          newBar({
            name: 'Charge',
            x: 432,
            y: 64,
            w: 160,
            h: 896,
            direction: 'btt',
            radius: 28,
            stroke: { ...newBar().stroke, on: true, width: 6, style: 'dashed', dash: 18, gap: 10, march: 4, paint: solid('#FFFFFF') },
            track: solid('#000000', 60),
            fill: grad(
              [
                [0, '#F97316'],
                [100, '#FDE047'],
              ],
              270,
            ),
            fillMode: 'stretch',
            stripes: { ...newBar().stripes, on: true, alpha: 22, width: 28, gap: 28, anchor: 'drift', move: 8 },
            grain: { on: true, alpha: 30, size: 2, animate: true },
            fx: fxWith({ extrude: { depth: 20, angle: 45, shade: 55 } }),
          }),
        ],
      }),
  },
  {
    id: 'boss',
    label: 'Boss HP',
    hint: 'A name on a banner, a long bar with a trail and leading edge, a texture clipped to the fill.',
    make: () =>
      newDoc({
        name: 'Boss HP',
        frames: 20,
        jjs: { ...newJjs(), style: 'separate' },
        layers: [
          newShape('path', { name: 'Banner', d: shapeD('banner'), x: 262, y: 362, w: 500, h: 90, fill: solid('#7F1D1D'), stroke: 4, strokeColor: '#FCA5A5' }),
          newText({ name: 'Name', text: 'SUKUNA', x: 262, y: 362, w: 500, h: 90, size: 64, font: 'Impact', stroke: 4 }),
          newBar({
            name: 'Boss HP',
            x: 64,
            y: 472,
            w: 896,
            h: 80,
            radius: 10,
            track: solid('#140A0A'),
            fill: grad([
              [0, '#7F1D1D'],
              [100, '#EF4444'],
            ]),
            trail: { on: true, color: '#FDE68A', alpha: 75, amount: 12 },
            tip: { on: true, color: '#FFFFFF', alpha: 85, size: 50 },
            innerShadow: { ...newBar().innerShadow, on: true },
            stroke: { ...newBar().stroke, on: true, width: 6, paint: solid('#FFFFFF', 85), ownRadius: true, radius: 0 },
          }),
          newShape('rect', {
            name: 'Texture (clipped)',
            clip: true,
            x: 64,
            y: 472,
            w: 896,
            h: 80,
            fill: solid('#FFFFFF'),
            opacity: 30,
            blend: 'overlay',
            fx: fxWith({ halftone: { size: 8, angle: 30, shape: 'lines', ink: 'ink', color: '#000000', scale: 60 } }),
          }),
        ],
      }),
  },
  {
    id: 'domain',
    label: 'Domain gauge',
    hint: 'Hexagon segments leaning back in 3D, a grid pattern, a bevel, purple glow.',
    make: () =>
      newDoc({
        name: 'Domain gauge',
        frames: 7,
        layers: [
          newBar({
            name: 'Domain',
            x: 64,
            y: 392,
            w: 896,
            h: 240,
            segments: 7,
            gap: 8,
            stepped: true,
            segShape: 'hexagon',
            segDepth: 40,
            track: solid('#1E1033'),
            fill: grad(
              [
                [0, '#7C3AED'],
                [100, '#F0ABFC'],
              ],
              90,
            ),
            stripes: { ...newBar().stripes, on: true, kind: 'crosshatch', alpha: 15, width: 3, gap: 22, angle: 0 },
            glow: { on: true, color: '#A855F7', alpha: 70, size: 35 },
            fx: fxWith({ tilt: { tiltX: 35, tiltY: -10, distance: 2 }, bevel: { size: 8, depth: 50 } }),
          }),
        ],
      }),
  },
  {
    id: 'signal',
    label: 'Signal',
    hint: 'Tapered segments that light up whole, like a phone’s signal.',
    make: () =>
      newDoc({
        name: 'Signal',
        frames: 5,
        layers: [
          newBar({
            name: 'Signal',
            x: 162,
            y: 312,
            w: 700,
            h: 400,
            radius: 18,
            segments: 5,
            gap: 32,
            stepped: true,
            taperStart: 22,
            taperEnd: 100,
            taperAlign: 'end',
            track: solid('#FFFFFF', 14),
            fill: solid('#22D3EE'),
            glow: { ...newBar().glow, on: true, color: '#22D3EE', alpha: 60 },
          }),
        ],
      }),
  },
  {
    id: 'chevrons',
    label: 'Chevrons',
    hint: 'Chevron segments, a progress colour, and a marching dashed outline inside.',
    make: () =>
      newDoc({
        name: 'Chevrons',
        frames: 8,
        layers: [
          newBar({
            name: 'Chevrons',
            x: 64,
            y: 432,
            w: 896,
            h: 160,
            radius: 6,
            segments: 8,
            gap: 10,
            stepped: true,
            segShape: 'chevron',
            segDepth: 60,
            track: solid('#FFFFFF', 10),
            fill: grad([
              [0, '#FACC15'],
              [100, '#F97316'],
            ]),
            stroke: {
              ...newBar().stroke,
              on: true,
              width: 4,
              style: 'dashed',
              dash: 10,
              gap: 8,
              position: 'inside',
              paint: solid('#FFFFFF', 60),
              march: 3,
            },
          }),
        ],
      }),
  },
  {
    id: 'retro',
    label: 'Retro hearts',
    hint: 'Five pixel hearts (a custom shape) that fill one a step: each layer shown on its steps only.',
    make: () =>
      newDoc({
        name: 'Retro hearts',
        frames: 5,
        layers: [
          ...[0, 1, 2, 3, 4].map((i) =>
            newShape('path', {
              name: `Empty ${i + 1}`,
              d: shapeD('heart'),
              x: 92 + i * 172,
              y: 432,
              w: 150,
              h: 140,
              fill: solid('#3F3F46'),
              stroke: 8,
              strokeColor: '#000000',
              fx: fxWith({ pixelate: { size: 10 }, range: { from: 0, to: Math.round(((i + 1) / 5) * 100) - 1 } }),
            }),
          ),
          ...[0, 1, 2, 3, 4].map((i) =>
            newShape('path', {
              name: `Heart ${i + 1}`,
              d: shapeD('heart'),
              x: 92 + i * 172,
              y: 432,
              w: 150,
              h: 140,
              fill: solid('#EF4444'),
              stroke: 8,
              strokeColor: '#000000',
              fx: fxWith({ pixelate: { size: 10 }, range: { from: Math.round(((i + 1) / 5) * 100), to: 100 } }),
            }),
          ),
        ],
      }),
  },
];
