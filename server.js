const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {}; 
let playerOrder = []; 
let currentTurnIndex = 0;
let isMusicPlaying = false; // NEW: Track global music state

function evaluateRound() {
    let activePlayers = playerOrder.filter(id => players[id].lives > 0);
    
    // Separate players who busted from those who got valid scores
    let validPlayers = activePlayers.filter(id => !players[id].busted);
    
    // Only find a "lowest score" to punish if more than 1 person survived!
    let lowestScore = -1;
    if (validPlayers.length > 1) {
        let scores = validPlayers.map(id => players[id].score);
        lowestScore = Math.min(...scores);
    }

    activePlayers.forEach(id => {
        let p = players[id];
        let lostLife = false;
        let reason = '';

        // You lose a life IF you busted, OR if multiple people survived and you had the lowest score
        if (p.busted) {
            p.lives -= 1;
            lostLife = true;
            reason = 'You busted!';
        } else if (validPlayers.length > 1 && p.score === lowestScore) {
            p.lives -= 1;
            lostLife = true;
            reason = 'You had the lowest score!';
        }

        // Send the personalized message to the player
        if (lostLife) {
            io.to(id).emit('roundResult', { message: `You lost a life! 💔\n${reason}` });
        } else {
            io.to(id).emit('roundResult', { message: 'Safe for another round! 🛡️\nGreat job.' });
        }
        
        // Reset scores for next round
        p.score = null;
        p.busted = false;
    });

    // Check for Game Over
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
    let pName = 'Player ' + (playerOrder.length + 1);
    players[socket.id] = { id: socket.id, name: pName, lives: 3, score: null, busted: false };
    playerOrder.push(socket.id);

    // If music is already playing for the lobby, tell the new person to play it too
    if (isMusicPlaying) {
        socket.emit('playGlobalMusic');
    }

    io.emit('gameStateUpdate', { players, playerOrder, currentTurnId: playerOrder[currentTurnIndex] });

    // Handle music starting
    socket.on('startGlobalMusic', () => {
        if (!isMusicPlaying) {
            isMusicPlaying = true;
            io.emit('playGlobalMusic'); // Tell everyone to play it
        }
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

// This tells the code to use the Cloud Server's official port, or default to 3000 if testing locally
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });