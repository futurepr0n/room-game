/**
 * Euchre CPU AI
 * Contains functions for CPU player decision making and automated play
 */

const { roomStates } = require('./roomLogic');
const { 
  getEffectiveSuit, 
  getLeftBowerSuit, 
  getCardValue, 
  findLowestCard 
} = require('./euchreCardUtils');
const { broadcastGameState, addToGameLog } = require('./euchreGameCore');
//const { getCurrentWinningPlay, arePartners } = require('./euchreTrickPlay');

// Handle CPU turns based on game phase
function processCPUTurn(io, roomId, cpuId) {
  console.log(`processCPUTurn called for room ${roomId}, CPU player ${cpuId}`);
  
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
  
  // Check if it's this CPU's turn
  const currentPlayerId = euchreState.currentPlayer;
  if (currentPlayerId !== cpuId) {
    console.error(`Not CPU ${cpuId}'s turn, current player is ${currentPlayerId}`);
    return;
  }

  console.log(`CPU turn for player: ${cpuId} in phase: ${euchreState.gamePhase}`);
  
  // Initialize timestamp tracking if needed
  if (!room.cpuLastTurnTime) room.cpuLastTurnTime = {};
  
  // Set timestamp for this turn
  room.cpuLastTurnTime[cpuId] = Date.now();
  
  // Process based on the game phase
  if (euchreState.gamePhase === 'bidding1' || euchreState.gamePhase === 'bidding2') {
    console.log(`CPU ${cpuId} is making a bid decision`);
    decideCPUBid(io, roomId, cpuId);
  } 
  else if (euchreState.gamePhase === 'playing') {
    console.log(`CPU ${cpuId} is making a card play decision`);
    decideCPUCardPlay(io, roomId, cpuId);
  }
}

function isPartnerCurrentlyWinning(euchreState, cpuId, room) {
  if (!euchreState || !euchreState.currentTrick || euchreState.currentTrick.length === 0) {
    return false;
  }
  
  try {
    // Find the current winning play
    const winningPlay = getCurrentWinningPlayLocal(euchreState);
    if (!winningPlay || !winningPlay.player) return false;
    
    // Check if winner is partner
    return arePartnersLocal(cpuId, winningPlay.player, room);
  } catch (error) {
    console.error('Error in isPartnerCurrentlyWinning:', error);
    return false; // Default to false on error
  }
}

  
  // Local implementation of getCurrentWinningPlay to avoid circular dependency
  function getCurrentWinningPlayLocal(euchreState) {
    if (!euchreState.currentTrick || euchreState.currentTrick.length === 0) return null;
    
    let winningPlay = euchreState.currentTrick[0];
    const leadCard = euchreState.currentTrick[0].card;
    const leadSuit = getEffectiveSuit(leadCard, euchreState.trumpSuit);
    
    for (let i = 1; i < euchreState.currentTrick.length; i++) {
      const play = euchreState.currentTrick[i];
      if (compareCards(play.card, winningPlay.card, leadSuit, euchreState.trumpSuit) > 0) {
        winningPlay = play;
      }
    }
    
    return winningPlay;
  }
  
  // Local implementation of arePartners to avoid circular dependency
  function arePartnersLocal(player1Id, player2Id, room) {
    if (!room || !room.playerSeats) return false;
    
    let seat1 = null;
    let seat2 = null;
    
    for (const [seatNum, playerId] of Object.entries(room.playerSeats)) {
      if (playerId === player1Id) seat1 = parseInt(seatNum);
      if (playerId === player2Id) seat2 = parseInt(seatNum);
    }
    
    if (!seat1 || !seat2) return false;
    
    // Players are partners if they are both on same team (1&3 or 2&4)
    return (seat1 % 2) === (seat2 % 2);
  }
  
  // Also need to add compareCards implementation
  function compareCards(card1, card2, leadSuit, trumpSuit) {
    const suit1 = getEffectiveSuit(card1, trumpSuit);
    const suit2 = getEffectiveSuit(card2, trumpSuit);
    
    // Trump beats non-trump
    if (suit1 === trumpSuit && suit2 !== trumpSuit) return 1;
    if (suit1 !== trumpSuit && suit2 === trumpSuit) return -1;
    
    // If both trump, compare ranks
    if (suit1 === trumpSuit && suit2 === trumpSuit) {
      return compareCardRanks(card1, card2);
    }
    
    // If neither trump, following lead suit beats not following
    if (suit1 === leadSuit && suit2 !== leadSuit) return 1;
    if (suit1 !== leadSuit && suit2 === leadSuit) return -1;
    
    // Otherwise compare by rank
    return compareCardRanks(card1, card2);
  }
  
  function compareCardRanks(card1, card2) {
    const rankValues = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5};
    return rankValues[card1.rank] - rankValues[card2.rank];
  }

