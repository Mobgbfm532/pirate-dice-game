// The Tavern Crawl's numbers, in one place: prices, gold, hearts and the events between fights.
// The server plays by them and the balance simulator (balance/) reads them, so a change here
// changes both. See balance/README.md for how they were chosen.
'use strict';

module.exports = {
    // Hearts at the start of every fight.
    playerHearts: 3,
    opponentLives: { molar: 2, klarg: 3, rokr: 3, hangman: 3, jaguar: 4 },

    // Gold during a run: it goes into the purse as it is won, and the purse is the final score.
    gold: {
        winPerPlace: 100,   // beating an opponent: 100 x their place in the run (Molar 100 ... Jaguar 500)
        perHeartLeft: 25,   // for each heart still standing when you win a fight
        perfect24: 75,      // each perfect 24 you roll
        consolation: 25     // losing the run: 25 x the place of the opponent you fell to
    },

    // Thom's Thonics: what each costs, how many fit on the shelf, how many are on his cart.
    thonicPrices: { healing: 120, lastGasp: 250, fizzy: 80, secondThoughts: 180, steady: 150, clearEye: 100 },
    shelfSize: 3,
    shopSize: 3, // Healing, plus two others at random

    // Between fights: two spots catch your eye; now and then a pickpocket strikes first.
    interlude: {
        pickpocketChance: 25,   // percent of walks across the room
        pickpocketShare: 0.25,  // of the purse, if they get away
        pickpocketCatch: 4,     // roll this or higher on one die to catch them
        shrineGold: 100,        // the Shrine to the Lady: this much gold, or a free Healing Thonic
        diceDenBets: [50, 100], // the Dice Den: two dice each against the gambler, higher total doubles the bet
        strangerOffers: 2,      // keepsakes the Hooded Stranger shows you
        strangerHearts: 2       // ...and you start the next fight on this many hearts if you take one
    }
};
