# Flickering afterimage dodge (i-frames)

Tags: dodge, i-frames, invincible, afterimage, visibility, flicker, evasion

Flicker out of sight, strike a series of poses with afterimages while
invincible for 1 s, and flicker back.

How it works:
- Line: `TAG check Charging "True" → "-"` (do nothing while charging, see
  skill-template-charging-guard), then `BRANCH 1`.
- 1: `Visibility` visuals toggled 0.05 s apart (the flicker), then
  **`IFrame` and `Stun` for 1 s**, then pose after pose (`ANIM` at
  `SPEED 0` or 0.1 freezes a pose) each with an `Afterimage2`, 0.03 s apart,
  looped, and `Visibility` back at the end.
- `BRANCH ">pose"` lines are comments (missing branches do nothing).

Reuse it for: dodges, invisibility, afterimage effects, frozen poses.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `needs-fixing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 1: "Misdirection"

Cooldown 10 · Properties: AWK

```text
Line (runs on use)
    0  TAG check Charging "True" → "-"
    1  BRANCH → "1"

Branch "1"
      fx: Visibility (0.1 s)
    1  ANIM [10,14] (Hiromi.Dodge.Dodge1) FADE OUT=0 SPEED=0.4
    2  WAIT 0.13
      fx: Visibility (0.1 s)
    4  WAIT 0.05
      fx: Visibility (0.05 s)
    6  WAIT 0.05
      fx: Visibility (0.05 s)
    8  STATE IFrame for 1 s
    9  STATE Stun for 1 s
   10  BRANCH → ">start"
   11  WAIT 0.03
   12  BRANCH → ">pose"
   13  ANIM [12,2] (Heian.Cleave) FADE IN=0 FADE OUT=0 SPEED=0
   14  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   16  WAIT 0.03
   17  BRANCH → ">pose"
   18  ANIM [1,18] (Gojo.Melee.Down) FADE IN=0 FADE OUT=0
   19  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   21  WAIT 0.03
   22  BRANCH → ">pose"
   23  ANIM [10,17] (Hiromi.Dodge.Dodge4) FADE IN=0 FADE OUT=0
   24  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   26  WAIT 0.03
   27  BRANCH → ">pose"
   28  ANIM [14,3] (Charles.ShutUp) FADE IN=0 FADE OUT=0 SPEED=0.1
   29  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   31  WAIT 0.03
   32  BRANCH → ">pose"
   33  ANIM [5,13] (Mahoraga.Melee.Down) FADE IN=0 FADE OUT=0 SPEED=0.1
   34  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   36  WAIT 0.03
   37  BRANCH → ">pose"
   38  ANIM [10,18] (Hiromi.Dodge.Dodge5) FADE IN=0 FADE OUT=0 SPEED=0.1
   39  WAIT 0.03
      fx: Afterimage2 (0.2 s)
   41  LOOP back 30 × 2
   42  WAIT 0.1
      fx: Visibility (0.1 s)

Branch "-"
    0  SETCD to 0 s
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WAUJf0jADZwlCcAjcoDziCvV/3kWxjgyZUYsnMgNB2ZufgWc7zLNC2GdJn7////8AKJAIwAigA7+v6gZL5D3+d7fMIWxgsy/w4j9D3CdYSrnSU9TTt6FI6+w8zyMGGAvjsiCluM99hW42WI5njK1veeDfT1vSKjaNN3KDmAvktklvxeAX13UKBMNsb3iocecyw9jBJ6imBL097RQwl9JE+THrgQBh4+paJxCtmmLVi0x0OfH5h6mF02DnpJwl9xEBeGUO1dFzFXF7Yp/bKEG06s9dpJK11EGAmyhmSremgKV8DOyhArXxRGwWkPWoJm0SDfo9xoZEY7Hr/wNGHs0hApS1TWU8Rtk4qrVKwFrUKZQFwc3y1cvYi0GYv40HybTBF+UXSULS09AUpfOOtrVw9GamuO+bYobD8wrzDLypzSj9pvyhGFH2yaae0pM9LHTiulQ+tt6ryPpNXOyTxIH3wcCeWc0kYa5yLC+jTPfZxar6RyZg0TCG3LOAY8GyZOOOeV9XGc6dDHVjqfRYSNbZ7meSK9ljoy3oWlEhE5S8B3yoW7BqLsiLAJQzKIydbQ36HMMb8klS8LY7w8MfClJfkw0ThKRqlETGTuspsoMQGkkiphlAcBku4f+krzN+3NH37XEeCIylZ1UHbZ+HfYQNEatolDJIB5viD7kS0AScJdJ+m+SxHPVyQPMN9hJ+ninLaDYsaTVlrGeS5tmlnrtE+VdTqzTslYCRt6rZWxsZNO+dj5xOs8UtLKUFjtdaZzK40zyniv80R5p5XOrPLGZjYPUuZBh6lXwnhpgM+ogSFziERoJAVJMh1AAkKMIZqa6hIgQylFYhBHIWUMERwiIIYIRCSSYEIJKBiS6QGjwZd21goAfUVgmCz4CThbZiX+Uy4FhJJcGtrBLAH/uezgphIZ0UjSIxvEYmcCI5kvuspOElG8L1FNVu04iMNM5AonxBkAifzHgDvbLK7OAIMFA0mtpf7nIHGkCLt1Taalf8bwHkTHX0It23G1DMBk6M9kHGoFEzx5Sgu9Os98B6lchI6zz8yAtux8u25hO+bAYmW2Do5r2P64fM1iyXh2mtXEKmIlrp9p54K6ZtadSWWywhipjQnWTGifrC4T88KMmc+CpvRE3et9/+a6Igbqft4i4woes+a6rddo6BI2c42GzOGTvUmgacTtgdBMMTe0sdxwPQ4B/YKwhUHBc5CtmCYTQnb9j7U7JKRN5MB46d/MEEgIAoobX8mjo7h7hqsCQtniYyE/wOxIq54YxqHorTgb5Ci/mjYv5JeLPV/dfy658Hwg0SPXQA+FbRQVivzX9NqqKVQIVETHdmMhyXpCUYAcWmIXgriPjAf4vQ03gBhXpF+Sr7EXehK6meVGYmjK46E9hn4YvhNBTqE8WTbQ//oDWQwDhXoL0RUkBQFpFRt+IAcTLAD4s24nIOszSLdXRQMzMZf8RLYxG8TukIK4LbfXHwfVJEzEkrOLrdz+qo2sHEmju1DUjw+MBB4BKB9w2bc+PoXKGtF/piindz8Pn+KK5ure11QD
```
