const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const Rules = require('./shared/rules');
const Strategy = require('./shared/strategy');

const BOT_ID = 'BOT_MOLAR';

// Scales every server-side delay (bot thinking time, roll animations). Tests set this low.
const TIME_SCALE = Number(process.env.GAME_TIME_SCALE) || 1;
const delay = msValue => Math.round(msValue * TIME_SCALE);

const rollFace = () => crypto.randomInt(1, 7);

// Phones drop their connection when the screen locks or the app is switched. A table with
// nobody connected is kept this long so players can come back to it, and the player whose
// turn it is gets this long to reconnect before their turn counts as dust.
const EMPTY_TABLE_GRACE_MS = 120000;
const TURN_RECONNECT_GRACE_MS = 30000;

const AVATARS = ['Devil', 'Vaelin', 'Rokr', 'The Hangman', 'Klarg', 'Jaguar Cantona'];
const PLAYER_REACTIONS = ['😀', '😂', '😮', '😎', '😭', '🧔 Early Ross'];

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
// The 3D client prototype (client/), once built with `npm run build:client`.
app.use('/next', express.static(path.join(__dirname, 'client', 'dist')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/leaderboard', (req, res) => {
    res.json(tavernLeaderboard);
});

let rooms = {};

const LEADERBOARD_PATH = path.join(__dirname, 'leaderboard.json');
const DEFAULT_TAVERN_LEADERBOARD = [
    { name: 'Dr. Dice', gold: 1900 },
    { name: 'SlyVestWearer', gold: 1800 }
];

function normalizeLeaderboard(entries) {
    let bestByName = new Map();
    entries.forEach(entry => {
        let name = String(entry.name || '').trim().substring(0, 20);
        let gold = Math.max(0, parseInt(entry.gold, 10) || 0);
        if (!name) return;
        let existing = bestByName.get(name);
        if (!existing || gold > existing.gold) bestByName.set(name, { name, gold });
    });
    return Array.from(bestByName.values()).sort((a, b) => b.gold - a.gold).slice(0, 20);
}

function loadTavernLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_PATH)) {
            let parsed = JSON.parse(fs.readFileSync(LEADERBOARD_PATH, 'utf8'));
            return normalizeLeaderboard(parsed);
        }
    } catch (error) {
        console.warn('Could not load leaderboard:', error.message);
    }
    return normalizeLeaderboard(DEFAULT_TAVERN_LEADERBOARD);
}

let tavernLeaderboard = loadTavernLeaderboard();

function saveTavernLeaderboard() {
    if (process.env.LEADERBOARD_READONLY) return;
    try {
        fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(tavernLeaderboard, null, 2));
    } catch (error) {
        console.warn('Could not save leaderboard:', error.message);
    }
}

function submitTavernLeaderboardScore(name, gold) {
    tavernLeaderboard = normalizeLeaderboard([...tavernLeaderboard, { name, gold }]);
    saveTavernLeaderboard();
    return tavernLeaderboard;
}

const TAVERN_ENCOUNTERS = [
    {
        id: 'molar',
        name: 'The Molar',
        avatar: '🦷',
        lives: 2,
        ability: null,
        intro: 'The Molar slides into the seat and teaches you the house game: find a 2, find a 4, then chase 24.'
    },
    {
        id: 'klarg',
        name: 'Klarg',
        avatar: '🐻',
        lives: 3,
        ability: 'reachAround',
        intro: 'Klarg, bugbear paladin and sworn enemy of Kram, may steal one active die with Reach Around.'
    },
    {
        id: 'rokr',
        name: 'Rokr',
        avatar: '✨',
        lives: 3,
        ability: 'constellationBlur',
        intro: 'Rokr reads the dice in the stars. Once per match, constellations can blur your active dice.'
    },
    {
        id: 'hangman',
        name: 'The Hangman',
        avatar: '🤠',
        lives: 3,
        ability: 'deadeye24',
        intro: 'The Hangman keeps one round in the chamber of The Ace of Spades, his revolver. At one life, one shot can turn a score of 16 or higher into a perfect 24.'
    },
    {
        id: 'jaguar',
        name: 'Jaguar Cantona',
        avatar: '😎',
        lives: 4,
        ability: 'smoothTalk',
        intro: 'Jaguar Cantona has the smile, the cloak, and an extra life. Once per match, Smooth Talk worsens your finished score.'
    }
];

const TAVERN_KEEPSAKES = [
    {
        id: 'bentCopper',
        name: 'Shield',
        text: 'Once per encounter, the first life you would lose is ignored.'
    },
    {
        id: 'blessedTankard',
        name: "Brodor's Sunglasses",
        text: 'A perfect 24 restores one extra life.'
    },
    {
        id: 'luckySeat',
        name: 'Trap Card',
        text: 'Once per encounter, your first tied round counts as safe for you and a loss for the opponent.'
    },
    {
        id: 'velvetCushion',
        name: 'Velvet Cushion',
        text: 'Once per encounter, losing by exactly 1 point becomes a tie instead.'
    },
    {
        id: 'steadyHand',
        name: 'Steady Hand Wrap',
        text: 'Once per encounter, if you dust, it becomes a score of 0 instead of a dust result.'
    }
];

// Thom's Thonics: potions bought from Thom between fights and kept on a shelf (up to
// SHELF_SIZE) until drunk. `drink` = tapped by the player on their own turn (when exactly
// depends on the Thonic: see the drinkThonic handler); Last Gasp works by itself.
const THONICS = {
    healing: { id: 'healing', name: 'Healing Thonic', text: '+1 heart, up to your maximum. Drink it before you roll.', price: 120, drink: true },
    lastGasp: { id: 'lastGasp', name: 'Last Gasp Thonic', text: 'Works by itself: a round that would take your last heart leaves you on 1.', price: 250, drink: false },
    fizzy: { id: 'fizzy', name: 'Fizzy Thomic', text: 'After a roll: your 1s roll again, once.', price: 80, drink: true },
    secondThoughts: { id: 'secondThoughts', name: 'Second Thoughts Thonic', text: 'Put back a die you kept, then roll it again.', price: 180, drink: true },
    steady: { id: 'steady', name: 'Steady Thonic', text: 'This turn, dust counts as a score of 0.', price: 150, drink: true },
    clearEye: { id: 'clearEye', name: 'Clear-Eye Thonic', text: "Before you roll: the opponent's ability can't touch this round.", price: 100, drink: true }
};
const SHELF_SIZE = 3;
const SHOP_SIZE = 3; // Thonics on Thom's cart per visit: Healing, plus two others at random

// A place in the run: its opponents in order and what Thom sells there. Only the tavern
// for now; later places (new environments, tougher opponents) are new entries.
const PLACES = {
    tavern: {
        name: 'The Tavern',
        encounters: TAVERN_ENCOUNTERS,
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        // Between fights two of these catch your eye, and you go to one (see INTERLUDE).
        spots: ['thom', 'shrine', 'diceDen', 'stranger']
    }
};

// Between fights: two spots in the room catch your eye and you choose one. Now and then a
// pickpocket brushes past on the way, before you choose. First guesses, tuned in step 4.
const INTERLUDE = {
    pickpocketChance: 25,   // percent of walks across the room
    pickpocketShare: 0.25,  // of the purse, if he gets away
    pickpocketCatch: 4,     // roll this or higher on one die to catch him
    shrineGold: 100,        // the Shrine to the Lady: this much gold, or a free Healing Thonic
    diceDenBets: [50, 100], // the Dice Den: two dice each against a stranger, higher total doubles the bet
    strangerOffers: 2,      // keepsakes the Hooded Stranger shows you
    strangerHearts: 2       // ...and you start the next fight on this many hearts if you take one
};

// Gold during a run: it goes into the purse as it is won, and the purse is the final score.
const GOLD = {
    winPerPlace: 100,   // beating an opponent: 100 x their place in the run (Molar 100 ... Jaguar 500)
    perHeartLeft: 25,   // for each heart still standing when you win a fight
    perfect24: 75,      // each perfect 24 you roll
    consolation: 25     // losing the run: 25 x the place of the opponent you fell to
};

