// The universal search (Ctrl+Space), like After Effects' FX Console but for
// everything: commands, the moveset's skills, branches and nodes, nodes and
// effects to add, templates, settings and keybinds, recent files, and the
// user manual. Ported from Wooctrl's Blender palette: the same fuzzy
// matcher (src/search/fuzzy.js), favourites and recents, tabs, and the
// results above the field so your eye stays where you type.
//
//   ↑ ↓  move     Enter  run     Ctrl+Enter  run and keep it open
//   Tab  next category (Shift+Tab back)     Ctrl+F  favourite     Esc  close
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { COMMANDS, available } from '../commands.js';
import { ACTIONS, bindingOf } from '../keybinds.js';
import { EFFECTS, NODES } from '../../core/schema.js';
import { TEMPLATES } from '../../core/templates.js';
import { FuzzyIndex } from '../search/fuzzy.js';
import { Icon } from '../icons.jsx';
import { KindChip } from './controls.jsx';
import manualText from '../../docs/USER-MANUAL.md?raw';
import { templateToOpen } from './templates.jsx';

// Shown, and on its way out (it animates closed before it goes).
const open = signal(false);
const closing = signal(false);
let closeTimer = 0;
export const openSearch = () => {
  clearTimeout(closeTimer);
  closing.value = false;
  open.value = true;
};
export function closeSearch() {
  if (!open.peek() || closing.peek()) return;
  closing.value = true;
  closeTimer = setTimeout(() => {
    open.value = false;
    closing.value = false;
  }, 150);
}
export const toggleSearch = () => (open.peek() && !closing.peek() ? closeSearch() : openSearch());

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'command', label: 'Commands' },
  { id: 'moveset', label: 'Moveset' },
  { id: 'add', label: 'Add' },
  { id: 'setting', label: 'Settings' },
  { id: 'help', label: 'Help' },
];
// For equally good matches, a nudge to the kinds you usually want.
const BIAS = { command: 0.03, moveset: 0.02, add: 0, setting: -0.02, help: -0.04 };

// ─── Recents and favourites ─────────────────────────────────────────────

const HISTORY = 'arayashiki-search';
function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY) ?? '{}');
    return { recent: Array.isArray(h.recent) ? h.recent : [], favorites: Array.isArray(h.favorites) ? h.favorites : [] };
  } catch {
    return { recent: [], favorites: [] };
  }
}
const history = signal(loadHistory());
function saveHistory(next) {
  history.value = next;
  try {
    localStorage.setItem(HISTORY, JSON.stringify(next));
  } catch {
    // not kept
  }
}
const addRecent = (key) => saveHistory({ ...history.peek(), recent: [key, ...history.peek().recent.filter((k) => k !== key)].slice(0, 12) });
function toggleFavorite(key) {
  const h = history.peek();
  const on = h.favorites.includes(key);
  saveHistory({ ...h, favorites: on ? h.favorites.filter((k) => k !== key) : [...h.favorites, key].slice(-60) });
  return !on;
}

// ─── What there is to find ──────────────────────────────────────────────

