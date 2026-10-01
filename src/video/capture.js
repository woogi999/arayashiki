// Pictures and videos of the 3D view: a screenshot (a thumbnail, say), and an
// export of the skill as MP4, MOV, WebM, an animated GIF or a PNG sequence,
// at any size and frame rate, in slow motion if asked, with its sounds, and
// with the room, a transparent background or a chroma key colour behind it.
//
// Frames aren't recorded off the screen: each one is drawn off screen at the
// export's size and time (src/scene.js `capture`), read back and handed to
// the encoder, so a slow-motion video is as smooth as a real-time one and
// nothing depends on how fast the PC draws. Video encoding is WebCodecs (the
// GPU's H.264/HEVC/VP9/AV1 encoders) through mediabunny, written straight to
// the file as it goes; a transparent .mov is PNG frames in QuickTime
// (src/video/mov-png.js), encoded by a pool of workers. The soundtrack is
// rendered offline (src/video/audio.js) and muxed in.

import {
  AudioBufferSource,
  BufferTarget,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { pngMov } from './mov-png.js';
import { renderAudio, toPcm16, toWav } from './audio.js';
import { isDesktop, openFileStream, openFolder, saveBlob } from '../platform.js';

/** What each format is and can do. */
export const FORMATS = {
  mp4: { label: 'MP4', ext: 'mp4', codecs: ['avc', 'hevc', 'av1'], alpha: false, audio: true, video: true },
  mov: { label: 'QuickTime MOV', ext: 'mov', codecs: ['avc', 'hevc', 'png'], alpha: true, audio: true, video: true },
  webm: { label: 'WebM', ext: 'webm', codecs: ['vp9', 'av1', 'vp8'], alpha: true, audio: true, video: true },
  gif: { label: 'Animated GIF', ext: 'gif', codecs: ['gif'], alpha: true, audio: false, video: false },
  png: { label: 'PNG sequence', ext: 'png', codecs: ['png'], alpha: true, audio: true, video: false },
};
export const CODEC_LABELS = { avc: 'H.264', hevc: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', png: 'PNG (lossless, alpha)', gif: 'GIF' };

export const QUALITIES = { low: QUALITY_LOW, medium: QUALITY_MEDIUM, high: QUALITY_HIGH, best: QUALITY_VERY_HIGH };

const even = (n) => Math.max(16, 2 * Math.round(n / 2));

// ─── PNG workers ─────────────────────────────────────────────────────────

let pool = null;
function workers() {
  if (pool) return pool;
  const count = Math.max(2, Math.min(6, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
  const waiting = new Map();
  let next = 0;
  const list = Array.from({ length: count }, () => {
    const w = new Worker(new URL('./png-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) job?.reject(new Error(data.error));
      else job?.resolve(data.png);
    };
    return w;
  });
  let turn = 0;
  pool = {
    size: count,
    png(pixels, width, height) {
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        list[turn++ % count].postMessage({ id, pixels, width, height }, [pixels.buffer]);
      });
    },
  };
  return pool;
}

/** RGBA rows → a PNG Blob, on the main thread (one picture). */
export async function toPng({ pixels, width, height }) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * RGBA rows → I420 (Y, then U and V at half size), BT.709, limited range
 * (16–235 luma, 16–240 chroma): what players and editors assume for video.
 * `flatten` lays transparent pixels on black (a format without alpha).
 */
export function rgbaToI420(rgba, w, h, flatten = false) {
  const out = new Uint8Array(w * h + 2 * ((w >> 1) * (h >> 1)));
  const cw = w >> 1;
  const U = w * h;
  const V = U + cw * (h >> 1);
  const a = (p) => (flatten ? rgba[p + 3] / 255 : 1);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const k = a(p);
    out[i] = (16 + (0.1826 * rgba[p] + 0.6142 * rgba[p + 1] + 0.062 * rgba[p + 2]) * k + 0.5) | 0;
  }
  for (let y = 0; y < h >> 1; y++)
    for (let x = 0; x < cw; x++) {
      const p0 = (y * 2 * w + x * 2) * 4;
      const p1 = p0 + w * 4;
      const ka = a(p0);
      const kb = a(p0 + 4);
      const kc = a(p1);
      const kd = a(p1 + 4);
      const r = (rgba[p0] * ka + rgba[p0 + 4] * kb + rgba[p1] * kc + rgba[p1 + 4] * kd) / 4;
      const g = (rgba[p0 + 1] * ka + rgba[p0 + 5] * kb + rgba[p1 + 1] * kc + rgba[p1 + 5] * kd) / 4;
      const bl = (rgba[p0 + 2] * ka + rgba[p0 + 6] * kb + rgba[p1 + 2] * kc + rgba[p1 + 6] * kd) / 4;
      out[U + y * cw + x] = (128 - 0.1006 * r - 0.3386 * g + 0.4392 * bl + 0.5) | 0;
      out[V + y * cw + x] = (128 + 0.4392 * r - 0.3989 * g - 0.0403 * bl + 0.5) | 0;
    }
  return out;
}

// ─── Screenshots ─────────────────────────────────────────────────────────

/** A picture of the view at `t`: the PNG as a Blob. `options` as scene.capture takes them. */
export async function screenshot(scene, t, options) {
  const frame = await scene.capture(t, options);
  scene.endCapture();
  return toPng(frame);
}

/** Copies a PNG Blob to the clipboard. */
export async function copyPng(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// ─── What this PC can encode ─────────────────────────────────────────────

/** The video codecs a format can use here, best first. */
export async function availableCodecs(format, { width = 1920, height = 1080 } = {}) {
  const f = FORMATS[format];
  const out = [];
  for (const codec of f.codecs) {
    if (codec === 'png' || codec === 'gif') out.push(codec);
    else if (await canEncodeVideo(codec, { width: even(width), height: even(height) }).catch(() => false)) out.push(codec);
  }
  return out;
}

/** The audio codec a format will use here, or null. */
export async function audioCodecFor(format) {
  if (format === 'png' || format === 'gif') return format === 'png' ? 'wav' : null;
  if (format === 'mov') return 'pcm';
  const choices = format === 'webm' ? ['opus'] : ['aac', 'opus'];
  for (const c of choices) if (await canEncodeAudio(c).catch(() => false)) return c;
  return null;
}

/** How many frames, and when each is, for a range played at `speed` (0.25 is quarter speed). */
export function frameTimes({ from, to, fps, speed }) {
  const length = Math.max(0, to - from);
  const count = Math.max(1, Math.ceil((length / speed) * fps - 1e-6) + 1);
  return Array.from({ length: count }, (_, i) => Math.min(to, from + (i / fps) * speed));
}

/** A rough size of the result, in bytes (for the dialog). */
export function estimateSize(s) {
  const frames = frameTimes(s).length;
  const seconds = frames / s.fps;
  const pixels = s.width * s.height;
  const alphaPng = s.codec === 'png';
  if (s.format === 'gif') return frames * pixels * 0.35;
  if (s.format === 'png' || alphaPng) return frames * pixels * (s.background === 'transparent' ? 0.9 : 1.6);
  const bits = s.bitrateMode === 'quality' ? pixels * s.fps * { low: 0.04, medium: 0.07, high: 0.12, best: 0.2 }[s.quality] : s.bitrate * 1e6;
  const audio = s.audio?.enabled ? (s.audio.kbps ?? 192) * 1000 : 0;
  return ((bits + audio) * seconds) / 8;
}

// ─── Export ──────────────────────────────────────────────────────────────

/**
 * Exports the open skill. `s` (settings):
 *   format 'mp4' | 'mov' | 'webm' | 'gif' | 'png', codec (one of the format's),
 *   width, height, fps, speed (1, 0.5, 0.25…), from, to (seconds of the skill),
 *   bitrateMode 'quality' | 'variable' | 'constant', quality, bitrate (Mbps),
 *   keyframes (seconds between), background 'scene' | 'transparent' |
 *   'chroma' | 'colour', chroma / colour ('#rrggbb'), stage, camera,
 *   hitboxes, popups, screenFx, audio { enabled, kbps, sampleRate, slow },
 *   gif { colors, loop }, name, where 'ask' | 'videos'.
 * `clips`: the run's sounds (store.audioClips). `onProgress({ frame,
 * frames, phase })`; `cancelled()` is checked between frames. Resolves
 * { path, frames, codec, seconds, audio } or null if a dialog was cancelled.
 */
export async function exportVideo(scene, s, { clips = [], onProgress = () => {}, cancelled = () => false } = {}) {
  const f = FORMATS[s.format];
  const width = f.video ? even(s.width) : Math.max(16, Math.round(s.width));
  const height = f.video ? even(s.height) : Math.max(16, Math.round(s.height));
  const fps = s.format === 'gif' ? Math.min(50, s.fps) : s.fps;
  // A transparent background in a format without alpha is laid on black.
  const wantsAlpha = s.background === 'transparent';
  const codec = s.codec ?? (await availableCodecs(s.format, { width, height }))[0];
  if (!codec) throw new Error(`This PC can’t encode ${f.label} at ${width} × ${height}. Try another format or a smaller size.`);
  const alpha = wantsAlpha && (codec === 'png' || codec === 'gif' || codec === 'vp9' || codec === 'vp8' || codec === 'av1') && f.alpha;
  const background = s.background === 'chroma' ? s.chroma : s.background === 'colour' ? s.colour : s.background;
  const times = frameTimes({ from: s.from, to: s.to, fps, speed: s.speed });
  const started = performance.now();
  const capture = (t) =>
    scene.capture(t, { width, height, background, stage: s.stage, camera: s.camera, hitboxes: s.hitboxes, popups: s.popups, screenFx: s.screenFx });

  // The soundtrack, first: it's quick, and a failure shouldn't waste a render.
  let sound = { buffer: null, used: 0, missing: 0 };
  if (s.audio?.enabled && f.audio && s.audio.slow !== 'mute') {
    onProgress({ frame: 0, frames: times.length, phase: 'sound' });
    sound = await renderAudio(clips, { from: s.from, to: s.to, speed: s.speed, sampleRate: s.audio.sampleRate ?? 48000, slow: s.audio.slow ?? 'slow' });
  }

  const base = s.name || 'skill';
  // ── An image sequence: a folder of PNGs (and the sound as a .wav) ──
  if (s.format === 'png') {
    const folder = await openFolder(base, s.where);
    if (!folder) return null;
    const png = workers();
    const digits = String(times.length).length + 1;
    const writes = [];
    try {
      for (let i = 0; i < times.length; i++) {
        if (cancelled()) throw new DOMException('Cancelled', 'AbortError');
        const frame = await capture(times[i]);
        if (!alpha) for (let p = 3; p < frame.pixels.length; p += 4) frame.pixels[p] = 255;
        const name = `${base}_${String(i).padStart(digits, '0')}.png`;
        writes.push(png.png(frame.pixels, width, height).then((bytes) => folder.write(name, bytes)));
        if (writes.length > png.size + 2) await writes.shift();
        onProgress({ frame: i + 1, frames: times.length, phase: 'frames' });
      }
      await Promise.all(writes);
      if (sound.buffer) await folder.write(`${base}.wav`, toWav(sound.buffer));
    } finally {
      scene.endCapture();
    }
    return { path: folder.path, frames: times.length, codec: 'png', seconds: (performance.now() - started) / 1000, width, height, audio: sound };
  }

  // ── Everything else is one file ──
  const filename = `${base}.${f.ext}`;
  const file = isDesktop ? await openFileStream(filename, `${f.label}`, s.where) : null;
  if (isDesktop && !file) return null;
  const memory = [];
  const write = isDesktop ? (bytes, position) => file.write(bytes, position) : (bytes, position) => memory.push({ bytes: bytes.slice(), position });

  try {
    if (s.format === 'gif') {
      // A palette per frame (gifenc), 1-bit transparency when asked.
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);
      for (let i = 0; i < times.length; i++) {
        if (cancelled()) throw new DOMException('Cancelled', 'AbortError');
        const { pixels } = await capture(times[i]);
        const rgba = new Uint8Array(pixels.buffer);
        const palette = quantize(rgba, s.gif?.colors ?? 256, alpha ? { format: 'rgba4444', oneBitAlpha: true } : {});
        const index = applyPalette(rgba, palette, alpha ? 'rgba4444' : 'rgb565');
        const transparentIndex = alpha ? palette.findIndex((c) => c[3] === 0) : -1;
        gif.writeFrame(index, width, height, {
          palette,
          delay,
          repeat: s.gif?.loop === false ? -1 : 0,
          ...(transparentIndex >= 0 ? { transparent: true, transparentIndex, dispose: 2 } : {}),
        });
        onProgress({ frame: i + 1, frames: times.length, phase: 'frames' });
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // keep the window responsive
      }
      gif.finish();
      onProgress({ frame: times.length, frames: times.length, phase: 'finishing' });
      await write(gif.bytes(), 0);
    } else if (codec === 'png') {
      const mov = pngMov({ width, height, fps, write });
      const png = workers();
      const inFlight = [];
      for (let i = 0; i < times.length; i++) {
        if (cancelled()) throw new DOMException('Cancelled', 'AbortError');
        const frame = await capture(times[i]);
        if (!alpha) for (let p = 3; p < frame.pixels.length; p += 4) frame.pixels[p] = 255;
        inFlight.push(png.png(frame.pixels, width, height));
        if (inFlight.length >= png.size + 1) await mov.add(await inFlight.shift());
        onProgress({ frame: i + 1, frames: times.length, phase: 'frames' });
      }
      while (inFlight.length) await mov.add(await inFlight.shift());
      onProgress({ frame: times.length, frames: times.length, phase: 'finishing' });
      await mov.finish({ audio: sound.buffer ? { pcm: toPcm16(sound.buffer), sampleRate: sound.buffer.sampleRate, channels: sound.buffer.numberOfChannels } : null });
    } else {
      const target = isDesktop
        ? new StreamTarget(new WritableStream({ write: (chunk) => write(chunk.data, chunk.position) }), { chunked: true, chunkSize: 4 * 1024 * 1024 })
        : new BufferTarget();
      const format =
        s.format === 'webm' ? new WebMOutputFormat() : s.format === 'mov' ? new MovOutputFormat() : new Mp4OutputFormat({ fastStart: isDesktop ? false : 'in-memory' });
      const output = new Output({ format, target });
      const source = new VideoSampleSource({
        codec,
        bitrate: s.bitrateMode === 'quality' ? (QUALITIES[s.quality] ?? QUALITY_HIGH) : Math.round(Math.max(0.1, s.bitrate) * 1e6),
        bitrateMode: s.bitrateMode === 'constant' ? 'constant' : 'variable',
        alpha: alpha ? 'keep' : 'discard',
        keyFrameInterval: Math.max(0.1, s.keyframes ?? 2),
        latencyMode: 'quality',
      });
      output.addVideoTrack(source, { frameRate: fps });
      let audioSource = null;
      if (sound.buffer) {
        const acodec = (await audioCodecFor(s.format)) ?? null;
        if (acodec && acodec !== 'pcm') {
          audioSource = new AudioBufferSource({ codec: acodec, bitrate: (s.audio.kbps ?? 192) * 1000 });
          output.addAudioTrack(audioSource);
        } else if (acodec === 'pcm') {
          audioSource = new AudioBufferSource({ codec: 'pcm-s16' });
          output.addAudioTrack(audioSource);
        }
      }
      await output.start();
      if (audioSource) {
        await audioSource.add(sound.buffer);
        audioSource.close();
      }
      const sampleOf = (frame, i) =>
        // Opaque video goes to the encoder as BT.709 limited-range YUV,
        // converted here: Windows' encoders ignore an RGB frame's colour
        // space and label full-range output as TV range, which darkens it.
        alpha
          ? new VideoSample(frame.pixels, { format: 'RGBA', codedWidth: width, codedHeight: height, timestamp: i / fps, duration: 1 / fps })
          : new VideoSample(rgbaToI420(frame.pixels, width, height, wantsAlpha), {
              format: 'I420',
              codedWidth: width,
              codedHeight: height,
              timestamp: i / fps,
              duration: 1 / fps,
              colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
            });
      // The GPU draws the next frame while the encoder takes this one.
      let encoding = Promise.resolve();
      let next = capture(times[0]);
      for (let i = 0; i < times.length; i++) {
        if (cancelled()) {
          await encoding.catch(() => {});
          await output.cancel();
          throw new DOMException('Cancelled', 'AbortError');
        }
        const frame = await next;
        if (i + 1 < times.length) next = encoding.then(() => capture(times[i + 1]));
        const sample = sampleOf(frame, i);
        await encoding;
        encoding = source.add(sample).finally(() => sample.close());
        onProgress({ frame: i + 1, frames: times.length, phase: 'frames' });
      }
      await encoding;
      source.close();
      onProgress({ frame: times.length, frames: times.length, phase: 'finishing' });
      await output.finalize();
      if (!isDesktop) memory.push({ bytes: new Uint8Array(target.buffer), position: 0 });
    }
  } catch (error) {
    await file?.abort();
    scene.endCapture();
    throw error;
  }
  scene.endCapture();
  let path;
  if (isDesktop) path = await file.close();
  else {
    const size = memory.reduce((n, m) => Math.max(n, m.position + m.bytes.length), 0);
    const all = new Uint8Array(size);
    for (const m of memory) all.set(m.bytes, m.position);
    const type = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' }[s.format];
    path = await saveBlob(new Blob([all], { type }), filename);
  }
  return { path, frames: times.length, codec, seconds: (performance.now() - started) / 1000, width, height, audio: sound };
}
