// The settings of one node. Every field of its kind is listed; one the node
// doesn't carry shows JJS's usual value, muted, and is only written once it's
// changed. Fields this doesn't know are edited by the type of their value.
import { useEffect, useRef } from 'preact/hooks';
import { animOf, defaultsOf, effectFields, fieldsOf, nodeInfo, rgbOf } from '../../core/schema.js';
import { ANIM_SETS } from '../../core/gamedata.js';
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { IconButton, KindChip, Switch } from './controls.jsx';
import { AssetCard } from './asset-card.jsx';

// Fields that hold a Roblox asset ID: a sound's ID, and the pictures
// visuals and particles use.
const isAssetField = (node, key) => (node.K_NAME === 'SFX' && key === 'ID') || key === 'TEXTURE';

const toHex = (rgb) =>
  `#${rgbOf(rgb)
    .map((c) => Math.round(c).toString(16).padStart(2, '0'))
    .join('')}`;

// Animations by name: every ANIM_USE [set, n] JJS lists, as its path
// ("Gojo.Melee.Melee1"). The first set that has a path wins.
const ANIM_BY_NAME = new Map();
ANIM_SETS.forEach((set, s) => set.anims.forEach(([path], n) => ANIM_BY_NAME.has(path) || ANIM_BY_NAME.set(path, [s + 1, n + 1])));
const ANIM_NAMES = [...ANIM_BY_NAME.keys()];

function show(field, value) {
  if (value === undefined || value === null) return '';
  if (field.type === 'anim') return animOf(value)?.path ?? (Array.isArray(value) ? value.join(', ') : String(value));
  if (field.type === 'json') return JSON.stringify(value);
  return String(value);
}

function read(field, raw) {
  switch (field.type) {
    case 'num': {
      const n = Number(raw);
      return raw.trim() === '' ? field.def : Number.isFinite(n) ? n : field.def;
    }
    case 'anim': {
      const byName = ANIM_BY_NAME.get(raw.trim()) ?? ANIM_BY_NAME.get(ANIM_NAMES.find((n) => n.toLowerCase() === raw.trim().toLowerCase()));
      if (byName) return [...byName];
      const parts = raw.split(',').map((s) => s.trim());
      return parts.length === 2 && parts.every((s) => s !== '' && Number.isFinite(Number(s)))
        ? parts.map(Number)
        : raw.trim();
    }
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    default:
      return raw;
  }
}

