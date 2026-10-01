// Signing in with Roblox: the top bar's account button, and the dialog that
// opens Roblox's own login page (in its own window), signs out, and shows the
// avatar.
import { useEffect, useState } from 'preact/hooks';
import * as S from '../store.js';
import { account, avatar, loadAccount, previewAvatar, previewing, setUseAvatar, useAvatar } from '../account.js';
import { cancelSignIn, isDesktop, signIn, signOut } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, Modal, Switch } from './controls.jsx';

export function AccountButton() {
  if (!isDesktop) return null;
  const a = account.value;
  const headshot = avatar.value?.headshot;
  return (
    <button
      type="button"
      class={`account-btn ${a?.signedIn ? 'is-in' : ''}`}
      title={a?.signedIn ? `Signed in as @${a.user?.username}` : 'Sign in with Roblox'}
      onClick={() => (S.dialog.value = 'account')}
    >
      {a?.signedIn ? (
        <>
          {headshot ? <img src={headshot} alt="" /> : <Icon name="user-round" size={14} />}
          <span>{a.user?.name || a.user?.username}</span>
        </>
      ) : (
        <>
          <Icon name="user-round" size={14} />
          <span>Sign in</span>
        </>
      )}
    </button>
  );
}

// Anyone's avatar on "You", by user ID: avatars are public.
function PreviewAvatar() {
  const [id, setId] = useState(previewing.value ?? '');
  const [note, setNote] = useState(null);
  const av = previewing.value ? avatar.value : null;
  const go = async () => {
    setNote('Fetching…');
    try {
      const got = await previewAvatar(id);
      setNote(`${got.clothing?.length ?? 0} clothing items`);
    } catch (e) {
      setNote(String(e));
    }
  };
  return (
    <div class="preview-avatar">
      <label class="prop-row">
        <span>Preview a user’s avatar</span>
        <span class="preview-row">
          <input
            class="input num"
            placeholder="User ID"
            inputMode="numeric"
            value={id}
            onInput={(e) => setId(e.currentTarget.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && id && go()}
          />
          <Button disabled={!id} onClick={go}>
            Show
          </Button>
        </span>
      </label>
      {av?.fullBody && (
        <div class="account-who">
          <img class="account-head" src={av.headshot ?? av.fullBody} alt="" />
          <span class="hint">
            {av.clothing?.map((c) => c.name).join(', ') || 'No classic clothing'} · {note}
          </span>
        </div>
      )}
      {!av && note && <p class="hint">{note}</p>}
    </div>
  );
}

export function AccountDialog() {
  const close = () => (S.dialog.value = null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => void loadAccount(), []);
  const status = account.value;
  const av = avatar.value;

  const doSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      await loadAccount();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!isDesktop) body = <p class="hint">Signing in with Roblox needs the desktop app.</p>;
  else if (!status) body = <p class="hint">Loading…</p>;
  else if (busy)
    body = (
      <div class="signin-wait">
        <span class="asset-spinner" />
        <p>Sign in in the Roblox window. It closes by itself once you’re in.</p>
        <Button onClick={() => cancelSignIn()}>Cancel</Button>
      </div>
    );
  else if (!status.signedIn)
    body = (
      <>
        <p class="hint">
          Opens Roblox’s own login page in a separate window; sign in there as you would in a browser. Arayashiki then
          fetches Roblox assets as your account and can put your avatar on “You” in the viewport.
        </p>
        <p class="hint">
          Your session is full access to your account, so Arayashiki keeps it in Windows Credential Manager, only ever
          sends it to roblox.com over HTTPS, and never shows it to anything else. Sign out here to end it on Roblox too.
        </p>
        {error && (
          <p class="error" role="alert">
            <Icon name="warning" size={14} />
            {error}
          </p>
        )}
        <PreviewAvatar />
        <div class="modal-actions">
          <Button variant="primary" icon="user-round" onClick={doSignIn}>
            Sign in with Roblox
          </Button>
        </div>
      </>
    );
  else
    body = (
      <>
        <div class="account-card">
          {av?.fullBody ? <img class="account-body" src={av.fullBody} alt="Your avatar" /> : null}
          <div class="account-text">
            <div class="account-who">
              {av?.headshot && <img class="account-head" src={av.headshot} alt="" />}
              <div>
                <strong>{status.user?.name}</strong>
                <span>@{status.user?.username}</span>
              </div>
            </div>
            {av && (
              <p class="hint">
                {av.avatarType} avatar
                {av.clothing?.length ? ` · wearing ${av.clothing.map((c) => c.name).join(', ')}` : ''}
              </p>
            )}
            <label class="prop-row prop-check account-use">
              <span>Use my avatar for “You”</span>
              <Switch checked={useAvatar.value} label="Use my avatar" onChange={setUseAvatar} />
            </label>
            <p class="hint">
              Your body colours, classic shirt, pants, T-shirt and face on the R6 body. Accessories and R15 shapes
              aren’t drawn.
            </p>
          </div>
        </div>
        <div class="modal-actions">
          <span class="spacer" />
          <Button
            icon="x"
            onClick={async () => {
              await signOut();
              await loadAccount();
            }}
          >
            Sign out
          </Button>
        </div>
      </>
    );
  return (
    <Modal title="Roblox account" onClose={close}>
      {body}
    </Modal>
  );
}
