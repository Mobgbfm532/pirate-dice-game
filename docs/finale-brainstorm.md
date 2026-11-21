# After Jaguar: the scene before the victory screen (brainstorm, 18 Nov)

The user, 18 Nov: "Let's brainstorm a final scene following defeating Jag as a lead in to the victory screen. This won't
be the final of the game. I am planning one last set of opponents but not for a while yet. These opponents would be the
ultimate 2,4,24 players - bordering on deific legendary figures within the realm - the Can Garda."

The user's `Victory.mp3` (18 Nov) is the fanfare as a won crawl's run-over screen opens (`crawlVictory` in sounds.ts).

## What the scene has to do

- Close the tournament: Jaguar, the last of the fifteen, concedes, and the realm knows your name.
- Land on the victory screen with the fanfare as its big beat.
- Leave a door open: the Can Garda, the legends above even the tournament, have noticed you. A tease, not a fight.
- Skippable (a tap or Esc), like Bren's quay and the walk to the Portal; built from paintings, as they are.

## Ideas

1. **Jaguar concedes.** On the gun deck, his bust, a speech bubble: he tips his hat, laughs, and hands you something of
   his (the Captain's hat, his cloak, or the Salty Swallow's helm for a night). The crew roar. Could make his keepsake
   drop real at last, kept for the Can Garda's crawl.
2. **Home at dawn.** The Salty Swallow sails back into harbour as the sun comes up (the sets-sail painting in reverse, or a
   new dawn painting), Bren's bell rings twice, gulls.
3. **The quay.** The faces of the whole crawl waiting to cheer you in: Thom, Sperm McGrath, Martha/Mystery, Brodor,
   Johnny, the Bard (one painting of a crowd, or their busts popping up one after another in the trailer's line-up style,
   lit this time, not silhouettes).
4. **Your name on the wall.** Back in the Ghoul and Gourd, a brass plaque with your name hammered onto the wall of
   champions. The camera drifts past older plaques... the oldest ones glow, unreadable, marked with a strange sigil.
5. **The Can Garda tease.** After the cheering, the noise drops away. Night. A table no one sits at, six dice on it,
   all showing 6, and a hooded hand turns one over to a 2, another to a 4. A line: "The Can Garda have been watching."
   Black. Then the victory screen and the fanfare. (Or a sealed letter with their sigil, as Martha's and Brodor's
   invitations came, read later.)
6. **The winning hand replayed.** Your last throw in slow motion, the dice rising off the felt and turning into gold
   "24" coins that pour into your purse. Short, needs no new art; could open the scene.

## Claude's recommendation

About 15-20 seconds, in four beats, then the victory screen:

1. **Jaguar concedes** (idea 1, ~4 s): his bust on the deck, one line in a bubble, the crew's cheer.
2. **Home at dawn** (2, ~4 s): the ship coming into harbour, Bren's bell.
3. **The quay** (3, ~4 s): the familiar faces lit one after another, cheering.
4. **The Can Garda** (5, ~4 s): the hush, the hooded hand, "The Can Garda have been watching." Black.

Then the run-over screen opens on the user's Victory fanfare. Ideas 4 and 6 could come later.

## What it would need (from the user)

- Jaguar's concession line (and what, if anything, he gives you).
- Paintings: the harbour at dawn; the quay with the crowd (or reuse the busts); the Can Garda's table and hooded hand
  (and their sigil, if they have one).
- Sounds: the crew's cheer, gulls, the hush; Bren's bell already exists (synthesized).
- The Can Garda's line, in the user's words.

## Questions for the user

- Which beats? The recommendation, or others?
- Who or what are the Can Garda to show: one hooded figure, a council, only a sigil?
- Does Jaguar give you something (a keepsake for the next crawl)?
- Victory.mp3 on the victory screen only, or starting on the homecoming and running into it?

## Built (21 Nov, the user's pick)

The user, 21 Nov: "the swallow coming back to waterdeep, nobody waiting to receive them except the cult of kram symbol
burned into the harbour as the light of a new day starts dawn. The open question is, to be continued? And then the victory
screen plays." So idea 2 (home at dawn), with no crowd: no Jaguar beat, no faces on the quay, no Can Garda tease yet.

`Finale` in Hud (`FINALE_MS` 18 s; `snapshot.finale`, `actions.endFinale`; dev `preview.finale()`); a tap or Esc skips:
- 0-6.6 s: the harbour painting (`salty-swallow-sets-sail.webp`) pans from the lighthouses back to the ship as night gives
  way to dawn (a warm glow on the horizon); Bren's bell twice and a calm swell. "Waterdeep, at first light." "The Salty
  Swallow comes home." The boss's tune fades out (`holdMusic`).
- 6-13.6 s: the quay painting (`salty-swallow-quay.webp`), empty, pushing in on the boards. "No crowd. No cheering. No one
  waits on the quay…" Kram's K sears in white-hot from 8.6 s, then cools to charred black with ember edges, smoke rising.
  "…only the mark of Kram, burned into the harbour."
- 13-14.6 s: the light of the new day swells, then black; "To be continued?" in gold.
- Then the victory screen with the user's Victory fanfare.

Made from paintings already in the game. Wanted, if the user likes: a painting of the harbour at dawn (the two used are
night scenes warmed by an overlay, the quay's crescent moon still up), a painting of the burned sigil, gulls and a dawn sound.
Stills: `previews/finale/` (`.git/finale-shots.mjs <dir> [times] [sizes]`, against `client-dev-b` on :5175).
