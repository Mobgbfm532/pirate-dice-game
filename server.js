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
const BALANCE = require('./shared/balance');

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

// The opponents, in the order you meet them: the Ghoul and Gourd (a qualifier: the bouncer, then
// the high-roller table), then the final at the Yawning Portal. `place` is a key of PLACES.
// McGrath is the Molar renamed and keeps his id ('molar'): he plays simply, as a teacher.
const TAVERN_ENCOUNTERS = [
    {
        id: 'molar',
        place: 'ghoulAndGourd',
        name: 'Sperm McGrath',
        avatar: '🦷',
        lives: BALANCE.opponentLives.molar,
        ability: null,
        intro: "Sperm McGrath, the Ghoul and Gourd's bouncer, lets no one into the tournament who doesn't know the house game: find a 2, find a 4, then chase 24."
    },
    {
        id: 'frak',
        place: 'ghoulAndGourd',
        name: 'Frak',
        avatar: '🦑',
        lives: BALANCE.opponentLives.frak,
        ability: 'mindWhip',
        intro: 'Frak, a repugnant ne’er-do-well, slimes into place. Mind Whip: on your first throw he makes you keep one of your dice, at random.'
    },
    {
        id: 'danhausen',
        place: 'ghoulAndGourd',
        name: 'Danhausen',
        avatar: '🧛',
        lives: BALANCE.opponentLives.danhausen,
        ability: 'cursed',
        intro: 'Danhausen: Very Nice, Very Evil and Mayor of Waterdeep? You are Cursed: for a round, the lowest valid score wins.'
    },
    {
        id: 'duke',
        place: 'ghoulAndGourd',
        name: 'Duke Morrigan',
        avatar: '😈',
        lives: BALANCE.opponentLives.duke,
        ability: 'devil',
        intro: 'Duke Morrigan, noble, roguish and scion of Avernus. Sympathy for the Devil: his roll comes up three 6s.'
    },
    {
        id: 'martha',
        place: 'ghoulAndGourd',
        name: 'Martha Mystery',
        avatar: '🎭',
        lives: BALANCE.opponentLives.martha,
        ability: 'disguises',
        boss: true, // beating her wins her mask and the invitation to the final
        intro: 'Martha? Mystery? Who knows? Twice a fight she takes the face of Frak, Danhausen or the Duke, and plays their trick.'
    },
    {
        id: 'klarg',
        place: 'yawningPortal',
        name: 'Klarg',
        avatar: '🐻',
        lives: BALANCE.opponentLives.klarg,
        ability: 'reachAround',
        intro: 'Klarg, bugbear paladin and sworn enemy of Kram, may steal one active die with Reach Around.'
    },
    {
        id: 'rokr',
        place: 'yawningPortal',
        name: 'Rokr',
        avatar: '✨',
        lives: BALANCE.opponentLives.rokr,
        ability: 'constellationBlur',
        intro: 'Rokr reads the dice in the stars. Twice per match, constellations can blur your active dice.'
    },
    {
        id: 'hangman',
        place: 'yawningPortal',
        name: 'The Hangman',
        avatar: '🤠',
        lives: BALANCE.opponentLives.hangman,
        ability: 'deadeye24',
        intro: 'The Hangman keeps one round in the chamber of The Ace of Spades, his revolver. At one life, one shot can turn a score of 16 or higher into a perfect 24.'
    },
    {
        id: 'jaguar',
        place: 'yawningPortal',
        name: 'Jaguar Cantona',
        avatar: '😎',
        lives: BALANCE.opponentLives.jaguar,
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
        id: 'loadedDie',
        name: 'Loaded Die',
        text: 'One of your dice always rolls a 4, 5 or 6.'
    },
    {
        id: 'potionBelt',
        name: 'Potion Belt',
        text: 'Your shelf holds one more Thonic. Comes with a Healing Thonic.'
    },
    {
        id: 'loyaltyCard',
        name: "Thom's Loyalty Card",
        text: "Thom's cart is always one of the spots, and your first Thonic each visit is free."
    }
];
const KEEPSAKE_NUMBERS = BALANCE.keepsakes;

// Martha's mask: dropped by Martha Mystery (never offered by the Stranger). Once a fight, before
// you roll, you wear one of her disguises for the round (the wearMask handler).
const MARTHAS_MASK = {
    id: 'marthasMask',
    name: "Martha's Mask",
    text: "Once a fight, before you roll: Danhausen's Curse (lowest valid score wins the round) or the Duke's Devil (three 6s for you)."
};
const LOADED_DIE = 0; // the die the Loaded Die keepsake loads (marked on the table)

// Thom's Thonics: potions bought from Thom between fights and kept on a shelf (up to
// SHELF_SIZE) until drunk. `drink` = tapped by the player on their own turn (when exactly
// depends on the Thonic: see the drinkThonic handler); Last Gasp works by itself.
const THONICS = {
    healing: { id: 'healing', name: 'Healing Thonic', text: '+1 heart, up to your maximum. Drink it before you roll.', price: BALANCE.thonicPrices.healing, drink: true },
    lastGasp: { id: 'lastGasp', name: 'Last Gasp Thonic', text: 'Works by itself: a round that would take your last heart leaves you on 1.', price: BALANCE.thonicPrices.lastGasp, drink: false },
    fizzy: { id: 'fizzy', name: 'Fizzy Thomic', text: 'After a roll: your 1s roll again, once.', price: BALANCE.thonicPrices.fizzy, drink: true },
    secondThoughts: { id: 'secondThoughts', name: 'Second Thoughts Thonic', text: 'Put back a die you kept, then roll it again.', price: BALANCE.thonicPrices.secondThoughts, drink: true },
    steady: { id: 'steady', name: 'Steady Thonic', text: "This turn, a missing 2 or 4 doesn't dust you: your dice score as they lie.", price: BALANCE.thonicPrices.steady, drink: true },
    clearEye: { id: 'clearEye', name: 'Clear-Eye Thonic', text: "Cancels the opponent's next ability, whenever it comes.", price: BALANCE.thonicPrices.clearEye, drink: true }
};
const SHELF_SIZE = BALANCE.shelfSize;
const SHOP_SIZE = BALANCE.shopSize; // Thonics on Thom's cart per visit: Healing, plus two others at random

