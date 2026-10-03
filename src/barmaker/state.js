// The Meter Maker workspace's state and everything that changes it
// (brought over from Woogi Tools' JJS Progress Bar Maker, where it lived on
// the page component). Jujutsu Shenanigans can't draw a bar that fills up,
// so a bar is one picture per step, swapped in game: this lays one out in a
// small image editor (layers, shapes, text, pictures, a brush, clipping),
// writes every step out, uploads them to Roblox, and builds the skill that
// shows them, straight into the moveset.
//
// Signals, so switching to the Skills workspace and back keeps everything.

import { batch, signal, computed, effect } from '@preact/signals';
import {
  MAX_FRAMES,
  TEMPLATES as EXAMPLES,
  drawingFingerprint,
  frameName,
  hasPart,
  separateParts,
  CUSTOM_SHAPES,
  newBar,
  newDoc,
  newFx,
  newImage,
  newJjs,
  newPaint,
  newRing,
  newShape,
  newText,
  normaliseDoc,
  render,
  setIn,
} from './draw.js';
import { strokesFor } from './kanji.js';
import { buildSkill, encodeSkill, parsedSkills, parseIds } from '../../core/barskill.js';
import { dbGet, dbSet, makeShelf } from '../persist.js';
import { restoreWork } from '../session.js';
import { openTextFile, saveBlob, uploadDecal } from '../platform.js';
import { account } from '../account.js';
import * as S from '../store.js';
import { actionOf } from '../keybinds.js';
import { ensureAll, fontsVersion } from '../fonts.js';

export { EXAMPLES, MAX_FRAMES };
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const THUMB_HEIGHT = 44;

// A plain bar or ring that fits the picture it's going on.
const centred = (doc, w, h) => ({
  w: Math.round(w),
  h: Math.round(h),
  x: Math.round((doc.width - w) / 2),
  y: Math.round((doc.height - h) / 2),
});

function barFor(doc) {
  const h = Math.round(doc.height * 0.1);
  return newBar({ ...centred(doc, doc.width * 0.875, h), radius: Math.round(h / 2) });
}

function ringFor(doc) {
  const side = Math.min(doc.width, doc.height) * 0.78;
  return newRing({ ...centred(doc, side, side), thickness: Math.max(4, Math.round(side / 9)) });
}

// Settings that follow a shape's size while it's being drawn: a bar stays a
// pill, a ring's band stays in proportion.
function shaped(kind, box) {
  if (kind === 'bar') return { ...box, radius: Math.round(Math.min(box.w, box.h) / 2) };
  if (kind === 'ring') return { ...box, thickness: Math.max(2, Math.round(Math.min(box.w, box.h) / 9)) };
  return box;
}

function makeShape(kind, box) {
  if (kind === 'textbar') return newBar({ ...box, name: 'Text', shape: 'text', direction: 'ltr' });
  if (kind === 'bar') return newBar(shaped(kind, box));
  if (kind === 'ring') return newRing(shaped(kind, box));
  if (kind === 'polygon') return newShape('polygon', { ...box, sides: polySides.peek() });
  if (kind === 'star') return newShape('star', { ...box, points: starPoints.peek() });
  if (kind === 'custom') {
    const c = CUSTOM_SHAPES.find((x) => x.id === customShape.peek()) ?? CUSTOM_SHAPES[0];
    return newShape('path', { ...box, d: c.d, name: c.label });
  }
  return newShape(kind, box);
}

// A click without a drag gets a shape this big, centred on the click.
const CLICK_SIZES = { bar: [800, 100], ring: [600, 600], textbar: [600, 300], polygon: [300, 300], star: [300, 300], custom: [300, 300] };
// Shapes that start out square (Shift squares any of them).
const SQUARE = new Set(['ring', 'polygon', 'star']);

function startingDoc() {
  const doc = newDoc();
  return { ...doc, layers: [barFor(doc)] };
}

// Designs saved in the app.
const shelf = makeShelf('bars');

// ─── State ──────────────────────────────────────────────────────────────

export const doc = signal(startingDoc());
export const selectedId = signal(doc.value.layers[0]?.id ?? null);
export const frame = signal(13);
export const tool = signal('move');
export const brushSize = signal(24);
// The bar tool draws meters (a bar, a ring, a text bar); the shape tool
// draws shapes (a rectangle… a polygon, a star, a custom shape); the pen
// draws a path point by point.
export const barKind = signal('bar');
export const shapeKind = signal('rect');
export const customShape = signal('heart');
export const polySides = signal(6);
export const starPoints = signal(5);
export const brushColor = signal('#FFFFFF');
export const brushAlpha = signal(100);
export const past = signal([]);
export const future = signal([]);
export const playing = signal(false);
export const fps = signal(12);
export const exportName = signal('progress');
export const thumbs = signal([]);
export const busy = signal(false);
export const status = signal(null);
export const error = signal(null);
export const dragging = signal(false);
export const propTab = signal('shape');
// 0 fits the picture to the workspace; anything else is a fixed scale.
export const zoom = signal(0);
export const viewScale = signal(1);
export const dialog = signal(null);
export const newSteps = signal(20);
export const newStart = signal('bar');
// The saved design this is, if it's been saved, and whether it's changed since.
export const designId = signal(null);
export const dirty = signal(false);
export const designs = signal([]);
// The Export dialog: its tab, the upload in progress, the skill made from the IDs.
export const exportTab = signal('jjs');
export const uploadRows = signal([]);
export const uploading = signal(false);
export const uploadError = signal(null);
export const skillCode = signal('');
export const skillNote = signal(null);
export const copied = signal(false);

export const selected = computed(() => doc.value.layers.find((l) => l.id === selectedId.value) ?? null);
export const pictures = computed(() => doc.value.frames + 1);
export const jjs = computed(() => ({ ...newJjs(), ...doc.value.jjs }));
export const jjsIds = computed(() => parseIds(jjs.value.ids));
// Complex Separate: the meter in layers, and the pictures it needs besides the meter's.
export const separate = computed(() => jjs.value.style === 'separate');
export const wantsTrail = computed(() => hasPart(doc.value, 'trail'));
export const containerIds = computed(() => parseIds(jjs.value.containerId));
export const trailIds = computed(() => parseIds(jjs.value.trailIds));
// Complex Separate's front and extras (draw.js separateParts), and their IDs.
export const sepParts = computed(() => separateParts(doc.value));
export const frontIds = computed(() => parseIds(jjs.value.frontId));
const extraIdOf = (key) => parseIds(jjs.value.extraIds?.[key])[0] ?? null;
/** How many pictures the skill needs uploaded: the steps, or (separate) the container, the meter's steps and the trail's. */
export const uploadCount = computed(() =>
  separate.value ? 1 + (sepParts.value.front ? 1 : 0) + sepParts.value.extras.length + pictures.value + (wantsTrail.value ? pictures.value : 0) : pictures.value,
);
// The picture export: everything in one picture per step, or in layers
// (container, meter, leading edge, trail: a folder of each).
export const layeredExport = signal(false);
// Whether the uploaded pictures were made from the design as it is now.
export const uploadsStale = computed(() => {
  const { uploadedFor, uploads, layeredUploads } = jjs.value;
  if (jjs.value.style === 'separate')
    return Boolean(layeredUploads?.fingerprint && layeredUploads.fingerprint !== `${drawingFingerprint(doc.value)}:separate`);
  return Boolean(uploads?.length && uploadedFor && uploadedFor !== drawingFingerprint(doc.value));
});
export const firstName = computed(() => frameName(exportName.value, 0, doc.value.frames));
export const lastName = computed(() => frameName(exportName.value, doc.value.frames, doc.value.frames));

// ─── Remembered between runs ────────────────────────────────────────────

const KEPT = { doc, frame, exportName, brushSize, brushColor, brushAlpha, fps, propTab, shapeKind, designId, dirty };
const DESIGN_KEYS = new Set(['doc', 'designId', 'dirty']);
let restoring = true;
let keepTimer = 0;
function keepSoon() {
  if (restoring) return;
  clearTimeout(keepTimer);
  keepTimer = setTimeout(
    () => dbSet('bars:session', Object.fromEntries(Object.entries(KEPT).map(([k, s]) => [k, s.value]))),
    400,
  );
}
for (const s of Object.values(KEPT)) s.subscribe(keepSoon);

let restored = false;
export async function restore() {
  if (restored) return draw();
  restored = true;
  const saved = await dbGet('bars:session');
  if (saved) {
    batch(() => {
      // The design itself only comes back after a crash (src/session.js).
      for (const [k, s] of Object.entries(KEPT))
        if (saved[k] !== undefined && (restoreWork || !DESIGN_KEYS.has(k))) s.value = saved[k];
      doc.value = normaliseDoc(doc.value) ?? startingDoc();
      frame.value = clamp(frame.value, 0, doc.value.frames);
      selectedId.value = doc.value.layers.at(-1)?.id ?? null;
    });
    fetchStrokes();
  }
  restoring = false;
  draw();
  // A design in an added Google font draws with it once it's loaded.
  ensureAll();
}
effect(() => {
  if (fontsVersion.value) {
    draw();
    queueThumbs();
  }
});

