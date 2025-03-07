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
    
    // Create the filtered game state (a deep copy to avoid modifying original)
    const filteredState = getFilteredGameState(euchreState, room);
    
    // Add timestamp to help detect stale updates
    filteredState.timestamp = Date.now();
    
    // Construct the message to send
    const gameStateMessage = {
      gameState: filteredState,
      roomState: JSON.parse(JSON.stringify(room))  // Another deep copy
    };
    
    // Send to all players in the room
    io.to(roomId).emit('euchreGameState', gameStateMessage);
    
    // Log the broadcast
    console.log(`Game state broadcast complete. Timestamp: ${filteredState.timestamp}`);
    
    // Log current phase and player for debugging
    if (euchreState.currentPlayer) {
      console.log(`Current player is ${room.playerNames[euchreState.currentPlayer]} (${euchreState.currentPlayer})`);
    }
  } catch (error) {
    console.error('Error in broadcastGameState:', error);
    console.error(error.stack);
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
  console.log('Player seats:', room.playerSeats);
  
  // CRITICAL FIX: Use seat numbers instead of array indices
  // Dealer is at position 0-3, but seats are numbered 1-4
  const dealerSeatPosition = euchreState.dealerPosition;
  const firstSeatNumber = (dealerSeatPosition % 4) + 1; // Convert 0-3 to 1-4, wrapping around
  
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
    // Fallback to using array index method
    const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
    euchreState.currentPlayer = room.seatedPlayers[starterIndex];
    console.log('Fallback: Starting player set to:', euchreState.currentPlayer);
  }
}


function addToGameLog(euchreState, message) {
  if (euchreState.gameLog.length > 20) {
    euchreState.gameLog.shift(); // Keep log at reasonable size
  }
  euchreState.gameLog.push(message);
  console.log('Game log:', message);
}

