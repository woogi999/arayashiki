// A QuickTime .mov holding PNG frames (the "png " codec, 32-bit: colour and
// alpha). It's how a transparent video goes into After Effects, Premiere,
// DaVinci Resolve, Vegas or ffmpeg when the browser can't encode ProRes
// 4444: every editor reads it, alpha and all.
//
// Written front to back through `write(bytes, position)`: the file type, an
// mdat whose 64-bit size is filled in at the end, the frames one after the
// other, then the moov with the sample table. Nothing is held in memory but
// the table.

const enc = new TextEncoder();
const u8 = (...parts) => {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const u16 = (v) => new Uint8Array([(v >>> 8) & 255, v & 255]);
const u32 = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const u64 = (v) => u8(u32(Math.floor(v / 2 ** 32)), u32(v >>> 0));
const fourcc = (s) => enc.encode(s.padEnd(4, ' ').slice(0, 4));
const box = (type, ...body) => {
  const inner = u8(...body);
  return u8(u32(inner.length + 8), fourcc(type), inner);
};
const full = (type, version, flags, ...body) => box(type, new Uint8Array([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...body);
const zeros = (n) => new Uint8Array(n);
// The identity matrix, as QuickTime writes it (16.16 and 2.30 fixed point).
const MATRIX = u8(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
const pascal = (text, size) => {
  const bytes = enc.encode(text).slice(0, size - 1);
  const out = new Uint8Array(size);
  out[0] = bytes.length;
  out.set(bytes, 1);
  return out;
};

/**
 * Starts a PNG .mov. `write(bytes, position)` puts bytes in the file (may
 * return a promise). Then `add(png)` for each frame in order, and
 * `finish()`.
 */
export function pngMov({ width, height, fps, write }) {
  const timescale = 60000;
  const delta = Math.round(timescale / fps);
  const ftyp = box('ftyp', fourcc('qt  '), u32(0x20050300), fourcc('qt  '));
  const MDAT = ftyp.length; // where the mdat header starts
  const sizes = [];
  const offsets = [];
  let at = MDAT + 16;
  let chain = Promise.resolve(write(u8(ftyp, u32(1), fourcc('mdat'), u64(16)), 0));
  return {
    add(png) {
      offsets.push(at);
      sizes.push(png.length);
      const where = at;
      at += png.length;
      chain = chain.then(() => write(png, where));
      return chain;
    },
    /**
     * Ends the file. `audio`: { pcm (interleaved Int16Array), sampleRate,
     * channels } for a sound track ('sowt': 16-bit little-endian PCM).
     */
    async finish({ audio = null } = {}) {
      await chain;
      const n = sizes.length;
      const duration = n * delta;
      // The sound, as one chunk after the frames.
      let audioAt = 0;
      if (audio?.pcm?.length) {
        audioAt = at;
        const bytes = new Uint8Array(audio.pcm.buffer, audio.pcm.byteOffset, audio.pcm.byteLength);
        await write(bytes, at);
        at += bytes.length;
      }
      await write(u64(at - MDAT), MDAT + 8);
      const stsd = full(
        'stsd',
        0,
        0,
        u32(1),
        box(
          'png ',
          zeros(6),
          u16(1), // data reference index
          u16(0), // version
          u16(0), // revision
          fourcc('appl'),
          u32(0), // temporal quality
          u32(0x400), // spatial quality: lossless
          u16(width),
          u16(height),
          u32(72 << 16),
          u32(72 << 16),
          u32(0), // data size
          u16(1), // frames per sample
          pascal('PNG', 32),
          u16(32), // depth: colour and alpha
          u16(0xffff), // no colour table
        ),
      );
      const stbl = box(
        'stbl',
        stsd,
        full('stts', 0, 0, u32(1), u32(n), u32(delta)),
        full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
        full('stsz', 0, 0, u32(0), u32(n), ...sizes.map(u32)),
        full('co64', 0, 0, u32(n), ...offsets.map(u64)),
      );
      const minf = box(
        'minf',
        full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
        full('hdlr', 0, 0, fourcc('dhlr'), fourcc('alis'), u32(0), u32(0), u32(0), pascal('DataHandler', 12)),
        box('dinf', full('dref', 0, 0, u32(1), full('alis', 0, 1))),
        stbl,
      );
      const mdia = box(
        'mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x7fff), u16(0)),
        full('hdlr', 0, 0, fourcc('mhlr'), fourcc('vide'), u32(0), u32(0), u32(0), pascal('VideoHandler', 13)),
        minf,
      );
      const tkhd = full(
        'tkhd',
        0,
        0xf,
        u32(0),
        u32(0),
        u32(1), // track id
        u32(0),
        u32(duration),
        zeros(8),
        u16(0), // layer
        u16(0), // alternate group
        u16(0), // volume (video)
        u16(0),
        MATRIX,
        u32(width << 16),
        u32(height << 16),
      );
      const trak = box('trak', tkhd, box('edts', full('elst', 0, 0, u32(1), u32(duration), u32(0), u32(0x10000))), mdia);
      const mvhd = full(
        'mvhd',
        0,
        0,
        u32(0),
        u32(0),
        u32(timescale),
        u32(duration),
        u32(0x10000), // rate 1.0
        u16(0x100), // volume 1.0
        zeros(10),
        MATRIX,
        zeros(24), // preview, poster, selection, current time
        u32(2), // next track id
      );
      const traks = [trak];
      if (audioAt) {
        const frames = audio.pcm.length / audio.channels;
        const aduration = Math.round((frames / audio.sampleRate) * timescale);
        const sound = box(
          'stbl',
          full(
            'stsd',
            0,
            0,
            u32(1),
            box(
              'sowt',
              zeros(6),
              u16(1),
              u16(0), // version
              u16(0), // revision
              u32(0), // vendor
              u16(audio.channels),
              u16(16), // bits
              u16(0), // compression id
              u16(0), // packet size
              u32(audio.sampleRate * 65536 >>> 0),
            ),
          ),
          full('stts', 0, 0, u32(1), u32(frames), u32(1)),
          full('stsc', 0, 0, u32(1), u32(1), u32(frames), u32(1)),
          full('stsz', 0, 0, u32(audio.channels * 2), u32(frames)),
          full('co64', 0, 0, u32(1), u64(audioAt)),
        );
        const sminf = box(
          'minf',
          full('smhd', 0, 0, u16(0), u16(0)),
          full('hdlr', 0, 0, fourcc('dhlr'), fourcc('alis'), u32(0), u32(0), u32(0), pascal('DataHandler', 12)),
          box('dinf', full('dref', 0, 0, u32(1), full('alis', 0, 1))),
          sound,
        );
        const smdia = box(
          'mdia',
          full('mdhd', 0, 0, u32(0), u32(0), u32(audio.sampleRate), u32(frames), u16(0x7fff), u16(0)),
          full('hdlr', 0, 0, fourcc('mhlr'), fourcc('soun'), u32(0), u32(0), u32(0), pascal('SoundHandler', 13)),
          sminf,
        );
        const stkhd = full('tkhd', 0, 0xf, u32(0), u32(0), u32(2), u32(0), u32(aduration), zeros(8), u16(0), u16(1), u16(0x100), u16(0), MATRIX, u32(0), u32(0));
        traks.push(box('trak', stkhd, smdia));
      }
      mvhd.set(u32(traks.length + 1), mvhd.length - 4);
      await write(box('moov', mvhd, ...traks), at);
    },
  };
}
