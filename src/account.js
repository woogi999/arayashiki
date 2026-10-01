// The signed-in Roblox account and, if the user wants it, their avatar on
// "You" in the viewport: body colours, classic clothing (shirt, pants,
// T-shirt), face and accessories, fetched through the asset pipeline.
import { signal, effect } from '@preact/signals';
import { accountStatus, refreshAccount, robloxAvatar, robloxImage } from './platform.js';
import { loadAccessories } from './accessories.js';

export const account = signal(null); // accountStatus()
export const avatar = signal(null); // robloxAvatar()
// What the viewport dresses "You" in: null for the classic look.
export const look = signal(null);
export const useAvatar = signal(readUseAvatar());

function readUseAvatar() {
  try {
    return localStorage.getItem('arayashiki-use-avatar') !== 'false';
  } catch {
    return true;
  }
}
effect(() => {
  try {
    localStorage.setItem('arayashiki-use-avatar', String(useAvatar.value));
  } catch {
    // not kept
  }
});

const imageFor = async (item) => (item ? robloxImage(item.id) : null);

async function dress(av) {
  const pick = (type) => av.clothing?.find((c) => c.type === type);
  const [shirt, pants, tshirt, face] = await Promise.all(
    ['Shirt', 'Pants', 'TShirt', 'Face'].map((t) => imageFor(pick(t)).catch(() => null)),
  );
  const accessories = await loadAccessories(av.accessories ?? []).catch(() => []);
  return { bodyColors: av.bodyColors ?? {}, shirt, pants, tshirt, face, accessories };
}

// A user ID whose (public) avatar is being previewed instead of the account's.
export const previewing = signal(null);

/** Puts any user's avatar on "You" (avatars are public): no sign-in needed. */
export async function previewAvatar(userId) {
  const av = await robloxAvatar(String(userId).trim());
  previewing.value = String(userId).trim();
  avatar.value = av;
  look.value = await dress(av);
  return av;
}

/** Reads the account (and avatar) again: at startup and after sign-in/out. */
export async function loadAccount({ refresh = false } = {}) {
  let status = await accountStatus().catch(() => null);
  if (refresh && status?.signedIn) {
    await refreshAccount();
    status = await accountStatus().catch(() => status);
  }
  account.value = status;
  if (previewing.value && !status?.signedIn) return; // keep the preview
  previewing.value = null;
  if (!status?.signedIn) {
    avatar.value = null;
    look.value = null;
    return;
  }
  try {
    const av = await robloxAvatar();
    avatar.value = av;
    look.value = useAvatar.value ? await dress(av) : null;
  } catch {
    avatar.value = null;
    look.value = null;
  }
}

/** Turns the avatar on "You" on or off. */
export async function setUseAvatar(on) {
  useAvatar.value = on;
  look.value = on && avatar.value ? await dress(avatar.value) : null;
}
