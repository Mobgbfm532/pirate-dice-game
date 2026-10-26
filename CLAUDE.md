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
(Thonics, keepsakes, the Shrine, the hot tub; prices rise as you buy) and a leaderboard by points; the run can be saved after
each place). See "Tavern Crawl now" below.

## The person

- Plays and tests on an Android phone over home Wi-Fi; Windows PC; non-specialist, wants plain
  explanations and to see/hear results (send previews, screenshots).
- Makes the AI art themselves (see `docs/art-direction.md`); has strong opinions on feel
  (dice colours: red 1, green 6; Tavern Crawl has no commentary pop-ups).
- Not planned for now: new Devil/Vaelin avatars. The devil (three 6s) effect was redone the
  user's way on 23 Oct (see "Three 6s" in Tavern Crawl now).
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
- `look.ts` (the new look, the default since 23 Oct; see Status: Visuals): the `?look=classic` switch and the shared flame.
- `tuning.ts` `renderDpr()`: pixels drawn per screen point. Computers with a mouse draw at the
  quality level's dpr (High 2x) even when the screen reports 1x, so the dice are sharp on desktop
  (24 Oct); phones use their own up to that.
- `TableScene.tsx`: camera solve (fits table between tavern band and controls), lights, tray,
  brass plates. Portrait phones and desktops/tablets on their side (height > 500) keep the
  table centred above the controls (on desktop a dock: chips, score, Roll; reactions in a
  column at the left edge); phones on their side use `setViewOffset` to leave a right column
  for the Roll button.
- `Dice.tsx`: dice meshes, slot placement by lock order, sphere hit targets, tap on pointer-down,
  Klarg's steal motion, Rokr's constellations, the Loaded Die's old-gold die (`materials.loaded`).
- **The dice as the star** (visuals plan step 2, 24 Oct, new look only): `Throw.tsx` draws a
  faint puff of dust at each hard felt hit (felt impacts carry `x, z`). A kept die gives a wooden
  clack as it reaches its slot (Dice.tsx `arrival`; the opponent's old toggle click is off in the
  new look). The red 1 and green 6 pips are repainted a cleaner red and green in the face texture
  (`clearPips` in textures.ts). Taken out again, the user's calls: a leather dice cup, a brass
  sparkle at the slot, and a glow of the pips' own (it lit them on the dice's shaded sides,
  which looked wrong on desktop). A suspense roll's
  last bounce plays slower still (`Pace`, `suspensePace`, `paceSeconds`/`paceFrame` in physics.ts,
  used by the playback, the sound and the roll's length; about 0.5 s longer since 26 Oct, it was
  ~1 s). A cursed round's last throw for a Perfect ...4? (the 2, the 4 and three 1s kept) gets the
  same slow motion, decided in the client (`onePerfect4Away` in rules.ts; the server's suspense
  doesn't know the Curse). The living portraits
  (step 1) were tried and removed, the user's call.
- **One painted interface** (visuals plan step 4, 25 Oct, new look only; the block at the end of
  `styles.css`, scoped to `.look-next`): Almendra for titles and buttons, Alegreya (`--read`) for
  longer text; buttons from one mould, each with a brass rim (`--brass-rim`) and a press:
  `.primary` and Roll wax-seal red, `.primary.alt` dark leather, `.secondary` brass, Thom's `.buy`
  and End Turn green; parchment panels (`.panel`, `.thonic-card`) in a brass frame with corner
  rivets, dark-wood boxes (`.spot-card`, `.won-rows li`, `.keepsake-ware`) with the same rim; the
  start screen sits on the tavern painting (candle smoke between scenes was tried and taken out,
  the user's call, 25 Oct). The loading screen is in `index.html` (`#boot`:
  the tavern, the title, a tumbling die), faded out by main.tsx once the canvas exists.
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
- `art-import`: when the user sends a painting (busts, ability paintings, place backdrops; since
  26 Oct it knows the last two and finishes ability paintings with `test/ability-shots.mjs`). Saves the original, cuts out the background
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

## Status (23 October 2026, evening)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`, all pushed, on the test site at d4aa2db):**
  the 3D table at `/next`: physics dice, all painted art, multiplayer with invites and
  reconnection, phone and desktop layouts, music / sound switches, synthesized dice sound, and the
  Tavern Crawl: the 14-fight tournament across three places, Thonics, events between fights,
  keepsakes, gold, saves after each place. 118 server/rules/strategy tests + 13 client tests.
- **Today's game changes (23 Oct, the user's calls; details in "Tavern Crawl now"):**
  - abilities play in full before their dice are thrown; the round result shows 2.6 s and the next
    throw waits for it; an opponent's entrance (4.5 s) comes first, abilities and throws after it;
  - money a tenth of before, in whole gold; Thonics, the Shrine and the hot tub cost half their
    first price more each time; the leaderboard ranks by points (no made-up names);
  - "Perfect 24!" and, in a cursed round, "Perfect ...4?" celebrations;
  - Sylvester's knocked-loose die has to be rolled before it can be kept again;
  - Thom greets you "Vim, vigour, vitality!" on your first visit in a run; Frak's painted cigar
    smoke is cut out of his picture;
  - every round portrait (opponents, the spots between fights) framed by the user in the portrait
    editor; faces centred on the table's centre line behind it; bigger round frames.
