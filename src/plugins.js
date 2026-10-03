// Plugins (mods): folders in the app's config folder, `plugins\<id>\`, each a
// plugin.json and one ES module. At startup the enabled ones are loaded and
// their `activate(api)` is called with the plugin API below; what they
// register (commands, keybinds, AI tools, linter rules, meter examples) is
// taken back out when they're turned off or reloaded. The creator's guide is
// docs/PLUGINS.md: keep it in step with this file.
import { effect, signal } from '@preact/signals';
import * as S from './store.js';
import { COMMANDS } from './commands.js';
import { ACTIONS, GROUPS } from './keybinds.js';
import { isDesktop } from './platform.js';

/** The plugin API's version: bump the major on a breaking change. */
export const API_VERSION = '1.0';

const KEY = 'arayashiki-plugins';
const readPrefs = () => {
  try {
    return { disabled: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { disabled: [] };
  }
};
export const pluginPrefs = signal(readPrefs());
const keepPrefs = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(pluginPrefs.peek()));
  } catch {
    // not kept
  }
};

/** Every plugin found: { id, folder, name, version, description, author, enabled, state: 'on'|'off'|'error', error?, made }. */
export const plugins = signal([]);
export const pluginsLoading = signal(false);
/** Linter rules plugins add: { id, plugin, run(skills) } (src/linter.js runs them). */
export const pluginLintRules = signal([]);

const live = new Map(); // id → { module, undo: [fn] }

const invoke = async (name, args) => (await import('@tauri-apps/api/core')).invoke(name, args);
const idOf = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin';

