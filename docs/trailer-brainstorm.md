# The trailer, take two (brainstorm, 11 Nov)

The user's asks, 11 Nov: the trailer should open on **what the old game looked like** before the new one
is seen; show **some of the events and vendors**; and show **every opponent as a blacked-out outline**, a
teaser, instead of who they are. (The trailer as built on 9 Nov: `client/src/Trailer.tsx`,
`/next/?trailer`, about 33 s for an upright phone.)

**Built 11 Nov** (the user: "go with your recommendations and build it"): the cold open from real stills
in an old phone, a fond memory with a "Version 1" stamp, the old tune muffled, "It started as a web
page." / "Then we rebuilt the tavern."; the old flat 6 turning into the new die; the line-up of
silhouettes by place, all fourteen, one gold rim, no names, Jaguar almost seen; the ability paintings
out; "Between fights..." with Thom, the thief, the Shrine, the hot tub, Johnny and Yvesil; the music's
18-24 s bar played twice until the user has a ~40 s track; upright phone only. The words over the old game
are the user's (11 Nov): "The original game was fine...", then, as the old 6 turns, "But it was time to rebuild
the tavern." Stills in
`previews/trailer2/` (gitignored). The rest of this file is the brainstorm as it was.

Stills made for this brainstorm (gitignored): `previews/trailer-brainstorm/old-start.jpg` and
`old-table.jpg` (the real old game, unpacked from `main` and played headless), and `silhouettes-mock.jpg`
(Klarg, the Hangman, Jaguar and Brodor blacked out over the dimmed tavern).

## The trailer today, for reference

On the intro music (`IntroMusic.mp3`, a hit every 6 s, the last at 24 s, then it dies away to ~30 s):

| Music time | What |
|---|---|
| 0-6 s | the opening die thrown into lantern light; "Roll six dice." |
| 6-12 s | the real table: a 2 kept, a 4 kept |
| 12 s | three 6s land: the Devil moment |
| 13.6-18 s | ten rivals' ability paintings, one a beat ("Fourteen rivals.") |
| 18-24 s | the three places, 2 s each ("Two taverns. One ship.") |
| 24-28.6 s | "One last throw...", the last die in slow motion, Perfect 24 |
| 28.6-33 s | the title and "Keep the 2. Keep the 4. Become a legend." |

Two things in it go against the new asks: the rivals' section shows their faces (each ability painting
has the opponent in it), and there's no "before" and no vendors.

## 1. The cold open: the old game

What the old game is (from `main`, the live game today): a parchment start card, "Pull Up a Chair", six
round character portraits (the devil girl with three 6s, the wizard, the hooded one, the gunslinger, the
orc, the smuggler), name and table code boxes, hearts to pick lives, a green "Enter Tavern" and a blue
"Install App" button. The table is a flat green card: "Locked dice" above, "Active dice" below, six flat
ivory tiles with numbers (the 6 in green), a small red "Roll Dice" button and "Mute Tavern".

How to show it:

- **A. Real stills, staged (recommended).** Capture the old page at phone size (the way the stills above
  were taken), save a few frames as trailer pictures (`art/trailer/old-*.webp`), and play them as a short
  scene: the start card, a tap on "Enter Tavern", the flat dice going "?" to numbers, a 2 sliding up to
  "Locked dice". Honest, and it stays right after the old page is retired.
- **B. The old page rebuilt in the trailer.** Redraw its table in HTML (the tiles, the two rows) so the
  dice can actually move. Livelier, but more work, and it is a copy rather than the real thing.
- **C. The old page live, in a frame.** Load the real `/` inside the trailer. Real, but it needs a server
  and the classic page; once `/next` moves to `/` it's gone. Not recommended.

How it should feel (pick one, or mix):

- **"Then": a memory.** The stills inside an old phone frame, a little washed out, a faint scan-line or
  film grain, a date stamp in the corner ("Summer 2026", or "Version 1"). Soft, fond.
