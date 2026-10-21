# 2, 4, 24: project guide

A multiplayer tavern dice game being rebuilt from a single HTML page into a 3D, phone-first
web game. This file is the working reference: what exists, how it fits together, what has
bitten us before, and what comes next. Keep it current when something important changes.

## The game

Roll six dice; after every roll lock at least one. You must end with a **2** and a **4**
locked; the other four dice are your score (max 24). Missing the 2 or 4 is **dust**. Each
round, dust loses a life and the lowest valid score loses a life; ties go to sudden death
(in a Tavern Crawl a tie costs no one a heart).
A 24 restores a life (Tavern Crawl opponents too, since 18 Oct: a rolled 24, up to their lives for
the fight; the Hangman's Ace of Spades 24 doesn't heal him). Last player with lives wins.

Table codes: any code = classic multiplayer; `COMP` = solo vs The Molar; `TAVERN` = Tavern
Crawl (since 19 Oct a tournament of nine fights across two pubs: the Ghoul and Gourd, a
qualifier (Sperm McGrath, Frak, Danhausen, Duke Morrigan, Martha Mystery), then the final at
the Yawning Portal (Klarg, Rokr, The Hangman, Jaguar Cantona); each from Frak on has an
ability; between fights one event; gold and a global leaderboard; the run can be saved after
the Ghoul and Gourd). See "Tavern Crawl now" below.

## The person

- Plays and tests on an Android phone over home Wi-Fi; Windows PC; non-specialist, wants plain
  explanations and to see/hear results (send previews, screenshots).
- Makes the AI art themselves (see `docs/art-direction.md`); has strong opinions on feel
  (dice colours: red 1, green 6; Tavern Crawl has no commentary pop-ups).
- Not planned for now: new Devil/Vaelin avatars; the devil (three 6s) effect is to be redone
  "another way" later; ask before designing it.
- Wants **no sound** when Claude tests in a browser. Sets the game's numbers themself (e.g.
  Thonic prices) and the names ("Fizzy Thomic" is a deliberate pun).
- Pushing feature branches has been approved before; **merging to `main` deploys the live
  game: the user does that via a GitHub PR.** Ask before any push.

## Architecture

The **server is authoritative**: it rolls (crypto RNG), validates every action, scores from
the dice, runs the bots and the Tavern Crawl. Browsers only send requests (`rollDice`,
`toggleDie(id)`, `endTurn`; in a Tavern Crawl also `buyThonic(id)`, `drinkThonic(slot, dieId?)`
and, between fights, `pickpocket`, `chooseSpot`, `shrinePick`, `diceBet`, `strangerPick`,
`diceRoll`, `moveOn` (`leaveShop` is its older name); `wearMask(curse|devil)` for Martha's mask;
`joinTavern` may carry `resume`, a saved run) and render what comes back. Two clients share one server:

| Path | What |
|---|---|
| `server.js` | Express + Socket.IO. Rooms, turns (`room.turn`), rounds, Tavern Crawl (`TAVERN_ENCOUNTERS`, `THONICS`, `PLACES`, the events between fights, `fireTavernAbility`; its numbers come from `shared/balance.js`), bots, reconnection grace, leaderboard. Exports `start`, `rooms`, `io`, `emitState` for tests. |
| `shared/rules.js` | Pure rules (UMD: `require` on the server, `self.GameRules` in browsers): scoring, callouts, suspense, Klarg steal, Rokr blur (`viewTurn` hides values), Fizzy/Second Thoughts (`rerollOnes`, `putBackDie`), the Molar's simple play (`planBotLocks`). |
| `shared/strategy.js` | Server only: the best-play brain for Tavern Crawl opponents from Klarg on (exact solution over all dice outcomes, `bestKeeps`). |
| `public/` | The original classic page (`index.html`) at `/`, plus its art/audio. Thin client now; still works. |
| `client/` | The 3D client (Vite + React + React Three Fiber + cannon-es), built to `client/dist`, served at **`/next`**. |
| `test/` | `node --test`: rules and strategy unit tests, end-to-end server tests with socket.io-client; `dev-server.js` (not a test) for browser checks. |
| `art/` | Untouched AI originals. `client/scripts/process-art.mjs` (`npm --prefix client run art`) makes game files in `client/public/{art,textures}`. |
| `docs/art-direction.md` | Style, palette, asset list + status, prompt pack. |
| `shared/balance.js` | The Tavern Crawl's numbers: hearts, opponents' lives, gold, Thonic prices, events. |
| `balance/` | Balance simulator (`sim.js`), its check against the server, experiments, findings (`README.md`). |

