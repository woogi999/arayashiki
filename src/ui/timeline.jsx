// The bottom editor, like Blender's Timeline: the transport in its header
// and the frame meter below; switch it to the Log to read what happened,
// step by step.
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { IconButton, Segmented } from './controls.jsx';
import { Area } from './area.jsx';
import { FrameMeter } from './meter.jsx';
import { Problems, ProblemsTools } from './problems.jsx';
import { lintResult } from '../linter.js';

function TimeReadout() {
  const t = S.time.value;
  return (
    <span class="time-readout num">
      <span class="time-frame">{Math.round(t * 60)}</span>
      <span class="time-now">{t.toFixed(2)}s</span>
      <span class="time-total">/ {S.duration.value.toFixed(2)}s</span>
    </span>
  );
}

const SPEEDS = [
  { id: 1, label: '1×' },
  { id: 0.5, label: '½×' },
  { id: 0.25, label: '¼×' },
];
const EDITORS = [
  { id: 'timeline', label: 'Timeline', icon: 'clock' },
  { id: 'log', label: 'Log', icon: 'file-text' },
  { id: 'problems', label: 'Problems', icon: 'warning' },
];

function Log() {
  const rows = S.logRows.value;
  const passed = S.pastCount.value;
  const warnings = S.run.value?.warnings ?? [];
  return (
    <ol class="log" aria-label="What happened">
      {warnings.map((w) => (
        <li key={w} class="log-warn">
          <Icon name="warning" size={13} />
          <span>{w}</span>
        </li>
      ))}
      {rows.map((l) => (
        <li key={l.i} class={`${l.i < passed ? 'is-past' : ''} is-${l.who}`}>
          <button type="button" onClick={() => S.jumpTo(l)}>
            <span class="log-t num">{l.t.toFixed(2)}</span>
            <span class="log-who">{l.who === 'user' ? 'You' : 'Dummy'}</span>
            <span class="log-text">{l.text}</span>
            <span class="log-at">{l.place}</span>
          </button>
        </li>
      ))}
      {!rows.length && !warnings.length && <li class="empty pad">Play a skill to see what it does, step by step.</li>}
    </ol>
  );
}

export function Timeline() {
  const can = Boolean(S.run.value);
  const r = lintResult.value;
  const bad = r ? r.errors + r.warnings : 0;
  const editors = EDITORS.map((e) => (e.id === 'problems' && bad ? { ...e, label: `Problems ${bad}` } : e));
  const pick = <Segmented label="Editor" options={editors} value={S.bottomTab.value} onChange={(v) => (S.bottomTab.value = v)} />;
  if (S.bottomTab.value === 'problems')
    return (
      <Area
        name="time"
        icon="warning"
        title=""
        tools={
          <>
            {pick}
            <span class="head-sep" />
            <ProblemsTools />
          </>
        }
      >
        <Problems />
      </Area>
    );
  const tools = (
    <>
      {pick}
      <span class="head-sep" />
      <IconButton icon="skip-back" label="Back to the start" size={14} disabled={!can} onClick={() => S.seek(0)} />
      <IconButton
        icon="step-back"
        label="Back one frame"
        title="Back one frame (←)"
        size={14}
        disabled={!can}
        onClick={() => S.stepFrames(-1)}
      />
      <button
        type="button"
        class="play-btn"
        aria-label={S.playing.value ? 'Pause' : 'Play'}
        title="Play or pause (Space)"
        disabled={!can}
        onClick={S.play}
      >
        <Icon name={S.playing.value ? 'pause' : 'play'} size={14} />
      </button>
      <IconButton
        icon="step-forward"
        label="Forward one frame"
        title="Forward one frame (→)"
        size={14}
        disabled={!can}
        onClick={() => S.stepFrames(1)}
      />
      <IconButton
        icon="skip-forward"
        label="To the end"
        size={14}
        disabled={!can}
        onClick={() => S.seek(S.duration.value)}
      />
      <TimeReadout />
      <span class="spacer" />
      <Segmented label="Speed" options={SPEEDS} value={S.speed.value} onChange={(v) => (S.speed.value = v)} />
    </>
  );
  return (
    <Area name="time" icon={S.bottomTab.value === 'log' ? 'file-text' : 'clock'} title="" tools={tools}>
      {S.bottomTab.value === 'log' ? <Log /> : <FrameMeter />}
    </Area>
  );
}
