// The Salty Swallow reworked as the final tier (25 Oct): each fight's win chance for a sensible
// player, fresh hearts, against the Yawning Portal's five (the place before) and the ship as it
// was. With no Thonics, and with two on the shelf (Jaguar's Smooth Talk drinks yours).
//   node balance/experiments/final-ship.js [fights]
//   USES='{"reachAround":2,"writtenInStars":2,"deadEye":2,"jaguarPhases":9}' STARS='{"everyThrow":true}'
const S = require('../sim');
const fights = Number(process.argv[2] || 8000);
const base = { mindWhip: 1, suckerPunch: 1, inkfire: 1, flourish: 1, divineSmite: 1, astralFlood: 1 };
// The reworked ship plays shared/balance.js (abilityUses, finalShip); USES / STARS / JAGUAR /
// KLARG / DEADEYE override for experiments. The ship as it was: one steal, as before 25 Oct.
const uses = process.env.USES ? JSON.parse(process.env.USES) : {};
const stars = { everyThrow: true, ...(process.env.STARS ? JSON.parse(process.env.STARS) : {}) };

function rate(order, i, numbers, shelf = []) {
    let won = 0;
    for (let k = 0; k < fights; k++) {
        const run = S.newRun({ ...S.DEFAULTS, ...numbers });
        run.shelf = shelf.slice();
        if (S.fight(i, run, { numbers, order }).won) won++;
    }
    return (100 * won / fights).toFixed(1);
}

const old = { abilityUses: { ...S.DEFAULTS.abilityUses, ...base, reachAround: 1 } };
const fresh = { abilityUses: { ...S.DEFAULTS.abilityUses, ...base, ...uses }, stars, jaguar: process.env.JAGUAR ? JSON.parse(process.env.JAGUAR) : {},
    klarg: process.env.KLARG ? JSON.parse(process.env.KLARG) : {}, deadEye: process.env.DEADEYE ? JSON.parse(process.env.DEADEYE) : {} };
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // e.g. ONLY=hangman,jaguar
const twoThonics = ['healing', 'steady'];

console.log(`Win % for a sensible player, fresh hearts (${fights} fights each); uses ${JSON.stringify(uses)}, stars ${JSON.stringify(stars)}`);
if (!only) console.log('The Yawning Portal (no items):', S.TOURNAMENT.slice(5, 10).map((o, k) => `${o.id} ${rate(S.TOURNAMENT, 5 + k, old)}`).join(', '));
for (let k = 0; k < 4; k++) {
    const i = 10 + k;
    const id = S.TOURNAMENT[i].id;
    if (only && !only.includes(id)) continue;
    const without = S.TOURNAMENT.map((o, j) => (j === i ? { ...o, ability: null, abilities: null } : o));
    console.log(`${id.padEnd(8)} no ability ${rate(without, i, old)} | as it was ${rate(S.TOURNAMENT, i, old)} | reworked ${rate(S.TOURNAMENT_FINAL, i, fresh)}` +
        ` (with Healing + Steady: as it was ${rate(S.TOURNAMENT, i, old, twoThonics)}, reworked ${rate(S.TOURNAMENT_FINAL, i, fresh, twoThonics)})`);
}
