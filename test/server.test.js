// End-to-end tests: a real server on a random port, driven by socket.io clients.
process.env.GAME_TIME_SCALE = '0.01';
process.env.LEADERBOARD_READONLY = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const Rules = require('../shared/rules');
const server = require('../server');
const Strategy = require('../shared/strategy');
const BALANCE = require('../shared/balance');
const PRICE = BALANCE.thonicPrices;

let url;
const clients = [];

test.before(async () => {
    const http = await server.start(0);
    url = `http://localhost:${http.address().port}`;
});

test.after(() => {
    clients.forEach(c => c.disconnect());
    server.io.close();
});

function join(name, roomCode, extra = {}) {
    return new Promise(resolve => {
        const socket = connect(url, { transports: ['websocket'], forceNew: true });
        clients.push(socket);
        socket.on('connect', () => {
            socket.emit('joinTavern', { name, roomCode, avatar: 'Devil', token: `${name}-${Math.random()}`, startingLives: 3, ...extra });
            resolve(socket);
        });
    });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`timed out waiting for ${event}`)); }, timeoutMs);
        function handler(data) {
            if (!predicate(data)) return;
            clearTimeout(timer);
            socket.off(event, handler);
            resolve(data);
        }
        socket.on(event, handler);
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Plays this socket's turns automatically using the bot's strategy.
function autoPlay(socket, onShop = null) {
    const act = turn => {
        if (!turn || turn.playerId !== socket.id) return;
        if (turn.finalized) socket.emit('endTurn');
        else if (!turn.hasRolled) socket.emit('rollDice');
        else {
            Rules.planBotLocks(turn, 'molar').forEach(id => socket.emit('toggleDie', id));
            socket.emit('rollDice');
        }
    };
    socket.on('turnState', ({ turn, event }) => {
        if (event && event.type === 'toggle') return;
        if (turn && (!turn.hasRolled || turn.finalized)) act(turn);
    });
    socket.on('diceRolled', ({ turn, animationMs }) => setTimeout(() => act(turn), animationMs * 0.01 + 10));
    if (onShop) socket.on('offerShop', onShop);
}

test('only the current player can roll, and every player sees the same dice', async () => {
    const alice = await join('Alice', 'TESTA');
    const bob = await join('Bob', 'TESTA');
    const state = await waitFor(bob, 'gameStateUpdate', s => s.playerOrder.length === 2);
    const [current, other] = state.currentTurnId === alice.id ? [alice, bob] : [bob, alice];

    let unexpectedRoll = false;
    current.once('diceRolled', () => { unexpectedRoll = true; });
    other.emit('rollDice');
    await sleep(50);
    assert.equal(unexpectedRoll, false, 'the waiting player cannot roll');

    const seenByCurrent = waitFor(current, 'diceRolled');
    const seenByOther = waitFor(other, 'diceRolled');
    current.emit('rollDice');
    const [a, b] = await Promise.all([seenByCurrent, seenByOther]);
    assert.deepEqual(a.turn.dice, b.turn.dice);
    assert.equal(a.throwSeed, b.throwSeed, 'both screens get the same throw');
    assert.ok(Number.isInteger(a.throwSeed));
    assert.ok(a.turn.dice.every(d => d.value >= 1 && d.value <= 6));
});

test('a browser cannot report its own score', async () => {
    const carol = await join('Carol', 'TESTB');
    const dave = await join('Dave', 'TESTB');
    const state = await waitFor(dave, 'gameStateUpdate', s => s.playerOrder.length === 2);
    const current = state.currentTurnId === carol.id ? carol : dave;

    // The old client sent { score, busted }; the server now ignores it until the dice are finished.
    current.emit('endTurn', { score: 24, busted: false });
    await sleep(50);
    current.emit('rollDice');
    const rolled = await waitFor(current, 'diceRolled');
    await sleep(rolled.animationMs * 0.01 + 10);

    // Lock every die, then end the turn: the score must be whatever the dice say.
    rolled.turn.dice.forEach(d => current.emit('toggleDie', d.id));
    const finished = await waitFor(current, 'turnState', d => d.event && d.event.type === 'finalized');
    const expected = finished.event.outcome;
    // First turn of the round, so the score stays on the board while the other player goes.
    const scored = waitFor(current, 'gameStateUpdate', s => s.currentTurnId !== current.id);
    current.emit('endTurn', { score: 24, busted: false });
    const after = await scored;
    assert.equal(after.players[current.id].score, expected.score);
    assert.equal(after.players[current.id].busted, expected.busted);
});

// Where an opponent sits in the run (TAVERN_ENCOUNTERS), by id.
const fightOf = id => server.TAVERN_ENCOUNTERS.findIndex(e => e.id === id);

// Puts a fresh Tavern Crawl table straight onto a given opponent with their ability ready.
async function tavernAgainst(encounterIndex, name) {
    // A table of its own (a code from the clock alone now and then matched an earlier test's table).
    const roomCode = `TVRN-A${++tavernTables}`; // codes are cut to 10 characters
    const hero = await join(name, roomCode);
    await waitFor(hero, 'gameStateUpdate');
    const room = server.rooms[roomCode];
    room.tavernRun.encounterIndex = encounterIndex;
    room.tavernRun.abilityRound = 1;
    return hero;
}

test('Klarg steals a die on the server', async () => {
    const hero = await tavernAgainst(fightOf('klarg'), 'KlargTest');
    const move = waitFor(hero, 'signatureMove');
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled');
    assert.equal(rolled.turn.dice.filter(d => d.status === Rules.STATUS.STOLEN).length, 1);
    assert.equal((await move).ability, 'Reach Around');
});

test('Rokr blur hides dice values from the browser itself', async () => {
    const hero = await tavernAgainst(fightOf('rokr'), 'RokrTest');
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled');
    assert.ok(rolled.turn.dice.every(d => d.hidden && d.value === 0), 'no real values are sent while blurred');
});

test('unknown reactions are dropped and names are passed through as plain data', async () => {
    const erin = await join('<img src=x>', 'TESTC');
    await join('Frank', 'TESTC');
    // The first reaction to arrive must be the real one: the unknown one is dropped.
    const first = waitFor(erin, 'receiveReaction');
    erin.emit('sendReaction', '<script>alert(1)</script>');
    erin.emit('sendReaction', '😀');
    assert.equal((await first).emoji, '😀');
});

test('a solo game against The Molar plays through to game over', async () => {
    const solo = await join('Solo', 'COMP-1');
    autoPlay(solo);
    const over = await waitFor(solo, 'gameOver', () => true, 20000);
    assert.match(over.message, /wins the table/);
});

test('a Tavern Crawl run plays through to the end', async () => {
    const hero = await join('Hero', 'TVRN-1');
    autoPlay(hero, () => hero.emit('leaveShop'));
    const over = await waitFor(hero, 'gameOver', () => true, 60000);
    assert.match(over.message, /Points: \d+/);
    // The 3D client's end-of-run screen reads this summary.
    const t = over.tavern;
    assert.equal(t.name, 'Hero');
    assert.equal(t.encounters.length, server.TAVERN_ENCOUNTERS.length);
    assert.equal(t.won, t.defeated === server.TAVERN_ENCOUNTERS.length);
    assert.equal(t.fellTo, t.won ? null : t.encounters[t.defeated]);
    // (Walking straight on lets a pickpocket keep what they took: that's in `events`.)
    const { fights, hearts, perfect, reached, gold, purse, events, spent } = t.breakdown;
    assert.equal(t.stats.winGold + t.stats.heartGold + t.stats.perfectGold + events - spent, purse);
    assert.equal(purse, t.gold);
    assert.equal(fights + hearts + perfect + reached + gold, t.points, 'the leaderboard ranks by these points');
});

// Times in the server are scaled by GAME_TIME_SCALE (0.01): the 30s turn grace is 0.3s
// here and the 2-minute empty-table grace is 1.2s.

test('a table survives everyone dropping off briefly, and they get their seats back', async () => {
    const a = await join('Ann', 'GRACE1', { token: 'ann-token', startingLives: 2 });
    const b = await join('Bob', 'GRACE1', { token: 'bob-token' });
    await waitFor(b, 'gameStateUpdate', s => s.playerOrder.length === 2);
    a.disconnect();
    b.disconnect();
    await sleep(200);
    assert.ok(server.rooms.GRACE1, 'the table is still there');

    const a2 = await join('Ann', 'GRACE1', { token: 'ann-token' });
    const state = await waitFor(a2, 'gameStateUpdate', s => s.players[a2.id]);
    assert.equal(state.playerOrder.length, 2, 'same two seats, no new player');
    assert.equal(state.startingLives, 2, 'same game, not a fresh one');
});

test('an empty table is cleared after the grace period', async () => {
    const lone = await join('Lone', 'GRACE2');
    await waitFor(lone, 'gameStateUpdate');
    lone.disconnect();
    await sleep(1500);
    assert.equal(server.rooms.GRACE2, undefined);
});

test('the player whose turn it is can reconnect and carry on', async () => {
    const c = await join('Cat', 'GRACE3', { token: 'cat-token' });
    const d = await join('Dan', 'GRACE3', { token: 'dan-token' });
    const state = await waitFor(d, 'gameStateUpdate', s => s.playerOrder.length === 2);
    const [current, currentToken, other] = state.currentTurnId === c.id ? [c, 'cat-token', d] : [d, 'dan-token', c];
    current.emit('rollDice');
    await waitFor(current, 'diceRolled');
    current.disconnect();
    await sleep(100); // well inside the 0.3s grace

    const back = await join('Back', 'GRACE3', { token: currentToken });
    const after = await waitFor(back, 'turnState', t => t.turn && t.turn.playerId === back.id);
    assert.equal(after.turn.rollCount, 1, 'same turn, with the roll they already made');
    await sleep(500); // past the grace: nothing should be forfeited now they're back
    assert.equal(server.rooms.GRACE3.roundPlayers[server.rooms.GRACE3.currentTurnIndex], back.id);
    other.disconnect();
    back.disconnect();
});

test('if they do not come back while others wait, their turn is dust', async () => {
    const e = await join('Eve', 'GRACE4', { token: 'eve-token' });
    const f = await join('Fay', 'GRACE4', { token: 'fay-token' });
    const state = await waitFor(f, 'gameStateUpdate', s => s.playerOrder.length === 2);
    const [current, waiting] = state.currentTurnId === e.id ? [e, f] : [f, e];
    const currentId = current.id;
    current.disconnect();
    const next = await waitFor(waiting, 'gameStateUpdate', s => s.currentTurnId === waiting.id, 3000);
    assert.equal(next.players[currentId].busted, true);
    waiting.disconnect();
});

test('a bot waits for you instead of playing to an empty room', async () => {
    const g = await join('Gil', 'COMP-GRACE', { token: 'gil-token' });
    await waitFor(g, 'gameStateUpdate');
    g.disconnect();
    await sleep(400);
    const room = server.rooms['COMP-GRACE'];
    assert.ok(room);
    const rollsBefore = room.turn ? room.turn.rollCount : 0;
    await sleep(400);
    assert.equal(room.turn ? room.turn.rollCount : 0, rollsBefore, 'the bot is paused');

    const g2 = await join('Gil', 'COMP-GRACE', { token: 'gil-token' });
    autoPlay(g2);
    const over = await waitFor(g2, 'gameOver', () => true, 20000);
    assert.match(over.message, /wins the table/);
});

test('the last die goes into its slot by itself once it lands', async () => {
    const h = await join('Hal', 'LASTDIE');
    const i = await join('Ivy', 'LASTDIE');
    const state = await waitFor(i, 'gameStateUpdate', s => s.playerOrder.length === 2);
    const current = state.currentTurnId === h.id ? h : i;

    current.emit('rollDice');
    const first = await waitFor(current, 'diceRolled');
    await sleep(first.animationMs * 0.01 + 20);
    first.turn.dice.slice(0, 5).forEach(d => current.emit('toggleDie', d.id)); // keep five
    await sleep(50);
    current.emit('rollDice'); // roll the last one

    const finished = await waitFor(current, 'turnState', d => d.event && d.event.type === 'finalized', 3000);
    assert.equal(finished.turn.dice.filter(d => d.status === 'active').length, 0, 'nothing left to tap');
    assert.equal(finished.turn.finalized, true, 'ready for End Turn');
    const stillTheirTurn = server.rooms.LASTDIE.roundPlayers[server.rooms.LASTDIE.currentTurnIndex];
    assert.equal(stillTheirTurn, current.id, 'the player still ends the turn themselves');
    h.disconnect();
    i.disconnect();
});

test('bots finish their turns even when the server is too busy to keep its timers in order', async () => {
    // The server runs in this process: hog its event loop in bursts so timers pile up and
    // fire late together (the bot used to stall when its "what next?" check ran first).
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hog = setInterval(() => { const end = Date.now() + 5 + rnd() * 35; while (Date.now() < end) { /* busy */ } }, 3);
    try {
        const games = [1, 2, 3, 4, 5, 6].map(async n => {
            const solo = await join(`Busy${n}`, `COMP-BUSY${n}`);
            const over = waitFor(solo, 'gameOver', () => true, 60000);
            autoPlay(solo);
            solo.emit('rollDice'); // in case the first turn was announced before autoPlay listened
            return over;
        });
        const results = await Promise.all(games);
        results.forEach(over => assert.match(over.message, /wins the table/));
    } finally {
        clearInterval(hog);
    }
});

