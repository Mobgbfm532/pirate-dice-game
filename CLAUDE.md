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
Crawl (since 21 Oct a tournament of fourteen fights across three places: the Ghoul and Gourd, a
qualifier (Sperm McGrath, Frak, Danhausen, Duke Morrigan, Martha Mystery), the Yawning Portal
(Sylvester Stonefist, Vaelin Inkhand, Stason Jatham, The Ridgeler, Brodor), then the final aboard
the Salty Swallow, a docked ship (Klarg, Rokr, The Hangman, Jaguar Cantona); each from Frak on has
an ability; between fights a random event now and then, then a choice of two spots; gold to spend
(Thonics, keepsakes, the Shrine, the hot tub) and a global leaderboard; the run can be saved after
each place). See "Tavern Crawl now" below.

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
and, between fights, `pickpocket`, `darren`, `strangerPick`, `lookAround` (after a random event,
on to the spots), `chooseSpot`, `buyKeepsake(id)` (Thom's back shelf), `shrinePick`, `hotTub`,
`diceBet`, `diceRoll`, `moveOn` (`leaveShop` is its older name); `wearMask(curse|devil)` for Martha's mask;
`joinTavern` may carry `resume`, a saved run) and render what comes back. Two clients share one server:

| Path | What |
|---|---|
| `server.js` | Express + Socket.IO. Rooms, turns (`room.turn`), rounds, Tavern Crawl (`TAVERN_ENCOUNTERS`, `THONICS`, `PLACES`, the events between fights, `fireTavernAbility`; its numbers come from `shared/balance.js`), bots, reconnection grace, leaderboard. Exports `start`, `rooms`, `io`, `emitState` for tests. |
| `shared/rules.js` | Pure rules (UMD: `require` on the server, `self.GameRules` in browsers): scoring, callouts, suspense, Klarg steal, Rokr blur (`viewTurn` hides values), Fizzy/Second Thoughts (`rerollOnes`, `putBackDie`), the Molar's simple play (`planBotLocks`). |
| `shared/strategy.js` | Server only: the best-play brain for Tavern Crawl opponents from the Yawning Portal on (exact solution over all dice outcomes, `bestKeeps`). |
| `public/` | The original classic page (`index.html`) at `/`, plus its art/audio. Thin client now; still works. |
| `client/` | The 3D client (Vite + React + React Three Fiber + cannon-es), built to `client/dist`, served at **`/next`**. |
| `test/` | `node --test`: rules and strategy unit tests, end-to-end server tests with socket.io-client; `dev-server.js` (not a test) for browser checks; `shots.mjs`, `shots-base.mjs`, `compare.mjs` (not tests): before/after screenshots. `shots-base.mjs` serves a commit (default HEAD) frozen on :5174 (launch entry `shots-base`), so "before" can be shot while the working copy changes; `shots.mjs` shoots silently in headless Chrome (`node test/shots.mjs previews/x/before client=http://localhost:5174/next/ look=next fight=1 roll=1`; seeds the throw, waits for the table to settle); `compare.mjs previews/x` makes side-by-sides and change numbers. Needs the dev test server running. |
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
- `look.ts` (the look preview, off by default; see Status: Visuals): the `?look=next` switch and the shared flame.
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
  `Backdrop.tsx`: where the scene behind the table goes and who sits there (`SCENES` by opponent:
  the tavern, or outside the Ghoul and Gourd for McGrath; each with its own `floor`, `aspect`,
  `center`; `backdropLayout` in screen px; multiplayer tables show no one there). `Room.tsx`
  (since 23 Oct, visuals step A) draws the tavern and the bust **inside the 3D scene**: flat
  pictures hung in front of the camera at the same screen places, drawn first so the table
  covers them; a shader redoes the old CSS brightness/saturate/sepia, each drop-shadow is a
  blurred copy (`halo`), and the entrance, turn glow and Martha's swap are the old CSS curves. `portraits.ts`: bust framing for round avatars (`PORTRAITS`,
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
- `visual-shots`: after each visual step. Shoots the last commit (frozen, :5174) against the
  working copy (:5173), the same throw on both, builds side-by-sides, looks at them and reports
  in words (readability of 1s/6s and the plates, anything broken) with the pictures worth sending.
  Keeps dozens of screenshots out of the main session.
