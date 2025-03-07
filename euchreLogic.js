// euchreLogic.js
const { roomStates, updateActiveRooms } = require('./roomLogic');

function initializeEuchreGame(roomId) {
  const room = roomStates[roomId];
  if (!room) return;

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
    roundComplete: false,
    gameLog: []
  };

  return room.euchre;
}

function fillEmptySeatsWithCPUs(roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
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
    }
  }
  
  console.log('Room after filling with CPUs:');
  console.log('- Seated players:', room.seatedPlayers.length);
  console.log('- Player seats:', Object.keys(room.playerSeats).length);
  console.log('- Teams:', room.teams);
  
  return room;
}
function broadcastGameState(io, roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  console.log('Broadcasting game state to all players in room', roomId);
  
  // Create the filtered game state
  const filteredState = getFilteredGameState(euchreState, room);
  
  // Send to all players in the room, including spectators
  io.to(roomId).emit('euchreGameState', {
    gameState: filteredState,
    roomState: room
  });
  
  // Log the current phase and player for debugging
  console.log(`Game phase: ${euchreState.gamePhase}, Current player: ${euchreState.currentPlayer}`);
  if (euchreState.currentPlayer) {
    console.log(`Current player name: ${room.playerNames[euchreState.currentPlayer]}`);
  }
}

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
  
  // Broadcast the game state to all players, including spectators
  broadcastGameState(io, roomId);
  
  // Emit the initial game state to all players
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room
  });
  
  // If it's a CPU's turn, handle it after a short delay
  checkForCPUTurn(io, roomId);
  
  // Set additional checks with delays to ensure CPU turns happen
  setTimeout(() => checkForCPUTurn(io, roomId), 1000);
  setTimeout(() => checkForCPUTurn(io, roomId), 3000);
  setTimeout(() => checkForCPUTurn(io, roomId), 5000);
}

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
  
  // Make sure all seated players have hands defined (even if empty)
  for (const playerId of room.seatedPlayers) {
    if (!filteredState.hands[playerId]) {
      filteredState.hands[playerId] = [];
    }
    
    // Initialize tricks won for each player
    if (!filteredState.tricksWon[playerId]) {
      filteredState.tricksWon[playerId] = 0;
    }
  }
  
  return filteredState;
}

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

function shuffleDeck(euchreState) {
  for (let i = euchreState.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [euchreState.deck[i], euchreState.deck[j]] = [euchreState.deck[j], euchreState.deck[i]];
  }
  console.log('Shuffled deck');
}

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
  // Each player gets 5 cards total (either 2-3 or 3-2)
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

function startBidding(euchreState, room) {
  euchreState.gamePhase = 'bidding1';
  euchreState.bidsMade = 0;
  
  console.log('Starting bidding...');
  console.log('Dealer position:', euchreState.dealerPosition);
  console.log('Seated players:', room.seatedPlayers);
  
  // First player after dealer starts bidding
  const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
  euchreState.currentPlayer = room.seatedPlayers[starterIndex];
  
  console.log('Starter index:', starterIndex);
  console.log('Starting bidding, first player:', euchreState.currentPlayer, '(', room.playerNames[euchreState.currentPlayer], ')');
  
  // Add a log message to the game
  addToGameLog(euchreState, `Bidding begins. ${room.playerNames[euchreState.currentPlayer]} goes first.`);
}
function addToGameLog(euchreState, message) {
  if (euchreState.gameLog.length > 20) {
    euchreState.gameLog.shift(); // Keep log at reasonable size
  }
  euchreState.gameLog.push(message);
  console.log('Game log:', message);
}

