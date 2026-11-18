// An expert plays whole Tavern Crawls on the real server (18 Nov, the user's: "a player who really knows what
// they're doing and makes optimal choices with shops and keepsakes"). Everything in the game today is in play:
// every opponent and ability, the sea, the events and spots between fights, prices by place, keepsakes, Thonics.
//
//   node balance/expert-crawl.js [crawls] [lanes]
//
// Runs the server in this process, sped up (GAME_TIME_SCALE), on a random port, like check-server.js.
// The expert: keeps dice by the opponents' own best-play brain (shared/strategy.js), against the score to beat
// when it's known; drinks Healing when hurt, Clear-Eye as a fight with abilities begins, Fizzy on 1s, Steady when
// a hand is in trouble; uses the Gilded Die on a loose 1 and the Inspiring Song on a bad first throw; between
// fights goes where it pays (the Shrine, Thom when there's a keepsake worth having or a Healing to buy, the
// Bard's Cutting Words, Jorvash), buys keepsakes in order of worth, swears to Kram, takes a boss's keepsake.
'use strict';

const CRAWLS = Number(process.argv[2] || 200);
const LANES = Number(process.argv[3] || 16);
process.env.GAME_TIME_SCALE = process.env.GAME_TIME_SCALE || '0.002';
process.env.LEADERBOARD_READONLY = '1';

// NUMBERS='{"playerHearts":4}' (env): shared/balance.js changed for this run only, before the server reads it
// (opponentLives merged: '{"opponentLives":{"duke":2}}'; LIVES_LESS=1 takes a life off every opponent, never below 1).
const BALANCE = require('../shared/balance');
if (process.env.NUMBERS) { const n = JSON.parse(process.env.NUMBERS); for (const [k, v] of Object.entries(n)) BALANCE[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...BALANCE[k], ...v } : v; }
if (process.env.LIVES_LESS) for (const id of Object.keys(BALANCE.opponentLives)) BALANCE.opponentLives[id] = Math.max(1, BALANCE.opponentLives[id] - Number(process.env.LIVES_LESS));
const { io: connect } = require('socket.io-client');
const Strategy = require('../shared/strategy');
const server = require('../server');
const BOT = 'BOT_MOLAR';
const SCALE = Number(process.env.GAME_TIME_SCALE);

// Keepsakes by worth to an expert (the Shield first: a heart a fight).
const KEEPSAKE_ORDER = ['bentCopper', 'luckySeat', 'velvetCushion', 'potionBelt', 'gamblersCharm', 'loadedDie', 'gildedDie', 'brensCompass', 'bottomlessFlask', 'mysteryFlavour', 'brodorsSunglasses', 'misersPurse', 'loyaltyCard'];
const worth = id => { const i = KEEPSAKE_ORDER.indexOf(id); return i < 0 ? 99 : i; };
const SEA_SHIFT = { starboard: 1, port: -1 };