- `render-deploy`: deploying to the Render test service, only after the user says yes to
  pushing. It tests, pushes `phase-2-3d-prototype`, watches the deploy in Claude in Chrome,
  reads the logs if it fails and smoke-tests `/next`. It never touches `main` or the live service.

`npm run dev:test-server` (`test/dev-server.js`): the game on :3002 plus controls on :3003 that
set up Tavern Crawl situations: `curl localhost:3003/shop?purse=200`, `/lives?n=1`,
`/shelf?ids=healing,lastGasp`, `/purse?n=150`, `/keepsakes?ids=loadedDie,marthasMask`, `/fight?n=2` (a fight
against opponent 0-13, ability ready), `/won?hearts=2` (the fight won: its summary, then the event), `/invitation` (Martha beaten; `?boss=brodor` for Brodor), `/disguise?as=Frak` (Martha's mask for the round), `/seed?n=42` (every server draw follows a seed: the same throw each time; `/seed` ends it), `/between?spots=thom,shrine` (add
`&pickpocket=1`, or `&stage=shrine|diceDen|hotTub|stranger|darren`). The pane's launch entry for it is `dev-test-server`.

Env: `PORT`, `GAME_TIME_SCALE` (tests use 0.01), `LEADERBOARD_READONLY`,
`TAVERN_START_ENCOUNTER` (1 = Frak … 5 = Sylvester … 10 = Klarg … 13 = Jaguar, for testing), `GAME_SERVER` (dev proxy target),
`SAVE_SECRET` (seals saved runs; set on the Render test service since 21 Oct; the live service needs
one too, or saves only last until the server restarts, which on the free tier is every sleep and deploy).

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

