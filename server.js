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
let currentTurnIndex = 0;
let isMusicPlaying = false; 

function evaluateRound() {
    let activePlayers = playerOrder.filter(id => players[id].lives > 0);
    let validPlayers = activePlayers.filter(id => !players[id].busted);
    
    let lowestScore = -1;
    if (validPlayers.length > 1) {
        let scores = validPlayers.map(id => players[id].score);
        lowestScore = Math.min(...scores);
    }

    activePlayers.forEach(id => {
        let p = players[id];
        let lostLife = false;
        let reason = '';

        if (p.busted) {
            p.lives -= 1;
            lostLife = true;
            reason = 'You busted!';
        } else if (validPlayers.length > 1 && p.score === lowestScore) {
            p.lives -= 1;
            lostLife = true;
            reason = 'You had the lowest score!';
        }

        if (lostLife) {
            io.to(id).emit('roundResult', { message: `You lost a life! 💔\n${reason}` });
        } else {
            io.to(id).emit('roundResult', { message: 'Safe for another round! 🛡️\nGreat job.' });
        }
        
        p.score = null;
        p.busted = false;
    });

    let survivors = playerOrder.filter(id => players[id].lives > 0);
    if (survivors.length <= 1) {
        let winnerName = survivors.length === 1 ? players[survivors[0]].name : "No one";
        io.emit('gameOver', { message: `Game Over! ${winnerName} wins the game! 🏆` });
    } else {
        currentTurnIndex = 0;
        while(players[playerOrder[currentTurnIndex]].lives <= 0) currentTurnIndex++;
        io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] });
    }
}

io.on('connection', (socket) => {
    let pName = 'Joining...';
    players[socket.id] = { id: socket.id, name: pName, lives: 3, score: null, busted: false };
    playerOrder.push(socket.id);

    if (isMusicPlaying) {
        socket.emit('playGlobalMusic');
    }

    io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] });

    socket.on('startGlobalMusic', () => {
        if (!isMusicPlaying) {
            isMusicPlaying = true;
            io.emit('playGlobalMusic'); 
        }
    });

    socket.on('setPlayerName', (chosenName) => {
        if (players[socket.id]) {
            let finalName = chosenName.trim();
            if (finalName === "") finalName = "Mysterious Traveler";
            if (finalName.length > 15) finalName = finalName.substring(0, 15);
            players[socket.id].name = finalName;
            io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] });
        }
    });

    socket.on('sendReaction', (emoji) => {
        let playerName = players[socket.id] ? players[socket.id].name : "Pirate";
        io.emit('receiveReaction', { name: playerName, emoji: emoji });
    });

    // NEW: Listen for a suspenseful roll and tell everyone else to shake their screens!
    socket.on('triggerShake', () => {
        socket.broadcast.emit('triggerShake');
    });

    socket.on('updateBoard', (gameData) => {
        if (socket.id === playerOrder[currentTurnIndex]) {
            socket.broadcast.emit('boardUpdated', gameData);
        }
    });

    socket.on('broadcastMessage', (msgData) => {
        socket.broadcast.emit('displayMessage', msgData);
    });

    socket.on('endTurn', (turnData) => {
        if (socket.id === playerOrder[currentTurnIndex]) {
            players[socket.id].score = turnData.score;
            players[socket.id].busted = turnData.busted;
            
            do {
                currentTurnIndex++;
            } while (currentTurnIndex < playerOrder.length && players[playerOrder[currentTurnIndex]].lives <= 0);

            if (currentTurnIndex >= playerOrder.length) {
                evaluateRound();
            } else {
                io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] });
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        playerOrder = playerOrder.filter(id => id !== socket.id);
        if (playerOrder.length > 0 && currentTurnIndex >= playerOrder.length) currentTurnIndex = 0;
        io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] ? playerOrder[currentTurnIndex] : null });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
