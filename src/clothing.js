// Classic Roblox clothing on the R6 body. A shirt or pants picture is the
// 585×559 template Roblox folds around the blocky parts; the regions below
// were measured from Roblox's own template (Creator Hub, "Classic clothing").
// Each face of each part gets texture coordinates into its region, as seen
// from outside the character, and each part gets its own picture: its body
// colour, then pants (torso and legs), then the shirt (torso and arms), then
// a T-shirt on the torso's front, as Roblox layers them.

import { CanvasTexture, Float32BufferAttribute, SRGBColorSpace } from 'three';

const W = 585;
const H = 559;
const box = (x, y, w, h) => ({ x, y, w, h });
const TORSO = {
  F: box(231, 74, 128, 128),
  B: box(427, 74, 128, 128),
  R: box(165, 74, 64, 128),
  L: box(361, 74, 64, 128),
  U: box(231, 8, 128, 64),
  D: box(231, 204, 128, 64),
};
// The right arm's block is also the right leg's on pants, and the left likewise.
const RIGHT = {
  L: box(19, 355, 64, 128),
  B: box(85, 355, 64, 128),
  R: box(151, 355, 64, 128),
  F: box(217, 355, 64, 128),
  U: box(217, 289, 64, 64),
  D: box(217, 485, 64, 64),
};
const LEFT = {
  F: box(308, 355, 64, 128),
  L: box(374, 355, 64, 128),
  B: box(440, 355, 64, 128),
  R: box(506, 355, 64, 128),
  U: box(308, 289, 64, 64),
  D: box(308, 485, 64, 64),
};
export const REGIONS = { Torso: TORSO, 'Right Arm': RIGHT, 'Right Leg': RIGHT, 'Left Arm': LEFT, 'Left Leg': LEFT };

/**
 * Gives a centred part geometry (facing +z, x the character's left) texture
 * coordinates into the template. Positions are three floats per corner, no
 * index: every three corners are a triangle.
 */
export function addTemplateUVs(geometry, name) {
  const regions = REGIONS[name];
  if (!regions || geometry.getAttribute('uv')) return;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const size = [max.x - min.x, max.y - min.y, max.z - min.z];
  const p = geometry.getAttribute('position').array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let t = 0; t < p.length; t += 9) {
    // The triangle's facing picks the face.
    const a = [p[t], p[t + 1], p[t + 2]];
    const e1 = [p[t + 3] - a[0], p[t + 4] - a[1], p[t + 5] - a[2]];
    const e2 = [p[t + 6] - a[0], p[t + 7] - a[1], p[t + 8] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const axis = [0, 1, 2].reduce((best, i) => (Math.abs(n[i]) > Math.abs(n[best]) ? i : best), 0);
    const face = axis === 2 ? (n[2] > 0 ? 'F' : 'B') : axis === 0 ? (n[0] > 0 ? 'L' : 'R') : n[1] > 0 ? 'U' : 'D';
    const r = regions[face];
    for (let k = 0; k < 3; k++) {
      const i = t + k * 3;
      const [x, y, z] = [(p[i] - min.x) / size[0], (p[i + 1] - min.y) / size[1], (p[i + 2] - min.z) / size[2]];
      // (u across, v down) as the face is seen from outside.
      const [u, v] = {
        F: [x, 1 - y],
        B: [1 - x, 1 - y],
        L: [1 - z, 1 - y],
        R: [z, 1 - y],
        U: [x, z],
        D: [x, 1 - z],
      }[face];
      const px = r.x + u * r.w;
      const py = r.y + v * r.h;
      const j = (i / 3) * 2;
      uv[j] = px / W;
      uv[j + 1] = 1 - py / H;
    }
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}

const loadImage = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const COLOR_KEYS = {
  Head: 'headColor3',
  Torso: 'torsoColor3',
  'Right Arm': 'rightArmColor3',
  'Left Arm': 'leftArmColor3',
  'Right Leg': 'rightLegColor3',
  'Left Leg': 'leftLegColor3',
};

/** The body colour Roblox gives a part ("A3A2A5" → "#a3a2a5"), or null. */
export const bodyColor = (colors, name) => (colors?.[COLOR_KEYS[name]] ? `#${colors[COLOR_KEYS[name]]}` : null);

/**
 * One texture per clothed part, from `look` { bodyColors, shirt, pants,
 * tshirt } (picture URLs). Resolves { Torso: CanvasTexture, ... }.
 */
export async function composeClothing(look) {
  const [shirt, pants, tshirt] = await Promise.all([look.shirt, look.pants, look.tshirt].map(loadImage));
  const out = {};
  for (const name of Object.keys(REGIONS)) {
    const layers = [];
    if (pants && (name === 'Torso' || name.endsWith('Leg'))) layers.push(pants);
    if (shirt && (name === 'Torso' || name.endsWith('Arm'))) layers.push(shirt);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = bodyColor(look.bodyColors, name) ?? '#a3a2a5';
    g.fillRect(0, 0, W, H);
    for (const img of layers) g.drawImage(img, 0, 0, W, H);
    if (tshirt && name === 'Torso') {
      const f = TORSO.F;
      g.drawImage(tshirt, f.x, f.y, f.w, f.h);
    }
    const texture = new CanvasTexture(c);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    out[name] = texture;
  }
  return out;
}

export { loadImage };
