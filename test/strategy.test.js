// The Tavern Crawl opponents' best play (shared/strategy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../shared/rules');
const Strategy = require('../shared/strategy');

const die = (id, value, status = 'active') => ({ id, value, status });
const kept = (id, value) => die(id, value, 'permanentlyLocked');

// Plays one whole turn with a chooser, on dice from a seeded generator. Returns the finish:
// 1 = beat toBeat (or valid, when toBeat is null), 0.5 = tie, 0 = otherwise.
function playTurn(choose, toBeat, seed) {
    const face = () => { seed = (seed * 16807) % 2147483647; return (seed % 6) + 1; };
    const turn = Rules.createTurn('BOT');
    while (!turn.finalized) {
        assert.ok(Rules.rollTurn(turn, { rollFace: face }), 'the bot can always roll');
        const ids = choose(turn);
        assert.ok(ids.length >= 1, 'keeps at least one die');
        ids.forEach(id => assert.ok(Rules.toggleDie(turn, id), 'keeps only dice it may'));
    }
    const { busted, score } = turn.outcome;
    if (busted) return 0;
    if (toBeat === null) return 1;
    return score > toBeat ? 1 : score === toBeat ? 0.5 : 0;
}

test('it keeps the 5, not the 4, when the 4 can only lose', () => {
    // Kept: 2, 4, 6, 6 (12 points). Rolled: 4 and 5. To beat: 22.
    // Keeping the 4 leaves at best a tie; keeping both makes 21 and loses; keeping the 5 and
    // rolling one more die wins on a 6 and ties on a 5.
    const dice = [kept(0, 2), kept(1, 4), kept(2, 6), kept(3, 6), die(4, 4), die(5, 5)];
    assert.deepEqual(Strategy.bestKeeps(dice, 22), [5]);
});

test('it always takes a 2 or 4 it still needs when one shows (one of each)', () => {
    // Pure best play keeps a lone 6 here and leaves the 2s and 4s; the opponents take them.
    const first = [2, 2, 2, 1, 4, 4].map((v, i) => die(i, v));
    const values = ids => ids.map(id => first[id].value).sort();
    const keeps = values(Strategy.bestKeeps(first, 20));
    assert.equal(keeps.filter(v => v === 2).length, 1, 'one 2');
    assert.equal(keeps.filter(v => v === 4).length, 1, 'one 4');
    // A 4 already kept: only the 2 is still needed.
    const later = [kept(0, 4), kept(1, 6), die(2, 2), die(3, 3), die(4, 6), die(5, 1)];
    assert.ok(Strategy.bestKeeps(later, 22).includes(2), 'takes the needed 2');
    // Across many turns at many targets, a needed 2 or 4 is never left showing.
    for (const toBeat of [undefined, null, 16, 20, 22]) {
        for (let seed = 1; seed <= 200; seed++) {
            playTurn(turn => {
                const ids = Strategy.bestKeeps(turn.dice, toBeat);
                const keptValues = turn.dice.filter(d => d.status !== 'active').map(d => d.value);
                for (const v of [2, 4]) {
                    if (keptValues.includes(v) || !turn.dice.some(d => d.status === 'active' && d.value === v)) continue;
                    assert.ok(ids.some(id => turn.dice[id].value === v), `took the needed ${v} (to beat ${toBeat})`);
                }
                return ids;
            }, toBeat, seed * 7919);
        }
    }
});

test('it stops and keeps everything once the hand already wins', () => {
    const dice = [2, 4, 6, 6, 6, 5].map((v, i) => die(i, v));
    assert.deepEqual(Strategy.bestKeeps(dice, 20).sort(), [0, 1, 2, 3, 4, 5]);
});

test('it never keeps a die that is already kept or gone', () => {
    const dice = [kept(0, 2), die(1, 3, 'stolen'), die(2, 4), die(3, 1), die(4, 6), die(5, 6)];
    const ids = Strategy.bestKeeps(dice, 15);
    assert.ok(ids.length >= 1);
    ids.forEach(id => assert.equal(dice[id].status, 'active'));
});

test('its exact chances match thousands of simulated turns', () => {
    for (const toBeat of [16, 20, null]) {
        let total = 0;
        const runs = 6000;
        for (let i = 1; i <= runs; i++) total += playTurn(t => Strategy.bestKeeps(t.dice, toBeat), toBeat, i * 7919);
        const simulated = total / runs, exact = Strategy.chanceFromStart(toBeat);
        assert.ok(Math.abs(simulated - exact) < 0.025, `to beat ${toBeat}: simulated ${simulated.toFixed(3)}, exact ${exact.toFixed(3)}`);
    }
});

test('it beats high scores far more often than the old fixed habits', () => {
    for (const [toBeat, margin] of [[18, 0.07], [20, 0.12], [22, 0.1]]) {
        let best = 0, old = 0;
        const runs = 6000;
        for (let i = 1; i <= runs; i++) {
            best += playTurn(t => Strategy.bestKeeps(t.dice, toBeat), toBeat, i * 104729);
            old += playTurn(t => Rules.planBotLocks(t, 'klarg', toBeat), toBeat, i * 104729);
        }
        assert.ok((best - old) / runs > margin, `to beat ${toBeat}: best ${(best / runs).toFixed(3)} vs old ${(old / runs).toFixed(3)}`);
    }
});

test('the chances make sense', () => {
    const valid = Strategy.chanceFromStart(null);
    assert.ok(valid > 0.94 && valid < 0.97, 'a valid hand about 19 times in 20');
    let previous = 1;
    for (let t = 4; t <= 24; t++) {
        const p = Strategy.chanceFromStart(t);
        assert.ok(p <= previous + 1e-9, 'higher scores are harder to beat');
        previous = p;
    }
    assert.ok(Strategy.chanceFromStart(24) < 0.05, 'a 24 can only be tied');
    assert.ok(Strategy.chanceFromStart(22, { aceAt16: true }) > Strategy.chanceFromStart(22) + 0.2, 'the Hangman\'s Ace helps him');
    const first = Strategy.chanceFromStart(undefined);
    assert.ok(first > 0.4 && first < 0.65, `going first is about even (${first.toFixed(3)})`);
    const d = Strategy.sensiblePlayerScores();
    const sum = d.dust + d.score.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, 'the player\'s scores add up to certainty');
});
