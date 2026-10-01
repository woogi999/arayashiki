// The assistant inside the app (Ctrl+J): a chat down the right side with
// your own AI (Claude, ChatGPT, Gemini, a model on this PC…), using the same
// tools AI apps get through MCP (src/ai/registry.js), so it can read and
// change the open moveset, simulate, play, look at the viewport, export
// videos and keyframe cameras, all undoable. No MCP setup needed.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton } from '../ui/controls.jsx';
import { PROVIDERS, keyStatus, listModels, providerOf, resultsMessages, setKey, turn, userMessage } from './providers.js';
import { TOOLS, callTool } from './registry.js';
import { isDesktop, openExternal } from '../platform.js';
import { lazy } from '../ui/lazy.jsx';

const LocalModels = lazy(() => import('./local-ui.jsx'), 'LocalModels');

export const toggleAssistant = () => (S.assistantOpen.value = !S.assistantOpen.peek());

// ─── Settings, kept in this browser's storage (keys are not: they're in Windows) ──

const KEY = 'arayashiki-assistant';
function loadConfig() {
  try {
    return { provider: 'anthropic', models: {}, bases: {}, effort: 'medium', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { provider: 'anthropic', models: {}, bases: {}, effort: 'medium' };
  }
}
export const config = signal(loadConfig());
export function setConfig(patch) {
  config.value = { ...config.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(config.value));
  } catch {
    // not kept
  }
}
const active = () => {
  const c = config.peek();
  const p = providerOf(c.provider);
  return {
    provider: c.provider,
    model: c.models[c.provider] ?? p.model ?? '',
    base: c.bases[c.provider] ?? p.base ?? '',
    effort: c.effort,
    ctx: c.localCtx ?? 32768,
    gpu: c.localGpu ?? true,
  };
};

const keys = signal({});
const refreshKeys = () => keyStatus().then((k) => (keys.value = k ?? {}));

// ─── The conversation ───────────────────────────────────────────────────

// What's shown: { role: 'user'|'assistant'|'tool'|'note', text, thinking?, name?, input?, result?, error?, image? }
const shown = signal([]);
// What the model sees, in its provider's format; reset when the provider changes.
let history = [];
let historyFor = null;
const busy = signal(false);
let stopper = null;

const SYSTEM = `You are the assistant inside Arayashiki, a desktop app for building Jujutsu Shenanigans (Roblox) Skill Builder skills. The user is a JJS creator; they see the app while you talk: a node editor, a 3D viewport where skills play against a dummy, a timeline, and the moveset's skills.

Use your tools to do things rather than describing how. Start with app_state to see what's open. Edit skills with app_get_skills then app_put_skills (mode "merge" changes skills with the same name in place). Every change you make is one undo step: the user can press Ctrl+Z. Before writing a new move, find the closest real one (search_library, get_library_move) and copy its structure and numbers; check field names with node_reference; validate and app_simulate before you call it done. Use app_screenshot to look at the result when how it looks matters. Keep JJS's key names exactly ("LAST HIT", "BRANCH TARGET", spaces and capitals included).

The simulator is a model of JJS read from real exports, not the game: timings and damage are close, not exact; say so when it matters. Never replace or delete the whole moveset unless the user asks for that. Answer briefly and plainly: the user wants the skill, not an essay.`;

function contextLine() {
  const s = S.skill.peek();
  return `(Open now: moveset “${S.name.peek()}”, ${S.skills.peek().length} skills${s ? `; skill ${s.K_NAME}:${s.NAME}, branch ${S.branch.peek() || 'default'}, node ${S.nodeIndex.peek()}` : ''}.)`;
}

function update(i, patch) {
  shown.value = shown.value.map((m, j) => (j === i ? { ...m, ...patch } : m));
}
const push = (m) => {
  shown.value = [...shown.value, m];
  return shown.value.length - 1;
};