function FieldInput({ field, id, value, text }) {
  const commit = (e) => {
    const next = read(field, e.currentTarget.value);
    if (next === undefined) e.currentTarget.value = text;
    else S.setNodeField(field.key, next);
  };
  switch (field.type) {
    case 'bool':
      return (
        <Switch id={id} label={field.key} checked={Boolean(value)} onChange={(on) => S.setNodeField(field.key, on)} />
      );
    case 'pair': {
      const pair = Array.isArray(value) ? value : [0, 0];
      const setPair = (which, raw) => {
        const next = [...pair];
        const n = Number(raw);
        next[which] = Number.isFinite(n) ? n : 0;
        S.setNodeField(field.key, next);
      };
      return (
        <span class="pair">
          <input
            id={id}
            type="number"
            step="any"
            class="input num"
            value={pair[0]}
            onChange={(e) => setPair(0, e.currentTarget.value)}
          />
          <input
            type="number"
            step="any"
            class="input num"
            aria-label={`${field.key} end`}
            value={pair[1]}
            onChange={(e) => setPair(1, e.currentTarget.value)}
          />
        </span>
      );
    }
    case 'color':
      return (
        <span class="colour">
          <span class="swatch" style={{ background: toHex(value) }}>
            <input
              type="color"
              value={toHex(value)}
              aria-label={`${field.key} picker`}
              onInput={(e) => {
                const hex = e.currentTarget.value;
                S.setNodeField(field.key, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', '));
              }}
            />
          </span>
          <input id={id} type="text" class="input num" spellcheck={false} value={text} onChange={commit} />
        </span>
      );
    case 'json':
      return <textarea id={id} class="input num" rows={2} spellcheck={false} value={text} onChange={commit} />;
    default: {
      const list =
        field.type === 'branch'
          ? 'node-branches'
          : field.type === 'anim'
            ? 'anim-names'
            : field.type === 'choice'
            ? `choices-${field.key.replace(/\W+/g, '-')}`
            : undefined;
      const numeric = field.type === 'num';
      return (
        <>
          <input
            id={id}
            type={numeric ? 'number' : 'text'}
            step="any"
            class={`input ${numeric || field.type === 'vec3' || field.type === 'anim' ? 'num' : ''}`}
            spellcheck={false}
            list={list}
            value={text}
            onChange={commit}
          />
          {field.type === 'choice' && (
            <datalist id={list}>
              {field.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </>
      );
    }
  }
}

// A small view of the animation: the stand-in pose the 3D view plays for it
// (JJS's own animations aren't downloadable), looping.
function AnimPreview({ use }) {
  const host = useRef(null);
  const view = useRef(null);
  useEffect(() => {
    let gone = false;
    import('../scene.js').then(({ mountPosePreview }) => {
      if (gone || !host.current) return;
      view.current = mountPosePreview(host.current);
      view.current.setAnim(use);
    });
    return () => {
      gone = true;
      view.current?.dispose();
      view.current = null;
    };
  }, []);
  useEffect(() => view.current?.setAnim(use), [JSON.stringify(use)]);
  const found = animOf(use);
  return (
    <figure class="anim-preview">
      <div class="anim-preview-view" ref={host} />
      <figcaption>{found ? found.path.split('.').pop() : 'Unknown animation'} · stand-in pose</figcaption>
    </figure>
  );
}

export function Inspector() {
  const node = S.selectedNode.value;
  if (!node) return <p class="empty pad">Select a node to see its settings, or add one from the palette.</p>;
  const info = nodeInfo(node.K_NAME);
  const rows = fieldsOf(node);
  // A VISUAL's effect reads only some fields (BuilderFX): the rest are dimmed.
  const reads = node.K_NAME === 'VISUAL' ? effectFields(node.EFFECT ?? defaultsOf('VISUAL').EFFECT) : null;
  const anim = node.K_NAME === 'ANIM' ? animOf(node.ANIM_USE ?? defaultsOf('ANIM').ANIM_USE) : null;
  return (
    <div class="inspector">
      <div class="inspector-about">
        <KindChip color={info.color} icon={info.icon} />
        <p>{info.about}</p>
      </div>
      {node.K_NAME === 'ANIM' && <AnimPreview use={node.ANIM_USE ?? defaultsOf('ANIM').ANIM_USE} />}
      {node.K_NAME === 'ANIM' && (
        <datalist id="anim-names">
          {ANIM_NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      <datalist id="node-branches">
        {S.branches.value.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <div class="fields">
        {rows.map((field) => {
          const has = field.key in node;
          const value = has ? node[field.key] : field.def;
          const id = `field-${field.key.replace(/\W+/g, '-')}`;
          const ignored = reads && !field.unknown && !reads.has(field.key);
          const title = [field.label, field.hint, ignored && `${node.EFFECT} doesn’t use this field.`]
            .filter(Boolean)
            .join(': ');
          return (
            <div
              key={field.key}
              class={`field ${has ? 'is-set' : 'is-default'} ${field.unknown ? 'is-unknown' : ''} ${ignored ? 'is-ignored' : ''}`}
            >
              <label for={id} title={title || undefined}>
                <span>{field.key}</span>
                {(field.hint || field.label) && <Icon name="info" size={12} />}
              </label>
              <div class="field-input">
                <FieldInput field={field} id={id} value={value} text={show(field, value)} />
                {has ? (
                  <IconButton
                    icon="x"
                    size={13}
                    class="field-reset"
                    label={`Remove ${field.key}`}
                    title="Remove: JJS uses its usual value"
                    onClick={() => S.clearNodeField(field.key)}
                  />
                ) : (
                  <span class="field-reset-space" />
                )}
              </div>
              {isAssetField(node, field.key) && <AssetCard id={value} />}
              {field.key === 'ANIM_USE' && (
                <p class="field-note">
                  {anim
                    ? `${anim.character} · ANIM_USE [${(node.ANIM_USE ?? defaultsOf('ANIM').ANIM_USE).join(', ')}] · animation ${anim.id}`
                    : 'Not in JJS’s animation list: type a name, or set, n.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
