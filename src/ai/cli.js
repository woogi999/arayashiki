// The assistant on an AI subscription, through the provider's own CLI
// (src-tauri/src/cli.rs): Claude Code for a Claude plan, Codex for a
// ChatGPT plan, Gemini CLI for a Google account. The CLI signs in, keeps the
// login and runs the conversation; it reaches the app's tools through MCP
// like any AI app. This reads what it prints (each CLI's JSON event stream)
// into the chat's messages and tool rows.

import { isDesktop } from '../platform.js';

export const CLI_TOOLS = {
  claude: {
    name: 'Claude Code',
    plan: 'Claude Pro or Max',
    models: ['opus', 'sonnet', 'haiku', 'fable'],
    connectId: null, // takes its MCP config on the command line
    about: 'https://claude.com/product/claude-code',
  },
  codex: { name: 'Codex', plan: 'ChatGPT Plus, Pro or Business', models: [], connectId: 'codex', about: 'https://developers.openai.com/codex/cli' },
  gemini: { name: 'Gemini CLI', plan: 'a Google account (free) or Google AI Pro', models: [], connectId: 'gemini-cli', about: 'https://github.com/google-gemini/gemini-cli' },
};

const invoke = async (cmd, args) => (await import('@tauri-apps/api/core')).invoke(cmd, args);

export const cliStatus = (tool) => (isDesktop ? invoke('ai_cli_status', { tool }) : Promise.resolve({ installed: false }));
export const cliSignIn = (tool) => invoke('ai_cli_sign_in', { tool });
export const cliSignOut = (tool) => invoke('ai_cli_sign_out', { tool });
export const cliInstall = (tool) => invoke('ai_cli_install', { tool });

/** Makes sure the CLI's own MCP settings have Arayashiki (Codex, Gemini CLI). */
async function ensureConnected(tool) {
  const id = CLI_TOOLS[tool].connectId;
  if (!id) return;
  const clients = await invoke('ai_clients').catch(() => []);
  if (!clients.find((c) => c.id === id)?.connected) await invoke('connect_ai_client', { client: id });
}

const shortName = (name) => String(name ?? '').replace(/^mcp__arayashiki__/, '').replace(/^arayashiki[./]/, '');
const textOf = (content) =>
  Array.isArray(content)
    ? content
        .filter((x) => x?.type === 'text')
        .map((x) => x.text)
        .join('\n')
    : typeof content === 'string'
      ? content
      : content
        ? JSON.stringify(content)
        : '';
const imageOf = (content) => {
  const img = Array.isArray(content) ? content.find((x) => x?.type === 'image') : null;
  if (!img) return null;
  const data = img.data ?? img.source?.data;
  const mime = img.mimeType ?? img.source?.media_type ?? 'image/png';
  return data ? `data:${mime};base64,${data}` : null;
};

/**
 * One turn through a CLI. `ui` is the chat: push(message) → row index,
 * update(row, patch). Resolves with the session id to carry on with.
 */
export async function cliTurn({ tool, prompt, system, session, model, effort, ui, signal }) {
  await ensureConnected(tool);
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel();
  const parse = PARSERS[tool](ui);
  const errors = [];
  let id = null;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      channel.onmessage = () => {};
      fn();
    };
    signal?.addEventListener(
      'abort',
      () => {
        if (id !== null) invoke('ai_cli_cancel', { id }).catch(() => {});
        finish(() => reject(new DOMException('Stopped', 'AbortError')));
      },
      { once: true },
    );
    channel.onmessage = (ev) => {
      if (ev.type === 'line') {
        let msg;
        try {
          msg = JSON.parse(ev.text);
        } catch {
          return; // a stray line that isn't an event
        }
        parse.event(msg);
      } else if (ev.type === 'stderr') {
        errors.push(ev.text);
        if (errors.length > 40) errors.shift();
      } else if (ev.type === 'exit') {
        const failure = parse.failure();
        if (ev.code === 0 && !failure) finish(() => resolve(parse.session() ?? session ?? null));
        else
          finish(() =>
            reject(new Error(failure || errors.filter((l) => l.trim()).slice(-6).join('\n') || `${CLI_TOOLS[tool].name} stopped (exit code ${ev.code}).`)),
          );
      }
    };
    invoke('ai_cli_run', { tool, prompt, system, session: session ?? null, model: model || null, effort: effort || null, onEvent: channel })
      .then((runId) => {
        id = runId;
        if (signal?.aborted) invoke('ai_cli_cancel', { id }).catch(() => {});
      })
      .catch((e) => finish(() => reject(e instanceof Error ? e : new Error(String(e)))));
  });
}

// ─── Each CLI's events ──────────────────────────────────────────────────

