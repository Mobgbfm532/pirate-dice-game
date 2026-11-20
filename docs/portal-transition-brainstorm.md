# From the Ghoul and Gourd to the Yawning Portal: a transition (brainstorm, 17 Nov)

The user's question, 17 Nov: "Can we brainstorm a transition screen from the ghoul and gourd to the yawning
portal?" Nothing here is built yet; the user chooses.

## Where it sits now

Beating Martha brings her invitation: a sealed letter flutters down over the Ghoul and Gourd, its seal cracks,
the invitation unfolds ("You qualify for the Yawning Portal"), her Elf Bar to take or leave. Then "On to the
Yawning Portal" goes straight to Sylvester's entrance card at the Portal's table. Nothing marks the journey.

The ship already has its journey (9 Nov): Skipper Bren meets you on the quay, then a 6.4 s scene of the Salty
Swallow setting sail, a tap skips it. The Portal's transition would be its equal: short (5-8 s), skippable,
played once per run, between the invitation and Sylvester's card. Like the ship's, it should say what changes
here: from the Yawning Portal on, opponents play their best, every opponent has an ability, and there are new
spots (the Bard) and a new event (the Cult of Kram).

## Ideas

1. **Through the town at night.** The town painting from the intro film (`intro-town.jpg`, with its rain and
   foreground) pans down a wet street; a lantern bobs as you walk; at the street's end a doorway glows the
   Portal's blue-green. Words: "The Ghoul and Gourd is behind you." then "The Yawning Portal". It reuses the
   film's art and rain, so it needs only a sound (footsteps in rain, a door). Familiar for anyone who watched
   the intro; maybe too familiar.
2. **The doors open on the well (recommended, with 4).** A painting of the Yawning Portal's great doors at
   night: they swing open, the well's cold light spills out over the screen, and the camera pushes through
   into the hall (`yawning-portal.webp`) as the title rises: "The Yawning Portal". A low rumble from the well.
   Short, one new painting, and it shows off the place's signature, the glowing well.
3. **A herald at the door, like Bren.** Someone meets you at the Portal's door (a doorwarden, a tournament
   herald), checks Martha's invitation and says two lines: who you'll face and that they play for real here.
   A character scene with a speech bubble, as on the quay. Needs a bust painting; doubles as the place to
   explain the step up in difficulty.
4. **The tournament board (recommended, with 2).** A wooden board on a tavern wall lists the fifteen rivals in
   three columns by place. The Ghoul and Gourd's five are struck through one by one with a chalk line (the ones
   you beat), then the Portal's five light up as silhouettes, as in the trailer's line-up, under "The Yawning
   Portal: five rivals who play their best". It shows progress, which the game never does between places,
   and it reuses the trailer's silhouettes. The ship's and Jaguar's columns stay dark, a promise.
5. **The map.** A parchment map of the city: an inked line runs from the Ghoul and Gourd to the Yawning
   Portal, a little die marking you, the ship's quay at the map's edge for later. Clear and charming, cheap to
   build from one painting; less dramatic.
6. **Martha's smoke.** As you leave, Martha blows one more ring of violet vape smoke; it fills the screen and,
   as it clears, you're standing in the Portal's hall. Ties to her gift (Mystery Flavour), no new painting,
   but it reads as a trick of hers rather than a journey.

## Recommended (**Built 17 Nov**, the user's pick: "Board, then doors")

Built as `PortalArrival` in Hud (7.6 s, `sailStage: 'portal'` in game.ts, as Sylvester sits down, every run; a tap or
Esc skips; dev `preview.sail('portal')`; stills in `previews/portal/`). The board is the game's own dark wood in a
brass rim with the opponents' round portraits (no painting needed); the doors are drawn by the game (oak, iron
bands, brass rings) over `yawning-portal.webp` until the user paints them. No sound yet. After Brodor: not built.

**4 then 2**, about 7 s, a tap skips:
1. The tournament board (3 s): the Ghoul and Gourd's names struck through, the Portal's silhouettes lighting.
2. The doors (3-4 s): the Portal's doors swing open on the well's light, the hall behind, "The Yawning Portal"
   rising, a line under it: "Here they play their best."
