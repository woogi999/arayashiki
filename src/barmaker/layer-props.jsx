// The settings for whichever layer is picked in the Progress Bar Maker, one
// tab at a time.
import { BLENDS } from './draw.js';
import { FontPicker } from './font-picker.jsx';
import { layerField, matchSteps, setLayer } from './state.js';
import { Check, Chips, ColourAlpha, ColourField, Fx, Group, ImagePick, Num, PaintField, Picks, Slider } from './fields.jsx';

const half = (a, b) => Math.max(1, Math.floor(Math.min(a, b) / 2));
const isVertical = (layer) => ['ttb', 'btt', 'center-v'].includes(layer.direction);

const BAR_DIRECTIONS = [
  { id: 'ltr', icon: 'arrow-right', title: 'Left to right' },
  { id: 'rtl', icon: 'arrow-left', title: 'Right to left' },
  { id: 'btt', icon: 'arrow-up', title: 'Bottom to top' },
  { id: 'ttb', icon: 'arrow-down', title: 'Top to bottom' },
  { id: 'center-h', icon: 'move-horizontal', title: 'Out from the middle, sideways' },
  { id: 'center-v', icon: 'move-vertical', title: 'Out from the middle, up and down' },
];
const SHAPES_BAR = [
  { id: 'bar', label: 'Bar' },
  { id: 'ring', label: 'Ring' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Picture', title: 'A picture is the bar: it fills across its own outline' },
];
const IMAGE_FILLS = [
  { id: true, label: 'Its colours', title: 'The picture shows as it is where it’s filled' },
  { id: false, label: 'The fill', title: 'Where it’s filled, the picture’s outline in the Fill tab’s paint' },
];
const IMAGE_TRACKS = [
  { id: 'faded', label: 'Faded', title: 'What’s still to fill is the picture, greyed and dimmed' },
  { id: 'paint', label: 'Background', title: 'What’s still to fill is the picture’s outline in the Back tab’s paint' },
];
const TEXT_LAYOUTS = [
  { id: 'across', label: 'Across' },
  { id: 'down', label: 'Down' },
];
const TEXT_MODES = [
  { id: 'wipe', label: 'Sweep', title: 'The fill sweeps across the whole text' },
  { id: 'chars', label: 'Letter by letter', title: 'Each letter fills in turn' },
  { id: 'strokes', label: 'Stroke order', title: 'Kanji and kana are drawn stroke by stroke, the way they’re written' },
];
const TEXT_STYLES = [
  { id: 'fill', label: 'Solid letters' },
  { id: 'outline', label: 'Outlines' },
];
const IMAGE_FITS = [
  { id: 'contain', label: 'Fit' },
  { id: 'stretch', label: 'Stretch' },
];
const SEGMENT_SHAPES = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'slant', label: 'Slant' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'ellipse', label: 'Oval' },
  { id: 'image', label: 'Picture' },
];
const ALIGN_ACROSS = [
  { id: 'start', label: 'Top' },
  { id: 'center', label: 'Middle' },
  { id: 'end', label: 'Bottom' },
];
const ALIGN_DOWN = [
  { id: 'start', label: 'Left' },
  { id: 'center', label: 'Middle' },
  { id: 'end', label: 'Right' },
];
const FILL_ENDS = [
  { id: 'cut', label: 'Cut by the bar', title: 'The fill is trimmed by the bar’s outline' },
  { id: 'shape', label: 'Own shape', title: 'The fill keeps its own ends as it grows' },
];
const CLIP_TO = [
  { id: 'fill', label: 'The fill' },
  { id: 'all', label: 'The whole bar' },
];
const RING_DIRECTIONS = [
  { id: 'cw', icon: 'rotate-cw', title: 'Clockwise' },
  { id: 'ccw', icon: 'rotate-ccw', title: 'Anticlockwise' },
  { id: 'center', icon: 'move-horizontal', title: 'Both ways from the start' },
];
const FILL_MODES = [
  { id: 'reveal', label: 'Whole', title: 'The gradient spans the full bar and is uncovered as it fills' },
  { id: 'stretch', label: 'Squeezed', title: 'The whole gradient always fits inside the filled part' },
  { id: 'progress', label: 'By step', title: 'One colour at a time, picked off the gradient by how full it is' },
];
const STROKE_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'double', label: 'Double' },
];
const STROKE_POSITIONS = [
  { id: 'outside', label: 'Outside' },
  { id: 'center', label: 'Centred' },
  { id: 'inside', label: 'Inside' },
];
const STROKE_AROUND = [
  { id: 'segments', label: 'Each segment' },
  { id: 'bar', label: 'The whole bar' },
];
const CAPS = [
  { id: 'butt', label: 'Flat' },
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
];
const PATTERNS = [
  { id: 'stripes', label: 'Stripes' },
  { id: 'dots', label: 'Dots' },
  { id: 'checker', label: 'Checker' },
  { id: 'crosshatch', label: 'Grid' },
  { id: 'image', label: 'Picture' },
];
const ANCHORS = [
  { id: 'canvas', label: 'Pinned', title: 'Stays still on the picture: the fill uncovers it as it grows (the Chowder look)' },
  { id: 'fill', label: 'With fill', title: 'Moves along with the fill’s growing end' },
  { id: 'drift', label: 'Drifts', title: 'Slides along by a set amount every step' },
];
const SHINES = [
  { id: 'top', label: 'Gloss' },
  { id: 'glass', label: 'Glass' },
  { id: 'sheen', label: 'Sheen' },
  { id: 'shade', label: 'Shade' },
];
const SHAPES = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
];
const ALIGNS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Centre' },
  { id: 'right', label: 'Right' },
];

