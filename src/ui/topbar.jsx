// The top bar, like Blender's: the app mark, the workspace tabs and plain
// text menus on the left, the name of what's being edited in the middle,
// history and Export on the right. The menus are the workspace's own.
import * as S from '../store.js';
import * as B from '../barmaker/state.js';
import { IconButton } from './controls.jsx';
import { AccountButton } from './account.jsx';
import { Icon } from '../icons.jsx';
import { openUpdates, pendingUpdate } from '../updates.js';
import { layoutItems, openMenu } from './context-menu.jsx';
import markUrl from '../assets/arayashiki-mark.png';

// The app's mark: the katana (src-tauri/icons/app-icon.png), in the accent lime.
export function Mark() {
  return <img class="mark" src={markUrl} alt="" aria-hidden="true" />;
}

/** Shown when a newer release is out on GitHub: opens the Updates window. */
function UpdatePill() {
  const r = pendingUpdate.value;
  if (!r) return null;
  return (
    <button type="button" class="upd-pill" title={`Arayashiki ${r.latest} is out: see what’s new`} onClick={openUpdates}>
      <span class="upd-pill-dot" aria-hidden="true" />
      <Icon name="download" size={13} />
      <span>Update {r.latest}</span>
    </button>
  );
}

const menu = (label, title, onClick, className = '') => (
  <button type="button" class={`menu-btn ${className}`} title={title} onClick={onClick}>
    {label}
  </button>
);

const WORKSPACES = [
  { id: 'skills', label: 'Skills', title: 'The moveset: skills, nodes and the simulator' },
  { id: 'bars', label: 'Meter Maker', title: 'Draw a meter (a progress bar), upload it and make its skill' },
];

function Workspaces() {
  return (
    <nav class="workspace-tabs" role="tablist" aria-label="Workspace">
      {WORKSPACES.map((w) => (
        <button
          type="button"
          role="tab"
          key={w.id}
          title={w.title}
          aria-selected={S.workspace.value === w.id}
          onClick={() => (S.workspace.value = w.id)}
        >
          {w.label}
        </button>
      ))}
    </nav>
  );
}

function History({ past, future, undo, redo }) {
  return (
    <>
      <IconButton icon="undo" label="Undo" title="Undo (Ctrl+Z)" size={14} disabled={!past} onClick={undo} />
      <IconButton icon="redo" label="Redo" title="Redo (Ctrl+Y)" size={14} disabled={!future} onClick={redo} />
    </>
  );
}

function SkillsBar() {
  const open = (d) => (S.dialog.value = d);
  return (
    <>
      <nav class="topbar-menus" aria-label="File">
        {menu('New', 'Start a new moveset (Ctrl+N)', S.newMoveset)}
        {menu('Open', 'Open a .txt holding a code (Ctrl+O)', S.openFile)}
        {menu('Import', 'Paste a code from JJS (Ctrl+I)', () => open('import'), 'do-import')}
        {menu(
          'Save',
          S.filePath.value ? `Save to ${S.filePath.value} (Ctrl+S)` : 'Save as a .txt (Ctrl+S)',
          () => S.saveHere(),
        )}
        {menu('Save As', 'Save to another .txt (Ctrl+Shift+S)', () => S.saveHere({ as: true }))}
        {menu('Templates', 'Ready-made skills: fill in a form, get the skills (Ctrl+T)', () => open('templates'))}
        {menu('Layout', 'Reset the panels, or save and load your own layouts', (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.left, r.bottom + 4, layoutItems());
        })}
        {menu('Settings', 'Keybinds, appearance, the AI tools (MCP), Roblox caches', () => open('settings'))}
      </nav>
      <div class="moveset-name">
        <input
          type="text"
          aria-label="Moveset name"
          maxLength={60}
          spellcheck={false}
          value={S.name.value}
          onChange={(e) => {
            S.setName(e.currentTarget.value);
            e.currentTarget.value = S.name.value;
          }}
        />
        {S.dirty.value && (
          <span class="dirty-mark" title="Changed since it was saved">
            •
          </span>
        )}
      </div>
      <div class="topbar-right">
        <UpdatePill />
        <AccountButton />
        <History past={S.past.value.length} future={S.future.value.length} undo={S.undo} redo={S.redo} />
        <button
          type="button"
          class="export-btn do-export"
          title="Export: the code for JJS (Ctrl+E), a video (Ctrl+F12) or a picture (F12)"
          onClick={() => S.openExport(S.exportTab.peek())}
        >
          Export…
        </button>
      </div>
    </>
  );
}

function BarsBar() {
  return (
    <>
      <nav class="topbar-menus" aria-label="File">
        {menu('New', 'Start a new meter', () => B.openDialog('new'))}
        {menu('Open', 'Saved designs and design files (Ctrl+O)', () => B.openDialog('open'))}
        {menu('Save', 'Keep it in the app (Ctrl+S)', B.saveHere)}
      </nav>
      <div class="moveset-name">
        <input
          type="text"
          aria-label="Design name"
          maxLength={80}
          spellcheck={false}
          value={B.doc.value.name}
          onChange={(e) => {
            B.setName(e.currentTarget.value);
            e.currentTarget.value = B.doc.value.name;
          }}
        />
        {B.dirty.value && (
          <span class="dirty-mark" title="Changed since it was saved">
            •
          </span>
        )}
      </div>
      <div class="topbar-right">
        <UpdatePill />
        <AccountButton />
        <History past={B.past.value.length} future={B.future.value.length} undo={B.undo} redo={B.redo} />
        <button
          type="button"
          class="export-btn"
          title="Pictures, or upload them and make the JJS skill (Ctrl+E)"
          onClick={() => B.openDialog('export')}
        >
          Export
        </button>
      </div>
    </>
  );
}

export function TopBar() {
  return (
    <header class="topbar">
      <button
        type="button"
        class="brand"
        title="Start screen"
        aria-label="Start screen"
        onClick={() => {
          S.workspace.value = 'skills';
          S.showStart.value = true;
        }}
      >
        <Mark />
      </button>
      <Workspaces />
      {S.workspace.value === 'bars' ? <BarsBar /> : <SkillsBar />}
    </header>
  );
}