// ---- Thom's Thonics ----

let tavernTables = 0;

// A fresh Tavern Crawl table with one player. Returns the socket, its room code and the room.
async function tavernTable(name, extra = {}) {
    const roomCode = `TVRN-T${++tavernTables}`;
    const hero = await join(name, roomCode, extra);
    await waitFor(hero, 'gameStateUpdate', s => s.playerOrder.includes(hero.id));
    return { hero, roomCode, room: server.rooms[roomCode] };
}

const runOf = state => state.tavernRun;
const nextState = (socket, predicate = () => true) => waitFor(socket, 'gameStateUpdate', predicate);

// Opens Thom's cart straight away, with the given purse.
async function atThoms(name, purse) {
    const t = await tavernTable(name);
    t.room.tavernRun.shop = { stock: ['healing', 'lastGasp'] };
    t.room.tavernRun.purse = purse;
    t.room.roundPlayers = [];
    return t;
}

// Plays the player's turn with the dice they're given: one roll, the values swapped in on
// the server, every die kept, then End Turn.
async function playHand(hero, room, values) {
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    room.turn.dice.forEach((d, i) => { d.value = values[i]; });
    await sleep(rolled.animationMs * 0.01 + 20);
    const finished = waitFor(hero, 'turnState', d => d.turn && d.turn.playerId === hero.id && d.turn.finalized);
    room.turn.dice.forEach(d => hero.emit('toggleDie', d.id));
    await finished;
    hero.emit('endTurn');
}

// Every roll the opponent makes comes up all 1s, so they dust.
function opponentAlwaysDusts(hero, room) {
    hero.on('diceRolled', d => {
        if (d.turn.playerId !== 'BOT_MOLAR' || !room.turn) return;
        room.turn.dice.forEach(die => { if (die.status === 'active') die.value = 1; });
    });
}

test('an opponent who can no longer win keeps what is left and ends the round', async () => {
    const { hero, room } = await tavernTable('Unbeatable');
    room.players.BOT_MOLAR.lives = 3;
    // The opponent's first throw is all 1s: whatever they keep, 24 is then out of reach.
    let throws = 0;
    hero.on('diceRolled', d => {
        if (d.turn.playerId !== 'BOT_MOLAR') return;
        throws++;
        if (throws === 1) room.turn.dice.forEach(die => { if (die.status === 'active') die.value = 1; });
    });
    const result = waitFor(hero, 'roundResult', () => true, 8000);
    await playHand(hero, room, [2, 4, 6, 6, 6, 6]); // a perfect 24 to beat
    await result;
    assert.equal(throws, 1, 'no throw after 24 became impossible: they kept the rest');
    assert.equal(room.players.BOT_MOLAR.lives, 2, 'and lost the round');
});

test('Thom sells a Thonic for its price and puts it on the shelf', async () => {
    const { hero, room } = await atThoms('Buyer', 200);
    const bought = nextState(hero, s => runOf(s).shelf.length === 1);
    hero.emit('buyThonic', 'healing');
    const run = runOf(await bought);
    assert.equal(run.purse, 200 - PRICE.healing);
    assert.deepEqual(run.shelf.map(t => t.id), ['healing']);
    assert.equal(room.tavernRun.stats.spent, PRICE.healing);
    assert.equal(run.shop.stock.length, 2, 'the cart is still open');
});

test('Thom refuses what you cannot afford, unknown Thonics and bad input', async () => {
    const { hero, room } = await atThoms('Broke', 1);
    for (const bad of ['healing', 'lastGasp', 'fizzy', 'elixir', 'toString', '__proto__', 42, null, { id: 'healing' }, ['healing']]) hero.emit('buyThonic', bad);
    await sleep(80);
    assert.equal(room.tavernRun.purse, 1, 'nothing was charged');
    assert.deepEqual(room.tavernRun.shelf, []);
    assert.equal(room.tavernRun.stats.spent, 0);
});

test('the shelf holds three Thonics at most', async () => {
    const { hero, room } = await atThoms('Hoarder', 1000);
    for (let i = 0; i < 5; i++) hero.emit('buyThonic', 'healing');
    await sleep(100);
    assert.equal(room.tavernRun.shelf.length, BALANCE.shelfSize);
    // Each one costs half its first price more than the one before (BALANCE.priceRise).
    const paid = Array.from({ length: BALANCE.shelfSize }, (_, i) => Math.ceil(PRICE.healing * (1 + BALANCE.priceRise * i))).reduce((a, b) => a + b, 0);
    assert.equal(room.tavernRun.purse, 1000 - paid);
});

test('the Shrine, the hot tub and each kind of Thonic cost more every time (priceRise)', async () => {
    const { hero, room } = await atThoms('Regular', 1000);
    const priceOf = id => runOf(server.getRoomState(Object.keys(server.rooms).find(c => server.rooms[c] === room))).shop.stock.find(t => t.id === id).price;
    assert.equal(priceOf('healing'), PRICE.healing);
    hero.emit('buyThonic', 'healing');
    await sleep(40);
    assert.equal(priceOf('healing'), Math.ceil(PRICE.healing * (1 + BALANCE.priceRise)), 'the second Healing costs more');
    room.tavernRun.bought = { shrine: 2, hotTub: 1 };
    const prices = runOf(server.getRoomState(Object.keys(server.rooms).find(c => server.rooms[c] === room))).prices;
    assert.equal(prices.shrine, Math.ceil(BALANCE.interlude.shrinePrice * (1 + BALANCE.priceRise * 2)));
    assert.equal(prices.hotTub, Math.ceil(BALANCE.interlude.hotTubPrice * (1 + BALANCE.priceRise)));
});

test('nothing can be bought once the cart has gone, and leaving starts the next fight', async () => {
    const { hero, room } = await atThoms('Leaver', 500);
    room.tavernRun.encounterIndex = fightOf('klarg');
    const next = nextState(hero, s => !runOf(s).shop);
    hero.emit('leaveShop');
    const state = await next;
    assert.equal(runOf(state).enemy.name, 'Klarg');
    assert.equal(state.currentTurnId, hero.id, 'the player starts the new fight');
    hero.emit('buyThonic', 'healing');
    hero.emit('leaveShop');
    await sleep(80);
    assert.equal(room.tavernRun.purse, 500);
    assert.equal(room.tavernRun.encounterIndex, fightOf('klarg'), 'leaving twice does not skip an opponent');
});

test('play again cannot restart a run while Thom\'s cart is open', async () => {
    const { hero, room } = await atThoms('Restarter', 300);
    hero.emit('playAgain');
    await sleep(80);
    assert.ok(room.tavernRun.shop, 'still at Thom\'s');
    assert.equal(room.tavernRun.purse, 300);
});

test('a Healing Thonic gives back a heart, on your turn before you roll', async () => {
    const { hero, room } = await tavernTable('Healer');
    room.tavernRun.shelf = ['healing', 'healing'];
    const me = room.players[hero.id];

    hero.emit('drinkThonic', 0); // full hearts: nothing to heal
    await sleep(60);
    assert.equal(room.tavernRun.shelf.length, 2, 'not wasted at full hearts');

    me.lives = 2;
    const used = waitFor(hero, 'thonicUsed');
    const healed = nextState(hero, s => s.players[hero.id].lives === 3);
    hero.emit('drinkThonic', 0);
    assert.equal((await used).id, 'healing');
    const state = await healed;
    assert.equal(runOf(state).shelf.length, 1);
    assert.equal(room.tavernRun.stats.thonicsDrunk, 1);

    me.lives = 2;
    hero.emit('rollDice');
    await waitFor(hero, 'diceRolled');
    hero.emit('drinkThonic', 0); // after rolling: too late
    await sleep(60);
    assert.equal(me.lives, 2);
    assert.equal(room.tavernRun.shelf.length, 1);
});

test('Thonics ignore bad shelf slots, other players\' turns and classic tables', async () => {
    const { hero, room } = await tavernTable('Slots');
    room.tavernRun.shelf = ['healing', 'lastGasp'];
    room.players[hero.id].lives = 1;
    for (const bad of [-1, 2, 5, 1.5, '0', null, {}, 1]) hero.emit('drinkThonic', bad); // slot 1 = Last Gasp, not drinkable
    await sleep(80);
    assert.equal(room.players[hero.id].lives, 1);
    assert.deepEqual(room.tavernRun.shelf, ['healing', 'lastGasp']);

    // The opponent's turn.
    room.currentTurnIndex = 1;
    room.turn = null;
    server.rooms[Object.keys(server.rooms).find(c => server.rooms[c] === room)].turn = null;
    hero.emit('drinkThonic', 0);
    await sleep(60);
    assert.equal(room.players[hero.id].lives, 1, 'not on the opponent\'s turn');

    const a = await join('Classic', 'THOMTEST');
    await join('Classic2', 'THOMTEST');
    a.emit('buyThonic', 'healing');
    a.emit('drinkThonic', 0);
    a.emit('leaveShop');
    await sleep(60);
    assert.equal(server.rooms.THOMTEST.tavernRun, null, 'classic tables have no run');
});

test('Last Gasp keeps you on your last heart once, then the run can end', async () => {
    const { hero, room } = await tavernTable('Gasper');
    room.tavernRun.shelf = ['lastGasp'];
    room.players[hero.id].lives = 1;
    const used = waitFor(hero, 'thonicUsed', u => u.id === 'lastGasp', 4000);
    const saved = nextState(hero, s => s.currentTurnId === hero.id && runOf(s).shelf.length === 0, 4000);
    await playHand(hero, room, [1, 1, 1, 1, 1, 1]); // dust: loses a heart
    await used;
    const after = await saved;
    assert.equal(after.players[hero.id].lives, 1, 'still on one heart');
    assert.equal(room.tavernRun.runComplete, false);

    const over = waitFor(hero, 'gameOver', () => true, 4000);
    await playHand(hero, room, [1, 1, 1, 1, 1, 1]);
    assert.equal((await over).tavern.won, false, 'no Thonic left this time');
});

test('a perfect 24 is counted but pays no gold', async () => {
    const { hero, room } = await tavernTable('Perfect');
    const ended = nextState(hero, s => s.currentTurnId !== hero.id);
    await playHand(hero, room, [2, 4, 6, 6, 6, 6]);
    await ended;
    assert.equal(room.tavernRun.stats.perfect24s, 1);
    assert.equal(room.tavernRun.stats.perfectGold, 0);
    assert.equal(room.tavernRun.purse, 0);
});

test('beating an opponent pays for the win and the hearts left, then one event: the thief, the Stranger or two spots', async () => {
    const { hero, room } = await tavernTable('Winner');
    room.players.BOT_MOLAR.lives = 1;
    room.players[hero.id].lives = 2;
    opponentAlwaysDusts(hero, room);
    const won = waitFor(hero, 'offerShop', () => true, 5000);
    await playHand(hero, room, [2, 4, 5, 5, 5, 5]); // 20, no perfect-24 gold
    const offer = await won;
    const G = BALANCE.gold;
    assert.deepEqual(offer.gold, { win: G.winPerPlace, hearts: 2 * G.perHeartLeft, heartsLeft: 2, perHeart: G.perHeartLeft, perPlace: G.winPerPlace }, 'what the summary screen shows');
    assert.equal(offer.place, 1);
    assert.ok(offer.at > 0, 'a key, so the summary shows once');
    assert.equal(offer.nextEnemy, 'Frak');
    assert.equal(room.tavernRun.purse, G.winPerPlace + 2 * G.perHeartLeft);
    assert.equal(room.tavernRun.stats.heartsSpared, 2, 'for the points');
    assert.deepEqual(room.tavernRun.lastWin, offer);
    assert.equal(room.tavernRun.shop, null, 'no cart until you go to Thom');
    assert.equal(room.tavernRun.pendingKeepsakeChoices, null, 'no keepsake after a win any more');
    const interlude = room.tavernRun.interlude;
    hero.emit('rollDice'); // no fighting between fights
    await sleep(60);
    assert.equal(room.turn ? room.turn.hasRolled : false, false);
    if (interlude.stage === 'pickpocket') {
        assert.equal(interlude.steal, Math.floor(room.tavernRun.purse * BALANCE.interlude.pickpocketShare), 'a share of the purse (half since 21 Oct)');
        return;
    }
    if (interlude.stage === 'stranger' || interlude.stage === 'darren') return;
    assert.equal(interlude.stage, 'choose');
    assert.equal(interlude.spots.length, 2);
    assert.equal(new Set(interlude.spots).size, 2, 'two different spots');
    interlude.spots.forEach(id => assert.ok(['thom', 'shrine', 'diceDen', 'hotTub'].includes(id)));
});

// Puts the run between fights at the given stage, with the given purse.
async function betweenFights(name, interlude, purse = 200) {
    const t = await tavernTable(name);
    t.room.tavernRun.interlude = interlude;
    t.room.tavernRun.purse = purse;
    t.room.roundPlayers = [];
    return t;
}

