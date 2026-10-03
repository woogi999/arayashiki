// The quick start (src/onboarding.js). The welcome asks, on the first
// launch, whether to take the tour; the tour then walks the real window: a
// spotlight glides from editor to editor while a card beside it says what
// each one is for, through the Skill Builder and then the Meter Maker (a
// step's `workspace` switches to it), and the last card says where the user
// manual is.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import * as S from '../store.js';
import { Icon } from '../icons.jsx';
import { LAYOUTS, bindingOf, detectLayout, layoutChosen, setLayout } from '../keybinds.js';
import { markOnboarded, startTour } from '../onboarding.js';
import markUrl from '../assets/arayashiki-mark.png';

const close = () => (S.dialog.value = null);

// ─── The welcome ─────────────────────────────────────────────────────────

// First of all: which keyboard, so the shortcuts' defaults sit where the
// user's fingers expect them (src/keybinds.js).
function KeyboardPage({ onDone }) {
  const [pick, setPick] = useState('qwerty');
  const [found, setFound] = useState(null);
  useEffect(() => {
    detectLayout().then((id) => {
      if (!id) return;
      setFound(id);
      setPick(id);
    });
  }, []);
  const fly = { qwerty: 'W A S D', azerty: 'Z Q S D', qwertz: 'W A S D', dvorak: ', A O E', colemak: 'W A R S' };
  return (
    <div class="tw-text">
      <p class="tw-kicker">Welcome · 1 of 2</p>
      <h2 id="tw-title" class="tw-title">
        Which keyboard do you use?
      </h2>
      <p class="tw-line">
        The shortcuts follow it: flying the camera, for one, stays on the keys under your left hand. You can change it
        later in Settings → Keyboard shortcuts.
      </p>
      <div class="tw-layouts" role="radiogroup" aria-label="Keyboard layout">
        {LAYOUTS.map((l) => (
          <button
            type="button"
            role="radio"
            key={l.id}
            class="tw-layout"
            aria-checked={pick === l.id}
            onClick={() => setPick(l.id)}
          >
            <strong>{l.label}</strong>
            <span>{l.hint}</span>
            <kbd>{fly[l.id]}</kbd>
            {found === l.id && <em>This keyboard</em>}
          </button>
        ))}
      </div>
      <div class="tw-actions">
        <button
          type="button"
          class="btn btn-primary tw-go"
          autoFocus
          onClick={() => {
            setLayout(pick);
            onDone();
          }}
        >
          <span>Continue</span>
          <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  );
}

export function WelcomeDialog() {
  const ref = useRef(null);
  const [asking, setAsking] = useState(!layoutChosen.peek());
  const [asked] = useState(!layoutChosen.peek());
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.open && ref.current.close();
  }, []);
  const skip = () => {
    // Leaving straight away still keeps a layout: the one it looks like.
    if (!layoutChosen.peek()) detectLayout().then((id) => setLayout(id ?? 'qwerty'));
    markOnboarded('skipped');
    close();
  };
  const go = () => {
    markOnboarded('toured');
    startTour();
  };
  return (
    <dialog
      ref={ref}
      class="tw"
      aria-labelledby="tw-title"
      onCancel={(e) => {
        e.preventDefault();
        skip();
      }}
    >
      <div class="tw-art" aria-hidden="true">
        <div class="tw-rings">
          <span />
          <span />
          <span />
        </div>
        <img class="tw-mark" src={markUrl} alt="" width="132" height="132" />
        <div class="tw-floor" />
      </div>
      {asking ? (
        <KeyboardPage onDone={() => setAsking(false)} />
      ) : (
      <div class="tw-text">
        <p class="tw-kicker">{asked ? 'Welcome · 2 of 2' : 'Welcome'}</p>
        <h2 id="tw-title" class="tw-title">
          First time in Arayashiki?
        </h2>
        <p class="tw-line">
          Take the quick tour: about a minute to see where everything is, from the node editor and the 3D viewport to
          playing a skill and copying its code back into JJS.
        </p>
        <ul class="tw-points">
          <li>
            <Icon name="layout" size={14} /> The editors and what each one is for
          </li>
          <li>
            <Icon name="play" size={14} /> Playing, scrubbing and reading a skill
          </li>
          <li>
            <Icon name="copy" size={14} /> Getting the code back into the game
          </li>
          <li>
            <Icon name="battery" size={14} /> The Meter Maker, for bars that fill
          </li>
        </ul>
        <div class="tw-actions">
          <button type="button" class="btn btn-primary tw-go" onClick={go} autoFocus>
            <span>Show me around</span>
            <Icon name="arrow-right" size={15} />
          </button>
          <button type="button" class="btn btn-ghost" onClick={skip}>
            Skip for now
          </button>
        </div>
        <p class="tw-later">
          Take it any time from <strong>Quick tour</strong> on the start screen, or press{' '}
          <kbd>{bindingOf('search')}</kbd> and search “tour”.
        </p>
      </div>
      )}
    </dialog>
  );
}

