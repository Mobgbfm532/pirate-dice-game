// End-to-end tests: a real server on a random port, driven by socket.io clients.
process.env.GAME_TIME_SCALE = '0.01';
process.env.LEADERBOARD_READONLY = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const Rules = require('../shared/rules');
const server = require('../server');

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

// Puts a fresh Tavern Crawl table straight onto a given opponent with their ability ready.
async function tavernAgainst(encounterIndex, name) {
    const roomCode = `TVRN-${encounterIndex}${Date.now() % 1000}`;
    const hero = await join(name, roomCode);
    await waitFor(hero, 'gameStateUpdate');
    const room = server.rooms[roomCode];
    room.tavernRun.encounterIndex = encounterIndex;
    room.tavernRun.abilityRound = 1;
    return hero;
}

test('Klarg steals a die on the server', async () => {
    const hero = await tavernAgainst(1, 'KlargTest');
    const move = waitFor(hero, 'signatureMove');
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled');
    assert.equal(rolled.turn.dice.filter(d => d.status === Rules.STATUS.STOLEN).length, 1);
    assert.equal((await move).ability, 'Reach Around');
});

test('Rokr blur hides dice values from the browser itself', async () => {
    const hero = await tavernAgainst(2, 'RokrTest');
    hero.emit('rollDice');
    const rolled = await waitFor(hero, 'diceRolled');
    assert.ok(rolled.turn.dice.every(d => d.hidden && d.value === 0), 'no real values are sent while blurred');
});

