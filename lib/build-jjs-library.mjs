// Builds docs/jjs-library/: one file per ready-made JJS Skill Builder move, from
// the real exports in data/exports/ (gitignored, so this only runs where
// they are). Each file has a hand-written top (what the move does, how, when to
// reach for it), which this keeps, and a generated bottom (a readable timeline of
// every node, and the exact code), which this rewrites.
//
//   npm run library
//
// Add a move: add an entry to ENTRIES, run this, then write its top.

/* eslint-disable n/no-unsupported-features/node-builtins -- zstd (the export format) needs Node 22.15+ */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { describeSkill } from '../core/describe.js';

const DATA_DIR = 'data/exports';
const OUT = 'docs/jjs-library';
const MARK =
  '<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->';

// ─── What's in the library ──────────────────────────────────────────────
// skills: [K_NAME, NAME] pairs, taken from `file` in this order.
// branches: show only these branches' nodes (the rest are listed by name).
const M = (n) => ['MELEE', String(n)];
const ENTRIES = [
  // M1 strings
  {
    slug: 'm1-string-base-game',
    title: 'M1 string: base-game timing',
    file: 'accurate-m1s-gon-freeccs.txt',
    skills: [M(1), M(2), M(3), M(4)],
  },
  {
    slug: 'm1-string-chase-cancel',
    title: 'M1 string: cancels the chase into a punch',
    file: 'character2.txt',
    skills: [M(1), M(2), M(3), M(4)],
  },
  {
    slug: 'm1-string-sets-tags',
    title: 'M1 string: hits feed other skills (tags)',
    file: 'character1.txt',
    skills: [M(1), M(2), M(3), M(4)],
  },
  {
    slug: 'm1-string-katana',
    title: 'M1 string: katana, drawn on the first swing',
    file: 'auto-sheathing.txt',
    skills: [M(1), M(2), M(3)],
  },
  // Chases (dashes)
  {
    slug: 'chase-base-game-with-blink',
    title: 'Chase: base-game dash, with a sidestep blink variant',
    file: 'accurate-m1s-gon-freeccs.txt',
    skills: [['CHASE', 'Chase']],
  },
  {
    slug: 'chase-with-run-and-awakened',
    title: 'Chase: dash into a run, awakened version',
    file: 'character2.txt',
    skills: [['CHASE', 'Chase']],
  },
  {
    slug: 'chase-simple',
    title: 'Chase: short dash with a hit check',
    file: 'character1.txt',
    skills: [['CHASE', 'Wild Assault']],
  },
  // Moves
  {
    slug: 'move-leap-and-slam-use-twice',
    title: 'Rush punch, then a second use that leaps up and slams down',
    file: 'character2.txt',
    skills: [['SKILL', 'Double Strike']],
  },
  {
    slug: 'move-grab-launch-slam',
    title: 'Grab, launch up, jump after them, slam down',
    file: 'character1.txt',
    skills: [['SKILL', 'Overhead Kiss']],
  },
  {
    slug: 'move-uppercut-carry',
    title: 'Uppercut that carries them up, then knocks them away',
    file: 'character2.txt',
    skills: [['SKILL', 'Get a Job!']],
  },
  {
    slug: 'move-dash-strike-jump-variant',
    title: 'Dash strike, with an upward version when jumping',
    file: 'character1.txt',
    skills: [['SKILL', 'Totsugeki!']],
  },
  {
    slug: 'move-dropkick',
    title: 'Wind-up, flying dropkick, pin and kick away',
    file: 'character2.txt',
    skills: [['SKILL', 'Anti-Esper Dropkick']],
  },
  {
    slug: 'move-charge-punch-finisher',
    title: 'Lunging punch with a finisher variant',
    file: 'character2.txt',
    skills: [['SKILL', 'Eat fist, Mascot!']],
  },
  {
    slug: 'move-close-or-far-rush',
    title: 'Close: rapid-hit rush with a finisher cutscene. Far: lunge',
    file: 'character2.txt',
    skills: [['SKILL', 'Table Salt Exorcism']],
  },
  {
    slug: 'move-walking-barrage-with-dodge',
    title: 'Hold to walk forward (dodging hits), then a barrage',
    file: 'character2.txt',
    skills: [['SKILL', 'Self Defense Rush']],
  },
  {
    slug: 'move-command-grab-cutscene',
    title: 'Command grab: hold them by the head, then blast them away',
    file: 'character2.txt',
    skills: [['SKILL', 'Take Off Your Mask']],
  },
  {
    slug: 'move-spinning-aoe',
    title: 'Spinning area attack that walks forward',
    file: 'character1.txt',
    skills: [['SKILL', 'Ultimate Spinning Whirlwind']],
  },
  {
    slug: 'move-aimed-bouncing-projectile',
    title: 'Summoned projectile aimed at the last one hit, bouncing',
    file: 'character1.txt',
    skills: [['SKILL', 'Arisugawa Sparkle']],
  },
  {
    slug: 'move-dash-grab-launch-special',
    title: 'Special: dash, grab, launch, and hand back to the M1s',
    file: 'character1.txt',
    skills: [['SPECIAL', 'Special']],
  },
  {
    slug: 'move-projectile-possess',
    title: 'Special: a homing projectile whose hit takes over the target',
    file: 'character2.txt',
    skills: [['SPECIAL', 'Assist']],
  },
  {
    slug: 'move-afterimage-dodge',
    title: 'Flickering afterimage dodge (i-frames)',
    file: 'needs-fixing.txt',
    skills: [['SKILL', 'Misdirection']],
  },
  {
    slug: 'move-charge-with-stances',
    title: 'Hold to charge, then one of three stances (resource cost)',
    file: 'needs-fixing.txt',
    skills: [['SKILL', 'Jajanken [Block to Swap]']],
    branches: [
      'ShowCheck',
      'ShowRock',
      'ChargeSkill',
      'JajankenCheck',
      'RockCheck',
      'RockClose',
      'Paper',
      'Cancel',
      'NotEnoughNen',
      'RockTarget',
    ],
  },
  {
    slug: 'move-katana-slash-with-stacks',
    title: 'Slash that builds stacks; at 2 stacks, a tornado',
    file: 'auto-sheathing.txt',
    skills: [['SKILL', 'Tempest Steel']],
  },
  {
    slug: 'move-three-stage-chain',
    title: 'One key, three different slashes in a row',
    file: 'auto-sheathing.txt',
    skills: [['SKILL', 'Upheaval']],
  },
  {
    slug: 'move-dash-spin-slash',
    title: 'Dash and spin slash, with an enhanced version',
    file: 'auto-sheathing.txt',
    skills: [['SKILL', 'Crescent Slash']],
  },
  {
    slug: 'move-fishing-rod-grapple',
    title: 'Fishing rod: hook at range, pull in, or grapple to walls',
    file: 'fishing-rod-fixed.txt',
    skills: [['SKILL', 'Fishing Rod']],
    branches: [
      '1',
      'Air1',
      'Catch24',
      'Pull24',
      'Wall24',
      'Grapple24',
      'AirGrapple12',
    ],
  },
  {
    slug: 'awakening-meteor',
    title: 'Awakening: a cutscene, then a huge falling projectile',
    file: 'character1.txt',
    skills: [['AWAKENING', 'Great Yamada Attack']],
  },
  // Passives and systems
  {
    slug: 'passive-custom-block',
    title: 'Custom block pose (and an awakened one)',
    file: 'character2.txt',
    skills: [['SKILL', 'CustomBlock']],
  },
  {
    slug: 'passive-awakened-dodge-counter',
    title: 'While awakened: dodge melee with a random sway (COUNTER)',
    file: 'character2.txt',
    skills: [['SKILL', 'AwakenedPassive']],
  },
  {
    slug: 'passive-awakened-aura',
    title: 'While awakened: a looping aura',
    file: 'character2.txt',
    skills: [['SKILL', 'AwakenedVisuals']],
  },
  {
    slug: 'passive-stacks-visual',
    title: 'Shows an effect while a stack tag is full',
    file: 'auto-sheathing.txt',
    skills: [['SKILL', 'EnhancedPassive']],
  },
  {
    slug: 'passive-auto-sheath',
    title: 'Weapon worn on the back, drawn by attacks',
    file: 'auto-sheathing.txt',
    skills: [['SKILL', 'SheathPassive']],
  },
  {
    slug: 'passive-stance-swap-on-block',
    title: 'Block while charging to cycle a stance tag',
    file: 'needs-fixing.txt',
    skills: [['SKILL', 'Swap Block']],
  },
  {
    slug: 'passive-cooldown-reset',
    title: 'Resets another skill’s cooldown when a tag is set',
    file: 'accurate-m1s-gon-freeccs.txt',
    skills: [['SKILL', 'Blink Workaround']],
  },
  {
    slug: 'passive-resource-bar-and-regen',
    title: 'A resource bar (0 to 20) with regeneration',
    file: 'needs-fixing.txt',
    skills: [
      ['SKILL', 'Nen Bar'],
      ['SKILL', 'Nen Regen'],
    ],
    branches: [
      '-',
      '0',
      '1',
      '20',
      'SafetyLesser',
      'SafetyLesserHold',
      'SafetyGreater',
      'SafetyGreaterHold',
    ],
  },
  {
    slug: 'passive-cosmetics',
    title: 'Cosmetics: outfit meshes, hair particles, camera',
    file: 'character1.txt',
    skills: [['SKILL', 'Outfit']],
    extra: {
      file: 'accurate-m1s-gon-freeccs.txt',
      skills: [['SKILL', 'Hair']],
    },
  },
  {
    slug: 'skill-template-charging-guard',
    title: 'Skill template: a key that does nothing while charging',
    file: 'accurate-m1s-gon-freeccs.txt',
    skills: [['SKILL', 'Skill Template']],
  },
];

