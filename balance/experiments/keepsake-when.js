// What a keepsake adds to a run's gold when it's bought before a given fight (21 Oct): for pricing
// Thom's back shelf at the moments players can afford it.
//   node balance/experiments/keepsake-when.js [runs]
const S = require('../sim');
const { sensible } = require('./runs');
const runs = Number(process.argv[2] || 6000);
const avg = opts => { let g = 0, purse = 0; for (let k = 0; k < runs; k++) { const r = S.playRun(sensible, { player: 'sensible', ...opts }); g += r.gold; } return g / runs; };
const base = avg({});
// The purse a sensible player has walked in with, before each fight (for what they can afford).
const purseAt = new Array(9).fill(0), reached = new Array(9).fill(0);
for (let k = 0; k < runs; k++) {
    const r = S.playRun(sensible, { player: 'sensible', setup: run => { run.trace = []; } });
}
console.log(`baseline gold ${Math.round(base)}`);
for (const index of [2, 3, 5]) {
    const cells = S.KEEPSAKES.map(id => `${id} ${Math.round(avg({ grantAt: { index, id } }) - base)}`);
    console.log(`bought before fight ${index + 1} (${S.OPPONENTS[index].id}): ${cells.join(', ')}`);
}