// This function needs to be focused on the "orderUp" action which isn't being processed correctly
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
    
    console.log(`-------- BID ACTION: ${bid.action} --------`);
    console.log('Current Player:', euchreState.currentPlayer);
    console.log('Acting Player:', playerId);
    console.log('Room ID:', roomId);
    console.log('Game Phase:', euchreState.gamePhase);
    
    // Make sure it's the current player's turn
    if (euchreState.currentPlayer !== playerId) {
      console.error('Not the current player\'s turn:', playerId, 'vs', euchreState.currentPlayer);
      return;
    }
    
    const playerName = room.playerNames[playerId];
    console.log(`Player ${playerName} (${playerId}) is bidding:`, bid.action);
    
    // FIXED: Order Up Logic - completely rewrite this section
    if (euchreState.gamePhase === 'bidding1') {
      if (bid.action === 'orderUp') {
        console.log(`********** ORDER UP ACTION **********`);
        console.log('Player ordering up suit:', bid.suit);
        
        // Set trump suit and maker
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Find dealer's position and ID
        const dealerPosition = euchreState.dealerPosition;
        const dealerSeatNum = (dealerPosition % 4) + 1; // Convert 0-3 to 1-4
        const dealerId = room.playerSeats[dealerSeatNum];
        
        console.log('Dealer position:', dealerPosition);
        console.log('Dealer seat number:', dealerSeatNum);
        console.log('Dealer ID:', dealerId);
        
        // Add the turn-up card to dealer's hand
        if (euchreState.hands[dealerId]) {
          console.log('Adding turn-up card to dealer hand');
          console.log('Turn-up card:', euchreState.turnUpCard);
          console.log('Dealer hand before:', euchreState.hands[dealerId]);
          
          // Add card to hand
          euchreState.hands[dealerId].push(euchreState.turnUpCard);
          
          // Dealer will discard a card (for simplicity, just the first card)
          const discardedCard = euchreState.hands[dealerId].shift();
          console.log('Dealer discarded:', discardedCard);
          console.log('Dealer hand after:', euchreState.hands[dealerId]);
        } else {
          console.error('Dealer hand not found for dealer ID:', dealerId);
        }
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        console.log('Game phase changed to playing');
        
        // Player to left of dealer leads
        const leadSeatNum = dealerSeatNum < 4 ? dealerSeatNum + 1 : 1; // Wrap from 4 to 1
        const leadPlayerId = room.playerSeats[leadSeatNum];
        
        console.log('Lead seat number:', leadSeatNum);
        console.log('Lead player ID:', leadPlayerId);
        
        if (leadPlayerId) {
          euchreState.currentPlayer = leadPlayerId;
          console.log('Current player now set to:', leadPlayerId);
        } else {
          console.error('Cannot find player at lead seat:', leadSeatNum);
        }
        
        // Add game log entry
        addToGameLog(euchreState, `${playerName} ordered up ${euchreState.trumpSuit}`);
        console.log(`********* END ORDER UP ACTION *********`);
      } 
      else if (bid.action === 'pass') {
        // Player passes - this appears to be working already
        euchreState.bidsMade++;
        addToGameLog(euchreState, `${playerName} passed`);

        // Move to next player - Find the current player's seat number
        let currentSeatNum = null;
        for (const [seatNum, id] of Object.entries(room.playerSeats)) {
          if (id === playerId) {
            currentSeatNum = parseInt(seatNum);
            break;
          }
        }
        
        console.log('Current player seat number:', currentSeatNum);
        
        if (currentSeatNum) {
          // Calculate next seat number (wrapping around from 4 to 1)
          //const nextSeatNum = currentSeatNum < 4 ? currentSeatNum + 1 : 1;
          let nextSeatNum;
          if (currentSeatNum === 1) nextSeatNum = 4;
          else if (currentSeatNum === 4) nextSeatNum = 3;
          else if (currentSeatNum === 3) nextSeatNum = 2;
          else if (currentSeatNum === 2) nextSeatNum = 1;
          else nextSeatNum = 1;
          console.log('Next seat number:', nextSeatNum);
          
          // Get player ID at that seat
          const nextPlayerId = room.playerSeats[nextSeatNum];
          if (nextPlayerId) {
            euchreState.currentPlayer = nextPlayerId;
            console.log('Setting current player to:', nextPlayerId, '(', room.playerNames[nextPlayerId], ')');
          } else {
            console.error('No player found at next seat:', nextSeatNum);
          }
        } else {
          console.error('Could not find current player seat number!');
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed, move to second round of bidding
          euchreState.gamePhase = 'bidding2';
          euchreState.bidsMade = 0;
          
          // Turn down the card (it's no longer available)
          const oldTurnUpSuit = euchreState.turnUpCard.suit;
          addToGameLog(euchreState, `Everyone passed. Turn down ${oldTurnUpSuit}.`);
          
          // First player after dealer gets to choose suit
          const dealerPosition = euchreState.dealerPosition;
          const dealerSeatNum = (dealerPosition % 4) + 1;
          const firstSeatNum = dealerSeatNum < 4 ? dealerSeatNum + 1 : 1;
          const firstPlayerId = room.playerSeats[firstSeatNum];
          
          if (firstPlayerId) {
            euchreState.currentPlayer = firstPlayerId;
            console.log('Moving to bidding2, setting current player to:', firstPlayerId);
          }
        }
      }
    } 
    // Logic for bidding2 phase...
    else if (euchreState.gamePhase === 'bidding2') {
      if (bid.action === 'callSuit') {
        console.log('Player calling suit...');
        // Player calls a suit
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        
        // Player to left of dealer leads
        const dealerPosition = euchreState.dealerPosition;
        const dealerSeatNum = (dealerPosition % 4) + 1;
        const nextSeatNum = dealerSeatNum < 4 ? dealerSeatNum + 1 : 1;
        const nextPlayerId = room.playerSeats[nextSeatNum];
        
        if (nextPlayerId) {
          euchreState.currentPlayer = nextPlayerId;
          console.log('Moving to playing phase, setting current player to:', nextPlayerId);
        }
        
        addToGameLog(euchreState, `${playerName} called ${euchreState.trumpSuit} as trump`);
      } 
      else if (bid.action === 'pass') {
        // Handle passing in round 2 - this appears to be working already
        euchreState.bidsMade++;
        addToGameLog(euchreState, `${playerName} passed`);

        // Find current seat and move to next player
        let currentSeatNum = null;
        for (const [seatNum, id] of Object.entries(room.playerSeats)) {
          if (id === playerId) {
            currentSeatNum = parseInt(seatNum);
            break;
          }
        }
        
        if (currentSeatNum) {
          //const nextSeatNum = currentSeatNum < 4 ? currentSeatNum + 1 : 1;
          let nextSeatNum;
          if (currentSeatNum === 1) nextSeatNum = 4;
          else if (currentSeatNum === 4) nextSeatNum = 3;
          else if (currentSeatNum === 3) nextSeatNum = 2;
          else if (currentSeatNum === 2) nextSeatNum = 1;
          else nextSeatNum = 1;
          const nextPlayerId = room.playerSeats[nextSeatNum];
          if (nextPlayerId) {
            euchreState.currentPlayer = nextPlayerId;
            console.log('Setting current player to:', nextPlayerId);
          }
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed again, redeal
          addToGameLog(euchreState, `Everyone passed. Redealing.`);
          
          // Move dealer position
          euchreState.dealerPosition = (euchreState.dealerPosition + 1) % 4;
          
          // Reset and redeal
          createDeck(euchreState);
          shuffleDeck(euchreState);
          dealCards(euchreState, room);
          
          // Start bidding over
          euchreState.gamePhase = 'bidding1';
          euchreState.bidsMade = 0;
          
          // First player after dealer starts bidding (using seat numbers)
          const dealerPos = euchreState.dealerPosition;
          const dealerSeat = (dealerPos % 4) + 1;
          const firstSeat = dealerSeat < 4 ? dealerSeat + 1 : 1;
          const nextPlayerId = room.playerSeats[firstSeat];
          
          if (nextPlayerId) {
            euchreState.currentPlayer = nextPlayerId;
            console.log('New deal, setting current player to:', nextPlayerId);
          }
        }
      }
    }
    
    // Log the current game state
    console.log('GAME STATE AFTER BID ACTION:');
    console.log('- Game Phase:', euchreState.gamePhase);
    console.log('- Current Player:', euchreState.currentPlayer);
    console.log('- Trump Suit:', euchreState.trumpSuit);
    console.log('- Maker:', euchreState.maker);
    console.log('- Bids Made:', euchreState.bidsMade);
    
    // IMPORTANT: Broadcast the updated game state
    try {
      broadcastGameState(io, roomId);
    } catch (error) {
      console.error('Error broadcasting game state:', error);
    }
    // Schedule CPU turns if needed

    if (euchreState.currentPlayer && euchreState.currentPlayer.startsWith('cpu_')) {
      console.log(`Scheduling CPU turn for ${euchreState.currentPlayer}`);
      
      // Add delay for natural feeling
      setTimeout(() => {
        // Verify CPU is still current player
        if (room.euchre && room.euchre.currentPlayer === euchreState.currentPlayer) {
          console.log(`CPU ${euchreState.currentPlayer} taking turn`);
          
          // Let the handleCPUTurns function handle the CPU logic
          handleCPUTurns(io, roomId);
        }
      }, 1500);
    }
  } catch (error) {
    console.error('Unexpected error in handleEuchreBid:', error);
    console.error(error.stack);
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
  
  // Initialize timestamp tracking if needed
  if (!room.cpuLastTurnTime) room.cpuLastTurnTime = {};
  
  // Process the turn without duplicate checking first time
  // Call the appropriate function based on game phase
  if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
    console.log(`CPU ${currentPlayerId} is making a bid decision`);
    // Set timestamp AFTER making the decision
    room.cpuLastTurnTime[currentPlayerId] = Date.now();
    cpuBid(io, roomId, currentPlayerId);
  } 
  else if (euchreState.gamePhase === 'playing') {
    console.log(`CPU ${currentPlayerId} is making a card play decision`);
    // Set timestamp AFTER making the decision
    room.cpuLastTurnTime[currentPlayerId] = Date.now();
    handleCPUCardPlay(io, roomId, currentPlayerId);
  }
}
// Add this function to the end of your handleEuchreBid implementation
// for CPU card playing logic during the playing phase

