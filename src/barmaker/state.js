// The Meter Maker workspace's state and everything that changes it
// (brought over from Woogi Tools' JJS Progress Bar Maker, where it lived on
// the page component). Jujutsu Shenanigans can't draw a bar that fills up,
// so a bar is one picture per step, swapped in game: this lays one out in a
// small image editor (layers, shapes, text, pictures, a brush, clipping),
// writes every step out, uploads them to Roblox, and builds the skill that
// shows them, straight into the moveset.
//
// Signals, so switching to the Skills workspace and back keeps everything.

import { batch, signal, computed } from '@preact/signals';
import {
  MAX_FRAMES,
  TEMPLATES as EXAMPLES,
  drawingFingerprint,
  frameName,
  newBar,
  newDoc,
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
  return newShape(kind, box);
}

// A click without a drag gets a shape this big, centred on the click.
const CLICK_SIZES = { bar: [800, 100], ring: [600, 600], textbar: [600, 300] };

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
export const shapeKind = signal('bar');
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
// Whether the uploaded pictures were made from the design as it is now.
export const uploadsStale = computed(() => {
  const { uploadedFor, uploads } = jjs.value;
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
}

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
const loadAll = () => Promise.all(doc.value.layers.map((l) => l.src && picture(l.src)?.ready));

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
  const layer = selected.value;
  if (!layer || layer.type === 'paint' || playing.value || tool.value !== 'move') return;
  const k = unit();
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
  barScene?.update({
    canvas: render(doc.value, frame.value, { resolve }),
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
  tool.value = id;
  draw();
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
  if (t === 'shape') {
    const kind = shapeKind.value;
    const layer = makeShape(kind, { x: p.x, y: p.y, w: 1, h: 1 });
    addLayer(layer);
    drag = { kind: 'create', shape: kind, id: layer.id, start: p };
    return;
  }
  const handle = handleAt(p);
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
  if (brushStroke) return strokeTo(toDoc(event));
  if (!drag) return;
  const p = toDoc(event);
  const layer = doc.value.layers.find((l) => l.id === drag.id);
  if (!layer) return;
  if (drag.remembered === false) {
    remember();
    drag.remembered = true;
  }
  if (drag.kind === 'move') {
    const x = Math.round(drag.from.x + p.x - drag.start.x);
    const y = Math.round(drag.from.y + p.y - drag.start.y);
    commit(patchLayer(drag.id, { x, y }));
  } else if (drag.kind === 'create') {
    let w = Math.abs(p.x - drag.start.x);
    let h = Math.abs(p.y - drag.start.y);
    // Rings are round; Shift makes anything square.
    if (drag.shape === 'ring' || event.shiftKey) w = h = Math.max(w, h);
    const box = {
      x: Math.round(p.x < drag.start.x ? drag.start.x - w : drag.start.x),
      y: Math.round(p.y < drag.start.y ? drag.start.y - h : drag.start.y),
      w: Math.max(1, Math.round(w)),
      h: Math.max(1, Math.round(h)),
    };
    commit(patchLayer(drag.id, shaped(drag.shape, box)));
  } else {
    // The opposite corner stays put, whatever the rotation.
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
  draw();
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

const TOOL_KEYS = { v: 'move', b: 'brush', e: 'eraser', u: 'shape', t: 'text' };
const isTyping = (el) => el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);

export function onKey(event) {
  if (dialog.value || S.dialog.value) return; // dialogs handle their own keys
  if (isTyping(event.target) || event.altKey) return;
  const mod = event.ctrlKey || event.metaKey;
  const k = event.key.toLowerCase();
  const act = (fn) => {
    event.preventDefault();
    fn();
  };
  if (mod && k === 'z') return act(event.shiftKey ? redo : undo);
  if (mod && k === 'y') return act(redo);
  if (mod && k === 's') return act(saveHere);
  if (mod && k === 'o') return act(() => openDialog('open'));
  if (mod && k === 'e') return act(() => openDialog('export'));
  if (mod && k === '0') return act(() => zoomTo(0));
  if (mod) return;
  if (k === ' ') {
    if (event.target?.tagName === 'BUTTON') return;
    return act(play);
  }
  if ((k === 'delete' || k === 'backspace') && selected.value) return act(deleteLayer);
  const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (nudge && selected.value && selected.value.type !== 'paint') {
    const step = event.shiftKey ? 10 : 1;
    const layer = selected.value;
    return act(() =>
      change(patchLayer(layer.id, { x: layer.x + nudge[0] * step, y: layer.y + nudge[1] * step }), `${layer.id}:nudge`),
    );
  }
  if (TOOL_KEYS[k]) pickTool(TOOL_KEYS[k]);
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

export const saveZip = () =>
  withBusy(async () => {
    const d = doc.value;
    const entries = {};
    for (let k = 0; k <= d.frames; k++) {
      const blob = await canvasBlob(render(d, k, { resolve }));
      entries[frameName(exportName.value, k, d.frames)] = new Uint8Array(await blob.arrayBuffer());
    }
    const { zipSync } = await import('fflate');
    // PNGs are compressed already; zipping them again only costs time.
    const zip = new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
    const where = await saveBlob(zip, `${exportName.value || 'progress'}.zip`, 'Zip archive');
    if (where)
      status.value = `Saved ${d.frames + 1} pictures, ${firstName.value} (empty) to ${lastName.value} (full): ${sizeLabel(zip.size)}`;
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
  change(setIn(doc.value, ['jjs', key], value), `doc:jjs:${key}`);
  refreshSkill();
}

/** The skills for the IDs and settings, or null while an ID is missing. */
function skillsNow() {
  const ids = jjsIds.value;
  if (ids.length !== pictures.value) return null;
  const j = jjs.value;
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
  });
}

// The skill code, remade whenever the IDs or settings change; an older,
// slower build never overwrites a newer one.
let build = 0;
export async function refreshSkill() {
  const mine = ++build;
  copied.value = false;
  const skills = skillsNow();
  if (!skills) {
    const ids = jjsIds.value.length;
    batch(() => {
      skillCode.value = '';
      skillNote.value = ids
        ? `The skill needs ${pictures.value} image IDs, one for each step from 0 (empty) to ${doc.value.frames} (full); there are ${ids}.`
        : null;
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
