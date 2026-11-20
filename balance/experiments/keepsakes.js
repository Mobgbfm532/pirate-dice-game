// The Hooded Stranger: what each keepsake is worth in gold (kept for the rest of the run, from
// each fight on), and what starting the next fight short of hearts costs.
const S = require('../sim');
const numbers = { opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, playerHearts: 4 };
const n = Number(process.env.N || 20000);
const straight = { choose: () => null, shop: () => [], shrine: () => 'gold', bet: () => 0, stranger: () => null };
const gold = (startAt, setup) => { let g = 0; for (let k = 0; k < n; k++) g += S.playRun(straight, { numbers, startAt, setup }).gold; return g / n; };
const base = [1, 2, 3, 4].map(i => gold(i, () => {}));
for (const k of S.KEEPSAKES) {
  const v = [1, 2, 3, 4].map((i, j) => gold(i, run => { run.keepsakes.push(k); }) - base[j]);
  console.log(k.padEnd(15), v.map(x => String(Math.round(x)).padStart(5)).join(' '));
}
for (const h of [3, 2]) {
  const v = [1, 2, 3, 4].map((i, j) => gold(i, run => { run.hearts = h; }) - base[j]);
  console.log(`start on ${h} hearts`.padEnd(15), v.map(x => String(Math.round(x)).padStart(5)).join(' '));
}