// ─── Drawing ────────────────────────────────────────────────────────────

let canvas = null;
let overlay = null;
// Decoded pictures by src (data URL), shared by every render.
const drawables = new Map();
let override = null;
let frameRequest = 0;
let thumbTimer = 0;
let barScene = null;

export const resolve = (src) => picture(src)?.image ?? null;

function picture(src) {
  if (!src) return null;
  let entry = drawables.get(src);
  if (!entry) {
    const image = new Image();
    entry = { image: null };
    entry.ready = new Promise((done) => {
      image.onload = () => {
        entry.image = image;
        draw();
        done();
      };
      image.onerror = () => done();
    });
    image.src = src;
    drawables.set(src, entry);
  }
  return entry;
}

// Everything a render needs decoded, before an export reads it.
// Pictures decoded and added Google fonts loaded (src/fonts.js), before a render that must be right.
const loadAll = () => Promise.all([ensureAll(), ...doc.value.layers.map((l) => l.src && picture(l.src)?.ready)]);

export function bindCanvas(element) {
  canvas = element;
  draw();
}

export function bindOverlay(element) {
  overlay = element;
  draw();
}

export function measure() {
  const width = overlay?.getBoundingClientRect().width;
  if (!width) return;
  const scale = width / doc.value.width;
  if (Math.abs(scale - viewScale.value) > 0.001) viewScale.value = scale;
  drawSelection();
}

// Redraws on the next frame: a slider sends dozens of changes a second and
// only the last one needs painting.
export function draw() {
  cancelAnimationFrame(frameRequest);
  frameRequest = requestAnimationFrame(() => {
    const d = doc.value;
    if (canvas) {
      const out = render(d, frame.value, { resolve, override });
      for (const c of [canvas, overlay]) {
        if (!c) continue;
        if (c.width !== d.width) c.width = d.width;
        if (c.height !== d.height) c.height = d.height;
      }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(out, 0, 0);
      measure();
    }
    feedBar();
  });
  if (!playing.value) queueThumbs();
}

// Doc pixels per screen pixel.
const unit = () => 1 / (viewScale.value || 1);

function drawSelection() {
  const c = overlay;
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const k = unit();
  // Guides, and the lines a drag is snapping to.
  if (!playing.value) {
    const line = (g, colour) => {
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.at, 0);
        ctx.lineTo(g.at, c.height);
      } else {
        ctx.moveTo(0, g.at);
        ctx.lineTo(c.width, g.at);
      }
      ctx.lineWidth = k;
      ctx.strokeStyle = colour;
      ctx.stroke();
    };
    if (rulers.value) for (const g of doc.value.guides ?? []) line(g, 'rgba(54,197,240,0.85)');
    // The pen's path so far, its points, and the line to the pointer.
    const pts = penPoints.value;
    if (pts.length && tool.value === 'pen') {
      const live = pointerAt.value && !penDrag ? [...pts, { x: pointerAt.value.x, y: pointerAt.value.y, out: null }] : pts;
      ctx.save();
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = '#f2f2f2';
      ctx.setLineDash([]);
      ctx.stroke(new Path2D(penPathData(live, false)));
      for (const [i, q] of pts.entries()) {
        const s = (i === 0 ? 9 : 7) * k;
        ctx.fillStyle = i === 0 ? '#36c5f0' : '#1c1c1c';
        ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
        ctx.strokeRect(q.x - s / 2, q.y - s / 2, s, s);
        if (q.out) {
          ctx.beginPath();
          ctx.moveTo(q.x - q.out[0], q.y - q.out[1]);
          ctx.lineTo(q.x + q.out[0], q.y + q.out[1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (guideDraft) line(guideDraft, '#36c5f0');
    for (const g of snapLines) line(g, '#ff3df2');
  }
  const layer = selected.value;
  if (!layer || layer.type === 'paint' || playing.value || tool.value !== 'move') return;
  ctx.save();
  ctx.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h);
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = '#f2f2f2';
  ctx.strokeRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h);
  const s = 8 * k;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect((sx * layer.w) / 2 - s / 2, (sy * layer.h) / 2 - s / 2, s, s);
    ctx.strokeRect((sx * layer.w) / 2 - s / 2, (sy * layer.h) / 2 - s / 2, s, s);
  }
  ctx.restore();
}

// ─── Rulers, guides and snapping ────────────────────────────────────────
// As in an image editor: rulers along the top and left (Ctrl+R), guides
// dragged out of them, and a moved, resized or drawn layer snapping to the
// picture's middle and edges, the guides, and other layers' edges and
// middles (Ctrl+; turns it off; holding Alt lets go for one drag).

const readFlag = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const keepFlag = (key, on) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // not kept
  }
};
export const rulers = signal(readFlag('pb-rulers', true));
export const snapping = signal(readFlag('pb-snap', true));
// Where the pointer is on the picture, for the rulers' marks (null: off it).
export const pointerAt = signal(null);
let snapLines = [];
let guideDraft = null;

export function toggleRulers() {
  rulers.value = !rulers.value;
  keepFlag('pb-rulers', rulers.value);
  drawSelection();
}
export function toggleSnapping() {
  snapping.value = !snapping.value;
  keepFlag('pb-snap', snapping.value);
  status.value = snapping.value ? 'Snapping on' : 'Snapping off';
}
export function clearGuides() {
  if (!doc.value.guides?.length) return;
  change({ ...doc.value, guides: [] });
}

const SNAP_PX = 7;

// What a dragged layer can snap to, along each axis.
function snapTargets(skipId) {
  const d = doc.value;
  const xs = [
    { at: d.width / 2, weight: 2 },
    { at: 0, weight: 1 },
    { at: d.width, weight: 1 },
  ];
  const ys = [
    { at: d.height / 2, weight: 2 },
    { at: 0, weight: 1 },
    { at: d.height, weight: 1 },
  ];
  for (const g of d.guides ?? []) (g.axis === 'x' ? xs : ys).push({ at: g.at, weight: 1.5 });
  for (const l of d.layers) {
    if (l.id === skipId || !l.visible || l.type === 'paint') continue;
    // A turned layer offers its middle only.
    const xsOf = l.rotation ? [l.x + l.w / 2] : [l.x, l.x + l.w / 2, l.x + l.w];
    const ysOf = l.rotation ? [l.y + l.h / 2] : [l.y, l.y + l.h / 2, l.y + l.h];
    for (const at of xsOf) xs.push({ at, weight: 1 });
    for (const at of ysOf) ys.push({ at, weight: 1 });
  }
  return { xs, ys };
}

// The nearest target to any of `points` (positions on one axis), within
// reach: the shift that lines them up, and where. Middles win close calls.
function nearest(points, targets, reach) {
  let best = null;
  for (const p of points)
    for (const t of targets) {
      const d = t.at - p;
      const score = Math.abs(d) / t.weight;
      if (Math.abs(d) <= reach && (!best || score < best.score)) best = { shift: d, at: t.at, score };
    }
  return best;
}

const snapsNow = (event) => snapping.value && !event?.altKey;

// Snaps a box being moved by its left, middle and right (top, middle, bottom).
function snapBox(box, skipId, event) {
  snapLines = [];
  if (!snapsNow(event)) return box;
  const reach = SNAP_PX * unit();
  const { xs, ys } = snapTargets(skipId);
  const sx = nearest([box.x, box.x + box.w / 2, box.x + box.w], xs, reach);
  const sy = nearest([box.y, box.y + box.h / 2, box.y + box.h], ys, reach);
  if (sx) snapLines.push({ axis: 'x', at: sx.at });
  if (sy) snapLines.push({ axis: 'y', at: sy.at });
  return { ...box, x: box.x + (sx?.shift ?? 0), y: box.y + (sy?.shift ?? 0) };
}

// Snaps a point (a corner being dragged, the start of a new shape).
function snapPoint(p, skipId, event) {
  snapLines = [];
  if (!snapsNow(event)) return p;
  const reach = SNAP_PX * unit();
  const { xs, ys } = snapTargets(skipId);
  const sx = nearest([p.x], xs, reach);
  const sy = nearest([p.y], ys, reach);
  if (sx) snapLines.push({ axis: 'x', at: sx.at });
  if (sy) snapLines.push({ axis: 'y', at: sy.at });
  return { x: p.x + (sx?.shift ?? 0), y: p.y + (sy?.shift ?? 0) };
}

// The guide under a point, if any (only while the rulers show).
function guideAt(p) {
  if (!rulers.value) return -1;
  const reach = 5 * unit();
  return (doc.value.guides ?? []).findIndex((g) => Math.abs((g.axis === 'x' ? p.x : p.y) - g.at) <= reach);
}

const onPicture = (p) => p.x >= 0 && p.y >= 0 && p.x <= doc.value.width && p.y <= doc.value.height;

// A guide being placed snaps to the middle and the layers' edges.
function snapGuide(axis, at, event) {
  if (!snapsNow(event)) return at;
  const { xs, ys } = snapTargets(null);
  const hit = nearest([at], axis === 'x' ? xs : ys, SNAP_PX * unit());
  return hit ? Math.round(hit.at) : at;
}