// What Thom has on his cart this visit: always Healing, plus others picked at random.
function pickThomStock(place) {
    let others = place.thomStock.filter(id => id !== 'healing');
    for (let i = others.length - 1; i > 0; i--) {
        let j = crypto.randomInt(0, i + 1);
        [others[i], others[j]] = [others[j], others[i]];
    }
    return ['healing', ...others.slice(0, SHOP_SIZE - 1)];
}

const thonicView = id => ({ id, name: THONICS[id].name, text: THONICS[id].text, price: THONICS[id].price, drink: THONICS[id].drink });

function getRoomState(roomCode) {
    let room = rooms[roomCode];
    if (!room) return {};

    return {
        players: room.players,
        playerOrder: room.playerOrder,
        roundPlayers: room.roundPlayers,
        currentTurnId: room.roundPlayers[room.currentTurnIndex],
        isTieBreaker: room.isTieBreaker,
        roundNumber: room.roundNumber,
        startingLives: room.startingLives,
        mode: room.mode || 'classic',
        tavernRun: getTavernRunState(room)
    };
}

function getTavernRunState(room) {
    if (!room || room.mode !== 'tavern-crawl') return null;
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    return {
        encounterNumber: room.tavernRun.encounterIndex + 1,
        totalEncounters: TAVERN_ENCOUNTERS.length,
        enemy: encounter,
        keepsakes: room.tavernRun.keepsakes,
        pendingKeepsakeChoices: room.tavernRun.pendingKeepsakeChoices,
        purse: room.tavernRun.purse,
        shelf: room.tavernRun.shelf.map(thonicView),
        shelfSize: SHELF_SIZE,
        shop: room.tavernRun.shop ? { stock: room.tavernRun.shop.stock.map(thonicView) } : null,
        interlude: room.tavernRun.interlude,
        lastWin: room.tavernRun.lastWin,
        nextFightHearts: room.tavernRun.nextFightHearts,
        abilityUsed: room.tavernRun.abilityUsed,
        clearEye: room.tavernRun.clearEyeRound === room.roundNumber,
        abilityRound: room.tavernRun.abilityRound,
        encounterRound: room.tavernRun.encounterRound,
        encounterKeepsakeUses: room.tavernRun.encounterKeepsakeUses,
        stats: room.tavernRun.stats,
        runComplete: room.tavernRun.runComplete
    };
}

// ---- Turns ----
// The server owns the dice. Browsers ask to roll, lock or end; the server decides
// what happens and broadcasts the result, so every screen shows the same board.

function isBotRoom(roomCode) {
    return roomCode.startsWith('COMP') || roomCode.startsWith('TVRN');
}

function getTurnKey(room) {
    let id = room.roundPlayers[room.currentTurnIndex];
    if (!id || !room.players[id]) return null;
    return `${room.turnEpoch}:${room.roundNumber}:${room.currentTurnIndex}:${id}`;
}

// A classic table needs two players; a tavern table pauses while a keepsake is chosen.
function isTurnPlayable(roomCode) {
    let room = rooms[roomCode];
    if (!room || !room.turn || room.turn.ended) return false;
    if (room.mode === 'tavern-crawl' && (room.tavernRun.pendingKeepsakeChoices || room.tavernRun.shop || room.tavernRun.interlude)) return false;
    return isBotRoom(roomCode) || room.playerOrder.length >= 2;
}

// Starts a fresh turn whenever the current player changes.
function syncTurn(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;
    let key = getTurnKey(room);
    if (!key) { room.turn = null; return; }
    if (room.turn && room.turn.key === key) return;

    room.turn = Rules.createTurn(room.roundPlayers[room.currentTurnIndex]);
    room.turn.key = key;
    room.turn.busyUntil = 0;
    room.turn.ended = false;
    if (room.turn.playerId === BOT_ID && isTurnPlayable(roomCode)) {
        botLater(roomCode, key, 1000, () => runBotRoll(roomCode));
    }
}

function emitTurn(roomCode, event = null) {
    let room = rooms[roomCode];
    if (!room) return;
    io.to(roomCode).emit('turnState', { turn: Rules.viewTurn(room.turn), event });
}

function emitState(roomCode) {
    syncTurn(roomCode);
    io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
    emitTurn(roomCode);
}

function sendBotReaction(roomCode, emoji, times = 3) {
    let room = rooms[roomCode];
    if (!room || room.mode === 'tavern-crawl') return;
    for (let i = 0; i < times; i++) {
        setTimeout(() => io.to(roomCode).emit('receiveReaction', { name: 'The Molar', emoji }), delay(i * 300));
    }
}

function applyTavernRollAbilities(roomCode, room, turn) {
    if (room.mode !== 'tavern-crawl' || turn.playerId === BOT_ID || turn.rollCount !== 1) return [];
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    let moves = [];

    if (canUseTavernAbility(room, encounter, 'reachAround') && Rules.stealHighestActiveDie(turn)) {
        markAbilityUsed(room, 'reachAround');
        moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.reachAround, text: 'Klarg uses Reach Around and steals one die.' });
    }
    if (canUseTavernAbility(room, encounter, 'constellationBlur')) {
        turn.blurActive = true;
        markAbilityUsed(room, 'constellationBlur');
        moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.constellationBlur, text: 'Rokr blurs the dice with constellations.' });
    }
    return moves;
}

// Returns the roll's animation length in ms, or 0 if the roll wasn't allowed.
function performRoll(roomCode) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode)) return 0;
    let turn = room.turn;
    if (Date.now() < turn.busyUntil) return 0;

    let signatureMoves = [];
    let preRollCallout = null;
    let result = Rules.rollTurn(turn, {
        rollFace,
        onRolled: t => {
            preRollCallout = t.callout;
            signatureMoves = applyTavernRollAbilities(roomCode, room, t);
        }
    });
    if (!result) return 0;

    // Browsers show the pre-roll announcement while the dice tumble, then the final board.
    let animationMs = result.suspense !== Rules.SUSPENSE.NONE ? 2000 : 500;
    turn.busyUntil = Date.now() + delay(animationMs);
    // throwSeed lets every screen simulate the identical tumble (the values are already decided).
    let throwSeed = crypto.randomInt(0, 2 ** 31);
    io.to(roomCode).emit('diceRolled', { turn: Rules.viewTurn(turn), preRollCallout, suspense: result.suspense, devil: result.devil, animationMs, throwSeed });

    let key = turn.key;
    if (result.devil && isBotRoom(roomCode)) botLater(roomCode, key, animationMs, () => sendBotReaction(roomCode, 'hood'));
    if (signatureMoves.length) {
        setTimeout(() => {
            if (!rooms[roomCode]) return;
            signatureMoves.forEach(move => io.to(roomCode).emit('signatureMove', move));
            io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        }, delay(animationMs));
    }

    // The last die has nothing to choose: once it lands it goes into its slot by itself.
    // The player still presses End Turn.
    let stillActive = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
    if (stillActive.length === 1) {
        let lastDieId = stillActive[0].id;
        setTimeout(() => {
            if (rooms[roomCode] !== room || !room.turn || room.turn.key !== key) return;
            let result = Rules.toggleDie(room.turn, lastDieId);
            if (result) emitTurn(roomCode, result.finalizedNow ? { type: 'finalized', outcome: room.turn.outcome } : { type: 'toggle' });
        }, delay(animationMs));
    }
    return animationMs;
}

function performToggle(roomCode, dieId) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode)) return;
    let turn = room.turn;
    if (Date.now() < turn.busyUntil) return;

    let result = Rules.toggleDie(turn, dieId);
    if (!result) return;
    emitTurn(roomCode, result.finalizedNow ? { type: 'finalized', outcome: turn.outcome } : { type: 'toggle' });
}

