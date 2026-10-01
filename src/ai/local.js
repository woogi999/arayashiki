// Free models on this PC, built in (src-tauri/src/local.rs): the engine
// (llama.cpp's server), a catalog of open models to download from Hugging
// Face, and starting the server with one when the assistant needs it.
import { signal } from '@preact/signals';
import { isDesktop } from '../platform.js';

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

// Open models that call tools well, smallest first. Sizes are the download
// (4-bit); a model wants about that much free memory again, more with a
// longer context. `pick` marks the one to suggest.
export const CATALOG = [
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5 2B',
    by: 'Alibaba Qwen',
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3.5-2B-GGUF', 'Qwen3.5-2B-Q4_K_M.gguf'),
    size: 1.28e9,
    note: 'Tiny and quick, for older PCs. Fine for small edits; loses its way on long tasks.',
  },
  {
    id: 'qwen3.5-4b',
    name: 'Qwen3.5 4B',
    by: 'Alibaba Qwen',
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3.5-4B-GGUF', 'Qwen3.5-4B-Q4_K_M.gguf'),
    size: 2.74e9,
    pick: true,
    note: 'The one to start with: good with tools, runs on most PCs (8 GB of memory).',
  },
  {
    id: 'gemma-4-e4b',
    name: 'Gemma 4 E4B',
    by: 'Google',
    file: 'gemma-4-E4B-it-Q4_K_M.gguf',
    url: hf('unsloth/gemma-4-E4B-it-GGUF', 'gemma-4-E4B-it-Q4_K_M.gguf'),
    size: 4.98e9,
    note: 'Google’s small open model. Quick, and good at plain answers.',
  },
  {
    id: 'qwen3.5-9b',
    name: 'Qwen3.5 9B',
    by: 'Alibaba Qwen',
    file: 'Qwen3.5-9B-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3.5-9B-GGUF', 'Qwen3.5-9B-Q4_K_M.gguf'),
    size: 5.68e9,
    note: 'Smarter, for a graphics card with 8 GB or a PC with 16 GB of memory.',
  },
  {
    id: 'gemma-4-12b',
    name: 'Gemma 4 12B',
    by: 'Google',
    file: 'gemma-4-12b-it-Q4_K_M.gguf',
    url: hf('unsloth/gemma-4-12b-it-GGUF', 'gemma-4-12b-it-Q4_K_M.gguf'),
    size: 7.12e9,
    note: 'Google’s mid-size model, for a 12 GB graphics card or 16 GB of memory.',
  },
  {
    id: 'gpt-oss-20b',
    name: 'gpt-oss 20B',
    by: 'OpenAI',
    file: 'gpt-oss-20b-Q4_K_M.gguf',
    url: hf('unsloth/gpt-oss-20b-GGUF', 'gpt-oss-20b-Q4_K_M.gguf'),
    size: 11.62e9,
    note: 'OpenAI’s open model: strong with tools. A 16 GB graphics card or 32 GB of memory.',
  },
  {
    id: 'qwen3.8-27b',
    name: 'Qwen3.8 27B',
    by: 'Alibaba Qwen',
    file: 'Qwen3.8-27B-UD-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3.8-27B-GGUF', 'Qwen3.8-27B-UD-Q4_K_M.gguf'),
    size: 16.46e9,
    note: 'The strongest here. Wants a 24 GB graphics card; slow without one.',
  },
  {
    id: 'qwen3-coder-30b',
    name: 'Qwen3 Coder 30B-A3B',
    by: 'Alibaba Qwen',
    file: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF', 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf'),
    size: 18.56e9,
    note: 'Built for tools and code. Runs fast for its size (only 3B active), with 32 GB of memory.',
  },
  {
    id: 'qwen3.6-35b',
    name: 'Qwen3.6 35B-A3B',
    by: 'Alibaba Qwen',
    file: 'Qwen3.6-35B-A3B-UD-Q4_K_M.gguf',
    url: hf('unsloth/Qwen3.6-35B-A3B-GGUF', 'Qwen3.6-35B-A3B-UD-Q4_K_M.gguf'),
    size: 22.13e9,
    note: 'Big but quick (3B active at a time). For 32 GB of memory or more.',
  },
];

export const gb = (bytes) => `${(bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0)} GB`;

const call = async (name, args) => (await import('@tauri-apps/api/core')).invoke(name, args);

/** { engine: { version, kind } | null, models: [{ file, size, partial }], running, folder } */
export const localState = signal(null);
/** Downloads under way, by key ("engine" or a file): { got, total }. */
export const downloads = signal({});

export async function refreshLocal() {
  if (!isDesktop) return null;
  localState.value = await call('local_status');
  return localState.value;
}

async function withProgress(key, cmd, args) {
  const { Channel } = await import('@tauri-apps/api/core');
  const progress = new Channel();
  downloads.value = { ...downloads.value, [key]: { got: 0, total: 0 } };
  progress.onmessage = (p) => (downloads.value = { ...downloads.value, [key]: p });
  try {
    return await call(cmd, { ...args, progress });
  } finally {
    const { [key]: _, ...rest } = downloads.value;
    downloads.value = rest;
    refreshLocal().catch(() => {});
  }
}

/** Gets the engine: 'vulkan' (graphics card) or 'cpu'. */
export const installEngine = (kind) => withProgress('engine', 'local_install_engine', { kind });
/** Downloads a model ({ url, file }); picks up a cut-off download where it stopped. */
export const downloadModel = ({ url, file }) => withProgress(file, 'local_download_model', { url, file });
export const cancelDownload = (key) => call('local_cancel', { key });
export const deleteModel = async (file) => {
  await call('local_delete_model', { file });
  await refreshLocal();
};
export const stopLocal = async () => {
  await call('local_stop');
  await refreshLocal();
};

/** A model from a Hugging Face address: { url, file }, or null if it isn't one. */
export function fromHuggingFace(text) {
  try {
    const u = new URL(String(text).trim().replace('/blob/', '/resolve/'));
    const file = u.pathname.split('/').at(-1);
    if (u.hostname !== 'huggingface.co' || !u.pathname.includes('/resolve/') || !/^[\w.-]+\.gguf$/i.test(file))
      return null;
    u.search = '';
    return { url: u.href, file };
  } catch {
    return null;
  }
}

/**
 * The address to talk to for `file`: starts the server with it if needed
 * (loading a model takes a few seconds, longer the first time).
 */
export async function localBase(file, { ctx = 32768, gpu = true } = {}) {
  if (!isDesktop) throw new Error('Models on this PC run in the desktop app.');
  if (!file) throw new Error('Pick a model first (the gear above): download one if there are none.');
  const port = await call('local_start', { file, ctx, gpu });
  refreshLocal().catch(() => {});
  return `http://127.0.0.1:${port}/v1`;
}
