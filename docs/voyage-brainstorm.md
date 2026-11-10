# The voyage: weather aboard the Salty Swallow (brainstorm, 9 Nov)

The brainstorm as the user and Claude made it on 9 Nov, saved on 10 Nov. What has been built since is
marked **Built**; the rest is still a plan.

## The core idea

In the taverns, your opponent is the danger. On the ship, the table itself can't be trusted. The Swallow
leaves port during its four fights, and the sea changes how the dice behave each round.

The rules every idea is held to:

- **The sea plays both sides.** Klarg suffers the squall too. That keeps it fair and makes who throws
  first matter more.
- **Every round's weather is shown a round ahead**, so you can plan (drink a Healing now because a squall
  is coming). *Changed 9 Nov, the user's call: the sea die is rolled as each round begins and shown
  before anyone throws, instead of a forecast a round ahead.*
- **The 2-and-4 rule never changes.** The sea bends the dice, the throws and how many dice you have,
  never the goal.
- **You see it on the table.** The tray tilts, rain lashes the felt, a die goes over the rail with a
  splash. Every throw is worked out in advance and its faces set when it lands, so tilting the deck or
  sloshing water is purely visual and can't break the results.
- **No copying the opponents.** Klarg steals, Rokr hides your dice, the Hangman cuts your score, Jaguar
  changes phase. The weather must do something else.

## What the numbers say

300,000 hands per condition with a sensible simple player: the direction of each effect, not exact
fight odds.

| Condition | Dust | Avg score | Perfect hand |
|---|---|---|---|
| Calm (the game today) | 25% | 19.5 of 24 | 2.3% |
| Heeling up: every die lands one higher | 34% | 21.6 | 12% |
| Heeling down: every die lands one lower | 18% | 15.7 of 20 | 4.3% |
| Rogue wave: a loose die lost after the first throw | 37% | 14.6 of 18 | 4.3% |
| Short-handed: five dice all round | 34% | 14.3 of 18 | 5.0% |
| Squall: keep two dice every throw | 32% | 18.4 | 1.1% |
| Becalmed: three throws, then dice stay as they lie | 28% | 18.9 | 1.8% |
| St Elmo's fire (first throw only) | 7% | 19.2 | 2.1% |
| Siren's song: every 6 must be kept | 25% | 19.5 | 2.2% |

- **Heeling up is a trap**, and a great one: higher dice sound like a gift, but dust jumps from 25% to
  34%. The extra 6s tempt you to keep them before you have your 2 and 4. It punishes greed.
- **Heeling down is the opposite:** a safe, grinding round. No 6s, so the best hand is 20 and no one can
  win a heart back that round, but dust drops to 18%.
- Either way **the swell never changes your chance of seeing a 2 or a 4** (one higher, 2s come from 1s
  and 4s from 3s; one lower, from 3s and 5s), so it can't stack unfairly with Klarg's steals.
- **Losing dice is the strongest lever.** Siren's song does nothing (sensible players keep 6s anyway):
  cut.

## The weather

