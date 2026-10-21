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
// The Ghoul and Gourd (McGrath keeps the Molar's id; Martha is the boss: her mask, then the
// final), then the Yawning Portal.
const OPPONENTS = [
    // simple: plays the Molar's simple habits (the Ghoul and Gourd, since 21 Oct).
    { id: 'molar', ability: null, simple: true },
    { id: 'frak', ability: 'mindWhip', simple: true },
    { id: 'danhausen', ability: 'cursed', simple: true },
    { id: 'duke', ability: 'devil', simple: true },
    { id: 'martha', ability: 'disguises', boss: true, simple: true },
    { id: 'klarg', ability: 'reachAround' },
    { id: 'rokr', ability: 'constellationBlur' },
    { id: 'hangman', ability: 'deadeye24' },
    { id: 'jaguar', ability: 'smoothTalk' }
];
// The 14-fight tournament (design doc, 20 Oct; not in the game yet): the Ghoul and Gourd, the Yawning Portal's five (Brodor the boss, drops his Sunglasses), then
// Klarg's four aboard the Salty Swallow. Pass it as opts.order.
const TOURNAMENT = [
    ...OPPONENTS.slice(0, 5),
    { id: 'sylvester', ability: 'suckerPunch' },
    { id: 'vaelin', ability: 'inkfire' },
    { id: 'stason', ability: 'flourish' },
    { id: 'ridgeler', ability: 'divineSmite' },
    { id: 'brodor', ability: 'astralFlood', boss: true, drops: 'brodorsSunglasses' },
    ...OPPONENTS.slice(5)
];
// Round abilities (decided as a round begins; server.js beginTavernRound). Martha's disguises
// pick one of the three at random (Frak's, Danhausen's, the Duke's).
const ROUND_KIND = { cursed: 'curse', devil: 'devil', inkfire: 'ink', divineSmite: 'smite' };
const disguisesIn = () => ['mindWhip', 'cursed', 'devil'];
// What the Hooded Stranger offers (since 19 Oct). blessedTankard (Brodor's Sunglasses) and
// steadyHand (Steady Hand Wrap) left the game; the sim still knows them, for old experiments.
const KEEPSAKES = ['bentCopper', 'luckySeat', 'velvetCushion', 'loadedDie', 'potionBelt', 'loyaltyCard'];
const THONIC_IDS = ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'];

const d6 = () => 1 + Math.floor(Math.random() * 6);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const take = (shelf, id) => { const i = shelf.indexOf(id); if (i < 0) return false; shelf.splice(i, 1); return true; };
const active = turn => turn.dice.filter(d => d.status === STATUS.ACTIVE);

// ---- One fight ----

// run: { shelf, keepsakes, hearts (start of fight), stats } (changed in place)
// opts.player: 'sensible' (best play) or 'casual' (the Molar's simple habits)
function fight(index, run, opts = {}) {
    const N = numbersFor(opts);
    const order = opts.order || OPPONENTS;
    const opp = order[index];
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
        rounds: 0,
        disguises: disguisesIn(order),
        simpleBots: opts.simpleBots,
        surge: run.nextSurge || null // the Wild Magic Hot Tub's, on one of your dice this fight
    };
    run.nextSurge = null;
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
        beginRound(f, run, has);
        // opts.playerSecond: for experiments, the opponent always throws first (you know the score to beat).
        const playerFirst = opts.playerSecond ? false : f.round % 2 === 1;
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
    return { won: f.bot <= 0, heartsLeft: Math.max(0, f.player), rounds: f.rounds, abilityUses: f.uses };
}