// The places in the run: what Thom sells there and the spots between fights. (Each opponent
// names its place.) Both have the same spots for now; a split is a later choice.
const PLACES = {
    ghoulAndGourd: {
        name: 'The Ghoul and Gourd',
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        // Between fights two of these catch your eye, and you go to one, unless the pickpocket,
        // the Hooded Stranger or one of the place's own events finds you first (startInterlude).
        spots: ['thom', 'shrine', 'diceDen', 'hotTub'],
        events: ['darren'] // Darren Snakehands is the barman here
    },
    yawningPortal: {
        name: 'The Yawning Portal',
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        spots: ['thom', 'shrine', 'diceDen', 'hotTub'],
        events: []
    }
};

// Where the run is now (between fights: where the next fight is).
function placeOf(room) {
    let index = Math.min(room.tavernRun.encounterIndex, TAVERN_ENCOUNTERS.length - 1);
    return PLACES[TAVERN_ENCOUNTERS[index].place];
}

// Between fights, one event: now and then a pickpocket or the Hooded Stranger finds you, else
// two spots in the room catch your eye and you choose one. Gold during a run goes into the purse as it is won, and the purse
// is the final score. The numbers live in shared/balance.js.
const INTERLUDE = BALANCE.interlude;
const GOLD = BALANCE.gold;

// The Wild Magic Hot Tub's surges (weights in shared/balance.js). The dice ones work on
// HOT_TUB_DIE, on the player's turns, for the next fight (tavernRun.tubSurge).
const HOT_TUB_DIE = INTERLUDE.hotTubDie;
const HOT_TUB_SURGES = {
    noOnes: { name: 'Bubbly Die', text: 'One of your dice never rolls a 1 next fight.', good: true },
    twin: { name: 'Double Bubble', text: 'One of your dice rolls twice and keeps the better next fight.', good: true },
    lucky: { name: 'Lucky Splash', text: 'One of your dice only rolls 4, 5 or 6 next fight.', good: true },
    scalding: { name: 'Scalding Die', text: 'One of your dice always lands on a 6 next fight.', good: true },
    soggy: { name: 'Soggy Die', text: 'One of your dice never rolls a 6 next fight.', good: false },
    pruney: { name: 'Pruney Fingers', text: 'You start the next fight a heart short.', good: false }
};
function pickHotTubSurge() {
    let weights = Object.entries(INTERLUDE.hotTubSurges).filter(([id]) => HOT_TUB_SURGES[id]);
    let roll = crypto.randomInt(0, weights.reduce((a, [, w]) => a + w, 0));
    for (let [id, w] of weights) { if (roll < w) return id; roll -= w; }
    return weights[0][0];
}

// What Thom has on his cart this visit: always Healing, plus others picked at random.
function pickThomStock(place) {
    let others = place.thomStock.filter(id => id !== 'healing');
    for (let i = others.length - 1; i > 0; i--) {
        let j = crypto.randomInt(0, i + 1);
        [others[i], others[j]] = [others[j], others[i]];
    }
    return ['healing', ...others.slice(0, SHOP_SIZE - 1)];
}

// The shelf, one slot more with the Potion Belt.
function shelfSizeOf(room) {
    return SHELF_SIZE + (hasKeepsake(room, 'potionBelt') ? KEEPSAKE_NUMBERS.beltSlots : 0);
}

