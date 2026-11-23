# Open questions

Everything waiting on the user's word, in one place. Add a question the moment it comes up (in a
brainstorm, while building, or from testing); when the user answers, move it to "Settled" with the
date and the answer, and change the game or the docs to match.

Brainstorms live in their own files in `docs/` (for example `voyage-brainstorm.md`), saved the same
day they happen, with what's been built marked as it lands.

## Open

(Tidied 17 Nov, again 18 Nov evening and 20 Nov evening: what was done moved to "Settled" below; what's left is here, most pressing first.)

### Difficulty (23 Nov)
1. **Players want the crawl easier, without taking lives off the Ghoul and Gourd's opponents.** Which levers? Eight ideas
   and their measured effects in `docs/difficulty-brainstorm.md`; Claude's pick: 4 hearts in the Ghoul and Gourd only, and
   soften Brodor and Klarg, measured with the expert first.
   **Done 23 Nov (the user's): Danhausen and the Duke down to 2 hearts** (McGrath 1, Frak 2, Martha 3 unchanged).

### Going live (live since 20 Nov)
1. **Not yet tried:** an iPhone (sound starting, the screen's height, the 3D table); a save replayed after a
   server restart; whether the leaderboard and the JUGS league survive a deploy (the live site and the test site share
   one Neon database now, so a deploy of either is a test).
2. **The test service (`pirate-dice-next`):** keep it for trying changes before they go live (the branch
   `phase-2-3d-prototype` deploys there; a pull request to `main` takes it live), or delete it? It shares the live
   site's Neon database, so scores set there show on the live Legends board.
3. **The classic page's old code** (`public/index.html`, at `/classic`): retire it when the user says.

### Questions waiting on the user's word
- **The start screen, better still** (20 Nov, Claude's review): a music button on the start screen (music switched off in
  a game leaves it silent with no way back there); on big windows (1920x1080) the panel and its links are small for the
  space, so scale them up; on a phone on its side the logo is small. Which, if any?
- **The ability ribbon's words** (`docs/ability-feedback-brainstorm.md`): built 18 Nov with Claude's draft lines (and Cutting Words'
  since 20 Nov); rewrite any of them?
- **The celebration logo** (`docs/logo-brainstorm.md`): built 20 Nov with the perfect 24's cheer (the user's); a sound of its own, if wanted.
- **Becalmed's look** (`docs/voyage-brainstorm.md`, "Becalmed's look"): the three lanterns were tried and taken out (18 Nov,
  the user: "too confusing"). Open: the slack sail would cover the opponent's bust over the table (the user, 18 Nov);
  Claude suggests it only in the sea die's Becalmed moment, as a full painting, or not at all. And the glassy sea on the
  dial (no art needed): wanted?
- **Gold and keepsakes** (`docs/economy-brainstorm.md`, 17 Nov evening): built the same evening, the user's: prices by
  place (×1, ×1.5, ×2), keepsakes dearer, the Gilded Die and Bren's Compass. To try in play (their paintings are in, 17 Nov). Open: the other ideas in the doc (Fixer's Purse, Mercenary's Contract, Banker's Seal, Money
  Belt, Pawnbroker's Ticket, Witch's Mirror, Spyglass).
- **The voyage:** the dials are first guesses, never simulated. Is All In with a rogue wave two rounds in three
  too cruel? Starry Form in a becalmed round: too harsh (option: none while becalmed)? Teach the opponents (and the simulator) that a wave is coming? The Cloak and All In
  are still working names (Smooth Talk became Smooth Talker, 18 Nov).
- **The finale after Jaguar** (`docs/finale-brainstorm.md`): built 21 Nov the user's way (home to Waterdeep at dawn, Kram's
  mark burned into the empty quay, "To be continued?"), from the paintings already in the game. Its paintings and sounds are the
  user's since the same evening. The Can Garda: a last set of opponents, later (the user's, 18 Nov).
- **The interface:** should the turn score move into your chip? The hearts drawn in CSS, or a painted heart?
- **The start screen:** clear enough on a phone? The computer's title on the left: good? (The tavern tune plays from
  the first tap since 18 Nov, the user's.) The Hall of Legends' place and name, and its text on points? The hearts button for a new
  table's lives clear enough? The die left out on phones under 740 px tall: OK? (The "Classic game" link is gone, 18 Nov.)
  Not built: a "How to play" card.
- **Small things:**
  - `Whoa.mp3` is off until reworked (`WHOA_ON`). Dirty 20!'s colour (`#c5d04a`) not seen by eye; a sound for it,
    and for Astral Flood's wave, if wanted.

### What a player would notice (found in the 17 Nov review; none built yet)
- **Nothing teaches a newcomer on the table:** the entrance card explains the rules, but nothing shows how to keep
  a die or why Roll waits. A first-crawl hint or two against Sperm McGrath?
