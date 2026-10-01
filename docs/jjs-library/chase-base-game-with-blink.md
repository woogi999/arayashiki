# Chase: base-game dash, with a sidestep blink variant

Tags: chase, dash, movement, gap closer, sidestep, blink, i-frames, variant

The base game's chase: slide forward, hit the first one you reach, pin you both for a moment
and knock them back. A miss or a block leaves you open. Plus a "Blink"
variant, a sidestep, switched on for a moment by other skills setting
`BlinkVar`.

How it works:
- Line: `TAG check BlinkVar → Blink`, then `Air` (AIR), then `Base`.
- Base: short states (`CANCEL ON END`, so the dash ends when they run out),
  `VELO "0, 0, 80"` for 0.5 s with TRACK and FADE, then a **detector ladder**:
  a 0-damage single-target hitbox → `HitCheck`, `WAIT 0.05`, `LOOP` × 5
  (six looks in front as you slide). Nobody there: a short stun.
- HitCheck: the real hit (4 damage, 0.75 s stun) → `OnHit`, and the
  unblockable `Blocked` detector.
- OnHit: stun yourself 0.24 s, pin (`VELO 0.001`), knock them `"0, 0, 25"`.
- Blink: an anchor projectile in front plus a `LOOK` at it, flickering
  `Visibility` and afterimages, 0.2 s `IFrame`, and a sideways `VELO
  "127, 0, 0"` (x is left) for 0.3 s.

Reuse it for: any dash that hits; checking in front repeatedly during a
movement; a dodge or sidestep.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `accurate-m1s-gon-freeccs.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### CHASE: "Chase"

Cooldown 6 · Properties: NOSTUN

```text
Line (runs on use)
    0  TAG check BlinkVar "True" → "Blink"
    1  BRANCH → "Air"
    2  BRANCH → "Base"

Branch "Air" — only if AIR
    0  STATE SpeedMultiplier = 0.4 for 1.2 s (CANCEL ON END)
    1  STATE NoJump = 0.4 for 1.2 s (CANCEL ON END)
    2  STATE InSkill = 0.4 for 1.2 s (CANCEL ON END)
      fx: sound 123389986399408 ×2 · sound 133755966655233
    5  VELO TRACK=true TIME=0.5 FADE=true FORCE="0, 0, 80"
    6  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0
      fx: FOV 15 over 1 s
    8  BRANCH → ">Trails"
      fx: Melee Trail (Right Leg) · Melee Trail (Left Leg) · Melee Trail (Left Arm) · Melee Trail (Right Arm) · Melee Trail (tag "nil", Torso)
   14  BRANCH → ">Wind Meshes"
      fx: Mesh (0.5 s) · Mesh (0.7 s)
   17  BRANCH → ">Loop"
      fx: Mesh (0.75 s)
   19  WAIT 0.1
   20  LOOP back 2 × 2
      fx: Mesh (0.75 s)
   22  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=-1 CAN KILL=false POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 9" BRANCH="HitCheck"
   23  WAIT 0.05
   24  LOOP back 2 × 5
   25  STATE Stun for 0.36 s (CANCEL ON END)
   26  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0
      fx: FOV 0 over 1.5 s · Melee Trail (Right Arm, 0.4 s)
   29  WAIT 0.36

Branch "OnHitTarget"
      fx: sound 139795256698131 ×7 · Glow (0.3 s) · Mesh (0.4 s) · particle 8214517543 ×1 · particle 426653646 ×1 · particle 10365552890 ×1 · particle 10365553480 ×1 · particle 14582794847 ×7

Branch "Blocked"
    0  STATE Stun for 0.75 s
    1  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
      fx: FOV 0 over 1.5 s · Melee Trail (Right Arm, 0.4 s)
    4  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0 SPEED=0.5

