// Starts the app: fonts and styles, then what was open last time, then the
// window. The zstd codec and the 3D view load in parallel, off the critical
// path.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/barmaker.css';
import './styles/start.css';
import './styles/features.css';
import './styles/panels.css';
import './styles/onboarding.css';
import './theme.js';
import './plugins.js';
import { render } from 'preact';
import { warmCodec } from '#codec';
import { App } from './app.jsx';
import * as S from './store.js';
import { isDesktop, onCloseRequest, onOpenRequest } from './platform.js';
import { requestExit } from './exit.js';
import { startBridge } from './ai/bridge.js';
import { loadAccount } from './account.js';
import { checkOnLaunch } from './updates.js';
import { installScrub } from './scrub.js';
import { migrateLayout } from './ui/dock.jsx';
import { welcomeOnFirstRun } from './onboarding.js';

// The UI's errors go to ui.log in the app's config folder (no console in
// release builds), for bug reports.
if (isDesktop) {
  const log = (text) => import('@tauri-apps/api/core').then(({ invoke }) => invoke('ui_log', { line: `${new Date().toISOString()} ${text}` })).catch(() => {});
  addEventListener('error', (e) => log(`error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}
${e.error?.stack ?? ''}`));
  addEventListener('unhandledrejection', (e) => log(`unhandled: ${e.reason?.stack ?? e.reason}`));
}

// Restoring is one IndexedDB read (a few ms); waiting for it avoids a flash
// of the starter moveset. It never holds the window up for long.
await Promise.race([S.restore(), new Promise((resolve) => setTimeout(resolve, 400))]);
migrateLayout();
render(<App />, document.getElementById('app'));
// For UI checks (screenshot scripts): open a dialog by name.
window.__arayashikiOpen = (name) => (S.dialog.value = name);
window.__arayashikiRun = (id) => import('./commands.js').then((m) => m.run(id));

// Codes handed over by `sbs open` / the MCP server / a .txt opened with the app.
onOpenRequest((request) => S.openText(request));

// Closing with unsaved work asks first (the "unsaved" dialog); the
// browser's own prompt does it outside the desktop app.
onCloseRequest(requestExit);
addEventListener('beforeunload', (event) => {
  if (S.dirty.peek()) event.preventDefault();
});

(window.requestIdleCallback ?? setTimeout)(() => warmCodec());

// AI apps reach the open app through the bridge (src/ai/bridge.js).
startBridge().catch(() => {});

// The Roblox account, if signed in before: name, picture, avatar on "You".
loadAccount({ refresh: true });

// The first launch offers the quick tour (src/ui/tour.jsx); every launch
// quietly asks GitHub for a newer release (src/updates.js).
welcomeOnFirstRun();
checkOnLaunch();
installScrub();
