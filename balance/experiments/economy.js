// The gold economy of a whole Tavern Crawl (17 Nov): what a player who wins every fight earns,
// loses to thieves and can spend, stop by stop, under shared/balance.js. No dice: hearts left at
// each win come from the simulator (sensible player, fresh, no items; hearts.js numbers below).
//   node balance/experiments/economy.js [runs] [policy: keen|frugal|hoard]
const B = require('../../shared/balance');
const runs = Number(process.argv[2] || 20000), policyName = process.argv[3] || 'keen';
const I = B.interlude, G = B.gold;
// [1 heart, 2, 3] left at a win, % (sim.js, 3,000 fights each, 17 Nov). Áéd taken as Rokr.
const HEARTS = {
  molar: [11, 32, 57], frak: [27, 36, 37], danhausen: [32, 39, 28], duke: [43, 41, 16], martha: [39, 37, 24],
  sylvester: [41, 39, 19], vaelin: [44, 41, 15], stason: [46, 37, 17], ridgeler: [35, 32, 32], brodor: [43, 35, 22],
  klarg: [58, 36, 6], rokr: [48, 34, 17], aed: [48, 34, 17], hangman: [49, 41, 9], jaguar: [55, 26, 19]
};
const ORDER = Object.keys(HEARTS);
const PLACE = i => (i < 5 ? 'gg' : i < 10 ? 'portal' : 'ship');
const SPOTS = { gg: ['thom', 'shrine', 'hotTub', 'elfKid'], portal: ['thom', 'shrine', 'bard', 'elfKid'], ship: ['thom', 'shrine', 'jorvash', 'yvesil'] };
const KEEPSAKE_PREF = ['bentCopper', 'potionBelt', 'velvetCushion', 'luckySeat', 'gamblersCharm', 'loadedDie', 'bottomlessFlask', 'loyaltyCard', 'misersPurse', 'gildedDie', 'brensCompass'];
const PORTAL_ON = ['bentCopper', 'loadedDie', 'gildedDie'], SHIP_ON = ['brensCompass'];
const d6 = () => 1 + Math.floor(Math.random() * 6);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const heartsLeft = id => { const r = Math.random() * 100, [a, b] = HEARTS[id]; return r < a ? 1 : r < a + b ? 2 : 3; };
// PLACE_PRICES=1,1.5,2 (env): every price at the Ghoul and Gourd, the Yawning Portal, the ship multiplied (a proposal).
const MULT = process.env.PLACE_PRICES ? process.env.PLACE_PRICES.split(',').map(Number) : ['ghoulAndGourd', 'yawningPortal', 'saltySwallow'].map(k => (B.placePrice || {})[k] || 1);
let here = 0;
const rising = (run, id, base) => Math.ceil(base * MULT[here] * (1 + B.priceRise * (run.bought[id] || 0)));

const POLICIES = {
  // keen: spends on what helps whenever it can (a real player who likes shopping)
  keen: { keepsakes: true, healingsWanted: 99, takeShrine: true, extras: true },
  // frugal: a Healing when the shelf is empty, a keepsake only the Shield
  frugal: { keepsakes: ['bentCopper'], healingsWanted: 1, takeShrine: false, extras: false },
  // hoard: never spends (the ceiling)
  // saver: a Healing only when the shelf is empty, any keepsake it can afford
  saver: { keepsakes: true, healingsWanted: 1, takeShrine: false, extras: false },
  hoard: null
};
const P = POLICIES[policyName];

