# Making the crawl easier (23 Nov)

The user's question: how to make the game easier **without taking lives off the Ghoul and Gourd's opponents**
(McGrath 1, Frak 2, Danhausen 3, the Duke 3, Martha 3 stay as they are).

What's been measured so far (`balance/README.md`):
- 18 Nov, the expert on the real server, 400 crawls each: today it gets through the Ghoul and Gourd 21% of the time and
  has never finished a crawl. **4 hearts** took that to 32% (the ship 4%, a finish 1%), about as much as a life off
  every opponent (38%). Brodor (~50%) and Klarg (27-43%) are the walls whatever else changes.
- 21 Oct, the simulator, other levers against the game of that day: the Shield from the start ~2x the finishes; every
  opponent playing simply ~1.5x; no abilities ~1.3x; always rolling second ~1.1x; a free Healing, a shelf of 3,
  half-price Thonics or a 24 healing 2 hearts barely moved it.
- The user's verdict on 18 Nov: "a good player clears this no problem"; nothing changed then. Players now want it easier.

## Ideas (none built)

1. **4 hearts a fight** (`playerHearts` 4). The biggest single lever measured that leaves opponents alone; helps every
   fight evenly. Risk: fights run longer.
2. **4 hearts in the Ghoul and Gourd only** (`fightHearts`, which gave its first four fights 2 hearts until 5 Nov).
   Eases the place where most runs end, keeps the later places as tough as now.
3. **A starting keepsake**: the Shield of Fuckery (or a choice of two) at the start of a crawl, or the Shield on Thom's
   back shelf from the first place instead of the Yawning Portal. Measured as one of the strongest levers.
4. **You always throw second in the Ghoul and Gourd** (today turns alternate). Knowing the score to beat is worth a few
   points a fight.
5. **Gentler abilities in the Ghoul and Gourd**: Danhausen's Curse and Martha's Disguise Self once a fight instead of
   twice; or abilities only from round 2.
6. **Ties go your way in the Ghoul and Gourd** (today a tie is sudden death): a built-in Trap Card for the first place.
7. **Soften the two walls**, Brodor and Klarg (outside the Ghoul and Gourd, but where good runs die): Astral Flood heals
   him without taking your heart, or Brodor on 3 lives; Klarg one steal a fight. Tested on 18 Nov on few fights: Brodor
   48 → 53%, Klarg 27 → 35%.
8. **A heart back between fights isn't needed** (hearts already reset each fight); cheaper Healing barely helps (measured).

9. **Weight the Ghoul and Gourd opponents' dice** (the user's, 23 Nov). The game already has the machinery: the sea's
   list shifts every die a step (`seaRoll`), Áéd's Heightened Dice rolls twice and keeps the worse, with a ghost die
   showing the roll that lost (`withHeightened`), Fair Winds re-rolls 1s on a first throw. Ways to use it, gentlest first:
   - **Tipsy regulars, shown:** their first throw of each round is at disadvantage (rolled twice, the worse kept), with the
     ghost die and a 🍺 on their nameplate and card ("A few ales in: their first throw each round is rolled twice, the
     worse kept"). Fair, visible, thematic; strength tunable (first throw only, or every throw; McGrath and Frak only, or
     all five).
   - **Cheap dice, shown:** their painted dice have a worn face (a 6 that's really a 5), said on their card.
   - **Hidden weighting** (e.g. their 6s re-rolled now and then): Claude advises against it. The server rolls with real
     randomness and every player sees the same dice; a hidden thumb on the scale is hard to notice in one game, easy to
     suspect over many, and it undercuts the leaderboard's fairness if players ever compare notes.
   - The same help on **your** side instead: Fair Winds for every Ghoul and Gourd fight (your 1s on the first throw of
     each round thrown again), shown as a blessing on your strip.

## Claude's recommendation

Idea 2 (4 hearts in the Ghoul and Gourd) plus idea 7 (soften Brodor and Klarg): the start becomes friendlier where most
players give up, and good runs stop dying at the same two walls. Measure first with `balance/expert-crawl.js`
(`NUMBERS='{"playerHearts":4}'` style overrides) before changing anything.
