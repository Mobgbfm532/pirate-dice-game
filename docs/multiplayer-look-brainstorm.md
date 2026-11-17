# Multiplayer: making it look better (brainstorm, 17 Nov)

Looked at a friends' table with three pretend players seated (`previews/mp/`, shot 17 Nov with the dev test
server, headless; phone 384x780 and 360x640, a phone on its side 844x390, computers 1280x800 and 1920x1080).
Nothing below is built yet; the user picks.

## What it looks like now

- Upright phone: the other players' cards in a bar under the header, the empty tavern painting filling the top
  third, the tray, your chip, the scores, five reaction coins.
- Computer: the players in two columns either side of the tray, a dock at the bottom, the reactions as a thin
  column of small coins at the left edge.
- It works, but the room is empty: in a Tavern Crawl an opponent sits behind the table; at a friends' table the
  painting has nobody in it, and the players are small cards with an item icon for a face.

## Two bugs found while looking (fix whatever else is chosen)

1. **Players who leave stay at the table for good, and their card's "Away" runs over its hearts.** Each test
   join left another "Tester · Away" card behind; at a real table, someone who closes the tab stays as a
   greyed card until the table ends. The word "Away" is drawn on top of the hearts.
2. **A phone on its side: with five or six players the column of cards runs down over the slot rail** (the 2
   and 4 plates), which the game's own rule forbids.

## Ideas, in the order I'd do them

1. **Whoever is rolling sits in the tavern.** The top of an upright phone (and the band above the tray on a
   computer) shows the roller's token big, in a lit round frame like the crawl's busts, with their name on a
   brass plate; it changes as the turn passes, with a short slide. The empty room becomes the stage. No new art
   needed. *Small to medium.*
2. **Each player picks their dice.** The painted sets already exist (Frak's green, the Duke's red, Jaguar's
   gold and the rest): a player chooses one on the start screen, and everyone sees their throws in it. A set
   could unlock once you've beaten its owner in a crawl, which ties the two modes together. *Medium.*
3. **Faces for the players.** The seven item tokens are lovely as icons but read as objects, not people. Either
   painted character tokens from the user (a dozen tavern regulars), or the tokens drawn bigger with a coloured
   ring per player that also tints their dice tray glow and their score. *Depends on art.*
4. **One clear "whose turn" signal.** The top banner "War Da... is rolling" cuts names short and repeats the gold
   glow on their card. Drop the banner at a friends' table and let the card (and idea 1) carry it. *Small.*
5. **Bigger cards on a computer.** At 1920x1080 the cards are 230 px wide in a sea of wood; the reactions are
   28 px coins at the very edge. Cards about half as big again, the finished score large on the card, the
   reactions as a row in the dock beside your chip. *Small.*
6. **A score board at the round's end that feels like the tavern:** the round result card already lists
   everyone; it could rank them on a chalk board with each score chalked in, the loser's heart cracking on
   their line. *Medium.*
7. **The waiting room** (before a second player arrives) and the **winner's screen**: not looked at today;
   worth the same check before friends play.

## Open questions for the user

- Which of ideas 1-7, and in what order?
- Idea 2: dice sets free for everyone, or unlocked by beating their owner in a crawl?
- Idea 3: would you paint player tokens, and how many?
- The leftover "Away" players: drop a player's card once they've been away a while (a few minutes, or at the
  next round), or keep it so they can rejoin into their seat?