// The round's ability, as it begins: { kind, by } or null. The opponent's (Martha's at random),
// or, if the opponent has none this round, Martha's mask: the player wears the Devil the first
// chance they get each fight.
function beginRound(f, run, has) {
    f.effect = null;
    f.pendingDevil = false;
    f.pendingMind = false;
    const a = f.opp.ability;
    // Brodor's Astral Flood: heals one of his lives, once he has lost one.
    if (a === 'astralFlood' && f.bot < f.botMax && f.fire(a)) f.bot++;
    if (a && (ROUND_KIND[a] || a === 'disguises' || a === 'mindWhip')) {
        const as = a === 'disguises' ? f.disguises[Math.floor(Math.random() * 3)] : a;
        // The Devil waits for the Duke's 2 and 4 (botTurn); Mind Whip for your first throw.
        if (as === 'devil') f.pendingDevil = true;
        else if (as === 'mindWhip') f.pendingMind = true;
        else if (f.fire(a)) f.effect = { kind: ROUND_KIND[as], by: 'opponent' };
    }
    if (!f.effect && has('marthasMask') && !f.keepUsed.marthasMask) {
        f.keepUsed.marthasMask = true;
        f.effect = { kind: 'devil', by: 'player' };
    }
}
const cursed = f => !!f.effect && f.effect.kind === 'curse';
const devilBy = (f, who) => !!f.effect && f.effect.kind === 'devil' && f.effect.by === who;
// The Devil's three 6s, on the first throw of whoever plays it.
const devilThrow = t => active(t).slice(0, 3).forEach(d => { d.value = 6; });

// What the opponent must beat, as the server tells them (keepsakes included).
function botToBeat(p, run, f) {
    if (p.busted) return run.keepsakes.includes('steadyHand') && !f.keepUsed.steadyHand ? 0 : null;
    return p.score + (run.keepsakes.includes('velvetCushion') && !f.keepUsed.velvetCushion ? (cursed(f) ? -1 : 1) : 0);
}

