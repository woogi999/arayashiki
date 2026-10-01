// "Connect an AI": pick the AI app or editor you use, and Arayashiki adds
// itself to that app's MCP settings (src-tauri/src/ai.rs), pointing at
// `arayashiki.exe --mcp`, which needs no Node and starts the app when the
// AI needs it. Then the steps for that app to see it working. For people
// without one of those, the assistant inside the app.
import { useEffect, useState } from 'preact/hooks';
import * as S from '../store.js';
import { isDesktop } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, Modal } from '../ui/controls.jsx';

const CLIENTS = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    kind: 'Chat app',
    steps: [
      'Quit Claude completely: right-click its icon in the system tray (by the clock) and pick Quit. Closing the window isn’t enough.',
      'Open Claude again. In Settings → Developer, “arayashiki” shows as running.',
      'In a chat, the tools button (under the message box) lists Arayashiki’s tools. Ask: “What’s open in Arayashiki?”',
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'Terminal / IDE',
    command: (exe) => `claude mcp add --scope user arayashiki -- "${exe}" --mcp`,
    steps: [
      'Easiest: run the command below once in any terminal (it adds Arayashiki for every project).',
      'Or use “Connect automatically”, which writes it into ~/.claude.json (close Claude Code first so it doesn’t overwrite the change).',
      'Start claude and type /mcp: arayashiki shows as connected. Then ask it to work on the open moveset.',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'Editor',
    steps: [
      'Open Cursor Settings → MCP (or Tools & Integrations). “arayashiki” is listed: switch it on if it isn’t (a green dot means it’s running).',
      'Use the chat in Agent mode and ask about the open moveset.',
    ],
  },
  {
    id: 'vscode',
    name: 'VS Code (GitHub Copilot)',
    kind: 'Editor',
    steps: [
      'In VS Code, open the Command Palette (Ctrl+Shift+P) → “MCP: List Servers” → arayashiki → Start.',
      'Open Copilot Chat, switch to Agent mode, and check arayashiki in the tools list (the wrench icon).',
    ],
  },
  { id: 'vscode-insiders', name: 'VS Code Insiders', kind: 'Editor', steps: ['Command Palette → “MCP: List Servers” → arayashiki → Start, then use Copilot Chat in Agent mode.'] },
  {
    id: 'windsurf',
    name: 'Windsurf',
    kind: 'Editor',
    steps: ['In Cascade, open the MCP servers panel (the hammer icon) and press Refresh: arayashiki appears with its tools.'],
  },
  {
    id: 'cline',
    name: 'Cline (VS Code)',
    kind: 'Editor extension',
    steps: ['In Cline, open MCP Servers → Installed: arayashiki is there. Restart it from there if it shows an error.'],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    kind: 'Terminal',
    steps: ['Start codex again (it reads ~/.codex/config.toml when it starts) and type /mcp to see arayashiki.'],
  },
  { id: 'gemini-cli', name: 'Gemini CLI', kind: 'Terminal', steps: ['Start gemini again and type /mcp: arayashiki is listed with its tools.'] },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    kind: 'Local models',
    steps: ['Restart LM Studio. In a chat, turn on the arayashiki integration, and use a model that supports tool use.'],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    kind: 'Chat app',
    noMcp: true,
    steps: [
      'ChatGPT’s apps can’t start programs on your PC, so they can’t reach Arayashiki through MCP.',
      'Use the assistant inside Arayashiki instead, with an OpenAI API key: it uses the same tools, with nothing to connect.',
    ],
  },
  { id: 'other', name: 'Another MCP app', kind: 'Anything else', manual: true, steps: ['Add a stdio MCP server to its settings with the command and arguments below.'] },
];

