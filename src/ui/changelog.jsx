// What's new (CHANGELOG.md at the repo's root), bundled into the app like the
// user manual: Help → What's new, the start screen, Settings → Updates.
import { useMemo } from 'preact/hooks';
import * as S from '../store.js';
import { Modal } from './controls.jsx';
import { render } from './manual.jsx';
import text from '../../CHANGELOG.md?raw';

export function ChangelogDialog() {
  // From the first version on: the dialog's title says what the file's heading does.
  const body = useMemo(() => render(text.slice(Math.max(0, text.search(/^## /m)))), []);
  return (
    <Modal title="What’s new" class="modal-changelog" onClose={() => (S.dialog.value = null)}>
      <p class="hint changelog-now">
        This is Arayashiki <span class="num">{__APP_VERSION__}</span>.
      </p>
      <article class="manual-body changelog-body prose">{body}</article>
    </Modal>
  );
}
