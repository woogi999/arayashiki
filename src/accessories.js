// An avatar's accessories (hats, hair, face, neck, shoulder, front, back and
// waist items), read from their own model files: each one's Handle (a
// MeshPart, or a Part with a SpecialMesh), its mesh and texture, and the
// attachment that says where on the body it goes. The 3D view (scene.js)
// hangs each on the matching R6 body attachment, as Roblox does.
import { robloxModel } from './platform.js';
import { readRbxm, walk } from './rbxm.js';

const id = (content) => String(content ?? '').match(/(\d{3,})/)?.[1] ?? null;

// Where each accessory attachment sits on an R6 body, in the part's own
// Roblox frame (x right, y up, -z front): Roblox's R6 rig attachments.
export const BODY_ATTACHMENTS = {
  FaceCenterAttachment: ['Head', [0, 0, 0]],
  FaceFrontAttachment: ['Head', [0, 0, -0.6]],
  HairAttachment: ['Head', [0, 0.6, 0]],
  HatAttachment: ['Head', [0, 0.6, 0]],
  BodyBackAttachment: ['Torso', [0, 0, 0.5]],
  BodyFrontAttachment: ['Torso', [0, 0, -0.5]],
  LeftCollarAttachment: ['Torso', [-1, 1, 0]],
  RightCollarAttachment: ['Torso', [1, 1, 0]],
  NeckAttachment: ['Torso', [0, 1, 0]],
  WaistBackAttachment: ['Torso', [0, -1, 0.5]],
  WaistCenterAttachment: ['Torso', [0, -1, 0]],
  WaistFrontAttachment: ['Torso', [0, -1, -0.5]],
  LeftShoulderAttachment: ['Left Arm', [0, 1, 0]],
  RightShoulderAttachment: ['Right Arm', [0, 1, 0]],
  LeftGripAttachment: ['Left Arm', [0, -1, 0]],
  RightGripAttachment: ['Right Arm', [0, -1, 0]],
  LeftFootAttachment: ['Left Leg', [0, -1, 0]],
  RightFootAttachment: ['Right Leg', [0, -1, 0]],
};

/**
 * One accessory: { name, meshId, textureId, size, meshScale, offset,
 * part, bodyAt, handleCFrame } or null when it can't be placed.
 *   size       the Handle's size (a MeshPart fits its mesh to it)
 *   meshScale  a SpecialMesh's Scale (then `size` is null) and `offset`
 *   part       the R6 body part it hangs on; `bodyAt` the body attachment's
 *              position; `handleCFrame` the Handle's attachment CFrame
 *              (x y z R00…R22) to take back off
 */
export function accessoryOf(roots, name) {
  for (const inst of walk(roots)) {
    if (inst.class !== 'Accessory' && inst.class !== 'Hat' && inst.class !== 'Accoutrement') continue;
    const handle = inst.children.find((c) => c.name === 'Handle');
    if (!handle) continue;
    const special = handle.children.find((c) => c.class === 'SpecialMesh');
    const meshId = id(handle.props.MeshId ?? handle.props.MeshContent ?? special?.props.MeshId);
    const textureId = id(handle.props.TextureID ?? handle.props.TextureContent ?? special?.props.TextureId);
    if (!meshId) return null;
    const att = handle.children.find((c) => c.class === 'Attachment' && BODY_ATTACHMENTS[c.name]);
    let part = 'Head';
    let bodyAt = [0, 0.6, 0];
    let handleCFrame = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (att) {
      [part, bodyAt] = BODY_ATTACHMENTS[att.name];
      handleCFrame = att.props.CFrame ?? handleCFrame;
    } else if (inst.props.AttachmentPoint) {
      // An old-style hat: AttachmentPoint on the head's hat point.
      handleCFrame = inst.props.AttachmentPoint;
    }
    return {
      name: name ?? inst.name,
      meshId,
      textureId,
      size: special ? null : (handle.props.size ?? handle.props.Size ?? null),
      meshScale: special?.props.Scale ?? [1, 1, 1],
      offset: special?.props.Offset ?? [0, 0, 0],
      part,
      bodyAt,
      handleCFrame,
    };
  }
  return null;
}

/** The accessories of an avatar (robloxAvatar's `accessories`), read. */
export async function loadAccessories(list = []) {
  const out = await Promise.all(
    list.map(async (a) => {
      try {
        const bytes = await robloxModel(a.id);
        return bytes ? accessoryOf(readRbxm(bytes), a.name) : null;
      } catch {
        return null;
      }
    }),
  );
  return out.filter(Boolean);
}
