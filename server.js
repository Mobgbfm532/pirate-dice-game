const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path'); 

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {}; 
let playerOrder = []; 
let roundPlayers = []; 
let currentTurnIndex = 0;
let isMusicPlaying = false; 
let isTieBreaker = false; 

function evaluateRound() {
    let losersThisRound = [];
    let tiedPlayers = [];

    let busted = roundPlayers.filter(id => players[id] && players[id].busted);
    busted.forEach(id => {
        players[id].lives -= 1;
        losersThisRound.push({ id, reason: 'You busted!' });
    });

    let valid = roundPlayers.filter(id => players[id] && !players[id].busted);
    if (valid.length > 1) {
        let minScore = Math.min(...valid.map(id => players[id].score));
        let lowest = valid.filter(id => players[id].score === minScore);

        if (lowest.length === 1) {
            players[lowest[0]].lives -= 1;
            losersThisRound.push({ id: lowest[0], reason: 'You had the lowest score!' });
        } else if (lowest.length > 1) {
            tiedPlayers = lowest;
        }
    }

    roundPlayers.forEach(id => {
        if (!players[id]) return;
        let loserInfo = losersThisRound.find(l => l.id === id);
        if (loserInfo) {
            io.to(id).emit('roundResult', { message: `You lost a life! 💔\n${loserInfo.reason}` });
        } else if (tiedPlayers.includes(id)) {
            io.to(id).emit('roundResult', { message: `It's a TIE! ⚔️\nPrepare for a sudden death tie-breaker!` });
        } else {
            io.to(id).emit('roundResult', { message: `Safe! 🛡️\nYou survived the round.` });
        }
    });

    roundPlayers.forEach(id => {
        if (players[id]) {
            players[id].score = null;
            players[id].busted = false;
        }
    });

    let survivors = playerOrder.filter(id => players[id] && players[id].lives > 0);
    if (survivors.length <= 1) {
        let winnerName = survivors.length === 1 ? players[survivors[0]].name : "No one";
        io.emit('gameOver', { message: `Game Over! ${winnerName} wins the game! 🏆` });
        roundPlayers = []; 
    } else if (tiedPlayers.length > 1) {
        isTieBreaker = true;
        roundPlayers = tiedPlayers;
        currentTurnIndex = 0;
        io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
        io.emit('displayMessage', { text: `⚔️ SUDDEN DEATH TIE-BREAKER! ⚔️`, color: "#ffcc80" });
    } else {
        isTieBreaker = false;
        roundPlayers = survivors;
        currentTurnIndex = 0;
        io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
    }
}

io.on('connection', (socket) => {
    // NEW: Added default avatar
    players[socket.id] = { id: socket.id, name: 'Joining...', avatar: '👤', lives: 3, score: null, busted: false };
    playerOrder.push(socket.id);

    if (playerOrder.length === 1) {
        roundPlayers = [socket.id];
    } else if (playerOrder.length === 2 && roundPlayers.length <= 1) {
        roundPlayers = [...playerOrder];
        currentTurnIndex = 0;
    }

    if (isMusicPlaying) {
        socket.emit('playGlobalMusic');
    }

    io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });

    socket.on('startGlobalMusic', () => {
        if (!isMusicPlaying) {
            isMusicPlaying = true;
            io.emit('playGlobalMusic'); 
        }
    });

    // NEW: Handles the new Avatar object sent from the client
    socket.on('setPlayerName', (data) => {
        if (players[socket.id]) {
            let finalName = data.name.trim();
            if (finalName === "") finalName = "Mysterious Traveler";
            if (finalName.length > 15) finalName = finalName.substring(0, 15);
            
            players[socket.id].name = finalName;
            players[socket.id].avatar = data.avatar; // Save the avatar
            
            io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
        }
    });

    socket.on('sendReaction', (emoji) => {
        let playerName = players[socket.id] ? players[socket.id].name : "Pirate";
        io.emit('receiveReaction', { name: playerName, emoji: emoji });
    });

    socket.on('triggerShake', () => {
        socket.broadcast.emit('triggerShake');
    });

    socket.on('updateBoard', (gameData) => {
        if (socket.id === roundPlayers[currentTurnIndex]) {
            socket.broadcast.emit('boardUpdated', gameData);
        }
    });

    socket.on('broadcastMessage', (msgData) => {
        socket.broadcast.emit('displayMessage', msgData);
    });

    socket.on('endTurn', (turnData) => {
        if (socket.id === roundPlayers[currentTurnIndex]) {
            players[socket.id].score = turnData.score;
            players[socket.id].busted = turnData.busted;
            
            currentTurnIndex++;
            if (currentTurnIndex >= roundPlayers.length) {
                evaluateRound();
            } else {
                io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        playerOrder = playerOrder.filter(id => id !== socket.id);
        
        let wasTheirTurn = (roundPlayers[currentTurnIndex] === socket.id);
        roundPlayers = roundPlayers.filter(id => id !== socket.id);

        if (roundPlayers.length > 0) {
            if (wasTheirTurn) {
                if (currentTurnIndex >= roundPlayers.length) {
                    evaluateRound();
                } else {
                    io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
                }
            } else {
                if (currentTurnIndex >= roundPlayers.length) currentTurnIndex = 0;
                io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: roundPlayers[currentTurnIndex], isTieBreaker });
            }
        } else {
            currentTurnIndex = 0;
            io.emit('gameStateUpdate', { players, playerOrder, roundPlayers, currentTurnId: null, isTieBreaker });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
