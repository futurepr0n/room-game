const { roomStates } = require('./roomLogic');

function startGame(io, roomId) {
  const room = roomStates[roomId];
  if (!room) return;

  room.gameActive = true;
  room.roundCount = 0;
  room.playerWins = {};
  room.playerRolls = {};
  room.currentRoundRolls = {};
  room.previousRoundRolls = {};

  for (const playerId of room.players) {
    room.playerWins[playerId] = 0;
    room.playerRolls[playerId] = 0;
  }

  io.to(roomId).emit('startGame', room);
}

function rollDice(io, socket, roll) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];
  if (!room || !room.gameActive) return;

  room.playerRolls[socket.id] = roll;
  room.currentRoundRolls[socket.id] = { playerName: room.playerNames[socket.id], roll };

  io.to(roomId).emit('updateCurrentRoundRolls', room.currentRoundRolls);

  // Logic to determine the end of the round and update scores

  // If all players have rolled
  if (Object.keys(room.currentRoundRolls).length === room.seatedPlayers.length) {
    // Determine the winner for the round and update scores
    let maxRoll = -1;
    let roundWinner = null;
    for (const playerId in room.currentRoundRolls) {
      if (room.currentRoundRolls[playerId].roll > maxRoll) {
        maxRoll = room.currentRoundRolls[playerId].roll;
        roundWinner = playerId;
      }
    }
    if (roundWinner) {
      room.playerWins[roundWinner]++;
    }

    room.previousRoundRolls = room.currentRoundRolls;
    room.currentRoundRolls = {};

    io.to(roomId).emit('updatePreviousRoundRolls', room.previousRoundRolls);
    io.to(roomId).emit('updateScores', room.playerWins);
  }
}

module.exports = {
  startGame,
  rollDice,
};