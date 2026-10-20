// The 14-fight tournament (design doc, 20 Oct): the Ghoul and Gourd, the Yawning Portal's five,
// then Klarg's four aboard the Salty Swallow. Each fight on its own (fresh hearts, no
// items, with and without the ability), then whole runs.
//   node balance/experiments/tournament.js [runs] [fights]
const S = require('../sim');
const { sensible, casual } = require('./runs');
const runs = Number(process.argv[2] || 20000);
const fights = Number(process.argv[3] || 8000);

// Lives and hearts come from shared/balance.js (the user's, 20 Oct).
// Uses a fight: Mind Whip 1 (the user's); the rest first guesses (Inkfire 2 cost 19 points of
// Vaelin's fight, twice the others, so 1).
const numbers = {
    abilityUses: { mindWhip: 1, suckerPunch: 1, inkfire: 1, flourish: 1, divineSmite: 1, astralFlood: 1 },
    ...(process.env.NUMBERS ? JSON.parse(process.env.NUMBERS) : {})
};
const order = S.TOURNAMENT;
const pct = (x, n) => (100 * x / n).toFixed(1);

function fightRate(i, player, withAbility) {
    const o = withAbility ? order : order.map((x, k) => (k === i ? { ...x, ability: null } : x));
    let won = 0;
    for (let k = 0; k < fights; k++) {
        const run = S.newRun({ ...S.DEFAULTS, ...numbers });
        if (S.fight(i, run, { player, numbers, order: o }).won) won++;
    }
    return won / fights;
}

console.log(`Each fight, fresh on ${numbers.playerHearts || S.DEFAULTS.playerHearts} hearts, no items (${fights} fights): win % with the ability (without)`);
for (const player of ['sensible', 'casual']) {
    const cells = order.map((o, i) => `${o.id} ${pct(fightRate(i, player, true) * fights, fights)}` + (o.ability ? ` (${pct(fightRate(i, player, false) * fights, fights)})` : ''));
    console.log(`  ${player}: ${cells.join(', ')}`);
}

console.log(`\nWhole runs (${runs} each): finish, reach the Yawning Portal / the ship, gold, where runs end`);
for (const [label, policy] of [['sensible', sensible], ['casual', casual]]) {
    let won = 0, gold = 0;
    const fell = new Array(order.length + 1).fill(0);
    for (let k = 0; k < runs; k++) {
        const r = S.playRun(policy, { numbers, order, player: label });
        if (r.won) won++;
        gold += r.gold;
        fell[r.defeated]++;
    }
    const reached = n => fell.slice(n).reduce((a, b) => a + b, 0);
    console.log(`  ${label}: finish ${pct(won, runs)}%, Yawning Portal ${pct(reached(5), runs)}%, the ship ${pct(reached(10), runs)}%, gold avg ${Math.round(gold / runs)}`);
    console.log(`    fell to: ${order.map((o, i) => `${o.id} ${pct(fell[i], runs)}`).join(', ')}`);
}
