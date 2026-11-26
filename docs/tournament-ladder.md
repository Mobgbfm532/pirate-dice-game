# The tournament ladder: a map with forks, and elite fights (24 Nov, a design)

The user's ask: "Map out in great detail, with great effort and with great diligence what the map with forks plus elite
fights would look like given the tournament conceit of the game." This is idea 2 + 3 of `docs/roguelite-brainstorm.md`,
worked out. Nothing is built. The numbers here are first guesses, to measure with the expert (`balance/expert-crawl.js`)
before the user sets them.

## The idea in one paragraph

Each house of the tournament (the Ghoul and Gourd, the Yawning Portal, the Salty Swallow) keeps **a ladder**: a board
on its wall showing the rivals you could face on the way to the house champion. You can't face them all. After each
fight you choose **which table you sit down at next**, from the ones your path leads to. Some tables are **High
Stakes**: a stronger rival who puts a keepsake of your choice on the table, and who **counts for two rounds of the
ladder**, so you skip a fight. The champions stay where they are (Martha, Brodor, Jaguar), and so does McGrath at the
door. Every crawl takes a different path, meets a different set of rivals, and builds a different set of keepsakes.

## Why this fits the tournament

The game already says it's a tournament: McGrath "lets no one into the tournament who doesn't know the house game",
Martha's invitation says "You qualify for the Yawning Portal", Jaguar is "the last of the fifteen". A real tournament
has a draw, a bracket, byes, grudge matches and high-stakes tables. That vocabulary gives the map its words, so it
needs no new explanation:

| Roguelite term | The tournament's term | In the game |
|---|---|---|
| The map | **The ladder** (each house's board) | the chalkboard behind the Ghoul and Gourd's bar, the notice board by the Portal's well, Bren's chart aboard |
| A node | **A table** | a rival's portrait on the board |
| A fork | **Your draw** | the tables your path leads to next |
| An elite | **High Stakes** (the Ghoul and Gourd) / **a Grudge Match** (later) | a stronger rival, a keepsake staked, two rounds in one |
| The boss | **The house final** | Martha, Brodor, Jaguar |
| A skipped fight | **A bye** | what a High Stakes win earns you |

## How a house plays

```
   THE GHOUL AND GOURD                        (the chalkboard behind the bar)

   The door         Round 1          Round 2              Round 3          The house final
   ────────         ───────          ───────              ───────          ───────────────
                  ┌─ Frak ─────────┬─ Danhausen ────────┬─ Duke ─────────┐
   McGrath ───────┤                │                    │                ├──── Martha
                  │                └─╔══ DUKE ═════════════════╗ (bye)   │
                  │                  ║ High Stakes: 2 rounds   ║─────────┤
                  └─ Danhausen ──────╚═════════════════════════╝         │
                                   └─ Frak ─────────────┴─ Duke ─────────┘
```

(The drawing shows the shape; the real board is the user's painting with portraits on it.)

1. **The door:** McGrath, as now. He's the teacher; every crawl starts with him.
2. **Three rounds:** each round you sit at one table that your path leads to. A board has 2 or 3 tables a round, and
   each table leads on to 1 or 2 tables in the next round, like a bracket.
3. **High Stakes** tables are tall: they span two rounds. Win one and you skip the next round (a bye).
4. **The house final:** every path ends at the champion. Win, and the invitation comes, as now.

So a house is 3 rounds plus its final: **4 or 5 fights in the Ghoul and Gourd** (with McGrath), **3 or 4 at the Portal**,
**3 or 4 aboard**. A whole crawl is **11 to 13 fights** (15 today). See "Numbers" for keeping 15.

### What you see on the board

Every table on the board shows, before you choose:
- the rival's portrait, name and hearts (as dark gold-rimmed hearts, the game's own);
- their ability's painting as a small icon, with its ✦ marks (or Áéd's gems); a tap opens their entrance card, the
  same card as today's "i" on the nameplate, so you know exactly what you're choosing;
- **the purse**: the gold the win pays (as today, it grows with each round);
- on a High Stakes table: a red ribbon, the stake (three keepsake icons: "Win: choose one"), and the two rounds it
  covers;
- aboard: **the sea for that table** (the rival's sea die dial, small): calm for Klarg, Becalmed on Røkr's 2-3, the
  Hangman's storms. Choosing a table aboard is choosing a course (the voyage brainstorm's "choosing a course", which
  was still to be built).

Tables you've passed are chalked over (beaten) or rubbed out (a road not taken). Rivals you never faced in this crawl
are "knocked out" by someone else: a chalked line on the board ("Danhausen: out, to Frak"), so the tournament seems
alive around you. Rivals you have **never met in any crawl** show as a gold "?" silhouette with their name (as on the
run-over screen today): you know who, not what they look like, until you sit down with them.

