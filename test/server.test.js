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
function autoPlay(socket, onKeepsakes = null) {
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
    if (onKeepsakes) socket.on('offerKeepsakes', onKeepsakes);
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
    autoPlay(hero, offer => hero.emit('chooseKeepsake', offer.choices[0].id));
    const over = await waitFor(hero, 'gameOver', () => true, 60000);
    assert.match(over.message, /Gold earned: \d+/);
});