function handleEuchreBid(io, socket, bid) {
  try {
    // Get the room ID - either from socket.roomId (for real players) or directly passed (for CPU players)
    const roomId = socket.roomId || socket;
    const room = roomStates[roomId];
    
    if (!room || !room.gameActive || room.gameType !== 'euchre') {
      console.log('Invalid room state for bidding');
      return;
    }
    
    const euchreState = room.euchre;
    if (!euchreState) {
      console.log('No euchre state found');
      return;
    }
    
    // Extract the player ID correctly based on whether it's a direct ID (for CPU) or a socket object
    const playerId = typeof socket === 'string' ? socket : socket.id;
    
    console.log('************** BID INFO **************');
    console.log('Current Player:', euchreState.currentPlayer);
    console.log('Acting Player:', playerId);
    console.log('Seated Players:', room.seatedPlayers);
    console.log('Is player seated?', room.seatedPlayers.includes(playerId));
    console.log('Game Phase:', euchreState.gamePhase);
    console.log('Bids Made:', euchreState.bidsMade);
    
    // Make sure it's the current player's turn
    if (euchreState.currentPlayer !== playerId) {
      console.error('Not the current player\'s turn:', playerId, 'vs', euchreState.currentPlayer);
      return;
    }
    
    const playerName = room.playerNames[playerId];
    console.log(`Player ${playerName} (${playerId}) is bidding:`, bid.action);
    
    // Process bid based on game phase
    if (euchreState.gamePhase === 'bidding1') {
      if (bid.action === 'orderUp') {
        console.log('Player ordering up...');
        // Player orders up the turned card
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Find dealer's player ID
        const dealerId = room.seatedPlayers[euchreState.dealerPosition];
        console.log('Dealer ID:', dealerId);
        
        // Add the turn-up card to dealer's hand (replacing their worst card)
        if (euchreState.hands[dealerId]) {
          euchreState.hands[dealerId].push(euchreState.turnUpCard);
        
          // For simplicity, just discard the first card (in a real game, player would choose)
          euchreState.hands[dealerId].shift();
          console.log('Added turn-up card to dealer hand');
        } else {
          console.error('Dealer hand not found:', dealerId);
        }
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        
        // Player to left of dealer leads
        const leadPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
        const nextPlayerId = room.seatedPlayers[leadPlayerIndex];
        euchreState.currentPlayer = nextPlayerId;
        console.log('Moving to playing phase, setting current player to:', nextPlayerId);
        
        addToGameLog(euchreState, `${playerName} ordered up ${euchreState.trumpSuit}`);
      } 
      else if (bid.action === 'pass') {
        console.log('Player passing...');
        // Player passes
        euchreState.bidsMade++;
        addToGameLog(euchreState, `${playerName} passed`);

        // Move to next player
        const currentIndex = room.seatedPlayers.indexOf(playerId);
        console.log('Current index in seatedPlayers:', currentIndex);
        
        if (currentIndex !== -1) {
          const nextPlayerIndex = (currentIndex + 1) % room.seatedPlayers.length;
          const nextPlayerId = room.seatedPlayers[nextPlayerIndex];
          euchreState.currentPlayer = nextPlayerId;
          console.log('Setting current player to:', nextPlayerId, '(', room.playerNames[nextPlayerId], ')');
        } else {
          console.error('Player not found in seatedPlayers:', playerId);
          console.log('seatedPlayers:', room.seatedPlayers);
          
          // Try recovery by finding player in playerSeats
          const playerSeatNum = Object.keys(room.playerSeats).find(seat => room.playerSeats[seat] === playerId);
          console.log('Player seat number from playerSeats:', playerSeatNum);
          
          if (playerSeatNum) {
            // Find next seat
            const nextSeatNum = (parseInt(playerSeatNum) % 4) + 1;
            const nextPlayerId = room.playerSeats[nextSeatNum];
            if (nextPlayerId) {
              euchreState.currentPlayer = nextPlayerId;
              console.log('Recovery: Setting current player to:', nextPlayerId, '(', room.playerNames[nextPlayerId], ')');
            }
          }
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed, move to second round of bidding
          euchreState.gamePhase = 'bidding2';
          euchreState.bidsMade = 0;
          
          // Turn down the card (it's no longer available)
          const oldTurnUpSuit = euchreState.turnUpCard.suit;
          addToGameLog(euchreState, `Everyone passed. Turn down ${oldTurnUpSuit}.`);
          
          // First player gets to choose suit
          const firstPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
          const nextPlayerId = room.seatedPlayers[firstPlayerIndex];
          euchreState.currentPlayer = nextPlayerId;
          console.log('Moving to bidding2, setting current player to:', nextPlayerId);
        }
      }
    } 
    else if (euchreState.gamePhase === 'bidding2') {
      // Same pattern for bidding2...
      if (bid.action === 'callSuit') {
        console.log('Player calling suit...');
        // Player calls a suit
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        
        // Player to left of dealer leads
        const leadPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
        const nextPlayerId = room.seatedPlayers[leadPlayerIndex];
        euchreState.currentPlayer = nextPlayerId;
        console.log('Moving to playing phase, setting current player to:', nextPlayerId);
        
        addToGameLog(euchreState, `${playerName} called ${euchreState.trumpSuit} as trump`);
      } 
      else if (bid.action === 'pass') {
        console.log('Player passing in round 2...');
        // Player passes
        euchreState.bidsMade++;
        addToGameLog(euchreState, `${playerName} passed`);

        // Move to next player
        const currentIndex = room.seatedPlayers.indexOf(playerId);
        console.log('Current index in seatedPlayers (round 2):', currentIndex);
        
        if (currentIndex !== -1) {
          const nextPlayerIndex = (currentIndex + 1) % room.seatedPlayers.length;
          const nextPlayerId = room.seatedPlayers[nextPlayerIndex];
          euchreState.currentPlayer = nextPlayerId;
          console.log('Setting current player to:', nextPlayerId, '(', room.playerNames[nextPlayerId], ')');
        } else {
          console.error('Player not found in seatedPlayers:', playerId);
          // Same recovery pattern as above
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed again, redeal
          addToGameLog(euchreState, `Everyone passed. Redealing.`);
          
          // Move dealer position
          euchreState.dealerPosition = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
          
          // Reset and redeal
          createDeck(euchreState);
          shuffleDeck(euchreState);
          dealCards(euchreState, room);
          
          // Start bidding over
          euchreState.gamePhase = 'bidding1';
          euchreState.bidsMade = 0;
          
          // First player after dealer starts bidding
          const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
          const nextPlayerId = room.seatedPlayers[starterIndex];
          euchreState.currentPlayer = nextPlayerId;
          console.log('New deal, setting current player to:', nextPlayerId);
        }
      }
    }
    
    // Log the current player
    console.log('Current player is now:', euchreState.currentPlayer, '(', room.playerNames[euchreState.currentPlayer], ')');
    console.log('************** END BID INFO **************');
    
    // Update all players with the new game state
    try {
      // Explicitly broadcast to ensure everyone gets updated
      io.to(roomId).emit('euchreGameState', { 
        gameState: getFilteredGameState(euchreState, room),
        roomState: room 
      });
    } catch (error) {
      console.error('Error updating game state:', error);
    }
    
    // CRITICAL FIX: Check if the next player is a CPU and trigger their turn
    if (euchreState.currentPlayer && euchreState.currentPlayer.startsWith('cpu_')) {
      console.log(`Scheduling CPU turn for ${euchreState.currentPlayer}`);
      
      // Use setImmediate to ensure CPU turns happen reliably
      const cpuTurnTimeout = setTimeout(() => {
        console.log(`Executing CPU turn for ${euchreState.currentPlayer}`);
        try {
          // Direct CPU player bid - IMPORTANT: Pass the CPU player ID directly, not as a socket object
          if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
            cpuBid(io, roomId, euchreState.currentPlayer);
          } else if (euchreState.gamePhase === 'playing') {
            cpuPlayCard(io, roomId, euchreState.currentPlayer);
          }
        } catch (error) {
          console.error('Error in CPU turn:', error);
          // Recovery attempt
          if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
            console.log('Error recovery: Making CPU pass after error');
            handleEuchreBid(io, euchreState.currentPlayer, { action: 'pass' });
          }
        }
      }, 2000);
    } else {
      console.log(`Next player is not a CPU: ${euchreState.currentPlayer}`);
    }
  } catch (error) {
    console.error('Unexpected error in handleEuchreBid:', error);
  }
}

