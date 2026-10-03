// The Nodes editor: the open branch's line of nodes, in order. Nodes are
// added from the Add menu (after the selected one), dragged to reorder, and
// their settings are in the Properties editor.
import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { IconButton, KindChip } from './controls.jsx';
import { Area } from './area.jsx';

function AddMenu() {
  const [open, setOpen] = useState(false);
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !menu.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div class="menu-wrap" ref={menu}>
      <button type="button" class="head-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Icon name="plus" size={13} />
        <span class="head-label">Add</span>
      </button>
      {open && (
        <div class="menu menu-add" role="menu">
          {S.palette.map((g) => (
            <div key={g.group} class="menu-group">
              <div class="menu-label">{g.group}</div>
              {g.nodes.map((n) => (
                <button
                  type="button"
                  role="menuitem"
                  key={n.kind}
                  class="menu-item"
                  title={n.about}
                  onClick={() => {
                    S.addNode(n.kind);
                    setOpen(false);
                  }}
                >
                  <KindChip color={n.color} icon={n.icon} size={11} />
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Keyframe animations: a new camera shot, a new moving part, or the picked VISUAL.
const ANIMATABLE = ['Mesh', 'Block', 'Sphere', 'Cylinder', 'Wedge', 'Camera'];
function AnimateMenu() {
  const [open, setOpen] = useState(false);
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !menu.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);
  const node = S.selectedNode.value;
  const canAnimate = node?.K_NAME === 'VISUAL' && ANIMATABLE.includes(node.EFFECT);
  const run = (fn) => () => {
    setOpen(false);
    import('./animator.jsx').then(fn);
  };
  return (
    <div class="menu-wrap" ref={menu}>
      <button type="button" class="head-btn" aria-expanded={open} aria-haspopup="menu" aria-label="Animate" onClick={() => setOpen(!open)}>
        <Icon name="diamond" size={12} class="head-icon" />
        <span class="head-label">Animate</span>
        <Icon name="chevron-down" size={11} />
      </button>
      {open && (
        <div class="menu menu-animate" role="menu">
          <button type="button" role="menuitem" class="menu-item" disabled={!canAnimate} onClick={run((m) => m.openAnimator())} title="Keyframes for the picked VISUAL (Ctrl+K)">
            Animate the picked VISUAL
          </button>
          <div class="menu-sep" role="separator" />
          <button type="button" role="menuitem" class="menu-item" onClick={run((m) => m.newCameraAnimation())}>
            New camera animation
          </button>
          <div class="menu-label">New visual animation</div>
          {['Block', 'Sphere', 'Cylinder', 'Wedge', 'Mesh'].map((effect) => (
            <button type="button" role="menuitem" key={effect} class="menu-item is-indented" onClick={run((m) => m.newVisualAnimation(effect))}>
              {effect}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BranchBar() {
  const tabs = [{ name: '', label: 'Default' }, ...S.branches.value.map((name) => ({ name, label: name }))];
  return (
    <div class="branch-bar" role="tablist" aria-label="Branches">
      {tabs.map((b) => (
        <button
          type="button"
          role="tab"
          key={b.name || '(default)'}
          class="branch-tab"
          aria-selected={S.branch.value === b.name}
          onClick={() => S.pickBranch(b.name)}
        >
          {b.label}
        </button>
      ))}
      <IconButton icon="plus" label="Add a branch" size={13} class="branch-add" onClick={S.addBranch} />
    </div>
  );
}

function NodeLine() {
  const drag = useRef(null);
  const list = useRef(null);
  const selected = S.nodeIndex.value;
  useEffect(() => {
    list.current?.querySelector('.node-row.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selected, S.branch.value, S.skillUid.value]);
  const playing = new Set(S.playingKey.value.split(',').filter(Boolean).map(Number));
  const picked = new Set(S.nodeSelection.value);
  const nodes = S.nodes.value;
  return (
    <ol class="node-line" aria-label="Nodes" ref={list}>
      {nodes.map((n) => (
        <li
          key={n.index}
          draggable
          onDragStart={(e) => {
            drag.current = n.index;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(n.index));
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            S.moveNodeTo(drag.current, n.index);
            drag.current = null;
          }}
        >
          <button
            type="button"
            class={`node-row ${n.index === selected ? 'is-active' : ''} ${picked.has(n.index) && n.index !== selected ? 'is-picked' : ''} ${playing.has(n.index) ? 'is-playing' : ''}`}
            style={{ '--kind': n.color }}
            data-node-index={n.index}
            aria-current={n.index === selected ? 'true' : undefined}
            aria-selected={picked.has(n.index)}
            title="Ctrl-click to pick several, Shift-click for a run"
            onClick={(e) => {
              S.pickNode(n.index, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
              S.tab.value = 'node';
            }}
          >
            <span class="node-n">{n.index + 1}</span>
            <KindChip color={n.color} icon={n.icon} size={11} />
            <span class="node-label">{n.label}</span>
            {n.detail && <span class="node-detail">{n.detail}</span>}
          </button>
        </li>
      ))}
      {!nodes.length && <li class="empty pad">This branch is empty. Add a node from the Add menu.</li>}
    </ol>
  );
}

export function NodeEditor() {
  const s = S.skill.value;
  const node = S.selectedNode.value;
  const tools = (
    <>
      {s && <AddMenu />}
      {s && <AnimateMenu />}
      <span class="spacer" />
      <IconButton
        icon="arrow-up"
        label="Move node up"
        title="Move up (Alt+↑)"
        size={14}
        disabled={!node || S.nodeIndex.value === 0}
        onClick={() => S.moveNode(-1)}
      />
      <IconButton
        icon="arrow-down"
        label="Move node down"
        title="Move down (Alt+↓)"
        size={14}
        disabled={!node || S.nodeIndex.value >= S.line.value.length - 1}
        onClick={() => S.moveNode(1)}
      />
      <IconButton
        icon="copy"
        label="Duplicate node"
        title="Duplicate (Ctrl+D)"
        size={14}
        disabled={!node}
        onClick={S.duplicateNode}
      />
      <IconButton
        icon="trash-2"
        label="Delete node"
        title="Delete (Del)"
        class="danger"
        size={14}
        disabled={!node}
        onClick={S.deleteNode}
      />
    </>
  );
  return (
    <Area name="nodes" icon="list" title="Nodes" tools={tools}>
      {s ? (
        <>
          <div class="skill-title">
            <strong>{String(s.NAME ?? '')}</strong>
            <span>
              {s.K_NAME}
              {s.K_NAME === 'SKILL' && s.KEY !== undefined ? ` · key ${s.KEY}` : ''}
              {s.COOLDOWN !== undefined ? ` · ${s.COOLDOWN}s cooldown` : ''}
            </span>
          </div>
          <BranchBar />
          <NodeLine />
        </>
      ) : (
        <p class="empty pad">Pick a skill in the Outliner, or add one with +.</p>
      )}
    </Area>
  );
}
