// The Meter Maker workspace (formerly the Progress Bar Maker) (brought over from Woogi Tools' JJS Progress
// Bar Maker), laid out like the Skills workspace: the picture in the centre,
// the tools down its left, the steps along the bottom, Properties and Layers
// down the right. Its File menu and Export sit in the top bar
// (src/ui/topbar.jsx).
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Modal } from '../ui/controls.jsx';
import { account } from '../account.js';
import * as S from '../store.js';
import * as B from './state.js';
import { CUSTOM_SHAPES, hasPart } from './draw.js';
import { ColourField, Check, Slider } from './fields.jsx';
import { LayerProps } from './layer-props.jsx';
import { theme } from '../theme.js';

const TOOLS = [
  { id: 'move', icon: 'pointer', label: 'Move and resize (V)' },
  { id: 'bar', icon: 'battery', label: 'Meter (M)' },
  { id: 'shape', icon: 'shapes', label: 'Shape (U)' },
  { id: 'pen', icon: 'pen-tool', label: 'Pen (P)' },
  { id: 'text', icon: 'type', label: 'Text (T)' },
  { id: 'brush', icon: 'brush', label: 'Brush (B)' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser (E)' },
];

// What the meter tool draws: what the workspace is for.
const BAR_KINDS = [
  { id: 'bar', icon: 'battery', label: 'Meter' },
  { id: 'ring', icon: 'circle-dot', label: 'Progress ring' },
  { id: 'textbar', icon: 'languages', label: 'Text bar' },
];
// What the shape tool draws.
const SHAPE_KINDS = [
  { id: 'rect', icon: 'square', label: 'Rectangle' },
  { id: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { id: 'triangle', icon: 'triangle', label: 'Triangle' },
  { id: 'diamond', icon: 'diamond', label: 'Diamond' },
  { id: 'polygon', icon: 'hexagon', label: 'Polygon' },
  { id: 'star', icon: 'star', label: 'Star' },
  { id: 'custom', icon: 'heart', label: 'Custom' },
];

const STARTS = [
  { id: 'bar', label: 'A bar' },
  { id: 'ring', label: 'A ring' },
  { id: 'empty', label: 'Nothing' },
];

const TYPE_ICONS = { bar: 'battery', shape: 'shapes', text: 'type', image: 'image', paint: 'brush' };
const iconOf = (layer) =>
  layer.type !== 'bar' ? TYPE_ICONS[layer.type] : ({ ring: 'circle-dot', text: 'languages' }[layer.shape] ?? TYPE_ICONS.bar);

// The Properties editor's tabs for each kind of layer.
const TABS = {
  bar: [
    ['shape', 'Shape'],
    ['fill', 'Fill'],
    ['track', 'Back'],
    ['stroke', 'Stroke'],
    ['effects', 'Effects'],
    ['layer', 'Layer'],
  ],
  shape: [
    ['shape', 'Shape'],
    ['effects', 'Effects'],
    ['layer', 'Layer'],
  ],
  text: [
    ['text', 'Text'],
    ['effects', 'Effects'],
    ['layer', 'Layer'],
  ],
  image: [
    ['effects', 'Effects'],
    ['layer', 'Layer'],
  ],
  paint: [
    ['effects', 'Effects'],
    ['layer', 'Layer'],
  ],
};

const HINTS = {
  move: 'Click a layer to pick it, drag to move it, drag a corner to resize (Shift keeps its shape). Arrow keys nudge.',
  text: 'Click on the picture to place text. {percent} in it counts up with the steps.',
};

// ─── Tool options: one line, for the tool in hand ──────────────────────

function ToolOptions() {
  const tool = B.tool.value;
  const layer = B.selected.value;
  let body;
  if (tool === 'bar')
    body = (
      <>
        <div class="segmented" role="group" aria-label="Meter to draw">
          {BAR_KINDS.map((k) => (
            <button type="button" key={k.id} aria-pressed={B.barKind.value === k.id} title={k.label} onClick={() => B.pickBarKind(k.id)}>
              <Icon name={k.icon} size={13} />
              {k.label}
            </button>
          ))}
        </div>
        <span class="hint">Drag on the picture to draw it. Shift keeps it square.</span>
      </>
    );
  else if (tool === 'shape')
    body = (
      <>
        <div class="segmented" role="group" aria-label="Shape to draw">
          {SHAPE_KINDS.map((k) => (
            <button type="button" key={k.id} aria-pressed={B.shapeKind.value === k.id} title={k.label} onClick={() => B.pickShapeKind(k.id)}>
              <Icon name={k.icon} size={13} />
              {k.label}
            </button>
          ))}
        </div>
        {B.shapeKind.value === 'polygon' && (
          <Slider label="Sides" min="3" max="16" value={B.polySides.value} onInput={(e) => (B.polySides.value = Math.max(3, Math.round(Number(e.currentTarget.value) || 6)))} />
        )}
        {B.shapeKind.value === 'star' && (
          <Slider label="Points" min="3" max="24" value={B.starPoints.value} onInput={(e) => (B.starPoints.value = Math.max(2, Math.round(Number(e.currentTarget.value) || 5)))} />
        )}
        {B.shapeKind.value === 'custom' && (
          <div class="pb-shape-lib" role="group" aria-label="Custom shape">
            {CUSTOM_SHAPES.map((c) => (
              <button type="button" key={c.id} class="pb-shape-pick" aria-pressed={B.customShape.value === c.id} title={c.label} aria-label={c.label} onClick={() => B.pickCustomShape(c.id)}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <path d={c.d} />
                </svg>
              </button>
            ))}
          </div>
        )}
        <span class="hint">Drag on the picture to draw it. Shift keeps it square.</span>
      </>
    );
  else if (tool === 'pen')
    body = (
      <span class="hint">
        Click to place points, drag to curve. Click the first point or press Enter to close it; Esc drops it, Backspace
        takes the last point back. {B.penPoints.value.length ? `${B.penPoints.value.length} points.` : ''}
      </span>
    );
  else if (tool === 'brush' || tool === 'eraser')
    body = (
      <>
        {tool === 'brush' && <ColourField label="Brush" value={B.brushColor.value} onChange={(hex) => (B.brushColor.value = hex)} />}
        <Slider
          label="Size"
          min="1"
          max="120"
          value={B.brushSize.value}
          onInput={(e) => (B.brushSize.value = Number(e.currentTarget.value) || 1)}
        />
        <Slider
          label="Opacity"
          min="1"
          max="100"
          unit="%"
          value={B.brushAlpha.value}
          onInput={(e) => (B.brushAlpha.value = Number(e.currentTarget.value) || 0)}
        />
        <span class="hint">
          {tool === 'eraser' ? 'Erases from the picked drawing layer.' : 'Draws on the picked drawing layer, or starts a new one.'}
        </span>
      </>
    );
  else if (tool === 'move' && layer && layer.type !== 'paint')
    body = (
      <>
        <span class="pb-opt-title">
          <Icon name={iconOf(layer)} size={13} />
          {layer.name}
        </span>
        {['x', 'y', 'w', 'h', 'rotation'].map((key) => (
          <label class="pb-num pb-num-inline" key={key}>
            <span>{key === 'rotation' ? '°' : key.toUpperCase()}</span>
            <input type="number" class="input num" value={layer[key]} onChange={(e) => B.layerField(key, e)} />
          </label>
        ))}
      </>
    );
  else body = <span class="hint">{HINTS[tool] ?? ''}</span>;
  return <div class="pb-options">{body}</div>;
}

// ─── The picture ────────────────────────────────────────────────────────

// Rulers along the top and left, in the picture's pixels, wherever it's
// scrolled or zoomed to. Drag out of one for a guide.
const RULER = 18;
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

function drawRuler(el, axis, area, box) {
  if (!el || !area || !box) return;
  const dpr = devicePixelRatio || 1;
  const r = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (el.width !== w) el.width = w;
  if (el.height !== h) el.height = h;
  const ctx = el.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  const b = box.getBoundingClientRect();
  const d = B.doc.value;
  const along = axis === 'x';
  // Screen pixels per picture pixel, and where picture 0 sits on the ruler.
  const k = along ? b.width / d.width : b.height / d.height;
  const zero = along ? b.left - r.left : b.top - r.top;
  const len = along ? r.width : r.height;
  const major = TICK_STEPS.find((s) => s * k >= 60) ?? 1000;
  const minor = TICK_STEPS.slice()
    .reverse()
    .find((s) => s < major && major % s === 0 && s * k >= 6);
  const from = Math.floor(-zero / k / (minor ?? major)) * (minor ?? major);
  const to = (len - zero) / k;
  // The theme's greys, so the rulers follow it.
  const css = getComputedStyle(el);
  const ink = css.getPropertyValue('--text-3').trim() || '#8a8a8a';
  ctx.strokeStyle = css.getPropertyValue('--line-strong').trim() || '#555';
  ctx.fillStyle = ink;
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let v = from; v <= to; v += minor ?? major) {
    const at = Math.round(zero + v * k) + 0.5;
    const big = v % major === 0;
    const half = !big && minor && (v * 2) % major === 0;
    const size = big ? RULER : half ? RULER * 0.45 : RULER * 0.25;
    if (along) {
      ctx.moveTo(at, RULER);
      ctx.lineTo(at, RULER - size);
    } else {
      ctx.moveTo(RULER, at);
      ctx.lineTo(RULER - size, at);
    }
    if (big) {
      if (along) ctx.fillText(String(v), at + 3, 9);
      else {
        ctx.save();
        ctx.translate(9, at + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.fillText(String(v), 0, 0);
        ctx.restore();
      }
    }
  }
  ctx.stroke();
  // The picture's own extent, and its middle.
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.08;
  const full = (along ? d.width : d.height) * k;
  if (along) ctx.fillRect(zero, 0, full, RULER);
  else ctx.fillRect(0, zero, RULER, full);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff3df2';
  const mid = zero + full / 2;
  if (along) ctx.fillRect(mid - 0.5, RULER - 4, 1, 4);
  else ctx.fillRect(RULER - 4, mid - 0.5, 4, 1);
  // Where the pointer is.
  const p = B.pointerAt.value;
  if (p) {
    ctx.fillStyle = '#36c5f0';
    const at = zero + (along ? p.x : p.y) * k;
    if (along) ctx.fillRect(at - 0.5, 0, 1, RULER);
    else ctx.fillRect(0, at - 0.5, RULER, 1);
  }
}

function Workspace() {
  const canvas = useRef(null);
  const overlay = useRef(null);
  const area = useRef(null);
  const box = useRef(null);
  const top = useRef(null);
  const left = useRef(null);
  const showRulers = B.rulers.value;
  const redrawRulers = () => {
    if (!B.rulers.peek()) return;
    drawRuler(top.current, 'x', area.current, box.current);
    drawRuler(left.current, 'y', area.current, box.current);
  };
  useEffect(() => {
    B.bindCanvas(canvas.current);
    B.bindOverlay(overlay.current);
    const watcher = new ResizeObserver(() => {
      B.measure();
      redrawRulers();
    });
    watcher.observe(overlay.current);
    watcher.observe(area.current);
    return () => {
      watcher.disconnect();
      B.bindCanvas(null);
      B.bindOverlay(null);
    };
  }, []);
  // The rulers follow the zoom, the pointer and the picture's size.
  useEffect(() => {
    requestAnimationFrame(redrawRulers);
  }, [showRulers, B.zoom.value, B.viewScale.value, B.pointerAt.value, B.doc.value.width, B.doc.value.height, theme.value]);
  const { width, height } = B.doc.value;
  const z = B.zoom.value;
  // Fits the workspace either way round, from its container's size.
  const fit = z
    ? { width: `${width * z}px`, height: `${height * z}px` }
    : { aspectRatio: `${width}/${height}`, width: `min(calc(100cqw - 40px), calc((100cqh - 40px) * ${width / height}))` };
  const drop = (event) => {
    event.preventDefault();
    B.dragging.value = false;
    B.addPictures([...(event.dataTransfer?.files ?? [])]);
  };
  return (
    <div class={`pb-rulerframe ${showRulers ? 'has-rulers' : ''}`}>
      {showRulers && (
        <>
          <button type="button" class="pb-ruler-corner" title="Hide the rulers (Ctrl+R)" aria-label="Hide the rulers" onClick={B.toggleRulers} />
          <canvas class="pb-ruler is-top" ref={top} title="Drag down for a guide" onPointerDown={(e) => B.startGuide('y', e)} />
          <canvas class="pb-ruler is-left" ref={left} title="Drag right for a guide" onPointerDown={(e) => B.startGuide('x', e)} />
        </>
      )}
      <div
        ref={area}
        class={`pb-canvas-area ${B.dragging.value ? 'is-dragging' : ''}`}
        onScroll={redrawRulers}
        onDragOver={(e) => {
          e.preventDefault();
          B.dragging.value = true;
        }}
        onDragLeave={() => (B.dragging.value = false)}
        onDrop={drop}
        onWheel={B.wheel}
        onPointerDown={(e) => B.startPan(e, area.current, redrawRulers)}
        onAuxClick={(e) => e.button === 1 && e.preventDefault()}
      >
        <div class="pb-canvas-box checker" ref={box} style={{ ...fit, translate: `${B.pan.value.x}px ${B.pan.value.y}px` }}>
          <canvas class="pb-canvas" ref={canvas} />
          <canvas
            class="pb-overlay"
            data-tool={B.tool.value}
            ref={overlay}
            onPointerDown={B.pointerDown}
            onPointerMove={B.pointerMove}
            onPointerUp={B.pointerUp}
            onPointerCancel={B.pointerUp}
            onPointerLeave={() => (B.pointerAt.value = null)}
          />
        </div>
      </div>
    </div>
  );
}

function Rail() {
  const kind = SHAPE_KINDS.find((k) => k.id === B.shapeKind.value);
  const meter = BAR_KINDS.find((k) => k.id === B.barKind.value);
  return (
    <nav class="pb-rail" aria-label="Tools">
      {TOOLS.map((t) => {
        const shown =
          t.id === 'shape' && kind ? { ...t, icon: kind.icon, label: `${kind.label} (U)` } : t.id === 'bar' && meter ? { ...t, icon: meter.icon, label: `${meter.label} (M)` } : t;
        return (
          <button
            type="button"
            key={t.id}
            class="pb-rail-btn"
            title={shown.label}
            aria-label={shown.label}
            aria-pressed={B.tool.value === t.id}
            onClick={() => B.pickTool(t.id)}
          >
            <Icon name={shown.icon} size={16} />
          </button>
        );
      })}
      <span class="pb-rail-sep" />
      <label class="pb-rail-btn" title="Add a picture (or drop / paste one)" aria-label="Add a picture">
        <Icon name="image-plus" size={16} />
        <input
          type="file"
          accept="image/*"
          multiple
          class="sr-only"
          onChange={(e) => {
            B.addPictures([...(e.currentTarget.files ?? [])]);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </nav>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────

function Steps() {
  const d = B.doc.value;
  const pad = String(d.frames).length;
  const strip = useRef(null);
  // Keeps the step on show in view as it plays.
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [B.frame.value]);
  return (
    <section class="area pb-steps" aria-label="Steps">
      <header class="area-head">
        <IconButton
          icon={B.playing.value ? 'pause' : 'play'}
          label={B.playing.value ? 'Pause' : 'Play every step'}
          class="play-btn"
          size={14}
          onClick={B.play}
        />
        <input
          type="range"
          min="0"
          max={d.frames}
          value={B.frame.value}
          aria-label="Step"
          class="pb-frame-range"
          onInput={(e) => B.showFrame(e.currentTarget.value)}
        />
        <span class="pb-frame-label num">
          {String(B.frame.value).padStart(pad, '0')}/{d.frames}
          <span>{Math.round((B.frame.value / d.frames) * 100)}%</span>
        </span>
        <span class="head-sep" />
        <label class="pb-num pb-num-inline">
          <span>Steps</span>
          <input
            type="number"
            min="1"
            max={B.MAX_FRAMES}
            class="input num"
            value={d.frames}
            onChange={(e) => B.docField('frames', e)}
          />
        </label>
        <label class="pb-num pb-num-inline">
          <span>fps</span>
          <input type="number" min="1" max="60" class="input num" value={B.fps.value} onChange={(e) => B.setFps(e.currentTarget.value)} />
        </label>
      </header>
      <div class="pb-strip" ref={strip}>
        {B.thumbs.value.map((t) => (
          <button
            type="button"
            key={t.frame}
            data-step={t.frame}
            class="pb-thumb checker"
            aria-pressed={t.frame === B.frame.value}
            title={`Step ${t.frame}`}
            onClick={() => B.showFrame(t.frame)}
          >
            <img src={t.url} alt={`Step ${t.frame}`} />
            <span class="num">{t.frame}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── The dock: Properties and Layers ───────────────────────────────────

function CanvasProps() {
  const d = B.doc.value;
  return (
    <div class="pb-props">
      <section class="pb-group">
        <h4>Size</h4>
        <p class="hint">
          Always 1024 × 1024: the biggest a Roblox decal keeps as it is, and square, so nothing is shrunk or squashed
          when it’s uploaded.
        </p>
      </section>
      <section class="pb-group">
        <h4>Steps</h4>
        <label class="pb-row">
          <span class="pb-row-label">Full at step</span>
          <input type="number" min="1" max={B.MAX_FRAMES} class="input num" value={d.frames} onChange={(e) => B.docField('frames', e)} />
        </label>
        <p class="hint">
          {d.frames + 1} pictures: 0 is empty, {d.frames} is full.
        </p>
      </section>
      <section class="pb-group">
        <h4>Background</h4>
        <Check label="Fill behind everything" checked={d.background.on} onChange={(e) => B.docField('background.on', e)} />
        <div class="pb-stop">
          <ColourField label="Background" value={d.background.color} onChange={B.setBackground} />
        </div>
        <p class="hint">Leave it off to keep the picture see-through around the bar.</p>
      </section>
    </div>
  );
}

function Properties() {
  const layer = B.selected.value;
  const tabs = (TABS[layer?.type] ?? []).map(([id, label]) => ({ id, label }));
  const active = (tabs.find((t) => t.id === B.propTab.value) ?? tabs[0])?.id;
  return (
    <section class="area pb-props-area">
      <header class="area-head">
        <span class="area-title">
          <Icon name={layer ? iconOf(layer) : 'frame'} size={14} />
          {layer?.name ?? 'Canvas'}
        </span>
      </header>
      {layer && (
        <div class="pb-tabs" role="tablist" aria-label="Properties">
          {tabs.map((t) => (
            <button type="button" role="tab" key={t.id} aria-selected={active === t.id} onClick={() => (B.propTab.value = t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div class="area-body pb-scroll">{layer ? <LayerProps layer={layer} tab={active} /> : <CanvasProps />}</div>
    </section>
  );
}

function Layers() {
  const d = B.doc.value;
  const none = !B.selected.value;
  return (
    <section class="area pb-layers-area">
      <header class="area-head">
        <span class="area-title">
          <Icon name="layers" size={14} />
          Layers
        </span>
        <span class="spacer" />
        <IconButton icon="brush" label="New drawing layer" size={14} onClick={B.addDrawing} />
        <IconButton icon="arrow-up" label="Move layer up" size={14} disabled={none} onClick={() => B.moveLayer(1)} />
        <IconButton icon="arrow-down" label="Move layer down" size={14} disabled={none} onClick={() => B.moveLayer(-1)} />
        <IconButton icon="copy" label="Duplicate layer" size={14} disabled={none} onClick={B.duplicateLayer} />
        <IconButton icon="trash-2" label="Delete layer" size={14} class="danger" disabled={none} onClick={B.deleteLayer} />
      </header>
      <ul class="area-body pb-scroll pb-layers">
        {[...d.layers].reverse().map((layer) => (
          <li
            key={layer.id}
            data-layer-id={layer.id}
            class={`pb-layer ${layer.id === B.selectedId.value ? 'is-active' : ''} ${layer.visible ? '' : 'is-hidden'}`}
          >
            <button
              type="button"
              class="pb-layer-eye"
              aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
              title={layer.visible ? 'Hide' : 'Show'}
              onClick={() => B.toggleLayer(layer.id, 'visible')}
            >
              <Icon name={layer.visible ? 'eye' : 'eye-off'} size={13} />
            </button>
            <button type="button" class="pb-layer-name" onClick={() => B.select(layer.id)}>
              {layer.clip && (
                <span class="pb-clip-mark" aria-hidden="true">
                  ↳
                </span>
              )}
              <Icon name={iconOf(layer)} size={13} />
              <span>{layer.name}</span>
            </button>
            <button
              type="button"
              class="pb-layer-clip"
              title="Clip to the layer below"
              aria-label="Clip to the layer below"
              aria-pressed={Boolean(layer.clip)}
              onClick={() => B.toggleLayer(layer.id, 'clip')}
            >
              <Icon name="link" size={12} />
            </button>
          </li>
        ))}
        <li class={`pb-layer ${none ? 'is-active' : ''}`}>
          <span class="pb-layer-eye" />
          <button type="button" class="pb-layer-name" onClick={() => B.select(null)}>
            <Icon name="frame" size={13} />
            <span>
              Canvas · {d.width}×{d.height}
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

// ─── Dialogs ────────────────────────────────────────────────────────────

function NewDialog() {
  useEffect(() => {
    B.drawExampleThumbs();
  }, []);
  return (
    <Modal title="New meter" onClose={B.closeDialog}>
      <div class="pb-dialog">
        <label class="prop-row">
          <span>Full at step</span>
          <input
            type="number"
            min="1"
            max={B.MAX_FRAMES}
            class="input num"
            value={B.newSteps.value}
            onChange={(e) => (B.newSteps.value = B.clamp(Math.round(Number(e.currentTarget.value)) || 1, 1, B.MAX_FRAMES))}
          />
        </label>
        <p class="hint">1024 × 1024, like every design here.</p>
        <div class="prop-row">
          <span>Start with</span>
          <div class="segmented" role="group" aria-label="Start with">
            {STARTS.map((s) => (
              <button type="button" key={s.id} aria-pressed={B.newStart.value === s.id} onClick={() => (B.newStart.value = s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div class="modal-actions">
          <Button variant="primary" onClick={B.createNew}>
            Create
          </Button>
        </div>
        <h3 class="section-title">Or pull apart an example</h3>
        <div class="pb-examples">
          {B.EXAMPLES.map((t) => (
            <button type="button" class="pb-example" key={t.id} title={t.hint} onClick={() => B.useExample(t)}>
              <span class="pb-example-thumb checker">{B.exampleThumbs.value[t.id] && <img src={B.exampleThumbs.value[t.id]} alt="" />}</span>
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function OpenDialog() {
  const list = B.designs.value;
  return (
    <Modal title="Meter designs" onClose={B.closeDialog} class="modal-wide">
      {list.length ? (
        <ul class="saved-list pb-designs">
          {list.map((d) => (
            <li key={d.id} class={d.current ? 'is-current' : ''}>
              <button type="button" class="saved-open" onClick={() => B.openSaved(d.id)}>
                <span class="pb-design-thumb checker">{d.thumb && <img src={d.thumb} alt="" />}</span>
                <span class="pb-design-text">
                  <strong>{d.name}</strong>
                  <span>
                    {d.frames} steps · {d.when}
                  </span>
                </span>
              </button>
              <IconButton icon="trash-2" label={`Delete ${d.name}`} class="danger" onClick={() => B.deleteSaved(d.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p class="hint">Nothing saved yet. Press Save (Ctrl+S) and your design will be here.</p>
      )}
      <h3 class="section-title">Files</h3>
      <p class="hint">A design file keeps one anywhere: to share it, or to keep a copy.</p>
      <div class="modal-actions">
        <Button icon="folder" onClick={B.openDesignFile}>
          Open a design file
        </Button>
        <Button icon="download" onClick={B.saveDesignFile}>
          Save this design as a file
        </Button>
      </div>
    </Modal>
  );
}

function PicturesExport() {
  const d = B.doc.value;
  return (
    <div class="pb-export">
      <label class="prop-row">
        <span>File names</span>
        <input
          type="text"
          class="input"
          value={B.exportName.value}
          spellcheck={false}
          onInput={(e) => (B.exportName.value = e.currentTarget.value)}
        />
      </label>
      <p class="hint">
        {d.frames + 1} pictures, from <code>{B.firstName.value}</code> (empty) to <code>{B.lastName.value}</code> (full),{' '}
        {d.width}×{d.height} each.
      </p>
      <Check
        label="Render in layers"
        checked={B.layeredExport.value}
        onChange={(e) => (B.layeredExport.value = e.currentTarget.checked)}
      />
      <p class="hint">
        The meter apart from its container: one container picture (the background, outline and whatever else never
        changes), then a folder each of the meter{hasPart(d, 'lead') ? ', its leading edge' : ''}
        {hasPart(d, 'trail') ? ' and its catch-up trail' : ''}, a picture per step. Complex Separate (JJS skill) uses
        them.
      </p>
      <div class="modal-actions">
        <Button variant="primary" icon="file-archive" disabled={B.busy.value} onClick={B.saveZip}>
          {B.layeredExport.value ? 'Every step, in layers (.zip)' : 'Every step (.zip)'}
        </Button>
        <Button disabled={B.busy.value} onClick={B.saveFrame}>
          Step {B.frame.value} only (.png)
        </Button>
        <Button disabled={B.busy.value} onClick={B.saveSheet}>
          Sprite sheet (.png)
        </Button>
      </div>
      <p class={B.error.value ? 'error' : 'hint'} role="status">
        {B.busy.value ? 'Drawing every step…' : (B.error.value ?? B.status.value)}
      </p>
    </div>
  );
}

function Preview3d() {
  const host = useRef(null);
  useEffect(() => {
    let undo = null;
    let gone = false;
    B.mountPreview(host.current).then((dispose) => (gone ? dispose() : (undo = dispose)));
    return () => {
      gone = true;
      undo?.();
    };
  }, []);
  // Redrawn when the step, the size or the offset change.
  useEffect(() => B.draw(), [B.frame.value, B.jjs.value.size, B.jjs.value.position, B.jjs.value.style]);
  return (
    <div class="pb-bar3d">
      <div class="pb-bar3d-view" ref={host} />
      <div class="pb-bar3d-bar">
        <label class="pb-slider">
          <span>
            Step {B.frame.value} of {B.doc.value.frames}
          </span>
          <input type="range" min="0" max={B.doc.value.frames} value={B.frame.value} onInput={(e) => B.showFrame(e.currentTarget.value)} />
        </label>
        <Button onClick={B.resetPreview}>Reset view</Button>
      </div>
      <p class="hint">
        Where the billboard sits on you, at this Size and Offset. The offset is on the screen: x across (negative is
        right), y up, z the layer (negative in front of you, positive behind); the y is paired with its ALT POSITION
        for you. Drag to look around.
      </p>
    </div>
  );
}

function UploadRows() {
  return (
    <ol class="pb-uploads">
      {B.uploadRows.value.map((row) => (
        <li key={row.step} class={`pb-upload-row is-${row.state}`}>
          <span class="pb-upload-step num">{row.label ?? row.step}</span>
          <span class="pb-upload-state">
            {row.state === 'done' ? (
              <>
                <Icon name="check" size={12} /> image <code>{row.imageId}</code>
              </>
            ) : row.state === 'uploading' ? (
              'Uploading and finding its picture…'
            ) : row.state === 'failed' ? (
              row.error
            ) : (
              'Waiting'
            )}
          </span>
          {row.decalId && (
            <a
              class="link"
              href={`https://create.roblox.com/dashboard/creations/store/${row.decalId}/configure`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open decal ${row.decalId} in the Creator Dashboard`}
            >
              decal {row.decalId}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

function SkillExport() {
  const j = B.jjs.value;
  const d = B.doc.value;
  const who = account.value;
  const num = (key) => (e) => B.setJjs(key, e.currentTarget.value);
  return (
    <div class="pb-export">
      <section class="panel">
        <h3 class="panel-head">1 · Upload to Roblox</h3>
        <div class="panel-body">
          {who?.signedIn ? (
            <p class="pb-account">
              <Icon name="user-round" size={14} />
              <span>
                Uploading as <strong>@{who.user?.username}</strong>: {B.uploadCount.value} decals, then each one’s image ID
                goes in below and the skill goes into your moveset.
              </span>
            </p>
          ) : (
            <p class="pb-account">
              <Icon name="user-round" size={14} />
              <span>Sign in with Roblox to upload the pictures as your account.</span>
              <Button onClick={() => (S.dialog.value = 'account')}>Sign in</Button>
            </p>
          )}
          <div class="pb-callout">
            <Icon name="warning" size={14} />
            <p>
              JJS can only show pictures that are <strong>Open Use</strong>. Newer Roblox accounts keep uploads private,
              so before uploading open{' '}
              <a class="link" href="https://create.roblox.com/settings/advanced" target="_blank" rel="noopener noreferrer">
                Creator Hub → Settings → Advanced
              </a>{' '}
              and turn off “Opt-in to restrict assets on creation”. Already uploaded? Set each decal to Open Use from its
              page in the Creator Dashboard.
            </p>
          </div>
          {who?.signedIn && (
            <Button variant="primary" icon="upload" disabled={B.uploading.value} onClick={B.uploadToRoblox}>
              {B.uploading.value ? 'Uploading…' : `Upload ${B.uploadCount.value} pictures and add the skill`}
            </Button>
          )}
          {B.uploadsStale.value && (
            <p class="warn">
              <Icon name="warning" size={12} /> The design has changed since these were uploaded: upload again to match it.
            </p>
          )}
          {B.uploadRows.value.length > 0 && <UploadRows />}
          {B.uploadError.value && (
            <p class="error" role="alert">
              {B.uploadError.value}
            </p>
          )}
        </div>
      </section>

      <section class="panel">
        <h3 class="panel-head">2 · Image IDs</h3>
        <div class="panel-body">
          {B.separate.value && (
            <label class="pb-num">
              <span>Container (its background and outline)</span>
              <input
                type="text"
                class="input num"
                spellcheck={false}
                placeholder="One image ID"
                value={j.containerId}
                onInput={(e) => B.setJjs('containerId', e.currentTarget.value)}
              />
            </label>
          )}
          {B.separate.value && B.sepParts.value.front && (
            <label class="pb-num">
              <span>Front (what’s over the meter and never changes)</span>
              <input type="text" class="input num" spellcheck={false} placeholder="One image ID" value={j.frontId} onInput={(e) => B.setJjs('frontId', e.currentTarget.value)} />
            </label>
          )}
          {B.separate.value &&
            B.sepParts.value.extras.map((x) => (
              <label class="pb-num" key={x.key}>
                <span>
                  {x.label}: shown on {x.steps.length === 1 ? 'that step' : 'those steps'} only ({x.above ? 'over' : 'under'} the meter)
                </span>
                <input
                  type="text"
                  class="input num"
                  spellcheck={false}
                  placeholder="One image ID"
                  value={j.extraIds?.[x.key] ?? ''}
                  onInput={(e) => B.setJjs('extraIds', { ...(j.extraIds ?? {}), [x.key]: e.currentTarget.value })}
                />
              </label>
            ))}
          {B.separate.value && <span class="pb-ids-label">Meter, one per step</span>}
          <textarea
            class="input num pb-ids"
            rows={3}
            spellcheck={false}
            aria-label={B.separate.value ? 'Meter image IDs, one per step' : 'Image IDs, one per step'}
            placeholder="One image ID per step, step 0 (empty) first"
            value={j.ids}
            onInput={(e) => B.setJjs('ids', e.currentTarget.value)}
          />
          <p class="hint">
            {B.jjsIds.value.length} of {d.frames + 1} IDs. Filled in by the upload; image (texture) IDs, not decal IDs.
          </p>
          {B.separate.value && B.wantsTrail.value && (
            <>
              <span class="pb-ids-label">Catch-up trail, one per step</span>
              <textarea
                class="input num pb-ids"
                rows={3}
                spellcheck={false}
                aria-label="Trail image IDs, one per step"
                placeholder="One image ID per step, step 0 first"
                value={j.trailIds}
                onInput={(e) => B.setJjs('trailIds', e.currentTarget.value)}
              />
              <p class="hint">
                {B.trailIds.value.length} of {d.frames + 1} IDs.
              </p>
            </>
          )}
        </div>
      </section>

      <section class="panel">
        <h3 class="panel-head">3 · Skill</h3>
        <div class="panel-body">
          <div class="pb-nums pb-skill-fields">
            <label class="pb-num">
              <span>Name</span>
              <input type="text" class="input" placeholder={d.name} value={j.name} onChange={(e) => B.setJjs('name', e.currentTarget.value)} />
            </label>
            <label class="pb-num">
              <span>Tag</span>
              <input type="text" class="input" value={j.tag} onChange={(e) => B.setJjs('tag', e.currentTarget.value)} />
            </label>
            <label class="pb-num">
              <span>Size</span>
              <input type="number" step="0.1" min="0.1" class="input num" value={j.size} onChange={num('size')} />
            </label>
            <label class="pb-num">
              <span>Offset (x, y, z)</span>
              <input type="text" class="input num" value={j.position} onChange={(e) => B.setJjs('position', e.currentTarget.value)} />
            </label>
            {j.style === 'legacy' ? (
              <>
                <label class="pb-num">
                  <span>Shown for (s)</span>
                  <input type="number" step="0.01" min="0" class="input num" value={j.showFor} onChange={num('showFor')} />
                </label>
                <label class="pb-num">
                  <span>Wait (s)</span>
                  <input type="number" step="0.01" min="0" class="input num" value={j.waitFor} onChange={num('waitFor')} />
                </label>
              </>
            ) : (
              <label class="pb-num">
                <span>Check every (s)</span>
                <input type="number" step="0.01" min="0.01" class="input num" value={j.checkEvery} onChange={num('checkEvery')} />
              </label>
            )}
            {B.separate.value && B.wantsTrail.value && (
              <label class="pb-num">
                <span>Trail fades in (s)</span>
                <input type="number" step="0.05" min="0.05" class="input num" value={j.trailTime} onChange={num('trailTime')} />
              </label>
            )}
          </div>
          <div class="prop-row">
            <span>Style</span>
            <div class="segmented" role="group" aria-label="Style">
              <button type="button" aria-pressed={j.style === 'complex'} onClick={() => B.setJjs('style', 'complex')}>
                Complex
              </button>
              <button type="button" aria-pressed={j.style === 'separate'} onClick={() => B.setJjs('style', 'separate')}>
                Complex Separate
              </button>
              <button type="button" aria-pressed={j.style === 'legacy'} onClick={() => B.setJjs('style', 'legacy')}>
                Legacy
              </button>
            </div>
          </div>
          <p class="hint">
            {j.style === 'legacy'
              ? 'Legacy shows the step again and again, every wait: simple, but it can lag.'
              : j.style === 'separate'
                ? `Complex Separate draws the meter in layers, each its own billboard a thousandth of a stud apart in z (the more negative, the further in front): the container (background, outline, and the layers under the bar that never change) once, at the back, for good; then only the meter is swapped as the tag changes, with the bar’s inner shadow and outline baked in where it covers them.${B.sepParts.value.front ? ' Layers over the bar that never change are the front, shown once in front of the meter.' : ''}${B.sepParts.value.extras.length ? ` ${B.sepParts.value.extras.length === 1 ? 'A layer shown on some steps only is its own picture' : 'Layers shown on some steps only are pictures of their own'}, drawn on those steps and taken off the rest.` : ''}${B.wantsTrail.value ? ' When it goes down, the step it left flashes its catch-up trail behind the meter and fades.' : ' Turn on a bar’s catch-up trail (Fill) to flash it behind the meter when it goes down.'}`
                : 'Complex shows each step once and keeps it, cancelling the others by their visual tags, then loops on its checks: lag-proof, and far too many nodes to build by hand.'}
          </p>
          <div class="prop-row">
            <span>Moved by</span>
            <div class="segmented" role="group" aria-label="Moved by">
              <button type="button" aria-pressed={j.source !== 'health'} onClick={() => B.setJjs('source', 'tag')}>
                A tag
              </button>
              <button type="button" aria-pressed={j.source === 'health'} onClick={() => B.setJjs('source', 'health')}>
                Your health
              </button>
            </div>
          </div>
          {j.source === 'health' && (
            <>
              <div class="pb-nums pb-skill-fields">
                <label class="pb-num">
                  <span>Max health</span>
                  <input type="number" step="1" min="1" class="input num" value={j.healthMax} onChange={num('healthMax')} />
                </label>
                <label class="pb-num">
                  <span>Check health every (s)</span>
                  <input type="number" step="0.01" min="0.01" class="input num" value={j.healthEvery} onChange={num('healthEvery')} />
                </label>
              </div>
              <p class="hint">
                A health bar: a passive (“{(j.name.trim() || d.name)} Health”) finds which step your health is on with
                Has Health checks, as the Percentage damage template does ({Math.ceil(Math.log2(d.frames + 1))} checks
                for {d.frames} steps), and puts the bar on it. Step N is up to N/{d.frames} of {j.healthMax} health; no
                regen or debug skills come with it.
              </p>
            </>
          )}
          <div class="prop-row">
            <span>Starts</span>
            <div class="segmented" role="group" aria-label="Starts">
              <button type="button" aria-pressed={j.start === 'full'} onClick={() => B.setJjs('start', 'full')}>
                Full
              </button>
              <button type="button" aria-pressed={j.start === 'empty'} onClick={() => B.setJjs('start', 'empty')}>
                Empty
              </button>
            </div>
          </div>
          <Preview3d />
          <Check label="Add Safety Rails" checked={j.rails} onChange={(e) => B.setJjs('rails', e.currentTarget.checked)} />
          <p class="hint">Keeps the tag between 0 and {d.frames}: anything that pushes it past either end is put back at that end.</p>
          <Check label="Client sided" checked={j.clientSided} onChange={(e) => B.setJjs('clientSided', e.currentTarget.checked)} />
          <p class="hint">Only the player sees their own bar; nobody else does. (Not the same as Run on server.)</p>
          <div class="pb-inline" hidden={j.source === 'health'}>
            <Check label="Regenerate" checked={j.regen} onChange={(e) => B.setJjs('regen', e.currentTarget.checked)} />
            {j.regen && (
              <>
                <label class="pb-num pb-num-inline">
                  <span>Add</span>
                  <input type="number" class="input num" value={j.regenAmount} onChange={num('regenAmount')} />
                </label>
                <label class="pb-num pb-num-inline">
                  <span>every (s)</span>
                  <input type="number" step="0.1" min="0.05" class="input num" value={j.regenEvery} onChange={num('regenEvery')} />
                </label>
              </>
            )}
          </div>
          <p class="hint">
            Two debug skills come with it: key 1 adds a step, key 2 takes one away. The skill shows step N while the{' '}
            <code>{j.tag || 'Bar'}</code> tag is N (0 to {d.frames}): set that tag from your other skills to move the bar.
          </p>
          {B.skillCode.value ? (
            <>
              <textarea class="input num pb-code" rows={8} readonly onFocus={(e) => e.currentTarget.select()} spellcheck={false} aria-label="Skill code" value={B.skillCode.value} />
              <div class="modal-actions">
                <Button variant="primary" icon="plus" onClick={B.addToMoveset}>
                  Add to “{S.name.value}”
                </Button>
                <Button icon={B.copied.value ? 'check' : 'copy'} onClick={B.copySkill}>
                  {B.copied.value ? 'Copied: paste it into the Skill Builder' : 'Copy skill code'}
                </Button>
              </div>
              {B.status.value && <p class="hint">{B.status.value}</p>}
            </>
          ) : (
            B.skillNote.value && <p class="warn">{B.skillNote.value}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ExportDialog() {
  const tab = B.exportTab.value;
  return (
    <Modal title="Export meter" onClose={B.closeDialog} class="modal-wide pb-export-modal">
      <div class="pb-tabs" role="tablist" aria-label="Export as">
        <button type="button" role="tab" aria-selected={tab === 'jjs'} onClick={() => (B.exportTab.value = 'jjs')}>
          JJS skill
        </button>
        <button type="button" role="tab" aria-selected={tab === 'pictures'} onClick={() => (B.exportTab.value = 'pictures')}>
          Pictures
        </button>
      </div>
      {tab === 'jjs' ? <SkillExport /> : <PicturesExport />}
    </Modal>
  );
}

// ─── The workspace ─────────────────────────────────────────────────────

export function BarMaker() {
  useEffect(() => {
    B.restore();
    addEventListener('keydown', B.onKey);
    // Pictures pasted anywhere in the workspace become layers.
    const paste = (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        B.addPictures(files);
      }
    };
    addEventListener('paste', paste);
    return () => {
      removeEventListener('keydown', B.onKey);
      removeEventListener('paste', paste);
      B.stop();
    };
  }, []);
  const dialog = B.dialog.value;
  return (
    <>
      <main class="workspace pb-workspace">
        <ToolOptions />
        <Rail />
        <section class="area pb-view">
          <Workspace />
        </section>
        <Steps />
        <div class="pb-dock">
          <Properties />
          <Layers />
        </div>
      </main>
      {dialog === 'new' && <NewDialog />}
      {dialog === 'open' && <OpenDialog />}
      {dialog === 'export' && <ExportDialog />}
    </>
  );
}

/** The status bar's message for this workspace. */
export function barStatus() {
  if (B.error.value) return B.error.value;
  if (B.status.value) return B.status.value;
  const d = B.doc.value;
  return `${d.frames + 1} pictures, 0 (empty) to ${d.frames} (full)`;
}

export function BarZoom() {
  return (
    <span class="pb-zoom">
      <IconButton icon="zoom-out" label="Zoom out" size={12} onClick={() => B.zoomBy(0.8)} />
      <button type="button" class="menu-btn num" title="Fit to the window (Ctrl+0)" onClick={() => B.zoomTo(0)}>
        {Math.round((B.zoom.value || B.viewScale.value) * 100)}%
      </button>
      <IconButton icon="zoom-in" label="Zoom in" size={12} onClick={() => B.zoomBy(1.25)} />
      <button type="button" class="menu-btn" title="Actual size" onClick={() => B.zoomTo(1)}>
        1:1
      </button>
    </span>
  );
}
