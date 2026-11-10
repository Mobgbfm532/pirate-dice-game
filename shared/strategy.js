// Best play for the Tavern Crawl opponents (server only).
//
// The game is small enough to solve exactly. A turn's position is: how many dice are still
// to roll (n), whether a 2 and a 4 are kept yet, and the points kept so far (s: every kept die
// except the first 2 and first 4). For every position we work out, over all the ways n dice
// can land and every choice of dice to keep, the best chance of a good finish. The bot then
// keeps whatever gives the best chance from where it stands.
//
// "Good finish" depends on what the bot knows:
//   - It goes second and the player scored T: the chance of beating T (a tie, which goes to
//     sudden death, counts half).
//   - The player dusted: the chance of a valid hand (a 2 and a 4).
//   - It goes first: the chance that a sensible player then fails to beat it (see
//     firstMoverValue: the player's scores are taken from playing for the most points).
// The Salty Swallow's sea (9 Nov) can lean every die one higher or lower (shift +1 / -1): the
// landings are then weighted by the leaning faces (a 6 twice as likely, no 1s; or the reverse).
// A Squall (10 Nov) makes everyone keep two dice a throw (minKeep 2; never more than were thrown).
// Becalmed (10 Nov) gives a hand three throws, then the dice stay as they lie (throws 3: the tables
// are then worked out for each number of throws left, solveLimited).
// Two rounds change what "beat" means: a cursed one (low: the lowest valid score wins, and a
// sensible player plays for the fewest points), and the Devil's (cap: a score counts as no
// more than cap).
'use strict';

const MAX_S = 36; // six dice of 6
const FACT = [1, 1, 2, 6, 24, 120, 720];
const STATES = 7 * (MAX_S + 1) * 4;
const at = (n, s, h) => (n * (MAX_S + 1) + s) * 4 + h; // h: bit 1 = has a 2, bit 2 = has a 4

// Every way k dice can land, as counts per face (1..6), with its probability, and every
// choice of dice to keep from it (at least one) as counts per face.
// The chance of each face (1..6) with the sea's lean: one higher (no 1s, a 6 twice as likely), one lower.
function faceChances(shift = 0) {
    const p = [0, 0, 0, 0, 0, 0];
    for (let f = 1; f <= 6; f++) p[Math.min(6, Math.max(1, f + shift)) - 1] += 1 / 6;
    return p;
}
function landings(k, shift = 0) {
    const chance = faceChances(shift);
    const out = [];
    const counts = [0, 0, 0, 0, 0, 0];
    const spread = (face, left) => {
        if (face === 5) {
            counts[5] = left;
            let p = FACT[k];
            counts.forEach((c, f) => { p = (p / FACT[c]) * chance[f] ** c; });
            if (p > 0) out.push({ counts: counts.slice(), p, keeps: keepChoices(counts) });
            return;
        }
        for (let i = left; i >= 0; i--) { counts[face] = i; spread(face + 1, left - i); }
        counts[face] = 0;
    };
    spread(0, k);
    return out;
}

function keepChoices(counts) {
    const out = [];
    const keep = [0, 0, 0, 0, 0, 0];
    const choose = face => {
        if (face === 6) {
            const k = keep.reduce((a, b) => a + b, 0);
            if (k > 0) out.push({ keep: keep.slice(), k });
            return;
        }
        for (let i = 0; i <= counts[face]; i++) { keep[face] = i; choose(face + 1); }
        keep[face] = 0;
    };
    choose(0);
    return out;
}

const LANDINGS_BY = new Map();
const landingsFor = (shift = 0) => {
    if (!LANDINGS_BY.has(shift)) LANDINGS_BY.set(shift, [null, 1, 2, 3, 4, 5, 6].map(k => (k ? landings(k, shift) : null)));
    return LANDINGS_BY.get(shift);
};

// The opponents play like people: a 2 or 4 they still need is always taken when it shows
// (one of each), and only the rest of the keep is chosen for the best chance. (Pure best play
// often leaves a needed 2 sitting there to keep a lone 6, which looks like a mistake.)
let takeNeeded = true;
const takesNeeded = (h, counts, keep) =>
    !takeNeeded || ((h & 1 || !counts[1] || keep[1] > 0) && (h & 2 || !counts[3] || keep[3] > 0));

