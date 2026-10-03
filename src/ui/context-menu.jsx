// Right-click menus that belong to the app, in place of the web view's own
// (Back, Reload, Inspect…), which never show. What's in the menu depends on
// what was clicked: a node, a skill, a branch, the viewport, the timeline,
// a text field (cut, copy, paste), or anywhere else. A right-drag in the
// viewport turns the camera, so it doesn't open a menu. An item with
// `items` opens a submenu beside it (Add node ▸, Panel layout ▸).
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { EFFECTS } from '../../core/schema.js';
import { command, available } from '../commands.js';
import { bindingOf } from '../keybinds.js';
import { Icon } from '../icons.jsx';
import { KindChip } from './controls.jsx';
import { openSearch } from './search.jsx';
import { deleteLayout, loadLayout, savedLayouts } from './dock.jsx';
import * as B from '../barmaker/state.js';

const menu = signal(null); // { x, y, items }
const subs = signal([]); // open submenus, one per level: { x, y, flipX, items, from }
const closeAll = () => {
  menu.value = null;
  subs.value = [];
};
/** Opens a menu at (x, y): the top bar's Layout button uses it too. */
export function openMenu(x, y, items) {
  subs.value = [];
  menu.value = { x, y, items: clean(items) };
}
const ANIMATABLE = ['Mesh', 'Block', 'Sphere', 'Cylinder', 'Wedge', 'Camera'];

// Where the right button went down, to tell a click from a right-drag.
let downAt = null;

const sep = { separator: true };
const cmd = (id, label) => {
  const c = command(id);
  if (!c || !available(c)) return null;
  return { label: label ?? c.title, icon: c.icon, keys: bindingOf(id), run: c.run };
};
const item = (label, icon, run, extra = {}) => ({ label, icon, run, ...extra });
const danger = (x) => x && { ...x, danger: true };

const isText = (el) =>
  el?.isContentEditable ||
  el?.tagName === 'TEXTAREA' ||
  (el?.tagName === 'INPUT' &&
    ['text', 'search', 'number', 'email', 'url', 'password', 'tel', ''].includes(el.type ?? ''));

function textItems(el) {
  const hasSelection =
    el.selectionStart !== el.selectionEnd || (el.isContentEditable && String(getSelection()).length > 0);
  const readOnly = el.readOnly || el.disabled;
  return [
    item('Cut', 'scissors', () => (el.focus(), document.execCommand('cut')), {
      disabled: !hasSelection || readOnly,
      keys: 'Ctrl+X',
    }),
    item('Copy', 'copy', () => (el.focus(), document.execCommand('copy')), { disabled: !hasSelection, keys: 'Ctrl+C' }),
    item(
      'Paste',
      'paste',
      async () => {
        el.focus();
        const text = await navigator.clipboard.readText().catch(() => '');
        if (!text) return;
        if (typeof el.setRangeText === 'function') {
          el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, 'end');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else document.execCommand('insertText', false, text);
      },
      { disabled: readOnly, keys: 'Ctrl+V' },
    ),
    sep,
    item('Select all', 'list', () => (el.focus(), el.select ? el.select() : document.execCommand('selectAll')), {
      keys: 'Ctrl+A',
    }),
  ];
}

const heading = (label) => ({ heading: label });

// Nodes to add after the picked one (or at the end), by group, as the
// Nodes editor's Add menu lists them; and VISUAL effects, each a VISUAL node.
function addNodeItems() {
  return [
    item('Add node', 'plus', null, {
      items: S.palette.flatMap((g) => [
        heading(g.group),
        ...g.nodes.map((n) => item(n.label, null, () => S.addNode(n.kind), { chip: n })),
      ]),
    }),
    item('Add visual effect', 'sparkles', null, {
      items: EFFECTS.filter((e) => e !== 'Cancel')
        .toSorted((a, b) => a.localeCompare(b))
        .map((e) =>
          item(e, null, () => {
            S.addNode('VISUAL');
            S.setNodeField('EFFECT', e);
          }),
        ),
    }),
  ];
}

