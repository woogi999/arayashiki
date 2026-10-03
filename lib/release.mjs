// Gathers a release into release/: the app's own exe (what installed copies
// update to, swapping it in by themselves) and the setup (the installer
// people download: it fetches the latest exe from GitHub, so the same file
// serves every version and only needs building when its code changes), with
// the notes for this version from CHANGELOG.md.
//
// The version comes from CHANGELOG.md itself: its topmost "## X.Y.Z"
// heading is the version being released, and package.json,
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml are bumped to match
// (only those three version strings; nothing else is touched). So a release
// is just: add a dated section to the top of CHANGELOG.md, then run this.
//
//   npm run release            build the app (and the setup, if it isn't built), gather the files
//   npm run release -- --publish   also make the GitHub release and upload them
//                                  (needs GITHUB_TOKEN, with contents: write)
//   npm run release -- --setup     rebuild the setup too
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'woogi999/arayashiki';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const heading = changelog.match(/^## (\d+\.\d+\.\d+)\s*$/m);
if (!heading) {
  console.error('CHANGELOG.md has no "## X.Y.Z" section at the top to release.');
  process.exit(1);
}
const version = heading[1];
const section = changelog.match(
  new RegExp(`^## ${version.replace(/\./g, '\\.')}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'),
);

// Bumps package.json, tauri.conf.json and Cargo.toml to the changelog's
// version, if they aren't there already.
function setVersion(path, pattern) {
  const file = join(root, path);
  const text = readFileSync(file, 'utf8');
  const m = text.match(pattern);
  if (!m) throw new Error(`No version string found in ${path} (looked for ${pattern}).`);
  if (m[1] === version) return false;
  const next = text.slice(0, m.index) + m[0].replace(m[1], version) + text.slice(m.index + m[0].length);
  writeFileSync(file, next);
  return true;
}
const bumped = [
  setVersion('package.json', /"version":\s*"([^"]+)"/) && 'package.json',
  setVersion('src-tauri/tauri.conf.json', /"version":\s*"([^"]+)"/) && 'tauri.conf.json',
  setVersion('src-tauri/Cargo.toml', /^version = "([^"]+)"/m) && 'Cargo.toml',
].filter(Boolean);
if (bumped.length) console.log(`Bumped to ${version} in ${bumped.join(', ')} (from CHANGELOG.md).`);

const release = join(root, 'src-tauri/target/release');
const setup = join(release, 'Arayashiki-Setup.exe');
run('npx tauri build --no-bundle');
if (args.includes('--setup') || !existsSync(setup)) {
  run('cargo build --release -p arayashiki-setup --manifest-path src-tauri/Cargo.toml');
}

const out = join(root, 'release');
mkdirSync(out, { recursive: true });
copyFileSync(join(release, 'arayashiki.exe'), join(out, 'arayashiki.exe'));
copyFileSync(setup, join(out, 'Arayashiki-Setup.exe'));
const notes = `${section[1].trim()}

## Downloads

- **New here?** Download \`Arayashiki-Setup.exe\` and run it. It installs the latest version, and the app keeps itself up to date from then on.
- Already have Arayashiki? It updates by itself.
`;
writeFileSync(join(out, 'notes.md'), notes);
for (const f of ['arayashiki.exe', 'Arayashiki-Setup.exe'])
  console.log(`release/${f}  ${(statSync(join(out, f)).size / 1048576).toFixed(1)} MB`);

if (!args.includes('--publish')) {
  console.log(`\nPublish: a release tagged v${version} on github.com/${REPO}, notes from release/notes.md,`);
  console.log('with both .exe files attached (or run again with --publish and GITHUB_TOKEN set).');
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Set GITHUB_TOKEN to publish.');
  process.exit(1);
}
const api = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url}: ${res.status} ${await res.text()}`);
  return res.json();
};
const made = await api(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  body: JSON.stringify({ tag_name: `v${version}`, name: `Arayashiki ${version}`, body: notes }),
});
for (const f of ['arayashiki.exe', 'Arayashiki-Setup.exe']) {
  const bytes = readFileSync(join(out, f));
  await api(`https://uploads.github.com/repos/${REPO}/releases/${made.id}/assets?name=${f}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.microsoft.portable-executable' },
    body: bytes,
  });
  console.log(`uploaded ${f}`);
}
console.log(made.html_url);
