document.addEventListener('DOMContentLoaded', function() {
  const socket = io();
  const roomId = window.location.pathname.split('/')[1];
  
  // Euchre UI Elements
  const dealBtn = document.getElementById('deal-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const gameInfo = document.getElementById('game-info');
  const infoText = document.getElementById('info-text');
  const biddingControls = document.getElementById('bidding-controls');
  const suitSelection = document.getElementById('suit-selection');
  const orderUpBtn = document.getElementById('order-up');
  const passBidBtn = document.getElementById('pass-bid');
  const passSuitBtn = document.getElementById('pass-suit');
  const trumpIndicator = document.getElementById('trump-indicator');
  const trumpSuitText = document.getElementById('trump-suit');
  const gameLog = document.getElementById('game-log');
  const teamScore1 = document.getElementById('team-score-1');
  const teamScore2 = document.getElementById('team-score-2');
  
  // Room system UI elements
  const standButton = document.getElementById('stand-button');
  const inviteButton = document.getElementById('invite-button');
  const playerList = document.getElementById('player-list');
  const seatedPlayerList = document.getElementById('seated-player-list');
  
  // Seat UI elements
  const sitButtons = [
    document.getElementById('sit-button-1'),
    document.getElementById('sit-button-2'),
    document.getElementById('sit-button-3'),
    document.getElementById('sit-button-4')
  ].filter(button => button !== null);
  
  const seatLabels = [
    document.getElementById('seat-label-1'),
    document.getElementById('seat-label-2'),
    document.getElementById('seat-label-3'),
    document.getElementById('seat-label-4')
  ].filter(label => label !== null);
  
  // Game state
  let gameState = null;
  let roomState = null;
  let myPlayerId = null;
  
  if (roomId) {
    const playerName = prompt('Enter your name:');
    const password = prompt('Enter room password (if any):');
    socket.emit('joinRoom', { roomId, playerName, password });
    
    // Handle room events (from your existing room system)
    sitButtons.forEach((button, index) => {
      if (button) {
        button.addEventListener('click', function() {
          socket.emit('sitAtTable', index + 1);
        });
      }
    });
    
    standButton.addEventListener('click', function() {
      socket.emit('standFromTable');
    });
    
    inviteButton.addEventListener('click', function() {
      const roomUrl = window.location.href;
      const tempInput = document.createElement('input');
      tempInput.value = roomUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      alert('Room URL copied to clipboard');
    });
    
    // Connect euchre game UI actions
    dealBtn.addEventListener('click', function() {
      socket.emit('startGame');
    });
    
    newGameBtn.addEventListener('click', function() {
      socket.emit('startGame');
    });
    
    orderUpBtn.addEventListener('click', function() {
      socket.emit('euchreBid', { 
        action: 'orderUp', 
        suit: gameState.turnUpCard.suit 
      });
    });
    
    passBidBtn.addEventListener('click', function() {
      socket.emit('euchreBid', { action: 'pass' });
    });
    
    document.querySelectorAll('.suit-btn').forEach(button => {
      button.addEventListener('click', function() {
        socket.emit('euchreBid', { 
          action: 'callSuit', 
          suit: button.dataset.suit 
        });
      });
    });
    
    passSuitBtn.addEventListener('click', function() {
      socket.emit('euchreBid', { action: 'pass' });
    });
    
    // Handle room state updates (from your existing system)
    socket.on('updateRoom', function(room) {
      roomState = room;
      
      // Update player lists
      updatePlayerLists(room);
      
      // Update seat controls
      updateSeatControls(room);
      
      // Start the game if we have 4 players seated
      if (room.seatedPlayers.length === 4 && !room.gameActive) {
        dealBtn.disabled = false;
      } else {
        dealBtn.disabled = true;
      }
    });
    
    // Handle Euchre-specific game state updates
    socket.on('euchreGameState', function(data) {
      gameState = data.gameState;
      roomState = data.roomState;
      
      myPlayerId = socket.id;
      
      // Render the game state
      renderGameState();
    });
    
    // Handle standard room events
    socket.on('roomFull', function(data) {
      alert(data.message);
      window.location.href = '/';
    });
    
    socket.on('wrongPassword', function(data) {
      alert(data.message);
      window.location.href = '/';
    });
  }
  
  // Helper functions for the UI
  function updatePlayerLists(room) {
    // Update players in room list
    playerList.innerHTML = '';
    for (const playerId in room.playerNames) {
      const playerName = room.playerNames[playerId];
      const playerItem = document.createElement('li');
      playerItem.textContent = playerName;
      playerList.appendChild(playerItem);
    }
    
    // Update seated players list
    seatedPlayerList.innerHTML = '';
    for (const [seatNumber, playerId] of Object.entries(room.playerSeats)) {
      const playerName = room.playerNames[playerId];
      const playerItem = document.createElement('li');
      playerItem.textContent = `${seatNumber}. ${playerName}`;
      seatedPlayerList.appendChild(playerItem);
    }
  }
  
  function updateSeatControls(room) {
    // Reset seat buttons
    sitButtons.forEach((button, index) => {
      if (button) {
        button.style.display = 'inline-block';
      }
      if (seatLabels[index]) {
        seatLabels[index].textContent = '';
      }
    });
    
    // Update seats with player names
    for (const [seatNumber, playerId] of Object.entries(room.playerSeats)) {
      const playerName = room.playerNames[playerId];
      const index = parseInt(seatNumber) - 1;
      
      if (sitButtons[index]) {
        sitButtons[index].style.display = 'none';
      }
      if (seatLabels[index]) {
        seatLabels[index].textContent = playerName;
      }
    }
    
    // Update stand button
    if (room.seatedPlayers.includes(socket.id)) {
      standButton.disabled = false;
    } else {
      standButton.disabled = true;
    }
  }
  
  function renderGameState() {
    if (!gameState) return;
    
    // Render hands
    renderHands();
    
    // Render turn up card or current trick
    renderCenterArea();
    
    // Update scores
    renderScores();
    
    // Update game info and controls
    updateGameControls();
  }
  
// Functions to render the game state

function renderHands() {
    // Clear all hand containers
    document.querySelectorAll('.card-container').forEach(container => {
      container.innerHTML = '';
    });
    
    // Only render if we have game state
    if (!gameState || !gameState.hands) return;
    
    // Map seat positions to player IDs
    const seatToPlayerId = {};
    for (const [seatNumber, playerId] of Object.entries(roomState.playerSeats)) {
      // Convert seat number to position
      let position;
      switch (parseInt(seatNumber)) {
        case 1: position = 'north'; break;
        case 2: position = 'west'; break;
        case 3: position = 'south'; break;
        case 4: position = 'east'; break;
      }
      seatToPlayerId[position] = playerId;
    }
    
    // Get positions
    const positions = ['north', 'west', 'south', 'east'];
    
    // Render each position's hand
    positions.forEach(position => {
      const playerId = seatToPlayerId[position];
      if (!playerId || !gameState.hands[playerId]) return;
      
      const container = document.getElementById(`${position}-hand`);
      const cards = gameState.hands[playerId];
      
      // Determine if we should show cards (only for current player)
      const shouldShowCards = (playerId === myPlayerId);
      
      cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        
        if (shouldShowCards) {
          // Show card face
          cardEl.className = 'card';
          
          // Add color class for red suits
          const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
          if (isRed) {
            cardEl.classList.add('red');
          }
          
          // Add card value in corner
          const valueEl = document.createElement('div');
          valueEl.className = 'card-value';
          valueEl.textContent = `${card.rank}`;
          cardEl.appendChild(valueEl);
          
          // Add large suit symbol in center
          const symbolEl = document.createElement('div');
          symbolEl.className = 'card-symbol';
          const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
          symbolEl.textContent = suitSymbols[card.suit];
          cardEl.appendChild(symbolEl);
          
          // Add click event for playing cards
          if (gameState.gamePhase === 'playing' && gameState.currentPlayer === myPlayerId) {
            cardEl.addEventListener('click', () => {
              socket.emit('euchrePlayCard', index);
            });
          }
        } else {
          // Show card back
          cardEl.className = 'card card-back';
        }
        
        container.appendChild(cardEl);
      });
    });
  }
  
  function renderCenterArea() {
    const trickArea = document.getElementById('trick-area');
    trickArea.innerHTML = '';
    
    if (!gameState) return;
    
    // If in bidding phase, show turn-up card
    if (gameState.gamePhase === 'bidding1' || gameState.gamePhase === 'bidding2') {
      if (gameState.turnUpCard) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        
        // Add color class for red suits
        const isRed = gameState.turnUpCard.suit === 'hearts' || gameState.turnUpCard.suit === 'diamonds';
        if (isRed) {
          cardEl.classList.add('red');
        }
        
        // Add card value in corner
        const valueEl = document.createElement('div');
        valueEl.className = 'card-value';
        valueEl.textContent = `${gameState.turnUpCard.rank}`;
        cardEl.appendChild(valueEl);
        
        // Add large suit symbol in center
        const symbolEl = document.createElement('div');
        symbolEl.className = 'card-symbol';
        const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
        symbolEl.textContent = suitSymbols[gameState.turnUpCard.suit];
        cardEl.appendChild(symbolEl);
        
        // Add slight rotation for visual interest
        cardEl.style.transform = 'rotate(5deg)';
        
        trickArea.appendChild(cardEl);
      }
    } 
    // If in playing phase, show current trick
    else if (gameState.gamePhase === 'playing' && gameState.currentTrick.length > 0) {
      // Map player IDs to positions
      const playerIdToPosition = {};
      for (const [seatNumber, playerId] of Object.entries(roomState.playerSeats)) {
        // Convert seat number to position
        let position;
        switch (parseInt(seatNumber)) {
          case 1: position = 'north'; break;
          case 2: position = 'west'; break;
          case 3: position = 'south'; break;
          case 4: position = 'east'; break;
        }
        playerIdToPosition[playerId] = position;
      }
      
      // Render each card in the trick
      gameState.currentTrick.forEach(play => {
        const cardEl = document.createElement('div');
        const position = playerIdToPosition[play.player];
        
        cardEl.className = `trick-card trick-${position}`;
        
        // Add color class for red suits
        const isRed = play.card.suit === 'hearts' || play.card.suit === 'diamonds';
        if (isRed) {
          cardEl.classList.add('red');
        }
        
        // Add card value in corner
        const valueEl = document.createElement('div');
        valueEl.className = 'card-value';
        valueEl.textContent = `${play.card.rank}`;
        cardEl.appendChild(valueEl);
        
        // Add large suit symbol in center
        const symbolEl = document.createElement('div');
        symbolEl.className = 'card-symbol';
        const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
        symbolEl.textContent = suitSymbols[play.card.suit];
        cardEl.appendChild(symbolEl);
        
        // Highlight winner
        if (gameState.trickWinner === play.player) {
          cardEl.classList.add('trick-winner');
          
          // Add a text indicator for the winner
          const winLabel = document.createElement('div');
          winLabel.className = 'win-label';
          winLabel.textContent = 'WINNER';
          winLabel.style.position = 'absolute';
          winLabel.style.bottom = '-20px';
          winLabel.style.left = '50%';
          winLabel.style.transform = 'translateX(-50%)';
          winLabel.style.color = 'gold';
          winLabel.style.fontWeight = 'bold';
          winLabel.style.fontSize = '12px';
          winLabel.style.textShadow = '0 0 3px black';
          cardEl.appendChild(winLabel);
        } else if (gameState.trickWinner) {
          cardEl.classList.add('trick-loser');
        }
        
        trickArea.appendChild(cardEl);
      });
    }
  }
  
  function updateGameControls() {
    // Clear all control displays
    biddingControls.style.display = 'none';
    suitSelection.style.display = 'none';
    
    // Only proceed if we have game state
    if (!gameState) return;
    
    // Update trump indicator
    if (gameState.trumpSuit) {
      trumpIndicator.style.display = 'block';
      const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
      trumpSuitText.textContent = `${gameState.trumpSuit} ${suitSymbols[gameState.trumpSuit]}`;
    } else {
      trumpIndicator.style.display = 'none';
    }
    
    // Update game info and controls based on game phase
    if (gameState.gamePhase === 'idle') {
      infoText.textContent = 'Welcome to Euchre! Click Deal to start.';
    } 
    else if (gameState.gamePhase === 'bidding1') {
      if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = `Do you want to order up ${gameState.turnUpCard.suit}?`;
        biddingControls.style.display = 'block';
      } else {
        // Find the player name using the player ID
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is deciding...`;
      }
    } 
    else if (gameState.gamePhase === 'bidding2') {
      if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = `Select a trump suit (different from ${gameState.turnUpCard.suit})`;
        suitSelection.style.display = 'block';
      } else {
        // Find the player name using the player ID
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is selecting a trump suit...`;
      }
    } 
    else if (gameState.gamePhase === 'playing') {
      if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = 'Your turn. Play a card.';
      } else {
        // Find the player name using the player ID
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `Waiting for ${currentPlayerName} to play...`;
      }
    } 
    else if (gameState.gamePhase === 'gameover') {
      const winner = gameState.teamScores[0] > gameState.teamScores[1] ? 'Team 1' : 'Team 2';
      infoText.textContent = `Game over! ${winner} wins!`;
      newGameBtn.disabled = false;
    }
    
    // Add turn indicator for current player
    // Remove any existing indicators first
    document.querySelectorAll('.turn-indicator').forEach(el => el.remove());
    
    if (gameState.currentPlayer) {
      // Find the seat number for the current player
      let currentSeat = null;
      for (const [seatNumber, playerId] of Object.entries(roomState.playerSeats)) {
        if (playerId === gameState.currentPlayer) {
          currentSeat = parseInt(seatNumber);
          break;
        }
      }
      
      if (currentSeat) {
        // Map seat number to position
        let position;
        switch (currentSeat) {
          case 1: position = 'north'; break;
          case 2: position = 'west'; break;
          case 3: position = 'south'; break;
          case 4: position = 'east'; break;
        }
        
        // Create and position the indicator
        const indicator = document.createElement('div');
        indicator.className = 'turn-indicator';
        
        const playerArea = document.querySelector(`.player-${position}`);
        playerArea.appendChild(indicator);
        
        // Position based on the player's area
        if (position === 'south') {
          indicator.style.bottom = '5px';
          indicator.style.left = '50%';
          indicator.style.transform = 'translateX(-50%)';
        } else if (position === 'north') {
          indicator.style.top = '5px';
          indicator.style.left = '50%';
          indicator.style.transform = 'translateX(-50%)';
        } else if (position === 'west') {
          indicator.style.left = '5px';
          indicator.style.top = '50%';
          indicator.style.transform = 'translateY(-50%)';
        } else if (position === 'east') {
          indicator.style.right = '5px';
          indicator.style.top = '50%';
          indicator.style.transform = 'translateY(-50%)';
        }
      }
    }
  }
  
  function renderScores() {
    // Update team scores
    teamScore1.textContent = gameState.teamScores[0];
    teamScore2.textContent = gameState.teamScores[1];
    
    // Update trick counts
    document.querySelectorAll('.tricks-count').forEach((el, index) => {
      const playerId = roomState.seatedPlayers[index];
      el.textContent = gameState.tricksWon[playerId] || 0;
    });
  }

  function logEvent(message) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = message;
    gameLog.appendChild(logEntry);
    gameLog.scrollTop = gameLog.scrollHeight;
  }
});