### When you see it

The flow between fights changes in one place: **you choose your next table before the walk**, so you shop knowing who's
next (a Clear-Eye bought for the right ability, a Healing before the Ridgeler).

```
  win → the fight's summary → THE LADDER (choose the next table) → the walk (event / two spots) → the fight
                                                                     "Or challenge Frak right away"
```

- **Arriving at a house:** after McGrath's line at the start, after the walk to the Portal, after Bren and the
  sailing: the board appears, the house's rivals chalked or pinned on one by one (2-3 s), then your choice.
- **After each win:** the board again, your marker moved on, then your choice.
- **After a High Stakes win:** the board shows the bye (your marker jumps a round), then your choice for the round after.
- **Before the final:** no choice to make; the board shows the champion's table and "The house final", then the walk.
- **The header menu** gets "The ladder", to look at the board any time (no choosing).

### The three boards (the user's paintings)

1. **The Ghoul and Gourd: a chalkboard behind the bar.** McGrath chalks the names; beaten rivals are struck through with
   a chalk line; High Stakes boxed twice in red chalk. Sound: chalk scraping.
2. **The Yawning Portal: the tournament notice board by the well.** Parchment notices pinned up, one per rival, with a
   wax seal for High Stakes; a beaten rival's notice is torn down; the well's light from below. Sound: a pin pushed in,
   paper tearing.
3. **The Salty Swallow: Bren's sea chart.** Each table is a waypoint on the chart, the course drawn in ink between
   them, the sea for each leg as a small dial. A Grudge Match is a black flag. Sound: a quill scratching, the chart
   unrolled.

On an upright phone the board runs **bottom to top** (the door at the bottom, the champion at the top, as climbing a
ladder), scrolling if it must; on a computer or a phone on its side, left to right. Tables are round portraits (the
`SPOT_PORTRAITS` frames), 64-72 px on a phone, every one a 44 px tap target or more.

## High Stakes and Grudge Matches (the elites)

### Who they are

- **The Ghoul and Gourd: High Stakes.** One of the house's own rivals (Frak, Danhausen, the Duke) at the high-roller
  table. (The game's comment on the house already calls it "the high-roller table".)
- **The Yawning Portal and the Salty Swallow: Grudge Matches.** A rival **you beat earlier in this crawl, at the house
  before**, back for revenge: Frak at the Portal, the Ridgeler aboard. It's how tournaments work (the repechage: a
  knocked-out player buys their way back in), it brings back faces the player already knows, and it costs no new art.
  If you haven't beaten anyone suitable (impossible today, since every path beats at least two), the house's own rival
  plays High Stakes instead. Bosses never come back as Grudges.

A Grudge rival plays in the house they've come to: Frak aboard faces the sea die like everyone at sea (his dial: the
calmest, Klarg's, a first guess).

### How they're stronger (one rule to explain, the same everywhere)

> **High Stakes: one more heart than the house's rivals, their ability once more a fight, and they play their best.**

- **One more heart:** Ghoul and Gourd High Stakes on 3 (the house's rivals are on 2), Portal Grudges on 4, ship Grudges on 4.
- **Their ability once more:** Frak's Mind Whip twice, the Duke's Devil twice, the Ridgeler's Smite twice, Klarg's Reach
  Around three times. Áéd: seven uses (one more gem).
- **Best play:** the Ghoul and Gourd's rivals play simply today (`planBotLocks`); at High Stakes or as a Grudge they play
  with the best-play brain (`shared/strategy.js`), as the Portal does. ("They've been practising.")

On screen: a red-and-gold rim on their portrait and nameplate, "High Stakes" or "Grudge Match" above the name on the
entrance card with the rule in one line, and their extra ✦.

### Why anyone would take one: the stakes and the bye

The trade must be real both ways. Today a lost fight ends the crawl, so fewer fights is safer: **a High Stakes table
should be about as hard to win as the two ordinary fights it replaces, together.** If a rival is beaten 75% of the time,
two in a row is 56%; a High Stakes table should land near 50-60%. Then:

- **The keepsake** is the reason to take it: **choose one of three**, shown on the board before you sit down (so you can
  aim for a pair: the Miser's Purse for your Gilded Die, the Trap Card for your Velvet Cushion, the Loaded Die for your
  Gambler's Charm). It's the only place in the game where you choose a keepsake from three; today they come two at a
  time at random (Thom's back shelf, the Hooded Stranger). With full pockets, it's a swap (the existing `SwapPicker`), or
  take its price in gold instead.
- **The bye** makes it no more dangerous than the road around it.
- **Gold:** the win pays both rounds' gold (the round it's in and the round it skips), plus the hearts left, plus interest.
- **Points:** both rounds' points (see "Numbers"), so a path through High Stakes never scores less than the road around it.
- **The walk:** you still get one walk after a High Stakes win (one walk, not two: the bye is a skipped fight, not a
  free shop).

So the choice is: two fights you probably win, or one hard fight that builds your run. Strong players will take them
for the keepsakes; careful players can avoid them.

### The stakes, exactly

- Three keepsakes you don't have, drawn when the board is made (saved with it, so reloading can't redraw them).
- Not the bosses' drops (Mystery Flavour, Brodor's Sunglasses), not Bren's Compass before the ship.
- A Grudge Match aboard may stake a **legendary** instead, if the user wants rarities later (idea 7 of the brainstorm).

