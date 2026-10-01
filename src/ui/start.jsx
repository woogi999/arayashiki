// The start screen: what the app opens on, like Blender's splash. On the
// left, the katana on the viewport's grey over a 1-stud floor; on the right,
// the two workspaces to pick from (the Skill Builder and the Meter Maker),
// the ways into the picked one (New Character first), the .txt files opened
// lately, and, when they apply, two notes: work recovered after the app
// didn't close properly, and signing in with Roblox so visuals load.
import { useEffect, useState } from 'preact/hooks';
import * as S from '../store.js';
import * as B from '../barmaker/state.js';
import { account } from '../account.js';
import { Icon } from '../icons.jsx';
import { bindingOf } from '../keybinds.js';
import { isDesktop } from '../platform.js';
import { openSearch } from './search.jsx';
import { startTour } from '../onboarding.js';
import markUrl from '../assets/arayashiki-mark.png';

const close = () => (S.showStart.value = false);

function whenOpened(at) {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} d ago` : new Date(at).toLocaleDateString();
}

function Action({ icon, label, detail, keys, onClick, primary = false }) {
  return (
    <li>
      <button type="button" class={`start-action ${primary ? 'is-primary' : ''}`} onClick={onClick}>
        <span class="start-action-icon">
          <Icon name={icon} size={16} />
        </span>
        <span class="start-action-text">
          <span class="start-action-label">{label}</span>
          {detail && <span class="start-action-detail">{detail}</span>}
        </span>
        {keys && <kbd>{keys}</kbd>}
      </button>
    </li>
  );
}

// The viewport's floor, in perspective: rows a stud apart running off to a
// vanishing point, a stronger line every five, fading into the grey, as the
// 3D view draws its baseplate.
function Floor() {
  const W = 600;
  const H = 300;
  const cx = W / 2;
  const focal = 90;
  const eye = 26;
  const lines = [];
  for (let z = 1; z <= 80; z++) {
    const y = (eye * focal) / (z + 4);
    if (y < 0.6) break;
    lines.push(<line key={`z${z}`} x1="0" y1={y} x2={W} y2={y} class={z % 5 ? '' : 'is-major'} />);
  }
  for (let x = -30; x <= 30; x++) {
    const bottom = cx + (x * focal * 8) / eye;
    lines.push(<line key={`x${x}`} x1={cx} y1="0" x2={bottom} y2={H * 6} class={x % 5 ? '' : 'is-major'} />);
  }
  return (
    <svg class="start-floor" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      {lines}
    </svg>
  );
}

const WORKSPACES = [
  { id: 'skills', icon: 'swords', label: 'Skill Builder', detail: 'Movesets, nodes, the simulator, video' },
  { id: 'bars', icon: 'battery', label: 'Meter Maker', detail: 'Meters and progress bars for a skill' },
];

function Recovered() {
  const r = S.recovered.value;
  if (!r) return null;
  return (
    <section class="start-note is-recovered" aria-label="Recovered work">
      <Icon name="warning" size={16} />
      <div>
        <strong>Arayashiki didn’t close properly last time.</strong>
        <p>
          Your work on “{r.name}” ({r.skills} skill{r.skills === 1 ? '' : 's'}
          {r.file ? `, ${r.file}` : ''}) was saved as you went, and it’s back.
        </p>
        <div class="start-note-actions">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              S.recovered.value = null;
              S.workspace.value = 'skills';
              close();
            }}
          >
            <Icon name="arrow-right" size={15} />
            <span>Continue where you left off</span>
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => (S.recovered.value = null)}>
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

function SignInNote() {
  const [later, setLater] = useState(false);
  const a = account.value;
  if (!isDesktop || later || a?.signedIn) return null;
  return (
    <section class="start-note is-signin" aria-label="Sign in with Roblox">
      <Icon name="user-round" size={16} />
      <div>
        <strong>Sign in with Roblox to see skills as they look in-game.</strong>
        <p>
          Without signing in, many visuals won’t show correctly: meshes and textures Roblox only hands to an account
          stay as grey stand-ins, and most sounds stay silent. Arayashiki never sees your password; Roblox’s own page
          signs you in.
        </p>
        <div class="start-note-actions">
          <button type="button" class="btn btn-default" onClick={() => (S.dialog.value = 'account')}>
            <Icon name="user-round" size={15} />
            <span>Sign in</span>
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => setLater(true)}>
            Later
          </button>
        </div>
      </div>
    </section>
  );
}

function SkillActions() {
  const open = (d) => () => (S.dialog.value = d);
  const back = !S.recovered.value && S.skills.value.length > 0 && (S.dirty.value || S.filePath.value);
  return (
    <ul class="start-actions">
      <Action
        primary
        icon="file-plus"
        label="New Character"
        detail="A blank moveset: one empty skill to build from"
        keys={bindingOf('new')}
        onClick={() => {
          S.workspace.value = 'skills';
          S.newMoveset();
          S.recovered.value = null;
          close();
        }}
      />
      {back && (
        <Action
          icon="arrow-right"
          label={`Back to “${S.name.value}”`}
          detail={S.filePath.value ?? 'As you left it'}
          keys="Esc"
          onClick={close}
        />
      )}
      <Action icon="folder" label="Open a .txt" detail="A moveset code saved as a file" keys={bindingOf('open')} onClick={S.openFile} />
      <Action icon="file-text" label="Import a code" detail="Paste what JJS’s Skill Builder copies out" keys={bindingOf('import')} onClick={open('import')} />
      <Action icon="sparkles" label="Templates" detail="Fill in a form, get ready-made skills" keys={bindingOf('templates')} onClick={open('templates')} />
    </ul>
  );
}

function MeterActions() {
  const go = (dialog) => () => {
    S.workspace.value = 'bars';
    close();
    if (dialog) B.openDialog(dialog);
  };
  return (
    <ul class="start-actions">
      <Action primary icon="file-plus" label="New meter" detail="Pick how many steps, then draw it" onClick={go('new')} />
      <Action icon="arrow-right" label={`Back to “${B.doc.value.name}”`} detail="The design as you left it" onClick={go(null)} />
      <Action icon="folder" label="Open a design" detail="Saved in the app, or a .meter.json file" onClick={go('open')} />
    </ul>
  );
}

export function StartScreen() {
  const [pick, setPick] = useState(S.workspace.value === 'bars' ? 'bars' : 'skills');
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !S.dialog.value && close();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);
  const recent = S.recent.value;
  return (
    <main class="start" aria-label="Start">
      <section class="start-stage">
        <div class="start-identity">
          <div class="start-glow" aria-hidden="true" />
          <Floor />
          <img class="start-mark" src={markUrl} alt="" width="220" height="220" />
          <div class="start-words">
            <h1 class="start-name">Arayashiki</h1>
            <p class="start-line">
              Jujutsu Shenanigans’ Skill Builder on your desktop: build a moveset node by node, play every skill on a
              3D character against a dummy, record it as a video, and paste the code back into the game.
            </p>
            <p class="start-version num">v{__APP_VERSION__} · a model of JJS, not the game</p>
          </div>
        </div>
        <div class="start-panel">
          <Recovered />
          <div class="start-workspaces" role="radiogroup" aria-label="Workspace">
            {WORKSPACES.map((w) => (
              <button
                type="button"
                key={w.id}
                role="radio"
                aria-checked={pick === w.id}
                class="start-workspace"
                onClick={() => setPick(w.id)}
              >
                <Icon name={w.icon} size={18} />
                <span class="start-workspace-label">{w.label}</span>
                <span class="start-workspace-detail">{w.detail}</span>
              </button>
            ))}
          </div>

          {pick === 'skills' ? <SkillActions /> : <MeterActions />}

          {pick === 'skills' && (
            <>
              <h2 class="start-heading">Recent</h2>
              {recent.length ? (
                <ul class="start-recent">
                  {recent.map((r) => (
                    <li key={r.path}>
                      <button type="button" class="start-file" title={r.path} onClick={() => S.openRecent(r.path)}>
                        <Icon name="file-text" size={14} />
                        <span class="start-file-name">{r.name}</span>
                        <span class="start-file-path">{r.path}</span>
                        <span class="start-file-when">{whenOpened(r.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="start-empty">
                  {isDesktop ? 'Movesets you open or save as a .txt show up here.' : 'Recent files open in the desktop app.'}
                </p>
              )}
            </>
          )}

          <SignInNote />

          <nav class="start-refs" aria-label="Help">
            <button type="button" class="link" onClick={() => (S.dialog.value = 'manual')}>
              User manual
            </button>
            <button type="button" class="link" onClick={startTour}>
              Quick tour
            </button>
            <button type="button" class="link" onClick={() => (S.dialog.value = 'changelog')}>
              What’s new
            </button>
            <button type="button" class="link" onClick={() => openSearch()}>
              Search everything <kbd>{bindingOf('search')}</kbd>
            </button>
            <button type="button" class="link" onClick={() => (S.dialog.value = 'connect-ai')}>
              Connect an AI
            </button>
            <button type="button" class="link" onClick={() => (S.dialog.value = 'settings')}>
              Settings
            </button>
          </nav>
        </div>
      </section>
    </main>
  );
}
