# While awakened: dodge melee with a random sway (COUNTER)

Tags: passive, awakened, counter, dodge, random, evasion

While awakened, every melee hit on you is dodged with one of three random
sways.

How it works:
- A loop every 0.1 s: `BRANCH Awakened` (ULT) → a `COUNTER` 0.2 s window
  (`BRANCH "SwayAway"`), wait, loop.
- SwayAway: `BRANCH random "S1, S2, S3"`: each plays a sound, a trail, a
  distortion, and a quick dodge animation, then back to the loop.

Reuse it for: auto-dodges, counters in a passive, random picks
(`RANDOM`).

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `character2.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 9: "AwakenedPassive"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL, KEEP

```text
Line (runs on use)
    0  BRANCH → "1Looper"

Branch "Awakened" — only if ULT
    0  COUNTER REFLECT=true CANCEL ENEMY=false REMOVE ON HIT=true TIME=0.2 CONTINUE=false STUN=0 BRANCH="SwayAway" ATTACK TYPE2="Bullet"
    1  WAIT 0.1
    2  BRANCH → "Awakened"
    3  BRANCH → "1Looper"

Branch "1Looper"
    0  WAIT 0.1
    1  BRANCH → "Awakened"
    2  BRANCH → "1Looper"

Branch "S1"
      fx: sound 140506552189589 ×0.7 · sound 72507637804242 ×1.5 · Melee Trail (Right Arm, 0.4 s) · Distortion (0.2 s) · Sphere (0.1 s)
    5  ANIM [1,6] (Gojo.ReversalRed) FADE OUT=0.2 SPEED=2
    6  WAIT 0.2
    7  BRANCH → "Awakened"
    8  BRANCH → "1Looper"

Branch "S2"
      fx: sound 140506552189589 ×0.7 · sound 72507637804242 ×1.5 · Melee Trail (Left Arm, 0.4 s) · Distortion (0.2 s) · Sphere (0.1 s)
    5  ANIM [12,3] (Heian.Dismantle) FADE OUT=0.2 SPEED=2
    6  WAIT 0.2
    7  BRANCH → "Awakened"
    8  BRANCH → "1Looper"

Branch "S3"
      fx: sound 140506552189589 ×0.7 · sound 72507637804242 ×1.5 · Melee Trail (Right Arm, 0.4 s) · Distortion (0.2 s) · Sphere (0.1 s)
    5  ANIM [10,27] (Hiromi.Melee.Melee2) FADE OUT=0.2
    6  WAIT 0.2
    7  BRANCH → "Awakened"
    8  BRANCH → "1Looper"

Branch "SwayAway"
    0  BRANCH random of "S1, S2, S3"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WBfHVUgALZqhCbwjMwDHkEnoUQ8CZeYFyuZXQh8swfppw49HIaQ7vGBMhvYRDaRl3gAeQB7ADhLJlpuBR7OrzbyVfXjqri+WytMq++dV/Uuqt4mkfsdQi7f+c2+U9873CgSLYH6jtm7+G4poL4/bLpbqO8LBxOtU3y3PPWUU+thpB47snVzrh5O1D/qvZaxDRgPf4uIUCgahrBNNgZNgj719aL44QbRVai3LPqWglkvXm1YTm/VBHZH8pFPlCIHiuKU0WSaWrHtMJpO0pykRs4JxRmfxg4str1UkW/AdxhlNzey/KpFF3FS3y1cmw0vkG5z4LjbAPBNL3U0Fnj5XtkkEgiFrNiDP0ZFOacTmgSd0CS2QIWpVnzvOOP7O/yuK8dZrmqGLQ8LDrtp5sRMEy5S6bgKJWJVOg2rcJxGiHATrQFCYDJxNnTdOJNEtI6/bZNs1/fFojZ09FUWFCL6O/YeVs62bXAs0/bptPvge2Krqq31ArDdtNqdsfhgzJZTnvVF55QPSlE68kHnQTmlzvxSnfGByrmtKJYte2+uHqbVuwKQyz/1mOXv5swf/gWC1cqQGTMc1IHrqMsFcnlQ7gebfWULU/09kjA2UCNJcjqQNEnpkVI6DpRSFDlSFDXPI2UDOZOJMGG7cksIBJuCnRlcFmM5X8jTSEk6EDRNST4QFDEROtIk43TibKIpRVIy0VFto2rssphu3RaAxaixHVNMZiZIkiSV4TCCpBBVkQcSgDMdyaEcRkQRREKJhCSQSEREciMpOBzXHYFo/TRGAms+BQUg/XVex9Ae1JIDJsYdu5pVVPzZe1eGrv7HFcTTkIhrI2l4PK4FMQknuVjrUMKbyu3fSJ+YYQe6cZdBvjCGRFMG+z4BDWlZ3Gk/JYOOI6NcR6woA/8ayFuJQaYa/UgYTYBsY5NsWKvitEHaLHAKaIp27ms0mIh961WvatA2Ur3S0P1fx8neaMOqP5VzmKXuosiLl8CiCuAIyi0snzlChA9AQIWBJ9WI+HK1JtGgpo9AnrXbUBVKPFuC0QvfWpFkq5WXoIy/+gEEdV+FWjtgRI/6PQ2cgeJpvABVg3cf11IzwPABjtHahxuBCvUrINspx7ekJ5t7ZCbqfClRidDzM1yURHwQ7NlRQvZbpGPD3lUihy0aXxXnFpJcszFNHKVuBSGmM6NWk9D8ws62LjBIgJat82jzSOreVj0GCrvU7s+M6FCcYbJVYE9Eq8/xdrR0DIkPaYaxFtkZcf6MD+5epVzOK2RJoCcxQwfFC8viNQhumMHKRCmg5A4AIkYjh9A1wV7D4UZaUPjjh3WbYoGtGcUQrThrkv2VgtqNyEkkH6wnmAAtzesHVsGI6BfPfM2jUk5htjsKRaJXEb8eT5Qq
```
