const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { setupRoutes } = require('./routes');
const { setupSocket } = require('./sockets');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Add this line to handle JSON requests

// Log all requests (helpful for debugging)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

setupRoutes(app, io);
setupSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});