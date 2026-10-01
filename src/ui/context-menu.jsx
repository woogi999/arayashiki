// Right-click menus that belong to the app, in place of the web view's own
// (Back, Reload, Inspect…), which never show. What's in the menu depends on
// what was clicked: a node, a skill, a branch, the viewport, the timeline,
// a text field (cut, copy, paste), or anywhere else. A right-drag in the
// viewport turns the camera, so it doesn't open a menu.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { command, available } from '../commands.js';
import { bindingOf } from '../keybinds.js';
import { Icon } from '../icons.jsx';
import { openSearch } from './search.jsx';

const menu = signal(null); // { x, y, items }
const ANIMATABLE = ['Mesh', 'Block', 'Sphere', 'Cylinder', 'Wedge', 'Camera'];

// Where the right button went down, to tell a click from a right-drag.
let downAt = null;

const sep = { separator: true };
const cmd = (id, label) => {
  const c = command(id);
  if (!c || !available(c)) return null;
  return { label: label ?? c.title, icon: c.icon, keys: bindingOf(id), run: c.run };
};
const item = (label, icon, run, extra = {}) => ({ label, icon, run, ...extra });
const danger = (x) => x && { ...x, danger: true };

const isText = (el) =>
  el?.isContentEditable || el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && ['text', 'search', 'number', 'email', 'url', 'password', 'tel', ''].includes(el.type ?? ''));

function textItems(el) {
  const hasSelection = el.selectionStart !== el.selectionEnd || (el.isContentEditable && String(getSelection()).length > 0);
  const readOnly = el.readOnly || el.disabled;
  return [
    item('Cut', 'scissors', () => (el.focus(), document.execCommand('cut')), { disabled: !hasSelection || readOnly, keys: 'Ctrl+X' }),
    item('Copy', 'copy', () => (el.focus(), document.execCommand('copy')), { disabled: !hasSelection, keys: 'Ctrl+C' }),
    item(
      'Paste',
      'paste',
      async () => {
        el.focus();
        const text = await navigator.clipboard.readText().catch(() => '');
        if (!text) return;
        if (typeof el.setRangeText === 'function') {
          el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, 'end');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else document.execCommand('insertText', false, text);
      },
      { disabled: readOnly, keys: 'Ctrl+V' },
    ),
    sep,
    item('Select all', 'list', () => (el.focus(), el.select ? el.select() : document.execCommand('selectAll')), { keys: 'Ctrl+A' }),
  ];
}

const copyJson = (value) => navigator.clipboard.writeText(JSON.stringify(value, null, 1)).catch(() => {});

function nodeItems(index) {
  if (!S.nodeSelection.peek().includes(index)) S.pickNode(index);
  S.tab.value = 'node';
  const node = S.line.peek()[index];
  const animatable = node?.K_NAME === 'VISUAL' && ANIMATABLE.includes(node.EFFECT);
  return [
    animatable && item(`Animate (keyframes)…`, 'wand', () => command('animate').run(), { keys: bindingOf('animate') }),
    animatable && sep,
    cmd('duplicate'),
    cmd('moveUp'),
    cmd('moveDown'),
    sep,
    item('Copy as JSON', 'clipboard', () => copyJson(node)),
    item(
      'Paste node after',
      'paste',
      async () => {
        try {
          const parsed = JSON.parse(await navigator.clipboard.readText());
          const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((n) => n && typeof n === 'object' && n.K_NAME);
          if (!list.length) throw new Error();
          const next = [...S.line.peek()];
          next.splice(index + 1, 0, ...list);
          S.replaceLine(next);
          S.pickNode(index + 1);
        } catch {
          S.status.value = 'The clipboard doesn’t hold a node (copy one as JSON first).';
        }
      },
    ),
    item('Play from here', 'play', () => {
      const e = S.run.peek()?.events.find((x) => x.branch === S.branch.peek() && x.index === index);
      if (e) S.seek(e.t);
      S.play();
    }),
    sep,
    item('Add a node…', 'plus', () => openSearch()),
    danger(cmd('delete', 'Delete')),
  ];
}

function skillItems(uid) {
  const s = S.skills.peek().find((x) => x.uid === uid);
  if (s) {
    S.pickCategory(s.K_NAME);
    S.pickSkill(uid);
  }
  return [
    cmd('play', 'Play this skill'),
    sep,
    cmd('addSkill'),
    cmd('duplicateSkill'),
    item('Move up', 'arrow-up', () => S.moveSkill(-1)),
    item('Move down', 'arrow-down', () => S.moveSkill(1)),
    sep,
    item('Copy this skill’s code', 'copy', async () => {
      const code = await S.exportCode('skill');
      await navigator.clipboard.writeText(code).catch(() => {});
      S.status.value = `Copied the code for “${s?.NAME}”: paste it into JJS.`;
    }),
    item('Copy as JSON', 'clipboard', () => copyJson(s)),
    sep,
    danger(cmd('deleteSkill')),
  ];
}

function branchItems(name) {
  S.pickBranch(name);
  S.outlined.value = 'branch';
  return [
    cmd('addBranch'),
    item('Play from this branch', 'play', () => {
      if (!S.fromBranch.peek()) S.toggleFromBranch();
      S.restart();
    }),
    name && sep,
    name && danger(item('Delete branch', 'trash-2', () => S.deleteBranch())),
  ];
}

