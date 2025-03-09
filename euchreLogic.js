/**
 * Euchre Logic (Main Integration File)
 * Brings together all modular Euchre components
 */

// Import from room logic
const { roomStates } = require('./roomLogic');

// Import core game functions
const {
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
} = require('./euchreGameCore');

// Import card utilities
const {
  isSameColor,
  getLeftBowerSuit,
  getEffectiveSuit,
  getCardValue,
  compareCards,
  findLowestCard
} = require('./euchreCardUtils');

// Import trick playing mechanics
const {
  handlePlayCard,
  processNextPlayer,
  processCompletedTrick,
  getPlayerTeam,
  getCurrentWinningPlay,
  arePartners
} = require('./euchreTrickPlay');

// Import scoring logic
const {
  processHandScoring,
  prepareNextHand
} = require('./euchreScoring');

// Import CPU player logic
const {
  processCPUTurn,
  decideCPUBid,
  decideCPUCardPlay,
  checkForCPUTurns
} = require('./euchreCPU');

// Handle bidding actions
// Handle bidding actions
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
    
    // Handle first round of bidding
    if (euchreState.gamePhase === 'bidding1') {
      if (bid.action === 'orderUp' || bid.action === 'orderUpAlone') {
        console.log(`********** ORDER UP ACTION **********`);
        console.log('Player ordering up suit:', bid.suit);
        
        // Set trump suit and maker
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Handle going alone option
        euchreState.isGoingAlone = bid.action === 'orderUpAlone';
        euchreState.alonePlayer = bid.action === 'orderUpAlone' ? playerId : null;
        
        // Find dealer's position and ID
        const dealerPosition = euchreState.dealerPosition;
        const dealerSeatNum = (dealerPosition % 4) + 1; // Convert 0-3 to 1-4
        const dealerId = room.playerSeats[dealerSeatNum];

        //euchreState.gamePhase = 'discard';
        //euchreState.currentPlayer = dealerId; // Set dealer as current player for discard
        
        // Add the turn-up card to dealer's hand
        if (euchreState.hands[dealerId]) {
          console.log('Adding turn-up card to dealer hand');
          euchreState.hands[dealerId].push(euchreState.turnUpCard);
          const discardedCard = euchreState.hands[dealerId].shift();
          console.log('Dealer discarded:', discardedCard);
        }
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        
        // Player to left of dealer leads - clockwise
        // Determine the correct lead seat in clockwise rotation
        let leadSeatNum;
        if (dealerSeatNum === 1) leadSeatNum = 4;
        else if (dealerSeatNum === 2) leadSeatNum = 1;
        else if (dealerSeatNum === 3) leadSeatNum = 2;
        else if (dealerSeatNum === 4) leadSeatNum = 3;
        else leadSeatNum = 4; // Fallback
        
        console.log('Dealer seat:', dealerSeatNum);
        console.log('Lead seat:', leadSeatNum);
        
        const leadPlayerId = room.playerSeats[leadSeatNum];
        
        if (leadPlayerId) {
          euchreState.currentPlayer = leadPlayerId;
          euchreState.firstPositionId = leadPlayerId; // Set first position
          console.log('Current player now set to:', leadPlayerId);
        }
        
        // Add game log entry with alone info if applicable
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `${playerName} ordered up ${euchreState.trumpSuit} and is going ALONE!`);
        } else {
          addToGameLog(euchreState, `${playerName} ordered up ${euchreState.trumpSuit}`);
        }
        if (dealerId.startsWith('cpu_')) {
          console.log(`CPU dealer ${dealerId} needs to discard`);
          
          // Schedule CPU discard
          setTimeout(() => {
            handleCPUDiscard(io, roomId, dealerId);
          }, 2000);
        }

      } 
      else if (bid.action === 'pass') {
        // Player passes - increment count
        euchreState.bidsMade++;
        addToGameLog(euchreState, `${playerName} passed`);

        // Find the current player's seat number
        let currentSeatNum = null;
        for (const [seatNum, id] of Object.entries(room.playerSeats)) {
          if (id === playerId) {
            currentSeatNum = parseInt(seatNum);
            break;
          }
        }
        
        if (currentSeatNum) {
          // Calculate next seat number in CLOCKWISE direction
          let nextSeatNum;
          if (currentSeatNum === 1) nextSeatNum = 4;
          else if (currentSeatNum === 4) nextSeatNum = 3;
          else if (currentSeatNum === 3) nextSeatNum = 2;
          else if (currentSeatNum === 2) nextSeatNum = 1;
          else nextSeatNum = 1; // Fallback
          
          // Get player ID at that seat
          const nextPlayerId = room.playerSeats[nextSeatNum];
          if (nextPlayerId) {
            euchreState.currentPlayer = nextPlayerId;
          }
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed, move to second round of bidding
          euchreState.gamePhase = 'bidding2';
          euchreState.bidsMade = 0;
          
          // Turn down the card (it's no longer available)
          const oldTurnUpSuit = euchreState.turnUpCard.suit;
          addToGameLog(euchreState, `Everyone passed. Turn down ${oldTurnUpSuit}.`);
          
          // First player after dealer gets to choose suit - to the LEFT (clockwise)
          const dealerPosition = euchreState.dealerPosition;
          const dealerSeatNum = (dealerPosition % 4) + 1;
          
          // Calculate the first bidder seat in clockwise rotation
          let firstSeatNum;
          if (dealerSeatNum === 1) firstSeatNum = 4;
          else if (dealerSeatNum === 2) firstSeatNum = 1;
          else if (dealerSeatNum === 3) firstSeatNum = 2;
          else if (dealerSeatNum === 4) firstSeatNum = 3;
          else firstSeatNum = 4; // Fallback
          
          const firstPlayerId = room.playerSeats[firstSeatNum];
          
          if (firstPlayerId) {
            euchreState.currentPlayer = firstPlayerId;
          }
        }
      }
    } 
    // Handle second round of bidding
    else if (euchreState.gamePhase === 'bidding2') {
      if (bid.action === 'callSuit' || bid.action === 'callSuitAlone') {
        console.log('Player calling suit...');
        // Player calls a suit
        euchreState.trumpSuit = bid.suit;
        euchreState.maker = playerId;
        
        // Handle going alone option
        euchreState.isGoingAlone = bid.action === 'callSuitAlone';
        euchreState.alonePlayer = bid.action === 'callSuitAlone' ? playerId : null;
        
        // Move to playing phase
        euchreState.gamePhase = 'playing';
        
        // Player to left of dealer leads
        const dealerPosition = euchreState.dealerPosition;
        const dealerSeatNum = (dealerPosition % 4) + 1;
        
        // Calculate lead seat in clockwise rotation
        let leadSeatNum;
        if (dealerSeatNum === 1) leadSeatNum = 4;
        else if (dealerSeatNum === 2) leadSeatNum = 1;
        else if (dealerSeatNum === 3) leadSeatNum = 2;
        else if (dealerSeatNum === 4) leadSeatNum = 3;
        else leadSeatNum = 4; // Fallback
        
        const leadPlayerId = room.playerSeats[leadSeatNum];
        
        if (leadPlayerId) {
          euchreState.currentPlayer = leadPlayerId;
          euchreState.firstPositionId = leadPlayerId; // Set first position
        }
        
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `${playerName} called ${euchreState.trumpSuit} as trump and is going ALONE!`);
        } else {
          addToGameLog(euchreState, `${playerName} called ${euchreState.trumpSuit} as trump`);
        }
      } 
      else if (bid.action === 'pass') {
        // Handle passing in round 2
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
          // Calculate next seat in clockwise rotation
          let nextSeatNum;
          if (currentSeatNum === 1) nextSeatNum = 4;
          else if (currentSeatNum === 4) nextSeatNum = 3;
          else if (currentSeatNum === 3) nextSeatNum = 2;
          else if (currentSeatNum === 2) nextSeatNum = 1;
          else nextSeatNum = 1; // Fallback
          
          const nextPlayerId = room.playerSeats[nextSeatNum];
          if (nextPlayerId) {
            euchreState.currentPlayer = nextPlayerId;
          }
        }
        
        if (euchreState.bidsMade >= 4) {
          // All players passed again, redeal
          addToGameLog(euchreState, `Everyone passed. Redealing.`);
          
          // Move dealer position clockwise (to the left)
          euchreState.dealerPosition = (euchreState.dealerPosition + 3) % 4;
          
          // Reset and redeal
          createDeck(euchreState);
          shuffleDeck(euchreState);
          dealCards(euchreState, room);
          
          // Start bidding over
          euchreState.gamePhase = 'bidding1';
          euchreState.bidsMade = 0;
          
          // First player after dealer starts bidding (using seat numbers)
          const dealerSeat = (euchreState.dealerPosition % 4) + 1;
          
          // Calculate first bidder seat in clockwise rotation
          let firstSeat;
          if (dealerSeat === 1) firstSeat = 4;
          else if (dealerSeat === 2) firstSeat = 1;
          else if (dealerSeat === 3) firstSeat = 2;
          else if (dealerSeat === 4) firstSeat = 3;
          else firstSeat = 4; // Fallback
          
          const firstPlayerId = room.playerSeats[firstSeat];
          
          if (firstPlayerId) {
            euchreState.currentPlayer = firstPlayerId;
            euchreState.firstPositionId = firstPlayerId;
            
            // If first player is CPU, schedule their turn
            if (firstPlayerId.startsWith('cpu_')) {
              setTimeout(() => {
                if (room.euchre && room.euchre.currentPlayer === firstPlayerId) {
                  processCPUTurn(io, roomId, firstPlayerId);
                }
              }, 2000);
            }
          }
        }
      }
    }
    
    // Broadcast the updated game state
    broadcastGameState(io, roomId);
    
    // Schedule CPU turns if needed
    if (euchreState.currentPlayer && euchreState.currentPlayer.startsWith('cpu_')) {
      setTimeout(() => {
        // Verify CPU is still current player
        if (room.euchre && room.euchre.currentPlayer === euchreState.currentPlayer) {
          processCPUTurn(io, roomId, euchreState.currentPlayer);
        }
      }, 1500);
    }
  } catch (error) {
    console.error('Unexpected error in handleEuchreBid:', error);
    console.error(error.stack);
  }
}