- **Visuals, option 1 (all seven steps built, 23 Oct):** the plan is a doc shared with the user,
  "2, 4, 24: the next level visually" (https://claude.ai/artifact/9MHGFUVoVrLiQiD7ZgL7ZJ). Steps
  B-G are **the default since 23 Oct** (the user's call; `client/src/look.ts`): `?look=classic`
  switches back to the old look and `?look=next` on again, remembered in `localStorage.tavernLook`.
  - **A:** the tavern and the bust drawn inside the 3D scene (`Room.tsx`), pixel-identical to the
    old page layers in the classic look; no ragged edge where canvas met page.
  - **B (light):** `NextLights` in TableScene (fire key light, cool fill, rim, candle, a
    RoomEnvironment reflection); the bust lit in Room's shader (warm wash and rim from the fire
    side); the tavern's brightest parts breathe with the flame; contact shadows under the dice.
    One `flame()` for every light: a slow irregular drift (±6%, at most 2% in 0.1 s; the user found
    the old 7 and 13 Hz pulsing unreal).
  - **C (materials):** engraved pips (`engraving`, a height map from the painted faces), worn
    edges (`wear`), worn felt (`wornPatch`), brass that reflects the room, varnished rails.
  - **D (glow and grade):** one effects pass (`Finish`): bloom, ACES, the palette grade
    (`GradeEffect`), vignette, grain; the tavern's lights pushed above 1 (`hot`) so the glow finds them.
  - **E (living air):** `Air.tsx`: dust over the table, embers from the fireplace (more in the
    Devil's round), Frak's cigar smoke, Vaelin's dark flame, the Ridgeler's hammer glow.
  - **F (moments as light):** `MomentLight.tsx`: big moments light the table and wash the room in
    their colour (Devil red, Inkfire violet, Smite gold pool, Astral Flood, keepsakes, the Shield,
    perfect 24 gold, Perfect ...4? violet); tuned so the dice stay readable.
  - **G (tune and prove):** the tuning panel (`?tune=1`, the ⚙ in the header; `tuning.ts`):
    sliders for the feel (multipliers saved per device), the frame rate, quality levels (Auto steps
    down from High when frames stay under ~45 a second), "Copy settings"; its Portraits tab (drag
    and zoom every round portrait, "Copy portraits"). On 23 Oct the user found the built-in
    settings on High "look great" (no slider changes), and made the new look the default.
  - Before/after: `test/shots.mjs` + `test/shots-base.mjs` + `test/compare.mjs` and the
    `visual-shots` subagent; `previews/frozen.mjs` (gitignored) stops the page clock for moments.
- **`main` = the live game, still the old version.** Nothing from Phase 1/2 is live yet.
- **Render:** the existing live service sits in "My project". The test service
  **`pirate-dice-next`** (branch `phase-2-3d-prototype`, auto-deploys on push, build
  `npm install && npm run build`, start `npm start`) is at
  https://pirate-dice-next.onrender.com/next and has every pushed commit (a deploy takes about a
  minute). Free tier: it sleeps after ~15 min idle (first visit then takes up to ~50 s); the
  leaderboard (`leaderboard.json`, not in git) starts empty after each deploy. `SAVE_SECRET` is set
  there (the live service will need its own).

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
  `.disguise-swap`; the dev control `/disguise?as=Danhausen` sets one). Since 26 Oct each place
  has its backdrop (the user's paintings; `SCENES` in Backdrop.tsx by opponent, `placeBackdrop` for the
  scenes between fights, `sceneFileOf` for a fight's summary): the Yawning Portal's hall with its
  glowing well, the Salty Swallow's gun deck; the ship has the same four spots and no events of its
  own (to workshop). Vaelin Inkhand is the Vaelin avatar (new art). Hearts reset to 3 each fight (20 Oct; 4 after the
  Lady's Favour); the opponents have 1 | 2, 3, 3, 3 | 3, 3, 3, 3, 4 | 3, 3, 3, 4 lives (McGrath 1 since 21 Oct) (`shared/balance.js`,
  the user's for now, balancing later). Gold for a win is 10 x the fight's number (Jaguar 140; a tenth of before since 23 Oct). **Turns alternate**
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
  Danhausen 2, Duke 1, Martha 2; the Yawning Portal's five 1 each, first guesses; the ship since 25 Oct:
  Klarg 2, Rokr 3 turns, the Hangman's Dead Eye 1 (+ his Ace), Jaguar's Smooth Talk 2). Each use costs the player ~10 points of fight win chance. **The Yawning
  Portal's five** (21 Oct, played as the simulator plays them): Sylvester's **Back of the Head** (the knocked-loose die must be rolled before it can be kept again, `turn.mustRollId`, 23 Oct; the
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
- **The Salty Swallow as the final tier (25 Oct, the user's yes; set by simulation,
  `balance/experiments/final-ship.js`; settings in `shared/balance.js` `finalShip` and `abilityUses`):**
  each goes after a different part of your game. A sensible player, fresh, wins Klarg 27%, Rokr 26%,
  the Hangman 27%, Jaguar 15% (the Yawning Portal ~40%, Brodor 23%; the ship as it was 35, 40, 35, 25).
  - **Klarg** (`keepsStolen`, `klargWaits`): twice a fight he waits for a throw showing a 2 or 4 you
    still need, snatches it (`Rules.stealHighestActiveDie`) and keeps it: his next turn starts with it
    kept (`run.klargHand` → `syncTurn`). (Two first-throw steals cost ~12 points each: too much.)
  - **Rokr's Written in the Stars** (replaces Constellation Blur): 3 turns a fight (`startStars`), the
    stars mark two faces before each throw of the turn (`turn.nextMarks` → `turn.marks`); dice landing
    on them are bound (`turn.boundIds`; `Rules.toggleDie` refuses them; all bound: a free roll). The
    client: stars over bound dice (Constellation), the badge "Star-bound now: ... Next throw: ...".
  - **The Hangman** (`abilities: ['deadEye', 'deadeye24']`): **Dead Eye**, once a fight, as you end
    a hand that counts he shoots your best scoring die and it rolls again (`deadEyeRerolls`; turnState
    event `shot`); his **Ace of Spades** stays, for his last life. Clear-Eye counts all his abilities
    (`encounterAbilityLeft`).
  - **Jaguar** (`jaguarPhases`, `beginJaguarRound`, `run.jaguarPhase` in the state): **Smooth Talk** (3+
    lives; twice a fight, once a round) talks a Thonic off your shelf and drinks it (Healing heals him,
    Steady counts his dust as it lies, `jaguarSteady`); an empty shelf: 3 off your finished hand
    (`talkThree`). **The Cloak** (2 lives): he throws after you, his dice hidden (`turn.cloaked`, viewTurn).
    **All In** (his last): the round's loser loses two hearts. Each phase has its banner and badge.
  - Tests pin the dice with `pinFaces` (server.test.js). The old Constellation Blur code is unused now.
- **Ability paintings (26 Oct, the user's):** an ability with a painting is a scene of its own: a
  stage in its colours over the whole screen (`.ability-stage`, solid underneath: the tavern and the
  bust behind it overlapped the painting, the user's call), motes of light rising, the painting
  pushing slowly in, the banner below it (on phones on their side the painting left, the banner
  right), the 3.6 s of the banner; not when a Clear-Eye cancels it.
  So far Mind Whip, You are Cursed, Sympathy for the Devil and Disguises (`ABILITY_ART` in Hud,
  `art/ability-<id>.jpg`, cut out with `holes` seeds for enclosed pockets). Martha's Disguises
  painting shows ~1.7 s, then the trick she copies with its own painting. Check new ones with
  `node test/ability-shots.mjs <dir> only=<key>` (plays the ability for real headless, holds the
  moment, shoots it at phone sizes and checks it stays above the rail; works with the pane hidden;
  dev `preview.ability(name, ability, more, hold)`).
- **Martha's mask** (`marthasMask`, dropped by Martha, not in the Stranger's pool): once a fight,
  in a round with no effect yet, wear Danhausen's Curse (before you roll) or the Duke's Devil
  (any time in your turn with 3+ dice to throw, since 21 Oct: the next throw lands three 6s)
  yourself (`wearMask`, `by: 'player'`). On the strip it lights up and shows its choices inline
  (never over the rail); when it can't be worn a tap is a reminder. Martha herself shows a
  "Disguises" moment first, then the trick she copies (`disguiseMoves`).
- **Perfect hands (23 Oct, the user's):** a finished 24 gets "Perfect 24!" (gold lettering, rays and
  sparks in the middle of the green felt since 24 Oct (`--felt-y`, from `setRailAnchor`; smaller
  on phones on their side), the room lit gold); in a cursed round (lowest valid hand wins) four 1s with the 2 and 4 (a score of 4) get
  "Perfect ...4?" in Danhausen's violet and white, its "?" tilting, the room lit violet. A cursed 24
  gets no celebration (a sigh). For anyone at the table, with their name when it isn't you.
  `perfectHand` (rules.ts, tested), `Celebration` (Hud), `snapshot.celebration`; a moment of its
  own (`CELEBRATION_MS` 2.8 s): the round result and the next throw wait. Dev: `preview.celebrate()`.
- **Three 6s (23 Oct, the user's):** whenever a throw lands three 6s (`diceRolled.devil`, any
  table, anyone's throw) fire surges up the screen, the user's painting of the devil holding three
  6s rises (`art/devil-sixes.jpg` → `devil-sixes.webp`; the fire sheet, `.devil-surge`, fades at
  both edges: a hard bottom edge showed as a dark line climbing the screen) and a banner says "Devil's titties" (the
  sound is `DevilsTeets.wav`). `DevilSixes` in Hud, `showDevil` / `snapshot.devil` in game.ts,
  `DEVIL_MS` 1.5 s (the user's, was 2.8); taps go through to the dice, the next moment waits. Dev:
  `preview.devil(who, hold)` (hold keeps it up, for stills). Since 24 Oct a **living painting**
  (`LivingPainting.tsx`, a small WebGL shader on its own canvas, a fresh one per showing): the
  flames sway and flicker, a heat shimmer, a slow breath, the green pips pulse, a glint in each eye
  (`DEVIL_EYES`); which parts move comes from `devil-sixes-mask.webp` (`livingMask` in
  process-art.mjs: red wide flames, green pips/eyes, blue tight flames). Without WebGL, the plain picture.
- **An opponent's entrance (23 Oct):** the name card shows 4.5 s (`INTRO_MS`; 6 s, then 1.5 s shorter, the user's); at a fight's start the
  server sends the new opponent before the round's abilities and puts the entrance on its moment
  clock (`INTRO_SHOW_MS`), so abilities and the first throw wait for the card (Martha's entrance
  and disguise used to run together). Thom greets you "Vim, vigour, vitality!" on your first visit
  in a run (`shop.first`, `thomMet`), then "What ya havin'?". Frak's painted cigar smoke is cut out
  of his picture (`noSmoke` in process-art.mjs; `ONLY=frak npm --prefix client run art` redoes one).
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
- **Hearts that react, and the end of a place** (visuals plan step 5, 25 Oct): a heart that's lost
  swells, cracks along a jagged line and its halves fall away; one that comes back pops in with a
  pink glow (`Hearts` in Hud, `HEART_MS` 0.9 s, `.heart.breaking` / `.healing`; a new fight resets
  hearts quietly, `fightKey`). In the new look the invitation opens with a sealed letter that
  flutters down, its wax seal cracks and the invitation unfolds from it on parchment, 2.2 s in all;
  a tap skips (`.invitation.arriving`, `.skip`). The gold count stays as it was (the user's call).
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

1. **The new look on other phones** (the default since 23 Oct): if Auto quality drops a good
   phone to Low, tune its threshold (`noteFrame`).
2. **Difficulty** (the user's to set): with rising prices the simulated sensible player finishes
   0.3% and reaches the ship 2.3% (`node balance/experiments/tournament.js`), but it never wears
   Martha's mask or plans its shopping, and the user finds the real game easier. The user plays
   and decides; change `shared/balance.js` (prices, `priceRise`, hearts, lives, points) and
   re-run the simulation first. Measured options: `easier.js`, `tournament-lives.js`.
3. **The tournament, finishing touches:** paintings for the other abilities (the user's; four done,
   26 Oct); sounds for the Yawning Portal's new abilities (only Back of the Head has one); the ship's own spots and events (to
   workshop: a card game below deck, a stowaway instead of the thief); uses per fight for the
   five (first guesses, 1 each). Thom's visits stay as they are (the user, 21 Oct).
4. **Opponent abilities** (proposed 19 Oct; ask first): rework Rokr's blur, and a warning on the
   nameplate before an ability fires. Re-simulate after any change.
5. **Keepsakes, more**: ideas left (Lucky Coin, Sailor's Compass, Gambler's Charm, Pickpocket's
   Glove, Gold Tooth, Hangman's Spare Bullet, Star Chart, Klarg's Mitt). The Dice Den is still
   even odds (the user asked whether it makes sense, 21 Oct).
6. **Ship to `main`:** prepare a PR from `phase-2-3d-prototype`; set the live service's build
   command to `npm install && npm run build` and a `SAVE_SECRET`; the user merges (that deploys
   the live game); then delete the test service. Old saved runs won't open (money changed); the
   live leaderboard's old gold entries count as points.
7. **Persistence:** move the leaderboard to a small hosted database so it survives deploys.
8. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
   classic page reachable for a while; until then it skips Thom and the events, which the user
   accepted), update the PWA manifest/service worker, retire the old client code in
   `public/index.html`.
9. **Feel:** tune dice sound, roll length (~2.2 s), camera on other phones.
10. **Later / nice to have:** Jaguar's keepsake drop (once there is a place after the ship);
   new places with tougher opponents (the roguelite); optional art (`docs/art-direction.md`
   "Wanted"; Martha's masked paintings have no moving vape smoke); delete unused code (the old
   keepsake cards `offerKeepsakes`/`KeepsakeCards`, `Rules.getAbilityMaxUses`, `shareFlame` and
   the unused `--flame` CSS variable); a smaller first download (lazy-load three.js, compress
   the 9.5 MB ambience track); spectator mode; emoji reactions floating over the table.