test('going to Thom opens his cart: Healing and two others', async () => {
    const { hero, room } = await betweenFights('ToThom', { stage: 'choose', spots: ['shrine', 'thom'] });
    hero.emit('chooseSpot', 'diceDen'); // not one of the two
    await sleep(50);
    assert.equal(room.tavernRun.interlude.stage, 'choose');
    hero.emit('chooseSpot', 'thom');
    await nextState(hero, s => runOf(s).shop);
    assert.equal(room.tavernRun.interlude, null);
    const stock = room.tavernRun.shop.stock;
    assert.equal(stock.length, 3, 'three Thonics on the cart');
    assert.equal(stock[0], 'healing', 'Healing is always there');
    assert.equal(new Set(stock).size, 3, 'no Thonic twice');
    stock.forEach(id => assert.ok(['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'].includes(id)));

    hero.emit('rollDice'); // no fighting while the cart is open
    await sleep(60);
    assert.equal(room.turn ? room.turn.hasRolled : false, false);
});

test('the Shrine to the Lady: light a candle, and she grants a blessing at random', async () => {
    const seen = new Set();
    for (let n = 0; n < 24; n++) {
        const { hero, room } = await betweenFights(`Pilgrim${n}`, { stage: 'choose', spots: ['shrine', 'thom'] }, 50 + BALANCE.interlude.shrinePrice);
        hero.emit('chooseSpot', 'shrine');
        await nextState(hero, s => runOf(s).interlude.stage === 'shrine');
        hero.emit('shrinePick', 'gold'); // the old choices are gone
        await sleep(20);
        assert.equal(room.tavernRun.interlude.stage, 'shrine');
        hero.emit('shrinePick', 'pray');
        const after = await nextState(hero, s => runOf(s).interlude.stage === 'done');
        const { gift } = runOf(after).interlude;
        seen.add(gift);
        assert.equal(room.tavernRun.purse, 50, 'a candle costs shrinePrice; a blessing, not gold');
        if (gift === 'favour') {
            hero.emit('moveOn');
            const fight = await nextState(hero, s => !runOf(s).interlude);
            assert.equal(fight.players[hero.id].lives, BALANCE.playerHearts + BALANCE.interlude.favourHearts, 'an extra heart this fight');
        } else {
            assert.equal(gift, 'grace');
            assert.equal(runOf(after).ladysGrace, true);
        }
    }
    assert.deepEqual([...seen].sort(), ['favour', 'grace'], 'both blessings come up');

    // Already carrying her Grace: she gives her Favour instead.
    for (let n = 0; n < 8; n++) {
        const { hero, room } = await betweenFights(`Graced${n}`, { stage: 'shrine' });
        room.tavernRun.ladysGrace = true;
        hero.emit('shrinePick', 'pray');
        const after = await nextState(hero, s => runOf(s).interlude.stage === 'done');
        assert.equal(runOf(after).interlude.gift, 'favour');
    }
});

test("the Lady's Grace saves a dust once, then is gone", async () => {
    const { hero, room } = await tavernTable('Graceful');
    room.tavernRun.ladysGrace = true;
    room.players.BOT_MOLAR.lives = 9;
    const saved = waitFor(hero, 'blessingUsed', () => true, 5000);
    const result = waitFor(hero, 'roundResult', () => true, 5000);
    await playHand(hero, room, [1, 1, 3, 3, 5, 5]); // no 2 or 4: dust
    await Promise.all([saved, result]);
    assert.equal(room.players[hero.id].lives, BALANCE.playerHearts, 'no heart lost');
    assert.equal(room.tavernRun.ladysGrace, false, 'used up');
});

test('the Dice Den: bet, then roll two dice against the gambler until someone wins', async () => {
    for (let n = 0; n < 6; n++) {
        const { hero, room } = await betweenFights(`Gambler${n}`, { stage: 'diceDen', bets: [5, 10], bet: null, throws: [] }, 8);
        hero.emit('diceRoll'); // no bet yet
        for (const bad of [10, 7, -5, '5', null, 1e9]) hero.emit('diceBet', bad); // 10: the purse is short
        await sleep(40);
        assert.equal(room.tavernRun.interlude.stage, 'diceDen');
        assert.equal(room.tavernRun.interlude.bet, null);
        assert.equal(room.tavernRun.interlude.throws.length, 0);
        hero.emit('diceBet', 5);
        await nextState(hero, s => runOf(s).interlude.bet === 5);
        hero.emit('diceBet', 0); // the bet stands once placed
        await sleep(30);
        assert.equal(room.tavernRun.interlude.stage, 'diceDen');
        assert.equal(room.tavernRun.purse, 8, 'nothing paid until a throw is won or lost');
        // Throw until someone wins (a tie throws again).
        for (let i = 0; i < 30 && room.tavernRun.interlude.stage === 'diceDen'; i++) {
            const before = room.tavernRun.interlude.throws.length;
            hero.emit('diceRoll');
            await nextState(hero, s => runOf(s).interlude.stage === 'done' || runOf(s).interlude.throws.length > before);
        }
        const { throws, won, bet } = room.tavernRun.interlude;
        assert.equal(bet, 5);
        const sum = d => d[0] + d[1];
        throws.slice(0, -1).forEach(t => assert.equal(sum(t.you), sum(t.them), 'earlier throws were ties'));
        const last = throws.at(-1);
        assert.equal(won, sum(last.you) > sum(last.them));
        assert.notEqual(sum(last.you), sum(last.them));
        assert.equal(room.tavernRun.purse, won ? 13 : 3);
        assert.equal(room.tavernRun.stats.eventGold, won ? 5 : -5);
        hero.emit('diceRoll'); // over: no more throws
        await sleep(30);
        assert.equal(room.tavernRun.purse, won ? 13 : 3);
    }
    const { hero, room } = await betweenFights('Walker', { stage: 'diceDen', bets: [5, 10], bet: null, throws: [] }, 8);
    hero.emit('diceBet', 0);
    await nextState(hero, s => runOf(s).interlude.stage === 'done');
    assert.equal(room.tavernRun.purse, 8, 'declining costs nothing');
});

test('the Hooded Stranger: a keepsake, and the next fight starts a heart short', async () => {
    const { hero, room } = await betweenFights('Hooded', { stage: 'choose', spots: ['shrine', 'thom'] });
    hero.emit('chooseSpot', 'stranger'); // not a spot any more
    await sleep(40);
    assert.equal(room.tavernRun.interlude.stage, 'choose');
    room.tavernRun.interlude = server.strangerOffer(room);
    const offers = room.tavernRun.interlude.offers;
    assert.equal(offers.length, BALANCE.interlude.strangerOffers);
    hero.emit('strangerPick', 'notAKeepsake');
    await sleep(40);
    assert.equal(room.tavernRun.keepsakes.length, 0);
    hero.emit('strangerPick', offers[1].id);
    await nextState(hero, s => runOf(s).interlude.stage === 'done');
    assert.deepEqual(room.tavernRun.keepsakes.map(k => k.id), [offers[1].id]);
    hero.emit('moveOn');
    const fight = await nextState(hero, s => !runOf(s).interlude);
    assert.equal(fight.players[hero.id].lives, BALANCE.interlude.strangerHearts, 'this fight a heart short');
    assert.ok(BALANCE.interlude.strangerHearts < BALANCE.playerHearts);
    assert.equal(room.tavernRun.nextFightHearts, null, 'only this one');

    // Turning him down costs nothing, even after a fight that ended on one heart.
    const b = await betweenFights('Hooded2', { stage: 'stranger', offers, hearts: BALANCE.interlude.strangerHearts });
    b.room.players[b.hero.id].lives = 1;
    b.hero.emit('strangerPick', null);
    await nextState(b.hero, s => runOf(s).interlude.stage === 'done');
    b.hero.emit('moveOn');
    const fight2 = await nextState(b.hero, s => !runOf(s).interlude);
    assert.equal(fight2.players[b.hero.id].lives, BALANCE.playerHearts);
    assert.equal(b.room.tavernRun.keepsakes.length, 0);
});

// Hands the player a keepsake as the Stranger would.
async function takeKeepsake(hero, room, id) {
    room.tavernRun.interlude = server.strangerOffer(room);
    room.tavernRun.interlude.offers = [{ id, name: id, text: '' }];
    hero.emit('strangerPick', id);
    return nextState(hero, s => runOf(s).interlude.stage === 'done');
}

test("the Loaded Die: one of your dice always rolls a 4, 5 or 6; the opponent's dice are fair", async () => {
    const { hero, room } = await tavernTable('Loaded');
    room.tavernRun.keepsakes.push({ id: 'loadedDie', name: 'Loaded Die', text: '' });
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    assert.ok(rolled.turn.dice[0].value >= BALANCE.keepsakes.loadedDieLow, 'on the table');
    const mine = server.rollFaceFor(room, { playerId: hero.id }), theirs = server.rollFaceFor(room, { playerId: 'BOT_MOLAR' });
    const seen = new Set(), others = new Set(), bot = new Set();
    for (let i = 0; i < 600; i++) {
        seen.add(mine({ id: 0 }));
        others.add(mine({ id: 3 }));
        bot.add(theirs({ id: 0 }));
    }
    assert.deepEqual([...seen].sort(), [4, 5, 6]);
    assert.equal(others.size, 6, 'the other five are fair');
    assert.equal(bot.size, 6, "the opponent's first die is fair");
});

test('the Potion Belt: a third shelf slot, and it comes with a Healing Thonic', async () => {
    const { hero, room } = await betweenFights('Belted', { stage: 'choose', spots: ['shrine', 'thom'] }, 1000);
    room.tavernRun.shelf = ['fizzy', 'steady'];
    const done = await takeKeepsake(hero, room, 'potionBelt');
    assert.equal(runOf(done).shelfSize, BALANCE.shelfSize + 1);
    assert.deepEqual(shelfOf(room), ['fizzy', 'steady', 'healing'], 'the Healing fills the new slot');
    room.tavernRun.shelf = ['fizzy'];
    room.tavernRun.shop = { stock: ['healing', 'lastGasp', 'steady'] };
    room.tavernRun.interlude = null;
    ['healing', 'lastGasp', 'steady'].forEach(id => hero.emit('buyThonic', id));
    await sleep(60);
    assert.deepEqual(shelfOf(room), ['fizzy', 'healing', 'lastGasp'], 'three slots, no more');
});

test("Thom's Loyalty Card: Thom is always on offer, and the first Thonic each visit is free", async () => {
    const { hero, room } = await betweenFights('Loyal', { stage: 'choose', spots: ['shrine', 'diceDen'] }, 500);
    await takeKeepsake(hero, room, 'loyaltyCard');
    for (let i = 0; i < 100; i++) {
        const spots = server.pickSpots(room);
        assert.ok(spots.includes('thom'), `Thom among ${spots}`);
        assert.equal(new Set(spots).size, 2);
    }
    room.tavernRun.interlude = { stage: 'choose', spots: ['thom', 'shrine'] };
    hero.emit('chooseSpot', 'thom');
    const open = await nextState(hero, s => runOf(s).shop);
    assert.equal(runOf(open).shop.free, true);
    hero.emit('buyThonic', 'healing');
    const first = await nextState(hero, s => runOf(s).shelf.length === 1);
    assert.equal(room.tavernRun.purse, 500, 'free');
    assert.equal(runOf(first).shop.free, false);
    hero.emit('buyThonic', room.tavernRun.shop.stock[1]);
    await nextState(hero, s => runOf(s).shelf.length === 2);
    assert.equal(room.tavernRun.purse, 500 - BALANCE.thonicPrices[room.tavernRun.shop.stock[1]], 'the second one costs');
    assert.equal(room.tavernRun.stats.spent, BALANCE.thonicPrices[room.tavernRun.shop.stock[1]]);
});

test('the Pickpocket: roll a 4, 5 or 6 to catch him, else he gets away; then the next fight', async () => {
    const seen = new Set();
    for (let n = 0; n < 12; n++) {
        const { hero, room } = await betweenFights(`Chaser${n}`, { stage: 'pickpocket', steal: 50, catchOn: 4 }, 200);
        hero.emit('chooseSpot', 'thom'); // not until he's dealt with
        hero.emit('pickpocket', 'on'); // not before the roll
        await sleep(30);
        assert.equal(room.tavernRun.interlude.stage, 'pickpocket');
        assert.equal(room.tavernRun.interlude.roll, undefined);
        hero.emit('pickpocket', 'roll');
        await nextState(hero, s => runOf(s).interlude.roll);
        const { roll, caught, lost } = room.tavernRun.interlude;
        seen.add(caught);
        assert.ok(roll >= 1 && roll <= 6);
        assert.equal(caught, roll >= 4);
        assert.equal(lost, caught ? 0 : 50);
        assert.equal(room.tavernRun.purse, caught ? 200 : 150);
        hero.emit('pickpocket', 'roll'); // once only
        await sleep(30);
        assert.equal(room.tavernRun.interlude.roll, roll);
        assert.equal(room.tavernRun.purse, caught ? 200 : 150);
        hero.emit('pickpocket', 'on');
        await nextState(hero, s => !runOf(s).interlude); // the thief is the walk's one event
        assert.equal(room.tavernRun.shop, null);
        assert.equal(room.tavernRun.purse, caught ? 200 : 150);
        assert.equal(room.tavernRun.stats.eventGold, 0 - lost);
    }
    assert.equal(seen.size, 2, 'in 12 tries he was both caught and got away');

    // Walk on without rolling and he gets away; walk on after rolling and nothing more is lost.
    const walk = await betweenFights('Walker2', { stage: 'pickpocket', steal: 50, catchOn: 4 }, 200);
    walk.hero.emit('leaveShop'); // the classic page walks straight on
    await nextState(walk.hero, s => !runOf(s).interlude);
    assert.equal(walk.room.tavernRun.purse, 150);
    const rolled = await betweenFights('Walker3', { stage: 'pickpocket', steal: 50, catchOn: 4, roll: 2, caught: false, lost: 50 }, 150);
    rolled.hero.emit('moveOn');
    await nextState(rolled.hero, s => !runOf(s).interlude);
    assert.equal(rolled.room.tavernRun.purse, 150);
});

