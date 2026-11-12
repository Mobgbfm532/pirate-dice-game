# The start screen: brainstorm (12 Nov)

The user asked how the home landing page (the start screen at `/next`) could look better. Nothing here
is built yet; mark ideas **Built** as they land.

## Where it stands

Seen at 375x812 (a phone) and 1440x900 (a computer), 12 Nov:

- The tavern painting behind, still, and a parchment panel in a brass frame: the title "2, 4, 24" in
  small red letters, "Find a 2, find a 4, then chase 24.", a row of seven grey item icons, the name box,
  Tavern Crawl (red), a table code box with Join table (brass), the intro tick box and "Watch it", and a
  line "Prototype of the 3D table. The classic game is still at the main page."
- **On a phone** the panel sits in the lower two thirds; the top third is empty painting. It reads as a
  form, not a game's front door.
- **On a computer** the panel is small (about a third of the width) in the middle of a big painting.
- The title is the smallest thing the game ever says its name with: the trailer, the intro film and the
  loading screen all make more of it.
- The seven icons have no label, so it isn't clear they are your token at a multiplayer table.
- Nothing shows what's inside: no dice, no opponents, no places.
- "Play with friends" has no button of its own: you make up a table code and press Join table.
- On a reload the loading screen's title and die were seen through the panel for a moment (the panel
  fading in over the loading screen as it fades out).

## Ideas

Recommended first, roughly in order of how much each changes the look for the work it takes.

1. **A title worth the name.** **Built 12 Nov.** Take the title off the parchment and set it big over the painting, in
   the trailer's gold lettering with its glow, the tagline "Keep the 2. Keep the 4. Become a legend."
   under it. The panel then holds only the choices. (Small: CSS and the trailer's title styles.)
2. **A real die on the screen.** **Built 12 Nov.** One of the game's 3D dice (the intro film's `FilmDie`) falling into
   lantern light beside or under the title as the page opens, landing on a 6 with its knock, then
   resting there, turning slowly. Tapping it throws it again. It says "dice game" before any words do.
3. **A living tavern.** **Built 12 Nov.** The painting breathing as the table's does: the fire and candles flickering
   (a mask, like the devil painting's), dust drifting in the light, and on a phone the slow parallax
   drift (`parallax.ts`). All of it exists already somewhere in the game.
4. **Two doors, not a form.** **Built 12 Nov.** Two big painted cards instead of a button and a code box:
   - **Tavern Crawl**: "Fifteen rivals. Two taverns. One ship." with the three places in a strip, or the
     rivals as the trailer's silhouettes; "Continue your crawl" on it when there's a save, saying where.
   - **Play with friends**: "Start a table" (makes a code and copies the invite link) and "Join with a
     code".
   The name box above both, as now.
5. **Your token, labelled.** **Built 12 Nov.** "Your token at the table" over the seven icons, the chosen one bigger and
   named under it (Martha's Mask, the Loaded Die...).
6. **The leaderboard and the JUGS league one tap away.** A small brass plaque at the foot: "Best crawl:
   Name, 1,240 points" opening the leaderboard; the 🏆 league for JUGS players.
7. **Tidy the small print.** **Built 12 Nov.** Drop the "Prototype of the 3D table" line (or make it a quiet "Classic
   game" link in a corner) before the switch-over.
8. **On a computer, use the width.** The title and the die on the left over the fireplace, the two doors
   on the right; or the panel larger and lower, sat on the painted tabletop.
9. **Music on the first tap.** The tavern tune and its ambience as soon as a player touches the page
   (browsers allow no sound before), under the music switch. Optional.
10. **Fix the seam on load.** **Built 12 Nov.** Let the loading screen go fully before the panel fades in, so its title
    never shows through. (A small fix, worth doing whatever else is chosen.)

## Suggested first step (built 12 Nov)

1, 2, 5, 7 and 10 together: a big gold title with the tagline, the die landing under it, the token row
labelled, the small print gone, and no seam on load. Then 4 (the two doors) as a second step, since it
changes how a multiplayer table is started.

## What was built (12 Nov)

- The title and the tagline over the painting (`.join-hero` in Hud's `JoinScreen`, styles at the end of
  `styles.css`); the old subtitle "Find a 2, find a 4, then chase 24." is gone.
- The die: `LobbyDie.tsx`, a see-through canvas over the whole screen behind the panel. Its first throw
  lands on a 6 (the intro film's throw, seed 13); a tap on it (`.lobby-die-slot`) throws it again onto
  any face, with the dice sound. Not drawn on a phone on its side, where the title sits beside the panel.
- "Your token at the table" over the seven icons and the chosen one's name under them.
- The "Prototype of the 3D table" line is gone; a quiet "Classic game" link sits in the bottom corner
  (hidden on short upright phones, where there's no room).
- The loading screen's title and die disappear at once, only its painting fading (index.html).
- Checked at 375x812, 360x640, 844x390 and 1440x900: nothing scrolls or overlaps.

## The two doors (built 12 Nov)

- Inside the parchment, under the token and name: **Tavern Crawl** (headed by the three places'
  paintings, "Fifteen rivals. Two taverns. One ship.", Begin the crawl, the intro tick box; with a save,
  Continue your crawl, with Start a new crawl and Forget this save as small links) and **Play with
  friends** (Start a table, which makes a four-letter code of its own, `newTableCode` in Hud, and seats
  you there, where Share invite link already is; a hearts button beside it, tapped 2, 3, 4, for a new
  table's lives; a code box and Join). An invite puts the friends' door first with Join table CODE.
- Side by side on a computer and on a phone on its side; one above the other on an upright phone.
- The token's label and name share one line; the die gives way on short upright phones (under 740 px
  tall); the classic link shows only on a computer.
- Fits without scrolling at 384x780, 360x640, 844x390 and 1440x900 (with a save, 384x780 scrolls 26 px).
  Stills: `node test/start-shots.mjs <dir> client=... [sizes=...] [save=1] [query=table=ABCD]`.

## The living tavern (built 12 Nov)

- `LivingTavern.tsx`: the start screen's painting drawn through a WebGL shader, with the vignette drawn
  in. Each light in the painting (`LIGHTS`, placed by hand in its pixels: the fire, the table candle, the
  mantel candles, the lanterns, the chandeliers, the far lights) flickers on its own and brightens what
  it lights; the fire's flames lick and sway; 26 motes of dust drift up through the air. On a phone the
  picture drifts a few pixels, slowly; a computer holds still. About 30 frames a second, one canvas pixel
  per screen point. Not drawn with reduced motion or without WebGL (the plain painting shows).
- On an upright phone the fire is off the side of the picture, so there it's the lanterns, chandeliers
  and the dust.
- A flipbook of the fire and the candle: `previews/living/clip.html` (gitignored).