/**
 * Drags a guide: a new one out of a ruler (`axis` 'x' is a vertical guide,
 * from the left ruler), or the one at `index`. Let go off the picture and
 * it's gone.
 */
export function startGuide(axis, event, index = -1) {
  if (!overlay || event.button > 0) return;
  event.preventDefault();
  let taken = false;
  const move = (e) => {
    const p = toDoc(e);
    pointerAt.value = p;
    guideDraft = { axis, at: snapGuide(axis, Math.round(axis === 'x' ? p.x : p.y), e) };
    if (index >= 0 && !taken) {
      // Lifted out of the guides while it's being moved.
      taken = true;
      remember();
      commit({ ...doc.value, guides: doc.value.guides.filter((_, i) => i !== index) });
    }
    drawSelection();
  };
  const up = (e) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    const draft = guideDraft;
    guideDraft = null;
    if (draft && onPicture(toDoc(e))) {
      if (!taken) remember();
      commit({ ...doc.value, guides: [...(doc.value.guides ?? []), draft] });
    }
    drawSelection();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

// The strip of every step, redone a moment after you stop changing things.
function queueThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const d = doc.value;
    const scale = Math.min(1, THUMB_HEIGHT / d.height, 140 / d.width);
    const list = [];
    for (let k = 0; k <= d.frames; k++)
      list.push({ frame: k, url: render(d, k, { scale, resolve }).toDataURL() });
    thumbs.value = list;
  }, 350);
}

// ─── The 3D preview of the billboard ───────────────────────────────────

export async function mountPreview(element) {
  const { mountBarScene } = await import('./preview3d.js');
  barScene = mountBarScene(element);
  feedBar();
  return () => {
    barScene?.dispose();
    barScene = null;
  };
}

function feedBar() {
  const d = doc.value;
  const at = frame.value;
  // Complex Separate is three billboards a thousandth apart: the container,
  // the trail (this step's own: it's what flashes when the meter leaves it),
  // and the meter in front.
  const sp = separate.value ? sepParts.value : null;
  const extrasHere = (above) => (sp?.extras ?? []).filter((e) => e.above === above && e.steps.includes(at)).map((e) => ({ canvas: render(d, at, { resolve, part: e.key }), z: above ? -0.0025 : -0.0005 }));
  const layers = separate.value
    ? [
        { canvas: render(d, at, { resolve, part: 'container' }), z: 0 },
        ...extrasHere(false),
        ...(wantsTrail.value ? [{ canvas: render(d, at, { resolve, part: 'trail' }), z: -0.001 }] : []),
        { canvas: render(d, at, { resolve, part: 'meterLead' }), z: -0.002 },
        ...extrasHere(true),
        ...(sp.front ? [{ canvas: render(d, at, { resolve, part: 'front' }), z: -0.003 }] : []),
      ]
    : null;
  barScene?.update({
    canvas: layers ? null : render(d, at, { resolve }),
    layers,
    size: jjs.value.size,
    position: jjs.value.position,
  });
}

export const resetPreview = () => barScene?.resetCamera();

// ─── History ────────────────────────────────────────────────────────────
// Changes to the same thing close together (a slider being dragged, a
// colour picker being swept) are one undo step, not a hundred.

let lastKey = null;
let lastAt = 0;

function remember(key = null) {
  const now = performance.now();
  const same = key && key === lastKey && now - lastAt < 1000;
  lastKey = key;
  lastAt = now;
  if (same) return;
  past.value = [...past.value.slice(-79), doc.value];
  future.value = [];
}

export function change(next, key) {
  remember(key);
  commit(next);
}

// Without an undo step: for the middle of a drag, whose step was taken at the start.
function commit(next) {
  batch(() => {
    doc.value = next;
    dirty.value = true;
    status.value = null;
    if (frame.value > next.frames) frame.value = next.frames;
  });
  draw();
}

export function undo() {
  if (!past.value.length) return;
  batch(() => {
    future.value = [doc.value, ...future.value];
    doc.value = past.value.at(-1);
    past.value = past.value.slice(0, -1);
  });
  afterHistory();
}

export function redo() {
  if (!future.value.length) return;
  batch(() => {
    past.value = [...past.value, doc.value];
    doc.value = future.value[0];
    future.value = future.value.slice(1);
  });
  afterHistory();
}

function afterHistory() {
  lastKey = null;
  if (selectedId.value && !selected.value) selectedId.value = doc.value.layers.at(-1)?.id ?? null;
  frame.value = Math.min(frame.value, doc.value.frames);
  draw();
}

// ─── Editing the design ─────────────────────────────────────────────────

const indexOf = (id) => doc.value.layers.findIndex((l) => l.id === id);

function patchLayer(id, patch) {
  const i = indexOf(id);
  if (i < 0) return doc.value;
  const layers = [...doc.value.layers];
  layers[i] = { ...layers[i], ...patch };
  return { ...doc.value, layers };
}

export function setLayer(path, value) {
  const layer = selected.value;
  if (!layer) return;
  const i = indexOf(layer.id);
  let next = setIn(doc.value, ['layers', i, ...path.split('.')], value);
  // A ring reads directions differently from a bar.
  if (path === 'shape' && layer.type === 'bar')
    next = setIn(next, ['layers', i, 'direction'], value === 'ring' ? 'cw' : 'ltr');
  if (path === 'textMode' || path === 'text' || path === 'shape') queueMicrotask(fetchStrokes);
  change(next, `${layer.id}:${path}`);
}

// Reads whatever kind of input sent the event.
function valueOf(event) {
  const el = event.currentTarget ?? event.target;
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'range' || el.type === 'number') {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : 0;
  }
  return el.value;
}

export function layerField(path, event) {
  let value = valueOf(event);
  if ((path === 'w' || path === 'h') && typeof value === 'number') value = Math.max(1, value);
  setLayer(path, value);
}

export function docField(path, event) {
  let value = valueOf(event);
  if (path === 'frames') value = clamp(Math.round(value) || 1, 1, MAX_FRAMES);
  change(setIn(doc.value, path, value), `doc:${path}`);
}

/** The doc with one setting changed (for the menus): `change(setInDoc('background.on', true))`. */
export const setInDoc = (path, value) => setIn(doc.value, path, value);
export const setBackground = (hex) => change(setIn(doc.value, 'background.color', hex), 'doc:background');

export function matchSteps() {
  const n = selected.value?.segments;
  if (n) change({ ...doc.value, frames: clamp(n, 1, MAX_FRAMES) });
}

// New layers go straight above the one picked.
function addLayer(layer) {
  const i = indexOf(selectedId.value);
  const layers = [...doc.value.layers];
  layers.splice(i < 0 ? layers.length : i + 1, 0, layer);
  change({ ...doc.value, layers });
  selectedId.value = layer.id;
}

export const addDrawing = () => addLayer(newPaint());

export function pickShapeKind(id) {
  shapeKind.value = id;
  pickTool('shape');
}
export function pickBarKind(id) {
  barKind.value = id;
  pickTool('bar');
}
export function pickCustomShape(id) {
  customShape.value = id;
  pickShapeKind('custom');
}

const readAsDataUrl = (file) =>
  new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(file);
  });

export async function addPictures(files) {
  for (const file of files) {
    if (!file?.type.startsWith('image/')) continue;
    try {
      const src = await readAsDataUrl(file);
      const entry = picture(src);
      await entry.ready;
      if (!entry.image) throw new Error();
      const { naturalWidth: w, naturalHeight: h } = entry.image;
      // Fits inside the picture, keeping its shape.
      const k = Math.min(1, doc.value.width / w, doc.value.height / h);
      addLayer(
        newImage(src, w * k, h * k, {
          ...centred(doc.value, w * k, h * k),
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Picture',
        }),
      );
      tool.value = 'move';
    } catch {
      error.value = `${file.name} couldn’t be read as a picture`;
    }
  }
}

export function select(id) {
  selectedId.value = id;
  draw();
}

export function toggleLayer(id, key) {
  const layer = doc.value.layers.find((l) => l.id === id);
  if (layer) change(patchLayer(id, { [key]: !layer[key] }));
}

export function moveLayer(step) {
  const i = indexOf(selectedId.value);
  const j = i + step;
  if (i < 0 || j < 0 || j >= doc.value.layers.length) return;
  const layers = [...doc.value.layers];
  [layers[i], layers[j]] = [layers[j], layers[i]];
  change({ ...doc.value, layers });
}

export function duplicateLayer() {
  const layer = selected.value;
  if (!layer) return;
  const copy = structuredClone(layer);
  copy.id = `${layer.id}-${Date.now().toString(36)}`;
  copy.name = `${layer.name} copy`;
  if (copy.type !== 'paint') {
    copy.x += 10;
    copy.y += 10;
  }
  addLayer(copy);
}

export function deleteLayer() {
  const i = indexOf(selectedId.value);
  if (i < 0) return;
  const layers = doc.value.layers.filter((_, j) => j !== i);
  change({ ...doc.value, layers });
  selectedId.value = layers[Math.max(0, i - 1)]?.id ?? null;
  draw();
}

