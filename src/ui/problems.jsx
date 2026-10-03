// The Problems tab (beside the Timeline and the Log): what the linter
// (src/linter.js) finds in the moveset, worst first, like a code editor's
// problems panel. Click one to open its node.
import { Icon } from '../icons.jsx';
import { Button, IconButton, Segmented } from './controls.jsx';
import { goToProblem, ignoreRule, lintFilter, lintPrefs, lintResult, linting, runLint } from '../linter.js';

const COUNT = { error: 'errors', warning: 'warnings', info: 'infos', tip: 'tips' };
const LEVELS = {
  error: { icon: 'warning', label: 'Error', plural: 'Errors' },
  warning: { icon: 'warning', label: 'Warning', plural: 'Warnings' },
  info: { icon: 'info', label: 'Info', plural: 'Info' },
  tip: { icon: 'sparkles', label: 'Tip', plural: 'Tips' },
};

export function ProblemsTools() {
  const r = lintResult.value;
  const options = [
    { id: 'all', label: `All ${r ? r.problems.length : ''}`.trim() },
    ...['error', 'warning', 'info', 'tip'].map((l) => ({ id: l, label: `${LEVELS[l].plural} ${r ? r[COUNT[l]] : ''}`.trim() })),
  ];
  return (
    <>
      <Segmented label="Show" options={options} value={lintFilter.value} onChange={(v) => (lintFilter.value = v)} />
      <span class="spacer" />
      <Button icon={linting.value ? 'loader' : 'play'} class="head-collapse" aria-label="Check with the simulator" disabled={linting.value} onClick={() => runLint({ full: true })} title="Also run every skill in the simulator: combos the dummy escapes, endless loops, cameras that overlap">
        Check with the simulator
      </Button>
    </>
  );
}

export function Problems() {
  const r = lintResult.value;
  const filter = lintFilter.value;
  const shown = (r?.problems ?? []).filter((p) => filter === 'all' || p.level === filter);
  const ignored = lintPrefs.value.ignore;
  return (
    <div class="problems">
      {r && (
        <p class="problems-summary hint">
          {r.problems.length ? `${r.errors} errors, ${r.warnings} warnings, ${r.infos} info, ${r.tips} tips` : 'No problems found.'}
          {r.full ? ' (with the simulator)' : ' (quick check; the simulator’s checks run with the button)'}
          {ignored.length > 0 && (
            <>
              {' · Ignoring '}
              {ignored.map((rule) => (
                <button type="button" class="link" key={rule} title="Report it again" onClick={() => ignoreRule(rule, false)}>
                  {rule}
                </button>
              ))}
            </>
          )}
        </p>
      )}
      <ol class="problems-list" aria-label="Problems">
        {shown.map((p, i) => (
          <li key={i} class={`problem is-${p.level}`}>
            <button type="button" class="problem-main" onClick={() => goToProblem(p)} title={p.skill ? 'Open its node' : undefined}>
              <Icon name={LEVELS[p.level]?.icon ?? 'info'} size={13} />
              <span class="problem-text">
                <span class="problem-message">{p.message}</span>
                {p.fix && <span class="problem-fix">{p.fix}</span>}
              </span>
              <span class="problem-where num">
                {p.skill ?? ''}
                {p.at ? ` · ${p.at.branch || 'Default'}${p.at.index !== undefined ? ` #${p.at.index + 1}` : ''}` : ''}
              </span>
              <span class="problem-rule num">{p.rule}</span>
            </button>
            {p.rule && !['validate', 'linter'].includes(p.rule) && (
              <IconButton icon="eye-off" size={12} label={`Ignore “${p.rule}” problems`} onClick={() => ignoreRule(p.rule)} />
            )}
          </li>
        ))}
        {r && !shown.length && <li class="empty pad">{r.problems.length ? 'Nothing at this level.' : 'Nothing to fix. Nice.'}</li>}
        {!r && <li class="empty pad">Checking…</li>}
      </ol>
    </div>
  );
}
