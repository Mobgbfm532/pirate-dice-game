const S = require('../sim');
const n = 8000;
const plan = (lives, hearts) => ({ opponentLives: lives, playerHearts: hearts });
const plans = {
  'now (3 hearts; 2,3,3,3,4)': plan({ molar: 2, klarg: 3, rokr: 3, hangman: 3, jaguar: 4 }, 3),
  'A (4 hearts; 2,2,3,3,4)': plan({ molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 4 }, 4),
  'B (4 hearts; 2,2,3,3,3)': plan({ molar: 2, klarg: 2, rokr: 3, hangman: 3, jaguar: 3 }, 4),
  'C (4 hearts; 1,2,2,3,3)': plan({ molar: 1, klarg: 2, rokr: 2, hangman: 3, jaguar: 3 }, 4),
};
for (const player of ['sensible', 'casual']) {
  for (const [name, numbers] of Object.entries(plans)) {
    const rates = [], rounds = [];
    for (let i = 0; i < 5; i++) {
      let w = 0, r = 0;
      for (let k = 0; k < n; k++) { const run = S.newRun({ ...S.DEFAULTS, ...numbers }); const f = S.fight(i, run, { player, numbers }); if (f.won) w++; r += f.rounds; }
      rates.push(w / n); rounds.push(r / n);
    }
    const all = rates.reduce((a, b) => a * b, 1);
    console.log(`${player.padEnd(8)} ${name.padEnd(27)} win% ${rates.map(x => String(Math.round(100 * x)).padStart(3)).join(' ')}  rounds ${rounds.map(x => x.toFixed(1)).join(' ')}  whole run ${(100 * all).toFixed(1)}%`);
  }
}