test('after a random event, Look around: the two spots follow (the thief, the Stranger, Darren)', async () => {
    const steps = [
        ['pickpocket', { stage: 'pickpocket', steal: 50, catchOn: 4 }, hero => hero.emit('pickpocket', 'roll')],
        ['darren', { stage: 'darren', smashOn: 2, giftOn: 4 }, hero => hero.emit('darren', 'roll')],
        ['stranger', null, (hero, room) => hero.emit('strangerPick', null)]
    ];
    for (const [name, interlude, finish] of steps) {
        const { hero, room } = await betweenFights(`Wander-${name}`, interlude || { stage: 'choose', spots: [] }, 200);
        if (!interlude) room.tavernRun.interlude = server.strangerOffer(room);
        hero.emit('lookAround'); // not before the event is over
        await sleep(30);
        assert.notEqual(room.tavernRun.interlude.stage, 'choose');
        finish(hero, room);
        await sleep(40);
        hero.emit('lookAround');
        const looked = await nextState(hero, s => runOf(s).interlude && runOf(s).interlude.stage === 'choose');
        const choose = runOf(looked).interlude;
        assert.equal(choose.spots.length, 2, `${name}: two spots`);
        assert.equal(choose.after, name);
        hero.emit('lookAround'); // once only
        await sleep(30);
        assert.equal(room.tavernRun.interlude.after, name);
    }
});

test("the Lady's Favour adds a heart to what the next fight starts on, even after the Stranger's price", async () => {
    const { hero, room } = await betweenFights('Blessed', { stage: 'shrine' }, 100);
    room.tavernRun.nextFightHearts = BALANCE.interlude.strangerHearts;
    for (let i = 0; i < 40; i++) {
        room.tavernRun.interlude = { stage: 'shrine' };
        room.tavernRun.ladysGrace = true; // so it's always her Favour
        room.tavernRun.nextFightHearts = BALANCE.interlude.strangerHearts;
        hero.emit('shrinePick', 'pray');
        await nextState(hero, s => runOf(s).interlude.stage === 'done');
        if (room.tavernRun.interlude.gift === 'favour') break;
    }
    assert.equal(room.tavernRun.nextFightHearts, BALANCE.interlude.strangerHearts + BALANCE.interlude.favourHearts);
});

test("Thom's back shelf: two keepsakes for gold; buy one and it's yours, the gold spent", async () => {
    const { hero, room } = await betweenFights('Collector', { stage: 'choose', spots: ['thom', 'shrine'] }, 1000);
    hero.emit('chooseSpot', 'thom');
    const open = await nextState(hero, s => runOf(s).shop);
    const wares = runOf(open).shop.keepsakes;
    assert.equal(wares.length, BALANCE.thomKeepsakes, 'two on the back shelf');
    wares.forEach(k => assert.equal(k.price, BALANCE.keepsakePrices[k.id]));
    const k = wares[0];
    hero.emit('buyKeepsake', k.id);
    const after = await nextState(hero, s => runOf(s).keepsakes.some(x => x.id === k.id));
    assert.equal(runOf(after).purse, 1000 - k.price);
    assert.equal(room.tavernRun.stats.spent, k.price);
    assert.ok(!runOf(after).shop.keepsakes.some(x => x.id === k.id), 'off the shelf');
    hero.emit('buyKeepsake', k.id); // once only
    await sleep(30);
    assert.equal(room.tavernRun.purse, 1000 - k.price);

    // Too dear: nothing changes.
    const short = Math.min(...Object.values(BALANCE.keepsakePrices)) - 1; // less than the cheapest
    const poor = await betweenFights('Skint2', { stage: 'choose', spots: ['thom', 'shrine'] }, short);
    poor.hero.emit('chooseSpot', 'thom');
    const poorOpen = await nextState(poor.hero, s => runOf(s).shop);
    poor.hero.emit('buyKeepsake', runOf(poorOpen).shop.keepsakes[0].id);
    await sleep(30);
    assert.equal(poor.room.tavernRun.purse, short);
    assert.equal(poor.room.tavernRun.keepsakes.length, 0);
});

test('the Shrine and the hot tub cost gold: not offered when the purse is short, and not for free', async () => {
    const { hero, room } = await betweenFights('Penniless', { stage: 'shrine' }, BALANCE.interlude.shrinePrice - 1);
    hero.emit('shrinePick', 'pray');
    await sleep(30);
    assert.equal(room.tavernRun.interlude.stage, 'shrine', 'no candle without the gold');
    room.tavernRun.purse = 0;
    for (let i = 0; i < 30; i++) {
        const spots = server.pickSpots(room);
        assert.ok(!spots.includes('shrine') && !spots.includes('hotTub'), 'not offered with an empty purse');
    }
});

test("Darren Snakehands: one die: a Thonic smashes, a free one, or a free one and gold; then the next fight", async () => {
    const seen = new Set();
    for (let n = 0; n < 15; n++) {
        const { hero, room } = await betweenFights(`Bumped${n}`, { stage: 'darren', smashOn: 2, giftOn: 4 }, 10);
        room.tavernRun.shelf = ['healing'];
        hero.emit('darren', 'on'); // not before the roll
        await sleep(20);
        assert.equal(room.tavernRun.interlude.stage, 'darren');
        hero.emit('darren', 'roll');
        await nextState(hero, s => runOf(s).interlude.roll);
        const d = room.tavernRun.interlude;
        seen.add(d.outcome);
        if (d.roll <= 2) {
            assert.equal(d.outcome, 'smash');
            assert.equal(d.smashed.id, 'healing');
            assert.deepEqual(room.tavernRun.shelf, [], 'the Thonic is gone');
            assert.equal(room.tavernRun.purse, 10);
        } else if (d.roll <= 4) {
            assert.equal(d.outcome, 'gift');
            assert.equal(room.tavernRun.shelf.length, 2, 'a free Thonic');
            assert.equal(room.tavernRun.shelf[1], d.thonic.id);
            assert.equal(room.tavernRun.purse, 10);
        } else {
            assert.equal(d.outcome, 'catch');
            assert.equal(room.tavernRun.shelf.length, 2);
            assert.equal(d.gold, BALANCE.interlude.darrenCatchGold);
            assert.equal(room.tavernRun.purse, 10 + BALANCE.interlude.darrenCatchGold);
        }
        hero.emit('darren', 'roll'); // once only
        hero.emit('darren', 'on');
        await nextState(hero, s => !runOf(s).interlude); // the walk's one event
        assert.equal(room.tavernRun.interlude, null);
    }
    assert.ok(seen.size >= 2, `outcomes seen: ${[...seen]}`);

    // An empty shelf: you pay for the glass. A full one: the free Thonic comes as gold.
    let paid = false, full = false;
    for (let n = 0; n < 30 && !(paid && full); n++) {
        const { hero, room } = await betweenFights(`Glass${n}`, { stage: 'darren', smashOn: 2, giftOn: 4 }, 10);
        const empty = n % 2 === 0;
        room.tavernRun.shelf = empty ? [] : ['healing', 'fizzy'];
        hero.emit('darren', 'roll');
        await nextState(hero, s => runOf(s).interlude.roll);
        const d = room.tavernRun.interlude;
        if (empty && d.outcome === 'smash') { paid = true; assert.equal(d.paid, BALANCE.interlude.darrenGlass); assert.equal(room.tavernRun.purse, 10 - BALANCE.interlude.darrenGlass); }
        if (!empty && d.outcome === 'gift') { full = true; assert.equal(d.gold, BALANCE.interlude.darrenFullShelfGold); assert.equal(room.tavernRun.shelf.length, 2); assert.equal(room.tavernRun.purse, 10 + BALANCE.interlude.darrenFullShelfGold); }
    }
    assert.ok(paid && full, 'both seen');
});

test('the Wild Magic Hot Tub: a soak (hotTubPrice) and a wild surge, on one of your dice for the next fight', async () => {
    const seen = new Set();
    for (let n = 0; n < 25; n++) {
        const { hero, room } = await betweenFights(`Soak${n}`, { stage: 'choose', spots: ['hotTub', 'thom'] }, 100);
        hero.emit('chooseSpot', 'hotTub');
        await nextState(hero, s => runOf(s).interlude.stage === 'hotTub');
        hero.emit('hotTub', 'soak');
        const done = await nextState(hero, s => runOf(s).interlude.stage === 'done');
        const surge = runOf(done).interlude.surge;
        seen.add(surge.id);
        assert.ok(['noOnes', 'twin', 'lucky', 'scalding', 'soggy', 'pruney'].includes(surge.id));
        assert.ok(surge.name && surge.text);
        assert.equal(room.tavernRun.purse, 100 - BALANCE.interlude.hotTubPrice, 'a soak costs hotTubPrice');
        if (surge.id === 'pruney') assert.equal(room.tavernRun.nextFightHearts, BALANCE.playerHearts - 1);
        else assert.equal(room.tavernRun.nextFightSurge, surge.id);
        hero.emit('moveOn');
        const fight = await nextState(hero, s => !runOf(s).interlude);
        assert.equal(room.tavernRun.nextFightSurge, null, 'taken up by the fight');
        if (surge.id === 'pruney') {
            assert.equal(fight.players[hero.id].lives, BALANCE.playerHearts - 1);
            assert.equal(runOf(fight).tubSurge, null);
        } else {
            assert.equal(runOf(fight).tubSurge.id, surge.id);
            assert.equal(runOf(fight).tubSurge.die, BALANCE.interlude.hotTubDie);
        }
    }
    assert.ok(seen.size >= 3, `surges seen: ${[...seen]}`);
});

test("the hot tub's surges: the die never rolls a 1, never a 6, only 4-6, always 6, or keeps the better of two", () => {
    const room = { mode: 'tavern-crawl', tavernRun: { keepsakes: [], tubSurge: null } };
    const die = BALANCE.interlude.hotTubDie;
    const faces = (surge, turn = { playerId: 'P', rollCount: 1, dice: [] }, id = die) => {
        room.tavernRun.tubSurge = surge;
        const face = server.rollFaceFor(room, turn);
        return Array.from({ length: 600 }, () => face({ id }));
    };
    assert.ok(!faces('noOnes').includes(1));
    assert.ok(!faces('soggy').includes(6));
    assert.deepEqual([...new Set(faces('lucky'))].sort(), [4, 5, 6]);
    assert.ok(faces('scalding').every(v => v === 6));
    const twin = faces('twin', { playerId: 'P', rollCount: 2, dice: [{ id: 0, value: 2, status: Rules.STATUS.LOCKED }, { id: 2, value: 4, status: Rules.STATUS.LOCKED }] });
    const mean = twin.reduce((a, b) => a + b, 0) / twin.length;
    assert.ok(mean > 4.2, `the higher of two averages ~4.47: ${mean}`);
    // In a cursed round the better is the lower.
    room.tavernRun.roundEffect = { kind: 'curse', by: 'opponent' };
    const low = faces('twin', { playerId: 'P', rollCount: 2, dice: [{ id: 0, value: 2, status: Rules.STATUS.LOCKED }, { id: 2, value: 4, status: Rules.STATUS.LOCKED }] });
    const lowMean = low.reduce((a, b) => a + b, 0) / low.length;
    assert.ok(lowMean < 2.8, `cursed: the lower of two averages ~2.53: ${lowMean}`);
    room.tavernRun.roundEffect = null;
    // The roll that lost is kept for the ghost die (diceRolled.ghosts).
    const turn = { playerId: 'P', rollCount: 2, dice: [] };
    room.tavernRun.tubSurge = 'twin';
    const face = server.rollFaceFor(room, turn);
    for (let i = 0; i < 50 && !turn.ghosts.length; i++) face({ id: die });
    const ghost = turn.ghosts[0];
    assert.ok(ghost && ghost.die === die && ghost.kept !== ghost.lost && ghost.kind === 'tub', 'the losing roll is recorded');
    assert.equal(new Set(faces('noOnes', undefined, die === 0 ? 1 : 0)).size, 6, 'only that die');
    assert.equal(new Set(faces('noOnes', { playerId: 'BOT_MOLAR', rollCount: 1, dice: [] })).size, 6, "not the opponent's dice");
});

