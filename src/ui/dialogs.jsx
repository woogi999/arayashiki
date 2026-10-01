// The dialogs: bringing a code in, taking one out, the saved movesets, and
// the library of real moves.
import { useEffect, useState } from 'preact/hooks';
import * as S from '../store.js';
import * as B from '../barmaker/state.js';
import { exitNow } from '../exit.js';
import {
  assetsStatus,
  clearAssets,
  isDesktop,
  openCodeFile,
  reindexRobloxCache,
  saveCodeFile,
} from '../platform.js';
import { ACTIONS, bindingOf, comboOf, custom, rebind, resetBinds } from '../keybinds.js';
import { appearance, BACKGROUNDS, setAppearance } from '../prefs.js';
import { Icon } from '../icons.jsx';
import { AccountDialog } from './account.jsx';
import { TemplatesDialog } from './templates.jsx';
import { lazy } from './lazy.jsx';

const ExportDialog = lazy(() => import('./export.jsx'), 'ExportDialog');

// Old names for the Export window's pages ('video', 'screenshot').
function Redirect({ to }) {
  useEffect(() => S.openExport(to), []);
  return null;
}
const ManualDialog = lazy(() => import('./manual.jsx'), 'ManualDialog');
const ConnectDialog = lazy(() => import('../ai/connect.jsx'), 'ConnectDialog');
import { Button, IconButton, Modal, Segmented, Switch } from './controls.jsx';

const close = () => (S.dialog.value = null);

const MODES = [
  { id: 'replace', label: 'Replace this moveset' },
  { id: 'append', label: 'Add to it' },
];

function ImportDialog() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('replace');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await S.importCode(text, mode);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async () => {
    const file = await openCodeFile().catch((e) => setError(String(e)));
    if (file?.text) {
      setText(file.text);
      setError(null);
    }
  };
  return (
    <Modal title="Import a moveset" onClose={close}>
      <p class="hint">
        Paste the code JJS’s Skill Builder copies out: the export button at the bottom of its skill list.
      </p>
      <textarea
        class="input code-box import-code"
        rows={8}
        spellcheck={false}
        aria-label="Skill code"
        placeholder="KLUv/…"
        value={text}
        autoFocus
        onInput={(e) => {
          setText(e.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text && go()}
      />
      {error && (
        <p class="error" role="alert">
          <Icon name="warning" size={14} />
          {error}
        </p>
      )}
      <div class="modal-actions">
        <Button icon="file-text" onClick={fromFile}>
          From a .txt file
        </Button>
        <Segmented label="Import as" options={MODES} value={mode} onChange={setMode} />
        <span class="spacer" />
        <Button variant="primary" class="confirm-import" disabled={!text.trim() || busy} onClick={go}>
          {busy ? 'Reading…' : 'Import'}
        </Button>
      </div>
    </Modal>
  );
}

// Closing with unsaved work: what's unsaved (the moveset, the meter design),
// then save it all and exit, exit without saving, or stay. Either way out is
// a clean exit, so the next launch starts fresh (src/session.js); only a
// crash brings the autosave back.
function UnsavedDialog() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const moveset = S.dirty.value;
  const meter = B.dirty.value;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (S.dirty.peek() && !(await S.saveHere())) return; // cancelled the file picker: stay
      if (B.dirty.peek()) await B.saveHere();
      if (B.dirty.peek()) return setError(B.error.peek() ?? 'The meter design couldn’t be saved.');
      exitNow();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Save your work before exiting?" class="modal-exit" onClose={close}>
      <p class="hint">This isn’t saved yet:</p>
      <ul class="exit-list">
        {moveset && (
          <li>
            <Icon name="swords" size={14} />
            <span>
              <strong>{S.name.value}</strong>
              <span class="exit-where">{S.filePath.value ?? 'Skill Builder · never saved as a .txt'}</span>
            </span>
          </li>
        )}
        {meter && (
          <li>
            <Icon name="battery" size={14} />
            <span>
              <strong>{B.doc.value.name}</strong>
              <span class="exit-where">Meter Maker · saved in the app</span>
            </span>
          </li>
        )}
      </ul>
      <p class="hint">
        If you exit without saving, it’s gone: Arayashiki starts fresh next time. (If it ever closes by itself, from a
        crash or a power cut, your work comes back when you open it again.)
      </p>
      {error && (
        <p class="error" role="alert">
          <Icon name="warning" size={14} />
          {error}
        </p>
      )}
      <div class="modal-actions">
        <Button variant="ghost" class="danger" onClick={exitNow}>
          Don’t save and exit
        </Button>
        <span class="spacer" />
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" icon="save" disabled={busy} onClick={save} autoFocus>
          {busy ? 'Saving…' : 'Save and exit'}
        </Button>
      </div>
    </Modal>
  );
}

