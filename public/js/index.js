const socket = io();

function showRoomCreationForm() {
  document.getElementById('room-creation-form').style.display = 'block';
}

function createRoom(event) {
  event.preventDefault();
  
  const gameType = document.getElementById('game-type').value;
  const maxPlayers = document.getElementById('max-players').value;
  const publiclyListed = document.getElementById('publicly-listed').checked;
  const password = document.getElementById('password').value;

  console.log('Creating room with settings:', { gameType, maxPlayers, publiclyListed });
  socket.emit('createRoom', { gameType, maxPlayers, publiclyListed, password });
}

socket.on('updateActiveRooms', (activeRooms) => {
  console.log('Received active rooms update:', activeRooms);
  const activeRoomsTable = document.getElementById('active-rooms-table');
  
  // Clear existing table except header
  while (activeRoomsTable.rows.length > 1) {
    activeRoomsTable.deleteRow(1);
  }
  
  // If there's no header row, add it
  if (activeRoomsTable.rows.length === 0) {
    const headerRow = activeRoomsTable.insertRow();
    headerRow.innerHTML = `
      <th>Room ID</th>
      <th>Game Type</th>
      <th>Room Status</th>
      <th>Table Status</th>
      <th>Join</th>
    `;
  }

  // Add rows for each active room
  for (const [roomId, room] of Object.entries(activeRooms)) {
    if (room.publiclyListed) {
      const roomStatus = room.roomStatus;
      const tableStatus = room.tableStatus;
      const gameType = room.gameType || 'Unknown';
      
      // Get game status
      const statusClass = room.gameActive ? 'game-active' : 'game-inactive';
      const statusText = room.gameActive ? '(Game in Progress)' : '';
      
      const row = activeRoomsTable.insertRow();
      row.className = statusClass;
      
      row.innerHTML = `
        <td>${roomId}</td>
        <td>${gameType} ${statusText}</td>
        <td>${roomStatus}</td>
        <td>${tableStatus}</td>
        <td><a href="/${roomId}">Join</a></td>
      `;
    }
  }
  
  // If there are no public rooms, show a message
  if (activeRoomsTable.rows.length === 1) {
    const row = activeRoomsTable.insertRow();
    row.innerHTML = `
      <td colspan="5" style="text-align: center;">No active public rooms. Create one to get started!</td>
    `;
  }
});

socket.on('roomCreated', (roomId) => {
  console.log('Room created, redirecting to:', roomId);
  window.location.href = `/${roomId}`;
});

// Add some CSS for active/inactive game status
document.addEventListener('DOMContentLoaded', function() {
  const style = document.createElement('style');
  style.textContent = `
    .game-active {
      background-color: rgba(144, 238, 144, 0.2);
    }
    .game-inactive {
      background-color: rgba(255, 255, 255, 0.1);
    }
  `;
  document.head.appendChild(style);
});