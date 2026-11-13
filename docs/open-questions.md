# Open questions

Everything waiting on the user's word, in one place. Add a question the moment it comes up (in a
brainstorm, while building, or from testing); when the user answers, move it to "Settled" with the
date and the answer, and change the game or the docs to match.

Brainstorms live in their own files in `docs/` (for example `voyage-brainstorm.md`), saved the same
day they happen, with what's been built marked as it lands.

## Open

### The game's interface (`docs/ui-brainstorm.md`, 12 Nov)
- All eight ideas are built (12 Nov; the ability marks as gems were reverted, the "Your turn" tab taken out). Should the turn score move into your chip after all (it would shift the table a little on phones)?
- The hearts: drawn in CSS/SVG first, or a painted heart (full, empty) from the user?

### The voyage (`docs/voyage-brainstorm.md`)
- **The dials' numbers** (`BALANCE.voyage`, built as proposed in `docs/voyage-brainstorm.md`, "The final dials", 10 Nov): first guesses, not simulated. Klarg 2-5 calm; Rokr 2-3 Becalmed; the Hangman 2 Squall, 3 Heavy seas, 4 Fog; Jaguar by phase: talking 4-5 Fog, the Cloak 2-3 Squall and 4-5 Heavy seas, All In 2-5 Heavy seas. Is All In with a rogue wave two rounds in three too cruel?
- **Becalmed and Starry Form:** on Rokr's leg his Starry Form can come in a becalmed round: you keep blind with only three throws. Too harsh, or a fair storm-free danger? (Option: no Starry Form while becalmed.)
- **Becalmed's look and sound:** so far only a still, warm plaque and the hint counting throws. A sound (slack sails, a creak, gulls?) or something on the table, if wanted.
- **The opponents and the Rogue wave:** their solver doesn't know a wave is coming, so they keep as on a calm sea. Teach it (and the balance simulator) before setting the dial's numbers?
- **Sound levels to hear by ear (10 Nov):** the Squall's wind at 0.22 and Jaguar's music at 0.15 were set by measuring (both are loud recordings), the rogue wave at full volume (a quiet one).
- The ship's ability names are still working names: Smooth Talk, the Cloak, All In.

### Water of the Ebon Shield (`docs/ebon-shield-brainstorm.md`, 10 Nov)
- It does what the Lady's Favour does (one extra heart next fight). Which new use? Recommended: black water, the sea can't move your dice next fight. If so, against the list and the rogue wave only, or the Squall, Fog and Becalmed too?

### Áéd, the dragon sorcerer (`docs/aed-brainstorm.md`, built 11 Nov)
- His numbers, first guesses: 6 uses a fight, each trick at least once (the user's, 13 Nov), how keen he is to spend the spare two (`minGain` 0.12 and 0.06), 3 hearts, Heightened at most once a round. Played headless against the simple player (13 Nov, 40 fights each): the player won 33% against 3 uses and 23% against 6. Is he now too hard for the ship's third fight?
- His words: the four tricks' texts are Claude's. Anything he says?
- His Squall is on face 3 (a first guess): another face, or another storm?
- Art and sound: an ability painting (one, or one per trick) and a sound for his spells, if wanted; his dragon's colour (the card and banners use his robe's violet and gold).
- His scales (an extra heart, or his first lost heart stays) were in the brainstorm but not asked for: leave out?
- The balance simulator doesn't know him.

