// Reads the Skill Builder's own tables out of Jujutsu Shenanigans, open in
// Roblox Studio, and writes what Arayashiki knows from them:
//
//   core/gamedata.js            every node kind's fields, types, defaults and
//                               tooltips (SkillDefault); the builder's lists
//                               (moves, specials, states, attack types,
//                               characters, the ANIM_USE table: ListData); and
//                               what each VISUAL effect reads (BuilderFX)
//   docs/jjs-game/animations.json   every Animation in the game, with its ID
//   docs/jjs-game/sounds.json       every Sound in the game, with its ID
//
// Needs Studio open on a JJS place with its MCP server on (Assistant →
// MCP servers). Run: npm run game-data
import { writeFileSync, mkdirSync } from 'node:fs';
import { connect } from './studio-mcp.mjs';

const root = new URL('../', import.meta.url);
const NIL = '__nil__';

const TABLES = `
local HS = game:GetService("HttpService")
local RS = game.ReplicatedStorage
local SD = require(RS.Modules.SkillDefault)
local LD = require(RS.Modules.ListData)
local out = { kinds = {}, order = {}, prop = SD.defaultProp, states = LD.States, attackTypes = LD.AttackTypes,
  characters = LD.Characters, moves = {}, specials = {}, anims = {}, place = game.PlaceId, name = game.Name }
for kind, fields in pairs(SD.LineItems) do
  local list = {}
  for _, f in ipairs(fields) do
    local def = f[3]
    if def == math.huge then def = 1e38 end
    if def == nil then def = "${NIL}" end
    table.insert(list, { key = f[1], type = f[2], def = def, desc = f.Desc })
  end
  out.kinds[kind] = list
end
for _, set in ipairs(LD.MoveList) do
  local c = set[1][2]
  local entry = { name = set[1][1], color = { math.round(c.R * 255), math.round(c.G * 255), math.round(c.B * 255) }, moves = {} }
  for i = 2, #set do table.insert(entry.moves, set[i]) end
  table.insert(out.moves, entry)
end
for k, v in pairs(LD.SpecialList) do table.insert(out.specials, { k, v }) end
for s, set in ipairs(LD.AnimList) do
  local list = {}
  for _, a in ipairs(set) do
    table.insert(list, { (a:GetFullName():gsub("^ReplicatedStorage%.Animations%.", "")), (a.AnimationId:match("%d+") or "") })
  end
  out.anims[s] = list
end
`;

const ASSETS = `
local HS = game:GetService("HttpService")
local out = { animations = {}, sounds = {} }
for _, d in ipairs(game.ReplicatedStorage.Animations:GetDescendants()) do
  if d:IsA("Animation") then
    table.insert(out.animations, { (d:GetFullName():gsub("^ReplicatedStorage%.Animations%.", "")), (d.AnimationId:match("%d+") or "") })
  end
end
for _, svc in ipairs({ game.ReplicatedStorage, game.SoundService, game.Workspace, game.StarterPlayer, game.StarterGui, game.ReplicatedFirst }) do
  for _, d in ipairs(svc:GetDescendants()) do
    if d:IsA("Sound") then
      table.insert(out.sounds, { d:GetFullName(), (d.SoundId:match("%d+") or ""), math.round(d.Volume * 100) / 100 })
    end
  end
end
`;

