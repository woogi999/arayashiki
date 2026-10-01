// Reads what the simulator's 3D view needs to draw JJS's effects and
// animations the way the game does, from Jujutsu Shenanigans open in Roblox
// Studio (its MCP server on, as for `npm run game-data`):
//
//   src/assets/jjs-fx.json      every BuilderFX template (the parts, meshes,
//                               decals, particle emitters, beams, trails and
//                               lights each VISUAL effect clones), with the
//                               properties the view reads
//   src/assets/jjs-anims/*.json each Animation the Skill Builder can play
//                               (ANIM_SETS), as its KeyframeSequence, when
//                               Studio can load it
//
// With `--source <file>` it also saves BuilderFX's own source there, to read
// (not for the repo). Run: npm run fx-data [-- --source path] [-- --no-anims]
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { connect } from './studio-mcp.mjs';
import { EFFECTS, ANIM_SETS } from '../core/gamedata.js';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const sourceOut = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const withAnims = !args.includes('--no-anims');

// Luau: turns a Roblox value into JSON-able data.
const ENCODE = `
local HS = game:GetService("HttpService")
local function r(x) return math.round(x * 10000) / 10000 end
local encode
local function c3(c) return { math.round(c.R * 255), math.round(c.G * 255), math.round(c.B * 255) } end
encode = function(v, base)
  local t = typeof(v)
  if t == "number" then return r(v)
  elseif t == "boolean" or t == "string" then return v
  elseif t == "Vector3" then return { r(v.X), r(v.Y), r(v.Z) }
  elseif t == "Vector2" then return { r(v.X), r(v.Y) }
  elseif t == "Color3" then return c3(v)
  elseif t == "CFrame" then local o = {} for i, n in ipairs({ v:GetComponents() }) do o[i] = r(n) end return o
  elseif t == "NumberRange" then return { r(v.Min), r(v.Max) }
  elseif t == "NumberSequence" then local o = {} for _, k in ipairs(v.Keypoints) do table.insert(o, { r(k.Time), r(k.Value), r(k.Envelope) }) end return o
  elseif t == "ColorSequence" then local o = {} for _, k in ipairs(v.Keypoints) do table.insert(o, { r(k.Time), c3(k.Value) }) end return o
  elseif t == "EnumItem" then return v.Name
  elseif t == "UDim2" then return { r(v.X.Scale), v.X.Offset, r(v.Y.Scale), v.Y.Offset }
  elseif t == "UDim" then return { r(v.Scale), v.Offset }
  elseif t == "Instance" then return base and v:IsDescendantOf(base) and ("@" .. v:GetFullName():sub(#base:GetFullName() + 2)) or ("@@" .. v.Name)
  elseif t == "Faces" then return { v.Top, v.Bottom, v.Left, v.Right, v.Back, v.Front }
  end
  return tostring(v)
end
`;

const TEMPLATES = `
${ENCODE}
local PROPS = {
  { "BasePart", { "Size", "CFrame", "Color", "Transparency", "Material", "Reflectance", "CastShadow" } },
  { "Part", { "Shape" } },
  { "MeshPart", { "MeshId", "TextureID", "MeshSize" } },
  { "SpecialMesh", { "MeshType", "MeshId", "TextureId", "Scale", "Offset", "VertexColor" } },
  { "BlockMesh", { "Scale", "Offset" } },
  { "Decal", { "Texture", "Face", "Transparency", "Color3", "ZIndex" } },
  { "Texture", { "StudsPerTileU", "StudsPerTileV", "OffsetStudsU", "OffsetStudsV" } },
  { "Attachment", { "CFrame" } },
  { "ParticleEmitter", { "Texture", "Color", "Size", "Transparency", "Squash", "Lifetime", "Speed", "Rate",
      "Rotation", "RotSpeed", "SpreadAngle", "Acceleration", "Drag", "LightEmission", "LightInfluence", "Brightness",
      "ZOffset", "Orientation", "EmissionDirection", "Shape", "ShapeInOut", "ShapeStyle", "ShapePartial",
      "FlipbookLayout", "FlipbookMode", "FlipbookFramerate", "FlipbookStartRandom", "LockedToPart",
      "VelocityInheritance", "TimeScale", "Enabled", "WindAffectsDrag" } },
  { "Beam", { "Attachment0", "Attachment1", "Texture", "TextureLength", "TextureMode", "TextureSpeed", "Color",
      "Transparency", "Width0", "Width1", "CurveSize0", "CurveSize1", "Segments", "FaceCamera", "LightEmission",
      "LightInfluence", "Brightness", "ZOffset", "Enabled" } },
  { "Trail", { "Attachment0", "Attachment1", "Texture", "TextureLength", "TextureMode", "Color", "Transparency",
      "Lifetime", "MinLength", "MaxLength", "WidthScale", "FaceCamera", "LightEmission", "LightInfluence",
      "Brightness", "Enabled" } },
  { "Light", { "Brightness", "Color", "Enabled", "Shadows" } },
  { "PointLight", { "Range" } },
  { "SpotLight", { "Range", "Angle", "Face" } },
  { "Highlight", { "FillColor", "FillTransparency", "OutlineColor", "OutlineTransparency", "DepthMode" } },
  { "JointInstance", { "C0", "C1", "Part0", "Part1" } },
  { "BillboardGui", { "Size", "StudsOffset", "StudsOffsetWorldSpace", "ExtentsOffset", "LightInfluence", "AlwaysOnTop", "MaxDistance" } },
  { "SurfaceGui", { "Face", "CanvasSize", "LightInfluence", "AlwaysOnTop" } },
  { "GuiObject", { "Size", "Position", "AnchorPoint", "Rotation", "BackgroundTransparency", "BackgroundColor3", "ZIndex", "Visible" } },
  { "ImageLabel", { "Image", "ImageColor3", "ImageTransparency", "ScaleType", "ImageRectOffset", "ImageRectSize" } },
  { "UIGradient", { "Color", "Transparency", "Rotation", "Offset" } },
  { "Model", { "PrimaryPart" } },
  { "ValueBase", { "Value" } },
}
local function dump(inst, base)
  local node = { class = inst.ClassName, name = inst.Name, props = {}, children = {} }
  for _, entry in ipairs(PROPS) do
    if inst:IsA(entry[1]) then
      for _, p in ipairs(entry[2]) do
        local ok, v = pcall(function() return inst[p] end)
        if ok and v ~= nil then node.props[p] = encode(v, base) end
      end
    end
  end
  local attrs = inst:GetAttributes()
  if next(attrs) then node.attrs = {} for k, v in pairs(attrs) do node.attrs[k] = encode(v, base) end end
  if inst:IsA("LuaSourceContainer") then node.script = true end
  for _, c in ipairs(inst:GetChildren()) do table.insert(node.children, dump(c, base)) end
  return node
end
local utils
for _, d in ipairs(game:GetDescendants()) do
  if d.Name == "Utils" and d:FindFirstChild("BuilderFX") then utils = d break end
end
local out = { utils = utils and utils:GetFullName() or nil, templates = {}, missing = {} }
local function find(path)
  local cur = utils
  local first = true
  for seg in path:gmatch("[^%.]+") do
    if first and seg == "Utils" then first = false
    else first = false cur = cur and cur:FindFirstChild(seg) end
  end
  return cur
end
for _, path in ipairs(HS:JSONDecode(__PATHS)) do
  local inst = find(path)
  if inst then out.templates[path] = dump(inst, inst) else table.insert(out.missing, path) end
end
if utils and utils:FindFirstChild("BuilderFX") then out.builderfx = dump(utils.BuilderFX, utils.BuilderFX) end
`;

