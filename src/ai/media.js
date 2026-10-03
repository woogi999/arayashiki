// Media an AI makes (a picture, a sound, a 3D model), checked and made fit
// for Roblox and JJS, shown back to it, and uploaded to the user's account
// (only when the user has allowed AI uploads, Settings → AI):
//
//   picture   any common format → PNG, at most 1024 px a side (Roblox
//             scales bigger ones down anyway), see-through kept: a decal,
//             whose image ID goes in a TEXTURE or an Overlay
//   sound     mp3, ogg, wav or flac, up to 7 minutes: its ID goes in an SFX
//   model     glb, gltf or fbx (an obj is turned into a glb), up to 20,000
//             triangles: Roblox makes a model of it, and its mesh and
//             texture IDs go in a Mesh VISUAL (AMOUNT and TEXTURE)
//
// Media comes as a file on this PC (`path`: what an AI that writes files
// makes) or as base64 (`data`, or a data: URL).
import { readMediaFile, uploadDecal, uploadMedia } from '../platform.js';

const KEY = 'arayashiki-ai-uploads';
export const uploadsAllowed = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const allowUploads = (on) => {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // not kept
  }
};

const AUDIO = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' };
const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tga'];
const MODEL = ['glb', 'gltf', 'fbx', 'obj'];
const MAX_TRIANGLES = 20000;

/** Bytes and a name from { path } or { data } (base64 or a data: URL). */
async function bytesOf({ path, data, fileName }) {
  if (path) return { bytes: await readMediaFile(path), name: String(path).split(/[\\/]/).pop() };
  if (!data) throw new Error('Give the media as a path to a file on this PC, or as base64 data.');
  const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
  const b64 = m ? m[2] : data;
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ext = m ? { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'model/gltf-binary': 'glb' }[m[1]] : null;
  return { bytes, name: fileName ?? `media.${ext ?? sniff(bytes) ?? 'bin'}` };
}

/** What the bytes are, by their first bytes. */
function sniff(b) {
  const s = (i, str) => [...str].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0x89 && s(1, 'PNG')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp';
  if (s(0, 'RIFF') && s(8, 'WAVE')) return 'wav';
  if (s(0, 'GIF8')) return 'gif';
  if (s(0, 'OggS')) return 'ogg';
  if (s(0, 'fLaC')) return 'flac';
  if (s(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (s(0, 'glTF')) return 'glb';
  if (s(0, 'Kaydara FBX')) return 'fbx';
  return null;
}

const extOf = (name, bytes) => sniff(bytes) ?? String(name).split('.').pop().toLowerCase();
export const kindOf = (ext) => (IMAGE.includes(ext) ? 'image' : AUDIO[ext] ? 'audio' : MODEL.includes(ext) ? 'model' : null);

// ─── Pictures ───────────────────────────────────────────────────────────

async function imagePng(bytes) {
  const img = await createImageBitmap(new Blob([bytes]));
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((done) => c.toBlob(done, 'image/png'));
  return { blob, width: c.width, height: c.height, resized: k < 1, preview: c.toDataURL('image/png') };
}

// ─── Sounds ─────────────────────────────────────────────────────────────

async function audioInfo(bytes) {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(bytes.slice().buffer);
  // A waveform, so the AI can see roughly what it made.
  const c = Object.assign(document.createElement('canvas'), { width: 600, height: 120 });
  const g = c.getContext('2d');
  g.fillStyle = '#161616';
  g.fillRect(0, 0, 600, 120);
  g.fillStyle = '#5aa9ff';
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / 600));
  for (let x = 0; x < 600; x++) {
    let peak = 0;
    for (let i = x * step; i < Math.min(data.length, (x + 1) * step); i++) peak = Math.max(peak, Math.abs(data[i]));
    g.fillRect(x, 60 - peak * 58, 1, Math.max(1, peak * 116));
  }
  return { seconds: Math.round(buf.duration * 100) / 100, channels: buf.numberOfChannels, rate: buf.sampleRate, preview: c.toDataURL('image/png') };
}

// ─── Models ─────────────────────────────────────────────────────────────

async function loadModel(bytes, ext) {
  const three = await import('three');
  if (ext === 'glb' || ext === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(ext === 'glb' ? bytes.slice().buffer : new TextDecoder().decode(bytes), '');
    return { three, root: gltf.scene };
  }
  if (ext === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    return { three, root: new FBXLoader().parse(bytes.slice().buffer, '') };
  }
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  return { three, root: new OBJLoader().parse(new TextDecoder().decode(bytes)) };
}