function viewportItems() {
  const mode = S.camMode.peek();
  return [
    cmd('play'),
    cmd('restart'),
    sep,
    item('Free camera', 'camera', () => (S.camMode.value = 'free'), { checked: mode === 'free' }),
    item('Auto camera', 'aperture', () => (S.camMode.value = 'auto'), { checked: mode === 'auto' }),
    item('Recorded camera', 'route', () => (S.camMode.value = 'path'), { checked: mode === 'path', disabled: !S.camKeys.peek().length }),
    cmd('cameraKey'),
    cmd('recordCamera'),
    cmd('resetCamera'),
    sep,
    item('Follow', 'navigation', () => (S.follow.value = !S.follow.peek()), { checked: S.follow.peek() }),
    item('Hitboxes', 'box', () => (S.showHitboxes.value = !S.showHitboxes.peek()), { checked: S.showHitboxes.peek(), keys: bindingOf('hitboxes') }),
    item('The skill’s own camera', 'camera', () => (S.skillCamera.value = !S.skillCamera.peek()), { checked: S.skillCamera.peek() }),
    sep,
    cmd('screenshot'),
    cmd('quickShot'),
    cmd('exportVideo'),
    sep,
    cmd('animateCamera'),
  ];
}

function timelineItems() {
  const speed = S.speed.peek();
  return [
    cmd('play'),
    cmd('restart'),
    sep,
    item('Real time', 'timer', () => (S.speed.value = 1), { checked: speed === 1 }),
    item('Half speed', 'timer', () => (S.speed.value = 0.5), { checked: speed === 0.5 }),
    item('Quarter speed', 'timer', () => (S.speed.value = 0.25), { checked: speed === 0.25 }),
    sep,
    cmd('cameraKey'),
    cmd('exportVideo'),
  ];
}

function generalItems() {
  return [
    item('Search everything…', 'command', () => openSearch(), { keys: bindingOf('search') }),
    cmd('assistant'),
    sep,
    cmd('undo'),
    cmd('redo'),
    sep,
    cmd('save'),
    cmd('export'),
    sep,
    cmd('settings'),
    cmd('manual'),
  ];
}

function itemsFor(target) {
  if (isText(target)) return textItems(target);
  const nodeRow = target.closest?.('[data-node-index]');
  if (nodeRow) return nodeItems(Number(nodeRow.dataset.nodeIndex));
  const skillRow = target.closest?.('[data-skill-uid]');
  if (skillRow) return skillItems(skillRow.dataset.skillUid);
  const branchRow = target.closest?.('[data-branch]');
  if (branchRow) return branchItems(branchRow.dataset.branch);
  if (target.closest?.('.viewport') && S.workspace.peek() === 'skills') return viewportItems();
  if (target.closest?.('.area-time')) return timelineItems();
  return generalItems();
}

function clean(items) {
  const out = [];
  for (const i of items) {
    if (!i) continue;
    if (i.separator && (!out.length || out.at(-1).separator)) continue;
    out.push(i);
  }
  while (out.at(-1)?.separator) out.pop();
  return out;
}

function onDown(e) {
  if (e.button === 2) downAt = [e.clientX, e.clientY];
}
function onContext(e) {
  e.preventDefault();
  if (S.dialog.peek() && !isText(e.target)) return;
  const moved = downAt ? Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) : 0;
  downAt = null;
  if (moved > 5) return; // a right-drag (turning the camera), not a click
  const items = clean(itemsFor(e.target));
  if (items.length) menu.value = { x: e.clientX, y: e.clientY, items };
}

export function ContextMenu() {
  useEffect(() => {
    addEventListener('pointerdown', onDown, true);
    addEventListener('contextmenu', onContext);
    return () => {
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('contextmenu', onContext);
    };
  }, []);
  const m = menu.value;
  if (!m) return null;
  return <Menu m={m} />;
}

function Menu({ m }) {
  const box = useRef(null);
  const [at, setAt] = useState({ x: m.x, y: m.y });
  const [active, setActive] = useState(-1);
  const choices = m.items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);
  useEffect(() => {
    const r = box.current.getBoundingClientRect();
    setAt({ x: Math.min(m.x, innerWidth - r.width - 6), y: Math.min(m.y, innerHeight - r.height - 6) });
    box.current.focus();
    const away = (e) => !box.current?.contains(e.target) && (menu.value = null);
    const blur = () => (menu.value = null);
    addEventListener('pointerdown', away, true);
    addEventListener('blur', blur);
    addEventListener('resize', blur);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('blur', blur);
      removeEventListener('resize', blur);
    };
  }, [m]);
  const choose = (it) => {
    menu.value = null;
    if (!it.disabled) setTimeout(() => it.run?.(), 0);
  };
  const key = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') menu.value = null;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = choices.indexOf(active);
      const next = e.key === 'ArrowDown' ? choices[(pos + 1) % choices.length] : choices[(pos - 1 + choices.length) % choices.length];
      setActive(next ?? -1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(m.items[active]);
    }
  };
  return (
    <div class="context-menu" ref={box} role="menu" tabIndex={-1} style={{ left: `${at.x}px`, top: `${at.y}px` }} onKeyDown={key} onContextMenu={(e) => e.preventDefault()}>
      {m.items.map((it, i) =>
        it.separator ? (
          <div key={`s${i}`} class="context-sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked}
            class={`context-item ${i === active ? 'is-active' : ''} ${it.danger ? 'is-danger' : ''}`}
            disabled={it.disabled}
            onPointerEnter={() => setActive(i)}
            onClick={() => choose(it)}
          >
            <span class="context-check">{it.checked ? <Icon name="check" size={12} /> : it.icon ? <Icon name={it.icon} size={13} /> : null}</span>
            <span class="context-label">{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
