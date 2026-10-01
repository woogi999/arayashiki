// The Meter Maker's font picker: a button showing the font in itself, and a
// window to choose from the built-in fonts and those added, the fonts on
// this PC, and Google Fonts (searchable, by category, each previewed in its
// own letters as it scrolls into view). Picking a Google font adds it
// (src/fonts.js).
import { useEffect, useRef, useState } from 'preact/hooks';
import { FONTS } from './draw.js';
import {
  addFont,
  addedFonts,
  ensureFont,
  googleError,
  googleFonts,
  loadGoogleFonts,
  loadSystemFonts,
  previewFont,
  removeFont,
  systemFonts,
} from '../fonts.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Modal } from '../ui/controls.jsx';

const TABS = [
  { id: 'mine', label: 'Built in and added' },
  { id: 'pc', label: 'On this PC' },
  { id: 'google', label: 'Google Fonts' },
];
const CATEGORIES = ['All', 'Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace'];
const PAGE = 80;
const quoted = (f) => (/\s/.test(f) ? `"${f}"` : f);

/** A Google family previewed in its own letters once it's on screen. */
function GooglePreview({ family, text }) {
  const el = useRef(null);
  const [face, setFace] = useState(null);
  useEffect(() => {
    setFace(null);
    let gone = false;
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      seen.disconnect();
      previewFont(family, `${text}${family}`)
        .then((name) => !gone && setFace(name))
        .catch(() => !gone && setFace(false));
    });
    seen.observe(el.current);
    return () => {
      gone = true;
      seen.disconnect();
    };
  }, [family, text]);
  return (
    <span
      ref={el}
      class={`fp-sample ${face ? '' : 'is-loading'}`}
      style={face ? { fontFamily: `${quoted(face)}, sans-serif` } : undefined}
    >
      {face === false ? 'No preview' : text}
    </span>
  );
}

function Row({ family, current, note, preview, onUse, extra }) {
  return (
    <li class={`fp-row ${family === current ? 'is-current' : ''}`}>
      <button type="button" class="fp-use" onClick={onUse} title={`Use ${family}`}>
        <span class="fp-name">
          {family}
          {note && <small>{note}</small>}
        </span>
        {preview}
      </button>
      {extra}
    </li>
  );
}