test('the Dice Den only appears when the purse covers its smallest bet', async () => {
    const { room } = await betweenFights('Skint', { stage: 'choose', spots: ['thom', 'shrine'] }, 3);
    for (let i = 0; i < 20; i++) {
        assert.ok(!server.pickSpots(room).includes('diceDen'), 'not with 3 gold');
    }
});

test('the Hooded Stranger finds you now and then, instead of the spots, until his keepsakes are yours', async () => {
    const { hero, room } = await betweenFights('Collector', { stage: 'choose', spots: ['shrine', 'thom'] });
    const walks = n => {
        const seen = { pickpocket: 0, stranger: 0, darren: 0, choose: 0 };
        for (let i = 0; i < n; i++) {
            server.startInterlude(room, null);
            seen[room.tavernRun.interlude.stage]++;
            if (room.tavernRun.interlude.stage === 'choose') assert.ok(!room.tavernRun.interlude.spots.includes('stranger'));
        }
        return seen;
    };
    // 200 gold to steal: the thief 25%, then the Stranger 20% of the rest (15%), else the spots.
    const seen = walks(4000);
    const share = k => seen[k] / 4000;
    assert.ok(Math.abs(share('pickpocket') - 0.25) < 0.04, `thief ${share('pickpocket')}`);
    assert.ok(Math.abs(share('stranger') - 0.15) < 0.04, `Stranger ${share('stranger')}`);
    // Then, at the Ghoul and Gourd, Darren 15% of what is left (9%).
    assert.ok(Math.abs(share('darren') - 0.09) < 0.03, `Darren ${share('darren')}`);

    // Take a keepsake from him six times: then they're all yours, and he stops coming.
    for (let i = 0; i < 6; i++) {
        room.tavernRun.interlude = server.strangerOffer(room);
        hero.emit('strangerPick', room.tavernRun.interlude.offers[0].id);
        await nextState(hero, s => runOf(s).interlude.stage === 'done');
    }
    assert.deepEqual(room.tavernRun.keepsakes.map(k => k.id).sort(), ['bentCopper', 'loadedDie', 'loyaltyCard', 'luckySeat', 'potionBelt', 'velvetCushion'], 'all six, none twice');
    assert.equal(walks(400).stranger, 0);
});

test('the shelf and purse survive a reconnect', async () => {
    const { hero, roomCode, room } = await tavernTable('Comeback', { token: 'comeback-token' });
    room.tavernRun.shelf = ['healing', 'lastGasp'];
    room.tavernRun.purse = 220;
    hero.disconnect();
    await sleep(30);
    const back = await join('Comeback', roomCode, { token: 'comeback-token' });
    const state = await nextState(back, s => s.players[back.id]);
    assert.deepEqual(runOf(state).shelf.map(t => t.id), ['healing', 'lastGasp']);
    assert.equal(runOf(state).purse, 220);
});

test('full runs through the spots between fights keep the books straight', async () => {
    const runs = [1, 2, 3, 4].map(async n => {
        const { hero, room } = await tavernTable(`Shopper${n}`);
        autoPlay(hero, async () => {
            // Between fights: deal with the pickpocket (that's the walk), or go wherever comes
            // first. At Thom's, try to buy everything (the server refuses what the purse can't cover).
            const run = room.tavernRun;
            if (run.interlude.stage === 'pickpocket' || run.interlude.stage === 'darren') {
                hero.emit(run.interlude.stage, 'roll');
                await sleep(20);
                hero.emit(run.interlude.stage, 'on');
                return;
            }
            if (run.interlude.stage === 'invitation') { // after Martha: on to the final
                hero.emit('moveOn');
                return;
            }
            if (run.interlude.stage === 'stranger') {
                hero.emit('strangerPick', run.interlude.offers[0].id);
                setTimeout(() => hero.emit('moveOn'), 20);
                return;
            }
            const spot = run.interlude.spots[0];
            hero.emit('chooseSpot', spot);
            await sleep(20);
            if (spot === 'thom') run.shop.stock.forEach(id => hero.emit('buyThonic', id));
            if (spot === 'shrine') hero.emit('shrinePick', n % 2 ? 'gold' : 'healing');
            if (spot === 'hotTub') hero.emit('hotTub', 'soak');
            if (spot === 'diceDen') {
                hero.emit('diceBet', 5);
                for (let i = 0; i < 20 && run.interlude.stage === 'diceDen'; i++) { hero.emit('diceRoll'); await sleep(10); }
            }
            setTimeout(() => hero.emit('moveOn'), 20);
        });
        // At the start of each turn, drink what can be drunk then: Healing once a heart is lost,
        // Clear-Eye, Steady. (Refused ones stay on the shelf.)
        hero.on('turnState', ({ turn }) => {
            if (!turn || turn.playerId !== hero.id || turn.hasRolled) return;
            const shelf = room.tavernRun.shelf;
            const want = ['steady', 'clearEye'];
            if (room.players[hero.id].lives < 3) want.push('healing');
            const slot = shelf.findIndex(id => want.includes(id));
            if (slot >= 0) hero.emit('drinkThonic', slot);
        });
        const over = waitFor(hero, 'gameOver', () => true, 90000);
        hero.emit('rollDice'); // the first turn was announced before autoPlay was listening
        // If a run ever stalls, say where it stood.
        const t = (await over.catch(err => {
            const r = room, turn = r.turn;
            throw new Error(`${err.message}: opponent ${r.tavernRun.encounterIndex}, lives ${JSON.stringify(r.roundPlayers.map(id => r.players[id].lives))}, turn ${turn && JSON.stringify({ player: turn.playerId === hero.id ? 'hero' : turn.playerId, rolled: turn.hasRolled, finalized: turn.finalized, ended: turn.ended, dice: turn.dice.map(d => d.status + ':' + d.value) })}, shop ${!!r.tavernRun.shop}, shelf ${r.tavernRun.shelf}, paused ${r.botPaused}, index ${r.currentTurnIndex}, round ${r.roundNumber}/${r.tavernRun.encounterRound}, scores ${JSON.stringify(r.roundPlayers.map(id => [r.players[id].score, r.players[id].busted, r.players[id].connected]))}, key ${turn && turn.key}, epoch ${r.turnEpoch}`);
        })).tavern;
        const { fights, hearts, perfect, reached, gold, events, spent } = t.breakdown;
        const st = room.tavernRun.stats;
        assert.equal(st.winGold + st.heartGold + st.perfectGold + events - spent, t.gold, 'purse = earned + events - spent');
        assert.equal(t.gold, room.tavernRun.purse);
        assert.equal(fights + hearts + perfect + reached + gold, t.points, 'the points add up');
        assert.equal(gold, t.gold * BALANCE.points.perGold, 'gold left, converted');
        assert.equal(reached, t.won ? 0 : (t.defeated + 1) * BALANCE.points.reachedPerPlace);
        assert.ok(room.tavernRun.purse >= 0, 'the purse never goes negative');
        assert.ok(room.tavernRun.shelf.length <= BALANCE.shelfSize, 'Darren never overfills the shelf');
        assert.equal(spent, room.tavernRun.stats.spent);
        return t;
    });
    const results = await Promise.all(runs);
    assert.equal(results.length, 4);
});

// ---- Step 2: Fizzy, Second Thoughts, Steady, Clear-Eye ----

// Rolls for the player and swaps in the given values (only for dice that were thrown), then
// waits until the dice may be touched.
async function rollWith(hero, room, values) {
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    room.turn.dice.forEach((d, i) => { if (d.status === 'active' && values[i] !== undefined) d.value = values[i]; });
    await sleep(rolled.animationMs * 0.01 + 20);
}

const keep = async (hero, ids) => { ids.forEach(id => hero.emit('toggleDie', id)); await sleep(40); };
const shelfOf = room => room.tavernRun.shelf.slice();

test('Fizzy Thomic rerolls the 1s after a roll, once, and only then', async () => {
    const { hero, room } = await tavernTable('Fizzer');
    room.tavernRun.shelf = ['fizzy', 'fizzy'];
    hero.emit('drinkThonic', 0); // before rolling: nothing to reroll
    await sleep(50);
    assert.equal(room.tavernRun.shelf.length, 2);

    await rollWith(hero, room, [1, 1, 3, 2, 4, 6]);
    const thrown = waitFor(hero, 'diceRolled', d => Array.isArray(d.rerolled));
    const used = waitFor(hero, 'thonicUsed', u => u.id === 'fizzy');
    hero.emit('drinkThonic', 0);
    const again = await thrown;
    await used;
    assert.deepEqual(again.rerolled, [0, 1], 'only the two 1s are thrown');
    assert.equal(room.tavernRun.shelf.length, 1);
    assert.deepEqual(room.turn.dice.slice(2).map(d => d.value), [3, 2, 4, 6], 'the other dice are untouched');
    assert.equal(room.turn.rollCount, 1, 'not a new roll');

    room.turn.dice.forEach(d => { d.value = d.value === 1 ? 5 : d.value; });
    await sleep(again.animationMs * 0.01 + 20);
    hero.emit('drinkThonic', 0); // no 1s showing now
    await sleep(50);
    assert.equal(room.tavernRun.shelf.length, 1, 'kept when there are no 1s');
});

test('Second Thoughts puts back a kept die, which may then be rolled without keeping another', async () => {
    const { hero, room } = await tavernTable('Rethinker');
    room.tavernRun.shelf = ['secondThoughts'];
    await rollWith(hero, room, [2, 4, 1, 1, 1, 1]);
    await keep(hero, [0, 1]); // keep the 2 and 4
    await rollWith(hero, room, [2, 4, 1, 1, 1, 1]); // they're now kept from an earlier roll
    assert.equal(room.turn.dice[0].status, 'permanentlyLocked');

    for (const bad of [undefined, 2, 99, '0', 1.5]) hero.emit('drinkThonic', 0, bad); // not a die kept earlier
    await sleep(60);
    assert.deepEqual(shelfOf(room), ['secondThoughts'], 'refused: kept on the shelf');

    const used = waitFor(hero, 'thonicUsed', u => u.id === 'secondThoughts');
    hero.emit('drinkThonic', 0, 1);
    await used;
    assert.equal(room.turn.dice[1].status, 'active', 'the 4 is back in play');
    assert.equal(room.turn.locksThisRoll, 0);
    assert.equal(Rules.canRoll(room.turn), true, 'may roll without keeping another die');
    hero.emit('rollDice');
    await waitFor(hero, 'diceRolled', d => d.turn.rollCount === 3);
    assert.deepEqual(shelfOf(room), []);
});

test('Second Thoughts reopens a finished hand', async () => {
    const { hero, room } = await tavernTable('Reopener');
    room.tavernRun.shelf = ['secondThoughts'];
    await rollWith(hero, room, [1, 1, 1, 1, 1, 1]);
    const finished = waitFor(hero, 'turnState', d => d.turn && d.turn.finalized);
    await keep(hero, [0, 1, 2, 3, 4, 5]); // dust
    assert.equal((await finished).turn.outcome.busted, true);
    hero.emit('drinkThonic', 0, 5);
    await sleep(60);
    assert.equal(room.turn.finalized, false, 'the hand is open again');
    assert.equal(room.turn.outcome, null);
    assert.equal(room.turn.dice[5].status, 'active');
    assert.equal(Rules.canRoll(room.turn), true);
    hero.emit('endTurn'); // can't end an open hand
    await sleep(40);
    assert.equal(room.turn.ended, false);
});

test('Steady Thonic: a dust hand scores its dice as they lie, drunk before or after the dust', async () => {
    for (const when of ['before', 'after']) {
        const { hero, room } = await tavernTable(`Steady-${when}`);
        room.tavernRun.shelf = ['steady', 'steady'];
        if (when === 'before') { hero.emit('drinkThonic', 0); await sleep(50); }
        await rollWith(hero, room, [1, 6, 5, 1, 3, 6]);
        const finished = waitFor(hero, 'turnState', d => d.turn && d.turn.finalized);
        await keep(hero, [0, 1, 2, 3, 4, 5]);
        await finished;
        if (when === 'after') { hero.emit('drinkThonic', 0); await sleep(50); }
        assert.equal(room.turn.steady, true);
        hero.emit('drinkThonic', 0); // a second one this turn: refused
        await sleep(40);
        assert.equal(room.tavernRun.shelf.length, 1, 'only one Steady per turn');
        const scored = nextState(hero, s => s.currentTurnId !== hero.id);
        hero.emit('endTurn');
        const state = await scored;
        assert.equal(state.players[hero.id].busted, false, `${when}: not dust`);
        assert.equal(state.players[hero.id].score, 22, `${when}: 1 + 6 + 5 + 1 + 3 + 6, no 2 or 4 needed`);
    }
});

