// The Properties editor, laid out like Blender's: a strip of tabs down the
// left (the selected node, the open branch, the skill, the simulator) and
// collapsible panels of label/value rows.
import { useState } from 'preact/hooks';
import { REQ_KINDS, nodeInfo } from '../../core/schema.js';
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton, KindChip, Segmented, Switch } from './controls.jsx';
import { Area } from './area.jsx';
import { Inspector } from './inspector.jsx';

const TABS = [
  { id: 'node', icon: 'box', label: 'Node' },
  { id: 'branch', icon: 'split', label: 'Branch' },
  { id: 'skill', icon: 'swords', label: 'Skill' },
  { id: 'sim', icon: 'crosshair', label: 'Simulation' },
];

/** A collapsible panel, like Blender's. */
export function Panel({ title, children, open: initial = true }) {
  const [open, setOpen] = useState(initial);
  return (
    <section class={`panel ${open ? 'is-open' : ''}`}>
      <button type="button" class="panel-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        {title}
      </button>
      {open && <div class="panel-body">{children}</div>}
    </section>
  );
}

function NodeTab() {
  const node = S.selectedNode.value;
  if (!node) return <p class="empty pad">Select a node in the Nodes editor, or add one with Add.</p>;
  const info = nodeInfo(node.K_NAME);
  return (
    <>
      <div class="props-title">
        <KindChip color={info.color} icon={info.icon} />
        <div>
          <strong>{info.label}</strong>
          <span>
            {S.branch.value || 'Default'} · node {S.nodeIndex.value + 1}
          </span>
        </div>
      </div>
      <Panel title="Fields">
        <Inspector />
      </Panel>
    </>
  );
}

function BranchTab() {
  const inBranch = Boolean(S.branch.value);
  return (
    <>
      <div class="props-title">
        <span class="props-icon">
          <Icon name="split" size={14} />
        </span>
        <div>
          <strong>{S.branch.value || 'Default'}</strong>
          <span>{inBranch ? 'Branch' : 'The skill’s own line'}</span>
        </div>
      </div>
      {inBranch && (
        <Panel title="Branch">
          <label class="prop-row">
            <span>Name</span>
            <input
              type="text"
              class="input branch-name"
              spellcheck={false}
              value={S.branch.value}
              onChange={(e) => {
                if (!S.renameBranch(e.currentTarget.value)) e.currentTarget.value = S.branch.value;
              }}
            />
          </label>
          <p class="hint">Renaming also renames every BRANCH, target and random pick that goes here.</p>
          <Button icon="trash-2" variant="danger" onClick={S.deleteBranch}>
            Delete branch
          </Button>
        </Panel>
      )}
      <Panel title={inBranch ? 'Only enters when' : 'Only starts when'}>
        {S.reqs.value.map((r) => (
          <div class="req" key={r.index}>
            <button
              type="button"
              class={`flip ${r.flip ? 'is-flipped' : ''}`}
              title="FLIP: the opposite"
              aria-pressed={r.flip}
              onClick={() => S.toggleReqFlip(r.index)}
            >
              {r.flip ? 'NOT' : 'IS'}
            </button>
            <span class="req-label">{r.label}</span>
            {r.hasAmount && (
              <input
                type="number"
                step="any"
                class="input num req-amount"
                aria-label="Amount"
                value={r.amount}
                onChange={(e) => S.setReqAmount(r.index, e.currentTarget.value)}
              />
            )}
            <IconButton icon="x" size={13} label="Remove condition" onClick={() => S.removeReq(r.index)} />
          </div>
        ))}
        {!S.reqs.value.length && (
          <p class="hint">No conditions: {inBranch ? 'any BRANCH to here enters.' : 'the skill always starts.'}</p>
        )}
        <div class="chips">
          {REQ_KINDS.map((k) => (
            <button type="button" class="chip" key={k.id} onClick={() => S.addReq(k.id)}>
              <Icon name="plus" size={11} />
              {k.label}
            </button>
          ))}
        </div>
        <p class="hint">
          A BRANCH whose conditions don’t hold is skipped and the line carries on: that’s how one move gets ground, air
          and jump versions.
        </p>
      </Panel>
    </>
  );
}