// ─── For the right-click menu (src/ui/context-menu.jsx) ──────────────────

/** The point on the picture under a screen point, or null off it. */
export function docAt(clientX, clientY) {
  if (!overlay) return null;
  const p = toDoc({ clientX, clientY });
  return p.x >= 0 && p.y >= 0 && p.x <= doc.value.width && p.y <= doc.value.height ? p : null;
}

/** Every layer under a screen point, topmost first (as Photoshop's "Select layer" lists them). */
export function layersAt(clientX, clientY) {
  const p = docAt(clientX, clientY);
  if (!p) return [];
  return doc.value.layers
    .filter((l) => {
      if (!l.visible) return false;
      if (l.type === 'paint') return true;
      const q = local(l, p);
      return Math.abs(q.x) <= l.w / 2 && Math.abs(q.y) <= l.h / 2;
    })
    .reverse();
}

/** The guide under a screen point (its index), or -1. */
export function guideIndexAt(clientX, clientY) {
  return overlay ? guideAt(toDoc({ clientX, clientY })) : -1;
}

export function deleteGuide(index) {
  change({ ...doc.value, guides: (doc.value.guides ?? []).filter((_, i) => i !== index) });
}

/** The picked layer to the top ('front') or bottom ('back') of the stack. */
export function arrange(where) {
  const i = indexOf(selectedId.value);
  if (i < 0) return;
  const layers = [...doc.value.layers];
  const [layer] = layers.splice(i, 1);
  if (where === 'front') layers.push(layer);
  else layers.unshift(layer);
  change({ ...doc.value, layers });
}

/** Lines the picked layer up with the picture: 'left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'. */
export function alignSelected(how) {
  const layer = selected.value;
  if (!layer || layer.type === 'paint') return;
  const { width: W, height: H } = doc.value;
  const patch = {
    left: { x: 0 },
    hcenter: { x: Math.round((W - layer.w) / 2) },
    right: { x: W - layer.w },
    top: { y: 0 },
    vcenter: { y: Math.round((H - layer.h) / 2) },
    bottom: { y: H - layer.h },
  }[how];
  if (patch) change(patchLayer(layer.id, patch));
}

/** The picked layer stretched (or fitted, keeping its shape) to the whole picture. */
export function fitSelected(keepShape = true) {
  const layer = selected.value;
  if (!layer || layer.type === 'paint') return;
  const { width: W, height: H } = doc.value;
  let w = W;
  let h = H;
  if (keepShape && layer.w && layer.h) {
    const k = Math.min(W / layer.w, H / layer.h);
    w = Math.round(layer.w * k);
    h = Math.round(layer.h * k);
  }
  change(patchLayer(layer.id, { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }));
}

// A layer's style (its effects, opacity and blend), as Photoshop's Copy /
// Paste Layer Style: kept here, put onto any other layer.
export const copiedStyle = signal(null);
export function copyStyle() {
  const layer = selected.value;
  if (layer) copiedStyle.value = structuredClone({ fx: layer.fx, opacity: layer.opacity, blend: layer.blend });
}
export function pasteStyle() {
  const layer = selected.value;
  if (layer && copiedStyle.value) change(patchLayer(layer.id, structuredClone(copiedStyle.value)));
}
export function clearStyle() {
  const layer = selected.value;
  if (layer) change(patchLayer(layer.id, { fx: newFx(), opacity: 100, blend: 'source-over' }));
}

/** A new layer of `kind` (a meter, a shape, text, a drawing) centred where the menu opened, or mid-picture. */
export function addAt(kind, point) {
  const p = point ?? { x: doc.value.width / 2, y: doc.value.height / 2 };
  if (kind === 'text') {
    const h = Math.round(doc.value.height * 0.14);
    const w = Math.round(doc.value.width * 0.6);
    return addLayer(newText({ x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, size: Math.round(h * 0.75) }));
  }
  if (kind === 'paint') return addDrawing();
  const [w, h] = CLICK_SIZES[kind] ?? [300, 200];
  addLayer(makeShape(kind, shaped(kind, { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h })));
}

/** Turns a bar layer into another kind of bar, keeping all its settings (they apply to every kind they can). */
export function convertBar(shape) {
  const layer = selected.value;
  if (layer?.type !== 'bar') return;
  const patch = { shape };
  // A ring is round: give it a square box the first time, round its band.
  if (shape === 'ring' && layer.w !== layer.h) {
    const side = Math.min(layer.w, layer.h) > 40 ? Math.max(layer.w, layer.h) * 0.6 : Math.max(layer.w, layer.h);
    Object.assign(patch, { x: Math.round(layer.x + (layer.w - side) / 2), y: Math.round(layer.y + (layer.h - side) / 2), w: Math.round(side), h: Math.round(side) });
  }
  change(patchLayer(layer.id, patch));
}

// ─── New, open, save ────────────────────────────────────────────────────

export function openDialog(name) {
  stop();
  if (name === 'new') newSteps.value = doc.value.frames;
  if (name === 'open') refreshDesigns();
  if (name === 'export') refreshSkill();
  dialog.value = name;
}

export const closeDialog = () => (dialog.value = null);

function replaceDoc(next, atFrame, id = null) {
  stop();
  change(next);
  batch(() => {
    designId.value = id;
    dirty.value = false;
    selectedId.value = next.layers.at(-1)?.id ?? null;
    frame.value = atFrame ?? Math.round(next.frames * 0.65);
    zoom.value = 0;
    dialog.value = null;
    error.value = null;
  });
  draw();
}

export function createNew() {
  const d = newDoc({ frames: newSteps.value });
  const first = { bar: barFor, ring: ringFor }[newStart.value];
  replaceDoc({ ...d, layers: first ? [first(d)] : [] });
}

export const useExample = (example) => replaceDoc(example.make());

