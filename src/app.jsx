// The window, laid out like Blender's: the 3D Viewport in the centre, the
// Nodes editor to its left, the Outliner and Properties down the right, the
// Timeline along the bottom, and a status bar. Every area edge drags.
import { useEffect } from 'preact/hooks';
import * as S from './store.js';
import { TopBar } from './ui/topbar.jsx';
import { NodeEditor } from './ui/nodes.jsx';
import { Viewport } from './ui/viewport.jsx';
import { Outliner } from './ui/outliner.jsx';
import { PropertiesEditor } from './ui/properties.jsx';
import { Timeline } from './ui/timeline.jsx';
import { DockLayout, sane } from './ui/dock.jsx';
import { StartScreen } from './ui/start.jsx';
import { Dialogs } from './ui/dialogs.jsx';
import { ACTIONS, actionOf, bindingOf } from './keybinds.js';
import { run as runCommand } from './commands.js';
import { lazy } from './ui/lazy.jsx';
import { ContextMenu } from './ui/context-menu.jsx';
import { SearchPalette } from './ui/search.jsx';

const AnimatorPanel = lazy(() => import('./ui/animator.jsx'), 'AnimatorPanel');
const CameraPathPanel = lazy(() => import('./ui/campath.jsx'), 'CameraPathPanel');
const AssistantPanel = lazy(() => import('./ai/panel.jsx'), 'AssistantPanel');
const animatorOpen = () => S.animatorOpen.peek();
import { BarMaker, BarZoom, barStatus } from './barmaker/maker.jsx';

// Text fields keep their keys; checkboxes, sliders and buttons don't (Space
// plays, it doesn't press whatever was clicked last).
const TEXT_INPUTS = ['text', 'search', 'number', 'email', 'url', 'password', 'tel', ''];
const isTyping = (el) =>
  el?.isContentEditable ||
  ['TEXTAREA', 'SELECT'].includes(el?.tagName) ||
  (el?.tagName === 'INPUT' && TEXT_INPUTS.includes(el.type ?? ''));

// Shortcuts that work even while typing in a field (the file shortcuts).
const GLOBAL = new Set(['save', 'saveAs', 'open', 'import', 'export', 'templates', 'new', 'search', 'assistant', 'manual', 'screenshot', 'exportVideo', 'quickShot']);

function onKey(event) {
  const action = actionOf(event);
  // Search, the assistant and the manual work everywhere, dialogs or not.
  if (action && ACTIONS.find((a) => a.id === action)?.everywhere) {
    event.preventDefault();
    return runCommand(action);
  }
  if (S.dialog.value) return; // the dialog handles its own keys (Escape closes)
  if (S.workspace.value !== 'skills') return; // the workspace handles its own
  // On the start screen, only the file shortcuts work (and Esc goes in).
  if (S.showStart.value && !GLOBAL.has(action)) return;
  if (!action) return;
  if (!GLOBAL.has(action) && isTyping(event.target)) return;
  // Ctrl+Shift+Z redoes as well.
  const run = action === 'undo' && event.shiftKey ? 'redo' : action;
  if (run === 'play') {
    // Blur what was clicked, or its keyup would press it as well.
    if (event.target instanceof HTMLElement && event.target !== document.body) event.target.blur();
    event.preventDefault();
    if (!event.repeat) S.play();
    return;
  }
  if ((run === 'frameBack' || run === 'frameNext') && !event.target?.closest?.('.meter, .resizer')) {
    event.preventDefault();
    S.stepFrames((run === 'frameBack' ? -1 : 1) * (event.shiftKey ? 10 : 1));
    return;
  }
  if (event.target?.closest?.('.meter, .resizer') && /^(node|move)/.test(run)) return; // they use the arrows themselves
  event.preventDefault();
  if (run === 'cameraKey' && animatorOpen()) return import('./ui/animator.jsx').then((m) => m.keyFromViewShortcut());
  if (run === 'cameraKey' && S.camPathOpen.peek()) return import('./ui/campath.jsx').then((m) => m.addViewKey());
  runCommand(run);
}

function StatusBar() {
  if (S.workspace.value === 'bars')
    return (
      <footer class="statusbar">
        <span class="status-msg" role="status">
          {barStatus()}
        </span>
        <span class="spacer" />
        <span class="status-keys">
          <kbd>V</kbd> Move <kbd>B</kbd> Brush <kbd>U</kbd> Shapes <kbd>T</kbd> Text <kbd>Space</kbd> Play{' '}
          <kbd>Ctrl Wheel</kbd> Zoom
        </span>
        <BarZoom />
      </footer>
    );
  const nodes = S.skillRows.value.reduce((n, r) => n + r.nodes, 0);
  return (
    <footer class="statusbar">
      <span class="status-msg" role="status">
        {S.status.value ?? 'Ready'}
      </span>
      <span class="spacer" />
      <span class="status-keys">
        <kbd>{bindingOf('play')}</kbd> Play <kbd>{bindingOf('frameBack')}</kbd>
        <kbd>{bindingOf('frameNext')}</kbd> Frame <kbd>Wheel</kbd> Zoom timeline <kbd>{bindingOf('undo')}</kbd> Undo
      </span>
      <span class="status-stats num">
        {S.skills.value.length} skills · {nodes} nodes in this category · a model of JJS, not the game
      </span>
    </footer>
  );
}

const PANEL = {
  nodes: () => <NodeEditor />,
  view: () => <Viewport />,
  time: () => <Timeline />,
  outliner: () => <Outliner />,
  properties: () => <PropertiesEditor />,
};

function SkillsWorkspace() {
  if (!S.layout.value || sane(S.layout.value) !== S.layout.value) {
    S.layout.value = sane(S.layout.value);
    return null;
  }
  return <DockLayout render={(id) => PANEL[id]?.() ?? null} />;
}

export function App() {
  useEffect(() => {
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class={`app ${S.assistantOpen.value ? 'with-assistant' : ''}`}>
      <TopBar />
      {S.workspace.value === 'bars' ? <BarMaker /> : S.showStart.value ? <StartScreen /> : <SkillsWorkspace />}
      <StatusBar />
      {S.animatorOpen.value && <AnimatorPanel />}
      {S.camPathOpen.value && <CameraPathPanel />}
      {S.assistantOpen.value && <AssistantPanel />}
      <Dialogs />
      <SearchPalette />
      <ContextMenu />
    </div>
  );
}
