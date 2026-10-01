// What the two keyframe editors share (the skill animator and the export
// camera path): a panel that floats over the window, dragged by its header
// and resized from its corner, kept where it was left; number fields; and
// the easing picker.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons.jsx';
import { IconButton } from './controls.jsx';

const r3 = (v) => Math.round(v * 1000) / 1000;

function loadBox(id, fallback) {
  try {
    const b = JSON.parse(localStorage.getItem(`arayashiki-panel-${id}`) ?? 'null');
    if (b && [b.x, b.y, b.w, b.h].every(Number.isFinite)) return b;
  } catch {
    // none kept
  }
  return fallback;
}

const fit = (b) => ({
  w: Math.min(Math.max(360, b.w), innerWidth - 16),
  h: Math.min(Math.max(220, b.h), innerHeight - 60),
  x: Math.min(Math.max(8, b.x), innerWidth - 120),
  y: Math.min(Math.max(32, b.y), innerHeight - 60),
});

/** A floating tool window: drag its header to move it, its corner to size it. */
export function FloatingPanel({ id, title, icon, badge, onClose, children, actions, width = 620, height = 520 }) {
  const [box, setBox] = useState(() => fit(loadBox(id, { x: innerWidth - width - 18, y: innerHeight - height - 40, w: width, h: height })));
  const live = useRef(box);
  live.current = box;
  useEffect(() => {
    try {
      localStorage.setItem(`arayashiki-panel-${id}`, JSON.stringify(box));
    } catch {
      // not kept
    }
  }, [box]);
  useEffect(() => {
    const onResize = () => setBox((b) => fit(b));
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  const drag = (e, mode) => {
    if (e.button !== 0) return;
    if (mode === 'move' && e.target.closest('button, input, select, textarea, a, label')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, b: live.current };
    document.body.classList.add(mode === 'move' ? 'is-moving' : 'is-resizing');
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const b = start.b;
      setBox(fit(mode === 'move' ? { ...b, x: b.x + dx, y: b.y + dy } : { ...b, w: b.w + dx, h: b.h + dy }));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.classList.remove('is-moving', 'is-resizing');
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return (
    <aside
      class="floating"
      aria-label={title}
      style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }}
    >
      <header class="floating-head" onPointerDown={(e) => drag(e, 'move')} title="Drag to move">
        {icon && <Icon name={icon} size={14} />}
        <strong>{title}</strong>
        {badge && <span class="floating-badge num">{badge}</span>}
        <span class="spacer" />
        {actions}
        <IconButton icon="x" label="Close" size={13} onClick={onClose} />
      </header>
      <div class="floating-body">{children}</div>
      <div class="floating-size" onPointerDown={(e) => drag(e, 'size')} aria-hidden="true" />
    </aside>
  );
}

/** A number field that commits on change (Enter or leaving it), and steps with the arrows. */
export function Num({ value, onChange, step = 0.1, label, width = 56, min, max }) {
  return (
    <input
      type="number"
      class="input key-num num"
      style={{ width: `${width}px` }}
      aria-label={label}
      title={label}
      step={step}
      min={min}
      max={max}
      value={r3(value)}
      onChange={(e) => {
        const v = Number(e.currentTarget.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

/** x, y, z as three number fields. */
export function Vec({ value, onChange, label, step, labels = ['x', 'y', 'z'] }) {
  return (
    <span class="key-vec">
      {labels.map((axis, i) => (
        <Num key={axis} label={`${label} ${axis}`} step={step} value={value[i]} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
      ))}
    </span>
  );
}

export const EASE_STYLES = ['Linear', 'Sine', 'Quad', 'Cubic', 'Quart', 'Quint', 'Exponential', 'Circular', 'Back', 'Bounce', 'Elastic'];
export const EASE_DIRECTIONS = ['In', 'Out', 'InOut'];

/** An easing ("Quad Out"), as two small menus. */
export function EaseSelect({ value = 'Linear In', onChange, label = 'Easing to the next key' }) {
  const [style, direction = 'InOut'] = String(value).split(' ');
  return (
    <span class="key-ease" title={label}>
      <select class="input" aria-label={`${label}: style`} value={style} onChange={(e) => onChange(`${e.currentTarget.value} ${direction}`)}>
        {EASE_STYLES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select class="input" aria-label={`${label}: direction`} value={direction} disabled={style === 'Linear'} onChange={(e) => onChange(`${style} ${e.currentTarget.value}`)}>
        {EASE_DIRECTIONS.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
    </span>
  );
}

/** The shake settings both editors use: presets and the numbers. */
export function ShakeFields({ shake, onChange, end }) {
  const sh = shake ?? { amount: 0, turn: 0, freq: 14, from: 0, to: end, decay: true };
  const set = (patch) => onChange({ ...sh, ...patch });
  const presets = [
    ['None', 0, 0],
    ['Light', 0.12, 0.6],
    ['Medium', 0.3, 1.4],
    ['Heavy', 0.6, 2.8],
  ];
  return (
    <div class="key-shake">
      <div class="key-shake-presets" role="group" aria-label="Shake">
        {presets.map(([label, amount, turn]) => (
          <button key={label} type="button" class="chip" aria-pressed={(sh.amount ?? 0) === amount && (sh.turn ?? 0) === turn} onClick={() => set({ amount, turn, to: sh.to ?? end })}>
            {label}
          </button>
        ))}
      </div>
      <div class="key-grid">
        <label>Strength (studs)</label>
        <Num label="Shake strength in studs" step={0.05} min={0} value={sh.amount ?? 0} onChange={(v) => set({ amount: Math.max(0, v) })} />
        <label>Turn (degrees)</label>
        <Num label="Shake turn in degrees" step={0.2} min={0} value={sh.turn ?? 0} onChange={(v) => set({ turn: Math.max(0, v) })} />
        <label>From (s)</label>
        <Num label="Shake from" step={0.05} min={0} value={sh.from ?? 0} onChange={(v) => set({ from: Math.max(0, v) })} />
        <label>To (s)</label>
        <Num label="Shake to" step={0.05} min={0} value={sh.to ?? end} onChange={(v) => set({ to: Math.max(0, v) })} />
        <label>Shakes a second</label>
        <Num label="Shake speed" step={1} min={1} value={sh.freq ?? 14} onChange={(v) => set({ freq: Math.max(1, Math.min(30, v)) })} />
        <label>Fade out</label>
        <input type="checkbox" checked={sh.decay !== false} onChange={(e) => set({ decay: e.currentTarget.checked })} aria-label="Fade the shake out" />
      </div>
    </div>
  );
}