## Status (23 October 2026)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`, all pushed):** the 3D table at
  `/next`: physics dice, all painted art, tavern backdrop and opponent busts, multiplayer with
  invites and reconnection, phone and desktop layouts, separate music / sound switches,
  synthesized dice sound, and the Tavern Crawl: two pubs and nine fights, Thonics, events
  between fights, keepsakes, gold to spend. Since 20-21 Oct (the user's calls after playing):
  3 hearts a fight; Frak's Mind Whip (a random die kept for you); the Duke's Devil without the
  18 cap; the whole Ghoul and Gourd plays simply; abilities take over the screen; a gold
  summary after each win and a smooth flow between fights; the Wild Magic Hot Tub and Darren
  Snakehands; the spots follow a random event; keepsakes on Thom's back shelf; the Shrine and
  the hot tub cost gold; the thief takes half. Later on 21 Oct: **the 14-fight tournament**
  (the Yawning Portal's five, Brodor's Sunglasses, Klarg's crew aboard the Salty Swallow, a save
  after each place). Then the user's 15 fixes after playing it (21 Oct): one thing at a time
  (see "Order of events"), Back of the Head, keepsakes as icons with a fanfare, the Devil mid-turn,
  Flourish's ghost dice, the hot tub only at the Ghoul and Gourd. Then: Brodor's painting and
  Martha's three mask paintings; McGrath on 1 life; a Clear-Eye cancel shows the ability first.
  117 server/rules/strategy tests + 10 client tests.
  The user found the game too hard (21 Oct); with the nine fights a sensible player finished
  ~3.9% of the time (`node balance/experiments/runs.js`; options in `easier.js`); over the
  fourteen, ~1.1% (`node balance/experiments/tournament.js`): 27% reach the Yawning Portal, 4.5%
  the ship; Brodor (23% a fight fresh on 3 hearts) and Jaguar (25%) are the steepest steps.
- **Visuals (22 Oct):** the plan is a doc shared with the user, "2, 4, 24: the next level visually"
  (https://claude.ai/artifact/9MHGFUVoVrLiQiD7ZgL7ZJ): six directions, option 1 (light, glow and
  atmosphere) in seven steps A-G. A **rough preview of steps B-D** (22 Oct) is on the test site since 23 Oct
  (the user asked to push), off unless switched on with `?look=next`: `client/src/look.ts`
  (the switch, `?look=next` / `?look=classic`, remembered in `localStorage.tavernLook`; one
  `flame()` for every light, shared with the page as `--flame`), `NextLights` and `Finish` in
  TableScene (key, fill, rim, candle, a RoomEnvironment reflection; bloom, grade, ACES tone
  mapping via `@react-three/postprocessing` 2.19.1, added to client/package.json), lacquered dice
  in textures.ts (`MeshPhysicalMaterial`, clear coat, the face as bump map, an ivory tint), sheen
  felt, metal brass, and `.look-next` / `.look-finish` CSS (the tavern and bust flicker, vignette,
  grain). Findings: dice and brass gain most; strong warm light turns dice amber; a ragged edge
  where the canvas meets the tavern comes from the glow pass over a see-through canvas, which
  step A (the backdrop and bust into the 3D scene) removes. Not checked on a phone's frame rate.
  Before/after: `previews/look-preview-1.jpg` (gitignored).
  **Step A done (23 Oct, on the test site since 23 Oct, 511d459):** the tavern and the bust are in the 3D scene
  (`Room.tsx`). The classic look matches the old page pixel for pixel (mean difference under 1/255
  at 384x780, 844x390, 1280x800); in the look preview the room now goes through the glow and
  grade too, so it reads warmer and brighter, and the ragged edge is gone. Shots in
  `previews/step-a/` (gitignored). Martha's swap no longer leaves her stuck un-glowing on her turn
  (the old CSS animation held its last frame).
  **Step B (23 Oct, on the test site; look preview only):** the opponent takes the fire's
  light in Room's shader (a warm wash from the left, the far side in shade, a thin firelight rim
  facing the fire and a paler one from the candle; replaces the old orange drop-shadow); the
  tavern holds steady while its brightest parts (lanterns, candles, fire) breathe with the
  flame; a soft contact shadow under each die (Dice.tsx, fades as it rises); the candle eased
  to 17 and paler, so the dice stay ivory. Shots in `previews/step-b/`. Not checked: frame rate on
  the phone.
  **Step C (23 Oct, on the test site; look preview only):** dice pips engraved from the
  painted faces (`engraving` in textures.ts: a height map, cached per face), worn edges (`wear`:
  less lacquer, rougher, in blotches); the felt worn darker where throws end (`wornPatch`);
  brass plates reflect the room (their own envMap at 0.3) and read as polished gold; the slot
  rail varnished. Red 1s, green 6s and the plates' 2 and 4 stay clear. Shots in
  `previews/step-c/`, now the same throw each time (`/seed` on the dev controls; `shots.mjs`
  seeds 42).
  **Step D (23 Oct, committed, not pushed; look preview only):** the finish is one effects pass
  over the whole picture (TableScene `Finish`): glow (threshold 0.85, radius 0.45), ACES, the
  palette grade (`GradeEffect`: saturation 1.08, contrast 1.1, a slight green in the shadows and
  honey in the highlights, only the deepest blacks lifted to ember and near-whites held to cream),
  vignette (0.42/0.42) and grain (Noise overlay 0.08). The CSS `.look-finish` layer is gone (it
  also dimmed the HUD). The tavern's lights are pushed above 1 in the room shader (`hot`) so the
  glow finds them. Checked by the visual-shots subagent over three rounds: depth and glow fine;
  the fire near the screen edge is still a touch more orange than before (for step G's panel).
  Next: step E (living air).
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

- **Fights (14 since 21 Oct, the design doc's tournament):** in order (`TAVERN_ENCOUNTERS`, each
  with its `place`, a key of `PLACES`; `placeOf(room)`): the Ghoul and Gourd (McGrath, Frak,
  Danhausen, Duke Morrigan, Martha Mystery), the Yawning Portal (Sylvester Stonefist, Vaelin
  Inkhand, Stason Jatham, The Ridgeler, Brodor), then aboard the Salty Swallow, a docked ship
  (Klarg, Rokr, the Hangman, Jaguar). McGrath is the Molar renamed (keeps the id `molar`, plays
  simply). A boss (`boss`, `drops`: Martha, Brodor) drops a keepsake (`BOSS_DROPS`) and leads to an
  invitation on to the next place. All fourteen have painted busts (Brodor's since 21 Oct, `seat: 1.3`). Martha has three
  more, holding up Frak's, Danhausen's or the Duke's face as a mask: while one of her disguises
  is the round's effect, her bust and chip show that painting (`opponentPortraitKey` in
  Backdrop, PORTRAITS `'Martha as Frak'` etc.; a violet shimmer as she swaps,
  `.disguise-swap`; the dev control `/disguise?as=Danhausen` sets one). The ship has no
  backdrop of its own yet (the tavern's) and the same four spots and no events of its own (the
  ship's spots and events: to workshop). Vaelin Inkhand is the Vaelin avatar (new art). Hearts reset to 3 each fight (20 Oct; 4 after the
  Lady's Favour); the opponents have 1 | 2, 3, 3, 3 | 3, 3, 3, 3, 4 | 3, 3, 3, 4 lives (McGrath 1 since 21 Oct) (`shared/balance.js`,
  the user's for now, balancing later). Gold for a win is still 100 x the fight's number (Jaguar 1,400). **Turns alternate**
  (player first in odd rounds, opponent in even). Each opponent gets an entrance (bust rises,
  name card). Signature moves play on the table after the dice stop (Klarg's die swept away,
  Rokr's constellations, the Hangman's shot, Jaguar's -3); no commentary pop-ups. Klarg steals a
  2 or 4 the player still needs, else the highest die. **The Ace of Spades is the Hangman's
  revolver** (not a card): his move is a muzzle flash and a bullet hole by a "24".
- **Opponents' play:** the whole Ghoul and Gourd plays simply (`planBotLocks`; McGrath as a
  teacher, and since 21 Oct Frak, Danhausen, the Duke and Martha too, the user's call; in a cursed
  round the simple habits chase low dice, `low`). From the Yawning Portal (Sylvester) on
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
  Danhausen 2, Duke 1, Martha 2; the Yawning Portal's five 1 each, first guesses; Klarg 1, Rokr 2,
  Hangman 1, Jaguar 1). Each use costs the player ~10 points of fight win chance. **The Yawning
  Portal's five** (21 Oct, played as the simulator plays them): Sylvester's **Back of the Head** (the
  id is still `suckerPunch`, as in the simulator; renamed 21 Oct: as you keep your last die on a
  hand that counts, your best kept die, `Rules.bestKeptDie`, goes back in play and you roll it
  again; `suckerPunch` via `emitKept`, `Rules.putBackDie`; its turnState event `punched` makes the
  client drop taps it is still showing, which had left the Roll button dead); Vaelin's **Inkfire Brand** (a round effect
  `ink`: your dice that land on 6 roll again, in `rollFaceFor`; the Loaded Die lands 4-5; the hot
  tub's Scalding Die still lands 6); Stason's **Flourish** (`startFlourish` on his turn's first
  throw: `turn.flourish`, each die rolls twice, a needed 2 or 4 else the higher, `flourishFace`;
  the rolls that lost rise as ivory ghost dice, like Double Bubble's);
  the Ridgeler's **Divine Smite** (a round effect `smite`: if he wins the round you lose two
  hearts, each still caught by the Shield, the Lady's Grace or Last Gasp; the round result says
  "lost 2 lives"); Brodor's **Astral Flood** (in `beginTavernRound`, once he has lost a life, he
  heals one). **Brodor's Sunglasses** (his drop): a finished 23 restores a heart, like a 24
  (`performEndTurn`). Each has its own colours, moment and, for the round ones, a badge and edge
  glow (`.ink-veil` flames in the bottom corners, `.smite-veil` gold). Only Back of the Head has a
  sound (the swoosh). The Ghoul and Gourd's are **round effects**, decided as a round
  begins (`beginTavernRound`, `tavernRun.roundEffect = { kind, by, ability, as }`): Frak's
  **Mind Whip** (since 20 Oct, replacing Psychic Fog; like the Devil it waits, `pendingMind`, and is spent only as it
  lands, so his ✦ flashes then (21 Oct): on your first throw he keeps one of your dice
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
  in a round with no effect yet, wear Danhausen's Curse (before you roll) or the Duke's Devil
  (any time in your turn with 3+ dice to throw, since 21 Oct: the next throw lands three 6s)
  yourself (`wearMask`, `by: 'player'`). On the strip it lights up and shows its choices inline
  (never over the rail); when it can't be worn a tap is a reminder. Martha herself shows a
  "Disguises" moment first, then the trick she copies (`disguiseMoves`).
- **Order of events (21 Oct, the user's: "they should not all happen together"):** after a round
  the server waits `ROUND_PAUSE_MS` (2 s) before the next round and its ability
  (`evaluateTavernRound`). On the client every moment (abilities, keepsakes, Thonics, the Lady, the
  round result) goes through `enqueueMoment`: at least `MOMENT_GAP_MS` (1.7 s) after the one before,
  in the server's order; a Tavern Crawl `gameStateUpdate` that arrives while the queue is busy
  waits behind it, so glows, ✦ marks and hearts change with the moment that explains them. The
  Lady's Grace is checked before the Shield. A Clear-Eye cancel shows the ability first (its
  banner struck through, "Cancelled", none of its effect; `cancelled: true`), then the Thonic
  (`fireTavernAbility`). **Dice are never thrown under a moment** (the user's call, 23 Oct): the
  abilities a throw brings (the Devil, Martha's disguise, Mind Whip, Flourish, Rokr's blur, a
  Clear-Eye cancel; `emitMoment`, `room.rollMoments`) play first, banner and effect, and the
  dice follow once they have gone; only Klarg's steal waits for the dice (his hand takes a
  landed die). The server keeps the browsers' moment clock (`sendMoment`, `momentsLeft`: every
  moment event goes through it) and holds `diceRolled` (and the bot) until then; the client's
  `diceRolled` also waits for `momentGoneAt`. The round result shows 2.6 s (`RESULT_SHOW_MS`,
  was 4.2) and the next throw waits for it. Mind Whip's banner no longer names the die.
