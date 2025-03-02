const path = require('path');
const { generateRoomId, createRoom, roomStates } = require('./roomLogic');

function setupRoutes(app, io) {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.post('/create-room', (req, res) => {
    const { gameType, maxPlayers, publiclyListed, password } = req.body;
    const roomId = createRoom({ gameType, maxPlayers, publiclyListed, password });
    res.json({ roomId });
  });

  app.get('/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = roomStates[roomId];
    
    if (room) {
      // Serve the appropriate room template based on game type
      if (room.gameType === 'euchre') {
        res.sendFile(path.join(__dirname, 'public', 'euchre-room.html'));
      } else {
        res.sendFile(path.join(__dirname, 'public', 'room.html'));
      }
    } else {
      res.sendFile(path.join(__dirname, 'public', 'room.html'));
    }
  });
}

module.exports = { setupRoutes };