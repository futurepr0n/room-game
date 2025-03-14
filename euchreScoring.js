/**
 * Euchre Scoring
 * Contains functions for scoring hands, tracking points, and game progression
 */

const { roomStates } = require('./roomLogic');
const { addToGameLog, broadcastGameState, createDeck, shuffleDeck, dealCards } = require('./euchreGameCore');
const { processCPUTurn } = require('./euchreCPU');

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
  let makerName = 'Unknown';
  let makerSeatNumber = null;
  
  for (const [seatNum, playerId] of Object.entries(room.playerSeats)) {
    if (playerId === euchreState.maker) {
      makerSeatNumber = parseInt(seatNum);
      makerTeam = (makerSeatNumber === 1 || makerSeatNumber === 3) ? 0 : 1;
      makerName = room.playerNames[playerId];
      break;
    }
  }
  
  // Calculate scores based on Euchre rules
  let team1Score = 0;
  let team2Score = 0;
  let winningTeam = null;
  
  if (makerTeam === 0) { // Team 1 made the bid
    if (team1Tricks >= 3) {
      if (team1Tricks === 5) {
        // All 5 tricks = 2 points, or 4 if going alone
        team1Score = euchreState.isGoingAlone ? 4 : 2;
        winningTeam = 0;
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `Team 1 (${makerName} going alone) made a march! +4 points`);
        } else {
          addToGameLog(euchreState, `Team 1 (led by ${makerName}) made a march! +2 points`);
        }
      } else {
        // 3-4 tricks = 1 point, or 4 if going alone
        team1Score = euchreState.isGoingAlone ? 4 : 1;
        winningTeam = 0;
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `Team 1 (${makerName} going alone) made their bid! +4 points`);
        } else {
          addToGameLog(euchreState, `Team 1 (led by ${makerName}) made their bid. +1 point`);
        }
      }
    } else {
      team2Score = 2; // Euchre (failed to make bid) = 2 points for opponents
      winningTeam = 1;
      if (euchreState.isGoingAlone) {
        addToGameLog(euchreState, `Team 1 was euchred going alone! Team 2 gets +2 points. Maker: ${makerName}`);
      } else {
        addToGameLog(euchreState, `Team 1 was euchred! Team 2 gets +2 points. Maker: ${makerName}`);
      }
    }
  } else { // Team 2 made the bid
    if (team2Tricks >= 3) {
      if (team2Tricks === 5) {
        // All 5 tricks = 2 points, or 4 if going alone
        team2Score = euchreState.isGoingAlone ? 4 : 2;
        winningTeam = 1;
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `Team 2 (${makerName} going alone) made a march! +4 points`);
        } else {
          addToGameLog(euchreState, `Team 2 (led by ${makerName}) made a march! +2 points`);
        }
      } else {
        // 3-4 tricks = 1 point, or 4 if going alone
        team2Score = euchreState.isGoingAlone ? 4 : 1;
        winningTeam = 1;
        if (euchreState.isGoingAlone) {
          addToGameLog(euchreState, `Team 2 (${makerName} going alone) made their bid! +4 points`);
        } else {
          addToGameLog(euchreState, `Team 2 (led by ${makerName}) made their bid. +1 point`);
        }
      }
    } else {
      team1Score = 2; // Euchre (failed to make bid) = 2 points for opponents
      winningTeam = 0;
      if (euchreState.isGoingAlone) {
        addToGameLog(euchreState, `Team 2 was euchred going alone! Team 1 gets +2 points. Maker: ${makerName}`);
      } else {
        addToGameLog(euchreState, `Team 2 was euchred! Team 1 gets +2 points. Maker: ${makerName}`);
      }
    }
  }
  
  // Update game scores
  euchreState.teamScores[0] += team1Score;
  euchreState.teamScores[1] += team2Score;
  
  console.log('Updated scores - Team 1:', euchreState.teamScores[0], 'Team 2:', euchreState.teamScores[1]);
  
  // Add a log showing current scores
  addToGameLog(euchreState, `Current Scores - Team 1: ${euchreState.teamScores[0]}, Team 2: ${euchreState.teamScores[1]}`);
  
  // Check if game is over (first to 10 points)
  if (euchreState.teamScores[0] >= 10 || euchreState.teamScores[1] >= 10) {
    // Game over
    euchreState.gamePhase = 'gameover';
    const winningTeam = euchreState.teamScores[0] >= 10 ? 'Team 1' : 'Team 2';
    addToGameLog(euchreState, `Game over! ${winningTeam} wins!`);
  } else {
    // Prepare for next hand with a delay to show final state
    setTimeout(() => {
      prepareNextHand(io, roomId, euchreState, room);
      
      // Broadcast updated state
      broadcastGameState(io, roomId);
    }, 3000); // 3-second delay to show final scores
  }
  
  // Broadcast current final state before preparing next hand
  broadcastGameState(io, roomId);
}

// Prepare for the next hand
function prepareNextHand(io, roomId, euchreState, room) {
  // Move dealer position CLOCKWISE (to the left)
  // Change from (dealerPosition + 1) to (dealerPosition + 3) % 4
  // This creates a clockwise rotation (1->4->3->2->1) instead of counter-clockwise
  euchreState.dealerPosition = (euchreState.dealerPosition + 3) % 4;
  
  // Reset game state for new hand but preserve scores
  euchreState.gamePhase = 'bidding1'; // Changed from 'idle' to auto-continue
  euchreState.currentTrick = [];
  euchreState.trumpSuit = null;
  euchreState.maker = null;
  euchreState.bidsMade = 0;
  euchreState.isGoingAlone = false;
  euchreState.alonePlayer = null;
  
  // Clear any position indicators
  euchreState.positionIndicators = {};
  
  // Reset tricks won
  for (const playerId of room.seatedPlayers) {
    euchreState.tricksWon[playerId] = 0;
  }
  
  addToGameLog(euchreState, 'Next hand starting automatically. Dealer moved.');
  
  // Automatically deal new hand
  createDeck(euchreState);
  shuffleDeck(euchreState);
  dealCards(euchreState, room);
  
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
    euchreState.firstPositionId = firstPlayerId; // Set first position
    
    // If the first player is a CPU, handle their turn after a short delay
    if (firstPlayerId.startsWith('cpu_')) {
      setTimeout(() => {
        if (room.euchre && room.euchre.currentPlayer === firstPlayerId) {
          processCPUTurn(io, roomId, firstPlayerId);
        }
      }, 2000);
    }
  }
}

module.exports = {
  processHandScoring,
  prepareNextHand
};