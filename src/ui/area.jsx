// Blender-style areas: rounded editors on a dark ground, each with a header
// strip, separated by thin gutters you drag to resize.
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { useDock } from './dock.jsx';

export function Area({ name, icon, title, tools, children, class: className = '' }) {
  // In the Skills workspace, a panel drags by its header to dock elsewhere,
  // and pops out to float (src/ui/dock.jsx).
  const dock = useDock(name);
  return (
    <section
      class={`area area-${name} ${className} ${dock?.floating ? 'is-floating' : ''}`}
      aria-label={title || name}
      onPointerDownCapture={() => (S.activeArea.value = name)}
      onFocusCapture={() => (S.activeArea.value = name)}
    >
      <header class={`area-head ${dock ? 'is-draggable' : ''}`} onPointerDown={dock?.startDrag}>
        <span class="area-title" title={dock ? 'Drag to dock this panel somewhere else' : undefined}>
          {icon && <Icon name={icon} size={14} />}
          <span class="area-title-text">{title}</span>
        </span>
        {tools}
        {dock && (
          <button
            type="button"
            class="area-float"
            title={dock.floating ? 'Dock this panel again' : 'Float this panel'}
            aria-label={dock.floating ? 'Dock this panel' : 'Float this panel'}
            onClick={dock.toggleFloat}
          >
            <Icon name={dock.floating ? 'minimize-2' : 'maximize-2'} size={12} />
          </button>
        )}
      </header>
      <div class="area-body">{children}</div>
    </section>
  );
}

const LIMITS = {
  left: [240, 560],
  right: [260, 560],
  bottom: [120, 520],
  outliner: [120, 700],
};

/**
 * A gutter handle that resizes one area: `edge` is the key in S.areas,
 * `axis` 'x' or 'y', and `sign` +1 when dragging right/down grows it.
 */
export function Resizer({ edge, axis, sign, class: className = '' }) {
  const set = (value) => {
    const [lo, hi] = LIMITS[edge];
    S.areas.value = { ...S.areas.value, [edge]: Math.round(Math.max(lo, Math.min(hi, value))) };
  };
  const down = (e) => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const from = S.areas.value[edge];
    const move = (ev) => set(from + sign * ((axis === 'x' ? ev.clientX : ev.clientY) - start));
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    document.body.classList.add('is-resizing');
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  const key = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = axis === 'x' ? { ArrowRight: sign, ArrowLeft: -sign } : { ArrowDown: sign, ArrowUp: -sign };
    if (e.key in grow) {
      e.preventDefault();
      set(S.areas.value[edge] + grow[e.key] * step);
    }
  };
  return (
    <div
      class={`resizer resizer-${axis} ${className}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={`Resize the ${edge} area`}
      tabIndex={0}
      onPointerDown={down}
      onKeyDown={key}
    />
  );
}