function SkillTab() {
  const s = S.skill.value;
  const props = S.props.value;
  return (
    <>
      <div class="props-title">
        <span class="props-icon">
          <Icon name="swords" size={14} />
        </span>
        <div>
          <strong>{String(s.NAME ?? '')}</strong>
          <span>{s.K_NAME}</span>
        </div>
      </div>
      <Panel title="Skill">
        {S.skillFields.value.map((f) => (
          <label class="prop-row" key={f.key} title={f.hint}>
            <span>{f.label}</span>
            {f.type === 'bool' ? (
              <Switch checked={Boolean(f.value)} label={f.label} onChange={(on) => S.setSkillField(f, on)} />
            ) : (
              <input
                type={f.type === 'num' ? 'number' : 'text'}
                step="any"
                class={`input ${f.type === 'num' ? 'num' : ''}`}
                value={f.value}
                onChange={(e) => S.setSkillField(f, e.currentTarget.value)}
              />
            )}
          </label>
        ))}
      </Panel>
      {S.program.value ? (
        <Panel title="Flags">
          <div class="flags">
            {props.flags.map((p) => (
              <label class="flag" key={p.key} title={p.hint}>
                <input type="checkbox" checked={p.on} onChange={() => S.toggleFlag(p.key)} />
                <span class="flag-name">{p.label}</span>
                <span class="flag-hint">{p.hint}</span>
              </label>
            ))}
          </div>
          {props.numbers.map((p) => (
            <label class="prop-row" key={p.key} title={p.hint}>
              <span>{p.label}</span>
              <input
                type="number"
                step="any"
                class={`input num ${p.set ? '' : 'is-default'}`}
                value={p.value}
                onChange={(e) => S.setPropNumber(p.key, e.currentTarget.value)}
              />
            </label>
          ))}
          <label class="prop-row" title="Variant: while this tag is active, the skill can be used on cooldown.">
            <span>VAR</span>
            <input
              type="text"
              class="input"
              spellcheck={false}
              placeholder="none"
              value={props.variable}
              onChange={(e) => S.setVariable(e.currentTarget.value)}
            />
          </label>
          {props.others.map((o) => (
            <p class="hint" key={o}>
              Also: <code>{o}</code>
            </p>
          ))}
          <p class="hint">
            These are the builder’s own Properties. USE, KEEP, NOSTUN and NOCANCEL are confirmed in-game; the others are
            the guides’ meanings for the builder’s keys.
          </p>
        </Panel>
      ) : (
        <p class="hint pad">A separator: it has no program, only a place in the list.</p>
      )}
    </>
  );
}

const HITS = [
  { id: 'auto', label: 'In range', title: 'Hitboxes and projectiles hit the dummy when it’s inside them' },
  { id: 'always', label: 'Always', title: 'Every hitbox hits' },
  { id: 'never', label: 'Whiff', title: 'Nothing hits' },
];

function CheckRow({ label, checked, onChange, title }) {
  return (
    <label class="prop-row prop-check" title={title}>
      <span>{label}</span>
      <Switch checked={checked} label={label} onChange={onChange} />
    </label>
  );
}

function NumberRow({ label, value, onChange, title, placeholder, max }) {
  return (
    <label class="prop-row" title={title}>
      <span>{label}</span>
      <input
        type="number"
        class="input num"
        min={0}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </label>
  );
}

