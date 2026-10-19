// The keepsakes the Hooded Stranger offers, priced the same way: the gold each adds to a whole
// run for a player who has it from Klarg on (shops, picks spots and takes keepsakes by worth).
// Also the share of runs won. PLAYER=casual for the casual player; ONLY=loadedDie,potionBelt to
// pick some.
//   node balance/experiments/new-keepsakes.js [runs]
const S = require('../sim');
const { sensible, casual } = require('./runs');
const n = Number(process.argv[2] || 20000);
const who = process.env.PLAYER === 'casual' ? casual : sensible;

function measure(setup) {
    let gold = 0, won = 0;
    for (let k = 0; k < n; k++) {
        const r = S.playRun(who, { startAt: 1, setup, player: process.env.PLAYER || 'sensible' });
        gold += r.gold;
        if (r.won) won++;
    }
    return { gold: gold / n, won: won / n };
}

// Taking a keepsake as the Stranger hands it over (the Potion Belt comes with its Thonic).
const take = k => run => {
    run.keepsakes.push(k);
    if (k === 'potionBelt') run.shelf.push(S.DEFAULTS.keepsakes.beltThonic);
};

const base = measure(() => {});
console.log(`from Klarg on, ${n} runs each; no keepsake: ${Math.round(base.gold)} gold, ${(100 * base.won).toFixed(1)}% won`);
for (const k of process.env.ONLY ? process.env.ONLY.split(',') : S.KEEPSAKES) {
    const r = measure(take(k));
    console.log(`${k.padEnd(16)} +${String(Math.round(r.gold - base.gold)).padStart(4)} gold   wins ${(100 * r.won).toFixed(1)}%`);
}
