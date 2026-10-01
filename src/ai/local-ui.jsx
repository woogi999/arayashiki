// The assistant's settings for models on this PC (src/ai/local.js): the
// engine, the catalog of open models to download, the ones downloaded (pick
// one to use), a model from any Hugging Face address, and how much the model
// remembers (context) and whether it uses the graphics card.
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Switch } from '../ui/controls.jsx';
import { openExternal, revealFile } from '../platform.js';
import {
  CATALOG,
  cancelDownload,
  deleteModel,
  downloadModel,
  downloads,
  fromHuggingFace,
  gb,
  installEngine,
  localState,
  refreshLocal,
  stopLocal,
} from './local.js';

const CONTEXTS = [
  [8192, '8K (least memory)'],
  [16384, '16K'],
  [32768, '32K (suggested)'],
  [65536, '64K (most memory)'],
];

function Bar({ p }) {
  const pct = p.total ? Math.min(100, (p.got / p.total) * 100) : 0;
  return (
    <span class="local-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function LocalModels({ model, ctx, gpu, onModel, onOptions }) {
  const st = localState.value;
  const dl = downloads.value;
  const [error, setError] = useState(null);
  const [custom, setCustom] = useState('');
  useEffect(() => {
    refreshLocal().catch((e) => setError(String(e)));
  }, []);
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      const m = String(e?.message ?? e);
      if (m !== 'Cancelled.') setError(m);
    }
  };
  const have = new Map((st?.models ?? []).map((m) => [m.file, m]));
  const ready = [...have.values()].filter((m) => !m.partial);
  // A model picked that's gone: pick another downloaded one.
  useEffect(() => {
    if (st && ready.length && !ready.some((m) => m.file === model)) onModel(ready[0].file);
  }, [st]);
  const extra = ready.filter((m) => !CATALOG.some((c) => c.file === m.file));

  if (!st) return <p class="hint">Looking at this PC…</p>;

  return (
    <div class="local">
      <p class="hint">
        Free and private: the model runs on this PC, nothing leaves it. It needs the engine once (llama.cpp, about 35
        MB), then a model. Smaller models are quicker but slip up more on long tasks.
      </p>

      <h4 class="section-title">Engine</h4>
      {dl.engine ? (
        <div class="local-row">
          <Icon name="loader" size={13} class="spin" />
          <span class="local-name">Getting the engine…</span>
          <Bar p={dl.engine} />
          <IconButton icon="x" size={12} label="Cancel" onClick={() => cancelDownload('engine')} />
        </div>
      ) : st.engine ? (
        <div class="local-row">
          <Icon name="check" size={13} />
          <span class="local-name">
            llama.cpp <span class="num">{st.engine.version}</span> ·{' '}
            {st.engine.kind === 'vulkan' ? 'GPU' : 'CPU'}
          </span>
          <Button
            variant="ghost"
            onClick={() => run(() => installEngine(st.engine.kind === 'vulkan' ? 'cpu' : 'vulkan'))}
          >
            Switch to {st.engine.kind === 'vulkan' ? 'CPU' : 'graphics card'}
          </Button>
        </div>
      ) : (
        <div class="local-row">
          <Button variant="primary" icon="download" onClick={() => run(() => installEngine('vulkan'))}>
            Get the engine
          </Button>
          <Button
            variant="ghost"
            onClick={() => run(() => installEngine('cpu'))}
            title="For a PC without a graphics card that does Vulkan"
          >
            CPU only
          </Button>
        </div>
      )}

      <h4 class="section-title">Models</h4>
      <ul class="local-list">
        {CATALOG.map((c) => {
          const got = have.get(c.file);
          const p = dl[c.file];
          const downloaded = got && !got.partial;
          return (
            <li key={c.id} class={`local-model ${model === c.file && downloaded ? 'is-used' : ''}`}>
              <div class="local-model-head">
                <span class="local-name">
                  {c.name}
                  {c.pick && <span class="local-tag">start here</span>}
                </span>
                <span class="local-size num">{gb(c.size)}</span>
              </div>
              <p class="local-note">
                {c.by} · {c.note}
              </p>
              <div class="local-row">
                {p ? (
                  <>
                    <Bar p={p} />
                    <span class="num local-pct">{p.total ? `${gb(p.got)} / ${gb(p.total)}` : '…'}</span>
                    <IconButton icon="x" size={12} label="Pause the download" onClick={() => cancelDownload(c.file)} />
                  </>
                ) : downloaded ? (
                  <>
                    <Button
                      variant={model === c.file ? 'primary' : 'default'}
                      icon={model === c.file ? 'check' : undefined}
                      onClick={() => onModel(c.file)}
                    >
                      {model === c.file ? 'In use' : 'Use'}
                    </Button>
                    <IconButton
                      icon="trash-2"
                      size={12}
                      class="danger"
                      label={`Delete ${c.name}`}
                      onClick={() => run(() => deleteModel(c.file))}
                    />
                  </>
                ) : (
                  <Button icon="download" onClick={() => run(async () => (await downloadModel(c), onModel(c.file)))}>
                    {got?.partial ? `Resume (${gb(got.size)} so far)` : 'Download'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {extra.map((m) => (
          <li key={m.file} class={`local-model ${model === m.file ? 'is-used' : ''}`}>
            <div class="local-model-head">
              <span class="local-name">{m.file}</span>
              <span class="local-size num">{gb(m.size)}</span>
            </div>
            <div class="local-row">
              <Button variant={model === m.file ? 'primary' : 'default'} onClick={() => onModel(m.file)}>
                {model === m.file ? 'In use' : 'Use'}
              </Button>
              <IconButton
                icon="trash-2"
                size={12}
                class="danger"
                label={`Delete ${m.file}`}
                onClick={() => run(() => deleteModel(m.file))}
              />
            </div>
          </li>
        ))}
      </ul>

      <h4 class="section-title">Another model from Hugging Face</h4>
      <div class="local-row">
        <input
          class="input"
          placeholder="https://huggingface.co/…/resolve/main/model.gguf"
          value={custom}
          onInput={(e) => setCustom(e.currentTarget.value)}
        />
        <Button
          icon="download"
          disabled={!fromHuggingFace(custom) || Boolean(dl[fromHuggingFace(custom)?.file])}
          onClick={() => {
            const m = fromHuggingFace(custom);
            run(async () => {
              await downloadModel(m);
              onModel(m.file);
              setCustom('');
            });
          }}
        >
          Get
        </Button>
      </div>
      {custom && !fromHuggingFace(custom) && (
        <p class="hint">Paste the link to a .gguf file (its “download” link on Hugging Face).</p>
      )}
      {Object.entries(dl)
        .filter(([k]) => k !== 'engine' && !CATALOG.some((c) => c.file === k))
        .map(([k, p]) => (
          <div class="local-row" key={k}>
            <span class="local-name">{k}</span>
            <Bar p={p} />
            <IconButton icon="x" size={12} label="Pause the download" onClick={() => cancelDownload(k)} />
          </div>
        ))}

      <h4 class="section-title">Running it</h4>
      <label class="prop-row">
        <span title="How much of the conversation the model keeps in mind. More needs more memory.">Context</span>
        <select
          class="input"
          value={String(ctx)}
          onChange={(e) => onOptions({ localCtx: Number(e.currentTarget.value) })}
        >
          {CONTEXTS.map(([v, label]) => (
            <option key={v} value={String(v)}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div class="prop-row">
        <span title="Off runs it on the processor only: slower, but works anywhere">Use the graphics card</span>
        <Switch checked={gpu} label="Use the graphics card" onChange={(on) => onOptions({ localGpu: on })} />
      </div>
      {st.running && (
        <div class="local-row">
          <Icon name="zap" size={13} />
          <span class="local-name">
            Running {st.running.model} ({st.running.gpu ? 'graphics card' : 'CPU'})
          </span>
          <Button
            variant="ghost"
            onClick={() => run(stopLocal)}
            title="Frees its memory; it starts again when you send a message"
          >
            Stop
          </Button>
        </div>
      )}
      {error && (
        <p class="error" role="alert">
          <Icon name="warning" size={14} />
          <span class="local-error">{error}</span>
        </p>
      )}
      <p class="hint">
        Models are kept in{' '}
        <button type="button" class="link" onClick={() => revealFile(`${st.folder}\\models`)}>
          the app’s folder
        </button>
        . More open models at{' '}
        <button
          type="button"
          class="link"
          onClick={() => openExternal('https://huggingface.co/models?library=gguf&sort=trending')}
        >
          huggingface.co
        </button>{' '}
        (pick a Q4_K_M .gguf of a model that supports tool calling).
      </p>
    </div>
  );
}