// The manual's sections, for "how do I…" searches.
const MANUAL = (() => {
  const out = [];
  let current = null;
  for (const line of manualText.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(#{2,3}) (.+)$/.exec(line);
    if (m) {
      current = { title: m[2].trim(), body: [] };
      out.push(current);
    } else current?.body.push(line);
  }
  return out.map((s) => ({ title: s.title, text: s.body.join(' ').replace(/[`*_>#|-]/g, ' ').replace(/\s+/g, ' ').trim() }));
})();

const toSkills = () => {
  S.workspace.value = 'skills';
  S.showStart.value = false;
};

function collect() {
  const items = [];
  const add = (item) => items.push(item);
  for (const c of COMMANDS) {
    if (!available(c)) continue;
    add({
      key: `cmd:${c.id}`,
      title: c.title,
      subtitle: c.group,
      keywords: `${c.keywords ?? ''} ${c.group}`,
      category: c.group === 'Settings' ? 'setting' : 'command',
      icon: c.icon,
      shortcut: bindingOf(c.id),
      run: c.run,
    });
  }
  // The moveset: every skill, the open skill's branches and nodes.
  S.skills.peek().forEach((s) => {
    if (s.ADD === false && !s.DATA) return;
    add({
      key: `skill:${s.uid}`,
      title: String(s.NAME ?? '') || '(no name)',
      subtitle: `Skill · ${s.K_NAME}`,
      keywords: `skill ${s.K_NAME} ${s.KEY ?? ''}`,
      category: 'moveset',
      icon: 'swords',
      run: () => {
        toSkills();
        S.pickCategory(s.K_NAME);
        S.pickSkill(s.uid);
      },
    });
  });
  const skill = S.skill.peek();
  if (skill?.DATA) {
    for (const b of ['', ...S.branches.peek()]) {
      add({
        key: `branch:${skill.uid}:${b}`,
        title: b || 'Default',
        subtitle: `Branch of ${skill.NAME}`,
        keywords: 'branch line',
        category: 'moveset',
        icon: 'split',
        run: () => (toSkills(), S.pickBranch(b)),
      });
      const line = b ? (skill.DATA.Branch?.[b]?.Line ?? []) : (skill.DATA.Line ?? []);
      line.forEach((n, i) => {
        const info = NODES.find((x) => x.kind === n?.K_NAME);
        const detail = info?.summary?.(n) ?? '';
        add({
          key: `node:${skill.uid}:${b}:${i}`,
          title: `${info?.label ?? n?.K_NAME ?? '?'} ${detail}`.trim(),
          subtitle: `${b || 'Default'} · node ${i + 1}`,
          keywords: `node ${n?.K_NAME} ${n?.EFFECT ?? ''} ${n?.STATE ?? ''} ${n?.['VISUAL TAG'] ?? ''}`,
          category: 'moveset',
          chip: info,
          transient: true,
          run: () => {
            toSkills();
            S.pickBranch(b);
            S.pickNode(i);
            S.tab.value = 'node';
          },
        });
      });
    }
  }
  // Things to add.
  for (const n of NODES)
    add({
      key: `add:${n.kind}`,
      title: `Add ${n.label}`,
      subtitle: n.kind === n.label ? n.group : `${n.kind} · ${n.group}`,
      keywords: `add node new ${n.kind} ${n.group}`,
      description: n.about,
      category: 'add',
      chip: n,
      when: () => Boolean(S.skill.peek()),
      run: () => (toSkills(), S.addNode(n.kind)),
    });
  for (const e of EFFECTS ?? [])
    add({
      key: `fx:${e}`,
      title: `Add VISUAL: ${e}`,
      subtitle: 'Effect',
      keywords: 'visual effect fx add',
      category: 'add',
      chip: NODES.find((x) => x.kind === 'VISUAL'),
      when: () => Boolean(S.skill.peek()),
      run: () => {
        toSkills();
        S.addNode('VISUAL');
        S.setNodeField('EFFECT', e);
      },
    });
  for (const t of TEMPLATES)
    add({
      key: `tpl:${t.id}`,
      title: `Template: ${t.name}`,
      subtitle: 'Ready-made skills',
      keywords: 'template ready made',
      description: t.about ?? '',
      category: 'add',
      icon: 'sparkles',
      run: () => {
        templateToOpen.id = t.id;
        S.dialog.value = 'templates';
      },
    });
  // Shortcuts, to find or change a key.
  for (const a of ACTIONS)
    add({
      key: `key:${a.id}`,
      title: `Shortcut: ${a.label}`,
      subtitle: bindingOf(a.id),
      keywords: 'keybind hotkey shortcut key',
      category: 'setting',
      icon: 'keyboard',
      run: () => {
        S.settingsTab.value = 'keys';
        S.dialog.value = 'settings';
      },
    });
  for (const r of S.recent.peek())
    add({
      key: `file:${r.path}`,
      title: r.name,
      subtitle: r.path,
      keywords: 'recent file open txt',
      category: 'command',
      icon: 'file-text',
      run: () => S.openRecent(r.path),
    });
  for (const m of MANUAL)
    add({
      key: `help:${m.title}`,
      title: m.title,
      subtitle: 'User manual',
      keywords: 'help how manual guide',
      description: m.text.slice(0, 400),
      category: 'help',
      icon: 'help',
      run: () => {
        S.manualSection.value = m.title;
        S.dialog.value = 'manual';
      },
    });
  return items.filter((i) => !i.when || i.when());
}

// ─── The palette ────────────────────────────────────────────────────────

export function SearchPalette() {
  if (!open.value) return null;
  return <Palette />;
}

const ROW_LIMIT = 60;
const HINTS = [
  ['↑↓', 'Navigate'],
  ['↵', 'Run'],
  ['Ctrl ↵', 'Keep open'],
  ['Tab', 'Category'],
  ['Ctrl F', 'Favourite'],
  ['Esc', 'Close'],
];

function Palette() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState(0);
  const [flash, setFlash] = useState(null);
  const [shown, setShown] = useState(false);
  const [listH, setListH] = useState(0);
  const [pill, setPill] = useState(null); // { top, height }
  const input = useRef(null);
  const list = useRef(null);
  const items = useMemo(collect, []);
  const index = useMemo(() => new FuzzyIndex(items.map((i) => [i.title, `${i.subtitle ?? ''} ${i.keywords ?? ''}`, i.description ?? ''])), [items]);
  const h = history.value;
  const category = TABS[tab].id;

  const rows = useMemo(() => {
    const inTab = (i) => category === 'all' || i.category === category;
    if (!query.trim()) {
      const byKey = new Map(items.map((i) => [i.key, i]));
      const fav = h.favorites.map((k) => byKey.get(k)).filter((i) => i && inTab(i));
      const rec = h.recent.map((k) => byKey.get(k)).filter((i) => i && inTab(i) && !h.favorites.includes(i.key));
      const out = [];
      if (fav.length) out.push({ header: 'Favourites' }, ...fav);
      if (rec.length) out.push({ header: 'Recent' }, ...rec);
      if (!out.length || category !== 'all') {
        const browse = items.filter((i) => inTab(i) && !i.transient).slice(0, 40);
        out.push({ header: category === 'all' ? 'Suggestions' : TABS[tab].label }, ...browse);
      }
      return out;
    }
    const favs = new Set(h.favorites);
    const recs = new Set(h.recent);
    return index
      .search(query, (i) => inTab(items[i]), 240)
      .map(([score, i]) => {
        const item = items[i];
        return [score + (BIAS[item.category] ?? 0) + (favs.has(item.key) ? 0.12 : 0) + (recs.has(item.key) ? 0.06 : 0), item];
      })
      .sort((a, b) => b[0] - a[0])
      .slice(0, ROW_LIMIT)
      .map(([, item]) => item);
  }, [query, category, items, index, h]);

  const choices = rows.filter((r) => !r.header);
  const current = choices[Math.min(picked, choices.length - 1)];

  // In with a rise; the field gets the focus.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    input.current?.focus();
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => setPicked(0), [query, tab]);
  // The results' height eases to fit them (it grows upward: the field stays put).
  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const max = Math.min(400, Math.round(innerHeight * 0.5));
    setListH(Math.min(max, ul.offsetHeight));
  }, [rows]);
  // The selection pill glides to the picked row.
  useLayoutEffect(() => {
    const row = list.current?.querySelector(`[data-choice="${picked}"]`);
    if (!row) {
      setPill(null);
      return;
    }
    setPill({ top: row.offsetTop, height: row.offsetHeight });
    row.scrollIntoView({ block: 'nearest' });
  }, [picked, rows]);

  const runItem = (item, keep = false) => {
    if (!item) return;
    addRecent(item.key);
    if (!keep) closeSearch();
    setTimeout(() => item.run(), keep ? 0 : 60);
  };

  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPicked((p) => (choices.length ? (p + 1) % choices.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPicked((p) => (choices.length ? (p - 1 + choices.length) % choices.length : 0));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setPicked((p) => Math.min(choices.length - 1, p + 8));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setPicked((p) => Math.max(0, p - 8));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(current, e.ctrlKey || e.metaKey);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setTab((t) => (t + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      if (current) setFlash(toggleFavorite(current.key) ? `${current.title} is a favourite` : `${current.title} is no longer a favourite`);
    } else if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      closeSearch();
    }
  };

  let n = -1;
  const visible = shown && !closing.value;
  return (
    <div class={`palette-layer ${visible ? 'is-shown' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && closeSearch()}>
      <div class="palette" role="dialog" aria-label="Search everything" onKeyDown={onKey}>
        <div class="palette-results" style={{ height: `${listH}px` }}>
          <ul class="palette-list" ref={list} role="listbox" aria-label="Results">
            {pill && <li class="palette-pill" aria-hidden="true" style={{ transform: `translateY(${pill.top}px)`, height: `${pill.height}px` }} />}
            {rows.map((r, i) => {
              if (r.header)
                return (
                  <li key={`h${i}`} class="palette-header" role="presentation">
                    {r.header}
                  </li>
                );
              n++;
              const me = n;
              const fav = h.favorites.includes(r.key);
              return (
                <li key={r.key} role="option" aria-selected={me === picked} data-choice={me} style={{ '--i': Math.min(me, 10) }} class="palette-item">
                  <button
                    type="button"
                    tabIndex={-1}
                    class={`palette-row ${me === picked ? 'is-picked' : ''}`}
                    onPointerMove={() => me !== picked && setPicked(me)}
                    onClick={(e) => runItem(r, e.ctrlKey || e.metaKey)}
                  >
                    <span class="palette-glyph">{r.chip ? <KindChip color={r.chip.color} icon={r.chip.icon} size={11} /> : <Icon name={r.icon ?? 'arrow-right'} size={14} />}</span>
                    <span class="palette-title">{r.title}</span>
                    {r.subtitle && <span class="palette-sub">{r.subtitle}</span>}
                    <span class="palette-end">
                      {fav && <Icon name="star" size={12} class="palette-star" />}
                      {r.shortcut && <kbd>{r.shortcut}</kbd>}
                    </span>
                  </button>
                </li>
              );
            })}
            {!choices.length && <li class="palette-empty">Nothing matches “{query}”. Try fewer letters, or another category (Tab).</li>}
          </ul>
        </div>
        <div class="palette-tabs" role="tablist" aria-label="Categories">
          {TABS.map((t, i) => (
            <button type="button" role="tab" key={t.id} aria-selected={i === tab} tabIndex={-1} onClick={() => (setTab(i), input.current?.focus())}>
              {t.label}
            </button>
          ))}
          <span class="spacer" />
          <kbd>Tab</kbd>
        </div>
        <label class="palette-field">
          <Icon name="search" size={16} />
          <input
            ref={input}
            type="text"
            spellcheck={false}
            autocomplete="off"
            placeholder="Search commands, skills, nodes, effects, settings and help"
            aria-label="Search everything"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {query.trim() && (
            <span class="palette-count num">
              {choices.length === ROW_LIMIT ? `${ROW_LIMIT}+` : choices.length} result{choices.length === 1 ? '' : 's'}
            </span>
          )}
        </label>
        <footer class="palette-hints">
          {flash ? (
            <span class="palette-flash">{flash}</span>
          ) : (
            HINTS.map(([k, label]) => (
              <span key={k}>
                <kbd>{k}</kbd>
                {label}
              </span>
            ))
          )}
        </footer>
      </div>
    </div>
  );
}
