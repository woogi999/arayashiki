// The 3D Viewport's camera, driven the way Roblox Studio's is:
//
//   right-drag            turn the camera where it stands (look around); the
//                         cursor is hidden and stays where it was
//   middle-drag           pan
//   wheel                 move toward (or away from) what's under the cursor
//   W A S D, Q E          fly: forward, left, back, right, down, up
//                         (while the pointer is over the view); Shift slows
//   F                     frame the character (`onFocus` says where)
//   (the keys are rebindable: src/keybinds.js, the 'view' actions)
//
// Nothing is anchored and nothing is clamped: the camera goes wherever it's
// flown, as close or as far as you like. The only limit is that it can't
// look past straight up or down, as in Studio.
//
// `pivotDistance` is how far ahead the camera is looking at: the point it
// turns about when snapped to an axis or dragged by the axis gizmo, and the
// scale that pan and zoom steps follow, so they feel the same near and far.

import { Euler, Quaternion, Vector2, Vector3 } from 'three';
import { isDesktop, warpCursor } from './platform.js';
import { flyActionOf } from './keybinds.js';

const LOOK = 0.0045; // radians per pixel
const FLY = 26; // studs a second
const SLOW = 0.25; // with Shift
const LIMIT = Math.PI / 2 - 0.001;
const KEYS = {
  flyForward: [0, 0, -1],
  flyBack: [0, 0, 1],
  flyLeft: [-1, 0, 0],
  flyRight: [1, 0, 0],
  flyDown: [0, -1, 0],
  flyUp: [0, 1, 0],
};
const isTyping = (el) => el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);

export class StudioCamera {
  constructor(camera, dom, { onChange = () => {}, onFocus = () => null } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.onChange = onChange;
    this.onFocus = onFocus;
    this.yaw = 0;
    this.pitch = 0;
    this.pivotDistance = 16;
    this.drag = null;
    this.held = new Set();
    this.hover = false;
    this.last = 0;
    this.frame = 0;
    this.listen();
  }

  // ─── Where it looks ────────────────────────────────────────────────────

  apply() {
    this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld();
    this.onChange();
  }

  forward() {
    return new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  /** The point it's looking at, `pivotDistance` ahead. */
  pivot() {
    return this.camera.position.clone().addScaledVector(this.forward(), this.pivotDistance);
  }

  /** Turns to face `point` from where it is. */
  lookAt(point) {
    const d = point.clone().sub(this.camera.position);
    const len = d.length();
    if (len < 1e-6) return;
    this.pivotDistance = len;
    d.divideScalar(len);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    this.yaw = Math.atan2(-d.x, -d.z);
    this.apply();
  }

  /** Puts the camera at `position`, looking at `target`. */
  set(position, target) {
    this.camera.position.copy(position);
    this.lookAt(target);
  }

  /** Puts the camera at `position`, turned as `quaternion` (a recorded camera key). */
  setPose(position, quaternion) {
    this.camera.position.copy(position);
    const e = new Euler().setFromQuaternion(quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = Math.max(-LIMIT, Math.min(LIMIT, e.x));
    this.apply();
  }

  /** Whether a look or pan drag is going on (a right-click that dragged isn't a click). */
  get dragging() {
    return Boolean(this.drag);
  }

  /** Moves the camera and what it looks at by `delta` (Follow). */
  translate(delta) {
    this.camera.position.add(delta);
    this.camera.updateMatrixWorld();
  }

  /**
   * Looks along an axis at the pivot, from the side `axis` points to
   * (Blender's numpad views): +X views from the right of the world.
   */
  snapTo(axis) {
    const pivot = this.pivot();
    const d = this.pivotDistance;
    const from = new Vector3(...axis).normalize();
    this.camera.position.copy(pivot).addScaledVector(from, d);
    // Straight down or up: X to the right, as Blender's top view has it.
    if (Math.abs(from.y) > 0.99) {
      this.yaw = 0;
      this.pitch = from.y > 0 ? -LIMIT : LIMIT;
      this.apply();
    } else this.lookAt(pivot);
    this.pivotDistance = d;
  }

  /** Turns the camera around the pivot (dragging the axis gizmo). */
  orbit(dx, dy) {
    const pivot = this.pivot();
    this.yaw -= dx * LOOK * 1.4;
    this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch - dy * LOOK * 1.4));
    this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.position.copy(pivot).addScaledVector(this.forward(), -this.pivotDistance);
    this.apply();
  }

