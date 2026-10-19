// Whole runs, for a sensible player (chooses spots, shops and takes keepsakes by what they're
// worth) and a casual one (simple habits), under today's numbers and the proposal.
//   node balance/experiments/runs.js [runs]
const S = require('../sim');
const runs = Number(process.argv[2] || 20000);

// What things are worth in gold from the next fight on (index 1 = Klarg ... 4 = Jaguar), from
// thonic-gold.js, effects.js and keepsakes.js (plan A hearts/lives, the new effects).
const VALUE = {
    healing: [0, 157, 156, 124, 64],
    lastGasp: [0, 199, 174, 128, 62],
    fizzy: [0, 21, 20, 19, 4],
    secondThoughts: [0, 37, 31, 32, 14],
    clearEye: [0, 83, 33, 88, 47],
    steady: [0, 112, 131, 113, 59],
    bentCopper: [0, 272, 215, 151, 68],
    blessedTankard: [0, 20, 15, 7, 3],
    luckySeat: [0, 120, 99, 70, 30],
    velvetCushion: [0, 149, 119, 81, 40],
    steadyHand: [0, 162, 125, 80, 35],
    // Since 19 Oct, from new-keepsakes.js (from Klarg on; later fights scaled down like the others).
    loadedDie: [0, 105, 85, 60, 30],
    potionBelt: [0, 170, 155, 124, 64], // mostly the Healing Thonic it comes with
    loyaltyCard: [0, 25, 20, 10, 0],
    heartShort: [0, 129, 129, 124, 69],
    blessing: [0, 101, 100, 83, 52] // the Lady's: the average of Favour and Grace (shrine.js)
};

const sensible = {
    choose(run, spots, N, next) {
        const room = run.shelf.length < N.shelfSize + (run.keepsakes.includes('potionBelt') ? 1 : 0);
        const worth = {
            thom: room && run.purse >= Math.min(...Object.values(N.thonicPrices)) ? 30 : -1,
            shrine: N.interlude.shrineGifts ? VALUE.blessing[next] : Math.max(N.interlude.shrineGold, room ? VALUE.healing[next] : 0),
            diceDen: -1, // even odds: no gain for the score
            stranger: 60 // two offers; often one is worth the heart
        };
        const best = spots.slice().sort((a, b) => worth[b] - worth[a])[0];
        return best && worth[best] > 0 ? best : null;
    },
    shop(run, stock, N, next) {
        return stock.filter(t => VALUE[t][next] > N.thonicPrices[t]).sort((a, b) => (VALUE[b][next] - N.thonicPrices[b]) - (VALUE[a][next] - N.thonicPrices[a]));
    },
    shrine: (run, N, next) => (VALUE.healing[next] > N.interlude.shrineGold ? 'healing' : 'gold'),
    bet: () => 0,
    stranger(run, offers, N, next) {
        const cost = VALUE.heartShort[next] * (N.playerHearts - N.interlude.strangerHearts);
        const best = offers.slice().sort((a, b) => VALUE[b][next] - VALUE[a][next])[0];
        return VALUE[best][next] > cost ? best : null;
    }
};

const casual = {
    choose: (run, spots) => spots[0],
    shop: (run, stock) => stock.slice().sort((a, b) => (a === 'healing' ? -1 : b === 'healing' ? 1 : 0)),
    shrine: () => 'healing',
    bet: (run, bets) => bets[0] || 0,
    stranger: (run, offers) => offers[0]
};

// Before balancing (18 Oct) and the game now (shared/balance.js and the new effects).
const BEFORE = {
    numbers: {
        playerHearts: 3,
        opponentLives: { molar: 2, klarg: 3, rokr: 3, hangman: 3, jaguar: 4 },
        thonicPrices: { healing: 120, lastGasp: 250, fizzy: 80, secondThoughts: 180, steady: 150, clearEye: 100 },
        interlude: { ...S.DEFAULTS.interlude, shrineGifts: null, shrineGold: 100, strangerHearts: 2, strangerChance: null }
    },
    effects: { clearEye: 'round', steady: 'zero' }
};
const NOW = { numbers: {}, effects: {} };
const setups = process.env.SETUPS ? JSON.parse(process.env.SETUPS) : null;

function report(label, policy, setup, player) {
    let won = 0, gold = 0, reach = [0, 0, 0, 0, 0, 0], spent = 0, events = 0;
    const golds = [];
    for (let k = 0; k < runs; k++) {
        const r = S.playRun(policy, { numbers: setup.numbers, effects: setup.effects, player });
        if (r.won) won++;
        gold += r.gold;
        golds.push(r.gold);
        reach[r.defeated]++;
        spent += r.run.stats.spent;
        events += r.run.stats.eventGold;
    }
    golds.sort((a, b) => a - b);
    const pct = x => (100 * x / runs).toFixed(1);
    console.log(`${label.padEnd(30)} whole run ${pct(won).padStart(5)}%  gold avg ${Math.round(gold / runs)} (median ${golds[runs >> 1]}, top 10% ${golds[Math.floor(runs * 0.9)]})  spent ${Math.round(spent / runs)}  events ${Math.round(events / runs)}  fell to M/K/R/H/J ${reach.slice(0, 5).map(pct).join(' / ')}`);
}

module.exports = { sensible, casual, VALUE };
if (require.main === module) {
    for (const [name, setup] of Object.entries(setups || { before: BEFORE, now: NOW })) {
        report(`${name}, sensible`, sensible, setup, 'sensible');
        report(`${name}, casual`, casual, setup, 'casual');
    }
}
