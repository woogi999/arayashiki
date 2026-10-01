// Roblox's binary model files (.rbxm, "<roblox!"), read into a plain tree:
// [{ class, name, props, children }]. Enough of the format for accessories
// and effects: strings and content IDs, numbers, booleans, Vector3s,
// CFrames, Color3s and references. Chunks are LZ4- or zstd-compressed; zstd
// ones need a decoder passed in (the app's codec has one).
//
// Format: https://dom.rojo.space/binary.html

const DEC = new TextDecoder();

function lz4(src, size) {
  const dst = new Uint8Array(size);
  let i = 0;
  let o = 0;
  while (i < src.length) {
    const token = src[i++];
    let lit = token >> 4;
    if (lit === 15) {
      let b;
      do {
        b = src[i++];
        lit += b;
      } while (b === 255);
    }
    dst.set(src.subarray(i, i + lit), o);
    i += lit;
    o += lit;
    if (i >= src.length) break;
    const offset = src[i] | (src[i + 1] << 8);
    i += 2;
    let len = token & 15;
    if (len === 15) {
      let b;
      do {
        b = src[i++];
        len += b;
      } while (b === 255);
    }
    len += 4;
    for (let k = 0; k < len; k++, o++) dst[o] = dst[o - offset];
  }
  return dst;
}

// Interleaved 32-bit values: all first bytes, then all second bytes…, big-endian.
function interleaved(b, at, n) {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = ((b[at + i] << 24) | (b[at + n + i] << 16) | (b[at + 2 * n + i] << 8) | b[at + 3 * n + i]) >>> 0;
  return out;
}
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
// Roblox floats have their sign bit moved to the end.
const rotatedFloat = (v) => {
  u32[0] = (v >>> 1) | ((v & 1) << 31);
  return f32[0];
};
const zigzag = (v) => (v >>> 1) ^ -(v & 1);

