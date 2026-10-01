// A video's soundtrack: the skill's SFX nodes mixed the way the app plays
// them (src/store.js, after JJS's customSFX): each clip from its START
// (`from`), at its SPEED, at VOLUME with FADE IN and FADE OUT, until its END,
// a CANCEL, or the file running out.
//
// The sounds come through the same asset pipeline as the viewport's (the
// Roblox cache, then Roblox as the signed-in account); one that won't come
// is left out and counted. The mix is rendered offline (OfflineAudioContext),
// so it's exact and doesn't play aloud.
//
// Slow motion: 'slow' slows the sound with the picture (lower pitch, like
// tape), 'real' plays each sound at its own speed from the moment it starts,
// 'mute' leaves sound out.

import { robloxSoundBytes } from '../platform.js';
import { ease } from '../fx/roblox.js';

const cache = new Map(); // sound ID → Promise<ArrayBuffer | null>

function bytesOf(id) {
  if (!cache.has(id))
    cache.set(
      id,
      robloxSoundBytes(id)
        .then((b) => (b ? (b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer) : null))
        .catch(() => null),
    );
  return cache.get(id);
}

/**
 * Renders the mix for the part of the skill from `from` to `to` (seconds),
 * played at `speed`. Resolves { buffer: AudioBuffer | null, used, missing }.
 */
export async function renderAudio(clips, { from, to, speed = 1, sampleRate = 48000, slow = 'slow' }) {
  const length = Math.max(0.05, (to - from) / speed);
  const inRange = clips.filter((c) => c.stop > from && c.t < to);
  if (!inRange.length || slow === 'mute') return { buffer: null, used: 0, missing: 0 };
  const ctx = new OfflineAudioContext(2, Math.ceil(length * sampleRate), sampleRate);
  // Many sounds at once can add up past full scale: a limiter on the mix
  // keeps the peaks under it instead of clipping.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const master = ctx.createGain();
  master.gain.value = 0.95;
  limiter.connect(master).connect(ctx.destination);
  const decoded = new Map();
  let missing = 0;
  await Promise.all(
    [...new Set(inRange.map((c) => c.id))].map(async (id) => {
      const bytes = await bytesOf(id);
      if (!bytes) return;
      try {
        decoded.set(id, await ctx.decodeAudioData(bytes.slice(0)));
      } catch {
        // not a sound the browser reads
      }
    }),
  );
  let used = 0;
  // Video time for a moment of the skill.
  const video = (t) => (t - from) / speed;
  for (const c of inRange) {
    const buffer = decoded.get(c.id);
    if (!buffer) {
      missing++;
      continue;
    }
    // When the clip plays, in the skill's time: from its start (or the
    // range's) to its stop or the file's end.
    const fileEnd = c.t + (buffer.duration - c.from) / c.rate;
    const start = Math.max(c.t, from);
    let stop = Math.min(c.stop, fileEnd);
    if (stop <= start) continue;
    const real = slow === 'real' && speed !== 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = real ? c.rate : c.rate * speed;
    const gain = ctx.createGain();
    source.connect(gain).connect(limiter);
    const when = video(start);
    const offset = c.from + (start - c.t) * c.rate;
    // Played at its own speed, it lasts its real length from when it starts.
    const span = real ? stop - start : video(stop) - when;
    // Volume over the clip, sampled finely: VOLUME × fade in × fade out.
    const fadeOutAt = c.t + Math.max(0, buffer.duration - c.from - c.fadeOut) / c.rate;
    const steps = Math.max(2, Math.ceil(span * 100));
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const k = i / (steps - 1);
      const t = start + k * (stop - start); // the skill's clock
      let g = c.volume;
      if (c.fadeIn > 0) g *= ease('Quad', 'Out', Math.min(1, (t - c.t) / c.fadeIn));
      if (c.fadeOut > 0 && t > fadeOutAt) g *= 1 - ease('Quad', 'Out', Math.min(1, (t - fadeOutAt) / c.fadeOut));
      curve[i] = Math.max(0, g);
    }
    gain.gain.setValueCurveAtTime(curve, when, Math.max(0.001, span));
    source.start(when, offset, span * (real ? c.rate : c.rate * speed));
    used++;
  }
  if (!used) return { buffer: null, used: 0, missing };
  return { buffer: await ctx.startRendering(), used, missing };
}

/** An AudioBuffer as interleaved 16-bit PCM (for a .mov's sound, or a .wav). */
export function toPcm16(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new Int16Array(n * ch);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out[i * ch + c] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  return out;
}

/** An AudioBuffer as a .wav file's bytes (next to an image sequence). */
export function toWav(buffer) {
  const pcm = toPcm16(buffer);
  const ch = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return bytes;
}
