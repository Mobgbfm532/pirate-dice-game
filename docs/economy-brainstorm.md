# Gold and keepsakes: a look at the whole run (17 Nov)

**Built 17 Nov (the user's: "build all 3 recommendations, make keepsakes slightly more expensive, they should be able to
buy two by the end of the gourd"):** prices by place, the Gilded Die and Bren's Compass, and dearer keepsakes:
Shield 36, Velvet Cushion, Trap Card and Gambler's Charm 20, Potion Belt 18, Loyalty Card, Loaded Die, Miser's Purse and
Bottomless Flask 16, the Gilded Die 20 (from the Portal: 30 there), Bren's Compass 15 (aboard only: 30). Measured: a
player who buys a Healing only when the shelf is empty and any keepsake they can afford leaves the Ghoul and Gourd with two
or more in about 2 runs in 3 (the rest mostly didn't see Thom's cart: it's one of the two spots half the time).
The model doesn't spend on the Gilded Die, so the ship's leftover gold in these tables is before it.

The user asked: given everything in the game, which keepsakes are missing (at least one that turns gold into
something else), and how much gold does a run bring in, so that every price fits it?

Measured with `balance/experiments/economy.js` (new, 17 Nov): a player who wins every fight, 20,000 runs. Hearts left at
each win come from the simulator (sensible player, 3 hearts, no items); thieves, Darren, the spots on offer at each place,
rising prices and full pockets as the server has them. Three players: **hoard** (never spends: the ceiling), **frugal** (a
Healing when the shelf is empty, the Shield when offered), **keen** (buys whatever helps whenever it can).
`node balance/experiments/economy.js 20000 keen`; `PLACE_PRICES=1,1.5,2` tries the proposal below.

## Where the gold comes from

| | Each win | Hearts left (2 each) | Per fight | The place in all |
|---|---|---|---|---|
| Ghoul and Gourd (McGrath ... Martha) | 10, 12, 14, 16, 18 | ~4 | 15 → 22 | ~90 |
| Yawning Portal (Sylvester ... Brodor) | 20 ... 28 | ~3.5 | 24 → 32 | ~140 |
| Salty Swallow (Klarg ... Jaguar) | 30 ... 38 | ~3.2 | 33 → 41 | ~185 |

**A whole run earns about 415 gold.** The last 41 (Jaguar's) can't be spent. Thieves take 20-40 of it in a typical run.
Darren adds a little. The Miser's Purse adds 5-10 a fight once the purse is fat. Income doubles from the first place to
the last: about 18 a fight, then 27, then 37.

## Where it goes, and what's left

Median purse as you leave each stop (after spending):

| Leaving | hoard | frugal | keen |
|---|---|---|---|
| after McGrath | 16 | 6 | 4 |
| after the Duke | 66 | 36 | 8 |
| after Stason (Portal) | 158 | 80 | 20 |
| after Klarg (ship) | 236 | 138 | 64 |
| after the Hangman | 348 | 206 | 93 |
| at the end | 389 | 248 | 136 |

**What this shows:**
1. **The Ghoul and Gourd is tight, and that's good.** The first win (about 15 gold) buys one Healing (11). Even a keen
   player leaves each stop with 4-8 gold. Every buy there is a real choice.
2. **Keepsakes are cheap for what they do.** Every keepsake you can buy at the Ghoul and Gourd costs 12-15 gold. A keen
   player has all five pockets full by about fight 4. The Shield (30), the best keepsake, only goes on sale at the
   Yawning Portal, so it's bought in only about 1 run in 4: by then the pockets are full (the swap on Thom's back shelf
   helps, at the price of losing one).
3. **Aboard the ship gold piles up with nothing to spend it on.** Each fight pays about 35 gold, and each stop offers
   one spot (Thom, the Shrine, Jorvash 8, Yvesil 8). Even a keen player leaves every stop aboard with 60-90 gold unspent
   and ends the run with about 136. The problem aboard is too few things to buy, not too little gold.
4. **Gold left at the end is worth almost nothing.** At 1 point a gold piece, 136 gold is about 1% of a finished
   run's ~12,000 points. Saving up isn't a strategy.

## Proposal 1: prices by place (one rule, every price) — Built

Income is ×1.5 at the Portal and ×2 aboard, so let every price follow it: **×1 at the Ghoul and Gourd, ×1.5 at the
Yawning Portal, ×2 aboard the Salty Swallow** (a posher tavern, then a ship's stores; Thom says so). The rise for
buying the same thing again stays on top. One new number in `shared/balance.js` (`placePrice`), nothing else changes:

| First price | Ghoul and Gourd | Yawning Portal | Salty Swallow |
|---|---|---|---|
| Healing | 11 | 17 | 22 |
| Last Gasp / Steady / Clear-Eye | 13 / 9 / 6 | 20 / 14 / 9 | 26 / 18 / 12 |
| Fizzy / Second Thoughts | 2 / 3 | 3 / 5 | 4 / 6 |
| Shield | (not sold) | 45 | 60 |
| Velvet Cushion, Trap Card | 15 | 23 | 30 |
| Loaded Die | (not sold) | 18 | 24 |
| Loyalty Card, Potion Belt, Miser's Purse, Bottomless Flask | 12-13 | 18-20 | 24-26 |
| Gambler's Charm | 14 | 21 | 28 |
| Shrine candle | 10 | 15 | 20 |
| Hot tub / Bard / Elf Bars | 5 / - / 8-14 | - / 12 / 12-21 | - |
| Yvesil, Jorvash | - | - | 16 |

Measured: a keen player now leaves each stop aboard with about 40 gold instead of 60-90, and ends with 84 instead of 136
(42 of it Jaguar's purse, which can't be spent anyway). The Ghoul and Gourd doesn't change. **This alone doesn't fix
point 3**: there are still too few things to spend on aboard. It makes the ship's gold mean something, and leaves room
for the keepsakes below.

## Proposal 2: keepsakes that turn gold into something

The keepsakes today: hearts (Shield), ties and near misses (Velvet Cushion, Trap Card), the shelf (Potion Belt, Bottomless
Flask, Loyalty Card), dice (Loaded Die, Gambler's Charm), gold (Miser's Purse), plus the bosses' drops (Mystery Flavour,
Brodor's Sunglasses). **Nothing spends gold during a fight**, so gold only matters at the 12 stops between fights.

1. **The Gilded Die** (gold into throws; **Built**, from the Yawning Portal on): once you've thrown, pay gold to throw one loose die again. 3 gold the first
   time in a fight, 6 the next, then 9 (at most three a fight; ×place). **Since 23 Nov (the user's): 5 gold every time, anywhere, as often as you like.** Gold earned aboard becomes help in every fight
   aboard. It's the clearest sink: small, often, your choice each throw. *Recommended.*
2. **The Fixer's Purse** (gold into hearts): once a fight, when a round would cost you a heart, pay 15 gold to keep it
   (+5 each time in a run). A Shield you pay for each time: worse early, better aboard. It overlaps the Shield, so one
   or the other.
3. **The Mercenary's Contract** (gold into the opponent's lives): as a fight begins, pay 20 gold (×place) and the opponent
   starts a life short (never below 1). Big: one life is worth ~10-15 points of the fight's win chance. Best once a fight
   is expensive to lose, so a ship purchase.
4. **The Banker's Seal** (gold into points): every gold piece left at the run's end counts 5 points, not 1. For leaderboard
   chasers, and makes saving up a real choice. (Or no keepsake: `points.perGold` goes up for everyone.)
5. **The Money Belt** (keeps gold): the thief takes a quarter, not half, and you spot them on a 3+. Cheap and modest,
   for the Portal, where purses first get fat.
6. **The Pawnbroker's Ticket** (the other way, things into gold): at Thom's, sell a Thonic or keepsake back for half
   its price. Takes the sting out of full pockets.

## Proposal 3: other gaps

- **Against abilities:** only the Clear-Eye Thonic counters an opponent's ability. A **Witch's Mirror** (on the 30 Oct
  list): the first ability used against you each fight fizzles. Strong, so Portal on and priced like the Shield.
- **The sea:** the ship has no keepsakes of its own. **Bren's Compass** (on the 30 Oct list): once a fight, roll the
  sea die again. Sold aboard only. **Built**: automatic, when the die brings anything but calm or starboard.
- **Seeing:** fog, the Cloak and Starry Form all hide dice. A **Spyglass** (30 Oct list): once a fight, see through
  one hidden throw.

(Still on the 30 Oct list, unsorted: Lodestone, Hangman's Spare Bullet, Devil's Bargain, Brawler's Knuckles, Sigil of
Kram, Rokr's Star Chart, Gold Tooth.)

## Claude's recommendation

Proposal 1 (prices by place), plus the **Gilded Die** as the gold-into-something keepsake, and the **Bren's Compass**
so the ship sells something of its own. Prices first: they are one number and change nothing at the Ghoul and Gourd.
Then the two keepsakes (each needs the user's painting). Leave the Fixer's Purse and the Mercenary's Contract until the
simulator knows the ship's new pieces: both are strong, and the ship is already where runs end.

Not built: everything here waits on the user's word (the user sets the numbers).