// Keeping dice (counts per face) from position (s, h): the first 2 and 4 become required,
// everything else adds to the points.
function afterKeeping(s, h, keep) {
    for (let face = 0; face < 6; face++) {
        const value = face + 1;
        for (let i = 0; i < keep[face]; i++) {
            if (value === 2 && !(h & 1)) h |= 1;
            else if (value === 4 && !(h & 2)) h |= 2;
            else s += value;
        }
    }
    return { s: Math.min(s, MAX_S), h };
}

// Chances of a good finish from every position, for a given finish value
// (finish(score, valid) -> 0..1).
function solve(finish, shift = 0, minKeep = 1) {
    const LANDINGS = landingsFor(shift);
    const V = new Float64Array(STATES);
    for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) V[at(0, s, h)] = finish(s, h === 3);
    for (let n = 1; n <= 6; n++) {
        for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) {
            let total = 0;
            for (const landing of LANDINGS[n]) {
                let best = -1;
                for (const choice of landing.keeps) {
                    if (choice.k < Math.min(minKeep, n)) continue;
                    if (!takesNeeded(h, landing.counts, choice.keep)) continue;
                    const next = afterKeeping(s, h, choice.keep);
                    const v = V[at(n - choice.k, next.s, next.h)];
                    if (v > best) best = v;
                }
                total += landing.p * best;
            }
            V[at(n, s, h)] = total;
        }
    }
    return V;
}

// The same with a limit of `throws` throws a hand: Vs[t] is the value before a throw with t left
// (the last one's dice all stay as they lie).
function solveLimited(finish, shift = 0, minKeep = 1, throws = 3) {
    const LANDINGS = landingsFor(shift);
    const Vs = [];
    for (let t = 0; t <= throws; t++) {
        const V = new Float64Array(STATES);
        for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) V[at(0, s, h)] = finish(s, h === 3);
        if (t > 0) for (let n = 1; n <= 6; n++) {
            for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) {
                let total = 0;
                for (const landing of LANDINGS[n]) {
                    if (t === 1) { const all = afterKeeping(s, h, landing.counts); total += landing.p * V[at(0, all.s, all.h)]; continue; }
                    let best = -1;
                    for (const choice of landing.keeps) {
                        if (choice.k < Math.min(minKeep, n)) continue;
                        if (!takesNeeded(h, landing.counts, choice.keep)) continue;
                        const next = afterKeeping(s, h, choice.keep);
                        const v = Vs[t - 1][at(n - choice.k, next.s, next.h)];
                        if (v > best) best = v;
                    }
                    total += landing.p * best;
                }
                V[at(n, s, h)] = total;
            }
        }
        Vs.push(V);
    }
    return Vs;
}

// The player's likely final scores, if they play for the most points (or, low, the fewest):
// { dust, score[] }.
const playerScores = {};
function sensiblePlayerScores(low = false, shift = 0, minKeep = 1, throws = 0) {
    const key = `${low}|${shift}|${minKeep}|${throws}`;
    if (playerScores[key]) return playerScores[key];
    if (throws) return (playerScores[key] = limitedPlayerScores(low, shift, minKeep, throws));
    const LANDINGS = landingsFor(shift);
    const V = solve((s, valid) => (valid ? (low ? 24 - Math.min(s, 24) : s) / 24 : 0), shift, minKeep);
    const P = new Float64Array(STATES);
    P[at(6, 0, 0)] = 1;
    const result = { dust: 0, score: new Array(MAX_S + 1).fill(0) };
    for (let n = 6; n >= 1; n--) {
        for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) {
            const p = P[at(n, s, h)];
            if (!p) continue;
            for (const landing of LANDINGS[n]) {
                let best = -1, bestNext = null;
                for (const choice of landing.keeps) {
                    if (choice.k < Math.min(minKeep, n)) continue;
                    const next = afterKeeping(s, h, choice.keep);
                    const v = V[at(n - choice.k, next.s, next.h)];
                    if (v > best) { best = v; bestNext = { n: n - choice.k, ...next }; }
                }
                P[at(bestNext.n, bestNext.s, bestNext.h)] += p * landing.p;
            }
        }
    }
    for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) {
        const p = P[at(0, s, h)];
        if (h === 3) result.score[s] += p; else result.dust += p;
    }
    playerScores[key] = result;
    return result;
}

