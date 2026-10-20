// The Tavern Crawl's numbers, in one place: prices, gold, hearts and the events between fights.
// The server plays by them and the balance simulator (balance/) reads them, so a change here
// changes both. Chosen by simulation (19 Oct): see balance/README.md for how and why.
'use strict';

module.exports = {
    // Hearts at the start of every fight (3, the user's call, 20 Oct; the Lady's Favour adds one).
    playerHearts: 3,
    // The opponents' lives, in the order you meet them (20 Oct, the user's, for now; balancing
    // later): the Ghoul and Gourd (McGrath the bouncer, who is the Molar renamed and keeps the id
    // 'molar', then the high-roller table), the Yawning Portal (the five new opponents, not in the
    // game yet), then aboard the Salty Swallow (Klarg's four, at the Yawning Portal until then).
    opponentLives: {
        molar: 2, frak: 2, danhausen: 3, duke: 3, martha: 3,
        sylvester: 3, vaelin: 3, stason: 3, ridgeler: 3, brodor: 4,
        klarg: 3, rokr: 3, hangman: 3, jaguar: 4
    },
    // How many times each opponent's ability can be used in a fight (from a random round 1-3).
    // disguises: Martha's, each time Frak's, Danhausen's or the Duke's ability at random.
    abilityUses: { mindWhip: 1, cursed: 2, devil: 1, disguises: 2, reachAround: 1, constellationBlur: 2, deadeye24: 1, smoothTalk: 1 },
    // The Duke's Sympathy for the Devil (and the mask's): the other side can't score above this.
    devilCap: 18,

    // Gold during a run: it goes into the purse as it is won, and the purse is the final score.
    gold: {
        winPerPlace: 100,   // beating an opponent: 100 x their place in the run (Molar 100 ... Jaguar 500)
        perHeartLeft: 25,   // for each heart still standing when you win a fight
        perfect24: 0,       // a perfect 24 pays no gold (the user's call, 19 Oct; it was 75); it still restores a heart
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
        strangerHearts: 2,      // ...and you start the next fight on this many hearts if you take one (a heart short)
        // The Wild Magic Hot Tub (a spot, free): a soak, and one wild surge at random, by these
        // weights. Each dice surge works on one of your dice (hotTubDie) for the next fight.
        //   noOnes  Bubbly Die: never rolls a 1        twin    Double Bubble: rolls twice, keeps the better
        //   lucky   Lucky Splash: only rolls 4, 5 or 6  scalding  Scalding Die: always lands on a 6
        //   soggy   Soggy Die: never rolls a 6         pruney  Pruney Fingers: the next fight a heart short
        // Next-fight win chance (simulated, 20 Oct): noOnes +2, twin +3, lucky +5, scalding +8,
        // soggy -8, pruney -20 points; a soak averages about +1 (balance/experiments/hot-tub.js).
        hotTubSurges: { noOnes: 3, twin: 3, lucky: 3, scalding: 1, soggy: 1, pruney: 1 },
        hotTubDie: 1,
        // Darren Snakehands, the Ghoul and Gourd's barman (a random event there, if no thief or
        // Stranger found you): his snake-arms knock into you; roll one die. Up to darrenSmash a
        // Thonic on your shelf smashes (an empty shelf: pay for the glass); up to darrenGift he says
        // sorry with a free Thonic; higher, the snakes catch everything: a Thonic and gold.
        darrenChance: 15,
        darrenSmash: 2,
        darrenGift: 4,
        darrenGlass: 20,
        darrenCatchGold: 50,
        darrenFullShelfGold: 30 // a free Thonic with a full shelf comes as gold instead
    },

    // Keepsakes (only from the Hooded Stranger) that carry numbers. Each set by simulation on
    // 19 Oct to add ~100-170 gold to a run from Klarg on (balance/experiments/new-keepsakes.js).
    keepsakes: {
        loadedDieLow: 4,        // the Loaded Die: one of your dice only rolls this or higher
        beltSlots: 1,           // the Potion Belt: extra shelf slots...
        beltThonic: 'healing'   // ...and the Thonic it comes with
    }
};
