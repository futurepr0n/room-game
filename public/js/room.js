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
        socket.emit('sitAtTable', index + 1);
      });
    });

    standButton.addEventListener('click', function() {
      socket.emit('standFromTable');
    });

    socket.on('updateRoom', function(room) {
      console.log('Room updated:', room); // Logging for debugging

      playerList.innerHTML = '';
      for (const playerId in room.playerNames) {
        const playerName = room.playerNames[playerId];
        const playerItem = document.createElement('li');
        playerItem.textContent = playerName;

        playerList.appendChild(playerItem);
      }

      seatedPlayerList.innerHTML = '';
      sitButtons.forEach((button, index) => {
        button.style.display = 'inline-block';
        seatLabels[index].textContent = '';
      });

      for (const [seatNumber, playerId] of Object.entries(room.playerSeats)) {
        const playerName = room.playerNames[playerId];
        const playerItem = document.createElement('li');
        playerItem.textContent = `${seatNumber}. ${playerName}`;

        seatedPlayerList.appendChild(playerItem);
        sitButtons[seatNumber - 1].style.display = 'none';
        seatLabels[seatNumber - 1].textContent = playerName;
      }

      if (room.seatedPlayers.includes(socket.id)) {
        standButton.disabled = false;
      } else {
        standButton.disabled = true;
      }

      if (socket.id === room.currentPlayer) {
        gameButton.disabled = false;
        gameButton.textContent = `Your Turn (${room.playerNames[socket.id]}) - Click Me!`;
      } else {
        gameButton.disabled = true;
        gameButton.textContent = `Wait for ${room.playerNames[room.currentPlayer]}'s Turn`;
      }

      const scoresHTML = Object.entries(room.playerWins).map(([playerId, wins]) => `<li>${room.playerNames[playerId]}: ${wins} wins</li>`).join('');
      scoresContainer.innerHTML = `<h3>Scores:</h3><ul>${scoresHTML}</ul>`;
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