Key socket events (server → client): `gameStateUpdate` (players, order, lives, mode, tavern
run incl. purse, shelf, shop), `turnState {turn, event}` (event `toggle`/`finalized`),
`diceRolled {turn, preRollCallout, suspense, devil, animationMs, throwSeed, rerolled?}`,
`roundResult`, `signatureMove`, `offerShop` (a fight is won; the name is historical), `thonicUsed`, `keepsakeActivated`, `resumeFailed`, `gameOver`
(with a `tavern` summary at the end of a run), `triggerNewGameSplash`. (`offerKeepsakes` /
`chooseKeepsake` are left over from the old keepsake-after-every-win; unused.)

### 3D client (`client/src`)
- `game.ts`: socket + store (`store.get/subscribe`), ordered task queue (rolls animate before
  later updates apply), seat memory (sessionStorage `tavernSeat`; rejoins on every reconnect),
  pending taps shown instantly over server turns, "Your turn" banner, invite links.
- `physics.ts`: each roll is **pre-simulated** (cannon-es, clipped-corner dice) and played back.
  When dice stop, faces are relabelled (`offsets`) so the server's values are on top. Seeded
  by the server's `throwSeed`, so every screen sees the identical tumble. Records `impacts`.
- `sounds.ts`: dice sound is **synthesized from physics impacts** (noise burst + falling body
  tone, through a compressor); so is the Thonic cork pop (`playCorkPop`). Other SFX/music are
  the classic mp3s from `public/`. Music (+ ambience) and game sounds switch separately (two
  header buttons; `localStorage.tavernMusicOff` / `tavernSoundsOff`; `tavernMuted = "1"` silences both).
- `TableScene.tsx`: camera solve (fits table between tavern band and controls), lights, tray,
  brass plates. Portrait phones and desktops/tablets on their side (height > 500) keep the
  table centred above the controls (on desktop a dock: chips, score, Roll; reactions in a
  column at the left edge); phones on their side use `setViewOffset` to leave a right column
  for the Roll button.
- `Dice.tsx`: dice meshes, slot placement by lock order, sphere hit targets, tap on pointer-down,
  Klarg's steal motion, Rokr's constellations, the Loaded Die's old-gold die (`materials.loaded`).
- `Hud.tsx`: lobby (invite `?table=CODE`, lives choice), turn banner (not in Tavern Crawl, where
  the nameplates show whose turn it is), chips, opponent nameplate, score to
  beat, controls, modals; Tavern Crawl: opponent intro card, signature-move banners, the purse
  and Thonic shelf (`drinkable()`), Thom's full-screen shop scene (`ThomShop`), the choice
  between fights (`Interlude`) and each event's scene (`SpotScene`), the run-over screen.
  `Backdrop.tsx`: the scene behind the table (`SCENES` by opponent: the tavern, or outside the
  Ghoul and Gourd for McGrath; each with its own `floor`, `aspect`, `center`) + the bot opponent's
  bust behind the table (multiplayer tables show no one there). `portraits.ts`: bust framing for round avatars (`PORTRAITS`,
  `SPOT_PORTRAITS`; `seat` draws a cut-out that shows more body larger, so heads match: McGrath 2,
  Frak 1.4, Danhausen 1.6, Martha 1.15). While the camera leans in on a suspense roll the bust keeps its size.

## Commands

```bash
npm start                      # server on :3000; prints the phone link ("On your Wi-Fi: ...")
npm test                       # server + rules tests (node --test)
npm run build                  # what Render runs: installs + builds client/dist
npm --prefix client test       # client tests (vitest)
npm --prefix client run art    # regenerate processed art from art/
```