function handleCPUDiscard(io, roomId, cpuId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive) return;
  
  const euchreState = room.euchre;
  if (!euchreState || euchreState.gamePhase !== 'discard') return;
  
  // Simple strategy: discard lowest card (not accounting for strategy)
  const hand = euchreState.hands[cpuId];
  if (!hand || hand.length === 0) {
    console.error('CPU hand is empty, cannot discard');
    return;
  }
  
  // Find lowest card
  const lowestCardIndex = findLowestCard(hand, euchreState.trumpSuit);
  
  console.log(`CPU ${cpuId} discarding card at index ${lowestCardIndex}`);
  
  // Create mock socket for compatibility
  const mockSocket = {
    id: cpuId,
    roomId: roomId
  };
  
  // Call the regular discard handler
  handleEuchreDiscard(io, mockSocket, lowestCardIndex);
}

function handleEuchreDiscard(io, socket, cardIndex) {
  const roomId = socket.roomId;
  const room = roomStates[roomId];
  
  if (!room || !room.gameActive || room.gameType !== 'euchre') {
    console.error('Invalid room state for discard');
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState || euchreState.gamePhase !== 'discard') {
    console.error('Not in discard phase');
    return;
  }
  
  // Check if this player is the dealer
  const dealerSeatNum = (euchreState.dealerPosition % 4) + 1;
  const dealerId = room.playerSeats[dealerSeatNum];
  
  if (socket.id !== dealerId) {
    console.error('Only the dealer can discard');
    return;
  }
  
  // Make sure card index is valid
  const hand = euchreState.hands[socket.id];
  if (!hand || cardIndex < 0 || cardIndex >= hand.length) {
    console.error('Invalid card index for discard');
    return;
  }
  
  console.log(`Dealer discarding card at index ${cardIndex}`);
  
  // Remove the card at the specified index
  const discardedCard = hand.splice(cardIndex, 1)[0];
  console.log('Discarded card:', discardedCard);
  
  // Add the turn-up card to the dealer's hand
  hand.push(euchreState.turnUpCard);
  console.log('Added turn-up card:', euchreState.turnUpCard);
  
  // Add to game log
  addToGameLog(euchreState, `${room.playerNames[socket.id]} discarded a card and took the ${euchreState.turnUpCard.rank} of ${euchreState.turnUpCard.suit}`);
  
  // Move to playing phase
  euchreState.gamePhase = 'playing';
  
  // Determine lead player (left of dealer)
  let leadSeatNum;
  if (dealerSeatNum === 1) leadSeatNum = 4;
  else if (dealerSeatNum === 2) leadSeatNum = 1;
  else if (dealerSeatNum === 3) leadSeatNum = 2;
  else if (dealerSeatNum === 4) leadSeatNum = 3;
  else leadSeatNum = 4; // Fallback
  
  const leadPlayerId = room.playerSeats[leadSeatNum];
  
  if (leadPlayerId) {
    euchreState.currentPlayer = leadPlayerId;
    euchreState.firstPositionId = leadPlayerId;
    console.log('Lead player is now:', leadPlayerId);
  }
  
  // Reset for a clean trick
  euchreState.currentTrick = [];
  
  // Verify all hands have the correct number of cards (should be 5 each)
  console.log('Verifying hand sizes after discard:');
  for (const playerId of room.seatedPlayers) {
    if (euchreState.hands[playerId]) {
      console.log(`Player ${playerId} has ${euchreState.hands[playerId].length} cards`);
      // If any player doesn't have exactly 5 cards, log an error
      if (euchreState.hands[playerId].length !== 5) {
        console.error(`ERROR: Player ${playerId} has ${euchreState.hands[playerId].length} cards instead of 5`);
      }
    } else {
      console.error(`ERROR: Player ${playerId} has no hand`);
    }
  }
  
  // Broadcast updated game state
  broadcastGameState(io, roomId);
  
  // Check if the next player is a CPU
  if (euchreState.currentPlayer && euchreState.currentPlayer.startsWith('cpu_')) {
    setTimeout(() => {
      checkForCPUTurns(io, roomId);
    }, 1500);
  }
}

// Export all functions for use in the rest of the application
module.exports = {
  // Core game functions
  startEuchreGame,
  fillEmptySeatsWithCPUs,
  broadcastGameState,
  getFilteredGameState,
  
  // Bidding and card play
  handleEuchreBid,
  handlePlayCard,
  handleEuchrePlayCard: handlePlayCard,
  handleEuchreDiscard,
  
  // CPU functions
  checkForCPUTurns,
  handleCPUDiscard,
  processCPUTurn
};