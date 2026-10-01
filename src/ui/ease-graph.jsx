// The animator's graph editor (src/ui/animator.jsx, "Graph"): how each
// stretch between keys eases, as a curve of how far along it is (up) over
// its time (across), the way Blender's and After Effects' graph editors
// draw it. Pick a stretch in the strip along the top; drag the two handles
// of its curve to shape it, or pick one of JJS's easings. A shape that isn't
// one of JJS's easings is a custom curve: it's written as a few blocks of
// JJS's own easings that follow it, and for a camera the dashed line shows
// those blocks as JJS will run them.
import { useRef } from 'preact/hooks';
import { bezierEase, cameraAt, cameraLegs, EASINGS, isCustom } from '../animator.js';
import { tweenAt } from '../fx/roblox.js';
import { Button } from './controls.jsx';
import { EaseSelect, Num } from './keys-ui.jsx';

// JJS's easings as near as a cubic Bézier gets (easings.net's), for a
// custom curve to start from. Bounce and Elastic have none: they start eased in and out.
const NEAR = {
  'Linear In': [0, 0, 1, 1],
  'Sine In': [0.12, 0, 0.39, 0],
  'Sine Out': [0.61, 1, 0.88, 1],
  'Sine InOut': [0.37, 0, 0.63, 1],
  'Quad In': [0.11, 0, 0.5, 0],
  'Quad Out': [0.5, 1, 0.89, 1],
  'Quad InOut': [0.45, 0, 0.55, 1],
  'Cubic In': [0.32, 0, 0.67, 0],
  'Cubic Out': [0.33, 1, 0.68, 1],
  'Cubic InOut': [0.65, 0, 0.35, 1],
  'Quart In': [0.5, 0, 0.75, 0],
  'Quart Out': [0.25, 1, 0.5, 1],
  'Quart InOut': [0.76, 0, 0.24, 1],
  'Quint In': [0.64, 0, 0.78, 0],
  'Quint Out': [0.22, 1, 0.36, 1],
  'Quint InOut': [0.83, 0, 0.17, 1],
  'Exponential In': [0.7, 0, 0.84, 0],
  'Exponential Out': [0.16, 1, 0.3, 1],
  'Exponential InOut': [0.87, 0, 0.13, 1],
  'Circular In': [0.55, 0, 1, 0.45],
  'Circular Out': [0, 0.55, 0.45, 1],
  'Circular InOut': [0.85, 0, 0.15, 1],
  'Back In': [0.36, 0, 0.66, -0.56],
  'Back Out': [0.34, 1.56, 0.64, 1],
  'Back InOut': [0.68, -0.6, 0.32, 1.6],
};
export const nearCurve = (ease) => [
  ...(NEAR[ease] ?? NEAR[String(ease).replace(/ .*/, ' InOut')] ?? [0.42, 0, 0.58, 1]),
];

/** How far along a stretch is at u (0…1), by a key's easing. */
export function progressOf(k, u) {
  if (isCustom(k)) return bezierEase(k.curve, u);
  const [style, direction] = String(k.ease ?? 'Linear In').split(' ');
  return tweenAt(u, 1, style || 'Linear', direction || 'In');
}

/** JJS's easing closest to a custom curve (so the stretch is one block again). */
export function nearestEasing(curve) {
  let best = null;
  for (const style of EASINGS)
    for (const direction of style === 'Linear' ? ['In'] : ['In', 'Out', 'InOut']) {
      let err = 0;
      for (let j = 1; j < 32; j++)
        err = Math.max(err, Math.abs(tweenAt(j / 32, 1, style, direction) - bezierEase(curve, j / 32)));
      if (!best || err < best.err) best = { ease: `${style} ${direction}`, err };
    }
  return best;
}