function runOnce(stats) {
  const run = { purse: 0, bought: {}, shelf: [], keepsakes: [], thieves: {}, spent: 0, stolen: 0, cantAfford: 0 };
  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i], place = PLACE(i); here = i < 5 ? 0 : i < 10 ? 1 : 2;
    // The fight: Thonics drunk (about one in two fights uses a Healing)
    if (run.shelf.length && Math.random() < 0.5) run.shelf.pop();
    const hl = heartsLeft(id);
    const miser = run.keepsakes.includes('misersPurse') ? Math.floor(run.purse / (B.keepsakes.miserEvery ?? 5)) : 0;
    const earned = G.winFirst + G.winStep * i + G.perHeartLeft * hl + miser;
    run.purse += earned;
    stats.earned[i] += earned; stats.purseAfterWin[i].push(run.purse);
    if (i === ORDER.length - 1) break;
    if (id === 'martha' || id === 'brodor') { if (run.keepsakes.length < B.maxKeepsakes) run.keepsakes.push(id === 'martha' ? 'mysteryFlavour' : 'sunglasses'); continue; }
    // The walk: events ashore
    if (place !== 'ship') {
      const steal = Math.floor(run.purse * I.pickpocketShare);
      if (steal > 0 && (run.thieves[place] || 0) < I.pickpocketMaxPerPlace && Math.random() * 100 < I.pickpocketChance) {
        run.thieves[place] = (run.thieves[place] || 0) + 1;
        if (d6() < I.pickpocketCatch) { run.purse -= steal; run.stolen += steal; }
      } else if (place === 'gg' && Math.random() * 100 < I.darrenChance) {
        const r = d6(); if (r > I.darrenGift) run.purse += I.darrenCatchGold;
      }
    }
    if (!P) continue;
    // The two spots: pick the one with the most worth buying
    const spots = shuffle(SPOTS[place]).slice(0, 2);
    const wantThom = () => run.shelf.length < 2 + (run.keepsakes.includes('potionBelt') ? 1 : 0) || P.keepsakes;
    let spot = spots.includes('thom') && wantThom() ? 'thom' : spots.includes('shrine') && P.takeShrine ? 'shrine' : pick(spots);
    const buy = (key, base) => { const c = rising(run, key, base); if (run.purse < c) { run.cantAfford++; return false; } run.purse -= c; run.spent += c; run.bought[key] = (run.bought[key] || 0) + 1; return true; };
    if (spot === 'thom') {
      if (P.keepsakes && run.keepsakes.length < B.maxKeepsakes) {
        const shelf = shuffle(KEEPSAKE_PREF.filter(k => !run.keepsakes.includes(k) && (place !== 'gg' || !PORTAL_ON.includes(k)) && (place === 'ship' || !SHIP_ON.includes(k)))).slice(0, B.thomKeepsakes);
        const wanted = KEEPSAKE_PREF.filter(k => shelf.includes(k) && (P.keepsakes === true || P.keepsakes.includes(k)));
        for (const k of wanted) { const c = Math.ceil(B.keepsakePrices[k] * MULT[here]); if (run.purse >= c && run.keepsakes.length < B.maxKeepsakes) { run.purse -= c; run.spent += c; run.keepsakes.push(k); stats.keepsakeAt[k] = stats.keepsakeAt[k] || []; stats.keepsakeAt[k].push(i); } else if (run.purse < c) run.cantAfford++; }
      }
      const room = 2 + (run.keepsakes.includes('potionBelt') ? 1 : 0);
      let want = Math.min(P.healingsWanted, room) - run.shelf.length;
      while (want-- > 0 && buy('healing', B.thonicPrices.healing)) run.shelf.push('healing');
    } else if (spot === 'shrine') buy('shrine', I.shrinePrice);
    else if (P.extras) {
      const base = { hotTub: I.hotTubPrice, bard: I.bardPrice, jorvash: I.jorvashPrice, yvesil: I.yvesilPrice, elfKid: 11 }[spot];
      buy(spot, base);
    }
    stats.purseAtStop[i].push(run.purse);
    if (i === 3) stats.gourdKeepsakes.push(run.keepsakes.length);
  }
  stats.left.push(run.purse); stats.spent.push(run.spent); stats.stolen.push(run.stolen); stats.cantAfford.push(run.cantAfford); stats.keepsakes.push(run.keepsakes.length);
}
const stats = { earned: ORDER.map(() => 0), purseAfterWin: ORDER.map(() => []), purseAtStop: ORDER.map(() => []), left: [], spent: [], stolen: [], cantAfford: [], keepsakes: [], keepsakeAt: {}, gourdKeepsakes: [] };
for (let k = 0; k < runs; k++) runOnce(stats);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`policy ${policyName}, ${runs} runs that win every fight`);
console.log('fight      earned  purse after win (median)  purse leaving the stop (median)');
ORDER.forEach((id, i) => console.log(`${id.padEnd(10)} ${(stats.earned[i] / runs).toFixed(1).padStart(6)}  ${String(med(stats.purseAfterWin[i])).padStart(6)}  ${String(med(stats.purseAtStop[i])).padStart(8)}`));
console.log(`earned in all ${Math.round(stats.earned.reduce((a, b) => a + b) / runs)}, spent ${Math.round(avg(stats.spent))}, stolen ${Math.round(avg(stats.stolen))}, left at the end ${Math.round(avg(stats.left))} (median ${med(stats.left)}), keepsakes ${avg(stats.keepsakes).toFixed(1)}, times short of gold ${avg(stats.cantAfford).toFixed(1)}`);
if (stats.gourdKeepsakes.length) { const g = stats.gourdKeepsakes; console.log('keepsakes leaving the Ghoul and Gourd: ' + [0, 1, 2, 3].map(n => n + (n === 3 ? '+' : '') + ' ' + (100 * g.filter(x => (n === 3 ? x >= 3 : x === n)).length / g.length).toFixed(0) + '%').join(', ')); }
for (const [k, a] of Object.entries(stats.keepsakeAt)) console.log(`  ${k}: bought in ${(100 * a.length / runs).toFixed(0)}% of runs, median after fight ${med(a) + 1}`);
