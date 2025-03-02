const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { setupRoutes } = require('./routes');
const { setupSocket } = require('./sockets');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Add this line to handle JSON requests

setupRoutes(app, io);
setupSocket(io);

server.listen(3000, () => {
  console.log('listening on *:3000');
});