function FontsWindow({ value, onPick, onClose }) {
  const [tab, setTab] = useState('mine');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sample, setSample] = useState('Power 100% 力');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (tab === 'pc') loadSystemFonts();
    if (tab === 'google') loadGoogleFonts();
    setShown(PAGE);
  }, [tab]);
  useEffect(() => setShown(PAGE), [query, category]);
  const q = query.trim().toLowerCase();
  const match = (f) => !q || f.toLowerCase().includes(q);
  const added = addedFonts.value;
  const use = async (family, google) => {
    if (google) {
      setBusy(family);
      try {
        await addFont(google);
      } catch {
        // Kept in the list; it loads when it can (offline now, say).
      } finally {
        setBusy(null);
      }
    } else if (added.some((a) => a.family === family)) ensureFont(family).catch(() => {});
    onPick(family);
    onClose();
  };
  const plain = (family) => (
    <span class="fp-sample" style={{ fontFamily: `${quoted(family)}, sans-serif` }}>
      {sample}
    </span>
  );

  let body;
  if (tab === 'mine') {
    const rows = [...FONTS.map((f) => ({ family: f })), ...added.map((a) => ({ family: a.family, google: a }))].filter(
      (r) => match(r.family),
    );
    body = (
      <ul class="fp-list">
        {rows.map((r) => (
          <Row
            key={r.family}
            family={r.family}
            current={value}
            note={r.google ? 'Google Fonts' : null}
            preview={plain(r.family)}
            onUse={() => use(r.family)}
            extra={
              r.google && (
                <IconButton
                  icon="x"
                  size={12}
                  label={`Remove ${r.family} from the list`}
                  onClick={() => removeFont(r.family)}
                />
              )
            }
          />
        ))}
      </ul>
    );
  } else if (tab === 'pc') {
    const list = systemFonts.value;
    const rows = (list ?? []).filter(match);
    body = !list ? (
      <p class="hint">Reading the fonts on this PC…</p>
    ) : !list.length ? (
      <p class="hint">
        No fonts could be read here. (In the browser preview, allow it to read your fonts when it asks.)
      </p>
    ) : (
      <>
        <p class="hint">
          {list.length} families installed on this PC. A design in one of them only looks right on a PC that has it; the
          pictures you export are the same anywhere.
        </p>
        <ul class="fp-list">
          {rows.slice(0, shown).map((f) => (
            <Row key={f} family={f} current={value} preview={plain(f)} onUse={() => use(f)} />
          ))}
        </ul>
        {rows.length > shown && (
          <Button onClick={() => setShown(shown + PAGE)}>Show more ({rows.length - shown})</Button>
        )}
      </>
    );
  } else {
    const list = googleFonts.value;
    const rows = (list ?? []).filter((g) => match(g.family) && (category === 'All' || g.category === category));
    body = !list ? (
      <p class="hint">Getting Google Fonts’ list…</p>
    ) : (
      <>
        {googleError.value && (
          <p class="warn">Google Fonts couldn’t be reached ({googleError.value}): here are the popular ones.</p>
        )}
        <div class="fp-cats" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} class="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <p class="hint">
          {rows.length} families, most popular first. Picking one adds it: it’s downloaded once and kept, so your
          designs draw with it offline too.
        </p>
        <ul class="fp-list">
          {rows.slice(0, shown).map((g) => {
            const have = added.some((a) => a.family === g.family);
            return (
              <Row
                key={g.family}
                family={g.family}
                current={value}
                note={g.category}
                preview={<GooglePreview family={g.family} text={sample} />}
                onUse={() => use(g.family, g)}
                extra={
                  busy === g.family ? (
                    <Icon name="loader" size={13} class="spin" />
                  ) : have ? (
                    <span class="fp-have" title="Added">
                      <Icon name="check" size={13} />
                    </span>
                  ) : (
                    <IconButton
                      icon="plus"
                      size={13}
                      label={`Add ${g.family} without using it`}
                      onClick={() => addFont(g)}
                    />
                  )
                }
              />
            );
          })}
        </ul>
        {rows.length > shown && (
          <Button onClick={() => setShown(shown + PAGE)}>Show more ({rows.length - shown})</Button>
        )}
      </>
    );
  }

  return (
    <Modal title="Fonts" class="modal-fonts" onClose={onClose}>
      <div class="pb-tabs" role="tablist" aria-label="Where from">
        {TABS.map((t) => (
          <button type="button" role="tab" key={t.id} aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div class="fp-bar">
        <input
          class="input"
          type="search"
          placeholder="Search fonts"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          autoFocus
        />
        <input
          class="input"
          type="text"
          aria-label="Preview text"
          title="What the previews say"
          value={sample}
          onInput={(e) => setSample(e.currentTarget.value || 'Aa')}
        />
      </div>
      <div class="fp-body">{body}</div>
    </Modal>
  );
}

/** The row in a layer's settings: the font, shown in itself; click to change it. */
export function FontPicker({ value, onPick }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (addedFonts.peek().some((a) => a.family === value)) ensureFont(value);
  }, [value]);
  return (
    <div class="pb-row">
      <span class="pb-row-label">Font</span>
      <button
        type="button"
        class="input fp-current"
        onClick={() => setOpen(true)}
        title="Choose a font: built in, on this PC, or from Google Fonts"
      >
        <span style={{ fontFamily: `${quoted(value)}, sans-serif` }}>{value}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open && <FontsWindow value={value} onPick={onPick} onClose={() => setOpen(false)} />}
    </div>
  );
}
