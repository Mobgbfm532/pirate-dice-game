# Balancing the Tavern Crawl (step 4)

The numbers live in `shared/balance.js` (the server and the simulator both read them).

- `sim.js`: a fast offline copy of a Tavern Crawl (fights, gold, Thonics, events, keepsakes)
  on the real dice rules and opponents' play. ~2,500 fights a second. The player is
  "sensible" (best play, the same solver the opponents use, and sensible moments to drink each
  Thonic) or "casual" (the Molar's simple habits).
- `check-server.js`: plays real fights on the real server over sockets, to check the
  simulator: `node balance/check-server.js <opponent 0-4> <fights>`.
- `experiments/`: the measurements below (`node balance/experiments/<name>.js`).

## The result (19 Oct)

Whole runs, 20,000 each (`experiments/runs.js`):

| | finish the run | average gold (median) | runs ending at Molar / Klarg / Rokr / Hangman / Jaguar |
|---|---|---|---|
| before, sensible | 4.5% | 383 (200) | 26 / 40 / 14 / 8 / 7 % |
| before, casual | 1.8% | 235 (175) | 31 / 45 / 13 / 7 / 3 % |
| **now, sensible** | **21.7%** | **853 (694)** | 14 / 19 / 15 / 14 / 16 % |
| **now, casual** | **13.1%** | **555 (380)** | 19 / 24 / 20 / 13 / 10 % |

Targets: a good run finishes about 1 in 5; each opponent harder than the last; no single
wall; buying the right Thonic at the right time pays for itself in score.

## What changed and why

| | before | now | why |
|---|---|---|---|
| Player hearts | 3 | **4** | with 3, a near-perfect player beat Klarg 36% of the time |
| Opponents' lives | 2, 3, 3, 3, 4 | **2, 2, 3, 3, 4** | a steady climb: fight wins 86 / 72 / 59 / 55 / 42% (sensible, no items) |
| Healing | 120 | **110** | adds ~155 gold before the middle fights |
| Last Gasp | 250 | **130** | worth about the same as Healing (it waits until needed) |
| Fizzy | 80 | **20** | adds ~20 |
| Second Thoughts | 180 | **30** | adds ~30 |
| Steady | 150, dust = 0 | **90, dice score as they lie** | "dust = 0" almost always still lost the round (worth ~3 gold) |
| Clear-Eye | 100, blocks one round | **60, cancels the next ability** | blocking a round only postponed the ability (worth ~0) |
| Shrine | Healing or 100 gold | **the Lady's blessing at random** (the user's design, later on 19 Oct): Favour, the next fight on 5 hearts, or Grace, the next dust forgiven | each worth ~100 gold mid-run (`experiments/shrine.js`); whole runs 20.3% sensible, 11.4% casual |
| Stranger's price | next fight on 2 hearts | **a heart short (3 of 4)** | 2 short made every keepsake a bad deal |

Prices sit a little under what each Thonic adds to the final purse when bought before the
middle fights, so the right one pays for itself and a late one doesn't.

## Checked: the simulator matches the server

Fight win % for a sensible player, no Thonics:

| | Molar | Klarg | Rokr | Hangman | Jaguar |
|---|---|---|---|---|---|
| old numbers, sim | 74.8 | 35.5 | 41.2 | 36.0 | 26.0 |
| old numbers, server | 74.8 ± 4.3 | 33.3 ± 5.3 | 38.8 ± 2.8 | 32.0 ± 4.6 | 24.0 ± 3.4 |
| **new numbers, sim** | 85.8 | 71.3 | 58.8 | 53.6 | 41.1 |
| **new numbers, server** | 87.6 ± 2.9 | 72.8 ± 3.9 | 55.6 ± 4.4 | 52.0 ± 4.4 | 39.6 ± 4.3 |

## Findings along the way

