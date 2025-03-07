/**
 * Euchre Trick Play
 * Contains functions for playing tricks, determining winners, and handling turn flow
 */

const { roomStates } = require('./roomLogic');
const { getEffectiveSuit, getCardValue, compareCards, getCurrentWinningPlay } = require('./euchreCardUtils');
const { broadcastGameState, addToGameLog } = require('./euchreGameCore');
const { processCPUTurn } = require('./euchreCPU');

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
  
  // Calculate next seat number (clockwise)
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
  
  // Skip player if they're "going alone" and the opposing partner
  if (euchreState.isGoingAlone && euchreState.alonePlayer) {
    const alonePlayerSeatNum = parseInt(Object.keys(room.playerSeats).find(
      seatNum => room.playerSeats[seatNum] === euchreState.alonePlayer
    ));
    
    // If alonePlayer is on team 1 (seats 1 & 3), skip their partner's opponent (seat 2 or 4)
    // If alonePlayer is on team 2 (seats 2 & 4), skip their partner's opponent (seat 1 or 3)
    const skipTeam = (alonePlayerSeatNum === 1 || alonePlayerSeatNum === 3) ? 2 : 1;
    const isSkipSeat = skipTeam === 1 ? (nextSeatNum === 1 || nextSeatNum === 3) 
                                      : (nextSeatNum === 2 || nextSeatNum === 4);
    
    // Skip this player's turn if they're the partner of the player going alone
    if (isSkipSeat && ((alonePlayerSeatNum % 2) === (nextSeatNum % 2))) {
      // Recursive call to get the next player after the skipped one
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
    setTimeout(() => {
      processCPUTurn(io, roomId, nextPlayerId);
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
  
  // Broadcast updated state to show trick winner
  broadcastGameState(io, roomId);
  
  // Check if hand is complete (all cards played)
  const handComplete = Object.values(euchreState.hands).every(hand => hand.length === 0);
  
  if (handComplete) {
    // Add a delay before scoring to allow players to see the final trick
    setTimeout(() => {
      // Import dynamically to avoid circular dependencies
      const { processHandScoring } = require('./euchreScoring');
      processHandScoring(io, roomId);
    }, 3000); // 3-second delay
  } else {
    // Add a delay before starting the next trick
    setTimeout(() => {
      // Start new trick with winner leading
      euchreState.currentPlayer = winningPlayer;
      euchreState.currentTrick = [];
      euchreState.leadSuit = null; // Reset lead suit
      
      // Broadcast updated state
      broadcastGameState(io, roomId);
      
      // Check if next player is CPU
      if (winningPlayer.startsWith('cpu_')) {
        // Schedule CPU play after a delay
        setTimeout(() => {
          processCPUTurn(io, roomId, winningPlayer);
        }, 1500);
      }
    }, 2000); // 2-second delay between tricks
  }
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