function performEndTurn(roomCode) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode) || !room.turn.finalized) return;
    room.turn.ended = true;

    let currentId = room.roundPlayers[room.currentTurnIndex];
    let { score, busted } = room.turn.outcome;
    if (room.turn.steady && busted) { busted = false; score = 0; } // Steady Thonic
    room.players[currentId].score = score;
    room.players[currentId].busted = busted;

    if (room.mode === 'tavern-crawl') {
        let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
        if (canUseTavernAbility(room, encounter, 'deadeye24') && currentId === BOT_ID && room.players[currentId].lives <= 1 && !busted && score >= 16 && score < 24) {
            room.players[currentId].score = 24;
            markAbilityUsed(room, 'deadeye24');
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'The Ace of Spades', text: 'The Hangman fires The Ace of Spades. Perfect 24.' });
            io.to(roomCode).emit('displayMessage', { text: 'The Hangman fires The Ace of Spades.', color: "#ffd54f" });
        }

        if (canUseTavernAbility(room, encounter, 'smoothTalk') && currentId !== BOT_ID && !busted && score > 0) {
            room.players[currentId].score = Math.max(0, score - 3);
            markAbilityUsed(room, 'smoothTalk');
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'Smooth Talk', text: 'Jaguar smiles and worsens your finished hand.' });
            io.to(roomCode).emit('displayMessage', { text: 'Jaguar smiles. Smooth Talk knocks 3 from your finished hand.', color: "#ffb74d" });
        }

        if (currentId !== BOT_ID && room.players[currentId].score === 24 && room.tavernRun.stats) {
            room.tavernRun.stats.perfect24s++;
            room.tavernRun.stats.perfectGold += GOLD.perfect24;
            room.tavernRun.purse += GOLD.perfect24;
        }
    }

    let tavernEnemyPerfect = room.mode === 'tavern-crawl' && currentId === BOT_ID;
    if (!tavernEnemyPerfect && room.players[currentId].score === 24 && room.players[currentId].lives < room.startingLives) {
        let restoredLives = (room.mode === 'tavern-crawl' && currentId !== BOT_ID && hasKeepsake(room, 'blessedTankard')) ? 2 : 1;
        room.players[currentId].lives = Math.min(room.startingLives, room.players[currentId].lives + restoredLives);
        if (restoredLives > 1) emitKeepsakeActivated(roomCode, room, 'blessedTankard', "Brodor's Sunglasses restore an extra life.");
        io.to(roomCode).emit('displayMessage', { text: `+${restoredLives} Life Restored!`, color: "#aed581" });
    }

    advanceTurn(roomCode);
}

// Moves to the next connected player, or scores the round if everyone has gone.
function advanceTurn(roomCode) {
    let room = rooms[roomCode];
    room.currentTurnIndex++;
    skipDisconnectedPlayers(room);

    if (room.currentTurnIndex >= room.roundPlayers.length) {
        evaluateRound(roomCode);
    } else {
        emitState(roomCode);
    }
}

// After the reconnect grace: if the player whose turn it is still hasn't come back and
// others are waiting on them, their turn is dust and play moves on. With nobody else
// connected there's no rush; the table just waits (and is cleared if no one returns).
function forfeitIfStillAway(roomCode, room, token) {
    if (rooms[roomCode] !== room) return;
    let id = room.roundPlayers[room.currentTurnIndex];
    let player = room.players[id];
    if (!player || player.token !== token || player.connected) return;
    if (!anyHumanConnected(room)) return;
    player.busted = true;
    player.score = 0;
    if (room.turn) room.turn.ended = true;
    advanceTurn(roomCode);
}

function skipDisconnectedPlayers(room) {
    while (room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
        room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
        room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
        room.currentTurnIndex++;
    }
}

function anyHumanConnected(room) {
    return Object.values(room.players).some(p => p.connected && p.id !== BOT_ID);
}

// Runs `fn` after `ms` unless the room is gone or the turn has moved on. The bot doesn't
// play to an empty room: it pauses, and resumeBot picks up when someone comes back.
function botLater(roomCode, key, ms, fn) {
    let room = rooms[roomCode];
    setTimeout(() => {
        let current = rooms[roomCode];
        if (current !== room || !current.turn || current.turn.key !== key) return;
        if (!anyHumanConnected(room)) { room.botPaused = true; return; }
        fn();
    }, delay(ms));
}

// Carries on a bot turn that paused while everyone was away.
function resumeBot(roomCode) {
    let room = rooms[roomCode];
    if (!room || !room.botPaused) return;
    room.botPaused = false;
    let turn = room.turn;
    if (!turn || turn.playerId !== BOT_ID || turn.ended) return;
    if (turn.finalized) botLater(roomCode, turn.key, 1500, () => performEndTurn(roomCode));
    else if (turn.hasRolled) botLater(roomCode, turn.key, 1000, () => runBotDecision(roomCode));
    else botLater(roomCode, turn.key, 1000, () => runBotRoll(roomCode));
}

// Deletes a table once it has had nobody connected for EMPTY_TABLE_GRACE_MS.
function scheduleEmptyTableCleanup(roomCode) {
    let room = rooms[roomCode];
    if (!room || room.cleanupTimer || anyHumanConnected(room)) return;
    room.cleanupTimer = setTimeout(() => {
        room.cleanupTimer = null;
        if (rooms[roomCode] === room && !anyHumanConnected(room)) delete rooms[roomCode];
    }, delay(EMPTY_TABLE_GRACE_MS));
}

function runBotRoll(roomCode) {
    let room = rooms[roomCode];
    let key = room.turn.key;
    let animationMs = performRoll(roomCode);
    if (animationMs) botLater(roomCode, key, animationMs + 1000, () => runBotDecision(roomCode));
    // A refused roll (dice still busy) must never leave the bot stuck: think again shortly.
    else if (!room.turn.finalized) botLater(roomCode, key, 1000, () => runBotDecision(roomCode));
}

// What a Tavern Crawl opponent must beat to win the round: the player's finished score, or
// null if they dusted. undefined while the player hasn't finished (or outside a Tavern Crawl),
// so the bot plays on as usual. The opponents know your keepsakes: with Velvet Cushion still
// unused, winning by exactly 1 would only be a tie.
function getTavernScoreToBeat(room) {
    if (room.mode !== 'tavern-crawl') return undefined;
    let humanId = getHumanPlayerId(room);
    let human = humanId && room.players[humanId];
    if (!human || !room.roundPlayers.includes(humanId) || human.score === null) return undefined;
    if (human.busted) return hasKeepsake(room, 'steadyHand') && !room.tavernRun.encounterKeepsakeUses.steadyHand ? 0 : null;
    let cushion = hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion;
    return human.score + (cushion ? 1 : 0);
}

function runBotDecision(roomCode) {
    let room = rooms[roomCode];
    let turn = room.turn;
    let key = turn.key;
    let encounter = room.mode === 'tavern-crawl' ? TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex] : null;
    let enemyId = encounter ? encounter.id : 'molar';
    let toBeat = getTavernScoreToBeat(room);
    // The Molar (solo games, and the first Tavern Crawl fight) plays simply, as a teacher.
    // From Klarg on, opponents play their best: Strategy works out the keep with the best
    // chance of winning the round (the Hangman counts on his revolver, The Ace of Spades, when he can fire it).
    let aceAt16 = !!encounter && encounter.ability === 'deadeye24' && room.players[BOT_ID].lives <= 1 && canUseTavernAbility(room, encounter, 'deadeye24');
    let toLock = enemyId === 'molar' ? Rules.planBotLocks(turn, enemyId, toBeat) : Strategy.bestKeeps(turn.dice, toBeat, { aceAt16 });

    // Lock the dice one after another, and only then decide what next. (Separate timers for
    // each lock and the check could fire out of order on a busy server, and a check that ran
    // before the locks found nothing to roll and stopped the bot for good.)
    let lockFrom = i => {
        if (i < toLock.length) {
            performToggle(roomCode, toLock[i]);
            botLater(roomCode, key, 400, () => lockFrom(i + 1));
        } else {
            botLater(roomCode, key, 800, afterLocking);
        }
    };
    let afterLocking = () => {
        if (!turn.finalized) {
            runBotRoll(roomCode);
            return;
        }
        let { busted, score } = turn.outcome;
        if (busted) sendBotReaction(roomCode, 'swords');
        else if (score === 24) sendBotReaction(roomCode, 'hood');
        else if (score >= 22) sendBotReaction(roomCode, 'shield');
        else if (score <= 17) sendBotReaction(roomCode, 'skull');
        botLater(roomCode, key, 1500, () => performEndTurn(roomCode));
    };
    lockFrom(0);
}

