// Panels you arrange yourself, like After Effects': the Skills workspace is a
// tree of splits (rows and columns) holding the five panels. Drag a panel by
// its header onto another to dock it at that side, or onto its middle to
// swap the two; the pop-out button floats a panel over the window, where it
// drags and resizes freely, and docks again with the same button. Gutters
// between panels drag to resize. The layout is kept between runs.
import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';

export const PANELS = ['nodes', 'view', 'time', 'outliner', 'properties'];

// The Outliner over the Nodes on the left, the Viewport over the Timeline in
// the middle, and Properties the whole height of the right.
export const DEFAULT_LAYOUT = {
  root: {
    split: 'row',
    sizes: [0.22, 0.56, 0.22],
    children: [
      { split: 'col', sizes: [0.38, 0.62], children: [{ panel: 'outliner' }, { panel: 'nodes' }] },
      { split: 'col', sizes: [0.72, 0.28], children: [{ panel: 'view' }, { panel: 'time' }] },
      { panel: 'properties' },
    ],
  },
  floating: [],
};

// ─── The tree ───────────────────────────────────────────────────────────

const clone = (x) => structuredClone(x);

function panelsIn(node, out = []) {
  if (!node) return out;
  if (node.panel) out.push(node.panel);
  else node.children.forEach((c) => panelsIn(c, out));
  return out;
}

/** Takes a panel out of the tree; splits left with one child fold away. */
function remove(node, id) {
  if (!node) return null;
  if (node.panel) return node.panel === id ? null : node;
  const kept = [];
  const sizes = [];
  node.children.forEach((c, i) => {
    const next = remove(c, id);
    if (next) {
      kept.push(next);
      sizes.push(node.sizes[i]);
    }
  });
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0];
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return { ...node, children: kept, sizes: sizes.map((s) => s / total) };
}

/** Puts `id` next to `target` on `side` ('left', 'right', 'top', 'bottom'). */
function insert(node, target, id, side) {
  if (node.panel) {
    if (node.panel !== target) return node;
    const split = side === 'left' || side === 'right' ? 'row' : 'col';
    const first = side === 'left' || side === 'top';
    return { split, sizes: [0.5, 0.5], children: first ? [{ panel: id }, node] : [node, { panel: id }] };
  }
  // Docking beside a child of a split going the same way: share its space.
  const split = side === 'left' || side === 'right' ? 'row' : 'col';
  const at = node.children.findIndex((c) => c.panel === target);
  if (node.split === split && at >= 0) {
    const children = [...node.children];
    const sizes = [...node.sizes];
    const half = sizes[at] / 2;
    const where = side === 'left' || side === 'top' ? at : at + 1;
    sizes[at] = half;
    children.splice(where, 0, { panel: id });
    sizes.splice(where, 0, half);
    return { ...node, children, sizes };
  }
  return { ...node, children: node.children.map((c) => insert(c, target, id, side)) };
}

function swap(node, a, b) {
  if (node.panel) return node.panel === a ? { panel: b } : node.panel === b ? { panel: a } : node;
  return { ...node, children: node.children.map((c) => swap(c, a, b)) };
}

// Every split has a sensible size for each child.
function sizesOk(node) {
  if (!node || node.panel) return Boolean(node);
  return (
    Array.isArray(node.children) &&
    Array.isArray(node.sizes) &&
    node.sizes.length === node.children.length &&
    node.sizes.every((v) => Number.isFinite(v) && v > 0.01 && v < 1) &&
    node.children.every(sizesOk)
  );
}
const floatOk = (f) => ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(f?.[k])) && f.w >= 160 && f.h >= 120 && f.w < 10000 && f.h < 10000;

/** A layout that holds every panel exactly once, with sane sizes, or the default. */
export function sane(layout) {
  try {
    const found = [...panelsIn(layout?.root), ...(layout?.floating ?? []).map((f) => f.id)];
    const ok =
      PANELS.every((p) => found.filter((f) => f === p).length === 1) &&
      found.length === PANELS.length &&
      sizesOk(layout.root) &&
      (layout.floating ?? []).every(floatOk);
    return ok ? layout : clone(DEFAULT_LAYOUT);
  } catch {
    return clone(DEFAULT_LAYOUT);
  }
}

// ─── Moving panels ──────────────────────────────────────────────────────