// What each BuilderFX effect reads and where it is placed, from its source:
//   origin "effect": POSITION and ALT POSITION from the effect's own frame
//                    (Sphere, Mesh, Block…: the end is start · POSITION · ALT)
//   origin "part":   from the body part (particles on an attachment: the end
//                    is part · POSITION · ALT, in the part's axes)
//   origin "weld":   a weld's C0, in Roblox's raw axes (Slash, Whirl Slash)
//   screen: only the character it runs on sees it, on their own screen
function effectsOf(source) {
  const lines = source.split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(?:function t_2\.(\w+)|t_2\["([^"]+)"\] = function)/) || l.match(/^ {4}(Cancel) = function/);
    if (m) starts.push([i, m[1] || m[2] || m[3]]);
  });
  const effects = {};
  starts.forEach(([at, name], k) => {
    const body = lines.slice(at, (starts[k + 1] ?? [lines.length])[0]).join('\n');
    const fields = new Set();
    for (const m of body.matchAll(/arg\d+(?:\.([A-Z][A-Z0-9_]*)|\["([A-Z][A-Z0-9 ]*)"\])/g)) fields.add(m[1] || m[2]);
    for (const drop of ['RELATIVE', 'H']) fields.delete(drop);
    const from = body.match(/getPos\(([^,]+),/)?.[1] ?? '';
    const origin = /Weld\.C0 = New\(|C0 = CFrame\.new\(\s*if not ALTPOSITION/.test(body)
      ? 'weld'
      : /^v\d+$/.test(from)
        ? 'effect'
        : /HumanoidRootPart/.test(from)
          ? 'part'
          : 'none';
    const template = body
      .match(/BuilderFX((?:\.[A-Za-z0-9_]+)+)/)?.[1]
      ?.replace('.Parent', 'Utils')
      .replace(/^\./, 'Utils.BuilderFX.');
    effects[name] = {
      fields: [...fields].sort(),
      origin,
      ...(template ? { template } : {}),
      ...(/LocalPlayer\.Character == arg/.test(body) ? { screen: true } : {}),
    };
  });
  return effects;
}

const TYPES = {
  1: 'bool',
  2: 'num',
  3: 'str',
  4: 'pair',
  5: 'vec3',
  6: 'color',
  7: 'pair',
  8: 'str',
  9: 'seq',
  10: 'colorseq',
  11: 'range',
};

const studio = await connect();
console.log(`Studio: ${studio.studio.name}`);
try {
  const t = JSON.parse(await studio.big(TABLES, 'HS:JSONEncode(out)'));
  const a = JSON.parse(await studio.big(ASSETS, 'HS:JSONEncode(out)'));
  const fxSource = await studio.big('', 'game.ReplicatedStorage.Modules.BuilderFX.Source');

  const kinds = {};
  for (const kind of Object.keys(t.kinds).sort())
    kinds[kind] = t.kinds[kind].map((f) => ({
      key: f.key,
      type: TYPES[f.type] ?? 'str',
      code: f.type,
      def: f.def === NIL ? null : f.def,
      ...(f.desc ? { desc: f.desc } : {}),
    }));
  const anims = t.anims.map((set) => {
    const [first] = set;
    const character = first?.[0].startsWith('Megumi.Mahoraga') ? 'Mahoraga' : first?.[0].split('.')[0];
    return { character, anims: set.map(([path, id]) => [path.replace(/^Megumi\.Mahoraga\./, 'Mahoraga.'), id]) };
  });
  const effects = effectsOf(fxSource);
  const data = {
    NODE_DEFAULTS: kinds,
    PROP_DEFAULTS: t.prop,
    STATES: t.states,
    ATTACK_TYPES: t.attackTypes,
    CHARACTERS: t.characters,
    MOVES: t.moves,
    SPECIALS: Object.fromEntries(t.specials.sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]))),
    EFFECTS: Object.fromEntries(Object.entries(effects).sort(([x], [y]) => x.localeCompare(y))),
    ANIM_SETS: anims,
  };
  const header = `// Generated by lib/extract-jjs-game.mjs from Jujutsu Shenanigans' own
// Skill Builder tables (read in Roblox Studio, ${new Date().toISOString().slice(0, 10)}): don't edit by hand,
// run \`npm run game-data\` with the game open in Studio.
//
//   NODE_DEFAULTS  SkillDefault.LineItems: each node kind's fields in the
//                  builder's order, with its type, default and tooltip. A
//                  field a node leaves out takes this default (null: unset).
//   PROP_DEFAULTS  SkillDefault.defaultProp: a skill's Properties.
//   STATES, ATTACK_TYPES, CHARACTERS, MOVES, SPECIALS: ListData's lists.
//   EFFECTS        BuilderFX: each VISUAL effect, the fields it reads, where
//                  it is placed from (see lib/extract-jjs-game.mjs).
//   ANIM_SETS      ListData.AnimList: ANIM_USE [set, n] is ANIM_SETS[set-1]
//                  .anims[n-1], as [path under ReplicatedStorage.Animations,
//                  animation ID].
`;
  const body = Object.entries(data)
    .map(([k, v]) => `export const ${k} = ${JSON.stringify(v, null, 1)};\n`)
    .join('\n');
  writeFileSync(new URL('core/gamedata.js', root), `${header}\n${body}`);

  mkdirSync(new URL('docs/jjs-game/', root), { recursive: true });
  const byPath = (x, y) => x[0].localeCompare(y[0]);
  writeFileSync(
    new URL('docs/jjs-game/animations.json', root),
    `${JSON.stringify(
      a.animations.sort(byPath).map(([path, id]) => ({ path, id })),
      null,
      1,
    )}\n`,
  );
  writeFileSync(
    new URL('docs/jjs-game/sounds.json', root),
    `${JSON.stringify(
      a.sounds.sort(byPath).map(([path, id, volume]) => ({ path, id, volume })),
      null,
      1,
    )}\n`,
  );
  console.log(
    `${Object.keys(kinds).length} node kinds, ${Object.keys(effects).length} effects, ${anims.reduce((n, s) => n + s.anims.length, 0)} ANIM_USE entries, ${a.animations.length} animations, ${a.sounds.length} sounds`,
  );
} finally {
  studio.close();
}
