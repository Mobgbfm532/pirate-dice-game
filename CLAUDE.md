# 2, 4, 24: project guide

A multiplayer tavern dice game being rebuilt from a single HTML page into a 3D, phone-first
web game. This file is the working reference: what exists, how it fits together, what has
bitten us before, and what comes next. Keep it current when something important changes.

## The game

Roll six dice; after every roll lock at least one. You must end with a **2** and a **4**
locked; the other four dice are your score (max 24). Missing the 2 or 4 is **dust**. Each
round, dust loses a life and the lowest valid score loses a life; ties go to sudden death.
A 24 restores a life. Last player with lives wins.

Table codes: any code = classic multiplayer; `COMP` = solo vs The Molar; `TAVERN` = Tavern
Crawl (five opponents in a row: The Molar, Klarg, Rokr, The Hangman, Jaguar Cantona, each
with an ability; Thom's Thonics shop between fights; gold and a global leaderboard). See
"Tavern Crawl now" below.

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
`diceRoll`, `moveOn` (`leaveShop` is its older name)) and render what comes back. Two clients share one server:

| Path | What |
|---|---|
| `server.js` | Express + Socket.IO. Rooms, turns (`room.turn`), rounds, Tavern Crawl (`TAVERN_ENCOUNTERS`, `THONICS`, `PLACES`, `GOLD`), bots, reconnection grace, leaderboard. Exports `start`, `rooms`, `io`, `emitState` for tests. |
| `shared/rules.js` | Pure rules (UMD: `require` on the server, `self.GameRules` in browsers): scoring, callouts, suspense, Klarg steal, Rokr blur (`viewTurn` hides values), Fizzy/Second Thoughts (`rerollOnes`, `putBackDie`), the Molar's simple play (`planBotLocks`). |
| `shared/strategy.js` | Server only: the best-play brain for Tavern Crawl opponents from Klarg on (exact solution over all dice outcomes, `bestKeeps`). |
| `public/` | The original classic page (`index.html`) at `/`, plus its art/audio. Thin client now; still works. |
| `client/` | The 3D client (Vite + React + React Three Fiber + cannon-es), built to `client/dist`, served at **`/next`**. |
| `test/` | `node --test`: rules and strategy unit tests, end-to-end server tests with socket.io-client; `dev-server.js` (not a test) for browser checks. |
| `art/` | Untouched AI originals. `client/scripts/process-art.mjs` (`npm --prefix client run art`) makes game files in `client/public/{art,textures}`. |
| `docs/art-direction.md` | Style, palette, asset list + status, prompt pack. |

Key socket events (server → client): `gameStateUpdate` (players, order, lives, mode, tavern
run incl. purse, shelf, shop), `turnState {turn, event}` (event `toggle`/`finalized`),
`diceRolled {turn, preRollCallout, suspense, devil, animationMs, throwSeed, rerolled?}`,
`roundResult`, `signatureMove`, `offerShop` (a fight is won; the name is historical), `thonicUsed`, `keepsakeActivated`, `gameOver`
(with a `tavern` summary at the end of a run), `triggerNewGameSplash`. (`offerKeepsakes` /
`chooseKeepsake` remain for keepsakes from events, step 3.)

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
- `TableScene.tsx`: camera solve (fits table between tavern band and controls; landscape uses
  `setViewOffset` to leave a right column for the Roll button), lights, tray, brass plates.
- `Dice.tsx`: dice meshes, slot placement by lock order, sphere hit targets, tap on pointer-down,
  Klarg's steal motion, Rokr's constellations.
- `Hud.tsx`: lobby (invite `?table=CODE`, lives choice), turn banner (not in Tavern Crawl, where
  the nameplates show whose turn it is), chips, opponent nameplate, score to
  beat, controls, modals; Tavern Crawl: opponent intro card, signature-move banners, the purse
  and Thonic shelf (`drinkable()`), Thom's full-screen shop scene (`ThomShop`), the run-over
  screen. `Backdrop.tsx`: tavern image + opponent bust behind the table.

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
`/shelf?ids=healing,lastGasp`, `/purse?n=150`, `/between?spots=thom,stranger` (add `&pickpocket=1`,
or `&stage=shrine|diceDen|stranger`). The pane's launch entry for it is `dev-test-server`.

Env: `PORT`, `GAME_TIME_SCALE` (tests use 0.01), `LEADERBOARD_READONLY`,
`TAVERN_START_ENCOUNTER` (1 = Klarg … 4 = Jaguar, for testing), `GAME_SERVER` (dev proxy target).

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

## Status (16 October 2026)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`, all pushed; latest `0b69aa8`):** the
  3D table at `/next`: physics dice, all painted art, tavern backdrop and opponent busts,
  multiplayer with invites and reconnection, phone layout, score to beat, synthesized dice
  sound, and the reworked Tavern Crawl (below). 63 server/rules/strategy tests + 10 client tests.
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

