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
        startingLives: room.startingLives // Pass the room's setting to clients
    };
}

function evaluateRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    let losersThisRound = [];
    let tiedPlayers = [];

    let busted = room.roundPlayers.filter(id => room.players[id] && room.players[id].busted);
    busted.forEach(id => {
        room.players[id].lives -= 1;
        losersThisRound.push({ id, reason: 'You busted!' });
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

    room.roundPlayers.forEach(id => {
        if (room.players[id]) {
            room.players[id].score = null;
            room.players[id].busted = false;
        }
    });

    let survivors = room.playerOrder.filter(id => room.players[id] && room.players[id].lives > 0);
    if (survivors.length <= 1) {
        let winnerName = survivors.length === 1 ? room.players[survivors[0]].name : "No one";
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

io.on('connection', (socket) => {
    
    socket.on('joinTavern', (data) => {
        let roomCode = data.roomCode.trim().toUpperCase();
        if (roomCode === "") roomCode = "PUBLIC"; 
        if (roomCode.length > 10) roomCode = roomCode.substring(0, 10);
        
        socket.roomCode = roomCode;
        socket.join(roomCode);

        // Limit lives to 1-5
        let requestedLives = parseInt(data.startingLives) || 3;
        requestedLives = Math.max(1, Math.min(5, requestedLives));

        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: {}, playerOrder: [], roundPlayers: [], currentTurnIndex: 0, isTieBreaker: false, isMusicPlaying: false, dealerIndex: 0, roundNumber: 1,
                startingLives: requestedLives // First player sets the rules!
            };
        }
        
        let room = rooms[roomCode];
        let finalName = data.name.trim();
        if (finalName === "") finalName = "Mysterious Traveler";
        if (finalName.length > 15) finalName = finalName.substring(0, 15);

        let existingPlayerId = Object.keys(room.players).find(id => room.players[id].token === data.token);

        if (existingPlayerId) {
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

        if (room.roundPlayers.length === 0 && room.playerOrder.length > 0) {
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

        if (room.roundPlayers.length === 1) room.currentTurnIndex = 0;
        if (room.isMusicPlaying) socket.emit('playGlobalMusic');

        io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
    });

    // NEW: Play Again logic to reset the board
    socket.on('playAgain', () => {
        let room = rooms[socket.roomCode];
        // Only allow a reset if the game is actually over
        if (room && room.roundPlayers.length === 0) {
            room.playerOrder.forEach(id => {
                if (room.players[id]) {
                    room.players[id].lives = room.startingLives;
                    room.players[id].score = null;
                    room.players[id].busted = false;
                }
            });
            
            // Advance the dealer button for the new game!
            if (room.playerOrder.length > 0) {
                room.dealerIndex = (room.dealerIndex + 1) % room.playerOrder.length;
            }
            
            // Rebuild round order
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
            io.to(socket.roomCode).emit('displayMessage', { text: `A new game begins!`, color: "#aed581" });
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
            let playerName = room.players[socket.id] ? room.players[socket.id].name : "Traveler";
            io.to(socket.roomCode).emit('receiveReaction', { name: playerName, emoji: emoji });
        }
    });

    socket.on('playerRolledDice', (suspenseType) => socket.to(socket.roomCode).emit('playerRolledDice', suspenseType));
    socket.on('playGameSound', (soundId) => socket.to(socket.roomCode).emit('playGameSound', soundId));
    socket.on('triggerConfetti', () => socket.to(socket.roomCode).emit('triggerConfetti'));
    socket.on('triggerDevilEffect', () => socket.to(socket.roomCode).emit('triggerDevilEffect'));
    
    socket.on('updateBoard', (gameData) => {
        let room = rooms[socket.roomCode];
        if (room && socket.id === room.roundPlayers[room.currentTurnIndex]) {
            socket.to(socket.roomCode).emit('boardUpdated', gameData);
        }
    });

    socket.on('broadcastMessage', (msgData) => {
        socket.to(socket.roomCode).emit('displayMessage', msgData);
    });

    socket.on('endTurn', (turnData) => {
        let room = rooms[socket.roomCode];
        if (room && socket.id === room.roundPlayers[room.currentTurnIndex]) {
            room.players[socket.id].score = turnData.score;
            room.players[socket.id].busted = turnData.busted;
            
            // Limit +1 life restores to whatever the host chose as max
            if (turnData.score === 24 && room.players[socket.id].lives < room.startingLives) {
                room.players[socket.id].lives += 1;
                io.to(socket.roomCode).emit('displayMessage', { text: `✨ +1 Life Restored! ✨`, color: "#aed581" });
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
            
            let anyConnected = Object.values(room.players).some(p => p.connected);
            if (!anyConnected) delete rooms[roomCode];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
