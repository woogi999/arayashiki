// The frame meter: the whole simulation on one strip, the way training modes
// show frame data. One lane for you and one for the dummy; every timed node
// is a bar in its kind's colour, cut into frame cells (60 a second) once
// they're wide enough to see, and hits are red marks. The wheel zooms in
// (to single frames), Shift+wheel pans, double-click fits it all again. It's
// drawn once per simulation or view; only the playhead moves while playing.
// Click or drag to scrub; click a bar to jump to its node.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSignalEffect } from '@preact/signals';
import { nodeInfo, nodeTitle } from '../../core/schema.js';
import * as S from '../store.js';
import { theme } from '../theme.js';

const RULER = 22;
const GUTTER = 68;
const BAR = 7;
const GAP = 2;
const PAD = 6;
const MAX_TRACKS = 6;
const RIGHT = 10;
const LANES = [
  { who: 'user', label: 'You' },
  { who: 'target', label: 'Dummy' },
];
const STEPS = [1 / 60, 2 / 60, 5 / 60, 0.1, 0.25, 0.5, 1, 2, 5];

// Events packed into rows so bars never overlap.
function pack(events, px) {
  const ends = [];
  return events.map((e) => {
    let track = ends.findIndex((end) => end <= px(e.t) - 1);
    if (track < 0) track = ends.length < MAX_TRACKS ? ends.length : MAX_TRACKS - 1;
    ends[track] = Math.max(px(e.t) + 3, px(e.end));
    return { e, track };
  });
}

const MIN_VIEW = 20 / 60; // zoomed all the way in: 20 frames across