const SETTINGS_TABS = [
  { id: 'keys', label: 'Keybinds' },
  { id: 'look', label: 'Appearance' },
  { id: 'ai', label: 'AI' },
  { id: 'roblox', label: 'Roblox' },
];

function KeybindsSettings() {
  const [waiting, setWaiting] = useState(null);
  useEffect(() => {
    if (!waiting) return;
    const take = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setWaiting(null);
      const combo = comboOf(e);
      if (!combo) return;
      rebind(waiting, combo);
      setWaiting(null);
    };
    addEventListener('keydown', take, true);
    return () => removeEventListener('keydown', take, true);
  }, [waiting]);
  void custom.value; // re-render when a binding changes
  return (
    <>
      <p class="hint">Click a shortcut, then press the keys you want (Escape keeps the old one).</p>
      <div class="keybinds">
        {ACTIONS.map((a) => (
          <div class="keybind" key={a.id}>
            <span>{a.label}</span>
            <button
              type="button"
              class={`keybind-key ${waiting === a.id ? 'is-waiting' : ''}`}
              onClick={() => setWaiting(a.id)}
            >
              {waiting === a.id ? 'Press keys…' : <kbd>{bindingOf(a.id)}</kbd>}
            </button>
            {bindingOf(a.id) !== a.def ? (
              <IconButton
                icon="x"
                size={13}
                label={`Back to ${a.def}`}
                title={`Back to ${a.def}`}
                onClick={() => rebind(a.id, null)}
              />
            ) : (
              <span class="field-reset-space" />
            )}
          </div>
        ))}
      </div>
      <div class="modal-actions">
        <span class="spacer" />
        <Button onClick={resetBinds}>Reset all</Button>
      </div>
    </>
  );
}