function handleCPUCardPlay(io, roomId, cpuId) {
  try {
    // Create a mock socket for consistent parameter handling
    const mockSocket = {
      id: cpuId,
      roomId: roomId
    };
    
    const room = roomStates[roomId];
    if (!room || !room.gameActive || room.gameType !== 'euchre') {
      console.error('Invalid room for CPU card play');
      return;
    }
    
    const euchreState = room.euchre;
    if (!euchreState || euchreState.gamePhase !== 'playing') {
      console.error('Invalid game state for CPU card play');
      return;
    }
    
    // Make sure it's this CPU's turn
    if (euchreState.currentPlayer !== cpuId) {
      console.error(`Not CPU ${cpuId}'s turn to play`);
      return;
    }
    
    // Get CPU's hand
    const hand = euchreState.hands[cpuId];
    if (!hand || hand.length === 0) {
      console.error(`CPU ${cpuId} has no cards to play`);
      return;
    }
    
    console.log(`CPU ${cpuId} hand:`, hand);
    
    // Select the first card for simplicity
    const cardIndex = 0;
    const card = hand[cardIndex];
    
    console.log(`CPU ${cpuId} playing card:`, card);
    
    // Add card to current trick
    euchreState.currentTrick.push({
      player: cpuId,
      card: card
    });
    
    // If this is the first card in the trick, set it as the lead suit
    if (euchreState.currentTrick.length === 1) {
      euchreState.leadSuit = card.suit;
    }
    
    // Remove the card from CPU's hand
    euchreState.hands[cpuId].splice(cardIndex, 1);
    
    // Add to game log
    addToGameLog(euchreState, `${room.playerNames[cpuId]} played ${card.rank} of ${card.suit}`);
    
    // Broadcast updated state
    broadcastGameState(io, roomId);
    
    // Process next player in trick
    processNextTrickPlayer(io, roomId);
  } catch (error) {
    console.error('Error in CPU card play:', error);
  }
}