// Handlers by path: `f` reads the input that fired, `set` takes a value.
const f = (path) => (event) => layerField(path, event);
const set = (path) => (value) => setLayer(path, value);

function Blend({ value, path }) {
  return (
    <label class="pb-row">
      <span class="pb-row-label">Blend</span>
      <select class="input" value={value} onChange={f(path)}>
        {BLENDS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FontPick({ value, path }) {
  return <FontPicker value={value} onPick={set(path)} />;
}

// A switchable effect whose colour and opacity live at `${base}.color/alpha`.
const colourOf = (layer, base, label) => {
  const at = base.split('.').reduce((o, k) => o?.[k], layer);
  return (
    <ColourAlpha
      label={label}
      color={at.color}
      alpha={at.alpha}
      onColour={set(`${base}.color`)}
      onAlpha={f(`${base}.alpha`)}
    />
  );
};

// The effects every kind of layer can have.
function LayerFx({ layer }) {
  const fx = layer.fx;
  return (
    <>
      <h3 class="pb-divider">Layer effects</h3>
      <Fx title="Drop shadow" on={fx.shadow.on} onToggle={set('fx.shadow.on')} hint="A soft shadow under the layer.">
        {colourOf(layer, 'fx.shadow', 'Shadow')}
        <Slider label="Across" min="-100" max="100" value={fx.shadow.x} onInput={f('fx.shadow.x')} />
        <Slider label="Down" min="-100" max="100" value={fx.shadow.y} onInput={f('fx.shadow.y')} />
        <Slider label="Blur" min="0" max="120" value={fx.shadow.blur} onInput={f('fx.shadow.blur')} />
      </Fx>
      <Fx title="Outer glow" on={fx.outerGlow.on} onToggle={set('fx.outerGlow.on')} hint="Light spilling out all round the layer.">
        {colourOf(layer, 'fx.outerGlow', 'Glow')}
        <Slider label="Size" min="1" max="150" value={fx.outerGlow.size} onInput={f('fx.outerGlow.size')} />
      </Fx>
      <Fx title="Outline" on={fx.outline.on} onToggle={set('fx.outline.on')} hint="A solid edge traced round whatever the layer draws.">
        {colourOf(layer, 'fx.outline', 'Outline')}
        <Slider label="Width" min="1" max="40" value={fx.outline.width} onInput={f('fx.outline.width')} />
      </Fx>
      <Fx title="Colour overlay" on={fx.overlay.on} onToggle={set('fx.overlay.on')} hint="Tints the whole layer one colour.">
        {colourOf(layer, 'fx.overlay', 'Overlay')}
        <Blend value={fx.overlay.blend} path="fx.overlay.blend" />
      </Fx>
      <Fx title="Fade with progress" on={fx.fade.on} onToggle={set('fx.fade.on')} hint="Fades the layer in (or out) as the bar fills.">
        <Slider label="When empty" unit="%" min="0" max="100" value={fx.fade.from} onInput={f('fx.fade.from')} />
        <Slider label="When full" unit="%" min="0" max="100" value={fx.fade.to} onInput={f('fx.fade.to')} />
      </Fx>
      <Fx
        title="Only show between"
        on={fx.range.on}
        onToggle={set('fx.range.on')}
        hint="Shows the layer on some steps only, like a “FULL!” on the last."
      >
        <Slider label="From" unit="%" min="0" max="100" value={fx.range.from} onInput={f('fx.range.from')} />
        <Slider label="To" unit="%" min="0" max="100" value={fx.range.to} onInput={f('fx.range.to')} />
      </Fx>
    </>
  );
}

function LayerTab({ layer }) {
  return (
    <>
      <Group title="Layer">
        <label class="pb-row">
          <span class="pb-row-label">Name</span>
          <input type="text" class="input" value={layer.name} onChange={f('name')} />
        </label>
        <Slider label="Opacity" unit="%" min="0" max="100" value={layer.opacity} onInput={f('opacity')} />
        <Blend value={layer.blend} path="blend" />
      </Group>
      {layer.type !== 'paint' && (
        <Group title="Position">
          <div class="pb-nums">
            <Num label="X" value={layer.x} onChange={f('x')} />
            <Num label="Y" value={layer.y} onChange={f('y')} />
            <Num label="W" value={layer.w} onChange={f('w')} />
            <Num label="H" value={layer.h} onChange={f('h')} />
          </div>
          <Slider label="Rotation" unit="°" min="-180" max="180" value={layer.rotation} onInput={f('rotation')} />
        </Group>
      )}
      <Group title="Clipping">
        <Check label="Clip to the layer below" checked={layer.clip} onChange={f('clip')} />
        {layer.type === 'bar' && (
          <Picks title="Clipped layers show on" options={CLIP_TO} value={layer.clipTo} onPick={set('clipTo')} />
        )}
        <p class="hint">
          A clipped layer only shows inside the layer under it: put a picture over a bar, clip it, and it becomes a
          texture on the fill.
        </p>
      </Group>
      {layer.type === 'paint' && <p class="hint">Pick the brush or eraser from the tools on the left to draw on this layer.</p>}
    </>
  );
}

function BarEffects({ layer }) {
  return (
    <>
      <Fx
        title="Pattern"
        on={layer.stripes.on}
        onToggle={set('stripes.on')}
        hint="Stripes, dots, checks or a grid over the fill, pinned still or moving."
      >
        <Chips label="Pattern" options={PATTERNS} value={layer.stripes.kind} onPick={set('stripes.kind')} />
        {layer.stripes.kind === 'image' ? (
          <>
            <ImagePick src={layer.stripes.src} label="Pattern picture" onPick={set('stripes.src')} />
            <Slider label="Opacity" unit="%" min="0" max="100" value={layer.stripes.alpha} onInput={f('stripes.alpha')} />
          </>
        ) : (
          colourOf(layer, 'stripes', 'Pattern')
        )}
        <Slider label="Size" min="2" max="120" value={layer.stripes.width} onInput={f('stripes.width')} />
        {layer.stripes.kind !== 'checker' && (
          <Slider label="Spacing" min="0" max="160" value={layer.stripes.gap} onInput={f('stripes.gap')} />
        )}
        <Slider label="Angle" unit="°" min="-90" max="90" value={layer.stripes.angle} onInput={f('stripes.angle')} />
        <Picks title="Moves" options={ANCHORS} value={layer.stripes.anchor} onPick={set('stripes.anchor')} />
        {layer.stripes.anchor === 'drift' && (
          <Slider label="Per step" unit="px" min="-60" max="60" value={layer.stripes.move} onInput={f('stripes.move')} />
        )}
      </Fx>
      <Fx title="Shine" on={layer.shine.on} onToggle={set('shine.on')} hint="A highlight across the fill: gloss, glass, sheen or a shaded bottom.">
        <Picks title="Style" options={SHINES} value={layer.shine.style} onPick={set('shine.style')} />
        <Slider label="Strength" unit="%" min="0" max="100" value={layer.shine.alpha} onInput={f('shine.alpha')} />
      </Fx>
      <Fx title="Leading edge" on={layer.tip.on} onToggle={set('tip.on')} hint="A bright band where the fill is growing.">
        {colourOf(layer, 'tip', 'Edge')}
        <Slider label="Length" min="2" max="300" value={layer.tip.size} onInput={f('tip.size')} />
      </Fx>
      <Fx title="Glow" on={layer.glow.on} onToggle={set('glow.on')} hint="Light around the filled part.">
        {colourOf(layer, 'glow', 'Glow')}
        <Slider label="Size" min="1" max="150" value={layer.glow.size} onInput={f('glow.size')} />
        <Check label="Brighter as it fills" checked={layer.glow.grow} onChange={f('glow.grow')} />
      </Fx>
      <Fx title="Grain" on={layer.grain.on} onToggle={set('grain.on')} hint="Film grain over the fill, still or flickering.">
        <Slider label="Strength" unit="%" min="0" max="100" value={layer.grain.alpha} onInput={f('grain.alpha')} />
        <Slider label="Coarseness" min="1" max="12" value={layer.grain.size} onInput={f('grain.size')} />
        <Check label="Changes every step" checked={layer.grain.animate} onChange={f('grain.animate')} />
      </Fx>
      <Fx title="Flash when full" on={layer.flash.on} onToggle={set('flash.on')} hint="Washes the fill with a colour on the last step only.">
        {colourOf(layer, 'flash', 'Flash')}
      </Fx>
    </>
  );
}

function BarShape({ layer }) {
  return (
    <>
      <Group title="Shape">
        <Picks label="Bar shape" options={SHAPES_BAR} value={layer.shape} onPick={set('shape')} />
        {layer.shape === 'text' ? (
          <>
            <textarea class="input" rows={2} aria-label="Bar text" value={layer.text} onInput={f('text')} />
            <FontPick value={layer.textFont} path="textFont" />
            <Check label="Bold" checked={layer.textBold} onChange={f('textBold')} />
            <Picks title="Written" options={TEXT_LAYOUTS} value={layer.textLayout} onPick={set('textLayout')} />
            <Slider label="Spacing" unit="%" min="0" max="100" value={layer.textSpacing} onInput={f('textSpacing')} />
          </>
        ) : layer.shape === 'image' ? (
          <>
            <ImagePick src={layer.barImage} label="Bar picture" onPick={set('barImage')} />
            <Picks title="Picture" options={IMAGE_FITS} value={layer.barImageFit} onPick={set('barImageFit')} />
            <Picks title="Fills" options={BAR_DIRECTIONS} value={layer.direction} onPick={set('direction')} />
            <Picks title="Filled with" options={IMAGE_FILLS} value={layer.barImageOwn !== false} onPick={set('barImageOwn')} />
            <Picks title="Still to fill" options={IMAGE_TRACKS} value={layer.barImageTrack ?? 'faded'} onPick={set('barImageTrack')} />
            <p class="hint">
              The whole picture is the bar, not one segment’s shape: it fills across its outline (anything with a
              see-through background works best: a sword, a skill icon, a logo).
            </p>
          </>
        ) : layer.shape === 'ring' ? (
          <>
            <Picks title="Fills" options={RING_DIRECTIONS} value={layer.direction} onPick={set('direction')} />
            <Slider label="Starts at" unit="°" min="0" max="360" value={layer.ringStart} onInput={f('ringStart')} />
            <Slider label="Goes round" unit="°" min="10" max="360" value={layer.ringSweep} onInput={f('ringSweep')} />
            <Slider label="Thickness" min="1" max={half(layer.w, layer.h)} value={layer.thickness} onInput={f('thickness')} />
            <Check label="Round ends" checked={layer.roundEnds} onChange={f('roundEnds')} />
          </>
        ) : (
          <>
            <Picks title="Fills" options={BAR_DIRECTIONS} value={layer.direction} onPick={set('direction')} />
            <Slider label="Roundness" min="0" max={half(layer.w, layer.h)} value={layer.radius} onInput={f('radius')} />
            <Slider label="Slant" unit="°" min="-45" max="45" value={layer.skew} onInput={f('skew')} />
          </>
        )}
      </Group>

      {layer.shape === 'text' ? (
        <Group title="How it fills">
          <Chips label="How the text fills" options={TEXT_MODES} value={layer.textMode} onPick={set('textMode')} />
          {layer.textMode === 'strokes' ? (
            <>
              <Slider label="Pen" unit="%" min="1" max="25" value={layer.textPen} onInput={f('textPen')} />
              <p class="hint">
                Kanji and kana are drawn in the order they’re written, using KanjiVG’s stroke data (fetched once, then
                kept with the design). Anything else sweeps in on its turn.
              </p>
            </>
          ) : (
            <>
              <Picks title="Fills" options={BAR_DIRECTIONS} value={layer.direction} onPick={set('direction')} />
              <Picks title="Letters" options={TEXT_STYLES} value={layer.textStyle} onPick={set('textStyle')} />
              {layer.textStyle === 'outline' && (
                <Slider label="Line" unit="%" min="1" max="30" value={layer.textOutline} onInput={f('textOutline')} />
              )}
            </>
          )}
          <Check
            label={layer.textMode === 'strokes' ? 'Whole strokes only' : 'Whole letters only'}
            checked={layer.stepped}
            onChange={f('stepped')}
          />
        </Group>
      ) : (
        <Group title="Segments">
          <Slider label="Count" min="1" max="50" value={layer.segments} onInput={f('segments')} />
          <Slider label="Gap" min="0" max="80" value={layer.gap} onInput={f('gap')} />
          <Check label="Light up whole segments only" checked={layer.stepped} onChange={f('stepped')} />
          <button type="button" class="btn" onClick={matchSteps}>
            <span>Make the steps match the segments ({layer.segments})</span>
          </button>
        </Group>
      )}

      {layer.shape === 'bar' && (
        <Group title="Segment shape">
          <Chips label="Segment shape" options={SEGMENT_SHAPES} value={layer.segShape} onPick={set('segShape')} />
          {layer.segShape === 'image' && (
            <>
              <ImagePick src={layer.segImage} label="Segment picture" onPick={set('segImage')} />
              <Picks title="Picture" options={IMAGE_FITS} value={layer.segImageFit} onPick={set('segImageFit')} />
              <p class="hint">
                The picture’s outline becomes each segment’s shape: hearts, gems, anything with a see-through
                background.
              </p>
            </>
          )}
          {layer.segShape === 'slant' && (
            <Slider label="Lean" min="-200" max="200" value={layer.segSlant} onInput={f('segSlant')} />
          )}
          {(layer.segShape === 'chevron' || layer.segShape === 'hexagon') && (
            <Slider label="Point" unit="%" min="0" max="150" value={layer.segDepth} onInput={f('segDepth')} />
          )}
          <Slider label="Taper start" unit="%" min="5" max="100" value={layer.taperStart} onInput={f('taperStart')} />
          <Slider label="Taper end" unit="%" min="5" max="100" value={layer.taperEnd} onInput={f('taperEnd')} />
          <Picks
            title="Line up"
            options={isVertical(layer) ? ALIGN_DOWN : ALIGN_ACROSS}
            value={layer.taperAlign}
            onPick={set('taperAlign')}
          />
          <p class="hint">
            With one segment this shapes the whole bar; a taper under 100% makes it a wedge, or a signal meter with
            more segments.
          </p>
        </Group>
      )}
    </>
  );
}

function BarFill({ layer }) {
  return (
    <>
      <Group title="Fill">
        <PaintField label="Fill" paint={layer.fill} path="fill" onSet={setLayer} segments={layer.shape !== 'ring'} />
      </Group>
      <Group title="How it fills">
        <Picks title="Gradient" options={FILL_MODES} value={layer.fillMode} onPick={set('fillMode')} />
        <Picks title="Ends" options={FILL_ENDS} value={layer.fillEnds} onPick={set('fillEnds')} />
        <Slider label="Inset" min="0" max="60" value={layer.padding} onInput={f('padding')} />
      </Group>
      <Fx
        title="Catch-up trail"
        on={layer.trail.on}
        onToggle={set('trail.on')}
        hint="A second, paler fill running a little ahead of the real one. Rendered in layers (Complex Separate), the trail is the step’s own, the same as the meter (Ahead by doesn’t apply): it only flashes when the meter goes down, so it shows where it was."
      >
        {colourOf(layer, 'trail', 'Trail')}
        <Slider label="Ahead by" unit="%" min="1" max="50" value={layer.trail.amount} onInput={f('trail.amount')} />
      </Fx>
    </>
  );
}

function BarTrack({ layer }) {
  return (
    <>
      <Fx
        title="Background"
        on={layer.trackOn}
        onToggle={set('trackOn')}
        hint="Off: there’s nothing behind the fill, just the see-through picture."
      >
        <PaintField label="Background" paint={layer.track} path="track" onSet={setLayer} segments={layer.shape !== 'ring'} />
        <Check label="Hide it under the fill" checked={layer.trackCut} onChange={f('trackCut')} />
      </Fx>
      <Fx title="Inner shadow" on={layer.innerShadow.on} onToggle={set('innerShadow.on')} hint="Makes the bar look sunk into the picture.">
        {colourOf(layer, 'innerShadow', 'Inner shadow')}
        <Slider label="Size" min="1" max="80" value={layer.innerShadow.size} onInput={f('innerShadow.size')} />
        <Slider label="Across" min="-40" max="40" value={layer.innerShadow.x} onInput={f('innerShadow.x')} />
        <Slider label="Down" min="-40" max="40" value={layer.innerShadow.y} onInput={f('innerShadow.y')} />
      </Fx>
    </>
  );
}

function BarStroke({ layer }) {
  const st = layer.stroke;
  return (
    <>
      <Fx title="Outline" on={st.on} onToggle={set('stroke.on')} hint="A line round the bar: solid, dashed, dotted or double.">
        <Picks label="Style" options={STROKE_STYLES} value={st.style} onPick={set('stroke.style')} />
        <Slider label="Width" min="1" max="60" value={st.width} onInput={f('stroke.width')} />
        {st.style === 'dashed' && <Slider label="Dash" min="1" max="200" value={st.dash} onInput={f('stroke.dash')} />}
        {(st.style === 'dashed' || st.style === 'dotted') && (
          <>
            <Slider label="Gap" min="1" max="200" value={st.gap} onInput={f('stroke.gap')} />
            <Slider label="Crawl" unit="px" min="-60" max="60" value={st.march} onInput={f('stroke.march')} />
          </>
        )}
        <Picks title="Sits" options={STROKE_POSITIONS} value={st.position} onPick={set('stroke.position')} />
        <Picks title="Around" options={STROKE_AROUND} value={st.around} onPick={set('stroke.around')} />
        <Picks title="Ends" options={CAPS} value={st.cap} onPick={set('stroke.cap')} />
        <PaintField label="Colour" paint={st.paint} path="stroke.paint" onSet={setLayer} />
      </Fx>
      <Fx title="Fill outline" on={layer.fillStroke.on} onToggle={set('fillStroke.on')} hint="An edge round the filled part only, growing with it.">
        {colourOf(layer, 'fillStroke', 'Fill outline')}
        <Slider label="Width" min="1" max="30" value={layer.fillStroke.width} onInput={f('fillStroke.width')} />
      </Fx>
    </>
  );
}

function ShapeTab({ layer }) {
  return (
    <>
      <Group title="Shape">
        <Chips label="Shape" options={SHAPES} value={layer.shape} onPick={set('shape')} />
        <Slider label="Roundness" min="0" max={half(layer.w, layer.h)} value={layer.radius} onInput={f('radius')} />
      </Group>
      <Fx title="Fill" on={layer.fillOn} onToggle={set('fillOn')} hint="Off leaves just the outline.">
        <PaintField label="Fill" paint={layer.fill} path="fill" onSet={setLayer} />
      </Fx>
      <Group title="Outline">
        <Slider label="Width" min="0" max="60" value={layer.stroke} onInput={f('stroke')} />
        <ColourAlpha
          label="Outline"
          color={layer.strokeColor}
          alpha={layer.strokeAlpha}
          onColour={set('strokeColor')}
          onAlpha={f('strokeAlpha')}
        />
      </Group>
    </>
  );
}

function TextTab({ layer }) {
  return (
    <>
      <Group title="Text">
        <textarea class="input" rows={2} aria-label="Text" value={layer.text} onInput={f('text')} />
        <p class="hint">{'{percent}, {frame}, {frames} and {left} change with every step.'}</p>
      </Group>
      <Group title="Type">
        <FontPick value={layer.font} path="font" />
        <Slider label="Size" min="6" max="600" value={layer.size} onInput={f('size')} />
        <div class="pb-inline">
          <Check label="Bold" checked={layer.bold} onChange={f('bold')} />
          <Check label="Italic" checked={layer.italic} onChange={f('italic')} />
        </div>
        <Picks label="Align" options={ALIGNS} value={layer.align} onPick={set('align')} />
      </Group>
      <Group title="Colour">
        <PaintField label="Colour" paint={layer.fill} path="fill" onSet={setLayer} />
      </Group>
      <Group title="Outline">
        <Slider label="Width" min="0" max="40" value={layer.stroke} onInput={f('stroke')} />
        <div class="pb-stop">
          <ColourField label="Outline" value={layer.strokeColor} onChange={set('strokeColor')} />
        </div>
      </Group>
    </>
  );
}

export function LayerProps({ layer, tab }) {
  let body = null;
  if (tab === 'layer') body = <LayerTab layer={layer} />;
  else if (tab === 'effects')
    body = (
      <>
        {layer.type === 'bar' && <BarEffects layer={layer} />}
        <LayerFx layer={layer} />
      </>
    );
  else if (layer.type === 'bar')
    body = {
      shape: <BarShape layer={layer} />,
      fill: <BarFill layer={layer} />,
      track: <BarTrack layer={layer} />,
      stroke: <BarStroke layer={layer} />,
    }[tab];
  else if (layer.type === 'shape' && tab === 'shape') body = <ShapeTab layer={layer} />;
  else if (layer.type === 'text' && tab === 'text') body = <TextTab layer={layer} />;
  return <div class="pb-props">{body}</div>;
}
