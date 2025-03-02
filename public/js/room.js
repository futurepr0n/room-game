document.addEventListener('DOMContentLoaded', function() {
  const socket = io();
  const roomId = window.location.pathname.split('/')[1];
  const gameButton = document.getElementById('game-button');
  const inviteButton = document.getElementById('invite-button');
  const standButton = document.getElementById('stand-button');
  const playerNameInput = document.getElementById('player-name');
  const playerList = document.getElementById('player-list');
  const seatedPlayerList = document.getElementById('seated-player-list');
  const currentRoundRollsContainer = document.getElementById('current-round-rolls');
  const previousRoundRollsContainer = document.getElementById('previous-round-rolls');
  const scoresContainer = document.getElementById('scores');
  const autoTurnButton = document.getElementById('auto-turn-button');
  const autoTurnStatusLabel = document.getElementById('auto-turn-status');

  const sitButtons = [
    document.getElementById('sit-button-1'),
    document.getElementById('sit-button-2'),
    document.getElementById('sit-button-3'),
    document.getElementById('sit-button-4'),
  ];

  const seatLabels = [
    document.getElementById('seat-label-1'),
    document.getElementById('seat-label-2'),
    document.getElementById('seat-label-3'),
    document.getElementById('seat-label-4'),
  ];

  let autoTurnEnabled = false;

  autoTurnButton.addEventListener('click', function() {
    autoTurnEnabled = !autoTurnEnabled;
    autoTurnStatusLabel.textContent = autoTurnEnabled ? 'On' : 'Off';
  });

  let currentRoundRolls = {};
  let previousRoundRolls = {};

  if (roomId) {
    const playerName = prompt('Enter your name:');
    const password = prompt('Enter room password (if any):');
    socket.emit('joinRoom', { roomId, playerName, password });

    sitButtons.forEach((button, index) => {
      button.addEventListener('click', function() {
        const seatNumber = index + 1;
        console.log('Requesting to sit at seat:', seatNumber);
        
        // Temporarily disable the button to prevent multiple clicks
        button.disabled = true;
        button.textContent = 'Joining...';
        
        // Send the sit request to the server
        socket.emit('sitAtTable', seatNumber);
        
        // Re-enable after a short delay if no response
        setTimeout(() => {
          if (button.textContent === 'Joining...') {
            button.disabled = false;
            button.textContent = 'Sit';
          }
        }, 3000);
      });
    });

    standButton.addEventListener('click', function() {
      socket.emit('standFromTable');
    });

    socket.on('updateRoom', function(room) {
      console.log('Room updated:', room); // Logging for debugging
    
      // Update player list in lobby
      playerList.innerHTML = '';
      for (const playerId in room.playerNames) {
        const playerName = room.playerNames[playerId];
        const playerItem = document.createElement('li');
        
        // Indicate CPU players in the list
        if (playerId.startsWith('cpu_')) {
          playerItem.textContent = `${playerName} (CPU)`;
          playerItem.style.color = '#888'; // Gray out CPU players
        } else {
          playerItem.textContent = playerName;
        }
    
        playerList.appendChild(playerItem);
      }
    
      // Update seated players list
      seatedPlayerList.innerHTML = '';
      sitButtons.forEach((button, index) => {
        button.style.display = 'inline-block';
        seatLabels[index].textContent = '';
        seatLabels[index].style.color = ''; // Reset color
      });
    

      // Show seated players and mark CPUs
    for (const [seatNumber, playerId] of Object.entries(room.playerSeats)) {
      const playerName = room.playerNames[playerId];
      const seatIndex = parseInt(seatNumber) - 1;
      const isCpu = playerId.startsWith('cpu_');
      
      // Update the list of seated players
      const playerItem = document.createElement('li');
      if (isCpu) {
        playerItem.textContent = `Seat ${seatNumber}: ${playerName} (CPU)`;
        playerItem.style.color = '#888'; // Gray out CPU players
      } else {
        playerItem.textContent = `Seat ${seatNumber}: ${playerName}`;
        
        // Highlight if it's the current user
        if (playerId === socket.id) {
          playerItem.style.fontWeight = 'bold';
          playerItem.textContent += ' (You)';
        }
      }
    
      seatedPlayerList.appendChild(playerItem);
    
      // Update the seat labels and hide sit buttons for occupied seats
      if (seatIndex >= 0 && seatIndex < sitButtons.length) {
        sitButtons[seatIndex].style.display = 'none';
        
        if (seatIndex < seatLabels.length) {
          // Mark CPU players in seat labels
          if (isCpu) {
            seatLabels[seatIndex].textContent = `${playerName} (CPU)`;
            seatLabels[seatIndex].style.color = '#888';
          } else {
            seatLabels[seatIndex].textContent = playerName;
            
            // Highlight if it's the current user
            if (playerId === socket.id) {
              seatLabels[seatIndex].textContent += ' (You)';
              seatLabels[seatIndex].style.fontWeight = 'bold';
            }
          }
        }
      }
    }
    
  // Enable/disable stand button based on whether the player is seated
  standButton.disabled = !room.seatedPlayers.includes(socket.id);

  // Update game button state based on current player
  if (socket.id === room.currentPlayer) {
    gameButton.disabled = false;
    gameButton.textContent = `Your Turn (${room.playerNames[socket.id]}) - Click Me!`;
  } else if (room.currentPlayer) {
    gameButton.disabled = true;
    gameButton.textContent = `Wait for ${room.playerNames[room.currentPlayer]}'s Turn`;
  } else {
    gameButton.disabled = true;
    gameButton.textContent = 'Wait for Your Turn';
  }

  // Update scores if available
  if (room.playerWins) {
    const scoresHTML = Object.entries(room.playerWins)
      .map(([playerId, wins]) => {
        const playerName = room.playerNames[playerId];
        const isCpu = playerId.startsWith('cpu_');
        return `<li>${playerName}${isCpu ? ' (CPU)' : ''}: ${wins} wins</li>`;
      })
      .join('');
    scoresContainer.innerHTML = `<h3>Scores:</h3><ul>${scoresHTML}</ul>`;
  }
});

    socket.on('updateCurrentRoundRolls', function(rolls) {
      currentRoundRolls = rolls;
      updateRollsDisplay(currentRoundRollsContainer, currentRoundRolls, 'Current Round Rolls');
    });

    socket.on('updatePreviousRoundRolls', function(rolls) {
      previousRoundRolls = rolls;
      updateRollsDisplay(previousRoundRollsContainer, previousRoundRolls, 'Previous Round Rolls');
    });

    socket.on('finalScores', function(finalScores) {
      const scoresHTML = finalScores.map(score => `<li>${score}</li>`).join('');
      scoresContainer.innerHTML = `<h3>Final Scores:</h3><ul>${scoresHTML}</ul>`;
    });

    socket.on('roomFull', function(data) {
      alert(data.message);
      window.location.href = '/';
    });

    socket.on('wrongPassword', function(data) {
      alert(data.message);
      window.location.href = '/';
    });

    function rollDice() {
      const diceRoll = Math.floor(Math.random() * 6) + 1;
      alert(`You rolled a ${diceRoll}`);
      socket.emit('diceRoll', diceRoll);
    }

    gameButton.onclick = function() {
      if (!gameButton.disabled) {
        rollDice();
      }
    };

    inviteButton.onclick = function() {
      const roomUrl = window.location.href;
      const tempInput = document.createElement('input');
      tempInput.value = roomUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      alert('Room URL copied to clipboard');
    };
  }

  function updateRollsDisplay(container, rolls, heading) {
    container.innerHTML = '';
    const headingElement = document.createElement('h3');
    headingElement.textContent = heading;
    container.appendChild(headingElement);
    const rollsList = document.createElement('ul');
    for (const [playerId, { playerName, roll }] of Object.entries(rolls)) {
      const rollItem = document.createElement('li');
      rollItem.textContent = `${playerName}: ${roll}`;
      rollsList.appendChild(rollItem);
    }
    container.appendChild(rollsList);
  }
});