// Helper function to select which card to play
function selectCardToPlay(hand, euchreState, playerId, room) {
  // If leading the trick, use leading strategy
  if (euchreState.currentTrick.length === 0) {
    return selectLeadCard(hand, euchreState, playerId, room);
  }
  
  // If following, need to follow suit if possible
  const leadCard = euchreState.currentTrick[0].card;
  const leadSuit = getEffectiveSuit(leadCard, euchreState.trumpSuit);
  
  console.log(`Lead card: ${leadCard.rank} of ${leadCard.suit}, effective suit: ${leadSuit}`);
  
  // Find cards that can follow suit
  const followingSuitCards = [];
  for (let i = 0; i < hand.length; i++) {
    if (getEffectiveSuit(hand[i], euchreState.trumpSuit) === leadSuit) {
      followingSuitCards.push({ card: hand[i], index: i });
    }
  }
  
  // Must follow suit if possible
  if (followingSuitCards.length > 0) {
    console.log(`CPU has ${followingSuitCards.length} cards that follow suit`);
    
    // Determine current winning card in trick
    const winningPlay = getCurrentWinningPlay(euchreState);
    console.log('Current winning play:', winningPlay);
    
    // Check if partner is winning
    const partnerWinning = isPartnerWinning(euchreState, playerId, room);
    
    if (partnerWinning) {
      console.log('Partner is currently winning the trick');
      // Partner is winning, play lowest card
      followingSuitCards.sort((a, b) => compareCardRanks(a.card, b.card, euchreState.trumpSuit));
      return followingSuitCards[0].index;
    }
    
    // Try to win the trick if possible
    const winningCards = followingSuitCards.filter(cardInfo => 
      compareCards(cardInfo.card, winningPlay.card, leadSuit, euchreState.trumpSuit) > 0
    );
    
    if (winningCards.length > 0) {
      console.log('CPU has cards that can win the trick');
      // Play lowest winning card
      winningCards.sort((a, b) => compareCardRanks(a.card, b.card, euchreState.trumpSuit));
      return winningCards[0].index;
    } else {
      // Cannot win, play lowest card
      followingSuitCards.sort((a, b) => compareCardRanks(a.card, b.card, euchreState.trumpSuit));
      return followingSuitCards[0].index;
    }
  }
  
  // Cannot follow suit, decide whether to trump
  console.log('CPU cannot follow suit');
  
  // Check if partner is winning
  const partnerWinning = isPartnerWinning(euchreState, playerId, room);
  
  // Find trump cards
  const trumpCards = [];
  for (let i = 0; i < hand.length; i++) {
    if (getEffectiveSuit(hand[i], euchreState.trumpSuit) === euchreState.trumpSuit) {
      trumpCards.push({ card: hand[i], index: i });
    }
  }
  
  if (trumpCards.length > 0 && !partnerWinning) {
    console.log('CPU will play a trump card');
    // Play lowest trump
    trumpCards.sort((a, b) => compareCardRanks(a.card, b.card, euchreState.trumpSuit));
    return trumpCards[0].index;
  }
  
  // Cannot follow suit and won't trump, play lowest card
  console.log('CPU playing lowest card');
  let lowestCardIndex = 0;
  let lowestRank = 100;
  
  for (let i = 0; i < hand.length; i++) {
    const cardRank = getCardRankValue(hand[i], euchreState.trumpSuit);
    if (cardRank < lowestRank) {
      lowestRank = cardRank;
      lowestCardIndex = i;
    }
  }
  
  return lowestCardIndex;
}