function SimTab() {
  const c = S.conds.value;
  const d = S.dummy.value;
  const passives = S.skills.value.filter((x) => x.uid !== S.skillUid.value && x.DATA?.Prop?.USE).length;
  return (
    <>
      <div class="props-title">
        <span class="props-icon">
          <Icon name="crosshair" size={14} />
        </span>
        <div>
          <strong>Simulation</strong>
          <span>A model of JJS’s rules, not the game</span>
        </div>
      </div>
      <Panel title="Your character">
        <CheckRow label="In the air" checked={c.AIR} onChange={(v) => S.setCond('AIR', v)} />
        <CheckRow label="Jumping" checked={c.JUMP} onChange={(v) => S.setCond('JUMP', v)} />
        <CheckRow label="Holding the key" checked={c.HOLD} onChange={(v) => S.setCond('HOLD', v)} />
        <CheckRow label="Awakened" checked={c.ULT} onChange={(v) => S.setCond('ULT', v)} />
        <CheckRow
          label="Has a target"
          checked={c.AIM !== false}
          title="The Has Target condition (AIM): facing a player or NPC"
          onChange={(v) => S.setCond('AIM', v)}
        />
        <CheckRow label="In a domain" checked={Boolean(c.DOMAIN)} onChange={(v) => S.setCond('DOMAIN', v)} />
        <NumberRow label="Awakening bar" value={c.BAR} max={100} onChange={(v) => S.setCond('BAR', v)} />
      </Panel>
      <Panel title="Room">
        <NumberRow
          label="Dummy distance"
          value={S.distance.value}
          title="Studs from you to the dummy"
          onChange={S.setDistance}
        />
        <NumberRow
          label="Wall distance"
          value={S.wall.value}
          placeholder="none"
          title="Studs to a wall in front, for projectiles’ On collision branch (empty: no wall; the ground is always there)"
          onChange={S.setWall}
        />
      </Panel>
      <Panel title="Hits">
        <div class="prop-row">
          <span>Hitboxes</span>
          <Segmented label="Hits" options={HITS} value={S.hits.value} onChange={S.setHits} />
        </div>
        <CheckRow
          label="Start from this branch"
          checked={S.fromBranch.value}
          onChange={S.toggleFromBranch}
          title="Play the branch open in the Nodes editor instead of the whole skill"
        />
      </Panel>
      <Panel title="Dummy">
        <CheckRow
          label="In the room"
          checked={d.present !== false}
          onChange={(v) => S.setDummy({ present: v })}
          title="Take the dummy out: nothing can be hit"
        />
        <CheckRow
          label="Blocks"
          checked={Boolean(d.block)}
          onChange={(v) => S.setDummy({ block: v })}
          title="Blocks every blockable hit from the front (360 BLOCK hits are blocked from anywhere)"
        />
        <CheckRow
          label="Counters"
          checked={Boolean(d.counter)}
          onChange={(v) => S.setDummy({ counter: v })}
          title="Counters every hit: it takes nothing and you're stunned"
        />
        <CheckRow
          label="100% evasive"
          checked={Boolean(d.evasive)}
          onChange={(v) => S.setDummy({ evasive: v })}
          title="Bursts out of every combo: a hit while it's stunned is evaded, with a second of IFrames"
        />
      </Panel>
      <Panel title="Timing">
        <label class="prop-row" title="Seconds each node takes before the next runs. JJS's server steps a skill's nodes one after another; the delay isn't in the client, so it's a setting (0 runs them all at once).">
          <span>Delay per node</span>
          <input
            type="number"
            class="input num"
            min={0}
            step="any"
            value={S.nodeDelay.value}
            onChange={(e) => S.setNodeDelay(e.currentTarget.value)}
          />
        </label>
      </Panel>
      <Panel title="Tags & passives">
        <label class="prop-col" title="Tags you already have when the skill starts, one per line: NAME=value">
          <span>Starting tags</span>
          <textarea
            class="input sim-tags"
            rows={3}
            spellcheck={false}
            placeholder={'Stacks=3\nMode=Rage'}
            value={S.simTags.value}
            onChange={(e) => S.setSimTags(e.currentTarget.value)}
          />
        </label>
        <CheckRow
          label={`Run Use When Obtained skills${passives ? ` (${passives})` : ''}`}
          checked={S.runPassives.value}
          onChange={S.toggleRunPassives}
          title="Start the moveset's USE skills (passives) alongside this one: they share your tags and states"
        />
      </Panel>
    </>
  );
}

export function PropertiesEditor() {
  const tab = S.tab.value;
  const s = S.skill.value;
  return (
    <Area name="properties" icon="sliders" title="Properties">
      <div class="props">
        <nav class="props-tabs" role="tablist" aria-label="Properties" aria-orientation="vertical">
          {TABS.map((t) => (
            <button
              type="button"
              role="tab"
              key={t.id}
              aria-selected={tab === t.id}
              title={t.label}
              aria-label={t.label}
              onClick={() => (S.tab.value = t.id)}
            >
              <Icon name={t.icon} size={15} />
            </button>
          ))}
        </nav>
        <div class="props-body">
          {!s && tab !== 'sim' ? (
            <p class="empty pad">Pick a skill in the Outliner.</p>
          ) : tab === 'node' ? (
            <NodeTab />
          ) : tab === 'branch' ? (
            <BranchTab />
          ) : tab === 'skill' ? (
            <SkillTab />
          ) : (
            <SimTab />
          )}
        </div>
      </div>
    </Area>
  );
}
