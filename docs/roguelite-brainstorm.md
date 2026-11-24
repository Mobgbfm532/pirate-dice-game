# Making the crawl more of a roguelite (24 Nov)

The user's question: how can we make this game more of a roguelite?

## What the crawl already has

A roguelite usually has: runs that start fresh, choices along the way, a build that grows, randomness that makes each
run different, permadeath, and something that carries over between runs. The Tavern Crawl already has most of that:

- **Fresh runs and permadeath:** a lost crawl is over (saves are one-use, no save scumming).
- **Choices on the way:** two spots between fights, Thom's cart, the Shrine, the hot tub, the Bard, Yvesil, Jorvash.
- **A build:** up to five keepsakes, a shelf of Thonics and Elf Bars, blessings, songs, omens.
- **Randomness:** random events (the thief, the Stranger, Darren, the Cult), random stock, random hot tub surges.
- **Carried over:** only your dice (an opponent's set once you've beaten them), who you've met, the leaderboard.

What makes it feel less like a roguelite:
1. **The route never changes:** the same fifteen opponents in the same order every run. By the third run you know
   what's coming, so you're never surprised.
2. ~~Builds don't combine.~~ **Wrong (the user, 24 Nov):** there are real synergies already: the Miser's Purse and the
   Gilded Die (the purse's interest pays for the throws again), the Velvet Cushion and the Trap Card (a loss by 1 becomes
   a tie, and the tie becomes their loss), the Gambler's Charm and the Loaded Die (the last die thrown twice, and one of
   the two is loaded). What's missing is a way to **aim** for them: keepsakes come at random (Thom's two, the Stranger's
   two), so a run can't set out to build one. Elite fights with a choice of three keepsakes fix that
   (`docs/tournament-ladder.md`).
3. **Little to unlock:** a lost run gives only your dice and a leaderboard entry. There's no "one more go to unlock X".
4. **No way to make it harder once you can win:** no difficulty ladder for good players.

## Ideas

### A. A different crawl each time
1. **Opponents drawn from a pool per place.** Each place has five seats: a fixed boss (Martha, Brodor, Jaguar) and four
   drawn from a larger pool. Today's fifteen fill most of it; one or two new opponents per place make it work. The
   biggest single step towards "every run is different". Cost: balance (each opponent's difficulty differs) and new art
   for new opponents.
2. **A map with forks** (the Slay the Spire map). Between fights, choose the next opponent from two, each with its
   reward shown: "Frak (a keepsake if you win)" or "Danhausen (double gold)". It turns "Make your choice" between spots
   into a choice of road. The design doc already called the spots "a fork in the road in later places".
3. **Elite fights.** An optional harder version of an opponent (one more life, their ability twice) for a better reward
   (a keepsake of your choice, triple gold). Taken or skipped on the map.
4. **Each place's own events, more of them.** The ship has none today. A pool of 6-8 per place, so walks rarely repeat.
5. **Modifiers for the whole run, drawn at the start:** "The Hungover Crawl: Healings cost double, the Shrine is free",
   "Fog season: every round aboard starts in fog". Shown on the start screen.

### B. Builds that combine
6. **More keepsakes that work together** (pairs like the three above already exist). A few with a theme: a **Ones** set (Fizzy Thomic free each fight, a keepsake that
   pays gold for every 1 you throw, Kram as the enemy of it), a **Gold** set (the Miser's Purse, the Gilded Die, a
   keepsake that adds interest to Healing), a **Ghost** set (Gambler's Charm, Double Bubble, a keepsake that keeps the
   better ghost whenever one appears). Holding two of a set lights a bonus on the strip.
7. **Rarities.** Common, rare and legendary keepsakes, shown by the frame's colour. Legendaries come only from bosses and
   elites, so a boss fight is something to want, not only survive.
8. **Upgrades at Thom's:** pay to make a keepsake stronger ("Shield of Fuckery II: twice a fight").
9. **Cursed keepsakes:** powerful with a catch, offered by the Hooded Stranger or the Cult ("Devil's Bargain: your first
   throw each fight lands three 6s, but you start every fight on 2 hearts").

### C. Something to unlock (meta-progression)
10. **Unlocks into the pool.** New players start with fewer keepsakes, Thonics and spots in the game. Beating a boss, or
    a milestone ("throw three 6s", "win a fight on one heart"), adds more for future runs. A lost run still moves you
    on. The `met` table already records who you've beaten, so it's half built.
11. **Starting characters.** A token on the start screen is a character with a starting kit: the Sign of Kram starts
    sworn to Kram, Brodor's Sunglasses with the Sunglasses, the Loaded Die with the Loaded Die but 2 fewer gold. Each
    unlocks by beating a place. The seven tokens are already painted.
12. **A lasting shop between runs:** gold (or a new currency, "tavern legend") left at the end of a run buys permanent
    small upgrades: +5 starting gold, Thom's cart one Thonic bigger. Hades' mirror. Risk: it makes the leaderboard
    unfair between old and new players, unless the board counts only runs at the same level.
13. **A journal:** every opponent, keepsake and event, greyed until met or found ("12 of 31 keepsakes found"). Cheap,
    and it gives a reason to try everything.

### D. A ladder for good players
14. **Heat levels** (Hades' Heat, Slay the Spire's Ascension). Win a crawl to unlock level 1, then 2... each adding one
    rule: opponents one more life in the Ghoul and Gourd; prices x1.5; abilities from round 1; the thief at every place.
    The leaderboard shows the level ("Mob 👑 Heat 3"). It solves the problem of the game being too hard for some
    players and too easy for others: level 0 can be made easier (the difficulty brainstorm) without boring the best
    players.

### E. More reasons to play again
15. **A daily crawl:** one seed a day, the same draws, opponents and dice for everyone (the dev server already has
    `/seed`), with its own board. Good with a weekly board (leaderboard stats idea 11).
16. **Challenges:** "win the Ghoul and Gourd without a Thonic", "beat Brodor on one heart", each with a badge for the
    leaderboard's line.

## Claude's recommendation

In this order, each one a release of its own:

1. **The map with forks (2) plus elites (3).** Worked out in detail as the tournament ladder: `docs/tournament-ladder.md`. It uses opponents, rewards and scenes the game already has, and it turns
   every run into a set of choices. The biggest roguelite feeling for the work.
2. **Unlocks into the pool (10) with the journal (13).** A lost run then moves you forward, which is what keeps people
   coming back to a hard game. The `met` table is the start of it.
3. **Heat levels (14).** It settles the difficulty question for good: level 0 easier for newcomers, levels above for
   the players who already win.
4. Later: opponents drawn from a pool (1), once there's art for a few new opponents; keepsake sets (6).

Not recommended for now: the lasting shop (12), which makes the leaderboard unfair, and run modifiers (5), which are fun
but come after the map.

## Open questions

- Which of these, if any? In which order?
- The map: how many choices at each fork (two, or three), and does it show what's ahead beyond the next fight?
- Unlocks: what does a new player start with, and does an existing player get everything at once?
- Heat levels: one leaderboard with the level shown, or a board per level?
