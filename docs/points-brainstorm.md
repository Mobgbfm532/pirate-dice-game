# Points: what a run's score rewards (18 Nov)

The user asked: looking at the whole game, do the parts of a run's points make sense, and is there anything to add?

## How a run scores today (`BALANCE.points`, `getTavernScoreSummary` in server.js)

| Part | Points | A full run (15 wins) | A typical expert run that falls at the Duke |
|---|---|---|---|
| Each opponent beaten: 100 × their place | McGrath 100 ... Jaguar 1,500 | 12,000 | 600 (three beaten) |
| Each heart still standing when you win a fight | 25 | ~860 (about 2.3 a win) | ~170 |
| How far a lost run got: 25 × the place you fell at | 25 ... 375 | 0 | 100 |
| Gold left at the end | 1 a gold piece | ~10-80 | ~10 |
| A Perfect 24 | 0 (set to nothing on 19 Oct) | 0 | 0 |

From 400 expert crawls on the real game (`balance/expert-crawl.js`): median 826 points, best 8,640.

## What makes sense

- **Opponents beaten carry the score, weighted by place.** Later fights are harder and the run is longer, so a win
  aboard the ship is worth far more than one at the Ghoul and Gourd. Right.
- **Hearts spared** reward winning cleanly, and they make the Lady's Favour (a 5-heart fight) and Healing worth
  points too. At 25 they're about a twelfth of the score: a tie-breaker between runs that got as far. Right.
- **How far a lost run got** is a small consolation that sorts two runs that fell at the same place no better or
  worse. Harmless.
- **Gold at 1 a point** means spending is always right (anything that wins a fight is worth hundreds). It only
  breaks ties, and it doesn't reward hoarding. Right as it is (the user, 18 Nov: it counts, and that's fine).

## What doesn't quite

1. **A Perfect 24 is worth nothing.** The game's name and its biggest celebration (gold lettering, the camera's
   push-in, a heart back) leave no mark on the score. It's mostly luck, so a small amount.
2. **Finishing isn't special.** Beating Jaguar is worth 1,500, like any 15th opponent. A run that falls at Jaguar
   with full hearts can score within a few hundred of one that beat him. Crowning the crawl is the whole goal.
3. **Nothing on the run-over screen says what a perfect hand did,** since it counts for nothing.

## Ideas

1. **A Perfect 24: 50 points each** (`perPerfect24: 50`; already counted, `stats.perfect24s`). About one in 40
   hands for a good player, so a run sees one or two. A line on the run-over screen: "Perfect 24s: 2 × 50".
   (A cursed round's Perfect ...4? could count too.)
2. **The crawl's champion: 2,000 more** for beating Jaguar (a new `points.champion`). A finished run then always
   tops one that fell, however clean, and the leaderboard's top reads as the runs that won.
3. **Flawless: 50 more for a fight won without losing a heart** (on top of its hearts spared). Rewards the
   cleanest fights without changing much.
4. **A boss's bounty:** 250 for Martha, 500 for Brodor. They're the walls of the crawl (an expert beats Brodor about
   half the time). Probably unneeded: their place already makes them 500 and 1,000.
5. **Fewer rounds, more points** (a fight won quickly). Left out: luck decides a fight's length more than skill.
6. **Gold at 2 a point, or 5.** Left out: it would make saving up a strategy against buying what wins fights.

**Built 18 Nov (the user's "yes, add both"):** ideas 1 and 2. A perfect hand is worth 50 (`points.perPerfect24`; it
counts a 24, or a cursed round's Perfect ...4?, as the game celebrates them; a cursed 24 no longer counts), and winning
the crawl 2,000 (`points.champion`, `breakdown.champion`); both on the run-over screen ("Perfect hands", "Crawl
champion"). A test.

## Claude's recommendation

Ideas 1 and 2: a Perfect 24 worth 50, and 2,000 for winning the crawl. Each is one number in `shared/balance.js` and
a line on the run-over screen. Leave the rest as it is.
