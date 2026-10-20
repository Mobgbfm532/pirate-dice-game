// Hearts and lives for the 14-fight tournament: whole runs under several setups, to find one
// where a sensible player finishes about 1 in 6 (the user's aim, 20 Oct).
//   node balance/experiments/tournament-lives.js [runs]   (SETUPS='{"name":{...numbers}}' to try others)
const S = require('../sim');
const { sensible, casual } = require('./runs');
const runs = Number(process.argv[2] || 5000);

const uses = { mindControl: 1, suckerPunch: 1, inkfire: 1, flourish: 1, divineSmite: 1, astralFlood: 1 };
const now = { molar: 2, frak: 2, danhausen: 3, duke: 3, martha: 4, sylvester: 3, vaelin: 3, stason: 3, ridgeler: 3, brodor: 4, klarg: 3, rokr: 3, hangman: 3, jaguar: 4 };
const lives = changes => ({ ...now, ...changes });
// More hearts: the Stranger's price stays a heart short, the Lady's Favour a heart over.
const hearts = h => ({ playerHearts: h, interlude: { ...S.DEFAULTS.interlude, strangerHearts: h - 1 } });
const twos = { danhausen: 2, duke: 2, sylvester: 2, vaelin: 2, stason: 2, ridgeler: 2, klarg: 2, rokr: 2, hangman: 2 };
const bosses3 = { martha: 3, brodor: 3, jaguar: 3 };

const SETUPS = process.env.SETUPS ? JSON.parse(process.env.SETUPS) : {
    'today (4 hearts)': { opponentLives: lives({}) },
    '5 hearts': { ...hearts(5), opponentLives: lives({}) },
    '6 hearts': { ...hearts(6), opponentLives: lives({}) },
    '4 hearts, bosses 3': { opponentLives: lives(bosses3) },
    '5 hearts, bosses 3': { ...hearts(5), opponentLives: lives(bosses3) },
    '6 hearts, bosses 3': { ...hearts(6), opponentLives: lives(bosses3) },
    '4 hearts, 2s, bosses 3': { opponentLives: lives({ ...twos, ...bosses3 }) },
    '5 hearts, 2s, bosses 3': { ...hearts(5), opponentLives: lives({ ...twos, ...bosses3 }) }
};

const order = S.TOURNAMENT;
for (const [name, numbers] of Object.entries(SETUPS)) {
    for (const [label, policy] of [['sensible', sensible], ['casual', casual]]) {
        if (label === 'casual' && !process.env.CASUAL) continue;
        let won = 0, portal = 0, ship = 0;
        for (let k = 0; k < runs; k++) {
            const r = S.playRun(policy, { numbers: { ...numbers, abilityUses: uses }, order, player: label });
            if (r.won) won++;
            if (r.defeated >= 5) portal++;
            if (r.defeated >= 10) ship++;
        }
        const pct = x => (100 * x / runs).toFixed(1).padStart(5);
        console.log(`${name.padEnd(26)} ${label.padEnd(8)} finish ${pct(won)}%  Yawning Portal ${pct(portal)}%  ship ${pct(ship)}%`);
    }
}
