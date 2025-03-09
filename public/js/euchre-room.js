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

  const orderUpAloneBtn = document.getElementById('order-up-alone');
  const callAloneBtn = document.getElementById('call-alone');
  let selectedSuit = null;
  
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
          const seatNumber = index + 1;
          console.log('Requesting to sit at seat:', seatNumber);
          socket.emit('sitAtTable', seatNumber.toString());
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
      console.log('Deal button clicked - starting game');
      socket.emit('startGame');
      
      // Show a loading indicator
      dealBtn.disabled = true;
      dealBtn.textContent = 'Starting...';
      
      // Reset after a few seconds if no response
      setTimeout(() => {
        if (dealBtn.textContent === 'Starting...') {
          dealBtn.textContent = 'Deal';
          dealBtn.disabled = false;
        }
      }, 5000);
      
      logEvent('Starting game...');
    });
    
    newGameBtn.addEventListener('click', function() {
      console.log('New game button clicked');
      socket.emit('startGame');
      logEvent('Starting new game...');
    });
    
    orderUpBtn.addEventListener('click', function() {
      if (gameState && gameState.turnUpCard) {
        const goAlone = document.getElementById('go-alone-checkbox').checked;
        console.log(`Order up button clicked with suit: ${gameState.turnUpCard.suit}, go alone: ${goAlone}`);
        socket.emit('euchreBid', { 
          action: goAlone ? 'orderUpAlone' : 'orderUp',
          suit: gameState.turnUpCard.suit 
        });
        logEvent(`You ordered up ${gameState.turnUpCard.suit}${goAlone ? ' and are going alone!' : ''}`);
      }
    });
    
    passBidBtn.addEventListener('click', function() {
      console.log('Pass bid button clicked');
      socket.emit('euchreBid', { action: 'pass' });
      logEvent('You passed');
    });

    // Add event listener for Order Up Alone button
  if (orderUpAloneBtn) {
    orderUpAloneBtn.addEventListener('click', function() {
      if (gameState && gameState.turnUpCard) {
        console.log('Order up alone button clicked with suit:', gameState.turnUpCard.suit);
        socket.emit('euchreBid', { 
          action: 'orderUpAlone', 
          suit: gameState.turnUpCard.suit 
        });
        logEvent(`You ordered up ${gameState.turnUpCard.suit} and are going alone!`);
      }
    });
  }
  
  // Update suit selection buttons to track selected suit
  document.querySelectorAll('.suit-btn').forEach(button => {
    button.addEventListener('click', function() {
      // Clear previous selections
      document.querySelectorAll('.suit-btn').forEach(btn => {
        btn.classList.remove('selected');
      });
      
      // Highlight this selection
      this.classList.add('selected');
      selectedSuit = this.dataset.suit;
      
      // Check if going alone
      const goAlone = document.getElementById('call-alone-checkbox').checked;
      
      // Call suit with the alone option
      socket.emit('euchreBid', { 
        action: goAlone ? 'callSuitAlone' : 'callSuit',
        suit: selectedSuit 
      });
      logEvent(`You called ${selectedSuit} as trump${goAlone ? ' and are going alone!' : ''}`);
    });
  });
  
  // Add event listener for Call Alone button
  if (callAloneBtn) {
    callAloneBtn.addEventListener('click', function() {
      if (selectedSuit) {
        console.log('Going alone with suit:', selectedSuit);
        socket.emit('euchreBid', { 
          action: 'callSuitAlone', 
          suit: selectedSuit 
        });
        logEvent(`You called ${selectedSuit} as trump and are going alone!`);
      } else {
        // Show error if no suit is selected
        alert('Please select a suit first');
      }
    });
  }
    
    document.querySelectorAll('.suit-btn').forEach(button => {
      button.addEventListener('click', function() {
        const suit = button.dataset.suit;
        console.log('Suit button clicked:', suit);
        socket.emit('euchreBid', { 
          action: 'callSuit', 
          suit: suit 
        });
        logEvent(`You called ${suit} as trump`);
      });
    });
    
    passSuitBtn.addEventListener('click', function() {
      console.log('Pass suit button clicked');
      socket.emit('euchreBid', { action: 'pass' });
      logEvent('You passed');
    });

    // Handle room state updates (from your existing system)
    socket.on('updateRoom', function(room) {
      console.log('Room updated:', room);
      roomState = room;
      
      // Update player lists
      updatePlayerLists(room);
      
      // Update seat controls
      updateSeatControls(room);
      
      // Start the game if we have 4 players seated
      if (room.seatedPlayers && room.seatedPlayers.length > 0 && !room.gameActive) {
        dealBtn.disabled = false;
      } else {
        dealBtn.disabled = true;
      }
      
      // Update the room ID in case it wasn't set by the join
      socket.roomId = roomId;
      
      // Remember our player ID
      myPlayerId = socket.id;
    });
    
    // Handle Euchre-specific game state updates
    socket.on('euchreGameState', function(data) {
      console.log('Received game state:', data);
      gameState = data.gameState;
      roomState = data.roomState;
      
      // Ensure we have player ID
      myPlayerId = socket.id;
      
      // Show spectator mode indicator if not seated
      const isSpectator = !roomState.seatedPlayers.includes(myPlayerId);
      updateSpectatorIndicator(isSpectator);
      
      // Display any game log messages
      if (gameState.gameLog && gameState.gameLog.length > 0) {
        // Find all new messages
        const lastMessageIndex = getLastDisplayedMessageIndex();
        
        for (let i = lastMessageIndex + 1; i < gameState.gameLog.length; i++) {
          logEvent(gameState.gameLog[i]);
        }
      }
      
      // Render the game state (this will handle the turn token properly)
      renderGameState();
    });

    // Helper function to find the last displayed message index
    function getLastDisplayedMessageIndex() {
      if (!gameState || !gameState.gameLog || !gameState.gameLog.length) return -1;
      
      const logEntries = gameLog.querySelectorAll('.log-entry');
      if (!logEntries.length) return -1;
      
      const lastDisplayedMessage = logEntries[logEntries.length - 1].textContent;
      
      for (let i = gameState.gameLog.length - 1; i >= 0; i--) {
        if (gameState.gameLog[i] === lastDisplayedMessage) {
          return i;
        }
      }
      
      return -1;
    }
    
    // Handle standard room events
    socket.on('roomFull', function(data) {
      alert(data.message);
      window.location.href = '/';
    });
    
    socket.on('wrongPassword', function(data) {
      alert(data.message);
      window.location.href = '/';
    });
    
    socket.on('roomNotFound', function(data) {
      alert(data.message);
      window.location.href = '/';
    });
  }

  // New helper function to manage spectator indicator
  function updateSpectatorIndicator(isSpectator) {
    // Remove any existing indicator
    const existingIndicator = document.getElementById('spectator-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    if (isSpectator) {
      // Create and add the spectator indicator
      const spectatorIndicator = document.createElement('div');
      spectatorIndicator.id = 'spectator-indicator';
      spectatorIndicator.className = 'spectator-indicator';
      spectatorIndicator.textContent = 'Spectator Mode';
      spectatorIndicator.style.position = 'absolute';
      spectatorIndicator.style.top = '10px';
      spectatorIndicator.style.left = '10px';
      spectatorIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      spectatorIndicator.style.color = 'white';
      spectatorIndicator.style.padding = '5px 10px';
      spectatorIndicator.style.borderRadius = '5px';
      spectatorIndicator.style.zIndex = '1000';
      
      // Add to the game container
      const gameContainer = document.querySelector('.game-container');
      if (gameContainer) {
        gameContainer.appendChild(spectatorIndicator);
      }
    }
  }

  function clearAllTurnIndicators() {
    // Remove any existing turn indicators
    document.querySelectorAll('.turn-indicator').forEach(el => el.remove());
    
    // Reset all player area styles
    document.querySelectorAll('.player-area').forEach(el => {
      el.style.boxShadow = 'none';
      el.style.animation = 'none';
    });
  }
  

  function updateGameControls() {
    // Clear all control displays
    biddingControls.style.display = 'none';
    suitSelection.style.display = 'none';
    newGameBtn.style.display = 'none';
    dealBtn.style.display = 'none';
    
    // Only proceed if we have game state
    if (!gameState) return;

    if (gameState.gamePhase === 'discard') {
      // Hide regular controls during discard phase
      biddingControls.style.display = 'none';
      suitSelection.style.display = 'none';
      dealBtn.style.display = 'none';
      
      // Show appropriate message
      gameInfo.style.display = 'block';
      
      // Find the dealer
      const dealerSeatNum = (gameState.dealerPosition % 4) + 1;
      const dealerId = roomState.playerSeats[dealerSeatNum];
      
      if (dealerId === myPlayerId) {
        infoText.textContent = 'Select a card to discard';
      } else {
        infoText.textContent = `Waiting for ${roomState.playerNames[dealerId]} to discard...`;
      }
    }
    
    // Check if user is a spectator
    const isSpectator = !roomState.seatedPlayers.includes(myPlayerId);
    
    // Handle different game phases
    if (gameState.gamePhase === 'idle') {
      // Show welcome message
      gameInfo.style.display = 'block';
      infoText.textContent = 'Welcome to Euchre! Click Deal to start.';
      
      if (!isSpectator) {
        dealBtn.style.display = 'inline-block';
        dealBtn.disabled = roomState.seatedPlayers.length < 4;
      }
    } 
    else if (gameState.gamePhase === 'bidding1') {
      // Show bidding info
      gameInfo.style.display = 'block';
      
      // For spectators, always show what's happening
      if (isSpectator) {
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is deciding whether to order up ${gameState.turnUpCard.suit}...`;
      }
      // For active players
      else if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = `Do you want to order up ${gameState.turnUpCard.suit}?`;
        biddingControls.style.display = 'block';
      } else {
        // Another player's turn
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is deciding...`;
      }
    } 
    else if (gameState.gamePhase === 'bidding2') {
      // Show bidding info
      gameInfo.style.display = 'block';
      
      // For spectators
      if (isSpectator) {
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is selecting a trump suit...`;
      }
      // For active players
      else if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = `Select a trump suit (different from ${gameState.turnUpCard.suit})`;
        suitSelection.style.display = 'block';
        
        // Disable the suit that was turned down
        document.querySelectorAll('.suit-btn').forEach(button => {
          if (button.dataset.suit === gameState.turnUpCard.suit) {
            button.disabled = true;
          } else {
            button.disabled = false;
          }
        });
      } else {
        // Another player's turn
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is selecting a trump suit...`;
      }
    } 
    else if (gameState.gamePhase === 'playing') {
      // Hide the info box during gameplay
      gameInfo.style.display = 'none';
      
      // No need to highlight the active player here, it's already done in renderGameState
    } 
    else if (gameState.gamePhase === 'gameover') {
      // Show game over message
      gameInfo.style.display = 'block';
      const winningTeam = gameState.teamScores[0] > gameState.teamScores[1] ? 1 : 2;
      infoText.textContent = `Game over! Team ${winningTeam} wins!`;
      
      if (!isSpectator) {
        newGameBtn.style.display = 'inline-block';
      }
    }
  }
  


  function updateStyles() {
    // Create a style element if it doesn't exist
    let styleEl = document.getElementById('dynamic-euchre-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-euchre-styles';
      document.head.appendChild(styleEl);
    }
    // Update the styles
  styleEl.textContent = `
  .trump-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    padding: 8px 12px;
    border-radius: 5px;
    font-size: 16px;
    color: white;
    font-weight: bold;
    z-index: 100;
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 5px rgba(255, 215, 0, 0.7); }
    50% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.9); }
    100% { box-shadow: 0 0 5px rgba(255, 215, 0, 0.7); }
  }
  
  /* Hide game-info during play but keep it available for welcome and bidding */
  .game-info {
    transition: opacity 0.3s ease-in-out;
  }
`;
}



  // Helper functions for the UI
  function updatePlayerLists(room) {
    // Update players in room list
    playerList.innerHTML = '';
    for (const playerId in room.playerNames) {
      const playerName = room.playerNames[playerId];
      const playerItem = document.createElement('li');
      playerItem.textContent = playerName;
      
      // Highlight current player
      if (playerId === socket.id) {
        playerItem.style.fontWeight = 'bold';
        playerItem.textContent += ' (You)';
      }
      
      playerList.appendChild(playerItem);
    }
    
    // Update seated players list
    seatedPlayerList.innerHTML = '';
    for (const [seatNumber, playerId] of Object.entries(room.playerSeats)) {
      const playerName = room.playerNames[playerId];
      const playerItem = document.createElement('li');
      playerItem.textContent = `Seat ${seatNumber}: ${playerName}`;
      
      // Highlight current player
      if (playerId === socket.id) {
        playerItem.style.fontWeight = 'bold';
        playerItem.textContent += ' (You)';
      }
      
      // Show which team they're on
      if (room.teams) {
        if (room.teams[1].includes(playerId)) {
          playerItem.textContent += ' - Team 1';
        } else if (room.teams[2].includes(playerId)) {
          playerItem.textContent += ' - Team 2';
        }
      }
      
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
      
      if (index >= 0 && index < sitButtons.length && sitButtons[index]) {
        sitButtons[index].style.display = 'none';
      }
      
      if (index >= 0 && index < seatLabels.length && seatLabels[index]) {
        seatLabels[index].textContent = playerName;
        
        // Highlight current player
        if (playerId === socket.id) {
          seatLabels[index].textContent += ' (You)';
          seatLabels[index].style.fontWeight = 'bold';
        }
        
        // Add CPU indicator
        if (playerId.startsWith('cpu_')) {
          seatLabels[index].textContent += ' (CPU)';
          seatLabels[index].style.color = '#999';
        }
      }
    }
    
    // Update stand button
    if (room.seatedPlayers && room.seatedPlayers.includes(socket.id)) {
      standButton.disabled = false;
    } else {
      standButton.disabled = true;
    }
  }
  
  function renderGameState() {
    if (!gameState) return;
    
    console.log('Rendering game state. Game phase:', gameState.gamePhase);
    console.log('Trump suit:', gameState.trumpSuit);
    
    // Check if we're in the discard phase and we're the dealer
    if (gameState.gamePhase === 'discard') {
      // Find the dealer's seat number
      const dealerSeatNum = (gameState.dealerPosition % 4) + 1;
      const dealerId = roomState.playerSeats[dealerSeatNum];
      
      // If we're the dealer, show discard selection
      if (dealerId === myPlayerId) {
        showDiscardSelection();
      } else {
        // Show waiting message
        gameInfo.style.display = 'block';
        infoText.textContent = `Waiting for ${roomState.playerNames[dealerId]} to discard...`;
      }
    }
    // Clear all turn indicators first
    clearAllTurnIndicators();
    
    // Render hands
    renderHands();
    
    // Render turn up card or current trick
    renderCenterArea();
    
    // Update scores
    renderScores();
    
    // Update game info and controls
    updateGameControls();
    
    // Make sure to update the trump indicator
    updateTrumpIndicator();
    
    // Add appropriate indicators
    if (gameState.gamePhase === 'playing') {
      // Highlight active player using our token approach
      highlightActivePlayer();
    }
    
    // Add dealer indicator
    addDealerIndicator();
    
    // Add lead position indicator if applicable
    if (gameState.firstPositionId) {
      addLeadPositionIndicator(gameState.firstPositionId);
    }
  }

  function clearPositionIndicators() {
    // Remove any existing indicator classes
    document.querySelectorAll('.dealer-indicator, .lead-indicator').forEach(el => el.remove());
    
    // Remove any existing highlight classes
    document.querySelectorAll('.player-area').forEach(el => {
      el.classList.remove('first-position');
    });
    
    // Clear any emoji indicators from player names
    document.querySelectorAll('.player-name').forEach(el => {
      // Remove any emoji characters (common emoji ranges)
      el.innerHTML = el.innerHTML.replace(/[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
      // Remove any text like (LEAD) or (DEALER)
      el.innerHTML = el.innerHTML.replace(/\s*\((?:LEAD|DEALER)\)/g, '');
    });
  }

  function updateTrumpIndicator() {
    const trumpIndicator = document.getElementById('trump-indicator');
    const trumpSuitText = document.getElementById('trump-suit');
    
    if (gameState && gameState.trumpSuit) {
      // Make sure the trump indicator is visible
      trumpIndicator.style.display = 'block';
      
      // Make sure the trump indicator is properly positioned
      trumpIndicator.style.position = 'absolute';
      trumpIndicator.style.top = '10px';
      trumpIndicator.style.right = '10px';
      trumpIndicator.style.zIndex = '100';
      
      // Set the text content
      const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
      const suitSymbol = suitSymbols[gameState.trumpSuit] || '';
      trumpSuitText.textContent = `${gameState.trumpSuit.charAt(0).toUpperCase() + gameState.trumpSuit.slice(1)} ${suitSymbol}`;
      
      // Add color class for red suits
      if (gameState.trumpSuit === 'hearts' || gameState.trumpSuit === 'diamonds') {
        trumpSuitText.className = 'red';
      } else {
        trumpSuitText.className = '';
      }
      
      console.log('Trump indicator updated:', gameState.trumpSuit);
    } else {
      // No trump suit set, hide the indicator
      trumpIndicator.style.display = 'none';
    }
  }

  function updateTurnToken(currentPlayerId) {
    const turnToken = document.getElementById('turn-token');
    
    // Remove all position classes first
    turnToken.classList.remove('token-north', 'token-east', 'token-south', 'token-west');
    
    // If no current player, hide the token
    if (!currentPlayerId) {
      turnToken.style.opacity = '0';
      return;
    }
    
    // Find the seat number of the current player
    let currentSeatNum = null;
    for (const [seatNum, playerId] of Object.entries(room.playerSeats)) {
      if (playerId === currentPlayerId) {
        currentSeatNum = parseInt(seatNum);
        break;
      }
    }
    
    if (!currentSeatNum) {
      turnToken.style.opacity = '0';
      return;
    }
    
    // Position based on seat number
    switch(currentSeatNum) {
      case 1:
        turnToken.classList.add('token-north');
        break;
      case 2:
        turnToken.classList.add('token-west');
        break;
      case 3:
        turnToken.classList.add('token-south');
        break;
      case 4:
        turnToken.classList.add('token-east');
        break;
      default:
        turnToken.style.opacity = '0';
        return;
    }
    
    // Make the token visible
    turnToken.style.opacity = '1';
    
    // Add a small animation effect
    turnToken.style.transform += ' scale(1.2)';
    setTimeout(() => {
      turnToken.style.transform = turnToken.style.transform.replace(' scale(1.2)', '');
    }, 300);
  }

  function highlightActivePlayer() {
    // Clear any existing highlighting
    clearAllTurnIndicators();
    
    if (!gameState || !gameState.currentPlayer) return;
    
    // Use the token approach instead of modifying player areas
    updateTurnToken(gameState.currentPlayer);
  }
  
  // Define a proper updateTurnToken function
  function updateTurnToken(currentPlayerId) {
    const turnToken = document.getElementById('turn-token');
    if (!turnToken) {
      console.error('Turn token element not found!');
      return;
    }
    
    // Remove all position classes first
    turnToken.classList.remove('token-north', 'token-east', 'token-south', 'token-west');
    
    // If no current player, hide the token
    if (!currentPlayerId || !roomState) {
      turnToken.style.opacity = '0';
      return;
    }
    
    // Find the seat number of the current player
    let currentSeatNum = null;
    for (const [seatNum, playerId] of Object.entries(roomState.playerSeats || {})) {
      if (playerId === currentPlayerId) {
        currentSeatNum = parseInt(seatNum);
        break;
      }
    }
    
    if (!currentSeatNum) {
      turnToken.style.opacity = '0';
      return;
    }
    
    // Position based on seat number
    switch(currentSeatNum) {
      case 1:
        turnToken.classList.add('token-north');
        break;
      case 2:
        turnToken.classList.add('token-west');
        break;
      case 3:
        turnToken.classList.add('token-south');
        break;
      case 4:
        turnToken.classList.add('token-east');
        break;
      default:
        turnToken.style.opacity = '0';
        return;
    }
    
    // Make the token visible
    turnToken.style.opacity = '1';
  }

// Updated addDealerIndicator function to correctly show the dealer
function addDealerIndicator() {
  // Remove any existing dealer indicators
  document.querySelectorAll('.dealer-indicator').forEach(el => el.remove());
  
  // Get the dealer position from the game state
  if (!gameState || gameState.dealerPosition === undefined) return;
  
  // Convert dealer position (0-3) to seat number (1-4)
  const dealerSeatNum = (gameState.dealerPosition % 4) + 1;
  
  // Find the player in that seat
  const dealerId = roomState.playerSeats[dealerSeatNum];
  if (!dealerId) return;
  
  // Map seat number to position
  let position;
  switch (dealerSeatNum) {
    case 1: position = 'north'; break;
    case 2: position = 'west'; break;
    case 3: position = 'south'; break;
    case 4: position = 'east'; break;
  }
  
  // Add dealer indicator
  const playerArea = document.querySelector(`.player-${position}`);
  if (playerArea) {
    const dealerLabel = document.createElement('div');
    dealerLabel.className = 'dealer-indicator';
    dealerLabel.innerHTML = 'DEALER';
    dealerLabel.style.position = 'absolute';
    dealerLabel.style.bottom = '-20px';
    dealerLabel.style.right = '10px';
    dealerLabel.style.color = 'black';
    dealerLabel.style.backgroundColor = 'gold';
    dealerLabel.style.padding = '2px 5px';
    dealerLabel.style.borderRadius = '3px';
    dealerLabel.style.fontSize = '10px';
    dealerLabel.style.fontWeight = 'bold';
    playerArea.appendChild(dealerLabel);
  }
}


function addLeadPositionIndicator(leadPlayerId) {
  // Remove any existing lead indicators
  document.querySelectorAll('.lead-indicator').forEach(el => el.remove());
  
  if (!leadPlayerId) return;
  
  // Find the seat for the lead player
  let leadSeatNum = null;
  for (const [seatNum, playerId] of Object.entries(roomState.playerSeats)) {
    if (playerId === leadPlayerId) {
      leadSeatNum = parseInt(seatNum);
      break;
    }
  }
  
  if (!leadSeatNum) return;
  
  // Map seat number to position
  let position;
  switch (leadSeatNum) {
    case 1: position = 'north'; break;
    case 2: position = 'west'; break;
    case 3: position = 'south'; break;
    case 4: position = 'east'; break;
  }
  
  // Add lead indicator
  const playerArea = document.querySelector(`.player-${position}`);
  if (playerArea) {
    // Add visual indicator with gold border
    playerArea.classList.add('first-position');
    
    // Add LEAD label
    const leadLabel = document.createElement('div');
    leadLabel.className = 'lead-indicator';
    leadLabel.innerHTML = 'LEAD';
    leadLabel.style.position = 'absolute';
    leadLabel.style.bottom = '-20px';
    leadLabel.style.left = '10px';
    leadLabel.style.color = 'white';
    leadLabel.style.backgroundColor = 'green';
    leadLabel.style.padding = '2px 5px';
    leadLabel.style.borderRadius = '3px';
    leadLabel.style.fontSize = '10px';
    leadLabel.style.fontWeight = 'bold';
    playerArea.appendChild(leadLabel);
  }
}

  // Functions to render the game state
  function renderHands() {
    // Clear all hand containers
    document.querySelectorAll('.card-container').forEach(container => {
      container.innerHTML = '';
    });
    
    // Only render if we have game state
    if (!gameState || !gameState.hands) return;
    
    // Log the hand size for debugging
    if (myPlayerId && gameState.hands[myPlayerId]) {
      console.log('My hand size:', gameState.hands[myPlayerId].length);
    }
    
    // Map seat positions to player IDs
    const seatToPlayerId = {};
    const positions = ['north', 'west', 'south', 'east']; // In seat order 1,2,3,4
    
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
    
    console.log('Seat to player mapping:', seatToPlayerId);
    
    // Render each position's hand
    positions.forEach(position => {
      const playerId = seatToPlayerId[position];
      if (!playerId || !gameState.hands[playerId]) return;
      
      const container = document.getElementById(`${position}-hand`);
      if (!container) return;
      
      const cards = gameState.hands[playerId];
      console.log(`Rendering ${cards.length} cards for ${position} (${playerId})`);
      
      // Determine if we should show cards (only for current player)
      const shouldShowCards = (playerId === myPlayerId);
      
      // For each card in the hand
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
              console.log(`Playing card at index ${index}:`, card);
            });
            cardEl.classList.add('playable');
          }
        } else {
          // Show card back
          cardEl.className = 'card card-back';
        }
        
        container.appendChild(cardEl);
      });
      
      // Add player indicator if it's their turn
      if (gameState.currentPlayer === playerId) {
        const turnIndicator = document.createElement('div');
        turnIndicator.className = 'turn-indicator';
        container.parentElement.appendChild(turnIndicator);
      }
    });
  }
  
  function renderCenterArea() {
    const trickArea = document.getElementById('trick-area');
    trickArea.innerHTML = '';
    
    if (!gameState) return;
    
    // If in bidding phase, show turn-up card
    if ((gameState.gamePhase === 'bidding1' || gameState.gamePhase === 'bidding2') && gameState.turnUpCard) {
      console.log('Rendering turn-up card:', gameState.turnUpCard);
      
      const cardEl = document.createElement('div');
      cardEl.className = 'card turn-up-card';
      
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
      
      // Add label
      const turnUpLabel = document.createElement('div');
      turnUpLabel.className = 'turn-up-label';
      turnUpLabel.textContent = 'Turn Up Card';
      trickArea.appendChild(turnUpLabel);
      
      trickArea.appendChild(cardEl);
    } 
    // If in playing phase, show current trick
    else if (gameState.gamePhase === 'playing' && gameState.currentTrick && gameState.currentTrick.length > 0) {
      console.log('Rendering current trick with', gameState.currentTrick.length, 'cards');
      
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
        
        cardEl.className = `card trick-card trick-${position}`;
        
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
        
        //// Add large suit symbol in center
        const symbolEl = document.createElement('div');
        symbolEl.className = 'card-symbol';
        const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
        symbolEl.textContent = suitSymbols[play.card.suit];
        cardEl.appendChild(symbolEl);
        
        // Highlight winner if trick is complete
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
  function showDiscardSelection() {
    // Create a discard overlay for dealer
    const gameContainer = document.querySelector('.game-container');
    
    // Remove any existing overlay
    const existingOverlay = document.getElementById('discard-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'discard-overlay';
    overlay.className = 'discard-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    const message = document.createElement('div');
    message.textContent = 'You must discard one card';
    message.style.color = 'white';
    message.style.fontSize = '24px';
    message.style.marginBottom = '20px';
    
    const cardContainer = document.createElement('div');
    cardContainer.style.display = 'flex';
    cardContainer.style.gap = '10px';
    
    // Add the turn up card to show what's being added
    const turnUpCardEl = document.createElement('div');
    turnUpCardEl.className = 'card turn-up-card';
    turnUpCardEl.style.marginRight = '30px';
    
    // Add color class for red suits
    const isRed = gameState.turnUpCard.suit === 'hearts' || gameState.turnUpCard.suit === 'diamonds';
    if (isRed) {
      turnUpCardEl.classList.add('red');
    }
    
    const valueEl = document.createElement('div');
    valueEl.className = 'card-value';
    valueEl.textContent = `${gameState.turnUpCard.rank}`;
    turnUpCardEl.appendChild(valueEl);
    
    const symbolEl = document.createElement('div');
    symbolEl.className = 'card-symbol';
    const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
    symbolEl.textContent = suitSymbols[gameState.turnUpCard.suit];
    turnUpCardEl.appendChild(symbolEl);
    
    const plusSign = document.createElement('div');
    plusSign.textContent = '+';
    plusSign.style.color = 'white';
    plusSign.style.fontSize = '32px';
    plusSign.style.margin = '0 10px';
    
    // Show each card in the hand
    const myHand = gameState.hands[myPlayerId];
    if (myHand) {
      myHand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        
        // Add color class for red suits
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        if (isRed) {
          cardEl.classList.add('red');
        }
        
        const valueEl = document.createElement('div');
        valueEl.className = 'card-value';
        valueEl.textContent = `${card.rank}`;
        cardEl.appendChild(valueEl);
        
        const symbolEl = document.createElement('div');
        symbolEl.className = 'card-symbol';
        symbolEl.textContent = suitSymbols[card.suit];
        cardEl.appendChild(symbolEl);
        
        // Add click handler to discard this card
        cardEl.addEventListener('click', () => {
          socket.emit('euchreDiscard', index);
          overlay.remove();
        });
        
        cardContainer.appendChild(cardEl);
      });
    }
    
    // Add elements to overlay
    overlay.appendChild(message);
    
    const cardDisplay = document.createElement('div');
    cardDisplay.style.display = 'flex';
    cardDisplay.style.alignItems = 'center';
    
    cardDisplay.appendChild(turnUpCardEl);
    cardDisplay.appendChild(plusSign);
    cardDisplay.appendChild(cardContainer);
    
    overlay.appendChild(cardDisplay);
    document.body.appendChild(overlay);
  }
  
  function renderScores() {
    // Update team scores
    if (gameState.teamScores) {
      teamScore1.textContent = gameState.teamScores[0] || 0;
      teamScore2.textContent = gameState.teamScores[1] || 0;
    }
    
    // Update trick counts for each player
    const positions = ['north', 'west', 'south', 'east']; // In seat order 1,2,3,4
    const seatNumbers = [1, 2, 3, 4];
    
    seatNumbers.forEach((seatNum, index) => {
      const position = positions[index];
      const tricksCountEl = document.querySelector(`.player-${position} .tricks-count`);
      
      if (tricksCountEl) {
        const playerId = roomState.playerSeats[seatNum];
        if (playerId && gameState.tricksWon) {
          tricksCountEl.textContent = gameState.tricksWon[playerId] || 0;
        } else {
          tricksCountEl.textContent = '0';
        }
      }
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