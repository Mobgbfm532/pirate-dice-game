// Clear-Eye and Steady as they are, and with a changed effect: gold added from holding one
// at the start of each fight (Klarg ... Jaguar), and fight win % added.
const S = require('../sim');
const numbers = { opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, playerHearts: 4 };
const n = Number(process.env.N || 20000);
const straight = { choose: () => null, shop: () => [], shrine: () => 'gold', bet: () => 0, stranger: () => null };
const gold = (startAt, shelf, effects) => { let g = 0; for (let k = 0; k < n; k++) g += S.playRun(straight, { numbers, startAt, shelf, effects }).gold; return g / n; };
for (const [label, t, effects] of [['Clear-Eye now (one round)', 'clearEye', {}], ['Clear-Eye: cancels the next', 'clearEye', { clearEye: 'cancelNext' }], ['Steady now (dust = 0)', 'steady', {}], ['Steady: dice score as they lie', 'steady', { steady: 'asTheyLie' }]]) {
  const v = [1, 2, 3, 4].map(i => gold(i, [t], effects) - gold(i, [], effects));
  console.log(label.padEnd(32), v.map(x => String(Math.round(x)).padStart(5)).join(' '));
}
