// A fast offline copy of a Tavern Crawl, for balancing: fights, gold, Thonics, events and
// keepsakes, on the real dice rules (shared/rules.js) and the real opponents' play
// (shared/strategy.js). It follows server.js; balance/check-server.js compares the two.
//
// The player is "sensible": they play for the best chance of winning each round (the same
// solver the opponents use), and drink each Thonic at a sensible moment (see `drinks`).
'use strict';

const Rules = require('../shared/rules');
const Strategy = require('../shared/strategy');
const DEFAULTS = require('../shared/balance');

const { STATUS } = Rules;
const OPPONENTS = [
    { id: 'molar', ability: null },
    { id: 'klarg', ability: 'reachAround' },
    { id: 'rokr', ability: 'constellationBlur' },
    { id: 'hangman', ability: 'deadeye24' },
    { id: 'jaguar', ability: 'smoothTalk' }
];
const KEEPSAKES = ['bentCopper', 'blessedTankard', 'luckySeat', 'velvetCushion', 'steadyHand'];
const THONIC_IDS = ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'];

const d6 = () => 1 + Math.floor(Math.random() * 6);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const take = (shelf, id) => { const i = shelf.indexOf(id); if (i < 0) return false; shelf.splice(i, 1); return true; };
const active = turn => turn.dice.filter(d => d.status === STATUS.ACTIVE);

// ---- One fight ----

// run: { shelf, keepsakes, hearts (start of fight), stats } (changed in place)
// opts.player: 'sensible' (best play) or 'casual' (the Molar's simple habits)
function fight(index, run, opts = {}) {
    const N = { ...DEFAULTS, ...(opts.numbers || {}) };
    const opp = OPPONENTS[index];
    const f = {
        index, opp,
        player: run.hearts ?? N.playerHearts,
        bot: N.opponentLives[opp.id],
        botMax: N.opponentLives[opp.id],
        round: 1,
        abilityRound: opp.ability ? 1 + Math.floor(Math.random() * 3) : 0,
        uses: 0,
        clearEyeRound: 0,
        keepUsed: {},
        rounds: 0
    };
    const max = ability => N.abilityUses[ability];
    const canUse = ability => opp.ability === ability && f.clearEyeRound !== f.round && f.round >= f.abilityRound && f.uses < max(ability);
    // Using the ability: with Clear-Eye as "cancel the next" (opts.effects.clearEye ===
    // 'cancelNext'), a waiting Clear-Eye spends the use instead.
    f.fire = ability => {
        if (!canUse(ability)) return false;
        f.uses++;
        if (f.cancelArmed) { f.cancelArmed = false; return false; }
        return true;
    };
    const has = k => run.keepsakes.includes(k);

    while (f.player > 0 && f.bot > 0) {
        f.rounds++;
        const playerFirst = f.round % 2 === 1;
        let p, b;
        if (playerFirst) {
            p = playerTurn(f, run, opts, undefined, canUse, N);
            b = botTurn(f, run, botToBeat(p, run, f), canUse);
        } else {
            b = botTurn(f, run, undefined, canUse);
            p = playerTurn(f, run, opts, b.busted ? null : b.score, canUse, N);
        }
        settleRound(f, run, p, b, has, N);
        f.round++;
    }
    return { won: f.bot <= 0, heartsLeft: Math.max(0, f.player), rounds: f.rounds };
}

// What the opponent must beat, as the server tells them (keepsakes included).
function botToBeat(p, run, f) {
    if (p.busted) return run.keepsakes.includes('steadyHand') && !f.keepUsed.steadyHand ? 0 : null;
    return p.score + (run.keepsakes.includes('velvetCushion') && !f.keepUsed.velvetCushion ? 1 : 0);
}

function botTurn(f, run, toBeat, canUse) {
    const turn = Rules.createTurn('BOT');
    const aceAt16 = f.opp.ability === 'deadeye24' && f.bot <= 1 && canUse('deadeye24') && !f.cancelArmed;
    while (!turn.finalized) {
        if (!Rules.rollTurn(turn)) throw new Error('the opponent could not roll');
        if (turn.finalized) break;
        if (active(turn).length === 1) { Rules.toggleDie(turn, active(turn)[0].id); break; }
        const keep = f.opp.id === 'molar' ? Rules.planBotLocks(turn, 'molar', toBeat) : Strategy.bestKeeps(turn.dice, toBeat, { aceAt16 });
        keep.forEach(id => Rules.toggleDie(turn, id));
    }
    let { busted, score } = turn.outcome;
    // A rolled 24 restores a life for the opponent too, up to their lives for the fight (the
    // Ace of Spades' 24 doesn't).
    if (score === 24 && !busted && f.bot < f.botMax) f.bot++;
    if (f.opp.ability === 'deadeye24' && f.bot <= 1 && !busted && score >= 16 && score < 24 && f.fire('deadeye24')) score = 24;
    return { busted, score };
}