const W = 440;
const H = 250;
const PAD = 26;
const Y0 = -0.5; // room under 0 and over 1 for Back and Elastic
const Y1 = 1.5;
const sx = (u) => PAD + u * (W - PAD * 2);
const sy = (v) => H - PAD - ((v - Y0) / (Y1 - Y0)) * (H - PAD * 2);
const fromScreen = (x, y) => [(x - PAD) / (W - PAD * 2), Y0 + ((H - PAD - y) / (H - PAD * 2)) * (Y1 - Y0)];
const path = (pts) => pts.map(([u, v], i) => `${i ? 'L' : 'M'}${sx(u).toFixed(1)},${sy(v).toFixed(1)}`).join('');

/** For a camera: the stretch as JJS's blocks run it, as progress along it, and where blocks begin. */
function asRun(a, i) {
  const A = a.keys[i];
  const B = a.keys[i + 1];
  const span = B.t - A.t;
  const d = B.pos.map((v, j) => v - A.pos[j]);
  const len2 = d.reduce((s, v) => s + v * v, 0);
  const turn = (p) => Math.hypot(...p.rot.map((r, j) => r - A.rot[j]));
  const whole = Math.hypot(...B.rot.map((r, j) => r - A.rot[j]));
  if (len2 < 1e-4 && whole < 0.01) return null;
  const pts = [];
  for (let j = 0; j <= 64; j++) {
    const p = cameraAt(a, A.t + (span * j) / 64);
    if (!p) continue;
    const v = len2 >= 1e-4 ? p.pos.reduce((s, x, k) => s + (x - A.pos[k]) * d[k], 0) / len2 : turn(p) / whole;
    pts.push([j / 64, v]);
  }
  const cuts = cameraLegs(a)
    .filter((l) => l.from.t > A.t + 1e-6 && l.from.t < B.t - 1e-6)
    .map((l) => (l.from.t - A.t) / span);
  const blocks = cameraLegs(a).filter((l) => l.from.t >= A.t - 1e-6 && l.to.t <= B.t + 1e-6).length;
  return { pts, cuts, blocks };
}

