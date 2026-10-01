// A small client for Roblox Studio's built-in MCP server (StudioMCP.exe,
// shipped with Studio and switched on in Assistant → MCP servers). It runs
// Luau in the open place, so the game-data extractor can read JJS's own
// modules. Studio caps one answer at about 100 KB, so `big` fetches a long
// string in slices.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The newest Studio install that has StudioMCP.exe, or $STUDIO_MCP.
function findExe() {
  if (process.env.STUDIO_MCP) return process.env.STUDIO_MCP;
  const root = join(process.env.LOCALAPPDATA ?? '', 'Roblox', 'Versions');
  if (!existsSync(root)) throw new Error('Roblox Studio not found: set STUDIO_MCP to StudioMCP.exe');
  const found = readdirSync(root)
    .map((v) => join(root, v, 'StudioMCP.exe'))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!found.length) throw new Error('No StudioMCP.exe in any Studio version: update Studio');
  return found[0];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect() {
  const proc = spawn(findExe(), ['--stdio']);
  let buf = '';
  let id = 0;
  const pending = new Map();
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const send = (method, params) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
    });
  await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'arayashiki', version: '1' },
  });
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  // Studio connects to the proxy a moment after it starts.
  let studio = null;
  for (let t = 0; t < 40 && !studio; t++) {
    const r = await send('tools/call', { name: 'list_roblox_studios', arguments: {} });
    studio = JSON.parse(r.result?.content?.[0]?.text ?? '{}').studios?.[0] ?? null;
    if (!studio) await sleep(500);
  }
  if (!studio) {
    proc.kill();
    throw new Error('No Studio connected: open the JJS place and enable the MCP server in Assistant settings');
  }

  async function luau(code) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await send('tools/call', {
        name: 'execute_luau',
        arguments: { studio_id: studio.id, datamodel_type: 'Edit', code },
      });
      const text = (r.result?.content ?? []).map((c) => c.text).join('');
      if (!text.includes('No Roblox Studio instances')) return text;
      await sleep(1000);
    }
    throw new Error('Lost the connection to Studio');
  }

  // `body` is Luau that leaves a string in `expr`; it runs once per slice.
  async function big(body, expr) {
    const run = `${body}\nlocal __all = ${expr}\n`;
    const total = Number(await luau(`${run}return #__all`));
    if (!Number.isFinite(total)) throw new Error(`Studio error: ${await luau(`${run}return #__all`)}`);
    let text = '';
    for (let at = 1; at <= total; at += 90000)
      text += await luau(`${run}return string.sub(__all, ${at}, ${at + 89999})`);
    return text;
  }

  return { studio, luau, big, close: () => proc.kill() };
}
