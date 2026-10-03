// The app's side of the bridge (src-tauri/src/bridge.rs): AI apps' requests
// arrive as `bridge-request` events and are answered with `bridge_reply`.
//
//   kind "mcp"  one MCP JSON-RPC message from `arayashiki.exe --mcp`
//               (initialize, tools/list, tools/call, ping…)
//   kind "rpc"  { tool, args } from the Node MCP server's app_* tools
//
// The tools load on the first request, so the window doesn't wait for them.
import { isDesktop } from '../platform.js';
import { APP_INSTRUCTIONS as INSTRUCTIONS } from '../../agent/tool-defs.js';

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

let registry = null;
const tools = () => (registry ??= import('./registry.js'));

async function mcp(message) {
  const { id, method, params } = message;
  const result = (value) => ({ jsonrpc: '2.0', id, result: value });
  const error = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  if (id === undefined || id === null) return null; // a notification: no answer
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return result({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'arayashiki', title: 'Arayashiki', version: __APP_VERSION__ },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result({});
    case 'tools/list': {
      const { TOOLS } = await tools();
      return result({
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: Boolean(t.readOnly), ...(t.openWorld ? { openWorldHint: true } : {}) },
        })),
      });
    }
    case 'tools/call': {
      const { callTool } = await tools();
      const out = await callTool(params?.name, params?.arguments ?? {});
      return result({ content: out.content ?? [], ...(out.isError ? { isError: true } : {}) });
    }
    case 'resources/list':
      return result({ resources: [] });
    case 'resources/templates/list':
      return result({ resourceTemplates: [] });
    case 'prompts/list':
      return result({ prompts: [] });
    default:
      return error(-32601, `Method not found: ${method}`);
  }
}

async function handle(kind, body) {
  if (kind === 'mcp') {
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (Array.isArray(message)) {
      const out = (await Promise.all(message.map(mcp))).filter(Boolean);
      return out.length ? JSON.stringify(out) : '';
    }
    const out = await mcp(message);
    return out ? JSON.stringify(out) : '';
  }
  const { tool, args } = JSON.parse(body || '{}');
  const { callTool } = await tools();
  const out = await callTool(tool, args ?? {});
  if (out.isError) return JSON.stringify({ error: out.content?.[0]?.text ?? 'Failed' });
  return JSON.stringify({ result: out.result ?? null, content: out.content });
}

/** Starts answering the bridge (desktop only). */
export async function startBridge() {
  if (!isDesktop) return;
  const [{ listen }, { invoke }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')]);
  await listen('bridge-request', async ({ payload }) => {
    let body;
    try {
      body = await handle(payload.kind, payload.body);
    } catch (e) {
      body = payload.kind === 'mcp' ? JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: String(e?.message ?? e) } }) : JSON.stringify({ error: String(e?.message ?? e) });
    }
    await invoke('bridge_reply', { id: payload.id, body });
  });
  await invoke('bridge_ready');
}
