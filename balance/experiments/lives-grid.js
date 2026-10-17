const S = require('../sim');
const n = 6000;
const rate = (i, player, lives, hearts) => {
  let w = 0;
  const numbers = { opponentLives: { ...S.DEFAULTS.opponentLives, [S.OPPONENTS[i].id]: lives }, playerHearts: hearts };
  for (let k = 0; k < n; k++) { const run = S.newRun({ ...S.DEFAULTS, ...numbers }); if (S.fight(i, run, { player, numbers }).won) w++; }
  return Math.round(100 * w / n);
};
for (const player of ['sensible', 'casual']) {
  console.log(`\n${player} player: fight win % (rows: opponent; columns: opponent lives 1/2/3/4 with player 3 hearts | lives 2/3 with player 4 hearts)`);
  for (let i = 0; i < 5; i++) {
    const row = [1, 2, 3, 4].map(l => rate(i, player, l, 3));
    const row4 = [2, 3].map(l => rate(i, player, l, 4));
    console.log(S.OPPONENTS[i].id.padEnd(8), row.map(x => String(x).padStart(3)).join(' '), ' |', row4.map(x => String(x).padStart(3)).join(' '));
  }
}
