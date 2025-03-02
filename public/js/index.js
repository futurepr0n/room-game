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

  socket.emit('createRoom', { gameType, maxPlayers, publiclyListed, password });
}

socket.on('updateActiveRooms', (activeRooms) => {
  const activeRoomsTable = document.getElementById('active-rooms-table');
  activeRoomsTable.innerHTML = `
    <tr>
      <th>Room ID</th>
      <th>Room Status</th>
      <th>Table Status</th>
      <th>Join</th>
    </tr>
  `;

  for (const [roomId, room] of Object.entries(activeRooms)) {
    if (room.publiclyListed) {
      const roomStatus = room.roomStatus;
      const tableStatus = room.tableStatus;
      const joinLink = `<a href="/${roomId}">Join</a>`;
      activeRoomsTable.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${roomId}</td>
          <td>${roomStatus}</td>
          <td>${tableStatus}</td>
          <td>${joinLink}</td>
        </tr>
      `);
    }
  }
});

socket.on('roomCreated', (roomId) => {
  window.location.href = `/${roomId}`;
});
