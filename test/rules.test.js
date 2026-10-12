const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../shared/rules');

const { STATUS, CALLOUT, SUSPENSE } = Rules;

// Returns a rollFace function that hands out the given values in order.
function faces(...values) {
    let i = 0;
    return () => {
        if (i >= values.length) throw new Error('ran out of scripted dice');
        return values[i++];
    };
}

function lockValues(turn, ...values) {
    values.forEach(value => {
        let die = turn.dice.find(d => d.status === STATUS.ACTIVE && d.value === value);
        assert.ok(die, `no active ${value} to lock`);
        assert.ok(Rules.toggleDie(turn, die.id));
    });
}

test('scoreDice: first 2 and first 4 are required, the rest score', () => {
    const dice = [2, 4, 6, 6, 6, 6].map((value, id) => ({ id, value, status: STATUS.LOCKED }));
    assert.deepEqual(Rules.scoreDice(dice), { has2: true, has4: true, score: 24 });

    const extraTwo = [2, 2, 4, 6, 6, 5].map((value, id) => ({ id, value, status: STATUS.LOCKED }));
    assert.deepEqual(Rules.scoreDice(extraTwo), { has2: true, has4: true, score: 19 });
});

test('scoreDice ignores active and stolen dice', () => {
    const dice = [
        { id: 0, value: 2, status: STATUS.LOCKED },
        { id: 1, value: 4, status: STATUS.LOCKED_THIS_ROLL },
        { id: 2, value: 6, status: STATUS.ACTIVE },
        { id: 3, value: 6, status: STATUS.STOLEN }
    ];
    assert.deepEqual(Rules.scoreDice(dice), { has2: true, has4: true, score: 0 });
});

test('a perfect 24 in one roll is "blessed"', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 4, 6, 6, 6, 6) });
    lockValues(turn, 2, 4, 6, 6, 6);
    assert.equal(turn.finalized, false);
    lockValues(turn, 6);
    assert.equal(turn.finalized, true);
    assert.deepEqual(turn.outcome, { busted: false, score: 24, suspense: SUSPENSE.NONE, rollCount: 1 });
    assert.equal(turn.callout, CALLOUT.BLESSED);
});

test('locking everything without a 4 is dust', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 1, 1, 1, 1, 1) });
    lockValues(turn, 2, 1, 1, 1, 1, 1);
    assert.equal(turn.outcome.busted, true);
    assert.equal(turn.outcome.score, 0);
    assert.equal(turn.callout, CALLOUT.DUST);
});

test('must lock at least one die before rolling again', () => {
    const turn = Rules.createTurn('p1');
    assert.ok(Rules.rollTurn(turn, { rollFace: faces(1, 1, 1, 1, 1, 3) }));
    assert.equal(Rules.canRoll(turn), false);
    assert.equal(Rules.rollTurn(turn, { rollFace: faces() }), null);
    lockValues(turn, 3);
    assert.equal(Rules.canRoll(turn), true);
});

test('locked dice stay locked; only active dice reroll', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 3, 3, 3, 3, 3) });
    lockValues(turn, 2);
    Rules.rollTurn(turn, { rollFace: faces(4, 5, 5, 5, 5) });
    assert.equal(turn.dice[0].status, STATUS.LOCKED);
    assert.equal(turn.dice[0].value, 2);
    assert.equal(Rules.toggleDie(turn, 0), null, 'cannot unlock a die from an earlier roll');
    assert.deepEqual(turn.dice.slice(1).map(d => d.value), [4, 5, 5, 5, 5]);
});

test('unlocking a die this roll puts it back', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 3, 3, 3, 3, 3) });
    Rules.toggleDie(turn, 0);
    assert.equal(turn.locksThisRoll, 1);
    Rules.toggleDie(turn, 0);
    assert.equal(turn.locksThisRoll, 0);
    assert.equal(turn.dice[0].status, STATUS.ACTIVE);
});

test('cannot touch dice before the first roll or after the turn is finished', () => {
    const turn = Rules.createTurn('p1');
    assert.equal(Rules.toggleDie(turn, 0), null);
    Rules.rollTurn(turn, { rollFace: faces(2, 4, 1, 1, 1, 1) });
    lockValues(turn, 2, 4, 1, 1, 1, 1);
    assert.equal(Rules.toggleDie(turn, 0), null);
    assert.equal(Rules.canRoll(turn), false);
});

test('suspense: last die while missing a 4 is "survival"', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 6, 6, 6, 5, 1) });
    lockValues(turn, 2, 6, 6, 6, 5);
    const result = Rules.rollTurn(turn, { rollFace: faces(4) });
    assert.equal(result.suspense, SUSPENSE.SURVIVAL);
    lockValues(turn, 4);
    assert.equal(turn.outcome.score, 23);
    assert.equal(turn.outcome.suspense, SUSPENSE.SURVIVAL);
});