function playCrawl(url, n) {
    return new Promise(resolve => {
        const socket = connect(url, { transports: ['websocket'], forceNew: true });
        let state = null, latest = null, busy = false, lastMove = Date.now();
        const log = { fights: [], bought: [], spots: [], stalled: false };
        let fightAt = -1;
        let usedThisThrow = new Set(), drankThisTurn = new Set();
        let keptFor = '', keptAt = 0; // (one keep a throw: a second set of taps would un-keep what the first kept)
        const finish = summary => {
            clearInterval(watchdog);
            socket.disconnect();
            resolve({ ...log, summary });
        };
        const run = () => state && state.tavernRun;
        const me = () => state && state.players[socket.id];
        const slotOf = id => (run() ? run().shelf.findIndex(t => t.id === id) : -1);

        // ---- In a fight ----
        const roundOpts = turn => {
            const r = run() || {};
            const ward = !!r.seaWard;
            return {
                low: !!(r.roundEffect && r.roundEffect.kind === 'curse'),
                shift: ward ? 0 : SEA_SHIFT[r.sea] || 0,
                minKeep: !ward && r.sea === 'squall' ? 2 : 1,
                throws: turn.maxThrows || 0,
                throwsLeft: turn.maxThrows ? turn.maxThrows - turn.rollCount : undefined,
                optional: turn.dice.some(d => d.mind && d.status === 'lockedThisTurn')
            };
        };
        const toBeatNow = () => {
            const bot = state && state.players[BOT];
            const second = state && state.roundPlayers[0] === BOT;
            if (!second || !bot || bot.score === null || bot.scoreHidden) return undefined;
            return bot.busted ? null : bot.score;
        };
        const act = turn => {
            if (!turn || turn.playerId !== socket.id || busy) return;
            lastMove = Date.now();
            if (turn.finalized || turn.complete) { socket.emit('endTurn'); return; }
            const r = run(), p = me();
            if (!turn.hasRolled) {
                // Before the first throw: Healing when hurt, Clear-Eye as a fight with abilities begins.
                if (p && r && p.lives < state.startingLives && slotOf('healing') >= 0 && !drankThisTurn.has('healing')) {
                    drankThisTurn.add('healing'); socket.emit('drinkThonic', slotOf('healing'));
                } else if (r && slotOf('clearEye') >= 0 && !r.clearEye && (r.abilityMax || 0) > (r.abilitySpent || 0) && !drankThisTurn.has('clearEye')) {
                    drankThisTurn.add('clearEye'); socket.emit('drinkThonic', slotOf('clearEye'));
                }
                setTimeout(() => socket.emit('rollDice'), 8);
                return;
            }
            const live = turn.dice.filter(d => d.status === 'active');
            if (!live.length) return;
            const throwKey = `${turn.key}:${turn.rollCount}`;
            const kept = turn.dice.filter(d => d.status !== 'active' && d.status !== 'stolen').map(d => d.value);
            const visible = !live.some(d => d.hidden);
            // Help with the throw, at most one a throw.
            if (visible && !usedThisThrow.has(throwKey) && r) {
                const need = [2, 4].filter(v => !kept.includes(v));
                if (r.bard && r.bard.song === 'now' && turn.rollCount === 1 && !live.some(d => need.includes(d.value)) && live.reduce((a, d) => a + d.value, 0) < 18) {
                    usedThisThrow.add(throwKey); socket.emit('inspiringSong'); return;
                }
                const ones = live.filter(d => d.value === 1);
                if (ones.length >= 2 && slotOf('fizzy') >= 0 && !drankThisTurn.has('fizzy')) {
                    usedThisThrow.add(throwKey); drankThisTurn.add('fizzy'); socket.emit('drinkThonic', slotOf('fizzy')); return;
                }
                if (r.gilded && r.gilded.uses < r.gilded.max && r.purse >= r.gilded.price && r.gilded.price <= 12) {
                    const poor = live.filter(d => d.value <= 2 && !need.includes(d.value)).sort((a, b) => a.value - b.value)[0];
                    if (poor && live.length >= 2) { usedThisThrow.add(throwKey); socket.emit('gildDie', poor.id); return; }
                }
                // Steady: a hand in trouble near its end.
                if (need.length && live.length <= 2 && !live.some(d => need.includes(d.value)) && slotOf('steady') >= 0 && !drankThisTurn.has('steady')) {
                    drankThisTurn.add('steady'); socket.emit('drinkThonic', slotOf('steady'));
                }
            }
            if (keptFor === throwKey && Date.now() - keptAt < 1500) { socket.emit('rollDice'); return; }
            let keep;
            if (!visible) keep = live.slice(0, Math.max(1, turn.mustKeep || 1)).map(d => d.id); // (Starry Form, fog: blind)
            else keep = Strategy.bestKeeps(turn.dice, toBeatNow(), roundOpts(turn));
            if (!keep.length && !roundOpts(turn).optional) keep = [live.sort((a, b) => b.value - a.value)[0].id];
            keptFor = throwKey; keptAt = Date.now();
            keep.forEach(id => socket.emit('toggleDie', id));
            setTimeout(() => socket.emit('rollDice'), 6);
        };

        // ---- Between fights ----
        const spotWorth = (spot, r) => {
            const purse = r.purse, pr = r.prices || {};
            const pockets = r.keepsakes.length;
            switch (spot) {
                case 'shrine': return r.ladysGrace ? 3 : 9;
                case 'thom': return (pockets < 5 && purse >= 20) || r.shelf.length < 2 ? 8 : 3;
                case 'bard': return 6;
                case 'jorvash': return 6;
                case 'hotTub': return 4;
                case 'yvesil': return 2;
                case 'elfKid': return purse > 60 ? 3 : 1;
                default: return 0;
            }
        };
        const shop = () => {
            const r = run();
            const s = r.shop;
            let purse = r.purse;
            // Keepsakes first, best first, keeping enough for a Healing.
            const healPrice = (s.stock.find(t => t.id === 'healing') || {}).price || 0;
            for (const k of [...(s.keepsakes || [])].sort((a, b) => worth(a.id) - worth(b.id))) {
                const full = r.keepsakes.length >= 5;
                const worst = [...r.keepsakes].sort((a, b) => worth(b.id) - worth(a.id))[0];
                if (full && (!worst || worth(worst.id) <= worth(k.id))) continue;
                if (purse - k.price < (r.shelf.length ? 0 : healPrice)) continue;
                socket.emit('buyKeepsake', k.id, full ? worst.id : undefined);
                log.bought.push(k.id);
                purse -= k.price;
                break; // (one a visit; the state comes back before the next)
            }
            // Then Thonics: Healing, Last Gasp, Steady, Clear-Eye, while there's room.
            const room = 2 + (r.keepsakes.some(k => k.id === 'potionBelt') ? 1 : 0) - r.shelf.length;
            let slots = room;
            for (const id of ['healing', 'lastGasp', 'healing', 'clearEye', 'steady', 'fizzy']) {
                if (slots <= 0) break;
                const t = s.stock.find(x => x.id === id);
                if (!t) continue;
                const price = s.free ? 0 : t.price;
                if (price > purse) continue;
                socket.emit('buyThonic', id);
                log.bought.push(id);
                purse -= price;
                slots--;
            }
            setTimeout(() => socket.emit('moveOn'), 20);
        };
        let handledKey = '';
        const between = () => {
            const r = run();
            if (!r) return;
            if (r.shop) { const k = `shop:${r.encounterNumber}:${r.purse}:${r.shelf.length}:${r.keepsakes.length}`; if (k === handledKey) return; handledKey = k; shop(); return; }
            const it = r.interlude;
            if (!it) return;
            const k = `${it.stage}:${r.encounterNumber}:${it.roll || ''}:${it.claim || ''}:${r.purse}`;
            if (k === handledKey) return;
            handledKey = k;
            lastMove = Date.now();
            switch (it.stage) {
                case 'pickpocket': case 'darren':
                    if (!it.roll) socket.emit(it.stage, 'roll'); else socket.emit('lookAround');
                    break;
                case 'stranger': {
                    const best = [...(it.offers || [])].sort((a, b) => worth(a.id) - worth(b.id))[0];
                    socket.emit('strangerPick', best && worth(best.id) <= 2 && r.keepsakes.length < 5 ? best.id : null);
                    break;
                }
                case 'kram': socket.emit('kram', 'swear'); break;
                case 'invitation':
                    if (it.claim === 'open') {
                        const full = r.keepsakes.length >= 5;
                        const worst = [...r.keepsakes].sort((a, b) => worth(b.id) - worth(a.id))[0];
                        const dropId = it.drop && it.drop.id;
                        if (!full) socket.emit('claimDrop', true);
                        else if (worst && worth(worst.id) > worth(dropId)) socket.emit('claimDrop', true, worst.id);
                        else socket.emit('claimDrop', false);
                    } else socket.emit('moveOn');
                    break;
                case 'choose': {
                    const spots = it.spots || [];
                    const pick = [...spots].sort((a, b) => spotWorth(b, r) - spotWorth(a, r))[0];
                    log.spots.push(pick || 'none');
                    if (pick) socket.emit('chooseSpot', pick); else socket.emit('moveOn');
                    break;
                }
                case 'shrine': socket.emit('shrinePick', 'pray'); break;
                case 'hotTub': socket.emit('hotTub', 'soak'); break;
                case 'bard': socket.emit('bardPick', 'cuttingWords'); break;
                case 'yvesil': socket.emit('yvesilPick', true); break;
                case 'jorvash': {
                    const next = r.enemy && r.enemy.id;
                    socket.emit('jorvashPick', next === 'hangman' || next === 'jaguar' || next === 'rokr' ? 'ebonShield' : 'notaroRed');
                    break;
                }
                case 'elfKid': socket.emit('moveOn'); break;
                case 'done':
                    if (it.spot === 'stranger' || it.spot === 'kram') socket.emit('lookAround'); else socket.emit('moveOn');
                    break;
                default: socket.emit('moveOn');
            }
        };

        socket.on('gameStateUpdate', s => {
            state = s;
            const r = s.tavernRun;
            if (r && r.encounterNumber !== fightAt && !r.interlude && !r.shop) {
                fightAt = r.encounterNumber;
                log.fights.push({ n: r.encounterNumber, id: r.enemy ? r.enemy.id : '?', won: false, heartsLeft: null });
                socket.emit('introDone');
            }
            if (r && (r.interlude || r.shop)) setTimeout(between, 5);
        });
        socket.on('turnState', ({ turn, event }) => {
            latest = turn;
            if (turn && turn.key !== (latest && latest.key)) drankThisTurn = new Set();
            if (event && event.type === 'toggle') return;
            if (turn && (!turn.hasRolled || turn.finalized || turn.complete)) act(turn);
        });
        let lastTurnKey = '';
        socket.on('diceRolled', ({ turn, animationMs }) => {
            latest = turn;
            if (turn.key !== lastTurnKey) { lastTurnKey = turn.key; drankThisTurn = new Set(); }
            busy = true;
            setTimeout(() => { busy = false; act(latest); }, animationMs * SCALE + 15);
        });
        socket.on('offerShop', () => {
            const f = log.fights[log.fights.length - 1];
            if (f) { f.won = true; f.heartsLeft = me() ? me().lives : null; }
        });
        socket.on('gameOver', over => {
            const f = log.fights[log.fights.length - 1];
            if (f && over.tavern && over.tavern.won) f.won = true;
            finish(over.tavern || null);
        });
        const watchdog = setInterval(() => {
            if (Date.now() - lastMove > 30000) { log.stalled = true; finish(null); return; }
            const t = latest;
            if (run() && (run().interlude || run().shop)) { handledKey = ''; between(); return; }
            if (!t || t.playerId !== socket.id || busy) return;
            if (t.finalized || t.complete) socket.emit('endTurn');
            else if (!t.hasRolled || t.locksThisRoll > 0) socket.emit('rollDice');
            else act(t);
        }, 120);
        socket.on('connect', () => socket.emit('joinTavern', { name: `Expert${n}`, roomCode: `TVRN-X${n}`, avatar: 'Shield of Fuckery', token: `expert-${n}-${Math.random()}`, startingLives: 3 }));
    });
}

