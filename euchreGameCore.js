/**
 * Euchre Game Core
 * Contains core game functionality: initialization, dealing, bidding, and state management
 */

const { roomStates, updateActiveRooms } = require('./roomLogic');
const { getEffectiveSuit, getLeftBowerSuit } = require('./euchreCardUtils');

// Initialize a new Euchre game for a room
function initializeEuchreGame(roomId) {
  const room = roomStates[roomId];
  if (!room) return null;
  
  // Store the roomId directly in the room object for easy reference
  room.roomId = roomId;

  // Initialize Euchre-specific state
  room.euchre = {
    deck: [],
    hands: {}, // Player hands
    turnUpCard: null,
    trumpSuit: null,
    dealerPosition: 0, // Start with first seated player as dealer
    currentTrick: [],
    currentPlayer: null,
    trickWinner: null,
    tricksWon: {},
    teamScores: [0, 0], // [Team1, Team2]
    teamTricks: [0, 0], // [Team1, Team2] tricks in current hand
    maker: null,
    gamePhase: 'idle', // idle, bidding1, bidding2, playing, gameover
    bidsMade: 0,
    leadSuit: null,
    isGoingAlone: false,
    alonePlayer: null,
    roundComplete: false,
    gameLog: [],
    firstPositionId: null, // Track the lead position
    positionIndicators: {} // Object to track position indicators for players
  };

  return room.euchre;
}

// Fill empty seats with CPU players
function fillEmptySeatsWithCPUs(roomId) {
  const room = roomStates[roomId];
  if (!room) return null;
  
  console.log('Filling empty seats with CPUs for room:', roomId);
  
  // Get occupied seat numbers
  const occupiedSeats = Object.keys(room.playerSeats).map(Number);
  console.log('Occupied seats:', occupiedSeats);
  
  // Fill empty seats with CPU players
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
      
      // Ensure CPU is assigned to the correct team
      if (!room.teams) {
        room.teams = { 1: [], 2: [] };
      }
      
      // Assign to team based on seat number (1&3 = team 1, 2&4 = team 2)
      if (seatNum === 1 || seatNum === 3) {
        if (!room.teams[1].includes(cpuId)) {
          room.teams[1].push(cpuId);
        }
      } else {
        if (!room.teams[2].includes(cpuId)) {
          room.teams[2].push(cpuId);
        }
      }
    }
  }
  
  return room;
}

// Create a filtered game state for client consumption
function getFilteredGameState(euchreState, room) {
  // Create a deep copy of the game state to avoid modifying the original
  const filteredState = JSON.parse(JSON.stringify(euchreState));
  
  // Add important team information
  filteredState.teams = room.teams;
  
  // Ensure all properties exist to avoid client-side errors
  if (!filteredState.hands) filteredState.hands = {};
  if (!filteredState.tricksWon) filteredState.tricksWon = {};
  if (!filteredState.currentTrick) filteredState.currentTrick = [];
  if (!filteredState.gameLog) filteredState.gameLog = [];
  if (!filteredState.teamScores) filteredState.teamScores = [0, 0];
  if (!filteredState.teamTricks) filteredState.teamTricks = [0, 0];
  if (!filteredState.positionIndicators) filteredState.positionIndicators = {};
  
  // Make sure all players in the room have context, not just seated players
  for (const playerId of room.players) {
    // For non-seated players, provide limited visibility
    if (!room.seatedPlayers.includes(playerId)) {
      // Spectators can see public game state
      filteredState.hands[playerId] = [];
    } else {
      // Seated players get their own hand
      if (!filteredState.hands[playerId]) {
        filteredState.hands[playerId] = [];
      }
    }
    
    // Initialize tricks won for each player
    if (!filteredState.tricksWon[playerId]) {
      filteredState.tricksWon[playerId] = 0;
    }
  }
  
  return filteredState;
}

