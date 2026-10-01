// The Updates window (src/updates.js): what's out on GitHub against this
// build, the release notes, and downloading and running the installer. The
// top bar's "Update" button (topbar.jsx), shown when a newer release is out,
// opens it.
import { useMemo, useState } from 'preact/hooks';
import * as S from '../store.js';
import * as B from '../barmaker/state.js';
import * as U from '../updates.js';
import { isDesktop, openExternal, RELEASES_PAGE } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, Modal } from './controls.jsx';
import { render } from './manual.jsx';

const close = () => (S.dialog.value = null);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function Notes({ text }) {
  // The notes' own "Downloads" list repeats the buttons below.
  const body = useMemo(() => render(text.replace(/^## Downloads[\s\S]*?(?=^## |(?![\s\S]))/m, '').trim()), [text]);
  if (!text.trim()) return null;
  return <article class="upd-notes prose">{body}</article>;
}

function Progress({ got, total }) {
  const pct = total ? Math.min(100, (got / total) * 100) : 0;
  return (
    <div class="upd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div class="upd-progress-track">
        <div class="upd-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span class="num">
        {mb(got)} of {total ? mb(total) : '…'}
      </span>
    </div>
  );
}

/** Saves what's unsaved before the installer closes the app; false if cancelled. */
async function saveFirst() {
  if (S.dirty.peek() && !(await S.saveHere())) return false;
  if (B.dirty.peek()) await B.saveHere();
  return !B.dirty.peek();
}

function Status() {
  const st = U.updateState.value;
  const r = U.release.value;
  const [saving, setSaving] = useState(false);
  const unsaved = S.dirty.value || B.dirty.value;

  if (st.phase === 'checking' && !r)
    return (
      <div class="upd-hero">
        <span class="upd-badge is-busy">
          <Icon name="loader" size={20} class="upd-spin" />
        </span>
        <div>
          <h3>Checking GitHub…</h3>
          <p class="hint">Looking at the latest release of Arayashiki.</p>
        </div>
      </div>
    );

  if (st.phase === 'error')
    return (
      <>
        <div class="upd-hero">
          <span class="upd-badge is-warn">
            <Icon name="warning" size={20} />
          </span>
          <div>
            <h3>Couldn’t finish that</h3>
            <p class="hint">{st.error}</p>
          </div>
        </div>
        <div class="modal-actions">
          <Button icon="external-link" variant="ghost" onClick={() => openExternal(r?.page || RELEASES_PAGE)}>
            Releases on GitHub
          </Button>
          <span class="spacer" />
          <Button icon="refresh" variant="primary" onClick={U.checkNow}>
            Try again
          </Button>
        </div>
      </>
    );

  if (!r) return null;

  if (!r.newer)
    return (
      <>
        <div class="upd-hero">
          <span class="upd-badge is-ok">
            <Icon name="check" size={20} />
          </span>
          <div>
            <h3>You’re up to date</h3>
            <p class="hint">
              Arayashiki <span class="num">{r.current}</span> is the latest release.
            </p>
          </div>
        </div>
        <div class="modal-actions">
          <Button icon="external-link" variant="ghost" onClick={() => openExternal(r.page || RELEASES_PAGE)}>
            Release notes
          </Button>
          <span class="spacer" />
          <Button icon="refresh" disabled={st.phase === 'checking'} onClick={U.checkNow}>
            {st.phase === 'checking' ? 'Checking…' : 'Check again'}
          </Button>
        </div>
      </>
    );

  return (
    <>
      <div class="upd-hero">
        <span class="upd-badge is-new">
          <Icon name="download" size={20} />
        </span>
        <div>
          <h3>Arayashiki {r.latest} is out</h3>
          <p class="hint">
            You have <span class="num">{r.current}</span>
            {r.published ? ` · released ${when(r.published)}` : ''}
          </p>
        </div>
      </div>
      <Notes text={r.notes ?? ''} />
      {st.phase === 'downloading' && <Progress got={st.got} total={st.total} />}
      {st.phase === 'downloaded' && (
        <p class="hint upd-ready">
          <Icon name="check" size={14} />
          Downloaded. Installing closes Arayashiki and opens the installer; your movesets and settings stay as they are.
          {unsaved && ' Unsaved work is saved first.'}
        </p>
      )}
      <div class="modal-actions">
        {st.phase === 'idle' && (
          <Button
            variant="ghost"
            onClick={() => {
              U.skipVersion(r.latest);
              close();
            }}
          >
            Skip this version
          </Button>
        )}
        <Button icon="external-link" variant="ghost" onClick={() => openExternal(r.page || RELEASES_PAGE)}>
          On GitHub
        </Button>
        <span class="spacer" />
        {!isDesktop || !r.installer ? (
          <Button icon="download" variant="primary" onClick={() => openExternal(r.page || RELEASES_PAGE)}>
            Download from GitHub
          </Button>
        ) : st.phase === 'downloaded' || st.phase === 'installing' ? (
          <Button
            icon="refresh"
            variant="primary"
            disabled={saving || st.phase === 'installing'}
            onClick={async () => {
              setSaving(true);
              try {
                if (await saveFirst()) await U.install();
              } finally {
                setSaving(false);
              }
            }}
          >
            {st.phase === 'installing' ? 'Starting the installer…' : saving ? 'Saving…' : 'Install and restart'}
          </Button>
        ) : (
          <Button icon="download" variant="primary" disabled={st.phase === 'downloading'} onClick={U.download}>
            {st.phase === 'downloading' ? 'Downloading…' : `Download and install (${mb(r.installer.size)})`}
          </Button>
        )}
      </div>
    </>
  );
}

export function UpdatesDialog() {
  return (
    <Modal title="Updates" class="modal-updates" onClose={close}>
      <Status />
    </Modal>
  );
}