/** Reset, save and load the Skills workspace's panels. */
export function layoutItems() {
  const saved = Object.keys(savedLayouts.value);
  return [
    cmd('resetLayout', 'Reset to the default layout'),
    cmd('saveLayout', 'Save this layout…'),
    saved.length > 0 && sep,
    saved.length > 0 && heading('Saved layouts'),
    ...saved.map((name) => item(name, 'layout', () => loadLayout(name))),
    saved.length > 0 && sep,
    saved.length > 0 &&
      item('Delete a saved layout', 'trash-2', null, {
        items: saved.map((name) => danger(item(name, 'trash-2', () => deleteLayout(name)))),
      }),
  ];
}

const copyJson = (value) => navigator.clipboard.writeText(JSON.stringify(value, null, 1)).catch(() => {});

function nodeItems(index) {
  if (!S.nodeSelection.peek().includes(index)) S.pickNode(index);
  S.tab.value = 'node';
  const node = S.line.peek()[index];
  const animatable = node?.K_NAME === 'VISUAL' && ANIMATABLE.includes(node.EFFECT);
  return [
    animatable && item(`Animate (keyframes)…`, 'wand', () => command('animate').run(), { keys: bindingOf('animate') }),
    node?.K_NAME === 'VISUAL' && cmd('continueVisual', 'Continue from ALT POSITION'),
    item('Insert impact frame at this node…', 'zap', () => import('./impact.jsx').then((m) => m.openImpactFrame({ index }))),
    animatable && sep,
    cmd('duplicate'),
    cmd('selectAll'),
    cmd('moveUp'),
    cmd('moveDown'),
    sep,
    item('Copy as JSON', 'clipboard', () => copyJson(node)),
    item('Paste node after', 'paste', async () => {
      try {
        const parsed = JSON.parse(await navigator.clipboard.readText());
        const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((n) => n && typeof n === 'object' && n.K_NAME);
        if (!list.length) throw new Error();
        const next = [...S.line.peek()];
        next.splice(index + 1, 0, ...list);
        S.replaceLine(next);
        S.pickNode(index + 1);
      } catch {
        S.status.value = 'The clipboard doesn’t hold a node (copy one as JSON first).';
      }
    }),
    item('Play from here', 'play', () => {
      const e = S.run.peek()?.events.find((x) => x.branch === S.branch.peek() && x.index === index);
      if (e) S.seek(e.t);
      S.play();
    }),
    sep,
    ...addNodeItems(),
    item('Find a node to add…', 'search', () => openSearch()),
    sep,
    danger(cmd('delete', 'Delete')),
  ];
}

function skillItems(uid) {
  const s = S.skills.peek().find((x) => x.uid === uid);
  if (s) {
    S.pickCategory(s.K_NAME);
    S.pickSkill(uid);
  }
  return [
    cmd('play', 'Play this skill'),
    cmd('impactFrame', 'Insert impact frame…'),
    sep,
    ...addNodeItems(),
    sep,
    cmd('addSkill'),
    cmd('duplicateSkill'),
    item('Move up', 'arrow-up', () => S.moveSkill(-1)),
    item('Move down', 'arrow-down', () => S.moveSkill(1)),
    sep,
    item('Copy this skill’s code', 'copy', async () => {
      const code = await S.exportCode('skill');
      await navigator.clipboard.writeText(code).catch(() => {});
      S.status.value = `Copied the code for “${s?.NAME}”: paste it into JJS.`;
    }),
    item('Copy as JSON', 'clipboard', () => copyJson(s)),
    sep,
    danger(cmd('deleteSkill')),
  ];
}