// `view` is the stretch of time shown ({ t0, t1 }), or null for all of it.
function layoutOf(run, width, view) {
  const span = Math.max(run.duration, 0.1);
  const t0 = view ? view.t0 : 0;
  const t1 = view ? view.t1 : span;
  const inner = Math.max(40, width - GUTTER - RIGHT);
  const x = (t) => GUTTER + ((t - t0) / (t1 - t0)) * inner;
  const t = (px) => Math.min(span, Math.max(0, t0 + ((px - GUTTER) / inner) * (t1 - t0)));
  let y = RULER;
  const lanes = LANES.map((lane) => {
    const events = run.events
      .filter((e) => e.who === lane.who && e.kind !== 'HIT')
      .sort((a, b) => a.t - b.t || a.id - b.id);
    const packed = pack(events, x);
    const tracks = Math.max(1, ...packed.map((p) => p.track + 1));
    const height = PAD * 2 + tracks * BAR + (tracks - 1) * GAP;
    const out = { ...lane, y, height, packed };
    y += height;
    return out;
  });
  return { x, t, t0, t1, lanes, height: y + 1, span, inner };
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function FrameMeter() {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const head = useRef(null);
  const tip = useRef(null);
  const layout = useRef(null);
  const boxes = useRef([]);
  const view = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const setView = (next) => {
    view.current = next;
    setZoomed(Boolean(next));
    draw();
  };

  function draw() {
    const el = canvas.current;
    const run = S.run.peek();
    if (!el || !wrap.current || !run) return;
    const width = wrap.current.clientWidth;
    const L = layoutOf(run, width, view.current);
    layout.current = L;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(L.height * dpr);
    el.style.height = `${L.height}px`;
    const g = el.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, L.height);
    const c = {
      line: css('--line'),
      strong: css('--line-strong'),
      text2: css('--text-2'),
      text3: css('--text-3'),
      hit: css('--hit'),
      accent: css('--accent'),
      select: css('--sel-line'),
      you: css('--you'),
      dummy: css('--dummy'),
      bg: css('--bg-0'),
      panel: css('--bg-1'),
    };
    const clip = () => {
      g.save();
      g.beginPath();
      g.rect(GUTTER, 0, L.inner + RIGHT, L.height); // clear of the lane labels
      g.clip();
    };

    // Ruler: a frame grid when frames are at least 5px apart, else tenths.
    const pxPer = (s) => (s / (L.t1 - L.t0)) * L.inner;
    const minor = STEPS.find((s) => pxPer(s) >= 5) ?? 5;
    const major = STEPS.find((s) => pxPer(s) >= 64 && s >= minor * 2) ?? 5;
    const inFrames = major < 0.25; // zoomed in: label ticks by frame
    g.font = `500 10px ${css('--font-mono')}`;
    g.textBaseline = 'middle';
    clip();
    for (let i = Math.floor(L.t0 / minor); i * minor <= L.t1 + 1e-9; i++) {
      const tt = i * minor;
      const px = Math.round(L.x(tt)) + 0.5;
      const isMajor = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
      g.strokeStyle = isMajor ? c.strong : c.line;
      g.globalAlpha = isMajor ? 1 : 0.55;
      g.beginPath();
      g.moveTo(px, isMajor ? 4 : RULER - 6);
      g.lineTo(px, L.height);
      g.stroke();
      g.globalAlpha = 1;
      if (isMajor) {
        g.fillStyle = c.text3;
        g.fillText(inFrames ? `f${Math.round(tt * 60)}` : `${Number(tt.toFixed(2))}s`, px + 4, 10);
      }
    }
    g.restore();
    g.strokeStyle = c.strong;
    g.beginPath();
    g.moveTo(0, RULER + 0.5);
    g.lineTo(width, RULER + 0.5);
    g.stroke();

    // Lanes.
    // The current node and any picked with it (Ctrl-click) are outlined.
    const sel = { branch: S.branch.peek(), picked: new Set([S.nodeIndex.peek(), ...S.nodeSelection.peek()]) };
    const hitBoxes = [];
    // Frame cells: bars are cut at every frame once a frame is 2.5px wide.
    const cells = pxPer(1 / 60) >= 2.5;
    const f0 = Math.floor(L.t0 * 60);
    const f1 = Math.ceil(L.t1 * 60);
    g.font = `500 11px ${css('--font-ui')}`;
    for (const lane of L.lanes) {
      g.fillStyle = lane.who === 'user' ? c.you : c.dummy;
      g.fillRect(12, lane.y + lane.height / 2 - 3, 6, 6);
      g.fillStyle = c.text2;
      g.fillText(lane.label, 24, lane.y + lane.height / 2 + 0.5);
      clip();
      for (const { e, track } of lane.packed) {
        const x0 = L.x(e.t);
        const x1 = Math.max(x0 + 3, L.x(Math.min(e.end, L.span)));
        if (x1 < GUTTER - 4 || x0 > GUTTER + L.inner + 4) continue;
        const y0 = lane.y + PAD + track * (BAR + GAP);
        g.fillStyle = e.kind === 'STATE' ? `${nodeInfo('STATE').color}` : nodeInfo(e.kind).color;
        g.globalAlpha = e.kind === 'STATE' ? 0.55 : 0.92;
        g.fillRect(x0, y0, x1 - x0, BAR);
        g.globalAlpha = 1;
        if (cells) {
          g.fillStyle = c.panel;
          for (let f = Math.max(f0, Math.ceil(e.t * 60)); f <= Math.min(f1, Math.floor(e.end * 60)); f++) {
            const px = Math.round(L.x(f / 60));
            if (px > x0 + 0.5 && px < x1 - 0.5) g.fillRect(px, y0, 1, BAR);
          }
        }
        if (!e.p && e.branch === sel.branch && sel.picked.has(e.index)) {
          g.strokeStyle = c.select;
          g.lineWidth = 2;
          g.strokeRect(x0 - 1, y0 - 1, x1 - x0 + 2, BAR + 2);
          g.lineWidth = 1;
        }
        hitBoxes.push({ x0, x1, y0: y0 - 1, y1: y0 + BAR + 1, e });
      }
      g.restore();
      g.strokeStyle = c.line;
      g.beginPath();
      g.moveTo(0, lane.y + lane.height + 0.5);
      g.lineTo(width, lane.y + lane.height + 0.5);
      g.stroke();
    }

    // Hits: a red line through both lanes and a mark on the one hit.
    clip();
    for (const e of run.events) {
      if (e.kind !== 'HIT') continue;
      const px = Math.round(L.x(e.t)) + 0.5;
      g.strokeStyle = c.hit;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(px, RULER);
      g.lineTo(px, L.height);
      g.stroke();
      g.globalAlpha = 1;
      const lane = L.lanes.find((l) => l.who === e.who);
      const cy = lane.y + 2;
      g.fillStyle = c.hit;
      g.beginPath();
      g.moveTo(px, cy - 4 + 4);
      g.lineTo(px + 4, cy + 4);
      g.lineTo(px, cy + 8);
      g.lineTo(px - 4, cy + 4);
      g.closePath();
      g.fill();
      hitBoxes.push({ x0: px - 5, x1: px + 5, y0: cy - 1, y1: cy + 9, e });
    }
    g.restore();
    boxes.current = hitBoxes.filter((b) => b.x1 >= GUTTER && b.x0 <= GUTTER + L.inner);
    placeHead();
  }

  function placeHead() {
    const L = layout.current;
    if (!L || !head.current) return;
    const t = S.time.peek();
    // Zoomed in and playing past the edge: the view follows the playhead.
    if (view.current && (t < L.t0 || t > L.t1)) {
      const w = L.t1 - L.t0;
      const t0 = Math.min(Math.max(0, t - w * 0.1), Math.max(0, L.span - w));
      view.current = { t0, t1: t0 + w };
      return draw();
    }
    head.current.style.transform = `translateX(${L.x(t)}px)`;
    head.current.style.height = `${L.height}px`;
    wrap.current?.setAttribute('aria-valuenow', t.toFixed(2));
    wrap.current?.setAttribute('aria-valuetext', `${t.toFixed(2)} seconds, frame ${Math.round(t * 60)}`);
  }

  // A new run starts fitted; redraw on it, a new selection, a theme change or a resize.
  useSignalEffect(() => {
    S.run.value;
    view.current = null;
    setZoomed(false);
  });
  useSignalEffect(() => {
    S.run.value;
    S.branch.value;
    S.nodeIndex.value;
    S.nodeSelection.value;
    theme.value;
    requestAnimationFrame(draw);
  });
  useSignalEffect(() => {
    S.time.value;
    placeHead();
  });
  useEffect(() => {
    const watcher = new ResizeObserver(() => draw());
    watcher.observe(wrap.current);
    return () => watcher.disconnect();
  }, []);

  const at = (ev) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const boxAt = ({ x, y }) => boxes.current.findLast((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 && y <= b.y1);

  const down = (ev) => {
    if (!layout.current) return;
    const el = ev.currentTarget;
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // a synthetic pointer: nothing to capture
    }
    const start = at(ev);
    let moved = false;
    const move = (e2) => {
      const p = at(e2);
      if (Math.abs(p.x - start.x) > 3) moved = true;
      if (moved) S.seek(layout.current.t(p.x));
    };
    const up = (e2) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (moved) return;
      const box = boxAt(at(e2));
      if (box) S.jumpTo({ t: box.e.t, branch: box.e.branch, index: box.e.index });
      else S.seek(layout.current.t(start.x));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const hover = (ev) => {
    const el = tip.current;
    if (!el) return;
    const p = at(ev);
    const box = boxAt(p);
    if (!box) {
      el.hidden = true;
      canvas.current.style.cursor = 'col-resize';
      return;
    }
    canvas.current.style.cursor = 'pointer';
    const e = box.e;
    const { label, detail } =
      e.kind === 'HIT' ? { label: 'HIT', detail: `${e.damage} damage (${e.how})` } : nodeTitle(e.node);
    const frames =
      e.kind === 'HIT'
        ? `f${Math.round(e.t * 60)}`
        : `f${Math.round(e.t * 60)}–${Math.round(e.end * 60)} (${Math.max(1, Math.round((e.end - e.t) * 60))} frames)`;
    el.innerHTML = '';
    const head1 = document.createElement('strong');
    head1.textContent = `${label}${detail ? ` · ${detail}` : ''}`;
    const line2 = document.createElement('span');
    line2.textContent = `${e.t.toFixed(2)}s ${frames} · ${e.branch || 'Default'} #${(e.index ?? 0) + 1}`;
    el.append(head1, line2);
    el.hidden = false;
    const w = wrap.current.clientWidth;
    el.style.left = `${Math.min(Math.max(p.x + 12, 8), w - el.offsetWidth - 8)}px`;
    el.style.top = `${p.y + 14}px`;
  };

  // The wheel zooms around the pointer; Shift+wheel (or a sideways wheel) pans.
  const wheel = (e) => {
    const L = layout.current;
    if (!L) return;
    e.preventDefault();
    const w = L.t1 - L.t0;
    const pan = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    let t0, t1;
    if (pan) {
      const dt = ((e.shiftKey ? e.deltaY : e.deltaX) / L.inner) * w;
      t0 = Math.min(Math.max(0, L.t0 + dt), Math.max(0, L.span - w));
      t1 = t0 + w;
    } else {
      const anchor = L.t(at(e).x);
      const next = Math.min(L.span, Math.max(MIN_VIEW, w * Math.exp(e.deltaY * 0.0015)));
      const k = (anchor - L.t0) / w;
      t0 = Math.min(Math.max(0, anchor - k * next), Math.max(0, L.span - next));
      t1 = t0 + next;
    }
    setView(t1 - t0 >= L.span - 1e-6 ? null : { t0, t1 });
  };

  const key = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      S.stepFrames((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
    } else if (e.key === 'Home') S.seek(0);
    else if (e.key === 'End') S.seek(S.duration.value);
  };

  if (!S.run.value)
    return (
      <div class="meter meter-empty" ref={wrap}>
        <p>Nothing to play: this skill has no program.</p>
      </div>
    );
  return (
    <div
      class="meter"
      ref={wrap}
      role="slider"
      tabIndex={0}
      aria-label="Frame meter: the playhead's time"
      aria-valuemin={0}
      aria-valuemax={Number(S.duration.value.toFixed(2))}
      onKeyDown={key}
    >
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={hover}
        onWheel={wheel}
        onDblClick={() => setView(null)}
        onPointerLeave={() => tip.current && (tip.current.hidden = true)}
      />
      <div class="meter-head" ref={head} aria-hidden="true" />
      {zoomed && (
        <button type="button" class="meter-fit" onClick={() => setView(null)}>
          Fit all
        </button>
      )}
      <div class="meter-tip" ref={tip} hidden />
    </div>
  );
}
