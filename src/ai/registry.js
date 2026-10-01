// Every AI tool, running inside the app: the engine tools (agent/tools-core.js,
// with the docs bundled in) and the app tools (agent/tool-defs.js APP_TOOLS,
// carried out here on the moveset, the simulator and the 3D view). The
// assistant inside the app calls these directly; AI apps reach them through
// the bridge (src/ai/bridge.js, MCP over `arayashiki.exe --mcp`).
//
// A tool's answer is MCP content: text blocks, and image blocks for
// screenshots.

import { z } from 'zod';
import * as T from '../../agent/tools-core.js';
import { APP_TOOLS, ENGINE_TOOLS } from '../../agent/tool-defs.js';
import { decodeMoveset, encodeMoveset, newUid } from '../../core/format.js';
import * as S from '../store.js';
import { robloxDescribe } from '../platform.js';

// ─── The engine, with the docs bundled ──────────────────────────────────

const docs = import.meta.glob(['../../docs/jjs-skill-builder.md', '../../docs/jjs-library/*.md'], { query: '?raw', import: 'default', eager: true });
const game = import.meta.glob('../../docs/jjs-game/*.json', { import: 'default', eager: true });

T.setEnv({
  handbook: () => docs['../../docs/jjs-skill-builder.md'] ?? '',
  libraryFiles: () =>
    Object.entries(docs)
      .filter(([p]) => p.includes('/jjs-library/'))
      .map(([p, text]) => ({ file: p.split('/').pop(), text })),
  gameJson: (file) => game[`../../docs/jjs-game/${file}`] ?? [],
  readCodeFile: () => null,
  openInApp: async ({ code, name, count }) => {
    await S.openText({ text: code, name: name ?? undefined });
    return { opened: true, skills: count, note: 'Opened in this app as the moveset.' };
  },
});

// ─── App tools ──────────────────────────────────────────────────────────

const json = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }], result: value });
const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);

function pickIn(skills, select) {
  if (select === undefined || select === null || select === '') return S.skill.peek();
  return T.pickSkill(skills, select);
}

function runSummary(run) {
  if (!run) return null;
  const hits = run.events.filter((e) => e.kind === 'HIT');
  return {
    duration: round(run.duration),
    hits: hits.length,
    damage: hits.reduce((n, e) => n + (Number(e.damage) || 0), 0),
    warnings: run.warnings?.slice(0, 10) ?? [],
  };
}