// ---- Tavern Crawl ----

function hasKeepsake(room, keepsakeId) {
    return room.mode === 'tavern-crawl' && room.tavernRun.keepsakes.some(k => k.id === keepsakeId);
}

function getKeepsake(room, keepsakeId) {
    if (!room || room.mode !== 'tavern-crawl') return null;
    return room.tavernRun.keepsakes.find(k => k.id === keepsakeId) || TAVERN_KEEPSAKES.find(k => k.id === keepsakeId) || null;
}

function emitKeepsakeActivated(roomCode, room, keepsakeId, text) {
    let keepsake = getKeepsake(room, keepsakeId);
    if (!keepsake) return;
    if (room && room.mode === 'tavern-crawl' && room.tavernRun.stats) {
        room.tavernRun.stats.keepsakesActivated++;
        room.tavernRun.encounterKeepsakeUses = room.tavernRun.encounterKeepsakeUses || {};
        room.tavernRun.encounterKeepsakeUses[keepsakeId] = true;
    }
    io.to(roomCode).emit('keepsakeActivated', {
        id: keepsakeId,
        name: keepsake.name,
        text: text || keepsake.text
    });
}

function getAbilityUseCount(room, abilityId) {
    let used = room.tavernRun.abilityUsed[abilityId];
    if (used === true) return 1;
    return Number(used || 0);
}

function markAbilityUsed(room, abilityId) {
    room.tavernRun.abilityUsed[abilityId] = getAbilityUseCount(room, abilityId) + 1;
}

function canUseTavernAbility(room, encounter, abilityId) {
    if (room.tavernRun.clearEyeRound === room.roundNumber) return false; // Clear-Eye Thonic
    let abilityReady = (room.tavernRun.encounterRound || 1) >= (room.tavernRun.abilityRound || 1);
    return encounter && encounter.ability === abilityId && abilityReady && getAbilityUseCount(room, abilityId) < Rules.getAbilityMaxUses(abilityId);
}

function emitRoundLifeResult(roomCode, room, lifeLosers, tiedPlayers = []) {
    let message;
    let activeIds = (room.roundPlayers || []).filter(id => room.players[id]);
    let dustNames = lifeLosers
        .map(id => room.players[id] ? room.players[id].name : 'A player');
    let safeNames = activeIds
        .filter(id => !lifeLosers.includes(id))
        .map(id => room.players[id] ? room.players[id].name : 'A player');
    let resultLines = [
        dustNames.length ? `Dust: ${dustNames.join(', ')}.` : null,
        safeNames.length ? `Safe: ${safeNames.join(', ')}.` : null
    ].filter(Boolean).join('\n');

    if (lifeLosers.length > 0) {
        let names = lifeLosers
            .map(id => room.players[id] ? room.players[id].name : 'A player')
            .join(', ');
        message = `${resultLines}\n${names} lost ${lifeLosers.length === 1 ? 'a life' : 'lives'}.\nThe round is over.`;
    } else if (tiedPlayers.length > 1) {
        let names = tiedPlayers
            .map(id => room.players[id] ? room.players[id].name : 'A player')
            .join(' and ');
        message = `${resultLines}\n${names} tied.\nNo lives lost.`;
    } else {
        message = `${resultLines}\nSafe for another round.\nNo lives lost.`;
    }
    io.to(roomCode).emit('roundResult', { message });
}

function getHumanPlayerId(room) {
    return room.playerOrder.find(id => id !== BOT_ID && room.players[id]);
}

// For testing a particular opponent: TAVERN_START_ENCOUNTER=1 starts runs at Klarg, etc.
const TAVERN_START_ENCOUNTER = Math.max(0, Math.min(4, parseInt(process.env.TAVERN_START_ENCOUNTER, 10) || 0));

function createTavernRun() {
    return {
        encounterIndex: TAVERN_START_ENCOUNTER,
        keepsakes: [],
        pendingKeepsakeChoices: null,
        purse: 0,
        shelf: [],
        shop: null,
        interlude: null,   // between fights: { stage, ... } (see startInterlude)
        lastWin: null,     // the fight just won: { defeated, nextEnemy, gold: { win, hearts } }
        nextFightHearts: null, // the Hooded Stranger's price: the next fight starts on fewer hearts
        abilityUsed: {},
        abilityRound: 1,
        encounterRound: 1,
        encounterKeepsakeUses: {},
        stats: {
            encountersDefeated: 0,
            livesLost: 0,
            keepsakesActivated: 0,
            perfect24s: 0,
            winGold: 0,
            heartGold: 0,
            perfectGold: 0,
            spent: 0,
            eventGold: 0, // won and lost between fights (Shrine, Dice Den, Pickpocket)
            thonicsDrunk: 0
        },
        started: false,
        runComplete: false
    };
}

function getRandomAbilityRound(encounter) {
    if (!encounter || !encounter.ability) return 0;
    return Math.floor(Math.random() * 3) + 1;
}

// The final score is the purse (what was won, less what was spent at Thom's), plus a
// consolation for how far a lost run got.
function getTavernScoreSummary(room, completedRun = false) {
    let stats = room.tavernRun.stats;
    let consolation = !completedRun && stats.encountersDefeated < TAVERN_ENCOUNTERS.length
        ? (stats.encountersDefeated + 1) * GOLD.consolation : 0;
    let progressGold = stats.winGold + consolation;
    let totalGold = Math.max(0, room.tavernRun.purse + consolation);

    return {
        totalGold,
        breakdown: { progress: progressGold, hearts: stats.heartGold, perfect: stats.perfectGold, events: stats.eventGold, spent: stats.spent },
        lines: [
            `Gold earned: ${totalGold}`,
            `Progress: ${progressGold}`,
            `Hearts spared: ${stats.heartGold}`,
            `Perfect 24s: ${stats.perfectGold}`,
            `Between fights: ${stats.eventGold}`,
            `Spent at Thom's: ${stats.spent}`
        ]
    };
}

// Takes a Thonic off the shelf if the player has one. Returns it, or null.
function useThonic(room, thonicId) {
    let shelf = room.tavernRun.shelf;
    let index = shelf.indexOf(thonicId);
    if (index < 0) return null;
    shelf.splice(index, 1);
    room.tavernRun.stats.thonicsDrunk++;
    return THONICS[thonicId];
}

// What the 3D client's end-of-run screen shows: how far the run got and the gold earned.
function getTavernOverSummary(room, humanName, scoreSummary, won) {
    let index = Math.min(room.tavernRun.encounterIndex, TAVERN_ENCOUNTERS.length - 1);
    return {
        won,
        name: humanName,
        defeated: room.tavernRun.stats.encountersDefeated,
        encounters: TAVERN_ENCOUNTERS.map(e => e.name),
        fellTo: won ? null : TAVERN_ENCOUNTERS[index].name,
        gold: scoreSummary.totalGold,
        breakdown: scoreSummary.breakdown,
        stats: room.tavernRun.stats,
        keepsakes: room.tavernRun.keepsakes.map(k => k.name)
    };
}