// Broadcast the current game state to all clients in the room
function broadcastGameState(io, roomId) {
  try {
    const room = roomStates[roomId];
    if (!room) {
      console.error('Room not found when broadcasting game state:', roomId);
      return;
    }
    
    const euchreState = room.euchre;
    if (!euchreState) {
      console.error('No euchre state when broadcasting:', roomId);
      return;
    }
    
    console.log('Broadcasting game state to all players in room', roomId);
    console.log('Current game phase:', euchreState.gamePhase);
    console.log('Current player:', euchreState.currentPlayer);
    
    // Create the filtered game state
    const filteredState = getFilteredGameState(euchreState, room);
    
    // Add timestamp to help detect stale updates
    filteredState.timestamp = Date.now();
    
    // Construct the message to send
    const gameStateMessage = {
      gameState: filteredState,
      roomState: JSON.parse(JSON.stringify(room))  // Deep copy
    };
    
    // Send to all players in the room
    io.to(roomId).emit('euchreGameState', gameStateMessage);
    
    console.log(`Game state broadcast complete. Timestamp: ${filteredState.timestamp}`);
    
    // Log current phase and player for debugging
    if (euchreState.currentPlayer) {
      console.log(`Current player is ${room.playerNames[euchreState.currentPlayer]} (${euchreState.currentPlayer})`);
    }
  } catch (error) {
    console.error('Error in broadcastGameState:', error);
    console.error(error.stack);
  }

  try {
    // After broadcasting, check if we need to handle CPU turns
    const { checkForCPUTurns } = require('./euchreCPU');
    checkForCPUTurns(io, roomId);
  } catch (error) {
    console.error('Error checking for CPU turns:', error);
  }
}

// Add a message to the game log
function addToGameLog(euchreState, message) {
  if (!euchreState.gameLog) {
    euchreState.gameLog = [];
  }
  
  if (euchreState.gameLog.length > 20) {
    euchreState.gameLog.shift(); // Keep log at reasonable size
  }
  euchreState.gameLog.push(message);
  console.log('Game log:', message);
}

// Create a new deck of cards
function createDeck(euchreState) {
  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
  
  euchreState.deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      euchreState.deck.push({rank, suit});
    });
  });

  console.log('Created deck with', euchreState.deck.length, 'cards');
}

// Shuffle the deck
function shuffleDeck(euchreState) {
  for (let i = euchreState.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [euchreState.deck[i], euchreState.deck[j]] = [euchreState.deck[j], euchreState.deck[i]];
  }
  console.log('Shuffled deck');
}

// Deal cards to players
function dealCards(euchreState, room) {
  // Make sure we have players seated
  if (!room.seatedPlayers || room.seatedPlayers.length === 0) {
    console.log('No seated players to deal to!');
    return;
  }
  
  console.log('Dealing cards to', room.seatedPlayers.length, 'players');
  
  // Initialize player hands and tricks
  for (const playerId of room.seatedPlayers) {
    euchreState.hands[playerId] = [];
    euchreState.tricksWon[playerId] = 0;
  }
  
  // Deal 5 cards to each player in the standard Euchre pattern
  for (let cardNum = 0; cardNum < 5; cardNum++) {
    for (let playerIndex = 0; playerIndex < room.seatedPlayers.length; playerIndex++) {
      const playerId = room.seatedPlayers[(euchreState.dealerPosition + 1 + playerIndex) % room.seatedPlayers.length];
      
      if (cardNum < euchreState.deck.length) {
        euchreState.hands[playerId].push(euchreState.deck.shift());
      }
    }
  }
  
  // Turn up next card for bidding
  if (euchreState.deck.length > 0) {
    euchreState.turnUpCard = euchreState.deck.shift();
    console.log('Turn up card:', euchreState.turnUpCard);
  } else {
    console.log('Not enough cards in deck for turn up card!');
  }
  
  // Log hand sizes
  for (const playerId of room.seatedPlayers) {
    console.log(`Player ${playerId} has ${euchreState.hands[playerId].length} cards`);
  }
}

