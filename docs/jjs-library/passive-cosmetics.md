# Cosmetics: outfit meshes, hair particles, camera

Tags: passive, cosmetic, outfit, accessory, mesh, visibility, hair, particle, camera, fov

Two appearance skills. Outfit (on spawn, kept through moveset changes): a
lower max health (`HealthMultiplier 0.9` forever), accessory meshes worn
forever, and `Visibility` visuals hiding parts of the body. Hair: two
particle emitters for hair, a `Camera` effect and an `FOV` change.

Reuse it for: character looks (`Mesh` visuals with `TIME` forever),
hiding body parts (`Visibility`), stat changes on spawn.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character1.txt` and `accurate-m1s-gon-freeccs.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key undefined: "Outfit"

Cooldown 0 · Properties: USE, AWK, NOCANCEL, AWK2, NOSTUN, KEEP

```text
Line (runs on use)
    0  STATE HealthMultiplier = 0.9 for forever
      fx: Mesh (tag "Anchor", Right Arm, forever) · Mesh (tag "Outfit", Head, forever) · Mesh (tag "Outfit", Head, forever) · Visibility (tag "Outfit", 0.1 s) · Visibility (tag "Outfit", Head, forever) · Visibility (tag "Outfit", Torso, 0.1 s) · Visibility (tag "Outfit", Right Arm, 0.1 s) · Visibility (tag "Outfit", Left Arm, 0.1 s) · Visibility (tag "Outfit", Right Leg, 0.1 s) · Visibility (tag "Outfit", Left Leg, 0.1 s)
```
### SKILL on key 9: "Hair"

Cooldown 0 · Properties: NOCANCEL, AWK2, AWK, NOSTUN

```text
Line (runs on use)
      fx: particle 9449395070 ×1 · particle 7216847958 ×1 · Camera · FOV 50
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). 2 skills.

```text
KLUv/WCFC50cANZpgifwqswDVJH3JM/YO3ZQoCBUdeFvqQoZVkJSup0oIkTJSngYFofFVwJ1AHYAeABNA6NssJ03BXm23yNUp6xS1NDmoZJOTOMCN0Z8lxipZdv4uM6jdBbvwohYvI1TfJ/i98stz75P33uMGm5O3y8D8+8QBNN3TtLl7xA/veW2+iin145d5b2pj58zXmQGi49v6SCWy/7pL8Pqj9zls0xfVfYhCAKRU5towigTNk7xMBKiEIWepkrpkTOSzlMpjSDocaIoSYycvt8BnMEo67R8Y5EKx6CuZd2Fz0JLRKHDvmP2go9qA0wiCBIbYDnMVstwg8LoMDIBo9Qbc5zt63ukk1LnmVCtjayS1jbDfu/80jDsco2h3jBfSlsq1b1X9n1zuKB2ls6EUfpq2dIYckUAzt+jhKQjNVKt0sSMC+OEFUbnuzT94y6+blNUvA3y01+Yw7w3//gREde9C63xbGu6cNitF46bad8hpu+UyXcxcAUKXIZweVL5JvzB0nndQVfpGpORkOcHx5S9NsTIhIQq5MwoBQ1c14CQCUzwuM6SjlMTl01dDFcOM2kCxoZ6W2eRcJIJxeF+nx48gwEaZ/bO+MTHuZll7YHvMXIkqEbPpBCFsfkOowMx8vu1cM4UzrKrMYDvlL6YvTJtMV6jjNLBtIqiJXjfxLF93MJGKUg6hM2614NDfTG2pZwBgJWokRFiTNGIjDQFSWEYAzACQhCpKuoBEoAiiRCkMAwZhBAhAoOQaCQQiWZEJAoFcQPR0HwT8Y+b0vw62GEMRpCp+rvtgqr8CX28tvNIt3qBMASWUbSGKDKNTALWCKnNjjJjD8QW/OEk8G3EPJDmXmIbUL0pSL7hdOMd0RmA2aGgpzlYE6n6QynwBfwn3crIZBJwjkG0b0dRZWmoMZwrG5crP+0tSWir41WBshNIJSlfYvOzCR1d1W+Dy+qsTYMVl6x0dZTbgb+tuDND9zR3M8fYCA95YaYewhdXjpI9XFTMnRzO3nrOTP5X0f2xmeaNjZGQlbjODrpI+pvoKIX13pleUx1tOJK8NVsHEFSeYnfpAXDr/Hjjl/KjnY4bdnkiXhcDfKGqFhGuNZfsEIV2MjBA5s0liUrDGw+cMwL1tBLZGp5aJIwXyAMNMsz4BJ/qqtNrGnOPc6zlz5x6PyWHDfuvfU8AhyiHfJb5Z1OKcyDstvtsXc8cOXsUSFMEk1rujzBWKOdUAw==
```