// As above, with a limit of `throws` throws a hand (Becalmed).
function limitedPlayerScores(low, shift, minKeep, throws) {
    const LANDINGS = landingsFor(shift);
    const Vs = solveLimited((s, valid) => (valid ? (low ? 24 - Math.min(s, 24) : s) / 24 : 0), shift, minKeep, throws);
    const result = { dust: 0, score: new Array(MAX_S + 1).fill(0) };
    const end = (p, s, h) => { if (h === 3) result.score[s] += p; else result.dust += p; };
    let P = new Float64Array(STATES);
    P[at(6, 0, 0)] = 1;
    for (let t = throws; t >= 1; t--) {
        const next = new Float64Array(STATES);
        for (let n = 1; n <= 6; n++) for (let s = 0; s <= MAX_S; s++) for (let h = 0; h < 4; h++) {
            const p = P[at(n, s, h)];
            if (!p) continue;
            for (const landing of LANDINGS[n]) {
                if (t === 1) { const all = afterKeeping(s, h, landing.counts); end(p * landing.p, all.s, all.h); continue; }
                let best = -1, bestNext = null;
                for (const choice of landing.keeps) {
                    if (choice.k < Math.min(minKeep, n)) continue;
                    const after = afterKeeping(s, h, choice.keep);
                    const v = Vs[t - 1][at(n - choice.k, after.s, after.h)];
                    if (v > best) { best = v; bestNext = { n: n - choice.k, ...after }; }
                }
                if (bestNext.n === 0) end(p * landing.p, bestNext.s, bestNext.h);
                else next[at(bestNext.n, bestNext.s, bestNext.h)] += p * landing.p;
            }
        }
        P = next;
    }
    return result;
}

// Going first: the value of finishing on a score is the chance the player then fails to
// beat it (they dust, score lower, or tie and lose the sudden death half the time). Cursed
// (low), beating it means scoring lower.
function firstMoverValue(score, low = false, shift = 0, minKeep = 1, throws = 0) {
    const d = sensiblePlayerScores(low, shift, minKeep, throws);
    let fails = d.dust;
    for (let x = 0; x <= MAX_S; x++) if (low ? x > score : x < score) fails += d.score[x];
    return fails + 0.5 * d.score[score];
}

// The finish value for what the bot knows. toBeat: the player's score, null if they dusted,
// undefined if they haven't played yet. aceAt16: the Hangman can turn 16+ into 24. low: a
// cursed round. cap: the bot's score counts as no more than this (the Devil's round).
function finishFor(toBeat, { aceAt16 = false, low = false, cap = null, shift = 0, minKeep = 1, throws = 0 } = {}) {
    const lift = s => Math.min(aceAt16 && !low && s >= 16 && s < 24 ? 24 : s, cap ?? MAX_S);
    if (toBeat === null) return (s, valid) => (valid ? 1 : 0);
    if (toBeat === undefined) return (s, valid) => (valid ? firstMoverValue(Math.min(lift(s), MAX_S), low, shift, minKeep, throws) : 0);
    return (s, valid) => {
        if (!valid) return 0;
        const score = lift(s);
        if (score === toBeat) return 0.5;
        return (low ? score < toBeat : score > toBeat) ? 1 : 0;
    };
}

const tables = new Map();
function tableFor(toBeat, options = {}) {
    const key = `${toBeat}|${options.aceAt16 ? 1 : 0}|${options.low ? 1 : 0}|${options.cap ?? ''}|${options.shift || 0}|${options.minKeep || 1}|${options.throws || 0}`;
    if (!tables.has(key)) {
        const finish = finishFor(toBeat, options);
        const Vs = options.throws ? solveLimited(finish, options.shift || 0, options.minKeep || 1, options.throws) : null;
        tables.set(key, { V: Vs ? Vs[options.throws] : solve(finish, options.shift || 0, options.minKeep || 1), Vs, finish });
    }
    return tables.get(key);
}