function botTurn(f, run, toBeat, canUse) {
    const turn = Rules.createTurn('BOT');
    const low = cursed(f), cap = devilBy(f, 'player') ? DEFAULTS.devilCap ?? null : null;
    const aceAt16 = !low && f.opp.ability === 'deadeye24' && f.bot <= 1 && canUse('deadeye24') && !f.cancelArmed;
    // Stason's Flourish: for his whole turn each die rolls twice and he keeps the better (a 2 or
    // 4 he still needs, else the higher).
    const flourish = f.opp.ability === 'flourish' && f.fire('flourish');
    const rollFace = flourish ? d => {
        const kept = turn.dice.filter(x => x.status === STATUS.LOCKED).map(x => x.value);
        const a = d6(), b = d6();
        for (const need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) return need;
        return Math.max(a, b);
    } : undefined;
    while (!turn.finalized) {
        if (!Rules.rollTurn(turn, { rollFace, onRolled: t => {
            const kept = t.dice.filter(d => d.status !== STATUS.ACTIVE && d.status !== STATUS.STOLEN).map(d => d.value);
            if (f.pendingDevil && kept.includes(2) && kept.includes(4) && active(t).length >= 3) {
                f.pendingDevil = false;
                if (f.fire(f.opp.ability)) { f.effect = { kind: 'devil', by: 'opponent' }; devilThrow(t); }
            }
        } })) throw new Error('the opponent could not roll');
        if (turn.finalized) break;
        if (active(turn).length === 1) { Rules.toggleDie(turn, active(turn)[0].id); break; }
        // opts.simpleBots: for experiments, these opponents play the Molar's simple way too.
        const simple = f.opp.simple || (f.simpleBots || []).includes(f.opp.id);
        const keep = simple && f.pendingDevil ? Rules.devilWaitLocks(turn) : simple ? Rules.planBotLocks(turn, f.opp.id, toBeat, { low }) : Strategy.bestKeeps(turn.dice, toBeat, { aceAt16, low, cap });
        keep.forEach(id => Rules.toggleDie(turn, id));
    }
    let { busted, score } = turn.outcome;
    if (cap !== null && !busted) score = Math.min(score, cap);
    // A rolled 24 restores a life for the opponent too, up to their lives for the fight (the
    // Ace of Spades' 24 doesn't).
    if (score === 24 && !busted && f.bot < f.botMax) f.bot++;
    if (!low && f.opp.ability === 'deadeye24' && f.bot <= 1 && !busted && score >= 16 && score < 24 && f.fire('deadeye24')) score = 24;
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
    // A cursed round: play for the fewest points (a casual player doesn't adjust). Under the
    // Duke's Devil, the hand counts as no more than the cap.
    const round = { low: cursed(f), cap: devilBy(f, 'opponent') ? DEFAULTS.devilCap ?? null : null };
    let mind = false;
    // Vaelin's Inkfire Brand: 6 is burned into the table this round; your dice that land on it
    // roll again (so they land 1-5; the Loaded Die 4-5).
    const loaded = loadedFace(run, N);
    const inked = f.effect && f.effect.kind === 'ink' ? d => { let v; do v = loaded ? loaded(d) : d6(); while (v === 6); return v; } : loaded;
    const face = f.surge ? surgeFace(f.surge, inked || (() => d6()), () => turn, N, round.low) : inked;
    const choose = () => {
        if (opts.player === 'casual') return Rules.planBotLocks(turn, 'molar', toBeat);
        return Strategy.bestKeeps(turn.dice, toBeat, round);
    };
    for (;;) {
        const rolled = Rules.rollTurn(turn, {
            rollFace: face,
            onRolled: t => {
                mind = false;
                if (t.rollCount !== 1) return;
                if (devilBy(f, 'player')) devilThrow(t);
                // Frak's Mind Whip (or Martha's copy): he picks the die you must keep.
                if (f.pendingMind && active(t).length > 1 && f.fire(f.opp.ability)) { f.pendingMind = false; mind = true; }
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
            else if (mind && Rules.mindWhip(turn)) {
                // That die is this throw's keep; you may keep others too.
                if (!turn.finalized) (opts.player === 'casual' ? [] : Strategy.bestKeeps(turn.dice, toBeat, { ...round, optional: true })).forEach(id => Rules.toggleDie(turn, id));
            }
            else if (turn.blurActive) Rules.toggleDie(turn, active(turn)[Math.floor(Math.random() * active(turn).length)].id); // blind
            else choose().forEach(id => Rules.toggleDie(turn, id));
        }
        if (!turn.finalized) continue;
        // Sylvester's Sucker Punch: as you keep your last die, one kept die (at random) flies
        // loose and you roll it again. He saves it for a hand that counts.
        if (!turn.outcome.busted && f.opp.ability === 'suckerPunch' && f.fire('suckerPunch')) {
            const kept = turn.dice.filter(d => d.status !== STATUS.ACTIVE && d.status !== STATUS.STOLEN);
            Rules.putBackDie(turn, kept[Math.floor(Math.random() * kept.length)].id);
            continue;
        }
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
    if (round.cap !== null && !busted) score = Math.min(score, round.cap);
    if (!round.low && !busted && score > 0 && f.fire('smoothTalk')) score = Math.max(0, score - 3);
    if (score === 24 && !busted) {
        run.stats.perfect24s++;
        run.purse += N.gold.perfect24;
        run.stats.perfectGold += N.gold.perfect24;
        if (f.player < N.playerHearts) f.player = Math.min(N.playerHearts, f.player + (run.keepsakes.includes('blessedTankard') ? 2 : 1));
    }
    // Brodor's Sunglasses (reworked, 20 Oct): a finished 23 restores a heart too.
    if (score === 23 && !busted && run.keepsakes.includes('brodorsSunglasses') && f.player < N.playerHearts) f.player++;
    return { busted, score };
}


// The Wild Magic Hot Tub's surge on its die (as server.js rollFaceFor): never a 1, never a 6,
// only 4-6, always a 6, or the better of two.
function surgeFace(surge, base, turnOf, N, low = false) {
    const die = N.interlude.hotTubDie;
    return d => {
        if (d.id !== die) return base(d);
        if (surge === 'noOnes') return 2 + Math.floor(Math.random() * 5);
        if (surge === 'soggy') return 1 + Math.floor(Math.random() * 5);
        if (surge === 'lucky') return 4 + Math.floor(Math.random() * 3);
        if (surge === 'scalding') return 6;
        if (surge === 'twin') {
            const kept = turnOf().dice.filter(x => x.status === STATUS.LOCKED).map(x => x.value);
            const a = base(d), b = base(d);
            for (const need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) return need;
            return low ? Math.min(a, b) : Math.max(a, b); // cursed: the lower is the better
        }
        return base(d);
    };
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
    // The Devil's cap, for a side that played before it landed.
    if (DEFAULTS.devilCap != null && devilBy(f, 'opponent') && !p.busted) p = { ...p, score: Math.min(p.score, DEFAULTS.devilCap) };
    if (p.busted) losers.push('P');
    if (b.busted) losers.push('B');
    if (!p.busted && !b.busted) {
        // A cursed round: the higher score loses.
        const pLoses = cursed(f) ? p.score > b.score : p.score < b.score;
        const bLoses = cursed(f) ? b.score > p.score : b.score < p.score;
        if (pLoses) losers.push('P');
        else if (bLoses) losers.push('B');
        else tied = true;
    }
    if (steadyHandSaved) losers = losers.filter(x => x !== 'P');
    if (losers.length === 1 && losers[0] === 'P' && !p.busted && !b.busted && has('velvetCushion') && !f.keepUsed.velvetCushion && Math.abs(p.score - b.score) === 1) {
        f.keepUsed.velvetCushion = true;
        losers = [];
        tied = true;
    }
    if (tied && has('luckySeat') && !f.keepUsed.luckySeat) {
        f.keepUsed.luckySeat = true;
        tied = false;
        losers.push('B');
    }
    // The Ridgeler's Divine Smite: if he wins this round, you lose 2 hearts instead of 1.
    if (f.effect && f.effect.kind === 'smite' && losers.length === 1 && losers[0] === 'P') losers.push('P');
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

// The numbers for a run: shared/balance.js, with opts.numbers on top (opponents' lives merged,
// so an experiment can change some).
function numbersFor(opts) {
    const numbers = opts.numbers || {};
    return {
        ...DEFAULTS, ...numbers,
        opponentLives: { ...DEFAULTS.opponentLives, ...(numbers.opponentLives || {}) },
        abilityUses: { ...DEFAULTS.abilityUses, ...(numbers.abilityUses || {}) }
    };
}

function playRun(policy, opts = {}) {
    const order = opts.order || OPPONENTS;
    const N = { ...numbersFor(opts), fights: order.length };
    const run = newRun(N);
    // For experiments: start at a later opponent (as if the earlier ones were beaten, with no
    // gold from them) and/or with Thonics already on the shelf.
    const startAt = opts.startAt || 0;
    if (opts.shelf) run.shelf = opts.shelf.slice();
    if (opts.setup) opts.setup(run);
    const log = { fights: [], spots: [] };
    let defeated = startAt;
    for (let i = startAt; i < order.length; i++) {
        // For experiments: a keepsake handed over before fight grantAt.index (as if bought then).
        if (opts.grantAt && opts.grantAt.index === i && !run.keepsakes.includes(opts.grantAt.id)) run.keepsakes.push(opts.grantAt.id);
        const result = fight(i, run, { ...opts, numbers: N });
        run.hearts = N.playerHearts;
        log.fights.push(result);
        if (!result.won) break;
        defeated++;
        const win = N.gold.winPerPlace * (i + 1), hearts = N.gold.perHeartLeft * result.heartsLeft;
        run.purse += win + hearts;
        run.stats.winGold += win;
        run.stats.heartGold += hearts;
        // After a boss: their keepsake (Martha's mask), and straight on to the next place (no
        // events on the way).
        if (order[i].boss) run.keepsakes.push(order[i].drops || 'marthasMask');
        else if (i < order.length - 1) between(run, policy, N, i + 1, log);
    }
    const won = defeated === order.length;
    const consolation = won ? 0 : (defeated + 1) * N.gold.consolation;
    return { won, defeated, gold: Math.max(0, run.purse + consolation), run, log };
}

// Keepsakes since 19 Oct (N.keepsakes): the Loaded Die (die 0 rolls loadedDieLow or more), the
// Potion Belt (beltSlots more shelf slots, comes with beltThonic) and Thom's Loyalty Card (Thom
// always one of the spots, the first Thonic of each visit free).
const loadedFace = (run, N) => (run.keepsakes.includes('loadedDie') ? (low => d => (d.id === 0 ? low + Math.floor(Math.random() * (7 - low)) : d6()))(N.keepsakes.loadedDieLow) : undefined);
const shelfSize = (run, N) => N.shelfSize + (run.keepsakes.includes('potionBelt') ? N.keepsakes.beltSlots : 0);

const changePurse = (run, amount) => { const a = Math.max(amount, -run.purse); run.purse += a; run.stats.eventGold += a; return a; };

// eventDone: a random event (thief, Stranger, Darren) already happened this walk; since 21 Oct
// the two spots follow it (I.spotsAfterEvent === false plays the old one-event walk).
function between(run, policy, N, nextIndex, log, eventDone = false) {
    const I = N.interlude;
    const thenSpots = () => (I.spotsAfterEvent === false ? undefined : between(run, policy, N, nextIndex, log, true));
    // Now and then the pickpocket strikes: roll one die to catch them (the server only sends
    // them with something to steal).
    const steal = Math.floor(run.purse * I.pickpocketShare);
    if (!eventDone && steal > 0 && Math.random() * 100 < I.pickpocketChance) {
        if (d6() < I.pickpocketCatch) changePurse(run, -steal);
        log.spots.push('pickpocket');
        return thenSpots();
    }
    const canBet = run.purse >= Math.min(...I.diceDenBets);
    // The Shrine and the hot tub cost gold since 21 Oct: not offered if the purse can't cover it.
    const affords = sp => (sp !== 'shrine' || run.purse >= (I.shrinePrice || 0)) && (sp !== 'hotTub' || run.purse >= (I.hotTubPrice || 0));
    const unowned = KEEPSAKES.filter(k => !run.keepsakes.includes(k));
    // Else, now and then, the Hooded Stranger finds you (while he has keepsakes left): that's
    // the walk. (strangerChance null: he's one of the spots, as before 19 Oct.)
    const strangerEvent = I.strangerChance != null;
    let spot;
    if (!eventDone && strangerEvent && unowned.length && Math.random() * 100 < I.strangerChance) {
        spot = 'stranger';
    } else if (!eventDone && I.darrenChance && nextIndex < 5 && Math.random() * 100 < I.darrenChance) {
        darren(run, N);
        log.spots.push('darren');
        return thenSpots();
    } else {
        const spots = shuffle(['thom', 'shrine', 'diceDen', 'stranger', ...(I.hotTubSurges ? ['hotTub'] : [])].filter(s => (s !== 'stranger' || (!strangerEvent && unowned.length)) && (s !== 'diceDen' || canBet) && affords(s))).slice(0, 2);
        if (run.keepsakes.includes('loyaltyCard') && !spots.includes('thom')) spots[Math.floor(Math.random() * 2)] = 'thom';
        spot = policy.choose(run, spots, N, nextIndex);
    }
    log.spots.push(spot);
    if (spot === 'thom') {
        const stock = ['healing', ...shuffle(THONIC_IDS.filter(t => t !== 'healing')).slice(0, N.shopSize - 1)];
        let free = run.keepsakes.includes('loyaltyCard'); // the Loyalty Card's free Thonic
        for (const id of policy.shop(run, stock, { ...N, shelfSize: shelfSize(run, N) }, nextIndex)) {
            const price = free ? 0 : N.thonicPrices[id];
            if (run.purse >= price && run.shelf.length < shelfSize(run, N)) {
                free = false;
                run.purse -= price;
                run.stats.spent += price;
                run.shelf.push(id);
            }
        }
        // Thom's back shelf (since 21 Oct): keepsakes for gold.
        const wares = shuffle(KEEPSAKES.filter(k => !run.keepsakes.includes(k) && (N.keepsakePrices || {})[k])).slice(0, N.thomKeepsakes || 0);
        for (const id of (policy.buyKeepsakes ? policy.buyKeepsakes(run, wares, N, nextIndex) : [])) {
            const price = N.keepsakePrices[id];
            if (run.purse < price || run.keepsakes.includes(id)) continue;
            run.purse -= price;
            run.stats.spent += price;
            run.keepsakes.push(id);
            run.stats.boughtKeepsakes = (run.stats.boughtKeepsakes || 0) + 1;
            if (id === 'potionBelt' && run.shelf.length < shelfSize(run, N)) run.shelf.push(N.keepsakes.beltThonic);
        }
    } else if (spot === 'hotTub') {
        run.purse -= I.hotTubPrice || 0;
        run.stats.spent += I.hotTubPrice || 0;
        // A wild surge, by weight: the dice ones for the next fight, Pruney a heart short.
        const surge = pickSurge(I.hotTubSurges);
        run.stats.surges = run.stats.surges || {};
        run.stats.surges[surge] = (run.stats.surges[surge] || 0) + 1;
        if (surge === 'pruney') run.hearts = Math.max(1, (run.hearts ?? N.playerHearts) - 1);
        else run.nextSurge = surge;
    } else if (spot === 'shrine') {
        run.purse -= I.shrinePrice || 0;
        run.stats.spent += I.shrinePrice || 0;
        if (I.shrineGifts) {
            // The Lady's blessing, at random: Favour (an extra heart next fight) or Grace (the
            // next dust that would cost a heart doesn't; not given twice).
            let gift = I.shrineGifts[Math.floor(Math.random() * I.shrineGifts.length)];
            if (gift === 'grace' && run.grace) gift = 'favour';
            if (gift === 'favour') run.hearts = (run.hearts ?? N.playerHearts) + I.favourHearts;
            else run.grace = true;
            run.stats.blessings = (run.stats.blessings || 0) + 1;
        } else if (policy.shrine(run, N, nextIndex) === 'healing' && run.shelf.length < shelfSize(run, N)) run.shelf.push('healing'); // before 19 Oct
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
        if (pick) {
            run.keepsakes.push(pick);
            run.hearts = I.strangerHearts;
            if (pick === 'potionBelt' && run.shelf.length < shelfSize(run, N)) run.shelf.push(N.keepsakes.beltThonic);
        }
    }
    if (spot === 'stranger' && strangerEvent && !eventDone) thenSpots();
}

function pickSurge(weights) {
    const entries = Object.entries(weights);
    let roll = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of entries) { if (roll < w) return id; roll -= w; }
    return entries[0][0];
}

// Darren Snakehands (as server.js darrenOutcome): one die; a Thonic smashes (or you pay for the
// glass), a free Thonic, or a Thonic and gold. A full shelf takes the Thonic as gold.
function darren(run, N) {
    const I = N.interlude, roll = d6();
    const free = () => {
        if (run.shelf.length >= shelfSize(run, N)) changePurse(run, I.darrenFullShelfGold);
        else run.shelf.push(THONIC_IDS[Math.floor(Math.random() * THONIC_IDS.length)]);
    };
    if (roll <= I.darrenSmash) {
        if (run.shelf.length) run.shelf.splice(Math.floor(Math.random() * run.shelf.length), 1);
        else changePurse(run, -I.darrenGlass);
    } else if (roll <= I.darrenGift) {
        free();
    } else {
        free();
        changePurse(run, I.darrenCatchGold);
    }
}

module.exports = { OPPONENTS, TOURNAMENT, KEEPSAKES, THONIC_IDS, DEFAULTS, fight, playRun, newRun };