Then Sylvester's entrance card as now. The same board could play again after Brodor (the Portal's names struck
through, the ship's lit) before Bren on the quay, so every place change shows the run's progress.

## What it would need

- **Art (the user's):** the Portal's doors at night, closed, to open (idea 2); a tournament board on a tavern
  wall, empty (idea 4; the names, strikes and silhouettes drawn by the game over it). Or a map (idea 5), or a
  herald's bust (idea 3).
- **Sound (the user's, if wanted):** a heavy door, the well's hum; chalk on wood for the strikes.
- **Built from:** the ship's `SetSail` and `DockScene` (Hud), the trailer's silhouettes (`LINEUP`, `.tr-sil`),
  `yawning-portal.webp`.

## Questions for the user

- Which idea, or which mix?
- After Brodor too (before Bren on the quay), so each place change shows the board?
- Shown every run, or only the first time a player reaches the Portal (later runs skip it)?

## Re-workshop, 17 Nov evening: through the city instead of the board (**idea 1 built 17 Nov**, the user's yes, with their line "The CAWKs resurface to quench the challenger" in place of "Here they play their best."; the sign lettered; the board taken out)

The user, 17 Nov, having painted the doors (`art/portal-doors.jpg`: the Portal's oak doors in a stone arch, a
lantern each side, a blank sign over them, the well's blue-green light leaking through the seam and pooling on
wet cobbles): "Maybe a travel through the city to the Yawning Portal instead of a tournament screen." Nothing
below is built yet; the user chooses.

Three paintings already make a walk, dusk to night to the glow: outside the Ghoul and Gourd
(`art/ghoul-gourd-outside.jpg`, McGrath's backdrop, at dusk), the town street from the intro film
(`art/intro-town.jpg`, night, a lantern-bearer and a lit doorway at the street's end, with the film's
`intro-foreground.jpg` walls to slide past), and the new doors.

### Ideas

1. **The walk (recommended).** About 8 s, a tap skips, in place of the board:
   - *Leaving* (1.5 s): outside the Ghoul and Gourd at dusk, empty of McGrath; the camera drifts back from its
     door and away. "The Ghoul and Gourd behind you..."
   - *Across the city* (3 s): the town street, night now; a slow push up the cobbles toward the lit doorway, the
     foreground walls sliding out past the camera as in the film, lanterns flickering. "Across the city..."
     Footsteps on stone. No rain (the film has the rain; dry, it's a different night).
   - *The doors* (3.5 s): the user's painting. The game letters "The Yawning Portal" onto its blank sign in gold,
     the light in the seam brightens and pulses, then the two doors swing open (the painting cut down its seam,
     each half turning on its hinge in perspective), the well's light floods out, the camera pushes through into
     the hall (`yawning-portal.webp`), and "Here they play their best." rises. The Portal's own theme (music per
     place) swells in as the doors open.
   Then Sylvester's card. No new art needed.
2. **The walk, with the rivals on the way.** As 1, but along the street the Portal's five rivals show as
   silhouettes in lit windows or on tournament posters nailed to the walls, so the walk still says who's next
   (the board's job). More to read in a 3 s shot; crowded on an upright phone.
3. **Shorter: the street, then the doors** (about 6 s): drop the leaving shot.
4. **The board as a notice by the doors.** Keep the strikes and silhouettes, but as a small tournament notice
   pinned beside the doors, read in passing before they open. The stone beside the doors is cropped off an
   upright phone, so it would have to float over the painting.

### Notes

- On an upright phone the doors are wider than the screen: the shot sits on the seam and the sign, and the
  doors swing out past the edges as they open, which still reads.
- Sounds wanted (the user's, or synthesized for now): footsteps on cobbles, a heavy door's groan, the well's hum.
- The board's code (`PortalArrival` in Hud, `.pa-board`) would go; its round portraits could serve idea 2.

### Questions for the user

- Which idea (1 recommended), or a mix?
- Keep the lettering on the sign, or leave it blank as painted?