// Start bidding phase
// Update startBidding function in euchreGameCore.js
function startBidding(euchreState, room) {
  euchreState.gamePhase = 'bidding1';
  euchreState.bidsMade = 0;
  
  console.log('Starting bidding...');
  console.log('Dealer position:', euchreState.dealerPosition);
  
  // Calculate the first bidder seat number
  // Dealer is at position 0-3, but seats are numbered 1-4
  const dealerSeatPosition = euchreState.dealerPosition;
  
  // Get the seat number for the player to the LEFT of the dealer
  // In euchre, play moves clockwise
  let firstSeatNumber;
  // Handle the clockwise movement correctly
  if (dealerSeatPosition === 0) firstSeatNumber = 4; // Dealer is seat 1, first bidder is seat 4
  else if (dealerSeatPosition === 1) firstSeatNumber = 1; // Dealer is seat 2, first bidder is seat 1
  else if (dealerSeatPosition === 2) firstSeatNumber = 2; // Dealer is seat 3, first bidder is seat 2
  else if (dealerSeatPosition === 3) firstSeatNumber = 3; // Dealer is seat 4, first bidder is seat 3
  else firstSeatNumber = 4; // Default fallback
  
  console.log('Dealer seat position (0-3):', dealerSeatPosition);
  console.log('First bidder seat number (1-4):', firstSeatNumber);
  
  // Get the player at the first seat
  const firstPlayerId = room.playerSeats[firstSeatNumber];
  
  if (firstPlayerId) {
    euchreState.currentPlayer = firstPlayerId;
    console.log('Starting bidding, first player:', firstPlayerId, '(', room.playerNames[firstPlayerId], ')');
    
    // Add a log message to the game
    addToGameLog(euchreState, `Bidding begins. ${room.playerNames[firstPlayerId]} goes first.`);
  } else {
    console.error('Could not find player at first seat:', firstSeatNumber);
    // Fallback to using array index method - this should never happen with correct setup
    const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
    euchreState.currentPlayer = room.seatedPlayers[starterIndex];
    console.log('Fallback: Starting player set to:', euchreState.currentPlayer);
  }
}

// Start a new Euchre game
function startEuchreGame(io, roomId) {
  const room = roomStates[roomId];
  if (!room) {
    console.log('Room not found:', roomId);
    return;
  }
  
  console.log('Starting Euchre game for room:', roomId);
  
  // Ensure we have players in all seats BEFORE game initialization
  fillEmptySeatsWithCPUs(roomId);
  
  // Verify all seats are filled
  const filledSeats = Object.keys(room.playerSeats).length;
  if (filledSeats < 4) {
    console.error(`Cannot start game: only ${filledSeats} seats filled`);
    io.to(roomId).emit('gameError', { message: 'Failed to fill all seats' });
    return;
  }
  
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
  
  // Log the game start
  addToGameLog(euchreState, "Game started. Bidding begins.");
  
  // Update active rooms to reflect game is active
  updateActiveRooms();
  io.emit('updateActiveRooms', updateActiveRooms());
  
  console.log('Emitting initial game state, current player:', euchreState.currentPlayer);
  
  // Broadcast the game state to all players
  broadcastGameState(io, roomId);

  if (euchreState.currentPlayer && euchreState.currentPlayer.startsWith('cpu_')) {
    // Import the CPU handling function to avoid circular dependencies
    const { checkForCPUTurns } = require('./euchreCPU');
    
    // Schedule CPU turn after a slight delay
    setTimeout(() => {
      checkForCPUTurns(io, roomId);
    }, 1000);
  }
  
  return euchreState;
}

module.exports = {
  initializeEuchreGame,
  fillEmptySeatsWithCPUs,
  getFilteredGameState,
  broadcastGameState,
  addToGameLog,
  createDeck,
  shuffleDeck,
  dealCards,
  startBidding,
  startEuchreGame
};