- **Silences** (the list is in `docs/art-direction.md`; Becalmed stays silent, the user's, 18 Nov): five scenes between fights with no loop of
  their own (Johnny, Jorvash, Darren, the Stranger, the thief); the synthesized sounds (the sea's swell, the
  ship's bell, the shared keepsake chime, the coins) could become real clips.
- **Light and living backdrops per place** (the Portal's well light, swinging lanterns aboard, the fire
  flickering): the biggest lift left for the look.

### Numbers to set (after play-testing)
- Overall difficulty is settled for now (18 Nov, the user: "a good player clears this no problem"; the expert's numbers
  are kept in `balance/README.md`). Still first guesses, to change if play says so: the Duke's `devilWhenBelow` (0.7);
  the keepsake prices (16-36, x the place, since 17 Nov) and the Miser's Purse's 1 a 5 (18 Nov); the Elf Bars (8-14);
  the Bard (8); the Cult (15% of walks, 2 fights); Yvesil's and Jorvash's prices and chances; the sea dials; Áéd's
  numbers; `abilityTiming`. `balance/expert-crawl.js` plays whole crawls on the real game to measure any of them.

### Ideas not chosen yet
- More keepsakes (workshopped 30 Oct): Lodestone, Spyglass, Hangman's Spare Bullet, Devil's Bargain, Brawler's
  Knuckles, Sigil of Kram, Rokr's Star Chart, Witch's Mirror, Gold Tooth (the Sailor's, now Bren's, Compass was built
  17 Nov). A keepsake pool per
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
- 23 Nov: **players' feedback, built (the user's list):** (a tap on a back-shelf keepsake for its full description was built and
  taken out the same day, the user's; Thom's scene has a 👁 Items button instead, to see your strip); a warning before anything is replaced ("Leave X behind for Y? It's gone for good.",
  with the Potion Belt's Thonic named), and you pick what goes: keepsakes on Thom's shelf and a boss's drop, Thonics and
  Elf Bars on a full shelf (Thom, Johnny; it used to say "Shelf full"); "Throw away" on any item's panel, asked twice; your
  shelf and keepsakes seen from Thom's cart (the 👁 Items button); how long a buff lasts, a tag on its strip icon (⌛1 this fight, ⌛3 fights left,
  a pink dot until used) and a line on its panel, the hot tub's surge now on the strip too; the Gambler's Charm's note
  over the felt each time it works ("threw 5 and 2: kept 5"), a ghost even on a tie, clearer text; **interest**: 1 gold
  for every 5 in the purse at each win, for everyone (the user's pick; first every 10, then 5 the same day; the Miser's Purse still adds its 1 per 5 on top);
  no heart back from a perfect hand for the Duke, Martha and the Hangman (his Ace of Spades too).
- 21 Nov: "Your dice" moved to the start screen's Play with friends panel only (invite links too; the user's), as the set shows
  at friends' tables; the picker's Ivory die centred and its names wrapping only between words.
- 20 Nov: **the new game is live** at https://two-4-24.onrender.com. The user set the live Render service's build
  command, `SAVE_SECRET` and `DATABASE_URL` (the same Neon database as the test site) and merged PR #1; PR #2 made the
  main address open the new game (`/` sends you on to `/next/`, invites too) with the classic page at `/classic`. MOB's
  and Rossatron's crawl scores were deleted from the leaderboard before launch (the user's; War Daddy's kept).
- 18 Nov evening: the start screen plays the Ghoul and Gourd's tavern tune from the first tap (it was silent until you sat
  down), fading out under the intro film. Martha's letter has the user's words and comes by flying snake. The phone's
  strip fits one line; the turn score's plaque is slimmer; Yvesil's omens are heard over her theme; Divine Smite's
  landing is about twice as smooth; every dice throw crosses the tray.
- 18 Nov: difficulty: the user finds a good player clears the crawl (far better than the expert's numbers in
  `balance/README.md`, "18 Nov: an expert on the real game"), so nothing changes; the numbers are kept for now. The Miser's
  Purse pays 1 gold for every 5 in the purse (it was 10).
- 18 Nov: points (`docs/points-brainstorm.md`): a perfect hand is worth 50 (a 24, or a cursed Perfect ...4?), and winning
  the crawl 2,000. The other parts stay as they are.
- 18 Nov (the user's answers): everything in "To judge on a phone" is good. The Cult of Kram's "face Kram" meant Klarg (as
  built). The abilities' timing, Bren's Compass rolling by itself, the walk to the Portal, the Ebon Shield showing his hand
  in fog, Áéd and Cotton Candy Cloud in fog stay as they are. Gold left at the end already counts, a point a gold piece
  (kept). Built the same day: a friends' game already under way seats a late return (or anyone new) for the next game
  ("Next game" on their card, `waiting`, `gameUnderway`; a test); Smooth Talk is **Smooth Talker**; the start screen's
  "Classic game" link is gone; a round's result says "Lost a life: name" (it said "Dust: name" even for a valid lower
  hand); the Potion Belt left behind drops the Thonic in its slot (`dropBeltThonics`); no tavern crowd aboard the ship
  (`crowdVolume` in sounds.ts). Numbers for an expert player: `balance/expert-crawl.js`, written up in `balance/README.md`.
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