// How the dice land on this turn: the Loaded Die only rolls loadedDieLow or more.
function rollFaceFor(room, turn) {
    if (room.mode !== 'tavern-crawl' || turn.playerId === BOT_ID) return rollFace;
    let loaded = hasKeepsake(room, 'loadedDie');
    let surge = room.tavernRun.tubSurge;
    if (!loaded && !surge) return rollFace;
    let base = d => (loaded && d && d.id === LOADED_DIE ? crypto.randomInt(KEEPSAKE_NUMBERS.loadedDieLow, 7) : rollFace());
    if (!surge) return base;
    // Double Bubble: the roll that lost, this throw (sent with diceRolled as twin, for its ghost die).
    turn.twinRoll = null;
    return d => {
        if (!d || d.id !== HOT_TUB_DIE) return base(d);
        if (surge === 'noOnes') return crypto.randomInt(2, 7);
        if (surge === 'soggy') return crypto.randomInt(1, 6);
        if (surge === 'lucky') return crypto.randomInt(4, 7);
        if (surge === 'scalding') return 6;
        if (surge === 'twin') {
            // The better of two: a 2 or 4 still needed, else the higher.
            let kept = turn.dice.filter(x => x.status === Rules.STATUS.LOCKED).map(x => x.value);
            let a = base(d), b = base(d);
            let pick = Math.max(a, b);
            for (let need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) { pick = need; break; }
            let lost = pick === a ? b : a;
            if (lost !== pick) turn.twinRoll = { die: d.id, kept: pick, lost };
            return pick;
        }
        return base(d);
    };
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
    // Who sits across the table: the current opponent, or, between fights, the one just beaten
    // (enemy is already the next one then). Browsers draw the table from this.
    let bot = room.players[BOT_ID];
    let seatedIndex = bot ? TAVERN_ENCOUNTERS.findIndex(e => e.name === bot.name) : -1;
    let seated = seatedIndex >= 0 ? { ...TAVERN_ENCOUNTERS[seatedIndex], number: seatedIndex + 1 } : { ...encounter, number: room.tavernRun.encounterIndex + 1 };
    return {
        encounterNumber: room.tavernRun.encounterIndex + 1,
        seated,
        totalEncounters: TAVERN_ENCOUNTERS.length,
        place: placeOf(room).name,
        enemy: encounter,
        roundEffect: room.tavernRun.roundEffect || null, // this round's Curse, Devil or Mind Whip (see beginTavernRound)
        devilCap: BALANCE.devilCap,
        maskReady: hasKeepsake(room, 'marthasMask') && !room.tavernRun.encounterKeepsakeUses.marthasMask,
        keepsakes: room.tavernRun.keepsakes,
        pendingKeepsakeChoices: room.tavernRun.pendingKeepsakeChoices,
        purse: room.tavernRun.purse,
        shelf: room.tavernRun.shelf.map(thonicView),
        shelfSize: shelfSizeOf(room),
        shop: room.tavernRun.shop ? { stock: room.tavernRun.shop.stock.map(thonicView), free: !!room.tavernRun.shop.free } : null,
        interlude: room.tavernRun.interlude,
        lastWin: room.tavernRun.lastWin,
        nextFightHearts: room.tavernRun.nextFightHearts,
        ladysGrace: !!room.tavernRun.ladysGrace,
        // The hot tub's surge on one of your dice, this fight (tubSurge) or the next (nextSurge).
        tubSurge: room.tavernRun.tubSurge ? { id: room.tavernRun.tubSurge, die: HOT_TUB_DIE, ...HOT_TUB_SURGES[room.tavernRun.tubSurge] } : null,
        nextSurge: room.tavernRun.nextFightSurge || null,
        abilityUsed: room.tavernRun.abilityUsed,
        abilityMax: seated.ability ? BALANCE.abilityUses[seated.ability] : 0, // uses a fight (the seated opponent's)
        clearEye: !!room.tavernRun.clearEyeArmed, // a Clear-Eye is waiting for the next ability
        abilityLeft: !!encounterAbilityLeft(room),
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
    if (room.mode !== 'tavern-crawl') return [];
    let run = room.tavernRun;
    let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
    let moves = [];
    let effect = run.roundEffect;
    let mine = turn.playerId !== BOT_ID;
    let active = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
    let sixes = () => shuffled(active).slice(0, 3).forEach(d => { d.value = 6; });

    // The Duke's Sympathy for the Devil (or Martha in his face): it waits until he has kept a 2
    // and a 4 with three dice still to throw; that throw comes up three 6s, and the player can't
    // score above devilCap this round (capped when the round is judged if they played first).
    let kept = turn.dice.filter(d => d.status !== Rules.STATUS.ACTIVE && d.status !== Rules.STATUS.STOLEN).map(d => d.value);
    if (!mine && run.pendingDevil && kept.includes(2) && kept.includes(4) && active.length >= 3) {
        let as = run.pendingDevil.as;
        run.pendingDevil = null;
        if (fireTavernAbility(roomCode, room, encounter, encounter.ability)) {
            sixes();
            run.roundEffect = { kind: 'devil', by: 'opponent', ability: 'devil', as, landed: true };
            moves.push(roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT.devil.opponent));
        }
    }
    if (turn.rollCount !== 1) return moves;

    // Martha's mask: the player's Devil comes up three 6s on their first throw.
    if (mine && effect && effect.kind === 'devil' && effect.by === 'player' && !effect.landed) {
        effect.landed = true;
        sixes();
    }
    if (!mine) return moves;

    // Frak's Mind Whip: he makes the player keep one of their dice, at random (Rules.mindWhip).
    if (effect && effect.kind === 'mind' && !effect.landed) {
        effect.landed = true;
        let die = Rules.mindWhip(turn, n => crypto.randomInt(0, n));
        if (die) moves.push(roundEffectMove(room, effect, `You must keep your ${die.value}. You may keep others too.`));
    }

    let inPlay = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).length;
    if (inPlay > 1 && fireTavernAbility(roomCode, room, encounter, 'reachAround')) {
        Rules.stealHighestActiveDie(turn);
        moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.reachAround, text: 'Klarg uses Reach Around and steals one die.' });
    }
    if (fireTavernAbility(roomCode, room, encounter, 'constellationBlur')) {
        turn.blurActive = true;
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
        rollFace: rollFaceFor(room, turn),
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
    io.to(roomCode).emit('diceRolled', { turn: Rules.viewTurn(turn), preRollCallout, suspense: result.suspense, devil: result.devil, animationMs, throwSeed, twin: turn.twinRoll || undefined });

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
    if (room.turn.steady && busted) { busted = false; score = Rules.scoreDice(room.turn.dice).score; } // Steady Thonic: the dice score as they lie
    room.players[currentId].score = score;
    room.players[currentId].busted = busted;

    if (room.mode === 'tavern-crawl') {
        let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
        let effect = room.tavernRun.roundEffect;
        let cursed = !!effect && effect.kind === 'curse';
        if (BALANCE.devilCap != null && effect && effect.kind === 'devil' && (effect.by === 'player') === (currentId === BOT_ID) && !busted && score > BALANCE.devilCap) {
            score = BALANCE.devilCap;
            room.players[currentId].score = score;
        }
        if (currentId === BOT_ID && !cursed && room.players[currentId].lives <= 1 && !busted && score >= 16 && score < 24 && fireTavernAbility(roomCode, room, encounter, 'deadeye24')) {
            room.players[currentId].score = 24;
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'The Ace of Spades', text: 'The Hangman fires The Ace of Spades. Perfect 24.' });
            io.to(roomCode).emit('displayMessage', { text: 'The Hangman fires The Ace of Spades.', color: "#ffd54f" });
        }

        if (currentId !== BOT_ID && !cursed && !busted && score > 0 && fireTavernAbility(roomCode, room, encounter, 'smoothTalk')) {
            room.players[currentId].score = Math.max(0, score - 3);
            io.to(roomCode).emit('signatureMove', { name: encounter.name, ability: 'Smooth Talk', text: 'Jaguar smiles and worsens your finished hand.' });
            io.to(roomCode).emit('displayMessage', { text: 'Jaguar smiles. Smooth Talk knocks 3 from your finished hand.', color: "#ffb74d" });
        }

        if (currentId !== BOT_ID && room.players[currentId].score === 24 && room.tavernRun.stats) {
            room.tavernRun.stats.perfect24s++;
            room.tavernRun.stats.perfectGold += GOLD.perfect24;
            room.tavernRun.purse += GOLD.perfect24;
        }
    }

    // A 24 restores a life, up to what the player started with (a Tavern Crawl opponent: up to
    // their own lives for the fight). An opponent's 24 must be rolled: the Hangman's Ace of
    // Spades makes one that doesn't heal him (`score` is the hand before the Ace).
    let maxLives = room.mode === 'tavern-crawl' && currentId === BOT_ID ? TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].lives : room.startingLives;
    let natural = currentId !== BOT_ID || score === 24;
    if (natural && room.players[currentId].score === 24 && room.players[currentId].lives < maxLives) {
        room.players[currentId].lives = Math.min(maxLives, room.players[currentId].lives + 1);
        io.to(roomCode).emit('displayMessage', { text: '+1 Life Restored!', color: "#aed581" });
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
    if (human.busted) return null;
    let cushion = hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion;
    let effect = room.tavernRun.roundEffect;
    let cursed = effect && effect.kind === 'curse';
    let score = BALANCE.devilCap != null && effect && effect.kind === 'devil' && effect.by === 'opponent' ? Math.min(human.score, BALANCE.devilCap) : human.score;
    return score + (cushion ? (cursed ? -1 : 1) : 0);
}