function branchItems(name) {
  S.pickBranch(name);
  S.outlined.value = 'branch';
  return [
    ...addNodeItems(),
    sep,
    cmd('addBranch'),
    item('Play from this branch', 'play', () => {
      if (!S.fromBranch.peek()) S.toggleFromBranch();
      S.restart();
    }),
    name && sep,
    name && danger(item('Delete branch', 'trash-2', () => S.deleteBranch())),
  ];
}

function viewportItems() {
  const mode = S.camMode.peek();
  return [
    cmd('play'),
    cmd('restart'),
    sep,
    item('Free camera', 'camera', () => (S.camMode.value = 'free'), { checked: mode === 'free' }),
    item('Auto camera', 'aperture', () => (S.camMode.value = 'auto'), { checked: mode === 'auto' }),
    item('Recorded camera', 'route', () => (S.camMode.value = 'path'), {
      checked: mode === 'path',
      disabled: !S.camKeys.peek().length,
    }),
    cmd('cameraKey'),
    cmd('recordCamera'),
    cmd('resetCamera'),
    cmd('resetCameraSettings'),
    sep,
    item('Follow', 'navigation', () => (S.follow.value = !S.follow.peek()), { checked: S.follow.peek() }),
    item('Hitboxes', 'box', () => (S.showHitboxes.value = !S.showHitboxes.peek()), {
      checked: S.showHitboxes.peek(),
      keys: bindingOf('hitboxes'),
    }),
    item('The skill’s own camera', 'camera', () => (S.skillCamera.value = !S.skillCamera.peek()), {
      checked: S.skillCamera.peek(),
    }),
    sep,
    cmd('screenshot'),
    cmd('quickShot'),
    cmd('exportVideo'),
    sep,
    cmd('animateCamera'),
    cmd('impactFrame', 'Insert impact frame here…'),
  ];
}

function timelineItems() {
  const speed = S.speed.peek();
  return [
    cmd('play'),
    cmd('restart'),
    sep,
    item('Real time', 'timer', () => (S.speed.value = 1), { checked: speed === 1 }),
    item('Half speed', 'timer', () => (S.speed.value = 0.5), { checked: speed === 0.5 }),
    item('Quarter speed', 'timer', () => (S.speed.value = 0.25), { checked: speed === 0.25 }),
    sep,
    cmd('cameraKey'),
    cmd('exportVideo'),
  ];
}

function generalItems() {
  return [
    item('Search everything…', 'command', () => openSearch(), { keys: bindingOf('search') }),
    cmd('assistant'),
    sep,
    cmd('undo'),
    cmd('redo'),
    sep,
    cmd('save'),
    cmd('export'),
    sep,
    item('Panel layout', 'layout', null, { items: layoutItems() }),
    cmd('settings'),
    cmd('manual'),
  ];
}

// A right-click on an editor's empty space: what it's for.
function nodesAreaItems() {
  return [
    ...addNodeItems(),
    cmd('addBranch'),
    cmd('selectAll'),
    sep,
    item('Panel layout', 'layout', null, { items: layoutItems() }),
  ];
}
function outlinerAreaItems() {
  return [
    cmd('addSkill'),
    ...(S.skill.peek() ? addNodeItems() : []),
    sep,
    item('Panel layout', 'layout', null, { items: layoutItems() }),
  ];
}

// ─── The Meter Maker's menus, Photoshop's way ───────────────────────────
// What's under the pointer decides: a layer gets its own menu (and picks
// it, as a right-click does there), with every layer under the pointer to
// pick from; a guide its own; the empty picture what can go on it; a step
// its own; the tool in hand adds its options at the top.

const BAR_KINDS = [
  ['bar', 'Meter', 'battery'],
  ['ring', 'Progress ring', 'circle-dot'],
  ['textbar', 'Text bar', 'languages'],
];
const SHAPE_KINDS = [
  ['rect', 'Rectangle', 'square'],
  ['ellipse', 'Ellipse', 'circle'],
  ['triangle', 'Triangle', 'triangle'],
  ['diamond', 'Diamond', 'diamond'],
  ['polygon', 'Polygon', 'hexagon'],
  ['star', 'Star', 'star'],
  ['custom', 'Custom shape', 'heart'],
];
const LAYER_ICONS = { bar: 'battery', shape: 'shapes', text: 'type', image: 'image', paint: 'brush' };