// Helper function to select a card when leading
function selectLeadCard(hand, euchreState, playerId, room) {
  console.log('CPU is leading the trick');
  
  // If we have the right bower, lead it
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'J' && hand[i].suit === euchreState.trumpSuit) {
      console.log('Leading with right bower');
      return i;
    }
  }
  
  // If we have the left bower, lead it
  const leftBowerSuit = getLeftBowerSuit(euchreState.trumpSuit);
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'J' && hand[i].suit === leftBowerSuit) {
      console.log('Leading with left bower');
      return i;
    }
  }
  
  // If we have a high trump (K, A), lead it
  for (let i = 0; i < hand.length; i++) {
    if (getEffectiveSuit(hand[i], euchreState.trumpSuit) === euchreState.trumpSuit && 
        (hand[i].rank === 'A' || hand[i].rank === 'K')) {
      console.log('Leading with high trump');
      return i;
    }
  }
  
  // If we have an Ace of a non-trump suit, lead it
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'A' && getEffectiveSuit(hand[i], euchreState.trumpSuit) !== euchreState.trumpSuit) {
      console.log('Leading with non-trump Ace');
      return i;
    }
  }
  
  // Otherwise lead the highest non-trump card
  let highestNonTrump = -1;
  let highestRank = -1;
  
  for (let i = 0; i < hand.length; i++) {
    if (getEffectiveSuit(hand[i], euchreState.trumpSuit) !== euchreState.trumpSuit) {
      const rank = getCardRankValue(hand[i], euchreState.trumpSuit);
      if (rank > highestRank) {
        highestRank = rank;
        highestNonTrump = i;
      }
    }
  }
  
  if (highestNonTrump !== -1) {
    console.log('Leading with highest non-trump');
    return highestNonTrump;
  }
  
  // If we only have trump cards, lead the lowest one
  console.log('Leading with lowest trump (only have trump cards)');
  let lowestTrump = 0;
  let lowestRank = 100;
  
  for (let i = 0; i < hand.length; i++) {
    const rank = getCardRankValue(hand[i], euchreState.trumpSuit);
    if (rank < lowestRank) {
      lowestRank = rank;
      lowestTrump = i;
    }
  }
  
  return lowestTrump;
}

// Get the left bower suit based on trump suit
function getLeftBowerSuit(trumpSuit) {
  switch (trumpSuit) {
    case 'hearts': return 'diamonds';
    case 'diamonds': return 'hearts';
    case 'clubs': return 'spades';
    case 'spades': return 'clubs';
    default: return null;
  }
}

