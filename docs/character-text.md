# Character text in the Tavern Crawl

Every line the game shows for each character, as of 28 October. Send changes in your own words and
they'll be put in; the "Where" notes say which file holds each line.

Since 28 October an ability's screen shows **only its name**. The longer lines that used to sit
under it are gone. What you still see is the entrance card, the name on the ability screen, and
the short badge under the Roll button for the abilities that last a round or a turn.

## The opponents

Where: name and entrance card in `server.js` (`TAVERN_ENCOUNTERS`, `intro`); ability names in
`shared/rules.js` (`ABILITY_NAMES`); badges in `client/src/Hud.tsx` (`roundEffectHint`).

### The Ghoul and Gourd

**Sperm McGrath** (no ability)
- Entrance card: "Sperm McGrath, the Ghoul and Gourd's bouncer, lets no one into the tournament who doesn't know the house game: find a 2, find a 4, then chase 24."

**Frak**: Mind Whip
- Entrance card: "Frak, a repugnant ne'er-do-well, slimes into place. Mind Whip: on your first throw he makes you keep one of your dice, at random."
- Badge (on your turn, once it has landed): "Mind Whip: the selected die stays kept"

**Danhausen**: You are Cursed
- Entrance card: "Danhausen: Very Nice, Very Evil and Mayor of Waterdeep? You are Cursed: for a round, the lowest valid score wins."
- Badge: "Cursed round: the lowest valid score wins"

**Duke Morrigan**: Sympathy for the Devil
- Entrance card: "Duke Morrigan, noble, roguish and scion of Avernus. Sympathy for the Devil: his roll comes up three 6s."
- Badge: none when he plays it. When you wear Martha's mask as the Devil: "Devil's round: three 6s for you"

**Martha Mystery**: Disguises (boss)
- Entrance card: "Martha? Mystery? Who knows? Twice a fight she takes the face of Frak, Danhausen or the Duke, and plays their trick."
- Ability screens: "Disguises", then the trick she copies ("Mind Whip", "You are Cursed" or "Sympathy for the Devil").
- Invitation after beating her: title "You qualify for the Yawning Portal"; "Martha Mystery lifts off her mask and presses it into your hand. "You've earned this. Show it at the Yawning Portal."" Her mask "is yours: once a fight, before you roll, wear Danhausen's Curse or the Duke's Devil for the round."

### The Yawning Portal

**Sylvester Stonefist**: Back of the Head
- Entrance card: "Sylvester Stonefist, a brawling monk, never hits you from the front. Back of the Head: as you keep your last die, he knocks your best die loose and you roll it again."

**Vaelin Inkhand**: Inkfire Brand
- Entrance card: "Vaelin Inkhand, wizard of the inky flame. Inkfire Brand: for a round he burns the 6 into the table, and your dice that land on it roll again."
- Badge: "Inkfire round: your dice can't land on 6"

**Stason Jatham**: Flourish
- Entrance card: "Stason Jatham rushes in, rapier first. Flourish: for one whole turn, each of his dice rolls twice and he keeps the better."

**The Ridgeler**: Divine Smite
- Entrance card: "The Ridgeler, dragonborn paladin, and Beakbreaker, his warhammer. Divine Smite: for a round, if he wins it, you lose two hearts."
- Badge: "Divine Smite: lose this round, lose two hearts"

**Brodor**: Astral Flood (boss)
- Entrance card: "Brodor, wrestling champion, cleric, and the Yawning Portal's champion. Astral Flood: once he has lost a life, he floods the table with light and heals one."
- Invitation after beating him: title "Word from the docks"; "Brodor flips you his sunglasses. "Keep 'em, champ." Then word reaches the Portal: the Salty Swallow has docked, and her crew are the finest players on the coast." His sunglasses "are yours: a finished 23 restores a heart, like a 24."

### Aboard the Salty Swallow

