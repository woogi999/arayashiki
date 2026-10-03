// The Progress Bar Maker's property controls: a colour with its hex code, a
// picture picker, a paint (a colour, a gradient with stops, or a picture),
// and the slider, switch and choice rows every panel is built from.
import { useState } from 'preact/hooks';
import { Icon } from '../icons.jsx';
import { Switch, TypeValue } from '../ui/controls.jsx';
import { paintCss, sampleStops } from './draw.js';

// ─── Colour ─────────────────────────────────────────────────────────────

function parseHex(hex) {
  const clean = String(hex).trim().replace(/^#/, '');
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toUpperCase()}` : null;
}

/** A swatch (the system colour picker) and an editable hex code. */
export function ColourField({ label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(value).toUpperCase();
  return (
    <span class="colour-field">
      <span class="colour-swatch" style={{ background: value }}>
        <input
          type="color"
          value={value}
          aria-label={`${label} picker`}
          onInput={(e) => {
            setDraft(null);
            onChange(e.currentTarget.value.toUpperCase());
          }}
        />
      </span>
      <input
        type="text"
        class="input colour-hex num"
        value={shown}
        maxLength={7}
        spellcheck={false}
        aria-label={`${label} hex code`}
        onInput={(e) => {
          const hex = parseHex(e.currentTarget.value);
          setDraft(e.currentTarget.value);
          if (hex) onChange(hex);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

// ─── Picture ────────────────────────────────────────────────────────────

/** Picks a picture, kept in the design as a data URL so it travels with it. */
export function ImagePick({ src, label, onPick }) {
  const [error, setError] = useState(null);
  const pick = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError(`${file.name} isn’t a picture`);
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      onPick(reader.result);
    };
    reader.onerror = () => setError(`Couldn’t read ${file.name}`);
    reader.readAsDataURL(file);
  };
  return (
    <div class="pb-image-pick">
      <span class="pb-image-thumb checker" style={src ? { backgroundImage: `url("${src}")` } : undefined}>
        {!src && <Icon name="image" size={15} />}
      </span>
      <label class="btn" title={label}>
        <Icon name="upload" size={13} />
        <span>{src ? 'Change picture' : 'Choose a picture'}</span>
        <input type="file" accept="image/*" class="sr-only" onChange={pick} />
      </label>
      {src && (
        <button type="button" class="icon-btn" title="Remove the picture" aria-label="Remove the picture" onClick={() => onPick(null)}>
          <Icon name="x" size={13} />
        </button>
      )}
      {error && <p class="error">{error}</p>}
    </div>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────

/** Label, track and value on one line; the value has a fixed width. */
export function Slider({ label, min, max, step = 1, value, unit = '', onInput }) {
  // A typed value goes through the same handler as the slider, as if the
  // slider had moved there (handlers read the event's value and type).
  const typed = (n) => onInput({ currentTarget: { type: 'range', value: String(n) } });
  return (
    <div class="pb-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onInput={onInput} />
      <TypeValue class="num" value={value} unit={unit} label={label} min={min} max={max} onSet={typed} />
    </div>
  );
}

export function Check({ label, checked, onChange }) {
  return (
    <label class="pb-check">
      <input type="checkbox" checked={Boolean(checked)} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

/** Joined buttons: for a few short choices. */
export function Picks({ title, label, options, value, onPick }) {
  return (
    <div class="pb-row">
      {title && <span class="pb-row-label">{title}</span>}
      <div class="segmented" role="group" aria-label={title ?? label}>
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            aria-pressed={value === o.id}
            title={o.title}
            aria-label={o.icon ? o.title : undefined}
            onClick={() => onPick(o.id)}
          >
            {o.icon ? <Icon name={o.icon} size={13} /> : o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Pills that wrap: for longer lists. */
export function Chips({ label, options, value, onPick }) {
  return (
    <div class="pb-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.id} class="chip" aria-pressed={value === o.id} title={o.title} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Num({ label, value, onChange }) {
  return (
    <label class="pb-num">
      <span>{label}</span>
      <input type="number" class="input num" value={value} onChange={onChange} />
    </label>
  );
}

export function Group({ title, children }) {
  return (
    <section class="pb-group">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/** An effect with its own switch; its settings fold away while it's off. */
export function Fx({ title, on, onToggle, hint, children }) {
  return (
    <section class={`pb-group pb-fx ${on ? 'is-on' : ''}`}>
      <label class="pb-fx-head">
        <h4>{title}</h4>
        <Switch checked={Boolean(on)} label={title} onChange={onToggle} />
      </label>
      {on ? children : hint && <p class="hint">{hint}</p>}
    </section>
  );
}

export function ColourAlpha({ label, color, alpha, onColour, onAlpha }) {
  return (
    <div class="pb-stop">
      <ColourField label={label} value={color} onChange={onColour} />
      <span class="pb-mini" title="Opacity">
        <span>α</span>
        <input type="range" min="0" max="100" value={alpha} aria-label={`${label} opacity`} onInput={onAlpha} />
      </span>
    </div>
  );
}

// ─── Paint ──────────────────────────────────────────────────────────────

const TYPES = [
  { id: 'solid', label: 'Solid' },
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
  { id: 'conic', label: 'Conic' },
  { id: 'image', label: 'Picture' },
];

const FITS = [
  { id: 'cover', label: 'Cover', title: 'Fills the area, cropping what spills over' },
  { id: 'contain', label: 'Fit', title: 'The whole picture, inside the area' },
  { id: 'stretch', label: 'Stretch', title: 'Squashed or stretched to the area' },
  { id: 'tile', label: 'Tile', title: 'Repeated at a set size' },
];

const MAPS = [
  { id: 'bar', label: 'Across the bar' },
  { id: 'segment', label: 'In each segment' },
];

// "rgba(r,g,b,a)" back to a hex code, for a new stop picked off the gradient.
function toHex(css) {
  const [r, g, b] = css.match(/[\d.]+/g).map(Number);
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * A fill: one colour, a linear, radial or conic gradient with as many stops
 * as you like (each with its own opacity), or a picture. `segments` offers
 * laying a picture into each segment rather than across the whole bar.
 */
export function PaintField({ label, paint, path, onSet, segments }) {
  const put = (key, value) => onSet(`${path}.${key}`, value);
  const stops = paint.stops;
  const num = (e) => Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0));
  const addStop = () => {
    // A new stop goes in the widest gap, in the colour the gradient already has there.
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    let at = 50;
    let widest = -1;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].pos - sorted[i - 1].pos;
      if (gap > widest) {
        widest = gap;
        at = Math.round(sorted[i - 1].pos + gap / 2);
      }
    }
    const colour = sampleStops(stops, at);
    const alpha = Math.round(Number(colour.match(/[\d.]+/g)[3]) * 100);
    put('stops', [...stops, { pos: at, color: toHex(colour), alpha }]);
  };
  return (
    <div class="pb-paint">
      <div class="pb-paint-head">
        <span>{label}</span>
        <span class="pb-paint-preview checker">
          <span style={{ background: paintCss(paint) }} />
        </span>
      </div>
      <div class="segmented pb-wrap" role="group" aria-label={`${label} type`}>
        {TYPES.map((t) => (
          <button type="button" key={t.id} aria-pressed={paint.type === t.id} onClick={() => put('type', t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {paint.type === 'image' ? (
        <>
          <ImagePick src={paint.src} label={`${label} picture`} onPick={(src) => put('src', src)} />
          <div class="segmented" role="group" aria-label={`${label} fit`}>
            {FITS.map((f) => (
              <button type="button" key={f.id} aria-pressed={(paint.fit ?? 'cover') === f.id} title={f.title} onClick={() => put('fit', f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {(paint.fit ?? 'cover') === 'tile' && (
            <Slider
              label="Size"
              min="5"
              max="400"
              unit="%"
              value={paint.scale ?? 100}
              onInput={(e) => put('scale', Math.max(1, Number(e.currentTarget.value) || 100))}
            />
          )}
          {segments && (
            <div class="segmented" role="group" aria-label={`${label} placement`}>
              {MAPS.map((m) => (
                <button type="button" key={m.id} aria-pressed={(paint.map ?? 'bar') === m.id} onClick={() => put('map', m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : paint.type === 'solid' ? (
        // A solid colour is the first stop; keeping the rest in step means
        // turning it back into a gradient doesn't bring back an old colour.
        <ColourAlpha
          label={`${label} colour`}
          color={stops[0].color}
          alpha={stops[0].alpha}
          onColour={(hex) => put('stops', stops.map((s) => ({ ...s, color: hex })))}
          onAlpha={(e) => put('stops', stops.map((s) => ({ ...s, alpha: num(e) })))}
        />
      ) : (
        <>
          {['linear', 'conic'].includes(paint.type) && (
            <Slider
              label="Angle"
              min="0"
              max="360"
              unit="°"
              value={paint.angle}
              onInput={(e) => put('angle', Number(e.currentTarget.value) || 0)}
            />
          )}
          {stops.map((s, i) => (
            <div class="pb-stop" key={i}>
              <ColourField label={`${label} stop ${i}`} value={s.color} onChange={(hex) => put(`stops.${i}.color`, hex)} />
              <input
                type="number"
                min="0"
                max="100"
                class="input num pb-pos"
                title="Position along the gradient (%)"
                value={s.pos}
                aria-label={`${label} stop ${i} position`}
                onChange={(e) => put(`stops.${i}.pos`, num(e))}
              />
              <span class="pb-mini" title="Opacity">
                <span>α</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={s.alpha}
                  aria-label={`${label} stop ${i} opacity`}
                  onInput={(e) => put(`stops.${i}.alpha`, num(e))}
                />
              </span>
              <button
                type="button"
                class="icon-btn"
                title="Remove this stop"
                aria-label="Remove stop"
                disabled={stops.length <= 2}
                onClick={() => put('stops', stops.filter((_, j) => j !== i))}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          <button type="button" class="btn" onClick={addStop}>
            <Icon name="plus" size={13} />
            <span>Add colour stop</span>
          </button>
        </>
      )}
    </div>
  );
}
