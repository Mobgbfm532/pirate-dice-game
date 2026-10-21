// Ways to make the nine-fight Tavern Crawl easier without more hearts (21 Oct): each against
// today's game, whole runs for a sensible player.
//   node balance/experiments/easier.js [runs]
const S = require('../sim');
const { sensible } = require('./runs');
const runs = Number(process.argv[2] || 10000);
const D = S.DEFAULTS;
const noAbility = Object.fromEntries(Object.keys(D.abilityUses).map(k => [k, 0]));
const halfPrice = Object.fromEntries(Object.entries(D.thonicPrices).map(([k, v]) => [k, Math.round(v / 2)]));

const SETUPS = {
    'today': {},
    'abilities once a fight each': { numbers: { abilityUses: Object.fromEntries(Object.keys(D.abilityUses).map(k => [k, 1])) } },
    'no abilities at all': { numbers: { abilityUses: noAbility } },
    'Ghoul and Gourd play simply': { simpleBots: ['frak', 'danhausen', 'duke', 'martha'] },
    'every opponent plays simply': { simpleBots: ['frak', 'danhausen', 'duke', 'martha', 'klarg', 'rokr', 'hangman', 'jaguar'] },
    'you always roll second': { playerSecond: true },
    'Thonics half price': { numbers: { thonicPrices: halfPrice } },
    'start with a Healing Thonic': { shelf: ['healing'] },
    'shelf of 3': { numbers: { shelfSize: 3 } },
    'a 24 heals 2 hearts': { setup: run => run.keepsakes.push('blessedTankard') },
    'start with the Shield': { setup: run => run.keepsakes.push('bentCopper') },
    'every opponent 1 life fewer (min 1)': { numbers: { opponentLives: Object.fromEntries(Object.entries(D.opponentLives).map(([k, v]) => [k, Math.max(1, v - 1)])) } }
};

for (const [name, setup] of Object.entries(SETUPS)) {
    let won = 0, final = 0;
    for (let k = 0; k < runs; k++) {
        const r = S.playRun(sensible, { player: 'sensible', ...setup, numbers: { ...(setup.numbers || {}) } });
        if (r.won) won++;
        if (r.defeated >= 5) final++;
    }
    console.log(`${name.padEnd(38)} finish ${(100 * won / runs).toFixed(1).padStart(5)}%   reach the Yawning Portal ${(100 * final / runs).toFixed(1).padStart(5)}%`);
}