Branch "Blink"
    0  TAG clear BlinkVar
    1  PROJECTILE SPEED=0 ATTACK TYPE="Domain" CONTINUE=true POSITION="0, 0, 7" TIME=2 SIZE="1, 1, 1" PROJECTILE TAG="LookAnchorPoint"
    2  STATE DirectionLock for 1 s
    3  STATE Stun for 0.4 s
    4  STATE SpeedMultiplier = 0 for 0.55 s
    5  STATE NoJump = 0 for 0.55 s
    6  STATE NoDash = 0 for 0.55 s
    7  STATE NoM1 for 0.55 s
    8  LOOK CAMERA DIRECTION=false TIME=1 SMOOTHNESS=150 PROJECTILE TAG="LookAnchorPoint" HORIZONTAL ONLY=true
      fx: Visibility (0.05 s) · sound 133755966655233
   11  ANIM [3,17] (Hakari.Melee.Chase) FADE OUT=0
      fx: Afterimage2 (0.1 s)
   13  WAIT 0.05
      fx: Visibility (0.05 s) · Afterimage2 (0.1 s)
   16  WAIT 0.05
      fx: Visibility (0.05 s) · Afterimage2 (0.1 s)
   19  WAIT 0.05
      fx: Visibility (0.05 s) · Afterimage2 (0.1 s) · Billboard (0.15 s)
   23  WAIT 0.05
      fx: sound 130023698696968 ×7
   25  STATE IFrame for 0.2 s
      fx: particle 14582794847 ×7 · particle 14050526759 ×4 · particle 14582794847 ×1 · particle 14595543880 ×1 · particle 12144047227 ×1
   31  VELO TRACK=true TIME=0.3 FORCE="127, 0, 0"
   32  WAIT 0.3
   33  VELO TRACK=true TIME=0.5 FORCE="13, 0, 0" FADE=true
   34  STATE SpeedMultiplier = 0.3 for 0.5 s
   35  ANIM [1,12] (Gojo.ShortVoid) FADE IN=0 FADE OUT=0.2 SPEED=2
      fx: Billboard (0.15 s) · Shake Light · Afterimage2 (0.05 s) · Visibility (0.05 s)
   40  WAIT 0.05
   41  TAG set JajankenCD = "True" for 1 s
      fx: Afterimage2 (0.05 s) · Visibility (0.05 s)
   44  WAIT 0.05
      fx: Afterimage2 (0.1 s) · Visibility (0.2 s)
   47  WAIT 0.4

Branch "OnHit"
    0  STATE Stun for 0.24 s
    1  VELO TRACK=true TIME=0.1 FORCE="0.001, 0.001, 0.001"
    2  VELO TIME=0.2 FORCE="0, 0, 25" LAST HIT=0.2 FADE=true
      fx: FOV 0 over 1.5 s · Melee Trail (Right Arm, 0.4 s)
    5  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0

Branch "Base"
    0  STATE SpeedMultiplier = 0.4 for 1.2 s (CANCEL ON END)
    1  STATE NoJump = 0.4 for 1.2 s (CANCEL ON END)
    2  STATE InSkill = 0.4 for 1.2 s (CANCEL ON END)
      fx: sound 123389986399408 ×2 · sound 133755966655233
    5  VELO TRACK=true TIME=0.5 FADE=true FORCE="0, 0, 80"
    6  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0
      fx: particle 14582794847 ×7 · particle 14050526759 ×4 · particle 14582794847 ×1 · particle 14595543880 ×1 · particle 12144047227 ×1 · FOV 15 over 1 s · Wind Streak (0.15 s) · Wind Streak (0.15 s)
   15  BRANCH → ">Trails"
      fx: Melee Trail (Right Leg) · Melee Trail (Left Leg) · Melee Trail (Left Arm) · Melee Trail (Right Arm) · Melee Trail (tag "nil", Torso)
   21  BRANCH → ">Wind Meshes"
      fx: Mesh (0.5 s) · Mesh (0.7 s)
   24  BRANCH → ">Loop"
      fx: Mesh (0.75 s)
   26  WAIT 0.1
   27  LOOP back 2 × 2
      fx: Mesh (0.75 s)
   29  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=-1 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 9" BRANCH="HitCheck" CAN KILL=false
   30  WAIT 0.05
   31  LOOP back 2 × 5
   32  STATE Stun for 0.36 s (CANCEL ON END)
   33  ANIM [1,19] (Gojo.Melee.Chase) FADE OUT=0
      fx: FOV 0 over 1.5 s · Melee Trail (Right Arm, 0.4 s)
   36  WAIT 0.36

