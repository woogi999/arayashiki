// The assistant's model providers. Requests leave through the desktop shell
// (src-tauri/src/ai.rs `ai_fetch`), which adds the API key from Windows'
// Credential Manager and streams the answer back, so keys never sit in the
// web view.
//
//   subscriptions   Claude Code, Codex or Gemini CLI signed in with the user's
//                   plan (src/ai/cli.js): they run the turn themselves
//   Claude          the official Anthropic SDK, its fetch routed through the shell
//   everything else OpenAI-compatible chat completions: OpenAI, Google Gemini,
//                   OpenRouter, Groq, xAI, DeepSeek, Mistral, and models on this
//                   PC: built in (src/ai/local.js, llama.cpp's server), Ollama or
//                   LM Studio, or any compatible address
//
// Each `turn()` streams one model reply: text as it comes (onText), then
// the finished reply with any tool calls in a provider-neutral form.

import Anthropic from '@anthropic-ai/sdk';
import { isDesktop } from '../platform.js';
import { localBase, refreshLocal } from './local.js';

export const PROVIDERS = [
  // Subscriptions, through the provider's own CLI (src/ai/cli.js): signed in
  // in the browser, no API key.
  { id: 'sub-claude', label: 'Claude: sign in with my Claude plan', short: 'Claude plan', cli: 'claude', subscription: true, models: ['opus', 'sonnet', 'haiku', 'fable'], reasoning: 'claude' },
  { id: 'sub-codex', label: 'ChatGPT: sign in with my ChatGPT plan', short: 'ChatGPT plan', cli: 'codex', subscription: true, models: ['gpt-5.5', 'gpt-5.5-codex', 'gpt-5', 'gpt-5-mini'], reasoning: 'openai' },
  { id: 'sub-gemini', label: 'Gemini: sign in with my Google account', short: 'Google account', cli: 'gemini', subscription: true, models: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'] },
  { id: 'local', label: 'On this PC (built in, free)', short: 'This PC', local: true, builtin: true, reasoning: 'toggle' },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    short: 'Claude API',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    model: 'claude-opus-5-5',
    vision: true,
    reasoning: 'claude',
  },
  { id: 'openai', label: 'OpenAI (ChatGPT)', short: 'OpenAI', base: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', vision: true, models: ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'o4-mini'], model: 'gpt-5.5', reasoning: 'openai' },
  { id: 'gemini', label: 'Google Gemini', short: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', vision: true, models: ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'], model: 'gemini-2.5-pro', reasoning: 'gemini' },
  { id: 'openrouter', label: 'OpenRouter (any model)', short: 'OpenRouter', base: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', vision: true, models: ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5', 'openai/gpt-5.5', 'google/gemini-2.5-pro', 'x-ai/grok-4', 'deepseek/deepseek-v3.2', 'qwen/qwen3-coder', 'moonshotai/kimi-k2'], reasoning: 'openrouter' },
  { id: 'xai', label: 'xAI (Grok)', short: 'xAI', base: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai', vision: true, models: ['grok-4', 'grok-4-fast', 'grok-3-mini'], model: 'grok-4', reasoning: 'openai' },
  { id: 'deepseek', label: 'DeepSeek', short: 'DeepSeek', base: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys', models: ['deepseek-chat', 'deepseek-reasoner'], model: 'deepseek-chat' },
  { id: 'mistral', label: 'Mistral', short: 'Mistral', base: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', models: ['mistral-large-latest', 'mistral-medium-latest', 'magistral-medium-latest', 'codestral-latest'], model: 'mistral-large-latest' },
  { id: 'groq', label: 'Groq', short: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', models: ['openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile'], model: 'openai/gpt-oss-120b', reasoning: 'openai' },
  { id: 'cerebras', label: 'Cerebras', short: 'Cerebras', base: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai', models: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507', 'llama-3.3-70b'], model: 'gpt-oss-120b', reasoning: 'openai' },
  { id: 'together', label: 'Together AI', short: 'Together', base: 'https://api.together.xyz/v1', keyUrl: 'https://api.together.ai/settings/api-keys', models: ['moonshotai/Kimi-K2-Instruct', 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', 'deepseek-ai/DeepSeek-V3.1', 'openai/gpt-oss-120b'] },
  { id: 'fireworks', label: 'Fireworks AI', short: 'Fireworks', base: 'https://api.fireworks.ai/inference/v1', keyUrl: 'https://fireworks.ai/account/api-keys', models: ['accounts/fireworks/models/kimi-k2-instruct', 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct', 'accounts/fireworks/models/deepseek-v3p1'] },
  { id: 'moonshot', label: 'Moonshot (Kimi)', short: 'Kimi', base: 'https://api.moonshot.ai/v1', keyUrl: 'https://platform.moonshot.ai/console/api-keys', models: ['kimi-k2-0905-preview', 'kimi-k2-turbo-preview'] },
  { id: 'qwen', label: 'Alibaba Qwen (DashScope)', short: 'Qwen', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://modelstudio.console.alibabacloud.com', vision: true, models: ['qwen3-max', 'qwen-plus', 'qwen3-coder-plus', 'qwen-vl-max'] },
  { id: 'zai', label: 'Z.ai (GLM)', short: 'GLM', base: 'https://api.z.ai/api/paas/v4', keyUrl: 'https://z.ai/manage-apikey/apikey-list', models: ['glm-4.6', 'glm-4.5-air'] },
  { id: 'huggingface', label: 'Hugging Face', short: 'Hugging Face', base: 'https://router.huggingface.co/v1', keyUrl: 'https://huggingface.co/settings/tokens', models: ['openai/gpt-oss-120b', 'Qwen/Qwen3-Coder-480B-A35B-Instruct', 'deepseek-ai/DeepSeek-V3.1'] },
  { id: 'nvidia', label: 'NVIDIA NIM', short: 'NVIDIA', base: 'https://integrate.api.nvidia.com/v1', keyUrl: 'https://build.nvidia.com', models: ['nvidia/llama-3.3-nemotron-super-49b-v1.5', 'openai/gpt-oss-120b', 'qwen/qwen3-coder-480b-a35b-instruct'] },
  { id: 'ollama', label: 'Ollama (on this PC, free)', short: 'Ollama', base: 'http://localhost:11434/v1', local: true, reasoning: 'toggle' },
  { id: 'lmstudio', label: 'LM Studio (on this PC, free)', short: 'LM Studio', base: 'http://localhost:1234/v1', local: true, reasoning: 'toggle' },
  { id: 'custom', label: 'Another OpenAI-compatible service', short: 'Custom', base: '', keyUrl: null },
];

/**
 * The reasoning levels a provider takes, for the chat's picker. 'auto' is
 * the model's own default (nothing sent). Claude's are its effort levels;
 * OpenAI-style services take reasoning_effort; models on this PC turn their
 * thinking on or off.
 */
const LEVELS = {
  claude: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
  openai: ['auto', 'minimal', 'low', 'medium', 'high'],
  gemini: ['auto', 'off', 'low', 'medium', 'high'],
  openrouter: ['auto', 'off', 'low', 'medium', 'high'],
  toggle: ['auto', 'off', 'on'],
};
export const reasoningLevels = (id) => LEVELS[providerOf(id).reasoning] ?? [];

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

async function openAiTurn({ provider, base, model, system, history, tools, signal, onText, onThinking, effort }) {
  const url = `${base.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: system }, ...history],
    tools: tools.map((t) => toOpenAiTool(t, provider)),
  };
  // Reasoning, each service's way (nothing at 'auto': the model's default).
  const kind = providerOf(provider).reasoning;
  if (effort && effort !== 'auto') {
    if (kind === 'toggle') body.chat_template_kwargs = { enable_thinking: effort !== 'off' };
    else if (kind === 'openrouter') body.reasoning = effort === 'off' ? { enabled: false } : { effort };
    else if (kind === 'gemini') body.reasoning_effort = effort === 'off' ? 'none' : effort;
    else if (kind === 'openai') body.reasoning_effort = effort;
  }
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
    // Reasoning models on llama.cpp and others stream their thinking apart.
    if (d.reasoning_content) onThinking?.(d.reasoning_content);
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
  if (config.provider === 'anthropic') return claudeTurn({ ...args, model: config.model, effort: !config.effort || config.effort === 'auto' ? 'medium' : config.effort });
  if (config.provider === 'local')
    return localBase(config.model, { ctx: config.ctx, gpu: config.gpu }).then((base) =>
      openAiTurn({ ...args, provider: 'local', base, model: config.model, effort: config.effort }),
    );
  const base = config.provider === 'custom' ? config.base : (config.base || providerOf(config.provider).base);
  if (!base) throw new Error('Set the service’s address first (the gear above).');
  if (!config.model) throw new Error('Pick a model first (the gear above).');
  return openAiTurn({ ...args, provider: config.provider, base, model: config.model, effort: config.effort });
}

/** The messages that carry tool results back, for the provider. */
export const resultsMessages = (config, results) =>
  config.provider === 'anthropic' ? [claudeResults(results)] : openAiResults(results, providerOf(config.provider).vision);

/** The user's message, for the provider. */
export const userMessage = (config, text) => ({ role: 'user', content: text });

/** The models an OpenAI-compatible service offers (its /models), or []. */
export async function listModels(config) {
  if (config.provider === 'anthropic') return providerOf('anthropic').models;
  if (config.provider === 'local') return ((await refreshLocal())?.models ?? []).filter((m) => !m.partial).map((m) => m.file);
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