// CPU bidding logic
function decideCPUBid(io, roomId, cpuId) {
  const room = roomStates[roomId];
  if (!room) return;
  
  const euchreState = room.euchre;
  if (!euchreState) return;
  
  console.log(`CPU ${cpuId} is bidding`);
  
  // Create a mock socket object for the bidding handler
  const mockSocket = { 
    id: cpuId, 
    roomId: roomId 
  };
  
  // Get the CPU's hand
  const hand = euchreState.hands[cpuId] || [];
  
  // Make bidding decision based on game phase
  if (euchreState.gamePhase === 'bidding1') {
    // First round - deciding whether to order up the turn-up card
    if (euchreState.turnUpCard) {
      const trumpSuit = euchreState.turnUpCard.suit;
      const leftBowerSuit = getLeftBowerSuit(trumpSuit);
      
      let trumpCount = 0;
      let hasRightBower = false;
      let hasLeftBower = false;
      let hasAce = false;
      
      hand.forEach(card => {
        if (card.suit === trumpSuit) {
          trumpCount++;
          if (card.rank === 'J') hasRightBower = true;
          if (card.rank === 'A') hasAce = true;
        }
        if (card.suit === leftBowerSuit && card.rank === 'J') {
          hasLeftBower = true;
          trumpCount++; // Count left bower as trump
        }
      });
      
      // CPU strategy for ordering up:
      // - 3+ trump cards
      // - Right bower
      // - Left bower and another trump
      // - Ace of trump and another trump
      if (trumpCount >= 3 || hasRightBower || (hasLeftBower && trumpCount >= 2) || (hasAce && trumpCount >= 2)) {
        // Consider going alone with a very strong hand
        const goAlone = hasRightBower && hasLeftBower && trumpCount >= 4;
        
        // Dynamic import to avoid circular dependency
        const { handleEuchreBid } = require('./euchreLogic');
        
        if (goAlone) {
          console.log(`CPU ${cpuId} ordering up ${trumpSuit} and going alone`);
          handleEuchreBid(io, mockSocket, { 
            action: 'orderUpAlone',
            suit: trumpSuit 
          });
        } else {
          console.log(`CPU ${cpuId} ordering up ${trumpSuit}`);
          handleEuchreBid(io, mockSocket, { 
            action: 'orderUp',
            suit: trumpSuit 
          });
        }
        return;
      }
    }
    
    // If we reach here, the CPU passes
    console.log(`CPU ${cpuId} passing in bidding1`);
    
    // Dynamic import to avoid circular dependency
    const { handleEuchreBid } = require('./euchreLogic');
    handleEuchreBid(io, mockSocket, { action: 'pass' });
  }
  else if (euchreState.gamePhase === 'bidding2') {
    // Second round - deciding whether to call a suit
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const disallowedSuit = euchreState.turnUpCard ? euchreState.turnUpCard.suit : null;
    
    let bestSuit = null;
    let bestSuitCount = 0;
    let hasJackInBestSuit = false;
    
    suits.forEach(suit => {
      if (suit !== disallowedSuit) {
        const leftBowerSuit = getLeftBowerSuit(suit);
        
        let suitCount = 0;
        let hasRightBower = false;
        let hasLeftBower = false;
        
        hand.forEach(card => {
          if (card.suit === suit) {
            suitCount++;
            if (card.rank === 'J') hasRightBower = true;
          }
          if (card.suit === leftBowerSuit && card.rank === 'J') {
            hasLeftBower = true;
            suitCount++;
          }
        });
        
        // Update best suit if this suit is stronger
        if (suitCount > bestSuitCount || 
            (suitCount === bestSuitCount && (hasRightBower || hasLeftBower) && !hasJackInBestSuit)) {
          bestSuit = suit;
          bestSuitCount = suitCount;
          hasJackInBestSuit = hasRightBower || hasLeftBower;
        }
      }
    });
    
    // CPU strategy for calling suit:
    // - 3+ cards of a suit
    // - Has a bower in that suit
    if (bestSuitCount >= 3 || hasJackInBestSuit) {
      // Consider going alone with a very strong hand
      const goAlone = hasJackInBestSuit && bestSuitCount >= 4;
      
      // Dynamic import to avoid circular dependency
      const { handleEuchreBid } = require('./euchreLogic');
      
      if (goAlone && bestSuit) {
        console.log(`CPU ${cpuId} calling ${bestSuit} and going alone`);
        handleEuchreBid(io, mockSocket, { 
          action: 'callSuitAlone',
          suit: bestSuit 
        });
      } else if (bestSuit) {
        console.log(`CPU ${cpuId} calling ${bestSuit}`);
        handleEuchreBid(io, mockSocket, { 
          action: 'callSuit',
          suit: bestSuit 
        });
      } else {
        // Fallback if bestSuit is null for some reason
        console.log(`CPU ${cpuId} passing in bidding2 (no good suit)`);
        handleEuchreBid(io, mockSocket, { action: 'pass' });
      }
      return;
    }
    
    // If we reach here, the CPU passes
    console.log(`CPU ${cpuId} passing in bidding2`);
    
    // Dynamic import to avoid circular dependency
    const { handleEuchreBid } = require('./euchreLogic');
    handleEuchreBid(io, mockSocket, { action: 'pass' });
  }
}

