// What a Roblox asset ID in a node is: its name, type and creator, where the
// app got it from, and the thing itself (a picture to see, a sound to play).
// Fetched through the desktop shell's every-route pipeline (platform.js).
import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from '../store.js';
import { isDesktop, robloxAsset } from '../platform.js';
import { Icon } from '../icons.jsx';

const SOURCES = {
  saved: 'Saved in the app',
  'roblox-cache': 'From Roblox’s cache on this PC',
  cdn: 'Downloaded from Roblox',
  thumbnail: 'Thumbnail only (the full picture wouldn’t come)',
};

export function AssetCard({ id }) {
  const [state, setState] = useState({ loading: true });
  const [playing, setPlaying] = useState(false);
  const audio = useRef(null);
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    setPlaying(false);
    robloxAsset(id).then((got) => live && setState({ loading: false, ...(got ?? {}) }));
    return () => {
      live = false;
      audio.current?.pause();
    };
  }, [id]);
  if (!isDesktop || !/^\d+$/.test(String(id)) || String(id) === '0') return null;
  const { loading, info, url } = state;
  const kind = info?.mime?.split('/')[0];
  const play = () => {
    if (!url) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    audio.current ??= new Audio(url);
    audio.current.currentTime = 0;
    audio.current.onended = () => setPlaying(false);
    audio.current.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };
  return (
    <div class="asset-card" aria-live="polite">
      <div class="asset-preview">
        {loading ? (
          <span class="asset-spinner" aria-label="Fetching" />
        ) : kind === 'image' && info.mime !== 'image/ktx' ? (
          <img src={url} alt="" />
        ) : kind === 'audio' ? (
          <button type="button" class="asset-play" aria-label={playing ? 'Stop' : 'Play the sound'} onClick={play}>
            <Icon name={playing ? 'pause' : 'play'} size={14} />
          </button>
        ) : (
          <Icon name={info?.error ? 'warning' : 'file-text'} size={16} />
        )}
      </div>
      <div class="asset-text">
        {loading ? (
          <span class="asset-name">Fetching {id}…</span>
        ) : (
          <>
            <span class="asset-name">{info?.name ?? `Asset ${id}`}</span>
            <span class="asset-meta">
              {[info?.typeName, info?.creator && `by ${info.creator}`, info?.pointsTo && `holds ${info.pointsTo}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {info?.source ? (
              <span class="asset-source">{SOURCES[info.source] ?? info.source}</span>
            ) : (
              info?.error && (
                <span class="asset-error">
                  {info.error}{' '}
                  {/sign in|signed-in/i.test(info.error) && (
                    <button type="button" class="link" onClick={() => (S.dialog.value = 'account')}>
                      Sign in
                    </button>
                  )}
                </span>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