function newLayerItems(point) {
  return [
    item('New meter', 'battery', null, { items: BAR_KINDS.map(([id, label, icon]) => item(label, icon, () => B.addAt(id, point))) }),
    item('New shape', 'shapes', null, { items: SHAPE_KINDS.map(([id, label, icon]) => item(label, icon, () => B.addAt(id, point))) }),
    item('New text', 'type', () => B.addAt('text', point)),
    item('New drawing layer', 'brush', () => B.addAt('paint', point)),
  ];
}

function viewItems() {
  return [
    item('View', 'zoom-in', null, {
      items: [
        item('Fit to the window', 'maximize', () => B.zoomTo(0), { keys: bindingOf('barFit') }),
        item('Actual size', 'zoom-in', () => B.zoomTo(1)),
        item('Zoom in', 'zoom-in', () => B.zoomBy(1.25)),
        item('Zoom out', 'zoom-out', () => B.zoomBy(0.8)),
        sep,
        item('Rulers and guides', 'ruler', () => B.toggleRulers(), { checked: B.rulers.peek(), keys: bindingOf('barRulers') }),
        item('Snapping', 'magnet', () => B.toggleSnapping(), { checked: B.snapping.peek(), keys: bindingOf('barSnap') }),
        B.doc.peek().guides?.length > 0 && item('Clear the guides', 'trash-2', () => B.clearGuides()),
      ],
    }),
  ];
}

function toolItems() {
  const t = B.tool.peek();
  if (t === 'pen' && B.penPoints.peek().length)
    return [
      heading('Pen'),
      item('Close the shape', 'check', () => B.penFinish(true), { keys: 'Enter' }),
      item('Leave it open (a line)', 'pen-tool', () => B.penFinish(false)),
      item('Take the last point back', 'undo', () => B.penUndo(), { keys: 'Backspace' }),
      danger(item('Drop it', 'x', () => B.penCancel(), { keys: 'Esc' })),
      sep,
    ];
  if (t === 'bar') return [heading('Meter tool'), ...BAR_KINDS.map(([id, label, icon]) => item(label, icon, () => B.pickBarKind(id), { checked: B.barKind.peek() === id })), sep];
  if (t === 'shape') return [heading('Shape tool'), ...SHAPE_KINDS.map(([id, label, icon]) => item(label, icon, () => B.pickShapeKind(id), { checked: B.shapeKind.peek() === id })), sep];
  if (t === 'brush' || t === 'eraser')
    return [
      heading(t === 'brush' ? 'Brush' : 'Eraser'),
      item('Size', 'brush', null, { items: [4, 8, 16, 24, 48, 96].map((n) => item(`${n} px`, null, () => (B.brushSize.value = n), { checked: B.brushSize.peek() === n })) }),
      sep,
    ];
  return [];
}

