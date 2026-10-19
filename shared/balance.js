// The Tavern Crawl's numbers, in one place: prices, gold, hearts and the events between fights.
// The server plays by them and the balance simulator (balance/) reads them, so a change here
// changes both. Chosen by simulation (19 Oct): see balance/README.md for how and why.
'use strict';

module.exports = {
    // Hearts at the start of every fight.
    playerHearts: 4,
    // The opponents' lives, in the order you meet them (19 Oct, the user's starting point): the
    // Ghoul and Gourd (McGrath the bouncer, who is the Molar renamed and keeps the id 'molar',
    // then the high-roller table), then the Yawning Portal.
    opponentLives: { molar: 2, frak: 2, danhausen: 3, duke: 3, martha: 4, klarg: 3, rokr: 3, hangman: 3, jaguar: 4 },
    // How many times each opponent's ability can be used in a fight (from a random round 1-3).
    // disguises: Martha's, each time Frak's, Danhausen's or the Duke's ability at random.
    abilityUses: { psychicFog: 1, cursed: 2, devil: 1, disguises: 2, reachAround: 1, constellationBlur: 2, deadeye24: 1, smoothTalk: 1 },
    // The Duke's Sympathy for the Devil (and the mask's): the other side can't score above this.
    devilCap: 18,

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

    // Between fights, one event: now and then a pickpocket or the Hooded Stranger, else two spots catch your eye.
    interlude: {
        pickpocketChance: 25,   // percent of walks across the room
        pickpocketShare: 0.25,  // of the purse, if they get away
        pickpocketCatch: 4,     // roll this or higher on one die to catch them
        shrineGifts: ['favour', 'grace'], // the Shrine to the Lady: one blessing at random (see server.js)
        favourHearts: 1,        // the Lady's Favour: the next fight starts with this many extra hearts
        diceDenBets: [50, 100], // the Dice Den: two dice each against the gambler, higher total doubles the bet
        strangerChance: 20,     // percent of walks the Hooded Stranger finds you (if the thief didn't)
        strangerOffers: 2,      // keepsakes the Hooded Stranger shows you
        strangerHearts: 3       // ...and you start the next fight on this many hearts if you take one (a heart short)
    },

    // Keepsakes (only from the Hooded Stranger) that carry numbers. Each set by simulation on
    // 19 Oct to add ~100-170 gold to a run from Klarg on (balance/experiments/new-keepsakes.js).
    keepsakes: {
        loadedDieLow: 4,        // the Loaded Die: one of your dice only rolls this or higher
        beltSlots: 1,           // the Potion Belt: extra shelf slots...
        beltThonic: 'healing'   // ...and the Thonic it comes with
    }
};