function makeApi(id, manifest, undo) {
  const own = (name) => `plugin.${id}.${idOf(name)}`;
  const storeKey = `arayashiki-plugin:${id}`;
  const tools = () => import('./ai/registry.js');
  const engine = () => import('../agent/tools-core.js');
  const api = {
    id,
    manifest,
    apiVersion: API_VERSION,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',

    /** A command: in the search (Ctrl+Space), and a keybind if it has a `shortcut` (rebindable in Settings). */
    commands: {
      register({ id: name, title, run, keywords = '', icon = 'puzzle', when, shortcut = '' }) {
        if (!name || !title || typeof run !== 'function') throw new Error('commands.register needs id, title and run.');
        const cid = own(name);
        const safeRun = async () => {
          try {
            await run();
          } catch (e) {
            S.status.value = `${manifest.name ?? id}: ${e?.message ?? e}`;
          }
        };
        COMMANDS.push({ id: cid, title, group: 'Plugins', icon, keywords: `${keywords} plugin ${manifest.name ?? id}`, run: safeRun, when, plugin: id });
        ACTIONS.push({ id: cid, group: 'Plugins', label: `${title} (${manifest.name ?? id})`, def: shortcut, scope: 'everywhere', plugin: id });
        if (!GROUPS.includes('Plugins')) GROUPS.push('Plugins');
        undo.push(() => {
          const c = COMMANDS.findIndex((x) => x.id === cid);
          if (c >= 0) COMMANDS.splice(c, 1);
          const a = ACTIONS.findIndex((x) => x.id === cid);
          if (a >= 0) ACTIONS.splice(a, 1);
        });
        return cid;
      },
      /** Runs any command by id (the app's own too: 'save', 'lint', 'toMeter'…). */
      run: async (cid) => (await import('./commands.js')).run(cid),
    },

    /** An AI tool: the assistant and AI apps connected over MCP can call it. */
    tools: {
      async register({ name, title, description, inputSchema, readOnly = false, run }) {
        if (!name || !description || typeof run !== 'function') throw new Error('tools.register needs name, description and run.');
        const full = `${idOf(id).replace(/-/g, '_')}__${String(name).replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const { registerTool } = await tools();
        undo.push(
          registerTool({
            name: full,
            title: title ?? name,
            description: `${description} (From the plugin “${manifest.name ?? id}”.)`,
            inputSchema: inputSchema ?? { type: 'object', properties: {} },
            readOnly,
            plugin: id,
            run,
          }),
        );
        return full;
      },
      /** Calls any tool the assistant has (app_get_skills, simulate, meter_add_layer…): { content, isError? }. */
      call: async (name, args) => (await tools()).callTool(name, args),
    },

    /** A linter rule: run(skills) returns problems { level: 'error'|'warning'|'info'|'tip', message, skill?, at?, fix? }. */
    lint: {
      register({ id: name, run }) {
        if (!name || typeof run !== 'function') throw new Error('lint.register needs id and run.');
        const rule = { id: own(name), plugin: id, run };
        pluginLintRules.value = [...pluginLintRules.peek(), rule];
        undo.push(() => (pluginLintRules.value = pluginLintRules.peek().filter((r) => r !== rule)));
        return rule.id;
      },
    },

    /** The open moveset. put() goes through the same checks as the AI's, as one undo step. */
    moveset: {
      get: () => S.skills.peek().map(({ uid: _uid, ...s }) => structuredClone(s)),
      selected: () => {
        const s = S.skill.peek();
        if (!s) return null;
        const { uid: _uid, ...rest } = s;
        return structuredClone(rest);
      },
      async put(skills, { mode = 'merge', name } = {}) {
        const out = await api.tools.call('app_put_skills', { skills, mode, ...(name ? { name } : {}) });
        if (out.isError) throw new Error(out.content?.[0]?.text ?? 'Not put in.');
        return JSON.parse(out.content?.[0]?.text ?? '{}');
      },
      /** Calls fn whenever the moveset changes; returns a function that stops it. */
      onChange(fn) {
        let first = true;
        const stop = effect(() => {
          const skills = S.skills.value;
          if (first) return void (first = false);
          try {
            fn(skills.map(({ uid: _uid, ...s }) => s));
          } catch (e) {
            console.error(`[plugin ${id}]`, e);
          }
        });
        undo.push(stop);
        return stop;
      },
    },

    /** The engine, as the MCP tools have it: decode, encode, simulate, validate, describe, lint, profile… */
    engine: new Proxy(
      {},
      {
        get:
          (_, fn) =>
          async (...args) => {
            const T = await engine();
            fn = { simulate: 'simulateSkill' }[fn] ?? fn;
            if (typeof T[fn] !== 'function') throw new Error(`The engine has no ${String(fn)}.`);
            return T[fn](...args);
          },
      },
    ),

    /** The Meter Maker: add examples to its New dialog. */
    meter: {
      async addExample({ id: name, label, hint = '', make }) {
        if (!name || !label || typeof make !== 'function') throw new Error('meter.addExample needs id, label and make.');
        const B = await import('./barmaker/state.js');
        const D = await import('./barmaker/draw.js');
        const ex = {
          id: own(name),
          label,
          hint,
          plugin: id,
          make: () => {
            const d = make({ newDoc: D.newDoc, newBar: D.newBar, newShape: D.newShape, newText: D.newText });
            return D.newDoc(d);
          },
        };
        B.EXAMPLES.push(ex);
        undo.push(() => {
          const i = B.EXAMPLES.indexOf(ex);
          if (i >= 0) B.EXAMPLES.splice(i, 1);
        });
        return ex.id;
      },
    },

    ui: {
      /** A line in the status bar. */
      notify: (text) => (S.status.value = String(text)),
    },

    /** This plugin's own storage, kept between runs (JSON values). */
    storage: {
      get(key, fallback = null) {
        try {
          const all = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
          return key in all ? all[key] : fallback;
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try {
          const all = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
          all[key] = value;
          localStorage.setItem(storeKey, JSON.stringify(all));
        } catch {
          // not kept
        }
      },
    },

    /** Something to undo when the plugin is turned off (a listener, a timer). */
    onDispose: (fn) => undo.push(fn),
    log: (...args) => console.log(`[plugin ${id}]`, ...args),
  };
  return api;
}

async function activate(found) {
  const { manifest, code } = found;
  const id = found.id;
  const undo = [];
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ url);
    if (typeof module.activate !== 'function') throw new Error('Its module has no exported activate(api).');
    live.set(id, { module, undo });
    await module.activate(makeApi(id, manifest, undo));
  } catch (e) {
    await deactivate(id, undo);
    throw e;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function deactivate(id, undoList) {
  const got = live.get(id);
  const undo = undoList ?? got?.undo ?? [];
  try {
    await got?.module?.deactivate?.();
  } catch (e) {
    console.error(`[plugin ${id}] deactivate`, e);
  }
  for (const fn of undo.splice(0).reverse()) {
    try {
      fn();
    } catch (e) {
      console.error(`[plugin ${id}] dispose`, e);
    }
  }
  live.delete(id);
}

const major = (v) => Number(String(v ?? '').split('.')[0]);

/** Finds the plugins on disk and (re)loads the enabled ones. */
export async function loadPlugins() {
  if (!isDesktop) return;
  pluginsLoading.value = true;
  for (const id of [...live.keys()]) await deactivate(id);
  const disabled = pluginPrefs.peek().disabled;
  const out = [];
  try {
    for (const p of await invoke('plugins_list')) {
      const m = p.manifest ?? {};
      const id = idOf(m.id ?? p.folder);
      const row = { id, folder: p.folder, name: m.name ?? p.folder, version: m.version ?? '', description: m.description ?? '', author: m.author ?? '', enabled: !disabled.includes(id) };
      if (p.error) out.push({ ...row, state: 'error', error: p.error });
      else if (out.some((o) => o.id === id)) out.push({ ...row, state: 'error', error: `Another plugin already has the id “${id}”.` });
      else if (m.api && major(m.api) !== major(API_VERSION)) out.push({ ...row, state: 'error', error: `Made for plugin API ${m.api}; this Arayashiki has ${API_VERSION}.` });
      else if (!row.enabled) out.push({ ...row, state: 'off' });
      else {
        try {
          await activate({ id, manifest: m, code: p.code });
          out.push({ ...row, state: 'on' });
        } catch (e) {
          out.push({ ...row, state: 'error', error: e?.message ?? String(e) });
        }
      }
    }
  } catch (e) {
    S.status.value = `Couldn’t read the plugins: ${e?.message ?? e}`;
  } finally {
    plugins.value = out;
    pluginsLoading.value = false;
  }
  // Their linter rules (or the lack of them) show at once.
  (await import('./linter.js')).runLint();
}

export function setPluginEnabled(id, on) {
  const disabled = pluginPrefs.peek().disabled.filter((x) => x !== id);
  pluginPrefs.value = { ...pluginPrefs.peek(), disabled: on ? disabled : [...disabled, id] };
  keepPrefs();
  return loadPlugins();
}

export const openPluginsFolder = () => invoke('plugins_open_folder');
export const pluginsFolder = () => (isDesktop ? invoke('plugins_folder') : Promise.resolve(null));

if (isDesktop) setTimeout(() => loadPlugins(), 0);