**Subagents** (`.claude/agents/`, local to this PC because `.claude/` is gitignored; a session
started before a file was added won't see it by name, so run a general-purpose agent told to
read and follow the file):
- `phone-check`: after any HUD, camera, overlay or full-screen-scene change. Checks 384x780,
  360x640 and 844x390, muted; reports what covers the dice/rail or runs off screen.
- `art-import`: when the user sends a painting. Saves the original, cuts out the background
  (`cutOut` / `cutOutFlat`), checks edges on dark and light, registers it, reports previews.
- `render-deploy`: deploying to the Render test service, only after the user says yes to
  pushing. It tests, pushes `phase-2-3d-prototype`, watches the deploy in Claude in Chrome,
  reads the logs if it fails and smoke-tests `/next`. It never touches `main` or the live service.

`npm run dev:test-server` (`test/dev-server.js`): the game on :3002 plus controls on :3003 that
set up Tavern Crawl situations: `curl localhost:3003/shop?purse=200`, `/lives?n=1`,
`/shelf?ids=healing,lastGasp`, `/purse?n=150`, `/keepsakes?ids=loadedDie,marthasMask`, `/fight?n=2` (a fight
against opponent 0-8, ability ready), `/won?hearts=2` (the fight won: its summary, then the event), `/invitation` (Martha beaten), `/between?spots=thom,shrine` (add
`&pickpocket=1`, or `&stage=shrine|diceDen|hotTub|stranger|darren`). The pane's launch entry for it is `dev-test-server`.

Env: `PORT`, `GAME_TIME_SCALE` (tests use 0.01), `LEADERBOARD_READONLY`,
`TAVERN_START_ENCOUNTER` (1 = Frak … 5 = Klarg … 8 = Jaguar, for testing), `GAME_SERVER` (dev proxy target),
`SAVE_SECRET` (seals saved runs; **set it on Render**, or saves only last until the server restarts,
which on the free tier is every sleep and deploy).

## Working here: lessons learned

- **The user often has their own `npm start` running on :3000.** Don't kill it. Run test servers
  on another port (`PORT=3002`) and point the dev client at it
  (`GAME_SERVER=http://localhost:3002 node node_modules/vite/bin/vite.js --port 5173`).
- **Don't use `npx vite`**: it resolved a cached Vite 8 with no project config. Use
  `node node_modules/vite/bin/vite.js` from `client/`.
- **`server.js` uses CRLF line endings; keep them** (otherwise the whole file shows as changed).
  Edit via scripts that preserve `\r\n`. `core.autocrlf` is false in this repo.
- **Paths:** the session scratchpad path is too long for PowerShell/Git file arguments. Pipe
  content or use short paths (e.g. a temp file inside `.git/`). Git lives at
  `C:\Program Files\Git` (PowerShell may lack it on PATH; the Bash tool has it).
- **Dev test hook:** in dev builds `window.__game = { actions, preview, store, table, simulateRoll,
  renderImpacts, renderCorkPop }` drives games from scripts (`preview.ability(name, move)` /
  `preview.intro()` replay a Tavern Crawl moment on demand; the render functions produce
  sound samples offline, e.g. to save a WAV in the gitignored `previews/` for the user). It is excluded from production builds (verify
  with a grep of `dist`).
- **Silent browser tests:** the user asked for no sound when testing. Set
  `localStorage.tavernMuted = "1"` before joining (mute is remembered per device) and stub
  `HTMLMediaElement.prototype.play`.
- **Browser pane quirks:** a hidden pane pauses animation (rAF and CSS animations; screenshots go
  stale), so visual checks need the pane visible; the first screenshot after a reload often shows the table undrawn. Take another.
  After changing the emulated viewport, reload (the canvas keeps its old size otherwise).
- **React Three Fiber:** never pass freshly created objects (e.g. `new Vector3`) as props on
  every render; R3F re-applies them and snaps meshes (this caused locked dice to jitter).
- **Nothing may cover the dice or the slot rail.** On phones the camera fits the table above
  the footer using its measured height (`screenInsets.bottom`); on narrow screens, where the
  table can't shrink further, it pins the rail above the controls and the tavern gives way.
  Check at ~360x640 and ~384x800 after any HUD or camera change.
