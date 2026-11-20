const S = require('../sim');
const numbers = { opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, playerHearts: 4 };
const n = 20000;
const rate = (i, shelf) => { let w = 0; for (let k = 0; k < n; k++) { const run = S.newRun({ ...S.DEFAULTS, ...numbers }); run.shelf = shelf.slice(); if (S.fight(i, run, { numbers }).won) w++; } return w / n; };
const base = [0, 1, 2, 3, 4].map(i => rate(i, []));
console.log('base       ', base.map(x => (100 * x).toFixed(1).padStart(5)).join(' '));
for (const t of S.THONIC_IDS) {
  const r = [0, 1, 2, 3, 4].map(i => rate(i, [t]));
  console.log(t.padEnd(14), r.map((x, i) => ('+' + (100 * (x - base[i])).toFixed(1)).padStart(5)).join(' '), '  avg +' + (100 * r.reduce((a, x, i) => a + x - base[i], 0) / 5).toFixed(1));
}
