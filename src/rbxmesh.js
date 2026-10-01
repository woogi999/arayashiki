// Roblox's .mesh files, read into three.js geometry: every version the
// asset servers hand out.
//
//   1.00, 1.01   text: a triangle list, each corner "[pos][normal][uv]"
//                (1.00 is at half scale)
//   2.00         binary: vertices and faces
//   3.00         the same, plus levels of detail
//   4.00, 5.00   the same with skinning and FACS data after (skipped)
//   6.00, 7.00   chunks (COREMESH, LODS, …); COREMESH 2 is Draco-compressed
//
// Positions are in studs, in the mesh's own Roblox frame. UVs come out with v
// flipped for three.js. Only the finest level of detail is kept.

import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';

// Draco's decoder (bundled with three.js) loads only when a mesh needs it.
let draco = null;
const dracoLoader = () =>
  (draco ??= import('three/examples/jsm/loaders/DRACOLoader.js').then(({ DRACOLoader }) => new DRACOLoader()));

function geometry(positions, normals, uvs, index) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  if (uvs) g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (index) g.setIndex(new Uint32BufferAttribute(index, 1));
  if (!normals) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function readText(text, version) {
  const lines = text.split(/\r?\n/);
  const count = Number(lines[1]);
  const numbers = (lines.slice(2).join(' ').match(/-?[\d.]+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const scale = version === '1.00' ? 0.5 : 1;
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let i = 0; i < count * 3; i++) {
    const at = i * 9;
    if (at + 9 > numbers.length) break;
    positions.push(numbers[at] * scale, numbers[at + 1] * scale, numbers[at + 2] * scale);
    normals.push(numbers[at + 3], numbers[at + 4], numbers[at + 5]);
    uvs.push(numbers[at + 6], 1 - numbers[at + 7]);
  }
  return geometry(positions, normals, uvs, null);
}

// Some meshes carry unused vertices full of NaN.
const finite = (x) => (Number.isFinite(x) ? x : 0);

/** `count` vertices of `size` bytes from `at`: position, normal, uv first. */
function readVertices(view, at, count, size) {
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const o = at + i * size;
    for (let k = 0; k < 3; k++) {
      positions[i * 3 + k] = finite(view.getFloat32(o + k * 4, true));
      normals[i * 3 + k] = finite(view.getFloat32(o + 12 + k * 4, true));
    }
    uvs[i * 2] = finite(view.getFloat32(o + 24, true));
    uvs[i * 2 + 1] = 1 - finite(view.getFloat32(o + 28, true));
  }
  return { positions, normals, uvs };
}

function readFaces(view, at, from, to) {
  const index = new Uint32Array((to - from) * 3);
  for (let i = 0; i < index.length; i++) index[i] = view.getUint32(at + from * 12 + i * 4, true);
  return index;
}

/** The first level of detail's faces: [0, lods[1]) when there are levels. */
const lodEnd = (lods, faces) => (lods.length > 1 && lods[1] > 0 && lods[1] <= faces ? lods[1] : faces);

function readBinary(view, start, major) {
  const headerSize = view.getUint16(start, true);
  const body = start + headerSize;
  if (major === 2 || major === 3) {
    const vertexSize = view.getUint8(start + 2);
    const faceSize = view.getUint8(start + 3);
    const lodCount = major === 3 ? view.getUint16(start + 6, true) : 0;
    const verts = view.getUint32(start + (major === 3 ? 8 : 4), true);
    const faces = view.getUint32(start + (major === 3 ? 12 : 8), true);
    const v = readVertices(view, body, verts, vertexSize);
    const facesAt = body + verts * vertexSize;
    const lodsAt = facesAt + faces * faceSize;
    const lods = [];
    for (let i = 0; i < lodCount; i++) lods.push(view.getUint32(lodsAt + i * 4, true));
    return geometry(v.positions, v.normals, v.uvs, readFaces(view, facesAt, 0, lodEnd(lods, faces)));
  }
  // 4.00 and 5.00: the same header up to the subsets; 5 adds FACS sizes.
  const verts = view.getUint32(start + 4, true);
  const faces = view.getUint32(start + 8, true);
  const lodCount = view.getUint16(start + 12, true);
  const bones = view.getUint16(start + 14, true);
  const v = readVertices(view, body, verts, 40);
  let at = body + verts * 40;
  if (bones > 0) at += verts * 8; // skinning envelopes
  const facesAt = at;
  const lods = [];
  for (let i = 0; i < lodCount; i++) lods.push(view.getUint32(facesAt + faces * 12 + i * 4, true));
  return geometry(v.positions, v.normals, v.uvs, readFaces(view, facesAt, 0, lodEnd(lods, faces)));
}

async function readChunked(bytes, view, start) {
  const chunks = {};
  let at = start;
  while (at + 16 <= bytes.length) {
    const type = new TextDecoder().decode(bytes.subarray(at, at + 8)).replace(/\0+$/, '');
    const version = view.getUint32(at + 8, true);
    const size = view.getUint32(at + 12, true);
    chunks[type] = { version, at: at + 16, size };
    at += 16 + size;
  }
  const core = chunks.COREMESH;
  if (!core) throw new Error('No COREMESH in this mesh');
  let lods = [];
  if (chunks.LODS) {
    const l = chunks.LODS.at;
    const n = view.getUint32(l + 3, true);
    for (let i = 0; i < n; i++) lods.push(view.getUint32(l + 7 + i * 4, true));
  }
  if (core.version === 1) {
    const verts = view.getUint32(core.at, true);
    const v = readVertices(view, core.at + 4, verts, 40);
    const facesAt = core.at + 4 + verts * 40;
    const faces = view.getUint32(facesAt, true);
    return geometry(v.positions, v.normals, v.uvs, readFaces(view, facesAt + 4, 0, lodEnd(lods, faces)));
  }
  // COREMESH 2: a Draco bitstream (after a length, in the ones seen).
  const data = bytes.subarray(core.at, core.at + core.size);
  const magic = [0x44, 0x52, 0x41, 0x43, 0x4f]; // "DRACO"
  let from = -1;
  for (let i = 0; i < Math.min(64, data.length - 5) && from < 0; i++)
    if (magic.every((b, k) => data[i + k] === b)) from = i;
  if (from < 0) throw new Error('Unknown COREMESH encoding');
  const loader = await dracoLoader();
  const g = await new Promise((resolve, reject) => loader.parse(data.slice(from).buffer, resolve, reject));
  const uv = g.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const faces = g.index ? g.index.count / 3 : 0;
  const end = lodEnd(lods, faces);
  if (g.index && end < faces) g.setDrawRange(0, end * 3);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A .mesh file's bytes to geometry. Throws on anything else. */
export async function readRobloxMesh(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const newline = bytes.indexOf(0x0a);
  const head = new TextDecoder().decode(bytes.subarray(0, newline < 0 ? 16 : newline)).trim();
  const m = /^version (\d+)\.(\d+)/.exec(head);
  if (!m) throw new Error('Not a Roblox mesh');
  const major = Number(m[1]);
  const start = newline + 1;
  if (major === 1) return readText(new TextDecoder().decode(bytes), `${m[1]}.${m[2]}`);
  if (major >= 2 && major <= 5) return readBinary(view, start, major);
  if (major >= 6) return readChunked(bytes, view, start);
  throw new Error(`Mesh version ${head} isn't known`);
}