// CPU card play logic
// In euchreCPU.js, completely replace the decideCPUCardPlay function:

function decideCPUCardPlay(io, roomId, cpuId) {
  try {
    // Get room and game state
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
      
      // Check if this is because the hand is complete
      const handComplete = Object.values(euchreState.hands).every(playerHand => 
        !playerHand || playerHand.length === 0
      );
      
      if (handComplete) {
        console.log('Hand is complete. Processing hand scoring.');
        // Import dynamically to avoid circular dependencies
        const { processHandScoring } = require('./euchreScoring');
        processHandScoring(io, roomId);
        return;
      }
      
      // If we get here, it's an error state - let's try to recover
      console.log('Error state detected. Moving to next player to avoid getting stuck.');
      
      // Move to next player
      const { processNextPlayer } = require('./euchreTrickPlay');
      processNextPlayer(io, roomId);
      return;
    }
    
    // Choose a card to play
    let cardIndex = 0; // Default to first card
    
    try {
      // If leading the trick, use leading strategy
      if (euchreState.currentTrick.length === 0) {
        cardIndex = selectLeadCard(hand, euchreState, cpuId, room);
      } else {
        // Following a trick, must follow suit if possible
        const leadCard = euchreState.currentTrick[0].card;
        const leadSuit = getEffectiveSuit(leadCard, euchreState.trumpSuit);
        
        // Get cards that match the lead suit (considering effective suit with bowers)
        const matchingSuitCards = [];
        hand.forEach((card, index) => {
          if (getEffectiveSuit(card, euchreState.trumpSuit) === leadSuit) {
            matchingSuitCards.push({ card, index });
          }
        });
        
        if (matchingSuitCards.length > 0) {
          // Must play a card of the lead suit
          // Simple strategy: play highest card if partner isn't winning, otherwise play lowest
          const partnerWinning = isPartnerCurrentlyWinning(euchreState, cpuId, room);
          
          if (partnerWinning) {
            // Play lowest card of the suit
            const lowestCard = matchingSuitCards.sort((a, b) => 
              getCardValue(a.card, euchreState.trumpSuit) - getCardValue(b.card, euchreState.trumpSuit)
            )[0];
            cardIndex = lowestCard.index;
          } else {
            // Play highest card of the suit
            const highestCard = matchingSuitCards.sort((a, b) => 
              getCardValue(b.card, euchreState.trumpSuit) - getCardValue(a.card, euchreState.trumpSuit)
            )[0];
            cardIndex = highestCard.index;
          }
        } else {
          // Cannot follow suit, play lowest card (or strategically trump if possible)
          const partnerWinning = isPartnerCurrentlyWinning(euchreState, cpuId, room);
          
          if (!partnerWinning) {
            // Try to find a trump card to play
            const trumpCards = [];
            hand.forEach((card, index) => {
              if (getEffectiveSuit(card, euchreState.trumpSuit) === euchreState.trumpSuit) {
                trumpCards.push({ card, index });
              }
            });
            
            if (trumpCards.length > 0) {
              // Play lowest trump card
              const lowestTrump = trumpCards.sort((a, b) => 
                getCardValue(a.card, euchreState.trumpSuit) - getCardValue(b.card, euchreState.trumpSuit)
              )[0];
              cardIndex = lowestTrump.index;
            } else {
              // No trump, play lowest card
              cardIndex = findLowestCard(hand, euchreState.trumpSuit);
            }
          } else {
            // Partner winning, play lowest card
            cardIndex = findLowestCard(hand, euchreState.trumpSuit);
          }
        }
      }
    } catch (strategyError) {
      console.error('Error in CPU strategy, defaulting to first card:', strategyError);
      cardIndex = 0; // Default to first card on error
    }
    
    console.log(`CPU ${cpuId} selected card at index ${cardIndex}`);
    
    // Create mock socket for the handlePlayCard function
    const mockSocket = { 
      id: cpuId, 
      roomId: roomId 
    };
    
    // Use the same play card function as human players
    const { handlePlayCard } = require('./euchreTrickPlay');
    handlePlayCard(io, mockSocket, cardIndex);
    
  } catch (error) {
    console.error('Error in decideCPUCardPlay:', error);
    console.error(error.stack);
  }
}

