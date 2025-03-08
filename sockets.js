const { handleSitAtTable, handleStandFromTable, handleDisconnect, getActiveRooms, createRoom, roomStates, updateActiveRooms } = require('./roomLogic');
const { startGame, rollDice } = require('./gameLogic');
const { startEuchreGame, handleEuchreBid, handlePlayCard, checkForCPUTurn, broadcastGameState, getFilteredGameState, handleCPUCardPlay, cpuBid, cpuPlayCard, handleCPUTurns  } = require('./euchreLogic');


function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send updated active rooms immediately on connection
    const rooms = getActiveRooms();
    console.log('Sending active rooms to new connection:', Object.keys(rooms).length);
    socket.emit('updateActiveRooms', rooms);

    socket.on('createRoom', (data) => {
      console.log('Creating room with data:', data);
      const roomId = createRoom(data);
      socket.emit('roomCreated', roomId);
      
      // Update active rooms for all clients after creating a new room
      io.emit('updateActiveRooms', getActiveRooms());
    });

    // Modified joinRoom handler with improved spectator support
    socket.on('joinRoom', (data) => {
      console.log('User joining room:', data.roomId);
      
      const { roomId, playerName, password } = data;
      const room = roomStates[roomId];
      
      if (!room) {
        socket.emit('roomNotFound', { message: 'Room not found' });
        return;
      }

      if (room.password && room.password !== password) {
        socket.emit('wrongPassword', { message: 'Incorrect password' });
        return;
      }

      // Check for space in the room (only count human players against limit)
      const humanPlayers = room.players.filter(id => !id.startsWith('cpu_'));
      if (humanPlayers.length >= room.maxPlayers && !room.players.includes(socket.id)) {
        socket.emit('roomFull', { message: 'The room is full' });
        return;
      }
      
      // Join the socket to the room
      socket.join(roomId);
      socket.roomId = roomId;
      
      // Add player to the room if not already there
      if (!room.players.includes(socket.id)) {
        room.players.push(socket.id);
      }
      
      // Set player name
      room.playerNames[socket.id] = playerName;
      
      // Broadcast room update to all players
      io.to(roomId).emit('updateRoom', room);
      
      // If a game is in progress, send the current game state to this player
      if (room.gameActive) {
        if (room.gameType === 'euchre' && room.euchre) {
          console.log('Sending euchre game state to new player:', socket.id);
          
          try {
            // Use a safer approach with error handling
            if (typeof getFilteredGameState === 'function') {
              socket.emit('euchreGameState', {
                gameState: getFilteredGameState(room.euchre, room),
                roomState: room
              });
            } else {
              // Fallback if function is not available
              console.log('getFilteredGameState not available, using broadcastGameState instead');
              broadcastGameState(io, roomId);
            }
          } catch (error) {
            console.error('Error sending game state to new player:', error);
            // Fallback to just sending room update
            socket.emit('updateRoom', room);
          }
        } else {
          // For other game types
          socket.emit('updateRoom', room);
        }
      }
      
      // Update active rooms after a player joins
      updateActiveRooms();
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('sitAtTable', (seatNumber) => {
      console.log('User sitting at seat:', seatNumber, 'in room:', socket.roomId);
      handleSitAtTable(io, socket, seatNumber);
      
      // Update active rooms after seat changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('standFromTable', () => {
      console.log('User standing from table in room:', socket.roomId);
      handleStandFromTable(io, socket);
      
      // Update active rooms after seat changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      handleDisconnect(io, socket);
      
      // Update active rooms after disconnection
      io.emit('updateActiveRooms', getActiveRooms());
    });

    // Generic game starter
    socket.on('startGame', () => {
      const roomId = socket.roomId;
      console.log('User attempting to start game in room:', roomId);
      
      const room = roomStates[roomId];
      
      if (room) {
        console.log(`Starting game of type ${room.gameType} in room ${roomId}`);
        
        // Make sure we have all 4 seats filled before starting the game
        ensureAllSeatsAreFilled(roomId);
        
        // Launch the appropriate game based on type
        switch(room.gameType) {
          case 'euchre':
            startEuchreGame(io, roomId);
            break;
          default:
            startGame(io, roomId);
            break;
        }
        
        // Mark the room as active
        room.gameActive = true;
        
        // Update active rooms immediately to reflect game status
        updateActiveRooms();
        io.emit('updateActiveRooms', getActiveRooms());
      } else {
        console.log('Room not found for starting game:', roomId);
      }
    });
    
    // Helper function to ensure all seats are filled - keeping your original implementation
    function ensureAllSeatsAreFilled(roomId) {
      const room = roomStates[roomId];
      if (!room) return;
      
      console.log('Checking seats before game start:', roomId);
      
      // Get occupied seat numbers
      const occupiedSeats = Object.keys(room.playerSeats).map(Number);
      console.log('Currently occupied seats:', occupiedSeats);
      
      // Fill empty seats with CPU players
      let seatsAdded = false;
      for (let seatNum = 1; seatNum <= 4; seatNum++) {
        if (!occupiedSeats.includes(seatNum)) {
          const cpuId = `cpu_${roomId}_${seatNum}`;
          const cpuName = `CPU ${seatNum}`;
          
          console.log(`Adding CPU to seat ${seatNum}: ${cpuId}`);
          
          // Add CPU to the room
          if (!room.players.includes(cpuId)) {
            room.players.push(cpuId);
          }
          
          if (!room.seatedPlayers.includes(cpuId)) {
            room.seatedPlayers.push(cpuId);
          }
          
          room.playerNames[cpuId] = cpuName;
          room.playerSeats[seatNum] = cpuId;
          
          // Assign to appropriate team
          if (!room.teams) {
            room.teams = { 1: [], 2: [] };
          }
          
          if (seatNum === 1 || seatNum === 3) {
            // Add to team 1 if not already there
            if (!room.teams[1].includes(cpuId)) {
              room.teams[1].push(cpuId);
            }
          } else {
            // Add to team 2 if not already there
            if (!room.teams[2].includes(cpuId)) {
              room.teams[2].push(cpuId);
            }
          }
          
          seatsAdded = true;
        }
      }
      
      if (seatsAdded) {
        // Notify all clients of the updated room state
        io.to(roomId).emit('updateRoom', room);
      }
      
      console.log('Seats after filling:', Object.keys(room.playerSeats).map(Number));
    }

    // Generic game events
    socket.on('diceRoll', (roll) => {
      rollDice(io, socket, roll);
      
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    // Euchre specific events with improved handling
    socket.on('euchreBid', (bid) => {
      console.log('Received euchre bid from', socket.id, 'bid:', bid);
      handleEuchreBid(io, socket, bid);
      
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('euchrePlayCard', (cardIndex) => {
      console.log('Received euchre card play from', socket.id, 'card index:', cardIndex);
      
      // Use the backward compatibility alias we defined
      const { handleEuchrePlayCard } = require('./euchreLogic');
      handleEuchrePlayCard(io, socket, cardIndex);
      
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
  });
}

module.exports = { setupSocket };