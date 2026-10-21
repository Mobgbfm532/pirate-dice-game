// What things are worth in gold to a sensible player's run (21 Oct), to price keepsakes on Thom's
// back shelf and the Shrine and the hot tub: average final gold with it against without.
//   node balance/experiments/prices.js [runs]
const S = require('../sim');
const { sensible } = require('./runs');
const runs = Number(process.argv[2] || 8000);

function average(opts, policy = sensible) {
    let gold = 0, won = 0;
    for (let k = 0; k < runs; k++) {
        const r = S.playRun(policy, { player: 'sensible', ...opts });
        gold += r.gold;
        if (r.won) won++;
    }
    return { gold: gold / runs, won: 100 * won / runs };
}

const base = average({});
console.log(`no keepsake: gold ${Math.round(base.gold)}, finish ${base.won.toFixed(1)}%`);
// A keepsake bought after the first fight (from Frak on): held for the run.
for (const id of S.KEEPSAKES) {
    const r = average({ setup: run => run.keepsakes.push(id) });
    console.log(`${id.padEnd(14)} worth ${String(Math.round(r.gold - base.gold)).padStart(5)} gold   finish ${r.won.toFixed(1)}%`);
}

// The Shrine and the hot tub: a player who always goes there when offered, against one who never
// does (both free); the difference over the number of visits is one visit's worth.
const always = spot => ({ ...sensible, choose: (run, spots, N, next) => (spots.includes(spot) ? spot : sensible.choose(run, spots.filter(s => s !== spot), N, next)) });
const never = spot => ({ ...sensible, choose: (run, spots, N, next) => sensible.choose(run, spots.filter(s => s !== spot), N, next) });
for (const spot of ['shrine', 'hotTub']) {
    let visits = 0;
    const counting = { ...always(spot), choose: (...a) => { const c = always(spot).choose(...a); if (c === spot) visits++; return c; } };
    const yes = average({}, counting), no = average({}, never(spot));
    console.log(`${spot.padEnd(14)} a visit is worth ${Math.round((yes.gold - no.gold) / (visits / runs))} gold (${(visits / runs).toFixed(2)} visits a run; finish ${no.won.toFixed(1)}% -> ${yes.won.toFixed(1)}%)`);
}
