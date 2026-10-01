// The assistant's model providers. Requests leave through the desktop shell
// (src-tauri/src/ai.rs `ai_fetch`), which adds the API key from Windows'
// Credential Manager and streams the answer back, so keys never sit in the
// web view.
//
//   Claude          the official Anthropic SDK, its fetch routed through the shell
//   everything else OpenAI-compatible chat completions: OpenAI, Google Gemini,
//                   OpenRouter, Groq, xAI, DeepSeek, Mistral, and models on this
//                   PC (Ollama, LM Studio), or any compatible address
//
// Each `turn()` streams one model reply: text as it comes (onText), then
// the finished reply with any tool calls in a provider-neutral form.

import Anthropic from '@anthropic-ai/sdk';
import { isDesktop } from '../platform.js';

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    model: 'claude-opus-5-5',
    vision: true,
  },
  { id: 'openai', label: 'OpenAI (ChatGPT)', base: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', vision: true },
  { id: 'gemini', label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', vision: true },
  { id: 'openrouter', label: 'OpenRouter (any model)', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', vision: true },
  { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  { id: 'xai', label: 'xAI (Grok)', base: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai', vision: true },
  { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'mistral', label: 'Mistral', base: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'ollama', label: 'Ollama (on this PC, free)', base: 'http://localhost:11434/v1', local: true },
  { id: 'lmstudio', label: 'LM Studio (on this PC, free)', base: 'http://localhost:1234/v1', local: true },
  { id: 'custom', label: 'Another OpenAI-compatible service', base: '', keyUrl: null },
];
export const providerOf = (id) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

// Models that take Anthropic's server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-opus-5']);

// ─── fetch through the desktop shell ────────────────────────────────────

const flatHeaders = (h) => {
  if (!h) return [];
  if (h instanceof Headers) return [...h.entries()];
  if (Array.isArray(h)) return h.map(([k, v]) => [k, String(v)]);
  return Object.entries(h).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]);
};

/** A fetch that goes out through the shell with `provider`'s key: a streaming Response. */
export function shellFetch(provider) {
  return async (input, init = {}) => {
    if (!isDesktop) throw new Error('The assistant runs in the desktop app.');
    const { invoke, Channel } = await import('@tauri-apps/api/core');
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    let body = init.body;
    if (body && typeof body !== 'string') body = await new Response(body).text();
    return new Promise((resolve, reject) => {
      let controller;
      let settled = false;
      const enc = new TextEncoder();
      const stream = new ReadableStream({ start: (c) => (controller = c) });
      const channel = new Channel();
      const abort = () => {
        const e = new DOMException('Stopped', 'AbortError');
        if (!settled) reject(e);
        else
          try {
            controller.error(e);
          } catch {
            // already closed
          }
        channel.onmessage = () => {};
      };
      init.signal?.addEventListener('abort', abort, { once: true });
      channel.onmessage = (ev) => {
        if (ev.type === 'head') {
          settled = true;
          resolve(new Response([204, 304].includes(ev.status) ? null : stream, { status: ev.status, headers: ev.headers }));
        } else if (ev.type === 'chunk') controller.enqueue(enc.encode(ev.text));
        else if (ev.type === 'end') controller.close();
        else if (ev.type === 'error') {
          if (!settled) reject(new TypeError(ev.message));
          else controller.error(new Error(ev.message));
        }
      };
      invoke('ai_fetch', { provider, url, method, headers: flatHeaders(init.headers), body: body ?? null, onEvent: channel }).catch(reject);
    });
  };
}

// ─── Claude ─────────────────────────────────────────────────────────────

let claude = null;
const claudeClient = () =>
  (claude ??= new Anthropic({
    apiKey: 'kept-in-windows-credential-manager', // replaced by the shell
    dangerouslyAllowBrowser: true, // the key never reaches the page: the shell adds it
    fetch: shellFetch('anthropic'),
    maxRetries: 2,
  }));

const toClaudeTool = (t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true });

/**
 * One Claude reply, streamed. `history` is Anthropic messages; returns
 * { content (to append as the assistant turn), calls: [{ id, name, input }],
 * stop, text }.
 */
async function claudeTurn({ model, system, history, tools, effort, signal, onText, onThinking }) {
  const params = {
    model,
    max_tokens: 64000,
    system,
    messages: history,
    tools: tools.map(toClaudeTool),
    thinking: model.startsWith('claude-haiku') ? undefined : { type: 'adaptive', display: 'summarized' },
    output_config: model.startsWith('claude-haiku') ? undefined : { effort },
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  // A tool input the model streamed as broken JSON can't be parsed by the
  // SDK: ask again (twice at most) rather than run anything half-read.
  for (let attempt = 0; ; attempt++) {
    const stream = claudeClient().beta.messages.stream(params, { signal });
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') onText(event.delta.text);
          else if (event.delta.type === 'thinking_delta') onThinking?.(event.delta.thinking);
        }
      }
      const msg = await stream.finalMessage();
      const calls = msg.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { content: msg.content, calls, stop: msg.stop_reason, text, model: msg.model };
    } catch (error) {
      if (error instanceof Anthropic.APIError || error?.name === 'AbortError' || attempt >= 2) throw error;
      // Otherwise it's the stream's JSON for a tool input: re-issue.
    }
  }
}