- **The phone footer decides how big the tavern and the opponent are** (the table sits right
  above it). Upright phones (`orientation: portrait`, width up to 600) keep it short: the score to
  beat and the turn score share a line, the purse/shelf sit beside your chip when they fit, and
  at tables with reactions the emoji row takes the hidden Roll button's place (same height, so
  nothing moves between turns). In a Tavern Crawl the bust may rise to 10 px from the top (no
  turn banner there). At 412x780 the far edge is at ~240 px (the old, rail-covering layout ~250).
- **Timers in order:** never rely on two `setTimeout`s with different delays firing in order;
  on a busy event loop they can come out swapped (this stalled the bot). Chain steps instead
  (`runBotDecision` locks one die, then schedules the next). The "too busy" test hogs the loop.
- **Camera solve** carries state across frames: guard against non-finite values and ignore
  implausible layout measurements (first frame), or the table vanishes for good.
- **AI art** usually arrives with a painted checkerboard instead of transparency; the art
  script removes it, with per-image fixes. Prompts now ask for a flat magenta background.
- **Phone access:** the PC's Wi-Fi address changes; `npm start` prints the current link.
  A DHCP reservation on the router (user's job) or Render fixes it for good.
- Commit messages end with the `Co-Authored-By` line from the session's instructions.

## Status (19 October 2026)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`, all pushed):** the 3D table at
  `/next`: physics dice, all painted art, tavern backdrop and opponent busts, multiplayer with
  invites and reconnection, phone and desktop layouts, turn banner, separate music / sound
  switches, synthesized dice sound, and the Tavern Crawl with Thonics, events between fights,
  best-play opponents and a balance pass set by simulation (below); since 19 Oct the two
  pubs and nine fights (Phase two of the design doc). 88 server/rules/strategy tests + 10
  client tests. A sensible player finishes the nine fights ~6.5% of the time with the user's
  starting lives (`node balance/experiments/runs.js`; see the next steps).
- **`main` = the live game, still the old version.** Nothing from Phase 1/2 is live yet.
- **Render:** the existing live service sits in "My project". The test service
  **`pirate-dice-next`** (branch `phase-2-3d-prototype`, auto-deploys on push, build
  `npm install && npm run build`, start `npm start`) is at
  https://pirate-dice-next.onrender.com/next and has every pushed commit. Free tier: it sleeps
  after ~15 min idle (first visit then takes up to ~50 s); `leaderboard.json` resets on each
  deploy.

## Tavern Crawl now

Design doc (shared with the user, kept current):
https://claude.ai/code/artifact/62ce683b-44ba-43a1-b71b-9dbe3b33d094

- **Planned (design doc, 20 Oct): 14 fights across three places.** The Yawning Portal gets five
  new opponents (Sylvester Stonefist: Sucker Punch, Vaelin Inkhand: Inkfire Brand, Stason Jatham:
  Flourish, the Ridgeler: Divine Smite, Brodor: Astral Flood, the boss, drops Brodor's Sunglasses,
  a 23 heals); Klarg's four move to a docked ship, the Salty Swallow (word comes its crew are
  top-tier players). Save after the Yawning Portal too. Vaelin Inkhand is the Vaelin
  avatar (new art). Busts for four of the five are in `client/public/art` (all but Brodor), registered in `PORTRAITS`. Only in the simulator so far: `balance/sim.js` `TOURNAMENT`,
  `balance/experiments/tournament.js` and `tournament-lives.js` (README for how each ability is
  played). Spots per place, the ship's events and stronger late abilities: to workshop.
