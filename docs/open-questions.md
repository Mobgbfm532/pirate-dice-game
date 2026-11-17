# Open questions

Everything waiting on the user's word, in one place. Add a question the moment it comes up (in a
brainstorm, while building, or from testing); when the user answers, move it to "Settled" with the
date and the answer, and change the game or the docs to match.

Brainstorms live in their own files in `docs/` (for example `voyage-brainstorm.md`), saved the same
day they happen, with what's been built marked as it lands.

## Open

### Multiplayer's look (`docs/multiplayer-look-brainstorm.md`, built 17 Nov; to judge on a phone and a computer)
- Built: bigger cards on a computer with the reactions in the dock, a dark-wood tally board for the round's result
  (with the game's own cracking heart; a chalk board was tried first), and both bugs fixed.
- A player away two minutes now leaves the table (my choice). Coming back later, they join as a new seat with
  full hearts mid-game. Fine among friends, or should a late return sit out until the next game?

### Going live: re-checked 17 Nov
The merge into `main` is still clean (main hasn't moved). Since 15 Nov a crawl saves itself, a player away two
minutes leaves a friends' table, and the first load is smaller. Still standing, most glaring first:
1. **The live Render service's settings, before the merge** (or the live game breaks): build command
   `npm install && npm run build` (without it `/next` doesn't exist: `client/dist` isn't in git), a `SAVE_SECRET`,
   and a `DATABASE_URL` (without it the leaderboard lives in a file the free plan wipes at every sleep). The same
   Neon database as the test site (with its test scores), or a clean one?
2. **`/` is still the old game.** Players at the live address get the classic page, with no way to the new one.
   **Decided 17 Nov (the user):** the new game will be at `/`, but not yet; built when the user says so.
   Item 1 (the live service's settings) stays open, the user's to do.
3. **Done 17 Nov:** a safety net for an unexpected server error (logged, the server keeps running; tried by forcing
   one); one person per Tavern Crawl table (anyone else is moved to a fresh table) with five-character codes;
   `npm audit fix` (0 known weaknesses now). 185 server tests pass.
6. Not yet tried: an iPhone, and the 15-17 Nov changes on your phone.

### Going live (the end-to-end check of 15 Nov) (kept for the record)
Checked: 181 server tests and 19 client tests pass, the client builds with no type errors and no dev hooks
in it, the merge into `main` is clean, the test site serves this exact build, 17,200 junk messages didn't
crash a test server. What's left to decide or fix before the merge:
- **A crawl lost when the phone is away, or the server restarts: built 16 Nov, on the test site** (not yet seen on a phone). A
  Tavern Crawl saves itself: the server sends the run's save to the browser whenever it changes, and a crawl's
  table is kept an hour, not 2 minutes. Coming back to a table that's gone brings the run back: in a fight, from
  that fight's start (a toast says so). Leaving a crawl now leaves "Continue" on the start screen. Open: is
  restarting the fight the right price for a lost table, and is an hour right? The live service needs a
  `SAVE_SECRET`, or a restart still loses the run. Multiplayer tables are as before (2 minutes, nothing saved).
- **Nothing catches an unexpected error on the server:** one would stop the server and end every table.
  Add a safety net (log it, keep running)?
- **Two people can land at one crawl table:** the code is `TVRN-` plus four random digits, and a second
  person who gets (or types) the same one is seated in the first one's run (checked). Refuse them, and
  make the code longer?
- **`/` stays the classic page after the merge**, with no link to `/next`. Is going live "the new game at
  `/`" (next step 12) or "the new game at `/next`, with a link from the old page"?
- **`npm audit` lists 8 known weaknesses in the server's packages** (express's and socket.io's parts,
  mostly ways to overload a server); `npm audit fix` updates them without breaking changes. Run it and
  re-test?
- **iPhones have never been tried** (sound starting, screen height, WebGL), nor a save replayed after a
  server restart (a save "opens once" only while the server stays up: `openedSaves` is in memory).
- The live service's settings (step 11): build command, its own `SAVE_SECRET`, `DATABASE_URL` (the same
  Neon database as the test site, with its test scores, or a clean one?).

### The phone's start screen: built 16 Nov, on the test site 17 Nov (before/after in `previews/home2/pair-*.jpg`)
Built: a full-width red Play / Continue bar on the painting, "Play with friends" in dark leather, two 44 px
buttons under the painting (Start a new crawl or Watch the intro, and Options), an Options sheet (a real switch
for the intro, Watch the intro, Forget the saved crawl on a second tap), a 44 px name line, clearer friends'
tokens and "hearts each" on the hearts button. Computers and phones on their side keep their links. Not built:
the "How to play" card (item 4) and the header's 36 px coins (the opponent's "i" already had a 44 px tap area).
To judge on a phone. The list as it was:

### The phone's start screen against today's guidelines (16 Nov)
Looked at 384x780, 360x640 and 412x915 (`previews/home/`), first visit, returning with a save, and the friends
sheet. It fits every size without scrolling and looks the part. What falls short, in the order I'd fix it:
1. **The main action reads as the lesser one.** The Tavern Crawl painting is the button, but its only button-like
   part is a small red "Play" seal in a corner; "Play with friends" below is the biggest, brightest button on
   the screen. A full-width red Play / Continue bar along the painting's foot, and a quieter friends button.
