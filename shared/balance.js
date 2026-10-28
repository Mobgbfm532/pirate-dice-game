// The Tavern Crawl's numbers, in one place: prices, gold, hearts and the events between fights.
// The server plays by them and the balance simulator (balance/) reads them, so a change here
// changes both. Chosen by simulation (19 Oct): see balance/README.md for how and why.
'use strict';

module.exports = {
    // Hearts at the start of every fight (3, the user's call, 20 Oct; the Lady's Favour adds one).
    playerHearts: 3,
    // The opponents' lives, in the order you meet them (20 Oct, the user's, for now; balancing
    // later): the Ghoul and Gourd (McGrath the bouncer, who is the Molar renamed and keeps the id
    // 'molar', then the high-roller table), the Yawning Portal (five more, Brodor the boss), then
    // aboard the Salty Swallow (Klarg's four).
    opponentLives: {
        molar: 1, frak: 2, danhausen: 3, duke: 3, martha: 3, // McGrath 1 since 21 Oct (the user)
        sylvester: 3, vaelin: 3, stason: 3, ridgeler: 3, brodor: 4,
        klarg: 3, rokr: 3, hangman: 3, jaguar: 4
    },
    // How many times each opponent's ability can be used in a fight (from a random round 1-3).
    // disguises: Martha's, each time Frak's, Danhausen's or the Duke's ability at random.
    // The Yawning Portal's five: 1 each (first guesses, 20 Oct; Inkfire at 2 cost Vaelin's fight 19 points).
    abilityUses: {
        mindWhip: 1, cursed: 2, devil: 1, disguises: 2,
        suckerPunch: 1, inkfire: 1, flourish: 1, divineSmite: 1, astralFlood: 1,
        reachAround: 2, constellationBlur: 2, deadeye24: 1, smoothTalk: 1,
        // The Salty Swallow as the final tier (25 Oct; balance/experiments/final-ship.js): Rokr's
        // Written in the Stars (turns a fight), the Hangman's Dead Eye, Jaguar's Smooth Talk
        // (Thonics he talks off your shelf, in his first phase).
        writtenInStars: 3, deadEye: 1, jaguarPhases: 2
    },
    // How the final tier's abilities play (each set by simulation, 25 Oct): a sensible player,
    // fresh, wins Klarg 27%, Rokr 26%, the Hangman 26%, Jaguar 14% (the Yawning Portal ~40%,
    // Brodor 23%; the ship as it was 36, 41, 35, 24).
    finalShip: {
        klargWaits: true,        // Klarg steals when a 2 or 4 you still need shows (else: on your first throw)
        starFaces: 2,            // Rokr: faces marked before each throw of the turn
        deadEyeRerolls: true,    // the Hangman's shot die rolls again (false: it goes to a 1)
        talkThreeWhenEmpty: 3,   // Jaguar with your shelf empty talks this much off your finished hand
        cloakThrowsSecond: true  // at Jaguar's 2 lives he hides his dice and throws after you
    },
    // The Duke's Sympathy for the Devil (and the mask's): the other side can't score above this.
    // null: no cap, the three 6s are the whole of it (the user's call, 21 Oct; it was 18).
    devilCap: null,

    // MONEY: since 23 Oct (the user's calls) every amount here is in whole gold, nearer D&D's
    // prices: beating Jaguar pays 140 gold, a Healing Thonic costs 11. The old numbers were these
    // x10 (halves rounded against you).
    // Gold during a run goes into the purse as it is won; it is spent between fights.
    gold: {
        // Beating an opponent (since 28 Oct, the user's call): 10 gold for the first, 2 more for each
        // one after (McGrath 10, Frak 12 ... Jaguar 36). Until then it was 10 x their place (Jaguar 140).
        winFirst: 10,
        winStep: 2,
        perHeartLeft: 2,    // for each heart still standing when you win a fight
        perfect24: 0,       // a perfect 24 pays no gold (the user's call, 19 Oct); it still restores a heart
        consolation: 0      // (the consolation for a lost run is in points now: points.reachedPerPlace)
    },
    // Each time you buy the same thing again in a run (a Thonic of the same kind, a candle at the
    // Shrine, a soak), it costs this much more of its first price: x1, x1.5, x2, ... (since 23 Oct,
    // the user's call; rounded up to the gold piece). Keepsakes are bought once.
    priceRise: 0.5,

    // THE LEADERBOARD ranks runs by points (since 23 Oct, the user's call; it was the purse).
    // Points come from what the run did, plus the gold left in the purse at the end.
    points: {
        perPlace: 100,        // each opponent beaten: 100 x their place (McGrath 100 ... Jaguar 1,400)
        perHeartLeft: 25,     // each heart still standing when a fight is won
        perPerfect24: 0,      // a perfect 24 (none for now, as with gold)
        reachedPerPlace: 25,  // a run that ends: 25 x the place of the opponent you fell to
        perGold: 1            // the purse at the end: 1 point a gold piece
    },

    // Thom's Thonics: what each costs, how many fit on the shelf, how many are on his cart.
    // Priced a little under what each adds to the final purse when bought before the middle
    // fights, so the right Thonic at the right time pays for itself and a late one doesn't.
    thonicPrices: { healing: 11, lastGasp: 13, fizzy: 2, secondThoughts: 3, steady: 9, clearEye: 6 }, // (rising, priceRise)
    // Elf Bars (28 Oct, the user's): from Johnny Elf Bar, a spot in every place. Each has
    // elfBarPuffs puffs, at most one a fight. First guesses, to set by play (rising, priceRise).
    elfBarPrices: { purpleHaze: 12, cottonCandyCloud: 9, lemonLevitation: 8, watermelonHindsight: 14 },
    elfBarPuffs: 3,
    shelfSize: 2,
    shopSize: 3, // Healing, plus two others at random

    // Between fights, one event: now and then a pickpocket or the Hooded Stranger, else two spots catch your eye.
    interlude: {
        pickpocketChance: 25,   // percent of walks across the room
        pickpocketShare: 0.5,   // of the purse, if they get away (half since 21 Oct, the user's call; it was a quarter)
        pickpocketCatch: 4,     // roll this or higher on one die to catch them
        shrineGifts: ['favour', 'grace'], // the Shrine to the Lady: one blessing at random (see server.js)
        shrinePrice: 10,        // a candle for the Lady (rising, priceRise)
        hotTubPrice: 5,         // a soak (rising, priceRise)
        favourHearts: 1,        // the Lady's Favour: the next fight starts with this many extra hearts
        diceDenBets: [5, 10],   // the Dice Den: two dice each against the gambler, higher total doubles the bet
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
        darrenGlass: 2,
        darrenCatchGold: 5,
        darrenFullShelfGold: 3, // a free Thonic with a full shelf comes as gold instead
        // The Yawning Portal's own (28 Oct, the user's): the Bard, a spot, sells a song for the next
        // fight (Cutting Words: the opponent's first hand that counts scores this much less;
        // Inspiring Song: your first throw of the fight may be thrown again). The Cult of Kram, an
        // event (if no thief, Stranger or Darren found you): swear fealty, and your dice never land
        // on 1 for the next kramFights fights. First guesses, to set by play.
        bardPrice: 8,           // rising, priceRise
        cuttingWords: 3,
        kramChance: 15,
        kramFights: 2
    },

    // Keepsakes (only from the Hooded Stranger) that carry numbers. Each set by simulation on
    // 19 Oct to add ~100-170 gold to a run from Klarg on (balance/experiments/new-keepsakes.js).
    // Keepsakes for sale on Thom's back shelf (since 21 Oct, the user's call: something worth
    // saving gold for). Two at random each visit, from those you don't have. Each priced a little
    // under what it adds to a run's gold when bought around fight 3, when a purse first reaches a
    // few hundred (balance/experiments/keepsake-when.js; bought later, each is worth less).
    thomKeepsakes: 2,
    keepsakePrices: { bentCopper: 30, velvetCushion: 15, luckySeat: 15, loyaltyCard: 13, potionBelt: 13, loadedDie: 8 },

    keepsakes: {
        loadedDieLow: 4,        // the Loaded Die: one of your dice only rolls this or higher
        beltSlots: 1,           // the Potion Belt: extra shelf slots...
        beltThonic: 'healing'   // ...and the Thonic it comes with
    }
};
