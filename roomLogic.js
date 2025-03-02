const roomStates = {};
const activeRooms = {};
const MAX_SEATS_PER_ROOM = 4;

function generateRoomId(length = 5) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createRoom({ gameType, maxPlayers, publiclyListed, password }) {
  const roomId = generateRoomId();
  roomStates[roomId] = {
    gameType,
    maxPlayers: parseInt(maxPlayers),
    publiclyListed,
    password,
    players: [],
    seatedPlayers: [],
    playerNames: {},
    playerSeats: {},
    currentPlayer: null,
    roundCount: 0,
    playerWins: {},
    playerRolls: {},
    currentRoundRolls: {},
    previousRoundRolls: {},
  };
  return roomId;
}

function getActiveRooms() {
  for (const roomId in roomStates) {
    const room = roomStates[roomId];
    const playersCount = room.players.length;
    const seatedCount = Object.keys(room.playerSeats).length;
    activeRooms[roomId] = {
      roomStatus: `Players: ${playersCount}/${room.maxPlayers}`,
      tableStatus: `Seats: ${seatedCount}/${MAX_SEATS_PER_ROOM}`,
      gameType: room.gameType,
      publiclyListed: room.publiclyListed,
    };
  }
  return activeRooms;
}

function handleJoinRoom(io, socket, data) {
  const { roomId, playerName, password } = data;
  const room = roomStates[roomId];

  if (room.password && room.password !== password) {
    socket.emit('wrongPassword', { message: 'Incorrect password' });
    return;
  }

  if (room.players.length >= room.maxPlayers) {
    socket.emit('roomFull', { message: 'The room is full' });
    return;
  }

  socket.join(roomId);
  socket.roomId = roomId;
  room.players.push(socket.id);
  room.playerNames[socket.id] = playerName;

  io.to(roomId).emit('updateRoom', room);
  io.emit('updateActiveRooms', getActiveRooms());
}

function handleSitAtTable(io, socket, seatNumber) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];

  if (room && !room.playerSeats[seatNumber] && !Object.values(room.playerSeats).includes(socket.id)) {
    room.seatedPlayers.push(socket.id);
    room.playerSeats[seatNumber] = socket.id;

    if (!room.currentPlayer) {
      room.currentPlayer = socket.id;
    }
    
    // For Euchre, track team assignments (diagonal seats are on the same team)
    if (room.gameType === 'euchre') {
      // If this isn't already set up, initialize it
      if (!room.teams) {
        room.teams = { 1: [], 2: [] };
      }
      
      // Assign players to teams (seats 1&3 = team 1, seats 2&4 = team 2)
      if (seatNumber === '1' || seatNumber === '3') {
        room.teams[1].push(socket.id);
      } else if (seatNumber === '2' || seatNumber === '4') {
        room.teams[2].push(socket.id);
      }
    }

    io.to(roomId).emit('updateRoom', room);
    io.emit('updateActiveRooms', getActiveRooms());
  }
}

function handleStandFromTable(io, socket) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];

  if (room) {
    for (const seatNumber in room.playerSeats) {
      if (room.playerSeats[seatNumber] === socket.id) {
        delete room.playerSeats[seatNumber];
        room.seatedPlayers.splice(room.seatedPlayers.indexOf(socket.id), 1);

        if (room.currentPlayer === socket.id) {
          room.currentPlayer = room.seatedPlayers[0];
        }

        io.to(roomId).emit('updateRoom', room);
        io.emit('updateActiveRooms', getActiveRooms());
        break;
      }
    }
  }
}

function handleDisconnect(io, socket) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];
  if (room) {
    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1);
      delete room.playerNames[socket.id];
      delete room.playerWins[socket.id];
      delete room.playerRolls[socket.id];
      delete room.currentRoundRolls[socket.id];
      delete room.previousRoundRolls[socket.id];
    }

    for (const seatNumber in room.playerSeats) {
      if (room.playerSeats[seatNumber] === socket.id) {
        delete room.playerSeats[seatNumber];
        room.seatedPlayers.splice(room.seatedPlayers.indexOf(socket.id), 1);
        break;
      }
    }

    if (room.currentPlayer === socket.id) {
      room.currentPlayer = room.seatedPlayers[0];
    }
    io.to(roomId).emit('updateRoom', room);
    if (room.players.length === 0) {
      delete roomStates[roomId];
      delete activeRooms[roomId];
    }
    io.emit('updateActiveRooms', getActiveRooms());
  }
}

module.exports = {
  roomStates,
  generateRoomId,
  createRoom,
  handleJoinRoom,
  handleSitAtTable,
  handleStandFromTable,
  handleDisconnect,
  getActiveRooms,
};