// Determine if the partner is currently winning the trick
function isPartnerWinning(euchreState, playerId, room) {
  if (euchreState.currentTrick.length === 0) return false;
  
  // Find the winning play
  const winningPlay = getCurrentWinningPlay(euchreState);
  if (!winningPlay) return false;
  
  // Determine if the winning player is partner
  // First need to get the seat numbers
  let playerSeatNum = null;
  let winningSeatNum = null;
  
  for (const [seatNum, id] of Object.entries(room.playerSeats)) {
    if (id === playerId) {
      playerSeatNum = parseInt(seatNum);
    }
    if (id === winningPlay.player) {
      winningSeatNum = parseInt(seatNum);
    }
  }
  
  if (!playerSeatNum || !winningSeatNum) return false;
  
  // Partners are across from each other (1&3, 2&4)
  return (playerSeatNum % 2) === (winningSeatNum % 2);
}

// Get the current winning play in the trick
function getCurrentWinningPlay(euchreState) {
  if (euchreState.currentTrick.length === 0) return null;
  
  let winningPlay = euchreState.currentTrick[0];
  const leadSuit = getEffectiveSuit(winningPlay.card, euchreState.trumpSuit);
  
  for (let i = 1; i < euchreState.currentTrick.length; i++) {
    const play = euchreState.currentTrick[i];
    if (compareCards(play.card, winningPlay.card, leadSuit, euchreState.trumpSuit) > 0) {
      winningPlay = play;
    }
  }
  
  return winningPlay;
}

// Compare two cards to see which is higher
function compareCards(card1, card2, leadSuit, trumpSuit) {
  const suit1 = getEffectiveSuit(card1, trumpSuit);
  const suit2 = getEffectiveSuit(card2, trumpSuit);
  
  // Trump beats non-trump
  if (suit1 === trumpSuit && suit2 !== trumpSuit) {
    return 1;
  }
  if (suit1 !== trumpSuit && suit2 === trumpSuit) {
    return -1;
  }
  
  // If both trump, compare ranks (special ordering)
  if (suit1 === trumpSuit && suit2 === trumpSuit) {
    return compareTrumpRanks(card1, card2, trumpSuit);
  }
  
  // If neither trump, following lead suit beats not following
  if (suit1 === leadSuit && suit2 !== leadSuit) {
    return 1;
  }
  if (suit1 !== leadSuit && suit2 === leadSuit) {
    return -1;
  }
  
  // Otherwise compare by rank within the same suit
  return compareCardRanks(card1, card2, trumpSuit);
}

// Compare ranks for the special case of trump cards
function compareTrumpRanks(card1, card2, trumpSuit) {
  // Right bower (Jack of trump suit)
  const isRightBower1 = card1.rank === 'J' && card1.suit === trumpSuit;
  const isRightBower2 = card2.rank === 'J' && card2.suit === trumpSuit;
  
  if (isRightBower1 && !isRightBower2) return 1;
  if (!isRightBower1 && isRightBower2) return -1;
  if (isRightBower1 && isRightBower2) return 0; // Should never happen in practice
  
  // Left bower (Jack of same color suit)
  const leftBowerSuit = getLeftBowerSuit(trumpSuit);
  const isLeftBower1 = card1.rank === 'J' && card1.suit === leftBowerSuit;
  const isLeftBower2 = card2.rank === 'J' && card2.suit === leftBowerSuit;
  
  if (isLeftBower1 && !isLeftBower2) return 1;
  if (!isLeftBower1 && isLeftBower2) return -1;
  if (isLeftBower1 && isLeftBower2) return 0; // Should never happen
  
  // Normal rank comparison for other trump cards
  return compareCardRanks(card1, card2, trumpSuit);
}

// Compare regular card ranks
function compareCardRanks(card1, card2, trumpSuit) {
  const rankValues = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5};
  return rankValues[card1.rank] - rankValues[card2.rank];
}

// Get numeric rank value for sorting
function getCardRankValue(card, trumpSuit) {
  const rankValues = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5};
  
  // Special case for bowers
  if (card.rank === 'J') {
    if (card.suit === trumpSuit) {
      return 100; // Right bower is highest
    }
    if (card.suit === getLeftBowerSuit(trumpSuit)) {
      return 99; // Left bower is second highest
    }
  }
  
  return rankValues[card.rank];
}