function layerItems(layer, under = []) {
  const bar = layer.type === 'bar';
  return [
    heading(layer.name),
    under.length > 1 &&
      item('Select layer', 'layers', null, {
        items: under.map((l) => item(l.name, LAYER_ICONS[l.type] ?? 'layers', () => B.select(l.id), { checked: l.id === layer.id })),
      }),
    item('Properties', 'sliders', () => (B.propTab.value = bar ? 'shape' : layer.type === 'text' ? 'text' : 'layer')),
    item('Effects…', 'sparkles', () => (B.propTab.value = 'effects')),
    sep,
    item('Duplicate layer', 'copy', () => B.duplicateLayer()),
    item(layer.visible ? 'Hide layer' : 'Show layer', layer.visible ? 'eye-off' : 'eye', () => B.toggleLayer(layer.id, 'visible')),
    item(layer.clip ? 'Release clipping mask' : 'Create clipping mask', 'link', () => B.toggleLayer(layer.id, 'clip')),
    sep,
    item('Arrange', 'layers', null, {
      items: [
        item('Bring to front', 'chevrons-up', () => B.arrange('front')),
        item('Bring forward', 'arrow-up', () => B.moveLayer(1)),
        item('Send backward', 'arrow-down', () => B.moveLayer(-1)),
        item('Send to back', 'chevrons-down', () => B.arrange('back')),
      ],
    }),
    layer.type !== 'paint' &&
      item('Align to the picture', 'align-center', null, {
        items: [
          item('Left edges', 'align-left', () => B.alignSelected('left')),
          item('Centres, across', 'align-center', () => B.alignSelected('hcenter')),
          item('Right edges', 'align-right', () => B.alignSelected('right')),
          sep,
          item('Top edges', 'align-top', () => B.alignSelected('top')),
          item('Middles, up and down', 'align-middle', () => B.alignSelected('vcenter')),
          item('Bottom edges', 'align-bottom', () => B.alignSelected('bottom')),
          sep,
          item('Both centres', 'locate-fixed', () => (B.alignSelected('hcenter'), B.alignSelected('vcenter'))),
        ],
      }),
    layer.type !== 'paint' &&
      item('Transform', 'move', null, {
        items: [
          item('Fit to the picture', 'maximize', () => B.fitSelected(true)),
          item('Stretch to the picture', 'maximize', () => B.fitSelected(false)),
          item('Turn back to 0°', 'rotate-ccw', () => B.setLayer('rotation', 0), { disabled: !layer.rotation }),
          item('Turn 90°', 'rotate-cw', () => B.setLayer('rotation', ((layer.rotation ?? 0) + 90) % 360)),
        ],
      }),
    bar &&
      item('Convert to', 'refresh', null, {
        items: [
          ['bar', 'Meter'],
          ['ring', 'Progress ring'],
          ['text', 'Text bar'],
          ['image', 'Picture bar'],
        ].map(([id, label]) => item(label, null, () => B.convertBar(id), { checked: layer.shape === id })),
      }),
    sep,
    item('Copy layer style', 'copy', () => B.copyStyle()),
    item('Paste layer style', 'paste', () => B.pasteStyle(), { disabled: !B.copiedStyle.peek() }),
    item('Clear layer style', 'eraser', () => B.clearStyle()),
    sep,
    danger(item('Delete layer', 'trash-2', () => B.deleteLayer(), { keys: 'Delete' })),
  ];
}

function meterCanvasItems(e) {
  const guide = B.guideIndexAt(e.clientX, e.clientY);
  if (guide >= 0)
    return [
      heading('Guide'),
      danger(item('Delete this guide', 'trash-2', () => B.deleteGuide(guide))),
      item('Clear all guides', 'trash-2', () => B.clearGuides()),
    ];
  const under = B.layersAt(e.clientX, e.clientY);
  const point = B.docAt(e.clientX, e.clientY);
  const tools = toolItems();
  // With the move tool, a right-click picks what's under it, as Photoshop does.
  const top = under.find((l) => l.id === B.selectedId.peek()) ?? under[0];
  if (top && B.tool.peek() === 'move') {
    B.select(top.id);
    return [...tools, ...layerItems(top, under)];
  }
  return [
    ...tools,
    ...newLayerItems(point),
    item('Add a picture…', 'image-plus', () => document.querySelector('.pb-rail input[type=file]')?.click()),
    sep,
    cmd('undo'),
    cmd('redo'),
    sep,
    ...viewItems(),
    item('Background colour', 'image', null, {
      items: [
        item(B.doc.peek().background?.on ? 'No background' : 'Fill the background', 'image', () => B.change(B.setInDoc('background.on', !B.doc.peek().background?.on))),
      ],
    }),
    sep,
    item('Export…', 'upload', () => B.openDialog('export'), { keys: bindingOf('export') }),
  ];
}

