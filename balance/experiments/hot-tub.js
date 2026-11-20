// The Wild Magic Hot Tub's surges: what each does to the next fight's win chance (sensible
// player, fresh hearts, no items), against no surge. Then the average soak, by weight.
//   node balance/experiments/hot-tub.js [fights]
const S = require('../sim');
const n = Number(process.argv[2] || 6000);
const weights = S.DEFAULTS.interlude.hotTubSurges;

function rate(index, surge) {
    let won = 0;
    for (let k = 0; k < n; k++) {
        const run = S.newRun(S.DEFAULTS);
        if (surge === 'pruney') run.hearts = S.DEFAULTS.playerHearts - 1;
        else run.nextSurge = surge;
        if (S.fight(index, run, { player: 'sensible' }).won) won++;
    }
    return 100 * won / n;
}

for (const index of [1, 4, 5]) {
    const none = rate(index, null);
    const rows = Object.keys(weights).map(id => [id, rate(index, id) - none]);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const avg = rows.reduce((a, [id, d]) => a + d * weights[id], 0) / total;
    console.log(`${S.OPPONENTS[index].id.padEnd(8)} no surge ${none.toFixed(1)}%  ` + rows.map(([id, d]) => `${id} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`).join('  ') + `  | average soak ${avg >= 0 ? '+' : ''}${avg.toFixed(1)} points`);
}