export function dockPanel(id, target, side) {
  const L = clone(S.layout.value);
  if (id === target) return;
  const floating = L.floating.find((f) => f.id === id);
  if (side === 'center') {
    if (floating) {
      // A floating panel dropped on a docked one trades places with it.
      L.root = swap(L.root, target, id);
      floating.id = target;
    } else L.root = swap(L.root, id, target);
  } else {
    L.floating = L.floating.filter((f) => f.id !== id);
    L.root = insert(remove(L.root, id) ?? { panel: target }, target, id, side);
  }
  S.layout.value = sane(L);
}

export function floatPanel(id, rect) {
  const L = clone(S.layout.value);
  if (L.floating.some((f) => f.id === id)) return;
  if (panelsIn(L.root).length <= 1) return; // something stays docked
  L.root = remove(L.root, id);
  L.floating.push({ id, x: rect?.x ?? 120, y: rect?.y ?? 90, w: rect?.w ?? 480, h: rect?.h ?? 360 });
  S.layout.value = sane(L);
}

/** A floating panel goes back into the layout, at the right edge. */
export function dockBack(id) {
  const L = clone(S.layout.value);
  L.floating = L.floating.filter((f) => f.id !== id);
  const docked = panelsIn(L.root);
  L.root = insert(L.root, docked[docked.length - 1], id, 'bottom');
  S.layout.value = sane(L);
}

export const resetLayout = () => (S.layout.value = clone(DEFAULT_LAYOUT));

// The arrangement, without sizes: "row(nodes,col(view,time),…)".
const shapeOf = (node) => (node.panel ? node.panel : `${node.split}(${node.children.map(shapeOf).join(',')})`);
const OLD_DEFAULT = 'row(nodes,col(view,time),col(outliner,properties))';

/**
 * Once, after the default changed: a layout still arranged as the old
 * default moves to the new one (sizes and all). Layouts people made are kept.
 */
export function migrateLayout() {
  try {
    if (localStorage.getItem('arayashiki-layout-v2')) return;
    localStorage.setItem('arayashiki-layout-v2', '1');
  } catch {
    return;
  }
  const L = S.layout.peek();
  if (!L || (L.floating?.length === 0 && shapeOf(L.root) === OLD_DEFAULT)) resetLayout();
}

// ─── Saved layouts, by name, in this browser's storage ──────────────────