async function send(text) {
  const c = active();
  if (historyFor !== c.provider) {
    history = [];
    historyFor = c.provider;
  }
  push({ role: 'user', text });
  history.push(userMessage(c, `${text}\n\n${contextLine()}`));
  busy.value = true;
  const controller = new AbortController();
  stopper = () => controller.abort();
  const tools = TOOLS.filter((t) => t.name !== 'open_in_app');
  try {
    for (let step = 0; step < 40; step++) {
      const at = push({ role: 'assistant', text: '', thinking: '' });
      let text = '';
      let thinking = '';
      const reply = await turn(c, {
        system: SYSTEM,
        history,
        tools,
        signal: controller.signal,
        onText: (d) => update(at, { text: (text += d) }),
        onThinking: (d) => update(at, { thinking: (thinking += d) }),
      });
      history.push(c.provider === 'anthropic' ? { role: 'assistant', content: reply.content } : reply.content);
      if (!text && !thinking) shown.value = shown.value.filter((_, j) => j !== at);
      if (reply.stop === 'refusal') {
        push({ role: 'note', text: 'The model declined that request.' });
        break;
      }
      if (reply.stop === 'max_tokens' && reply.calls.length) {
        // A tool call cut off mid-input: never run it.
        history.push(...resultsMessages(c, reply.calls.map((call) => ({ id: call.id, isError: true, content: [{ type: 'text', text: 'Your reply hit the length limit before this tool call was complete; it was not run. Make it smaller.' }] }))));
        continue;
      }
      if (reply.stop === 'pause_turn') continue;
      if (!reply.calls.length) break;
      const results = [];
      for (const call of reply.calls) {
        const row = push({ role: 'tool', name: call.name, input: call.input, running: true });
        const out =
          call.input === null
            ? { isError: true, content: [{ type: 'text', text: JSON.stringify({ INVALID_JSON: call.raw ?? '' }) }] }
            : await callTool(call.name, call.input);
        const image = out.content?.find((x) => x.type === 'image');
        update(row, {
          running: false,
          error: out.isError,
          result: out.content?.filter((x) => x.type === 'text').map((x) => x.text).join('\n').slice(0, 4000),
          image: image ? `data:${image.mimeType};base64,${image.data}` : null,
        });
        results.push({ id: call.id, isError: out.isError, content: out.content ?? [] });
      }
      history.push(...resultsMessages(c, results));
    }
  } catch (error) {
    if (error?.name !== 'AbortError') push({ role: 'note', error: true, text: friendly(error) });
    else push({ role: 'note', text: 'Stopped.' });
    // Drop the unfinished turn, so the next message starts from a whole conversation.
    history.length = mark;
  } finally {
    busy.value = false;
    stopper = null;
  }
}

function friendly(error) {
  const m = String(error?.message ?? error);
  if (/401|authentication|invalid.*key|api key/i.test(m)) return `The service didn’t accept the key. Check it in the settings (gear). (${m.slice(0, 200)})`;
  if (/429|rate/i.test(m)) return `Too many requests for now: wait a moment and try again. (${m.slice(0, 200)})`;
  if (config.peek().provider === 'local') return m.slice(0, 800);
  if (/Couldn.t reach|fetch|network|ECONN/i.test(m)) return `Couldn’t reach the service. ${providerOf(config.peek().provider).local ? 'Is it running on this PC?' : 'Check your internet.'} (${m.slice(0, 200)})`;
  return m.slice(0, 600);
}

function clearChat() {
  shown.value = [];
  history = [];
}

// ─── The panel ──────────────────────────────────────────────────────────