// Helper function to select a lead card
function selectLeadCard(hand, euchreState, cpuId, room) {
  // If we have the right bower, lead it
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'J' && hand[i].suit === euchreState.trumpSuit) {
      return i;
    }
  }
  
  // If we have the left bower, lead it
  const leftBowerSuit = getLeftBowerSuit(euchreState.trumpSuit);
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'J' && hand[i].suit === leftBowerSuit) {
      return i;
    }
  }
  
  // If we have an Ace of a non-trump suit, lead it
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 'A' && getEffectiveSuit(hand[i], euchreState.trumpSuit) !== euchreState.trumpSuit) {
      return i;
    }
  }
  
  // Otherwise lead the highest non-trump card
  let highestNonTrump = 0;
  let highestValue = -1;
  
  for (let i = 0; i < hand.length; i++) {
    if (getEffectiveSuit(hand[i], euchreState.trumpSuit) !== euchreState.trumpSuit) {
      const value = getCardValue(hand[i], euchreState.trumpSuit);
      if (value > highestValue) {
        highestValue = value;
        highestNonTrump = i;
      }
    }
  }
  
  // If we found a non-trump card, lead it
  if (highestValue > 0) {
    return highestNonTrump;
  }
  
  // If we only have trump cards, lead the lowest one
  return findLowestCard(hand, euchreState.trumpSuit);
}

// Helper function to check if partner is winning the current trick
// function isPartnerCurrentlyWinning(euchreState, cpuId, room) {
//   if (euchreState.currentTrick.length === 0) return false;
  
//   // Find the current winning play
//   const winningPlay = getCurrentWinningPlay(euchreState);
//   if (!winningPlay) return false;
  
//   // Check if winner is partner
//   return arePartners(cpuId, winningPlay.player, room);
// }

// Check for CPU turns and trigger them if needed
function checkForCPUTurns(io, roomId) {
  const room = roomStates[roomId];
  if (!room || !room.gameActive) {
    console.log('Room not active, skipping CPU turn check');
    return;
  }
  
  // IMPORTANT: Skip if we're in the middle of processing a trick
  if (room.processingTrick) {
    console.log('Skipping CPU turn check - currently processing a trick');
    return;
  }
  
  const euchreState = room.euchre;
  if (!euchreState) {
    console.log('No euchre state, skipping CPU turn check');
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
      // Create a function reference for clarity
      const triggerCPUTurn = () => {
        console.log(`Executing scheduled CPU turn for ${currentPlayerId}`);
        // Verify the player is still current before proceeding
        if (room.euchre && room.euchre.currentPlayer === currentPlayerId && !room.processingTrick) {
          processCPUTurn(io, roomId, currentPlayerId);
        } else {
          console.log('CPU turn skipped - no longer current player or trick in process');
        }
      };
      
      // Schedule the CPU turn after a brief delay
      setTimeout(triggerCPUTurn, 2000);
    } else {
      console.log(`Skipping duplicate CPU turn for ${currentPlayerId}, last turn was ${now - lastTurnTime}ms ago`);
    }
  }
}

module.exports = {
  processCPUTurn,
  decideCPUBid,
  decideCPUCardPlay,
  checkForCPUTurns
};