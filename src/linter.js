// The linter in the app (the Problems tab): the moveset checked as you edit
// it, like a code editor's linter, with agent/tools-core.js lint (the same
// checks the MCP tool and `sbs lint` run). As you type it runs the quick
// checks; "Check with the simulator" runs every skill too (combos, loops).
// A problem opens its skill, branch and node.
import { batch, effect, signal } from '@preact/signals';
import * as S from './store.js';

const KEY = 'arayashiki-lint';
const read = () => {
  try {
    return { ignore: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ignore: [] };
  }
};

/** { problems, errors, warnings, infos, tips, full } or null before the first check. */
export const lintResult = signal(null);
export const linting = signal(false);
export const lintPrefs = signal(read());
export const lintFilter = signal('all'); // 'all' | 'error' | 'warning' | 'info' | 'tip'

const keep = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(lintPrefs.peek()));
  } catch {
    // not kept
  }
};

let tools = null;
const core = () => (tools ??= import('../agent/tools-core.js'));
let version = 0;

/** Checks the open moveset; `full` runs the simulator too. */
export async function runLint({ full = false } = {}) {
  const mine = ++version;
  linting.value = true;
  try {
    const { lint } = await core();
    const skills = S.skills.peek().map(({ uid: _uid, ...s }) => s);
    const out = await lint({ skills, simulate: full, ignore: lintPrefs.peek().ignore });
    // Plugins' rules (src/plugins.js), after the built-in ones.
    const { pluginLintRules } = await import('./plugins.js');
    const ignored = lintPrefs.peek().ignore;
    for (const rule of pluginLintRules.peek()) {
      if (ignored.includes(rule.id)) continue;
      try {
        for (const p of (await rule.run(structuredClone(skills))) ?? []) {
          const level = ['error', 'warning', 'info', 'tip'].includes(p.level) ? p.level : 'warning';
          out.problems.push({ ...p, level, rule: rule.id, message: String(p.message ?? '') });
          out[{ error: 'errors', warning: 'warnings', info: 'infos', tip: 'tips' }[level]]++;
        }
      } catch (e) {
        out.problems.push({ level: 'warning', rule: rule.id, message: `This plugin rule stopped: ${e?.message ?? e}` });
        out.warnings++;
      }
    }
    const ORDER = { error: 0, warning: 1, info: 2, tip: 3 };
    out.problems.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
    if (mine === version) lintResult.value = { ...out, full };
  } catch (e) {
    if (mine === version) lintResult.value = { problems: [{ level: 'error', rule: 'linter', message: `The linter stopped: ${e?.message ?? e}` }], errors: 1, warnings: 0, infos: 0, tips: 0, full };
  } finally {
    if (mine === version) linting.value = false;
  }
}

// As you edit: the quick checks, a moment after the last change.
let timer = 0;
effect(() => {
  S.skills.value;
  clearTimeout(timer);
  timer = setTimeout(() => runLint(), 500);
});

/** Opens the problem's skill, branch and node. */
export function goToProblem(p) {
  const [category, ...rest] = String(p.skill ?? '').split(':');
  const name = rest.join(':');
  const skill = S.skills.peek().find((s) => s.K_NAME === category && s.NAME === name);
  if (!skill) return;
  S.workspace.value = 'skills';
  S.showStart.value = false;
  S.pickSkill(skill.uid);
  if (!p.at) return;
  batch(() => {
    if (p.at.branch === '' || S.branches.peek().includes(p.at.branch)) S.branch.value = p.at.branch;
    if (p.at.index !== undefined) S.pickNode(p.at.index);
    S.tab.value = 'node';
  });
}

/** Stops reporting a rule (Settings… or the row's "ignore"), or reports it again. */
export function ignoreRule(rule, on = true) {
  const ignore = new Set(lintPrefs.peek().ignore);
  if (on) ignore.add(rule);
  else ignore.delete(rule);
  lintPrefs.value = { ...lintPrefs.peek(), ignore: [...ignore] };
  keep();
  runLint({ full: lintResult.peek()?.full });
}

export function showProblems() {
  S.workspace.value = 'skills';
  S.showStart.value = false;
  S.bottomTab.value = 'problems';
}