/** Claude Code: `-p --output-format stream-json --include-partial-messages`. */
function claudeParser(ui) {
  let session = null;
  let failure = null;
  let row = null; // the assistant row being streamed into
  let text = '';
  let thinking = '';
  const tools = new Map(); // tool_use id → row
  const streamed = new Set(); // message ids whose text came as deltas
  let messageId = null;
  const newRow = () => {
    text = '';
    thinking = '';
    row = ui.push({ role: 'assistant', text: '', thinking: '' });
  };
  return {
    session: () => session,
    failure: () => failure,
    event(m) {
      if (m.session_id) session = m.session_id;
      if (m.type === 'stream_event') {
        const e = m.event ?? {};
        if (e.type === 'message_start') messageId = e.message?.id ?? null;
        if (e.type === 'content_block_delta') {
          // Only text and thinking that's there (not a thinking block's signature).
          const piece = e.delta?.type === 'text_delta' ? e.delta.text : e.delta?.type === 'thinking_delta' ? e.delta.thinking : '';
          if (!piece) return;
          if (row === null) newRow();
          if (messageId) streamed.add(messageId);
          if (e.delta.type === 'text_delta') ui.update(row, { text: (text += piece) });
          else ui.update(row, { thinking: (thinking += piece) });
        }
        if (e.type === 'message_stop') row = null;
      } else if (m.type === 'assistant') {
        for (const block of m.message?.content ?? []) {
          if (block.type === 'tool_use') {
            row = null;
            tools.set(block.id, ui.push({ role: 'tool', name: shortName(block.name), input: block.input, running: true }));
          } else if (block.type === 'text' && block.text && !streamed.has(m.message?.id)) {
            ui.push({ role: 'assistant', text: block.text });
          }
        }
      } else if (m.type === 'user') {
        for (const block of m.message?.content ?? []) {
          if (block.type !== 'tool_result') continue;
          const at = tools.get(block.tool_use_id);
          if (at === undefined) continue;
          ui.update(at, { running: false, error: Boolean(block.is_error), result: textOf(block.content).slice(0, 4000), image: imageOf(block.content) });
        }
      } else if (m.type === 'result') {
        if (m.is_error || (m.subtype && m.subtype !== 'success')) failure = m.result || m.errors?.join('\n') || `Claude Code stopped: ${m.subtype}`;
      }
    },
  };
}

/** Codex: `codex exec --json`. */
function codexParser(ui) {
  let session = null;
  let failure = null;
  const rows = new Map(); // item id → row
  return {
    session: () => session,
    failure: () => failure,
    event(m) {
      if (m.type === 'thread.started') session = m.thread_id;
      else if (m.type === 'turn.failed') failure = m.error?.message ?? 'Codex stopped.';
      else if (m.type === 'error') failure = m.message ?? 'Codex stopped.';
      else if (m.type?.startsWith('item.')) {
        const item = m.item ?? {};
        const at = rows.get(item.id);
        const finished = m.type === 'item.completed';
        if (item.type === 'agent_message') {
          if (at === undefined) rows.set(item.id, ui.push({ role: 'assistant', text: item.text ?? '' }));
          else ui.update(at, { text: item.text ?? '' });
        } else if (item.type === 'reasoning') {
          if (at === undefined) rows.set(item.id, ui.push({ role: 'assistant', text: '', thinking: item.text ?? '' }));
          else ui.update(at, { thinking: item.text ?? '' });
        } else if (item.type === 'mcp_tool_call') {
          const patch = {
            running: !finished,
            error: item.status === 'failed' || Boolean(item.error),
            result: (item.error?.message ?? textOf(item.result?.content)).slice(0, 4000),
            image: imageOf(item.result?.content),
          };
          if (at === undefined) rows.set(item.id, ui.push({ role: 'tool', name: shortName(item.tool), input: item.arguments, ...patch }));
          else ui.update(at, patch);
        } else if (item.type === 'error') {
          ui.push({ role: 'note', error: true, text: item.message ?? 'Error' });
        } else if (item.type && finished && at === undefined && item.type !== 'todo_list') {
          // Its own tools (a command, a web search): shown, not run by the app.
          rows.set(item.id, ui.push({ role: 'tool', name: item.type, input: item.command ?? item.query ?? item.changes ?? {}, result: item.aggregated_output?.slice(0, 2000) ?? '' }));
        }
      }
    },
  };
}

/** Gemini CLI: `--output-format stream-json`. */
function geminiParser(ui) {
  let session = null;
  let failure = null;
  let row = null;
  let text = '';
  const tools = new Map();
  return {
    session: () => session,
    failure: () => failure,
    event(m) {
      if (m.session_id) session = m.session_id;
      if (m.type === 'message' && m.role === 'assistant') {
        if (row === null) {
          text = '';
          row = ui.push({ role: 'assistant', text: '' });
        }
        ui.update(row, { text: (text = m.delta ? text + (m.content ?? '') : (m.content ?? '')) });
      } else if (m.type === 'tool_use') {
        row = null;
        tools.set(m.tool_id, ui.push({ role: 'tool', name: shortName(m.tool_name), input: m.parameters, running: true }));
      } else if (m.type === 'tool_result') {
        const at = tools.get(m.tool_id);
        if (at !== undefined) ui.update(at, { running: false, error: m.status === 'error', result: String(m.error?.message ?? m.output ?? '').slice(0, 4000) });
      } else if (m.type === 'error' && m.severity !== 'warning') {
        ui.push({ role: 'note', error: true, text: m.message ?? 'Error' });
      } else if (m.type === 'result' && m.status && m.status !== 'success') {
        failure = m.error?.message ?? `Gemini CLI stopped: ${m.status}`;
      }
    },
  };
}

const PARSERS = { claude: claudeParser, codex: codexParser, gemini: geminiParser };

/** A CLI's event reader on its own (for checking it against real output). */
export const parserFor = (tool, ui) => PARSERS[tool](ui);
