# The "2 FOUR 2 TWENTY-FOUR" logo (brainstorm, 20 Nov)

The user, 20 Nov, with a first image (brushed chrome letters, a modern italic face, blue and orange neon speed streaks on
black): "how would I need to amend this image to fit our style? I want to add it as the new logo for the game, and maybe
what pops up if a player gets a perfect 2,4,6,6,6,6 on their first throw of a round in tavern crawl and what appears
when a player gets a perfect 24 in multiplayer."

## What doesn't fit yet (against `docs/art-direction.md`, "the candlelit storybook tavern")

- **Chrome** reads as cars and films; the game's metal is warm brass (`#c9973a`) and struck gold (the "24" coins).
- **The letters** are a modern sans; the game speaks in Almendra (a storybook serif). Keep the heavy forward slant (it's
  the joke) but give the letters carved, slightly hand-made edges.
- **The streaks** are cold blue neon; the game's light is fire: ember orange, gold, a little wax-seal red. Blue appears
  only as magic (Áéd's violet, Astral Flood). Better still, the streaks could be the trails of tumbling dice or of sparks.
- **Pure black** sits fine over the dark tavern, but for the art script the letters want a flat magenta background;
  glows cut out better as their own layer on black (screen-blended).
- **Painted, not photographic:** soft painted texture and highlights, as the busts are.

## Claude's suggested prompt (for the user to adapt)

"Game title logo in a hand-painted storybook fantasy style: the words '2 FOUR' over '2 TWENTY-FOUR', heavy italic
letters leaning forward with speed, carved from warm polished brass and old gold with a dark walnut-brown outline and
soft painted highlights, like a tavern sign; the two '2's large. Behind them, streaks of firelight and embers shooting
left to right in ember orange, gold and a touch of deep red, with a few tumbling ivory dice in the trails (red 1, green
6 pips). Flat solid magenta background (#ff00ff), nothing else. No chrome, no blue neon, no photo realism."

And a second file of the streaks alone on black, if the glow should move separately.

## Where it would go (the user's three ideas)

1. **The game's logo:** the start screen's title (`.join-hero`, now the text "2, 4, 24"), the loading screen (`#boot` in
   index.html), the trailer's title card. A tight crop with no empty margins; a phone needs the two-line stack.
2. **A perfect first throw in a Tavern Crawl** (2, 4, 6, 6, 6, 6 on a round's first throw, a "natural 24"): a moment of
   its own, the logo slamming in with the streaks sweeping across the screen and a whoosh; new (today only a finished
   24 gets "Perfect 24!").
3. **A perfect 24 at a friends' table:** the logo in place of today's gold "Perfect 24!" lettering, with the player's name.

## Open (for the user)

- The game's name: does it become "2 FOUR 2 TWENTY-FOUR", or stay "2, 4, 24" with this as a celebration logo?
- In a crawl, does an ordinary (not first-throw) perfect 24 keep its "Perfect 24!"?
- A sound for the logo moment.

## Built (20 Nov, the user's: "Keep the name 2, 4, 24, use it as the celebration logo")

The user repainted it in brass and firelight on magenta (`art/logo-celebration.jpg` → `client/public/art/logo-celebration.webp`,
cut by `cutOutFlat` then `unpinkMagenta` in process-art.mjs: the magenta the flames enclose and their pink fringes become
see-through; a glow cut turned the gold green). The name stays "2, 4, 24". The logo is a celebration (`kind: 'logo'` in
game.ts, `Celebration` in Hud, `.logo-celebration`): it roars in from the left on a fire streak over the felt, sized from the
table (`--logo-w`), the player's name above it when it isn't you; the yay; 2.8 s like the others. It shows for a perfect 24 at a
friends' table, and in a Tavern Crawl as a round's first throw lands 2, 4, 6, 6, 6, 6 (anyone's, not in a cursed round; in place of
the three 6s moment; the finished 24 then isn't celebrated again). An ordinary crawl 24 keeps "Perfect 24!". No sound of its own
yet. Dev: `preview.celebrate('logo', who)`, `/faces?f=2,4,6,6,6,6`.