// True when a Tavern Crawl opponent can no longer win or tie the round, whatever the dice
// do: the player has finished, and the best this hand can still make (24 with the Hangman's
// shot ready at 16 or more) falls short, or a 2 or 4 is out of reach. `toBeat` is from
// getTavernScoreToBeat: undefined while the player is still to play (never concede then),
// null if the player dusted (any valid hand wins).
// In a cursed round they always play it out; under the player's Devil, their best counts as
// no more than the cap.
function tavernRoundLost(turn, toBeat, aceAt16, { low = false, cap = null } = {}) {
    if (toBeat === undefined || low) return false;
    let best = Rules.bestPossibleScore(turn.dice);
    if (best === null) return true;
    if (aceAt16 && best >= 16) best = 24;
    if (cap !== null) best = Math.min(best, cap);
    return toBeat !== null && best < toBeat;
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
    // A cursed round is played for the fewest points; under the player's Devil the bot's
    // score counts as no more than the cap.
    let effect = room.mode === 'tavern-crawl' ? room.tavernRun.roundEffect : null;
    let round = { low: !!effect && effect.kind === 'curse', cap: effect && effect.kind === 'devil' && effect.by === 'player' ? BALANCE.devilCap ?? null : null };
    let aceAt16 = !!encounter && !round.low && encounter.ability === 'deadeye24' && room.players[BOT_ID].lives <= 1 && canUseTavernAbility(room, encounter, 'deadeye24') && !room.tavernRun.clearEyeArmed;
    let toLock = enemyId === 'molar' ? Rules.planBotLocks(turn, enemyId, toBeat) : Strategy.bestKeeps(turn.dice, toBeat, { aceAt16, ...round });
    // A Tavern Crawl opponent who can no longer win or tie the round doesn't play it out: they
    // keep everything left at once and end the turn.
    let conceding = tavernRoundLost(turn, toBeat, aceAt16, round);
    if (conceding) toLock = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).map(d => d.id);

    // Lock the dice one after another, and only then decide what next. (Separate timers for
    // each lock and the check could fire out of order on a busy server, and a check that ran
    // before the locks found nothing to roll and stopped the bot for good.)
    let lockFrom = i => {
        if (i < toLock.length) {
            performToggle(roomCode, toLock[i]);
            botLater(roomCode, key, conceding ? 120 : 400, () => lockFrom(i + 1));
        } else {
            botLater(roomCode, key, 800, afterLocking);
        }
    };
    let afterLocking = () => {
        if (!turn.finalized) {
            // What they just had to keep may have put the round out of reach: then keep the
            // rest now rather than throw again.
            if (!conceding && tavernRoundLost(turn, toBeat, aceAt16, round)) {
                conceding = true;
                toLock = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).map(d => d.id);
                lockFrom(0);
                return;
            }
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

// The current opponent's ability still has uses left this fight.
function encounterAbilityLeft(room) {
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    return encounter && encounter.ability && getAbilityUseCount(room, encounter.ability) < BALANCE.abilityUses[encounter.ability];
}

// The opponent uses their ability: one use is spent, and it happens unless a Clear-Eye Thonic
// is waiting, which cancels it instead. Returns true if the ability goes ahead.
function fireTavernAbility(roomCode, room, encounter, abilityId) {
    if (!canUseTavernAbility(room, encounter, abilityId)) return false;
    markAbilityUsed(room, abilityId);
    if (!room.tavernRun.clearEyeArmed) return true;
    room.tavernRun.clearEyeArmed = false;
    io.to(roomCode).emit('thonicUsed', { id: 'clearEye', name: THONICS.clearEye.name, text: `${Rules.ABILITY_NAMES[abilityId]} is cancelled` });
    return false;
}

function canUseTavernAbility(room, encounter, abilityId) {
    let abilityReady = (room.tavernRun.encounterRound || 1) >= (room.tavernRun.abilityRound || 1);
    return encounter && encounter.ability === abilityId && abilityReady && getAbilityUseCount(room, abilityId) < BALANCE.abilityUses[abilityId];
}

// ends: this round ended a Tavern Crawl fight (or the run); the browser skips the pop-up then,
// since the fight summary (or the run-over screen) takes its place.
function emitRoundLifeResult(roomCode, room, lifeLosers, tiedPlayers = [], ends = false) {
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
    io.to(roomCode).emit('roundResult', { message, ends });
}

function getHumanPlayerId(room) {
    return room.playerOrder.find(id => id !== BOT_ID && room.players[id]);
}

// For testing a particular opponent: TAVERN_START_ENCOUNTER=1 starts runs at Frak, 5 at Klarg, etc.
const TAVERN_START_ENCOUNTER = Math.max(0, Math.min(8, parseInt(process.env.TAVERN_START_ENCOUNTER, 10) || 0));

function createTavernRun() {
    return {
        encounterIndex: TAVERN_START_ENCOUNTER,
        keepsakes: [],
        pendingKeepsakeChoices: null,
        purse: 0,
        shelf: [],
        shop: null,
        interlude: null,   // between fights: { stage, ... } (see startInterlude)
        lastWin: null,     // the fight just won: { defeated, nextEnemy, place, gold: { win, hearts, heartsLeft, perHeart, perPlace }, at }
        nextFightHearts: null, // the next fight starts on other than full hearts (the Stranger's price, the Lady's Favour)
        nextFightSurge: null, // the hot tub's dice surge for the next fight, then tubSurge during it
        tubSurge: null,
        ladysGrace: false,     // the Lady's Grace: the next dust that would cost a heart doesn't
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
    room.startingLives = BALANCE.playerHearts;

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
        // The hot tub's surge lasts this one fight.
        room.tavernRun.tubSurge = room.tavernRun.nextFightSurge || null;
        room.tavernRun.nextFightSurge = null;
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
    room.tavernRun.clearEyeArmed = false;
    room.tavernRun.started = true;
    beginTavernRound(roomCode, room);
}

// ---- Round effects ----
// Some abilities change a whole round. They're decided as the round begins (beginTavernRound)
// and kept in tavernRun.roundEffect = { kind, by, ability, as?, landed? }:
//   mind   Mind Whip: on the player's first throw Frak makes them keep a random die (Rules.mindWhip)
//   curse  You are Cursed: the lowest valid score wins the round (dust still loses)
//   devil  Sympathy for the Devil: `by` throws three 6s first (and, if devilCap is set, the other side can't score above it)
// `by` is 'opponent', or 'player' when Martha's mask puts the disguise on you. `as`: whose face
// Martha (or the mask) wears.
const ROUND_ABILITIES = { mindWhip: 'mind', cursed: 'curse', devil: 'devil' };
const DISGUISES = [
    { ability: 'mindWhip', as: 'Frak' },
    { ability: 'cursed', as: 'Danhausen' },
    { ability: 'devil', as: 'Duke Morrigan' }
];

function roundEffectMove(room, effect, text) {
    let humanId = getHumanPlayerId(room);
    let name = effect.by === 'player' ? (humanId ? room.players[humanId].name : 'You') : TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name;
    return { name, ability: Rules.ABILITY_NAMES[effect.ability], text: effect.as && effect.by === 'opponent' ? `In ${effect.as}'s face. ${text}` : text, disguise: effect.as || null };
}

const ROUND_EFFECT_TEXT = {
    curse: { opponent: 'This round the lowest valid score wins.', player: 'This round the lowest valid score wins.' },
    devil: { opponent: 'Three 6s for them.', player: 'Three 6s for you.' }
};

function beginTavernRound(roomCode, room) {
    let run = room.tavernRun;
    run.roundEffect = null;
    run.pendingDevil = null;
    let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
    if (!encounter || !encounter.ability) return;
    let disguise = encounter.ability === 'disguises' ? DISGUISES[crypto.randomInt(0, DISGUISES.length)] : null;
    let ability = disguise ? disguise.ability : encounter.ability;
    if (!ROUND_ABILITIES[ability] || !canUseTavernAbility(room, encounter, encounter.ability)) return;
    // The Devil waits for the Duke's 2 and 4 (applyTavernRollAbilities); it's spent only then.
    if (ability === 'devil') { run.pendingDevil = { as: disguise ? disguise.as : null }; return; }
    if (!fireTavernAbility(roomCode, room, encounter, encounter.ability)) return;
    run.roundEffect = { kind: ROUND_ABILITIES[ability], by: 'opponent', ability, as: disguise ? disguise.as : null };
    // Mind Whip shows when it lands; the Curse and the Devil now.
    if (run.roundEffect.kind !== 'mind') io.to(roomCode).emit('signatureMove', roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT[run.roundEffect.kind].opponent));
}

// ---- Saving after the Ghoul and Gourd ----
// The run can be saved at the invitation to the Yawning Portal. The save lives on the player's
// phone, sealed with SAVE_SECRET so it can't be edited; each one opens once (while the server
// runs). Without SAVE_SECRET, saves last only until the server restarts.
const SAVE_SECRET = process.env.SAVE_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SAVE_SECRET && !process.env.GAME_TIME_SCALE) console.log('SAVE_SECRET is not set: saved Tavern Crawl runs last only until the server restarts.');
const SAVE_VERSION = 1;
const openedSaves = new Set();
const keepsakeById = id => (id === MARTHAS_MASK.id ? MARTHAS_MASK : TAVERN_KEEPSAKES.find(k => k.id === id));

