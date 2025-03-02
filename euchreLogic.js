// euchreLogic.js
const { roomStates } = require('./roomLogic');

function initializeEuchreGame(roomId) {
  const room = roomStates[roomId];
  if (!room) return;

  // Initialize Euchre-specific state
  room.euchre = {
    deck: [],
    hands: {}, // Player hands
    turnUpCard: null,
    trumpSuit: null,
    dealerPosition: 3,
    currentTrick: [],
    currentPlayer: null,
    trickWinner: null,
    tricksWon: {},
    teamScores: [0, 0], // [Team1, Team2]
    maker: null,
    gamePhase: 'idle', // idle, bidding1, bidding2, playing, gameover
    bidsMade: 0
  };

  return room.euchre;
}

// euchreLogic.js - add this function to handle CPU moves
function handleCPUTurns(io, roomId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  // Check if it's a CPU's turn
  const currentPlayerId = euchreState.currentPlayer;
  if (!currentPlayerId || !currentPlayerId.startsWith('cpu_')) return;
  
  // Delay the CPU move to make it feel more natural
  setTimeout(() => {
    // Handle different game phases
    if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
      cpuBid(io, roomId, currentPlayerId);
    } else if (euchreState.gamePhase === 'playing') {
      cpuPlayCard(io, roomId, currentPlayerId);
    }
  }, 1500);
}

// CPU bidding logic
function cpuBid(io, roomId, cpuId) {
  const room = roomStates[roomId];
  const euchreState = room.euchre;
  
  // Simple bidding logic
  if (euchreState.gamePhase === 'bidding1') {
    // 30% chance to bid in first round
    if (Math.random() < 0.3) {
      // Order up
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'orderUp', suit: euchreState.turnUpCard.suit });
    } else {
      // Pass
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'pass' });
    }
  } else if (euchreState.gamePhase === 'bidding2') {
    // 40% chance to bid in second round
    if (Math.random() < 0.4) {
      // Select a random suit that isn't the turn-up suit
      const availableSuits = ['hearts', 'diamonds', 'clubs', 'spades'].filter(s => s !== euchreState.turnUpCard.suit);
      const selectedSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
      
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'callSuit', suit: selectedSuit });
    } else {
      // Pass
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'pass' });
    }
  }
}

// CPU card playing logic
function cpuPlayCard(io, roomId, cpuId) {
  const room = roomStates[roomId];
  const euchreState = room.euchre;
  
  // Play a random valid card
  const hand = euchreState.hands[cpuId];
  if (!hand || hand.length === 0) return;
  
  // For simplicity, just play the first card (you could implement more complex logic later)
  const cardIndex = 0;
  
  handleEuchrePlayCard(io, { id: cpuId, roomId }, cardIndex);
}

// Add this to your handleEuchreBid and handleEuchrePlayCard functions
// At the end, check if next player is CPU and trigger their move
function checkForCPUTurn(io, roomId) {
  handleCPUTurns(io, roomId);
}

function fillEmptySeatsWithCPUs(roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  // Get occupied seat numbers
  const occupiedSeats = Object.keys(room.playerSeats).map(Number);
  
  // Fill empty seats with CPU players
  for (let seatNum = 1; seatNum <= 4; seatNum++) {
    if (!occupiedSeats.includes(seatNum)) {
      const cpuId = `cpu_${roomId}_${seatNum}`;
      const cpuName = `CPU ${seatNum}`;
      
      // Add CPU to the room
      room.players.push(cpuId);
      room.seatedPlayers.push(cpuId);
      room.playerNames[cpuId] = cpuName;
      room.playerSeats[seatNum] = cpuId;
      
      // Assign to appropriate team
      if (!room.teams) {
        room.teams = { 1: [], 2: [] };
      }
      
      if (seatNum === 1 || seatNum === 3) {
        room.teams[1].push(cpuId);
      } else {
        room.teams[2].push(cpuId);
      }
    }
  }
}

function startEuchreGame(io, roomId) {
  const room = roomStates[roomId];
  if (!room || room.gameType !== 'euchre') return;

  fillEmptySeatsWithCPUs(roomId);

  room.gameActive = true;
  
  // Reset the Euchre game state
  const euchreState = initializeEuchreGame(roomId);
  
  // Create and shuffle deck
  createDeck(euchreState);
  shuffleDeck(euchreState);
  
  // Deal cards
  dealCards(euchreState, room);
  
  // Start bidding
  startBidding(euchreState, room);
  
  // Emit the initial game state to all players
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room
  });
}

function getFilteredGameState(euchreState, room) {
  // Create a copy of the game state that doesn't expose other players' cards
  const filteredState = JSON.parse(JSON.stringify(euchreState));
  
  // We'll handle the per-player filtering on the client side
  // by including a marker of which player is viewing
  
  return filteredState;
}

// Add the core Euchre functions (createDeck, shuffleDeck, etc.)
function createDeck(euchreState) {
  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
  
  euchreState.deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      euchreState.deck.push({rank, suit});
    });
  });
}

function shuffleDeck(euchreState) {
  for (let i = euchreState.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [euchreState.deck[i], euchreState.deck[j]] = [euchreState.deck[j], euchreState.deck[i]];
  }
}

function dealCards(euchreState, room) {
  // Initialize player hands
  for (const playerId of room.seatedPlayers) {
    euchreState.hands[playerId] = [];
    euchreState.tricksWon[playerId] = 0;
  }
  
  // Deal 5 cards to each player in the standard Euchre pattern
  const dealPattern = [[3, 2], [2, 3], [3, 2], [2, 3]];
  let cardIndex = 0;
  
  for (let pattern = 0; pattern < 2; pattern++) {
    for (let i = 0; i < 4; i++) {
      const playerIndex = (euchreState.dealerPosition + 1 + i) % 4;
      const playerId = room.seatedPlayers[playerIndex];
      if (!playerId) continue; // Skip if no player in this seat
      
      const cardsThisRound = dealPattern[i][pattern];
      
      for (let j = 0; j < cardsThisRound; j++) {
        if (cardIndex < euchreState.deck.length) {
          euchreState.hands[playerId].push(euchreState.deck[cardIndex]);
          cardIndex++;
        }
      }
    }
  }
  
  // Turn up next card
  if (cardIndex < euchreState.deck.length) {
    euchreState.turnUpCard = euchreState.deck[cardIndex];
  }
}

function startBidding(euchreState, room) {
  euchreState.gamePhase = 'bidding1';
  euchreState.bidsMade = 0;
  
  // First player after dealer starts bidding
  const starterIndex = (euchreState.dealerPosition + 1) % 4;
  euchreState.currentPlayer = room.seatedPlayers[starterIndex];
}

function handleEuchreBid(io, socket, bid) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') return;
  
  const euchreState = room.euchre;
  if (!euchreState || euchreState.currentPlayer !== socket.id) return;
  
  // Process the bid based on the game phase
  // Implementation details would go here...
  
  // Example: Update game state and emit to clients
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room 
  });
  checkForCPUTurn(io, roomId);
}

function handleEuchrePlayCard(io, socket, cardIndex) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') return;
  
  const euchreState = room.euchre;
  if (!euchreState || euchreState.currentPlayer !== socket.id || euchreState.gamePhase !== 'playing') return;
  
  // Process the card play
  // Implementation details would go here...
  
  // Example: Update game state and emit to clients
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room 
  });
  checkForCPUTurn(io, roomId);
}

module.exports = {
  startEuchreGame,
  handleEuchreBid,
  handleEuchrePlayCard
};