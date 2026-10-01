// Zstandard in the app (base64 of zstd-compressed JSON is a Skill Builder
// code). The wasm is fetched on first use, so it never delays startup.
// Node uses codec-node.js instead: package.json's "imports" picks one.
let zstdReady;
const zstd = () =>
  (zstdReady ??= import('@bokuweb/zstd-wasm').then(async (m) => {
    await m.init();
    return m;
  }));

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

// Starts the wasm download early (on idle) so the first import is instant.
export const warmCodec = () => zstd().catch(() => {});

export async function compressBytes(bytes, format, level = 3) {
  if (format !== 'zstd') throw new Error(`Unsupported format: ${format}`);
  return (await zstd()).compress(bytes, level);
}

export async function decompressBytes(bytes, format) {
  if (format !== 'zstd') throw new Error(`Unsupported format: ${format}`);
  if (!ZSTD_MAGIC.every((b, i) => bytes[i] === b))
    throw new Error('Not a zstd frame');
  return (await zstd()).decompress(bytes);
}
