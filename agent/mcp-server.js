#!/usr/bin/env node
// Arayashiki's MCP server (stdio): the engine, the handbook and the
// move library as tools, so an AI can read, check, simulate and write JJS
// skills without the desktop app. Registered for this repo in .mcp.json;
// elsewhere: `node <repo>/agent/mcp-server.js`. Every tool is a thin
// wrapper over agent/tools.js, which the CLI (agent/cli.js) shares.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import * as T from './tools.js';
import { APP_TOOLS, ENGINE_TOOLS } from './tool-defs.js';
import { callApp } from './app-bridge.js';

const pkg = JSON.parse(fs.readFileSync(path.join(T.ROOT, 'package.json'), 'utf8'));

const server = new McpServer(
  { name: 'arayashiki', version: pkg.version },
  {
    instructions: [
      'Arayashiki: Jujutsu Shenanigans (Roblox) Skill Builder skills. A "code" is the text JJS copies out (base64 of zstd JSON, starts "KLUv/"); a path to a .txt holding one works too.',
      'Typical flow: decode (overview) → describe or simulate one skill (select by name, "CATEGORY:NAME" or index) → edit the JSON from decode detail "json" → encode → validate.',
      'Building a new move: work out what it should do first, then look at real moves that do similar things (search_library, get_library_move) as references for how JJS does it and the usual numbers. Design the move that was asked for, don\'t just copy the nearest one. node_reference for fields; simulate and lint before you hand it over.',
      "The simulator is a model of JJS's rules read from real exports, not the game: timings and damage are close, not exact. The handbook says what is confirmed and what is inferred.",
      'The app_* tools work on the desktop app the user has open: app_state to see what is open, app_get_skills / app_put_skills to edit the moveset in place (undoable), app_simulate and app_playback to run it, app_screenshot to look at it, app_export_video to render it, app_animate to keyframe a VISUAL or camera.',
    ].join('\n'),
  },
);

// ─── Tools (agent/tool-defs.js) ─────────────────────────────────────────

const reply = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }],
});
const safely = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error?.message ?? String(error) }] };
  }
};

for (const t of ENGINE_TOOLS)
  server.registerTool(
    t.name,
    { title: t.title, description: t.description, inputSchema: t.shape, annotations: { readOnlyHint: Boolean(t.readOnly), ...(t.openWorld ? { openWorldHint: true } : {}) } },
    safely(async (a) => reply(await t.run(T, a))),
  );

// The running app's tools, through its bridge (agent/app-bridge.js): the
// app is started if it isn't open.
for (const t of APP_TOOLS)
  server.registerTool(
    t.name,
    {
      title: t.title,
      description: `${t.description} (Works on the Arayashiki desktop app, starting it if needed.)`,
      inputSchema: t.shape,
      annotations: { readOnlyHint: Boolean(t.readOnly) },
    },
    safely(async (a) => {
      const r = await callApp(t.name, a);
      return { content: r.content ?? [{ type: 'text', text: JSON.stringify(r.result, null, 1) }] };
    }),
  );

server.registerTool(
  'open_in_app',
  {
    title: 'Show skills in the desktop app',
    description:
      'Opens skills in the Arayashiki desktop app as a new moveset so the user can see, play and edit them (a running app takes them in). To change the open moveset instead, use app_put_skills.',
    inputSchema: {
      code: z.string().optional(),
      skills: z.array(z.record(z.string(), z.any())).optional(),
      skill: z.record(z.string(), z.any()).optional(),
      name: z.string().optional().describe('The moveset name to show.'),
    },
  },
  safely(async (a) => reply(await T.openInApp(a))),
);

// ─── Resources ──────────────────────────────────────────────────────────
const doc = (name, file, description) =>
  server.registerResource(
    name,
    `arayashiki://docs/${file}`,
    { description, mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: fs.readFileSync(path.join(T.ROOT, 'docs', file), 'utf8') },
      ],
    }),
  );
doc('handbook', 'jjs-skill-builder.md', 'The whole JJS Skill Builder handbook (large: prefer the handbook tool).');
doc(
  'library-index',
  'jjs-library/README.md',
  "The move library's index: moves by what they do, and the usual numbers.",
);
doc('agent-guide', 'ai/README.md', 'How agents use Arayashiki: the tools, the CLI and the usual workflows.');

await server.connect(new StdioServerTransport());
