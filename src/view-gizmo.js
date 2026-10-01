// The navigation gizmo in the Viewport's top-right corner, as in Blender:
// the world's axes as the camera sees them, X red, Y green, Z blue, the
// negative ends paler and unlabelled. Click an end to look along that axis
// at what's in front of you; drag the gizmo to turn the view around it.
// (Y is up, as in Roblox.)

import { Vector3 } from 'three';

const SIZE = 84;
const R = 30; // from the middle to an axis end
const BALL = 8;
const AXES = [
  { label: 'X', dir: [1, 0, 0], color: '#ff3352' },
  { label: 'Y', dir: [0, 1, 0], color: '#8bdc00' },
  { label: 'Z', dir: [0, 0, 1], color: '#2890ff' },
];

export function mountGizmo(host, controls) {
  const canvas = document.createElement('canvas');
  canvas.className = 'view-gizmo';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'View axes: click an axis to look along it, drag to turn the view');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = SIZE * ratio;
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  let ends = [];
  let hover = null;
  let drag = null;

  function draw() {
    const q = controls.camera.quaternion.clone().invert();
    const c = SIZE / 2;
    ends = [];
    for (const a of AXES)
      for (const sign of [1, -1]) {
        const v = new Vector3(...a.dir).multiplyScalar(sign).applyQuaternion(q);
        ends.push({ ...a, sign, x: c + v.x * R, y: c - v.y * R, z: v.z });
      }
    ends.sort((p, n) => p.z - n.z); // the far ends first
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (hover || drag) {
      ctx.fillStyle = 'rgb(255 255 255 / 8%)';
      ctx.beginPath();
      ctx.arc(c, c, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of ends) {
      if (e.sign > 0) {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
      const lit = hover === e;
      ctx.beginPath();
      ctx.arc(e.x, e.y, BALL, 0, Math.PI * 2);
      if (e.sign > 0) {
        ctx.fillStyle = e.color;
        ctx.fill();
        ctx.fillStyle = '#101010';
        ctx.font = "600 10px 'IBM Plex Sans', system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.label, e.x, e.y + 0.5);
      } else {
        ctx.fillStyle = `${e.color}40`;
        ctx.fill();
        ctx.strokeStyle = `${e.color}b0`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (lit) {
          ctx.fillStyle = '#fff';
          ctx.font = "600 9px 'IBM Plex Sans', system-ui, sans-serif";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`-${e.label}`, e.x, e.y + 0.5);
        }
      }
      if (lit) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, BALL + 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  const at = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  // The nearest end under the pointer (the front one, where two overlap).
  const endAt = (p) =>
    [...ends].reverse().find((e) => Math.hypot(e.x - p.x, e.y - p.y) <= BALL + 2) ?? null;

  const handlers = {
    pointermove(ev) {
      const p = at(ev);
      if (drag) {
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        drag.travel += Math.abs(dx) + Math.abs(dy);
        drag.x = p.x;
        drag.y = p.y;
        // A click wobbles a pixel or two; past that it's a drag.
        if (drag.travel > 3) {
          drag.moved = true;
          controls.orbit(dx, dy);
        }
        return;
      }
      const next = endAt(p);
      if (next !== hover) {
        hover = next;
        canvas.style.cursor = hover ? 'pointer' : 'grab';
        draw();
      }
    },
    pointerdown(ev) {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // unknown pointer: fine without capture
      }
      const p = at(ev);
      drag = { x: p.x, y: p.y, travel: 0, moved: false, end: endAt(p) };
      canvas.style.cursor = 'grabbing';
    },
    pointerup(ev) {
      if (!drag) return;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        // already released
      }
      const { moved, end } = drag;
      drag = null;
      canvas.style.cursor = 'grab';
      if (!moved && end) controls.snapTo(end.dir.map((v) => v * end.sign));
      draw();
    },
    pointerleave() {
      if (drag) return;
      hover = null;
      draw();
    },
    contextmenu(ev) {
      ev.preventDefault();
    },
  };
  for (const [name, fn] of Object.entries(handlers)) canvas.addEventListener(name, fn);
  canvas.style.cursor = 'grab';

  return {
    draw,
    dispose() {
      for (const [name, fn] of Object.entries(handlers)) canvas.removeEventListener(name, fn);
      canvas.remove();
    },
  };
}
