// The Outliner: the moveset as a tree, like Blender's. Categories open to
// their skills; the open skill opens to its branches.
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { IconButton, KindChip } from './controls.jsx';
import { Area } from './area.jsx';

const LABELS = { SKILL: 'Skills', SPECIAL: 'Special', AWAKENING: 'Awakening', MELEE: 'Melee', CHASE: 'Chase' };

function toggle(id) {
  const open = S.openCategories.value;
  S.openCategories.value = open.includes(id) ? open.filter((c) => c !== id) : [...open, id];
}

function SkillBranches() {
  const tabs = [{ name: '', label: 'Default' }, ...S.branches.value.map((name) => ({ name, label: name }))];
  return (
    <ul class="tree tree-branches" role="group">
      {tabs.map((b) => (
        <li key={b.name || '(default)'}>
          <button
            type="button"
            role="treeitem"
            class="tree-row depth-2"
            data-branch={b.name}
            aria-selected={S.branch.value === b.name}
            onClick={() => {
              S.outlined.value = 'branch';
              S.pickBranch(b.name);
            }}
          >
            <Icon name="split" size={13} />
            <span class="tree-label">{b.label}</span>
            <span class="tree-meta num">{S.program.value ? countNodes(b.name) : ''}</span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" class="tree-row depth-2 tree-add" onClick={S.addBranch}>
          <Icon name="plus" size={13} />
          <span class="tree-label">Add branch</span>
        </button>
      </li>
    </ul>
  );
}

const countNodes = (b) => {
  const p = S.program.value;
  return (b ? p?.Branch?.[b]?.Line : p?.Line)?.length ?? 0;
};

export function Outliner() {
  const rows = S.skillRows.value;
  const at = rows.findIndex((r) => r.active);
  const tools = (
    <>
      <span class="spacer" />
      <IconButton icon="plus" label="Add a skill" size={14} onClick={S.addSkill} />
      <IconButton icon="arrow-up" label="Move skill up" size={14} disabled={at <= 0} onClick={() => S.moveSkill(-1)} />
      <IconButton
        icon="arrow-down"
        label="Move skill down"
        size={14}
        disabled={at < 0 || at >= rows.length - 1}
        onClick={() => S.moveSkill(1)}
      />
      <IconButton icon="copy" label="Duplicate skill" size={14} disabled={!S.skill.value} onClick={S.duplicateSkill} />
      <IconButton
        icon="trash-2"
        label="Delete skill"
        class="danger"
        size={14}
        disabled={!S.skill.value}
        onClick={S.deleteSkill}
      />
    </>
  );
  const open = S.openCategories.value;
  return (
    <Area name="outliner" icon="folder" title="Outliner" tools={tools}>
      <ul class="tree" role="tree" aria-label="Moveset">
        {S.categoryRows.value.map((c) => {
          const isOpen = open.includes(c.id);
          const skills = S.skills.value.filter((s) => s.K_NAME === c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="treeitem"
                aria-expanded={isOpen}
                class={`tree-row depth-0 ${c.active ? 'is-current' : ''}`}
                onClick={() => {
                  toggle(c.id);
                  if (!isOpen) S.pickCategory(c.id);
                }}
              >
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} class="tree-twisty" />
                <KindChip color={c.color} icon={c.icon} size={11} />
                <span class="tree-label">{LABELS[c.id] ?? c.label}</span>
                <span class="tree-meta num">{c.count}</span>
              </button>
              {isOpen && (
                <ul class="tree" role="group">
                  {skills.map((s) => {
                    const active = s.uid === S.skillUid.value;
                    const picked = S.skillSelection.value.includes(s.uid);
                    const separator = s.ADD === false && !s.DATA;
                    return (
                      <li key={s.uid}>
                        <button
                          type="button"
                          role="treeitem"
                          aria-selected={active}
                          data-skill-uid={s.uid}
                          class={`tree-row depth-1 ${separator ? 'is-separator' : ''} ${picked && !active ? 'is-picked' : ''}`}
                          onClick={(e) => {
                            S.outlined.value = 'skill';
                            S.category.value = c.id;
                            S.pickSkill(s.uid, { toggle: e.ctrlKey || e.metaKey });
                          }}
                        >
                          <Icon
                            name={separator ? 'minus' : active ? 'chevron-down' : 'chevron-right'}
                            size={12}
                            class="tree-twisty"
                          />
                          <span class="tree-label">{String(s.NAME ?? '') || '(no name)'}</span>
                          {c.id === 'SKILL' && s.KEY !== undefined && !separator && (
                            <span class="key-badge" title={`Key ${s.KEY}`}>
                              {s.KEY}
                            </span>
                          )}
                        </button>
                        {active && !separator && <SkillBranches />}
                      </li>
                    );
                  })}
                  {!skills.length && (
                    <li class="tree-empty">
                      Nothing here yet.{' '}
                      <button
                        type="button"
                        class="link"
                        onClick={() => {
                          S.category.value = c.id;
                          S.addSkill();
                        }}
                      >
                        Add one
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Area>
  );
}