// CFrame rotations stored as one byte: the 24 axis-aligned ones, as
// R00 R01 R02 R10 R11 R12 R20 R21 R22 (rbx-dom's table).
const ROTATIONS = {
  0x02: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  0x03: [1, 0, 0, 0, 0, -1, 0, 1, 0],
  0x05: [1, 0, 0, 0, -1, 0, 0, 0, -1],
  0x06: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  0x07: [0, 1, 0, 1, 0, 0, 0, 0, -1],
  0x09: [0, 0, 1, 1, 0, 0, 0, 1, 0],
  0x0a: [0, -1, 0, 1, 0, 0, 0, 0, 1],
  0x0c: [0, 0, -1, 1, 0, 0, 0, -1, 0],
  0x0d: [0, 1, 0, 0, 0, 1, 1, 0, 0],
  0x0e: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  0x10: [0, -1, 0, 0, 0, -1, 1, 0, 0],
  0x11: [0, 0, 1, 0, -1, 0, 1, 0, 0],
  0x14: [-1, 0, 0, 0, 1, 0, 0, 0, -1],
  0x15: [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  0x17: [-1, 0, 0, 0, -1, 0, 0, 0, 1],
  0x18: [-1, 0, 0, 0, 0, -1, 0, -1, 0],
  0x19: [0, 1, 0, -1, 0, 0, 0, 0, 1],
  0x1b: [0, 0, -1, -1, 0, 0, 0, 1, 0],
  0x1c: [0, -1, 0, -1, 0, 0, 0, 0, -1],
  0x1e: [0, 0, 1, -1, 0, 0, 0, -1, 0],
  0x1f: [0, 1, 0, 0, 0, -1, -1, 0, 0],
  0x20: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  0x22: [0, -1, 0, 0, 0, 1, -1, 0, 0],
  0x23: [0, 0, -1, 0, -1, 0, -1, 0, 0],
};

function readProp(type, b, at, n) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  switch (type) {
    case 0x01: // String (and content IDs, which are strings)
    case 0x1d: {
      for (let i = 0; i < n; i++) {
        const len = view.getUint32(at, true);
        out.push(DEC.decode(b.subarray(at + 4, at + 4 + len)));
        at += 4 + len;
      }
      return out;
    }
    case 0x02: // Bool
      for (let i = 0; i < n; i++) out.push(b[at + i] !== 0);
      return out;
    case 0x03: // Int32
      return [...interleaved(b, at, n)].map(zigzag);
    case 0x04: // Float32
      return [...interleaved(b, at, n)].map(rotatedFloat);
    case 0x05: // Float64
      for (let i = 0; i < n; i++) out.push(view.getFloat64(at + i * 8, true));
      return out;
    case 0x0c: {
      // Color3: three runs of floats
      const [r, g, bl] = [0, 1, 2].map((k) => interleaved(b, at + k * 4 * n, n));
      for (let i = 0; i < n; i++) out.push([rotatedFloat(r[i]), rotatedFloat(g[i]), rotatedFloat(bl[i])]);
      return out;
    }
    case 0x0e: {
      // Vector3
      const [x, y, z] = [0, 1, 2].map((k) => interleaved(b, at + k * 4 * n, n));
      for (let i = 0; i < n; i++) out.push([rotatedFloat(x[i]), rotatedFloat(y[i]), rotatedFloat(z[i])]);
      return out;
    }
    case 0x10: {
      // CFrame: per instance a rotation id (0: nine floats follow), then
      // all the positions as a Vector3 run.
      const rotations = [];
      for (let i = 0; i < n; i++) {
        const id = b[at++];
        if (id === 0) {
          const m = [];
          for (let k = 0; k < 9; k++) m.push(view.getFloat32(at + k * 4, true));
          at += 36;
          rotations.push(m);
        } else rotations.push(ROTATIONS[id] ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      }
      const [x, y, z] = [0, 1, 2].map((k) => interleaved(b, at + k * 4 * n, n));
      for (let i = 0; i < n; i++) out.push([rotatedFloat(x[i]), rotatedFloat(y[i]), rotatedFloat(z[i]), ...rotations[i]]);
      return out;
    }
    case 0x12: // Enum
      return [...interleaved(b, at, n)];
    case 0x13: {
      // Referent: accumulated deltas
      const raw = interleaved(b, at, n);
      let acc = 0;
      for (let i = 0; i < n; i++) out.push((acc += zigzag(raw[i])));
      return out;
    }
    case 0x1a: // Color3uint8: runs of r, g, b
      for (let i = 0; i < n; i++) out.push([b[at + i], b[at + n + i], b[at + 2 * n + i]]);
      return out;
    default:
      return null; // a type this doesn't need
  }
}

/** Parses a binary model. `zstd(bytes, size)` decodes zstd chunks if given. */
export function readRbxm(buffer, { zstd } = {}) {
  const bytes = new Uint8Array(buffer);
  const start = bytes.indexOf(0x3c); // "<roblox!"
  if (DEC.decode(bytes.subarray(start, start + 8)) !== '<roblox!') throw new Error('Not a binary Roblox model');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = start + 32;
  const classes = {}; // class id → { name, ids }
  const byId = new Map(); // referent → instance
  const parents = [];
  while (at + 16 <= bytes.length) {
    const name = DEC.decode(bytes.subarray(at, at + 4));
    const packed = view.getUint32(at + 4, true);
    const size = view.getUint32(at + 8, true);
    at += 16;
    let body;
    if (packed === 0) {
      body = bytes.subarray(at, at + size);
      at += size;
    } else {
      const raw = bytes.subarray(at, at + packed);
      at += packed;
      const isZstd = raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd;
      body = isZstd ? (zstd ? zstd(raw, size) : null) : lz4(raw, size);
    }
    if (name === 'END\0') break;
    if (!body) continue;
    const bv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    if (name === 'INST') {
      const cid = bv.getUint32(0, true);
      const len = bv.getUint32(4, true);
      const cls = DEC.decode(body.subarray(8, 8 + len));
      let p = 8 + len + 1; // + the service flag
      const count = bv.getUint32(p, true);
      p += 4;
      const ids = readProp(0x13, body, p, count);
      classes[cid] = { name: cls, ids };
      for (const id of ids) byId.set(id, { class: cls, name: '', props: {}, children: [] });
    } else if (name === 'PROP') {
      const cid = bv.getUint32(0, true);
      const len = bv.getUint32(4, true);
      const prop = DEC.decode(body.subarray(8, 8 + len));
      const type = body[8 + len];
      const cls = classes[cid];
      if (!cls) continue;
      let values = null;
      try {
        values = readProp(type, body, 9 + len, cls.ids.length);
      } catch {
        values = null;
      }
      if (!values) continue;
      cls.ids.forEach((id, i) => {
        const inst = byId.get(id);
        if (prop === 'Name') inst.name = values[i];
        else inst.props[prop] = values[i];
      });
    } else if (name === 'PRNT') {
      const count = bv.getUint32(1, true);
      const kids = readProp(0x13, body, 5, count);
      const dads = readProp(0x13, body, 5 + count * 4, count);
      kids.forEach((k, i) => parents.push([k, dads[i]]));
    }
  }
  const roots = [];
  for (const [kid, dad] of parents) {
    const child = byId.get(kid);
    if (!child) continue;
    const parent = byId.get(dad);
    if (parent) parent.children.push(child);
    else roots.push(child);
  }
  return roots;
}

/** Every instance under `roots` (depth first). */
export function* walk(roots) {
  for (const r of roots) {
    yield r;
    yield* walk(r.children);
  }
}
