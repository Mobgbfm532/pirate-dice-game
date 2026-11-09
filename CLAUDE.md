# 2, 4, 24: project guide

A multiplayer tavern dice game being rebuilt from a single HTML page into a 3D, phone-first
web game. This file is the working reference: what exists, how it fits together, what has
bitten us before, and what comes next. Keep it current when something important changes.

## The game

Roll six dice; after every roll lock at least one. Keeping your last die by a tap doesn't end the
hand (4 Nov, the user's call): it waits, complete, for End Turn, and until then a die kept this throw
can go back (`toggleDie(..., { hold })`, `turn.complete` in the view, `Rules.finishTurn` in
`performEndTurn`; Sylvester's Back of the Head now comes at End Turn; the bots finish at once). You must end with a **2** and a **4**
locked; the other four dice are your score (max 24). Missing the 2 or 4 is **dust**. Each
round, dust loses a life and the lowest valid score loses a life; ties go to sudden death
(in a Tavern Crawl a tie costs no one a heart).
A 24 restores a life (Tavern Crawl opponents too, since 18 Oct: a rolled 24, up to their lives for
the fight; the Hangman's Ace of Spades 24 doesn't heal him). Last player with lives wins.

**The league (4 Nov, the user's call):** at table code `JUGS` (`LEAGUE_ROOMS` in server.js; add a code there for another) every finished multiplayer game counts, by player name (trimmed, any case): games played and won (`recordLeagueGame`, `leagueUpdate`). It shows on the game-over screen and behind a 🏆 in the header (`LeagueTable` in Hud), most wins first, then fewest games. A table of one doesn't count; `previews/scenes/jugs-player.cjs` seats a second player for trying it. (Kram was given one win and one game by hand on the real database, the user's call, 4 Nov.)

Table codes: any code = classic multiplayer (`COMP`, solo vs The Molar, was taken out on 4 Nov, the user's call; a bot sits only at a Tavern Crawl table now); `TAVERN` = Tavern
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
`diceBet`, `diceRoll`, `moveOn` (`leaveShop` is its older name); `puffMystery` for Martha's Elf Bar (`wearMask(curse|devil)`, the old mask, is dormant);
`joinTavern` may carry `resume`, a saved run) and render what comes back. Two clients share one server:

| Path | What |
|---|---|
| `server.js` | Express + Socket.IO. Rooms, turns (`room.turn`), rounds, Tavern Crawl (`TAVERN_ENCOUNTERS`, `THONICS`, `PLACES`, the events between fights, `fireTavernAbility`; its numbers come from `shared/balance.js`), bots, reconnection grace, leaderboard. Exports `start`, `rooms`, `io`, `emitState` for tests. |
| `db.js` | What lasts between restarts (3 Nov): the leaderboard, which opponents each player has met, and the league (4 Nov). With `DATABASE_URL` (Neon Postgres) in the database (tables `leaderboard`, `met`, `league`, made on start); without it in `leaderboard.json` / `met.json` / `league.json` (gitignored; `LEADERBOARD_READONLY` leaves them alone). The server keeps them in memory and writes through without waiting. `test/db.test.js` checks the SQL on pg-mem. |
| `shared/rules.js` | Pure rules (UMD: `require` on the server, `self.GameRules` in browsers): scoring, callouts, suspense, Klarg steal, Rokr blur (`viewTurn` hides values), Fizzy/Second Thoughts (`rerollOnes`, `putBackDie`), the Molar's simple play (`planBotLocks`). |
| `shared/strategy.js` | Server only: the best-play brain for Tavern Crawl opponents from the Yawning Portal on (exact solution over all dice outcomes, `bestKeeps`). |
| `public/` | The original classic page (`index.html`) at `/`, plus its art/audio. Thin client now; still works. |
| `client/` | The 3D client (Vite + React + React Three Fiber + cannon-es), built to `client/dist`, served at **`/next`**. |
| `test/` | `node --test`: rules and strategy unit tests, end-to-end server tests with socket.io-client; `dev-server.js` (not a test) for browser checks; `shots.mjs`, `shots-base.mjs`, `compare.mjs` (not tests): before/after screenshots; `film-shots.mjs` (not a test): the intro film's stills. `shots-base.mjs` serves a commit (default HEAD) frozen on :5174 (launch entry `shots-base`), so "before" can be shot while the working copy changes; `shots.mjs` shoots silently in headless Chrome (`node test/shots.mjs previews/x/before client=http://localhost:5174/next/ look=next fight=1 roll=1`; seeds the throw, waits for the table to settle); `compare.mjs previews/x` makes side-by-sides and change numbers. Needs the dev test server running. |
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
  The tumble is the plain simulation. From 2 to 3 Nov every die was made to turn over at least
  2.5 times (a higher toss, more spin, whole extra turns added in the air); the user found the
  dice spun too much and looked unreal, so that was reverted on 3 Nov (commit 238e41d has it).
- `sounds.ts`: dice sound is **synthesized from physics impacts** (noise burst + falling body
  tone, through a compressor); so is the Thonic cork pop (`playCorkPop`). Other SFX/music are
  the classic mp3s from `public/`. Music (+ ambience) and game sounds switch separately (two
  header buttons; `localStorage.tavernMusicOff` / `tavernSoundsOff`; `tavernMuted = "1"` silences both). Since 28 Oct the mp3/wav clips are decoded for Web Audio once the audio context runs and play from buffers (an <audio> element lagged on phones), each from its `LEAD` (where its sound starts: the Devil's two clips open with ~0.7-0.9 s of silence). The user's clips: `Gasp.wav` as a slow-motion last throw starts, `CoinWinning.mp3` when a fight's purse total lands, `Shield.mp3` for the Shield, `DrinkPotion.mp3` for a Thonic (the synthesized cork pop is unused); `PotionSelector.mp3` as you buy a Thonic, `CoinTally.mp3` on a fight's summary (once for the win's gold, once for each heart left, 160 ms apart; 4 Nov), `TavernCrawlVictory.mp3` as a fight's summary opens and when a whole crawl is won, `MultiplayerVictory.mp3` on the winner's screen when a multiplayer table ends (`gameOver.winnerId`), `Whoa.mp3` (**off since 4 Nov until the user reworks it**: `WHOA_ON` in game.ts; when on, it plays as any slow-motion last throw lands and on a Perfect ...4?, on top of its yay, oh well or aww), `LoseHeart.mp3` as any heart at the table cracks and `Perfect24Health.mp3` as a heart won back by a perfect hand (a 24, or a 23 with the Sunglasses) pops in (5 Nov, in `Hearts`), `ThiefLaugh.mp3` as the thief gets away (it was the aww), `LadyChoice.mp3` when the Lady's Grace saves you too (it was the yay), `ItemPickup.mp3` as you take a keepsake (Thom's back shelf, the Stranger). Thom's spoken purchase lines were taken out (the user, 28 Oct). Scene loops (Thom's cart `ThomAmbience.mp3`, the hot tub, the Shrine) play through Web Audio when it runs, seamlessly (`startSceneLoop`), else an <audio> element.
- `Intro.tsx`, `intro.css` (the intro film, built 5 Nov from the user's paintings, sounds and words): about 30 s, before a Tavern Crawl while the start screen's tick box is on (`localStorage.tavernIntroOn`; until a player chooses, it's ticked only on a device that hasn't seen the film, `tavernIntroSeen`), and from its "Watch it" link, which goes back there after; Skip or Esc any time; not for invites or saved runs. Its shots start on the music's hits (`IntroMusic.mp3` hits every 6 s, last at 24 s, then dies away): one real die thrown into a pool of lantern light on black, landing on a 6 (`FilmDie.tsx`, its own small canvas for that shot, its first hit on the music's), the town (`art/intro-town.jpg`, with `intro-foreground.jpg`'s two sides sliding out past the camera; upright phones place them by the walls, lantern and barrels), the Portal, the ship, the real table and dice (`film` in game.ts: no server, three throws pre-simulated, a 2, a 4, four 6s; not the Perfect 24 gold light, which paled the green pips; on a computer the table rises under the bar for bigger dice), the door (`art/intro-door.jpg`, its light flooding the screen; the town and the door have rain drawn each frame on one canvas, `Rain`), then black lifts (`liftCurtain`) off Sperm's entrance card. The table isn't drawn while a painting covers it (`filmPause`, the Canvas's `frameloop`), and each part of the film exists only around its own time (`Timed`, `WINDOWS`; 6 Nov: with every shot alive throughout, a phone was asked for nearly 50 layers, 371 MB at the door, and the last scene glitched; CSS delays subtract `--elapsed`). Sound in `playFilmSound` (under the music switch): the music, `IntroRain.mp3` (two passes crossfaded around 16 s: the clip opens with 0.15 s of silence, which stuttered where it looped), `IntroTavernAmbience.mp3` muffled by a low-pass filter until the door opens. The words are on screen, there is no narrator. Stills, silently: `node test/film-shots.mjs previews/intro/x` (`crawl=skip|full` the first-crawl flow, `sound=1` the sound's wiring with Chrome muted). The art script's `ONLY=intro` redoes the paintings (`floodFlat`'s `background` option: dark paint fills most of the foreground's border).
- `Trailer.tsx`, `trailer.css` (the trailer, 9 Nov, the user's: about 32 s for an upright phone, to screen-record): open `/next/?trailer` (any build; it never sits down at a table, `trailerWanted` in game.ts), tap, and it plays to the intro's music alone (`playTrailerMusic`): the intro's opening die and "Roll six dice.", the real table keeping a 2 then a 4, three 6s landing on the 12 s hit with the game's own Devil moment, ten rivals' ability paintings ("Fourteen rivals."), the three places ("Two taverns. One ship."), "One last throw..." and the last die in slow motion for the game's Perfect 24 (with its yay), then the title and the user's tagline "Keep the 2. Keep the 4. Become a legend.", with Play again. The throws are `film.prepare(longest, THROWS)` (`FilmSpec`: `devil`, `slow`, `cheer`); `film.showTable` must come before the first throw starts (it resets the tray, and a throw already under way then never lands). Stills, silently: `node test/trailer-shots.mjs previews/trailer client=http://localhost:5175/next/ at=2.5,12.4` (dev client; `window.__trailerAt()` is the trailer's clock in music time).
- `look.ts` (the new look, the default since 23 Oct; see Status: Visuals): the `?look=classic` switch and the shared flame.
- **The table** (`TableDressing.tsx`, in TableScene's `Tray`): a wooden box again (the user, 3 Nov:
  "get rid of the rails" meant only the brass): the new look's rails are rounded and varnished with a
  carved cap, the tray's soft shadow on the tabletop and the felt darkening by the rails; no brass on
  the tray (the inlay and corner brackets of 2 Nov are gone). The new look keeps a brass front edge
  on the slot rail, its soft shadow on the tabletop, and a few struck gold "24" coins right of the
  slot rail (the metals carry a little emissive glow, since the room's reflection is faint; the coins
  aren't drawn on a computer since 3 Nov, the user's call). The tabletop painting mirrors past its sides
  (it was stretched there, which looked smeared on a wide desktop window, 3 Nov). The
  classic look has its plain box rails.
- **The camera on big moments** (3 Nov, the user's pick, new look only; `cameraMoves.ts`, used by
  TableScene's `CameraRig` and `Room`): a perfect hand (Perfect 24 / ...4?) leans the camera in over
  the felt (`PERFECT_PUSH` 0.09 of its distance) and back as the celebration leaves, the slot rail
  held in place as in the suspense lean; three 6s landing rumble the table (0.75 s); the Hangman's
  Ace of Spades and Dead Eye kick like a recoil; Jaguar's All In lands with a heavy thud. A shake is
  a small turn of the camera after the HUD anchors are measured, and Room moves the tavern and the
  bust by the same px (`shake.x/y`). Abilities with a painting move nothing (their stage covers the
  table). Off with `prefers-reduced-motion`.
- **Depth behind the table** (1 Nov, new look only; `parallax.ts`, used in `Room.tsx`): leaning (the mouse on a computer, else a slow breathing drift after 4 s; a phone's tilt moved it until 3 Nov, taken out at the user's request) shifts the tavern up to `PARALLAX.room` px and the opponent `PARALLAX.bust` px; the table never moves. Inside the painting its sides and floor shift up to `roomNear` px more than its far wall (the `near` uniform warps the texture). The tavern is drawn enlarged about its floor line so no edge shows. Off with `prefers-reduced-motion`, and since 3 Nov on a computer with a mouse (the user: the backdrop holds still there).
- `tuning.ts` `renderDpr()`: pixels drawn per screen point. Computers with a mouse draw at the
  quality level's dpr (High 2x) even when the screen reports 1x, so the dice are sharp on desktop
  (24 Oct); phones use their own up to that. Since 3 Nov a computer draws at most `DESKTOP_PIXELS`
  (3.7 million) a frame: High at 2x on a 1920x1080 window was 8.3 million plus glow and smoothing, and
  the user saw ~20 frames a second; it is worked out again as the window resizes. Since 3 Nov
  (`DESKTOP_PIXELS` per level: High 2.6 million, Medium 2.1): a computer smooths edges at most 2x
  (MSAA), draws no fireplace embers (the user's OK), Auto judges sooner there (after 4 s, 2.5 s slow),
  and with built-in Intel graphics (read from WebGL's renderer name) Auto starts on Low: the user's
  Iris Xe on battery measured High 7-32 frames a second at 1920x1080, Medium 14-19, Low 25-51
  (headless Chrome on the real GPU, `--use-angle=d3d11`; the numbers swing a lot on battery).
- `TableScene.tsx`: camera solve (fits table between tavern band and controls), lights, tray (since 28 Oct the tabletop is the user's wide painting `table-wide.webp`, laid once and not tiled: `tabletopTexture`, mirrored past its sides (since 3 Nov) and its near edge),
  brass plates. Portrait phones and desktops/tablets on their side (height > 500) keep the
  table centred above the controls (since 3 Nov upright phones keep the whole tray, rails too, in
  view: `PORTRAIT_HALF_WIDTH` 4.45, was 4.05; the slot row's plates are centred under the tray,
  `REQUIRED_SLOT_X` and `slotPosition` in layout.ts; the opponent's nameplate no longer shows the fight's number, 3 Nov) (on desktop a dock: chips, score, Roll; reactions in a
  column at the left edge); phones on their side use `setViewOffset` to leave a right column
  for the Roll button.
- **The dice faces (5 Nov, the user's call, new look, every table):** the painted sheet draws a brown line round each face, which read as a cartoon outline on the 3D die: `FACE_INSET` and `clearFaceEdge` in textures.ts cut inside it and paint the corners over.
- `Dice.tsx`: dice meshes, slot placement by lock order, sphere hit targets, tap on pointer-down,
  Klarg's steal motion, Rokr's constellations, the Loaded Die's old-gold die (`materials.loaded`).
- **Opponents' own dice** (3 Nov, the user's paintings; off on 4 Nov, **on again since 5 Nov**, the user's calls, `OPPONENT_DICE_ON` in
  textures.ts, `PAINTED_DICE` lists them; on 5 Nov each pip was redrawn as a clean disc of its own colour, `LIFT` eased to 1.25 and 1.05 and `OPPONENT_DICE_GLOW` to 0.16: Frak still leans olive and Danhausen pink in the fire's light): a Tavern Crawl opponent throws their own
  set on their turns (yours stay ivory). So far the Ghoul and Gourd's: McGrath's yellowed bone (made, but since 3 Nov he
  throws your ivory dice, the user's call: not in `OPPONENT_DICE`),
  Frak green with violet pips, Danhausen purple, the Duke red with gold pips, Martha mother-of-pearl
  with purple pips. The user paints `art/dice-<name>.jpg` (six faces 3 by 2, 1-2-3 then 4-5-6, on a
  plain background; the prompt is in docs/art-direction.md; McGrath's is `dice-mcgrath.jpg`, his id
  is `molar`); `diceSheets()` in process-art.mjs (`ONLY=dice npm --prefix client run art`, list in
  `DICE_SETS`) finds each face, cuts it to its edge and writes `client/public/textures/dice/<id>.webp`
  (512 px faces, 3 by 2) and `<id>-cut.webp`, the engraving: on each face the highest cut-off that
  leaves exactly as many round blobs as it has pips, each engraved as a disc. A 1 too close to its
  face's colour is engraved in the middle; `RING_ONE` repaints it bright red in a ring of the set's
  pip colour (the Duke's crimson on red, a gold ring). On a phone the coloured sets sank into the
  dark felt (the user, 3 Nov), so each face (not its pips) is lifted lighter and a little more vivid
  (`LIFT` in the script) and a little of the painting shows whatever the light. Since 3 Nov each face's
  surface is redrawn even (`CLEAN`: its own colour plus a trace, `detail` 0.35, of the painting's broad
  colour changes), as the painted streaks, rims and bevels looked harsh on a lit 3D die ("abrasive",
  the user); the pips stay as painted
  (`OPPONENT_DICE_GLOW` 0.22, an emissive map: the fire's orange light had turned Frak's green
  olive). Dev: `preview.dice(id)` shows a set on every die, yours too (`null` ends it). Client: `OPPONENT_DICE` and
  `opponentDiceMaterials` in textures.ts (fetched as the opponent sits down; no ivory tint and no
  `clearPips`, which would repaint a red or green face), chosen in Dice.tsx when `turn.playerId` is
  `BOT_ID`. The effect colours (Mind Whip, the hidden "?") still win over a set.
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
- `Hud.tsx`: lobby (invite `?table=CODE`, lives choice; since 30 Oct the player picks one of seven painted item icons, Martha's Mask, the Loaded Die, Brodor's Sunglasses, the Shield, Healing, Purple Haze, the Sign of Kram: `ICON_AVATARS` in portraits.ts, one row; the server's `AVATARS` still accepts the classic page's six characters, and the classic page draws the icons from `/next/art`), turn banner (not in Tavern Crawl, where
  the nameplates show whose turn it is), chips, opponent nameplate, score to
  beat, controls, modals; Tavern Crawl: opponent intro card, signature-move banners, the purse
  and Thonic shelf (`drinkable()`), Thom's full-screen shop scene (`ThomShop`), the choice
  between fights (`Interlude`) and each event's scene (`SpotScene`), the run-over screen.
  **A multiplayer table** (no bot, not a Tavern Crawl; 3 Nov, the user's pick of the multiplayer
  ideas): the other players sit in a bar of cards under the header (`Rivals`, `.rivals`: a phone
  shows up to three a row, so six players are two rows, with smaller portraits from five and smaller
  still from seven; wider screens one row), in turn order, gold on whose turn it is; the footer keeps only your chip. The
  bar's bottom is `screenInsets.top`, and the camera puts the table's far edge just under it, so the
  table grows where the screen's height was the limit (desktops about a third bigger; upright phones
  only where the width isn't the limit already, e.g. 360x640). Phones on their side keep every
  player in the column at the top left instead (`useMedia`). Names shrink to fit their card (`FitName`, down to 62%, measured to the fraction of a pixel and again
  as fonts load) before any "…" (all chips and cards). Since 3 Nov (the user's picks 3 and 4): each
  card has the name across the top and hearts + score under it; a finished score is big and pops in
  (`.score.final`), so what there is to beat reads at a glance; and a big screen (`min-width: 1180px`,
  `min-height: 640px`) seats the players in a column either side of the tray, level with the felt
  (`.seat-col`, sized to the space beside the tray from `--table-x`/`--rail-right`), the table then
  fitting under the header. Since 3 Nov its only words in play are "The Early Ross!" and "Didn't Bite!",
  bursting over the roller's nameplate (`SeatCallout`, `MULTIPLAYER_CALLOUTS` in game.ts; since 3 Nov a
  layer of its own over the page, `.callout-burst` portalled to the body at the card's middle: a
  banner slamming in out of a flash with rays, sparks and a shine, rising away after 2.4 s; inside
  the card the footer's scrolling row clipped it, and the turn's die over a chip, which now has room:
  `.side-players` padding) and a perfect hand's celebration; the points, "Dust!" and the server's
  messages (+1 life, sudden death) don't show there (`multiplayerTable()`), and the camera keeps only
  a small gap under the bar. Since 4 Nov (the user: "a proper round result") each round ends with a card on the felt
  (`RoundResultCard`, `roundResult.results`, 4 s, `TABLE_RESULT_SHOW_MS` on both sides): everyone's score best first, Dust,
  who loses a heart, a sudden death; the winner's screen waits for the last one. A hand finishing on exactly 20 at a multiplayer table bursts "Dirty 20!" over its player's nameplate (4 Nov, the user's; `dirtyTwenty` in rules.ts, `showSeatFlash` in game.ts: its own 2.6 s timer, as End Turn changes the turn at once; `SeatCallout` draws it). Dev control `/faces?f=2,4,5,5,5,0` pins the next dice thrown. Reactions (3 Nov, the user's five: Cheers 🍻, Ha! 🃏, Ooh 😮, Smug 😏,
  Woe 💔; painted by the user the same day: `art/reaction-<id>.jpg` cut out by `cutOutFlat` with
  `icon: 320` into `art/reactions/<id>.webp` (the tankard keeps its ale drops, `minPiece`, and a
  `holes` seed in its handle); `PAINTED_REACTIONS` / `reactionIcon` in Hud; the emoji still travels
  between players) are brass-rimmed wooden coins (`.reaction-coin`); a reaction
  pops out of its sender's nameplate (`receiveReaction` carries the sender's `id`; `ReactionBurst`
  over the page, `data-player` on cards and chips): from a card up top it bobs there and drifts a
  little down, from a footer chip it pops out beside it, clear of the rail; elsewhere (the Molar's) a
  toast as before. `test/shots.mjs table=<code>` shoots one;
  seat others there first with a few socket.io clients.
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
- `dice-import`: when the user has painted dice for more opponents. Finds the sheets (art/ or
  Downloads), checks them, adds the ids to `DICE_SETS` / `OPPONENT_DICE`, runs the art script,
  rings a 1 that blends in (`RING_ONE`), checks the dice on the table as that opponent throws,
  updates this file and reports with previews in `previews/dice/`.
- `render-deploy`: deploying to the Render test service, only after the user says yes to
  pushing. It tests, pushes `phase-2-3d-prototype`, watches the deploy in Claude in Chrome,
  reads the logs if it fails and smoke-tests `/next`. It never touches `main` or the live service.

`npm run dev:test-server` (`test/dev-server.js`): the game on :3002 plus controls on :3003 that
set up Tavern Crawl situations: `curl localhost:3003/shop?purse=200`, `/lives?n=1`,
`/shelf?ids=healing,lastGasp`, `/purse?n=150`, `/keepsakes?ids=loadedDie,mysteryFlavour`, `/fight?n=2` (a fight
against opponent 0-13, ability ready), `/won?hearts=2` (the fight won: its summary, then the event), `/invitation` (Martha beaten; `?boss=brodor` for Brodor), `/disguise?as=Frak` (Martha's mask for the round), `/seed?n=42` (every server draw follows a seed: the same throw each time; `/seed` ends it), `/between?spots=thom,shrine` (add
`&pickpocket=1`, or `&stage=shrine|diceDen|hotTub|stranger|darren|bard|kram`), `/song?song=inspiringSong|cuttingWords` (the Bard's song this fight), `/kram?more=1` (sworn to Kram); `/between?spots=elfKid,thom` for Johnny Elf Bar, `/shelf?ids=purpleHaze,lemonLevitation` for Elf Bars. The pane's launch entry for it is `dev-test-server`;
`dev-test-server-portal` starts every crawl at Sylvester (opponents' lives can be changed on a dev server only with the `OPPONENT_LIVES`
env, or `/opponent-lives?ids=sylvester,vaelin&n=2`; `shared/balance.js` unchanged), and every new run there (a reload starts one) begins with 3 Healings and the Potion Belt, Shield, Loaded Die, Velvet Cushion and Trap Card (`START_SHELF`, `START_KEEPSAKES` env); `dev-test-server-ship` (:3008, controls :3009, with `client-dev-ship` on :5176; 9 Nov) starts every crawl at Klarg on the Salty Swallow with 3 Healings and the Potion Belt, Loaded Die, Shield, Trap Card and Velvet Cushion; `dev-test-server-b` (:3006, controls :3007) with
`client-dev-b` (:5175) is a second, separate pair for checks while the user plays on :3002 (the controls change
every table on their server).

Env: `PORT`, `GAME_TIME_SCALE` (tests use 0.01), `LEADERBOARD_READONLY`,
`TAVERN_START_ENCOUNTER` (1 = Frak … 5 = Sylvester … 10 = Klarg … 13 = Jaguar, for testing), `GAME_SERVER` (dev proxy target),
`DATABASE_URL` (the Neon Postgres link: the leaderboard and who has met whom survive deploys and
sleeps; without it, files),
`SAVE_SECRET` (seals saved runs; set on the Render test service since 21 Oct; the live service needs
one too, or saves only last until the server restarts, which on the free tier is every sleep and deploy).

## Working here: lessons learned

- **Neon (3 Nov):** the Neon CLI is installed globally (`neon`, signed in as the user). This folder
  is linked to the Neon project `crimson-water-92243343` (`.neon`, gitignored; `neon.ts` holds the
  project's settings: Postgres only, no auth), branch `production`. `neon deploy` pulls
  `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` into `.env.local` (gitignored),
  which `server.js` reads on start, except under `LEADERBOARD_READONLY` (the tests, the dev test
  server: they never touch the real database). So `npm start` on this PC uses the real Neon
  database: the same one as the test site. The launch entry `neon-server`
  runs it on :3005. To try something against Neon without touching real data, make a Neon branch
  (`neon checkout dev --create`, a 7-day copy) first. `db.js` drops the link's `sslmode` and always
  checks the certificate. Checks used on 3 Nov live in `previews/neon/` (gitignored).

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
  beat and the turn score share a line (when everyone else dusted there is nothing to beat and the line stays empty, the user's call 27 Oct), the purse/shelf sit beside your chip when they fit, and
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

## Status (9 November 2026)

- **Phase 1 (done):** server-authoritative rules, security fixes, tests. Branch
  `phase-1-server-authority` (pushed).
- **Phase 2 (in progress, branch `phase-2-3d-prototype`, all pushed, on the test site; see git log for the latest commit):**
  the 3D table at `/next`: physics dice, all painted art, multiplayer with invites and
  reconnection, phone and desktop layouts, music / sound switches, synthesized dice sound, and the
  Tavern Crawl: the 14-fight tournament across three places, Thonics, events between fights,
  keepsakes, gold, saves after each place. 154 server/rules/strategy/database tests (the solo-table tests now use Tavern Crawl tables) + 17 client tests.
- **5-9 Nov (the user's calls; details in the sections above and "Tavern Crawl now"):**
  - the intro film, with the user's three paintings, three sounds and five lines (`Intro.tsx`), a start-screen tick box
    for it, and on 6 Nov each of its parts existing only around its own time (the door scene glitched on a phone);
  - opponents' entrance cards wait for a tap and explain each ability, with an "i" on the nameplate for the same card;
    every item on your strip opens an info panel; a slim one-line plaque under Roll;
  - cleaner dice faces (no painted outline), the opponents' painted dice back on with clean pips;
  - the user's heart sounds and a new Astral Flood clip; the At the table tab, and the user's placings built in;
  - the Salty Swallow: Yvesil and Jorvash (spots), Thom stowed away, Rokr's Starry Form, the Hangman's Penitent Stare,
    Brodor's new end-screen text, Martha's keepsake line fixed; on 9 Nov all the ship's art from the user (two busts,
    four ability paintings, six item icons, the night-sky dice). Skipper Bren was discussed and left out.
- **4-5 Nov (the user's calls; details in the sections above and "Tavern Crawl now"):**
  - Martha drops Mystery Flavour, her own Elf Bar, not her mask; the Duke saves his Devil unless it helps;
    the Ghoul and Gourd on 3 hearts against 1, 2, 3, 3, 3; at most two thieves at a place;
  - keeping your last die waits for End Turn, so a die kept this throw can go back; Solo vs The Molar is gone;
  - multiplayer: the JUGS league (Kram given one win by hand), a round result card, Dirty 20!;
  - the scenes between fights on a computer: characters behind a counter, parchment speech bubbles by their
    faces, keepsake descriptions on short windows; the opponents' painted dice switched off (back on 5 Nov); the tuning panel hidden;
  - abilities louder, the screen shaking for Sylvester, Vaelin and the Ridgeler, Astral Flood's wave after its banner;
  - the user's sounds: Elf Bar puff, Martha's Disguises, coin tally, two victories, thief's laugh, Sylvester's punch
    (Whoa is in but off); new lines for Sperm and Brodor, "to spot them" for the thief; no "1 of 14" on intro cards;
  - the Neon database's link went on the Render test service (the user, 4 Nov).
- **1-4 Nov (the user's calls):** depth behind the table (the tavern and the opponent drift slowly on
  a phone; a computer holds still since 3 Nov; the phone's tilt was tried and taken out); extra dice spin
  was tried and reverted (it looked unreal); a richer table was built; on 3 Nov the tray lost its
  brass and stayed a wooden box, and the camera got moves for big moments (a push-in on a perfect
  hand, a rumble for three 6s, the Hangman's recoil, All In's thud). Also 3-4 Nov: opponents' own painted
  dice (the Ghoul and Gourd), the Neon database, faster desktops, the multiplayer table rebuilt (player
  cards, seats beside the tray, two callouts over nameplates, the user's painted reactions), the
  Ghoul and Gourd's hearts, the Yawning Portal's abilities and sounds. Both shared docs were brought
  up to date on 4 Nov (the visuals plan's "Where it stands" and "What's left for the look"; the
  Tavern Crawl design doc's "Where the game stands" table).
- **27 Oct - 1 Nov (the user's calls; details in "Tavern Crawl now"):**
  - abilities rise up the screen like the devil's three 6s, 1.85 s each, showing only their name;
    paintings for most abilities (all of them since 9 Nov); new busts for
    Brodor and Jaguar; the user's sounds for the Ghoul and Gourd's abilities, the hot tub, the
    Shrine, Thom's cart (a loop), buying, the payout, the Shield, drinking, the gasp;
  - a new wide tabletop painting; a better Thonic moment (its bottle pops and tips);
  - gold for a win 10, 12, 14 …; the Dice Den out of every place;
  - the Yawning Portal's own Bard (a spot) and Cult of Kram (an event), with sounds;
  - Johnny Elf Bar (a spot everywhere) and four Elf Bars, three puffs each, no side effects;
  - every item painted: Thonics, Elf Bars, keepsakes, blessings and songs (square icons);
  - keepsakes reworked: the Loaded Die, three new ones (Miser's Purse, Gambler's Charm,
    Bottomless Flask), five at most, the Shield and Loaded Die from the Yawning Portal on, a
    boss's keepsake to take or leave;
  - the start screen offers seven painted item icons instead of character portraits.
- **24-26 Oct (the user's calls; details in "Tavern Crawl now" and the 3D client notes):** the
  devil's three 6s as a living painting (1.5 s); Perfect 24 / ...4? on the felt; sharper dice on
  desktop (`renderDpr`); visuals steps 2, 4 and 5 (dice as the star, one painted interface, hearts
  that crack and the sealed-letter invitation); the Salty Swallow reworked as the final tier; the
  Yawning Portal and Salty Swallow backdrops; the first four ability paintings on a stage of their
  own; Perfect ...4? gets its own slow motion and the suspense slow motion is 0.5 s shorter.
- **The camera zoom while rolling (fixed 26 Oct):** the hint under Roll ("Tap dice to keep them...")
  is empty while dice roll and appears when they land; a line of text (and a round badge, more so)
  was a few px taller than the empty box, so the footer's height (`screenInsets.bottom`) changed and
  the camera refitted. `.hint` is now one fixed line high (`calc(1.2em + 6px)`, border-box) whatever
  it shows; measured steady through roll, tip and keep at 384x780, 360x640 and 1280x800.
- **Game changes of 23 Oct (the user's calls; details in "Tavern Crawl now"):**
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
  - **G (tune and prove):** the tuning panel (hidden since 4 Nov, the user's call: only on a visit with `?tune=1` in the address, no longer remembered; the ⚙ in the header; `tuning.ts`):
    sliders for the feel (multipliers saved per device), the frame rate, quality levels (Auto steps
    down from High when frames stay under ~45 a second), "Copy settings"; its Portraits tab (drag
    and zoom every round portrait, "Copy portraits") and At the table tab (6 Nov, the user's: where an opponent's bust sits behind the table, left/right, up/down and size against a line on the table's centre; anyone can be brought to the table; `SeatEditor`, `seatShift`, `seat`, `localStorage.tavernSeats`, "Copy seats"; the user's numbers go in `SEATS` in portraits.ts). On 23 Oct the user found the built-in
    settings on High "look great" (no slider changes), and made the new look the default.
  - Before/after: `test/shots.mjs` + `test/shots-base.mjs` + `test/compare.mjs` and the
    `visual-shots` subagent; `previews/frozen.mjs` (gitignored) stops the page clock for moments.
- **`main` = the live game, still the old version.** Nothing from Phase 1/2 is live yet.
- **Render:** the existing live service sits in "My project". The test service
  **`pirate-dice-next`** (branch `phase-2-3d-prototype`, auto-deploys on push, build
  `npm install && npm run build`, start `npm start`) is at
  https://pirate-dice-next.onrender.com/next and has every pushed commit (a deploy takes about a
  minute). Free tier: it sleeps after ~15 min idle (first visit then takes up to ~50 s). `SAVE_SECRET` and,
  since 4 Nov, `DATABASE_URL` are set there, so the leaderboard, who you've met and the league live in Neon
  (the live service will need its own of each).

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
  glowing well, the Salty Swallow's gun deck; the ship has Thom, the Shrine, Jorvash and Yvesil (Johnny Elf Bar stays ashore since 9 Nov, the user's) and no events of its
  own (to workshop). Vaelin Inkhand is the Vaelin avatar (new art). Your hearts reset each fight (20 Oct): 3 everywhere since 5 Nov, the user's (`fightHearts` is empty now, it gave the Ghoul and Gourd's first four 2 from 3 Nov; the Lady's Favour +1, the Stranger and Pruney
  Fingers -1, counted from it: `heartsFor`/`nextHearts` in server.js); the opponents have 1, 2, 3, 3, 3 (since 5 Nov,
  the user's: McGrath 1, Frak 2, the rest 3) | 3, 3, 3, 3, 4 | 3, 3, 3, 4 lives (`shared/balance.js`,
  the user's for now, balancing later). Gold for a win is 10, 12, 14 … (2 more each fight, Jaguar 36; since 28 Oct, it was 10 x the fight's number). **Turns alternate**
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
  Danhausen 2, Duke 1, Martha 2; the Yawning Portal's five 1 each (Stason 2), first guesses; the ship since 25 Oct:
  Klarg 2, Rokr's Starry Form 2 (since 6 Nov), the Hangman's Penitent Stare 1 (+ his Ace; since 6 Nov), Jaguar's Smooth Talk 2; Stason's Flourish 2 since 3 Nov, shown as **Vexing Rapier** since 3 Nov; its id stays `flourish`). Each use costs the player ~10 points of fight win chance. **The Yawning
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
  "lost 2 lives"; since 3 Nov, the user's: its round glows harder (a stronger gold edge, a shaft of
  light from the top, sparks down the sides: `.smite-shaft`, `.smite-spark`), and when it lands the
  hammer comes down: its moment again with `hit: true`, its sound, a white-gold flash with cracks of
  light (`.smite-crash`) and the whole page shakes (`shakeScreen` in game.ts, `body.screen-shake`));
  Brodor's **Astral Flood** (in `beginTavernRound`, once he has lost a life, he heals one and, since
  3 Nov, takes one of yours: the Shield catches it, and it never takes your last heart). After its banner, the flood itself (5 Nov, the user's): 2.2 s of aurora light pouring down over the whole screen, rings from the felt, falling stars (`FloodWave` in Hud, `showFloodWave`, `FLOOD_WAVE_MS` on both sides; the next throw waits for it, and the heart breaks as it hits). **Brodor's Sunglasses** (his drop): a finished 23 restores a heart, like a 24
  (`performEndTurn`). Each has its own colours, moment and, for the round ones, a badge and edge
  glow (`.ink-veil` flames in the bottom corners, `.smite-veil` gold). Back of the Head has the user's `SylvesterPunch.mp3` (5 Nov; it was the swoosh), and the screen shakes for it, Inkfire Brand and Divine Smite (`SHAKING_ABILITIES` in game.ts; 5 Nov, the user's); every ability clip plays at `ABILITY_VOLUME` 0.95 (it was 0.75; the Devil's three 6s 0.8, it was 0.6). Since 3 Nov the other four have the user's clips (`InkfireBrand.mp3` 2.9 s, `Flourish.mp3` 1.7 s, `DivineSmite.mp3` 6.7 s, rings on past its 1.85 s moment, `AstralFlood.mp3` 2.8 s, the user's second clip, 6 Nov; `ABILITY_SOUNDS`). Since 26 Oct the user's clips for the Ghoul and Gourd (`ABILITY_SOUNDS` in sounds.ts, `public/MindWhip.mp3`, `YouAreCursed.mp3`, `SympathyForTheDevil.mp3`, `MarthaAbility.mp3` with Disguises since 4 Nov (4.9 s, rings on under the copied trick; it was `MarthaPuff.mp3`), `MarthaSwitch.mp3` as a face goes on, then the copied trick's sound `SWITCH_LEAD_MS` later; your mask too). The Ghoul and Gourd's are **round effects**, decided as a round
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
  solver's `cap`); never fires if he doesn't get there; since 4 Nov (the user's call) he uses it only when it helps (`devilPlan` in
  server.js, decided after each of his throws, `turn.devilPlan`): a 2, 4 and 6 to keep with three dice
  left always (a Perfect 24); you dusted, never; you've played, only if his chance without it
  (`Strategy.chanceAfterKeep`) is under `devilWhenBelow` (0.7 in balance.js: about your 18 and up);
  first to play, always. Going for it he keeps only the 2 and 4 he needs (`Rules.devilWaitLocks`),
  plus a 5 or 6 if three dice stay to throw; otherwise he plays his usual way and saves it);
  Martha's **Disguises** (each use one of the three at random, `as` = whose face). The client
  shows a takeover (since 21 Oct: a flash in the ability's colours, `--flare`, and a banner across
  the screen with who, what and the move's text; since 26 Oct, the user's call, it rises like the devil's
  three 6s: a sheet of light in the move's colours sweeps up, plumes lick up from the bottom
  (`.ability-rise`, not for keepsakes), and the banner and painting fly up into place, then leave
  upwards; as it lands a shockwave ring, glowing edges drawn out from the middle, a shine and the name snapping into focus; every moment is up 1.85 s, `MOMENT_SHOW_MS` on both sides (3.6 s until 26 Oct, 2.6 s until 27 Oct); Thonics keep the small plaque), a badge under the Roll button ("Cursed round: ..."), and in a cursed
  round a violet glow round the screen edges (`.curse-veil`). Every ability has its own colours
  (`AbilityAura` + banner classes by ability name): Mind Whip a green-violet mist and a
  green-violet glow on the die he chose (`materials.mind`; Rokr's blur keeps the blue "?" and stars), the Devil
  smouldering edges with rising embers, Rokr's blur twinkling stars, Klarg claw marks, Jaguar a
  gold sweep, the Hangman a gun-metal banner. The opponent's nameplate/chip
  shows one ✦ per use a fight (`AbilityMarks`, `abilityMax`), dark once spent, flaring after
  the banner. Since 9 Nov (the user's) it counts every ability they have (`abilityMarks` in server.js, `abilitySpent`): the Hangman 2 (Penitent Stare, the Ace), Jaguar 4 (Smooth Talk twice, the Cloak, All In; those two spent as his phase reaches them).
- **The Salty Swallow as the final tier (25 Oct, the user's yes; set by simulation,
  `balance/experiments/final-ship.js`; settings in `shared/balance.js` `finalShip` and `abilityUses`):**
  each goes after a different part of your game. A sensible player, fresh, wins Klarg 27%, Rokr 26%,
  the Hangman 27%, Jaguar 15% (the Yawning Portal ~40%, Brodor 23%; the ship as it was 35, 40, 35, 25).
  - **Klarg** (`keepsStolen`, `klargWaits`): twice a fight he waits for a throw showing a 2 or 4 you
    still need, snatches it (`Rules.stealHighestActiveDie`) and keeps it: his next turn starts with it
    kept (`run.klargHand` → `syncTurn`). Since 9 Nov (the user's): at most once a round (`turn.reachedAround`), and his banner comes first: the die he takes waits on the felt under it, and his hand lifts it and sweeps it away as the banner leaves (`stealReadyAt`, `STEAL_MS` in game.ts, 1.7 s; the next throw waits for it). The hand is his paw (`KlargPaw` in Dice.tsx, `art/klarg-paw.webp`, cut from his ability painting with its painted die erased by `client/scripts/klarg-paw.cjs`): it swoops in from his side, closes on the die (`GRIP`) and carries it back in its grip (`stealGrip`, one path for both); then the die sits on his nameplate, orange, until his turn starts with it (`klargHand` in the state, `.klarg-hand`, shown once `klargStealing()` is over). (Two first-throw steals cost ~12 points each: too much.)
  - **Rokr's Starry Form (since 6 Nov, the user's; the id stays `constellationBlur`):** twice a fight your dice land hidden under twinkling constellations (`turn.blurActive`, viewTurn; Constellation in Dice.tsx): you keep blind, and they show at your next throw. Beatable more often than the Stars were (about 40% against 26%, simulated). Its painting `ability-starry-form.jpg` and the hidden dice's night-sky face `art/dice-starry.jpg` (`textures/dice/starry.webp`, cut from inside its rim; `materials.starry` in textures.ts, its stars an emissive map twinkled in Dice.tsx; dice not yet thrown and Jaguar's cloaked dice keep the plain "?") are the user's (9 Nov). Written in the Stars' code is dormant: 3 turns a fight (`startStars`), the
    stars mark two faces before each throw of the turn (`turn.nextMarks` → `turn.marks`); dice landing
    on them are bound (`turn.boundIds`; `Rules.toggleDie` refuses them; all bound: a free roll). The
    client: stars over bound dice (Constellation), the plaque "Bound: ... Next: ...".
  - **The Hangman** (`abilities: ['penitentStare', 'deadeye24']`, since 6 Nov, the user's): **Penitent Stare**, once a fight, as a round begins once he's lost a life (round effect `stare`, `off`): this round your hand scores 2 less for each heart you've taken (`stareEachHeart`; a plaque and `.stare-veil`; the score changes at End Turn, with its moment showing "20 → 16"). Its painting and the Ace of Spades' are the user's (9 Nov), and so is All In's. **Dead Eye** (dormant since 6 Nov), once a fight, as you end
    a hand that counts he shoots your best scoring die and it rolls again (`deadEyeRerolls`; turnState
    event `shot`); his **Ace of Spades** stays, for his last life. Clear-Eye counts all his abilities
    (`encounterAbilityLeft`).
  - **Yvesil and Jorvash (6 Nov, the user's; spots on the ship; prices and chances first guesses in `interlude`; the user's busts since 9 Nov, `bust-yvesil.jpg` and `bust-jorvash.jpg`, `SPOT_PORTRAITS`; the omens' and refreshments' icons too, `art/keepsake-<id>.jpg`, with `holes` for their trapped magenta):** Yvesil the oracle (`yvesilPick`, `yvesilPrice` 8, rising, `omenGoodChance` 67%): an omen for the next fight, `OMENS`: Fair Winds and The Albatross (your 1s, or 6s, roll again on your first throw of each round, in `rollFaceFor`), Following Sea (your first dust scores as it lies), The Black Spot (hands score 1 less). Jorvash the manservant (`jorvashPick`, `jorvashPrice` 8, rising), one of two for the next fight, `REFRESHMENTS`: Notaro Red (your first hand that counts scores 2 more, at most 24) or Water of the Ebon Shield (one extra heart). Both show on your strip. **Thom has stowed away:** aboard, his line is one of three, drawn per fight (`THOM_SHIP_LINES`). So the ship's spots are Thom, the Shrine, Jorvash and Yvesil (Johnny stays ashore, 9 Nov). Yvesil's staff glow is cut soft and see-through (`glow` with `colour: 'cyan'` in process-art.mjs: only a glow with plenty of blue, so her green hand stays as painted), and on an upright phone she stands bigger, her far arm running off the left, her speech bubble just above her head (9 Nov).
  - **Jaguar** (`jaguarPhases`, `beginJaguarRound`, `run.jaguarPhase` in the state): **Smooth Talk** (3+
    lives; twice a fight, once a round) talks a Thonic off your shelf and drinks it (Healing heals him,
    Steady counts his dust as it lies, `jaguarSteady`); an empty shelf: 3 off your finished hand
    (`talkThree`). Since 9 Nov (the user's) he takes a Healing only when he's down on hearts, else any other Thonic
    (Steady first); with only Healing on your shelf and his hearts full he leaves it and talks 3 off your hand. **The Cloak** (2 lives): he throws after you, his dice hidden (`turn.cloaked`, viewTurn).
    **All In** (his last): the round's loser loses two hearts. Each phase has its banner and badge.
  - Tests pin the dice with `pinFaces` (server.test.js). Starry Form is the old Constellation Blur code brought back (6 Nov); Written in the Stars' and Dead Eye's code is dormant.
- **The sea (9 Nov, the user's; step 1 of the voyage, brainstormed the same day):** aboard the Salty
  Swallow each round has weather, drawn from its leg's mix (`BALANCE.voyage`, weights by opponent, first
  guesses) and forecast a round ahead; a fight's first round is calm (`SEAS`, `setSea` in
  `beginTavernRound`, `run.sea` / `run.nextSea`, `sea` / `nextSea` in the state). So far only Heeling:
  **listing to starboard** every die thrown lands one higher (no 1s), **to port** one lower (no 6s), both
  sides (`seaRoll` under `rollFaceFor`; the Loaded Die's magic and the Devil's 6s untouched, Kram still
  no 1s). The opponents' solver knows it (`shift` in strategy.js: landings weighted by the leaning faces).
  A careful player dusts no more often either way (a 2 and a 4 stay 1 in 6); scores move (about 22 and
  16 on average) and to port no 24 is possible. On screen: the plaque under Roll, always aboard (`SeaPlaque`,
  `HintLine`: a little ship leaning and rocking, this round's sea and the next's; over the tip, and taking
  turns every 3.5 s with an ability's plaque, `useTakingTurns`; a header chip sat over the bust, the user's
  call, 9 Nov), the
  dice drifting to the low side as they land (`diceRolled.sea` → `simulateRoll`'s `lean`: gravity leans,
  `LEAN_PULL`, and they're thrown toward that side; only the look), and the deck lurching as the list
  changes (`table.seaLurchAt`, cameraMoves). Rolling the whole view was left out (the paintings' edges
  would show). Dev: `/sea?now=starboard&next=port`. Next (the brainstorm's order): the Squall and the
  Rogue Wave, St Elmo's Fire, Fog; the player's say (Compass, Spyglass, Yvesil's forecast, a Ginger Thonic);
  choosing a course; events aboard.
- **Ability paintings (26 Oct, the user's):** an ability with a painting is a scene of its own: a
  stage in its colours over the whole screen (`.ability-stage`, solid underneath: the tavern and the
  bust behind it overlapped the painting, the user's call), motes of light rising, the painting
  pushing slowly in, the banner below it (on phones on their side the painting left, the banner
  right), 1.85 s like every moment (turning light rays behind the painting); not when a Clear-Eye cancels it.
  So far Mind Whip, You are Cursed, Sympathy for the Devil, Disguises, Back of the Head, Inkfire
  Brand, Flourish, Astral Flood, Reach Around, Written in the Stars, since 27 Oct Jaguar's Smooth Talk and The Cloak, since 28 Oct the Ridgeler's Divine Smite, and since 9 Nov Starry Form, Penitent Stare, The Ace of Spades and All In: every ability has one now (`ABILITY_ART` in Hud,
  `art/ability-<id>.jpg`, cut out with `holes` seeds for enclosed pockets; `cutOutFlat` also has
  `minPiece` (keep a flying die), `trails` (see-through streaks; a list for several colours), `fade` (fades out where the painting itself crops the character), `soften` (a fading
  edge), `glow` (a bright flame over the background keeps its own warm colours, see-through by brightness; Divine Smite's hammer) and `smokeMinBlue`). Since 28 Oct an ability's screen shows only its name (keepsakes and Thonics keep their lines); Astral Flood's stage has its painting's aurora and stars (`.aurora`, `.twinkle`). Every character's text is listed in `docs/character-text.md` for the user to edit. Brodor's bust is a new painting since 26 Oct (the first is
  `art/bust-brodor-v1.webp`); so is Jaguar's since 27 Oct, his cloak faded where it runs off the painting (the first is `art/bust-jaguar-v1.jpg`). Martha's Disguises
  painting shows ~1.7 s, then the trick she copies with its own painting. Check new ones with
  `node test/ability-shots.mjs <dir> only=<key>` (plays the ability for real headless, holds the
  moment, shoots it at phone sizes and checks it stays above the rail; works with the pane hidden;
  dev `preview.ability(name, ability, more, hold)`).
- **Mystery Flavour** (4 Nov, the user's pick; `mysteryFlavour`, `MYSTERY_FLAVOUR`): Martha's drop
  now, her own Elf Bar. A keepsake (not on the shelf): it never runs out, one puff a fight, and each
  fight it tastes of one of Johnny's four at random (`run.mysteryFlavour`, drawn as the fight
  starts; `mystery: { flavour, ready }` in the state). The `puffMystery` handler and the shelf's
  Elf Bars share `elfPuff` in server.js. On the strip (`MysteryKeepsake` in Hud) it lights when the
  flavour could be puffed, and a tap shows
  "Puff"; its moment is `keepsakeActivated` with `who: "Martha's Elf Bar"`, `mystery: true`, `id`
  `mysteryFlavour` and `flavour`. The user's painting of Martha's brass vape with violet smoke
  (`art/keepsake-mysteryFlavour.jpg`, painted on lime green: `cutOutFlat`'s `green` option, new 4
  Nov, with a green despill that fades the smoke's edge) shows on the strip with a dot in the
  fight's flavour's colour (`.flavour-dot`). Old saves carrying the mask get it (`OLD_DROPS`). The
  simulator doesn't know it.
- **Martha's mask** (`marthasMask`; Martha's drop until 4 Nov, nothing gives it now, its code
  stays dormant): once a fight, in a round with no effect yet, wear Danhausen's Curse (before you roll) or the Duke's Devil
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
  Perfect ...4? is four boxes in a row (`.what-row`): nested in the gradient-filled word, the "..."
  was drawn over the P on the user's phone (3 Nov). The round result toast sits in the middle of the
  felt too (`.toasts.felt`, 3 Nov), other toasts higher up.
- **Three 6s (23 Oct, the user's):** whenever a throw lands three 6s (`diceRolled.devil`, any
  table, anyone's throw) fire surges up the screen, the user's painting of the devil holding three
  6s rises (`art/devil-sixes.jpg` → `devil-sixes.webp`; the fire sheet, `.devil-surge`, fades at
  both edges: a hard bottom edge showed as a dark line climbing the screen) and a banner says "Devil's titties" (the
  sound is `DevilsTeets.wav`). `DevilSixes` in Hud, `showDevil` / `snapshot.devil` in game.ts,
  `DEVIL_MS` 1.5 s (the user's, was 2.8); taps go through to the dice, the next moment waits. Not after the Devil ability's own forced three 6s (the Duke, Martha as him, your mask: `turn.abilitySixes` → `diceRolled.devil` false; the user's call, 28 Oct). Dev:
  `preview.devil(who, hold)` (hold keeps it up, for stills). Since 24 Oct a **living painting**
  (`LivingPainting.tsx`, a small WebGL shader on its own canvas, a fresh one per showing): the
  flames sway and flicker, a heat shimmer, a slow breath, the green pips pulse, a glint in each eye
  (`DEVIL_EYES`); which parts move comes from `devil-sixes-mask.webp` (`livingMask` in
  process-art.mjs: red wide flames, green pips/eyes, blue tight flames). Without WebGL, the plain picture.
- **An opponent's entrance (23 Oct; since 5 Nov, the user's, until it's tapped):** `OpponentCard` in Hud shows where, who, their hearts, `blurb` and each of their `powers` (name, painting from `ABILITY_ART`, what it does; both in `TAVERN_ENCOUNTERS`; the classic page's `intro` is made from them), and the `i` on the nameplate opens the same card. At a fight's start the server sends the new opponent before the round's abilities and puts the entrance on its moment clock (`INTRO_SHOW_MS`); the browser holds its queue while the card is up (`queueHeld`), so abilities and the first throw wait, and the tap (`actions.dismissIntro`) sends `introDone`, which moves the server's clock to match. Test scripts set `localStorage.tavernIntroAuto` (dev only) to have the card go by itself after 4.5 s (Martha's entrance and disguise used to run together). Thom greets you "Vim, vigour, vitality!" on your first visit
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
- **Item icons (29 Oct, the user's paintings):** the six Thonics are painted bottles (`art/thonic-<id>.jpg` → `client/public/art/thonics/<id>.webp`, 320 px square icons via `cutOutFlat`'s `icon` option; `PAINTED_THONICS` in Hud, `.bottle.painted`), on the shelf, Thom's cart and the drinking moment. So are the four Elf Bars (`art/elfbar-<id>.jpg` → `art/elfbars/<id>.webp`; `Vape` in Hud draws the painting with its puff dots, and the puff moment's flare shows it; `cutOutFlat` gained `redOverBlue` for Purple Haze's smoke on crimson). So are the eight keepsakes (`art/keepsake-<id>.jpg` → `art/keepsakes/<id>.webp`; `PAINTED_KEEPSAKES` and `keepsakeIcon()` in Hud draw them on the strip, the Stranger's cards, Thom's back shelf, the invitation and the keepsake's gold burst; `.item-art`). So are the blessing and song icons (the Lady's Grace, Cutting Words, Inspiring Song, Sworn to Kram; the same folder and `PAINTED_KEEPSAKES`; the candle's cyan glow uses `glow`'s `colour: 'light'`). Every item icon is painted now.
- **The Lady's Grace and the Bard's songs (3 Nov, the user's call)** play like a Thonic drunk: their
  painted icon rises big in a glow of its colour and sways, with sparkles (the Lady) or notes (the
  Bard), over a parchment label (`moment.blessing`, `.blessing-moment`, `--liquid` per id).
- **Headless stills of moments:** `test/shots.mjs ... moment=perfect4|grace|bard hold=900` holds a
  moment at 900 ms (frozen clock and animations); `frames=70,100` saves frames of the table's own
  motion for an animation; `dice=<id>` shows a set.
- **A Thonic drunk (28 Oct, the user's call):** its own bottle, big, pops its cork and tips up in a glow of its colour with bubbles rising (`.potion-moment`, `moment.thonic`), over its name on a parchment label edged in that colour (`.potion-<id>` sets `--liquid`); no "Thom's Thonics" line.
- **The plaque under Roll (5 Nov, the user's):** a round's ability or the hot tub's surge shows as `.round-plaque`, one slim line (its name and what it does, a rim in its colour; `roundEffectHint` in Hud). A Tavern Crawl keeps 26 px for it (`.hint.crawl`) all fight, so the table doesn't move when one comes or goes.
- **Who you've met (3 Nov, the user's call):** on the run-over screen's line of opponents, one you
  have never sat down with, in any run, shows as a gold "?" in a dark frame (`.unknown-face`; only
  there: the spot cards between fights keep their faces, the user's call). Kept by player name
  (trimmed, lower case; `playerKey`), across runs and devices: the server's `meet(room, id)` as an
  opponent sits down (`resetTavernEncounter`), `loadMet` as a player joins a Tavern Crawl,
  `tavernRun.met` in the state, `encounterIds` in the run-over summary.
- **Keepsakes on screen (21 Oct):** small round icons beside your chip (`KeepsakeIcon`,
  `KEEPSAKE_ICONS`), dimmed once spent this fight (`ONCE_A_FIGHT`). A tap on any item there, keepsake, blessing, song, Thonic or Elf Bar, opens its info panel (`ItemInfo` in Hud, 6 Nov, the user's; it replaced a toast and the shelf's "Drink?" second tap), with its Drink, Puff or Throw again button when it can be used now. When one works, `keepsakeActivated` is a takeover moment with a gold burst of its icon
  and a synthesized chime (`playChime`); the Shield's is a force-field dome over the table
  (`.forcefield`), its line "Shield protects a life." The Lady's Grace moment shows only its name and "♥ saved" (no
  "Shrine to the Lady" over it since 4 Nov, the user's call).
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
  the opponent's portrait (Sperm McGrath says "Alright then, in you go" in a bubble under his, `WON_LINES`, 5 Nov), the gold for the win and for each heart left, one line at a time with
  the user's coin tally (once for the win, once per heart left), Tavern Crawl Victory as it opens, the purse counting up, then "Next" (`lastWin` carries
  `place`, `gold.heartsLeft/perHeart/perPlace` and `at`; shown once, `localStorage.tavernWinSeen`;
  not after a resume). The event scenes show only the purse now.
- **Money (since 23 Oct, the user's calls: nearer D&D's prices, all in whole gold):** a tenth of
  the old amounts (`Rules.formatGold`, client `coins()`): 10 x the opponent's place per win
  (since 28 Oct 10 for the first opponent and 2 more for each after: `gold.winFirst`, `winStep`; Jaguar 36), 2 a heart left, Healing 11, the Shrine 10, a soak 5. **Prices rise**: each
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
  around fight 3, `balance/experiments/keepsake-when.js`; `buyKeepsake`, `pickThomKeepsakes`; since 30 Oct also the Miser's Purse, Gambler's Charm and Bottomless Flask, and the Loaded Die at 12). A shelf holds up to 2 (`shelfSize`, the user's call, 18 Oct), carried
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
  fork in the road" in later places). Spots are drawn at random from the place's `spots`
  (since 30 Oct: the Ghoul and Gourd Thom, the Shrine, the hot tub, Johnny Elf Bar; the Yawning
  Portal Thom, the Shrine, the Bard, Johnny; the Salty Swallow Thom, the Shrine, Johnny, and since 6 Nov Jorvash and Yvesil; events:
  Darren at the Ghoul and Gourd, the Cult of Kram at the Yawning Portal, none of its own on the ship):
  Thom's cart (opens `ThomShop`), the Shrine to the Lady (light a candle: a blessing at random,
  her Favour, the next fight on 5 hearts, or her Grace, `ladysGrace`, the next dust that would
  cost a heart doesn't, kept until used; `blessingUsed` event; not given twice),
  the Dice Den (out of every place since 28 Oct, the user's call; its code stays: bet 5 or 10, only the bets the purse covers are offered, and below 5 gold the
  Den isn't one of the spots; then the player taps to roll two dice and the gambler rolls two;
  higher total doubles the bet, a tie rolls again). **A random event, then the spots** (21 Oct; from 18 Oct the event was the
  whole walk): after the thief, the Stranger or Darren, "Look around the tavern" (`lookAround`)
  brings the two spots, or "Or challenge X right away" skips them. The random events: about 1
  walk in 4 a **pickpocket** strikes first, at most twice at any one place (`pickpocketMaxPerPlace`, `run.thieves`; 4 Nov, the user's call): roll one die, a 4+ catches the thief
  (`pickpocketCatch`; the text says "to spot them"), else they take half the purse (a quarter until 21 Oct). Else, 20% of the
  time (`strangerChance`), the **Hooded Stranger** finds you (a random event since 19 Oct, no
  longer a spot): one of two keepsakes, the next fight a heart short (on 2), or turn him
  down; only while keepsakes remain (`startInterlude`, `strangerOffer`). The Lady's Favour adds
  to whatever the next fight starts on (so it stacks with the Stranger's price). The choice screen
  is headed "Make your choice"; "Or challenge Klarg right away" (the next opponent's name)
  skips both spots (it's all at the one table, so the wording is "Challenge", never "walk").
  The **Wild Magic Hot Tub** (shown without "The" since 27 Oct; a spot at the Ghoul and Gourd only, the user's call 21 Oct; 5 gold a soak, `hotTubPrice`; the Shrine's candle 10, `shrinePrice`; both rising with each visit; neither is offered when the purse can't cover it): climb in and a wild surge
  is picked by weight (`hotTubSurges`): one of your dice (`hotTubDie`, aqua on the table,
  `materials.tub`) next fight never rolls a 1 / keeps the better of two / only rolls 4-6 / always
  lands on 6 / never rolls a 6, or Pruney Fingers, the next fight a heart short
  (`nextFightSurge` → `tubSurge`, `rollFaceFor`; a badge under Roll). Double Bubble's losing roll
  rises from the die as a fading ghost die (in a cursed round it keeps the lower roll) (`turn.ghosts` → `diceRolled.ghosts` → `TwinGhost`, one per ghost; its glow animations keep the same filter list at every keyframe, or they snap: the "flash" the user saw). A soak averages about +1-2
  points of the next fight (`balance/experiments/hot-tub.js`). **Darren Snakehands**, the Ghoul and
  Gourd's barman (`PLACES.ghoulAndGourd.events`), finds you ~15% of walks when no thief or
  Stranger did: roll one die; 1-2 a Thonic on your shelf smashes (an empty shelf: 2 gold for
  the glass), 3-4 a free Thonic, 5-6 a Thonic and 5 gold (a full shelf: 3 gold instead,
  `darrenOutcome`). The hot tub and the Shrine have the user's sounds (27 Oct): their own ambience loops while the scene is up (`startSceneAmbience` in sounds.ts, `HotTubAmbience.mp3` / `LadyIntro.mp3`, under the music switch, the tavern music fading down meanwhile, fetched only when the scene opens), then `HotTubGood.mp3` or `HotTubBad.mp3` (Soggy Die, Pruney Fingers) for the surge and `LadyChoice.mp3` for the blessing. Both have the user's paintings (since 20 Oct; `hot-tub.webp` is wide, sized by width).
  **The Yawning Portal's own** (28 Oct, the user's; numbers in `interlude`, first guesses):
  **the Bard**, a spot there only (`bardPrice` 8, rising): pay for one of two songs for the next
  fight (`bardPick`, `run.nextFightSong` → at the fight's start `run.song` / `run.cuttingWords`).
  **Cutting Words**: the opponent's first hand that counts that fight scores `cuttingWords` (3) less,
  once, not in a cursed round (in `performEndTurn`, after the Ace). **Inspiring Song**: right after
  your first throw of the fight, before you keep a die (a Mind Whip die may stay kept), the 🎶 on
  your strip lights up; tap it, then "Throw again", and every die in play is thrown again, once
  (`inspiringSong`, `Rules.rerollActive`, `throwAgain` shared with Fizzy; `run.song` is 'ready',
  then the first throw's turn key, gone at the next throw). Both moments are `keepsakeActivated`
  with `who: 'The Bard'`, and play the user's `BardTune.mp3` (3 Nov, 1.7 s). On upright phones the
  Bard (and since 3 Nov the Cult of Kram, sized by the screen's width as they are two) stands behind the counter like Thom and Johnny (`.spot-scene.bard .thom-figure`; drawn whole
  and smaller he floated above it). **The Cult of Kram**, an event there (`kramChance` 15% of walks no
  thief, Stranger or Darren found; not while sworn): swear fealty (free) and your dice never land
  on 1 for the next `kramFights` (2) fights (`run.kramFights` → `run.kram` per fight, in
  `rollFaceFor`; saved with the run), or refuse; then "Look around" as after any event. The strip
  shows 🗡️ Cutting Words, 🎶 Inspiring Song and 🔱 Sworn to Kram while they last. Paintings
  `art/bust-bard.jpg`, `art/bust-kram.jpg` (`SPOT_PORTRAITS` bard, kram). Their scenes loop the user's `ThreeStrings.mp3` (the Bard, volume 0.5) and `Cult.mp3` (Kram, 0.8) like the hot tub's (`startSceneAmbience`).
  Each spot (and the pickpocket) is a full scene built on Thom's (`SpotScene`: the character
  rises in their own light with a speech bubble and reacts to what happens, sign + counter;
  the Shrine's painting is its stage). **On wide screens (landscape, taller than 500 px; 4 Nov, the
  user: Thom and the thief floated, badly cut out)** each character stands behind a walnut counter
  with a brass rail across the bottom of their stage (`.thom-stage::after`), sized to the stage in
  container units (`--fig-h` 88cqh, per spot; `--sink`), and the side a painting crops fades out
  (Thom's right, the Cult's two sides; measured from the cut-outs' edges); not the hot tub or the
  Shrine. The speech bubbles are parchment in a dark-wood rim, Alegreya italic, with a tail at the
  bottom left; on wide screens each sits above and right of its speaker's face (`stageVars` in
  Hud passes the portrait's `face` and `aspect`), on phones in the stage's top corner as before.
  Thom's back shelf keeps what each keepsake does on a short computer window (only short phones
  hide it). `test/shots.mjs` takes `scene=<control>` (e.g. `between?stage=bard`), `pick=<spot>` and
  `name=` to shoot these scenes; `previews/scenes/shoot.sh` (gitignored) shoots them all. Their dice are 2D (`Die` in Hud: red 1, green 6) with
  the real dice sound (`simulateRoll` impacts). Gold won or lost here is
  `stats.eventGold` ("Between fights" on the run-over screen). Numbers set by simulation.
  Each spot has painted art in a round frame (`SPOT_PORTRAITS`); the Lady is the goddess of
  sailors. Game text calls the pickpocket "the thief" (no assumed gender).
- **Keepsakes:** from the Hooded Stranger (a random event, for a heart) and, since 21 Oct, for gold
  on Thom's back shelf (two you don't have each visit). Nine since 30 Oct (plus the two bosses'
  drops). Gold each adds to a run when bought before fight 3, and its price
  (`balance/experiments/keepsake-when.js`; bought later each is worth less, as most runs end in
  the Ghoul and Gourd):

  | Keepsake (id) | Effect | Worth at fight 3 | Price |
  |---|---|---|---|
  | Shield (`bentCopper`) | once a fight, the first life you'd lose isn't | ~31 | 30 |
  | Velvet Cushion | once a fight, losing by exactly 1 is a tie | ~16 | 15 |
  | Trap Card (`luckySeat`) | once a fight, your first tie counts as their loss | ~16 | 15 |
  | Thom's Loyalty Card | Thom always one of the spots; first Thonic each visit free (`shop.free`) | ~14 | 13 |
  | Potion Belt | shelf +1 slot (`beltSlots`), comes with a Healing (`beltThonic`) | ~15 (mostly the Healing) | 13 |
  | Loaded Die | die 0 (`LOADED_DIE`) lands only on a 2 or 4 until you've kept both, then 4-6 (`loadedDieLow`; reworked 30 Oct, `playerFace`); old gold on your turns | not yet measured | 12 |
  | Miser's Purse (30 Oct) | each win pays 1 more gold for every 10 in the purse (`miserPerTen`; `lastWin.gold.miser`, a row on the fight summary) | not yet measured | 12 |
  | Gambler's Charm (30 Oct) | the last die left to throw is thrown twice, the better kept (a needed 2/4, else higher; lower in a cursed round), the other a ghost (`rollFaceFor`) | not yet measured | 14 |
  | Bottomless Flask (30 Oct) | the first Thonic drunk each fight stays on the shelf 1 time in 2 (`flaskChance`; `encounterKeepsakeUses.bottomlessFlask`) | not yet measured | 12 |

  **Since 30 Oct (the user's calls):** at most `maxKeepsakes` (5) carried (`pocketsFull`: Thom's back
  shelf says "Pockets full", the Stranger stays away); the Shield and the Loaded Die are only
  offered from the Yawning Portal on (`from` on each keepsake, `unownedKeepsakes`); a boss's keepsake
  is no longer automatic: the invitation offers it to take or leave (`claimDrop`, `interlude.claim`
  'open'/'took'/'refused', `run.refusedDrops` saved with the run), and with full pockets taking
  it means choosing one of yours to leave behind. The three new ones have the user's paintings (`art/keepsake-<id>.jpg`, same folder); prices are first guesses, not yet simulated.
  Numbers in `shared/balance.js` (`keepsakes`, `keepsakePrices`, `thomKeepsakes`). Jaguar's drop
  waits for a second place.
  The old keepsake-cards code (`offerKeepsakes`, `KeepsakeCards`) is unused. The classic page
  at `/` walks straight on (its `leaveShop`), so it never sees the spots; the user is fine
  with that until the switch-over.
- **Elf Bars (28 Oct, the user's; no side effects, the user's call):** magic vapes sold by
  **Johnny Elf Bar**, one of Frak's street urchins, a spot at the Ghoul and Gourd and the Yawning Portal (not the ship, since 9 Nov) (`elfKid`, painting
  `art/bust-elf-kid.jpg`; offered when the purse covers the cheapest). They sit on the Thonic
  shelf (`THONICS` entries with `elf: true`) with `elfBarPuffs` (3) puffs each, at most one
  puff a fight (`run.puffs`, `run.puffed` reset at a fight's start; saved with the run); the last
  puff empties it; one of a kind on the shelf (`buyElfBar`). Prices in `elfBarPrices` (first
  guesses, rising like Thonics): **Purple Haze** 12 (after a throw showing a 1 while you still
  need a 2 or 4: that 1 tumbles onto it), **Cotton Candy Cloud** 9 (on your turn while the
  opponent is still to throw: `run.cloud` for the round, `getTavernScoreToBeat` returns
  undefined so they play for their best; a badge), **Lemon Levitation** 8 (after a throw, before
  a keep: `turn.freeRoll`), **Watermelon Hindsight** 14 (`Rules.redoThrow`: the last throw's dice,
  `turn.lastThrown`, any kept since put back, thrown again). Puffed through `drinkThonic`; the
  moment is `keepsakeActivated` with `who: 'Elf Bar'` and the user's `Vape.mp3` (4 Nov; it borrowed Martha's puff before). Jaguar's Smooth
  Talk never takes one. The shelf draws them as slim vapes with a dot per puff (`Vape` in Hud). Since 29 Oct Johnny is framed like Thom (big, cropped at the counter), and on upright phones his four Elf Bars are compact rows (`.elf-cards`) so his stage stays as big as Thom's.
- **Known limits:** if your last die lands on a 1 it is kept at once, so Fizzy can't reroll a
  single last die (Second Thoughts can reopen the hand).

## Next steps (in order)

1. **Play the Salty Swallow on a phone** (everything up to 9 Nov is pushed and on the test site): the ship's new
   abilities and crew, Yvesil's and Jorvash's round portraits (first guesses; the Portraits tab), whether the floating
   constellations over Starry Form's dice should stay on top of the night-sky faces, and the intro's last scene
   after the 6 Nov fix. Yvesil's pronouns aren't settled: the scene text says "her" (`docs/character-text.md`).
2. **The intro film, by ear and eye** (built 5 Nov): the user watches it and tunes the sound mix and timing; a narrator's voice if wanted (`IntroLine1.mp3` to 5; the prompt is in `docs/art-direction.md`, with the user's final words).
3. **The Salty Swallow sets sail** (brainstormed 4 Nov; the crew is built, the voyage isn't): the ship leaves port during
   its four fights, with environmental effects instead of the thief and the Stranger. Jorvash and Yvesil are built (6 Nov); Skipper Bren was discussed in place of Johnny aboard and left out for now (the user, 6 Nov); a smaller Shrine to the Lady was mentioned. Their paintings are wanted (`docs/art-direction.md`). Ideas offered: weather that hits both sides shown as a badge, a voyage in stages (casting
   off for Klarg, a clear starry night for Rokr, a squall for the Hangman, the eye of the storm for Jaguar), the
   Swell tipping a die to a neighbouring face, Yvesil selling the forecast or turning the wind, the Galley's stew
   giving sea legs; events like a wave over the deck, flotsam, gulls, seasickness. To decide: both sides or only
   the player, a fixed voyage or random weather. The ship's other ability names are still working names (Smooth Talk, the Cloak, All In).
4. **Small things waiting on the user's word:**
   - Tavern Crawl's round result says "Dust: [name]" for whoever lost a life, even with a valid lower score.
   - The thief's button and result still say "catch" ("Roll to catch the thief"); the sentence above says "spot".
   - Leaving the Potion Belt behind for a boss's keepsake with 3 Thonics carried hides the third (read in the code,
     not reproduced): `claimDrop` doesn't trim the shelf, and `Shelf` draws only `shelfSize` slots.
   - `Whoa.mp3` is off until the user reworks it (`WHOA_ON`).
   - The Dirty 20! colour (`#c5d04a`) hasn't been seen by eye; a sound for it, and for Astral Flood's wave, if wanted.
5. **Play-test and set the numbers** (the user plays, then decides; simulate first with `balance/`): the Ghoul
   and Gourd's new lives; the Duke's `devilWhenBelow` (0.7); the keepsake prices (Miser's Purse 12, Gambler's Charm 14,
   Bottomless Flask 12, the reworked Loaded Die 12) and whether the Miser's Purse needs a cap; the Elf Bars (8-14); the
   Bard (8); the Cult (15% of walks, 2 fights); uses per fight for the Yawning Portal's five (1 each, Stason 2).
   Then difficulty overall: the simulator says the game is hard (0.3% finish) but the user finds it easier; options
   measured in `easier.js`, `tournament-lives.js`. The simulator doesn't know Mystery Flavour (and no longer wears a
   mask), the Elf Bars, the Bard, the Cult, the new keepsakes, the two-thief limit, the Duke's `devilPlan` or Astral Flood
   taking a heart: teach it before trusting its numbers.
6. **The user's art and sounds waiting:** music and
   ambience from Udio; optional repaints of the Potion Belt and the Sunglasses (thin at 26 px). Dice sets for the
   Yawning Portal's and the ship's opponents if wanted (add each id to `DICE_SETS` and `PAINTED_DICE`).
7. **Keepsakes, more** (workshopped 30 Oct, not chosen yet): Lodestone, Spyglass, Hangman's Spare
   Bullet, Devil's Bargain, Brawler's Knuckles, Sigil of Kram, Rokr's Star Chart, Witch's Mirror,
   Sailor's Compass, Gold Tooth. A keepsake pool per place was offered and not taken.
8. **Opponent abilities** (ask first): a warning on the nameplate before an ability fires.
9. **The look, more** (listed in the visuals plan's "What's left for the look"): living
   backdrops (the fireplace, candles and the Portal's well flicker, by a mask like the devil
   painting's); light for each place (cool well light at the Yawning Portal, swinging lanterns on the
   ship, which belongs with step 3) and music per place; more camera moves if the user likes the first ones (a lurch
   for Klarg's steal, a thud as a heart is lost); on a computer's multiplayer table the cards could move up into
   the header. Check the frame rate on the user's PC and phone after the 3 Nov speed-ups (`?tune=1`); if Auto quality
   drops a good phone to Low, tune its threshold (`noteFrame`); feel: dice sound, roll length (~2.2 s), camera on other phones.
10. **Check the database across a deploy:** `DATABASE_URL` has been on the Render test service since 4 Nov (the user
    added it), and Kram's row went in by script, but nobody has yet confirmed on the site that the leaderboard and
    the JUGS league survive a deploy.
11. **Ship to `main`:** prepare a PR from `phase-2-3d-prototype`; set the live service's build
    command to `npm install && npm run build`, a `SAVE_SECRET` and `DATABASE_URL`; the user merges (that deploys
    the live game); then delete the test service. Old saved runs won't open (money changed); the
    live leaderboard's old gold entries count as points.
12. **Switch over:** once `/next` beats the classic page everywhere, serve it at `/` (keep the
    classic page reachable for a while; until then it skips Thom and the events, which the user
    accepted), update the PWA manifest/service worker, retire the old client code in
    `public/index.html`.
13. **Later / nice to have:** Jaguar's keepsake drop (once there is a place after the ship); new
    places with tougher opponents (the roguelite); delete unused code (the Dice Den if it stays
    out, the old keepsake cards `offerKeepsakes`/`KeepsakeCards`, `Rules.getAbilityMaxUses`,
    `shareFlame`, the unused `--flame` CSS variable, the old Constellation Blur, the synthesized
    cork pop, Martha's mask if it stays out); a smaller first download (lazy-load three.js, compress the 9.5 MB
    ambience track); spectator mode; find why a few server tests fail now and then in a full run (Inspiring
    Song, Rokr's stars, Clear-Eye: each passes alone, and they did before these changes too).
