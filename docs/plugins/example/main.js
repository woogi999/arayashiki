// An example Arayashiki plugin: one of everything the API offers. Copy this
// folder into your plugins folder (Settings → Plugins → Open the plugins
// folder), press Reload plugins, and make it yours. The guide: docs/PLUGINS.md.

// Every node of a skill, with where it is (for problems that open it).
function* nodesOf(skill) {
  const data = skill.DATA ?? {};
  for (const [index, node] of (data.Line ?? []).entries()) yield { node, at: { branch: '', index } };
  for (const [branch, b] of Object.entries(data.Branch && !Array.isArray(data.Branch) ? data.Branch : {}))
    for (const [index, node] of (b.Line ?? []).entries()) yield { node, at: { branch, index } };
}

export function activate(api) {
  // A command: Ctrl+Space → "Count hitboxes", or Ctrl+Alt+H.
  api.commands.register({
    id: 'count-hitboxes',
    title: 'Count hitboxes in the moveset',
    keywords: 'hitbox count stats',
    icon: 'sparkles',
    shortcut: 'Ctrl+Alt+H',
    run: () => {
      let n = 0;
      for (const skill of api.moveset.get()) for (const { node } of nodesOf(skill)) if (node.K_NAME === 'HITBOX') n++;
      const runs = api.storage.get('runs', 0) + 1;
      api.storage.set('runs', runs);
      api.ui.notify(`${n} hitboxes in the moveset. (Counted ${runs} time${runs === 1 ? '' : 's'}.)`);
    },
  });

  // A linter rule: shows in the Problems tab, as you edit.
  api.lint.register({
    id: 'big-damage',
    run: (skills) => {
      const problems = [];
      for (const skill of skills)
        for (const { node, at } of nodesOf(skill))
          if (node.K_NAME === 'HITBOX' && Number(node.DAMAGE) > 40)
            problems.push({
              level: 'tip',
              skill: `${skill.K_NAME}:${skill.NAME}`,
              at,
              message: `This HITBOX does ${node.DAMAGE} damage.`,
              fix: 'Most moves do 5 to 25 a hit; finishers up to about 35.',
            });
      return problems;
    },
  });

  // An AI tool: the assistant (and AI apps over MCP) can call example__damage_table.
  api.tools.register({
    name: 'damage_table',
    title: 'Damage per skill',
    description: 'The total HITBOX damage of every skill in the open moveset (or of the skills whose names contain `name`).',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Only skills whose name contains this.' } } },
    readOnly: true,
    run: ({ name } = {}) =>
      api.moveset
        .get()
        .filter((s) => !name || String(s.NAME).toLowerCase().includes(String(name).toLowerCase()))
        .map((s) => ({
          skill: `${s.K_NAME}:${s.NAME}`,
          damage: [...nodesOf(s)].reduce((sum, { node }) => sum + (node.K_NAME === 'HITBOX' ? Number(node.DAMAGE) || 0 : 0), 0),
        })),
  });

  // A Meter Maker example: in the New dialog.
  api.meter.addExample({
    id: 'thin-bar',
    label: 'Thin bar (plugin)',
    hint: 'A slim bar with a dark track: from the example plugin.',
    make: ({ newDoc, newBar }) =>
      newDoc({
        name: 'Thin bar',
        frames: 20,
        layers: [newBar({ name: 'Bar', x: 64, y: 488, w: 896, h: 48, radius: 24 })],
      }),
  });

  api.log('Loaded.');
}

export function deactivate() {
  // Everything registered through `api` is removed on its own; undo here
  // only what you set up yourself (listeners, timers).
}
