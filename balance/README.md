# Balancing the Tavern Crawl (step 4)

The numbers live in `shared/balance.js` (the server and the simulator both read them).

- `sim.js`: a fast offline copy of a Tavern Crawl (fights, gold, Thonics, events, keepsakes)
  on the real dice rules and opponents' play. ~2,500 fights a second. The player is
  "sensible" (best play, the same solver the opponents use) or "casual" (the Molar's habits).
- `check-server.js`: plays real fights on the real server over sockets to check the
  simulator: `node balance/check-server.js <opponent 0-4> <fights>`.
- `experiments/`: the measurements below (`node balance/experiments/<name>.js`).

## Checked: the simulator matches the server (18 Oct)

Fight win % for a sensible player, no Thonics, current numbers:

| | Molar | Klarg | Rokr | Hangman | Jaguar |
|---|---|---|---|---|---|
| sim (20k fights) | 74.8 | 35.5 | 41.2 | 36.0 | 26.0 |
| server | 74.8 ± 4.3 | 33.3 ± 5.3 | 38.8 ± 2.8 | 32.0 ± 4.6 | 24.0 ± 3.4 |

The sim may flatter the player by ~2 points (most likely in blind play under Rokr's blur).

## Findings so far

1. **Far too hard now.** A near-perfect player finishes a run ~1% of the time (casual 0.4%).
   The Molar, the teacher, ends ~1 run in 4.
2. **Opponents from Klarg on are about equally strong;** lives decide a fight, abilities
   barely do. The curve doesn't climb (Klarg, 2nd, is as hard as the Hangman, 4th).
3. **Casual play is only ~5 points worse** than best play: dice luck dominates.
4. **Proposed shape ("plan A", `experiments/plans.js`): player 4 hearts; opponent lives 2, 2,
   3, 3, 4.** Win %: sensible 86 / 72 / 59 / 55 / 42 (whole run 8.3% without items);
   casual 81 / 66 / 52 / 48 / 33 (4.4%). Fights 3.7 to 6.4 rounds. Not applied yet.
5. **Thonic values under plan A** (`experiments/thonics.js`, +win % from holding one at the
   start of a fight, Molar / Klarg / Rokr / Hangman / Jaguar):

   | Thonic | price now | effect |
   |---|---|---|
   | Healing | 120 | +6.5 +11.8 +13.5 +14.5 +14.3 |
   | Last Gasp | 250 | +6.8 +11.9 +13.6 +14.7 +14.0 |
   | Fizzy | 80 | +1.5 +1.6 +2.1 +2.3 +1.3 |
   | Second Thoughts | 180 | +0.6 +1.0 +1.6 +1.7 +1.3 |
   | Steady | 150 | ~0 |
   | Clear-Eye | 100 | ~0 (-2 to +1) |

   A heart is worth ~10x the others. Steady barely matters (dust and a 0 both lose a round
   unless the opponent also dusts). Clear-Eye barely matters because the abilities barely
   matter (finding 2). Second Thoughts is only used on dust here; a smarter use may be worth
   more. Prices out of line: Last Gasp is priced 2x Healing for the same value; Steady and
   Second Thoughts cost more than Fizzy for less.

## Next (tomorrow)

1. Decide plan A (or a variant) and per-Thonic changes: re-price by value, and/or make
   Steady and Clear-Eye worth having (e.g. stronger abilities so Clear-Eye matters; Steady
   making dust count as a better score).
2. Value the events (Shrine, Dice Den, Stranger's keepsakes vs a heart, pickpocket) and the
   gold economy: what a sensible shopper buys, and whether buying raises the expected final
   purse (the score). Target: a good run finishes ~1 in 5 with good use of Thonics and events.
3. Apply to `shared/balance.js`, re-simulate, run the tests, write up for the user.