(async () => {
    const http = await server.start(0);
    const url = `http://localhost:${http.address().port}`;
    const results = [];
    let next = 0;
    const t0 = Date.now();
    const lane = async () => {
        while (next < CRAWLS) {
            const n = next++;
            results.push(await playCrawl(url, n));
            if (results.length % 20 === 0) process.stderr.write(`${results.length}/${CRAWLS} crawls (${Math.round((Date.now() - t0) / 1000)} s)\n`);
        }
    };
    await Promise.all(Array.from({ length: LANES }, lane));
    // (Counted from the server's own run-over summary: how many it beat, and whether it won.)
    const ok = results.filter(r => !r.stalled && r.summary);
    const order = server.TAVERN_ENCOUNTERS.map(e => e.id);
    const beat = r => (r.summary.won ? order.length : r.summary.defeated);
    const reached = i => ok.filter(r => beat(r) >= i).length; // faced fight i (0-based)
    const won = i => ok.filter(r => beat(r) > i).length;
    const finished = ok.filter(r => r.summary.won).length;
    const spared = ok.reduce((a, r) => a + ((r.summary.stats && r.summary.stats.heartsSpared) || 0), 0), wins = ok.reduce((a, r) => a + beat(r), 0);
    const pct = (x, y) => (y ? (100 * x / y).toFixed(0) + '%' : '-');
    const out = [];
    const changed = `${process.env.NUMBERS ? ' NUMBERS=' + process.env.NUMBERS : ''}${process.env.LIVES_LESS ? ' LIVES_LESS=' + process.env.LIVES_LESS : ''}`;
    out.push(`Expert, ${ok.length} whole crawls on the real server (${results.length - ok.length} stalled and left out), ${Math.round((Date.now() - t0) / 1000)} s${changed}`);
    out.push(`finished the crawl: ${pct(finished, ok.length)}; reached the Yawning Portal ${pct(reached(5), ok.length)}, the ship ${pct(reached(10), ok.length)}, Jaguar ${pct(reached(14), ok.length)}; hearts left a win ${(spared / (wins || 1)).toFixed(1)}`);
    out.push('fight             reached   won (of those who faced them)');
    order.forEach((id, i) => out.push(`${String(i + 1).padStart(2)} ${id.padEnd(12)} ${pct(reached(i), ok.length).padStart(6)}   ${pct(won(i), reached(i)).padStart(5)} of ${String(reached(i)).padStart(4)}`));
    const points = ok.map(r => (r.summary && r.summary.points) || 0).sort((a, b) => a - b);
    const gold = ok.map(r => (r.summary && (r.summary.totalGold ?? r.summary.gold)) || 0);
    out.push(`points: median ${points[points.length >> 1] || 0}, best ${points[points.length - 1] || 0}; gold at the end, average ${Math.round(gold.reduce((a, b) => a + b, 0) / (gold.length || 1))}`);
    const counts = {};
    ok.forEach(r => r.bought.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    out.push('bought per crawl: ' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${id} ${(c / ok.length).toFixed(1)}`).join(', '));
    const spots = {};
    ok.forEach(r => r.spots.forEach(s => { spots[s] = (spots[s] || 0) + 1; }));
    out.push('spots chosen per crawl: ' + Object.entries(spots).sort((a, b) => b[1] - a[1]).map(([id, c]) => `${id} ${(c / ok.length).toFixed(1)}`).join(', '));
    // (Exit only once it's written: on Windows a pipe or file is written later, and exiting first loses it.)
    process.stdout.write(out.join('\n') + '\n', () => process.exit(0));
})();
