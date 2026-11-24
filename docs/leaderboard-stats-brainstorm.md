# More on the leaderboard (24 Nov)

The user's question: what other stats would be interesting or useful for the leaderboard?

Today each name keeps its best points, that run's gold, the number of finished crawls and their total points (for the
average). The `met` table already holds who each player has sat down with and beaten (`beat:<id>`). During a run the
server counts more (`stats`: fights won, hearts lost and spared, perfect hands, gold by source, Thonics drunk,
keepsakes fired), but all of it is forgotten once the run's points are worked out.

## Ideas

**Built 24 Nov (the user's pick): 1, 2 and 10**, under each name on both boards. The user chose the nemesis instead of
Claude's Graveyard and weekly board.

**For players (bragging and goals)**
1. **Built.** **Furthest reached:** "Brodor" or "Champion" beside the name. It reads at a glance, even after a lost run, and the
   data is already in `met`.
2. **Built.** **Crawls won:** a crown with a count. Rare today, so it means something.
3. **Rivals beaten:** "9 / 15" (also the number of dice sets unlocked). Already in `met`.
4. **Perfect 24s, over all runs:** the fun number. `stats.perfect24s` is already counted per run.
5. **Flawless fights:** fights won without losing a heart.
6. **Best streak:** most fights won in a row, over all runs.
7. **Richest purse:** the most gold held at once.
8. **Devil's three 6s:** how many times a player has thrown them. A silly stat people like.

**For you (balance and liveliness)**
9. **Deadliest opponents:** a board of who ends the most runs (a "Graveyard": Klarg 31, Brodor 24 ...). Fun for
   players, and it shows you the walls with real players' runs instead of the simulator's.
10. **Built.** **A player's nemesis:** the opponent who has ended the most of their runs.
11. **A weekly board** beside the all-time one, cleared each Monday, so a newcomer has something to win.
12. **Last played:** a date, so names that have gone quiet can drop off the weekly board.

## Claude's recommendation

Furthest reached (1), crawls won (2), the Graveyard (9) and a weekly board (11). The first three need only one new
column or table each, and two of them are already in `met`. The Graveyard gives you real players' numbers for the
difficulty work. The weekly board keeps the leaderboard alive for players who will never catch the top of the all-time
board.