function Settings({ onDone }) {
  const c = config.value;
  const p = providerOf(c.provider);
  const [key, setKeyText] = useState('');
  const [models, setModels] = useState(p.models ?? []);
  const [note, setNote] = useState(null);
  useEffect(() => {
    refreshKeys();
  }, []);
  useEffect(() => setModels(providerOf(c.provider).models ?? []), [c.provider]);
  const hasKey = keys.value[c.provider];
  const saveKey = async () => {
    try {
      await setKey(c.provider, key);
      setKeyText('');
      await refreshKeys();
      setNote(key ? 'Key saved in Windows’ Credential Manager.' : 'Key removed.');
    } catch (e) {
      setNote(String(e));
    }
  };
  const load = async () => {
    setNote('Asking the service for its models…');
    try {
      const list = await listModels(active());
      setModels(list);
      setNote(`${list.length} models.`);
    } catch (e) {
      setNote(`Couldn’t list models: ${e.message ?? e}`);
    }
  };
  return (
    <div class="ai-settings">
      <label class="prop-row">
        <span>Service</span>
        <select class="input" value={c.provider} onChange={(e) => setConfig({ provider: e.currentTarget.value })}>
          {PROVIDERS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {p.builtin && (
        <LocalModels
          model={c.models.local ?? ''}
          ctx={c.localCtx ?? 32768}
          gpu={c.localGpu ?? true}
          onModel={(file) => setConfig({ models: { ...c.models, local: file } })}
          onOptions={(patch) => setConfig(patch)}
        />
      )}
      {(c.provider === 'custom' || (p.local && !p.builtin)) && (
        <label class="prop-row">
          <span>Address</span>
          <input
            class="input"
            placeholder="https://…/v1"
            value={c.bases[c.provider] ?? p.base}
            onChange={(e) => setConfig({ bases: { ...c.bases, [c.provider]: e.currentTarget.value.trim() } })}
          />
        </label>
      )}
      {!p.builtin && (
      <label class="prop-row">
        <span>Model</span>
        <span class="ai-model">
          <input
            class="input"
            list="ai-models"
            placeholder={p.model ?? 'model id'}
            value={c.models[c.provider] ?? p.model ?? ''}
            onChange={(e) => setConfig({ models: { ...c.models, [c.provider]: e.currentTarget.value.trim() } })}
          />
          <datalist id="ai-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {c.provider !== 'anthropic' && (
            <IconButton icon="refresh" size={13} label="List the service’s models" onClick={load} />
          )}
        </span>
      </label>
      )}
      {c.provider === 'anthropic' && (
        <label class="prop-row">
          <span>Effort</span>
          <select class="input" value={c.effort} onChange={(e) => setConfig({ effort: e.currentTarget.value })}>
            {['low', 'medium', 'high', 'xhigh', 'max'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      )}
      {!p.local && (
        <>
          <label class="prop-row">
            <span>API key {hasKey ? <span class="ok-dot" title="A key is saved">●</span> : null}</span>
            <span class="ai-model">
              <input class="input" type="password" autocomplete="off" placeholder={hasKey ? 'Saved (type to replace)' : 'Paste your key'} value={key} onInput={(e) => setKeyText(e.currentTarget.value)} />
              <Button onClick={saveKey} disabled={!key && !hasKey}>
                {key ? 'Save' : 'Remove'}
              </Button>
            </span>
          </label>
          {p.keyUrl && (
            <p class="hint">
              Get a key at{' '}
              <a href={p.keyUrl} onClick={(e) => (e.preventDefault(), openExternal(p.keyUrl))}>
                {p.keyUrl.replace('https://', '')}
              </a>
              . You pay the service for what you use; the key stays in Windows’ Credential Manager and goes only to {p.label}.
            </p>
          )}
        </>
      )}
      {p.local && !p.builtin && <p class="hint">Free and private: the model runs on this PC. Start {p.label.split(' ')[0]} first, and pick a model that supports tools (function calling).</p>}
      {note && <p class="hint">{note}</p>}
      <div class="modal-actions">
        <span class="spacer" />
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Message({ m }) {
  const [open, setOpen] = useState(false);
  if (m.role === 'user') return <div class="ai-msg is-user">{m.text}</div>;
  if (m.role === 'note') return <div class={`ai-msg is-note ${m.error ? 'is-error' : ''}`}>{m.text}</div>;
  if (m.role === 'tool')
    return (
      <div class={`ai-tool ${m.error ? 'is-error' : ''}`}>
        <button type="button" class="ai-tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={m.running ? 'loader' : m.error ? 'warning' : 'check'} size={12} class={m.running ? 'spin' : ''} />
          <span class="num">{m.name}</span>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </button>
        {m.image && <img class="ai-shot" src={m.image} alt="What the tool saw" />}
        {open && (
          <pre class="ai-tool-body">
            {JSON.stringify(m.input, null, 1)}
            {m.result ? `\n→ ${m.result}` : ''}
          </pre>
        )}
      </div>
    );
  return (
    <div class="ai-msg is-assistant">
      {m.thinking && (
        <details class="ai-thinking">
          <summary>Thinking</summary>
          <p>{m.thinking}</p>
        </details>
      )}
      <Markdown text={m.text} />
    </div>
  );
}

// A little Markdown for replies: paragraphs, lists, code, bold, inline code.
function Markdown({ text }) {
  if (!text) return null;
  const blocks = text.split(/```/);
  return blocks.map((b, i) =>
    i % 2 ? (
      <pre key={i} class="code-box">
        {b.replace(/^\w*\n/, '')}
      </pre>
    ) : (
      b
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, j) =>
          /^\s*([-*]|\d+\.) /.test(p) ? (
            <ul key={`${i}-${j}`}>
              {p.split(/\n(?=\s*([-*]|\d+\.) )/).filter((x) => x && !/^[-*]$|^\d+\.$/.test(x)).map((li, k) => (
                <li key={k}>{inlineMd(li.replace(/^\s*([-*]|\d+\.) /, ''))}</li>
              ))}
            </ul>
          ) : (
            <p key={`${i}-${j}`}>{inlineMd(p)}</p>
          ),
        )
    ),
  );
}
const inlineMd = (s) =>
  s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part,
  );

const SUGGESTIONS = [
  'What does the open skill do? Walk me through it.',
  'Why doesn’t my M1 hit the dummy?',
  'Make a dash that launches the dummy upward on hit.',
  'Add a camera shot that circles me during this skill.',
  'Export this skill as a 60 fps slow-motion video.',
];

export function AssistantPanel() {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState(false);
  const list = useRef(null);
  const input = useRef(null);
  const c = config.value;
  const p = providerOf(c.provider);
  useEffect(() => {
    refreshKeys();
    input.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [shown.value]);
  const ready = isDesktop && (p.local || keys.value[c.provider]);
  const go = () => {
    const t = text.trim();
    if (!t || busy.peek()) return;
    setText('');
    send(t);
  };
  return (
    <aside class="assistant" aria-label="AI assistant">
      <header class="assistant-head">
        <Icon name="bot" size={15} />
        <strong>Assistant</strong>
        <button type="button" class="assistant-model" title="Change the AI" onClick={() => setSettings(!settings)}>
          {c.models[c.provider] ?? p.model ?? p.label}
        </button>
        <span class="spacer" />
        <IconButton icon="trash-2" size={13} label="Clear the chat" onClick={clearChat} disabled={busy.value} />
        <IconButton icon="settings" size={13} label="Settings" onClick={() => setSettings(!settings)} />
        <IconButton icon="x" size={13} label="Close (Ctrl+J)" onClick={toggleAssistant} />
      </header>
      {settings || !ready ? (
        <div class="assistant-body">
          {!isDesktop ? (
            <p class="hint">The assistant runs in the desktop app.</p>
          ) : (
            <>
              {!ready && (
                <div class="assistant-intro">
                  <h3>Bring your own AI</h3>
                  <p class="hint">
                    Pick the AI you use and paste its API key, or run a free model on this PC: pick “On this PC” in the
                    settings and download one (Qwen, Gemma, gpt-oss…). Ollama and LM Studio work too. The assistant can read and edit the open moveset, simulate it, look at the viewport, export videos and animate
                    cameras. Everything it changes can be undone with Ctrl+Z.
                  </p>
                  {c.provider !== 'local' && (
                    <Button icon="download" onClick={() => setConfig({ provider: 'local' })}>
                      Run a free model on this PC
                    </Button>
                  )}
                  <p class="hint">
                    Using Claude Desktop, Cursor, VS Code or another AI app instead?{' '}
                    <button type="button" class="link" onClick={() => (S.dialog.value = 'connect-ai')}>
                      Connect it with MCP
                    </button>
                    .
                  </p>
                </div>
              )}
              <Settings onDone={() => (refreshKeys(), setSettings(false))} />
            </>
          )}
        </div>
      ) : (
        <>
          <div class="assistant-body" ref={list}>
            {!shown.value.length && (
              <div class="assistant-intro">
                <p class="hint">Ask about the open skill, or have the assistant build, fix, film or animate something.</p>
                <ul class="assistant-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" class="chip" onClick={() => send(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {shown.value.map((m, i) => (
              <Message key={i} m={m} />
            ))}
            {busy.value && <div class="ai-typing" aria-label="Working">●●●</div>}
          </div>
          <footer class="assistant-input">
            <textarea
              ref={input}
              class="input"
              rows={3}
              placeholder="Ask, or tell it what to make…  (Enter sends, Shift+Enter for a new line)"
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  go();
                }
                e.stopPropagation();
              }}
            />
            {busy.value ? (
              <Button icon="circle-stop" onClick={() => stopper?.()}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" icon="send" disabled={!text.trim()} onClick={go}>
                Send
              </Button>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
