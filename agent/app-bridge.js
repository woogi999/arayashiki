// Talking to the running desktop app from Node (the MCP server, the CLI):
// the app writes its bridge's port and token to bridge.json in its config
// folder (src-tauri/src/bridge.rs); requests carry the token. If the app
// isn't running, it's started and waited for.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { findApp } from './tools.js';

const configDir = () => path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'dev.woogi.skillbuildersim');

function readBridge() {
  try {
    return JSON.parse(fs.readFileSync(path.join(configDir(), 'bridge.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function healthy(info) {
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let starting = null;
/** The bridge of a running app, starting the app if needed. */
export async function connect() {
  const info = readBridge();
  if (info && (await healthy(info))) return info;
  starting ??= (async () => {
    const exe = findApp();
    if (!exe) throw new Error('The Arayashiki app is not running, and it is not built or installed (npm run build). Open it first.');
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    const until = Date.now() + 90000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 500));
      const next = readBridge();
      if (next && (await healthy(next))) {
        return next;
      }
    }
    throw new Error('Arayashiki did not start in time.');
  })().finally(() => (starting = null));
  return starting;
}

/** Runs an app tool in the running app: its result, or throws its error. */
export async function callApp(tool, args = {}) {
  const info = await connect();
  const r = await fetch(`http://127.0.0.1:${info.port}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-arayashiki-token': info.token },
    body: JSON.stringify({ tool, args }),
  });
  const reply = await r.json().catch(() => ({ error: `The app answered ${r.status}` }));
  if (!r.ok || reply.error) throw new Error(reply.error ?? `The app answered ${r.status}`);
  return reply;
}
