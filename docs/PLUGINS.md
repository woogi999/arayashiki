# Making plugins for Arayashiki

A plugin (a mod) adds to the app: commands you can search for and bind to a
key, linter rules, tools the AI assistant and connected AI apps can call,
and Meter Maker examples. It's one JavaScript file and a `plugin.json`, in a
folder of its own. No build step, no Node.

A working example is in [plugins/example/](plugins/example/). Copy its
folder into your plugins folder, press **Reload plugins**, and change it from
there.

## Where plugins go

**Settings → Plugins → Open the plugins folder** opens it. It's
`%APPDATA%\dev.woogi.skillbuildersim\plugins\` (the exact path is shown under the
button). Each plugin is a folder inside it:

```
plugins\
  combo-tools\
    plugin.json
    main.js
```

After adding or changing a plugin, press **Reload plugins** (in Settings, or
search for it with Ctrl+Space). Each plugin has a switch there to turn it off;
a plugin that fails to load shows why in red.

## plugin.json

```json
{
  "id": "combo-tools",
  "name": "Combo tools",
  "version": "1.0.0",
  "description": "Checks combos and adds a command to add a finisher.",
  "author": "you",
  "api": "1.0",
  "main": "main.js"
}
```

| Field | |
|---|---|
| `id` | Unique, lowercase, letters, digits and `-`. The folder name if left out. |
| `name` | What Settings shows. |
| `version`, `description`, `author` | Shown in Settings. |
| `api` | The plugin API version you wrote it for. A plugin for another major version isn't loaded. Now `1.0`. |
| `main` | The module, inside the folder. `main.js` if left out. |

## main.js

An ES module that exports `activate(api)` and, if it needs to clean
something up itself, `deactivate()`:

```js
export function activate(api) {
  api.commands.register({
    id: 'hello',
    title: 'Say hello',
    run: () => api.ui.notify(`Hello from ${api.manifest.name}!`),
  });
}
```

`activate` can be `async`. Everything you register through `api` is taken
back out on its own when the plugin is turned off or reloaded.

**One file.** The module is loaded from memory, so `import './other.js'`
doesn't work. Keep it to one file, or bundle it into one (esbuild, Rollup).
Imports from full URLs aren't allowed either.

## The API

### `api.commands`

```js
api.commands.register({
  id: 'add-finisher',          // unique in your plugin
  title: 'Add a finisher',     // what the search shows
  run: async () => { … },
  keywords: 'combo end',       // more words to find it by (optional)
  icon: 'sparkles',            // an icon name (optional; a puzzle piece by default)
  shortcut: 'Ctrl+Alt+F',      // a default key (optional); users can rebind it
  when: () => true,            // only offered when this is true (optional)
});
```

The command shows up in the search (Ctrl+Space) and, with or without a
default key, in **Settings → Keybinds → Plugins**, where users can bind it.
An error thrown in `run` shows in the status bar.

`api.commands.run(id)` runs any command: the app's own (`'save'`, `'lint'`,
`'toMeter'`, `'play'`…) or a plugin's (`plugin.<plugin id>.<command id>`).

### `api.moveset`

| | |
|---|---|
| `get()` | The open moveset: an array of skills, in JJS's own format (as `decode` and the MCP tools give them). A copy: changing it changes nothing. |
| `selected()` | The open skill, or `null`. |
| `put(skills, { mode })` | Puts skills in, as one undo step. `mode`: `'merge'` (default: replaces skills with the same category and name, adds the rest), `'append'` or `'replace'`. Checked first: skills with errors aren't put in, and the errors are thrown. |
| `onChange(fn)` | Calls `fn(skills)` after every change to the moveset. |

### `api.lint`

A rule for the linter (the Problems tab):

```js
api.lint.register({
  id: 'no-huge-damage',
  run: (skills) => {
    const problems = [];
    for (const s of skills)
      for (const node of s.DATA?.Line ?? [])
        if (node.K_NAME === 'HITBOX' && Number(node.DAMAGE) > 40)
          problems.push({
            level: 'warning',      // 'error' | 'warning' | 'info' | 'tip'
            skill: `${s.K_NAME}:${s.NAME}`,
            message: `${s.NAME} hits for ${node.DAMAGE}.`,
            fix: 'Most moves do 5–25.',
          });
    return problems;
  },
});
```

`at: { branch, index }` on a problem makes clicking it open that node
(`branch` is `''` for the default line). The rule runs as the user edits, so
keep it quick. Users can turn it off like a built-in rule
(`plugin.<plugin id>.<rule id>`).

### `api.tools`

A tool for AIs: the assistant inside the app can call it, and so can AI apps
connected over MCP (it's listed in `app_state`'s `plugin_tools`).

```js
api.tools.register({
  name: 'count_hitboxes',
  description: 'How many HITBOX nodes each skill has.',
  inputSchema: { type: 'object', properties: { skill: { type: 'string' } } },
  readOnly: true,
  run: async ({ skill }) => { … return { counts }; },
});
```

The tool's full name is `<plugin id>__<name>` (dashes become `_`). `run`
returns text, or anything JSON. Inputs aren't checked against
`inputSchema`: check them yourself. A tool that changes something
(`readOnly: false`) asks the user first when the assistant is in manual
mode.

`api.tools.call(name, args)` calls any tool the assistant has: `simulate`,
`validate`, `app_simulate`, `app_screenshot`, `meter_add_layer`… (the AI
guide lists them). It returns `{ content, isError? }`.

### `api.engine`

The engine the MCP tools run on, called directly: `decode`, `encode`,
`describe`, `simulate`, `validate`, `lint`, `profile`, `nodeReference`,
`searchLibrary`, `getLibraryMove`, `handbook`… Each takes the same input as its MCP tool and returns a
promise.

```js
const report = await api.engine.simulate({ skills: api.moveset.get(), select: 'MELEE:1' });
```

### `api.meter`

`api.meter.addExample({ id, label, hint, make })` adds an example to the
Meter Maker's New dialog. `make(kit)` returns a design; `kit` has the
makers `newDoc`, `newBar`, `newShape` and `newText`:

```js
api.meter.addExample({
  id: 'thin-bar',
  label: 'Thin bar',
  hint: 'A 1-pixel-tall bar.',
  make: ({ newDoc, newBar }) => newDoc({ name: 'Thin bar', frames: 20, layers: [newBar({ x: 40, y: 500, w: 944, h: 24 })] }),
});
```

### Everything else

| | |
|---|---|
| `api.ui.notify(text)` | A line in the status bar. |
| `api.storage.get(key, fallback)` / `set(key, value)` | Your plugin's own storage (JSON values), kept between runs. |
| `api.onDispose(fn)` | Runs `fn` when the plugin is turned off or reloaded: for listeners and timers you add yourself. |
| `api.log(...)` | `console.log` with your plugin's name (in the dev build's console; in the installed app, use `ui.notify` to see things). |
| `api.id`, `api.manifest` | Your id and your plugin.json. |
| `api.apiVersion`, `api.appVersion` | The plugin API's and the app's versions. |

## Good to know

- **Plugins run with the app's full access**, like any program you run.
  Only install plugins you trust, and tell people what yours does.
- Skills are JJS's own JSON. The handbook (`docs/jjs-skill-builder.md`, or
  the `handbook` tool) has every node and field; `node_reference` has their
  defaults and allowed values.
- Changes go through `moveset.put`, so they can be undone and are checked
  like the AI's. Don't keep a moveset you got from `get()` for long: the
  user may have changed it since.
- A plugin's problem shouldn't stop the app: errors in `activate`, `run`
  and rules are caught and shown, but a loop that never ends will hang it.
- API changes: a new feature raises the minor version (`1.1`); a change
  that breaks plugins raises the major (`2.0`), and old plugins won't load
  until they're updated.
