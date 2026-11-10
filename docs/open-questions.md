# Open questions

Everything waiting on the user's word, in one place. Add a question the moment it comes up (in a
brainstorm, while building, or from testing); when the user answers, move it to "Settled" with the
date and the answer, and change the game or the docs to match.

Brainstorms live in their own files in `docs/` (for example `voyage-brainstorm.md`), saved the same
day they happen, with what's been built marked as it lands.

## Open

### The voyage (`docs/voyage-brainstorm.md`)
- **The final dials (proposed 10 Nov):** the table in `docs/voyage-brainstorm.md` ("The final dials"), Jaguar's changing with his phase. Waiting on the user.
- **Sea dials now** (`BALANCE.voyage`, first guesses): 1 port and 6 starboard on every leg (the user, 10 Nov); faces 2-5 calm, except Rokr's 2-3 Becalmed and the Hangman's 2 Squall, 3 Heavy seas and 4 Fog bank. Only Jaguar's dial is still plain.
- **Becalmed and Starry Form:** on Rokr's leg his Starry Form can come in a becalmed round: you keep blind with only three throws. Too harsh, or a fair storm-free danger? (Option: no Starry Form while becalmed.)
- **Becalmed's look and sound:** so far only a still, warm plaque and the hint counting throws. A sound (slack sails, a creak, gulls?) or something on the table, if wanted.
- **The opponents and the Rogue wave:** their solver doesn't know a wave is coming, so they keep as on a calm sea. Teach it (and the balance simulator) before setting the dial's numbers?
- **Sound levels to hear by ear (10 Nov):** the Squall's wind at 0.22 and Jaguar's music at 0.15 were set by measuring (both are loud recordings), the rogue wave at full volume (a quiet one).
- **Jaguar's storm following his phases** (calm or fog, then squalls and waves, then heeling and waves)
  isn't built; his dial is a plain mix for now.
- The ship's ability names are still working names: Smooth Talk, the Cloak, All In.

### Small things
- Tavern Crawl's round result says "Dust: [name]" for whoever lost a life, even with a valid lower score.
- `Whoa.mp3` is off until the user reworks it (`WHOA_ON`).
- The Dirty 20! colour (`#c5d04a`) hasn't been seen by eye; a sound for it, and for Astral Flood's wave, if wanted.
- The Potion Belt left behind with 3 Thonics carried: the third is kept in an extra slot (10 Nov).
  Or should it be lost?

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

## Settled
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