function sealSave(room, name) {
    let run = room.tavernRun;
    let data = {
        v: SAVE_VERSION, id: crypto.randomUUID(), at: Date.now(), name,
        encounterIndex: run.encounterIndex, keepsakes: run.keepsakes.map(k => k.id), purse: run.purse,
        shelf: run.shelf, stats: run.stats, ladysGrace: !!run.ladysGrace, lastWin: run.lastWin
    };
    let body = Buffer.from(JSON.stringify(data)).toString('base64url');
    let sig = crypto.createHmac('sha256', SAVE_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

// The save's contents, or null if it isn't one of ours, was changed or was opened already.
function openSave(text) {
    if (typeof text !== 'string' || text.length > 20000) return null;
    let [body, sig] = text.split('.');
    if (!body || !sig) return null;
    let expected = crypto.createHmac('sha256', SAVE_SECRET).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let data;
    try { data = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
    if (!data || data.v !== SAVE_VERSION || openedSaves.has(data.id)) return null;
    if (!Number.isInteger(data.encounterIndex) || data.encounterIndex < 0 || data.encounterIndex >= TAVERN_ENCOUNTERS.length) return null;
    openedSaves.add(data.id);
    return data;
}

function restoreRun(room, data) {
    let run = room.tavernRun;
    run.encounterIndex = data.encounterIndex;
    run.keepsakes = (data.keepsakes || []).map(keepsakeById).filter(Boolean);
    run.purse = Math.max(0, Number(data.purse) || 0);
    run.shelf = (data.shelf || []).filter(id => THONICS[id]).slice(0, SHELF_SIZE + KEEPSAKE_NUMBERS.beltSlots);
    run.stats = { ...run.stats, ...(data.stats || {}) };
    run.ladysGrace = !!data.ladysGrace;
    run.lastWin = data.lastWin ? { ...data.lastWin, resumed: true } : null; // its summary was shown before the save
}

// The invitation to the final: Martha's mask is yours; go on now, or save and come back.
function invitation(room, name) {
    return { stage: 'invitation', place: placeOf(room).name, save: sealSave(room, name) };
}

// ---- Between fights ----
// After a win the run pauses in `tavernRun.interlude` until the player moves on:
// Each walk is one event: the pickpocket strikes, or the Hooded Stranger finds you, or two
// spots catch your eye and you go to one of them (or neither). Then on to the next fight.
//   pickpocket  { steal, roll? }         roll one die: pickpocketCatch or more catches him,
//                                        else he gets away with `steal`; then the next fight
//   choose      { spots: [a, b] }        two spots from the place's list; Thom opens the cart
//   shrine      {}                       light a candle ('pray'): the Lady grants a blessing at random
//   diceDen     { bets, bet?, throws }   bet one of them (or decline), then the player rolls
//                                        two dice and the gambler two; a tie rolls again
//   stranger    { offers, hearts }       a random event, while he has keepsakes left: take one
//                                        (next fight on `hearts`) or turn him down
//   done        { spot, ... }            what happened, until the player moves on

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

// Two different spots; the Dice Den only if the purse covers its smallest bet. With Thom's
// Loyalty Card, his cart is always one of them.
function pickSpots(room) {
    let canBet = room.tavernRun.purse >= Math.min(...INTERLUDE.diceDenBets);
    let spots = shuffled(placeOf(room).spots.filter(id => id !== 'diceDen' || canBet)).slice(0, 2);
    if (hasKeepsake(room, 'loyaltyCard') && !spots.includes('thom')) spots[crypto.randomInt(0, 2)] = 'thom';
    return spots;
}

// The Hooded Stranger, with keepsakes you don't have yet.
function strangerOffer(room) {
    let offers = shuffled(unownedKeepsakes(room)).slice(0, INTERLUDE.strangerOffers);
    return { stage: 'stranger', offers, hearts: INTERLUDE.strangerHearts };
}

function startInterlude(room, won) {
    let run = room.tavernRun;
    run.lastWin = won;
    let steal = Math.floor(run.purse * INTERLUDE.pickpocketShare);
    if (steal > 0 && crypto.randomInt(0, 100) < INTERLUDE.pickpocketChance) {
        run.interlude = { stage: 'pickpocket', steal, catchOn: INTERLUDE.pickpocketCatch };
    } else if (unownedKeepsakes(room).length > 0 && crypto.randomInt(0, 100) < INTERLUDE.strangerChance) {
        run.interlude = strangerOffer(room);
    } else if ((placeOf(room).events || []).includes('darren') && crypto.randomInt(0, 100) < INTERLUDE.darrenChance) {
        run.interlude = { stage: 'darren', smashOn: INTERLUDE.darrenSmash, giftOn: INTERLUDE.darrenGift };
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

// Darren Snakehands knocks into you: one die. Low, a Thonic on your shelf smashes (or you pay
// for the glass); middling, a free Thonic by way of sorry; high, a Thonic and gold.
function darrenOutcome(room, roll) {
    let run = room.tavernRun;
    let freeThonic = () => {
        if (run.shelf.length >= shelfSizeOf(room)) return { gold: changePurse(run, INTERLUDE.darrenFullShelfGold) };
        let id = shuffled(placeOf(room).thomStock)[0];
        run.shelf.push(id);
        return { thonic: thonicView(id) };
    };
    if (roll <= INTERLUDE.darrenSmash) {
        if (run.shelf.length) {
            let [smashed] = run.shelf.splice(crypto.randomInt(0, run.shelf.length), 1);
            return { outcome: 'smash', smashed: thonicView(smashed) };
        }
        return { outcome: 'smash', paid: -changePurse(run, -INTERLUDE.darrenGlass) };
    }
    if (roll <= INTERLUDE.darrenGift) return { outcome: 'gift', ...freeThonic() };
    let gift = freeThonic();
    return { outcome: 'catch', ...gift, gold: (gift.gold || 0) + changePurse(run, INTERLUDE.darrenCatchGold) };
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

    let roundPlayers = [humanId, enemyId].filter(id => room.players[id]);
    let busted = roundPlayers.filter(id => room.players[id].busted);
    busted.forEach(id => losersThisRound.push({ id, reason: 'Dust!' }));

    // The Devil's round: the side that didn't play it counts no more than the cap (also when
    // the mask was worn after the opponent had already played). A cursed round: the highest
    // valid score loses.
    let effect = room.tavernRun.roundEffect;
    if (BALANCE.devilCap != null && effect && effect.kind === 'devil') {
        let capped = room.players[effect.by === 'player' ? enemyId : humanId];
        if (!capped.busted) capped.score = Math.min(capped.score, BALANCE.devilCap);
    }
    let cursed = !!effect && effect.kind === 'curse';
    let valid = roundPlayers.filter(id => !room.players[id].busted);
    if (valid.length > 1) {
        let scores = valid.map(id => room.players[id].score);
        let worst = cursed ? Math.max(...scores) : Math.min(...scores);
        let losing = valid.filter(id => room.players[id].score === worst);
        if (losing.length === 1) {
            losersThisRound.push({ id: losing[0], reason: cursed ? 'Highest score in a cursed round.' : 'Lowest score at the table.' });
        } else {
            tiedPlayers = losing;
        }
    }
    room.tavernRun.roundEffect = null;

    if (losersThisRound.length === 1 && losersThisRound[0].id === humanId && !human.busted && !enemy.busted && hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion && Math.abs(human.score - enemy.score) === 1) {
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

        if (loser.id === humanId && human.busted && room.tavernRun.ladysGrace) {
            room.tavernRun.ladysGrace = false;
            io.to(roomCode).emit('blessingUsed', { id: 'grace', name: "The Lady's Grace", text: 'The Lady saves you from the dust' });
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

    emitRoundLifeResult(roomCode, room, lifeLosersThisRound, tiedPlayers, human.lives <= 0 || enemy.lives <= 0);

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
            io.to(roomCode).emit('gameOver', { message: `${human.name} wins the final at the Yawning Portal! From peasant to king, every 2, 4, 24 player will know this run.\n\n${scoreSummary.lines.join('\n')}`, tavern: getTavernOverSummary(room, human.name, scoreSummary, true) });
            return;
        }

        // What the fight paid, for the summary the browser shows before the next event (at: shown once).
        let won = {
            defeated: enemy.name,
            nextEnemy: TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name,
            place: room.tavernRun.encounterIndex,
            gold: { win: winGold, hearts: heartGold, heartsLeft: Math.max(0, human.lives), perHeart: GOLD.perHeartLeft, perPlace: GOLD.winPerPlace },
            at: Date.now()
        };
        if (TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex - 1].boss) {
            // Martha's mask is the invitation to the final (no events on the way there).
            if (!hasKeepsake(room, MARTHAS_MASK.id)) room.tavernRun.keepsakes.push(MARTHAS_MASK);
            won.mask = MARTHAS_MASK;
            room.tavernRun.lastWin = won;
            room.tavernRun.interlude = invitation(room, human.name);
        } else {
            // Between fights: one event (see startInterlude).
            startInterlude(room, won);
        }
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
    beginTavernRound(roomCode, room);
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

        // A saved run (from the invitation to the final) carries on at a fresh table: back at the
        // invitation, with a fresh save in case they leave again.
        let fresh = room.mode === 'tavern-crawl' && !room.tavernRun.started;
        let resumed = fresh && data.resume ? openSave(data.resume) : null;
        if (fresh && data.resume && !resumed) socket.emit('resumeFailed');
        if (resumed) {
            restoreRun(room, resumed);
            room.players[socket.id].name = asText(resumed.name).substring(0, 15) || room.players[socket.id].name;
        }

        if (room.mode === 'tavern-crawl' && !room.tavernRun.started) {
            resetTavernEncounter(roomCode, false);
        }
        if (resumed) {
            room.tavernRun.interlude = invitation(room, room.players[socket.id].name);
            room.roundPlayers = [];
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

    // Martha's mask: once a fight, before you roll, wear Danhausen's Curse or the Duke's Devil
    // for the round (not in a round that already has one).
    socket.on('wearMask', (kind) => {
        let room = tavernPlayer();
        if (!room || (kind !== 'curse' && kind !== 'devil') || !isMyTurn() || !isTurnPlayable(socket.roomCode)) return;
        let run = room.tavernRun;
        if (!hasKeepsake(room, MARTHAS_MASK.id) || run.encounterKeepsakeUses.marthasMask || room.turn.hasRolled || run.roundEffect) return;
        run.roundEffect = kind === 'curse'
            ? { kind, by: 'player', ability: 'cursed', as: 'Danhausen' }
            : { kind, by: 'player', ability: 'devil', as: 'Duke Morrigan' };
        emitKeepsakeActivated(socket.roomCode, room, MARTHAS_MASK.id, `You wear ${run.roundEffect.as}'s face. ${ROUND_EFFECT_TEXT[kind].player}`);
        io.to(socket.roomCode).emit('signatureMove', roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT[kind].player));
        emitState(socket.roomCode);
    });

    socket.on('buyThonic', (thonicId) => {
        let room = tavernPlayer();
        if (!room || !room.tavernRun.shop) return;
        let run = room.tavernRun;
        if (typeof thonicId !== 'string' || !run.shop.stock.includes(thonicId) || !THONICS[thonicId]) return;
        let price = run.shop.free ? 0 : THONICS[thonicId].price;
        if (run.purse < price || run.shelf.length >= shelfSizeOf(room)) return;
        run.shop.free = false;
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

    // 'roll' once, to try to catch him; then 'on' to the next fight (he is the walk's one event).
    socket.on('pickpocket', (action) => {
        let room = interludeAt('pickpocket');
        if (!room) return;
        let run = room.tavernRun, interlude = run.interlude;
        if (action === 'roll' && !interlude.roll) {
            interlude.roll = rollFace();
            interlude.caught = interlude.roll >= INTERLUDE.pickpocketCatch;
            interlude.lost = interlude.caught ? 0 : -changePurse(run, -interlude.steal);
        } else if (action === 'on' && interlude.roll) {
            moveOnToNextFight(socket.roomCode);
            return;
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    // The Wild Magic Hot Tub: 'soak' once, and the wild magic surges (free).
    socket.on('hotTub', (action) => {
        let room = interludeAt('hotTub');
        if (!room || action !== 'soak') return;
        let run = room.tavernRun;
        let surge = pickHotTubSurge();
        if (surge === 'pruney') run.nextFightHearts = Math.max(1, (run.nextFightHearts || BALANCE.playerHearts) - 1);
        else run.nextFightSurge = surge;
        run.interlude = { stage: 'done', spot: 'hotTub', surge: { id: surge, die: HOT_TUB_DIE, ...HOT_TUB_SURGES[surge] }, hearts: surge === 'pruney' ? run.nextFightHearts : undefined };
        emitState(socket.roomCode);
    });

    // Darren Snakehands: 'roll' once; then 'on' to the next fight (he is the walk's one event).
    socket.on('darren', (action) => {
        let room = interludeAt('darren');
        if (!room) return;
        let interlude = room.tavernRun.interlude;
        if (action === 'roll' && !interlude.roll) {
            interlude.roll = rollFace();
            Object.assign(interlude, darrenOutcome(room, interlude.roll));
        } else if (action === 'on' && interlude.roll) {
            moveOnToNextFight(socket.roomCode);
            return;
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    // After a random event (the thief, the Hooded Stranger, Darren) the walk goes on: two spots
    // catch your eye (the user's call, 21 Oct; before, the event was the whole walk). 'on' at the
    // event still goes straight to the next fight.
    socket.on('lookAround', () => {
        let room = tavernPlayer();
        let interlude = room && room.tavernRun.interlude;
        if (!interlude) return;
        let finished = ((interlude.stage === 'pickpocket' || interlude.stage === 'darren') && interlude.roll)
            || (interlude.stage === 'done' && interlude.spot === 'stranger');
        if (!finished) return;
        room.tavernRun.interlude = { stage: 'choose', spots: pickSpots(room), after: interlude.stage === 'done' ? 'stranger' : interlude.stage };
        emitState(socket.roomCode);
    });

    socket.on('chooseSpot', (spot) => {
        let room = interludeAt('choose');
        if (!room || typeof spot !== 'string' || !room.tavernRun.interlude.spots.includes(spot)) return;
        let run = room.tavernRun;
        if (spot === 'thom') {
            run.interlude = null;
            // Thom's Loyalty Card: the first Thonic of the visit is free.
            run.shop = { stock: pickThomStock(placeOf(room)), free: hasKeepsake(room, 'loyaltyCard') };
        } else if (spot === 'shrine') {
            run.interlude = { stage: 'shrine' };
        } else if (spot === 'diceDen') {
            run.interlude = { stage: 'diceDen', bets: INTERLUDE.diceDenBets, bet: null, throws: [] };
        } else if (spot === 'hotTub') {
            run.interlude = { stage: 'hotTub' };
        }
        emitState(socket.roomCode);
    });

    // The Shrine to the Lady: light a candle and she grants a blessing, at random:
    //   favour  the next fight starts with an extra heart
    //   grace   the next dust that would cost a heart doesn't (kept until it's needed)
    // Grace isn't given twice: carrying one already, it's her Favour.
    socket.on('shrinePick', (action) => {
        let room = interludeAt('shrine');
        if (!room || action !== 'pray') return;
        let run = room.tavernRun;
        let gift = INTERLUDE.shrineGifts[crypto.randomInt(0, INTERLUDE.shrineGifts.length)];
        if (gift === 'grace' && run.ladysGrace) gift = 'favour';
        // Her Favour adds to what the next fight would start on (after the Stranger's price, too).
        if (gift === 'favour') run.nextFightHearts = (run.nextFightHearts || BALANCE.playerHearts) + INTERLUDE.favourHearts;
        else run.ladysGrace = true;
        run.interlude = { stage: 'done', spot: 'shrine', gift, hearts: gift === 'favour' ? run.nextFightHearts : undefined };
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
            // The Potion Belt comes with a Thonic, in its new slot.
            if (keepsake.id === 'potionBelt' && run.shelf.length < shelfSizeOf(room)) run.shelf.push(KEEPSAKE_NUMBERS.beltThonic);
            run.nextFightHearts = INTERLUDE.strangerHearts;
            run.interlude = { stage: 'done', spot: 'stranger', keepsake, hearts: INTERLUDE.strangerHearts };
        }
        emitState(socket.roomCode);
    });

    // Drinking, always on your own turn. When exactly, and what it does, depends on the
    // Thonic; anything not allowed right now changes nothing and the Thonic stays on the shelf.
    //   healing         before you roll, once you've lost a heart: +1 heart
    //   clearEye        before you roll, against an opponent with an ability left: it waits and
    //                   cancels that ability the next time it is used (this fight)
    //   fizzy           after a roll that left active 1s: those dice roll again
    //   secondThoughts  after a roll, naming a kept die (dieId): it goes back into play
    //   steady          any time in your turn: a dust hand this turn scores its dice as they lie
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
            if (turn.hasRolled || run.clearEyeArmed || !encounterAbilityLeft(room)) return;
            run.clearEyeArmed = true;
            text = `${encounter.name}'s next ${Rules.ABILITY_NAMES[encounter.ability]} will be cancelled`;
        } else if (thonicId === 'fizzy') {
            rerolled = Rules.rerollOnes(turn, rollFaceFor(room, turn));
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
            io.to(roomCode).emit('diceRolled', { turn: Rules.viewTurn(turn), preRollCallout: null, suspense: Rules.SUSPENSE.NONE, devil: false, animationMs, throwSeed: crypto.randomInt(0, 2 ** 31), rerolled, twin: turn.twinRoll || undefined });
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

module.exports = { start, http, io, rooms, emitState, pickSpots, startInterlude, strangerOffer, rollFaceFor, sealSave, openSave, beginTavernRound, resetTavernEncounter, TAVERN_ENCOUNTERS };