function determineTrickWinner(euchreState) {
  const trumpSuit = euchreState.trumpSuit;
  const leadSuit = euchreState.leadSuit;
  
  // Helper function to get card value
  function getCardValue(card) {
    const isRight = card.rank === 'J' && card.suit === trumpSuit;
    const isLeft = card.rank === 'J' && 
                  ((trumpSuit === 'hearts' && card.suit === 'diamonds') ||
                   (trumpSuit === 'diamonds' && card.suit === 'hearts') ||
                   (trumpSuit === 'clubs' && card.suit === 'spades') ||
                   (trumpSuit === 'spades' && card.suit === 'clubs'));
    
    // Special treatment for bower cards
    if (isRight) return 16; // Right bower
    if (isLeft) return 15;  // Left bower
    
    // Is this a trump card?
    const effectiveSuit = isLeft ? trumpSuit : card.suit;
    const isTrump = effectiveSuit === trumpSuit;
    
    // Card rankings (Ace high)
    const cardRanks = { '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    
    // Trump cards beat non-trump cards
    return isTrump ? cardRanks[card.rank] + 100 : cardRanks[card.rank];
  }
  
  // Find the highest card
  let highestValue = -1;
  let winnerId = null;
  let winningCard = null;
  
  for (const play of euchreState.currentTrick) {
    const card = play.card;
    const cardValue = getCardValue(card);
    
    // First card or higher value card
    if (winnerId === null) {
      highestValue = cardValue;
      winnerId = play.player;
      winningCard = card;
    }
    // Following cards must follow suit to win
    else {
      const isLeftBower = card.rank === 'J' && 
                        ((trumpSuit === 'hearts' && card.suit === 'diamonds') ||
                         (trumpSuit === 'diamonds' && card.suit === 'hearts') ||
                         (trumpSuit === 'clubs' && card.suit === 'spades') ||
                         (trumpSuit === 'spades' && card.suit === 'clubs'));
      
      // If it's the lead suit, it might win
      if (card.suit === leadSuit || card.suit === trumpSuit || isLeftBower) {
        if (cardValue > highestValue) {
          highestValue = cardValue;
          winnerId = play.player;
          winningCard = card;
        }
      }
    }
  }
  
  return { winnerId, winningCard };
}

function determineMakerTeam(euchreState, room) {
  // Find which seat number the maker is in
  const makerSeatNum = parseInt(Object.keys(room.playerSeats).find(seatNum => 
    room.playerSeats[seatNum] === euchreState.maker
  ));
  
  // Return team index (0 for team 1, 1 for team 2)
  return (makerSeatNum === 1 || makerSeatNum === 3) ? 0 : 1;
}

// Improved handleCPUTurns function
function handleCPUTurns(io, roomId) {
  console.log(`handleCPUTurns called for room ${roomId}`);
  
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') {
    console.error('Invalid room for CPU turn');
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState) {
    console.error('No euchre state for CPU turn');
    return;
  }
  
  // Check if it's a CPU's turn
  const currentPlayerId = euchreState.currentPlayer;
  if (!currentPlayerId) {
    console.error('No current player set');
    return;
  }

  console.log(`Current player in handleCPUTurns: ${currentPlayerId}`);
  
  if (!currentPlayerId.startsWith('cpu_')) {
    console.log('Not a CPU turn:', currentPlayerId);
    return;
  }
  
  console.log(`CPU turn for player: ${currentPlayerId} in phase: ${euchreState.gamePhase}`);
  
  // Prevent potential race conditions with multiple CPU turns
  const now = Date.now();
  if (!room.cpuLastTurnTime) room.cpuLastTurnTime = {};
  const lastTurnTime = room.cpuLastTurnTime[currentPlayerId] || 0;
  
  if (now - lastTurnTime < 3000) {
    console.log(`Skipping duplicate CPU turn for ${currentPlayerId}, last turn was ${now - lastTurnTime}ms ago`);
    return;
  }
  
  // Mark this CPU's turn
  room.cpuLastTurnTime[currentPlayerId] = now;
  
  // CRITICAL FIX: Call the appropriate function directly with the CPU ID as a string
  if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
    // Call cpuBid directly with the current player ID
    cpuBid(io, roomId, currentPlayerId);
  } 
  else if (euchreState.gamePhase === 'playing') {
    // Call cpuPlayCard directly with the current player ID
    cpuPlayCard(io, roomId, currentPlayerId);
  }
}

