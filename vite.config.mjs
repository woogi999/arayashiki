import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// In the plain browser (`npm run web:dev`, for layout work) there's no
// desktop shell to fetch Roblox assets. This dev-server route stands in for
// pictures: /rbx-image/<id> answers with the image from Roblox's public
// thumbnails (no sign-in needed). Meshes and sounds still need the desktop app.
const robloxImages = () => ({
  name: 'roblox-images',
  configureServer(server) {
    server.middlewares.use('/rbx-image/', async (req, res) => {
      const id = (req.url ?? '').replace(/^\//, '').replace(/\D.*$/, '');
      try {
        const info = await fetch(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=420x420&format=Png&isCircular=false`,
        ).then((r) => r.json());
        const url = info?.data?.[0]?.imageUrl;
        if (!url) throw new Error('no thumbnail');
        const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'max-age=86400');
        res.end(bytes);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
  },
});

// The desktop UI (src/), served to Tauri's webview: `tauri dev` runs the
// dev server, `tauri build` bundles dist/. WebView2 is current Chromium, so
// the build targets it directly (no legacy transforms).
export default defineConfig({
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [robloxImages()],
  // Cargo's build output changes constantly (and locks files): not the UI's.
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/target/**', '**/src-tauri/gen/**'] } },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    target: 'chrome120',
    reportCompressedSize: false,
    // three.js is its own chunk, loaded once the window is up.
    chunkSizeWarningLimit: 800,
  },
  // Pre-bundling rewrites import.meta.url, which zstd-wasm uses to find its .wasm.
  optimizeDeps: {
    exclude: ['@bokuweb/zstd-wasm'],
    // Found late (lazy imports): listed so the dev server doesn't reload the window when they're first used.
    include: ['mediabunny', '@anthropic-ai/sdk', 'zod', 'three/examples/jsm/controls/TransformControls.js', 'three/examples/jsm/loaders/DRACOLoader.js', 'cannon-es'],
  },
});
