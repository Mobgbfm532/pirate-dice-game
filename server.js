const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Rules = require('./shared/rules');

const BOT_ID = 'BOT_MOLAR';

// Scales every server-side delay (bot thinking time, roll animations). Tests set this low.
const TIME_SCALE = Number(process.env.GAME_TIME_SCALE) || 1;
const delay = msValue => Math.round(msValue * TIME_SCALE);

const rollFace = () => crypto.randomInt(1, 7);

const AVATARS = ['Devil', 'Vaelin', 'Rokr', 'The Hangman', 'Klarg', 'Jaguar Cantona'];
const PLAYER_REACTIONS = ['😀', '😂', '😮', '😎', '😭', '🧔 Early Ross'];

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

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
        intro: 'The Hangman keeps one round in the chamber. At one life, The Ace of Spades can turn a score of 16 or higher into a perfect 24.'
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
        abilityUsed: room.tavernRun.abilityUsed,
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
    if (room.mode === 'tavern-crawl' && room.tavernRun.pendingKeepsakeChoices) return false;
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
    io.to(roomCode).emit('diceRolled', { turn: Rules.viewTurn(turn), preRollCallout, suspense: result.suspense, devil: result.devil, animationMs });

    let key = turn.key;
    if (result.devil && isBotRoom(roomCode)) botLater(roomCode, key, animationMs, () => sendBotReaction(roomCode, 'hood'));
    if (signatureMoves.length) {
        setTimeout(() => {
            if (!rooms[roomCode]) return;
            signatureMoves.forEach(move => io.to(roomCode).emit('signatureMove', move));
            io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
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
    room.players[currentId].score = score;
    room.players[currentId].busted = busted;

    if (room.mode === 'tavern-crawl') {
        let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
        if (canUseTavernAbility(room, encounter, 'deadeye24') && currentId === BOT_ID && room.players[currentId].lives <= 1 && !busted && score >= 16 && score < 24) {
            room.players[currentId].score = 24;
            markAbilityUsed(room, 'deadeye24');
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'The Ace of Spades', text: 'The Hangman plays his last card. Perfect 24.' });
            io.to(roomCode).emit('displayMessage', { text: 'The Hangman plays The Ace of Spades.', color: "#ffd54f" });
        }

        if (canUseTavernAbility(room, encounter, 'smoothTalk') && currentId !== BOT_ID && !busted && score > 0) {
            room.players[currentId].score = Math.max(0, score - 3);
            markAbilityUsed(room, 'smoothTalk');
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'Smooth Talk', text: 'Jaguar smiles and worsens your finished hand.' });
            io.to(roomCode).emit('displayMessage', { text: 'Jaguar smiles. Smooth Talk knocks 3 from your finished hand.', color: "#ffb74d" });
        }

        if (currentId !== BOT_ID && room.players[currentId].score === 24 && room.tavernRun.stats) {
            room.tavernRun.stats.perfect24s++;
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

function skipDisconnectedPlayers(room) {
    while (room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
        room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
        room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
        room.currentTurnIndex++;
    }
}

// Runs `fn` after `ms` unless the room is gone or the turn has moved on.
function botLater(roomCode, key, ms, fn) {
    let room = rooms[roomCode];
    setTimeout(() => {
        let current = rooms[roomCode];
        if (current !== room || !current.turn || current.turn.key !== key) return;
        fn();
    }, delay(ms));
}

function runBotRoll(roomCode) {
    let room = rooms[roomCode];
    let key = room.turn.key;
    let animationMs = performRoll(roomCode);
    if (animationMs) botLater(roomCode, key, animationMs + 1000, () => runBotDecision(roomCode));
}

function runBotDecision(roomCode) {
    let room = rooms[roomCode];
    let turn = room.turn;
    let key = turn.key;
    let enemyId = room.mode === 'tavern-crawl' ? TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].id : 'molar';
    let toLock = Rules.planBotLocks(turn, enemyId);

    toLock.forEach((dieId, index) => botLater(roomCode, key, index * 400, () => performToggle(roomCode, dieId)));

    botLater(roomCode, key, toLock.length * 400 + 800, () => {
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
    });
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

function createTavernRun() {
    return {
        encounterIndex: 0,
        keepsakes: [],
        pendingKeepsakeChoices: null,
        abilityUsed: {},
        abilityRound: 1,
        encounterRound: 1,
        encounterKeepsakeUses: {},
        stats: {
            encountersDefeated: 0,
            livesLost: 0,
            keepsakesActivated: 0,
            perfect24s: 0
        },
        started: false,
        runComplete: false
    };
}

function getRandomAbilityRound(encounter) {
    if (!encounter || !encounter.ability) return 0;
    return Math.floor(Math.random() * 3) + 1;
}

function getTavernScoreSummary(room, completedRun = false) {
    let stats = room.tavernRun.stats;
    let progressGold = 0;
    for (let i = 0; i < stats.encountersDefeated; i++) {
        progressGold += (i + 1) * 100;
    }
    if (!completedRun && stats.encountersDefeated < TAVERN_ENCOUNTERS.length) {
        progressGold += (stats.encountersDefeated + 1) * 25;
    }
    let lifeBonus = Math.max(0, (stats.encountersDefeated * 3 - stats.livesLost) * 25);
    let restraintBonus = Math.max(0, 150 - stats.keepsakesActivated * 25);
    let perfectBonus = stats.perfect24s * 75;
    let totalGold = progressGold + lifeBonus + restraintBonus + perfectBonus;

    return {
        totalGold,
        lines: [
            `Gold earned: ${totalGold}`,
            `Progress: ${progressGold}`,
            `Lives spared bonus: ${lifeBonus}`,
            `Keepsake restraint bonus: ${restraintBonus}`,
            `Perfect 24 bonus: ${perfectBonus}`
        ]
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
        room.players[humanId].lives = room.startingLives;
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
        io.to(roomCode).emit('gameOver', { message: `Game Over\n\nYou reached encounter ${reached} of ${TAVERN_ENCOUNTERS.length} before falling at ${enemy.name}'s table.\n\n${scoreSummary.lines.join('\n')}\n\nWill you ever master the game?` });
        return;
    }

    if (enemy.lives <= 0) {
        if (room.tavernRun.stats) room.tavernRun.stats.encountersDefeated++;
        room.tavernRun.encounterIndex++;
        if (room.tavernRun.encounterIndex >= TAVERN_ENCOUNTERS.length) {
            let scoreSummary = getTavernScoreSummary(room, true);
            room.roundPlayers = [];
            room.tavernRun.runComplete = true;
            io.emit('leaderboardUpdate', submitTavernLeaderboardScore(human.name, scoreSummary.totalGold));
            emitState(roomCode);
            io.to(roomCode).emit('gameOver', { message: `${human.name} wins the House Table! From peasant to king, every 2, 4, 24 player will know this run.\n\n${scoreSummary.lines.join('\n')}` });
            return;
        }

        room.tavernRun.pendingKeepsakeChoices = pickKeepsakeChoices(room);
        room.roundPlayers = [];
        emitState(roomCode);
        io.to(roomCode).emit('offerKeepsakes', {
            defeated: enemy.name,
            nextEnemy: TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name,
            transitionMessage: enemy.id === 'molar' ? 'After defeating the Molar, you are invited to the high roller table...' : null,
            choices: room.tavernRun.pendingKeepsakeChoices
        });
        return;
    }

    room.roundNumber++;
    room.tavernRun.encounterRound++;
    room.isTieBreaker = tiedPlayers.length > 1;
    room.roundPlayers = [humanId, enemyId];
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
    });

    socket.on('playAgain', () => {
        let room = rooms[socket.roomCode];
        if (room && room.roundPlayers.length === 0) {
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
        if (roomCode && rooms[roomCode]) {
            let room = rooms[roomCode];
            if (room.players[socket.id]) {
                room.players[socket.id].connected = false;

                if (room.roundPlayers[room.currentTurnIndex] === socket.id) {
                    room.players[socket.id].busted = true;
                    room.players[socket.id].score = 0;
                    advanceTurn(roomCode);
                } else {
                    emitState(roomCode);
                }
            }

            let anyConnected = Object.values(room.players).some(p => p.connected && p.id !== BOT_ID);
            if (!anyConnected) delete rooms[roomCode];
        }
    });
});

function start(port = process.env.PORT || 3000) {
    return new Promise(resolve => {
        http.listen(port, () => {
            console.log(`Server is running on port ${http.address().port}`);
            resolve(http);
        });
    });
}

if (require.main === module) start();

module.exports = { start, http, io, rooms };
