import h from './helpers.js';

window.addEventListener('load', () => {
  const createBtn = document.getElementById('create-room');
  const enterBtn  = document.getElementById('enter-room');

  // CREATE ROOM
  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault();

      const roomNameInput = document.getElementById('room-name');
      const yourNameInput = document.getElementById('your-name');

      const roomName = (roomNameInput?.value || '').trim();
      const yourName = (yourNameInput?.value || '').trim();

      if (!roomName || !yourName) {
        const err = document.getElementById('err-msg');
        if (err) err.innerText = 'Please enter Room Name and Your Name.';
        else alert('Please enter Room Name and Your Name.');
        return;
      }

      try { sessionStorage.setItem('username', yourName); } catch {}

      const desoKey = (() => { try { return localStorage.getItem('deso_user_key'); } catch { return null; } })();
      if (!desoKey) {
        const err = document.getElementById('err-msg');
        if (err) err.innerText = 'Please log in with your DeSo account first.';
        else alert('Please log in with your DeSo account first.');
        return;
      }

      // VAŽNO: ide na /call
      const url = `/call?room=${encodeURIComponent(roomName)}&title=${encodeURIComponent(roomName)}`;
      window.location.href = url;
    });
  }

  // ENTER ROOM
  if (enterBtn) {
    enterBtn.addEventListener('click', (e) => {
      e.preventDefault();

      const usernameInput = document.getElementById('username');
      const name = (usernameInput?.value || '').trim();
      if (!name) {
        const err = document.getElementById('err-msg-username');
        if (err) err.innerText = 'Please enter your name.';
        else alert('Please enter your name.');
        return;
      }

      try { sessionStorage.setItem('username', name); } catch {}
      location.reload();
    });
  }
});