- **"Not good enough": the comedy.** The old roll plays, the "6" lands, and a line says something wry
  ("It was... fine."). Then a record scratch, the screen tears, and the new die falls through the tear.
- **"Same game, new table": the side by side.** The same throw (a 2, 6, 5, 3, 4, 2, the hand in the stills)
  on the old flat table, then a wipe across the screen reveals the same dice on the new 3D table. The
  clearest "new and improved" shot of all, and a good bridge.

The way in to the new game (the transition):

- **The tile becomes a die (recommended).** The old flat "6" tile lifts off the old table, turns over,
  and as it turns it becomes the real 3D die of the intro's opening shot, falling into the lantern light
  on the music's first hit. One object carries you from old to new.
- **The page burns.** The old parchment card catches at its edge and burns away, revealing the
  dark under it, where the new die falls. (The game already has a fire sheet, the Devil's.)
- **The screen tears.** A glitch, a tear across the old page, black behind it.

Words for it (the user's words wanted; ideas):
- "It started as a web page." / "Then we rebuilt the tavern."
- "Version 1." / "Version 2."
- "Before." / (nothing: the new game says the rest)
- "Same dice. New table."

Sound: the old game's tavern tune is `BackgroundMusic.mp3`, which the new game still plays at the table.
Under the cold open it could play thin and muffled (through a low-pass, like an old phone speaker), with
the old click and roll sounds; it stops dead at the transition, and the intro music's first hit lands
with the new die. Or the cold open is silent apart from the old roll sound.

Length: about 5-7 s, before the music starts. The whole trailer becomes about 38-40 s.

## 2. The opponents as silhouettes

All fourteen busts are cut-outs with a clear background, so each can be drawn as a black shape with no
new art: the painting's outline filled black, a soft rim of light round its edge (the mock uses the
tavern's warm gold). Hats, manes, horns and weapons stay readable as shapes; faces don't. Ideas:

- **The line-up (recommended).** Three rows rise out of the dark, one per place, as the music hits: the
  Ghoul and Gourd's five, the Yawning Portal's five, the ship's four, each row under its place's name.
  Lightning (or the fire's flare) lights them from behind for a moment, and "Fourteen rivals." slams in.
  One shot that says how many and how far.
- **One a beat.** As today's rivals' section, but each is a silhouette, rimmed in their ability's own
  colour (Frak's green-violet, Vaelin's ink violet, the Ridgeler's gold, Rokr's starry blue...), with
  just the ability's name. Fast: 14 in ~6 s is about 0.4 s each, so perhaps only a selection.
- **Eyes in the dark.** Each silhouette's eyes glint in their colour as they appear, nothing else lit.
  Spooky, and the portraits' `face` points (in `portraits.ts`) already say where the faces are.
- **The almost-reveal.** The last silhouette (Jaguar, the final boss) is lit from the front for a few
  frames, a flash, and goes dark again before you can see him. "Can you beat them all?"
- **Their tricks, not their faces.** Show what each ability does to the dice (Klarg's paw taking a die,
  Rokr's constellations hiding a throw, the Devil's three 6s, the sea die) without showing who does it.
  The ability paintings would then not be used (they show faces), unless cropped to the effect only.

Questions inside this: should McGrath (no ability) be in the line-up? Should the rim be one colour (the
tavern gold) or each opponent's own? Should any name be shown, or none at all?

## 3. The events and vendors

Who there is (each has a painting and a scene): Thom's Thonics ("What ya havin'?"), Johnny Elf Bar, the
Wild Magic Hot Tub, the Shrine to the Lady (the tavern's and the ship's), the Bard, the Cult of Kram,
the thief ("Finders keepers!"), the Hooded Stranger, Darren Snakehands, Yvesil the oracle, Jorvash the
manservant, and Skipper Bren on the quay. These are friends and strangers, not rivals, so they can be
shown in full.

- **"Between fights..." montage (recommended).** A quick run of four to six of them, each for about
  a second: the character rising in their own light behind their counter, as in the game, with their line
  in a speech bubble. Thom's "What ya havin'?", the thief's "Finders keepers!", the Lady's candle, the hot
  tub bubbling, Yvesil's staff glowing. Words over it: "Between fights..." then "...spend your gold." or
  "Trust no one." (the thief).
- **The items as the stars.** Not the vendors but what they sell: the painted Thonics, Elf Bars and
  keepsakes tumbling past in a shelf-like row, each catching the light. Shows the game's depth fast.
- **A split screen.** Three or four vendors at once, each in a panel, sliding in from the sides.
- **One event played out.** The thief strikes, the die is rolled, "Too slow!" and half the purse goes:
  a whole little story in three seconds.

Which ones: the user's pick. Suggested: Thom, the thief, the Shrine, the hot tub, Johnny and Yvesil
(two from each place, the comic and the magical).

## 4. Putting it together: a proposed running order

About 40 s. The intro music now starts after the cold open; times are from the start of the trailer.

| Time | What |
|---|---|
| 0-6 s | **Cold open:** the old game, stills staged, muffled old tune, a line of words. The old "6" tile lifts and turns... |
| 6-12 s | ...into the new die, on the music's first hit; "Roll six dice." (as today) |
| 12-18 s | the real table: a 2, a 4, then three 6s and the Devil on the 18 s hit (as today, shifted) |
| 18-24 s | **the rivals as silhouettes**, the line-up rising row by row; "Fourteen rivals." |
| 24-28 s | the places (shortened to about 1.3 s each); "Two taverns. One ship." |
| 28-32 s | **between fights**: four to six vendors and events, under a second each |
| 32-36 s | "One last throw...", the slow last die, Perfect 24 |
| 36-40 s | the title and the tagline |

**The music is the catch:** the intro music is about 30 s with its last hit at 24 s. The above needs
about 34 s of music after the cold open. Options:
- **Loop a section** of the intro music (one 6 s bar repeated, crossfaded on a hit) to make it longer.
- **A new trailer track** from the user (Udio), about 40 s, with hits where the sections change.
- **Keep it to 30 s of music** by cutting: places and vendors share one section (a place, then two of
  its vendors, then the next place...), and the table's 2 and 4 go quicker.
- **Jaguar's boss music** for the second half (the rivals onwards): darker and bigger, a change of mood
  as the opponents appear.

## Questions for the user

- The cold open: real stills staged (recommended), the old table rebuilt, or the side by side wipe?
  What feel: a fond memory, comedy, or the plain "same dice, new table"?
- The transition into the new game: the tile becoming the die (recommended), the page burning, or a tear?
- The words for the cold open (yours), and the "Before/Then" label or date, if any.
- The silhouettes: the line-up by place (recommended), one a beat, eyes in the dark, the almost-reveal,
  or a mix? Every one of the fourteen, or without McGrath? One rim colour or each their own? Names or none?
- Should the abilities' paintings stay anywhere in the trailer (they show the opponents' faces)?
- Which vendors and events (suggested: Thom, the thief, the Shrine, the hot tub, Johnny, Yvesil), and
  their lines or new words?
- The music: loop the intro music, a new track, cut to fit 30 s, or Jaguar's music for the second half?
- Still upright phone only, or a landscape version too (for YouTube)?

## Changed since (12 Nov, the user's)

- "It's time to roll the dice." is now "Let's really roll some dice."
- The line-up's "Fifteen rivals." heading is gone; each row rises under a line of its own: "An expanded
  roster", "Of familiar faces", "To test your mettle against" (they were the places' names). Each line
  sits clear of its row's tallest head.
- In "Between fights...", the Shrine's and the hot tub's paintings show whole across the screen over a
  blurred copy of themselves (zoomed into their middles, an upright screen lost most of them).