// Get the effective suit of a card (accounting for bowers)
function getEffectiveSuit(card, trumpSuit) {
  // Left bower counts as trump suit
  if (card.rank === 'J' && card.suit === getLeftBowerSuit(trumpSuit)) {
    return trumpSuit;
  }
  return card.suit;
}

// Process the next player in the trick
function processNextTrickPlayer(io, roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  // Check if trick is complete (all 4 players played)
  if (euchreState.currentTrick.length === 4) {
    // Process completed trick
    processCompletedTrick(io, roomId);
    return;
  }
  
  // Not complete, move to next player
  // Find the current player's seat number
  let currentSeatNum = null;
  for (const [seatNum, id] of Object.entries(room.playerSeats)) {
    if (id === euchreState.currentPlayer) {
      currentSeatNum = parseInt(seatNum);
      break;
    }
  }
  
  if (!currentSeatNum) {
    console.error('Could not find current player seat number');
    return;
  }
  
  // Calculate next seat number
  //const nextSeatNum = currentSeatNum < 4 ? currentSeatNum + 1 : 1;
  let nextSeatNum;
  if (currentSeatNum === 1) nextSeatNum = 4;
  else if (currentSeatNum === 4) nextSeatNum = 3;
  else if (currentSeatNum === 3) nextSeatNum = 2;
  else if (currentSeatNum === 2) nextSeatNum = 1;
  else nextSeatNum = 1;
  const nextPlayerId = room.playerSeats[nextSeatNum];
  
  if (!nextPlayerId) {
    console.error('No player found at next seat:', nextSeatNum);
    return;
  }
  
  // Set new current player
  euchreState.currentPlayer = nextPlayerId;
  console.log('Next player:', euchreState.currentPlayer);
  
  // Broadcast updated state
  broadcastGameState(io, roomId);
  
  // Check if next player is CPU
  if (nextPlayerId.startsWith('cpu_')) {
    // Schedule CPU play after a delay
    setTimeout(() => {
      handleCPUCardPlay(io, roomId, nextPlayerId);
    }, 1500);
  }
}

// Process a completed trick
function processCompletedTrick(io, roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  // Determine the winning play
  const winningPlay = getCurrentWinningPlay(euchreState);
  const winningPlayer = winningPlay.player;
  
  console.log('Trick winner:', winningPlayer, room.playerNames[winningPlayer]);
  
  // Update trick count for the winner
  if (!euchreState.tricksWon[winningPlayer]) {
    euchreState.tricksWon[winningPlayer] = 0;
  }
  euchreState.tricksWon[winningPlayer]++;
  
  // Add to game log
  addToGameLog(euchreState, `${room.playerNames[winningPlayer]} won the trick`);
  
  // Check if hand is complete (all cards played)
  const handComplete = Object.values(euchreState.hands).every(hand => hand.length === 0);
  
  if (handComplete) {
    // Score the hand
    processHandScoring(io, roomId);
  } else {
    // Start new trick with winner leading
    euchreState.currentPlayer = winningPlayer;
    euchreState.currentTrick = [];
    
    // Broadcast updated state
    broadcastGameState(io, roomId);
    
    // Check if next player is CPU
    if (winningPlayer.startsWith('cpu_')) {
      // Schedule CPU play after a delay
      setTimeout(() => {
        handleCPUCardPlay(io, roomId, winningPlayer);
      }, 1500);
    }
  }
}

