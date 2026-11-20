# Can a player save scum? (checked 20 Nov)

The user, 20 Nov: "is it possible for a player to save scum the game?" Yes, in three ways, from reading `server.js`
(`sendAutoSave`, `sealSave`, `sealFightSave`, `openSave`, `openedSaves`) and `client/src/game.ts` (`actions.resume`).

## How saves work now

- The server sends the browser a sealed save whenever the run changes (`autoSave`): during a fight it is **the run as
  that fight began** (`run.fightSave`); between fights, the run as it stands; at an invitation, its own.
- The browser keeps only the newest one (`localStorage.tavernSave`); the start screen offers Continue.
- A save can't be edited (sealed with `SAVE_SECRET`), and opens only once: each opened or replaced save's id goes
  into `openedSaves`, **kept in memory only**.
- Between fights it is well guarded: the thief's share is taken before you can quit, and a hot tub surge, an omen or a
  purchase makes a new save at once and uses up the old one.

## The ways in

1. **Quit a fight you're losing, and replay it from the start (easy, anyone can do it).** During a fight the save on
   the device is the fight-start save, not yet opened. Leave the table before the losing round ends (back button, or
   close the tab), press Continue: a new table, the same opponent, full hearts, fresh dice. Each restarted fight sends
   a new fight-start save, so it can be done again and again. The menu's "Save your crawl" (14 Nov) does it on purpose;
   the back button does it too. Only once the run is over is the save forgotten.
2. **Two tabs (moderate).** Continue in a second tab opens the same save while the first tab is still playing it: two
   tries at the same fight, in parallel, keep the better one.
3. **After a server restart (needs a copied save).** `openedSaves` is forgotten when the server restarts, which on
   Render's free tier is every sleep (after ~15 minutes idle) and every deploy. A save someone copied out of the
   browser's storage earlier opens again then. An ordinary player never sees the save's text, so this needs some
   know-how.

The leaderboard counts each name's best run, so all three can also lift a leaderboard score.

## Options (for the user to choose)

1. **Fights resume where they were, round by round (recommended).** The fight save is resealed at each round's end with
   both sides' hearts, the round number and the abilities used; Continue picks up at the start of that round, not the
   fight. Quitting can then only redo the round in progress, not the fight. (Stronger still: a round left unfinished
   counts as lost on Continue. That also punishes a dropped connection, so probably not.)
2. **One live run per save.** Continue is refused while that run's table is still alive (the second-tab way); the player
   is sent back to the table they left instead.
3. **Remember used saves in the database** (a small `used_saves` table in Neon, as the leaderboard is), so restarts
   don't open old saves again.
4. **Leave it.** It's a single-player game; scumming mostly cheats the player out of the tension. The leaderboard is
   the only thing others see.

Claude's recommendation: 1, 2 and 3 together; 1 is most of the work and closes the easy way in.

## Built (20 Nov, the user's "Fix both": options 1, 2 and 3)

1. **Round saves:** at each round's end the fight's save moves on to the next round (`sealRoundSave`, `FIGHT_STATE` in server.js:
both sides' hearts, the round, abilities and keepsakes spent, this fight's songs, omens, surge and Elf Bars), sent to the
browser at once; Continue picks the fight up at that round (`run.resumeRound` in `restoreRun`, applied in
`resetTavernEncounter`), the right side throwing first. The menu's Save does the same. Quitting can redo only the round under way.
2. **One live table per run:** every run has a `runId`, carried in its saves. Continue with a save whose run is still played
at another table with someone at it is refused (`crawlLive`: back to the start screen, the save kept, "Already playing"); a
table left empty is retired as the save opens, so only one copy goes on.
3. **Used saves remembered:** `markSaveUsed` writes each used save's id to the database (`used_saves` table; `used-saves.json`
without one) and the server loads them as it starts, so a restart no longer reopens old saves.

Tests: three (a round resumed, a second copy refused, the database's used saves). Not yet seen on a phone.