// CPU bidding logic
function cpuBid(io, roomId, cpuId) {
  const room = roomStates[roomId];
  const euchreState = room.euchre;
  
  if (!euchreState) {
    console.error('No euchre state for CPU bid');
    return;
  }
  
  console.log(`CPU ${cpuId} bidding, game phase: ${euchreState.gamePhase}`);
  
  // Introduce more varied CPU behavior based on the CPU's "personality"
  // Extract the CPU number from the ID to make it consistent
  const cpuNum = parseInt(cpuId.split('_').pop()) || 1;
  
  if (euchreState.gamePhase === 'bidding1') {
    // Use the CPU number to determine bid aggressiveness (more predictable)
    const bidThreshold = 0.3 + (cpuNum * 0.1); // 0.4, 0.5, 0.6 for CPUs 1, 2, 3
    
    if (Math.random() < bidThreshold) {
      // Order up
      console.log(`CPU ${cpuId} ordering up ${euchreState.turnUpCard.suit} (threshold: ${bidThreshold})`);
      
      // CRITICAL FIX: Make sure to pass the CPU ID directly as a string, not as a socket object
      handleEuchreBid(io, cpuId, { 
        action: 'orderUp', 
        suit: euchreState.turnUpCard.suit 
      });
    } else {
      // Pass
      console.log(`CPU ${cpuId} passing (threshold: ${bidThreshold})`);
      
      // CRITICAL FIX: Make sure to pass the CPU ID directly as a string, not as a socket object
      handleEuchreBid(io, cpuId, { action: 'pass' });
    }
  } 
  else if (euchreState.gamePhase === 'bidding2') {
    // More likely to call in second round
    const bidThreshold = 0.4 + (cpuNum * 0.1); // 0.5, 0.6, 0.7 for CPUs 1, 2, 3
    
    if (Math.random() < bidThreshold) {
      // Select a random suit that isn't the turn-up suit
      const availableSuits = ['hearts', 'diamonds', 'clubs', 'spades'].filter(s => 
        s !== euchreState.turnUpCard.suit
      );
      
      // Make the selection more deterministic based on CPU ID
      const suitIndex = (cpuNum + euchreState.bidsMade) % availableSuits.length;
      const selectedSuit = availableSuits[suitIndex];
      
      console.log(`CPU ${cpuId} calling suit: ${selectedSuit} (threshold: ${bidThreshold})`);
      
      // CRITICAL FIX: Make sure to pass the CPU ID directly as a string, not as a socket object
      handleEuchreBid(io, cpuId, { 
        action: 'callSuit', 
        suit: selectedSuit 
      });
    } else {
      // Pass
      console.log(`CPU ${cpuId} passing in second round (threshold: ${bidThreshold})`);
      
      // CRITICAL FIX: Make sure to pass the CPU ID directly as a string, not as a socket object
      handleEuchreBid(io, cpuId, { action: 'pass' });
    }
  }
}