// Process scoring after a hand is complete
function processHandScoring(io, roomId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  console.log('Hand complete, processing scoring');
  
  // Count tricks for each team
  let team1Tricks = 0;
  let team2Tricks = 0;
  
  // Loop through seated players by seat number
  for (const [seatNum, playerId] of Object.entries(room.playerSeats)) {
    const seatNumber = parseInt(seatNum);
    const tricks = euchreState.tricksWon[playerId] || 0;
    
    // Team 1 is seats 1 & 3, Team 2 is seats 2 & 4
    if (seatNumber === 1 || seatNumber === 3) {
      team1Tricks += tricks;
    } else {
      team2Tricks += tricks;
    }
  }
  
  console.log('Team 1 tricks:', team1Tricks);
  console.log('Team 2 tricks:', team2Tricks);
  
  // Determine which team made the bid
  let makerTeam = 0; // 0=team1, 1=team2
  for (const [seatNum, playerId] of Object.entries(room.playerSeats)) {
    if (playerId === euchreState.maker) {
      const seatNumber = parseInt(seatNum);
      makerTeam = (seatNumber === 1 || seatNumber === 3) ? 0 : 1;
      break;
    }
  }
  
  console.log('Maker team:', makerTeam === 0 ? 'Team 1' : 'Team 2');
  
  // Calculate scores
  let team1Score = 0;
  let team2Score = 0;
  
  if (makerTeam === 0) { // Team 1 made the bid
    if (team1Tricks >= 3) {
      if (team1Tricks === 5) {
        team1Score = 2; // All 5 tricks = 2 points
        addToGameLog(euchreState, 'Team 1 made a march! +2 points');
      } else {
        team1Score = 1; // 3-4 tricks = 1 point
        addToGameLog(euchreState, 'Team 1 made their bid. +1 point');
      }
    } else {
      team2Score = 2; // Euchre (failed to make bid) = 2 points for opponents
      addToGameLog(euchreState, 'Team 1 was euchred! Team 2 gets +2 points');
    }
  } else { // Team 2 made the bid
    if (team2Tricks >= 3) {
      if (team2Tricks === 5) {
        team2Score = 2; // All 5 tricks = 2 points
        addToGameLog(euchreState, 'Team 2 made a march! +2 points');
      } else {
        team2Score = 1; // 3-4 tricks = 1 point
        addToGameLog(euchreState, 'Team 2 made their bid. +1 point');
      }
    } else {
      team1Score = 2; // Euchre (failed to make bid) = 2 points for opponents
      addToGameLog(euchreState, 'Team 2 was euchred! Team 1 gets +2 points');
    }
  }
  
  // Update game scores
  euchreState.teamScores[0] += team1Score;
  euchreState.teamScores[1] += team2Score;
  
  console.log('Updated scores - Team 1:', euchreState.teamScores[0], 'Team 2:', euchreState.teamScores[1]);
  
  // Check if game is over (first to 10 points)
  if (euchreState.teamScores[0] >= 10 || euchreState.teamScores[1] >= 10) {
    // Game over
    euchreState.gamePhase = 'gameover';
    const winningTeam = euchreState.teamScores[0] >= 10 ? 'Team 1' : 'Team 2';
    addToGameLog(euchreState, `Game over! ${winningTeam} wins!`);
  } else {
    // Prepare for next hand
    prepareNextHand(euchreState, room);
  }
  
  // Broadcast final state
  broadcastGameState(io, roomId);
}

// Prepare for the next hand
function prepareNextHand(euchreState, room) {
  // Move dealer position
  euchreState.dealerPosition = (euchreState.dealerPosition + 1) % 4;
  
  // Reset game state for new hand
  euchreState.gamePhase = 'idle';
  euchreState.currentTrick = [];
  euchreState.trumpSuit = null;
  euchreState.maker = null;
  euchreState.bidsMade = 0;
  
  // Reset tricks won
  for (const playerId of room.seatedPlayers) {
    euchreState.tricksWon[playerId] = 0;
  }
  
  addToGameLog(euchreState, 'Ready for next hand. Click Deal to continue.');
}


// CPU bidding logic
function cpuBid(io, roomId, cpuId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  console.log(`CPU ${cpuId} is bidding`);
  
  // Create a mock socket object with the necessary properties
  const mockSocket = { 
    id: cpuId, 
    roomId: roomId 
  };
  
  // Pass the mock socket instead of just the cpuId
  handleEuchreBid(io, mockSocket, { action: 'pass' });
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
  handleCPUCardPlay(io, roomId, cpuId);
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
  checkForCPUTurn,
  fillEmptySeatsWithCPUs,
  broadcastGameState,
  getFilteredGameState,
  handleCPUCardPlay,
  cpuBid,
  cpuPlayCard,
  handleCPUTurns
};