const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path'); 

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

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
        intro: 'Klarg, bugbear paladin of questionable table manners, may steal one active die with Reach Around.'
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
        intro: 'The Hangman keeps one round in the chamber. Once per match, a strong hand can become a perfect 24.'
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
        name: 'Bent Copper Coin',
        text: 'Once per encounter, the first life you would lose is ignored.'
    },
    {
        id: 'blessedTankard',
        name: 'Blessed Tankard',
        text: 'A perfect 24 restores one extra life.'
    },
    {
        id: 'luckySeat',
        name: 'Lucky Seat',
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
    },
    {
        id: 'markedCoaster',
        name: 'Marked Coaster',
        text: 'Once per encounter, your first score of 21 or higher cannot be reduced below 20.'
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
        runComplete: room.tavernRun.runComplete
    };
}

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
    io.to(roomCode).emit('keepsakeActivated', {
        name: keepsake.name,
        text: text || keepsake.text
    });
}

function getHumanPlayerId(room) {
    return room.playerOrder.find(id => id !== 'BOT_MOLAR' && room.players[id]);
}

function createTavernRun() {
    return {
        encounterIndex: 0,
        keepsakes: [],
        pendingKeepsakeChoices: null,
        abilityUsed: {},
        encounterKeepsakeUses: {},
        started: false,
        runComplete: false
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
    room.players['BOT_MOLAR'] = {
        id: 'BOT_MOLAR',
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
        room.playerOrder = [humanId, 'BOT_MOLAR'];
        room.roundPlayers = [humanId, 'BOT_MOLAR'];
    } else {
        room.playerOrder = ['BOT_MOLAR'];
        room.roundPlayers = ['BOT_MOLAR'];
    }

    room.currentTurnIndex = 0;
    room.isTieBreaker = false;
    room.dealerIndex = 0;
    room.tavernRun.pendingKeepsakeChoices = null;
    room.tavernRun.abilityUsed = {};
    room.tavernRun.encounterKeepsakeUses = {};
    room.tavernRun.started = true;
}

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

    room.roundPlayers.forEach(id => {
        if (!room.players[id]) return;
        let loserInfo = losersThisRound.find(l => l.id === id);
        if (loserInfo) {
            io.to(id).emit('roundResult', { message: `You lost a life! 💔\n${loserInfo.reason}` });
        } else if (tiedPlayers.includes(id)) {
            io.to(id).emit('roundResult', { message: `It's a TIE! ⚔️\nPrepare for a sudden death tie-breaker!` });
        } else {
            io.to(id).emit('roundResult', { message: `Safe! 🛡️\nYou survived the round.` });
        }
    });

    let humanLost = losersThisRound.some(l => l.id !== 'BOT_MOLAR');
    if (room.players['BOT_MOLAR'] && humanLost) {
        setTimeout(() => {
            for(let i=0; i<3; i++) {
                setTimeout(() => {
                    io.to(roomCode).emit('receiveReaction', { name: "The Molar", emoji: "😉" });
                }, i * 300);
            }
        }, 1000); 
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
        // Fixed: Ensure the final UI state is synced before ending the game
        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        io.to(roomCode).emit('gameOver', { message: `Game Over! ${winnerName} wins the table! 🏆` });
        room.roundPlayers = []; 
    } else if (tiedPlayers.length > 1) {
        room.isTieBreaker = true;
        room.roundNumber++; 
        room.roundPlayers = tiedPlayers;
        room.currentTurnIndex = 0;
        
        while(room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
            room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
            room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
            room.currentTurnIndex++;
        }

        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        io.to(roomCode).emit('displayMessage', { text: `⚔️ SUDDEN DEATH TIE-BREAKER! ⚔️`, color: "#ffcc80" });
        
        if(room.currentTurnIndex >= room.roundPlayers.length) evaluateRound(roomCode);
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
        
        while(room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
            room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
            room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
            room.currentTurnIndex++;
        }

        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        if(room.currentTurnIndex >= room.roundPlayers.length && room.roundPlayers.length > 0) evaluateRound(roomCode);
    }
}

function evaluateTavernRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    let humanId = getHumanPlayerId(room);
    let enemyId = 'BOT_MOLAR';
    if (!humanId || !room.players[humanId] || !room.players[enemyId]) return;

    let human = room.players[humanId];
    let enemy = room.players[enemyId];
    let losersThisRound = [];
    let tiedPlayers = [];

    if (human.busted && hasKeepsake(room, 'steadyHand') && !room.tavernRun.encounterKeepsakeUses.steadyHand) {
        human.busted = false;
        human.score = 0;
        room.tavernRun.encounterKeepsakeUses.steadyHand = true;
        emitKeepsakeActivated(roomCode, room, 'steadyHand', 'Steady Hand catches the dice. Dust becomes 0.');
        io.to(roomCode).emit('displayMessage', { text: 'Steady Hand catches the dice. Dust becomes 0.', color: '#aed581' });
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
        losersThisRound.push({ id: enemyId, reason: 'Lucky Seat breaks the tie your way.' });
        emitKeepsakeActivated(roomCode, room, 'luckySeat', 'Lucky Seat breaks the tie your way.');
        io.to(roomCode).emit('displayMessage', { text: 'Lucky Seat breaks the tie your way.', color: '#ffd54f' });
    }

    losersThisRound.forEach(loser => {
        let player = room.players[loser.id];
        if (!player) return;

        if (loser.id === humanId && hasKeepsake(room, 'bentCopper') && !room.tavernRun.encounterKeepsakeUses.bentCopper) {
            room.tavernRun.encounterKeepsakeUses.bentCopper = true;
            emitKeepsakeActivated(roomCode, room, 'bentCopper', 'Bent Copper Coin catches the loss.');
            io.to(humanId).emit('roundResult', { message: `Bent Copper Coin catches the loss.\n${loser.reason}` });
            return;
        }

        player.lives -= 1;
        io.to(loser.id).emit('roundResult', { message: `You lost a life!\n${loser.reason}` });
    });

    roundPlayers.forEach(id => {
        if (!room.players[id]) return;
        if (losersThisRound.some(l => l.id === id)) return;
        if (tiedPlayers.includes(id)) {
            io.to(id).emit('roundResult', { message: `It's a TIE!\nThe table demands another roll.` });
        } else {
            io.to(id).emit('roundResult', { message: `Safe!\nYou survived the round.` });
        }
    });

    roundPlayers.forEach(id => {
        if (!room.players[id]) return;
        room.players[id].score = null;
        room.players[id].busted = false;
    });

    if (human.lives <= 0) {
        let reached = room.tavernRun.encounterIndex + 1;
        room.roundPlayers = [];
        room.tavernRun.runComplete = true;
        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        io.to(roomCode).emit('gameOver', { message: `Game Over\n\nYou reached encounter ${reached} of ${TAVERN_ENCOUNTERS.length} before falling at ${enemy.name}'s table.\n\nWill you ever master the game?` });
        return;
    }

    if (enemy.lives <= 0) {
        room.tavernRun.encounterIndex++;
        if (room.tavernRun.encounterIndex >= TAVERN_ENCOUNTERS.length) {
            room.roundPlayers = [];
            room.tavernRun.runComplete = true;
            io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
            io.to(roomCode).emit('gameOver', { message: `${human.name} wins the House Table! From peasant to king, every 2, 4, 24 player will know this run.` });
            return;
        }

        room.tavernRun.pendingKeepsakeChoices = pickKeepsakeChoices(room);
        room.roundPlayers = [];
        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        io.to(roomCode).emit('offerKeepsakes', {
            defeated: enemy.name,
            nextEnemy: TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name,
            choices: room.tavernRun.pendingKeepsakeChoices
        });
        return;
    }

    room.roundNumber++;
    room.isTieBreaker = tiedPlayers.length > 1;
    room.roundPlayers = [humanId, enemyId];
    room.currentTurnIndex = 0;
    io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
}