- **Fights:** five opponents in order (`PLACES.tavern`, built as data so later places with
  tougher opponents are new entries). Hearts reset to 3 each fight. **Turns alternate**
  (player first in odd rounds, opponent in even). Each opponent gets an entrance (bust rises,
  name card). Signature moves play on the table after the dice stop (Klarg's die swept away,
  Rokr's constellations, the Hangman's shot, Jaguar's -3); no commentary pop-ups. Klarg steals a
  2 or 4 the player still needs, else the highest die. **The Ace of Spades is the Hangman's
  revolver** (not a card): his move is a muzzle flash and a bullet hole by a "24".
- **Opponents' play:** the Molar plays simply (`planBotLocks`), as a teacher. From Klarg on
  they play their best (`shared/strategy.js`): the keep with the best chance of beating the
  player's score (ties count half), of a valid hand if the player dusted, or, going first, of
  leaving a score a sensible player fails to beat; the Hangman counts on his Ace at one life.
  Tables (~0.1 s each) are warmed after the server starts. Once the player has finished and
  the round can no longer be won or tied (`Rules.bestPossibleScore`, `tavernRoundLost`), the
  opponent keeps everything left at once and ends the turn instead of playing it out. Much stronger at high scores (to
  beat 20: 53% vs 35% before).
- **Gold:** a purse during the run (`GOLD`: 100 x the opponent's place per win, 25 per heart
  left, 75 per perfect 24); the purse (+ a consolation for a lost run) is the final score and
  goes on the leaderboard. The run-over screen shows the breakdown.
- **Thom's Thonics:** after each win, a full-screen scene (`.thom-scene`; Thom's bust from
  `art/bust-thom.jpg`, cut out by `cutOutFlat`) where Thom says "What ya havin'?". His cart
  shows 3 Thonics (Healing + 2 random, `pickThomStock`). A shelf holds up to 3, carried
  between fights. Each Thonic is drunk at its own moment on your turn (server `drinkThonic`
  handler; the client's `drinkable()` mirrors it), with a cork pop:

  | Thonic | Price | When | Effect |
  |---|---|---|---|
  | Healing | 120 | before rolling, once a heart is lost | +1 heart |
  | Last Gasp | 250 | works by itself | a round that would take your last heart leaves you on 1 |
  | Fizzy Thomic | 80 | after a roll showing 1s | those 1s roll again (`rerollOnes`, `diceRolled.rerolled`) |
  | Second Thoughts | 180 | after keeping a die | a kept die goes back, free roll (`putBackDie`, `turn.freeRoll`, client `putBackSlot`) |
  | Steady | 150 | any time in the turn | dust counts as 0 at End Turn (`turn.steady`) |
  | Clear-Eye | 100 | before rolling, vs an ability | opponent's ability off this round (`clearEyeRound`) |

- **Between fights** (step 3, `INTERLUDE` in `server.js`, `tavernRun.interlude`; client
  `Interlude` in Hud): in a full-screen tavern scene, **two spots catch your eye** and you go
  to one (the user chose this over doors: it's a room you can look around, and it becomes "a
  fork in the road" in later places). Spots are drawn at random from `PLACES.tavern.spots`:
  Thom's cart (opens `ThomShop`), the Shrine to the Lady (free Healing Thonic or 100 gold),
  the Dice Den (bet 50/100, then the player taps to roll two dice and the gambler rolls two;
  higher total doubles the bet, a tie rolls again), the
  Hooded Stranger (one of two keepsakes; the next fight starts on 2 hearts; offered only while
  keepsakes remain). About 1 walk in 4 a **pickpocket** strikes first: roll one die, a 4+
  catches him (`pickpocketCatch`), else he takes a quarter of the purse. The choice screen
  is headed "Make your choice"; "Or challenge Klarg right away" (the next opponent's name)
  skips both spots (it's all at the one table, so the wording is "Challenge", never "walk").
  Each spot (and the pickpocket) is a full scene built on Thom's (`SpotScene`: the character
  rises in their own light with a speech bubble and reacts to what happens, sign + counter;
  the Shrine's painting is its stage). Their dice are 2D (`Die` in Hud: red 1, green 6) with
  the real dice sound (`simulateRoll` impacts). Gold won or lost here is
  `stats.eventGold` ("Between fights" on the run-over screen). Numbers are first guesses.
  Each spot has painted art in a round frame (`SPOT_PORTRAITS`); the Lady is the goddess of
  sailors. Game text calls the pickpocket "the thief" (no assumed gender).
- **Keepsakes:** only from the Hooded Stranger now. Jaguar's drop waits for a second place.
  The old keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) is unused. The classic page
  at `/` walks straight on (its `leaveShop`), so it never sees the spots.
- **Known limits:** if your last die lands on a 1 it is kept at once, so Fizzy can't reroll a
  single last die (Second Thoughts can reopen the hand). Klarg's steal motion has not been
  seen on screen yet (the preview doesn't move dice).

## Next steps (in order)

1. **User plays the test site on the phone** (a full Tavern Crawl, then two phones over mobile
   data). Collect feedback; fix what comes up. Needs the user.
2. **Tavern Crawl step 3: events between fights.** Built, with art (see "Between fights"
   above); needs the user to play it.
   Jaguar's keepsake drop waits until there is a second place to carry it into.
3. **Step 4: balance.** Simulate many runs with the real opponents (`shared/strategy.js`) and a
   sensible player buying Thonics, to set prices and gold amounts; then tune by feel with the
   user. The stronger opponents make this matter.
4. **Ship to `main`:** prepare a PR from `phase-2-3d-prototype`; set the live service's build
   command to `npm install && npm run build`; the user merges (that deploys the live game);
   then delete the test service. Fix anything Render-specific as it appears.
5. **Persistence:** move the leaderboard to a small hosted database so it survives deploys
   (more important now that gold is the score).
6. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
   classic page reachable for a while), update the PWA manifest/service worker, retire the old
   client code in `public/index.html`.
7. **Feel and big moments:** tune dice sound, roll length (~2.2 s), camera on other phones; a
   perfect-24 celebration; the devil/three-6s effect done the user's way (ask first).
8. **Later / nice to have:** optional art (`docs/art-direction.md` "Wanted": Klarg's hand,
   keepsake pictures, the Hangman's revolver), new places with tougher opponents (the roguelite), smaller
   bundle (lazy-load three.js), compressed audio (the 9.5 MB ambience track), spectator mode,
   emoji reactions floating over the table.