test('Clear-Eye waits and cancels the opponent\'s next ability: Klarg\'s steal, Rokr\'s blur', async () => {
    const klarg = await tavernAgainst(fightOf('klarg'), 'ClearKlarg');
    const kroom = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[klarg.id])];
    kroom.tavernRun.shelf = ['clearEye', 'clearEye'];
    // In order: Klarg's move (cancelled), then the Clear-Eye, and only then the roll (the user's
    // call, 23 Oct: abilities play before the dice are thrown).
    const order = [];
    klarg.on('diceRolled', () => order.push('roll'));
    klarg.on('signatureMove', m => order.push(m.cancelled ? `${m.ability} cancelled` : m.ability));
    klarg.on('thonicUsed', u => { if (/is cancelled/.test(u.text)) order.push('clear-eye'); });
    const drunk = waitFor(klarg, 'thonicUsed', u => u.id === 'clearEye', 8000);
    klarg.emit('drinkThonic', 0);
    assert.match((await drunk).text, /Klarg's next Reach Around will be cancelled/);
    klarg.emit('drinkThonic', 0); // one waiting at a time
    await sleep(40);
    assert.equal(kroom.tavernRun.shelf.length, 1);
    const cancelled = waitFor(klarg, 'thonicUsed', u => /Reach Around is cancelled/.test(u.text), 8000);
    klarg.emit('rollDice');
    const rolled = await waitFor(klarg, 'diceRolled', () => true, 8000);
    await cancelled;
    await sleep(60);
    assert.equal(rolled.turn.dice.filter(d => d.status === 'stolen').length, 0, 'no die stolen');
    assert.deepEqual(order.slice(0, 3), ['Reach Around cancelled', 'clear-eye', 'roll']);
    assert.equal(kroom.tavernRun.abilityUsed.reachAround, 1, 'the steal is spent');
    assert.equal(kroom.tavernRun.clearEyeArmed, false);
    // Nothing left to cancel this fight: a second one is refused.
    kroom.turn.hasRolled = false;
    klarg.emit('drinkThonic', 0);
    await sleep(40);
    assert.equal(kroom.tavernRun.shelf.length, 1);
    assert.equal(kroom.tavernRun.clearEyeArmed, false);

    const rokr = await tavernAgainst(fightOf('rokr'), 'ClearRokr');
    const rroom = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[rokr.id])];
    rroom.tavernRun.shelf = ['clearEye'];
    rroom.tavernRun.abilityRound = 99; // not yet: it waits
    rokr.emit('drinkThonic', 0);
    await sleep(40);
    rokr.emit('rollDice');
    const seen = await waitFor(rokr, 'diceRolled', () => true, 8000);
    assert.ok(seen.turn.dice.every(d => !d.hidden && d.value > 0), 'dice not blurred');
    assert.equal(rroom.tavernRun.clearEyeArmed, true, 'still waiting for the blur');
});

test('Clear-Eye is refused against The Molar (no ability) and after rolling', async () => {
    const { hero, room } = await tavernTable('ClearMolar');
    room.tavernRun.shelf = ['clearEye'];
    hero.emit('drinkThonic', 0);
    await sleep(50);
    assert.deepEqual(shelfOf(room), ['clearEye'], 'The Molar has no ability to block');

    room.tavernRun.encounterIndex = fightOf('klarg'); // pretend it's Klarg now
    await rollWith(hero, room, [2, 4, 6, 6, 6, 6]);
    hero.emit('drinkThonic', 0);
    await sleep(50);
    assert.deepEqual(shelfOf(room), ['clearEye'], 'too late once rolled');
});

test('Clear-Eye stops Jaguar\'s Smooth Talk and the Hangman\'s Ace of Spades', async () => {
    // Jaguar: Smooth Talk would knock 3 off a finished hand.
    const jag = await tavernAgainst(fightOf('jaguar'), 'ClearJaguar');
    const jroom = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[jag.id])];
    jroom.tavernRun.shelf = ['clearEye'];
    jag.emit('drinkThonic', 0);
    await sleep(40);
    const scored = nextState(jag, s => s.currentTurnId !== jag.id);
    await playHand(jag, jroom, [2, 4, 6, 5, 5, 5]); // 21
    assert.equal((await scored).players[jag.id].score, 21, 'not 18');

    // The Hangman at one life turns 16+ into 24, unless Clear-Eye was drunk this round.
    for (const clear of [true, false]) {
        const hang = await tavernAgainst(fightOf('hangman'), `Hang-${clear}`);
        const hroom = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[hang.id])];
        hroom.players.BOT_MOLAR.lives = 1;
        if (clear) { hroom.tavernRun.shelf = ['clearEye']; hang.emit('drinkThonic', 0); await sleep(40); }
        let ace = false;
        hang.on('signatureMove', m => { if (m.ability === 'The Ace of Spades' && !m.cancelled) ace = true; });
        hang.on('diceRolled', d => { // his first roll: a 20 he will keep whole
            if (d.turn.playerId === 'BOT_MOLAR' && d.turn.rollCount === 1) hroom.turn.dice.forEach((die, i) => { die.value = [2, 4, 5, 5, 5, 5][i]; });
        });
        const result = waitFor(hang, 'roundResult', () => true, 4000);
        await playHand(hang, hroom, [2, 4, 1, 1, 1, 1]); // the player scores 4
        await result;
        assert.equal(ace, !clear, clear ? 'no Ace this round' : 'the Ace without Clear-Eye');
        assert.equal(hroom.players.BOT_MOLAR.lives, 1, 'no life back for the Ace of Spades');
    }
});

test('a rolled 24 from an opponent restores a life, up to their lives for the fight', async () => {
    for (const [lives, after] of [[1, 2], [3, 3]]) {
        const hang = await tavernAgainst(fightOf('hangman'), `Hang24-${lives}`);
        const room = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[hang.id])];
        room.tavernRun.abilityRound = 99; // no Ace: a 24 of his own
        room.players.BOT_MOLAR.lives = lives;
        hang.on('diceRolled', d => {
            if (d.turn.playerId === 'BOT_MOLAR' && d.turn.rollCount === 1) room.turn.dice.forEach((die, i) => { die.value = [2, 4, 6, 6, 6, 6][i]; });
        });
        const result = waitFor(hang, 'roundResult', () => true, 4000);
        await playHand(hang, room, [2, 4, 1, 1, 1, 1]); // the player scores 4 and loses the round
        await result;
        assert.equal(room.players.BOT_MOLAR.lives, after, lives === 1 ? 'one life back' : 'never above his 3');
    }
});

// ---- Phase two: the Ghoul and Gourd's opponents, Martha's mask, saving ----

const roomOf = socket => server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[socket.id])];

test("the run is fourteen fights: the Ghoul and Gourd, the Yawning Portal, then the Salty Swallow", async () => {
    const names = server.TAVERN_ENCOUNTERS.map(e => e.name);
    assert.deepEqual(names, ['Sperm McGrath', 'Frak', 'Danhausen', 'Duke Morrigan', 'Martha Mystery',
        'Sylvester Stonefist', 'Vaelin Inkhand', 'Stason Jatham', 'The Ridgeler', 'Brodor',
        'Klarg', 'Rokr', 'The Hangman', 'Jaguar Cantona']);
    assert.deepEqual(server.TAVERN_ENCOUNTERS.map(e => e.lives), [1, 2, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 4]);
    assert.deepEqual(server.TAVERN_ENCOUNTERS.map(e => e.place), [...Array(5).fill('ghoulAndGourd'), ...Array(5).fill('yawningPortal'), ...Array(4).fill('saltySwallow')]);
    const { hero, roomCode } = await tavernTable('Placed');
    const next = nextState(hero);
    server.emitState(roomCode);
    const state = await next;
    assert.equal(runOf(state).place, 'The Ghoul and Gourd');
    assert.equal(runOf(state).totalEncounters, 14);
});

test("Frak's Mind Whip: your first throw, he makes you keep one of your dice at random", async () => {
    const hero = await tavernAgainst(1, 'Puppet');
    const room = roomOf(hero);
    // It waits for your first throw, and is only spent (his mark lit) when it lands there.
    server.beginTavernRound(Object.keys(server.rooms).find(c => server.rooms[c] === room), room);
    assert.deepEqual(room.tavernRun.pendingMind, { as: null });
    assert.equal(room.tavernRun.abilityUsed.mindWhip, undefined, 'not spent as the round begins');
    const move = waitFor(hero, 'signatureMove');
    const order = [];
    hero.on('signatureMove', () => order.push('move'));
    hero.on('diceRolled', () => order.push('roll'));
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    assert.deepEqual(order, ['move', 'roll'], 'his banner plays before the dice are thrown');
    const forced = rolled.turn.dice.filter(d => d.mind);
    assert.equal(forced.length, 1, 'one die is his pick');
    assert.equal(forced[0].status, 'lockedThisTurn', 'already kept');
    const shown = await move;
    assert.equal(shown.ability, 'Mind Whip');
    assert.match(shown.text, /keeps one of your dice/); // (shown before the throw: it can't name the die)
    assert.equal(room.tavernRun.abilityUsed.mindWhip, 1, 'spent as it lands');
    assert.equal(room.tavernRun.roundEffect.kind, 'mind');
    await sleep(rolled.animationMs * 0.01 + 20);
    hero.emit('toggleDie', forced[0].id);
    await sleep(30);
    assert.equal(room.turn.dice[forced[0].id].status, 'lockedThisTurn', "it can't be tapped back");
    assert.ok(room.turn.locksThisRoll >= 1 && Rules.canRoll(room.turn), "it is the throw's keep: you may roll again");
});

test("Danhausen's Curse: the lowest valid score wins the round", async () => {
    const hero = await tavernAgainst(2, 'Cursed');
    const room = roomOf(hero);
    room.tavernRun.roundEffect = { kind: 'curse', by: 'opponent', ability: 'cursed', as: null };
    room.players.BOT_MOLAR.lives = 3; // Danhausen's (at full, his 24 heals nothing)
    // Every throw he makes comes up 6s (a 2 and a 4 on the first): he ends on 24.
    hero.on('diceRolled', d => {
        if (d.turn.playerId !== 'BOT_MOLAR' || !room.turn) return;
        const active = room.turn.dice.filter(x => x.status === 'active');
        active.forEach((x, i) => { x.value = d.turn.rollCount === 1 ? [2, 4, 6, 6, 6, 6][i] : 6; });
    });
    const botLives = room.players.BOT_MOLAR.lives, heroLives = room.players[hero.id].lives;
    const result = waitFor(hero, 'roundResult', () => true, 6000);
    await playHand(hero, room, [2, 4, 1, 1, 1, 1]); // 4
    await result;
    assert.equal(room.players.BOT_MOLAR.lives, botLives - 1, 'his 24 loses');
    assert.equal(room.players[hero.id].lives, heroLives);
});

test("the Duke's Devil: once he holds a 2 and a 4, three 6s, and you can't score above 18", async () => {
    const hero = await tavernAgainst(3, 'Devilled');
    const room = roomOf(hero);
    room.tavernRun.roundEffect = null;
    room.tavernRun.pendingDevil = { as: null };
    room.tavernRun.abilityUsed = {};
    // His first throw: a 2 and a 4 and four 1s. He keeps the 2 and 4; the Devil comes next.
    hero.on('diceRolled', d => {
        if (d.turn.playerId === 'BOT_MOLAR' && d.turn.rollCount === 1) room.turn.dice.forEach((x, i) => { x.value = [2, 4, 1, 1, 1, 1][i]; });
    });
    const move = waitFor(hero, 'signatureMove', m => m.ability === 'Sympathy for the Devil', 6000);
    const first = waitFor(hero, 'diceRolled', d => d.turn.playerId === 'BOT_MOLAR' && d.turn.rollCount === 1, 6000);
    await playHand(hero, room, [2, 4, 6, 6, 6, 6]); // 24 ...
    await first;
    // (Not diceRolled.devil: that is any three 6s, and a natural first throw has them ~6% of the time.)
    assert.equal(room.tavernRun.roundEffect, null, 'nothing on his first throw: no 2 and 4 kept yet');
    await move;
    // His banner first, then the throw that lands the three 6s (the user's call, 23 Oct).
    const devilThrow = await waitFor(hero, 'diceRolled', d => d.turn.playerId === 'BOT_MOLAR' && d.turn.dice.filter(x => x.status === 'active' && x.value === 6).length >= 3, 6000);
    assert.ok(devilThrow, 'the dice come after his banner');
    const kept = room.turn.dice.filter(d => d.status !== 'active').map(d => d.value);
    assert.ok(kept.includes(2) && kept.includes(4), 'he held a 2 and a 4');
    assert.ok(room.turn.dice.filter(d => d.value === 6).length >= 3, 'then three 6s');
    assert.equal(room.tavernRun.roundEffect.kind, 'devil');
    const result = waitFor(hero, 'roundResult', () => true, 6000);
    await result;
    assert.equal(room.tavernRun.abilityUsed.devil, 1);
});

test("the Duke's Devil doesn't cap your score (since 21 Oct): his three 6s are the whole of it", async () => {
    const hero = await tavernAgainst(3, 'Uncapped');
    const room = roomOf(hero);
    room.tavernRun.roundEffect = { kind: 'devil', by: 'opponent', ability: 'devil', as: null, landed: true };
    const ended = nextState(hero, s => s.currentTurnId !== hero.id);
    await playHand(hero, room, [2, 4, 6, 6, 6, 6]); // 24 ...
    await ended;
    assert.equal(room.players[hero.id].score, 24, '... counts as 24');
});

