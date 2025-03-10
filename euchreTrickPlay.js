/**
 * Euchre Trick Play
 * Contains functions for playing tricks, determining winners, and handling turn flow
 */

const { roomStates } = require('./roomLogic');
const { getEffectiveSuit, getCardValue, compareCards } = require('./euchreCardUtils');
const { broadcastGameState, addToGameLog, getFilteredGameState } = require('./euchreGameCore');
let euchreCPU = null;

// Handle a player playing a card
function handlePlayCard(io, socket, cardIndex) {
  try {
    const roomId = socket.roomId;
    const playerId = socket.id;
    
    const room = roomStates[roomId];
    if (!room || !room.gameActive || room.gameType !== 'euchre') {
      console.error('Invalid room for card play');
      return;
    }
    
    const euchreState = room.euchre;
    if (!euchreState || euchreState.gamePhase !== 'playing') {
      console.error('Invalid game state for card play');
      return;
    }
    
    // Make sure it's this player's turn
    if (euchreState.currentPlayer !== playerId) {
      console.error(`Not player ${playerId}'s turn to play`);
      return;
    }
    
    // Get player's hand
    const hand = euchreState.hands[playerId];
    if (!hand || hand.length === 0) {
      console.error(`Player ${playerId} has no cards to play`);
      return;
    }
    
    // Make sure card index is valid
    if (cardIndex < 0 || cardIndex >= hand.length) {
      console.error(`Invalid card index: ${cardIndex}`);
      return;
    }
    
    const card = hand[cardIndex];
    console.log(`Player ${playerId} playing card:`, card);
    
    // Check if player must follow suit
    if (euchreState.currentTrick.length > 0) {
      const leadCard = euchreState.currentTrick[0].card;
      const leadSuit = getEffectiveSuit(leadCard, euchreState.trumpSuit);
      const cardSuit = getEffectiveSuit(card, euchreState.trumpSuit);
      
      // Check if player has any cards of the lead suit (accounting for effective suit)
      const hasSuit = hand.some(c => getEffectiveSuit(c, euchreState.trumpSuit) === leadSuit);
      
      if (hasSuit && cardSuit !== leadSuit) {
        console.error(`Player must follow suit ${leadSuit}`);
        socket.emit('cardError', { message: `You must follow ${leadSuit} if possible` });
        return; // Cannot play this card, must follow suit if possible
      }
    }
    
    // Add card to current trick
    euchreState.currentTrick.push({
      player: playerId,
      card: card
    });
    
    // If this is the first card in the trick, set it as the lead suit
    if (euchreState.currentTrick.length === 1) {
      euchreState.leadSuit = getEffectiveSuit(card, euchreState.trumpSuit);
    }
    
    // Remove the card from player's hand
    euchreState.hands[playerId].splice(cardIndex, 1);
    
    // Add to game log
    addToGameLog(euchreState, `${room.playerNames[playerId]} played ${card.rank} of ${card.suit}`);
    
    // Broadcast updated state
    broadcastGameState(io, roomId);
    
    // Process next player in trick
    processNextPlayer(io, roomId);
  } catch (error) {
    console.error('Error in handlePlayCard:', error);
  }
}

// Process the next player in the trick
function processNextPlayer(io, roomId) {
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
  
  // Calculate next seat number in CLOCKWISE direction:
  // 1 -> 4 -> 3 -> 2 -> 1
  let nextSeatNum;
  if (currentSeatNum === 1) nextSeatNum = 4;
  else if (currentSeatNum === 4) nextSeatNum = 3;
  else if (currentSeatNum === 3) nextSeatNum = 2;
  else if (currentSeatNum === 2) nextSeatNum = 1;
  else nextSeatNum = 1; // Fallback
  
  const nextPlayerId = room.playerSeats[nextSeatNum];
  
  if (!nextPlayerId) {
    console.error('No player found at next seat:', nextSeatNum);
    return;
  }
  
  // Skip player if they're "going alone" and the opposing partner
  if (euchreState.isGoingAlone && euchreState.alonePlayer) {
    const alonePlayerSeatNum = parseInt(Object.keys(room.playerSeats).find(
      seatNum => room.playerSeats[seatNum] === euchreState.alonePlayer
    ));
    
    // If alonePlayer is on team 1 (seats 1 & 3), skip their partner's opponent (seat 2 or 4)
    // If alonePlayer is on team 2 (seats 2 & 4), skip their partner's opponent (seat 1 or 3)
    const isAloneTeam1 = (alonePlayerSeatNum === 1 || alonePlayerSeatNum === 3);
    const isNextPlayerOpposingPartner = isAloneTeam1 ? 
                                       (nextSeatNum === 2 || nextSeatNum === 4) && (alonePlayerSeatNum % 2 !== nextSeatNum % 2) : 
                                       (nextSeatNum === 1 || nextSeatNum === 3) && (alonePlayerSeatNum % 2 !== nextSeatNum % 2);
    
    if (isNextPlayerOpposingPartner) {
      // Skip to the next player
      console.log('Skipping player', nextPlayerId, 'in going alone scenario');
      euchreState.currentPlayer = nextPlayerId;
      processNextPlayer(io, roomId);
      return;
    }
  }
  
  // Set new current player
  euchreState.currentPlayer = nextPlayerId;
  console.log('Next player:', euchreState.currentPlayer);
  
  // Broadcast updated state
  broadcastGameState(io, roomId);
  
  // Check if next player is CPU
  if (nextPlayerId.startsWith('cpu_')) {
    // Schedule CPU play after a delay
    if (!euchreCPU) {
      euchreCPU = require('./euchreCPU');
    }
    setTimeout(() => {
      euchreCPU.processCPUTurn(io, roomId, nextPlayerId);
    }, 1500);
  }
}


