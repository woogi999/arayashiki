# Summoned projectile aimed at the last one hit, bouncing

Tags: projectile, summon, aim, homing, bounce, reflect, ball

Summon a ball beside you, then throw it at whoever you last hit. It bounces
off walls (up to 20 times).

How it works:
- Not usable in the air (`Req` NOT AIR). `SETCD` at once.
- An anchor projectile (`SPEED 0`) holds the summon effects at
  `"5, -3, -3"`, you hover a moment (`VELO "0, 0.01, 0"`), `WAIT 0.5`.
- The throw: `PROJECTILE` from `"5, 9, 1"` at `SPEED 120`, `ROTATION "-7, 0, 0"`
  (a little down), **`AIM LAST HIT 15`** (at whoever you hit in the last 15 s),
  **`REFLECT COUNT 20`**, `CONTINUE`, 3 damage, 1.1 s stun →
  `BRANCH TARGET "OnHitTarget"`. Effects ride it with its `PROJECTILE TAG`.

Reuse it for: aimed or homing projectiles, bouncing ones, summons.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 1: "Arisugawa Sparkle"

Cooldown 12 · Properties: REP, AWK, NOSTUN, NOCANCEL, KEEP · Usable only if not AIR

```text
Line (runs on use)
    0  SETCD (its usual cooldown)
    1  ANIM [20,1] (MeiMei.BirdCall) FADE OUT=0.2
    2  PROJECTILE SPEED=0 ATTACK TYPE="Domain" CONTINUE=true POSITION="5, -3, -3" TIME=3 PROJECTILE TAG="ArisugawaSparkle"
    3  VELO TIME=0.7 FORCE="0, 0.01, 0" FADE=true
    4  STATE Stun = 0.5 for 0.5 s
    5  STATE DirectionLock = 0.5 for 0.5 s
    6  STATE InSkill = 0.5 for 0.5 s
      fx: sound 82891453696514 ×5 · Wind Expand (on ArisugawaSparkle) · Wind Expand (on ArisugawaSparkle) · Circle Glow (on ArisugawaSparkle, 0.2 s) · Sparks (on ArisugawaSparkle) · Clash (on ArisugawaSparkle, 0.7 s) · Clash (on ArisugawaSparkle, 0.7 s) · Mesh (on ArisugawaSparkle, 0.5 s) · Mesh (tag "Bally", on ArisugawaSparkle, 0.5 s) · Mesh (on ArisugawaSparkle, 0.5 s)
   17  WAIT 0.5
   18  PROJECTILE SIZE="7, 7, 7" SPEED=120 ATTACK TYPE="Bullet" CONTINUE=true CLEAR KNOCKBACK=true STUN=1.1 POSITION="5, 9, 1" REFLECT COUNT=20 BRANCH TARGET="OnHitTarget" HIT RAGDOLL=true DAMAGE=3 STUN ANIM=true ROTATION="-7, 0, 0" PROJECTILE TAG="BeachBall" AIM LAST HIT=15
      fx: sound 9113570399 ×3 · Mesh (on BeachBall) · Flames (on BeachBall, 0.2 s) · Clash (tag "nil", on ArisugawaSparkle, 0.2 s) · Clash (tag "nil", on ArisugawaSparkle, 0.2 s) · Sparks (tag "nil", on ArisugawaSparkle, 0.2 s) · Sparks (tag "nil", on ArisugawaSparkle, 0.2 s) · 360 Wind (tag "nil", on ArisugawaSparkle) · Ring (tag "nil", on ArisugawaSparkle, 0.2 s) · Mesh (on ArisugawaSparkle, 0.7 s)
   29  WAIT 0.2
      fx: Wind Expand (on ArisugawaSparkle) · Wind Expand (on ArisugawaSparkle) · Circle Glow (on ArisugawaSparkle, 0.2 s) · Sparks (on ArisugawaSparkle) · Clash (on ArisugawaSparkle, 0.7 s) · Clash (on ArisugawaSparkle, 0.7 s) · Mesh (on ArisugawaSparkle, 0.5 s)

Branch "OnHit"

Branch "OnHitTarget"
    0  STATE Stun for 1.1 s
      fx: sound 77425156242780 ×0.65
    2  VELO TIME=0.1 FORCE="0, 0, 10" RAGDOLL=0.1
      fx: Glow (0.2 s) · Clash (0.2 s) · Clash (0.2 s) · Circle Glow (0.2 s) · Black Flash (0.1 s) · Sparks (0.2 s)
    9  ANIM [15,25] (Mechamaru.Absolute.Stagger) FADE OUT=0
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WCnMKU8AKb/vyfwruoBDMUF6QM1DKT8e1A5AGtMG6sUI+AIoW3XX3RBVhILi8Pi8EK0ALUAswD7KtAOoajWtN4GhVD4Nn6/igSnLUy/3aLU71fVemG/H3zQCK0m8UF5gGUIEWv9jliLPsmA02+dYa8Vdfx+k0ZCkSNNSJIix4GcyYAPSqodqPld/K4oXbHf0+9tcTD9rnTb/f0uKuRWyqKUlWkMWxAJ/b2vmn9bTL8hLJfrt8VPTzWt/v1Pf1ntF2P9L05fUO+1EAwB8u8rnMNFg8Bcm9AYMhLbhf70NUKtf5XMBTN9VdG3OAgbJaO2FL0wZUvIUL+nAo0pdBoERXWFbpP8pqrDUX+/SzPMYjK4s9lW/rAsRquV4QiFjfQ3IyhGf46U8cWU60sDKIvmhkdwdngdsJremg0s5sT5SE8znShFMrIEjuziAY7bHLDOOlAst7NsGErlsk0GvHSgaqqxWSvqwLcOQH8RMqA/+JvKGGLAB9X+rKaqAM5XQaRa1ZuI1VdWIVTiNWPrYRsAf/M3ttpi+Mosqy1MdZv2YKk+koTSn5yS2zoZ/cHZ+Hv8NTNKVB40ziFJrSFJDYRmE6PUxCnANUavRyxtoGgVyK1MN78rey+mcPWg2bUNYLhoGrMFdPh3fWSqnarXUXP0J/mbjEjRBoTCFsQzrZfCVDgu05DRH/RbWyqR2IwiANU4u75TQo804ePMOf05cVZwnNaIJIz0leVctWXdwlIkQRKKUMyZJqgaxkpkxhhFkNTEOJ8GCY2DJGYE8AdhM2HhHl7hKJeTCxmntyS4uhhT//7i4mJyMZnyzXhhfJ0JJUhKyWkghnwN1DTxcaIEHSih9DCi4y/O6HAHisY1YhQ9DJjrQK6YlV20C2OxZIXN0mkPmYDflxdUuAHlRetsBJAeYfRXs6xp1g18HwyYqcYiSDrymXFKB4Kgdcy1Ve2lHgZ8EM4aQHUZDAZQWdUtrLGcNRyzk0kDpdMujd/ZUnsdvy0iKllCkaHbctwkDp8mPtFfFEUGnDHyN6cMgdOoIRoyMzQiSVJQyHJhBIQgxJiUjvYSINIYB4IkyGFKIUOIIcQQIiIiIiIiIiIzJeppsAWsjzv2wyAF+zpj3b0cRQiqOXNjDKxm+mu2LDTwBcyRX7qZueiSuQAvOrVE/fQJwnDUwkN+wWopU5BccMhLiocGpam32NGLm8hUqhAL0HDL0HvYyfu47P6GMOMwJSDllxkwvybw4q/sGwNFG12Ovrm0t40Er1HsAKzITr8y4vhPL31mccXPH41RX0iCEi2czom9WO6mx/G2SNc/OQ+/OiiHWPNbG5UvH3OOfPBkgILaENk40hBPgYqKQw/yDehtLwbc0HzVyRC9VAQAn0TAZEFHtF9hAEgN92QNKnSRCGlq0Jk43ibdblLsuoeZORELEFzNL8yvGFdvPIAaVCWIB+H5Ai+k8N4CXCtu6QrdlkUrpyzUKH0sHlHlCTleju9lN5D+Ecpf2aEBFVAk3qXkQpQNlhzYzse/rUMaqIRO7EBG/w+gmW+Cy8S3gpBTGXnKRxuZn6aW+1bodLsm3sWn7UQJe/bjU5HZWEhV6H+O7X/j2Fir8yFDhQBFCI2ySMdK/ylmfz36y7P8VN86k1CDBTkc/NrfWdscOl5HhB0pHbsKcikoQKRLOh8ngjSznyBNh3qbCedmiqFvoiudl+xCQqpyXLNGgiE6CwUNXILxI1XDIL+OnoE0XWhM6gAklJDtomQADcUun4mouqcai0oDwEcVgK8HgYSGQLT4iBODc8GC6auqPG/AP90B6u8AjUIRYsq5iQ8G02skZduyxlQmaCemWTOHQFu48Je6KDCSYiZTni+PWJIOlQXi3v0Zo2BUTifQ5ZcZ5PAxgYAHj7bSbp4ycRVV1p1ae0OvZpUBHrAw3bOFdDDm7jhtJBxSxXu4aTnhq69NAoyAVhsCJziFz/nuWDR/TrwKxd1jy6BUIxD/QuzgOOyWSWaThaloibsaS2MbyglP1XqWmB1rlMra84DjCIT6FAaC2NpvfJDCgVIOHAWysn22Wp8BjYvj1qqRdw7Mr2evTUPV+vJUwFda74+yy7KlxW+dCre4oJiDQAxhHslc5K2Rh5gBEqEbn3lfbDNk9ZBJ2sfMTVKiuNTlIqw/suxWnmeX6Mv1U7RdxSMOgTBSIThUbkpVVj44zG0mmpT+hKImIUR10hcjVm5yN4nqBfRlJZCeOX1BYKBl1k9lGUOCP8ILQxvQVcF4BxMEPSGk3In+/vCJ3YvIE3ztV6cguEZpz3YqB6QVNKyxrhcDjaa4iY2M0Cz+gwEZeySkSqzz2YymnLOY0nJEWMUwFs4s7TW2hWCyNMstJ+cNx1R239yMbmqP4YnU1t5zhpyYhJWRRSJD7wMNJDLmwKJL4IkIpxdzos6x7nEbgcPkuJaLr5OloOnoxfbhO2lWOSeC5mruU7eN5HU35+vdauCpRPczuD5Py+WQW6C5QJCzRCRYBmagjyoLAwu8B7Hn5tGt3RnQZ3QRi2A/ZlxmwB7RVT5RSq6jHJ8IqZzD6LAA8rlXZ9CdJ4VISH/mU24eeNA1UQYRQtenpbpSg2dgRlQB
```
