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
    }
  }
  
  // Log final state
  console.log('Room after filling with CPUs:');
  console.log('- Seated players:', room.seatedPlayers.length);
  console.log('- Player seats:', Object.keys(room.playerSeats).length);
  console.log('- Teams:', room.teams);
}

function startEuchreGame(io, roomId) {
  const room = roomStates[roomId];
  if (!room) {
    console.log('Room not found:', roomId);
    return;
  }
  
  console.log('Starting Euchre game for room:', roomId);
  
  // Ensure we have players in all seats
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
  
  // Log the game start
  addToGameLog(euchreState, "Game started. Bidding begins.");
  
  // Update active rooms to reflect game is active
  updateActiveRooms();
  io.emit('updateActiveRooms', updateActiveRooms());
  
  console.log('Emitting initial game state, current player:', euchreState.currentPlayer);
  
  // Emit the initial game state to all players
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room
  });
  
  // If it's a CPU's turn, handle it after a short delay
  setTimeout(() => {
    checkForCPUTurn(io, roomId);
  }, 1000);
}

function getFilteredGameState(euchreState, room) {
  // Create a copy of the game state
  const filteredState = JSON.parse(JSON.stringify(euchreState));
  
  // Add some additional info
  filteredState.teams = room.teams;
  
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
  
  // First player after dealer starts bidding
  const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
  euchreState.currentPlayer = room.seatedPlayers[starterIndex];
  
  console.log('Starting bidding, first player:', euchreState.currentPlayer);
}

function addToGameLog(euchreState, message) {
  if (euchreState.gameLog.length > 20) {
    euchreState.gameLog.shift(); // Keep log at reasonable size
  }
  euchreState.gameLog.push(message);
  console.log('Game log:', message);
}

function handleEuchreBid(io, socket, bid) {
  const roomId = socket.roomId || socket.id;
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
  
  // Make sure it's the current player's turn
  const playerId = socket.id || socket;
  if (euchreState.currentPlayer !== playerId) {
    console.log('Not the current player\'s turn:', playerId, 'vs', euchreState.currentPlayer);
    return;
  }
  
  const playerName = room.playerNames[playerId];
  console.log(`Player ${playerName} (${playerId}) is bidding:`, bid.action);
  
  // Process bid based on game phase
  if (euchreState.gamePhase === 'bidding1') {
    if (bid.action === 'orderUp') {
      // Player orders up the turned card
      euchreState.trumpSuit = bid.suit;
      euchreState.maker = playerId;
      
      // Identify the dealer's team (1 or 2)
      const dealerSeatNum = parseInt(Object.keys(room.playerSeats).find(seatNum => 
        room.playerSeats[seatNum] === room.seatedPlayers[euchreState.dealerPosition]
      ));
      
      // Find dealer's player ID
      const dealerId = room.seatedPlayers[euchreState.dealerPosition];
      
      // Add the turn-up card to dealer's hand (replacing their worst card)
      euchreState.hands[dealerId].push(euchreState.turnUpCard);
      
      // For simplicity, just discard the first card (in a real game, player would choose)
      euchreState.hands[dealerId].shift();
      
      // Move to playing phase
      euchreState.gamePhase = 'playing';
      
      // Player to left of dealer leads
      const leadPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
      euchreState.currentPlayer = room.seatedPlayers[leadPlayerIndex];
      
      addToGameLog(euchreState, `${playerName} ordered up ${euchreState.trumpSuit}`);
    } 
    else if (bid.action === 'pass') {
      // Player passes
      euchreState.bidsMade++;
      addToGameLog(euchreState, `${playerName} passed`);
      
      if (euchreState.bidsMade >= 4) {
        // All players passed, move to second round of bidding
        euchreState.gamePhase = 'bidding2';
        euchreState.bidsMade = 0;
        
        // Turn down the card (it's no longer available)
        const oldTurnUpSuit = euchreState.turnUpCard.suit;
        addToGameLog(euchreState, `Everyone passed. Turn down ${oldTurnUpSuit}.`);
        
        // First player gets to choose suit
        const firstPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
        euchreState.currentPlayer = room.seatedPlayers[firstPlayerIndex];
      } 
      else {
        // Move to next player
        const nextPlayerIndex = (room.seatedPlayers.indexOf(playerId) + 1) % room.seatedPlayers.length;
        euchreState.currentPlayer = room.seatedPlayers[nextPlayerIndex];
      }
    }
  } 
  else if (euchreState.gamePhase === 'bidding2') {
    if (bid.action === 'callSuit') {
      // Player calls a suit
      euchreState.trumpSuit = bid.suit;
      euchreState.maker = playerId;
      
      // Move to playing phase
      euchreState.gamePhase = 'playing';
      
      // Player to left of dealer leads
      const leadPlayerIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
      euchreState.currentPlayer = room.seatedPlayers[leadPlayerIndex];
      
      addToGameLog(euchreState, `${playerName} called ${euchreState.trumpSuit} as trump`);
    } 
    else if (bid.action === 'pass') {
      // Player passes
      euchreState.bidsMade++;
      addToGameLog(euchreState, `${playerName} passed`);
      
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
        euchreState.currentPlayer = room.seatedPlayers[starterIndex];
      } 
      else {
        // Move to next player
        const nextPlayerIndex = (room.seatedPlayers.indexOf(playerId) + 1) % room.seatedPlayers.length;
        euchreState.currentPlayer = room.seatedPlayers[nextPlayerIndex];
      }
    }
  }
  
  // Log the current player
  console.log('Current player is now:', euchreState.currentPlayer);
  
  // Update game state for all players
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room 
  });
  
  // Check if next player is CPU
  setTimeout(() => {
    checkForCPUTurn(io, roomId);
  }, 1000);
}