1. **Heeling (the swell). Built 9 Nov.** She leans to port or starboard: every die lands one lower or one
   higher, at most 6 and at least 1. On the table the dice slide toward the low rail and the page heaves
   (the camera roll was left out: the paintings' edges would show). Up is the greed trap, down a safe
   round where no 24 is possible. (Since 10 Nov the Loaded Die obeys a port list too: no 6s.)
2. **Rogue wave. Built 10 Nov** as "Heavy seas" on the sea die (the Hangman's dial, faces 2-3, a first guess): as each hand's second throw is made, a wave breaks across the screen and one loose die, at random, rides it over the right-hand rail; the rest are thrown. Both sides. It spares a last loose die (the user, 10 Nov: kept dice stay). The opponents don't yet play around it (their solver doesn't know it's coming). The plan as brainstormed: after your first throw a wave crosses the deck and one loose die goes over the rail.
   You finish with five dice, so the best hand is 18. It's shown in advance ("Heavy seas"), so you know
   to keep your 2 or 4 the moment it shows.
3. **Squall. Built 10 Nov** (on the Hangman's dial, face 2): every hand keeps two dice from each throw (or every die left when only one or two were thrown), both sides; the opponents' solver plays it; driven rain over the table, a storm-violet plaque, "Squall!" on the sea die. No wind sound yet. As brainstormed: rain and wind: you must keep two dice every throw. The intro's rain drawn over the table,
   wind howling. Hands are rushed; dust rises to 32%.
4. **Becalmed.** The sails hang slack: three throws, then every die stays as it lies. Mild (28% dust),
   more tension than danger; good for a quiet night leg.
5. **St Elmo's fire (the storm's gift). Cut 10 Nov (the user: "I do not like that one").** Blue fire dances on one die of your first throw, and it can
   count as the 2 or 4 you need. Dust falls from 25% to 7%. With the Squall, 9% dust: the storm takes
   away and gives back. Its cyan glow can match Yvesil's staff.
6. **Fog bank. Built 10 Nov** (on the Hangman's dial, face 4): his dice land hidden and stay hidden, his finished score shows "?" until your hand is done, and he can't see yours, so he plays for his best; mist drifts over the table, and the user's foghorn sounds; his Ace waits for the round's end. As brainstormed: neither side sees the other's score until both have finished: you play to an unknown
   target, and going second loses its advantage. The Cotton Candy Cloud already does this, so it's cheap
   to build. Not simulated (it changes decisions, not dice).
7. **Clear skies.** Nothing happens (built: "Calm seas"). The voyage needs breathing rounds, or the
   weather turns into noise.

## Four fights, four legs

Each fight draws its rounds from that leg's own weather mix:

| Fight | Leg | Weather mix | Why |
|---|---|---|---|
| Klarg | Casting off | Clear, Heeling up and down | Teaches the system gently; can't double up with his steals |
| Rokr | Night on open sea | Clear, Becalmed, Heeling down | Calm sea; his hidden dice are the danger, so the weather doesn't hide things too |
| The Hangman | The squall | Squall, Rogue wave, Fog (St Elmo's fire cut, 10 Nov) | The storm |
| Jaguar | Eye of the storm | Tied to his phases (below) | A climax |

Jaguar's phases already change with his hearts, so the storm can follow them:

- **3+ hearts, Smooth Talk:** calm or fog, in the eye of the storm.
- **2 hearts, the Cloak:** the storm wall hits, with squalls and rogue waves.
- **His last heart, All In:** heeling and waves together.

*Built so far (9 Nov):* every leg's dial has only calm and the two heelings (`BALANCE.voyage`, first
guesses); the sea die's six faces would take the new weathers as they're built.

## The final dials (proposed 10 Nov, waiting on the user)

The rule (the user, 10 Nov): on every dial a 1 is listing to port and a 6 listing to starboard; each leg
fills faces 2-5 with its own weather. Jaguar's dial changes with his phase.

| Leg | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Klarg, casting off | port | calm | calm | calm | calm | starboard |
| Rokr, night on open sea | port | becalmed | becalmed | calm | calm | starboard |
| The Hangman, the squall | port | squall | heavy seas | fog | calm | starboard |
| Jaguar, Smooth Talk (3+ hearts) | port | calm | calm | fog | fog | starboard |
| Jaguar, the Cloak (2 hearts) | port | squall | squall | heavy seas | heavy seas | starboard |
| Jaguar, All In (last heart) | port | heavy seas | heavy seas | heavy seas | heavy seas | starboard |

Every leg now lists 1 round in 3 (the brainstorm gave Rokr no starboard and the Hangman no heeling;
the rule wins). The Hangman keeps one calm face, as his storm has no gift without St Elmo's fire. To
be simulated before the numbers are trusted.

## After the weather (the later steps)

**Cut 10 Nov (the user): the player's say** (a Compass, a Spyglass, Yvesil's forecast, a Ginger Thonic): no keepsakes or forecasts for the sea. Still to come: choosing a course, events
aboard. Not worked out in the brainstorm.
