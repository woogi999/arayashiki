// Gathers a release into release/: the app's own exe (what installed copies
// update to, swapping it in by themselves) and the setup (the installer
// people download: it fetches the latest exe from GitHub, so the same file
// serves every version and only needs building when its code changes), with
// the notes for this version from CHANGELOG.md.
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

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version = "(.+)"/m)?.[1];
if (tauri !== version || cargo !== version) {
  console.error(`Versions differ: package.json ${version}, tauri.conf.json ${tauri}, Cargo.toml ${cargo}.`);
  process.exit(1);
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const section = changelog.match(
  new RegExp(`^## ${version.replace(/\./g, '\\.')}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'),
);
if (!section) {
  console.error(`CHANGELOG.md has no "## ${version}" section.`);
  process.exit(1);
}

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
