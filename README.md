# 2, 4, 24

A multiplayer tavern dice game. Roll six dice and lock at least one after every roll.
You must end with a **2** and a **4** locked. The other four dice are your score, so
four 6s make a perfect **24**. Missing the 2 or the 4 is **dust**, and the lowest score
each round loses a life.

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000.

## 3D table prototype (`/next`)

A new 3D client lives in `client/` (Vite + React Three Fiber, physics with cannon-es).
It talks to the same server as the classic page, so both can be played side by side.

```bash
npm run build:client
npm start
```

Then open http://localhost:3000/next/. While working on the client, run `npm start` in one
terminal and `npm run dev:client` in another for hot reload at http://localhost:5173/next/.

Rolls are simulated ahead of time and played back. The server has already chosen each
value, so when a simulated die stops, its faces are relabelled so the server's value is on
top (`client/src/physics.ts`). Client tests: `npm --prefix client test`.

Art: originals are in `art/`; `npm --prefix client run art` regenerates the game files in
`client/public/art` (see `docs/art-direction.md`).

## Table codes

| Code | Mode |
|---|---|
| blank or any code | Classic multiplayer. Share the code with friends. |
| `COMP` | Solo against The Molar |
| `TAVERN` | Tavern Crawl: five opponents in a row, keepsakes, gold and a global leaderboard |

## Project layout

| Path | What it is |
|---|---|
| `server.js` | Node server (Express + Socket.IO). Owns rooms, turns, dice rolls, the bot and scoring. |
| `shared/rules.js` | The game rules as pure functions, used by both the server and the browser. |
| `public/` | Everything the browser loads: `index.html`, art, audio, service worker, app manifest. |
| `client/` | The 3D table prototype, served at `/next` once built. |
| `test/` | `rules.test.js` (rules) and `server.test.js` (real server driven by socket clients). |
| `leaderboard.json` | Tavern Crawl high scores, written by the server. |

## How a turn works

The server is the only place dice are rolled or scored. A browser can only ask to
`rollDice`, `toggleDie` or `endTurn`. The server checks it's that player's turn,
applies the rules from `shared/rules.js`, and sends everyone the same `turnState` /
`diceRolled` update. The bot opponents also run on the server.

## Tests

```bash
npm test
```

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `GAME_TIME_SCALE` | Multiplies all server delays, e.g. `0.01` in tests |
| `LEADERBOARD_READONLY` | Set to anything to stop writing `leaderboard.json` (local testing) |