function stepItems(step) {
  return [
    heading(`Step ${step}`),
    item('Show this step', 'eye', () => B.showFrame(step)),
    item('Save this step as a picture', 'download', () => (B.showFrame(step), B.saveFrame())),
    sep,
    item('Play the steps', 'play', () => B.play(), { keys: bindingOf('play') }),
    item('Save every step (zip)', 'download', () => B.saveZip()),
    item('Save a sheet of every step', 'download', () => B.saveSheet()),
  ];
}

function meterItems(target, e) {
  const row = target.closest?.('[data-layer-id]');
  if (row) {
    B.select(row.dataset.layerId);
    const layer = B.selected.peek();
    return layer ? layerItems(layer) : [];
  }
  const step = target.closest?.('[data-step]');
  if (step) return stepItems(Number(step.dataset.step));
  if (target.closest?.('.pb-canvas-area')) return meterCanvasItems(e);
  if (target.closest?.('.pb-layers-area')) return [...newLayerItems(null), sep, ...viewItems()];
  return null;
}

function itemsFor(target, e) {
  if (isText(target)) return textItems(target);
  if (S.workspace.peek() === 'bars') {
    const mine = meterItems(target, e);
    if (mine) return mine;
  }
  const nodeRow = target.closest?.('[data-node-index]');
  if (nodeRow) return nodeItems(Number(nodeRow.dataset.nodeIndex));
  const skillRow = target.closest?.('[data-skill-uid]');
  if (skillRow) return skillItems(skillRow.dataset.skillUid);
  const branchRow = target.closest?.('[data-branch]');
  if (branchRow) return branchItems(branchRow.dataset.branch);
  if (target.closest?.('.viewport') && S.workspace.peek() === 'skills') return viewportItems();
  if (target.closest?.('.area-time')) return timelineItems();
  if (S.workspace.peek() === 'skills' && !S.showStart.peek()) {
    if (target.closest?.('.area-nodes') && S.skill.peek()) return nodesAreaItems();
    if (target.closest?.('.area-outliner')) return outlinerAreaItems();
  }
  return generalItems();
}

function clean(items) {
  const out = [];
  for (const i of items) {
    if (!i) continue;
    if (i.separator && (!out.length || out.at(-1).separator)) continue;
    if (i.items) {
      const inner = clean(i.items);
      if (!inner.length) continue;
      out.push({ ...i, items: inner });
    } else out.push(i);
  }
  while (out.at(-1)?.separator || out.at(-1)?.heading) out.pop();
  return out;
}

function onDown(e) {
  if (e.button === 2) downAt = [e.clientX, e.clientY];
}
function onContext(e) {
  e.preventDefault();
  if (S.dialog.peek() && !isText(e.target)) return;
  const moved = downAt ? Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) : 0;
  downAt = null;
  if (moved > 5) return; // a right-drag (turning the camera), not a click
  const items = clean(itemsFor(e.target, e));
  if (items.length) openMenu(e.clientX, e.clientY, items);
}

export function ContextMenu() {
  const layer = useRef(null);
  useEffect(() => {
    addEventListener('pointerdown', onDown, true);
    addEventListener('contextmenu', onContext);
    return () => {
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('contextmenu', onContext);
    };
  }, []);
  const m = menu.value;
  useEffect(() => {
    if (!m) return;
    const away = (e) => !layer.current?.contains(e.target) && closeAll();
    addEventListener('pointerdown', away, true);
    addEventListener('blur', closeAll);
    addEventListener('resize', closeAll);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('blur', closeAll);
      removeEventListener('resize', closeAll);
    };
  }, [m]);
  if (!m) return null;
  // Submenus are siblings of the menu, not inside it, so each places itself
  // against the window.
  return (
    <div class="context-layer" ref={layer}>
      <Menu m={m} level={0} />
      {subs.value.map((sub, i) => (
        <Menu key={`${i}:${sub.from}:${sub.y}`} m={sub} level={i + 1} />
      ))}
    </div>
  );
}