function AppearanceSettings() {
  const a = appearance.value;
  const [onLaunch, setOnLaunch] = useState(S.startOnLaunch());
  return (
    <>
      <div class="prop-row">
        <span>Start screen on launch</span>
        <Switch
          checked={onLaunch}
          label="Start screen on launch"
          onChange={(on) => {
            S.setStartOnLaunch(on);
            setOnLaunch(on);
          }}
        />
      </div>
      <label class="prop-row">
        <span>Interface size</span>
        <select
          class="input"
          value={String(a.scale)}
          onChange={(e) => setAppearance({ scale: Number(e.currentTarget.value) })}
        >
          {[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((v) => (
            <option key={v} value={String(v)}>
              {Math.round(v * 100)}%
            </option>
          ))}
        </select>
      </label>
      <label class="prop-row">
        <span>Viewport background</span>
        <select class="input" value={a.viewportBg} onChange={(e) => setAppearance({ viewportBg: e.currentTarget.value })}>
          {BACKGROUNDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div class="prop-row">
        <span>Hitboxes and projectiles</span>
        <Switch checked={S.showHitboxes.value} label="Show hitboxes" onChange={(on) => (S.showHitboxes.value = on)} />
      </div>
    </>
  );
}

function AiSettings() {
  return (
    <>
      <h3 class="section-title">The assistant inside Arayashiki</h3>
      <p class="hint">
        Chat with your own AI (Claude, ChatGPT, Gemini, OpenRouter, or a free model on this PC with Ollama or LM Studio). It
        reads and edits the open moveset, simulates, takes screenshots, exports videos and animates cameras, and everything
        it changes can be undone.
      </p>
      <div class="modal-actions">
        <Button
          icon="bot"
          onClick={() => {
            S.dialog.value = null;
            S.assistantOpen.value = true;
          }}
        >
          Open the assistant ({bindingOf('assistant')})
        </Button>
      </div>
      <h3 class="section-title">AI apps and editors (MCP)</h3>
      <p class="hint">
        Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Codex, Gemini CLI, LM Studio: pick yours and Arayashiki adds
        itself to its settings. No Node or terminal needed.
      </p>
      <div class="modal-actions">
        <Button icon="plug" onClick={() => (S.dialog.value = 'connect-ai')}>
          Connect an AI app…
        </Button>
      </div>
    </>
  );
}

function RobloxSettings() {
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState(null);
  const refresh = () => assetsStatus().then(setStatus);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1500); // while the index builds
    return () => clearInterval(timer);
  }, []);
  const run = async (fn, done) => {
    try {
      setNote(done(await fn()));
    } catch (e) {
      setNote(String(e));
    }
    refresh();
  };
  if (!isDesktop) return <p class="hint">Roblox assets are fetched by the desktop app; this is the browser preview.</p>;
  return (
    <>
      <p class="hint">
        Pictures come without signing in. Most audio since 2025 only comes to a signed-in account: sign in with the
        account button, top right.
      </p>
      <h3 class="section-title">Roblox’s cache on this PC</h3>
      <p class="hint">
        {status?.available
          ? `${status.entries.toLocaleString()} cached Roblox files indexed${status.building ? ' (reading more…)' : ''}. When Roblox cached a file under the same address the app is given, it comes from here instead of the web.`
          : 'Roblox isn’t installed for this Windows account, so everything comes from the web.'}
        {status?.error ? ` ${status.error}` : ''}
      </p>
      <div class="modal-actions">
        <Button
          icon="repeat"
          disabled={!status?.available || status?.building}
          onClick={() => run(reindexRobloxCache, (n) => `${n.toLocaleString()} new files indexed.`)}
        >
          Read it again
        </Button>
        <Button icon="trash-2" onClick={() => run(clearAssets, (n) => `Deleted ${n} downloaded files.`)}>
          Delete downloaded assets
        </Button>
      </div>
      {note && <p class="hint">{note}</p>}
    </>
  );
}

function SettingsDialog() {
  const tab = S.settingsTab.value;
  const setTab = (t) => (S.settingsTab.value = t);
  return (
    <Modal title="Settings" onClose={close}>
      <Segmented label="Settings" options={SETTINGS_TABS} value={tab} onChange={setTab} />
      <div class="settings-body">
        {tab === 'keys' ? (
          <KeybindsSettings />
        ) : tab === 'look' ? (
          <AppearanceSettings />
        ) : tab === 'ai' ? (
          <AiSettings />
        ) : (
          <RobloxSettings />
        )}
      </div>
    </Modal>
  );
}

export function Dialogs() {
  switch (S.dialog.value) {
    case 'account':
      return <AccountDialog />;
    case 'settings':
      return <SettingsDialog />;
    case 'import':
      return <ImportDialog />;
    case 'export':
      return <ExportDialog />;
    case 'video':
    case 'screenshot':
      return <Redirect to={S.dialog.value === 'video' ? 'video' : 'image'} />;
    case 'unsaved':
      return <UnsavedDialog />;
    case 'templates':
      return <TemplatesDialog />;
    case 'manual':
      return <ManualDialog />;
    case 'connect-ai':
      return <ConnectDialog />;
    default:
      return null;
  }
}