function pickKeepsakeChoices(room) {
    let owned = new Set(room.tavernRun.keepsakes.map(k => k.id));
    let pool = TAVERN_KEEPSAKES.filter(k => !owned.has(k.id));
    for (let i = pool.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
}

function resetTavernEncounter(roomCode, keepHumanLives = true) {
    let room = rooms[roomCode];
    if (!room || room.mode !== 'tavern-crawl') return;
    room.startingLives = 3;

    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    let humanId = getHumanPlayerId(room);
    room.players[BOT_ID] = {
        id: BOT_ID,
        token: 'BOT_TOKEN',
        name: encounter.name,
        avatar: encounter.avatar,
        lives: encounter.lives,
        score: null,
        busted: false,
        connected: true
    };

    if (humanId && room.players[humanId]) {
        // The Hooded Stranger's price: this one fight starts on fewer hearts.
        room.players[humanId].lives = room.tavernRun.nextFightHearts || room.startingLives;
        room.tavernRun.nextFightHearts = null;
        room.players[humanId].score = null;
        room.players[humanId].busted = false;
        room.playerOrder = [humanId, BOT_ID];
        room.roundPlayers = [humanId, BOT_ID];
    } else {
        room.playerOrder = [BOT_ID];
        room.roundPlayers = [BOT_ID];
    }

    room.currentTurnIndex = 0;
    room.isTieBreaker = false;
    room.dealerIndex = 0;
    room.turnEpoch++;
    room.tavernRun.pendingKeepsakeChoices = null;
    room.tavernRun.abilityUsed = {};
    room.tavernRun.encounterRound = 1;
    room.tavernRun.abilityRound = getRandomAbilityRound(encounter);
    room.tavernRun.encounterKeepsakeUses = {};
    room.tavernRun.started = true;
}

// ---- Between fights ----
// After a win the run pauses in `tavernRun.interlude` until the player moves on:
//   pickpocket  { steal, roll? }         roll one die: pickpocketCatch or more catches him,
//                                        else he gets away with `steal`; then carry on
//   choose      { spots: [a, b] }        two spots from the place's list; Thom opens the cart
//   shrine      { gold }                 a free Healing Thonic or that much gold
//   diceDen     { bets, bet?, throws }   bet one of them (or decline), then the player rolls
//                                        two dice and the gambler two; a tie rolls again
//   stranger    { offers, hearts }       take a keepsake (next fight on `hearts`) or walk away
//   done        { spot, ... }            what happened, until the player moves on
// The choice after the pickpocket carries `note`: how that went, for the client.

function shuffled(list) {
    let out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        let j = crypto.randomInt(0, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function unownedKeepsakes(room) {
    let owned = new Set(room.tavernRun.keepsakes.map(k => k.id));
    return TAVERN_KEEPSAKES.filter(k => !owned.has(k.id));
}

// Two different spots; the Stranger only while there are keepsakes left to offer.
function pickSpots(room) {
    let spots = PLACES.tavern.spots.filter(id => id !== 'stranger' || unownedKeepsakes(room).length > 0);
    return shuffled(spots).slice(0, 2);
}

function startInterlude(room, won) {
    let run = room.tavernRun;
    run.lastWin = won;
    let steal = Math.floor(run.purse * INTERLUDE.pickpocketShare);
    if (steal > 0 && crypto.randomInt(0, 100) < INTERLUDE.pickpocketChance) {
        run.interlude = { stage: 'pickpocket', steal, catchOn: INTERLUDE.pickpocketCatch };
    } else {
        run.interlude = { stage: 'choose', spots: pickSpots(room) };
    }
}

// Gold won or lost between fights. The purse never goes below 0. Returns what changed.
function changePurse(run, amount) {
    let applied = Math.max(amount, -run.purse);
    run.purse += applied;
    run.stats.eventGold += applied;
    return applied;
}

// The Dice Den: one throw of two dice each. `won` is null on a tie (they throw again).
function throwDiceDen() {
    let you = [rollFace(), rollFace()], them = [rollFace(), rollFace()];
    let a = you[0] + you[1], b = them[0] + them[1];
    return { you, them, won: a === b ? null : a > b };
}

// From Thom's cart or any point between fights, on to the next fight. Walk on without
// rolling for the pickpocket and he gets away.
function moveOnToNextFight(roomCode) {
    let room = rooms[roomCode];
    let run = room.tavernRun;
    if (run.interlude && run.interlude.stage === 'pickpocket' && !run.interlude.roll) changePurse(run, -run.interlude.steal);
    run.interlude = null;
    run.shop = null;
    resetTavernEncounter(roomCode, true);
    emitState(roomCode);
}

// ---- Rounds ----

function evaluateRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    if (room.mode === 'tavern-crawl') {
        evaluateTavernRound(roomCode);
        return;
    }

    let losersThisRound = [];
    let tiedPlayers = [];

    let busted = room.roundPlayers.filter(id => room.players[id] && room.players[id].busted);
    busted.forEach(id => {
        room.players[id].lives -= 1;
        losersThisRound.push({ id, reason: 'Dust!' });
    });

    let valid = room.roundPlayers.filter(id => room.players[id] && !room.players[id].busted);
    if (valid.length > 1) {
        let minScore = Math.min(...valid.map(id => room.players[id].score));
        let lowest = valid.filter(id => room.players[id].score === minScore);

        if (lowest.length === 1) {
            room.players[lowest[0]].lives -= 1;
            losersThisRound.push({ id: lowest[0], reason: 'You had the lowest score!' });
        } else if (lowest.length > 1) {
            tiedPlayers = lowest;
        }
    }

    emitRoundLifeResult(roomCode, room, losersThisRound.map(l => l.id), tiedPlayers);

    let humanLost = losersThisRound.some(l => l.id !== BOT_ID);
    if (room.players[BOT_ID] && humanLost) {
        setTimeout(() => sendBotReaction(roomCode, '😉'), delay(1000));
    }

    room.roundPlayers.forEach(id => {
        if (room.players[id]) {
            room.players[id].score = null;
            room.players[id].busted = false;
        }
    });

    let survivors = room.playerOrder.filter(id => room.players[id] && room.players[id].lives > 0);
    if (survivors.length <= 1) {
        let winnerName = survivors.length === 1 ? room.players[survivors[0]].name : "No one";
        // Sync the final scoreboard before ending the game
        emitState(roomCode);
        io.to(roomCode).emit('gameOver', { message: `Game Over! ${winnerName} wins the table! 🏆` });
        room.roundPlayers = [];
    } else if (tiedPlayers.length > 1) {
        room.isTieBreaker = true;
        room.roundNumber++;
        room.roundPlayers = tiedPlayers;
        room.currentTurnIndex = 0;
        skipDisconnectedPlayers(room);

        emitState(roomCode);
        io.to(roomCode).emit('displayMessage', { text: `⚔️ SUDDEN DEATH TIE-BREAKER! ⚔️`, color: "#ffcc80" });

        if (room.currentTurnIndex >= room.roundPlayers.length) evaluateRound(roomCode);
    } else {
        room.isTieBreaker = false;
        room.roundNumber++;

        if (room.playerOrder.length > 0) {
            room.dealerIndex = (room.dealerIndex + 1) % room.playerOrder.length;
        }

        room.roundPlayers = [];
        for (let i = 0; i < room.playerOrder.length; i++) {
            let idx = (room.dealerIndex + i) % room.playerOrder.length;
            let playerId = room.playerOrder[idx];
            if (room.players[playerId] && room.players[playerId].lives > 0) {
                room.roundPlayers.push(playerId);
            }
        }

        room.currentTurnIndex = 0;
        skipDisconnectedPlayers(room);

        emitState(roomCode);
        if (room.currentTurnIndex >= room.roundPlayers.length && room.roundPlayers.length > 0) evaluateRound(roomCode);
    }
}

function evaluateTavernRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    let humanId = getHumanPlayerId(room);
    let enemyId = BOT_ID;
    if (!humanId || !room.players[humanId] || !room.players[enemyId]) return;

    let human = room.players[humanId];
    let enemy = room.players[enemyId];
    let losersThisRound = [];
    let lifeLosersThisRound = [];
    let tiedPlayers = [];
    let protectedBySteadyHand = false;

    if (human.busted && hasKeepsake(room, 'steadyHand') && !room.tavernRun.encounterKeepsakeUses.steadyHand) {
        human.busted = false;
        human.score = 0;
        protectedBySteadyHand = true;
        room.tavernRun.encounterKeepsakeUses.steadyHand = true;
        emitKeepsakeActivated(roomCode, room, 'steadyHand', 'Steady Hand Wrap catches the dice. Dust becomes safe.');
        io.to(roomCode).emit('displayMessage', { text: 'Steady Hand Wrap catches the dice. Dust becomes safe.', color: '#aed581' });
    }

    let roundPlayers = [humanId, enemyId].filter(id => room.players[id]);
    let busted = roundPlayers.filter(id => room.players[id].busted);
    busted.forEach(id => losersThisRound.push({ id, reason: 'Dust!' }));

    let valid = roundPlayers.filter(id => !room.players[id].busted);
    if (valid.length > 1) {
        let minScore = Math.min(...valid.map(id => room.players[id].score));
        let lowest = valid.filter(id => room.players[id].score === minScore);
        if (lowest.length === 1) {
            losersThisRound.push({ id: lowest[0], reason: 'Lowest score at the table.' });
        } else {
            tiedPlayers = lowest;
        }
    }

    if (protectedBySteadyHand) {
        losersThisRound = losersThisRound.filter(loser => loser.id !== humanId);
    }

    if (losersThisRound.length === 1 && losersThisRound[0].id === humanId && !human.busted && !enemy.busted && hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion && human.score + 1 === enemy.score) {
        room.tavernRun.encounterKeepsakeUses.velvetCushion = true;
        losersThisRound = [];
        tiedPlayers = [humanId, enemyId];
        emitKeepsakeActivated(roomCode, room, 'velvetCushion', 'Velvet Cushion softens the loss into a tie.');
        io.to(roomCode).emit('displayMessage', { text: 'Velvet Cushion softens the loss into a tie.', color: '#ffd54f' });
    }

    if (tiedPlayers.length > 1 && hasKeepsake(room, 'luckySeat') && !room.tavernRun.encounterKeepsakeUses.luckySeat) {
        room.tavernRun.encounterKeepsakeUses.luckySeat = true;
        tiedPlayers = [];
        losersThisRound.push({ id: enemyId, reason: 'Trap Card breaks the tie your way.' });
        emitKeepsakeActivated(roomCode, room, 'luckySeat', 'Trap Card breaks the tie your way.');
        io.to(roomCode).emit('displayMessage', { text: 'Trap Card breaks the tie your way.', color: '#ffd54f' });
    }

    losersThisRound.forEach(loser => {
        let player = room.players[loser.id];
        if (!player) return;

        if (loser.id === humanId && hasKeepsake(room, 'bentCopper') && !room.tavernRun.encounterKeepsakeUses.bentCopper) {
            room.tavernRun.encounterKeepsakeUses.bentCopper = true;
            emitKeepsakeActivated(roomCode, room, 'bentCopper', 'Shield catches the loss.');
            return;
        }

        if (loser.id === humanId && player.lives <= 1 && useThonic(room, 'lastGasp')) {
            io.to(roomCode).emit('thonicUsed', { id: 'lastGasp', name: THONICS.lastGasp.name, text: 'You cling on with one heart.' });
            return;
        }

        player.lives -= 1;
        lifeLosersThisRound.push(loser.id);
        if (loser.id === humanId && room.tavernRun.stats) room.tavernRun.stats.livesLost++;
    });

    emitRoundLifeResult(roomCode, room, lifeLosersThisRound, tiedPlayers);

    roundPlayers.forEach(id => {
        if (!room.players[id]) return;
        room.players[id].score = null;
        room.players[id].busted = false;
    });

    if (human.lives <= 0) {
        let reached = room.tavernRun.encounterIndex + 1;
        let scoreSummary = getTavernScoreSummary(room);
        room.roundPlayers = [];
        room.tavernRun.runComplete = true;
        io.emit('leaderboardUpdate', submitTavernLeaderboardScore(human.name, scoreSummary.totalGold));
        emitState(roomCode);
        io.to(roomCode).emit('gameOver', { message: `Game Over\n\nYou reached encounter ${reached} of ${TAVERN_ENCOUNTERS.length} before falling at ${enemy.name}'s table.\n\n${scoreSummary.lines.join('\n')}\n\nWill you ever master the game?`, tavern: getTavernOverSummary(room, human.name, scoreSummary, false) });
        return;
    }

    if (enemy.lives <= 0) {
        let stats = room.tavernRun.stats;
        let winGold = (room.tavernRun.encounterIndex + 1) * GOLD.winPerPlace;
        let heartGold = Math.max(0, human.lives) * GOLD.perHeartLeft;
        stats.encountersDefeated++;
        stats.winGold += winGold;
        stats.heartGold += heartGold;
        room.tavernRun.purse += winGold + heartGold;
        room.tavernRun.encounterIndex++;
        if (room.tavernRun.encounterIndex >= TAVERN_ENCOUNTERS.length) {
            let scoreSummary = getTavernScoreSummary(room, true);
            room.roundPlayers = [];
            room.tavernRun.runComplete = true;
            io.emit('leaderboardUpdate', submitTavernLeaderboardScore(human.name, scoreSummary.totalGold));
            emitState(roomCode);
            io.to(roomCode).emit('gameOver', { message: `${human.name} wins the House Table! From peasant to king, every 2, 4, 24 player will know this run.\n\n${scoreSummary.lines.join('\n')}`, tavern: getTavernOverSummary(room, human.name, scoreSummary, true) });
            return;
        }

        // Between fights: two spots in the room catch your eye (maybe a pickpocket first).
        let won = {
            defeated: enemy.name,
            nextEnemy: TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name,
            gold: { win: winGold, hearts: heartGold }
        };
        startInterlude(room, won);
        room.roundPlayers = [];
        emitState(roomCode);
        io.to(roomCode).emit('offerShop', won); // the fight is won (the name is historical)
        return;
    }

    room.roundNumber++;
    room.tavernRun.encounterRound++;
    room.isTieBreaker = tiedPlayers.length > 1;
    // Turns alternate: the player goes first in a fight's odd rounds, the opponent in even ones.
    room.roundPlayers = room.tavernRun.encounterRound % 2 === 1 ? [humanId, enemyId] : [enemyId, humanId];
    room.currentTurnIndex = 0;
    emitState(roomCode);
}

// ---- Sockets ----

const asText = value => (typeof value === 'string' ? value : '');

io.on('connection', (socket) => {
    socket.emit('leaderboardUpdate', tavernLeaderboard);

    socket.on('checkRoom', (roomCode) => {
        let code = asText(roomCode).trim().toUpperCase() || "PUBLIC";
        socket.emit('roomStatus', { exists: !!rooms[code] });
    });

    socket.on('joinTavern', (data) => {
        if (!data || typeof data !== 'object') return;
        let roomCode = asText(data.roomCode).trim().toUpperCase();
        if (roomCode === "") roomCode = "PUBLIC";
        if (roomCode.length > 10) roomCode = roomCode.substring(0, 10);

        socket.roomCode = roomCode;
        socket.join(roomCode);

        let requestedLives = parseInt(data.startingLives) || 3;
        requestedLives = Math.max(1, Math.min(5, requestedLives));
        if (roomCode.startsWith("TVRN")) requestedLives = 3;

        if (!rooms[roomCode]) {
            let isTavernCrawl = roomCode.startsWith("TVRN");
            rooms[roomCode] = {
                players: {}, playerOrder: [], roundPlayers: [], currentTurnIndex: 0, isTieBreaker: false, isMusicPlaying: false, dealerIndex: 0, roundNumber: 1,
                turnEpoch: 0, turn: null,
                startingLives: requestedLives,
                mode: isTavernCrawl ? 'tavern-crawl' : 'classic',
                tavernRun: isTavernCrawl ? createTavernRun() : null
            };

            if (roomCode.startsWith("COMP")) {
                rooms[roomCode].players[BOT_ID] = {
                    id: BOT_ID, token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: requestedLives, score: null, busted: false, connected: true
                };
                rooms[roomCode].playerOrder.push(BOT_ID);
                rooms[roomCode].roundPlayers.push(BOT_ID);
            } else if (isTavernCrawl) {
                rooms[roomCode].players[BOT_ID] = {
                    id: BOT_ID, token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: 2, score: null, busted: false, connected: true
                };
                rooms[roomCode].playerOrder.push(BOT_ID);
                rooms[roomCode].roundPlayers.push(BOT_ID);
            }
        }

        let room = rooms[roomCode];
        if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }
        let finalName = asText(data.name).trim();
        if (finalName === "") finalName = "Mysterious Traveler";
        if (finalName.length > 15) finalName = finalName.substring(0, 15);
        let avatar = AVATARS.includes(data.avatar) ? data.avatar : AVATARS[0];
        let token = asText(data.token).substring(0, 64);

        let existingPlayerId = token && Object.keys(room.players).find(id => room.players[id].token === token);

        if (existingPlayerId && existingPlayerId !== BOT_ID) {
            let p = room.players[existingPlayerId];
            p.id = socket.id;
            p.avatar = avatar;
            p.name = finalName;
            p.connected = true;

            room.players[socket.id] = p;

            if (existingPlayerId !== socket.id) {
                delete room.players[existingPlayerId];
                let oldSocket = io.sockets.sockets.get(existingPlayerId);
                if (oldSocket) oldSocket.disconnect(true);
            }

            room.playerOrder = room.playerOrder.map(id => id === existingPlayerId ? socket.id : id);
            room.roundPlayers = room.roundPlayers.map(id => id === existingPlayerId ? socket.id : id);
            if (room.turn && room.turn.playerId === existingPlayerId) {
                room.turn.playerId = socket.id;
                room.turn.key = getTurnKey(room);
            }

        } else {
            room.players[socket.id] = {
                id: socket.id, token, name: finalName, avatar, lives: room.startingLives, score: null, busted: false, connected: true
            };
            room.playerOrder.push(socket.id);

            if (!room.isTieBreaker) {
                if (!room.roundPlayers.includes(socket.id)) room.roundPlayers.push(socket.id);
            }
        }

        let humanPlayers = room.playerOrder.filter(id => id !== BOT_ID && room.players[id] && room.players[id].connected);

        if (room.roundPlayers.length === 0 && humanPlayers.length > 0) {
            room.playerOrder.forEach(id => {
                if (room.players[id]) {
                    room.players[id].lives = room.startingLives;
                    room.players[id].score = null;
                    room.players[id].busted = false;
                }
            });
            room.dealerIndex = 0;
            room.roundPlayers = room.playerOrder.filter(id => room.players[id].connected);
            room.currentTurnIndex = 0;
            room.isTieBreaker = false;
            room.roundNumber = 1;
        }

        if (room.roundPlayers.length === 1 && room.roundPlayers[0] !== BOT_ID) {
            room.currentTurnIndex = 0;
        }

        if (room.mode === 'tavern-crawl' && !room.tavernRun.started) {
            resetTavernEncounter(roomCode, false);
        }

        if (room.isMusicPlaying) socket.emit('playGlobalMusic');

        emitState(roomCode);
        resumeBot(roomCode);
    });

    socket.on('playAgain', () => {
        let room = rooms[socket.roomCode];
        if (room && room.roundPlayers.length === 0) {
            // A Tavern Crawl restarts only once the run is over (not while Thom's cart is open).
            if (room.mode === 'tavern-crawl' && !room.tavernRun.runComplete) return;
            room.turnEpoch++;
            if (room.mode === 'tavern-crawl') {
                room.playerOrder.forEach(id => {
                    if (room.players[id]) {
                        room.players[id].lives = room.startingLives;
                        room.players[id].score = null;
                        room.players[id].busted = false;
                        room.players[id].connected = true;
                    }
                });
                room.tavernRun = createTavernRun();
                room.roundNumber = 1;
                resetTavernEncounter(socket.roomCode, false);
                emitState(socket.roomCode);
                io.to(socket.roomCode).emit('triggerNewGameSplash');
                return;
            }

            room.playerOrder.forEach(id => {
                if (room.players[id]) {
                    room.players[id].lives = room.startingLives;
                    room.players[id].score = null;
                    room.players[id].busted = false;
                }
            });

            if (room.playerOrder.length > 0) {
                room.dealerIndex = (room.dealerIndex + 1) % room.playerOrder.length;
            }

            room.roundPlayers = [];
            for (let i = 0; i < room.playerOrder.length; i++) {
                let idx = (room.dealerIndex + i) % room.playerOrder.length;
                let playerId = room.playerOrder[idx];
                if (room.players[playerId] && room.players[playerId].connected) {
                    room.roundPlayers.push(playerId);
                }
            }

            room.currentTurnIndex = 0;
            room.isTieBreaker = false;
            room.roundNumber++;

            emitState(socket.roomCode);
            io.to(socket.roomCode).emit('triggerNewGameSplash');
        }
    });

    socket.on('startGlobalMusic', () => {
        let room = rooms[socket.roomCode];
        if (room && !room.isMusicPlaying) {
            room.isMusicPlaying = true;
            io.to(socket.roomCode).emit('playGlobalMusic');
        }
    });

    socket.on('sendReaction', (emoji) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode === 'tavern-crawl' || !PLAYER_REACTIONS.includes(emoji)) return;
        let playerName = room.players[socket.id] ? room.players[socket.id].name : "Traveler";
        io.to(socket.roomCode).emit('receiveReaction', { name: playerName, emoji: emoji });
    });

    const isMyTurn = () => {
        let room = rooms[socket.roomCode];
        return !!(room && room.turn && room.turn.playerId === socket.id);
    };

    socket.on('rollDice', () => { if (isMyTurn()) performRoll(socket.roomCode); });
    socket.on('toggleDie', (dieId) => { if (isMyTurn() && Number.isInteger(dieId)) performToggle(socket.roomCode, dieId); });
    socket.on('endTurn', () => { if (isMyTurn()) performEndTurn(socket.roomCode); });

    // Thom's cart: the run's one player buys while it is open.
    const tavernPlayer = () => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl' || !room.players[socket.id] || socket.id === BOT_ID) return null;
        return room;
    };

    socket.on('buyThonic', (thonicId) => {
        let room = tavernPlayer();
        if (!room || !room.tavernRun.shop) return;
        let run = room.tavernRun;
        if (typeof thonicId !== 'string' || !run.shop.stock.includes(thonicId) || !THONICS[thonicId]) return;
        let price = THONICS[thonicId].price;
        if (run.purse < price || run.shelf.length >= SHELF_SIZE) return;
        run.purse -= price;
        run.stats.spent += price;
        run.shelf.push(thonicId);
        emitState(socket.roomCode);
    });

    // On to the next fight, from Thom's cart or any point between fights. (`leaveShop` is
    // the older name; the classic page and the tests still send it.)
    const moveOn = () => {
        let room = tavernPlayer();
        if (!room || !(room.tavernRun.shop || room.tavernRun.interlude)) return;
        moveOnToNextFight(socket.roomCode);
    };
    socket.on('leaveShop', moveOn);
    socket.on('moveOn', moveOn);

    // Between fights (see startInterlude). Each step only works at its own stage.
    const interludeAt = stage => {
        let room = tavernPlayer();
        let interlude = room && room.tavernRun.interlude;
        return interlude && interlude.stage === stage ? room : null;
    };

    // 'roll' once, to try to catch him; then 'on' to the two spots.
    socket.on('pickpocket', (action) => {
        let room = interludeAt('pickpocket');
        if (!room) return;
        let run = room.tavernRun, interlude = run.interlude;
        if (action === 'roll' && !interlude.roll) {
            interlude.roll = rollFace();
            interlude.caught = interlude.roll >= INTERLUDE.pickpocketCatch;
            interlude.lost = interlude.caught ? 0 : -changePurse(run, -interlude.steal);
        } else if (action === 'on' && interlude.roll) {
            let { roll, caught, lost } = interlude;
            run.interlude = { stage: 'choose', spots: pickSpots(room), note: { roll, caught, lost } };
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    socket.on('chooseSpot', (spot) => {
        let room = interludeAt('choose');
        if (!room || typeof spot !== 'string' || !room.tavernRun.interlude.spots.includes(spot)) return;
        let run = room.tavernRun;
        if (spot === 'thom') {
            run.interlude = null;
            run.shop = { stock: pickThomStock(PLACES.tavern) };
        } else if (spot === 'shrine') {
            run.interlude = { stage: 'shrine', gold: INTERLUDE.shrineGold };
        } else if (spot === 'diceDen') {
            run.interlude = { stage: 'diceDen', bets: INTERLUDE.diceDenBets, bet: null, throws: [] };
        } else if (spot === 'stranger') {
            let offers = shuffled(unownedKeepsakes(room)).slice(0, INTERLUDE.strangerOffers);
            run.interlude = { stage: 'stranger', offers, hearts: INTERLUDE.strangerHearts };
        }
        emitState(socket.roomCode);
    });

    socket.on('shrinePick', (gift) => {
        let room = interludeAt('shrine');
        if (!room) return;
        let run = room.tavernRun;
        if (gift === 'healing') {
            if (run.shelf.length >= SHELF_SIZE) return;
            run.shelf.push('healing');
            run.interlude = { stage: 'done', spot: 'shrine', gift };
        } else if (gift === 'gold') {
            changePurse(run, INTERLUDE.shrineGold);
            run.interlude = { stage: 'done', spot: 'shrine', gift, gold: INTERLUDE.shrineGold };
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    // The Dice Den: name the bet (0 declines), then 'diceRoll' throws until someone wins.
    socket.on('diceBet', (bet) => {
        let room = interludeAt('diceDen');
        if (!room || room.tavernRun.interlude.bet) return;
        let run = room.tavernRun;
        if (bet === 0) {
            run.interlude = { stage: 'done', spot: 'diceDen', bet: 0 };
        } else {
            if (!INTERLUDE.diceDenBets.includes(bet) || run.purse < bet) return;
            run.interlude.bet = bet;
        }
        emitState(socket.roomCode);
    });

    socket.on('diceRoll', () => {
        let room = interludeAt('diceDen');
        let interlude = room && room.tavernRun.interlude;
        if (!interlude || !interlude.bet) return;
        let { you, them, won } = throwDiceDen();
        let throws = [...interlude.throws, { you, them }];
        if (won === null) {
            interlude.throws = throws;
        } else {
            changePurse(room.tavernRun, won ? interlude.bet : -interlude.bet);
            room.tavernRun.interlude = { stage: 'done', spot: 'diceDen', bet: interlude.bet, throws, won };
        }
        emitState(socket.roomCode);
    });

    socket.on('strangerPick', (keepsakeId) => {
        let room = interludeAt('stranger');
        if (!room) return;
        let run = room.tavernRun;
        if (keepsakeId === null) {
            run.interlude = { stage: 'done', spot: 'stranger', keepsake: null };
        } else {
            let keepsake = run.interlude.offers.find(k => k.id === keepsakeId);
            if (!keepsake) return;
            run.keepsakes.push(keepsake);
            run.nextFightHearts = INTERLUDE.strangerHearts;
            run.interlude = { stage: 'done', spot: 'stranger', keepsake, hearts: INTERLUDE.strangerHearts };
        }
        emitState(socket.roomCode);
    });

    // Drinking, always on your own turn. When exactly, and what it does, depends on the
    // Thonic; anything not allowed right now changes nothing and the Thonic stays on the shelf.
    //   healing         before you roll, once you've lost a heart: +1 heart
    //   clearEye        before you roll, against an opponent with an ability: none this round
    //   fizzy           after a roll that left active 1s: those dice roll again
    //   secondThoughts  after a roll, naming a kept die (dieId): it goes back into play
    //   steady          any time in your turn: dust this turn counts as 0
    socket.on('drinkThonic', (slot, dieId) => {
        let room = tavernPlayer();
        if (!room || !Number.isInteger(slot)) return;
        let roomCode = socket.roomCode;
        let run = room.tavernRun;
        let thonicId = run.shelf[slot];
        let thonic = thonicId && THONICS[thonicId];
        if (!thonic || !thonic.drink) return;
        if (!isTurnPlayable(roomCode) || !isMyTurn()) return;
        let turn = room.turn;
        if (Date.now() < turn.busyUntil) return;
        let player = room.players[socket.id];
        let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
        let text, rerolled = null;

        if (thonicId === 'healing') {
            if (turn.hasRolled || player.lives >= room.startingLives) return;
            player.lives += 1;
            text = '+1 heart';
        } else if (thonicId === 'clearEye') {
            if (turn.hasRolled || !encounter.ability || run.clearEyeRound === room.roundNumber) return;
            run.clearEyeRound = room.roundNumber;
            text = `${encounter.name} can't use ${Rules.ABILITY_NAMES[encounter.ability]} this round`;
        } else if (thonicId === 'fizzy') {
            rerolled = Rules.rerollOnes(turn, rollFace);
            if (!rerolled) return;
            text = 'Your 1s roll again';
        } else if (thonicId === 'secondThoughts') {
            if (!Number.isInteger(dieId) || !Rules.putBackDie(turn, dieId)) return;
            text = 'A kept die goes back in play';
        } else if (thonicId === 'steady') {
            if (turn.steady) return;
            turn.steady = true;
            text = 'Dust this turn counts as 0';
        } else {
            return;
        }

        run.shelf.splice(slot, 1);
        run.stats.thonicsDrunk++;
        io.to(roomCode).emit('thonicUsed', { id: thonicId, name: thonic.name, text });
        if (rerolled) {
            // The rerolled dice tumble like any roll (only those dice are thrown).
            let animationMs = 500;
            turn.busyUntil = Date.now() + delay(animationMs);
            io.to(roomCode).emit('diceRolled', { turn: Rules.viewTurn(turn), preRollCallout: null, suspense: Rules.SUSPENSE.NONE, devil: false, animationMs, throwSeed: crypto.randomInt(0, 2 ** 31), rerolled });
        } else {
            emitTurn(roomCode, { type: 'toggle' });
        }
        emitState(roomCode);
    });

    socket.on('chooseKeepsake', (keepsakeId) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl' || !room.tavernRun.pendingKeepsakeChoices) return;
        let selected = room.tavernRun.pendingKeepsakeChoices.find(k => k.id === keepsakeId);
        if (!selected) return;

        room.tavernRun.keepsakes.push(selected);
        resetTavernEncounter(socket.roomCode, true);
        emitState(socket.roomCode);
        io.to(socket.roomCode).emit('displayMessage', { text: selected.name, color: "#ffd54f" });
    });

    socket.on('disconnect', () => {
        let roomCode = socket.roomCode;
        let room = roomCode && rooms[roomCode];
        if (!room) return;
        let player = room.players[socket.id];
        if (player) {
            player.connected = false;
            if (room.roundPlayers[room.currentTurnIndex] === socket.id) {
                // Their turn: give them a chance to come back before it counts as dust.
                let token = player.token;
                setTimeout(() => forfeitIfStillAway(roomCode, room, token), delay(TURN_RECONNECT_GRACE_MS));
            }
            emitState(roomCode);
        }
        scheduleEmptyTableCleanup(roomCode);
    });
});

function start(port = process.env.PORT || 3000) {
    return new Promise(resolve => {
        http.listen(port, () => {
            let actualPort = http.address().port;
            console.log(`Server is running on port ${actualPort}`);
            // The PC's address on the local network changes from time to time, so print
            // the links to open on a phone connected to the same Wi-Fi.
            Object.values(os.networkInterfaces()).flat()
                .filter(net => net && net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.'))
                .forEach(net => console.log(`On your Wi-Fi: http://${net.address}:${actualPort}/next/`));
            Strategy.warmUp(); // the opponents' best-play tables, quietly in the background
            resolve(http);
        });
    });
}

if (require.main === module) start();

module.exports = { start, http, io, rooms, emitState };