// ─── The tour ────────────────────────────────────────────────────────────

// Arrow keys as arrows, as the keycaps print them.
const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
const keys = (id) => <kbd>{bindingOf(id).replace(/Arrow(Left|Right|Up|Down)/g, (a) => ARROWS[a])}</kbd>;

// Each step: a selector for what to light up (none: a card in the middle),
// an icon, a title and what to say.
const STEPS = [
  {
    icon: 'swords',
    title: 'This is the Skill Builder',
    body: () => (
      <>
        <p>
          Laid out like Blender: the 3D viewport in the middle, the editors that feed it around it. Every edge between
          them drags, and a panel’s header drags it somewhere else.
        </p>
        <p class="tt-dim">
          Use <kbd>→</kbd> and <kbd>←</kbd> to move through the tour, <kbd>Esc</kbd> to leave it.
        </p>
      </>
    ),
  },
  {
    target: '.topbar-menus',
    icon: 'folder',
    title: 'Bring a moveset in',
    body: () => (
      <p>
        <strong>New</strong> starts a blank moveset, <strong>Open</strong> reads a .txt and{' '}
        <strong>Import</strong> takes the code JJS copies out. <strong>Templates</strong> builds ready-made skills from
        a form; <strong>Settings</strong> holds keybinds, appearance and updates.
      </p>
    ),
  },
  {
    target: '.workspace-tabs',
    icon: 'battery',
    title: 'Two workspaces',
    body: () => (
      <p>
        <strong>Skills</strong> is the moveset editor you’re in. <strong>Meter Maker</strong> draws a meter (a progress
        bar), uploads it to Roblox and makes the skill that shows it. The tour visits it after the Skill Builder.
      </p>
    ),
  },
  {
    target: '.area-outliner',
    icon: 'folder',
    title: 'Outliner',
    body: () => (
      <p>
        The moveset as a tree: the five categories (SKILL, SPECIAL, AWAKENING, MELEE, CHASE), their skills, and the open
        skill’s branches. Click a skill to open it; right-click for more.
      </p>
    ),
  },
  {
    target: '.area-nodes',
    icon: 'list',
    title: 'Nodes',
    body: () => (
      <p>
        The open skill’s nodes in order, as the in-game builder lists them: WAIT, HITBOX, VELOCITY, VISUAL… Click one to
        edit it, drag to reorder, right-click to add, copy or delete.
      </p>
    ),
  },
  {
    target: '.area-view',
    icon: 'box',
    title: 'Viewport',
    body: () => (
      <p>
        Where the skill plays, on your character against a training dummy. Orbit with the right mouse button, pan with
        the middle one, zoom with the wheel. Hitboxes show as boxes while it plays.
      </p>
    ),
  },
  {
    target: '.area-time',
    icon: 'clock',
    title: 'Timeline',
    body: () => (
      <p>
        The frame meter: every node as a bar, hits in red, the playhead in lime. Press {keys('play')} to play,{' '}
        {keys('frameBack')} {keys('frameNext')} to step a frame, drag to scrub. The <strong>Log</strong> tab says what
        happened, frame by frame.
      </p>
    ),
  },
  {
    target: '.area-properties',
    icon: 'sliders',
    title: 'Properties',
    body: () => (
      <p>
        Every field of the picked node, with JJS’s own names. The tabs down the side switch to the branch, the skill
        (its key, cooldown, conditions) and the simulation (the dummy, speed, camera).
      </p>
    ),
  },
  {
    target: '.do-export',
    icon: 'copy',
    title: 'Back into the game',
    body: () => (
      <p>
        <strong>Export</strong> copies the code for JJS’s Skill Builder, records the skill as a video or saves a
        picture; {keys('export')} goes straight to the code. {keys('save')} keeps the moveset as a .txt.
      </p>
    ),
  },
  {
    target: '.account-btn',
    icon: 'user-round',
    title: 'Sign in with Roblox',
    body: () => (
      <p>
        Roblox only hands many meshes, textures and sounds to a signed-in account. Sign in so skills look and sound as
        they do in-game. Roblox’s own page signs you in; Arayashiki never sees your password.
      </p>
    ),
  },
  {
    workspace: 'bars',
    target: '.pb-view',
    icon: 'battery',
    title: 'This is the Meter Maker',
    body: () => (
      <p>
        Draw a meter that fills, the way JJS shows a bar: the picture in the middle is one step of it, from empty to
        full. Layers stack bars and rings, text, shapes, pictures and brush strokes.
      </p>
    ),
  },
  {
    workspace: 'bars',
    target: '.pb-rail',
    icon: 'brush',
    title: 'Tools',
    body: () => (
      <p>
        <strong>Move</strong> (V), <strong>Meter</strong> (M), <strong>Shape</strong> (U), <strong>Pen</strong> (P),{' '}
        <strong>Text</strong> (T), <strong>Brush</strong> (B) and <strong>Eraser</strong> (E), and a picture of your own. The strip above the picture holds
        the options of the tool in hand.
      </p>
    ),
  },
  {
    workspace: 'bars',
    target: '.pb-steps',
    icon: 'clock',
    title: 'Steps',
    body: () => (
      <p>
        Every picture the meter goes through, empty to full. Play runs them; drag the slider or click a step to see it.
        A text layer’s <code>{'{percent}'}</code> counts up with them.
      </p>
    ),
  },
  {
    workspace: 'bars',
    target: '.pb-dock',
    icon: 'layers',
    title: 'Properties and layers',
    body: () => (
      <p>
        The picked layer’s settings (fill, effects, clipping to the layer below) above, every layer below: drag to
        reorder, the eye hides one.
      </p>
    ),
  },
  {
    workspace: 'bars',
    target: '.topbar-right .export-btn',
    icon: 'upload',
    title: 'Into the game',
    body: () => (
      <p>
        <strong>Export</strong> saves the pictures, or uploads every step to Roblox as your account and makes the skill
        that shows them, ready to go into your moveset.
      </p>
    ),
  },
  {
    icon: 'command',
    title: 'Worth remembering',
    body: () => (
      <ul class="tt-keys">
        <li>
          {keys('search')}
          <span>Search everything: commands, skills, nodes, settings, help</span>
        </li>
        <li>
          <kbd>Right-click</kbd>
          <span>A menu for whatever you clicked</span>
        </li>
        <li>
          {keys('assistant')}
          <span>The AI assistant, with your own key</span>
        </li>
        <li>
          {keys('undo')}
          <span>Undo, for every edit</span>
        </li>
      </ul>
    ),
  },
  {
    final: true,
    icon: 'check',
    title: 'You’re all set',
    body: () => (
      <p>
        Everything has more depth in the <strong>user manual</strong>: press {keys('manual')} anywhere, pick{' '}
        <strong>User manual</strong> on the start screen, or search for any topic with {keys('search')}.
      </p>
    ),
  },
];

