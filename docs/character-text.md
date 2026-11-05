# Character text in the Tavern Crawl

Every line the game shows for each character, as of 4 November (checked against the game). Send changes in your own words and
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
- Run-over screen, if he beats you: "You couldn't beat Sperm?" (everyone else: "[name] ended your run.")

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
- Invitation after beating her: title "You qualify for the Yawning Portal"; "Martha Mystery blows a ring of violet smoke and presses her own Elf Bar into your hand. "You've earned this. Guess the flavour. Show it at the Yawning Portal."" Her keepsake, Mystery Flavour: "Martha's own Elf Bar. It never runs out: one puff a fight, and each fight it tastes of one of Johnny's four, at random." (Until 4 Nov she gave her mask.)
- Since 30 Oct a boss's keepsake is yours to take or leave: "Take it" / "Leave it". With five keepsakes already: "Your pockets are full: taking it means leaving one of yours behind." then "Leave which behind for [keepsake]?" Left: "You leave [keepsake] behind." The same for Brodor's Sunglasses.

### The Yawning Portal

**Sylvester Stonefist**: Back of the Head
- Entrance card: "Sylvester Stonefist, a Master Monk - if you can imagine that. Back of the Head: as you keep your last die, he knocks your best die loose and you roll it again."

**Vaelin Inkhand**: Inkfire Brand
- Entrance card: "Vaelin Inkhand, wizard of the inky flame. Inkfire Brand: for a round he burns the 6 into the table, and your dice that land on it roll again."
- Badge: "Inkfire round: your dice can't land on 6"

**Stason Jatham**: Vexing Rapier
- Entrance card: "Stason Jatham, action hero, beekeeper. Vexing Rapier: twice a fight, for one whole turn, each of his dice rolls twice and he keeps the better."

**The Ridgeler**: Divine Smite
- Entrance card: "The Ridgeler, dragonborn paladin and a War Daddy. Divine Smite: for a round, if he wins it, you lose two hearts."
- Badge: "Divine Smite: lose this round, lose two hearts"

**Brodor**: Astral Flood (boss)
- Entrance card: "Brodor, Goblin-mania champion of the Madness. Astral Flood: once he has lost a life, he floods the table with light, heals one and takes one of yours."
- Invitation after beating him: title "Word from the docks"; "Brodor flips you his sunglasses. "UH-HUH, YEAH! I want you to have these sunglasses. You'll need them when you're soaring high with the griffins! OOH YEAH!"" His sunglasses "are yours: a finished 23 restores a heart, like a 24."

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
- Counter: "The thief is making off with [gold]. Roll a [4, 5 or 6] to spot them."

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

**The Bard** (the Yawning Portal only; sign "The Bard", "Songs to win by")
- On the choice of spots: ""A song for your next fight?"" / "Inspiration for the next fight"
- "A song for your next fight, friend?" Bought one: "Go! Let them hear it!" Walked away: "Another time, then."
- Counter: "Pay the Bard, and his song goes with you to the fight with [next opponent]."
- Songs: "Cutting Words: Your opponent's first hand that counts next fight scores 3 less." · "Inspiring Song: Your first throw of the next fight: throw it again if you don't like it."
- When they work: "The Bard / Cutting Words / [opponent]'s [score] becomes [score]." and "The Bard / Inspiring Song / The Bard plays. Your first throw, thrown again."
- Where: `server.js` (`BARD_SONGS`, the two moments), `client/src/Hud.tsx`

**The Cult of Kram** (a Yawning Portal event; sign "The Cult of Kram", "Kram abhors an ugly 1")
- "Swear fealty to Kram, and no ugly 1 shall trouble you." Sworn: "Kram is pleased." Refused: "Kram will remember this."
- Counter: "Swear fealty to Kram, and your dice never land on an ugly 1 for your next 2 fights."
- Sworn: "Sworn to Kram: Your dice never land on 1 for your next 2 fights." Refused: "You refuse. The cultists melt back into the crowd."