test("Martha's disguises: Frak's, Danhausen's or the Duke's trick at random, twice a fight", async () => {
    const hero = await tavernAgainst(4, 'Masked');
    const room = roomOf(hero);
    const kinds = new Set();
    const code = Object.keys(server.rooms).find(c => server.rooms[c] === room);
    for (let i = 0; i < 40; i++) {
        room.tavernRun.abilityUsed = {};
        server.beginTavernRound(code, room);
        const effect = room.tavernRun.roundEffect;
        // The Devil waits for her 2 and 4 (in the Duke's face).
        if (room.tavernRun.pendingDevil) { assert.equal(room.tavernRun.pendingDevil.as, 'Duke Morrigan'); kinds.add('devil'); continue; }
        // So does Mind Whip, for your first throw (in Frak's face).
        if (room.tavernRun.pendingMind) { assert.equal(room.tavernRun.pendingMind.as, 'Frak'); kinds.add('mind'); continue; }
        assert.ok(effect && effect.by === 'opponent' && effect.as);
        kinds.add(effect.kind);
    }
    assert.deepEqual([...kinds].sort(), ['curse', 'devil', 'mind']);
    room.tavernRun.abilityUsed = { disguises: 2 };
    for (let i = 0; i < 10; i++) {
        server.beginTavernRound(code, room);
        assert.ok(!room.tavernRun.roundEffect && !room.tavernRun.pendingDevil && !room.tavernRun.pendingMind, 'a third disguise is one too many');
    }
});

test("beating Martha wins her mask and the invitation to the Yawning Portal", async () => {
    const hero = await tavernAgainst(4, 'Qualifier');
    const room = roomOf(hero);
    room.players.BOT_MOLAR.lives = 1;
    room.tavernRun.abilityRound = 99;
    room.tavernRun.roundEffect = null;
    opponentAlwaysDusts(hero, room);
    const won = waitFor(hero, 'offerShop', () => true, 6000);
    await playHand(hero, room, [2, 4, 5, 5, 5, 5]);
    const offer = await won;
    assert.equal(offer.nextEnemy, 'Sylvester Stonefist');
    assert.equal(offer.drop.id, 'marthasMask');
    const run = room.tavernRun;
    assert.equal(run.interlude.stage, 'invitation');
    assert.equal(run.interlude.place, 'The Yawning Portal');
    assert.equal(run.interlude.boss, 'Martha Mystery');
    assert.equal(run.interlude.drop.id, 'marthasMask');
    assert.ok(run.keepsakes.some(k => k.id === 'marthasMask'));
    assert.equal(typeof run.interlude.save, 'string');
    hero.emit('moveOn');
    const fight = await nextState(hero, s => !runOf(s).interlude);
    assert.equal(runOf(fight).enemy.name, 'Sylvester Stonefist');
    assert.equal(runOf(fight).place, 'The Yawning Portal');
    assert.equal(runOf(fight).maskReady, true);
});

test("Martha's mask: once a fight, before you roll, the Devil (or the Curse) is yours", async () => {
    const hero = await tavernAgainst(fightOf('klarg'), 'Mask');
    const room = roomOf(hero);
    room.tavernRun.abilityRound = 99; // no steal from Klarg this time
    room.tavernRun.roundEffect = null;
    room.tavernRun.keepsakes.push({ id: 'marthasMask', name: "Martha's Mask", text: '' });
    hero.emit('wearMask', 'gold'); // not a disguise
    await sleep(30);
    assert.equal(room.tavernRun.roundEffect, null);
    const worn = waitFor(hero, 'keepsakeActivated');
    hero.emit('wearMask', 'devil');
    assert.equal((await worn).id, 'marthasMask');
    assert.deepEqual({ kind: room.tavernRun.roundEffect.kind, by: room.tavernRun.roundEffect.by }, { kind: 'devil', by: 'player' });
    hero.emit('wearMask', 'curse'); // once a fight
    await sleep(30);
    assert.equal(room.tavernRun.roundEffect.kind, 'devil');
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    assert.ok(rolled.turn.dice.filter(d => d.value === 6).length >= 3, 'three 6s for you');
});

test('a saved run opens once, and not if it was changed', async () => {
    const { room } = await tavernTable('Saver');
    room.tavernRun.encounterIndex = 5;
    room.tavernRun.purse = 777;
    room.tavernRun.keepsakes = [{ id: 'marthasMask', name: "Martha's Mask", text: '' }];
    const save = server.sealSave(room, 'Saver');
    const [body, sig] = save.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), purse: 99999 })).toString('base64url');
    assert.equal(server.openSave(`${forged}.${sig}`), null, 'an edited save is refused');
    assert.equal(server.openSave(save).purse, 777);
    assert.equal(server.openSave(save), null, 'and it opens only once');
});

test('a saved run carries on at the invitation to the Yawning Portal', async () => {
    const { room } = await tavernTable('Traveller');
    room.tavernRun.encounterIndex = 5;
    room.tavernRun.purse = 1234;
    room.tavernRun.shelf = ['healing'];
    room.tavernRun.keepsakes = [{ id: 'marthasMask', name: "Martha's Mask", text: '' }, { id: 'bentCopper', name: 'Shield', text: '' }];
    room.tavernRun.stats.encountersDefeated = 5;
    const save = server.sealSave(room, 'Traveller');
    const back = await join('Someone', 'TVRN-SV1', { resume: save });
    const state = await nextState(back, s => s.players[back.id] && runOf(s) && runOf(s).interlude);
    const run = runOf(state);
    assert.equal(run.interlude.stage, 'invitation');
    assert.equal(run.enemy.name, 'Sylvester Stonefist');
    assert.equal(run.purse, 1234);
    assert.deepEqual(run.keepsakes.map(k => k.id), ['marthasMask', 'bentCopper']);
    assert.deepEqual(run.shelf.map(t => t.id), ['healing']);
    assert.equal(state.players[back.id].name, 'Traveller');
    // The same save again: refused, and that table starts a fresh crawl.
    const again = await join('Again', 'TVRN-SV2', { resume: save });
    await waitFor(again, 'resumeFailed');
});

test('Thonics wait while dice are still tumbling', async () => {
    const { hero, room } = await tavernTable('Patient');
    room.tavernRun.shelf = ['steady'];
    hero.emit('rollDice');
    await waitFor(hero, 'diceRolled');
    room.turn.busyUntil = Date.now() + 200; // still tumbling
    hero.emit('drinkThonic', 0);
    await sleep(40);
    assert.deepEqual(shelfOf(room), ['steady']);
});

// ---- Turn order and the opponents' play ----

test('in a Tavern Crawl the first turn alternates: player, opponent, player', async () => {
    const { hero, room } = await tavernTable('Alternator');
    room.players.BOT_MOLAR.lives = 9; // a long fight, whoever wins the rounds
    room.players[hero.id].lives = 9;
    const firsts = [room.roundPlayers[0] === hero.id ? 'player' : 'opponent'];
    hero.on('gameStateUpdate', s => {
        const round = s.tavernRun && s.tavernRun.encounterRound;
        if (round && firsts.length < round && s.roundPlayers.length === 2) firsts[round - 1] = s.roundPlayers[0] === hero.id ? 'player' : 'opponent';
    });
    // Listen for the next round before playing this one (its first announcement can arrive in
    // the same burst as the round result).
    let myTurn = Promise.resolve();
    for (let round = 1; round <= 3; round++) {
        await myTurn;
        const done = waitFor(hero, 'roundResult', () => true, 5000);
        myTurn = nextState(hero, s => s.currentTurnId === hero.id && s.tavernRun.encounterRound === round + 1, 8000);
        await playHand(hero, room, [2, 4, 5, 5, 5, 5]);
        await done;
    }
    myTurn.catch(() => {});
    assert.deepEqual(firsts.slice(0, 3), ['player', 'opponent', 'player']);
});

test('from Klarg on, opponents keep what the best-play brain chooses', async () => {
    // The Hangman (no Ace: he has lives to spare). The player scores 22; he then rolls
    // 2, 4, 6, 6, 4, 5. Keeping everything makes 21 and loses; the brain keeps the two 6s.
    const hero = await tavernAgainst(fightOf('hangman'), 'BestPlay');
    const room = server.rooms[Object.keys(server.rooms).find(c => server.rooms[c].players[hero.id])];
    room.tavernRun.abilityRound = 99;
    let keptIds = null;
    hero.on('diceRolled', d => {
        if (d.turn.playerId !== 'BOT_MOLAR') return;
        if (d.turn.rollCount === 1) room.turn.dice.forEach((die, i) => { die.value = [2, 4, 6, 6, 4, 5][i]; });
        if (d.turn.rollCount === 2 && keptIds === null) keptIds = d.turn.dice.filter(x => x.status === 'permanentlyLocked').map(x => x.id);
    });
    const result = waitFor(hero, 'roundResult', () => true, 5000);
    await playHand(hero, room, [2, 4, 6, 6, 5, 5]); // 22
    await result;
    const best = Strategy.bestKeeps([2, 4, 6, 6, 4, 5].map((value, id) => ({ id, value, status: 'active' })), 22);
    assert.deepEqual(keptIds, best, 'the server kept what the brain chose');
    assert.ok(best.length < 6, 'not everything (21 would lose)');
});

// ---- The Yawning Portal's five, Brodor's Sunglasses and the Salty Swallow ----

const codeOf = socket => Object.keys(server.rooms).find(c => server.rooms[c].players[socket.id]);

// A table against an opponent whose round ability has been decided for round 1.
async function roundAgainst(id, name) {
    const hero = await tavernAgainst(fightOf(id), name);
    const room = roomOf(hero);
    server.beginTavernRound(codeOf(hero), room);
    return { hero, room };
}

// The opponent's first throw: a 2, a 4 and four 6s (24), so they beat any hand.
function opponentRollsBig(hero, room) {
    hero.on('diceRolled', d => {
        if (d.turn.playerId !== 'BOT_MOLAR' || !room.turn) return;
        room.turn.dice.forEach(die => { if (die.status === 'active') die.value = 6; });
        if (d.turn.rollCount === 1) { room.turn.dice[0].value = 2; room.turn.dice[1].value = 4; }
    });
}

test("Sylvester's Back of the Head knocks your best kept die loose from a finished hand, once", async () => {
    const hero = await tavernAgainst(fightOf('sylvester'), 'Punched');
    const room = roomOf(hero);
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    room.turn.dice.forEach((d, i) => { d.value = [2, 4, 5, 5, 6, 6][i]; });
    await sleep(rolled.animationMs * 0.01 + 20);
    const punched = waitFor(hero, 'turnState', d => d.event && d.event.type === 'punched');
    const punch = waitFor(hero, 'signatureMove', m => m.ability === 'Back of the Head');
    room.turn.dice.forEach(d => hero.emit('toggleDie', d.id));
    assert.match((await punch).text, /knocks your 6 loose/);
    const knocked = (await punched).event.die;
    assert.equal(room.turn.dice[knocked].value, 6, 'his best die');
    assert.equal(room.turn.dice[knocked].status, 'active');
    const turn = room.turn;
    assert.equal(turn.finalized, false, 'the hand is open again');
    assert.equal(turn.dice.filter(d => d.status === 'active').length, 1, 'one die back in play');
    assert.ok(Rules.canRoll(turn), 'and you may roll it');
    // It has to be rolled: keeping it again straight away is refused (the user's bug, 23 Oct).
    hero.emit('toggleDie', knocked);
    await sleep(40);
    assert.equal(room.turn.dice[knocked].status, 'active', 'not kept without a roll');
    assert.equal(room.turn.finalized, false);
    // Rolled again, the last die goes back in by itself: no second punch.
    hero.emit('rollDice');
    const done = await waitFor(hero, 'turnState', d => d.turn && d.turn.playerId === hero.id && d.turn.finalized, 3000);
    assert.equal(done.turn.finalized, true);
    assert.equal(room.tavernRun.abilityUsed.suckerPunch, 1);
});

test('Back of the Head waits for a hand that counts (not dust)', async () => {
    const hero = await tavernAgainst(fightOf('sylvester'), 'Dusty');
    const room = roomOf(hero);
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    room.turn.dice.forEach(d => { d.value = 1; });
    await sleep(rolled.animationMs * 0.01 + 20);
    const finished = waitFor(hero, 'turnState', d => d.turn && d.turn.finalized);
    room.turn.dice.forEach(d => hero.emit('toggleDie', d.id));
    assert.equal((await finished).turn.outcome.busted, true);
    assert.equal(room.tavernRun.abilityUsed.suckerPunch, undefined, 'still in his pocket');
});