// One animation's KeyframeSequence: keyframes with each joint's pose.
const ANIM = `
${ENCODE}
local KSP = game:GetService("KeyframeSequenceProvider")
local function pose(p)
  local o = { name = p.Name, cf = encode(p.CFrame), w = encode(p.Weight),
    style = p.EasingStyle.Name, dir = p.EasingDirection.Name, sub = {} }
  for _, c in ipairs(p:GetSubPoses()) do table.insert(o.sub, pose(c)) end
  return o
end
local ok, seq = pcall(function() return KSP:GetKeyframeSequenceAsync("rbxassetid://" .. __ID) end)
local out
if not ok or not seq then out = { error = tostring(seq) } else
  out = { loop = seq.Loop, priority = seq.Priority.Name, keyframes = {}, markers = {} }
  for _, k in ipairs(seq:GetKeyframes()) do
    local kf = { t = encode(k.Time), poses = {} }
    for _, p in ipairs(k:GetPoses()) do table.insert(kf.poses, pose(p)) end
    for _, m in ipairs(k:GetMarkers()) do table.insert(out.markers, { t = encode(k.Time), name = m.Name, value = m.Value }) end
    table.insert(out.keyframes, kf)
  end
  table.sort(out.keyframes, function(a, b) return a.t < b.t end)
end
`;

const studio = await connect();
console.log(`Studio: ${studio.studio.name}`);
try {
  const paths = [...new Set(Object.values(EFFECTS).map((e) => e.template).filter(Boolean))];
  // BuilderFX's other children (Afterimage2's and the rest's clones).
  const fx = JSON.parse(
    await studio.big(`local __PATHS = ${JSON.stringify(JSON.stringify(paths))}\n${TEMPLATES}`, 'HS:JSONEncode(out)'),
  );
  mkdirSync(new URL('src/assets/', root), { recursive: true });
  writeFileSync(new URL('src/assets/jjs-fx.json', root), `${JSON.stringify(fx)}\n`);
  console.log(`${Object.keys(fx.templates).length} templates; missing: ${fx.missing.join(', ') || 'none'}`);

  if (sourceOut) {
    const source = await studio.big(
      `local u for _, d in ipairs(game:GetDescendants()) do if d.Name == "BuilderFX" and d:IsA("ModuleScript") then u = d break end end`,
      'u and u.Source or ""',
    );
    writeFileSync(sourceOut, source);
    console.log(`BuilderFX source → ${sourceOut} (${source.length} chars)`);
  }

  if (withAnims) {
    const dir = new URL('src/assets/jjs-anims/', root);
    mkdirSync(dir, { recursive: true });
    const ids = [...new Set(ANIM_SETS.flatMap((s) => s.anims.map(([, id]) => id)).filter(Boolean))];
    let got = 0;
    let failed = 0;
    for (const id of ids) {
      const file = new URL(`${id}.json`, dir);
      if (existsSync(file)) {
        got++;
        continue;
      }
      const text = await studio.big(`local __ID = "${id}"\n${ANIM}`, 'HS:JSONEncode(out)');
      const data = JSON.parse(text);
      if (data.error) {
        failed++;
        if (failed <= 3) console.log(`  ${id}: ${data.error}`);
        continue;
      }
      writeFileSync(file, JSON.stringify(data));
      got++;
    }
    console.log(`animations: ${got} of ${ids.length} saved, ${failed} Studio couldn't load`);
  }
} finally {
  studio.close();
}
