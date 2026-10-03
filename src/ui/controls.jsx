// The small controls every panel shares, so a button, a toggle or a
// segmented choice looks and behaves the same everywhere.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons.jsx';

export function IconButton({ icon, label, size = 16, class: className = '', title, ...rest }) {
  return (
    <button type="button" class={`icon-btn ${className}`} aria-label={label} title={title ?? label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Button({ icon, children, variant = 'default', class: className = '', ...rest }) {
  return (
    <button type="button" class={`btn btn-${variant} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={15} />}
      {children && <span>{children}</span>}
    </button>
  );
}

/** One choice out of a few, as a row of pressed / unpressed buttons. */
export function Segmented({ label, options, value, onChange, class: className = '' }) {
  return (
    <div class={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.id} aria-pressed={o.id === value} title={o.title} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A checkbox drawn as a pill that lights up when on. */
export function Toggle({ checked, onChange, children, title, class: className = '' }) {
  return (
    <label class={`toggle ${className}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="toggle-mark" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

/** An on/off switch for a field value. */
export function Switch({ checked, onChange, id, label }) {
  return (
    <span class="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span class="switch-track" aria-hidden="true" />
    </span>
  );
}

/** A native modal dialog: focus stays inside, Escape and the backdrop close it. */
export function Modal({ title, onClose, children, class: className = '', actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    // The browser focuses the first button (the close button) and rings it:
    // focus the dialog itself instead, unless a field asked for the focus.
    if (document.activeElement?.closest?.('.modal-head')) el.focus();
    return () => el.open && el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      class={`modal ${className}`}
      aria-label={title}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click outside the dialog doesn't close it (it's easy to lose work
      // that way): Esc and the × do.
    >
      <header class="modal-head">
        <h2>{title}</h2>
        {actions}
        <IconButton icon="x" label="Close" onClick={onClose} />
      </header>
      <div class="modal-body">{children}</div>
    </dialog>
  );
}

/** A small coloured square with a node kind's (or a category's) icon. */
export function KindChip({ color, icon, size = 13 }) {
  return (
    <span class="kind-chip" style={{ '--kind': color }} aria-hidden="true">
      <Icon name={icon} size={size} />
    </span>
  );
}

/**
 * A slider's value that you can click to type, as in Blender or Photoshop:
 * Enter or leaving the field sets it, Esc puts it back. A typed number may go
 * past the slider's ends (the slider only covers the usual range).
 */
export function TypeValue({ value, unit = '', onSet, label, min, max, class: className = '' }) {
  const [draft, setDraft] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    if (draft !== null) input.current?.select();
  }, [draft !== null]);
  const commit = () => {
    if (draft === null) return;
    const n = Number(String(draft).replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(n) && n !== Number(value)) onSet(n);
  };
  if (draft !== null)
    return (
      <input
        ref={input}
        class={`input num type-value is-editing ${className}`}
        aria-label={label}
        value={draft}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setDraft(null);
        }}
      />
    );
  const shown = typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value;
  return (
    <button
      type="button"
      class={`type-value ${className}`}
      title={`Click to type a value${min != null && max != null ? ` (the slider goes ${min} to ${max})` : ''}`}
      aria-label={`${label ?? 'Value'}: ${shown}${unit}. Click to type`}
      onClick={() => setDraft(String(shown))}
    >
      {shown}
      {unit}
    </button>
  );
}

/** A range slider with its value beside it, typed by clicking it. */
export function RangeValue({ min, max, step = 1, value, unit = '', onChange, label }) {
  return (
    <span class="range-value">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onInput={(e) => onChange(Number(e.currentTarget.value))} />
      <TypeValue value={value} unit={unit} label={label} min={min} max={max} onSet={onChange} />
    </span>
  );
}