// The 3D view, opening the Skill Builder and waiting for it if it isn't up.
async function sceneOrThrow() {
  if (!S.sceneNow()) {
    S.workspace.value = 'skills';
    S.showStart.value = false;
    for (let i = 0; i < 150 && !S.sceneNow(); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const scene = S.sceneNow();
  if (!scene) throw new Error('The 3D view didn’t open (is the app’s window showing?).');
  // A frame for it to settle (its first simulation and assets).
  await new Promise((r) => requestAnimationFrame(() => r()));
  return scene;
}

const bytesToBase64 = async (blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

const APP = {
  async app_state() {
    const skills = S.skills.peek();
    const skill = S.skill.peek();
    return json({
      workspace: S.workspace.peek() === 'bars' ? 'Meter Maker' : 'Skill Builder',
      moveset: { name: S.name.peek(), file: S.filePath.peek(), unsaved: S.dirty.peek(), skills: skills.length },
      skills: skills.map((s, i) => ({
        index: i,
        category: s.K_NAME,
        name: s.NAME,
        key: s.KEY,
        nodes: s.DATA && !('__unreadable' in s.DATA) ? (s.DATA.Line?.length ?? 0) + Object.values(s.DATA.Branch && !Array.isArray(s.DATA.Branch) ? s.DATA.Branch : {}).reduce((n, b) => n + (b.Line?.length ?? 0), 0) : 0,
        open: s.uid === skill?.uid,
      })),
      open: skill ? { skill: `${skill.K_NAME}:${skill.NAME}`, branch: S.branch.peek() || '(default)', branches: S.branches.peek(), node: S.nodeIndex.peek(), nodeKind: S.selectedNode.peek()?.K_NAME } : null,
      playback: { time: round(S.time.peek()), duration: round(S.duration.peek()), playing: S.playing.peek(), speed: S.speed.peek() },
      simulation: { conditions: S.conds.peek(), hits: S.hits.peek(), distance: S.distance.peek(), wall: S.wall.peek() || null, dummy: S.dummy.peek(), result: runSummary(S.run.peek()) },
      camera: { mode: S.camMode.peek(), keys: S.camKeys.peek().length, auto: S.autoCam.peek(), skillCamera: S.skillCamera.peek(), follow: S.follow.peek() },
    });
  },

  async app_get_skills({ select }) {
    const skills = S.skills.peek();
    const list = select === undefined || select === null || select === '' ? skills : [T.pickSkill(skills, select)];
    return json(list.map(({ uid: _uid, ...s }) => s));
  },

  async app_put_skills({ skills, code, mode = 'merge', name }) {
    const incoming = code ? await decodeMoveset(code) : await T.loadSkills({ skills: skills ?? [] });
    if (!incoming.length) throw new Error('No skills given.');
    const report = await T.validate({ skills: incoming, simulate: true });
    const errors = (report.issues ?? []).filter((i) => i.level === 'error');
    if (errors.length) return json({ applied: false, errors });
    S.workspace.value = 'skills';
    S.showStart.value = false;
    if (mode === 'replace') {
      await S.importCode(await encodeMoveset(incoming), 'replace', name);
    } else if (mode === 'append') {
      await S.importCode(await encodeMoveset(incoming), 'append');
    } else {
      const { added, replaced } = S.mergeSkills(incoming.map((s) => ({ ...s, uid: s.uid ?? newUid() })));
      S.status.value = `The AI ${replaced ? `changed ${replaced}` : ''}${replaced && added ? ' and ' : ''}${added ? `added ${added}` : ''} skill${added + replaced === 1 ? '' : 's'}. Ctrl+Z undoes it.`;
    }
    S.simulateNow();
    return json({ applied: true, mode, skills: incoming.length, warnings: (report.issues ?? []).filter((i) => i.level !== 'error').slice(0, 20), simulation: runSummary(S.run.peek()) });
  },

  async app_delete_skills({ select }) {
    const skills = S.skills.peek();
    const uids = select.map((x) => T.pickSkill(skills, x).uid);
    return json({ deleted: S.removeSkills(uids), left: S.skills.peek().length });
  },

  async app_select({ skill, branch, node }) {
    S.workspace.value = 'skills';
    S.showStart.value = false;
    if (skill !== undefined && skill !== null && skill !== '') {
      const s = T.pickSkill(S.skills.peek(), skill);
      S.pickCategory(s.K_NAME);
      S.pickSkill(s.uid);
    }
    if (branch !== undefined) {
      if (branch && !S.branches.peek().includes(branch)) throw new Error(`No branch "${branch}". There are: ${S.branches.peek().join(', ') || 'none'}.`);
      S.pickBranch(branch);
    }
    if (node !== undefined) {
      S.pickNode(Math.max(0, Math.min(S.line.peek().length - 1, node)));
      S.tab.value = 'node';
    }
    return json({ skill: S.skill.peek()?.NAME, branch: S.branch.peek() || '(default)', node: S.nodeIndex.peek(), nodeKind: S.selectedNode.peek()?.K_NAME });
  },

  async app_simulate({ select, conditions, hits, distance, wall, dummy, detail = 'summary' }) {
    if (select !== undefined) await APP.app_select({ skill: select });
    if (conditions) for (const [k, v] of Object.entries(conditions)) S.setCond(k, v);
    if (hits) S.setHits(hits);
    if (distance !== undefined) S.setDistance(distance);
    if (wall !== undefined) S.setWall(wall === null ? '' : wall);
    if (dummy) S.setDummy(dummy);
    S.simulateNow();
    const s = S.skill.peek();
    if (!s) throw new Error('No skill is open.');
    const result = await T.simulateSkill({
      skill: s,
      conditions: S.conds.peek(),
      hits: S.hits.peek(),
      distance: S.distance.peek(),
      wall: S.wall.peek() === '' ? undefined : Number(S.wall.peek()),
      detail,
    });
    return json(result);
  },

  async app_playback({ action, time, speed }) {
    if (speed) S.speed.value = Math.max(0.05, Math.min(4, speed));
    if (action === 'play') {
      if (!S.playing.peek()) S.play();
    } else if (action === 'pause') S.stop();
    else if (action === 'restart') S.restart();
    else if (action === 'seek') S.seek(Number(time) || 0);
    return json({ time: round(S.time.peek()), duration: round(S.duration.peek()), playing: S.playing.peek(), speed: S.speed.peek() });
  },

  async app_view({ follow, hitboxes, sounds, dummy, camera, auto, skillCamera }) {
    if (follow !== undefined) S.follow.value = follow;
    if (hitboxes !== undefined) S.showHitboxes.value = hitboxes;
    if (sounds !== undefined) S.sounds.value = sounds;
    if (dummy !== undefined) S.setDummy({ present: dummy });
    if (auto) S.autoCam.value = { ...S.autoCam.peek(), ...auto };
    if (camera) {
      if (camera === 'path' && !S.camKeys.peek().length) throw new Error('There are no camera keys yet: add some with app_camera_keys.');
      S.camMode.value = camera;
    }
    if (skillCamera !== undefined) S.skillCamera.value = skillCamera;
    return json({ follow: S.follow.peek(), hitboxes: S.showHitboxes.peek(), sounds: S.sounds.peek(), camera: S.camMode.peek(), auto: S.autoCam.peek(), skillCamera: S.skillCamera.peek() });
  },

  async app_camera_keys({ action, time, keys }) {
    if (action === 'add') {
      if (time !== undefined) S.seek(time);
      S.addCameraKey();
    } else if (action === 'set') S.camKeys.value = [...(keys ?? [])].sort((a, b) => a.t - b.t).map((k) => ({ fov: 70, ...k }));
    else if (action === 'clear') S.clearCameraKeys();
    return json({ keys: S.camKeys.peek() });
  },

  async app_screenshot({ time, width, height, background = 'scene', camera = 'view', hitboxes = false, save = false }) {
    const scene = await sceneOrThrow();
    const { screenshot } = await import('../video/capture.js');
    const w = width ?? (save ? 1280 : 960);
    const h = height ?? (save ? 720 : 540);
    const bg = background === 'green' || background === 'chroma' ? '#00ff00' : background;
    const blob = await screenshot(scene, time ?? S.time.peek(), { width: w, height: h, background: bg, camera, hitboxes, popups: true, screenFx: true });
    let path = null;
    if (save) {
      const { saveBlob, isDesktop } = await import('../platform.js');
      path = await saveBlob(blob, `${S.name.peek()} ${S.skill.peek()?.NAME ?? ''}.png`, 'PNG picture', isDesktop ? 'pictures' : 'ask');
    }
    const data = await bytesToBase64(blob);
    return {
      content: [
        { type: 'image', data, mimeType: 'image/png' },
        { type: 'text', text: `${w} × ${h} at ${(time ?? S.time.peek()).toFixed(2)}s${path ? `, saved to ${path}` : ''}.` },
      ],
      result: { width: w, height: h, path },
      image: data,
    };
  },

  async app_export_video({ select, format = 'mp4', fps = 60, speed = 1, width = 1920, height = 1080, background = 'scene', camera = 'view', hitboxes = false, from = 0, to, quality = 'high', bitrate, audio = true }) {
    if (select !== undefined) await APP.app_select({ skill: select });
    const scene = await sceneOrThrow();
    S.simulateNow();
    const duration = S.duration.peek();
    if (!duration) throw new Error('The open skill has nothing to play.');
    const { exportVideo } = await import('../video/capture.js');
    const chroma = background === 'green' ? '#00ff00' : /^#[0-9a-f]{6}$/i.test(background) ? background : '#00ff00';
    const bg = background === 'green' ? 'chroma' : /^#/.test(background) ? 'colour' : background;
    S.status.value = 'The AI is exporting a video…';
    const result = await exportVideo(
      scene,
      {
        format,
        codec: format === 'mov' && bg === 'transparent' ? 'png' : null,
        width,
        height,
        fps,
        speed,
        from,
        to: to ?? duration,
        bitrateMode: bitrate ? 'variable' : 'quality',
        quality,
        bitrate: bitrate ?? 12,
        keyframes: 2,
        background: bg,
        chroma,
        colour: chroma,
        stage: true,
        camera,
        hitboxes,
        popups: true,
        screenFx: true,
        audio: { enabled: audio, kbps: 192, sampleRate: 48000, slow: 'slow' },
        gif: { colors: 256, loop: true },
        name: `${S.name.peek()} - ${S.skill.peek()?.NAME ?? 'skill'}`,
        where: 'videos',
      },
      { clips: S.audioClips(S.run.peek()) },
    );
    S.status.value = result ? `Exported to ${result.path}` : null;
    return json(result && { path: result.path, frames: result.frames, codec: result.codec, seconds: Math.round(result.seconds * 10) / 10, sounds: result.audio?.used ?? 0, soundsMissing: result.audio?.missing ?? 0 });
  },

  async app_animate({ node, keys, smooth = true, easing = 'Linear', hold = 0, shake, shakeFreq }) {
    const { runAnimation } = await import('../ui/animator.jsx');
    return json(await runAnimation({ node, keys, smooth, easing, hold, shake, shakeFreq }));
  },

  async app_undo({ redo = false, steps = 1 }) {
    for (let i = 0; i < Math.max(1, Math.min(50, steps)); i++) (redo ? S.redo : S.undo)();
    return json({ skills: S.skills.peek().length, canUndo: S.past.peek().length, canRedo: S.future.peek().length });
  },

  async app_save() {
    const ok = await S.saveHere();
    return json({ saved: ok, file: S.filePath.peek() });
  },

  async app_notify({ message }) {
    S.status.value = String(message).slice(0, 300);
    return json({ shown: true });
  },
};

// ─── All tools ──────────────────────────────────────────────────────────

const assetInfo = async ({ ids, select, ...input }) => {
  let list = (Array.isArray(ids) ? ids : ids !== undefined ? [ids] : []).map(String);
  if (!list.length) return T.assetInfo({ ids, select, ...input });
  list = list.filter((id) => /^\d{1,20}$/.test(id)).slice(0, 40);
  return { assets: await Promise.all(list.map(async (id) => ({ id, ...((await robloxDescribe(id)) ?? { error: 'Roblox could not be reached.' }) }))) };
};

const schemaOf = (shape) => {
  const s = z.toJSONSchema(z.object(shape), { target: 'draft-7', io: 'input', unrepresentable: 'any' });
  delete s.$schema;
  return s;
};

export const TOOLS = [
  ...ENGINE_TOOLS.map((t) => ({
    ...t,
    kind: 'engine',
    inputSchema: schemaOf(t.shape),
    validate: z.object(t.shape),
    call: async (args) => json(t.name === 'asset_info' ? await assetInfo(args) : await t.run(T, args)),
  })),
  {
    name: 'open_in_app',
    title: 'Open skills as the moveset',
    description: 'Opens skills (or a code) in the app as the whole moveset, replacing what is open (undoable). To change part of the moveset, use app_put_skills.',
    shape: { code: z.string().optional(), skills: z.array(z.record(z.string(), z.any())).optional(), name: z.string().optional() },
    kind: 'app',
    call: async (args) => json(await T.openInApp(args)),
  },
  ...APP_TOOLS.map((t) => ({ ...t, kind: 'app', call: (args) => APP[t.name](args ?? {}) })),
].map((t) => ({ ...t, inputSchema: t.inputSchema ?? schemaOf(t.shape), validate: t.validate ?? z.object(t.shape) }));

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/**
 * Runs a tool: { content: [...], isError? }. Inputs are checked against the
 * tool's schema first (a model's input that doesn't fit is an error it can
 * correct, never a half-run tool).
 */
export async function callTool(name, args = {}) {
  const tool = byName.get(name);
  if (!tool) return { isError: true, content: [{ type: 'text', text: `No tool "${name}".` }] };
  const checked = tool.validate.safeParse(args ?? {});
  if (!checked.success)
    return { isError: true, content: [{ type: 'text', text: `The input doesn’t fit ${name}: ${checked.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`).join('; ')}` }] };
  try {
    const out = await tool.call(checked.data);
    return { content: out.content, result: out.result, image: out.image };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error?.message ?? String(error) }] };
  }
}
