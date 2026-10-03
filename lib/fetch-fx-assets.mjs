// Gathers the Roblox assets JJS's own effects use (the textures, decals and
// meshes in src/assets/jjs-fx.json, and the meshes src/fx/builderfx.js asks
// for by ID) into src/assets/jjs-fx-assets/, so they ship with the app and
// the effects show without signing in with Roblox (src/platform.js looks
// there first). IDs a skill brings itself (a Mesh VISUAL's AMOUNT, a
// TEXTURE) aren't the game's own: those still come from Roblox.
//
// Most of these Roblox only hands to an account, so this runs the desktop
// app headless (`arayashiki.exe --fetch-assets`), signed in as you are in it:
//
//   npm run fx-assets [-- path\to\arayashiki.exe]
//
// Run it again after `npm run fx-data` when the game's effects change.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'assets', 'jjs-fx-assets');

/** Every asset ID the built-in effects use. */
export function fxAssetIds() {
  const fx = JSON.parse(fs.readFileSync(path.join(root, 'src', 'assets', 'jjs-fx.json'), 'utf8'));
  const text = JSON.stringify(fx);
  const ids = new Set();
  for (const m of text.matchAll(/rbxasset(?:id)?:\/\/(\d+)|"(?:Texture|MeshId|TextureID|Image)":"(?:rbxassetid:\/\/)?(\d+)/g)) ids.add(m[1] || m[2]);
  // Asked for by ID in the code (builderfx.js: ctx.mesh('…')).
  const code = fs.readFileSync(path.join(root, 'src', 'fx', 'builderfx.js'), 'utf8');
  for (const m of code.matchAll(/ctx\.(?:mesh|texture)\('(\d+)'\)/g)) ids.add(m[1]);
  return [...ids].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const exe =
    process.argv[2] ??
    [path.join(root, 'src-tauri', 'target', 'release', 'arayashiki.exe'), path.join(root, 'src-tauri', 'target', 'debug', 'arayashiki.exe'), path.join(process.env.LOCALAPPDATA ?? '', 'Arayashiki', 'arayashiki.exe')].find((p) => fs.existsSync(p));
  if (!exe) {
    console.error('Build the app first (npm run build), or pass the path to arayashiki.exe.');
    process.exit(1);
  }
  const ids = fxAssetIds();
  fs.mkdirSync(out, { recursive: true });
  const run = spawnSync(exe, ['--fetch-assets', out, ...ids], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = (run.stdout ?? '').split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
  const got = lines.filter((l) => l.file);
  const failed = lines.filter((l) => !l.file);
  console.log(`${got.length} of ${ids.length} assets in ${path.relative(root, out)}`);
  for (const f of failed) console.log(`  missing ${f.id}: ${f.error ?? 'no file'}`);
  if (run.stderr?.trim()) console.error(run.stderr.trim());
}