const PAD = 6; // around the lit-up element
const GAP = 14; // between it and the card
const EDGE = 12; // between the card and the window's edge
const CARD_W = 340;

/** Where the card goes beside a lit-up rectangle (all in CSS px). */
function placeCard(r, w, h, W, H) {
  if (!r) return { left: (W - w) / 2, top: (H - h) / 2, side: 'center' };
  const clampX = (x) => Math.max(EDGE, Math.min(W - w - EDGE, x));
  const clampY = (y) => Math.max(EDGE, Math.min(H - h - EDGE, y));
  const room = { right: W - r.right, left: r.left, bottom: H - r.bottom, top: r.top };
  if (room.right >= w + GAP + EDGE) return { left: r.right + GAP, top: clampY(r.top), side: 'right' };
  if (room.left >= w + GAP + EDGE) return { left: r.left - GAP - w, top: clampY(r.top), side: 'left' };
  if (room.bottom >= h + GAP + EDGE) return { left: clampX(r.left), top: r.bottom + GAP, side: 'bottom' };
  if (room.top >= h + GAP + EDGE) return { left: clampX(r.left), top: r.top - GAP - h, side: 'top' };
  // A big editor (the viewport): the card sits inside its top left corner.
  return { left: clampX(r.left + 18), top: clampY(r.top + 44), side: 'inside' };
}

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
};

