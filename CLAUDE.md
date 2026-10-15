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
with an ability; keepsakes between fights; gold and a global leaderboard).

## The person

- Plays and tests on an Android phone over home Wi-Fi; Windows PC; non-specialist, wants plain
  explanations and to see/hear results (send previews, screenshots).
- Makes the AI art themselves (see `docs/art-direction.md`); has strong opinions on feel
  (dice colours: red 1, green 6; Tavern Crawl has no commentary pop-ups).
- Not planned for now: new Devil/Vaelin avatars; the devil (three 6s) effect is to be redone
  "another way" later; ask before designing it.
- Pushing feature branches has been approved before; **merging to `main` deploys the live
  game: the user does that via a GitHub PR.** Ask before any push.

## Architecture

The **server is authoritative**: it rolls (crypto RNG), validates every action, scores from
the dice, runs the bots and the Tavern Crawl. Browsers only send `rollDice`, `toggleDie(id)`,
`endTurn` and render what comes back. Two clients share one server:

| Path | What |
|---|---|
| `server.js` | Express + Socket.IO. Rooms, turns (`room.turn`), rounds, Tavern Crawl, bots, reconnection grace, leaderboard. Exports `start`, `rooms` for tests. |
| `shared/rules.js` | Pure rules (UMD: `require` on the server, `self.GameRules` in browsers): scoring, callouts, suspense, Klarg steal, Rokr blur (`viewTurn` hides values), bot strategy. |
| `public/` | The original classic page (`index.html`) at `/`, plus its art/audio. Thin client now; still works. |
| `client/` | The 3D client (Vite + React + React Three Fiber + cannon-es), built to `client/dist`, served at **`/next`**. |
| `test/` | `node --test`: rules unit tests and end-to-end server tests with socket.io-client. |
| `art/` | Untouched AI originals. `client/scripts/process-art.mjs` (`npm --prefix client run art`) makes game files in `client/public/{art,textures}`. |
| `docs/art-direction.md` | Style, palette, asset list + status, prompt pack. |

Key socket events (server → client): `gameStateUpdate` (players, order, lives, mode, tavern
run), `turnState {turn, event}` (event `toggle`/`finalized`), `diceRolled {turn,
preRollCallout, suspense, devil, animationMs, throwSeed}`, `roundResult`, `signatureMove`,
`keepsakeActivated`, `offerKeepsakes`, `gameOver`, `triggerNewGameSplash`.

### 3D client (`client/src`)
- `game.ts`: socket + store (`store.get/subscribe`), ordered task queue (rolls animate before
  later updates apply), seat memory (sessionStorage `tavernSeat`; rejoins on every reconnect),
  pending taps shown instantly over server turns, "Your turn" banner, invite links.
- `physics.ts`: each roll is **pre-simulated** (cannon-es, clipped-corner dice) and played back.
  When dice stop, faces are relabelled (`offsets`) so the server's values are on top. Seeded
  by the server's `throwSeed`, so every screen sees the identical tumble. Records `impacts`.
- `sounds.ts`: dice sound is **synthesized from physics impacts** (noise burst + falling body
  tone, through a compressor). Other SFX/music are the classic mp3s from `public/`.
- `TableScene.tsx`: camera solve (fits table between tavern band and controls; landscape uses
  `setViewOffset` to leave a right column for the Roll button), lights, tray, brass plates.
- `Dice.tsx`: dice meshes, slot placement by lock order, sphere hit targets, tap on pointer-down.
- `Hud.tsx`: lobby (invite `?table=CODE`, lives choice), chips, opponent nameplate, score to
  beat, controls, modals. `Backdrop.tsx`: tavern image + opponent bust behind the table.

## Commands

```bash
npm start                      # server on :3000; prints the phone link ("On your Wi-Fi: ...")
npm test                       # server + rules tests (node --test)
npm run build                  # what Render runs: installs + builds client/dist
npm --prefix client test       # client tests (vitest)
npm --prefix client run art    # regenerate processed art from art/
```

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
- **Dev test hook:** in dev builds `window.__game = { actions, store, table, simulateRoll,
  renderImpacts }` drives games from scripts. It is excluded from production builds (verify
  with a grep of `dist`).
- **Browser pane quirks:** a hidden pane pauses animation (rAF), so long live tests need the
  pane visible; the first screenshot after a reload often shows the table undrawn. Take another.
  After changing the emulated viewport, reload (the canvas keeps its old size otherwise).
- **React Three Fiber:** never pass freshly created objects (e.g. `new Vector3`) as props on
  every render; R3F re-applies them and snaps meshes (this caused locked dice to jitter).
- **Nothing may cover the dice or the slot rail.** On phones the camera fits the table above
  the footer using its measured height (`screenInsets.bottom`); on narrow screens, where the
  table can't shrink further, it pins the rail above the controls and the tavern gives way.
  Check at ~360x640 and ~384x800 after any HUD or camera change.
- **Camera solve** carries state across frames: guard against non-finite values and ignore
  implausible layout measurements (first frame), or the table vanishes for good.
- **AI art** usually arrives with a painted checkerboard instead of transparency; the art
  script removes it, with per-image fixes. Prompts now ask for a flat magenta background.
- **Phone access:** the PC's Wi-Fi address changes; `npm start` prints the current link.
  A DHCP reservation on the router (user's job) or Render fixes it for good.
- Commit messages end with the `Co-Authored-By` line from the session's instructions.

## Status (October 2026)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`):** the 3D table at `/next`: physics
  dice, all painted art, tavern backdrop and opponent busts, Tavern Crawl, multiplayer with
  invites and reconnection, phone layout, score to beat, synthesized dice sound. Pushed up to
  `9ad1af5`; **later commits are local only** (push when the user agrees).
- **`main` = the live game, still the old version.** Nothing from Phase 1/2 is live yet.
- **Render:** the existing live service sits in "My project". The test service
  **`pirate-dice-next`** (branch `phase-2-3d-prototype`, auto-deploys on push, build
  `npm install && npm run build`, start `npm start`) is live at
  https://pirate-dice-next.onrender.com/next (first deployed 15 Oct 2026). The duplicate
  services from the earlier outage are deleted.
- Free Render: instances sleep after ~15 min idle; `leaderboard.json` resets on each deploy.

## Next steps (in order)

1. **Ship what exists.** `pirate-dice-next` is deployed; the user is testing on phones (first
   finding: the slot rail was under the player chips, fixed). Next: two phones over mobile
   data. Then: set the live service's build
   command to `npm install && npm run build`, user merges the PR to `main`, delete the test
   service. Fix anything Render-specific (build memory, websockets) as it appears.
2. **Tune by ear and feel on real phones:** dice sound weight/volume, roll length (~2.2s),
   tap targets, camera framing on other phone sizes.
3. **Tavern Crawl polish:** an intro moment per opponent (bust slides in, name card), keepsake
   choice as cards, visible abilities (Klarg's hand taking the die, Rokr's constellation
   effect, Hangman's Ace of Spades, Jaguar's Smooth Talk), a proper run-over/victory screen
   with gold breakdown and the leaderboard.
4. **The big moments:** perfect 24 (confetti, camera swoop, sound) and the devil/three-6s
   effect, done the user's way (ask first).
5. **Persistence:** move the leaderboard to a small hosted database so it survives deploys.
6. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
   classic page reachable for a while), update the PWA manifest/service worker, retire the old
   client code in `public/index.html`.
7. **Later / nice to have:** smaller bundle (lazy-load three.js), compressed audio (the 9.5 MB
   ambience track), spectator mode, emoji reactions floating over the table, more opponents.