export function EaseGraph({ a, picked, onPick, onKey }) {
  const svg = useRef(null);
  const last = a.keys.length - 1;
  const i = Math.min(picked, last - 1);
  const k = a.keys[i];
  const next = a.keys[i + 1];
  const custom = isCustom(k);
  const curve = custom ? (k.curve ?? nearCurve('Sine InOut')) : nearCurve(k.ease);
  const camera = a.effect === 'Camera';
  const run = camera && next && !next.cut ? asRun(a, i) : null;
  const total = Math.max(1e-6, a.keys[last].t - a.keys[0].t);

  const drag = (which) => (e) => {
    e.preventDefault();
    const el = svg.current;
    el.setPointerCapture(e.pointerId);
    const start = custom ? curve : nearCurve(k.ease);
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      const [u, v] = fromScreen(((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H);
      const c = [...start];
      c[which * 2] = Math.round(Math.min(1, Math.max(0, u)) * 100) / 100;
      c[which * 2 + 1] = Math.round(Math.min(2, Math.max(-1, v)) * 100) / 100;
      start.splice(0, 4, ...c);
      onKey(i, { ease: 'Custom', curve: c });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  if (!next) return <p class="hint">An animation needs two keys at least.</p>;
  const pts = Array.from({ length: 97 }, (_, j) => [j / 96, progressOf(k, j / 96)]);
  const handles = [
    [0, 0, curve[0], curve[1]],
    [1, 1, curve[2], curve[3]],
  ];
  const nearest = custom ? nearestEasing(curve) : null;
  return (
    <div class="eg">
      <div class="eg-strip" role="tablist" aria-label="Stretches between keys">
        {a.keys.slice(0, -1).map((K, j) => {
          const N = a.keys[j + 1];
          const w = Math.max(6, ((N.t - K.t) / total) * 100);
          const mini = Array.from({ length: 25 }, (_, n) => [n / 24, N.cut ? 0 : progressOf(K, n / 24)]);
          return (
            <button
              type="button"
              key={j}
              role="tab"
              aria-selected={j === i}
              class="eg-stretch"
              style={{ flexGrow: w }}
              title={`Key ${j + 1} → ${j + 2}: ${N.cut ? 'holds, then cuts' : isCustom(K) ? 'custom curve' : K.ease}`}
              onClick={() => onPick(j)}
            >
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d={mini.map(([u, v], n) => `${n ? 'L' : 'M'}${u * 100},${36 - v * 32}`).join('')}
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <span class="num">
                {j + 1}→{j + 2}
              </span>
            </button>
          );
        })}
      </div>

      <svg
        ref={svg}
        class="eg-plot"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Easing from key ${i + 1} to ${i + 2}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((u) => (
          <line key={`x${u}`} class="eg-grid" x1={sx(u)} x2={sx(u)} y1={sy(Y0)} y2={sy(Y1)} />
        ))}
        {[0, 1].map((v) => (
          <line key={`y${v}`} class="eg-axis" x1={sx(0)} x2={sx(1)} y1={sy(v)} y2={sy(v)} />
        ))}
        <text class="eg-label" x={sx(0) - 4} y={sy(0) + 4} text-anchor="end">
          {i + 1}
        </text>
        <text class="eg-label" x={sx(0) - 4} y={sy(1) + 4} text-anchor="end">
          {i + 2}
        </text>
        <text class="eg-label" x={sx(1)} y={H - 6} text-anchor="end">
          {(next.t - k.t).toFixed(2)}s
        </text>
        {run?.cuts.map((u) => (
          <line key={`c${u}`} class="eg-cut" x1={sx(u)} x2={sx(u)} y1={sy(Y0)} y2={sy(Y1)} />
        ))}
        {run && <path class="eg-run" d={path(run.pts)} />}
        <path class="eg-curve" d={path(pts)} />
        {handles.map(([u0, v0, u, v], n) => (
          <g key={n} class={`eg-handle ${custom ? '' : 'is-preset'}`}>
            <line x1={sx(u0)} y1={sy(v0)} x2={sx(u)} y2={sy(v)} />
            <circle cx={sx(u)} cy={sy(v)} r={6} onPointerDown={drag(n)} />
          </g>
        ))}
      </svg>

      <div class="eg-controls">
        <span class="hint">
          Key {i + 1} → {i + 2}:
        </span>
        {next.cut ? (
          <span class="hint">the next key is a jump cut: this one holds until it.</span>
        ) : (
          <>
            <EaseSelect value={custom ? 'Custom InOut' : k.ease} onChange={(ease) => onKey(i, { ease })} />
            {custom && (
              <span class="eg-nums" aria-label="Curve handles">
                {['x1', 'y1', 'x2', 'y2'].map((name, n) => (
                  <Num
                    key={name}
                    label={`Custom curve ${name}`}
                    step={0.01}
                    width={50}
                    min={n % 2 ? -1 : 0}
                    max={n % 2 ? 2 : 1}
                    value={curve[n]}
                    onChange={(v) => onKey(i, { ease: 'Custom', curve: curve.map((c, m) => (m === n ? v : c)) })}
                  />
                ))}
              </span>
            )}
            {custom && nearest && (
              <Button
                variant="ghost"
                onClick={() => onKey(i, { ease: nearest.ease, curve: undefined })}
                title="JJS’s own easing nearest this curve: the stretch is a single block again"
              >
                Nearest JJS easing ({nearest.ease})
              </Button>
            )}
          </>
        )}
      </div>
      <p class="hint">
        Drag the white handles to shape the curve: up is how far along the stretch it is, across is its time.{' '}
        {custom
          ? 'A custom curve isn’t one of JJS’s easings, so it’s written as a few blocks of JJS’s own easings that follow it.'
          : 'Dragging a handle makes it a custom curve.'}
        {run
          ? ` The dashed line is what JJS will run: ${run.blocks} Camera block${run.blocks === 1 ? '' : 's'} here.`
          : ''}
      </p>
    </div>
  );
}
