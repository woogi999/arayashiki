// The Templates dialog (brought over from Woogi Tools' JJS Stuff): pick a
// ready-made skill, fill in its form, and put the skills it builds into the
// moveset, or copy their code. The templates are core/templates.js.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as S from '../store.js';
import { encodeMoveset } from '../../core/format.js';
import { TEMPLATES, defaultsOf } from '../../core/templates.js';
import { robloxImage } from '../platform.js';
import { Icon } from '../icons.jsx';
import { Button, Modal, Segmented } from './controls.jsx';

const close = () => (S.dialog.value = null);

// A field's `when`: a checkbox that must be ticked, or "key=value".
function shows(field, values) {
  if (!field.when) return true;
  const [key, want] = field.when.split('=');
  return want === undefined ? Boolean(values[key]) : values[key] === want;
}

const matches = (query) => {
  const q = query.trim().toLowerCase();
  return q ? TEMPLATES.filter((t) => `${t.name} ${t.blurb} ${t.from}`.toLowerCase().includes(q)) : TEMPLATES;
};

// Each template's values, kept while the dialog is closed.
let kept = {};

function Field({ field, value, onValue }) {
  if (field.type === 'bool')
    return (
      <label class="pb-check tpl-wide">
        <input type="checkbox" name={field.key} checked={Boolean(value)} onChange={(e) => onValue(e.currentTarget.checked)} />
        <span>{field.label}</span>
      </label>
    );
  let input;
  if (field.type === 'ids')
    input = (
      <textarea
        class="input num"
        name={field.key}
        rows={3}
        spellcheck={false}
        value={value}
        onInput={(e) => onValue(e.currentTarget.value)}
      />
    );
  else if (field.type === 'choice')
    input = (
      <select class="input" name={field.key} value={value} onChange={(e) => onValue(e.currentTarget.value)}>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else if (field.type === 'number')
    input = (
      <input
        type="number"
        class="input num"
        name={field.key}
        step={field.step ?? 'any'}
        value={value}
        onChange={(e) => onValue(Number(e.currentTarget.value) || 0)}
      />
    );
  else
    input = (
      <input
        type="text"
        class="input"
        name={field.key}
        placeholder={field.placeholder}
        spellcheck={false}
        value={value}
        onChange={(e) => onValue(e.currentTarget.value)}
      />
    );
  return (
    <label class={`tpl-field ${field.type === 'ids' ? 'tpl-wide' : ''}`}>
      <span>{field.label}</span>
      {input}
      {field.hint && <small class="hint">{field.hint}</small>}
    </label>
  );
}

// The progress bar template's 3D preview: each step's picture, as Roblox has it.
function BarPreview({ preview }) {
  const host = useRef(null);
  const scene = useRef(null);
  const [step, setStep] = useState(null);
  const last = Math.max(0, preview.ids.length - 1);
  const shown = Math.min(step ?? last, last);
  const id = preview.ids[shown] ?? null;
  useEffect(() => {
    let gone = false;
    import('../barmaker/preview3d.js').then(({ mountBarScene }) => {
      if (!gone) scene.current = mountBarScene(host.current);
    });
    return () => {
      gone = true;
      scene.current?.dispose();
    };
  }, []);
  useEffect(() => {
    let stale = false;
    (async () => {
      const url = id ? await robloxImage(id) : null;
      // The scene may still be loading: wait a frame or two for it.
      for (let i = 0; i < 20 && !scene.current && !stale; i++) await new Promise((r) => setTimeout(r, 50));
      if (!stale) scene.current?.update({ url, size: preview.size, position: preview.position });
    })();
    return () => (stale = true);
  }, [id, preview.size, preview.position]);
  return (
    <fieldset class="tpl-section">
      <legend>Preview</legend>
      <div class="pb-bar3d">
        <div class="pb-bar3d-view" ref={host} />
        <div class="pb-bar3d-bar">
          {preview.ids.length > 0 && (
            <label class="pb-slider">
              <span>
                Step {shown} of {last}
              </span>
              <input type="range" min="0" max={last} value={shown} onInput={(e) => setStep(Number(e.currentTarget.value))} />
            </label>
          )}
          <Button onClick={() => scene.current?.resetCamera()}>Reset view</Button>
        </div>
        <p class="hint">
          Where the billboard sits, at this Size and Offset, and each step’s picture as Roblox has it. Drag to look
          around.{preview.ids.length ? '' : ' Paste the image IDs to see the pictures.'}
        </p>
      </div>
    </fieldset>
  );
}

// The auto-sheathing template's 3D preview: the weapon where the skill puts
// it, sheathed, drawn, or both (the other state see-through).
const SHEATH_VIEWS = [
  { id: 'sheathed', label: 'Sheathed' },
  { id: 'drawn', label: 'Drawn' },
  { id: 'both', label: 'Both' },
];
const SHEATH_TOOLS = [
  { id: 'translate', label: 'Move (G)' },
  { id: 'rotate', label: 'Turn (R)' },
];
function SheathPreview({ preview, onFields }) {
  const host = useRef(null);
  const scene = useRef(null);
  const [view, setView] = useState('both');
  const [missing, setMissing] = useState(0);
  const [tool, setTool] = useState('translate');
  const [picked, setPicked] = useState(null);
  // What the meshes on show are, in order, for a drag to write back to.
  const listed = useRef([]);
  const edit = useRef(onFields);
  edit.current = onFields;
  useEffect(() => {
    let gone = false;
    import('./sheath-preview.js').then(({ mountSheathScene }) => {
      if (!gone) {
        scene.current = mountSheathScene(host.current, {
          onEdit: (i, { position, rotation }) => {
            const it = listed.current[i];
            if (it?.fields) edit.current({ [it.fields[0]]: position, [it.fields[1]]: rotation });
          },
          onPick: (i, it) => setPicked(it ? it.label ?? 'Mesh' : null),
        });
        setView((v) => v); // draw once it's up
      }
    });
    return () => {
      gone = true;
      scene.current?.dispose();
    };
  }, []);
  // G and R, as in Blender, while a mesh is picked.
  useEffect(() => {
    if (!picked) return;
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = { g: 'translate', r: 'rotate' }[e.key.toLowerCase()];
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      setTool(t);
      scene.current?.setMode(t);
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [picked]);
  const key = JSON.stringify(preview);
  useEffect(() => {
    let stale = false;
    (async () => {
      for (let i = 0; i < 40 && !scene.current && !stale; i++) await new Promise((r) => setTimeout(r, 50));
      if (stale || !scene.current) return;
      const items =
        view === 'both'
          ? [...preview.sheathed, ...preview.drawn.filter((d) => !preview.sheathed.some((s) => JSON.stringify(s) === JSON.stringify(d))).map((d) => ({ ...d, ghost: true }))]
          : preview[view];
      listed.current = items;
      const n = await scene.current.update(items);
      if (!stale) setMissing(n);
    })();
    return () => (stale = true);
  }, [key, view]);
  return (
    <fieldset class="tpl-section">
      <legend>Preview</legend>
      <div class="pb-bar3d">
        <div class="pb-bar3d-view" ref={host} />
        <div class="pb-bar3d-bar">
          <Segmented label="Weapon" options={SHEATH_VIEWS} value={view} onChange={(v) => (setView(v), scene.current?.pick(-1), setPicked(null))} />
          <Segmented label="Gizmo" options={SHEATH_TOOLS} value={tool} onChange={(t) => (setTool(t), scene.current?.setMode(t))} />
          <Button onClick={() => scene.current?.resetCamera()}>Reset view</Button>
        </div>
        <p class="hint">
          {picked ? `${picked}: drag the gizmo to place it; its position and rotation above follow. ` : 'Click a mesh to drag it into place (Move or Turn). '}
          Drag the background to look around. “Both” shows the drawn weapon see-through.
          {missing ? ` ${missing} mesh${missing === 1 ? '' : 'es'} couldn’t be loaded: a grey dot marks where it goes.` : ''}
        </p>
      </div>
    </fieldset>
  );
}

// The template to open on (the universal search picks one).
export const templateToOpen = { id: null };

export function TemplatesDialog() {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(() => {
    const id = templateToOpen.id;
    templateToOpen.id = null;
    return TEMPLATES.some((t) => t.id === id) ? id : TEMPLATES[0].id;
  });
  const [values, setValues] = useState(kept);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const list = useMemo(() => matches(query), [query]);
  const template = list.find((t) => t.id === picked) ?? list[0] ?? null;
  const current = template ? { ...defaultsOf(template), ...values[template.id] } : {};

  // Rebuilt on every change; an older, slower build never overwrites a newer one.
  const run = useRef(0);
  useEffect(() => {
    kept = values;
    const mine = ++run.current;
    setNote(null);
    if (!template) return;
    (async () => {
      let out = '';
      let err = null;
      try {
        out = await encodeMoveset(template.build(current));
      } catch (e) {
        err = e.message;
      }
      if (mine !== run.current) return;
      setCode(out);
      setError(err);
    })();
  }, [template?.id, values]);

  const setValue = (key, value) => setValues({ ...values, [template.id]: { ...values[template.id], [key]: value } });
  const add = () => {
    try {
      const { added, replaced } = S.mergeSkills(template.build(current));
      const parts = [replaced && `updated ${replaced}`, added && `added ${added}`].filter(Boolean).join(' and ');
      setNote(`${parts[0].toUpperCase()}${parts.slice(1)} skill${added + replaced === 1 ? '' : 's'} in “${S.name.value}”.`);
    } catch (e) {
      setError(e.message);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNote('Copied: import it in the Skill Builder.');
    } catch {
      setNote('The clipboard refused: select the code and copy it.');
    }
  };
  const preview = template?.preview?.(current);

  return (
    <Modal title="Templates" class="modal-wide tpl-modal" onClose={close}>
      <div class="library tpl">
        <div class="library-list">
          <label class="list-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              class="input"
              placeholder="Bar, sheath, M1s…"
              aria-label="Search the templates"
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </label>
          <ul role="listbox" aria-label="Templates">
            {list.map((t) => (
              <li key={t.id}>
                <button type="button" role="option" aria-selected={t === template} onClick={() => setPicked(t.id)}>
                  <Icon name={t.icon} size={16} />
                  <span class="tpl-pick">
                    <span>{t.name}</span>
                    <small>{t.from}</small>
                  </span>
                </button>
              </li>
            ))}
            {!list.length && <li class="empty pad">No template matches “{query}”.</li>}
          </ul>
        </div>
        {template && (
          <article class="library-detail tpl-form">
            <h3>{template.name}</h3>
            <p class="hint">{template.blurb}</p>
            {template.link?.workspace && (
              <button
                type="button"
                class="link tpl-link"
                onClick={() => {
                  close();
                  S.workspace.value = template.link.workspace;
                }}
              >
                <Icon name="arrow-right" size={13} /> {template.link.label}
              </button>
            )}
            {template.sections.map((section) => (
              <fieldset class="tpl-section" key={section.title}>
                <legend>{section.title}</legend>
                <div class="tpl-fields">
                  {section.fields
                    .filter((f) => shows(f, current))
                    .map((f) => (
                      <Field key={f.key} field={f} value={current[f.key]} onValue={(v) => setValue(f.key, v)} />
                    ))}
                </div>
              </fieldset>
            ))}
            {preview && <BarPreview preview={preview} />}
            {template.sheathPreview && (
              <SheathPreview
                preview={template.sheathPreview(current)}
                onFields={(patch) => setValues((all) => ({ ...all, [template.id]: { ...all[template.id], ...patch } }))}
              />
            )}
            {error ? (
              <p class="error">{error}</p>
            ) : (
              code && (
                <>
                  <p class="hint">{template.usage(current)}</p>
                  <textarea class="input num pb-code" rows={8} readonly onFocus={(e) => e.currentTarget.select()} spellcheck={false} aria-label="Skill code" value={code} />
                  <div class="modal-actions">
                    <Button variant="primary" icon="plus" onClick={add}>
                      Add to “{S.name.value}”
                    </Button>
                    <Button icon="copy" onClick={copy}>
                      Copy code
                    </Button>
                    <span class="spacer" />
                    <Button
                      onClick={() => {
                        const { [template.id]: _gone, ...rest } = values;
                        setValues(rest);
                      }}
                    >
                      Back to the defaults
                    </Button>
                  </div>
                  {note && <p class="hint">{note}</p>}
                </>
              )
            )}
          </article>
        )}
      </div>
    </Modal>
  );
}