/** Anthropic messages for tool results (all in one user turn; images where a tool returned one). */
function claudeResults(results) {
  return {
    role: 'user',
    content: results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.id,
      is_error: Boolean(r.isError) || undefined,
      content: r.content.map((c) => (c.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: c.mimeType, data: c.data } } : { type: 'text', text: c.text })),
    })),
  };
}

// ─── OpenAI-compatible ──────────────────────────────────────────────────

// Schemas as the stricter OpenAI-compatible services take them.
function plainSchema(schema, provider) {
  if (Array.isArray(schema)) return schema.map((s) => plainSchema(s, provider));
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === '$schema' || k === 'propertyNames') continue;
    if (k === 'additionalProperties' && (provider === 'gemini' || (v && typeof v === 'object' && !Object.keys(v).length))) continue;
    out[k] = plainSchema(v, provider);
  }
  if (out.type === 'object' && !out.properties && provider === 'gemini') out.properties = {};
  return out;
}

const toOpenAiTool = (t, provider) => ({ type: 'function', function: { name: t.name, description: t.description.slice(0, 1000), parameters: plainSchema(t.inputSchema, provider) } });

async function* sse(response) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let at;
    while ((at = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
        // a keep-alive or partial line
      }
    }
  }
}

async function openAiTurn({ provider, base, model, system, history, tools, signal, onText }) {
  const url = `${base.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: system }, ...history],
    tools: tools.map((t) => toOpenAiTool(t, provider)),
  };
  const res = await shellFetch(provider)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.error?.message ?? j.message ?? text;
    } catch {
      // as is
    }
    throw new Error(`${providerOf(provider).label} answered ${res.status}: ${String(message).slice(0, 400)}`);
  }
  let text = '';
  const calls = [];
  let stop = null;
  for await (const chunk of sse(res)) {
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const d = choice.delta ?? {};
    if (d.content) {
      text += d.content;
      onText(d.content);
    }
    for (const tc of d.tool_calls ?? []) {
      const i = tc.index ?? calls.length;
      calls[i] ??= { id: tc.id ?? `call_${i}`, name: '', args: '' };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].name += tc.function.name;
      if (tc.function?.arguments) calls[i].args += tc.function.arguments;
    }
    if (choice.finish_reason) stop = choice.finish_reason;
  }
  const parsed = calls.filter(Boolean).map((c) => {
    try {
      return { id: c.id, name: c.name, input: c.args ? JSON.parse(c.args) : {} };
    } catch {
      return { id: c.id, name: c.name, input: null, raw: c.args };
    }
  });
  const assistant = { role: 'assistant', content: text || null };
  if (parsed.length) assistant.tool_calls = calls.filter(Boolean).map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
  return { content: assistant, calls: parsed, stop: stop === 'tool_calls' || parsed.length ? 'tool_use' : stop === 'length' ? 'max_tokens' : 'end_turn', text, model };
}

function openAiResults(results, vision) {
  const out = results.map((r) => ({
    role: 'tool',
    tool_call_id: r.id,
    content: r.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n') || (r.content.some((c) => c.type === 'image') ? 'A picture: it follows in the next message.' : '(no output)'),
  }));
  const images = results.flatMap((r) => r.content.filter((c) => c.type === 'image'));
  if (images.length && vision)
    out.push({
      role: 'user',
      content: [{ type: 'text', text: 'The screenshot the tool took:' }, ...images.map((c) => ({ type: 'image_url', image_url: { url: `data:${c.mimeType};base64,${c.data}` } }))],
    });
  return out;
}

// ─── Neutral ────────────────────────────────────────────────────────────

/** One model reply. `config`: { provider, model, base, effort }. */
export function turn(config, args) {
  if (config.provider === 'anthropic') return claudeTurn({ ...args, model: config.model, effort: config.effort ?? 'medium' });
  const base = config.provider === 'custom' ? config.base : (config.base || providerOf(config.provider).base);
  if (!base) throw new Error('Set the service’s address first (the gear above).');
  if (!config.model) throw new Error('Pick a model first (the gear above).');
  return openAiTurn({ ...args, provider: config.provider, base, model: config.model });
}

/** The messages that carry tool results back, for the provider. */
export const resultsMessages = (config, results) =>
  config.provider === 'anthropic' ? [claudeResults(results)] : openAiResults(results, providerOf(config.provider).vision);

/** The user's message, for the provider. */
export const userMessage = (config, text) => ({ role: 'user', content: text });

/** The models an OpenAI-compatible service offers (its /models), or []. */
export async function listModels(config) {
  if (config.provider === 'anthropic') return providerOf('anthropic').models;
  const base = config.provider === 'custom' ? config.base : (config.base || providerOf(config.provider).base);
  if (!base) return [];
  const res = await shellFetch(config.provider)(`${base.replace(/\/$/, '')}/models`, { method: 'GET' });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.data ?? j.models ?? []).map((m) => (typeof m === 'string' ? m : (m.id ?? m.name))).filter(Boolean).sort();
}

// ─── Keys ───────────────────────────────────────────────────────────────

export async function keyStatus() {
  if (!isDesktop) return {};
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('ai_key_status');
}
export async function setKey(provider, key) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('ai_key_set', { provider, key });
}