// The player's turn. toBeat: the opponent's score if they went first (null if they dusted),
// undefined if the player goes first.
function playerTurn(f, run, opts, toBeat, canUse, N) {
    const shelf = run.shelf;
    const drinks = opts.drinks || DRINKS;
    // Before rolling: Healing once a heart is gone; Clear-Eye when the ability is about to come.
    // Healing: kept for the last heart (drinking it at the first lost heart wastes it).
    const healAt = opts.healAt ?? 1;
    if (drinks.healing && f.player <= healAt && f.player < N.playerHearts && take(shelf, 'healing')) { f.player++; run.stats.drunk.healing = (run.stats.drunk.healing || 0) + 1; }
    // The game's effects; opts.effects { clearEye: 'round', steady: 'zero' } plays the old ones.
    const effects = { clearEye: 'cancelNext', steady: 'asTheyLie', ...(opts.effects || {}) };
    if (effects.clearEye === 'cancelNext') {
        // Drunk at the start of the fight: it waits for the opponent's next ability.
        if (drinks.clearEye && f.opp.ability && !f.cancelArmed && f.uses < N.abilityUses[f.opp.ability] && take(shelf, 'clearEye')) {
            f.cancelArmed = true;
            run.stats.drunk.clearEye = (run.stats.drunk.clearEye || 0) + 1;
        }
    } else if (drinks.clearEye && shelf.includes('clearEye') && clearEyeNow(f, toBeat, N) && take(shelf, 'clearEye')) {
        f.clearEyeRound = f.round;
        run.stats.drunk.clearEye = (run.stats.drunk.clearEye || 0) + 1;
    }

    const turn = Rules.createTurn('P');
    let steady = false;
    const choose = () => (opts.player === 'casual' ? Rules.planBotLocks(turn, 'molar', toBeat) : Strategy.bestKeeps(turn.dice, toBeat));
    for (;;) {
        const rolled = Rules.rollTurn(turn, {
            onRolled: t => {
                if (t.rollCount !== 1) return;
                if (f.fire('reachAround')) Rules.stealHighestActiveDie(t);
                if (f.fire('constellationBlur')) t.blurActive = true;
            }
        });
        if (!rolled) throw new Error('the player could not roll');
        // Fizzy Thomic: 1s showing (and in view) roll again.
        if (drinks.fizzy && !turn.finalized && !turn.blurActive) {
            const ones = active(turn).filter(d => d.value === 1).length;
            if ((ones >= 2 || (ones >= 1 && active(turn).length <= 3)) && take(shelf, 'fizzy')) {
                Rules.rerollOnes(turn);
                run.stats.drunk.fizzy = (run.stats.drunk.fizzy || 0) + 1;
            }
        }
        if (!turn.finalized) {
            if (active(turn).length === 1) Rules.toggleDie(turn, active(turn)[0].id);
            else if (turn.blurActive) Rules.toggleDie(turn, active(turn)[Math.floor(Math.random() * active(turn).length)].id); // blind
            else choose().forEach(id => Rules.toggleDie(turn, id));
        }
        if (!turn.finalized) continue;
        // Finished on dust: Second Thoughts reopens the hand (a kept die back in play); else
        // Steady makes it a 0.
        // Second Thoughts: on dust, or (playing second) when the hand would lose the round.
        const losing = toBeat !== undefined && toBeat !== null && !turn.outcome.busted && turn.outcome.score < toBeat;
        if ((turn.outcome.busted || (losing && opts.secondThoughtsWhenLosing !== false)) && drinks.secondThoughts && shelf.includes('secondThoughts')) {
            const back = putBackChoice(turn);
            if (back !== null && take(shelf, 'secondThoughts') && Rules.putBackDie(turn, back)) {
                run.stats.drunk.secondThoughts = (run.stats.drunk.secondThoughts || 0) + 1;
                continue;
            }
        }
        if (turn.outcome.busted && drinks.steady && take(shelf, 'steady')) {
            steady = true;
            run.stats.drunk.steady = (run.stats.drunk.steady || 0) + 1;
        }
        break;
    }
    let { busted, score } = turn.outcome;
    // Steady: dust counts as 0 (now), or (opts.effects.steady === 'asTheyLie') the dice score as
    // they lie, as if the 2 and 4 were there.
    if (steady && busted) { busted = false; score = effects.steady === 'asTheyLie' ? Rules.scoreDice(turn.dice).score : 0; }
    if (!busted && score > 0 && f.fire('smoothTalk')) score = Math.max(0, score - 3);
    if (score === 24 && !busted) {
        run.stats.perfect24s++;
        run.purse += N.gold.perfect24;
        run.stats.perfectGold += N.gold.perfect24;
        if (f.player < N.playerHearts) f.player = Math.min(N.playerHearts, f.player + (run.keepsakes.includes('blessedTankard') ? 2 : 1));
    }
    return { busted, score };
}

