// The AI-facing layer: agent/tools.js directly, then the MCP server over
// stdio the way a client talks to it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as T from '../agent/tools.js';
import { decodeMoveset } from '../core/format.js';
import { CHARACTER_1, CHARACTER_2 } from './fixtures/jjs-characters.js';

describe('agent tools', () => {
  it('decode: an overview, text, or editable JSON', async () => {
    const overview = await T.decode({ code: CHARACTER_2 });
    assert.equal(overview.count, 20);
    assert.deepEqual(overview.categories, { SKILL: 13, SPECIAL: 1, AWAKENING: 1, MELEE: 4, CHASE: 1 });
    assert.ok(overview.skills.find((s) => s.name === '----BASE----').separator);
    const { skills } = await T.decode({ code: CHARACTER_2, detail: 'json' });
    assert.equal(typeof skills[0].DATA, 'object');
    assert.match((await T.decode({ code: CHARACTER_1, detail: 'text' })).text, /### MELEE: "1"/);
  });

  it('encode takes decoded JSON back to an identical moveset', async () => {
    const { skills } = await T.decode({ code: CHARACTER_2, detail: 'json' });
    const { code } = await T.encode({ skills });
    const strip = (list) => list.map(({ uid: _uid, ...s }) => s);
    assert.deepEqual(strip(await decodeMoveset(code)), strip(await decodeMoveset(CHARACTER_2)));
    // DATA as JJS's own string works too.
    const raw = JSON.parse(JSON.stringify(skills[4]));
    raw.DATA = JSON.stringify(raw.DATA);
    assert.ok((await T.encode({ skill: raw })).code.startsWith('KLUv'));
  });

  it('simulate: by name, with conditions, as the app plays it', async () => {
    const air = await T.simulateSkill({ code: CHARACTER_1, select: 'MELEE:4', conditions: { AIR: true } });
    assert.ok(air.branches_run.you.includes('Downslam'));
    const hit = await T.simulateSkill({ code: CHARACTER_1, select: 'MELEE:1', hits: 'always', detail: 'events' });
    assert.ok(hit.outcome.hits >= 1 && hit.outcome.dummy_hp < 100);
    assert.ok(hit.branches_run.dummy.includes('OnHitTarget'));
    assert.ok(hit.events.some((e) => e.kind === 'HIT'));
    await assert.rejects(T.simulateSkill({ code: CHARACTER_1 }), /Several skills/);
  });

  it('validate: clean fixtures pass; typos are caught', async () => {
    const report = await T.validate({ code: CHARACTER_1 });
    assert.ok(report.ok && report.lossless);
    const skill = {
      NAME: 'Typo',
      K_NAME: 'SKILL',
      DATA: {
        Req: [],
        Prop: {},
        Line: [
          { K_NAME: 'BRANCH', BRANCH: 'Lanch' },
          { K_NAME: 'WAIT', TIME: 'soon' },
        ],
        Branch: { Launch: { Req: [], Line: [] } },
      },
    };
    const bad = await T.validate({ skill });
    assert.ok(bad.issues.some((i) => /did you mean "Launch"/.test(i.message)));
    assert.ok(bad.issues.some((i) => /TIME should be a number/.test(i.message)));
  });

  it('reference, library and handbook', () => {
    assert.equal(T.nodeReference({ kind: 'VELOCITY' }).kind, 'VELO');
    assert.ok(T.nodeReference().nodes.length >= 21);
    assert.equal(T.skillTemplate({ category: 'melee' }).skill.K_NAME, 'MELEE');
    const found = T.searchLibrary({ query: 'grab slam' });
    assert.ok(found.moves.some((m) => m.slug === 'move-grab-launch-slam'));
    const move = T.getLibraryMove({ slug: 'move-dropkick', part: 'code' });
    assert.ok(move.code.startsWith('KLUv'));
    assert.ok(T.handbook().contents.length > 30);
    assert.match(T.handbook({ query: 'code format' }).sections[0].heading, /code format/i);
  });
});

describe('MCP server', () => {
  it('lists its tools and answers over stdio', async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['agent/mcp-server.js'] }));
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      for (const name of [
        'decode',
        'describe',
        'simulate',
        'validate',
        'encode',
        'node_reference',
        'search_library',
        'get_library_move',
        'handbook',
        'asset_info',
        'open_in_app',
        'build_template',
      ])
        assert.ok(names.includes(name), name);
      const result = await client.callTool({
        name: 'simulate',
        arguments: { code: CHARACTER_1, select: 'MELEE:1', hits: 'always' },
      });
      const run = JSON.parse(result.content[0].text);
      assert.ok(run.outcome.hits >= 1);
      const error = await client.callTool({ name: 'decode', arguments: { code: 'nonsense' } });
      assert.ok(error.isError);
      const { resources } = await client.listResources();
      assert.ok(resources.some((r) => r.name === 'handbook'));
    } finally {
      await client.close();
    }
  });
});

describe('the app MCP manifest', () => {
  it('src-tauri/mcp-manifest.json matches agent/tool-defs.js (run node lib/mcp-manifest.mjs)', async () => {
    const fs = await import('node:fs');
    const { MANIFEST, manifestText } = await import('../lib/mcp-manifest.mjs');
    assert.equal(fs.readFileSync(MANIFEST, 'utf8').replace(/\r\n/g, '\n'), manifestText());
  });
});