// Each example drawn small, at two thirds full, for the New dialog's cards
// (once, a frame at a time, so the dialog opens at once).
export const exampleThumbs = signal({});
export function drawExampleThumbs() {
  const todo = EXAMPLES.filter((t) => !exampleThumbs.peek()[t.id]);
  const next = () => {
    const t = todo.shift();
    if (!t) return;
    const d = t.make();
    const url = render(d, Math.round(d.frames * 0.66), { scale: 0.18, resolve }).toDataURL();
    exampleThumbs.value = { ...exampleThumbs.peek(), [t.id]: url };
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

export function setName(raw) {
  const name = raw.trim().slice(0, 80) || 'Untitled bar';
  change({ ...doc.value, name }, 'doc:name');
}

// Saves inside the app. The first save gives the design an id; after that,
// saving replaces it.
export async function saveHere() {
  await loadAll();
  designId.value ??= `pb-${Date.now().toString(36)}`;
  const d = doc.value;
  const thumb = render(d, d.frames, { scale: 160 / Math.max(d.width, d.height), resolve }).toDataURL();
  const ok = await shelf.store(designId.value, { name: d.name, frames: d.frames, thumb }, d);
  if (ok) dirty.value = false;
  error.value = ok ? null : 'Storage refused it: save it as a file instead.';
  status.value = ok ? `Saved “${d.name}”.` : null;
  if (dialog.value === 'open') refreshDesigns();
}

function whenSaved(at) {
  if (!at) return '';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(at).toLocaleDateString();
}

export async function refreshDesigns() {
  const list = await shelf.list();
  designs.value = list.map((d) => ({ ...d, when: whenSaved(d.savedAt), current: d.id === designId.value }));
}

export async function openSaved(id) {
  const loaded = normaliseDoc(await shelf.load(id));
  if (!loaded) {
    error.value = 'That design is no longer saved.';
    return refreshDesigns();
  }
  replaceDoc(loaded, Math.round(loaded.frames * 0.65), id);
  fetchStrokes();
}

export async function deleteSaved(id) {
  await shelf.forget(id);
  if (designId.value === id) {
    designId.value = null;
    dirty.value = true;
  }
  refreshDesigns();
}

// A file: the copy that goes anywhere.
export async function saveDesignFile() {
  const blob = new Blob([JSON.stringify(doc.value)], { type: 'application/json' });
  const where = await saveBlob(blob, `${doc.value.name || 'meter'}.meter.json`, 'Meter design');
  if (where) status.value = `Saved the design to ${where}.`;
}

export async function openDesignFile() {
  const file = await openTextFile('Meter design', ['json']);
  if (!file) return;
  try {
    const loaded = normaliseDoc(JSON.parse(file.text));
    if (!loaded) throw new Error();
    replaceDoc(loaded, Math.min(frame.value, loaded.frames));
    dirty.value = true;
    fetchStrokes();
  } catch {
    error.value = `${file.name} isn’t a meter design`;
  }
}

// ─── Stroke order ───────────────────────────────────────────────────────
// Text bars drawn in stroke order need each character's strokes. They're
// fetched once and written into the layer, so the design carries them.

const strokeJobs = new Set();

function fetchStrokes() {
  for (const layer of doc.value.layers) {
    if (layer.shape !== 'text' || layer.textMode !== 'strokes') continue;
    for (const char of new Set([...String(layer.text ?? '')])) {
      if (!char.trim() || char in (layer.strokeData ?? {})) continue;
      const job = `${layer.id}:${char}`;
      if (strokeJobs.has(job)) continue;
      strokeJobs.add(job);
      status.value = `Getting the stroke order for ${char}…`;
      strokesFor(char).then((strokes) => {
        strokeJobs.delete(job);
        const i = indexOf(layer.id);
        if (i < 0) return;
        // Written straight in, not as an undo step: it's data, not an edit.
        doc.value = setIn(doc.value, ['layers', i, 'strokeData', char], strokes);
        if (!strokeJobs.size) status.value = null;
        draw();
      });
    }
  }
}

// ─── Pointer on the picture ─────────────────────────────────────────────

let brushStroke = null;
let drag = null;

export function pickTool(id) {
  if (tool.value === 'pen' && id !== 'pen') penFinish();
  tool.value = id;
  draw();
}

// ─── The pen ────────────────────────────────────────────────────────────
// Click to place points; drag from a point to curve it (its handles). Click
// the first point (or press Enter) to close the shape, Esc to drop it,
// Backspace to take the last point back. The finished path is a shape layer
// ('path') like any other: moved, resized, filled, outlined and styled.

export const penPoints = signal([]); // [{ x, y, out: [dx, dy] | null }] in picture pixels
let penDrag = null;

function penDown(p, event) {
  const pts = penPoints.value;
  const first = pts[0];
  // Back on the first point: closed.
  if (first && pts.length > 2 && Math.hypot(p.x - first.x, p.y - first.y) < 10 * unit()) return penFinish(true);
  const at = snapPoint(p, null, event);
  penPoints.value = [...pts, { x: at.x, y: at.y, out: null }];
  penDrag = { start: at };
  const move = (e) => {
    const q = toDoc(e);
    const dx = q.x - penDrag.start.x;
    const dy = q.y - penDrag.start.y;
    if (Math.hypot(dx, dy) < 3 * unit()) return;
    const list = [...penPoints.value];
    list[list.length - 1] = { ...list.at(-1), out: [dx, dy] };
    penPoints.value = list;
    drawSelection();
  };
  const up = () => {
    penDrag = null;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  drawSelection();
}

/** The path through `pts` as SVG data (absolute picture pixels); curves where a point has handles. */
function penPathData(pts, closed, map = (x, y) => [x, y]) {
  if (!pts.length) return '';
  const f = (v) => Math.round(v * 100) / 100;
  const P = (x, y) => map(x, y).map(f).join(' ');
  let d = `M${P(pts[0].x, pts[0].y)}`;
  const seg = (a, b) => {
    if (!a.out && !b.out) return `L${P(b.x, b.y)}`;
    const c1 = a.out ? [a.x + a.out[0], a.y + a.out[1]] : [a.x, a.y];
    const c2 = b.out ? [b.x - b.out[0], b.y - b.out[1]] : [b.x, b.y];
    return `C${P(...c1)} ${P(...c2)} ${P(b.x, b.y)}`;
  };
  for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) d += `${seg(pts.at(-1), pts[0])}Z`;
  return d;
}

/** Ends the pen: a shape layer if there's a shape to make, closed or open. */
export function penFinish(closed = false) {
  const pts = penPoints.value;
  penPoints.value = [];
  if (pts.length < 2) return drawSelection();
  // The box round the points and their handles' pulls.
  const xs = pts.flatMap((q) => [q.x, ...(q.out ? [q.x + q.out[0], q.x - q.out[0]] : [])]);
  const ys = pts.flatMap((q) => [q.y, ...(q.out ? [q.y + q.out[1], q.y - q.out[1]] : [])]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x);
  const h = Math.max(1, Math.max(...ys) - y);
  const d = penPathData(pts, closed, (px, py) => [((px - x) / w) * 100, ((py - y) / h) * 100]);
  const open = !closed || pts.length < 3;
  addLayer(
    newShape('path', {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      d,
      closed: !open,
      name: open ? 'Line' : 'Path',
      fillOn: !open,
      stroke: open ? 8 : 0,
      strokeColor: '#FFFFFF',
    }),
  );
  tool.value = 'move';
  draw();
}

export function penCancel() {
  penPoints.value = [];
  drawSelection();
}

export function penUndo() {
  penPoints.value = penPoints.value.slice(0, -1);
  drawSelection();
}

function toDoc(event) {
  const r = overlay.getBoundingClientRect();
  return {
    x: ((event.clientX - r.left) * doc.value.width) / r.width,
    y: ((event.clientY - r.top) * doc.value.height) / r.height,
  };
}

// A point in a layer's own unrotated frame, measured from its middle.
function local(layer, p) {
  const a = (-layer.rotation * Math.PI) / 180;
  const dx = p.x - (layer.x + layer.w / 2);
  const dy = p.y - (layer.y + layer.h / 2);
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

function world(layer, q) {
  const a = (layer.rotation * Math.PI) / 180;
  return {
    x: layer.x + layer.w / 2 + q.x * Math.cos(a) - q.y * Math.sin(a),
    y: layer.y + layer.h / 2 + q.x * Math.sin(a) + q.y * Math.cos(a),
  };
}

function handleAt(p) {
  const layer = selected.value;
  if (!layer || layer.type === 'paint') return null;
  const q = local(layer, p);
  const reach = 10 * unit();
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    if (Math.abs(q.x - (sx * layer.w) / 2) < reach && Math.abs(q.y - (sy * layer.h) / 2) < reach) return { sx, sy };
  return null;
}

// The top visible layer under the point. Drawings cover everything, so
// they're only picked from the Layers panel.
function layerAt(p) {
  for (let i = doc.value.layers.length - 1; i >= 0; i--) {
    const layer = doc.value.layers[i];
    if (!layer.visible || layer.type === 'paint') continue;
    const q = local(layer, p);
    if (Math.abs(q.x) <= layer.w / 2 && Math.abs(q.y) <= layer.h / 2) return layer;
  }
  return null;
}

export function pointerDown(event) {
  if (event.button > 0 || !overlay) return;
  stop();
  event.preventDefault();
  try {
    overlay.setPointerCapture(event.pointerId);
  } catch {
    // a pointer the browser no longer knows about; the drag still works
  }
  const p = toDoc(event);
  const t = tool.value;
  if (t === 'brush' || t === 'eraser') return startStroke(p);
  if (t === 'text') {
    const h = Math.round(doc.value.height * 0.14);
    const w = Math.round(doc.value.width * 0.6);
    addLayer(newText({ x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, size: Math.round(h * 0.75) }));
    tool.value = 'move';
    return draw();
  }
  if (t === 'pen') return penDown(p, event);
  if (t === 'shape' || t === 'bar') {
    const kind = t === 'bar' ? barKind.value : shapeKind.value;
    const start = snapPoint(p, null, event);
    const layer = makeShape(kind, { x: start.x, y: start.y, w: 1, h: 1 });
    addLayer(layer);
    drag = { kind: 'create', shape: kind, id: layer.id, start };
    return;
  }
  const handle = handleAt(p);
  // A guide (when no corner handle is under the pointer): moved, or dragged off to remove it.
  const guide = handle ? -1 : guideAt(p);
  if (guide >= 0) return startGuide(doc.value.guides[guide].axis, event, guide);
  if (handle) {
    const layer = selected.value;
    drag = {
      kind: 'resize',
      id: layer.id,
      ...handle,
      fixed: world(layer, { x: (-handle.sx * layer.w) / 2, y: (-handle.sy * layer.h) / 2 }),
      remembered: false,
    };
    return;
  }
  const layer = layerAt(p);
  selectedId.value = layer?.id ?? null;
  draw();
  if (layer) drag = { kind: 'move', id: layer.id, start: p, from: { x: layer.x, y: layer.y }, remembered: false };
}

export function pointerMove(event) {
  if (!overlay) return;
  pointerAt.value = toDoc(event);
  if (brushStroke) return strokeTo(toDoc(event));
  if (!drag) return;
  let p = toDoc(event);
  const layer = doc.value.layers.find((l) => l.id === drag.id);
  if (!layer) return;
  if (drag.remembered === false) {
    remember();
    drag.remembered = true;
  }
  if (drag.kind === 'move') {
    const box = snapBox({ x: drag.from.x + p.x - drag.start.x, y: drag.from.y + p.y - drag.start.y, w: layer.w, h: layer.h }, layer.id, layer.rotation ? { altKey: true } : event);
    commit(patchLayer(drag.id, { x: Math.round(box.x), y: Math.round(box.y) }));
  } else if (drag.kind === 'create') {
    p = snapPoint(p, drag.id, event);
    let w = Math.abs(p.x - drag.start.x);
    let h = Math.abs(p.y - drag.start.y);
    // Rings are round; Shift makes anything square.
    if (SQUARE.has(drag.shape) || event.shiftKey) w = h = Math.max(w, h);
    const box = {
      x: Math.round(p.x < drag.start.x ? drag.start.x - w : drag.start.x),
      y: Math.round(p.y < drag.start.y ? drag.start.y - h : drag.start.y),
      w: Math.max(1, Math.round(w)),
      h: Math.max(1, Math.round(h)),
    };
    commit(patchLayer(drag.id, shaped(drag.shape, box)));
  } else {
    // The opposite corner stays put, whatever the rotation.
    if (!layer.rotation) p = snapPoint(p, layer.id, event);
    const a = (-layer.rotation * Math.PI) / 180;
    const dx = p.x - drag.fixed.x;
    const dy = p.y - drag.fixed.y;
    const vx = dx * Math.cos(a) - dy * Math.sin(a);
    const vy = dx * Math.sin(a) + dy * Math.cos(a);
    let w = Math.max(1, drag.sx * vx);
    let h = Math.max(1, drag.sy * vy);
    if (event.shiftKey && layer.w && layer.h) {
      const k = Math.max(w / layer.w, h / layer.h);
      w = layer.w * k;
      h = layer.h * k;
    }
    const b = (layer.rotation * Math.PI) / 180;
    const hx = (drag.sx * w) / 2;
    const hy = (drag.sy * h) / 2;
    const cx = drag.fixed.x + hx * Math.cos(b) - hy * Math.sin(b);
    const cy = drag.fixed.y + hx * Math.sin(b) + hy * Math.cos(b);
    commit(
      patchLayer(drag.id, { w: Math.round(w), h: Math.round(h), x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) }),
    );
  }
}

export function pointerUp() {
  if (brushStroke) return endStroke();
  const was = drag;
  drag = null;
  if (snapLines.length) {
    snapLines = [];
    drawSelection();
  }
  // A click with the shape tool, not a drag: a shape you can see.
  if (was?.kind === 'create') {
    const layer = doc.value.layers.find((l) => l.id === was.id);
    if (layer && layer.w < 4 && layer.h < 4) {
      const [w, h] = CLICK_SIZES[was.shape] ?? [300, 200];
      commit(
        patchLayer(
          was.id,
          shaped(was.shape, { x: Math.round(was.start.x - w / 2), y: Math.round(was.start.y - h / 2), w, h }),
        ),
      );
    }
    tool.value = 'move';
    draw();
  }
}

// Ctrl + wheel zooms, as in every image editor.
export function wheel(event) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? 1.25 : 0.8);
}