// Second Thoughts: put back the lowest kept die that isn't the 2 or 4 in use.
function putBackChoice(turn) {
    const kept = turn.dice.filter(d => d.status !== STATUS.ACTIVE && d.status !== STATUS.STOLEN);
    let saw2 = false, saw4 = false;
    const spare = kept.filter(d => {
        if (d.value === 2 && !saw2) { saw2 = true; return false; }
        if (d.value === 4 && !saw4) { saw4 = true; return false; }
        return true;
    });
    if (!spare.length) return null;
    return spare.sort((a, b) => a.value - b.value)[0].id;
}

// Clear-Eye: when the opponent's ability is sure to come this round (it starts by round 3),
// or, for the Hangman, when his shot is ready and he plays after you.
function clearEyeNow(f, toBeat, N) {
    const a = f.opp.ability;
    if (!a) return false;
    if (a === 'deadeye24') return f.bot <= 1 && f.uses < 1 && toBeat === undefined;
    if (f.uses >= N.abilityUses[a]) return false;
    return f.round >= 3 || (a === 'constellationBlur' && f.uses === 1);
}

const DRINKS = { healing: true, clearEye: true, fizzy: true, secondThoughts: true, steady: true };

// Who loses a heart this round, with the keepsakes and Last Gasp (as server.js).
function settleRound(f, run, p, b, has, N) {
    let losers = [];
    let tied = false;
    let steadyHandSaved = false;
    if (p.busted && has('steadyHand') && !f.keepUsed.steadyHand) {
        p = { busted: false, score: 0 };
        steadyHandSaved = true;
        f.keepUsed.steadyHand = true;
    }
    if (p.busted) losers.push('P');
    if (b.busted) losers.push('B');
    if (!p.busted && !b.busted) {
        if (p.score < b.score) losers.push('P');
        else if (b.score < p.score) losers.push('B');
        else tied = true;
    }
    if (steadyHandSaved) losers = losers.filter(x => x !== 'P');
    if (losers.length === 1 && losers[0] === 'P' && !p.busted && !b.busted && has('velvetCushion') && !f.keepUsed.velvetCushion && p.score + 1 === b.score) {
        f.keepUsed.velvetCushion = true;
        losers = [];
        tied = true;
    }
    if (tied && has('luckySeat') && !f.keepUsed.luckySeat) {
        f.keepUsed.luckySeat = true;
        tied = false;
        losers.push('B');
    }
    for (const who of losers) {
        if (who === 'B') { f.bot--; continue; }
        if (has('bentCopper') && !f.keepUsed.bentCopper) { f.keepUsed.bentCopper = true; continue; }
        if (p.busted && run.grace) { run.grace = false; continue; } // the Lady's Grace
        if (f.player <= 1 && take(run.shelf, 'lastGasp')) { run.stats.drunk.lastGasp = (run.stats.drunk.lastGasp || 0) + 1; continue; }
        f.player--;
    }
}

// ---- A whole run ----

// policy: what the player does between fights (see POLICIES in experiments).
//   shop(run, stock, N, next) -> ids to buy, in order
//   choose(run, spots, N)     -> a spot, or null to challenge straight away
//   shrine(run, N)            -> 'healing' | 'gold'
//   bet(run, bets, N)         -> a bet (0 = no thanks)
//   stranger(run, offers, N, next) -> a keepsake id, or null
function newRun(N) {
    return { purse: 0, shelf: [], keepsakes: [], hearts: N.playerHearts, stats: { perfect24s: 0, perfectGold: 0, winGold: 0, heartGold: 0, eventGold: 0, spent: 0, drunk: {} } };
}

