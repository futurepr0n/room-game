const { handleJoinRoom, handleSitAtTable, handleStandFromTable, handleDisconnect, getActiveRooms, createRoom, roomStates } = require('./roomLogic');
const { startGame, rollDice } = require('./gameLogic');
const { startEuchreGame, handleEuchreBid, handleEuchrePlayCard } = require('./euchreLogic');

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Send updated active rooms immediately on connection
    io.emit('updateActiveRooms', getActiveRooms());

    socket.on('createRoom', (data) => {
      const roomId = createRoom(data);
      socket.emit('roomCreated', roomId);
      // Update active rooms for all clients after creating a new room
      io.emit('updateActiveRooms', getActiveRooms());
    });

    socket.on('joinRoom', (data) => {
      handleJoinRoom(io, socket, data);
      // Make sure the roomId is attached to the socket
      socket.roomId = data.roomId;
      // Update active rooms after a player joins
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('sitAtTable', (seatNumber) => {
      handleSitAtTable(io, socket, seatNumber);
      // Update active rooms after seat changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('standFromTable', () => {
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
      const room = roomStates[roomId];
      
      if (room) {
        console.log(`Starting game of type ${room.gameType} in room ${roomId}`);
        
        // Launch the appropriate game based on type
        switch(room.gameType) {
          case 'euchre':
            // No need to call fillEmptySeatsWithCPUs here, it's handled inside startEuchreGame
            startEuchreGame(io, roomId);
            break;
          default:
            startGame(io, roomId);
            break;
        }
        
        // Update active rooms to reflect game status
        io.emit('updateActiveRooms', getActiveRooms());
      }
    });

    // Generic game events
    socket.on('diceRoll', (roll) => {
      rollDice(io, socket, roll);
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    // Euchre specific events
    socket.on('euchreBid', (bid) => {
      handleEuchreBid(io, socket, bid);
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
    
    socket.on('euchrePlayCard', (cardIndex) => {
      handleEuchrePlayCard(io, socket, cardIndex);
      // Update active rooms after game state changes
      io.emit('updateActiveRooms', getActiveRooms());
    });
  });
}

module.exports = { setupSocket };