**Johnny Elf Bar** (every place; sign "Johnny Elf Bar", "One of Frak's street urchins")
- On the choice of spots: ""Psst! Wanna touch the sky?"" / "Elf Bars: magic vapes, three puffs each"
- "Psst! Wanna touch the sky?" After a purchase: "Nice one! You'll be back."
- Counter: "Each Elf Bar sits on your shelf with 3 puffs, one a fight."
- Elf Bars: Purple Haze "After a throw showing a 1, while you still need a 2 or a 4: that 1 becomes it." · Cotton Candy Cloud "On your turn, while your opponent is still to throw: they play this round without seeing your score." · Lemon Levitation "After a throw: throw again without keeping a die." · Watermelon Hindsight "Undo your last throw: those dice are thrown again."
- When puffed: "Elf Bar / [flavour] / A 1 becomes your [2 or 4]", "This round your opponent can't see your score", "Throw again without keeping a die", "Your last throw, thrown again"
- Where: `server.js` (`THONICS`, the puffs in `drinkThonic`), `client/src/Hud.tsx` (`SPOTS`, `SCENES`, `sceneLine`)

**Wild Magic Hot Tub** ("Soak at your own risk")
- On the choice of spots: "Bubbling, glowing, faintly humming." / "A wild surge on one of your dice"
- Counter: "Climb in, and the wild magic surges: most likely one of your dice is blessed for the next fight. Most likely."
- Its bubble: good surge "*bubble bubble* ✨", bad surge "*glorp*"
- Surges (name and what it does): Bubbly Die, never rolls a 1 · Double Bubble, rolls twice and keeps the better · Lucky Splash, only rolls 4, 5 or 6 · Scalding Die, always lands on a 6 · Soggy Die, never rolls a 6 · Pruney Fingers, the next fight a heart short
- Badge in the next fight: "[surge name]: the Wild Magic die …" (for example "Bubbly Die: the Wild Magic die never rolls a 1")

## Keepsakes

Where: `server.js` (`TAVERN_KEEPSAKES`, `MARTHAS_MASK`, `BRODORS_SUNGLASSES`); the line as one works in `emitKeepsakeActivated` calls.

- **Shield:** "Once per encounter, the first life you would lose is ignored." (offered from the Yawning Portal on) When it works: "Shield protects a life."
- **Trap Card:** "Once per encounter, your first tied round counts as safe for you and a loss for the opponent."
- **Velvet Cushion:** "Once per encounter, losing by exactly 1 point becomes a tie instead."
- **Loaded Die:** "One of your dice lands only on a 2 or a 4 until you've kept both; after that, only on 4, 5 or 6." (offered from the Yawning Portal on)
- **Potion Belt:** "Your shelf holds one more Thonic. Comes with a Healing Thonic."
- **Thom's Loyalty Card:** "Thom's Cart is always available, and your first Thonic each visit is free."
- **Miser's Purse:** "Each win pays 1 more gold for every 10 in your purse." On the fight summary: "Miser's Purse · 1 for every 10 in your purse".
- **Gambler's Charm:** "When only one die is left to throw, it is thrown twice and you keep the better."
- **Bottomless Flask:** "The first Thonic you drink each fight has a 1 in 2 chance of staying on your shelf." When it works: "Your [Thonic] fills up again."
- **Martha's Mask:** "Once a fight, before you roll: Danhausen's Curse (lowest valid score wins the round) or the Duke's Devil (three 6s for you)."
- **Brodor's Sunglasses:** "A finished 23 restores a heart, like a 24."
- On Thom's back shelf with five keepsakes, the buttons read "Pockets full".

## Multiplayer tables

Not the Tavern Crawl, but the only words a multiplayer table shows during play (3 Nov), so they're
here too. Where: `MULTIPLAYER_CALLOUTS` in `client/src/game.ts`.

- "The Early Ross!": after the first throw, a 2 or a 4 is kept together with a 1, 3, 5 or 6.
- "Didn't Bite!": after the first throw, just a 2 or a 4 is kept while a 6 is left to roll again.
- "Perfect 24!" when a hand finishes on 24 (with the player's name when it isn't you).
- The reactions have names only as tooltips on their coins: Cheers, Ha!, Ooh, Smug, Woe.
