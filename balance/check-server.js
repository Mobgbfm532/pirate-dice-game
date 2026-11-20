// Checks the simulator against the real server: plays first fights against one opponent on a
// real server (over socket.io, like a browser), with the same sensible player and no
// Thonics, and prints how often the player wins. Compare with sim.js's number.
//
//   node balance/check-server.js <opponent 0-4> <fights>
//
// Runs the server in this process, sped up (GAME_TIME_SCALE), on a random port.
'use strict';

const opponent = Number(process.argv[2] || 0);
const fights = Number(process.argv[3] || 200);
process.env.GAME_TIME_SCALE = '0.002';
process.env.LEADERBOARD_READONLY = '1';
process.env.TAVERN_START_ENCOUNTER = String(opponent);

const { io: connect } = require('socket.io-client');
const Strategy = require('../shared/strategy');
const server = require('../server');
const BOT = 'BOT_MOLAR';

function playOneFight(url, n) {
    return new Promise(resolve => {
        const socket = connect(url, { transports: ['websocket'], forceNew: true });
        let state = null;
        let busy = false;
        const finish = won => { clearInterval(watchdog); socket.disconnect(); resolve(won); };
        const act = turn => {
            if (!turn || turn.playerId !== socket.id || busy) return;
            if (turn.finalized) { socket.emit('endTurn'); return; }
            if (!turn.hasRolled) { socket.emit('rollDice'); return; }
            const live = turn.dice.filter(d => d.status === 'active');
            if (!live.length) return;
            let keep;
            if (live.some(d => d.hidden)) keep = [live[Math.floor(Math.random() * live.length)].id]; // Rokr's blur: blind
            else {
                const second = state && state.roundPlayers[0] === BOT;
                const bot = state && state.players[BOT];
                const toBeat = second && bot && bot.score !== null ? (bot.busted ? null : bot.score) : undefined;
                keep = Strategy.bestKeeps(turn.dice, toBeat);
            }
            keep.forEach(id => socket.emit('toggleDie', id));
            setTimeout(() => socket.emit('rollDice'), 5);
        };
        socket.on('gameStateUpdate', s => { state = s; });
        // Always act on the latest view (the last die can lock itself as a roll lands).
        let latest = null;
        socket.on('turnState', ({ turn, event }) => {
            latest = turn;
            if (event && event.type === 'toggle') return;
            if (turn && (!turn.hasRolled || turn.finalized)) act(turn);
        });
        socket.on('diceRolled', ({ turn, animationMs }) => {
            latest = turn;
            busy = true;
            setTimeout(() => { busy = false; act(latest); }, animationMs * 0.002 + 15);
        });
        // Under load the server can refuse a keep or a roll as too early. Every so often, on
        // our turn, carry on from the latest view: end, roll, or (nothing kept yet) choose.
        const watchdog = setInterval(() => {
            const t = latest;
            if (!t || t.playerId !== socket.id || busy) return;
            if (t.finalized) socket.emit('endTurn');
            else if (!t.hasRolled || t.locksThisRoll > 0) socket.emit('rollDice');
            else act(t);
        }, 80);
        socket.on('offerShop', () => finish(true));
        socket.on('gameOver', over => finish(!!(over.tavern && over.tavern.won))); // beating Jaguar ends the run
        socket.on('connect', () => socket.emit('joinTavern', { name: `Check${n}`, roomCode: `TVRN-${n}`, avatar: 'Devil', token: `check-${n}-${Math.random()}`, startingLives: 3 }));
    });
}

(async () => {
    const http = await server.start(0);
    const url = `http://localhost:${http.address().port}`;
    let won = 0, done = 0, next = 0;
    const lane = async () => {
        while (next < fights) {
            const n = next++;
            if (await playOneFight(url, n)) won++;
            done++;
        }
    };
    await Promise.all(Array.from({ length: 25 }, lane));
    const p = won / done;
    console.log(`server: opponent ${opponent}, ${done} fights, player won ${(100 * p).toFixed(1)}% (±${(196 * Math.sqrt(p * (1 - p) / done)).toFixed(1)})`);
    process.exit(0);
})();