const SAVED = 'arayashiki-layouts';
function readSaved() {
  try {
    const all = JSON.parse(localStorage.getItem(SAVED) ?? '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}
export const savedLayouts = signal(readSaved());
function writeSaved(all) {
  savedLayouts.value = all;
  try {
    localStorage.setItem(SAVED, JSON.stringify(all));
  } catch {
    // not kept
  }
}

/** Keeps the layout as it is now under `name` (replacing one of that name). */
export function saveLayout(name) {
  const key = String(name ?? '').trim().slice(0, 40);
  if (!key) return false;
  writeSaved({ ...savedLayouts.peek(), [key]: clone(S.layout.peek()) });
  S.status.value = `Saved the layout “${key}”.`;
  return true;
}

export function loadLayout(name) {
  const L = savedLayouts.peek()[name];
  if (!L) return;
  S.layout.value = sane(clone(L));
  S.status.value = `Layout “${name}”.`;
}

export function deleteLayout(name) {
  const { [name]: _, ...rest } = savedLayouts.peek();
  writeSaved(rest);
  S.status.value = `Deleted the layout “${name}”.`;
}

// Where a header drag would drop: { target, side }.
const drop = signal(null);
const dragging = signal(null);

export const DockContext = createContext(null);

/** What an Area's header uses: drag it, float it, dock it back. */
export function useDock(id) {
  const ctx = useContext(DockContext);
  if (!ctx) return null;
  const floating = S.layout.value.floating.some((f) => f.id === id);
  return {
    floating,
    startDrag(event) {
      if (event.button !== 0 || event.target.closest('button, input, select, a, label')) return;
      const x0 = event.clientX;
      const y0 = event.clientY;
      let started = false;
      const move = (e) => {
        if (!started && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
        started = true;
        dragging.value = id;
        drop.value = dropAt(e.clientX, e.clientY, id);
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        const d = drop.value;
        drop.value = null;
        dragging.value = null;
        if (started && d) dockPanel(id, d.target, d.side);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    },
    toggleFloat(event) {
      if (floating) dockBack(id);
      else {
        const box = event.currentTarget.closest('.area')?.getBoundingClientRect();
        floatPanel(id, box && { x: box.left + 24, y: box.top + 24, w: box.width, h: box.height });
      }
    },
  };
}

function dropAt(x, y, moving) {
  for (const el of document.querySelectorAll('.dock-leaf')) {
    const id = el.dataset.panel;
    if (id === moving) continue;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const u = (x - r.left) / r.width;
    const v = (y - r.top) / r.height;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge > 0.25) return { target: id, side: 'center', rect: r };
    const side = edge === u ? 'left' : edge === 1 - u ? 'right' : edge === v ? 'top' : 'bottom';
    return { target: id, side, rect: r };
  }
  return null;
}

// ─── Drawing it ─────────────────────────────────────────────────────────

function Gutter({ path, index, dir }) {
  const down = (e) => {
    e.preventDefault();
    const parent = e.currentTarget.parentElement.getBoundingClientRect();
    const total = dir === 'row' ? parent.width : parent.height;
    const start = dir === 'row' ? e.clientX : e.clientY;
    const L0 = clone(S.layout.value);
    let node = L0.root;
    for (const i of path) node = node.children[i];
    const [a, b] = [node.sizes[index], node.sizes[index + 1]];
    const move = (ev) => {
      const delta = ((dir === 'row' ? ev.clientX : ev.clientY) - start) / total;
      const min = 0.06;
      const na = Math.max(min, Math.min(a + b - min, a + delta));
      const L = clone(L0);
      let n = L.root;
      for (const i of path) n = n.children[i];
      n.sizes[index] = na;
      n.sizes[index + 1] = a + b - na;
      S.layout.value = L;
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.body.classList.add('is-resizing');
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return <div class={`dock-gutter dock-gutter-${dir}`} role="separator" onPointerDown={down} />;
}

function Node({ node, path, render }) {
  if (node.panel)
    return (
      <div class="dock-leaf" data-panel={node.panel}>
        {render(node.panel)}
      </div>
    );
  const out = [];
  node.children.forEach((c, i) => {
    if (i) out.push(<Gutter key={`g${i}`} path={path} index={i - 1} dir={node.split} />);
    out.push(
      <div key={panelsIn(c).join('+')} class="dock-cell" style={{ flex: `${node.sizes[i]} 1 0` }}>
        <Node node={c} path={[...path, i]} render={render} />
      </div>,
    );
  });
  return <div class={`dock-split dock-${node.split}`}>{out}</div>;
}

function Floating({ f, render }) {
  const box = useRef(null);
  const drag = (e, mode) => {
    if (mode === 'move' && (e.button !== 0 || e.target.closest('button, input, select, a, label'))) return;
    if (mode === 'move' && !e.target.closest('.area-head')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const L = clone(S.layout.value);
      const me = L.floating.find((x) => x.id === f.id);
      if (!me) return;
      if (mode === 'move') {
        me.x = Math.max(0, f.x + dx);
        me.y = Math.max(0, f.y + dy);
      } else {
        me.w = Math.max(240, f.w + dx);
        me.h = Math.max(160, f.h + dy);
      }
      S.layout.value = L;
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return (
    <div
      ref={box}
      class="dock-float"
      style={{ left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` }}
      onPointerDown={(e) => drag(e, 'move')}
    >
      {render(f.id)}
      <div class="dock-float-size" onPointerDown={(e) => drag(e, 'size')} />
    </div>
  );
}

export function DockLayout({ render }) {
  const L = S.layout.value;
  const [, force] = useState(0);
  useEffect(() => {
    const redraw = () => force((n) => n + 1);
    addEventListener('resize', redraw);
    return () => removeEventListener('resize', redraw);
  }, []);
  const d = drop.value;
  return (
    <DockContext.Provider value={true}>
      <main class={`workspace dock ${dragging.value ? 'is-dragging' : ''}`}>
        <Node node={L.root} path={[]} render={render} />
        {L.floating.map((f) => (
          <Floating key={f.id} f={f} render={render} />
        ))}
        {d && (
          <div
            class={`dock-drop dock-drop-${d.side}`}
            style={{ left: `${d.rect.left}px`, top: `${d.rect.top}px`, width: `${d.rect.width}px`, height: `${d.rect.height}px` }}
          />
        )}
      </main>
    </DockContext.Provider>
  );
}
