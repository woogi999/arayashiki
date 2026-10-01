// agent/tools-core.js for Node: the CLI (agent/cli.js), the MCP server
// (agent/mcp-server.js) and the tests read the docs from this repo, read
// codes from files, and open the desktop app by running it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setEnv } from './tools-core.js';

export * from './tools-core.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');

/** Where the desktop app's executable is, if it's built or installed. */
export function findApp() {
  const candidates = [
    process.env.SKILL_BUILDER_SIM_EXE,
    path.join(ROOT, 'src-tauri', 'target', 'release', 'arayashiki.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Arayashiki', 'arayashiki.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Arayashiki', 'arayashiki.exe'),
    path.join(ROOT, 'src-tauri', 'target', 'debug', 'arayashiki.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

setEnv({
  handbook: () => fs.readFileSync(path.join(DOCS, 'jjs-skill-builder.md'), 'utf8'),
  libraryFiles: () => {
    const dir = path.join(DOCS, 'jjs-library');
    return fs.readdirSync(dir).map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), 'utf8') }));
  },
  gameJson: (file) => {
    const p = path.join(DOCS, 'jjs-game', file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  },
  readCodeFile: (p) => (fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null),
  openInApp: async ({ code, name, count }) => {
    const exe = findApp();
    if (!exe)
      throw new Error(
        'The desktop app is not built or installed. Build it with `npm run build`, or set SKILL_BUILDER_SIM_EXE to its path.',
      );
    const file = path.join(os.tmpdir(), `arayashiki-${Date.now().toString(36)}.txt`);
    fs.writeFileSync(file, code);
    const args = ['--open', file];
    if (name) args.push('--name', String(name));
    spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
    return { opened: true, app: exe, skills: count, file };
  },
});
