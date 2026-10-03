#!/usr/bin/env node
// sbs: Arayashiki from a terminal. The same answers the MCP server
// gives (agent/tools.js), for agents and people who'd rather run a command.
//
//   sbs decode <code|file> [--text|--json]
//   sbs describe <code|file> [skill] [--all-fx]
//   sbs sim <code|file> [skill] [--always|--never] [--air] [--jump] [--hold]
//           [--ult] [--bar N] [--from BRANCH] [--seed N] [--distance N]
//           [--wall N] [--max N] [--events|--full]
//   sbs validate <code|file>
//   sbs lint <code|file> [skill] [--fast] [--ignore rule,rule]   bugs and tips, like a code linter
//   sbs encode <skills.json>            (a JSON array of skills, or one skill)
//   sbs nodes [KIND]
//   sbs template [CATEGORY]
//   sbs tpl [id] [--values '{"ids":"1 2 3"}']   ready-made skills: list, or build one
//   sbs lib [words…]                    search the move library
//   sbs lib get <slug> [about|nodes|code]
//   sbs docs [words…]                   the handbook: contents, or a section
//   sbs asset <id…> | <code|file> [skill]   name Roblox assets (sounds, pictures)
//   sbs game <words…> [--anim|--sound]   JJS's own animations and sounds, with IDs
//   sbs game --use SET,N                 name an ANIM_USE
//   sbs open <code|file>                show it in the desktop app
//
// A code can also come on stdin: pass "-". Output is JSON unless the
// command's natural answer is text (describe, lib get nodes, docs sections);
// --json forces JSON everywhere.

import fs from 'node:fs';
import * as T from './tools.js';

const argv = process.argv.slice(2);
const flags = new Map();
const words = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (['bar', 'from', 'seed', 'distance', 'wall', 'max', 'name', 'values', 'use'].includes(key)) {
      flags.set(key, next);
      i++;
    } else flags.set(key, true);
  } else words.push(a);
}
const [command, ...rest] = words;
const json = flags.has('json');
const numberFlag = (k) => (flags.has(k) ? Number(flags.get(k)) : undefined);

function codeArg(value) {
  if (value === '-' || (value === undefined && !process.stdin.isTTY)) return fs.readFileSync(0, 'utf8').trim();
  if (!value) throw new Error('Give a code, a file holding one, or "-" for stdin.');
  return value;
}

const out = (value) => {
  if (typeof value === 'string' && !json) process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

async function main() {
  switch (command) {
    case 'decode':
      return out(
        await T.decode({
          code: codeArg(rest[0]),
          detail: flags.has('json') ? 'json' : flags.has('text') ? 'text' : 'overview',
        }).then((r) => (r.text && !json ? r.text : r)),
      );
    case 'describe':
      return out((await T.describe({ code: codeArg(rest[0]), select: rest[1], fold: !flags.has('all-fx') })).text);
    case 'sim':
    case 'simulate': {
      const conditions = {};
      for (const k of ['air', 'jump', 'hold', 'ult']) if (flags.has(k)) conditions[k.toUpperCase()] = true;
      if (flags.has('bar')) conditions.BAR = numberFlag('bar');
      const result = await T.simulateSkill({
        code: codeArg(rest[0]),
        select: rest[1],
        conditions,
        hits: flags.has('always') ? 'always' : flags.has('never') ? 'never' : 'auto',
        start: flags.get('from') ?? '',
        seed: numberFlag('seed'),
        distance: numberFlag('distance'),
        wall: numberFlag('wall') ?? null,
        maxTime: numberFlag('max'),
        detail: flags.has('full') ? 'full' : flags.has('events') ? 'events' : 'summary',
      });
      return out(result);
    }
    case 'validate': {
      const result = await T.validate({ code: codeArg(rest[0]) });
      out(result);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    case 'lint': {
      const ignoreAt = rest.indexOf('--ignore');
      const result = await T.lint({
        code: codeArg(rest[0]),
        select: rest[1] && !rest[1].startsWith('--') ? rest[1] : undefined,
        simulate: !flags.has('fast'),
        ignore: ignoreAt >= 0 ? String(rest[ignoreAt + 1] ?? '').split(',').filter(Boolean) : [],
      });
      out(result);
      process.exitCode = result.errors ? 1 : 0;
      return;
    }
    case 'encode': {
      const data = JSON.parse(
        rest[0] && rest[0] !== '-' ? fs.readFileSync(rest[0], 'utf8') : fs.readFileSync(0, 'utf8'),
      );
      const input = Array.isArray(data)
        ? { skills: data }
        : Array.isArray(data.skills)
          ? { skills: data.skills }
          : { skill: data };
      const { code } = await T.encode(input);
      return json ? out({ code }) : out(code);
    }
    case 'nodes':
      return out(T.nodeReference({ kind: rest[0] }));
    case 'template':
      return out(T.skillTemplate({ category: rest[0], name: rest[1] }));
    case 'tpl':
    case 'templates': {
      const result = await T.buildFromTemplate({
        id: rest[0],
        values: flags.has('values') ? JSON.parse(flags.get('values')) : {},
      });
      return result.code && !json ? out(result.code) : out(result);
    }
    case 'lib':
    case 'library':
      if (rest[0] === 'get') {
        const move = T.getLibraryMove({ slug: rest[1], part: rest[2] ?? 'all' });
        return out(rest[2] && rest[2] !== 'all' && !json ? move[rest[2]] : move);
      }
      return out(T.searchLibrary({ query: rest.join(' ') }));
    case 'docs':
    case 'handbook': {
      const result = T.handbook({ query: rest.join(' ') });
      if (json) return out(result);
      if (result.contents) return out(result.contents.join('\n'));
      return out(result.sections.map((s) => `## ${s.heading}\n\n${s.text}`).join('\n\n') || result.note);
    }
    case 'asset':
    case 'assets':
      return out(
        rest.length && rest.every((r) => /^\d+$/.test(r))
          ? await T.assetInfo({ ids: rest })
          : await T.assetInfo({ code: codeArg(rest[0]), select: rest[1] }),
      );
    case 'game':
      return out(
        T.gameAssetsSearch({
          query: rest.join(' '),
          kind: flags.has('anim') ? 'animation' : flags.has('sound') ? 'sound' : undefined,
          anim_use: flags.has('use') ? String(flags.get('use')).split(',').map(Number) : undefined,
        }),
      );
    case 'open':
      return out(await T.openInApp({ code: codeArg(rest[0]), name: flags.get('name') }));
    default:
      out(
        fs
          .readFileSync(new URL(import.meta.url), 'utf8')
          .split('\n')
          .filter((l) => l.startsWith('//'))
          .slice(1, 23)
          .map((l) => l.slice(3))
          .join('\n'),
      );
      if (command && command !== 'help') process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exitCode = 1;
});
