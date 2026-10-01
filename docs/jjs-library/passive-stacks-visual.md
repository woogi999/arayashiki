# Shows an effect while a stack tag is full

Tags: passive, stacks, visuals, indicator, aura

Watches `EnhancedStacks`; at 2 it plays a sound once, then keeps an aura
(afterimages, a mesh, a burst, a glow) going until the stacks are spent.

How it works:
- `1Looper`: `WAIT 0.05`, `TAG check EnhancedStacks "2" → EnhancedTime`.
- EnhancedTime: sounds, then `EnhVisual`: three waves of effects 0.1 s apart,
  and while the tag is still 2 it repeats, else back to the loop.

Reuse it for: showing a charged or buffed state; any "while tag = X" effect.

<!-- generated: lib/build-jjs-library.mjs rewrites everything below this line -->

## Nodes

From `auto-sheathing.txt`. One line per node; effects (visuals, sounds, particles) are folded into `fx:` lines. Fields at their usual values are left out; the code below has every field. See [README](README.md#reading-the-timelines).

### SKILL on key 9: "EnhancedPassive"

Cooldown 0 · Properties: USE, AWK, NOSTUN, AWK2, NOCANCEL

```text
Line (runs on use)
    0  BRANCH → "1Looper"

Branch "EnhancedTime"
      fx: sound 76096562176344 · sound 140602821561280 ×2
    2  BRANCH → "EnhVisual"

Branch "EnhVisual"
      fx: Afterimage (2 s) · Mesh (2 s) · Burst
    3  WAIT 0.1
      fx: Afterimage (2 s) · Mesh (2 s) · Burst
    7  WAIT 0.1
      fx: Afterimage (2 s) · Mesh (2 s) · Burst
   11  WAIT 0.1
      fx: Glow (0.3 s)
   13  TAG check EnhancedStacks "2" → "EnhVisual"
   14  BRANCH → "1Looper"

Branch "1Looper"
    0  WAIT 0.05
    1  TAG check EnhancedStacks "2" → "EnhancedTime"
    2  BRANCH → "1Looper"
```

## Code

Import this into the Skill Builder as it is, or decode it for the exact nodes (README, "Decoding"). One skill.

```text
KLUv/WANGb0bAJaibSfwrMwDpg012BvfRcru4MCmUS5UWyVyFJoBOn1nkK1qckFhcVgcXghfAGUAXgAZ2zqpeD+2+jFSfwTXVZmH/V0WwXHU6Zf6JVP1++jHZJtG++GBgdQvkd1+TEvt2amG3VJXMzfU2twwktoiKZ0TjDBp2NmE5nlYpZAlbFjDJltqSfHaMLt0n9QU5Y0xCNCxiAUTP2AXT7skgClpMnYaHY8DNZzH8UQoMpwHZvxhaaQfZt4DtnA9MxgC0IDzQA0oitDAnAQQ7EhZ4X7oUCxqL6k/W7aRlEP6YYwNqZ+qEkLLDQkb1j36YYbKqfpk6zOpeLUC/VVjoayF53XldSVuqm2qdWfWvi3buIgK2U8tGX8XO8k7qSZSJ3Y5sa0aGPvtzJ7tXcRqWYo/jAZGkXNtpn6tTCBzP4wWljwnr2w/lNSk1E5N9amh2Atp5DWzU3n7AweZKHWtWIpaOzXsTCYDG3GSkn6L+tUPPYcE7MMRl/iyFHkDKMopuIdIdBxO5JXP6y6PGBexw7Y50IAWscHLKACPA0WHo/FEAotcWffKXGfGgEFoXfYt+CQhkA6rPo67Chq3YRAXSYCpqOEZQ0QyIpIkKaQ1IAJCDDJWth0SAOQYSKIUNAQZJCQCQggxZuIkkEAmmAqkLTZHR5JGOWKIbLPHbskt9je1UeD6a+xhDGNZaJUxKc6g+Abvk7OHu6WcT218SoaBBw8XJV4RcNJaaX/hWjoGlFxqKQigys+I3UYIvMKgT3n4YZKF9S1cMcmt3KFYyJULgiMDCUokSwV4N70UXzY9R2Li4SDDxKYYrctLY46DCS2NAXBFALZB7+5EeKcRhn5C6O4GjHbbBMSWN5ktXP5IXuHnzsKvuwgbGFq5wKe5A3k1EwWXi2HO9HIBJl8kQ3lD1sEHGzjVkkOhXGAsGo+EDXR8xWM31im3TiJz8cgXw80ZU06lkrCJc4Ox4qR8d/HPtz4B4gHJerImTMjgimlQEjnfd4ILCcwd0ESejiTMnQuSp3m1AW7lJwBagKw3y2+lP60UD3fWu6QIyRp/KsUVuWNqSITWCXWpctgRgoAK+tzALSx8lU7s+IjhYvQ8RMQS6NJP+H1vY/xpo56AUfIlrGkG65YmAyTpJeZdEdMqWzarfZ9VNaJiPhUBClFtIGJ3xTKhLF4hXvX9opJ6XFCq
```