test("Vaelin's Inkfire Brand: in his round your dice never land on 6", async () => {
    const { hero, room } = await roundAgainst('vaelin', 'Inked');
    assert.equal(room.tavernRun.roundEffect.kind, 'ink');
    const face = server.rollFaceFor(room, room.turn);
    const faces = new Set(Array.from({ length: 600 }, () => face({ id: 0 })));
    assert.deepEqual([...faces].sort(), [1, 2, 3, 4, 5], 'never a 6');
    // The Loaded Die lands 4 or 5.
    room.tavernRun.keepsakes.push({ id: 'loadedDie', name: 'Loaded Die', text: '' });
    const loaded = server.rollFaceFor(room, room.turn);
    assert.deepEqual([...new Set(Array.from({ length: 200 }, () => loaded({ id: 0 })))].sort(), [4, 5]);
    // The opponent's dice are not burned.
    const theirs = server.rollFaceFor(room, { playerId: 'BOT_MOLAR', dice: [] });
    assert.ok(Array.from({ length: 300 }, () => theirs({ id: 0 })).includes(6));
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    assert.ok(rolled.turn.dice.every(d => d.value !== 6));
});

test("Stason's Flourish: for his whole turn each die rolls twice and he keeps the better", async () => {
    const hero = await tavernAgainst(fightOf('stason'), 'Flourished');
    const room = roomOf(hero);
    const move = waitFor(hero, 'signatureMove', m => m.ability === 'Flourish', 6000);
    await playHand(hero, room, [2, 4, 3, 3, 3, 3]);
    assert.match((await move).text, /rolls twice/);
    assert.equal(room.tavernRun.abilityUsed.flourish, 1);
    // With his 2 and 4 kept, the better of two d6 averages about 4.47 (one d6: 3.5).
    const turn = { playerId: 'BOT_MOLAR', flourish: true, dice: [{ value: 2, status: 'permanentlyLocked' }, { value: 4, status: 'permanentlyLocked' }] };
    const face = server.rollFaceFor(room, turn);
    const mean = Array.from({ length: 3000 }, () => face({ id: 2 })).reduce((a, b) => a + b, 0) / 3000;
    assert.ok(mean > 4.2, `mean ${mean}`);
});

test("the Ridgeler's Divine Smite: if he wins the round, you lose two hearts", async () => {
    const { hero, room } = await roundAgainst('ridgeler', 'Smitten');
    assert.equal(room.tavernRun.roundEffect.kind, 'smite');
    room.players[hero.id].lives = 3;
    opponentRollsBig(hero, room);
    const result = waitFor(hero, 'roundResult', () => true, 8000);
    await playHand(hero, room, [2, 4, 1, 1, 1, 1]); // 4: he beats it
    assert.match((await result).message, /lost 2 lives/);
    assert.equal(room.players[hero.id].lives, 1);
});

test('Divine Smite: the Shield catches one of the two hearts', async () => {
    const { hero, room } = await roundAgainst('ridgeler', 'Shielded');
    room.players[hero.id].lives = 3;
    room.tavernRun.keepsakes.push({ id: 'bentCopper', name: 'Shield', text: '' });
    opponentRollsBig(hero, room);
    const result = waitFor(hero, 'roundResult', () => true, 8000);
    await playHand(hero, room, [2, 4, 1, 1, 1, 1]);
    await result;
    assert.equal(room.players[hero.id].lives, 2);
});

test("Brodor's Astral Flood heals one of his lives once he has lost one", async () => {
    const hero = await tavernAgainst(fightOf('brodor'), 'Flooded');
    const room = roomOf(hero);
    const code = codeOf(hero);
    room.players.BOT_MOLAR.lives = 4; // his lives for the fight
    server.beginTavernRound(code, room);
    assert.equal(room.tavernRun.abilityUsed.astralFlood, undefined, 'nothing to heal yet');
    room.players.BOT_MOLAR.lives = 2;
    const move = waitFor(hero, 'signatureMove', m => m.ability === 'Astral Flood');
    server.beginTavernRound(code, room);
    await move;
    assert.equal(room.players.BOT_MOLAR.lives, 3);
    server.beginTavernRound(code, room);
    assert.equal(room.players.BOT_MOLAR.lives, 3, 'once a fight');
});

test("Brodor's Sunglasses: a finished 23 restores a heart", async () => {
    const { hero, room } = await tavernTable('Shades');
    room.tavernRun.keepsakes.push({ id: 'brodorsSunglasses', name: "Brodor's Sunglasses", text: '' });
    room.players[hero.id].lives = 2;
    const lit = waitFor(hero, 'keepsakeActivated', k => k.id === 'brodorsSunglasses');
    await playHand(hero, room, [2, 4, 6, 6, 6, 5]); // 23
    await lit;
    assert.equal(room.players[hero.id].lives, 3);
});

test('beating Brodor wins his Sunglasses and word of the Salty Swallow', async () => {
    const hero = await tavernAgainst(fightOf('brodor'), 'Champion');
    const room = roomOf(hero);
    room.players.BOT_MOLAR.lives = 1;
    room.tavernRun.abilityRound = 99;
    room.tavernRun.roundEffect = null;
    opponentAlwaysDusts(hero, room);
    const won = waitFor(hero, 'offerShop', () => true, 6000);
    await playHand(hero, room, [2, 4, 5, 5, 5, 5]);
    const offer = await won;
    assert.equal(offer.nextEnemy, 'Klarg');
    assert.equal(offer.drop.id, 'brodorsSunglasses');
    const run = room.tavernRun;
    assert.deepEqual({ stage: run.interlude.stage, place: run.interlude.place, from: run.interlude.from, drop: run.interlude.drop.id },
        { stage: 'invitation', place: 'The Salty Swallow', from: 'The Yawning Portal', drop: 'brodorsSunglasses' });
    assert.ok(run.keepsakes.some(k => k.id === 'brodorsSunglasses'));
    assert.equal(typeof run.interlude.save, 'string');
    hero.emit('moveOn');
    const fight = await nextState(hero, s => !runOf(s).interlude);
    assert.equal(runOf(fight).enemy.name, 'Klarg');
    assert.equal(runOf(fight).place, 'The Salty Swallow');
});

test('a run saved after the Yawning Portal carries on at the Salty Swallow', async () => {
    const { room } = await tavernTable('Sailor');
    room.tavernRun.encounterIndex = fightOf('klarg');
    room.tavernRun.purse = 2500;
    room.tavernRun.keepsakes = [{ id: 'marthasMask', name: "Martha's Mask", text: '' }, { id: 'brodorsSunglasses', name: "Brodor's Sunglasses", text: '' }];
    const save = server.sealSave(room, 'Sailor');
    const back = await join('Someone', 'TVRN-SV3', { resume: save });
    const state = await nextState(back, s => s.players[back.id] && runOf(s) && runOf(s).interlude);
    const run = runOf(state);
    assert.equal(run.interlude.place, 'The Salty Swallow');
    assert.equal(run.interlude.drop.id, 'brodorsSunglasses');
    assert.equal(run.enemy.name, 'Klarg');
    assert.deepEqual(run.keepsakes.map(k => k.id), ['marthasMask', 'brodorsSunglasses']);
});

test('the Yawning Portal and the ship play their best; every ability has a name and uses', () => {
    const places = Object.fromEntries(server.TAVERN_ENCOUNTERS.map(e => [e.id, e.place]));
    for (const id of ['sylvester', 'vaelin', 'stason', 'ridgeler', 'brodor']) assert.equal(places[id], 'yawningPortal');
    for (const id of ['klarg', 'rokr', 'hangman', 'jaguar']) assert.equal(places[id], 'saltySwallow');
    for (const e of server.TAVERN_ENCOUNTERS) if (e.ability) {
        assert.ok(Rules.ABILITY_NAMES[e.ability], `${e.ability} has a name`);
        assert.ok(BALANCE.abilityUses[e.ability] >= 1, `${e.ability} has uses`);
    }
});
// ---- One thing at a time; the user's fixes of 21 Oct ----

test('the next round, and its ability, wait until the round result has gone out', async () => {
    const { hero, room } = await roundAgainst('vaelin', 'Patient2');
    room.tavernRun.abilityUsed = {}; // Inkfire ready again for round 2
    room.players.BOT_MOLAR.lives = 3; // (the table began with McGrath, on 1)
    room.tavernRun.abilityRound = 1;
    const events = [];
    hero.on('roundResult', () => events.push('result'));
    hero.on('signatureMove', m => events.push(m.ability));
    hero.on('gameStateUpdate', s => { if (s.tavernRun && s.tavernRun.encounterRound === 2 && !events.includes('round 2')) events.push('round 2'); });
    opponentAlwaysDusts(hero, room);
    const next = nextState(hero, s => s.tavernRun && s.tavernRun.encounterRound === 2);
    await playHand(hero, room, [2, 4, 5, 5, 5, 5]);
    await next;
    const result = events.indexOf('result'), ink = events.lastIndexOf('Inkfire Brand'), round2 = events.indexOf('round 2');
    assert.ok(result >= 0 && ink > result && round2 > ink, `result, then the ability, then the new round: ${events.join(', ')}`);
});

test("Mind Whip in Martha's face: her disguise shows first, then Frak's trick", async () => {
    const hero = await tavernAgainst(fightOf('martha'), 'Disguised');
    const room = roomOf(hero);
    room.tavernRun.pendingMind = { as: 'Frak' };
    const moves = [];
    hero.on('signatureMove', m => moves.push(m.ability));
    hero.emit('rollDice');
    await waitFor(hero, 'signatureMove', m => m.ability === 'Mind Whip');
    assert.deepEqual(moves, ['Disguises', 'Mind Whip']);
    assert.equal(room.tavernRun.abilityUsed.disguises, 1);
});

test("the Lady's Grace forgives a dust before the Shield is spent", async () => {
    const { hero, room } = await tavernTable('Graced');
    room.players.BOT_MOLAR.lives = 3;
    room.tavernRun.ladysGrace = true;
    room.tavernRun.keepsakes.push({ id: 'bentCopper', name: 'Shield', text: '' });
    const result = waitFor(hero, 'roundResult', () => true, 8000);
    const grace = waitFor(hero, 'blessingUsed');
    await playHand(hero, room, [1, 1, 3, 3, 5, 5]); // dust
    await grace;
    await result;
    assert.equal(room.tavernRun.ladysGrace, false);
    assert.ok(!room.tavernRun.encounterKeepsakeUses.bentCopper, 'the Shield is still there');
});

test('the Shield says it protects a life', async () => {
    const { hero, room } = await tavernTable('Shielded2');
    room.players.BOT_MOLAR.lives = 3;
    room.tavernRun.keepsakes.push({ id: 'bentCopper', name: 'Shield', text: '' });
    const lit = waitFor(hero, 'keepsakeActivated', k => k.id === 'bentCopper', 8000);
    await playHand(hero, room, [1, 1, 3, 3, 5, 5]); // dust
    assert.equal((await lit).text, 'Shield protects a life.');
});

test("Martha's mask: the Devil can be worn mid-turn, and the next throw lands three 6s", async () => {
    const hero = await tavernAgainst(fightOf('klarg'), 'MidMask');
    const room = roomOf(hero);
    room.tavernRun.abilityRound = 99;
    room.tavernRun.roundEffect = null;
    room.tavernRun.keepsakes.push({ id: 'marthasMask', name: "Martha's Mask", text: '' });
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id);
    room.turn.dice.forEach((d, i) => { d.value = [2, 1, 1, 1, 1, 1][i]; });
    await sleep(rolled.animationMs * 0.01 + 20);
    hero.emit('wearMask', 'curse'); // the Curse only before you roll
    await sleep(30);
    assert.equal(room.tavernRun.roundEffect, null);
    hero.emit('toggleDie', 0); // keep the 2: five to throw
    await sleep(30);
    hero.emit('wearMask', 'devil');
    await waitFor(hero, 'keepsakeActivated', k => k.id === 'marthasMask');
    hero.emit('rollDice');
    const second = await waitFor(hero, 'diceRolled', d => d.turn.playerId === hero.id && d.turn.rollCount === 2);
    assert.ok(second.turn.dice.filter(d => d.status === 'active' && d.value === 6).length >= 3, 'three 6s on the throw after');
});

test("Stason's Flourish leaves ghost dice for the rolls that lost", async () => {
    const hero = await tavernAgainst(fightOf('stason'), 'Ghosted');
    const room = roomOf(hero);
    const theirs = waitFor(hero, 'diceRolled', d => d.turn.playerId === 'BOT_MOLAR' && d.ghosts, 8000);
    await playHand(hero, room, [2, 4, 3, 3, 3, 3]);
    const rolled = await theirs;
    assert.ok(rolled.ghosts.every(g => g.kind === 'plain' && g.kept !== g.lost));
});

test('the hot tub is only at the Ghoul and Gourd', async () => {
    const { room } = await betweenFights('NoTub', { stage: 'choose', spots: ['thom', 'shrine'] }, 1000);
    room.tavernRun.encounterIndex = fightOf('sylvester');
    for (let i = 0; i < 30; i++) assert.ok(!server.pickSpots(room).includes('hotTub'));
    room.tavernRun.encounterIndex = fightOf('frak');
    assert.ok(Array.from({ length: 60 }, () => server.pickSpots(room)).some(s => s.includes('hotTub')));
});