  // ─── Input ─────────────────────────────────────────────────────────────

  listen() {
    const dom = this.dom;
    this.handlers = {
      contextmenu: (e) => e.preventDefault(),
      pointerdown: (e) => this.down(e),
      pointermove: (e) => this.move(e),
      pointerup: (e) => this.up(e),
      pointercancel: (e) => this.up(e),
      wheel: (e) => this.wheel(e),
      pointerenter: () => (this.hover = true),
      pointerleave: () => (this.hover = false),
    };
    for (const [name, fn] of Object.entries(this.handlers))
      dom.addEventListener(name, fn, name === 'wheel' ? { passive: false } : undefined);
    // Locked, the buttons' up may not come to the view: end the drag on
    // any release, and if the lock is lost (Esc, the window losing focus).
    this.release = (e) => this.drag && !(e.buttons & (this.drag.mode === 'look' ? 2 : 4)) && this.up(e);
    this.lockChange = () => {
      if (document.pointerLockElement !== this.dom && this.drag?.mode === 'look' && this.drag.moved > 3)
        this.up({ pointerId: this.drag.id });
    };
    // The cursor doesn't move while locked, so the menu can't tell a look
    // from a click by distance: the right-click that ends a look is no click.
    this.noMenu = (e) => {
      if (performance.now() - this.lookedAt < 200) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    this.lookedAt = 0;
    addEventListener('pointerup', this.release);
    addEventListener('contextmenu', this.noMenu, true);
    document.addEventListener('pointerlockchange', this.lockChange);
    this.keydown = (e) => this.key(e, true);
    this.keyup = (e) => this.key(e, false);
    this.blur = () => this.held.clear();
    addEventListener('keydown', this.keydown);
    addEventListener('keyup', this.keyup);
    addEventListener('blur', this.blur);
  }

  down(e) {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    try {
      this.dom.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer knows; the drag works without capture
    }
    this.drag = {
      mode: e.button === 2 ? 'look' : 'pan',
      x: e.clientX,
      y: e.clientY,
      ax: e.clientX,
      ay: e.clientY,
      id: e.pointerId,
      moved: 0,
    };
    this.dom.style.cursor = e.button === 2 ? 'none' : 'move';
  }

  // Looking keeps the cursor where the drag began, as Studio does, instead
  // of letting it wander off. In the app the cursor is hidden and put back
  // there whenever it strays (see move); a browser has no way to move it,
  // so it locks the pointer instead, which shows Chrome's "press Esc"
  // banner. Only once it really drags, so a plain right-click still opens
  // the menu.
  lock() {
    if (isDesktop) return;
    if (document.pointerLockElement === this.dom || !this.dom.requestPointerLock) return;
    try {
      const p = this.dom.requestPointerLock({ unadjustedMovement: true });
      // Without raw input on this system, a plain lock.
      p?.catch?.(() => this.drag && this.dom.requestPointerLock()?.catch?.(() => {}));
    } catch {
      // no pointer lock here: the drag goes on with the cursor moving
    }
  }

  unlock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  /** Puts the hidden cursor back where the look began, once it's strayed. */
  recenter(d) {
    if (d.warping || Math.hypot(d.x - d.ax, d.y - d.ay) < 24) return;
    d.warping = performance.now();
    warpCursor(d.ax, d.ay).catch(() => (d.warping = 0));
  }

  move(e) {
    if (!this.drag) return;
    const d = this.drag;
    const locked = document.pointerLockElement === this.dom;
    // The jump the warp makes isn't the mouse's: it lands near the anchor
    // (with whatever the mouse moved meanwhile), from at least 24 px away.
    if (d.warping) {
      if (Math.hypot(e.clientX - d.ax, e.clientY - d.ay) < 12) {
        d.warping = 0;
        d.x = e.clientX;
        d.y = e.clientY;
        return;
      }
      if (performance.now() - d.warping > 250) d.warping = 0; // it never landed
    }
    const dx = locked ? e.movementX : e.clientX - d.x;
    const dy = locked ? e.movementY : e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.mode === 'look') {
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (!locked && d.moved > 3) this.lock();
      if (isDesktop) this.recenter(d);
      this.yaw -= dx * LOOK;
      this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch - dy * LOOK));
      this.apply();
    } else {
      // Pans so the point being looked at follows the cursor.
      const h = this.dom.clientHeight || 1;
      const perPixel = (2 * this.pivotDistance * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
      const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(right, -dx * perPixel).addScaledVector(up, dy * perPixel);
      this.apply();
    }
  }

  up(e) {
    if (!this.drag) return;
    try {
      this.dom.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const d = this.drag;
    if (d.mode === 'look' && d.moved > 3) {
      this.lookedAt = performance.now();
      if (isDesktop && Math.hypot(d.x - d.ax, d.y - d.ay) > 1) warpCursor(d.ax, d.ay).catch(() => {});
    }
    this.drag = null;
    this.unlock();
    this.dom.style.cursor = '';
  }

  // Toward what's under the cursor, a share of the way there each notch.
  wheel(e) {
    e.preventDefault();
    const r = this.dom.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const notches = Math.max(-5, Math.min(5, -e.deltaY / 100));
    const step = Math.max(0.4, this.pivotDistance * 0.18) * notches;
    this.camera.position.addScaledVector(ray, step);
    this.pivotDistance = Math.max(0.5, this.pivotDistance - step);
    this.apply();
  }

  key(e, down) {
    if (e.key === 'Shift') {
      if (down) this.held.add('shift');
      else this.held.delete('shift');
      return;
    }
    const act = flyActionOf(e);
    if (!down) {
      if (act) this.held.delete(act);
      return;
    }
    if (!act || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // Flying and framing only while the pointer is over the view (or a
    // look-drag is on), so the keys stay free for the rest of the window.
    if (!this.hover && !this.drag) return;
    if (act === 'frameYou') {
      const at = this.onFocus();
      if (at) {
        const back = this.forward().multiplyScalar(-14);
        this.set(at.clone().add(back), at);
      }
      e.preventDefault();
      return;
    }
    if (!KEYS[act]) return;
    e.preventDefault();
    e.stopPropagation();
    this.held.add(act);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.fly);
    }
  }

  fly = (now) => {
    const moving = Object.keys(KEYS).filter((k) => this.held.has(k));
    if (!moving.length) {
      this.frame = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const v = new Vector3();
    for (const k of moving) v.add(new Vector3(...KEYS[k]));
    // Forward and sideways follow where it looks; up and down stay vertical.
    const flat = new Quaternion().setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const vertical = v.y;
    v.y = 0;
    v.applyQuaternion(flat);
    v.y += vertical;
    const speed = FLY * (this.held.has('shift') ? SLOW : 1);
    if (v.lengthSq()) this.camera.position.addScaledVector(v.normalize(), speed * dt);
    this.apply();
    this.frame = requestAnimationFrame(this.fly);
  };

  dispose() {
    for (const [name, fn] of Object.entries(this.handlers)) this.dom.removeEventListener(name, fn);
    removeEventListener('keydown', this.keydown);
    removeEventListener('keyup', this.keyup);
    removeEventListener('blur', this.blur);
    removeEventListener('pointerup', this.release);
    removeEventListener('contextmenu', this.noMenu, true);
    document.removeEventListener('pointerlockchange', this.lockChange);
    this.unlock();
    cancelAnimationFrame(this.frame);
  }
}
