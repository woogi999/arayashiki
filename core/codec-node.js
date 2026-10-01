// Zstandard in Node (the CLI, the MCP server, the tests): Node 22.15+ has it
// built in, so there is no wasm to load. Same interface as codec-web.js.
import zlib from 'node:zlib';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export const warmCodec = async () => {};

export async function compressBytes(bytes, format, level = 3) {
  if (format !== 'zstd') throw new Error(`Unsupported format: ${format}`);
  return new Uint8Array(
    zlib.zstdCompressSync(bytes, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: level },
    }),
  );
}

export async function decompressBytes(bytes, format) {
  if (format !== 'zstd') throw new Error(`Unsupported format: ${format}`);
  if (!ZSTD_MAGIC.every((b, i) => bytes[i] === b))
    throw new Error('Not a zstd frame');
  return new Uint8Array(zlib.zstdDecompressSync(bytes));
}
