// 2, 4, 24 game rules.
//
// Pure functions shared by the server (which runs every turn) and the browser
// (which only displays them). Nothing in here touches the DOM, sockets or timers.
// Loaded with require() on the server and as self.GameRules in the browser. Bundlers may
// give it a `module` object even in the browser, so both are set whenever both exist.
(function (root, factory) {
    const rules = factory();
    if (typeof module === 'object' && module.exports) module.exports = rules;
    if (root) root.GameRules = rules;
})(typeof self !== 'undefined' ? self : null, function () {
    'use strict';

    const DICE_COUNT = 6;
    const PERFECT_SCORE = 24;

    const STATUS = {
        ACTIVE: 'active',
        LOCKED_THIS_ROLL: 'lockedThisTurn',
        LOCKED: 'permanentlyLocked',
        STOLEN: 'stolen'
    };

    const SUSPENSE = { NONE: 'none', SURVIVAL: 'survival', PERFECT: 'perfect' };

    // Announcement keys. The browser turns these into text (see CALLOUT_TEXT in index.html).
    const CALLOUT = {
        EARLY_ROSS: 'earlyRoss',
        DIDNT_BITE: 'didntBite',
        ODDS: 'odds',
        TROUBLE: 'trouble',
        PHEW: 'phew',
        KNOCKING: 'knocking',
        DOOR_OPEN: 'doorOpen',
        DUST: 'dust',
        BLESSED: 'blessed',
        PERFECT: 'perfect',
        RESULT: 'result'
    };

    const ABILITY_NAMES = {
        reachAround: 'Reach Around',
        constellationBlur: 'Constellation Blur',
        deadeye24: 'The Ace of Spades',
        smoothTalk: 'Smooth Talk',
        mindWhip: 'Mind Whip',
        cursed: 'You are Cursed',
        devil: 'Sympathy for the Devil',
        disguises: 'Disguises',
        suckerPunch: 'Back of the Head', // Sylvester's (the id is the simulator's)
        inkfire: 'Inkfire Brand',
        flourish: 'Flourish',
        divineSmite: 'Divine Smite',
        astralFlood: 'Astral Flood'
    };

    function getAbilityMaxUses(abilityId) {
        return abilityId === 'constellationBlur' ? 2 : 1;
    }

    function defaultRollFace() {
        return Math.floor(Math.random() * 6) + 1;
    }

    const isActive = d => d.status === STATUS.ACTIVE;
    const isLocked = d => d.status !== STATUS.ACTIVE && d.status !== STATUS.STOLEN;

    // The first locked 2 and first locked 4 are "required"; every other locked die scores.
    function scoreDice(dice) {
        let has2 = false, has4 = false, score = 0;
        dice.filter(isLocked).forEach(d => {
            if (d.value === 2 && !has2) has2 = true;
            else if (d.value === 4 && !has4) has4 = true;
            else score += d.value;
        });
        return { has2, has4, score };
    }

    // The best this hand can still finish on: every die still in play lands as needed (the
    // missing 2 and 4 first, then 6s). null if a 2 or 4 can no longer be had: dust for sure.
    function bestPossibleScore(dice) {
        const { has2, has4, score } = scoreDice(dice);
        const free = dice.filter(isActive).length;
        const missing = (has2 ? 0 : 1) + (has4 ? 0 : 1);
        if (free < missing) return null;
        return score + 6 * (free - missing);
    }

    function createTurn(playerId) {
        return {
            playerId,
            dice: Array.from({ length: DICE_COUNT }, (_, id) => ({ id, value: 0, status: STATUS.ACTIVE })),
            rollCount: 0,
            locksThisRoll: 0,
            hasRolled: false,
            inTrouble: false,
            blurActive: false,
            mindDieId: null, // Mind Whip: the die Frak made you keep this throw (it can't be tapped back)
            suspense: SUSPENSE.NONE,
            callout: null,
            finalized: false,
            outcome: null
        };
    }

    function canRoll(turn) {
        if (turn.finalized) return false;
        if (!turn.dice.some(isActive)) return false;
        // freeRoll: a die put back by Second Thoughts may be rolled without keeping another.
        return !turn.hasRolled || turn.locksThisRoll > 0 || !!turn.freeRoll;
    }

    const CLEARED_ON_NEXT_ROLL = [CALLOUT.EARLY_ROSS, CALLOUT.DIDNT_BITE, CALLOUT.PHEW, CALLOUT.DOOR_OPEN];

    // Announcements decided when the player presses Roll, before the dice move.
    function applyPreRollCallouts(turn) {
        const dice = turn.dice;
        if (turn.rollCount > 0 && CLEARED_ON_NEXT_ROLL.includes(turn.callout)) turn.callout = null;

        if (turn.rollCount === 1) {
            const justLocked = dice.filter(d => d.status === STATUS.LOCKED_THIS_ROLL);
            const stillActive = dice.filter(isActive);
            const has2 = justLocked.some(d => d.value === 2);
            const has4 = justLocked.some(d => d.value === 4);
            const has1356 = justLocked.some(d => [1, 3, 5, 6].includes(d.value));
            const activeHas6 = stillActive.some(d => d.value === 6);
            const exactlyOneRequired = has2 !== has4;

            if (exactlyOneRequired && has1356) turn.callout = CALLOUT.EARLY_ROSS;
            else if (justLocked.length === 1 && exactlyOneRequired && activeHas6) turn.callout = CALLOUT.DIDNT_BITE;

            if (dice.every(d => d.value === dice[0].value)) {
                turn.callout = CALLOUT.ODDS;
            } else if (!dice.some(d => d.value === 2) && !dice.some(d => d.value === 4)) {
                turn.inTrouble = true;
                turn.callout = CALLOUT.TROUBLE;
            }
        }

        if (turn.rollCount > 0) {
            const locked = dice.filter(isLocked);
            const lockedHas2 = locked.some(d => d.value === 2);
            const lockedHas4 = locked.some(d => d.value === 4);
            const locked6s = locked.filter(d => d.value === 6).length;
            const activeCount = dice.filter(isActive).length;

            if (lockedHas2 && lockedHas4 && locked6s === 3 && activeCount === 1) turn.callout = CALLOUT.DOOR_OPEN;
            else if (lockedHas2 && lockedHas4 && locked6s === 2 && activeCount >= 2) turn.callout = CALLOUT.KNOCKING;
        }
    }

    // "survival": one die left and still missing a 2 or 4. "perfect": one die left for a 24.
    function getSuspense(dice) {
        const activeCount = dice.filter(isActive).length;
        if (activeCount !== 1) return SUSPENSE.NONE;
        const locked = dice.filter(isLocked);
        const has2 = locked.some(d => d.value === 2);
        const has4 = locked.some(d => d.value === 4);
        if (!has2 || !has4) return SUSPENSE.SURVIVAL;
        if (locked.filter(d => d.value === 6).length === 3) return SUSPENSE.PERFECT;
        return SUSPENSE.NONE;
    }

    // Rolls every active die. `onRolled(turn)` runs after the new values land and before
    // the post-roll checks, so enemy abilities (e.g. stealing a die) can change the board.
    // Returns null if the roll isn't allowed, otherwise { suspense, devil }.
    function rollTurn(turn, { rollFace = defaultRollFace, onRolled = null } = {}) {
        if (!canRoll(turn)) return null;

        if (turn.blurActive && turn.locksThisRoll > 0) turn.blurActive = false;
        turn.mindDieId = null;
        applyPreRollCallouts(turn);

        turn.rollCount++;
        turn.dice.forEach(d => { if (d.status === STATUS.LOCKED_THIS_ROLL) d.status = STATUS.LOCKED; });
        turn.suspense = getSuspense(turn.dice);

        turn.dice.forEach(d => { if (isActive(d)) d.value = rollFace(d); });
        turn.hasRolled = true;
        turn.locksThisRoll = 0;
        turn.freeRoll = false;
        turn.mustRollId = null; // (a knocked-loose die has been rolled)

        if (onRolled) onRolled(turn);

        const newSixes = turn.dice.filter(d => isActive(d) && d.value === 6).length;
        if (newSixes === 0 && (turn.callout === CALLOUT.KNOCKING || turn.callout === CALLOUT.DOOR_OPEN)) turn.callout = null;

        settleTurn(turn);
        return { suspense: turn.suspense, devil: newSixes >= 3 };
    }

    // Locks or unlocks a die rolled this roll. Returns { finalizedNow } or null if not allowed.
    function toggleDie(turn, dieId) {
        if (!turn.hasRolled || turn.finalized) return null;
        const die = turn.dice.find(d => d.id === dieId);
        if (!die || die.status === STATUS.LOCKED || die.status === STATUS.STOLEN) return null;
        if (die.id === turn.mindDieId) return null;
        // A die Sylvester knocked loose has to be rolled before it can be kept again.
        if (die.id === turn.mustRollId) return null;

        if (die.status === STATUS.ACTIVE) { die.status = STATUS.LOCKED_THIS_ROLL; turn.locksThisRoll++; }
        else { die.status = STATUS.ACTIVE; turn.locksThisRoll--; }

        let wasFinalized = turn.finalized;
        settleTurn(turn);
        return { finalizedNow: !wasFinalized && turn.finalized };
    }

    // Updates "Phew!" and, once every die is locked, fixes the turn's outcome.
    function settleTurn(turn) {
        if (turn.finalized) return;

        if (turn.inTrouble && !turn.blurActive) {
            const { has2, has4 } = scoreDice(turn.dice);
            if (has2 && has4) { turn.callout = CALLOUT.PHEW; turn.inTrouble = false; }
        }

        if (turn.hasRolled && !turn.dice.some(isActive)) {
            const { has2, has4, score } = scoreDice(turn.dice);
            const busted = !has2 || !has4;
            turn.finalized = true;
            turn.blurActive = false;
            turn.outcome = { busted, score: busted ? 0 : score, suspense: turn.suspense, rollCount: turn.rollCount };
            if (busted) turn.callout = CALLOUT.DUST;
            else if (score === PERFECT_SCORE) turn.callout = turn.rollCount === 1 ? CALLOUT.BLESSED : CALLOUT.PERFECT;
            else turn.callout = CALLOUT.RESULT;
        }
    }

    // Fizzy Thomic: every active die showing a 1 is rolled again, once. Returns their ids, or
    // null if there were none (then nothing changes).
    function rerollOnes(turn, rollFace = defaultRollFace) {
        if (!turn.hasRolled || turn.finalized) return null;
        const ones = turn.dice.filter(d => isActive(d) && d.value === 1);
        if (ones.length === 0) return null;
        ones.forEach(d => { d.value = rollFace(d); });
        settleTurn(turn);
        return ones.map(d => d.id);
    }

    // Second Thoughts Thonic: a die kept on an earlier roll goes back into play, and the player
    // may roll without keeping another. A finished hand opens up again. Returns true if done.
    // mustRoll: the die can't be kept again until it has been rolled (Sylvester's Back of the Head).
    function putBackDie(turn, dieId, { mustRoll = false } = {}) {
        if (!turn.hasRolled) return false;
        const die = turn.dice.find(d => d.id === dieId);
        // A die kept on an earlier roll; or, once the hand is finished (nothing left to tap), any
        // kept die, including those kept this roll.
        const keptThisRoll = die && die.status === STATUS.LOCKED_THIS_ROLL && turn.finalized;
        if (!die || (die.status !== STATUS.LOCKED && !keptThisRoll)) return false;
        if (keptThisRoll) turn.locksThisRoll--;
        die.status = STATUS.ACTIVE;
        if (turn.finalized) {
            turn.finalized = false;
            turn.outcome = null;
            turn.callout = null;
        }
        turn.freeRoll = true;
        if (mustRoll) turn.mustRollId = die.id;
        return true;
    }

    // Sylvester's Back of the Head: the best die the player has kept (the highest value).
    function bestKeptDie(turn) {
        const kept = turn.dice.filter(isLocked);
        if (kept.length === 0) return null;
        return kept.reduce((best, d) => (d.value > best.value ? d : best));
    }

    // Klarg's Reach Around: takes an active die out of play. He goes for a 2 or a 4 the player
    // still needs (neither kept yet); failing that, the highest die. Needs 2+ active dice.
    function stealHighestActiveDie(turn) {
        const active = turn.dice.filter(isActive);
        if (active.length <= 1) return null;
        const kept = turn.dice.filter(d => d.status === STATUS.LOCKED || d.status === STATUS.LOCKED_THIS_ROLL);
        const needed = [2, 4].filter(v => !kept.some(d => d.value === v));
        const stolen = active.find(d => needed.includes(d.value)) || active.slice().sort((a, b) => b.value - a.value)[0];
        stolen.status = STATUS.STOLEN;
        return stolen;
    }

    // Frak's Mind Whip: on your first throw he makes you keep one of your dice, at random (since
    // 21 Oct, the user's call; it was your worst). It counts as this throw's keep and can't be
    // tapped back; you may keep others too. pick(n) chooses 0..n-1 (the server passes its crypto
    // RNG). Returns the die, or null (it needs two or more dice in play).
    function mindWhip(turn, pick = n => Math.floor(Math.random() * n)) {
        if (!turn.hasRolled || turn.finalized) return null;
        const dice = turn.dice.filter(isActive);
        if (dice.length < 2) return null;
        const die = dice[pick(dice.length)];
        toggleDie(turn, die.id);
        turn.mindDieId = die.id;
        return die;
    }

    // What players are allowed to see. While Rokr's blur is up, dice that are still
    // in play this roll are hidden from everyone (value 0, hidden: true).
    function viewTurn(turn) {
        if (!turn) return null;
        const hide = d => turn.blurActive && (d.status === STATUS.ACTIVE || d.status === STATUS.LOCKED_THIS_ROLL);
        return {
            key: turn.key,
            playerId: turn.playerId,
            // mind: the die Mind Whip made you keep (this throw).
            dice: turn.dice.map(d => ({ ...(hide(d) ? { id: d.id, value: 0, status: d.status, hidden: true } : { id: d.id, value: d.value, status: d.status }), ...(d.id === turn.mindDieId ? { mind: true } : {}), ...(d.id === turn.mustRollId ? { mustRoll: true } : {}) })),
            rollCount: turn.rollCount,
            locksThisRoll: turn.locksThisRoll,
            hasRolled: turn.hasRolled,
            blurActive: turn.blurActive,
            suspense: turn.suspense,
            callout: turn.callout,
            finalized: turn.finalized,
            outcome: turn.outcome,
            canRoll: canRoll(turn),
            steady: !!turn.steady
        };
    }

    // ---- Bot (The Molar and the Tavern Crawl enemies) ----

    function chooseBotDiceToLock(activeDice, hasTwo, hasFour, currentScore, enemyId = 'molar') {
        const active = activeDice.slice().sort((a, b) => b.value - a.value);
        const toLock = [];
        const lockDie = die => {
            if (!die || toLock.includes(die.id)) return false;
            toLock.push(die.id);
            return true;
        };

        if (!hasTwo && lockDie(active.find(d => d.value === 2))) hasTwo = true;
        if (!hasFour && lockDie(active.find(d => d.value === 4 && !toLock.includes(d.id)))) hasFour = true;

        if (hasTwo && hasFour) {
            const remainingToPerfect = Math.max(0, PERFECT_SCORE - currentScore);
            active.forEach(d => {
                if (toLock.includes(d.id)) return;
                if (d.value > remainingToPerfect && active.length > 1) return;
                if (d.value >= 5) lockDie(d);
                else if (enemyId === 'klarg' && d.value >= 4) lockDie(d);
                else if (enemyId === 'rokr' && d.value >= 4 && remainingToPerfect <= 8) lockDie(d);
                else if (enemyId === 'hangman' && d.value >= 4) lockDie(d);
                else if (enemyId === 'jaguar' && d.value >= 4) lockDie(d);
                else if (remainingToPerfect <= d.value) lockDie(d);
            });
        } else if (enemyId === 'jaguar') {
            lockDie(active.find(d => d.value === 6 && !toLock.includes(d.id)));
        }

        // Always lock at least one die so the bot can roll again.
        if (toLock.length === 0 && active.length > 0) lockDie(active[0]);
        return toLock;
    }

    // Would keeping every die on the table right now win the round? `toBeat` is the score the
    // bot must beat: a number, or null when the other player dusted (any 2-and-4 hand wins).
    // Extra dice only add points, so keeping them all is the best this roll can do.
    function keepingAllWins(turn, toBeat) {
        const kept = turn.dice.map(d => (isActive(d) ? { ...d, status: STATUS.LOCKED } : d));
        const { has2, has4, score } = scoreDice(kept);
        return has2 && has4 && (toBeat === null || score > toBeat);
    }

    // `toBeat` is optional (undefined = the bot doesn't know yet, e.g. it rolls first).
    // Once the bot already has a winning hand it stops rolling and keeps the lot.
    // The Duke waiting on his Devil (simple play): he keeps only the 2 and 4 he still needs, or
    // else his highest die, so three dice are left for the Devil's three 6s.
    function devilWaitLocks(turn) {
        const active = turn.dice.filter(isActive).sort((a, b) => b.value - a.value);
        const kept = turn.dice.filter(d => d.status !== STATUS.ACTIVE && d.status !== STATUS.STOLEN).map(d => d.value);
        const toLock = [];
        for (const need of [2, 4]) {
            const die = !kept.includes(need) && active.find(d => d.value === need && !toLock.includes(d.id));
            if (die) toLock.push(die.id);
        }
        if (toLock.length === 0 && active.length > 0) toLock.push(active[0].id);
        return toLock;
    }

    // low: a cursed round (the lowest valid score wins): the same simple habits, turned round.
    function planBotLocks(turn, enemyId, toBeat, { low = false } = {}) {
        if (low) return planBotLocksLow(turn, toBeat);
        if (toBeat !== undefined && keepingAllWins(turn, toBeat)) return turn.dice.filter(isActive).map(d => d.id);
        const { has2, has4, score } = scoreDice(turn.dice);
        return chooseBotDiceToLock(turn.dice.filter(isActive), has2, has4, score, enemyId);
    }

    // Simple play in a cursed round: grab a 2 and a 4, then keep 1s and 2s, else the lowest die;
    // playing second, stop as soon as keeping everything is a valid hand under the score to beat
    // (or any valid hand, if the other player dusted).
    function planBotLocksLow(turn, toBeat) {
        const active = turn.dice.filter(isActive).sort((a, b) => a.value - b.value);
        if (toBeat !== undefined) {
            const kept = turn.dice.map(d => (isActive(d) ? { ...d, status: STATUS.LOCKED } : d));
            const all = scoreDice(kept);
            if (all.has2 && all.has4 && (toBeat === null || all.score < toBeat)) return active.map(d => d.id);
        }
        let { has2, has4 } = scoreDice(turn.dice);
        const toLock = [];
        const take = d => { if (d && !toLock.includes(d.id)) { toLock.push(d.id); return true; } return false; };
        if (!has2 && take(active.find(d => d.value === 2))) has2 = true;
        if (!has4 && take(active.find(d => d.value === 4 && !toLock.includes(d.id)))) has4 = true;
        active.forEach(d => { if (d.value <= 2) take(d); });
        if (toLock.length === 0 && active.length > 0) take(active[0]);
        return toLock;
    }

    // A Tavern Crawl's money, in whole gold: 11 -> "11 gold".
    function formatGold(amount) {
        return `${Math.max(0, Math.round(Number(amount) || 0))} gold`;
    }

    return {
        formatGold,
        DICE_COUNT, PERFECT_SCORE, STATUS, SUSPENSE, CALLOUT, ABILITY_NAMES,
        getAbilityMaxUses, scoreDice, createTurn, canRoll, rollTurn, toggleDie, settleTurn,
        stealHighestActiveDie, bestKeptDie, mindWhip, devilWaitLocks, bestPossibleScore, rerollOnes, putBackDie, viewTurn, chooseBotDiceToLock, keepingAllWins, planBotLocks
    };
});