2. **Four text links too small to tap surely:** "Start a new crawl", "Forget this save", "Watch the intro",
   "Intro before a crawl: on" are 22 px tall in 14 px type (guidelines ask 44 to 48 px); "Playing as Ada ✎" is
   29 px. And "Forget this save" sits a thumb's width from "Start a new crawl".
3. **"Intro before a crawl: on" is a switch written as a link.** A real switch, or move it and "Watch the intro"
   behind one small "More" button.
4. **Nothing tells a newcomer the rules** beyond the tagline: a "How to play" card (three lines and a picture).
5. **The friends sheet:** the tokens not chosen are greyed so far they look switched off, and the "♥♥♥" button
   has no label (it sets a new table's hearts).
6. In play, also small: the header's back and menu coins are 36 px and the opponent's "i" 20 px.

### A faster first load, and the hosting plans (16 Nov)
Built 16 Nov (recommendation 7), measured on the test site before: the start screen fetched 8.5 MB (sound 5.6 MB:
all fifty effects and the film's three clips; pictures 2.4 MB; code 0.4 MB).
- Effects are no longer fetched with the page (`preload = 'none'`); once sound starts, eleven come first, the
  rest two at a time (`decodeClips`). Ability paintings come once a crawl is under way (`fetchAllAbilityArt`).
- Three sound beds re-encoded smaller, the originals kept in `art/audio/`: `Ambience.mp3` 9.5 → 3.6 MB (96 kbps),
  `IntroRain.mp3` 683 → 214 KB, `IntroTavernAmbience.mp3` 751 → 301 KB. **To hear by ear: do they still sound
  right?** (The music, the scene loops and Jaguar's track are untouched.)
- The libraries are in a file of their own (`vendor`; vite.config.ts) and `/next/assets` may be kept by
  the browser for good (server.js), so a returning player fetches only what changed.
- Loading three.js after the start screen was not done: it is 0.26 MB of the 8.5, and the start screen's own
  die needs it.
- **Hosting, as measured:** the server idles at 77 MB and ran 60 crawls at once in 101 MB, using about 5% of
  one processor; a player costs about 58 KB a minute. Neon was awake 15.6 hours in the first half of November,
  about 4 of the free plan's 100 CU-hours. The live service is on Render's free plan, for at most six players
  now and then (settled 16 Nov): enough. A game tab left open keeps a free service awake (its connection keeps
  talking), and two free services awake all month would pass the 750 free hours they share.

### Claude's recommendations for what to do next (15 Nov; 1 and 7 built 16 Nov)
In the order I'd do them:
1. **Built 16 Nov.** Never lose a crawl: keep each fight's save on the phone by itself (the server already seals one as every
   fight starts, `run.fightSave`), and keep a Tavern Crawl table for an hour instead of 2 minutes. Covers the phone
   being away, a deploy and the server's sleep. About half a day.
2. **A safety net on the server and one person per crawl table** (log an unexpected error and keep running;
   refuse a second person at a `TVRN-` table). Small.
3. **`npm audit fix`**, then the tests again. Small.
4. **Try it on an iPhone** before friends do (sound starting, screen height, the 3D table).
5. **Light and living backdrops per place** (the Portal's cool well light, swinging lanterns aboard, the fire
   flickering): the biggest lift left for the look.
6. **The sounds still missing:** Jaguar's three phases, Becalmed, the five silent scenes, music for the Yawning
   Portal and the ship (the list is in `docs/art-direction.md`).
7. **A faster first load:** the 9.5 MB ambience track compressed, three.js loaded after the start screen.
8. **Teach the balance simulator the newer things** (Áéd, the sea, the Elf Bars, the Bard, the new keepsakes),
   then set the first-guess numbers.
9. **A first-crawl hint or two** against Sperm McGrath for someone who has never played (tap a die to keep it,
   why Roll waits): the entrance card explains the rules, nothing shows them on the table.
10. Small polish: the pale rim round Áéd's right-hand dice; your chip joining the footer's tray; a computer's
    multiplayer cards up in the header.

### The look: the five fixes of 15 Nov (to judge on a phone and a computer)
Built 15 Nov from the look check (before/after in `previews/look5/`), not yet seen by the user on a real phone:
- The phone's footer: the purse, shelf and keepsakes on one dark tray; the turn score in the middle when there's nothing to beat yet; the scores' numbers in Alegreya (Almendra's bold 0 drew as a blob). Good, or should the chip join the tray too?
- A computer's tabletop darkens away from the tray (a pool of light). Strong enough, too strong?
- The choice between fights on upright phones: the place's painting shows up top, bigger cards below.
- Áéd's painting: its smoke unmixed from the green (it was khaki). A pale rim is still left round his right-hand dice.
- The dice not yet thrown: a darker blue with a gold line and a shaded "?", under the dice's lacquer.
- Found on the way, a real bug (what looked like smeared pips): the die Klarg takes was drawn part of the way inside another die while it waited for his paw, worse on slow frames. Fixed (Dice.tsx). Is this what looked weird on 10 Nov?
- Still the biggest lift, not built: light and living backdrops per place.

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

- Sounds and music: which of the missing ones to make (the list is in `docs/art-direction.md`, "Sounds and music still missing", 11 Nov): Áéd's spells play in silence (Jaguar's three phases have the user's clips since 17 Nov, and the Portal, Brodor and the ship their music); five scenes between fights have no loop; Becalmed has no sound; no music for the Yawning Portal or the ship.
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