### Moments without a stutter (12-13 Nov, pushed 13 Nov)
- To feel on the phone: do the ability moments (Starry Form's hidden throw, Mind Whip's die, Inkfire's flame, any painting rising) now come in smoothly? Headless checks show no shader built during play; the phone hasn't been tried.

### The trailer, take two (`docs/trailer-brainstorm.md`, built 11 Nov)
- The user's trailer track (11 Nov) is fitted by its sections, its boom's section played twice: to hear by ear, the join at the repeat (about 27.8 s into the trailer) and whether the shots land well on its beats.

### Small things

- Sounds and music: which of the missing ones to make (the list is in `docs/art-direction.md`, "Sounds and music still missing", 11 Nov): Jaguar's three phases and Áéd's spells play in silence; five scenes between fights have no loop; Becalmed has no sound; no music for the Yawning Portal or the ship.
- Tavern Crawl's round result says "Dust: [name]" for whoever lost a life, even with a valid lower score.
- `Whoa.mp3` is off until the user reworks it (`WHOA_ON`).
- The Dirty 20! colour (`#c5d04a`) hasn't been seen by eye; a sound for it, and for Astral Flood's wave, if wanted.
- The Potion Belt left behind with 3 Thonics carried: the third is kept in an extra slot (10 Nov).
  Or should it be lost?
- Cotton Candy Cloud in a fog bank (found 10 Nov, checking the code): the fog already hides your score from him, so a puff there does nothing more, but it still uses up the puff. Leave it, or don't offer it in fog?

### Numbers to set (after play-testing; simulate first with `balance/`)
- The Ghoul and Gourd's lives; the Duke's `devilWhenBelow` (0.7); keepsake prices (Miser's Purse 12,
  Gambler's Charm 14, Bottomless Flask 12, Loaded Die 12), whether the Miser's Purse needs a cap; the Elf
  Bars (8-14); the Bard (8); the Cult (15% of walks, 2 fights); uses per fight for the Yawning Portal's
  five; Yvesil's and Jorvash's prices and chances.
- Overall difficulty: the simulator says hard (0.3% finish), the user finds it easier.

### Ideas not chosen yet
- More keepsakes (workshopped 30 Oct): Lodestone, Spyglass, Hangman's Spare Bullet, Devil's Bargain,
  Brawler's Knuckles, Sigil of Kram, Rokr's Star Chart, Witch's Mirror, Sailor's Compass, Gold Tooth. A
  keepsake pool per place was offered and not taken.
- A warning on the opponent's nameplate before an ability fires.

### The start screen (`docs/landing-page-brainstorm.md`, 12 Nov)
- Decluttering the phone screen (ideas 1-4 built 12 Nov): does the phone now feel clear enough, or should the painting grow more? A computer now has the title on the left and the panel on the right (12 Nov): good?
- Everything there is built (12 Nov; the living tavern built and taken out) but idea 9, the tavern tune on the first tap: wanted?
- The Hall of Legends (built 12 Nov): the plaque's place (top right) and name ("Legends"); the text on how points are earned.
- Two doors (built 12 Nov): "Start a table" now makes a four-letter code for you. Is a hearts button you tap (2, 3, 4) clear enough for a new table's lives? The die is left out on upright phones under 740 px tall to make room: OK?
- The classic game is now a small "Classic game" link in the corner (hidden on short upright phones). Keep it, or drop it?

## Settled
- 13 Nov: the sea die's needle has the user's own clips: a tick past each sector line, and a clunk as it lands on its face.
- 13 Nov: the other ten opponents' dice: the user painted all ten at once; in the game the same day.
- 13 Nov: Jaguar's Cloak stays as it was: he throws after you, his dice hidden (the user's). Throwing first with his hand hidden until yours was done was built and taken back out the same day.
- 13 Nov: Áéd has six uses a fight, and every one of his four tricks comes out at least once (the user's). Jaguar's Smooth Talk is ready from his first round: before, it could wait until round 3, and a fight that took him to 2 hearts in two rounds never saw it.
- 13 Nov: the stutter fix pushed to the test site (the user's yes).
- 12 Nov: no "Your turn" tab over your nameplate (the glow alone says it). Danhausen's ability is "You are Cursed!", Martha is "Martha/Mystery" and her ability "Disguise Self".
- 12 Nov: the ability marks stay ✦ (gems were tried and reverted). Idea 8, one button family, built.
- 12 Nov: the trailer's words: "Let's really roll some dice." (was "It's time to roll the dice."); the rivals' rows under "An expanded roster", "Of familiar faces", "To test your mettle against"; no "Fifteen rivals." heading; the Shrine's and the hot tub's paintings shown whole.
- 12 Nov: the start screen's living tavern taken out; the Tavern Crawl's painting is its button; the phone screen decluttered (one painting, Play with friends behind one button).
- 11 Nov: the trailer plays the user's own track (TrailerMusic.mp3), and Áéd is in its line-up ("Fifteen rivals.").
- 11 Nov: Áéd's card line is "Áéd, dragon sorcerer of unlimited power. Just ask Jorvash.", and his sea dial has a storm on one face: a Squall (on face 3).
- 11 Nov (evening): Áéd's metamagic is three uses a fight, each any of the four tricks (it was 5 sorcery points with costs).
- 11 Nov: the new opponent is Áéd (so spelt), a dragon sorcerer, after Rokr aboard the Salty Swallow: metamagic with sorcery points (Heightened, Quickened, Empowered, Twinned), the user's painting. The trailer is kept as it is for now.
- 11 Nov: the trailer's words over the old game are the user's: "The original game was fine...", then, as the old 6 turns, "But it was time to rebuild the tavern."
- 11 Nov: the trailer, rebuilt on Claude's recommendations (the user: "go with your recommendations and build it"): real old-game stills in an old phone, a fond memory, the old tune muffled; the old flat 6 turning into the new die; every opponent as a silhouette in a line-up by place, all fourteen, one gold rim, no names, Jaguar almost seen; the ability paintings out; "Between fights..." with Thom, the thief, the Shrine, the hot tub, Johnny and Yvesil; one bar of the music repeated; upright phone only.
- 10 Nov: "build the next item": Jaguar's sea dial follows his phase, as in the proposed final dials.
- 10 Nov: in fog the Hangman's Ace of Spades (and the Bard's Cutting Words on his hand, and a Clear-Eye cancelling his Ace) shows at the round's end, not as it happens. The Fog bank's sound is the user's foghorn.
- 10 Nov: Penitent Stare isn't telegraphed: no banner or plaque as a round begins; with both hands done he uses it only when he isn't already winning and it wins or ties him the round. (Whether a tie is worth it to him is a guess of mine: say if it should be only for a win.)
- 10 Nov: the dial's Heavy seas slice is turquoise and the Squall's violet (they were slate and indigo, hard to see).
- 10 Nov: the Hangman's markers: one beside each of his two powers on his card (they were both beside Penitent Stare); every opponent's card now marks each power with its own.
- 10 Nov: the user's clips: `RogueWave.mp3` for the rogue wave, `Wind.mp3` looping through a Squall round, `JaguarBossBattle.mp3` as the music for Jaguar's fight, trimmed (the user's yes) of its silent start and the 5 s of dead air after its fade, so it loops without a gap (6:46).
- 10 Nov: St Elmo's fire is cut. So is the player's say over the sea: no Compass, Spyglass, Yvesil's forecast or Ginger Thonic.
- 10 Nov: on every sea dial a 1 is listing to port and a 6 listing to starboard; faces 2-5 are each leg's own weather.
- 10 Nov: the Rogue wave spares your last loose die: dice kept after the first throw stay, so a hand that kept five finishes with six.
- 10 Nov: Yvesil is a her. The intro's last scene doesn't glitch. The floating constellations over
  Starry Form's dice stay, appearing with the throw. The thief's text says "spot them". The Loaded Die
  shows no 6 while listing to port. No Devil moment for hidden dice.
