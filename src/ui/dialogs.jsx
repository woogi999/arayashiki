// The dialogs: bringing a code in, taking one out, the saved movesets, and
// the library of real moves.
import { Fragment } from 'preact';
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
import { ACTIONS, GROUPS, LAYOUTS, bindingOf, clashesOf, comboOf, custom, defaultOf, layout, layoutChosen, rebind, resetBinds, setLayout } from '../keybinds.js';
import { appearance, BACKGROUNDS, setAppearance } from '../prefs.js';
import { CUSTOM_KEYS, THEMES, loadThemeJson, setCustom, setTheme, themeJson, tokenNow } from '../theme.js';
import { openUpdates, setUpdatePrefs, updatePrefs } from '../updates.js';
import { startTour } from '../onboarding.js';
import { saveLayout, savedLayouts } from './dock.jsx';
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
const ImpactDialog = lazy(() => import('./impact.jsx'), 'ImpactDialog');
const ChangelogDialog = lazy(() => import('./changelog.jsx'), 'ChangelogDialog');
const ConnectDialog = lazy(() => import('../ai/connect.jsx'), 'ConnectDialog');
const LocalModels = lazy(() => import('../ai/local-ui.jsx'), 'LocalModels');
const assistantConfig = () => import('../ai/panel.jsx');
const UpdatesDialog = lazy(() => import('./updates.jsx'), 'UpdatesDialog');
const WelcomeDialog = lazy(() => import('./tour.jsx'), 'WelcomeDialog');
const Tour = lazy(() => import('./tour.jsx'), 'Tour');
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
  { id: 'plugins', label: 'Plugins' },
  { id: 'updates', label: 'Updates' },
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
  void layoutChosen.value;
  return (
    <>
      <label class="prop-row">
        <span title="The shortcuts' defaults follow your keyboard: flying is on the keys where QWERTY has W A S D, whatever they type">
          Keyboard layout
        </span>
        <select class="input" value={layout.value} onChange={(e) => setLayout(e.currentTarget.value)}>
          {LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} ({l.hint})
            </option>
          ))}
        </select>
      </label>
      <p class="hint">
        Click a shortcut, then press the keys you want (Escape keeps the old one). Every command has one; clear any you
        don’t want. A shortcut that another one also uses is marked.
      </p>
      <div class="keybinds">
        {GROUPS.map((g) => (
          <Fragment key={g}>
            <h4 class="section-title keybind-group">{g}</h4>
            {ACTIONS.filter((a) => a.group === g).map((a) => {
              const b = bindingOf(a.id);
              const clash = clashesOf(a.id);
              return (
                <div class={`keybind ${clash.length ? 'is-clash' : ''}`} key={a.id}>
                  <span>
                    {a.label}
                    {clash.length > 0 && <small class="keybind-clash">Also: {clash.map((c) => c.label).join(', ')}</small>}
                  </span>
                  <button
                    type="button"
                    class={`keybind-key ${waiting === a.id ? 'is-waiting' : ''}`}
                    onClick={() => setWaiting(a.id)}
                  >
                    {waiting === a.id ? 'Press keys…' : b ? <kbd>{b}</kbd> : <span class="hint">None</span>}
                  </button>
                  {b !== defaultOf(a.id) ? (
                    <IconButton
                      icon="undo"
                      size={13}
                      label={defaultOf(a.id) ? `Back to ${defaultOf(a.id)}` : 'Back to none'}
                      title={defaultOf(a.id) ? `Back to ${defaultOf(a.id)}` : 'Back to none'}
                      onClick={() => rebind(a.id, null)}
                    />
                  ) : b ? (
                    <IconButton icon="x" size={13} label="No shortcut" title="No shortcut" onClick={() => rebind(a.id, '')} />
                  ) : (
                    <span class="field-reset-space" />
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div class="modal-actions">
        <span class="spacer" />
        <Button onClick={resetBinds}>Reset all</Button>
      </div>
    </>
  );
}

// Themes: the presets as cards (a little window in each one's colours),
// and the custom theme's colours over its preset.
function ThemePicker() {
  const a = appearance.value;
  const current = a.theme ?? 'dark';
  const custom = a.customTheme;
  const [note, setNote] = useState(null);
  return (
    <section class="theme-picker" aria-label="Theme">
      <h4 class="section-title">Theme</h4>
      <div class="theme-cards" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button type="button" role="radio" aria-checked={current === t.id} key={t.id} class="theme-card" title={t.hint} onClick={() => setTheme(t.id)}>
            <span class="theme-swatch" style={{ background: t.tokens['--ground'] ?? t.grey(4), borderColor: t.grey(21) }}>
              <span style={{ background: t.tokens['--panel'] ?? t.grey(13) }} />
              <span style={{ background: t.tokens['--area'] ?? t.grey(9) }}>
                <i style={{ background: t.tokens['--text'] ?? t.grey(89) }} />
                <i style={{ background: t.tokens['--play'] ?? '#c8f542' }} />
              </span>
            </span>
            <strong>{t.label}</strong>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={current === 'custom'} class="theme-card" title="A preset with colours of your own" onClick={() => setCustom({})}>
          <span class="theme-swatch is-custom">
            <Icon name="sliders" size={18} />
          </span>
          <strong>Custom</strong>
        </button>
      </div>
      {current === 'custom' && (
        <div class="theme-custom">
          <label class="prop-row">
            <span>Starts from</span>
            <select class="input" value={custom?.base ?? 'dark'} onChange={(e) => setCustom({ base: e.currentTarget.value })}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {CUSTOM_KEYS.map(([name, label]) => (
            <label class="prop-row" key={name}>
              <span>{label}</span>
              <span class="theme-colour">
                <input type="color" value={custom?.tokens?.[name] ?? tokenNow(name)} aria-label={label} onInput={(e) => setCustom({ tokens: { [name]: e.currentTarget.value } })} />
                {custom?.tokens?.[name] && (
                  <IconButton icon="undo" size={12} label={`${label}: the preset's again`} onClick={() => setCustom({ tokens: { [name]: '' } })} />
                )}
              </span>
            </label>
          ))}
          <div class="modal-actions">
            <Button
              icon="copy"
              onClick={() => navigator.clipboard.writeText(themeJson()).then(() => setNote('Copied: paste it on another PC with “Paste a theme”.'))}
            >
              Copy theme
            </Button>
            <Button
              icon="paste"
              onClick={async () => {
                try {
                  loadThemeJson(await navigator.clipboard.readText());
                  setNote('Theme pasted.');
                } catch (e) {
                  setNote(String(e?.message ?? e));
                }
              }}
            >
              Paste a theme
            </Button>
          </div>
          {note && <p class="hint">{note}</p>}
        </div>
      )}
    </section>
  );
}

function AppearanceSettings() {
  const a = appearance.value;
  const [onLaunch, setOnLaunch] = useState(S.startOnLaunch());
  return (
    <>
      <ThemePicker />
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

// The built-in models, here as well as in the assistant's settings: what's
// downloaded, what can be, and using one in the assistant.
function LocalAi() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    assistantConfig().then((m) => setCfg(m));
  }, []);
  if (!cfg) return <p class="hint">Loading…</p>;
  const c = cfg.config.value;
  return (
    <>
      <LocalModels
        model={c.models.local ?? ''}
        ctx={c.localCtx ?? 32768}
        gpu={c.localGpu ?? true}
        onModel={(file) => cfg.setConfig({ models: { ...cfg.config.peek().models, local: file } })}
        onOptions={(patch) => cfg.setConfig(patch)}
      />
      <div class="modal-actions">
        <span class="hint">
          {c.provider === 'local' ? 'The assistant uses a model on this PC.' : 'The assistant uses another service now.'}
        </span>
        <span class="spacer" />
        {c.provider !== 'local' && (
          <Button icon="bot" onClick={() => cfg.setConfig({ provider: 'local' })}>
            Use it in the assistant
          </Button>
        )}
      </div>
    </>
  );
}

// Memories: on or off, and what's in them, to read and delete.
function MemorySettings() {
  const [mem, setMem] = useState(null);
  const [list, setList] = useState({ notes: [], movesets: [] });
  const [note, setNote] = useState(null);
  useEffect(() => {
    import('../ai/memory.js').then(setMem);
  }, []);
  const version = mem?.memoryVersion.value;
  useEffect(() => {
    if (!mem) return;
    Promise.all([mem.listNotes(), mem.listMovesets()]).then(([notes, movesets]) => setList({ notes, movesets }));
  }, [mem, version]);
  if (!mem) return null;
  const on = mem.memoryOn.value;
  return (
    <>
      <h3 class="section-title">Memories</h3>
      <label class="prop-row">
        <span>Let the AI remember</span>
        <Switch checked={on} label="Let the AI remember" onChange={(v) => mem.setMemoryOn(v)} />
      </label>
      <p class="hint">
        The AI keeps short notes on what it learns here (your preferences, JJS rules it finds out, what worked) and movesets you
        ask it to remember, with their style, to build like them again. It reads them at the start of a conversation: the
        assistant here and AI apps connected through MCP alike. Kept on this PC only.
      </p>
      {on && (
        <>
          <div class="modal-actions">
            <Button
              icon="save"
              onClick={() =>
                mem
                  .rememberMoveset({})
                  .then((r) => setNote(`Remembered “${r.name}”: ${r.profile.summary}`))
                  .catch((e) => setNote(String(e?.message ?? e)))
              }
            >
              Remember the open moveset
            </Button>
            <span class="spacer" />
            {(list.notes.length > 0 || list.movesets.length > 0) && (
              <Button variant="ghost" icon="trash-2" class="danger" onClick={() => mem.clearMemories().then(() => setNote('Everything forgotten.'))}>
                Forget everything
              </Button>
            )}
          </div>
          {note && <p class="hint">{note}</p>}
          <ul class="memory-list">
            {list.movesets.map((m) => (
              <li key={m.id}>
                <Icon name="layers" size={13} />
                <span>
                  <strong>{m.name}</strong>
                  <small>{m.summary}</small>
                </span>
                <IconButton icon="trash-2" size={12} label={`Forget ${m.name}`} onClick={() => mem.forget(m.id)} />
              </li>
            ))}
            {list.notes.map((n) => (
              <li key={n.id}>
                <span class="memory-kind">{n.kind}</span>
                <span>{n.text}</span>
                <IconButton icon="trash-2" size={12} label="Forget this" onClick={() => mem.forget(n.id)} />
              </li>
            ))}
            {!list.notes.length && !list.movesets.length && <li class="empty">Nothing yet: the AI adds to this as you work together.</li>}
          </ul>
        </>
      )}
    </>
  );
}

// Whether AIs may upload what they make (meters, pictures, sounds, models) to the user's Roblox account.
function AiUploadSetting() {
  const [kit, setKit] = useState(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    import('../ai/media.js').then((m) => (setKit(m), setOn(m.uploadsAllowed())));
  }, []);
  if (!kit) return null;
  return (
    <>
      <h3 class="section-title">Uploads</h3>
      <label class="prop-row">
        <span>Let AIs upload to my Roblox account</span>
        <Switch checked={on} label="Let AIs upload to my Roblox account" onChange={(v) => (kit.allowUploads(v), setOn(v))} />
      </label>
      <p class="hint">
        So an AI can put what it makes into your skills: a meter’s pictures, and pictures, sounds and 3D models it made (checked
        first: PNGs up to 1024 px, sounds up to 7 minutes, models up to 20,000 triangles). They go to the Roblox account you’re
        signed in with. Off, it hands you the files instead.
      </p>
    </>
  );
}

// Plugins (mods): src/plugins.js loads them; docs/PLUGINS.md is the creators' guide.
function PluginSettings() {
  const [kit, setKit] = useState(null);
  const [folder, setFolder] = useState(null);
  useEffect(() => {
    import('../plugins.js').then((m) => (setKit(m), m.pluginsFolder().then(setFolder, () => {})));
  }, []);
  if (!isDesktop) return <p class="hint">Plugins run in the desktop app.</p>;
  if (!kit) return null;
  const list = kit.plugins.value;
  const busy = kit.pluginsLoading.value;
  return (
    <>
      <h3 class="section-title">Plugins</h3>
      <p class="hint">
        Plugins add commands, keybinds, linter rules, AI tools and Meter Maker examples. Each is a folder in the plugins folder
        with a plugin.json and a main.js. A plugin runs with the same access as the app, so only add ones you trust.
      </p>
      <div class="modal-actions">
        <Button icon="folder" onClick={() => kit.openPluginsFolder()}>
          Open the plugins folder
        </Button>
        <Button variant="ghost" icon="refresh" disabled={busy} onClick={() => kit.loadPlugins()}>
          {busy ? 'Loading…' : 'Reload plugins'}
        </Button>
        <span class="spacer" />
        <Button variant="ghost" icon="help" onClick={() => ((S.manualSection.value = 'Plugins'), (S.dialog.value = 'manual'))}>
          Making plugins
        </Button>
      </div>
      {folder && <p class="hint mono-path">{folder}</p>}
      <ul class="memory-list plugin-list">
        {list.map((p) => (
          <li key={p.id} class={p.state === 'error' ? 'is-error' : ''}>
            <Icon name="puzzle" size={13} />
            <span>
              <strong>
                {p.name}
                {p.version && <small class="plugin-version"> {p.version}</small>}
              </strong>
              <small>{p.state === 'error' ? p.error : p.description || (p.author ? `By ${p.author}` : p.folder)}</small>
            </span>
            <Switch checked={p.enabled} label={`${p.enabled ? 'Turn off' : 'Turn on'} ${p.name}`} onChange={(v) => kit.setPluginEnabled(p.id, v)} />
          </li>
        ))}
        {!list.length && <li class="empty">No plugins yet. Put one’s folder in the plugins folder, then Reload.</li>}
      </ul>
    </>
  );
}

function AiSettings() {
  return (
    <>
      <h3 class="section-title">The assistant inside Arayashiki</h3>
      <p class="hint">
        Chat with your own AI (Claude, ChatGPT, Gemini, OpenRouter), or a free one that runs on this PC (below). It reads
        and edits the open moveset, simulates, takes screenshots, exports videos and animates cameras, and everything it
        changes can be undone.
      </p>
      <h3 class="section-title">Models on this PC (free)</h3>
      {isDesktop ? <LocalAi /> : <p class="hint">Models on this PC run in the desktop app.</p>}
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
      <MemorySettings />
      <AiUploadSetting />
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

function UpdatesSettings() {
  const p = updatePrefs.value;
  return (
    <>
      <p class="hint">
        This is Arayashiki <span class="num">{__APP_VERSION__}</span>. New versions come out on GitHub. The app fetches
        them in the background and installs them when it restarts, or the next time you open it; your movesets and
        settings stay as they are.
      </p>
      <div class="prop-row">
        <span>Check for updates at launch</span>
        <Switch checked={p.auto} label="Check for updates at launch" onChange={(on) => setUpdatePrefs({ auto: on })} />
      </div>
      <div class="prop-row">
        <span>Download updates by themselves</span>
        <Switch
          checked={p.download}
          label="Download updates by themselves"
          onChange={(on) => setUpdatePrefs({ download: on })}
        />
      </div>
      {p.skipped && (
        <div class="prop-row">
          <span>Skipped version</span>
          <span class="settings-inline">
            <span class="num">{p.skipped}</span>
            <Button variant="ghost" onClick={() => setUpdatePrefs({ skipped: null })}>
              Remind me again
            </Button>
          </span>
        </div>
      )}
      <div class="modal-actions">
        <Button icon="sparkles" variant="ghost" onClick={startTour}>
          Take the quick tour again
        </Button>
        <Button icon="file-text" variant="ghost" onClick={() => (S.dialog.value = 'changelog')}>
          What’s new
        </Button>
        <span class="spacer" />
        <Button icon="refresh" onClick={openUpdates}>
          Check for updates now
        </Button>
      </div>
    </>
  );
}

function SaveLayoutDialog() {
  const [name, setName] = useState('');
  const taken = name.trim() && name.trim() in savedLayouts.value;
  const go = () => saveLayout(name) && close();
  return (
    <Modal title="Save the panel layout" class="modal-small" onClose={close}>
      <p class="hint">Keeps where the panels are and how big. Load it again from Layout in the top bar.</p>
      <input
        class="input"
        maxLength={40}
        placeholder="Layout name, e.g. Animating"
        value={name}
        autoFocus
        onInput={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && go()}
      />
      {taken && <p class="hint">That replaces the saved layout of the same name.</p>}
      <div class="modal-actions">
        <span class="spacer" />
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" icon="save" disabled={!name.trim()} onClick={go}>
          Save
        </Button>
      </div>
    </Modal>
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
        ) : tab === 'updates' ? (
          <UpdatesSettings />
        ) : tab === 'plugins' ? (
          <PluginSettings />
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
    case 'impact':
      return <ImpactDialog />;
    case 'changelog':
      return <ChangelogDialog />;
    case 'connect-ai':
      return <ConnectDialog />;
    case 'updates':
      return <UpdatesDialog />;
    case 'save-layout':
      return <SaveLayoutDialog />;
    case 'welcome':
      return <WelcomeDialog />;
    case 'tour':
      return <Tour />;
    default:
      return null;
  }
}
