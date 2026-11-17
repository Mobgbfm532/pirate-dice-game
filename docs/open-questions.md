# Open questions

Everything waiting on the user's word, in one place. Add a question the moment it comes up (in a
brainstorm, while building, or from testing); when the user answers, move it to "Settled" with the
date and the answer, and change the game or the docs to match.

Brainstorms live in their own files in `docs/` (for example `voyage-brainstorm.md`), saved the same
day they happen, with what's been built marked as it lands.

## Open

(Tidied 17 Nov: what was done moved to "Settled" below; what's left is here, most pressing first.)

### Going live
1. **The live Render service's settings (the user's to do, before the merge, or the live game breaks):** the build
   command `npm install && npm run build` (without it `/next` doesn't exist: `client/dist` isn't in git), a
   `SAVE_SECRET` (without it a restart loses every saved crawl), and a `DATABASE_URL` (without it the leaderboard
   lives in a file the free plan wipes at every sleep). The same Neon database as the test site (with its test
   scores), or a clean one?
2. **The new game at `/`:** decided (17 Nov), but not yet: built when the user says so (Next steps 12).
3. **Not yet tried:** an iPhone (sound starting, the screen's height, the 3D table); a save replayed after a
   server restart; whether the leaderboard and the JUGS league survive a deploy of the test site.

### To judge on a phone (built, never seen there)
- **17 Nov:** Divine Smite's quake (strong enough, or too much?); the Elf Bars' vapour clouds; Astral Flood no
  longer stalling (does it still look right?); the ship's dice with clean pips, Jaguar's dark pips, Frak's yellow
  6s (`previews/dice-eval/`); swapping a keepsake on Thom's back shelf; the Ebon Shield's line as a fight begins
  and on the sea die; the turn score the size of the score to beat, both in Almendra; music per place, Martha's
  theme and Jaguar's clips (the clips not yet heard in a real fight).
- **15-17 Nov:** a crawl that saves itself (is restarting the fight the right price for a lost table, and is an
  hour right?); the phone's start screen (the red Play bar, 44 px buttons, the Options sheet); the look check's
  fixes (the footer tray: should your chip join it too? a computer's pool of light: strong enough? the choice
  between fights; Áéd's painting, a pale rim still round his right-hand dice; the dice not yet thrown); the
  multiplayer tally board and bigger cards; Klarg's stolen die (the bug fixed 15 Nov: was it what looked weird on
  10 Nov?).
- **12-13 Nov:** the start screen and interface; ability moments without a stutter; the ship's weather, Bren and
  the sailing scene, Áéd.
- **By ear:** the three sound beds re-encoded smaller on 16 Nov (`Ambience.mp3`, `IntroRain.mp3`,
  `IntroTavernAmbience.mp3`); the Squall's wind (0.22), Jaguar's music (0.15) and the rogue wave (full); the
  trailer's join where its second section repeats (about 27.8 s in).

### Questions waiting on the user's word
- **The Ghoul and Gourd to the Yawning Portal** (`docs/portal-transition-brainstorm.md`): built 17 Nov, the user's
  pick, the tournament board then the doors (every run, skippable). Open: the doors painting (the prompt is in
  `docs/art-direction.md`), sounds (a heavy door, the well's hum, ink on the strikes) if wanted; the board after
  Brodor too, before Bren on the quay?
- **Multiplayer:** a player away two minutes leaves the table (Claude's choice); coming back later they join as a
  new seat with full hearts mid-game. Fine among friends, or should a late return sit out until the next game?
- **The Ebon Shield in fog:** you see his hand (Claude's call, 17 Nov: "unaffected"), though he still can't see
  yours. Keep, or should fog still hide his hand from you?
- **Áéd:** too hard for the ship's third fight (the simple player won 23% against his six uses, 33% against
  three)? His four tricks' texts are Claude's: anything he says? His Squall on face 3: another face, or another
  storm? A painting per trick? His scales (an extra heart) left out?
- **The voyage:** the dials are first guesses, never simulated. Is All In with a rogue wave two rounds in three
  too cruel? Starry Form in a becalmed round: too harsh (option: none while becalmed)? Becalmed's look and sound
  (only a still plaque now). Teach the opponents (and the simulator) that a wave is coming? The ship's ability
  names (Smooth Talk, the Cloak, All In) are still working names.
- **The interface:** should the turn score move into your chip? The hearts drawn in CSS, or a painted heart?
- **The start screen:** clear enough on a phone? The computer's title on the left: good? The tavern tune on the
  first tap (idea 9)? The Hall of Legends' place and name, and its text on points? The hearts button for a new
  table's lives clear enough? The die left out on phones under 740 px tall: OK? The "Classic game" link: keep?
  Not built: a "How to play" card.
- **Small things:**
  - Tavern Crawl's round result says "Dust: [name]" for whoever lost a heart, even with a valid lower score.
  - The Potion Belt left behind with 3 Thonics carried: the third is kept in an extra slot. Or lost?
  - Cotton Candy Cloud in a fog bank does nothing more but still uses the puff. Leave, or don't offer it?
  - `Whoa.mp3` is off until reworked (`WHOA_ON`). Dirty 20!'s colour (`#c5d04a`) not seen by eye; a sound for it,
    and for Astral Flood's wave, if wanted.

### What a player would notice (found in the 17 Nov review; none built yet)
- **Nothing teaches a newcomer on the table:** the entrance card explains the rules, but nothing shows how to keep
  a die or why Roll waits. A first-crawl hint or two against Sperm McGrath?
- **The tavern's crowd plays aboard the ship** (`Ambience.mp3` under every place's music).
- **Silences** (the list is in `docs/art-direction.md`): Becalmed; five scenes between fights with no loop of
  their own (Johnny, Jorvash, Darren, the Stranger, the thief); the synthesized sounds (the sea's swell, the
  ship's bell, the shared keepsake chime, the coins) could become real clips.
- **Light and living backdrops per place** (the Portal's well light, swinging lanterns aboard, the fire
  flickering): the biggest lift left for the look.

### Numbers to set (after play-testing; simulate first with `balance/`)
- The Ghoul and Gourd's lives; the Duke's `devilWhenBelow` (0.7); keepsake prices (Miser's Purse 12, Gambler's
  Charm 14, Bottomless Flask 12, Loaded Die 12), and whether the Miser's Purse needs a cap; the Elf Bars (8-14); the
  Bard (8); the Cult (15% of walks, 2 fights); uses per fight for the Yawning Portal's five; Yvesil's and
  Jorvash's prices and chances; the sea dials; Áéd's numbers.
- Overall difficulty: the simulator says hard (0.3% finish), the user finds it easier. The simulator doesn't know
  anything added since late October (Áéd, the sea, the Elf Bars, the Bard, the Cult, the new keepsakes): teach it
  first.

### Ideas not chosen yet
- More keepsakes (workshopped 30 Oct): Lodestone, Spyglass, Hangman's Spare Bullet, Devil's Bargain, Brawler's
  Knuckles, Sigil of Kram, Rokr's Star Chart, Witch's Mirror, Sailor's Compass, Gold Tooth. A keepsake pool per
  place was offered and not taken.
- A warning on the opponent's nameplate before an ability fires.
- Housekeeping: delete unused code (the Dice Den, the old keepsake cards, Martha's mask, Dead Eye, Written in the
  Stars, the synthesized cork pop); find why a few server tests fail now and then in a full run.

### For the record: the first load and the hosting measurements (16 Nov)
Built 16 Nov (recommendation 7), measured on the test site before: the start screen fetched 8.5 MB (sound 5.6 MB:
all fifty effects and the film's three clips; pictures 2.4 MB; code 0.4 MB).
- Effects are no longer fetched with the page (`preload = 'none'`); once sound starts, eleven come first, the
  rest two at a time (`decodeClips`). Ability paintings come once a crawl is under way (`fetchAllAbilityArt`).
- Three sound beds re-encoded smaller, the originals kept in `art/audio/`: `Ambience.mp3` 9.5 → 3.6 MB (96 kbps),
  `IntroRain.mp3` 683 → 214 KB, `IntroTavernAmbience.mp3` 751 → 301 KB. (The music, the scene loops and Jaguar's track are untouched.)
- The libraries are in a file of their own (`vendor`; vite.config.ts) and `/next/assets` may be kept by
  the browser for good (server.js), so a returning player fetches only what changed.
- Loading three.js after the start screen was not done: it is 0.26 MB of the 8.5, and the start screen's own
  die needs it.
- **Hosting, as measured:** the server idles at 77 MB and ran 60 crawls at once in 101 MB, using about 5% of
  one processor; a player costs about 58 KB a minute. Neon was awake 15.6 hours in the first half of November,
  about 4 of the free plan's 100 CU-hours. The live service is on Render's free plan, for at most six players
  now and then (settled 16 Nov): enough. A game tab left open keeps a free service awake (its connection keeps
  talking), and two free services awake all month would pass the 750 free hours they share.

## Settled
- 17 Nov: the old service worker (the classic page's, covering the whole site) stored everything the new game
  fetched; now it keeps only the classic page's few files and leaves the rest alone (found in the 17 Nov review).
- 17 Nov: the Water of the Ebon Shield keeps the sea die off you for a fight (no list, Squall, Becalmed, rogue wave
  or fog for you; it was an extra heart), and says so: "Your Ebon Shield holds: you are unaffected in this fight".
- 17 Nov: keepsakes swap on Thom's back shelf when your pockets are full. Mystery Flavour's line: "...and each fight
  is a different flavour at random." Elf Bars puff vapour in their flavour's colour. Divine Smite lands as a quake.
  Astral Flood made cheap to draw (it stalled a phone). The ship's dice with clean pips; Frak's 6s yellow.
- 17 Nov: the turn score the size of the score to beat; both numbers in Almendra, like the rest of the table (they
  were Alegreya from 15 Nov).
- 17 Nov: before going live: a safety net for server errors, one person per crawl table (five-character codes),
  `npm audit fix` (0 known weaknesses). The new game will be at `/`, but not yet. The live service's settings stay
  the user's to do.
- 17 Nov: the user's audio: music per place (the Portal, the ship, Martha's, Brodor's and Jaguar's fights) and
  Jaguar's three clips. Áéd has had his `UnlimitedPower.mp3` since 13 Nov.
- 16 Nov: a crawl saves itself, and its table is kept an hour; a faster first load (8.5 MB to about 2.9 MB); the
  phone's start screen to today's guidelines (a red Play bar, 44 px buttons, an Options sheet).
- 15 Nov: the end-to-end check found no bug in the rules or the build; its four go-live items were built by 17 Nov.
  The look check's five fixes built.
- 17 Nov: multiplayer's look: ideas 5 (bigger cards on a computer) and 6 (a chalk-board round result) and the two bugs; ideas 1-4 and 7 not wanted.
- 16 Nov: the live Render service is on the free plan, and the game is for at most 6 players playing now and then (the user's). The free Render and Neon plans are enough for that; the free plan's sleep and deploys are why "never lose a crawl" (recommendation 1) matters.
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