- **Fights:** nine opponents in order (`TAVERN_ENCOUNTERS`, each with its `place`, a key of
  `PLACES`; `placeOf(room)`): the Ghoul and Gourd (McGrath, Frak, Danhausen, Duke Morrigan,
  Martha Mystery) then the Yawning Portal (Klarg, Rokr, the Hangman, Jaguar). McGrath is the
  Molar renamed (keeps the id `molar`, plays simply). All nine have painted busts (the new five since 19 Oct). Hearts reset to 3 each fight (20 Oct; 4 after the
  Lady's Favour); the opponents have 2 | 2, 3, 3, 3 | 3, 3, 3, 4 lives (`shared/balance.js`,
  the user's for now, balancing later). **Turns alternate**
  (player first in odd rounds, opponent in even). Each opponent gets an entrance (bust rises,
  name card). Signature moves play on the table after the dice stop (Klarg's die swept away,
  Rokr's constellations, the Hangman's shot, Jaguar's -3); no commentary pop-ups. Klarg steals a
  2 or 4 the player still needs, else the highest die. **The Ace of Spades is the Hangman's
  revolver** (not a card): his move is a muzzle flash and a bullet hole by a "24".
- **Opponents' play:** the whole Ghoul and Gourd plays simply (`planBotLocks`; McGrath as a
  teacher, and since 21 Oct Frak, Danhausen, the Duke and Martha too, the user's call; in a cursed
  round the simple habits chase low dice, `low`). From the Yawning Portal (Klarg) on
  they play their best (`shared/strategy.js`): the keep with the best chance of beating the
  player's score (ties count half), of a valid hand if the player dusted, or, going first, of
  leaving a score a sensible player fails to beat; the Hangman counts on his Ace at one life.
  Tables (~0.1 s each) are warmed after the server starts. Once the player has finished and
  the round can no longer be won or tied (`Rules.bestPossibleScore`, `tavernRoundLost`), the
  opponent keeps everything left at once and ends the turn instead of playing it out. They
  play like people, though: a 2 or 4 they still need is always taken when it shows
  (`takeNeeded` in strategy.js; pure best play kept a lone 6 and left needed 2s and 4s, which
  looked like mistakes). That costs up to 5 points of win chance at high targets: to beat 20
  they win 48% (pure best 53%, the old fixed habits 35%).
- **Abilities** fire from a random round 1-3, up to `abilityUses` times a fight (Frak 1,
  Danhausen 2, Duke 1, Martha 2, Klarg 1, Rokr 2, Hangman 1, Jaguar 1). Each use costs the
  player ~10 points of fight win chance. The new ones are **round effects**, decided as a round
  begins (`beginTavernRound`, `tavernRun.roundEffect = { kind, by, ability, as }`): Frak's
  **Mind Whip** (since 20 Oct, replacing Psychic Fog: on your first throw he keeps one of your dice
  for you, at random since 21 Oct (it was your worst), `Rules.mindWhip(turn, pick)`;
  `turn.mindDieId`, `mind` in the view; it counts as the throw's keep, can't be tapped back, and you
  may keep others; the solver's `optional`; its mist and badge show only once it has landed on
  your throw, and only while it's still your turn: the user's call, 20 Oct); Danhausen's **You are Cursed** (the lowest valid
  score wins the round; dust still loses; Ace and Smooth Talk don't fire; the solver plays it
  with `low`); the Duke's **Sympathy for the Devil** (waits, `pendingDevil`, until he has kept a 2 and a 4
  with 3+ dice to throw (the user's rule, 19 Oct); that throw gets three 6s and the devil effect
  plays; since 21 Oct no cap on your score (`devilCap: null`; a number brings the cap back, the
  solver's `cap`); never fires if he doesn't get there; while it waits, the simple-playing Duke keeps only the 2
  and 4 he needs, `Rules.devilWaitLocks`, or it hardly ever fired);
  Martha's **Disguises** (each use one of the three at random, `as` = whose face). The client
  shows a takeover (since 21 Oct: a flash in the ability's colours, `--flare`, and a banner across
  the screen with who, what and the move's text; Thonics keep the small plaque), a badge under the Roll button ("Cursed round: ..."), and in a cursed
  round a violet glow round the screen edges (`.curse-veil`). Every ability has its own colours
  (`AbilityAura` + banner classes by ability name): Mind Whip a green-violet mist and a
  green-violet glow on the die he chose (`materials.mind`; Rokr's blur keeps the blue "?" and stars), the Devil
  smouldering edges with rising embers, Rokr's blur twinkling stars, Klarg claw marks, Jaguar a
  gold sweep, the Hangman a gun-metal banner. The opponent's nameplate/chip
  shows one ✦ per use a fight (`AbilityMarks`, `abilityMax`), dark once spent, flaring after
  the banner.
- **Martha's mask** (`marthasMask`, dropped by Martha, not in the Stranger's pool): once a fight,
  before you roll, in a round with no effect yet, wear Danhausen's Curse or the Duke's Devil
  yourself (`wearMask`, `by: 'player'`; the Devil's three 6s are yours and the opponent is
  capped). On the strip it lights up and shows two choices inline (never over the rail).
- **The invitation and saving:** beating Martha gives `interlude.stage = 'invitation'` instead of
  an event (no events on the way to the final). "On to the Yawning Portal" or "Save and continue
  later": the server seals the run (`sealSave`, HMAC with `SAVE_SECRET`); the client keeps it in
  `localStorage.tavernSave` and the start screen offers "Continue your crawl" (`actions.resume`,
  `joinTavern` with `resume`). A save opens once (`openedSaves`, in memory) and comes back at the
  invitation with a fresh save; an edited or used one sends `resumeFailed` and a fresh crawl.
- **Between fights, the flow** (the user asked for no stutter, 20 Oct): the server's `seated` is who
  sits at the table (the beaten opponent until the next fight starts; `enemy` is already the next
  one). The client waits for the fight's last roll plus `BETWEEN_PAUSE_MS` before raising the
  scenes (`snapshot.betweenShown`); while they are up nobody sits at the table, so leaving a scene
  shows an empty table and then the next opponent's entrance. The summary fades straight into
  the event underneath (Modals renders both while it leaves).
- **After each win** a summary screen (`FightWon` in Hud, before the event or the invitation):
  the opponent's portrait, the gold for the win and for each heart left, one line at a time with
  synthesized coin clinks (`playCoins`), the purse counting up, then "Next" (`lastWin` carries
  `place`, `gold.heartsLeft/perHeart/perPlace` and `at`; shown once, `localStorage.tavernWinSeen`;
  not after a resume). The event scenes show only the purse now.
- **Gold:** a purse during the run (`GOLD`: 100 x the opponent's place per win, 25 per heart
  left; a perfect 24 pays nothing since 19 Oct, `perfect24: 0`, the user's call); the purse (+ a consolation for a lost run) is the final score and
  goes on the leaderboard. The run-over screen shows the breakdown.
- **Thom's Thonics:** one of the spots between fights: a full-screen scene (`.thom-scene`; Thom's bust from
  `art/bust-thom.jpg`, cut out by `cutOutFlat`) where Thom says "What ya havin'?". His cart
  shows 3 Thonics (Healing + 2 random, `pickThomStock`) and, since 21 Oct, **his back shelf**: two
  keepsakes you don't have, for gold (`keepsakePrices`: Shield 300, Trap Card and Velvet Cushion
  150, Loyalty Card and Potion Belt 125, Loaded Die 75; priced under what each adds when bought
  around fight 3, `balance/experiments/keepsake-when.js`; `buyKeepsake`, `pickThomKeepsakes`). A shelf holds up to 2 (`shelfSize`, the user's call, 18 Oct), carried
  between fights. Each Thonic is drunk at its own moment on your turn (server `drinkThonic`
  handler; the client's `drinkable()` mirrors it), with a cork pop:

  | Thonic | Price | When | Effect |
  |---|---|---|---|
  | Healing | 110 | before rolling, once a heart is lost | +1 heart |
  | Last Gasp | 130 | works by itself | a round that would take your last heart leaves you on 1 |
  | Fizzy Thomic | 20 | after a roll showing 1s | those 1s roll again (`rerollOnes`, `diceRolled.rerolled`) |
  | Second Thoughts | 30 | after keeping a die | a kept die goes back, free roll (`putBackDie`, `turn.freeRoll`, client `putBackSlot`) |
  | Steady | 90 | any time in the turn | a dust hand scores its dice as they lie at End Turn (`turn.steady`) |
  | Clear-Eye | 60 | before rolling, while the opponent's ability has uses left | waits and cancels that ability's next use this fight (`clearEyeArmed`, `fireTavernAbility`) |

  Prices and effects were set by simulation on 19 Oct (`balance/README.md`).

- **Between fights** (step 3, `INTERLUDE` = `shared/balance.js` `interlude`, `tavernRun.interlude`; client
  `Interlude` in Hud): in a full-screen tavern scene, **two spots catch your eye** and you go
  to one (the user chose this over doors: it's a room you can look around, and it becomes "a
  fork in the road" in later places). Spots are drawn at random from `PLACES.tavern.spots`:
  Thom's cart (opens `ThomShop`), the Shrine to the Lady (light a candle: a blessing at random,
  her Favour, the next fight on 5 hearts, or her Grace, `ladysGrace`, the next dust that would
  cost a heart doesn't, kept until used; `blessingUsed` event; not given twice),
  the Dice Den (bet 50/100, only the bets the purse covers are offered, and below 50 gold the
  Den isn't one of the spots; then the player taps to roll two dice and the gambler rolls two;
  higher total doubles the bet, a tie rolls again). **A random event, then the spots** (21 Oct; from 18 Oct the event was the
  whole walk): after the thief, the Stranger or Darren, "Look around the tavern" (`lookAround`)
  brings the two spots, or "Or challenge X right away" skips them. The random events: about 1 walk in 4 a **pickpocket** strikes instead of the spots: roll one die, a
  4+ catches him (`pickpocketCatch`), else he takes half the purse (a quarter until 21 Oct); then straight on
  to the next fight. Else, 20% of the time (`strangerChance`, ~1 walk in 7), the **Hooded
  Stranger** finds you instead (a random event since 19 Oct, as the design doc decided; no
  longer a spot): one of two keepsakes, the next fight a heart short (on 3), or turn him
  down; only while keepsakes remain (`startInterlude`, `strangerOffer`). The choice screen
  is headed "Make your choice"; "Or challenge Klarg right away" (the next opponent's name)
  skips both spots (it's all at the one table, so the wording is "Challenge", never "walk").
  The **Wild Magic Hot Tub** (a spot in both pubs, since 20 Oct; 50 gold a soak since 21 Oct, `hotTubPrice`; the Shrine's candle 100, `shrinePrice`; neither is offered when the purse can't cover it): climb in and a wild surge
  is picked by weight (`hotTubSurges`): one of your dice (`hotTubDie`, aqua on the table,
  `materials.tub`) next fight never rolls a 1 / keeps the better of two / only rolls 4-6 / always
  lands on 6 / never rolls a 6, or Pruney Fingers, the next fight a heart short
  (`nextFightSurge` → `tubSurge`, `rollFaceFor`; a badge under Roll). Double Bubble's losing roll
  rises from the die as a fading ghost die (in a cursed round it keeps the lower roll) (`turn.twinRoll` → `diceRolled.twin` → `TwinGhost`). A soak averages about +1-2
  points of the next fight (`balance/experiments/hot-tub.js`). **Darren Snakehands**, the Ghoul and
  Gourd's barman (`PLACES.ghoulAndGourd.events`), finds you ~15% of walks when no thief or
  Stranger did: roll one die; 1-2 a Thonic on your shelf smashes (an empty shelf: 20 gold for
  the glass), 3-4 a free Thonic, 5-6 a Thonic and 50 gold (a full shelf: gold instead,
  `darrenOutcome`). Both have the user's paintings (since 20 Oct; `hot-tub.webp` is wide, sized by width).
  Each spot (and the pickpocket) is a full scene built on Thom's (`SpotScene`: the character
  rises in their own light with a speech bubble and reacts to what happens, sign + counter;
  the Shrine's painting is its stage). Their dice are 2D (`Die` in Hud: red 1, green 6) with
  the real dice sound (`simulateRoll` impacts). Gold won or lost here is
  `stats.eventGold` ("Between fights" on the run-over screen). Numbers set by simulation.
  Each spot has painted art in a round frame (`SPOT_PORTRAITS`); the Lady is the goddess of
  sailors. Game text calls the pickpocket "the thief" (no assumed gender).
- **Keepsakes:** only from the Hooded Stranger now (a random event, for a heart). Six since 19 Oct
  (the user picked the new three; Steady Hand Wrap and Brodor's Sunglasses were dropped). Gold
  each adds to a run from Klarg on (`balance/experiments/new-keepsakes.js`):

  | Keepsake (id) | Effect | Worth |
  |---|---|---|
  | Shield (`bentCopper`) | once a fight, the first life you'd lose isn't | ~275 |
  | Velvet Cushion | once a fight, losing by exactly 1 is a tie | ~165 |
  | Trap Card (`luckySeat`) | once a fight, your first tie counts as their loss | ~135 |
  | Potion Belt | shelf +1 slot (`beltSlots`), comes with a Healing (`beltThonic`) | ~175 (mostly the Healing) |
  | Loaded Die | die 0 (`LOADED_DIE`) rolls 4-6 (`loadedDieLow`); old gold on your turns | ~105 |
  | Thom's Loyalty Card | Thom always one of the spots; first Thonic each visit free (`shop.free`) | ~25 (a fun one: Thonics are priced near their worth) |

  Numbers in `shared/balance.js` `keepsakes`. Jaguar's drop waits for a second place.
  The old keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) is unused. The classic page
  at `/` walks straight on (its `leaveShop`), so it never sees the spots; the user is fine
  with that until the switch-over.
- **Known limits:** if your last die lands on a 1 it is kept at once, so Fizzy can't reroll a
  single last die (Second Thoughts can reopen the hand).

## Next steps (in order)

1. **Lives for nine fights** (the user's call): with the user's starting lives a sensible
   player qualifies ~23% and wins the final ~6.5% (per fight: McGrath 85, Frak 78, Danhausen
   65, Duke 56, Martha 42, Klarg 62, Rokr 66, Hangman 64, Jaguar 49%). Simulated options: Martha
   3 → 8.8%; Martha and Jaguar 3 → 10.8%; Danhausen 2, Duke 2, Martha 3 → 12.8%
   (`balance/README.md`). **Set `SAVE_SECRET` on Render** (an env var, any long random text) so
   saves survive sleeps and deploys.
   **User plays the test site on the phone** (needs the user): a full Tavern Crawl, then two
   phones over mobile data. Collect what feels off; change `shared/balance.js` and re-run
   `node balance/experiments/runs.js` to see the effect before pushing.
2. **Keepsakes, more** (the first rework is done, 19 Oct): ideas left from the shortlist, if the
   user wants more: Lucky Coin, Sailor's Compass, Gambler's Charm, Pickpocket's Glove, Gold
   Tooth, Hangman's Spare Bullet, Star Chart, Klarg's Mitt. Simulate each in `balance/sim.js`
   (~120-180 gold), show the user the numbers, then build. Keepsake icons on the strip with a
   flash when one triggers.
3. **Opponent abilities** (proposed 19 Oct; ask first): rework Rokr's blur (it removes your
   choice and is the weakest: e.g. "reading the stars" hides his score until you finish, or a
   partial blur), and give every ability a warning on the nameplate before it fires (it
   starts in a random round 1-3, and Clear-Eye now waits for it). Re-simulate and adjust
   lives after any change. Klarg, the Hangman and Jaguar are fine as they are.
4. **Ship to `main`:** prepare a PR from `phase-2-3d-prototype`; set the live service's build
   command to `npm install && npm run build`; the user merges (that deploys the live game);
   then delete the test service. Fix anything Render-specific as it appears.
5. **Persistence:** move the leaderboard to a small hosted database so it survives deploys
   (more important now that gold is the score).
6. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
   classic page reachable for a while; until then it skips Thom and the events, which the
   user accepted), update the PWA manifest/service worker, retire the old client code in
   `public/index.html`.
7. **Feel and big moments:** tune dice sound, roll length (~2.2 s), camera on other phones; a
   perfect-24 celebration; the devil/three-6s effect done the user's way (ask first).
8. **Later / nice to have:** Jaguar's keepsake drop (once there is a second place to carry it
   into); new places with tougher opponents (the roguelite); possibly the Molar at 1 life if
   he ends too many runs (~1 in 7 for a careful player); optional art (`docs/art-direction.md`
   "Wanted": keepsake pictures, Klarg's hand, the Hangman's revolver); delete the unused
   keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) and `Rules.getAbilityMaxUses`
   (replaced by `abilityUses` in `shared/balance.js`); smaller bundle (lazy-load three.js),
   compressed audio (the 9.5 MB ambience track), spectator mode, emoji reactions floating over
   the table.