// Process a completed trick
// In euchreTrickPlay.js, update the processCompletedTrick function to prevent double CPU play:

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
  
  // IMPORTANT: Set a flag to prevent double CPU processing during transition
  room.processingTrick = true;
  
  // Broadcast updated state to show trick winner
  broadcastGameState(io, roomId);
  
  // Check if hand is complete (all cards played)
  const handComplete = Object.values(euchreState.hands).every(hand => 
    !hand || hand.length === 0
  );
  
  if (handComplete) {
    // Add a delay before scoring to allow players to see the final trick
    setTimeout(() => {
      // Clear processing flag before moving to scoring
      room.processingTrick = false;
      
      // Import dynamically to avoid circular dependencies
      const { processHandScoring } = require('./euchreScoring');
      processHandScoring(io, roomId);
    }, 3000); // 3-second delay
  } else {
    // Add a delay before starting the next trick
    setTimeout(() => {
      // Start new trick with winner leading
      euchreState.currentPlayer = winningPlayer;
      
      // CRITICAL FIX: Update the firstPositionId to the winner of the trick
      euchreState.firstPositionId = winningPlayer;
      
      // Clear the current trick and reset lead suit
      euchreState.currentTrick = [];
      euchreState.leadSuit = null;
      
      // Log the next leader for debugging purposes
      console.log(`New trick leader is: ${room.playerNames[winningPlayer]} (${winningPlayer})`);
      
      // Instead of using broadcastGameStateWithoutCPUCheck, temporarily set a flag
      // that the regular broadcastGameState function will check
      room.skipCPUCheckOnNextBroadcast = true;
      
      // Use the regular broadcast function
      broadcastGameState(io, roomId);
      
      // Clear the flag and processing flag
      room.skipCPUCheckOnNextBroadcast = false;
      room.processingTrick = false;
      
      // AFTER clearing the flag, handle CPU turn if needed
      if (winningPlayer.startsWith('cpu_')) {
        // Using a dedicated function to handle post-trick CPU turns to avoid race conditions
        console.log('Scheduling CPU leader turn after trick completion');
        setTimeout(() => {
          // Double-check it's still this CPU's turn before proceeding
          if (room.euchre && room.euchre.currentPlayer === winningPlayer) {
            triggerCPUTurn(io, roomId, winningPlayer);
          } else {
            console.log('CPU turn skipped - no longer current player');
          }
        }, 2000);
      }
    }, 2000); // 2-second delay between tricks
  }
}

// Add this helper function to broadcast state without triggering CPU turn checks
function broadcastGameStateWithoutCPUCheck(io, roomId, skipCPUCheck = false) {
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
    
    console.log('Broadcasting game state (skipCPUCheck:', skipCPUCheck, ')');
    
    // Use the imported getFilteredGameState function
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
    
    // Log current phase and player for debugging
    if (euchreState.currentPlayer) {
      console.log(`Current player is ${room.playerNames[euchreState.currentPlayer]} (${euchreState.currentPlayer})`);
    }
    
    // Skip CPU turn check if requested
    if (!skipCPUCheck) {
      try {
        // Check if we need to handle CPU turns
        const { checkForCPUTurns } = require('./euchreCPU');
        checkForCPUTurns(io, roomId);
      } catch (error) {
        console.error('Error checking for CPU turns:', error);
      }
    }
  } catch (error) {
    console.error('Error in broadcastGameState:', error);
    console.error(error.stack);
  }
}

// Add this helper function to safely trigger CPU turns
function triggerCPUTurn(io, roomId, cpuId) {
  const room = roomStates[roomId];
  if (!room || room.processingTrick) {
    console.log('Skipping CPU turn - room not found or trick in progress');
    return;
  }
  
  if (!room.euchre || room.euchre.currentPlayer !== cpuId) {
    console.log('Skipping CPU turn - not current player');
    return;
  }
  
  console.log('Triggering CPU turn for', cpuId);
  const { processCPUTurn } = require('./euchreCPU');
  processCPUTurn(io, roomId, cpuId);
}

// Determine which team a player belongs to (0 for team 1, 1 for team 2)
function getPlayerTeam(playerId, room) {
  // Find seat number for player
  let seatNum = null;
  for (const [seat, id] of Object.entries(room.playerSeats)) {
    if (id === playerId) {
      seatNum = parseInt(seat);
      break;
    }
  }
  
  if (!seatNum) return null;
  
  // Team 1 is seats 1 & 3, Team 2 is seats 2 & 4
  return (seatNum === 1 || seatNum === 3) ? 0 : 1;
}

// Get the current winning play in the trick
function getCurrentWinningPlay(euchreState) {
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

// Check if two players are partners
function arePartners(player1Id, player2Id, room) {
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

module.exports = {
  handlePlayCard,
  processNextPlayer,
  processCompletedTrick,
  getPlayerTeam,
  getCurrentWinningPlay,
  arePartners
};