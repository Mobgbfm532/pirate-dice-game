// How much each opponent's ability matters as it is used more often in a fight, and what a
// Clear-Eye Thonic held from the start of the fight adds (fight win %, plan A hearts/lives).
const S = require('../sim');
const plan = { opponentLives: { molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, playerHearts: 4 };
const n = Number(process.env.N || 12000);
const rate = (i, uses, shelf) => {
  const numbers = { ...plan, abilityUses: { ...S.DEFAULTS.abilityUses, ...uses } };
  let w = 0;
  for (let k = 0; k < n; k++) { const run = S.newRun({ ...S.DEFAULTS, ...numbers }); run.shelf = shelf.slice(); if (S.fight(i, run, { numbers }).won) w++; }
  return 100 * w / n;
};
const rows = [[1, 'reachAround'], [2, 'constellationBlur'], [3, 'deadeye24'], [4, 'smoothTalk']];
for (const [i, a] of rows) {
  const off = rate(i, { [a]: 0 }, []);
  const cells = [1, 2, 3, 5, 99].map(u => { const b = rate(i, { [a]: u }, []); const c = rate(i, { [a]: u }, ['clearEye']); return `${u === 99 ? 'every' : u}: ${b.toFixed(0)}% (Clear-Eye +${(c - b).toFixed(1)})`; });
  console.log(`${S.OPPONENTS[i].id.padEnd(8)} no ability ${off.toFixed(0)}% | ` + cells.join(' | '));
}