// ─── Reading exports ────────────────────────────────────────────────────
const cache = new Map();
function exportOf(file) {
  if (!cache.has(file)) {
    const code = fs.readFileSync(`${DATA_DIR}/${file}`, 'utf8').trim();
    cache.set(
      file,
      JSON.parse(
        zlib.zstdDecompressSync(Buffer.from(code, 'base64')).toString(),
      ),
    );
  }
  return cache.get(file);
}
function skillsOf({ file, skills }) {
  return skills.map(([kind, name]) => {
    const found = exportOf(file).find(
      (s) => s.K_NAME === kind && String(s.NAME) === name,
    );
    if (!found) throw new Error(`${file}: no ${kind} "${name}"`);
    return found;
  });
}
const encode = (skills) =>
  zlib.zstdCompressSync(Buffer.from(JSON.stringify(skills))).toString('base64');

// ─── Writing nodes readably ─────────────────────────────────────────────
// core/describe.js: the same format the CLI and the MCP server answer with.
const timeline = describeSkill;

// ─── Files ──────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
for (const entry of ENTRIES) {
  const skills = skillsOf(entry);
  const extra = entry.extra ? skillsOf(entry.extra) : [];
  const all = [...skills, ...extra];
  const path = `${OUT}/${entry.slug}.md`;
  const top = fs.existsSync(path)
    ? fs.readFileSync(path, 'utf8').split(MARK)[0].trimEnd()
    : `# ${entry.title}\n\nTags: TODO\n\nTODO: what it does, how, and when to use it.`;
  const source = [entry, entry.extra]
    .filter(Boolean)
    .map((e) => `\`${e.file}\``)
    .join(' and ');
  const generated = [
    MARK,
    '',
    '## Nodes',
    '',
    `From ${source}. One line per node; effects (visuals, sounds, particles) are folded into \`fx:\` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).`,
    '',
    ...all.map((s) => timeline(s, entry.branches)),
    '',
    '## Code',
    '',
    `Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). ${all.length === 1 ? 'One skill' : `${all.length} skills`}.`,
    '',
    '```text',
    encode(all),
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(path, `${top}\n\n${generated}`);
}
console.log(`${ENTRIES.length} entries in ${OUT}/`);
