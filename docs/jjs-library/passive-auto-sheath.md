# Weapon worn on the back, drawn by attacks

Tags: passive, weapon, sheath, holster, mesh, sword, katana

The weapon mesh sits on your back; when a move sets `UseKatana = True` it
jumps to your hand, and a few seconds after the last attack it goes back, with
a sound and a flash.

How it works:
- Line: wear the weapon (and scabbard) on the back (`Mesh`, `TIME` forever,
  a `VISUAL TAG`), then `Looper`.
- Looper: every 0.02 s, `TAG check UseKatana "True" → Unsheath`.
- Unsheath: `Cancel` the one on the back, wear one in the hand, then
  `KeepKatana`: loop while the tag holds; when it runs out → `Sheath` (the
  sheathe sound and anim, swap the meshes back, a flash).

Reuse it for: wearable items, anything that swaps between two looks on a
tag.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 9: "SheathPassive"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL

```text
Line (runs on use)
      fx: Mesh (tag "Katana", Torso, forever) · Mesh (tag "Scabbard", Torso, forever)
    2  BRANCH → "Looper"

Branch "Looper"
    0  WAIT 0.02
    1  TAG check UseKatana "True" → "Unsheath"
    2  BRANCH → "Looper"

Branch "Sheath"
      fx: sound 104914827478403 ×0.8
    1  ANIM [13,4] (Yuta.Sheath) FADE OUT=0
    2  WAIT 0.3
      fx: Cancel "KatanaHand" · Mesh (tag "Katana", Torso, forever) · Clash (Torso, 0.1 s) · Burst (Torso) · Clash (Torso, 0.1 s) · Sparks (Torso, 0.2 s) · Star (Torso, 0.1 s) · Mass Hit (Torso) · Mass Hit (Torso)
   12  BRANCH → "Looper"

Branch "KeepKatana"
    0  WAIT 0.02
    1  TAG check UseKatana "True" → "KeepKatana"
    2  BRANCH → "Sheath"

Branch "Unsheath"
      fx: Cancel "Katana" · Mesh (tag "KatanaHand", Right Arm, forever)
    2  BRANCH → "KeepKatana"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WBVHWUnAGaneyfwzOgBpqkyXsWnIYDST1eJQGWQ4ga9NRyAS+4JV0QNi/AwLA6LrwRvAHAAbgAdgmmXwIwP0xq6QgRXNAfwzdue7zolz6Xn/D3QgdJzWtX9fINdLPb5oxRIzx+wnGEZDMY+30jPKwiXnjWeb176uSf17196q25nMd7/GNJPqLUVYgD591iERdO6VdF0rKJfelrN+w+DyDTSU9T8TUEEVUMU+aBYoC8DC+NIiWRCwgQjgtKBD0pojdBsVfVOSi1NpzunneeGoFwopOJZyMiQMNYBh77Vzga2As/f4rI4cmFHqel4/iCMpOfUpRtl21Q/55CJPibt8pjuzA0A6eG2nhhEtp9fdkaev+f90jUBWbeTrbd15Uz3rQ0YwqVPE3U4qEM2naayYMnPLTehcAPKNJKpdhe7e2UIiwmX/nguOTsvXSOXOtFcKSdwq560amy5B5/juufG+V64mu5F0ZPxtjNfe4BOdp2mhalqLZ7cnZOrcHY4Gql7WpqjAwOUDUp/JZiyGE//fsP3gUjmvbbGVzIzmEyRkPWDg46gE46MzkJCkgFtG2VzHvfkAkKdwTBItDycpvUqaiKMUWPIekY/CvlotAyiESF0HukegxEZThR7wxSlAysaVi2iezACYLQMsx0I4F6EUSI+ikghJYwBgS+oARpCNDQiSZJkYwxhBIQgpRzljB4SAOI4DAQxkqOgQQIiRERgDCHECEQCERERISGSB9HtVRoE9vG/Y0U08bnKNMuZOvdYAzLs8PZjugFXiPoBCEfNqAUgbMcACGwtHK7ztsAQ1QGiZABTXf2sYJBTRJYynYZv+E4z6nCOPQxwjXHF9EVE/YIDQzVNFVSEcRPIh7amvScoa/hIFo/QLEEoJyZaiozTF0BTnvdPoBQ5FkB+OHAgMI7+EUwtpNmlpOhD1JCJ5fmQOjG7HrPF6IudH7qI+xH1HyZPwdr+JB3gCyDB3fDQdW+EKAF/Q4fzP9Lgdajipcm4/GUg0JLgVqlMKzGSlqhfClAVrm6Nn6Z5VinZi8ZiSNOhky62kJyYiNqKfAwD0CYGO1QUIOxG2MxPvSDAVOjC0P2zQdA4OSUBV8lXwRzIQhHGmgdkaw7dNgmMMjDfH1iwOnHMQC0pCKYK19N0yE2RyERi/5ECS78B4CMA1jWgEIFCDszBg7wBiyq3oAB0CAKlZS4fHhOfPhO1MwrVpkmBJAxSsMVSRx/AwEHNZgoJrShQ4Au2gKOeYi0xSMpBGw0CulrgjG2PXwFRQfhCxnyPOlfFoWzcyAuxlOQTJWovFb8gxnFOscuvIDs+j/abJGVNjnJSDG8NIUWUKPGL3CDofD1gfaXbQnGtBm+4Qgoaqe+VsoONX/wz9/iHd9nfJu7mJv13fZWJ0vCkToYz1seu5ZWXB9oJK6iZn0kSq4lx4ZnKVc1GktHXsFIUzhRJdsS9km3I601nMsU6XyL08xEqChYYv8UlKnmgz8gt2SgNiybhTU0prbgncTTul7E2ANQM1ji75FfeAS/QRCj+6rxTcdUHX+EAX0JyOpxwPxFbGKxvAAW5i+P2f0ekRjJBAAifRiseeUf6dSGLIFWXaV5g5BWd2FJIRa69A5IDJVZqJlb80P0LfG/5w78raeHRXFfgkLuPxf2zLgh1fOuGlrOcCI3tKMkpGERZJI0LixDzc6lVAw==
```