io.on('connection', (socket) => {
    
    socket.on('checkRoom', (roomCode) => {
        let code = roomCode.trim().toUpperCase() || "PUBLIC";
        let exists = rooms[code] ? true : false;
        socket.emit('roomStatus', { exists: exists });
    });

    socket.on('joinTavern', (data) => {
        let roomCode = data.roomCode.trim().toUpperCase();
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
                startingLives: requestedLives,
                mode: isTavernCrawl ? 'tavern-crawl' : 'classic',
                tavernRun: isTavernCrawl ? createTavernRun() : null
            };
            
            if (roomCode.startsWith("COMP")) {
                rooms[roomCode].players['BOT_MOLAR'] = { 
                    id: 'BOT_MOLAR', token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: requestedLives, score: null, busted: false, connected: true 
                };
                rooms[roomCode].playerOrder.push('BOT_MOLAR');
                rooms[roomCode].roundPlayers.push('BOT_MOLAR');
            } else if (isTavernCrawl) {
                rooms[roomCode].players['BOT_MOLAR'] = {
                    id: 'BOT_MOLAR', token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: 2, score: null, busted: false, connected: true
                };
                rooms[roomCode].playerOrder.push('BOT_MOLAR');
                rooms[roomCode].roundPlayers.push('BOT_MOLAR');
            }
        }
        
        let room = rooms[roomCode];
        let finalName = data.name.trim();
        if (finalName === "") finalName = "Mysterious Traveler";
        if (finalName.length > 15) finalName = finalName.substring(0, 15);

        let existingPlayerId = Object.keys(room.players).find(id => room.players[id].token === data.token);

        if (existingPlayerId && existingPlayerId !== 'BOT_MOLAR') {
            let p = room.players[existingPlayerId];
            p.id = socket.id;
            p.avatar = data.avatar;
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
            
        } else {
            room.players[socket.id] = { 
                id: socket.id, token: data.token, name: finalName, avatar: data.avatar, lives: room.startingLives, score: null, busted: false, connected: true 
            };
            room.playerOrder.push(socket.id);

            if (!room.isTieBreaker) {
                if (!room.roundPlayers.includes(socket.id)) room.roundPlayers.push(socket.id);
            }
        }

        let humanPlayers = room.playerOrder.filter(id => id !== 'BOT_MOLAR' && room.players[id] && room.players[id].connected);
        
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

        if (room.roundPlayers.length === 1 && room.roundPlayers[0] !== 'BOT_MOLAR') {
            room.currentTurnIndex = 0;
        }

        if (room.mode === 'tavern-crawl' && !room.tavernRun.started) {
            resetTavernEncounter(roomCode, false);
        }

        if (room.isMusicPlaying) socket.emit('playGlobalMusic');

        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
    });

    socket.on('playAgain', () => {
        let room = rooms[socket.roomCode];
        if (room && room.roundPlayers.length === 0) {
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
                io.to(socket.roomCode).emit('gameStateUpdate', getRoomState(socket.roomCode));
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
            
            io.to(socket.roomCode).emit('gameStateUpdate', getRoomState(socket.roomCode));
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
        if (room) {
            if (room.mode === 'tavern-crawl') return;
            let playerName = room.players[socket.id] ? room.players[socket.id].name : "Traveler";
            io.to(socket.roomCode).emit('receiveReaction', { name: playerName, emoji: emoji });
        }
    });

    socket.on('sendBotReaction', (emoji) => {
        let room = rooms[socket.roomCode];
        if (room && isAuthorized(socket, socket.roomCode)) {
            if (room.mode === 'tavern-crawl') return;
            io.to(socket.roomCode).emit('receiveReaction', { name: "The Molar", emoji: emoji });
        }
    });

    function isAuthorized(socket, roomCode) {
        let room = rooms[roomCode];
        if (!room) return false;
        let currentId = room.roundPlayers[room.currentTurnIndex];
        return (socket.id === currentId) || ((roomCode.startsWith('COMP') || roomCode.startsWith('TVRN')) && currentId === 'BOT_MOLAR');
    }

    socket.on('playerRolledDice', (suspenseType) => { if(isAuthorized(socket, socket.roomCode)) socket.to(socket.roomCode).emit('playerRolledDice', suspenseType) });
    socket.on('playGameSound', (soundId) => { if(isAuthorized(socket, socket.roomCode)) socket.to(socket.roomCode).emit('playGameSound', soundId) });
    socket.on('triggerConfetti', () => { if(isAuthorized(socket, socket.roomCode)) socket.to(socket.roomCode).emit('triggerConfetti') });
    socket.on('triggerDevilEffect', () => { if(isAuthorized(socket, socket.roomCode)) socket.to(socket.roomCode).emit('triggerDevilEffect') });
    
    socket.on('updateBoard', (gameData) => {
        if (isAuthorized(socket, socket.roomCode)) {
            socket.to(socket.roomCode).emit('boardUpdated', gameData);
        }
    });

    socket.on('broadcastMessage', (msgData) => {
        if (isAuthorized(socket, socket.roomCode)) {
            socket.to(socket.roomCode).emit('displayMessage', msgData);
        }
    });

    socket.on('useEnemyAbility', (abilityId) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl') return;
        let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
        if (encounter && encounter.ability === abilityId && !room.tavernRun.abilityUsed[abilityId]) {
            room.tavernRun.abilityUsed[abilityId] = true;
            io.to(socket.roomCode).emit('gameStateUpdate', getRoomState(socket.roomCode));
        }
    });

    socket.on('chooseKeepsake', (keepsakeId) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl' || !room.tavernRun.pendingKeepsakeChoices) return;
        let selected = room.tavernRun.pendingKeepsakeChoices.find(k => k.id === keepsakeId);
        if (!selected) return;

        room.tavernRun.keepsakes.push(selected);
        resetTavernEncounter(socket.roomCode, true);
        io.to(socket.roomCode).emit('gameStateUpdate', getRoomState(socket.roomCode));
        io.to(socket.roomCode).emit('displayMessage', { text: selected.name, color: "#ffd54f" });
    });

    socket.on('endTurn', (turnData) => {
        let room = rooms[socket.roomCode];
        if (room && isAuthorized(socket, socket.roomCode)) {
            let currentId = room.roundPlayers[room.currentTurnIndex];
            
            room.players[currentId].score = turnData.score;
            room.players[currentId].busted = turnData.busted;

            if (room.mode === 'tavern-crawl') {
                let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
                if (encounter && encounter.ability === 'deadeye24' && currentId === 'BOT_MOLAR' && !room.tavernRun.abilityUsed.deadeye24 && !turnData.busted && turnData.score >= 18 && turnData.score < 24) {
                    room.players[currentId].score = 24;
                    room.tavernRun.abilityUsed.deadeye24 = true;
                    io.to(socket.roomCode).emit('signatureMove', { name: encounter.name, ability: 'Deadeye 24', text: 'The Hangman fires once. Perfect 24.' });
                    io.to(socket.roomCode).emit('displayMessage', { text: 'The Hangman fires once. Deadeye 24.', color: "#ffd54f" });
                }

                if (encounter && encounter.ability === 'smoothTalk' && currentId !== 'BOT_MOLAR' && !room.tavernRun.abilityUsed.smoothTalk && !turnData.busted && turnData.score > 0) {
                    let reducedScore = Math.max(0, turnData.score - 3);
                    if (hasKeepsake(room, 'markedCoaster') && !room.tavernRun.encounterKeepsakeUses.markedCoaster && turnData.score >= 21) {
                        reducedScore = Math.max(20, reducedScore);
                        room.tavernRun.encounterKeepsakeUses.markedCoaster = true;
                        emitKeepsakeActivated(socket.roomCode, room, 'markedCoaster', 'Marked Coaster keeps the score respectable.');
                    }
                    room.players[currentId].score = reducedScore;
                    room.tavernRun.abilityUsed.smoothTalk = true;
                    io.to(socket.roomCode).emit('signatureMove', { name: encounter.name, ability: 'Smooth Talk', text: 'Jaguar smiles and worsens your finished hand.' });
                    io.to(socket.roomCode).emit('displayMessage', { text: 'Jaguar smiles. Smooth Talk knocks 3 from your finished hand.', color: "#ffb74d" });
                }
            }
            
            if (room.players[currentId].score === 24 && room.players[currentId].lives < room.startingLives) {
                let restoredLives = (room.mode === 'tavern-crawl' && currentId !== 'BOT_MOLAR' && hasKeepsake(room, 'blessedTankard')) ? 2 : 1;
                room.players[currentId].lives = Math.min(room.startingLives, room.players[currentId].lives + restoredLives);
                if (restoredLives > 1) emitKeepsakeActivated(socket.roomCode, room, 'blessedTankard', 'Blessed Tankard restores an extra life.');
                io.to(socket.roomCode).emit('displayMessage', { text: `+${restoredLives} Life Restored!`, color: "#aed581" });
            }

            room.currentTurnIndex++;
            
            while(room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
                room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
                room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
                room.currentTurnIndex++;
            }

            if (room.currentTurnIndex >= room.roundPlayers.length) {
                evaluateRound(socket.roomCode);
            } else {
                io.to(socket.roomCode).emit('gameStateUpdate', getRoomState(socket.roomCode));
            }
        }
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
                    room.currentTurnIndex++;
                    
                    while(room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
                        room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
                        room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
                        room.currentTurnIndex++;
                    }

                    if (room.currentTurnIndex >= room.roundPlayers.length) evaluateRound(roomCode);
                    else io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
                } else {
                    io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
                }
            }
            
            let anyConnected = Object.values(room.players).some(p => p.connected && p.id !== 'BOT_MOLAR');
            if (!anyConnected) delete rooms[roomCode];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