export function Tour() {
  const root = useRef(null);
  const card = useRef(null);
  const [steps, setSteps] = useState(null);
  const [at, setAt] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardH, setCardH] = useState(220);
  const [size, setSize] = useState({ W: innerWidth, H: innerHeight });

  // The Skill Builder's steps whose element is on screen (the account
  // button is desktop only; a panel may be hidden), once the editors have
  // rendered. The Meter Maker's aren't on screen yet: they all stay.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setSteps(STEPS.filter((s) => !s.target || s.workspace || visible(document.querySelector(s.target)))),
      ),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const step = steps?.[at];
  // Each step shows its workspace (the Skill Builder unless it says).
  useEffect(() => {
    if (!step) return;
    const want = step.workspace ?? 'skills';
    if (S.workspace.peek() !== want) S.workspace.value = want;
    if (S.showStart.peek()) S.showStart.value = false;
  }, [step]);
  const end = () => close();
  const next = () => steps && (at < steps.length - 1 ? setAt(at + 1) : end());
  const back = () => at > 0 && setAt(at - 1);

  // Follow the element every frame (panels resize, the window moves), in
  // CSS px: the interface size zooms the page, and rects come back zoomed.
  useEffect(() => {
    if (!step) return;
    let raf;
    let last = '';
    const tick = () => {
      const o = root.current;
      const z = o && o.offsetWidth ? o.getBoundingClientRect().width / o.offsetWidth : 1;
      const el = step.target && document.querySelector(step.target);
      const b = el && visible(el) ? el.getBoundingClientRect() : null;
      const r = b && {
        left: b.left / z - PAD,
        top: b.top / z - PAD,
        right: b.right / z + PAD,
        bottom: b.bottom / z + PAD,
      };
      const W = (o?.offsetWidth ?? innerWidth) || innerWidth;
      const H = (o?.offsetHeight ?? innerHeight) || innerHeight;
      const key = r ? `${r.left},${r.top},${r.right},${r.bottom},${W},${H}` : `none,${W},${H}`;
      if (key !== last) {
        last = key;
        setRect(r);
        setSize({ W, H });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // The card's height, for placing it, after each step's text renders.
  useLayoutEffect(() => {
    if (card.current) setCardH(card.current.offsetHeight);
  }, [at, steps]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  });

  if (!steps || !step) return <div class="tt" ref={root} />;
  const { W, H } = size;
  const w = Math.min(CARD_W, W - 2 * EDGE);
  const place = placeCard(rect, w, cardH, W, H);
  // With nothing to light up, the spotlight closes to a point in the middle.
  const spot = rect
    ? { left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
    : { left: W / 2, top: H / 2, width: 0, height: 0 };
  const Body = step.body;

  return (
    <div class={`tt ${rect ? '' : 'is-center'}`} ref={root} role="dialog" aria-modal="true" aria-label="Quick tour">
      <div
        class="tt-spot"
        style={{ left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px`, height: `${spot.height}px` }}
      />
      <div
        ref={card}
        class={`tt-card side-${place.side} ${step.final ? 'is-final' : ''}`}
        style={{ left: `${place.left}px`, top: `${place.top}px`, width: `${w}px` }}
      >
        <div class="tt-bar" aria-hidden="true">
          <div class="tt-bar-fill" style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
        </div>
        <div class="tt-content" key={at}>
          <div class="tt-head">
            {step.final ? (
              <svg class="tt-done" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
                <circle cx="20" cy="20" r="17" />
                <path d="M12.5 20.5l5 5 10-11" />
              </svg>
            ) : (
              <span class="tt-icon">
                <Icon name={step.icon} size={16} />
              </span>
            )}
            <div>
              <span class="tt-count num">
                {at + 1} / {steps.length}
              </span>
              <h2 class="tt-title">{step.title}</h2>
            </div>
          </div>
          <div class="tt-body">
            <Body />
          </div>
        </div>
        <div class="tt-actions">
          {step.final ? (
            <>
              <button
                type="button"
                class="btn btn-default"
                onClick={() => {
                  S.dialog.value = 'manual';
                }}
              >
                <Icon name="book" size={15} />
                <span>Open the user manual</span>
              </button>
              <span class="spacer" />
              <button type="button" class="btn btn-primary" onClick={end} autoFocus>
                <span>Start building</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" class="tt-skip" onClick={end}>
                Skip tour
              </button>
              <span class="spacer" />
              {at > 0 && (
                <button type="button" class="btn btn-ghost" onClick={back}>
                  Back
                </button>
              )}
              <button type="button" class="btn btn-primary" onClick={next}>
                <span>{at === 0 ? 'Let’s go' : 'Next'}</span>
                <Icon name="arrow-right" size={15} />
              </button>
            </>
          )}
        </div>
        <div class="tt-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <button
              type="button"
              tabIndex={-1}
              key={i}
              class={i === at ? 'is-on' : i < at ? 'is-past' : ''}
              onClick={() => setAt(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