export function zoomBy(k) {
  zoom.value = clamp((zoom.value || viewScale.value || 1) * k, 0.1, 16);
  draw();
}

export function zoomTo(value) {
  zoom.value = value;
  pan.value = { x: 0, y: 0 };
  draw();
}

// ─── Panning ────────────────────────────────────────────────────────────
// A middle-drag moves the view: it scrolls while there's somewhere to
// scroll, and past that moves the picture itself, so it can be panned even
// while it fits. Fit (Ctrl+0) centres it again.

export const pan = signal({ x: 0, y: 0 });

export function startPan(event, area, after = () => {}) {
  if (event.button !== 1 || !area) return;
  event.preventDefault();
  event.stopPropagation();
  area.classList.add('is-panning');
  let x = event.clientX;
  let y = event.clientY;
  const move = (e) => {
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    x = e.clientX;
    y = e.clientY;
    // Scroll first; what scrolling can't take moves the picture.
    const sl = area.scrollLeft;
    const st = area.scrollTop;
    area.scrollLeft -= dx;
    area.scrollTop -= dy;
    const leftX = dx + (area.scrollLeft - sl);
    const leftY = dy + (area.scrollTop - st);
    if (leftX || leftY) pan.value = { x: pan.value.x + leftX, y: pan.value.y + leftY };
    after();
  };
  const up = () => {
    area.classList.remove('is-panning');
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    after();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

// ─── Brush ──────────────────────────────────────────────────────────────
// The stroke is drawn opaque on its own canvas and laid over the layer at
// the brush's opacity, so a see-through brush doesn't darken where the
// stroke crosses itself.

function startStroke(p) {
  let layer = selected.value;
  if (layer?.type !== 'paint') {
    if (tool.value === 'eraser') return;
    layer = newPaint();
    addLayer(layer);
  } else remember();
  const make = () => Object.assign(document.createElement('canvas'), { width: doc.value.width, height: doc.value.height });
  const base = make();
  const existing = resolve(layer.src);
  if (existing) base.getContext('2d').drawImage(existing, 0, 0, base.width, base.height);
  const lines = make().getContext('2d');
  lines.strokeStyle = lines.fillStyle = brushColor.value;
  lines.lineWidth = brushSize.value;
  lines.lineCap = lines.lineJoin = 'round';
  brushStroke = { base, lines, last: p, erase: tool.value === 'eraser' };
  override = { id: layer.id, canvas: make() };
  lines.beginPath();
  lines.arc(p.x, p.y, brushSize.value / 2, 0, Math.PI * 2);
  lines.fill();
  composeStroke();
}

function strokeTo(p) {
  const { lines, last } = brushStroke;
  lines.beginPath();
  lines.moveTo(last.x, last.y);
  lines.lineTo(p.x, p.y);
  lines.stroke();
  brushStroke.last = p;
  composeStroke();
}

function composeStroke() {
  const { base, lines, erase } = brushStroke;
  const ctx = override.canvas.getContext('2d');
  ctx.clearRect(0, 0, base.width, base.height);
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = brushAlpha.value / 100;
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.drawImage(lines.canvas, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  draw();
}

function endStroke() {
  const { id, canvas: painted } = override;
  const src = painted.toDataURL('image/png');
  drawables.set(src, { image: painted, ready: Promise.resolve() });
  brushStroke = null;
  override = null;
  commit(patchLayer(id, { src }));
}

// ─── Keys ───────────────────────────────────────────────────────────────

const TOOL_ACTIONS = { barMove: 'move', barBrush: 'brush', barEraser: 'eraser', barShape: 'shape', barText: 'text', barBar: 'bar', barPen: 'pen' };
const isTyping = (el) => el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);

/** The Meter Maker's keys (rebindable: src/keybinds.js, the 'bars' and 'both' actions). */
export function onKey(event) {
  if (dialog.value || S.dialog.value) return; // dialogs handle their own keys
  if (isTyping(event.target)) return;
  const k = event.key.toLowerCase();
  const act = (fn) => {
    event.preventDefault();
    fn();
  };
  if (tool.value === 'pen' && penPoints.value.length) {
    if (event.key === 'Enter') return act(() => penFinish(true));
    if (event.key === 'Escape') return act(penCancel);
    if (event.key === 'Backspace') return act(penUndo);
  }
  const action = actionOf(event, 'bars');
  if (action === 'undo') return act(event.shiftKey ? redo : undo);
  if (action === 'redo') return act(redo);
  if (action === 'save') return act(saveHere);
  if (action === 'saveAs') return act(saveDesignFile);
  if (action === 'open') return act(() => openDialog('open'));
  if (action === 'export') return act(() => openDialog('export'));
  if (action === 'barFit') return act(() => zoomTo(0));
  if (action === 'barRulers') return act(toggleRulers);
  if (action === 'barSnap') return act(toggleSnapping);
  if (action === 'barPrevStep') return act(() => showFrame(frame.value - 1));
  if (action === 'barNextStep') return act(() => showFrame(frame.value + 1));
  if (action === 'play') {
    if (event.target?.tagName === 'BUTTON') return;
    return act(play);
  }
  if (action === 'delete' && selected.value) return act(deleteLayer);
  if (TOOL_ACTIONS[action]) return act(() => pickTool(TOOL_ACTIONS[action]));
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (nudge && selected.value && selected.value.type !== 'paint') {
    const step = event.shiftKey ? 10 : 1;
    const layer = selected.value;
    return act(() =>
      change(patchLayer(layer.id, { x: layer.x + nudge[0] * step, y: layer.y + nudge[1] * step }), `${layer.id}:nudge`),
    );
  }
}

// ─── Steps ──────────────────────────────────────────────────────────────

let player = 0;

export function showFrame(n) {
  stop();
  frame.value = clamp(Number(n) || 0, 0, doc.value.frames);
  draw();
}

export function setFps(n) {
  fps.value = clamp(Number(n) || 12, 1, 60);
  if (playing.value) {
    stop();
    play();
  }
}

export function play() {
  if (playing.value) return stop();
  playing.value = true;
  if (frame.value >= doc.value.frames) frame.value = 0;
  player = setInterval(() => {
    frame.value = frame.value >= doc.value.frames ? 0 : frame.value + 1;
    draw();
  }, 1000 / fps.value);
  draw();
}

export function stop() {
  if (!playing.value) return;
  clearInterval(player);
  playing.value = false;
  draw();
}

// ─── Export: pictures ───────────────────────────────────────────────────

const canvasBlob = (c) => new Promise((done) => c.toBlob(done, 'image/png'));
const sizeLabel = (bytes) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function withBusy(job) {
  if (busy.value) return;
  stop();
  batch(() => {
    busy.value = true;
    error.value = null;
    status.value = null;
  });
  try {
    await loadAll();
    await job();
  } catch (e) {
    error.value = e?.message ?? 'Couldn’t write the pictures out';
  } finally {
    busy.value = false;
  }
}

// In layers: the container once, then a folder each for the meter, its
// leading edge and its catch-up trail (those the design has), a picture a step.
function layeredParts(d) {
  return [
    ['meter', 'meter'],
    ...(hasPart(d, 'lead') ? [['lead', 'leading-edge']] : []),
    ...(hasPart(d, 'trail') ? [['trail', 'trail']] : []),
  ];
}

export const saveZip = () =>
  withBusy(async () => {
    const d = doc.value;
    const entries = {};
    if (layeredExport.value) {
      const once = async (part, suffix) => {
        const blob = await canvasBlob(render(d, 0, { resolve, part }));
        entries[`${exportName.value || 'progress'}_${suffix}.png`] = new Uint8Array(await blob.arrayBuffer());
      };
      await once('container', 'container');
      const sp = separateParts(d);
      if (sp.front) await once('front', 'front');
      for (const e of sp.extras) await once(e.key, `steps-${e.steps[0]}-${e.steps.at(-1)}`);
      for (const [part, folder] of layeredParts(d))
        for (let k = 0; k <= d.frames; k++) {
          const blob = await canvasBlob(render(d, k, { resolve, part }));
          entries[`${folder}/${frameName(exportName.value, k, d.frames)}`] = new Uint8Array(await blob.arrayBuffer());
        }
    } else
      for (let k = 0; k <= d.frames; k++) {
        const blob = await canvasBlob(render(d, k, { resolve }));
        entries[frameName(exportName.value, k, d.frames)] = new Uint8Array(await blob.arrayBuffer());
      }
    const { zipSync } = await import('fflate');
    // PNGs are compressed already; zipping them again only costs time.
    const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
    const where = await saveBlob(zip, `${exportName.value || 'progress'}.zip`, 'Zip archive');
    if (where)
      status.value = layeredExport.value
        ? `Saved the container and ${layeredParts(d).map(([, f]) => f).join(', ')} (${d.frames + 1} pictures each): ${sizeLabel(zip.size)}`
        : `Saved ${d.frames + 1} pictures, ${firstName.value} (empty) to ${lastName.value} (full): ${sizeLabel(zip.size)}`;
  });

export const saveFrame = () =>
  withBusy(async () => {
    const blob = await canvasBlob(render(doc.value, frame.value, { resolve }));
    const name = frameName(exportName.value, frame.value, doc.value.frames);
    const where = await saveBlob(blob, name, 'PNG picture');
    if (where) status.value = `Saved ${name}: ${sizeLabel(blob.size)}`;
  });

// Every step on one picture, left to right then down.
export const saveSheet = () =>
  withBusy(async () => {
    const d = doc.value;
    const count = d.frames + 1;
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const sheet = Object.assign(document.createElement('canvas'), {
      width: columns * d.width,
      height: rows * d.height,
    });
    const ctx = sheet.getContext('2d');
    for (let k = 0; k < count; k++)
      ctx.drawImage(render(d, k, { resolve }), (k % columns) * d.width, Math.floor(k / columns) * d.height);
    const blob = await canvasBlob(sheet);
    if (!blob) throw new Error('That sheet is too big to save; try fewer steps');
    const where = await saveBlob(blob, `${exportName.value || 'progress'}-sheet.png`, 'PNG picture');
    if (where) status.value = `Saved a ${columns}×${rows} sheet, ${sheet.width}×${sheet.height}: ${sizeLabel(blob.size)}`;
  });

// ─── Export: the JJS skill ──────────────────────────────────────────────
// Every step uploaded to the signed-in Roblox account as a decal, the image
// behind each decal found, and the lot written into a Skill Builder skill
// that flips between them on a tag: the IDs go in by themselves.

export function setJjs(key, value) {
  if (key === 'size') value = Math.max(0.1, Number(value) || 0);
  if (key === 'showFor' || key === 'waitFor') value = Math.max(0, Number(value) || 0);
  if (key === 'checkEvery') value = Math.max(0.01, Number(value) || 0);
  if (key === 'regenEvery') value = Math.max(0.05, Number(value) || 0);
  if (key === 'regenAmount') value = Number(value) || 0;
  if (key === 'trailTime') value = Math.max(0.05, Number(value) || 0);
  if (key === 'healthMax') value = Math.max(1, Number(value) || 100);
  if (key === 'healthEvery') value = Math.max(0.01, Number(value) || 0.05);
  change(setIn(doc.value, ['jjs', key], value), `doc:jjs:${key}`);
  refreshSkill();
}

/** The skills for the IDs and settings, or null while an ID is missing. */
function skillsNow() {
  const ids = jjsIds.value;
  if (ids.length !== pictures.value) return null;
  const j = jjs.value;
  if (separate.value && (containerIds.value.length !== 1 || (wantsTrail.value && trailIds.value.length !== pictures.value))) return null;
  const sp = separate.value ? sepParts.value : null;
  if (sp && ((sp.front && frontIds.value.length !== 1) || sp.extras.some((e) => !extraIdOf(e.key)))) return null;
  return buildSkill({
    textures: ids,
    name: j.name.trim() || doc.value.name,
    tag: j.tag.trim() || 'Bar',
    start: j.start,
    size: j.size,
    position: j.position.trim() || '0, 0, 0',
    style: j.style,
    checkEvery: j.checkEvery,
    showFor: j.showFor,
    waitFor: j.waitFor,
    rails: j.rails,
    clientSided: j.clientSided,
    regen: j.regen ? { amount: j.regenAmount, every: j.regenEvery } : null,
    health: j.source === 'health' ? { max: j.healthMax, every: j.healthEvery } : null,
    container: separate.value ? containerIds.value[0] : null,
    trails: separate.value && wantsTrail.value ? trailIds.value : null,
    trailTime: j.trailTime,
    front: sp?.front ? frontIds.value[0] : null,
    extras: sp ? sp.extras.map((e) => ({ id: extraIdOf(e.key), steps: e.steps, above: e.above })) : [],
  });
}

/** What the skill still needs, in words, or null. */
function missing() {
  const n = pictures.value;
  const parts = [];
  if (jjsIds.value.length !== n) parts.push(`${n} meter image IDs, one per step from 0 (empty) to ${doc.value.frames} (full); there are ${jjsIds.value.length}`);
  if (separate.value && containerIds.value.length !== 1) parts.push('the container’s image ID');
  if (separate.value && wantsTrail.value && trailIds.value.length !== n) parts.push(`${n} trail image IDs; there are ${trailIds.value.length}`);
  if (separate.value && sepParts.value.front && frontIds.value.length !== 1) parts.push('the front’s image ID');
  for (const e of separate.value ? sepParts.value.extras : []) if (!extraIdOf(e.key)) parts.push(`the image ID for what shows on steps ${e.label.slice(6)}`);
  return parts.length ? `The skill needs ${parts.join(', and ')}.` : null;
}

// The skill code, remade whenever the IDs or settings change; an older,
// slower build never overwrites a newer one.
let build = 0;
export async function refreshSkill() {
  const mine = ++build;
  copied.value = false;
  const skills = skillsNow();
  if (!skills) {
    const any = jjsIds.value.length || containerIds.value.length || trailIds.value.length || frontIds.value.length;
    batch(() => {
      skillCode.value = '';
      skillNote.value = any ? missing() : null;
    });
    return;
  }
  const code = await encodeSkill(skills);
  if (mine !== build) return;
  batch(() => {
    skillCode.value = code;
    skillNote.value = null;
  });
}

export async function copySkill() {
  try {
    await navigator.clipboard.writeText(skillCode.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

/**
 * Puts the bar's skills into the moveset: a skill with the same name and
 * category is replaced (so uploading again updates it), the rest added.
 */
export function addToMoveset() {
  const skills = skillsNow();
  if (!skills) return;
  const { added, replaced } = S.mergeSkills(parsedSkills(skills));
  const parts = [replaced && `updated ${replaced}`, added && `added ${added}`].filter(Boolean).join(' and ');
  status.value = `${parts[0].toUpperCase()}${parts.slice(1)} skill${added + replaced === 1 ? '' : 's'} in “${S.name.value}”.`;
  return { added, replaced };
}

// Uploads every step, one after another (Roblox rate-limits uploads), and
// stops at the first failure so a problem doesn't cost twenty uploads.
// Steps already uploaded for this same drawing are skipped on a retry. When
// every step is up, the IDs are filled in and the skill is put straight
// into the moveset.
export async function uploadToRoblox() {
  if (separate.value) return uploadLayered();
  if (uploading.value) return;
  stop();
  batch(() => {
    uploading.value = true;
    uploadError.value = null;
  });
  const d = doc.value;
  const fingerprint = drawingFingerprint(d);
  const kept = jjs.value.uploadedFor === fingerprint ? [...jjs.value.uploads] : [];
  const rows = Array.from({ length: d.frames + 1 }, (_, step) => ({
    step,
    state: kept[step]?.imageId ? 'done' : 'waiting',
    ...kept[step],
  }));
  const show = () => (uploadRows.value = rows.map((r) => ({ ...r })));
  show();
  try {
    await loadAll();
    if (!account.value?.signedIn) throw new Error('Sign in with Roblox first');
    for (const row of rows) {
      if (row.state === 'done') continue;
      row.state = 'uploading';
      show();
      const blob = await canvasBlob(render(d, row.step, { resolve }));
      const { decalId, imageId, moderation } = await uploadDecal(blob, {
        name: `${d.name} ${row.step}/${d.frames}`,
        description: `Step ${row.step} of ${d.frames} of a meter, made with Arayashiki's Meter Maker.`,
      });
      Object.assign(row, { decalId, imageId, moderation, state: 'done' });
      show();
      kept[row.step] = { decalId, imageId, moderation };
      // Kept as it goes, so a failure part-way loses nothing.
      commit(setIn(setIn(doc.value, ['jjs', 'uploads'], [...kept]), ['jjs', 'uploadedFor'], fingerprint));
    }
    commit(setIn(doc.value, ['jjs', 'ids'], rows.map((r) => r.imageId).join('\n')));
    await refreshSkill();
    addToMoveset();
  } catch (e) {
    const failed = rows.find((r) => r.state === 'uploading');
    if (failed) {
      failed.state = 'failed';
      failed.error = String(e?.message ?? e);
    }
    show();
    uploadError.value = String(e?.message ?? e);
  } finally {
    uploading.value = false;
  }
}

// Complex Separate's uploads: the container, then the meter's steps (with
// their leading edge), then the trail's, each kept as it goes under the
// drawing's fingerprint, so a retry skips what's already up.
async function uploadLayered() {
  if (uploading.value) return;
  stop();
  batch(() => {
    uploading.value = true;
    uploadError.value = null;
  });
  const d = doc.value;
  const fingerprint = `${drawingFingerprint(d)}:separate`;
  const was = jjs.value.layeredUploads;
  const items = was?.fingerprint === fingerprint ? { ...was.items } : {};
  const jobs = [
    { key: 'container:0', part: 'container', frame: 0, label: 'Container' },
    ...(sepParts.value.front ? [{ key: 'front:0', part: 'front', frame: 0, label: 'Front' }] : []),
    ...sepParts.value.extras.map((e) => ({ key: e.key, part: e.key, frame: e.steps[0], label: e.label })),
    ...Array.from({ length: d.frames + 1 }, (_, k) => ({ key: `meter:${k}`, part: 'meterLead', frame: k, label: `Meter ${k}` })),
    ...(wantsTrail.value ? Array.from({ length: d.frames + 1 }, (_, k) => ({ key: `trail:${k}`, part: 'trail', frame: k, label: `Trail ${k}` })) : []),
  ];
  const rows = jobs.map((j, i) => ({ step: i, label: j.label, state: items[j.key]?.imageId ? 'done' : 'waiting', ...items[j.key] }));
  const show = () => (uploadRows.value = rows.map((r) => ({ ...r })));
  show();
  try {
    await loadAll();
    if (!account.value?.signedIn) throw new Error('Sign in with Roblox first');
    for (const [i, job] of jobs.entries()) {
      const row = rows[i];
      if (row.state === 'done') continue;
      row.state = 'uploading';
      show();
      const blob = await canvasBlob(render(d, job.frame, { resolve, part: job.part }));
      const { decalId, imageId, moderation } = await uploadDecal(blob, {
        name: `${d.name} ${job.label}${job.part === 'meterLead' || job.part === 'trail' ? `/${d.frames}` : ''}`,
        description: `${job.label} of a meter in layers, made with Arayashiki's Meter Maker.`,
      });
      Object.assign(row, { decalId, imageId, moderation, state: 'done' });
      show();
      items[job.key] = { decalId, imageId, moderation };
      commit(setIn(doc.value, ['jjs', 'layeredUploads'], { fingerprint, items: { ...items } }));
    }
    const ids = (prefix) => Array.from({ length: d.frames + 1 }, (_, k) => items[`${prefix}:${k}`]?.imageId).join('\n');
    let next = setIn(doc.value, ['jjs', 'ids'], ids('meter'));
    next = setIn(next, ['jjs', 'containerId'], String(items['container:0'].imageId));
    if (items['front:0']) next = setIn(next, ['jjs', 'frontId'], String(items['front:0'].imageId));
    next = setIn(next, ['jjs', 'extraIds'], Object.fromEntries(sepParts.value.extras.map((e) => [e.key, String(items[e.key]?.imageId ?? '')])));
    if (wantsTrail.value) next = setIn(next, ['jjs', 'trailIds'], ids('trail'));
    commit(next);
    await refreshSkill();
    addToMoveset();
  } catch (e) {
    const failed = rows.find((r) => r.state === 'uploading');
    if (failed) {
      failed.state = 'failed';
      failed.error = String(e?.message ?? e);
    }
    show();
    uploadError.value = String(e?.message ?? e);
  } finally {
    uploading.value = false;
  }
}

// ─── For AI tools (src/ai/registry.js meter_*) ──────────────────────────
// The Meter Maker as an AI works it: the whole design to read and write,
// layers to add and change by id or name, a step drawn to a picture to look
// at, and the export. Every change is one undo step, as the user's are.

const layerRef = (ref) => doc.value.layers.find((l) => l.id === ref) ?? doc.value.layers.find((l) => l.name === ref) ?? null;

// Settings grouped in objects (stroke, fx, glow…) merge a level down, so
// { fx: { shadow: { on: true } } } keeps the rest of fx.
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && !('stops' in v) ? deepMerge(out[k], v) : v;
  return out;
}

/** A design (doc) put in place of the open one, made whole (normaliseDoc). */
export function aiPutDoc(raw) {
  const next = normaliseDoc({ ...doc.value, ...raw, layers: raw.layers ?? doc.value.layers });
  if (!next) throw new Error('That isn’t a design: it needs layers.');
  replaceDoc(next, frame.value, designId.value);
  return next;
}

/** Adds a layer of `kind` (as the tools draw them) with `props` over its defaults; its id. */
export function aiAddLayer(kind, props = {}, customId = null) {
  const box = { x: props.x ?? 262, y: props.y ?? 412, w: props.w ?? 500, h: props.h ?? 200 };
  let layer;
  if (kind === 'text') layer = newText(box);
  else if (kind === 'paint') layer = newPaint();
  else if (kind === 'path') layer = newShape('path', box);
  else {
    if (kind === 'custom' && customId) customShape.value = customId;
    layer = makeShape(kind, box);
  }
  layer = deepMerge(layer, props);
  addLayer(layer);
  return layer.id;
}

export function aiSetLayer(ref, props) {
  const layer = layerRef(ref);
  if (!layer) throw new Error(`No layer "${ref}". Layers: ${doc.value.layers.map((l) => `${l.name} (${l.id})`).join(', ')}`);
  change(patchLayer(layer.id, deepMerge(layer, props)));
  return layer.id;
}

export function aiDeleteLayer(ref) {
  const layer = layerRef(ref);
  if (!layer) throw new Error(`No layer "${ref}".`);
  change({ ...doc.value, layers: doc.value.layers.filter((l) => l.id !== layer.id) });
  return layer.id;
}

export function aiNew({ frames, start = 'bar', example } = {}) {
  if (example) {
    const t = EXAMPLES.find((x) => x.id === example);
    if (!t) throw new Error(`No example "${example}": ${EXAMPLES.map((x) => x.id).join(', ')}`);
    useExample(t);
  } else {
    if (frames) newSteps.value = clamp(Math.round(frames), 1, MAX_FRAMES);
    newStart.value = start;
    createNew();
  }
}

/** Step(s) drawn as one PNG data URL (several side by side), at `scale` of full size. */
export async function aiPicture({ steps, scale = 0.5, part } = {}) {
  await loadAll();
  const d = doc.value;
  const list = (steps?.length ? steps : [frame.value]).map((k) => clamp(Math.round(k), 0, d.frames));
  const w = Math.round(d.width * scale);
  const h = Math.round(d.height * scale);
  const sheet = Object.assign(document.createElement('canvas'), { width: w * list.length, height: h });
  const ctx = sheet.getContext('2d');
  // The checkerboard of see-through, as the editor shows it.
  for (let y = 0; y < h; y += 16) for (let x = 0; x < sheet.width; x += 16) {
    ctx.fillStyle = (x / 16 + y / 16) % 2 ? '#2a2a2a' : '#1e1e1e';
    ctx.fillRect(x, y, 16, 16);
  }
  list.forEach((k, i) => ctx.drawImage(render(d, k, { resolve, scale, ...(part ? { part } : {}) }), i * w, 0));
  return { url: sheet.toDataURL('image/png'), steps: list };
}

/** Sets the skill's settings (name, tag, style…) and makes the skill if the IDs are there. */
export async function aiSkillSettings(patch = {}) {
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) setJjs(k, v);
  await refreshSkill();
  return { code: skillCode.value, missing: skillNote.value };
}