async function modelInfo(bytes, ext) {
  const { three, root } = await loadModel(bytes, ext);
  let triangles = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  const box = new three.Box3().setFromObject(root);
  const size = box.getSize(new three.Vector3());
  // A picture of it, three quarters on.
  const renderer = new three.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(480, 360, false);
  const scene = new three.Scene();
  scene.background = new three.Color('#202020');
  scene.add(new three.HemisphereLight('#ffffff', '#404040', 2.2));
  const sun = new three.DirectionalLight('#ffffff', 1.5);
  sun.position.set(3, 5, 4);
  scene.add(sun, root);
  const centre = box.getCenter(new three.Vector3());
  const span = Math.max(size.x, size.y, size.z) || 1;
  const camera = new three.PerspectiveCamera(40, 480 / 360, span / 100, span * 100);
  camera.position.copy(centre).add(new three.Vector3(span * 1.2, span * 0.8, span * 1.4));
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const preview = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  // An OBJ goes up as a GLB (Roblox's importer takes glb, gltf and fbx).
  let upload = { bytes, ext };
  if (ext === 'obj') {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    upload = { bytes: new Uint8Array(glb), ext: 'glb' };
  }
  return { triangles: Math.round(triangles), meshes, size: [size.x, size.y, size.z].map((v) => Math.round(v * 1000) / 1000), preview, upload };
}

// ─── The tools' work ────────────────────────────────────────────────────

/** Checks media and shows it: { kind, …facts, preview (a data URL), problems }. */
export async function inspectMedia(input) {
  const { bytes, name } = await bytesOf(input);
  const ext = extOf(name, bytes);
  const kind = input.kind ?? kindOf(ext);
  if (!kind) throw new Error(`“${name}” isn’t a picture, sound or model Roblox takes (pictures: ${IMAGE.join(', ')}; sounds: ${Object.keys(AUDIO).join(', ')}; models: ${MODEL.join(', ')}).`);
  const problems = [];
  if (kind === 'image') {
    const p = await imagePng(bytes);
    if (p.resized) problems.push(`Scaled down to ${p.width}×${p.height}: Roblox shows decals at 1024 px at most.`);
    return { kind, name, width: p.width, height: p.height, preview: p.preview, problems, _png: p.blob };
  }
  if (kind === 'audio') {
    if (!AUDIO[ext]) throw new Error(`Roblox takes sounds as ${Object.keys(AUDIO).join(', ')}, not ${ext}.`);
    const a = await audioInfo(bytes);
    if (a.seconds > 420) problems.push(`It’s ${a.seconds} s long: Roblox takes sounds up to 7 minutes.`);
    return { kind, name, ...a, problems, _bytes: bytes, _ext: ext };
  }
  const m = await modelInfo(bytes, ext);
  if (m.triangles > MAX_TRIANGLES) problems.push(`${m.triangles} triangles: Roblox takes up to ${MAX_TRIANGLES} a mesh. Simplify it (decimate) first.`);
  return { kind, name, triangles: m.triangles, meshes: m.meshes, size: m.size, preview: m.preview, problems, _bytes: m.upload.bytes, _ext: m.upload.ext };
}

/** Checks media, then uploads it to the user's account: its IDs, and where they go in a skill. */
export async function uploadAiMedia(input) {
  if (!uploadsAllowed())
    throw new Error('The user hasn’t allowed AI uploads to their Roblox account (Settings → AI → “Let AIs upload to my Roblox account”). Ask them to turn it on, or hand them the file.');
  const info = await inspectMedia(input);
  const blocking = info.problems.filter((p) => !p.startsWith('Scaled down'));
  if (blocking.length) throw new Error(`Not uploaded: ${blocking.join(' ')}`);
  const name = String(input.name ?? info.name).slice(0, 50);
  const description = String(input.description ?? 'Made with an AI in Arayashiki.').slice(0, 1000);
  let ids;
  let use;
  if (info.kind === 'image') {
    const { decalId, imageId, moderation } = await uploadDecal(info._png, { name, description });
    ids = { decalId, imageId, moderation };
    use = `Use the image ID ${imageId}: a VISUAL's TEXTURE (Billboard, Overlay, a Mesh's texture) or a PARTICLE's TEXTURE.`;
  } else if (info.kind === 'audio') {
    ids = await uploadMedia(new Blob([info._bytes]), { kind: 'audio', fileName: `${name}.${info._ext}`, name, description });
    use = `Use the sound ID ${ids.soundId} in an SFX node's ID.`;
  } else {
    ids = await uploadMedia(new Blob([info._bytes]), { kind: 'model', fileName: `${name}.${info._ext}`, name, description });
    use = ids.meshId
      ? `Use it as a VISUAL with EFFECT Mesh: AMOUNT ${ids.meshId}${ids.textureId ? `, TEXTURE ${ids.textureId}` : ''}; SIZE scales it.`
      : `Roblox made model ${ids.modelId}, but its mesh ID isn't readable yet: try asset_info on it in a minute.`;
  }
  const { _png, _bytes, _ext, ...shown } = info;
  return { ...shown, uploaded: ids, use };
}
