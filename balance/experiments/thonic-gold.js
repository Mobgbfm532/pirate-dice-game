// What each Thonic is worth in gold (the score): the extra final purse from holding one at
// the start of each fight, against holding none. Player challenges straight away (no events).
const S = require('../sim');
const plan = { opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, playerHearts: 4 };
const numbers = { ...plan, ...(process.env.NUMBERS ? JSON.parse(process.env.NUMBERS) : {}) };
const n = Number(process.env.N || 20000);
const straight = { choose: () => null, shop: () => [], shrine: () => 'gold', bet: () => 0, stranger: () => null };
const meanGold = (startAt, shelf) => { let g = 0; for (let k = 0; k < n; k++) g += S.playRun(straight, { numbers, startAt, shelf }).gold; return g / n; };
const base = [0, 1, 2, 3, 4].map(i => meanGold(i, []));
console.log('expected gold from here on, no Thonics:', base.map(x => Math.round(x)).join(' / '));
for (const t of S.THONIC_IDS) {
  const v = [0, 1, 2, 3, 4].map(i => meanGold(i, [t]) - base[i]);
  console.log(t.padEnd(15), v.map(x => String(Math.round(x)).padStart(5)).join(' '));
}