function Menu({ m, level }) {
  const box = useRef(null);
  const [at, setAt] = useState({ x: m.x, y: m.y });
  const [active, setActive] = useState(-1);
  const choices = m.items.map((it, i) => (it.separator || it.heading || it.disabled ? -1 : i)).filter((i) => i >= 0);
  useEffect(() => {
    const r = box.current.getBoundingClientRect();
    // A submenu that won't fit to the right opens to the left of its parent.
    const x = m.flipX != null && m.x + r.width > innerWidth - 6 ? m.flipX - r.width : m.x;
    setAt({
      x: Math.max(6, Math.min(x, innerWidth - r.width - 6)),
      y: Math.max(6, Math.min(m.y, innerHeight - r.height - 6)),
    });
    // The root menu takes the keys; a submenu does once it's opened by key.
    if (!level || m.focus) {
      box.current.focus({ preventScroll: true });
      if (m.focus) setActive(m.items.findIndex((it) => !it.separator && !it.heading && !it.disabled));
    }
  }, [m]);
  // The submenu beside item i, or none past this level.
  const openSub = (i, focus = false) => {
    const it = m.items[i];
    const kept = subs.value.slice(0, level);
    if (!it?.items || it.disabled) {
      if (subs.value.length > level) subs.value = kept;
      return;
    }
    if (subs.value[level]?.from === i && !focus) return;
    const r = box.current.querySelector(`[data-i="${i}"]`).getBoundingClientRect();
    subs.value = [...kept, { x: r.right + 2, y: r.top - 5, flipX: r.left - 2, items: it.items, from: i, focus }];
  };
  const choose = (it, i) => {
    if (it.items) return openSub(i, true);
    closeAll();
    if (!it.disabled) setTimeout(() => it.run?.(), 0);
  };
  const key = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeAll();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = choices.indexOf(active);
      const next =
        e.key === 'ArrowDown'
          ? choices[(pos + 1) % choices.length]
          : choices[(pos - 1 + choices.length) % choices.length];
      setActive(next ?? -1);
      box.current.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowRight' && m.items[active]?.items) {
      e.preventDefault();
      openSub(active, true);
    } else if (e.key === 'ArrowLeft' && level > 0) {
      e.preventDefault();
      subs.value = subs.value.slice(0, level - 1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(m.items[active], active);
    }
  };
  return (
    <div
      class={`context-menu ${level ? 'is-sub' : ''}`}
      ref={box}
      role="menu"
      tabIndex={-1}
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      onKeyDown={key}
      onContextMenu={(e) => e.preventDefault()}
    >
      {m.items.map((it, i) =>
        it.separator ? (
          <div key={`s${i}`} class="context-sep" role="separator" />
        ) : it.heading ? (
          <div key={`h${i}`} class="context-heading">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            data-i={i}
            type="button"
            role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked}
            aria-haspopup={it.items ? 'menu' : undefined}
            aria-expanded={it.items ? subs.value[level]?.from === i : undefined}
            class={`context-item ${i === active ? 'is-active' : ''} ${it.danger ? 'is-danger' : ''} ${
              it.items && subs.value[level]?.from === i ? 'is-open' : ''
            }`}
            disabled={it.disabled}
            onPointerEnter={() => {
              setActive(i);
              openSub(i);
            }}
            onClick={() => choose(it, i)}
          >
            <span class="context-check">
              {it.checked ? (
                <Icon name="check" size={12} />
              ) : it.chip ? (
                <KindChip color={it.chip.color} icon={it.chip.icon} size={10} />
              ) : it.icon ? (
                <Icon name={it.icon} size={13} />
              ) : null}
            </span>
            <span class="context-label">{it.label}</span>
            {it.items ? <Icon name="chevron-right" size={12} class="context-more" /> : it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