Branch "HitCheck"
    0  HITBOX DAMAGE=4 SINGLE TARGET=true CANCEL ENEMY=true BLOCKABLE=true ATTACK TYPE="Melee" CLEAR KNOCKBACK=true STUN=0.75 STUN ANIM=true POSITION="0, 0, 4" IGNORE WAKEUP=true HIT RAGDOLL=false SIZE="7, 7, 9" BRANCH TARGET="OnHitTarget" BRANCH="OnHit" CAN KILL=true
    1  HITBOX DAMAGE=0 SINGLE TARGET=true BLOCKABLE=false ATTACK TYPE="Melee" STUN=0 POSITION="0, 0, 4" IGNORE WAKEUP=false HIT RAGDOLL=false SIZE="7, 7, 9" BRANCH="Blocked" CAN KILL=false
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WDy1UWVAPptWBQq0IqqPCQVQFcdcH6g9364u7kPdF1SqUq1lZ2BwWeetqKZYBTx4gG+eACXPAE8ATUBW2cNNZ5te6+I7RbAU+PZ3k1xApcncAxZib4RzllDTbLQK4AnheffG1i4fifqQARLVqJ1jmDJKlDmHzSwcB3h4sndEteh0x5sD0JbN3S+E5h15LC7XWpz1x9loN0PSLKb0SJ6N9qdYG7z3VJGSpumeSitUr5kLENnx5awA+fzyMZ5HkfKiCM8NS5dnCHXX6SyJtD4hevRvZLJ9QcXrnNKtxvZhusPQlqpXA4ThiEeJARk0puAQPcBTQZS2U4s1lWBuC4ViQiDZUFMri/eKxauc/xofLKuX275FJlfuH4jmLv+LAnLZeF6JN0m6ZYvJFmIT5titJsZdsKRhV3Z9acw4frG1vWF6/1ZEZUqwcJ1Cc4N1x8YWLi+wNqWy7r+YOE6ZQGrLAzXH7iFs9xG7rk72QfkFu5GrHQA4h4YCA02UjM4fkxU4/jhsGBRoMv1cP1pr7ZXXef4QV2IRWh3a8mBMaRJFrqbcSOJ4hME0hKkbXszJEngDQJZzm1mWAikMyMhcqXLr2Nb3m52SHhy2IiNapRonbN+uP4io0m0zhxbhCk/PnU61YlfIwMhsiw/ddKomNF5oJxNfWYD5WwipEQ4z8D2YnsRfnuUmYr2KEMnnLOhcdbmaWoDY3vf3s9H1lqrI9+iRFiRxoBdCAFcX2QRloxfmMPy9mCxCaz8zbIqVqTByu1Cabi2pbKwK2P4YWhlYETlqiw8gOuV6rpgFpZBNLg5gU8MrGvSEmSNoWJdDeg2GjdbasITSyW5ZNlmuDKsepB4uC5pCZFmNJ73new7NUk3idoXCQ3djaPmkPBkL560BEoac8v1pr9wnUuUjlgJtfflEm6P0hhVw/WJA3ZVGK6/iY7cDSCKrAN2PYVp23sImX/XK4PlsJBVGJRSKduj3x6MDNhVcQDBOp351OjQ+VUyMFbGmdJpL8LHiZTSRsKHzWwkbZo4m/bedYg5dAXoLWkkg6VicJHQrku4QchA128DZwjzbSWfAEl3W8kk2T1NV+IPB94M7vqDO3pMlhow3Xwh6FEa4aaiymI9VFADdi1UDenirV1/P004cjPKZGHadR1xSLZF9m7JpHmDQDo32CBj2McE3/XFvhG7G5B0qdyQcOMPB86uPzk1GroARGvGk5PWp/OjAzWOI3dbieuyvWeg4pk1xneayXx7kYHtUeYhg6zikM4j33mahkb61EfWi9VgqfjlemDa9TehMBn41PmHkdJaHfk0U9ZGysj8YxKXRjKQUgiRcG4SxacKE83CSQg6ylpD7jkroqK45ya0BJFZJJbLTkwowDkfzjpf8Q6VZblMz8CoaG++4iGNMloRFYQ0xo8QPn3oKP4jCLMcsEpBJUDCwl8R/y+Uhis3y6GiTDD++6ggGyhpE2XzDpzQYea/Bz4zJUNpfFljrBPO+XFS6sDpyEnpQ9uLrsuvlUoGwpeSgZWB7U0GPkzFqExUwPagtCwWBWKKD61NpJDCKV3/dxg424PReqgsDQyd5mmexnkaGSGsGYJK5WI48P9xotPEf+eZTwNf8fV/4UIgAVkN1cNlsS4J7Mv/+k86uFyVC8EVcU3+E7KkW7Zc0gXw1o8H1zoyQbTOEqW3A/qPVBHNMpZdlwXLckUtgu0FuzKJJaMsYNYhy/J76ObG3fUBUZN9ecYNSsJc0tBVPWRRi/AUUQmFCahjq6FzipmZGZEkSdIBcxFAICAYEIyHqAIqrfIBE4CAhEORYSggiwQDoTiGYiiMoyAMYyAGQQxRBiFDmKGMch7U1hMsk9UcSLZDmaoNVMFH0IjbrWCnDFhyFNyAPWc4iSjORktPyUEMyXLxFgLulWopk+geQiMnyRqLbiVI7q1gSeDFQYQqI8DOTZYoetG3YycopLnQ3op2/10BNPb0VfeW0qj3c1w6v6PfI0W47yX0sIUYAdwQTCubHBDn5k3ETpeZiSEVgmaJo/DDW2akP6xm9TMmijIAMQ+OQXDSFS9kRNReVXYWda8Mr7MzpuiM6lEG4mE+q5fGDqEkMMBm9QYyjWEC+ymgkIEOPfgD7TBBlSEknUQyY9tT54FN2yRcM1LRgDkbsWu6+qdPe85Z0gFCOQnzwJGJFqLN2JSkhM2qIyyEjEBX53CeutGnHB3V4coPC9PcXVXQoLwRqzRVbdXN70HLigjZwdHSYP2iKs1I9NlejvY2K6+Lj6XfEVC990jGYQ1LicbGeFkdWbFfPpXxtjuWlV2EvVmhWdWiq62qzUp/LKTCMGp5GkQDGPkc1nVh+z6t+RtNm3K/g8/jmmZVQqHmn2xWKuxRd65TiGGxNJvGqz2QWM/a+JDOZb7Uy18bqMtwgfOsWLRQSxW+WxXNsfwDTEqa1RKxX8KDoeVgsLParDqH65ZdB+qS9A9ksnCmwjBpoKz+nr3vMMVfpRZGIiER4TEBmQQTPlCs+t2qqTwvVaQkJQn9vxYYC1MRkSalcaSAgdRW1WMZxjLOZrUvt8G+IGo5BFPpmDbTPhyICF4HC7YqQQGPZH832PMRwX94vWp2SMxbpCnDS9rarE5YZ/o+aonjqYNCge15vIwtCDy71c4TK5YnbreQu+ob4gBm75wdJkTx+75tgNcy4rFfKmTD7cWJxXMvCGEV3X8AjKofgUvUIMuTZ+DvvQq24vbhC3dZrONrNZ75b5QlmmLXYlG7vHKUqivBU9KOsi7XbAkJGw4jqgHwY8wpqQ2sUz0WmddiXE3Yl4Y2+UtFPzV0EZSiMKYHptJTKf0tqhOyvuQQX+FJpeQfx4Cp6Lont8UIybB1iZjBSWs0pdq6cHPh9/HSBus3IzqDT4g8vHqNVxNaSwDCTFmuj6f+rTHgVEqN6dW3e/gTA9mQgaD/P5x6pbA9fqDU3T0c0D93eUPHvoYW1AMxsDzdClW+7MITM4lm+0WczyfeYmNTCkodASdKDeG2/V5mqWiBRX7bsndOGUFUiUM3vqKKzqZDHwE3hHy7rDPQeM9AGHqdRpCzApUdbt/7gpTBEjSLJKQZpT1X6iuPByBoabLv4l/1VTmpBL1pJQu/5/2SQ9Pmbtbko17zmZ7xkUc7rNtUe1VgmV8iQBAGaKuCVdU0ooxU+cKa42cRyVJTLmtCDCZs5mavvDaXf/KaYZKfW2zNmaEfSHouSpZ03GDbnP/xJ8ZrPtXI6MUoTcKwTRTHdEcElwOF1BG+JFM6Dhw3tXi9rd6bDD+5j/EjXOO/PP7d7mIQjsYUlXlxSMpdMlTscvRBDhKFuYTOr+S99H3+JwOne0q7qTTGc8VGWhVf5do1T+yz08h+Ll1ShDBnxfZtZFfcqlANZ0iXLaEjTJVg0nvpCDbaZUzQEbRo7Ho9pEL4VLEdXasmD1Kivr4PEaPcxtGTSyPiSfikSvFWA9Gzcj1/Afz6Gfy1rzmo37CtrEhl0U/QTPrgkXGHM0QrB+iD6xPz1G6GQQExc7RG6FC1fJF4D+uedVYcZJ3vUvyQH3blEUcOIXbeKBJDKXQIUMTwI+Y3UEpx9f9tmbuPRsSqwLrHC92Bxx5OR1Gy1ot+EXiwqQb+ndO5aXqJQhjTF2PK6vL+7e5Dag+jkN3Xsj4yMKcF5z3ssGzC3ykfHwqfGB4unUvm4TeUR0IFKvbofkOoaDgA4a/fcMKlaJv05L37sd8QakQqUuWu3ItEfys7/HDFiZTXU617Cq1MDjWwUmnCX7/Y9/54wFlvKpA/tXpghOlTcisBFcx+Hsh3tqfCTyrC6Kakp5mcLegjKVXKD1722XmJ5ohYyc0F9kcorTVFIih8ozl6nK+S0z0TDLeTJKdK9K3OAbCHOvU/nUH/P7tYLjHlB4qGrzSgAgOOdNgtimr6K8HBujpeBhu6WX+4aiDmojRMzjrTJRh23nlCFzEnoarfiX4NmiU7yqzrR0c4Xy6AcAEYFO27R5TCu0dD48LFVlJoiLhCXs4Ho5YdoB2ahauB+6HaFTbT/6YHFknuWrFoxURZEk/jYgKwFdcok+UYuFjcjUe81sgemF8HMfRlSVqJB1ec3i7nAl90GMuPqIbc0y/LtlOjIES5PmC8SVtsTCYs0hEDOmT4gx/+zzA/hrYT76QCJHII+cmc0TOCcuxoPJmb75uSHRcGyO0ZdA7lQxQrpqXuIX8+hN93PiJE/AWakMwz3xjBaTPLQ4wzT+2o8SZ0qLXi0OQ/o5ryiamwFhJFUWPoicwCandqyJd8J1hZRd3iVKBs6rpl7h6l4ZWZjlOBWVe/P3E1WLaOxIyQI5sUFEfwdJSk8isTGZeMDo31BpR4gzqpE9tmAOZHa2ccwAEDzj8mWwZHO3PTOJhLesNHO5YB2f/GgkSbZJsxOjTIZ4hax5St64+bmQeU6EEYzh8c2mNFgFfVERrw37C1XNsHQZLIUPyrV56eav0DHaY/+m0BxYgEXIBQhPfeVx9f1xSm7h3kkJjNMDhijRg0+LDQkIpyhu9zN2u+8fXDpRpRsSO+6O0pGFMr0KdTqEYqs+k8kXV8LQpMlT2eoZjyLfB1zeh4+fQF2ygMKg88WlOlsoapwi6hWKpEtoTYQ0uVvFbcvkxb7A/V7amlThdv7ZMinejN3k1dLZqQ7hs7BS0w7aBMyRGlHG+XPBW90Rr5JveNd+S3XTkPqX7h5du0+RmJiKZveZu6+4AruCytiYWLtiEdhF9/x0RHHO936hnM9ro5fmkCS/+8xJwaGNmGkC9YgO9KqE4pr5tI6/DvVO30YDpiDRSYf0NnGeSG2de33S9u/9cUktlvgV2S+IpGPRAhnszzwY+vaRqN1MXtJFQFNkwJwd9Xji7/Zmncq/nEdfQdsy1tKHTnxREUxaINeTeYVnF/bbrVXZ8YpxKQAJPPDNSSl1RHB3H5Z/QfewBD6UBg+ZWHGLdXzAl8bGQSgSPVt1BUk5tf1o5gb76Za6KHtQebKZ0NrBRTbIFImTerAXJZCqMX8Ece0GgJs/4hG77ki3syLDAchA3QYMxYCXjipKLqPLF6GYaMbmjr9DWP31uxBzWHWnRiGmmDhJqaxephfSkxtI9ovL0mBLcwnEpKjiGtbf+8NaE3Y6JnduDrttGHwZFrnBMItIgQWfQ3vfGiuJEMexhFPoJdkv3Hb2K4ilfAVoOLD26nuZaDAs5R5bpuxT/SORdFFzy6OYAYqCjzKiq5LbwrOXAQsFtoTgtppt9BYqaCk+MizM+DeFrFA40qjHgJUZOx+dQmxZ8AiLpLosAt6feQClAjGkzyN/3QPRoCXrJGlgLlapP5YoIc+MW7mDhTkBbYBtKVRdw/GSPSUhVJoNmaTPah5XOjfM5FeABM47SBuN6XdtfMvxCKSE/l/FL9LcOkjX2t88xRLOCsGG1zBa64lFK2XZ8AFK9FJSLnrKg1t0APQDuHvyUnYKDsvE718ca3FhhFLtT9Rb4cERB0QM4lJu4y4PvculOWXVe2Vs2Wq3hmFc9SMmeUxKkOBPzdakJd4lOdA+q185WMN6MSCriPsy7WVUkQduQ13skpEtr1Islyy8bnIeeUKSLeRdsBpthPOb9NupDCHunmlHwjKjLhs5aa2y8iO+qGh88nvn9OL02SJ1+9/8RJyHbLc9QJHAjaQKfd3k4z4WW3CetLeELC6aq3tYiAny9h0e1r05yejFVr8/LUlEAC0tPVBWfvzjfPZPaAra6L+bD8H61sWaNe1Hy2MIJCKPRWWIA78b5tAE7oZ0KXq4HOJK4iYoZjnGt+fAgGy08bP73bN1EjpVsB+d9gcJGSXBcU2GYXML7dDuSerRzkVsNNVsWUkWnvaDixRJvee3yCe81hN4sIfIU3OgAOa1cFgAs3B2zi08aYNSga/zDQF55LT3ZaDp9iiTsydgXCIa3lYo50+EPtXXzarUnln3b/uMgc+vCM4j0PIh6kvmuOELkMI3njC5OU0YILmOj8h9mYECzTQIUMtZw4GbuK0lG8IhHapLI6bz0HCsgypVT73a9k9hX2gMCyUOAKySqD0mNxbudLE333CsXGkwPGj3fHTknKj/IDk9Q/cB6o+wMYOBmgQr+8kHhtAYoSL0KHL7zcEbRFXNupxizn5f+ZAiFyA5xXOHQE9dgjcVW3TCVfkwXrERga8FFCAgSDESu4cPygG/PwCyni4M/Oi9hdIbQDDbCVjUJ0STKOcGj6XUAQ+b12e4yQ4oQqJza5+8lwaBiKQ1/t7MyZnBssYVEUngRHahQWGWBqRJiSWA5h4iaG52V0u+8eHqGq4MX4e2i7QYDaOkyFlStDkuUuoKUgopdfofwsjSVzY4nBs8KPdKBILtPaZkAkKbwVqg5UvH2x9/3vwT8f+Lpb9/+yp0UYdqEr7Uq7Ag==
```