// CPU card playing logic
function cpuPlayCard(io, roomId, cpuId) {
  const room = roomStates[roomId];
  const euchreState = room.euchre;
  
  if (!euchreState) {
    console.log('No euchre state for CPU play card');
    return;
  }
  
  const hand = euchreState.hands[cpuId];
  if (!hand || hand.length === 0) {
    console.log('No hand for CPU player');
    return;
  }
  
  console.log(`CPU ${cpuId} playing card from hand with ${hand.length} cards`);
  
  let cardIndex = 0; // Default to first card
  
  // If not leading, try to follow suit if possible
  if (euchreState.leadSuit) {
    const followSuitCards = hand.map((card, index) => ({ card, index }))
                             .filter(item => item.card.suit === euchreState.leadSuit);
    
    if (followSuitCards.length > 0) {
      // Play highest card of lead suit
      const highestCard = followSuitCards.sort((a, b) => {
        const rankOrder = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 };
        return rankOrder[b.card.rank] - rankOrder[a.card.rank];
      })[0];
      
      cardIndex = highestCard.index;
      console.log(`CPU playing follow suit card: ${hand[cardIndex].rank} of ${hand[cardIndex].suit}`);
    } else {
      // Can't follow suit, play lowest card
      const lowestCard = hand.map((card, index) => ({ card, index }))
                            .sort((a, b) => {
                              const rankOrder = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 };
                              return rankOrder[a.card.rank] - rankOrder[b.card.rank];
                            })[0];
      
      cardIndex = lowestCard.index;
      console.log(`CPU playing off-suit card: ${hand[cardIndex].rank} of ${hand[cardIndex].suit}`);
    }
  } else {
    // Leading - play highest card
    const highestCard = hand.map((card, index) => ({ card, index }))
                          .sort((a, b) => {
                            const rankOrder = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 };
                            return rankOrder[b.card.rank] - rankOrder[a.card.rank];
                          })[0];
      
    cardIndex = highestCard.index;
    console.log(`CPU leading with card: ${hand[cardIndex].rank} of ${hand[cardIndex].suit}`);
  }
  
  // Play the selected card
  handleEuchrePlayCard(io, cpuId, cardIndex);
}