function handleEuchrePlayCard(io, socket, cardIndex) {
  const roomId = socket.roomId || socket.id;
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') return;
  
  const euchreState = room.euchre;
  if (!euchreState || euchreState.gamePhase !== 'playing') return;
  
  // Make sure it's the current player's turn
  const playerId = socket.id || socket;
  if (euchreState.currentPlayer !== playerId) return;
  
  // Get the player's hand
  const hand = euchreState.hands[playerId];
  if (!hand || cardIndex >= hand.length) return;
  
  const playedCard = hand[cardIndex];
  const playerName = room.playerNames[playerId];
  
  // Check if this is the first card of the trick
  if (euchreState.currentTrick.length === 0) {
    // Leading the trick - any card is valid
    euchreState.leadSuit = playedCard.suit;
  } 
  else {
    // Following - must match lead suit if possible
    if (playedCard.suit !== euchreState.leadSuit) {
      // Check if player could have followed suit
      if (hand.some(card => card.suit === euchreState.leadSuit)) {
        // Invalid play - must follow suit if possible
        return;
      }
    }
  }
  
  // Add the card to the current trick
  euchreState.currentTrick.push({
    player: playerId,
    card: playedCard
  });
  
  // Remove the card from the player's hand
  euchreState.hands[playerId].splice(cardIndex, 1);
  
  addToGameLog(euchreState, `${playerName} played ${playedCard.rank} of ${playedCard.suit}`);
  
  // Check if the trick is complete (4 cards played)
  if (euchreState.currentTrick.length === 4) {
    // Determine trick winner
    const winnerInfo = determineTrickWinner(euchreState);
    const winnerId = winnerInfo.winnerId;
    const winnerName = room.playerNames[winnerId];
    
    euchreState.trickWinner = winnerId;
    euchreState.tricksWon[winnerId] = (euchreState.tricksWon[winnerId] || 0) + 1;
    
    // Determine which team won the trick
    const winnerSeatNum = parseInt(Object.keys(room.playerSeats).find(seatNum => 
      room.playerSeats[seatNum] === winnerId
    ));
    const winnerTeam = (winnerSeatNum === 1 || winnerSeatNum === 3) ? 0 : 1; // 0 for team 1, 1 for team 2
    
    euchreState.teamTricks[winnerTeam]++;
    
    addToGameLog(euchreState, `${winnerName} won the trick`);
    
    // Check if the hand is complete (5 tricks played)
    if (Object.values(euchreState.hands).every(hand => hand.length === 0)) {
      // Hand is complete - calculate scores
      const makerTeam = determineMakerTeam(euchreState, room);
      let pointsScored = 0;
      const makerTeamTricks = euchreState.teamTricks[makerTeam];
      
      if (makerTeamTricks >= 3) {
        if (makerTeamTricks === 5) {
          // All tricks - march - 2 points
          pointsScored = 2;
          addToGameLog(euchreState, `Team ${makerTeam + 1} made a march! +2 points`);
        } else {
          // 3 or 4 tricks - made it - 1 point
          pointsScored = 1;
          addToGameLog(euchreState, `Team ${makerTeam + 1} made it! +1 point`);
        }
      } else {
        // Euchred - defending team gets 2 points
        const defenderTeam = makerTeam === 0 ? 1 : 0;
        euchreState.teamScores[defenderTeam] += 2;
        addToGameLog(euchreState, `Team ${makerTeam + 1} was euchred! Team ${defenderTeam + 1} gets +2 points`);
      }
      
      // Add points to maker team
      euchreState.teamScores[makerTeam] += pointsScored;
      
      // Check for game end (first to 10 points)
      if (euchreState.teamScores[0] >= 10 || euchreState.teamScores[1] >= 10) {
        euchreState.gamePhase = 'gameover';
        const winningTeam = euchreState.teamScores[0] >= 10 ? 1 : 2;
        addToGameLog(euchreState, `Game over! Team ${winningTeam} wins!`);
      } else {
        // Move to next hand
        euchreState.dealerPosition = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
        euchreState.teamTricks = [0, 0];
        
        // Reset and redeal
        createDeck(euchreState);
        shuffleDeck(euchreState);
        dealCards(euchreState, room);
        
        // Start bidding for next hand
        euchreState.gamePhase = 'bidding1';
        euchreState.bidsMade = 0;
        euchreState.turnUpCard = null;
        euchreState.trumpSuit = null;
        euchreState.maker = null;
        
        // First player after dealer starts bidding
        const starterIndex = (euchreState.dealerPosition + 1) % room.seatedPlayers.length;
        euchreState.currentPlayer = room.seatedPlayers[starterIndex];
        
        addToGameLog(euchreState, `Starting new hand. Dealer is ${room.playerNames[room.seatedPlayers[euchreState.dealerPosition]]}`);
      }
    } else {
      // Continue with next trick - winner leads
      euchreState.currentPlayer = winnerId;
    }
    
    // Clear the current trick after a short delay
    setTimeout(() => {
      euchreState.currentTrick = [];
      euchreState.trickWinner = null;
      euchreState.leadSuit = null;
      
      // Update game state for all players
      io.to(roomId).emit('euchreGameState', { 
        gameState: getFilteredGameState(euchreState, room),
        roomState: room 
      });
      
      // Check if next player is CPU
      setTimeout(() => {
        checkForCPUTurn(io, roomId);
      }, 1000);
    }, 1500);
  } else {
    // Move to next player
    const currentPlayerIndex = room.seatedPlayers.indexOf(playerId);
    const nextPlayerIndex = (currentPlayerIndex + 1) % room.seatedPlayers.length;
    euchreState.currentPlayer = room.seatedPlayers[nextPlayerIndex];
  }
  
  // Update game state for all players
  io.to(roomId).emit('euchreGameState', { 
    gameState: getFilteredGameState(euchreState, room),
    roomState: room 
  });
  
  // Check if next player is CPU
  setTimeout(() => {
    checkForCPUTurn(io, roomId);
  }, 1000);
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

// Handle CPU actions
function handleCPUTurns(io, roomId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive || room.gameType !== 'euchre') {
    console.log('Invalid room for CPU turn');
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState) {
    console.log('No euchre state for CPU turn');
    return;
  }
  
  // Check if it's a CPU's turn
  const currentPlayerId = euchreState.currentPlayer;
  if (!currentPlayerId || !currentPlayerId.startsWith('cpu_')) {
    console.log('Not a CPU turn:', currentPlayerId);
    return;
  }
  
  console.log(`CPU turn for player: ${currentPlayerId}`);
  
  // Delay the CPU move to make it feel more natural
  setTimeout(() => {
    // Handle different game phases
    if (euchreState.gamePhase === 'bidding1') {
      cpuBid(io, roomId, currentPlayerId);
    } 
    else if (euchreState.gamePhase === 'bidding2') {
      cpuBid(io, roomId, currentPlayerId);
    } 
    else if (euchreState.gamePhase === 'playing') {
      cpuPlayCard(io, roomId, currentPlayerId);
    }
  }, 1500);
}

