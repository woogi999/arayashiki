// The AI's memories (off until the user turns them on, Settings → AI): what
// it learns working here, kept on this PC so the next conversation starts
// knowing it. Two kinds:
//
//   notes      short things worth keeping: the user's preferences ("likes
//              heavy camera work", "names M1s like this"), JJS rules it found
//              out, what worked and what didn't
//   movesets   movesets the user wants it to remember: the skills, and their
//              style (agent/tools-core.js profile), to build in that style
//              again (as references, never copied whole)
//
// The AI reads and writes them with the memory_* tools (agent/tool-defs.js),
// the assistant inside the app and AI apps through MCP alike. The assistant
// also gets a digest of them in its instructions.
import { signal } from '@preact/signals';
import { makeShelf } from '../persist.js';
import * as S from '../store.js';

const KEY = 'arayashiki-memory';
const readOn = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}').enabled === true;
  } catch {
    return false;
  }
};
export const memoryOn = signal(readOn());
export function setMemoryOn(on) {
  memoryOn.value = Boolean(on);
  try {
    localStorage.setItem(KEY, JSON.stringify({ enabled: memoryOn.value }));
  } catch {
    // not kept
  }
}

const notes = makeShelf('memory-notes');
const sets = makeShelf('memory-movesets');
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const KINDS = ['preference', 'rule', 'pattern', 'note'];

/** Bumped when anything changes, for the settings' list. */
export const memoryVersion = signal(0);
const changed = () => (memoryVersion.value += 1);

const off = () => {
  throw new Error('Memories are off. The user can turn them on in Settings → AI → Memories.');
};

export async function listNotes() {
  return notes.list();
}
export async function listMovesets() {
  return sets.list();
}

export async function addNote({ kind = 'note', text, tags = [] }) {
  if (!memoryOn.peek()) off();
  const clean = String(text ?? '').trim().slice(0, 2000);
  if (!clean) throw new Error('Nothing to remember.');
  const id = newId();
  await notes.store(id, { kind: KINDS.includes(kind) ? kind : 'note', text: clean, tags: tags.slice(0, 8).map(String) }, true);
  changed();
  return { id, remembered: clean };
}

export async function forget(id) {
  await notes.forget(id);
  await sets.forget(id);
  changed();
  return { forgotten: id };
}

/** Keeps the open moveset (or given skills), with its style profile. */
export async function rememberMoveset({ name, note, skills } = {}) {
  if (!memoryOn.peek()) off();
  const list = (skills ?? S.skills.peek()).map(({ uid: _uid, ...s }) => s);
  if (!list.length) throw new Error('The moveset is empty.');
  const { profile } = await import('../../agent/tools-core.js');
  const style = await profile({ skills: list });
  const id = newId();
  const title = String(name || S.name.peek() || 'Moveset').slice(0, 80);
  await sets.store(id, { name: title, note: String(note ?? '').slice(0, 1000), summary: style.summary, skills: list.length }, { skills: list, profile: style });
  changed();
  return { id, name: title, profile: style };
}

export async function getMoveset(id) {
  const meta = (await sets.list()).find((m) => m.id === id);
  const data = await sets.load(id);
  if (!meta || !data) throw new Error(`No remembered moveset "${id}".`);
  return { ...meta, profile: data.profile, skills: data.skills };
}

export async function clearMemories() {
  for (const n of await notes.list()) await notes.forget(n.id);
  for (const m of await sets.list()) await sets.forget(m.id);
  changed();
}

/** Everything, for memory_read: notes in full, movesets as their summaries. */
export async function readMemories({ query } = {}) {
  if (!memoryOn.peek()) return { enabled: false, note: 'Memories are off (Settings → AI → Memories). Don’t write any.' };
  const q = String(query ?? '').toLowerCase().trim();
  const match = (text) => !q || text.toLowerCase().includes(q);
  const ns = (await notes.list()).filter((n) => match(`${n.kind} ${n.text} ${(n.tags ?? []).join(' ')}`));
  const ms = (await sets.list()).filter((m) => match(`${m.name} ${m.note} ${m.summary}`));
  return {
    enabled: true,
    notes: ns.map((n) => ({ id: n.id, kind: n.kind, text: n.text, tags: n.tags, saved: new Date(n.savedAt).toISOString().slice(0, 10) })),
    movesets: ms.map((m) => ({ id: m.id, name: m.name, note: m.note, style: m.summary, skills: m.skills })),
    how: 'Use these as background: the user’s preferences and style, and movesets to take after (memory_get_moveset for one in full). Write down what you learn with memory_write; keep notes short and specific.',
  };
}

/** A short digest for the assistant's instructions (empty when off or empty). */
export async function memoryDigest() {
  if (!memoryOn.peek()) return '';
  const ns = await notes.list();
  const ms = await sets.list();
  if (!ns.length && !ms.length)
    return 'Memories are on and empty: when you learn something about this user, their style or JJS worth keeping, save it with memory_write.';
  const lines = [
    'What you remember from earlier conversations (memories are on; add to them with memory_write, read more with memory_read):',
    ...ns.slice(0, 40).map((n) => `- [${n.kind}] ${n.text}`),
    ...(ms.length ? ['Movesets the user asked you to remember (memory_get_moveset for one; build in their style, don’t copy them whole):'] : []),
    ...ms.slice(0, 12).map((m) => `- ${m.name} (${m.id}): ${m.summary}${m.note ? `. ${m.note}` : ''}`),
  ];
  return lines.join('\n').slice(0, 6000);
}
