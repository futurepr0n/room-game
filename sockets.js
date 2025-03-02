const { handleJoinRoom, handleSitAtTable, handleStandFromTable, handleDisconnect, getActiveRooms, createRoom } = require('./roomLogic');
const { startGame, rollDice } = require('./gameLogic');
const { startEuchreGame, handleEuchreBid, handleEuchrePlayCard } = require('./euchreLogic');

function setupSocket(io) {
  io.on('connection', (socket) => {
    socket.emit('updateActiveRooms', getActiveRooms());

    socket.on('createRoom', (data) => {
      const roomId = createRoom(data);
      socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (data) => handleJoinRoom(io, socket, data));
    socket.on('sitAtTable', (seatNumber) => handleSitAtTable(io, socket, seatNumber));
    socket.on('standFromTable', () => handleStandFromTable(io, socket));
    socket.on('disconnect', () => handleDisconnect(io, socket));

    // Generic game starter
    socket.on('startGame', () => {
      const roomId = socket.roomId;
      const room = roomStates[roomId];
      
      if (room) {
        // Launch the appropriate game based on type
        switch(room.gameType) {
          case 'euchre':
            startEuchreGame(io, roomId);
            break;
          default:
            startGame(io, roomId); // Your existing generic game
            break;
        }
      }
    });

    // Generic game events
    socket.on('diceRoll', (roll) => rollDice(io, socket, roll));
    
    // Euchre specific events
    socket.on('euchreBid', (bid) => handleEuchreBid(io, socket, bid));
    socket.on('euchrePlayCard', (cardIndex) => handleEuchrePlayCard(io, socket, cardIndex));
  });
}

module.exports = { setupSocket };