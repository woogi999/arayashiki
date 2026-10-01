// Everything the app can do, by name: what keyboard shortcuts run
// (src/keybinds.js), what the universal search lists (src/ui/search.jsx)
// and what the right-click menus offer (src/ui/context-menu.jsx). Each
// command: { id, title, group, keywords, icon, run, when?, shortcut? }.
import * as S from './store.js';
import * as B from './barmaker/state.js';
import { bindingOf } from './keybinds.js';
import { requestExit } from './exit.js';
import { setAppearance, appearance, BACKGROUNDS } from './prefs.js';
import { resetLayout } from './ui/dock.jsx';
import { startTour } from './onboarding.js';
import { openUpdates } from './updates.js';

const skills = () => S.workspace.peek() === 'skills';
const editing = () => skills() && !S.showStart.peek();
const hasSkill = () => editing() && Boolean(S.skill.peek());
const hasNode = () => hasSkill() && Boolean(S.selectedNode.peek());
const dialog = (name) => () => (S.dialog.value = name);
const toSkills = () => {
  S.workspace.value = 'skills';
  S.showStart.value = false;
};
const animator = () => import('./ui/animator.jsx');
const media = () => import('./ui/media.jsx');
const assistant = () => import('./ai/panel.jsx');

export const COMMANDS = [
  // File
  { id: 'new', title: 'New Character', group: 'File', icon: 'file-plus', keywords: 'new moveset start fresh', run: () => (toSkills(), S.newMoveset()) },
  { id: 'open', title: 'Open a .txt', group: 'File', icon: 'folder', keywords: 'open file load code', run: () => S.openFile() },
  { id: 'import', title: 'Import a code', group: 'File', icon: 'file-text', keywords: 'paste code jjs KLUv', run: dialog('import') },
  { id: 'save', title: 'Save', group: 'File', icon: 'save', keywords: 'save txt', run: () => (S.workspace.peek() === 'bars' ? B.saveHere() : S.saveHere()) },
  { id: 'saveAs', title: 'Save As…', group: 'File', icon: 'save', keywords: 'save as copy txt', run: () => S.saveHere({ as: true }) },
  { id: 'export', title: 'Export code (copy for JJS)', group: 'File', icon: 'copy', keywords: 'export copy code jjs clipboard', run: () => S.openExport('code') },
  { id: 'templates', title: 'Templates', group: 'File', icon: 'sparkles', keywords: 'ready made skills form m1 dash sheathe percentage meter', run: dialog('templates') },
  { id: 'start', title: 'Start screen', group: 'File', icon: 'layout', keywords: 'home splash welcome recent', run: () => ((S.workspace.value = 'skills'), (S.showStart.value = true)) },
  { id: 'exit', title: 'Exit Arayashiki', group: 'File', icon: 'log-out', keywords: 'quit close exit', run: requestExit },

  // Edit
  { id: 'undo', title: 'Undo', group: 'Edit', icon: 'undo', keywords: 'undo back', run: () => (S.workspace.peek() === 'bars' ? B.undo() : S.undo()) },
  { id: 'redo', title: 'Redo', group: 'Edit', icon: 'redo', keywords: 'redo again', run: () => (S.workspace.peek() === 'bars' ? B.redo() : S.redo()) },
  { id: 'duplicate', title: 'Duplicate node', group: 'Nodes', icon: 'copy', keywords: 'copy clone node', when: hasNode, run: () => S.duplicateNode() },
  { id: 'delete', title: 'Delete', group: 'Nodes', icon: 'trash-2', keywords: 'remove delete node skill', when: hasSkill, run: () => (S.activeArea.peek() === 'outliner' ? S.deleteOutlined() : S.deleteNode()) },
  { id: 'moveUp', title: 'Move node up', group: 'Nodes', icon: 'arrow-up', keywords: 'reorder', when: hasNode, run: () => S.moveNode(-1) },
  { id: 'moveDown', title: 'Move node down', group: 'Nodes', icon: 'arrow-down', keywords: 'reorder', when: hasNode, run: () => S.moveNode(1) },
  { id: 'nodeUp', title: 'Previous node', group: 'Nodes', icon: 'arrow-up', keywords: 'select up', when: hasSkill, run: () => S.pickNode(Math.max(0, S.nodeIndex.peek() - 1)) },
  { id: 'nodeDown', title: 'Next node', group: 'Nodes', icon: 'arrow-down', keywords: 'select down', when: hasSkill, run: () => S.pickNode(Math.min(Math.max(0, S.line.peek().length - 1), S.nodeIndex.peek() + 1)) },
  { id: 'addSkill', title: 'Add a skill', group: 'Skills', icon: 'plus', keywords: 'new skill create', when: editing, run: () => S.addSkill() },
  { id: 'duplicateSkill', title: 'Duplicate skill', group: 'Skills', icon: 'copy', keywords: 'copy clone skill', when: hasSkill, run: () => S.duplicateSkill() },
  { id: 'deleteSkill', title: 'Delete skill', group: 'Skills', icon: 'trash-2', keywords: 'remove skill', when: hasSkill, run: () => S.deleteSkill() },
  { id: 'addBranch', title: 'Add a branch', group: 'Skills', icon: 'split', keywords: 'new branch', when: hasSkill, run: () => S.addBranch() },

  // Playback
  { id: 'play', title: 'Play / pause', group: 'Playback', icon: 'play', keywords: 'play pause run simulate', when: hasSkill, run: () => S.play() },
  { id: 'restart', title: 'Play from the start', group: 'Playback', icon: 'skip-back', keywords: 'restart replay beginning', when: hasSkill, run: () => S.restart() },
  { id: 'frameBack', title: 'Back a frame', group: 'Playback', icon: 'step-back', keywords: 'previous frame', when: hasSkill, run: () => S.stepFrames(-1) },
  { id: 'frameNext', title: 'Forward a frame', group: 'Playback', icon: 'step-forward', keywords: 'next frame', when: hasSkill, run: () => S.stepFrames(1) },
  { id: 'speed1', title: 'Speed: real time', group: 'Playback', icon: 'timer', keywords: 'speed 1x normal', run: () => (S.speed.value = 1) },
  { id: 'speedHalf', title: 'Speed: half (slow motion)', group: 'Playback', icon: 'timer', keywords: 'speed 0.5 slow mo slowmo', run: () => (S.speed.value = 0.5) },
  { id: 'speedQuarter', title: 'Speed: quarter (slow motion)', group: 'Playback', icon: 'timer', keywords: 'speed 0.25 slow mo slowmo', run: () => (S.speed.value = 0.25) },

  // View
  { id: 'hitboxes', title: 'Show / hide hitboxes', group: 'View', icon: 'box', keywords: 'hitbox projectile boxes', run: () => (S.showHitboxes.value = !S.showHitboxes.peek()) },
  { id: 'follow', title: 'Follow both characters', group: 'View', icon: 'navigation', keywords: 'follow camera track', run: () => (S.follow.value = !S.follow.peek()) },
  { id: 'sounds', title: 'Sounds on / off', group: 'View', icon: 'volume-2', keywords: 'audio sfx mute', run: () => (S.sounds.value = !S.sounds.peek()) },
  { id: 'dummy', title: 'Show / hide the dummy', group: 'View', icon: 'person-standing', keywords: 'dummy target', run: () => S.setDummy({ present: S.dummy.peek().present === false }) },
  { id: 'resetCameraSettings', title: 'Reset camera settings', group: 'Camera', icon: 'refresh', keywords: 'camera settings default reset follow auto free options', run: () => S.resetCameraSettings() },
  { id: 'resetCamera', title: 'Reset the camera', group: 'Camera', icon: 'locate-fixed', keywords: 'home view frame', run: () => S.resetCamera() },
  { id: 'camFree', title: 'Camera: Free (fly yourself)', group: 'Camera', icon: 'camera', keywords: 'camera free manual fly', run: () => (S.camMode.value = 'free') },
  { id: 'camAuto', title: 'Camera: Auto (cinematic)', group: 'Camera', icon: 'aperture', keywords: 'camera auto cinematic follow director', run: () => (S.camMode.value = 'auto') },
  { id: 'camPath', title: 'Camera: Recorded path', group: 'Camera', icon: 'route', keywords: 'camera recorded path keys', when: () => S.camKeys.peek().length > 0, run: () => (S.camMode.value = 'path') },
  { id: 'cameraKey', title: 'Add a camera key here', group: 'Camera', icon: 'camera', keywords: 'camera key keyframe pose record', when: editing, run: () => S.addCameraKey() },
  { id: 'recordCamera', title: 'Record a camera take', group: 'Camera', icon: 'video', keywords: 'record camera live take fly', when: hasSkill, run: () => S.recordCamera() },
  { id: 'clearCameraKeys', title: 'Clear camera keys', group: 'Camera', icon: 'trash-2', keywords: 'camera keys delete', when: () => S.camKeys.peek().length > 0, run: () => S.clearCameraKeys() },
  { id: 'skillCamera', title: 'The skill’s own camera on / off', group: 'Camera', icon: 'camera', keywords: 'camera block fov shake screen effects', run: () => (S.skillCamera.value = !S.skillCamera.peek()) },
  { id: 'screenshot', title: 'Export a picture (screenshot)…', group: 'Capture', icon: 'image', keywords: 'screenshot picture thumbnail png render image still', when: editing, run: () => S.openExport('image') },
  { id: 'quickShot', title: 'Quick screenshot to Pictures', group: 'Capture', icon: 'image', keywords: 'screenshot quick save picture', when: editing, run: () => media().then((m) => m.quickScreenshot()) },
  { id: 'exportVideo', title: 'Export video…', group: 'Capture', icon: 'film', keywords: 'video mp4 mov webm gif png sequence record render slow mo chroma green screen transparent alpha audio media encoder', when: editing, run: () => S.openExport('video') },
  { id: 'cameraPath', title: 'Edit the camera path for video…', group: 'Camera', icon: 'route', keywords: 'camera path keys video export recorded fly', when: editing, run: () => import('./ui/campath.jsx').then((m) => m.openCameraPath()) },
  { id: 'animateVisual', title: 'New visual animation', group: 'Animate', icon: 'wand', keywords: 'animate keyframe mesh block sphere part motion path blender', when: hasSkill, run: () => animator().then((m) => m.newVisualAnimation()) },
  { id: 'animate', title: 'Animate the picked VISUAL (keyframes)', group: 'Animate', icon: 'wand', keywords: 'animate keyframe mesh motion path blender move', when: hasNode, run: () => animator().then((m) => m.openAnimator()) },
  { id: 'animateCamera', title: 'New camera animation', group: 'Animate', icon: 'camera', keywords: 'camera animation keyframes shot fly path shake', when: hasSkill, run: () => animator().then((m) => m.newCameraAnimation()) },

  // Workspaces and windows
  { id: 'toSkills', title: 'Go to the Skill Builder', group: 'Workspace', icon: 'swords', keywords: 'skills workspace builder', run: toSkills },
  { id: 'toMeter', title: 'Go to the Meter Maker', group: 'Workspace', icon: 'battery', keywords: 'meter progress bar maker workspace', run: () => ((S.workspace.value = 'bars'), (S.showStart.value = false)) },
  { id: 'resetLayout', title: 'Reset the panel layout', group: 'Workspace', icon: 'layout', keywords: 'panels dock layout default reset workspace', run: () => resetLayout() },
  { id: 'saveLayout', title: 'Save the panel layout…', group: 'Workspace', icon: 'save', keywords: 'panels dock layout workspace save keep preset', run: dialog('save-layout') },
  { id: 'search', title: 'Search everything', group: 'Help', icon: 'command', keywords: 'search find command palette', run: () => import('./ui/search.jsx').then((m) => m.openSearch()) },
  { id: 'assistant', title: 'AI assistant', group: 'AI', icon: 'bot', keywords: 'ai chat assistant claude gpt gemini help', run: () => assistant().then((m) => m.toggleAssistant()) },
  { id: 'connectAi', title: 'Connect an AI app (MCP)', group: 'AI', icon: 'plug', keywords: 'mcp claude desktop cursor vscode codex connect', run: dialog('connect-ai') },
  { id: 'tour', title: 'Quick tour (where everything is)', group: 'Help', icon: 'sparkles', keywords: 'onboarding quick start guide tour welcome intro tutorial walkthrough basics', run: startTour },
  { id: 'checkUpdates', title: 'Check for updates', group: 'Help', icon: 'refresh', keywords: 'update upgrade new version release github download install', run: openUpdates },
  { id: 'manual', title: 'User manual', group: 'Help', icon: 'help', keywords: 'help manual guide how docs', run: dialog('manual') },
  { id: 'settings', title: 'Settings', group: 'Settings', icon: 'settings', keywords: 'preferences options', run: dialog('settings') },
  { id: 'keybinds', title: 'Keyboard shortcuts', group: 'Settings', icon: 'keyboard', keywords: 'keys hotkeys shortcuts bindings', run: () => ((S.settingsTab.value = 'keys'), (S.dialog.value = 'settings')) },
  { id: 'account', title: 'Sign in with Roblox / your avatar', group: 'Settings', icon: 'user-round', keywords: 'roblox account login sign in avatar', run: dialog('account') },
  { id: 'startOnLaunch', title: 'Start screen on launch on / off', group: 'Settings', icon: 'layout', keywords: 'splash startup', run: () => S.setStartOnLaunch(!S.startOnLaunch()) },
  ...[0.8, 0.9, 1, 1.1, 1.25, 1.5].map((v) => ({
    id: `scale${v}`,
    title: `Interface size ${Math.round(v * 100)}%`,
    group: 'Settings',
    icon: 'zoom-in',
    keywords: 'ui scale zoom size bigger smaller',
    run: () => setAppearance({ scale: v }),
    checked: () => appearance.peek().scale === v,
  })),
  ...BACKGROUNDS.map(([value, label]) => ({
    id: `bg${value}`,
    title: `Viewport background: ${label}`,
    group: 'Settings',
    icon: 'image',
    keywords: 'background colour color viewport sky',
    run: () => setAppearance({ viewportBg: value }),
  })),
];

export const command = (id) => COMMANDS.find((c) => c.id === id);
export const shortcutOf = (id) => bindingOf(id);
export const available = (c) => !c.when || c.when();

/** Runs a command by id, if it applies now. */
export function run(id) {
  const c = command(id);
  if (c && available(c)) c.run();
}
