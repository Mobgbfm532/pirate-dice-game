// The Lady's blessings: gold added from each fight on (Klarg ... Jaguar) by her Favour (the
// next fight starts with an extra heart) and her Grace (the next dust that would cost a heart
// doesn't), against the old Shrine (a free Healing Thonic, or 125 gold).
const S = require('../sim');
const n = Number(process.env.N || 20000);
const straight = { choose: () => null, shop: () => [], shrine: () => 'gold', bet: () => 0, stranger: () => null };
const gold = (startAt, setup) => { let g = 0; for (let k = 0; k < n; k++) g += S.playRun(straight, { startAt, setup }).gold; return g / n; };
const base = [1, 2, 3, 4].map(i => gold(i, () => {}));
const row = (label, setup) => console.log(label.padEnd(26), [1, 2, 3, 4].map((i, j) => String(Math.round(gold(i, setup) - base[j])).padStart(5)).join(' '));
row("Favour (5 hearts next)", run => { run.hearts = S.DEFAULTS.playerHearts + S.DEFAULTS.interlude.favourHearts; });
row("Grace (a dust forgiven)", run => { run.grace = true; });
row("old: a Healing Thonic", run => { run.shelf.push('healing'); });
console.log('old: 125 gold'.padEnd(26), '  125   125   125   125');