// The dice to keep from a turn the bot has just rolled (dice: [{ id, value, status }]).
// Returns die ids, at least one (none allowed with options.optional, when this throw's keep is
// already made, as after Mind Whip). Ties go to keeping more (ending sooner).
// Becalmed: options.throws (a hand's limit) and options.throwsLeft (throws still to come after this keep).
function bestKeeps(dice, toBeat, options = {}) {
    const table = tableFor(toBeat, options);
    const active = dice.filter(d => d.status === 'active');
    if (active.length === 0) return [];
    if (table.Vs && !(options.throwsLeft > 0)) return active.map(d => d.id); // (no throws left: they stay as they lie)
    const V = table.Vs ? table.Vs[options.throwsLeft] : table.V;
    let s = 0, h = 0;
    dice.filter(d => d.status !== 'active' && d.status !== 'stolen').forEach(d => {
        ({ s, h } = afterKeeping(s, h, [1, 2, 3, 4, 5, 6].map(v => (v === d.value ? 1 : 0))));
    });
    const counts = [0, 0, 0, 0, 0, 0];
    active.forEach(d => { counts[d.value - 1]++; });
    let best = null;
    const choices = keepChoices(counts);
    if (options.optional) choices.push({ keep: [0, 0, 0, 0, 0, 0], k: 0 });
    // (A Squall: at least two kept, or every die left; with Mind Whip's die already kept, one fewer.)
    const minKeep = Math.min(Math.max(1, (options.minKeep || 1) - (options.optional ? 1 : 0)), active.length);
    for (const choice of choices) {
        if (choice.k > 0 && choice.k < minKeep) continue;
        if (!takesNeeded(h, counts, choice.keep)) continue;
        const next = afterKeeping(s, h, choice.keep);
        const v = V[at(active.length - choice.k, next.s, next.h)];
        if (!best || v > best.v + 1e-12 || (Math.abs(v - best.v) <= 1e-12 && choice.k > best.k)) best = { v, k: choice.k, keep: choice.keep };
    }
    // Turn the chosen counts back into die ids.
    const want = best.keep.slice();
    return active.filter(d => (want[d.value - 1] > 0 ? (want[d.value - 1]--, true) : false)).map(d => d.id);
}

// The chance of a good finish once these dice (ids, from those in play) are kept, playing on as
// well as possible: the Duke's check on whether he needs his Devil.
function chanceAfterKeep(dice, keepIds, toBeat, options = {}) {
    const { V } = tableFor(toBeat, options);
    let s = 0, h = 0, n = 0;
    dice.forEach(d => {
        if (d.status === 'stolen') return;
        if (d.status === 'active' && !keepIds.includes(d.id)) { n++; return; }
        ({ s, h } = afterKeeping(s, h, [1, 2, 3, 4, 5, 6].map(v => (v === d.value ? 1 : 0))));
    });
    return V[at(n, s, h)];
}

// The chance of a good finish from the start of a turn (for tests and tuning).
function chanceFromStart(toBeat, options = {}) {
    return tableFor(toBeat, options).V[at(6, 0, 0)];
}

// Works out the common tables ahead of time, one every so often, so no bot turn has to wait
// (each takes about a tenth of a second). The timers don't keep the process alive.
function warmUp(gapMs = 250) {
    const targets = [undefined, null, ...Array.from({ length: 21 }, (_, i) => i + 4)];
    const next = () => {
        if (targets.length === 0) return;
        tableFor(targets.shift());
        const timer = setTimeout(next, gapMs);
        if (timer.unref) timer.unref();
    };
    const timer = setTimeout(next, gapMs);
    if (timer.unref) timer.unref();
}

// For tests and tuning: switch the "take a needed 2 or 4" habit off (pure best play) or on.
function setTakeNeeded(on) {
    takeNeeded = on;
    tables.clear();
}

module.exports = { setTakeNeeded, bestKeeps, chanceAfterKeep, chanceFromStart, sensiblePlayerScores, firstMoverValue, warmUp };
