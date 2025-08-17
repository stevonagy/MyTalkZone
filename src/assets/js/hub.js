// src/assets/js/hub.js
(function() {
  const listEl = document.getElementById('rooms');
  const emptyMsg = document.getElementById('emptyMsg');
  const searchEl = document.getElementById('search');
  const createBtn = document.getElementById('createRoomBtn');

  // Hero login/logout (single visible set)
  const loginHeroBtn = document.getElementById('loginHero');
  const logoutHeroBtn = document.getElementById('logoutHero');

  // Hidden real buttons for deso.js integration (do not show to user)
  const realLoginBtn  = document.getElementById('deso-login');
  const realLogoutBtn = document.getElementById('deso-logout');

  let cachedRooms = [];

  function escapeHtml(str='') {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function shorten(v) {
    if (!v) return '';
    return `${v.slice(0,6)}…${v.slice(-6)}`;
  }
  function getPubKey() {
    try { return localStorage.getItem('deso_user_key') || ''; } catch { return ''; }
  }

  async function fetchRooms() {
    const pub = getPubKey();
    if (!pub) return { rooms: [], ttlMs: 0, now: Date.now(), canCreate: false };
    const res = await fetch('/api/rooms', { headers: { 'x-deso-pubkey': pub }});
    if (!res.ok) return { rooms: [], ttlMs: 0, now: Date.now(), canCreate: false };
    return res.json();
  }

  function formatEta(ms) {
    if (ms <= 0) return 'soon';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours >= 1) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function render(payload) {
    const { rooms, ttlMs, now } = payload;
    cachedRooms = Array.isArray(rooms) ? rooms : [];
    const filter = (searchEl?.value || '').trim().toLowerCase();
    const filtered = filter
      ? cachedRooms.filter(r => (r.title || r.id || '').toLowerCase().includes(filter))
      : cachedRooms.slice();

    listEl.innerHTML = '';
    if (!filtered.length) {
      emptyMsg.style.display = 'block';
      return;
    }
    emptyMsg.style.display = 'none';

    filtered.forEach(r => {
      const card = document.createElement('div');
      card.className = 'room-card';
      const created = new Date(r.createdAt);
      const lastActive = r.lastActive ? new Date(r.lastActive) : created;

      let creator = '';
      if (r.createdByName) creator = '@' + r.createdByName;
      else if (r.createdBy) creator = shorten(r.createdBy);

      const live = (r.participants || 0) > 0
        ? `<span class="pill pill-live">🟢 Live ${r.participants}</span>`
        : `<span class="pill">👥 ${r.participants || 0}</span>`;
      let metaLine = `ID: ${escapeHtml(r.id)} · ${live}`;
      if (creator) metaLine += ` · by ${escapeHtml(creator)}`;

      let ttlLine = '';
      if ((r.participants || 0) === 0 && ttlMs > 0) {
        const remaining = ttlMs - ( (now || Date.now()) - (r.lastActive || r.createdAt) );
        ttlLine = `<div class="muted">Auto-deletes in ~${escapeHtml(formatEta(remaining))}</div>`;
      }

      const lockBadge = r.locked ? ' <span class="pill pill-private">🔒 Private</span>' : '';
      card.innerHTML = `
        <div class="room-title">${escapeHtml(r.title || r.id)}${lockBadge}</div>
        <div class="muted" style="margin-top:2px;">${metaLine}</div>
        <div class="muted">Created: ${created.toLocaleString()} · Last activity: ${lastActive.toLocaleString()}</div>
        ${ttlLine}
        <div style="margin-top:10px;">
          <button class="btn-soft" data-join="${encodeURIComponent(r.id)}">Join room</button>
        </div>
      `;
      listEl.appendChild(card);
    });

    listEl.querySelectorAll('[data-join]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = decodeURIComponent(e.currentTarget.getAttribute('data-join'));
        window.location.href = `/call?room=${encodeURIComponent(id)}`;
      });
    });
  }

  // ---- Single visible Login/Logout behavior ----
  function syncHeroLoginButtons() {
    const hasKey = !!getPubKey();
    if (loginHeroBtn)  loginHeroBtn.classList.toggle('d-none', hasKey);
    if (logoutHeroBtn) logoutHeroBtn.classList.toggle('d-none', !hasKey);
  }

  function wireHeroLogin() {
    if (loginHeroBtn) {
      loginHeroBtn.onclick = () => {
        // forward to hidden real login so deso.js runs its flow
        realLoginBtn?.click();
      };
    }
    if (logoutHeroBtn) {
      logoutHeroBtn.onclick = () => {
        realLogoutBtn?.click();
      };
    }
    // react to deso.js events
    window.addEventListener('deso:login-success', async () => {
      syncHeroLoginButtons();
      // after login, refetch so we can show Create room if allowed
      const payload = await fetchRooms();
      render(payload);
      if (createBtn) {
        if (payload.canCreate) createBtn.classList.remove('d-none');
        else createBtn.classList.add('d-none');
      }
    });
    window.addEventListener('deso:logout', () => {
      syncHeroLoginButtons();
      if (createBtn) createBtn.classList.add('d-none');
    });
    // initial state
    syncHeroLoginButtons();
  }

  async function init() {
    const payload = await fetchRooms();
    render(payload);
    if (createBtn) {
      // show only if logged in and allowed
      if (payload.canCreate) createBtn.classList.remove('d-none');
      createBtn.addEventListener('click', () => {
        const name = prompt('Room name:');
        if (!name) return;
        window.location.href = `/call?room=${encodeURIComponent(name)}&title=${encodeURIComponent(name)}`;
      });
    }

    wireHeroLogin();

    // realtime updates
    const socket = io('/stream', {
      transports: ['websocket'],
      auth: { publicKey: getPubKey() || undefined }
    });

    socket.on('rooms:update', async () => {
      render(await fetchRooms());
    });

    // search typing
    if (searchEl) {
      searchEl.addEventListener('input', () => render({ rooms: cachedRooms, ttlMs: 0, now: Date.now() }));
    }
  }

  window.addEventListener('load', init);
})();