- **Abilities matter:** one use of Klarg's steal, the Hangman's shot or Jaguar's Smooth Talk
  costs the player about 10 points of fight win chance (Rokr's blur about 5)
  (`experiments/abilities.js`). The opponents only felt alike because lives evened them out.
- **Casual play is only ~5 points worse** than best play per fight: dice luck dominates.
- **Healing is best saved for the last heart;** drunk at the first lost heart it is worth
  about half as much.
- **Keepsakes** (gold added, from Klarg on): Shield 272, Steady Hand 162, Velvet Cushion 149,
  Trap Card 120, Brodor's Sunglasses ~20 (perfect 24s are rare). A heart short costs ~129.
  The Sunglasses are a trap as they stand; a stronger effect is a possible later change.
- **The Dice Den** is even odds: no gain for the score, only excitement. **The pickpocket**
  costs ~3% of the purse per walk on average, and since 18 Oct he is that walk's only event
  (no spot after him): a sensible player's whole-run wins went from ~20% to ~17%.
- **Opponents' rolled 24s restore a life too** (18 Oct, the user's call; it used to be the
  player's alone; the Hangman's Ace of Spades 24 doesn't heal him): whole-run wins for a
  sensible player ~17% -> ~15.5%, casual ~9.5% -> ~8%. (Had the Ace healed too: ~13%, with the
  Hangman ending ~20% of runs.) The shelf going from 3 to 2 Thonics costs only ~0.5 points.
- **The Hooded Stranger as a random event** (19 Oct, decided in the design doc): 20% of the
  walks the thief leaves (`strangerChance`), instead of one of four spots. Whole-run wins
  ~15.5% -> ~17% (sensible), ~8% (casual): with three spots, Thom is on offer more often.
  15% and 25% gave about the same; 20% means about half the runs meet him once.
- **New keepsakes** (19 Oct, the user's picks; `experiments/new-keepsakes.js`, from Klarg on):
  the Loaded Die (one die rolls 4-6) +105 (never-a-1 was +40, 3-6 +80); the Potion Belt +175,
  but only for the Healing it comes with: an extra slot alone is worth ~0, as players rarely
  fill 2; Thom's Loyalty Card (Thom always on offer, first Thonic free) +25 (25% off was +5,
  half price +20): Thonics cost about what they're worth, so cheaper ones change little.
  Steady Hand Wrap and Brodor's Sunglasses left. Whole runs: unchanged, ~16.6% sensible.

## Nine fights (19 Oct, Phase two)

The Ghoul and Gourd (McGrath 2, Frak 2, Danhausen 3, Duke 3, Martha 4) then the Yawning
Portal (Klarg 3, Rokr 3, Hangman 3, Jaguar 4): the user's starting lives. The sim knows the
new abilities (Fog, Curse, Devil, Martha's random disguise) and Martha's mask (the sensible
player wears the Devil the first round they can each fight). runs.js's values are per fight
still to come: a fight with five or more after it counts like Klarg's did.

- Per fight, fresh on 4 hearts, no Thonics (mask from Klarg on), sensible / casual: McGrath
  85/80, Frak 78/75, Danhausen 65/31 (a casual player doesn't adapt to the Curse; a person
  reading the banner would), Duke 56/48, Martha 42/28, Klarg 62/53, Rokr 66/60, Hangman
  64/56, Jaguar 49/41%.
- Whole runs, sensible: qualify ~23%, win the final 6.5-6.8% (casual ~1%). Options:
  Martha 3 → 8.8%; Martha and Jaguar 3 → 10.8%; Danhausen 2, Duke 2, Martha 3 → 12.8%.
- The older experiments (keepsakes.js, thonic-gold.js, ...) count opponents 1-4 as Klarg to
  Jaguar; with nine fights their `startAt` means Frak to Martha. Re-run them with 5-8 for the
  Yawning Portal.

## Possible next tuning

- The Molar still ends about 1 run in 7 for a sensible player (1 in 5 casual). If that feels
  harsh for the teacher, give him 1 life (then ~95%, but a much shorter first fight).
- Re-run `experiments/runs.js` after any change to `shared/balance.js`.

## The 14-fight tournament (20 Oct, simulator only)

`experiments/tournament.js` plays the design doc's 14 fights (`sim.TOURNAMENT`, passed as
`opts.order`): the Ghoul and Gourd with Frak's Mind Control (Martha copies it), the Yawning
Portal's five (lives 3, 3, 3, 3, 4, the user's), then Klarg's four aboard the Salty Swallow
(3, 3, 3, 4). Uses a fight: Mind Control 1 (the user's); Sucker Punch, Inkfire, Flourish,
Divine Smite and Astral Flood 1 each (first guesses; Inkfire at 2 cost 19 points).

How the new abilities are played (the server will need the same choices): Mind Control makes
you keep your worst die on your first throw (a 1, else the lowest you don't need) and that is
the throw's only keep; Sucker Punch knocks a random kept die loose from a finished, valid hand;
Inkfire burns the 6 for your round (your dice land 1-5); Flourish rolls each of Stason's dice
twice for his turn (a needed 2 or 4, else the higher); Divine Smite is declared as a round
begins; Astral Flood heals Brodor once he's lost a life. Brodor drops his Sunglasses (a 23
heals).

Fight win %, fresh on 4 hearts, no items (sensible, with the ability / without): McGrath 86,
Frak 73 / 80, Danhausen 65, Duke 43 / 66, Martha 34 / 49, Sylvester 58 / 63, Vaelin 54 / 64,
Stason 57 / 65, Ridgeler 55 / 65, Brodor 37 / 49, Klarg 53, Rokr 59, Hangman 53, Jaguar 38.

Whole runs (20,000, sensible): finish 2.0%, reach the Yawning Portal 16%, the ship 4.6%,
average gold 1,128. Casual: 0.1%. 84% of runs end in the Ghoul and Gourd.

### Aiming for 1 in 6 (the user's aim, 20 Oct)

`experiments/tournament-lives.js` screens hearts and lives (20,000 runs each, sensible):
4 hearts as today 2.5%; 5 hearts 10%; 6 hearts 23%; 5 hearts with Martha, Brodor and Jaguar on
3 lives 14%. **The proposal:** 5 hearts a fight (the Stranger's price 4), Danhausen 2, Duke 2,
Martha 3, Jaguar 3, the Yawning Portal's five as the user set them (3, 3, 3, 3, 4): **16%**
(casual 4%); half reach the Yawning Portal, a quarter the ship. Fight wins fresh on 5 hearts:
McGrath 92, Frak 84, Danhausen 88, Duke 77, Martha 62, Sylvester 71, Vaelin 71, Stason 72,
Ridgeler 69, Brodor 50, Klarg 69, Rokr 70, Hangman 67, Jaguar 69. Brodor is the one wall.
Not in `shared/balance.js` yet: 5 hearts would make today's nine-fight game too easy, so it
goes in with the 14-fight build.

### 3 hearts a fight (the user's call, later on 20 Oct)

The player stays on 3 hearts (the Stranger's price 2). Today's lives then finish 0.2%; all 2s
4%; 1s and 2s are needed. **The proposal (T):** the Ghoul and Gourd 1, 1, 1, 1, Martha 2; the
Yawning Portal Sylvester 1, Vaelin 1, Stason 2, Ridgeler 2, Brodor 2; the ship Klarg 1, Rokr 2,
Hangman 2, Jaguar 2. Sensible **17%** (casual 4%); 44% reach the Yawning Portal, 26% the ship.
Fight wins fresh on 3 hearts (with the ability / without): McGrath 90, Frak 79 / 88,
Danhausen 86 / 87, Duke 76 / 88, Martha 49 / 68, Sylvester 81 / 87, Vaelin 79 / 88, Stason 58 /
67, Ridgeler 56 / 69, Brodor 52 / 68, Klarg 77, Rokr 59, Hangman 54, Jaguar 56. A 1-life fight
still lasts ~2 rounds (ties, both dusting), so abilities still fire; Danhausen's Curse then
costs almost nothing. Others tried: all 1 with bosses 2, 26%; 1 1 1 1 2 | 1 1 1 2 2 | 1 1 2 2,
21%; 1 1 2 2 2 | 1 1 1 1 2 | 1 1 1 2, 15%; 1 1 1 2 2 | 1 1 2 2 2 | 1 1 2 2, 14%.

### For now (the user's, 20 Oct; balancing later)

In `shared/balance.js` (and so in today's game): 3 hearts a fight (4 after the Lady's Favour;
the Stranger's price 2), McGrath 2, Frak 2, Danhausen 3, Duke 3, Martha 3, Klarg 3, Rokr 3,
Hangman 3, Jaguar 4; the Yawning Portal's five (not in the game yet) 3, 3, 3, 3, 4. Over 14
fights a sensible player finishes 0.3% and reaches the Yawning Portal 6.7%.