function playRun(policy, opts = {}) {
    const N = { ...DEFAULTS, ...(opts.numbers || {}) };
    const run = newRun(N);
    // For experiments: start at a later opponent (as if the earlier ones were beaten, with no
    // gold from them) and/or with Thonics already on the shelf.
    const startAt = opts.startAt || 0;
    if (opts.shelf) run.shelf = opts.shelf.slice();
    if (opts.setup) opts.setup(run);
    const log = { fights: [], spots: [] };
    let defeated = startAt;
    for (let i = startAt; i < OPPONENTS.length; i++) {
        const result = fight(i, run, { ...opts, numbers: N });
        run.hearts = N.playerHearts;
        log.fights.push(result);
        if (!result.won) break;
        defeated++;
        const win = N.gold.winPerPlace * (i + 1), hearts = N.gold.perHeartLeft * result.heartsLeft;
        run.purse += win + hearts;
        run.stats.winGold += win;
        run.stats.heartGold += hearts;
        if (i < OPPONENTS.length - 1) between(run, policy, N, i + 1, log);
    }
    const won = defeated === OPPONENTS.length;
    const consolation = won ? 0 : (defeated + 1) * N.gold.consolation;
    return { won, defeated, gold: Math.max(0, run.purse + consolation), run, log };
}

const changePurse = (run, amount) => { const a = Math.max(amount, -run.purse); run.purse += a; run.stats.eventGold += a; return a; };

function between(run, policy, N, nextIndex, log) {
    const I = N.interlude;
    // Now and then the pickpocket strikes: roll one die to catch them. That's the walk's one
    // event (the server only sends them with something to steal).
    const steal = Math.floor(run.purse * I.pickpocketShare);
    if (steal > 0 && Math.random() * 100 < I.pickpocketChance) {
        if (d6() < I.pickpocketCatch) changePurse(run, -steal);
        log.spots.push('pickpocket');
        return;
    }
    const canBet = run.purse >= Math.min(...I.diceDenBets);
    const unowned = KEEPSAKES.filter(k => !run.keepsakes.includes(k));
    const spots = shuffle(['thom', 'shrine', 'diceDen', 'stranger'].filter(s => (s !== 'stranger' || unowned.length) && (s !== 'diceDen' || canBet))).slice(0, 2);
    const spot = policy.choose(run, spots, N, nextIndex);
    log.spots.push(spot);
    if (spot === 'thom') {
        const stock = ['healing', ...shuffle(THONIC_IDS.filter(t => t !== 'healing')).slice(0, N.shopSize - 1)];
        for (const id of policy.shop(run, stock, N, nextIndex)) {
            const price = N.thonicPrices[id];
            if (run.purse >= price && run.shelf.length < N.shelfSize) {
                run.purse -= price;
                run.stats.spent += price;
                run.shelf.push(id);
            }
        }
    } else if (spot === 'shrine') {
        if (I.shrineGifts) {
            // The Lady's blessing, at random: Favour (an extra heart next fight) or Grace (the
            // next dust that would cost a heart doesn't; not given twice).
            let gift = I.shrineGifts[Math.floor(Math.random() * I.shrineGifts.length)];
            if (gift === 'grace' && run.grace) gift = 'favour';
            if (gift === 'favour') run.hearts = N.playerHearts + I.favourHearts;
            else run.grace = true;
            run.stats.blessings = (run.stats.blessings || 0) + 1;
        } else if (policy.shrine(run, N, nextIndex) === 'healing' && run.shelf.length < N.shelfSize) run.shelf.push('healing'); // before 19 Oct
        else changePurse(run, I.shrineGold);
    } else if (spot === 'diceDen') {
        const bet = policy.bet(run, I.diceDenBets.filter(b => run.purse >= b), N, nextIndex);
        if (bet) {
            for (;;) {
                const a = d6() + d6(), b = d6() + d6();
                if (a === b) continue;
                changePurse(run, a > b ? bet : -bet);
                break;
            }
        }
    } else if (spot === 'stranger') {
        const offers = shuffle(unowned.slice()).slice(0, I.strangerOffers);
        const pick = policy.stranger(run, offers, N, nextIndex);
        if (pick) { run.keepsakes.push(pick); run.hearts = I.strangerHearts; }
    }
}

module.exports = { OPPONENTS, KEEPSAKES, THONIC_IDS, DEFAULTS, fight, playRun, newRun };
