// Hold and drag on any number field to change it, as in Blender: left and
// right, a step every couple of pixels (Shift for fine steps, Ctrl for big
// ones). A click without a drag types in it as before. It works on every
// <input type="number"> in the app (the Skill Builder's fields, the
// animator's keys, the Meter Maker's), by sending the field the same
// input and change events typing would, so each one's own handler runs.

/** How much one step is, for a field with no step of its own: by the size of the number. */
function unitFor(value) {
  const v = Math.abs(value);
  return v < 1 ? 0.01 : v < 10 ? 0.05 : v < 100 ? 0.5 : 1;
}
const decimals = (n) => {
  const s = String(n);
  return s.includes('e-') ? Number(s.split('e-')[1]) : (s.split('.')[1]?.length ?? 0);
};

function down(e) {
  const el = e.target;
  if (e.button !== 0 || !(el instanceof HTMLInputElement) || el.type !== 'number' || el.disabled || el.readOnly) return;
  if (document.activeElement === el) return; // already typing in it: leave the caret alone
  e.preventDefault();
  const start = Number(el.value) || 0;
  const own = Number(el.step);
  const unit = Number.isFinite(own) && own > 0 ? own : unitFor(start);
  const perPx = own >= 1 ? 1 / 4 : 1 / 2; // whole steps go a little slower
  const min = el.min !== '' ? Number(el.min) : -Infinity;
  const max = el.max !== '' ? Number(el.max) : Infinity;
  const places = Math.max(decimals(unit), Number.isInteger(start) && unit >= 1 ? 0 : decimals(el.value));
  const x0 = e.clientX;
  let moved = false;
  let last = el.value;
  const id = e.pointerId;
  try {
    el.setPointerCapture(id);
  } catch {
    // a synthetic pointer: the window's events still come
  }
  const send = (type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const move = (ev) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 3) return;
    if (!moved) {
      moved = true;
      document.documentElement.classList.add('is-scrubbing');
    }
    const scale = ev.shiftKey ? 0.1 : ev.ctrlKey || ev.metaKey ? 10 : 1;
    const raw = start + Math.round(dx * perPx) * unit * scale;
    const v = Math.min(max, Math.max(min, raw));
    const text = String(Number(v.toFixed(Math.min(6, places + (ev.shiftKey ? 1 : 0)))));
    if (text === last) return;
    last = text;
    el.value = text;
    send('input');
    send('change');
  };
  const up = () => {
    removeEventListener('pointermove', move, true);
    removeEventListener('pointerup', up, true);
    removeEventListener('pointercancel', up, true);
    document.documentElement.classList.remove('is-scrubbing');
    try {
      el.releasePointerCapture(id);
    } catch {
      // already released
    }
    if (!moved) {
      el.focus();
      el.select();
    }
  };
  addEventListener('pointermove', move, true);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
}

let on = false;
export function installScrub() {
  if (on) return;
  on = true;
  addEventListener('pointerdown', down, true);
}