// CPU bidding logic
function cpuBid(io, roomId, cpuId) {
  const room = roomStates[roomId];
  const euchreState = room.euchre;
  
  if (!euchreState) {
    console.log('No euchre state for CPU bid');
    return;
  }
  
  console.log('CPU bidding, game phase:', euchreState.gamePhase);
  
  if (euchreState.gamePhase === 'bidding1') {
    // 30% chance to order up in first round
    if (Math.random() < 0.3) {
      // Order up
      console.log('CPU ordering up');
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'orderUp', suit: euchreState.turnUpCard.suit });
    } else {
      // Pass
      console.log('CPU passing');
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'pass' });
    }
  } 
  else if (euchreState.gamePhase === 'bidding2') {
    // 40% chance to call a suit in second round
    if (Math.random() < 0.4) {
      // Select a random suit that isn't the turn-up suit
      const availableSuits = ['hearts', 'diamonds', 'clubs', 'spades'].filter(s => 
        s !== euchreState.turnUpCard.suit
      );
      const selectedSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
      
      console.log('CPU calling suit:', selectedSuit);
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'callSuit', suit: selectedSuit });
    } else {
      // Pass
      console.log('CPU passing in second round');
      handleEuchreBid(io, { id: cpuId, roomId }, { action: 'pass' });
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
  handleEuchrePlayCard(io, { id: cpuId, roomId }, cardIndex);
}

function checkForCPUTurn(io, roomId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive) {
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState) {
    return;
  }
  
  const currentPlayerId = euchreState.currentPlayer;
  if (currentPlayerId && currentPlayerId.startsWith('cpu_')) {
    console.log('Triggering CPU turn for', currentPlayerId);
    handleCPUTurns(io, roomId);
  } else {
    console.log('Current player is not CPU:', currentPlayerId);
  }
}

module.exports = {
  startEuchreGame,
  handleEuchreBid,
  handleEuchrePlayCard,
  checkForCPUTurn,
  fillEmptySeatsWithCPUs
};