**Klarg**: Reach Around
- Entrance card: "Klarg, bugbear paladin and sworn enemy of Kram. Twice a fight his Reach Around snatches a 2 or 4 you need, and he keeps it for his own hand."

**Rokr**: Written in the Stars
- Entrance card: "Rokr reads the dice in the stars. Written in the Stars: for a whole turn the stars mark two faces before each throw, and dice that land on them cannot be kept."
- Badge: "The stars mark [faces] on your next throw", then "Star-bound now: [faces]. Next throw: [faces]"

**The Hangman**: Dead Eye, and The Ace of Spades (his revolver)
- Entrance card: "The Hangman and The Ace of Spades, his revolver. Dead Eye: once a fight he shoots your best die as you finish and it rolls again. At one life, one shot can turn his own 16 or higher into a perfect 24."

**Jaguar Cantona**: Smooth Talk, then The Cloak, then All In
- Entrance card: "Jaguar Cantona has the smile, the cloak, and an extra life. Smooth Talk: he talks your Thonics off your shelf and drinks them. At two lives, The Cloak. At his last, All In."
- Badges: "The Cloak: Jaguar throws after you, his dice hidden"; "All In: whoever loses this round loses two hearts"

## Between fights

Where: `client/src/Hud.tsx` (`SPOTS`, `SCENES`, `sceneLine`, `thomLine`, and the counter text in
`SceneCounter`).

**Thom** (Thom's Thonics)
- First visit in a run: "Vim, vigour, vitality!" After that: "What ya havin'?"
- On the choice of spots: "Buy Thonics with your purse"

**The thief** (sign "Stop, thief!", "A hand in your purse")
- "Finders keepers!" Caught: "Alright, alright! Have it back!" Got away: "Too slow!"
- Counter: "The thief is making off with [gold]. Roll a [4, 5 or 6] to catch them."

**The Hooded Stranger** (sign "Keepsakes, for a price")
- "I have something for you… for a price." Took one: "A fine choice. Mind your heart." Turned down: "Another time, then."
- Counter: "Take one, and you start the fight with [next opponent] on [n] hearts."

**Darren Snakehands** (sign "The barman, and his snakes")
- "Whoa! Mind the snakes!" Then one of: "Oops. That one was yours…" / "Sorry, friend. Have this on the house." / "The lads caught the lot! Here, for your trouble."

**The gambler** (The Dice Den, "Two dice each. Highest wins.")
- "Fancy a quick throw, friend?" / "Your throw. Make it count." / "A tie! Again!" / you won: "Beginner's luck…" / you lost: "The house thanks you!" / no bet: "Suit yourself."
- Counter: "Bet against the gambler: two dice each, the higher total doubles your bet."

**Shrine to the Lady** ("Goddess of sailors"; she doesn't speak)
- On the choice of spots: "Candles for the Lady, who keeps sailors safe." / "A blessing from the Lady"
- Counter: "Light a candle, and the Lady who keeps sailors safe grants a blessing: an extra heart for your next fight, or her Grace against the dust."
- Blessings: "The Lady's Favour: You start the fight with [next opponent] on [n] hearts." / "The Lady's Grace: The next time you'd lose a heart to dust, she saves you."

**Wild Magic Hot Tub** ("Soak at your own risk")
- On the choice of spots: "Bubbling, glowing, faintly humming." / "A wild surge on one of your dice"
- Counter: "Climb in, and the wild magic surges: most likely one of your dice is blessed for the next fight. Most likely."
- Its bubble: good surge "*bubble bubble* ✨", bad surge "*glorp*"
- Surges (name and what it does): Bubbly Die, never rolls a 1 · Double Bubble, rolls twice and keeps the better · Lucky Splash, only rolls 4, 5 or 6 · Scalding Die, always lands on a 6 · Soggy Die, never rolls a 6 · Pruney Fingers, the next fight a heart short
- Badge in the next fight: "[surge name]: the Wild Magic die …" (for example "Bubbly Die: the Wild Magic die never rolls a 1")