## The board, built (how a board is made)

Each house's board is drawn as the house begins (the run's first fight, the invitation's "On to ...", the sailing),
from the crawl's own random draws, and saved with the run.

Rules the drawing keeps:
1. **Three rounds**, each with **2 or 3 tables** (2-3-2 is the usual shape; the Portal and the ship, with four rivals,
   can be 3-2-3).
2. Every table leads on to **1 or 2 tables** in the next round, and every table can be reached; lines never cross
   (they're drawn as a bracket).
3. **On any path, a rival appears only once.** The same rival may be on two branches (Frak in round 1 on one side and
   round 2 on the other), never twice on one path.
4. **Exactly one High Stakes table per house** (a first guess; two at the ship, if the user wants a harder end), in
   round 1 or 2 (it spans two rounds, so never in round 3).
5. **At least one path with no High Stakes**, so it's always a choice.
6. In the Portal and aboard, a path meets only three of the house's four rivals (two and a Grudge, through High Stakes),
   so every crawl leaves someone unmet there: that's the variety. Which one depends on the board and your choices.

For the Ghoul and Gourd's three rivals, every path without High Stakes meets all three in some order; a path through
High Stakes meets two. For the Portal's and ship's four, a path meets three of the four (two plus a Grudge, through
High Stakes).

### An example of each

```
 THE YAWNING PORTAL (the notice board)

   Round 1              Round 2                 Round 3            The final
   Vaelin ───────────── Stason ───────────────── Sylvester ──────┐
          └──────────── ╔═ GRUDGE: the Duke ═══════════╗ (bye) ──┤
   Ridgeler ─────────── ╚══ stakes: Charm/Loaded/Cushion ╝         ├── Brodor
          └──────────── Vaelin ───────────────── Stason ─────────┘

 THE SALTY SWALLOW (Bren's chart; each leg's sea shown)

   Round 1              Round 2                 Round 3            The final
   Klarg (calm) ─────── Røkr (becalmed 2-3) ──── Áéd (squall 3) ─┐
          └──────────── The Hangman (storms) ─── Røkr ────────────┤
   Áéd (squall 3) ───── ╔═ GRUDGE: the Ridgeler ═══════╗ (bye) ───┼── Jaguar
                        ╚══ stakes: Shield/Gilded/Flask ╝          │
          └──────────── Klarg ─────────────────── The Hangman ────┘
```

## What changes in the game (for building it)

### The fight order stops being a list

Today the crawl is `TAVERN_ENCOUNTERS[run.encounterIndex]`, 57 places in server.js and a few in the client. The ladder
needs the run to know **which house**, **which round** and **which rival**, and the rival to carry its High Stakes
changes.

- **Step 0, no change in play:** one function, `currentEncounter(room)`, used everywhere `TAVERN_ENCOUNTERS[...
  encounterIndex]` is today, and `fightNumber(room)` (how many fights in: gold and points use it). Tested to give exactly
  today's crawl. Every later step changes only these.
- `HOUSES`: for each house its door (McGrath, the Ghoul and Gourd only), its rivals, its champion, its rounds (3).
- `run.board`: `{ house, tables: [{ id, round, span: 1|2, who, stakes: 'high'|'grudge'|null, keepsakes, leadsTo }], at,
  path }`. `run.encounterIndex` stays as the fight count (saves, gold, points).
- `encounterView` takes the table's changes: hearts +1, ability uses +1, `smart` (best play), a name line ("High
  Stakes"), the rim.
- New socket request `chooseTable(id)`; the server checks it's one your path leads to. The interlude gains a stage
  `ladder` before the walk.

### Rules today that name a rival, to rename by round

| Today | With the ladder |
|---|---|
| Thom always offered after Frak (`thomAlwaysAfter`) | after the Ghoul and Gourd's round 1 |
| Thom once after Sylvester or Vaelin (`thomOnceAfter`) | once in the Portal's rounds 1-2 |
| No thief before Danhausen is beaten (`pickpocketAfter`) | no thief before the Ghoul and Gourd's round 2 is won |
| The walk to the Portal plays as Sylvester sits down; the sailing as Klarg does | as the house begins, whoever is first |
| Gold for a win: 10 + 2 per fight before it | 10 + 2 per round of the crawl (High Stakes: both rounds) |
| Points: 100 x the opponent's place | 100 x the round of the crawl (so a champion's points stay near today's) |
| `START_AFTER=<id>` (dev servers) | `START_AFTER=<house>:<round>`, and `/board?...` to set a board |
| "Your dice": everyone before the furthest opponent met counts as beaten (`beatenBy`) | only rivals truly beaten (`beat:<id>`, kept since 20 Nov); players keep what they've unlocked |
| The leaderboard's "Reached X" (last opponent in order) | still right: the last house and rival reached |

Unchanged: the champions and their invitations, the finale, Martha's Disguise Self (she copies Frak, Danhausen or the
Duke whether you met them or not), Klarg's grudge against Kram, Jaguar's music, the sea, every ability.

