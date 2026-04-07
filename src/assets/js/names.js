// src/assets/js/names.js
// Sigurno: ne dira rtc.js, ne mijenja sobu. Sluša oba kanala (name + chat) i crta bedževe.

(function () {
  const NAME_RETRY_DELAYS = [0, 250, 1000];
  const peerNames = {}; // socketId | 'local-grid' -> username

  function getMyDisplayName() {
    try { return sessionStorage.getItem('username') || 'Guest'; }
    catch { return 'Guest'; }
  }

  function ensureBadge(tileId) {
    const card = document.getElementById(tileId);
    if (!card) return null;
    let tag = card.querySelector('.name-badge');
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'name-badge';
      Object.assign(tag.style, {
        position: 'absolute', top: '6px', right: '6px',
        padding: '2px 6px', borderRadius: '4px',
        fontSize: '11px', color: '#fff', zIndex: '11',
        background: 'rgba(15,23,42,0.85)',
        border: '1px solid rgba(255,255,255,.12)',
        pointerEvents: 'none'
      });
      const pos = getComputedStyle(card).position;
      if (!/relative|absolute|fixed|sticky/.test(pos)) card.style.position = 'relative';
      card.appendChild(tag);
    }
    return tag;
  }

  function refreshBadge(tileId) {
    const tag = ensureBadge(tileId);
    if (!tag) return;
    const label = peerNames[tileId] || '';
    tag.textContent = label || '';
    tag.hidden = !label;
  }

  function refreshAll() {
    Object.keys(peerNames).forEach(refreshBadge);
  }

  function wire() {
    if (!window.socket) return setTimeout(wire, 80);
    const socket = window.socket;

    // === PRIJEM TUĐIH IMENA ===
    // 1) Dedicated 'name' event (ako je server relay prisutan)
    socket.on('name', (d = {}) => {
      if (!d.id) return;
      peerNames[d.id] = d.name || 'Guest';
      refreshBadge(d.id);
    });

    // 2) Fallback preko chat kanala (server ne treba ništa mijenjati)
    const origChatHandler = (data) => window.h && window.h.addChat ? window.h.addChat(data, 'remote') : null;
    socket.off('chat'); // skidamo stari listener pa ga “wrapamo”
    socket.on('chat', (data = {}) => {
      if (data && data.__sys === 'name' && data.id) {
        peerNames[data.id] = data.name || 'Guest';
        refreshBadge(data.id);
        return; // ne prikazuj u chatu
      }
      origChatHandler && origChatHandler(data);
    });

    // === SLANJE MOG IMENA ===
    function announceMyName() {
      const name = getMyDisplayName();
      // Pošalji na dedicated kanal (ako postoji relay na serveru)…
      try { socket.emit('name', { name }); } catch {}
      // …i istovremeno na chat fallback (uvijek prolazi jer chat već relay-aš)
      try { socket.emit('chat', { __sys: 'name', id: socket.id, name }); } catch {}
    }

    // Kad si “subscribed” u sobu: nacrtaj lokalni badge i objavi ime (par retrya)
    socket.on('subscribed', () => {
      try { peerNames['local-grid'] = getMyDisplayName(); refreshBadge('local-grid'); } catch {}
      NAME_RETRY_DELAYS.forEach(ms => setTimeout(announceMyName, ms));
    });

    // Kad netko novi uđe, re-objavi svoje ime da ga sigurno primi
    socket.on('new user', () => setTimeout(announceMyName, 80));

    // Ako se tileovi dodaju/miču, probaj ponovo nacrtati bedževe
    const grid = document.getElementById('videos');
    if (grid && window.MutationObserver) {
      const mo = new MutationObserver(refreshAll);
      mo.observe(grid, { childList: true, subtree: true });
    }
  }

  wire();
})();
