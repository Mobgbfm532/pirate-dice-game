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

## Possible next tuning

- The Molar still ends about 1 run in 7 for a sensible player (1 in 5 casual). If that feels
  harsh for the teacher, give him 1 life (then ~95%, but a much shorter first fight).
- Brodor's Sunglasses could do more.
- Re-run `experiments/runs.js` after any change to `shared/balance.js`.