test('unknown reactions are dropped and names are passed through as plain data', async () => {
    const erin = await join('<img src=x>', 'TESTC');
    await join('Frank', 'TESTC');
    let received = [];
    erin.on('receiveReaction', r => received.push(r));
    erin.emit('sendReaction', '<script>alert(1)</script>');
    erin.emit('sendReaction', '😀');
    await sleep(50);
    assert.deepEqual(received.map(r => r.emoji), ['😀']);
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
    assert.match(over.message, /Gold earned: \d+/);
    // The 3D client's end-of-run screen reads this summary.
    const t = over.tavern;
    assert.equal(t.name, 'Hero');
    assert.equal(t.encounters.length, 5);
    assert.equal(t.won, t.defeated === 5);
    assert.equal(t.fellTo, t.won ? null : t.encounters[t.defeated]);
    const { progress, hearts, perfect, spent } = t.breakdown;
    assert.equal(progress + hearts + perfect - spent, t.gold);
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

test('Thom sells a Thonic for its price and puts it on the shelf', async () => {
    const { hero, room } = await atThoms('Buyer', 100);
    const bought = nextState(hero, s => runOf(s).shelf.length === 1);
    hero.emit('buyThonic', 'healing');
    const run = runOf(await bought);
    assert.equal(run.purse, 40);
    assert.deepEqual(run.shelf.map(t => t.id), ['healing']);
    assert.equal(room.tavernRun.stats.spent, 60);
    assert.equal(run.shop.stock.length, 2, 'the cart is still open');
});

test('Thom refuses what you cannot afford, unknown Thonics and bad input', async () => {
    const { hero, room } = await atThoms('Broke', 100);
    for (const bad of ['lastGasp', 'elixir', 'toString', '__proto__', 42, null, { id: 'healing' }, ['healing']]) hero.emit('buyThonic', bad);
    await sleep(80);
    assert.equal(room.tavernRun.purse, 100, 'nothing was charged');
    assert.deepEqual(room.tavernRun.shelf, []);
    assert.equal(room.tavernRun.stats.spent, 0);
});

test('the shelf holds three Thonics at most', async () => {
    const { hero, room } = await atThoms('Hoarder', 1000);
    for (let i = 0; i < 5; i++) hero.emit('buyThonic', 'healing');
    await sleep(100);
    assert.equal(room.tavernRun.shelf.length, 3);
    assert.equal(room.tavernRun.purse, 1000 - 3 * 60);
});

test('nothing can be bought once the cart has gone, and leaving starts the next fight', async () => {
    const { hero, room } = await atThoms('Leaver', 500);
    room.tavernRun.encounterIndex = 1;
    const next = nextState(hero, s => !runOf(s).shop);
    hero.emit('leaveShop');
    const state = await next;
    assert.equal(runOf(state).enemy.name, 'Klarg');
    assert.equal(state.currentTurnId, hero.id, 'the player starts the new fight');
    hero.emit('buyThonic', 'healing');
    hero.emit('leaveShop');
    await sleep(80);
    assert.equal(room.tavernRun.purse, 500);
    assert.equal(room.tavernRun.encounterIndex, 1, 'leaving twice does not skip an opponent');
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

test('a perfect 24 pays 75 gold into the purse straight away', async () => {
    const { hero, room } = await tavernTable('Perfect');
    const paid = nextState(hero, s => runOf(s).purse === 75);
    await playHand(hero, room, [2, 4, 6, 6, 6, 6]);
    await paid;
    assert.equal(room.tavernRun.stats.perfectGold, 75);
    assert.equal(room.tavernRun.stats.perfect24s, 1);
});

test('beating an opponent pays for the win and the hearts left, then Thom\'s cart opens', async () => {
    const { hero, room } = await tavernTable('Winner');
    room.players.BOT_MOLAR.lives = 1;
    room.players[hero.id].lives = 2;
    opponentAlwaysDusts(hero, room);
    const shop = waitFor(hero, 'offerShop', () => true, 5000);
    await playHand(hero, room, [2, 4, 5, 5, 5, 5]); // 20, no perfect-24 gold
    const offer = await shop;
    assert.deepEqual(offer.gold, { win: 100, hearts: 50 });
    assert.equal(offer.nextEnemy, 'Klarg');
    assert.equal(room.tavernRun.purse, 150);
    assert.deepEqual(room.tavernRun.shop.stock, ['healing', 'lastGasp']);
    assert.equal(room.tavernRun.pendingKeepsakeChoices, null, 'no keepsake after a win any more');

    hero.emit('rollDice'); // no fighting while the cart is open
    await sleep(60);
    assert.equal(room.turn ? room.turn.hasRolled : false, false);
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

test('full runs that shop at Thom\'s keep the books straight', async () => {
    const runs = [1, 2, 3, 4].map(async n => {
        const { hero, room } = await tavernTable(`Shopper${n}`);
        let spentSeen = 0;
        autoPlay(hero, () => {
            // Buy whatever the purse allows (healing first), then move on.
            const run = room.tavernRun;
            if (run.purse >= 150 && run.shelf.length < 3) { hero.emit('buyThonic', 'lastGasp'); spentSeen += 150; }
            if (run.purse - (spentSeen ? 150 : 0) >= 60) { hero.emit('buyThonic', 'healing'); }
            setTimeout(() => hero.emit('leaveShop'), 20);
        });
        // Drink a healing Thonic whenever it's the player's turn, they've lost a heart and have one.
        hero.on('turnState', ({ turn }) => {
            if (turn && turn.playerId === hero.id && !turn.hasRolled && room.players[hero.id].lives < 3) {
                const slot = room.tavernRun.shelf.indexOf('healing');
                if (slot >= 0) hero.emit('drinkThonic', slot);
            }
        });
        const over = waitFor(hero, 'gameOver', () => true, 90000);
        hero.emit('rollDice'); // the first turn was announced before autoPlay was listening
        // If a run ever stalls, say where it stood.
        const t = (await over.catch(err => {
            const r = room, turn = r.turn;
            throw new Error(`${err.message}: opponent ${r.tavernRun.encounterIndex}, lives ${JSON.stringify(r.roundPlayers.map(id => r.players[id].lives))}, turn ${turn && JSON.stringify({ player: turn.playerId === hero.id ? 'hero' : turn.playerId, rolled: turn.hasRolled, finalized: turn.finalized, ended: turn.ended, dice: turn.dice.map(d => d.status + ':' + d.value) })}, shop ${!!r.tavernRun.shop}, shelf ${r.tavernRun.shelf}`);
        })).tavern;
        const { progress, hearts, perfect, spent } = t.breakdown;
        assert.equal(progress + hearts + perfect - spent, t.gold, 'score = earned - spent');
        assert.equal(t.gold, Math.max(0, room.tavernRun.purse + (t.won ? 0 : (t.defeated + 1) * 25)));
        assert.ok(room.tavernRun.purse >= 0, 'the purse never goes negative');
        assert.ok(room.tavernRun.shelf.length <= 3);
        assert.equal(spent, room.tavernRun.stats.spent);
        return t;
    });
    const results = await Promise.all(runs);
    assert.equal(results.length, 4);
});