// Check if CPU needs to make a move
function checkForCPUTurn(io, roomId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive) {
    console.log('Room not active, skipping CPU turn check');
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState) {
    console.log('No euchre state, skipping CPU turn check');
    return;
  }
  
  // If no current player is set, try to recover
  if (!euchreState.currentPlayer && room.seatedPlayers.length > 0) {
    console.log('No current player set, attempting recovery');
    euchreState.currentPlayer = room.seatedPlayers[0];
    
    // Broadcast the updated state
    broadcastGameState(io, roomId);
    return;
  }
  
  const currentPlayerId = euchreState.currentPlayer;
  if (!currentPlayerId) {
    console.log('No current player ID, skipping CPU turn check');
    return;
  }
  
  // Check if it's a CPU player's turn
  if (currentPlayerId.startsWith('cpu_')) {
    console.log(`CPU turn detected for ${currentPlayerId} in phase ${euchreState.gamePhase}`);
    
    // Prevent multiple CPU turns being triggered at once
    const now = Date.now();
    if (!room.cpuLastTurnTime) room.cpuLastTurnTime = {};
    const lastTurnTime = room.cpuLastTurnTime[currentPlayerId] || 0;
    
    if (now - lastTurnTime > 5000) { // Only trigger if it's been more than 5 seconds
      // Track the last turn time
      room.cpuLastTurnTime[currentPlayerId] = now;
      
      console.log(`Scheduling CPU turn for ${currentPlayerId} after delay`);
      // Add small delay to make it seem like the CPU is "thinking"
      setTimeout(() => {
        console.log(`Executing scheduled CPU turn for ${currentPlayerId}`);
        try {
          handleCPUTurns(io, roomId);
        } catch (error) {
          console.error('Error executing CPU turn:', error);
          // Try to recover by passing if in bidding phase
          if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
            console.log('Recovery attempt: Making CPU pass after error');
            handleEuchreBid(io, currentPlayerId, { action: 'pass' });
          }
        }
      }, 2000);
    } else {
      console.log(`Skipping duplicate CPU turn for ${currentPlayerId}, last turn was ${now - lastTurnTime}ms ago`);
    }
  }
}

module.exports = {
  startEuchreGame,
  handleEuchreBid,
  handleEuchrePlayCard,
  checkForCPUTurn,
  fillEmptySeatsWithCPUs,
  broadcastGameState,
  getFilteredGameState
};