### Saves

The board, its stakes and your path are saved with the run (`SAVE_VERSION` 3; older saves start a fresh crawl, as
before when the money changed). A choice is final once "Take this table" is tapped, and is saved at once, so leaving
and continuing can't change it (as the fight saves don't let a fight be replayed, `docs/save-scumming.md`).

### The expert and the simulator

`balance/expert-crawl.js` must choose a table: the ordinary road by default; High Stakes when its stake completes a pair
or its rival is weak; a setting to always take or always avoid them, to measure both. The measurements to make before
setting the numbers:
1. Each High Stakes and Grudge rival's win chance against the two fights it replaces (target: within 5 points of the two
   together).
2. Whole crawls: how far an expert gets, and how often it finishes, with 3 rounds a house against today.
3. Gold over a run (fewer fights earn less; prices were set for about 415 gold a run, `docs/economy-brainstorm.md`).

### Tests

- The board's rules (every path reaches the final, no rival twice on a path, one High Stakes, a path without it, someone
  left unmet), for many random boards.
- `chooseTable` refuses a table your path doesn't lead to.
- High Stakes: the hearts, the extra ability use, the bye, both rounds' gold and points, the keepsake choice (and the
  swap with full pockets).
- Grudge: only a rival beaten this crawl at the house before; never a champion.
- A save made at the board opens at the board, with the same board.
- Step 0: the crawl with `currentEncounter` plays exactly as today (the existing tests).

## Numbers (first guesses, for the user to set)

| Number | First guess | Note |
|---|---|---|
| Rounds per house | 3, 3, 3 | 11-13 fights a crawl. 3, 4, 4 keeps today's 15 at most. Shorter helps players who find it hard. |
| Tables per round | 2-3-2 (the Portal and ship may be 3-2-3) | |
| High Stakes per house | 1 | 2 aboard for a harder end? |
| High Stakes hearts | the house's rivals' + 1 | the Ghoul and Gourd 3, the Portal and ship 4 |
| High Stakes ability | once more a fight | |
| High Stakes play | best | |
| Keepsakes staked | choose 1 of 3 | |
| Gold for a win | 10 + 2 per round of the crawl | High Stakes: both rounds' |
| Points for a win | 100 x the round of the crawl | High Stakes: both rounds' |

## In what order to build it

1. **Step 0:** `currentEncounter` and `fightNumber`, no change in play. Small, safe, all tests the same.
2. **The boards, ordinary tables only:** the three houses' ladders, choosing your table, the board on screen (drawn in
   CSS on the place's backdrop until the user paints the boards), saves. The Ghoul and Gourd first: most crawls end
   there (an expert leaves it about 1 time in 5), so it's where most players would see it.
3. **High Stakes and Grudge Matches:** the stronger rivals, the stake, the bye, the keepsake choice.
4. **The ship's chart:** each table's sea on the board.
5. **Measure and set the numbers** with the expert; the user plays it on a phone.
6. **The user's paintings and sounds** for the three boards, as they come.

## Open questions

1. **Rounds per house:** 3 each (11-13 fights, shorter), or keep today's length (3, 4, 4)?
2. **McGrath at the door:** keep him as every crawl's first fight (recommended: he teaches the game), or put him on the
   board too?
3. **High Stakes per house:** one, or more aboard?
4. **Never-met rivals on the board:** a "?" silhouette with their name (recommended), their face, or nothing at all?
5. **Grudge Matches:** a rival from the house before only (recommended), or any rival beaten earlier?
6. **The board's art:** the chalkboard, the notice board and Bren's chart are the user's to paint. Until then, a plain
   board drawn in the game's materials (dark wood, parchment, brass) on the place's backdrop?
7. **Showing difficulty:** the hearts and abilities only (recommended), or a danger mark (one to three skulls)?
8. **The names:** "the ladder", "High Stakes", "Grudge Match", "Take this table": the user's to change.