- **Keepsakes on screen (21 Oct):** small round icons beside your chip (`KeepsakeIcon`,
  `KEEPSAKE_ICONS`), dimmed once spent this fight (`ONCE_A_FIGHT`); a tap shows a toast with what
  it does. When one works, `keepsakeActivated` is a takeover moment with a gold burst of its icon
  and a synthesized chime (`playChime`); the Shield's is a force-field dome over the table
  (`.forcefield`), its line "Shield protects a life."
- **The invitations and saving:** beating a boss gives `interlude.stage = 'invitation'` instead of
  an event (`invitation(room, name)`: `place`, `from`, `boss`, `drop`, `save`): after Martha "You
  qualify for the Yawning Portal", after Brodor "Word from the docks" (the Salty Swallow has
  docked; `INVITATIONS` in Hud). "On to ..." or "Save and continue
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
- **Money (since 23 Oct, the user's calls: nearer D&D's prices, all in whole gold):** a tenth of
  the old amounts (`Rules.formatGold`, client `coins()`): 10 x the opponent's place per win
  (Jaguar 140), 2 a heart left, Healing 11, the Shrine 10, a soak 5. **Prices rise**: each
  Thonic of a kind, candle or soak bought costs half its first price more than the last
  (`priceRise` 0.5; `risingPrice`, `run.bought`, saved with the run; `SAVE_VERSION` 2, so older
  saves don't open). Keepsakes are bought once.
- **Points and the leaderboard (since 23 Oct):** the run's score is points, not the purse
  (`getTavernScoreSummary`, `BALANCE.points`): 100 x the place of each opponent beaten, 25 per
  heart left at each win (`stats.heartsSpared`), 25 x the place a lost run fell at, and the purse
  at the end at 1 point a gold piece. Leaderboard entries are `{ name, points, gold }` (each
  name's best; an older entry's gold counts as points). No made-up names: `leaderboard.json` is
  no longer in git and starts empty. The run-over screen shows the points and their parts.
- **Thom's Thonics:** one of the spots between fights: a full-screen scene (`.thom-scene`; Thom's bust from
  `art/bust-thom.jpg`, cut out by `cutOutFlat`) where Thom says "What ya havin'?". His cart
  shows 3 Thonics (Healing + 2 random, `pickThomStock`) and, since 21 Oct, **his back shelf**: two
  keepsakes you don't have, for gold (`keepsakePrices`: Shield 30, Trap Card and Velvet Cushion
  15, Loyalty Card and Potion Belt 13, Loaded Die 8; priced under what each adds when bought
  around fight 3, `balance/experiments/keepsake-when.js`; `buyKeepsake`, `pickThomKeepsakes`). A shelf holds up to 2 (`shelfSize`, the user's call, 18 Oct), carried
  between fights. Each Thonic is drunk at its own moment on your turn (server `drinkThonic`
  handler; the client's `drinkable()` mirrors it), with a cork pop:

  | Thonic | Price | When | Effect |
  |---|---|---|---|
  | Healing | 11 | before rolling, once a heart is lost | +1 heart |
  | Last Gasp | 13 | works by itself | a round that would take your last heart leaves you on 1 |
  | Fizzy Thomic | 2 | after a roll showing 1s | those 1s roll again (`rerollOnes`, `diceRolled.rerolled`) |
  | Second Thoughts | 3 | after keeping a die | a kept die goes back, free roll (`putBackDie`, `turn.freeRoll`, client `putBackSlot`) |
  | Steady | 9 | any time in the turn | a dust hand scores its dice as they lie at End Turn (`turn.steady`) |
  | Clear-Eye | 6 | before rolling, while the opponent's ability has uses left | waits and cancels that ability's next use this fight (`clearEyeArmed`, `fireTavernAbility`) |

  Prices and effects were set by simulation on 19 Oct (`balance/README.md`).

- **Between fights** (step 3, `INTERLUDE` = `shared/balance.js` `interlude`, `tavernRun.interlude`; client
  `Interlude` in Hud): in a full-screen tavern scene, **two spots catch your eye** and you go
  to one (the user chose this over doors: it's a room you can look around, and it becomes "a
  fork in the road" in later places). Spots are drawn at random from `PLACES.tavern.spots`:
  Thom's cart (opens `ThomShop`), the Shrine to the Lady (light a candle: a blessing at random,
  her Favour, the next fight on 5 hearts, or her Grace, `ladysGrace`, the next dust that would
  cost a heart doesn't, kept until used; `blessingUsed` event; not given twice),
  the Dice Den (bet 5 or 10, only the bets the purse covers are offered, and below 5 gold the
  Den isn't one of the spots; then the player taps to roll two dice and the gambler rolls two;
  higher total doubles the bet, a tie rolls again). **A random event, then the spots** (21 Oct; from 18 Oct the event was the
  whole walk): after the thief, the Stranger or Darren, "Look around the tavern" (`lookAround`)
  brings the two spots, or "Or challenge X right away" skips them. The random events: about 1
  walk in 4 a **pickpocket** strikes first: roll one die, a 4+ catches the thief
  (`pickpocketCatch`), else they take half the purse (a quarter until 21 Oct). Else, 20% of the
  time (`strangerChance`), the **Hooded Stranger** finds you (a random event since 19 Oct, no
  longer a spot): one of two keepsakes, the next fight a heart short (on 2), or turn him
  down; only while keepsakes remain (`startInterlude`, `strangerOffer`). The Lady's Favour adds
  to whatever the next fight starts on (so it stacks with the Stranger's price). The choice screen
  is headed "Make your choice"; "Or challenge Klarg right away" (the next opponent's name)
  skips both spots (it's all at the one table, so the wording is "Challenge", never "walk").
  The **Wild Magic Hot Tub** (a spot at the Ghoul and Gourd only, the user's call 21 Oct; 5 gold a soak, `hotTubPrice`; the Shrine's candle 10, `shrinePrice`; both rising with each visit; neither is offered when the purse can't cover it): climb in and a wild surge
  is picked by weight (`hotTubSurges`): one of your dice (`hotTubDie`, aqua on the table,
  `materials.tub`) next fight never rolls a 1 / keeps the better of two / only rolls 4-6 / always
  lands on 6 / never rolls a 6, or Pruney Fingers, the next fight a heart short
  (`nextFightSurge` → `tubSurge`, `rollFaceFor`; a badge under Roll). Double Bubble's losing roll
  rises from the die as a fading ghost die (in a cursed round it keeps the lower roll) (`turn.ghosts` → `diceRolled.ghosts` → `TwinGhost`, one per ghost; its glow animations keep the same filter list at every keyframe, or they snap: the "flash" the user saw). A soak averages about +1-2
  points of the next fight (`balance/experiments/hot-tub.js`). **Darren Snakehands**, the Ghoul and
  Gourd's barman (`PLACES.ghoulAndGourd.events`), finds you ~15% of walks when no thief or
  Stranger did: roll one die; 1-2 a Thonic on your shelf smashes (an empty shelf: 2 gold for
  the glass), 3-4 a free Thonic, 5-6 a Thonic and 5 gold (a full shelf: 3 gold instead,
  `darrenOutcome`). Both have the user's paintings (since 20 Oct; `hot-tub.webp` is wide, sized by width).
  Each spot (and the pickpocket) is a full scene built on Thom's (`SpotScene`: the character
  rises in their own light with a speech bubble and reacts to what happens, sign + counter;
  the Shrine's painting is its stage). Their dice are 2D (`Die` in Hud: red 1, green 6) with
  the real dice sound (`simulateRoll` impacts). Gold won or lost here is
  `stats.eventGold` ("Between fights" on the run-over screen). Numbers set by simulation.
  Each spot has painted art in a round frame (`SPOT_PORTRAITS`); the Lady is the goddess of
  sailors. Game text calls the pickpocket "the thief" (no assumed gender).
- **Keepsakes:** from the Hooded Stranger (a random event, for a heart) and, since 21 Oct, for gold
  on Thom's back shelf (two you don't have each visit). Six (the user picked the new three on
  19 Oct). Gold each adds to a run when bought before fight 3, and its price
  (`balance/experiments/keepsake-when.js`; bought later each is worth less, as most runs end in
  the Ghoul and Gourd):

  | Keepsake (id) | Effect | Worth at fight 3 | Price |
  |---|---|---|---|
  | Shield (`bentCopper`) | once a fight, the first life you'd lose isn't | ~31 | 30 |
  | Velvet Cushion | once a fight, losing by exactly 1 is a tie | ~16 | 15 |
  | Trap Card (`luckySeat`) | once a fight, your first tie counts as their loss | ~16 | 15 |
  | Thom's Loyalty Card | Thom always one of the spots; first Thonic each visit free (`shop.free`) | ~14 | 13 |
  | Potion Belt | shelf +1 slot (`beltSlots`), comes with a Healing (`beltThonic`) | ~15 (mostly the Healing) | 13 |
  | Loaded Die | die 0 (`LOADED_DIE`) rolls 4-6 (`loadedDieLow`); old gold on your turns | ~4 | 8 |

  Numbers in `shared/balance.js` (`keepsakes`, `keepsakePrices`, `thomKeepsakes`). Jaguar's drop
  waits for a second place.
  The old keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) is unused. The classic page
  at `/` walks straight on (its `leaveShop`), so it never sees the spots; the user is fine
  with that until the switch-over.
- **Known limits:** if your last die lands on a 1 it is kept at once, so Fizzy can't reroll a
  single last die (Second Thoughts can reopen the hand).

## Next steps (in order)

1. **Difficulty** (23 Oct, the user: easier than the simulator says, with every Thonic, all the
   keepsakes and Martha's mask; hence the rising prices. With them the simulated sensible player
   finishes 0.3% and reaches the ship 2.3% (it doesn't wear the mask or plan purchases the way a
   person does, so it understates a good player). Earlier, 21 Oct: too hard; hearts and lives are theirs to set): McGrath is on
   1 life since 21 Oct; over the fourteen fights a sensible player finishes ~1.4% (34% reach the
   Yawning Portal, 5.5% the ship; McGrath now ends ~10% of runs, was ~26%); Frak, Danhausen and
   the Duke end the most; Brodor and Jaguar (~24-25% a fight) are the steepest steps. Measured options for the
   nine (`balance/experiments/easier.js`): every opponent a life fewer → ~14%; the Shield from the
   start → ~7%; for the fourteen, `tournament-lives.js` (3 hearts with lives of 1-2 gave ~17%).
   **User plays the test site on the phone** and decides; change `shared/balance.js` and re-run
   `node balance/experiments/tournament.js` first. (`SAVE_SECRET` is set on the Render test
   service, by the user, 21 Oct; the live service will need its own when we ship.)
2. **Visuals, option 1** (the user wants "the best of the best", 22 Oct): next is step A, the
   tavern backdrop and the bust into the 3D scene with today's framing; then B-G as in the doc,
   each judged on the user's phone with before/after shots. The rough preview (above) is the
   starting point for B-D. Ask before pushing any of it.
3. **Thom's visits:** kept as they are (the user, 21 Oct): one of four spots at the Ghoul and Gourd (about half the walks), one of three after it.
4. **The tournament, finishing touches:** a backdrop for the Salty Swallow (art, today the tavern's); sounds for the five new abilities
   (only Back of the Head has one, the swoosh); the ship's own spots and events (to workshop: a card
   game below deck, a stowaway instead of the thief); uses per fight for the five (first guesses, 1
   each). Stronger late abilities: to workshop.
5. **Opponent abilities** (proposed 19 Oct; ask first): rework Rokr's blur, and a warning on the
   nameplate before an ability fires. Re-simulate after any change.
6. **Keepsakes, more**: ideas left (Lucky Coin, Sailor's Compass, Gambler's Charm, Pickpocket's
   Glove, Gold Tooth, Hangman's Spare Bullet, Star Chart, Klarg's Mitt); keepsake icons on the
   strip with a flash when one triggers. The Dice Den is still even odds (the user asked whether
   it makes sense, 21 Oct; with gold now worth spending it's a way to grow a purse).
7. **Ship to `main`:** prepare a PR from `phase-2-3d-prototype`; set the live service's build
   command to `npm install && npm run build`; the user merges (that deploys the live game);
   then delete the test service. Fix anything Render-specific as it appears.
8. **Persistence:** move the leaderboard to a small hosted database so it survives deploys
   (more important now that gold is the score).
9. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
   classic page reachable for a while; until then it skips Thom and the events, which the
   user accepted), update the PWA manifest/service worker, retire the old client code in
   `public/index.html`.
10. **Feel and big moments:** tune dice sound, roll length (~2.2 s), camera on other phones; a
   perfect-24 celebration; the devil/three-6s effect done the user's way (ask first).
11. **Later / nice to have:** Jaguar's keepsake drop (once there is a place after the ship to
   carry it into); new places with tougher opponents (the roguelite); possibly the Molar at 1 life if
   he ends too many runs (~1 in 7 for a careful player); optional art (`docs/art-direction.md`
   "Wanted": keepsake pictures, Klarg's hand, the Hangman's revolver); delete the unused
   keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) and `Rules.getAbilityMaxUses`
   (replaced by `abilityUses` in `shared/balance.js`); smaller bundle (lazy-load three.js),
   compressed audio (the 9.5 MB ambience track), spectator mode, emoji reactions floating over
   the table.