export function ConnectDialog() {
  const [pick, setPick] = useState(null);
  const [clients, setClients] = useState({});
  const [exe, setExe] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const refresh = async () => {
    if (!isDesktop) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke('ai_clients').catch(() => []);
    setClients(Object.fromEntries(list.map((c) => [c.id, c])));
    setExe(await invoke('app_exe_path').catch(() => ''));
  };
  useEffect(() => {
    refresh();
  }, []);
  const client = CLIENTS.find((c) => c.id === pick);
  const info = clients[pick];
  const json = JSON.stringify({ mcpServers: { arayashiki: { command: exe || 'C:\\…\\arayashiki.exe', args: ['--mcp'] } } }, null, 2);
  const copy = async (what, text) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
  };
  const connect = async () => {
    setResult(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke('connect_ai_client', { client: pick });
      setResult({ ok: true, text: `Added to ${path}` });
      refresh();
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    }
  };
  return (
    <Modal title="Connect an AI" class="modal-wide modal-connect" onClose={() => (S.dialog.value = null)}>
      {!client ? (
        <>
          <p class="hint">
            Which AI do you use? Arayashiki connects to it through MCP, so it can read, build, simulate, screenshot and
            film your skills in this window. Everything is set up for you; you don’t need Node or a terminal.
          </p>
          <div class="connect-grid">
            {CLIENTS.map((c) => {
              const state = clients[c.id];
              return (
                <button type="button" key={c.id} class="connect-card" onClick={() => (setPick(c.id), setResult(null), setCopied(null))}>
                  <strong>{c.name}</strong>
                  <span class="connect-kind">{c.kind}</span>
                  {state?.connected ? <span class="connect-badge is-on">Connected</span> : state?.installed ? <span class="connect-badge">Found on this PC</span> : null}
                </button>
              );
            })}
          </div>
          <div class="connect-alt">
            <Icon name="bot" size={16} />
            <div>
              <strong>No AI app? Use the assistant inside Arayashiki.</strong>
              <p class="hint">Bring a key for Claude, ChatGPT, Gemini or OpenRouter, or run a free model on this PC (Ollama, LM Studio).</p>
            </div>
            <Button
              onClick={() => {
                S.dialog.value = null;
                S.assistantOpen.value = true;
              }}
            >
              Open the assistant
            </Button>
          </div>
        </>
      ) : (
        <div class="connect-detail">
          <button type="button" class="link" onClick={() => setPick(null)}>
            <Icon name="arrow-left" size={13} /> All AI apps
          </button>
          <h3>{client.name}</h3>
          {info?.connected && <p class="hint ok">Arayashiki is already in {client.name}’s settings.</p>}
          {!client.noMcp && !client.manual && isDesktop && (
            <div class="connect-auto">
              <Button variant="primary" icon="plug" onClick={connect}>
                {info?.connected ? 'Connect again' : 'Connect automatically'}
              </Button>
              {info?.config && <span class="hint num">{info.config}</span>}
            </div>
          )}
          {result && <p class={`hint ${result.ok ? 'ok' : 'error'}`}>{result.text}</p>}
          {client.command && exe && (
            <>
              <pre class="code-box">{client.command(exe)}</pre>
              <Button icon={copied === 'cmd' ? 'check' : 'copy'} onClick={() => copy('cmd', client.command(exe))}>
                {copied === 'cmd' ? 'Copied' : 'Copy the command'}
              </Button>
            </>
          )}
          <h4 class="section-title">{client.noMcp ? 'What to do instead' : 'Then'}</h4>
          <ol class="connect-steps">
            {client.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
            {!client.noMcp && <li>Keep Arayashiki open while you work (if it’s closed, the AI starts it).</li>}
          </ol>
          {client.noMcp && (
            <Button
              variant="primary"
              icon="bot"
              onClick={() => {
                S.dialog.value = null;
                S.assistantOpen.value = true;
              }}
            >
              Open the assistant
            </Button>
          )}
          {!client.noMcp && (
            <details class="connect-manual" open={client.manual}>
              <summary>Set it up by hand</summary>
              <p class="hint">
                Command: <code>{exe || 'arayashiki.exe'}</code>, arguments: <code>--mcp</code> (stdio). As JSON, the way most apps
                take it:
              </p>
              <pre class="code-box">{json}</pre>
              <Button icon={copied === 'json' ? 'check' : 'copy'} onClick={() => copy('json', json)}>
                {copied === 'json' ? 'Copied' : 'Copy JSON'}
              </Button>
              <p class="hint">
                Working from Arayashiki’s source folder instead? Its .mcp.json runs <code>node agent/mcp-server.js</code> (Node 22),
                with the same tools.
              </p>
            </details>
          )}
          <h4 class="section-title">Try asking</h4>
          <ul class="connect-steps">
            <li>“What does the skill open in Arayashiki do?”</li>
            <li>“Make me a grab that slams the dummy into the ground, based on a real move, and put it in Arayashiki.”</li>
            <li>“Take a screenshot of the hit, and export a ¼-speed video with a transparent background.”</li>
          </ul>
        </div>
      )}
    </Modal>
  );
}
