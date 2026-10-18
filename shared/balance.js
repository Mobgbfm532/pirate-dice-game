// The Tavern Crawl's numbers, in one place: prices, gold, hearts and the events between fights.
// The server plays by them and the balance simulator (balance/) reads them, so a change here
// changes both. Chosen by simulation (19 Oct): see balance/README.md for how and why.
'use strict';

module.exports = {
    // Hearts at the start of every fight.
    // 4 hearts against 2, 2, 3, 3, 4 lives: each opponent harder than the last (a sensible player
    // wins about 86 / 72 / 59 / 55 / 42% of fights, before Thonics and events).
    playerHearts: 4,
    opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 },
    // How many times each opponent's ability can be used in a fight (from a random round 1-3).
    abilityUses: { reachAround: 1, constellationBlur: 2, deadeye24: 1, smoothTalk: 1 },

    // Gold during a run: it goes into the purse as it is won, and the purse is the final score.
    gold: {
        winPerPlace: 100,   // beating an opponent: 100 x their place in the run (Molar 100 ... Jaguar 500)
        perHeartLeft: 25,   // for each heart still standing when you win a fight
        perfect24: 75,      // each perfect 24 you roll
        consolation: 25     // losing the run: 25 x the place of the opponent you fell to
    },

    // Thom's Thonics: what each costs, how many fit on the shelf, how many are on his cart.
    // Priced a little under what each adds to the final purse when bought before the middle
    // fights, so the right Thonic at the right time pays for itself and a late one doesn't.
    thonicPrices: { healing: 110, lastGasp: 130, fizzy: 20, secondThoughts: 30, steady: 90, clearEye: 60 },
    shelfSize: 2,
    shopSize: 3, // Healing, plus two others at random

    // Between fights: two spots catch your eye; now and then a pickpocket strikes first.
    interlude: {
        pickpocketChance: 25,   // percent of walks across the room
        pickpocketShare: 0.25,  // of the purse, if they get away
        pickpocketCatch: 4,     // roll this or higher on one die to catch them
        shrineGifts: ['favour', 'grace'], // the Shrine to the Lady: one blessing at random (see server.js)
        favourHearts: 1,        // the Lady's Favour: the next fight starts with this many extra hearts
        diceDenBets: [50, 100], // the Dice Den: two dice each against the gambler, higher total doubles the bet
        strangerOffers: 2,      // keepsakes the Hooded Stranger shows you
        strangerHearts: 3       // ...and you start the next fight on this many hearts if you take one (a heart short)
    }
};