test('suspense: 2, 4 and three 6s locked with one die left is "perfect" and "the door is open"', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 4, 6, 6, 6, 1) });
    lockValues(turn, 2, 4, 6, 6, 6);
    const result = Rules.rollTurn(turn, { rollFace: faces(6) });
    assert.equal(result.suspense, SUSPENSE.PERFECT);
    assert.equal(turn.callout, CALLOUT.DOOR_OPEN);
    lockValues(turn, 6);
    assert.equal(turn.callout, CALLOUT.PERFECT);
});

test('"the Early Ross": locking one of 2/4 plus a scoring die on the first roll', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 5, 1, 1, 3, 3) });
    lockValues(turn, 2, 5);
    Rules.rollTurn(turn, { rollFace: faces(1, 1, 1, 1) });
    assert.equal(turn.callout, CALLOUT.EARLY_ROSS);
});

test('no 2 or 4 on the first roll is trouble, and finding both later is "Phew!"', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(1, 3, 5, 6, 6, 6) });
    lockValues(turn, 6);
    Rules.rollTurn(turn, { rollFace: faces(2, 4, 1, 1, 1) });
    assert.equal(turn.callout, CALLOUT.TROUBLE);
    lockValues(turn, 2);
    assert.equal(turn.callout, CALLOUT.TROUBLE);
    lockValues(turn, 4);
    assert.equal(turn.callout, CALLOUT.PHEW);
});

test('rolling three or more 6s triggers the devil', () => {
    const turn = Rules.createTurn('p1');
    assert.equal(Rules.rollTurn(turn, { rollFace: faces(6, 6, 6, 1, 1, 1) }).devil, true);
});

test('Klarg steals the highest active die; stolen dice do not score or reroll', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, {
        rollFace: faces(2, 4, 6, 5, 1, 1),
        onRolled: t => Rules.stealHighestActiveDie(t)
    });
    assert.equal(turn.dice[2].status, STATUS.STOLEN);
    assert.equal(Rules.toggleDie(turn, 2), null);
    lockValues(turn, 2, 4, 5, 1, 1);
    assert.equal(turn.finalized, true);
    assert.equal(turn.outcome.score, 7);
});

test('Rokr blur hides values until the next roll, and finishing reveals them', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 4, 6, 6, 6, 6), onRolled: t => { t.blurActive = true; } });
    let view = Rules.viewTurn(turn);
    assert.ok(view.dice.every(d => d.hidden && d.value === 0));

    Rules.toggleDie(turn, 0);
    view = Rules.viewTurn(turn);
    assert.equal(view.dice[0].hidden, true, 'dice locked this roll stay hidden');

    Rules.toggleDie(turn, 1); Rules.toggleDie(turn, 2); Rules.toggleDie(turn, 3); Rules.toggleDie(turn, 4); Rules.toggleDie(turn, 5);
    assert.equal(turn.finalized, true);
    assert.equal(turn.outcome.score, 24, 'outcome uses the real values');
    assert.ok(Rules.viewTurn(turn).dice.every(d => !d.hidden));
});

test('blur clears when the player rolls again', () => {
    const turn = Rules.createTurn('p1');
    Rules.rollTurn(turn, { rollFace: faces(2, 1, 1, 1, 1, 1), onRolled: t => { t.blurActive = true; } });
    Rules.toggleDie(turn, 0);
    Rules.rollTurn(turn, { rollFace: faces(4, 4, 4, 4, 4) });
    assert.equal(turn.blurActive, false);
    assert.equal(Rules.viewTurn(turn).dice[0].value, 2);
});

test('bot locks the 2 and 4 first, then high dice', () => {
    const active = [6, 2, 4, 1, 5, 3].map((value, id) => ({ id, value, status: STATUS.ACTIVE }));
    const toLock = Rules.chooseBotDiceToLock(active, false, false, 0);
    const lockedValues = toLock.map(id => active[id].value).sort();
    assert.deepEqual(lockedValues, [2, 4, 5, 6]);
});

test('bot always locks at least one die', () => {
    const active = [1, 1, 3].map((value, id) => ({ id, value, status: STATUS.ACTIVE }));
    assert.equal(Rules.chooseBotDiceToLock(active, false, false, 0).length, 1);
});

test('bot plays complete turns without getting stuck', () => {
    let seed = 42;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed % 6) + 1; };
    for (const enemyId of ['molar', 'klarg', 'rokr', 'hangman', 'jaguar']) {
        for (let game = 0; game < 200; game++) {
            const turn = Rules.createTurn('BOT');
            let rolls = 0;
            while (!turn.finalized) {
                assert.ok(Rules.rollTurn(turn, { rollFace: rng }), 'bot should always be able to roll');
                Rules.planBotLocks(turn, enemyId).forEach(id => Rules.toggleDie(turn, id));
                assert.ok(++rolls <= 6);
            }
            assert.ok(turn.outcome.score >= 0 && turn.outcome.score <= 24);
        }
    }
});
