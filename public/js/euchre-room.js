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
      
      // Render the game state
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

  function updateGameControls() {
    // Clear all control displays
    biddingControls.style.display = 'none';
    suitSelection.style.display = 'none';
    newGameBtn.style.display = 'none';
    dealBtn.style.display = 'none';
    
    // Only proceed if we have game state
    if (!gameState) return;
    
    // Check if user is a spectator
    const isSpectator = !roomState.seatedPlayers.includes(myPlayerId);
    
    // Update trump indicator
    if (gameState.trumpSuit) {
      trumpIndicator.style.display = 'block';
      const suitSymbols = {'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'};
      const suitSymbol = suitSymbols[gameState.trumpSuit] || '';
      trumpSuitText.textContent = `${gameState.trumpSuit.charAt(0).toUpperCase() + gameState.trumpSuit.slice(1)} ${suitSymbol}`;
      
      // Add color class for red suits
      if (gameState.trumpSuit === 'hearts' || gameState.trumpSuit === 'diamonds') {
        trumpSuitText.className = 'red';
      } else {
        trumpSuitText.className = '';
      }
    } else {
      trumpIndicator.style.display = 'none';
    }
    
    // Handle different game phases
    if (gameState.gamePhase === 'idle') {
      infoText.textContent = 'Welcome to Euchre! Click Deal to start.';
      
      if (!isSpectator) {
        // Only show deal button to seated players
        dealBtn.style.display = 'inline-block';
        dealBtn.disabled = roomState.seatedPlayers.length < 4;
      }
    } 
    else if (gameState.gamePhase === 'bidding1') {
      // For spectators, always show what's happening
      if (isSpectator) {
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is deciding whether to order up ${gameState.turnUpCard.suit}...`;
      }
      // For active players
      else if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = `Do you want to order up ${gameState.turnUpCard.suit}?`;
        biddingControls.style.display = 'block';
        
        // Enable/disable going alone option based on dealer
        // If player is dealer, they're ordering up to themselves
        let isDealer = false;
        for (const [seatNum, playerId] of Object.entries(roomState.playerSeats)) {
          if (playerId === myPlayerId) {
            const dealerPos = gameState.dealerPosition;
            const dealerSeat = (dealerPos % 4) + 1;
            isDealer = (parseInt(seatNum) === dealerSeat);
            break;
          }
        }
        
        // Always show the regular order up button
        if (document.getElementById('order-up')) {
          document.getElementById('order-up').style.display = 'inline-block';
        }
        
        // Only show alone option when appropriate
        if (document.getElementById('order-up-alone')) {
          document.getElementById('order-up-alone').style.display = isDealer ? 'none' : 'inline-block';
        }
      } else {
        // Another player's turn
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is deciding...`;
      }
    } 
    else if (gameState.gamePhase === 'bidding2') {
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
            // Clear any previous selections
            button.classList.remove('selected');
          }
        });
        
        // Reset the selected suit
        selectedSuit = null;
      } else {
        // Another player's turn
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `${currentPlayerName} is selecting a trump suit...`;
      }
    } 
    else if (gameState.gamePhase === 'playing') {
      // Show going alone indicator when applicable
      let alonePlayerName = '';
      if (gameState.isGoingAlone && gameState.alonePlayer) {
        alonePlayerName = roomState.playerNames[gameState.alonePlayer] || 'Unknown';
        
        // Add alone indicator if not already present
        if (!document.getElementById('alone-indicator')) {
          const aloneIndicator = document.createElement('div');
          aloneIndicator.id = 'alone-indicator';
          aloneIndicator.className = 'alone-indicator';
          aloneIndicator.textContent = `${alonePlayerName} IS GOING ALONE`;
          aloneIndicator.style.position = 'absolute';
          aloneIndicator.style.top = '60px';
          aloneIndicator.style.left = '50%';
          aloneIndicator.style.transform = 'translateX(-50%)';
          aloneIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
          aloneIndicator.style.color = 'white';
          aloneIndicator.style.padding = '5px 10px';
          aloneIndicator.style.borderRadius = '5px';
          aloneIndicator.style.zIndex = '1000';
          aloneIndicator.style.fontWeight = 'bold';
          
          const gameContainer = document.querySelector('.game-container');
          if (gameContainer) {
            gameContainer.appendChild(aloneIndicator);
          }
        }
      } else {
        // Remove alone indicator if present but no longer applicable
        const aloneIndicator = document.getElementById('alone-indicator');
        if (aloneIndicator) {
          aloneIndicator.remove();
        }
      }
      
      // For spectators
      if (isSpectator) {
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `Waiting for ${currentPlayerName} to play...`;
      }
      // For active players
      else if (gameState.currentPlayer === myPlayerId) {
        infoText.textContent = 'Your turn. Play a card.';
      } else {
        // Another player's turn
        const currentPlayerName = roomState.playerNames[gameState.currentPlayer] || 'Unknown';
        infoText.textContent = `Waiting for ${currentPlayerName} to play...`;
      }
    } 
    else if (gameState.gamePhase === 'gameover') {
      const winningTeam = gameState.teamScores[0] > gameState.teamScores[1] ? 1 : 2;
      infoText.textContent = `Game over! Team ${winningTeam} wins!`;
      
      if (!isSpectator) {
        newGameBtn.style.display = 'inline-block';
      }
    }
    
    // Remove any existing turn indicators
    document.querySelectorAll('.turn-indicator').forEach(el => el.remove());
    
    // Add turn indicator for current player
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
        indicator.innerHTML = '🔄';
        
        const playerArea = document.querySelector(`.player-${position}`);
        if (playerArea) {
          playerArea.appendChild(indicator);
        }
      }
    }
    
    // Highlight dealer position
    document.querySelectorAll('.dealer-indicator').forEach(el => el.remove());
    
    if (gameState.dealerPosition !== undefined) {
      const dealerSeat = (gameState.dealerPosition % 4) + 1;
      let dealerPosition;
      switch (dealerSeat) {
        case 1: dealerPosition = 'north'; break;
        case 2: dealerPosition = 'west'; break;
        case 3: dealerPosition = 'south'; break;
        case 4: dealerPosition = 'east'; break;
      }
      
      const dealerArea = document.querySelector(`.player-${dealerPosition}`);
      if (dealerArea) {
        const dealerIndicator = document.createElement('div');
        dealerIndicator.className = 'dealer-indicator';
        dealerIndicator.textContent = 'DEALER';
        dealerIndicator.style.position = 'absolute';
        dealerIndicator.style.bottom = '5px';
        dealerIndicator.style.right = '5px';
        dealerIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        dealerIndicator.style.color = 'white';
        dealerIndicator.style.padding = '3px 6px';
        dealerIndicator.style.borderRadius = '3px';
        dealerIndicator.style.fontSize = '10px';
        
        dealerArea.appendChild(dealerIndicator);
      }
    }
    
    // Highlight first position player (lead position)
    document.querySelectorAll('.first-position-indicator').forEach(el => el.remove());
    
    if (gameState.firstPositionId) {
      // Find seat number for first position player
      let firstSeat = null;
      for (const [seatNumber, playerId] of Object.entries(roomState.playerSeats)) {
        if (playerId === gameState.firstPositionId) {
          firstSeat = parseInt(seatNumber);
          break;
        }
      }
      
      if (firstSeat) {
        let firstPosition;
        switch (firstSeat) {
          case 1: firstPosition = 'north'; break;
          case 2: firstPosition = 'west'; break;
          case 3: firstPosition = 'south'; break;
          case 4: firstPosition = 'east'; break;
        }
        
        const firstArea = document.querySelector(`.player-${firstPosition}`);
        if (firstArea) {
          const firstIndicator = document.createElement('div');
          firstIndicator.className = 'first-position-indicator';
          firstIndicator.textContent = 'LEAD';
          firstIndicator.style.position = 'absolute';
          firstIndicator.style.top = '5px';
          firstIndicator.style.left = '5px';
          firstIndicator.style.backgroundColor = 'rgba(255, 215, 0, 0.7)';
          firstIndicator.style.color = 'black';
          firstIndicator.style.padding = '3px 6px';
          firstIndicator.style.borderRadius = '3px';
          firstIndicator.style.fontSize = '10px';
          firstIndicator.style.fontWeight = 'bold';
          
          firstArea.appendChild(firstIndicator);
        }
      }
    }
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
    
    // Render hands
    renderHands();
    
    // Render turn up card or current trick
    renderCenterArea();
    
    // Update scores
    renderScores();
    
    // Update game info and controls
    updateGameControls();

    // Highlight first position player
    if (gameState.firstPositionId) {
      const firstPlayerElements = document.querySelectorAll('.player-area');
      firstPlayerElements.forEach(el => {
        const playerName = el.querySelector('.player-name');
        if (playerName && playerName.textContent.includes(room.playerNames[gameState.firstPositionId])) {
          el.classList.add('first-position');
          // Optionally add an emoji indicator
          playerName.innerHTML += ' 🏁';
        } else {
          el.classList.remove('first-position');
        }
      });
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