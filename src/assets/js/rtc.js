import h from './helpers.js';

window.addEventListener('load', async () => {
  const room = h.getQString(location.href, 'room');
  const roomTitle = h.getQString(location.href, 'title') || '';
  let username = (() => { try { return sessionStorage.getItem('username') || ''; } catch { return ''; } })();

  const log = (...a) => { try { console.log('[RTC]', ...a); } catch {} };

  let meetingGatePollId = null;
  let meetingGateTickId = null;

  function showMediaWarn(show) {
    const el = document.getElementById('media-warn');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function formatDateInZone(isoOrMs, timeZone, locale = 'en-GB') {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone,
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(isoOrMs));
    } catch {
      return String(isoOrMs || '');
    }
  }

  function formatDatePair(isoOrMs, timeZone = 'Europe/Zagreb') {
    const local = formatDateInZone(isoOrMs, timeZone, 'en-GB');
    const utc = formatDateInZone(isoOrMs, 'UTC', 'en-GB');
    return `${local} Europe/Zagreb / ${utc} UTC`;
  }

  function getUsernameCacheKey(pubKey = '') {
    const pk = String(pubKey || '').trim();
    return pk ? `deso_username:${pk}` : 'deso_username';
  }

  function readCachedUsername(pubKey = '') {
    const pk = String(pubKey || '').trim();
    try {
      const scoped = localStorage.getItem(getUsernameCacheKey(pk));
      if (scoped) return scoped;
    } catch {}
    try {
      const generic = localStorage.getItem('deso_username');
      if (generic) return generic;
    } catch {}
    return '';
  }

  function persistResolvedUsername(pubKey = '', name = '') {
    const clean = String(name || '').trim().replace(/^@+/, '');
    if (!clean) return '';
    username = clean;
    try { sessionStorage.setItem('username', clean); } catch {}
    try { localStorage.setItem('deso_username', clean); } catch {}
    try {
      const cacheKey = getUsernameCacheKey(pubKey);
      if (cacheKey) localStorage.setItem(cacheKey, clean);
    } catch {}
    return clean;
  }

  async function resolveUsernameFromProfile(pubKey = '') {
    const pk = String(pubKey || '').trim();
    if (!pk) return '';

    const cached = readCachedUsername(pk);
    if (cached) return persistResolvedUsername(pk, cached);

    try {
      const res = await fetch('https://node.deso.org/api/v0/get-single-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ PublicKeyBase58Check: pk })
      });
      if (!res.ok) return '';
      const data = await res.json();
      const resolved = String(data?.Profile?.Username || '').trim();
      return resolved ? persistResolvedUsername(pk, resolved) : '';
    } catch (err) {
      console.warn('Username lookup failed:', err);
      return '';
    }
  }

  async function checkScheduledRoomAccess(roomId) {
    try {
      const res = await fetch(`/api/meetings/access/${encodeURIComponent(roomId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }


  function setHidden(id, hidden) {
    const el = document.getElementById(id);
    if (!el) return;
    if (hidden) el.setAttribute('hidden', 'hidden');
    else el.removeAttribute('hidden');
  }

  function clearMeetingGateTimers() {
    if (meetingGatePollId) { clearInterval(meetingGatePollId); meetingGatePollId = null; }
    if (meetingGateTickId) { clearInterval(meetingGateTickId); meetingGateTickId = null; }
  }

  function hideMeetingGate() {
    clearMeetingGateTimers();
    setHidden('meeting-access-gate', true);
    setHidden('room-create', true);
    setHidden('username-set', true);
  }

  function renderMeetingGate(access = {}) {
    const stateEl = document.getElementById('meeting-gate-state');
    const titleEl = document.getElementById('meeting-gate-title');
    const textEl = document.getElementById('meeting-gate-text');
    const detailsEl = document.getElementById('meeting-gate-details');
    const joinBtn = document.getElementById('meeting-gate-join-btn');
    const refreshBtn = document.getElementById('meeting-gate-refresh-btn');
    const tz = access?.meeting?.timezone || access?.timezone || 'Europe/Zagreb';
    const title = access?.meeting?.title || roomTitle || room || 'Scheduled meeting';
    const joinOpen = access?.joinOpensAtMs ? formatDatePair(access.joinOpensAtMs, tz) : 'unknown';
    const startAt = access?.startsAtMs ? formatDatePair(access.startsAtMs, tz) : 'unknown';
    const endAt = access?.endsAtMs ? formatDatePair(access.endsAtMs, tz) : 'unknown';
    const now = Date.now();

    const formatCountdown = (targetMs) => {
      if (!targetMs || targetMs <= now) return '00:00:00';
      const totalSec = Math.max(0, Math.floor((targetMs - now) / 1000));
      const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    };

    const joinOpensIn = access?.joinOpensAtMs && access.joinOpensAtMs > now ? formatCountdown(access.joinOpensAtMs) : null;
    const meetingStartsIn = access?.startsAtMs && access.startsAtMs > now ? formatCountdown(access.startsAtMs) : null;

    if (stateEl && access?.state === 'closed') stateEl.textContent = 'Meeting closed';
    else if (stateEl && access?.canJoinNow) stateEl.textContent = 'Join is open';
    else if (stateEl) stateEl.textContent = 'Scheduled meeting';

    if (titleEl) titleEl.textContent = title;

    if (textEl && access?.state === 'closed') {
      textEl.innerHTML = '<span class="meeting-gate-text-strong">This meeting is no longer open.</span>';
    } else if (textEl && access?.canJoinNow) {
      textEl.innerHTML = '<span class="meeting-gate-text-strong">You can join this meeting now.</span>';
    } else if (textEl) {
      const summary = joinOpensIn ? `Join opens in ${joinOpensIn}` : 'You can join this meeting 15 minutes before it starts.';
      textEl.innerHTML = `<span class="meeting-gate-text-strong">${summary}</span><br><span class="muted">Meeting starts ${startAt}.</span>`;
    }

    if (detailsEl) {
      const stats = [];
      if (access?.state === 'closed') {
        stats.push(`<div class="meeting-gate-stat"><div class="meeting-gate-stat-label">Meeting ended</div><div class="meeting-gate-stat-value">Closed</div></div>`);
      } else if (access?.canJoinNow) {
        stats.push(`<div class="meeting-gate-stat"><div class="meeting-gate-stat-label">Join status</div><div class="meeting-gate-stat-value">Open now</div></div>`);
      } else {
        stats.push(`<div class="meeting-gate-stat"><div class="meeting-gate-stat-label">Join opens in</div><div class="meeting-gate-stat-value">${joinOpensIn || 'Soon'}</div></div>`);
      }
      stats.push(`<div class="meeting-gate-stat"><div class="meeting-gate-stat-label">Meeting starts in</div><div class="meeting-gate-stat-value">${meetingStartsIn || (access?.canJoinNow ? 'In progress' : 'Now')}</div></div>`);

      const rows = [];
      rows.push(`<div class="meeting-gate-grid">${stats.join('')}</div>`);
      rows.push(`<div class="meeting-gate-line"><strong>Join opens</strong><span class="muted">${joinOpen}</span></div>`);
      rows.push(`<div class="meeting-gate-line"><strong>Meeting starts</strong><span class="muted">${startAt}</span></div>`);
      if (access?.state === 'closed') rows.push(`<div class="meeting-gate-line"><strong>Meeting ended</strong><span class="muted">${endAt}</span></div>`);
      detailsEl.innerHTML = rows.join('');
    }

    if (joinBtn) {
      joinBtn.hidden = !access?.canJoinNow;
      joinBtn.disabled = !access?.canJoinNow;
      joinBtn.textContent = access?.canJoinNow ? 'Join meeting now' : 'Waiting for join window…';
    }
    if (refreshBtn) refreshBtn.disabled = false;
  }

  async function showMeetingGate(access = {}) {
    clearMeetingGateTimers();
    try { localStopAll(); } catch {}
    try {
      hideMeetingGate();
      const mainEl = document.querySelector('main.call-container.main');
      if (mainEl) mainEl.style.display = '';
      const overlay = document.getElementById('prejoin-overlay');
      if (overlay) overlay.hidden = true;
    } catch {}
    setHidden('meeting-access-gate', false);
    const main = document.querySelector('main.call-container.main');
    if (main) main.style.display = 'none';
    renderMeetingGate(access);

    const refreshBtn = document.getElementById('meeting-gate-refresh-btn');
    const joinBtn = document.getElementById('meeting-gate-join-btn');
    if (refreshBtn) refreshBtn.onclick = async () => {
      const latest = await checkScheduledRoomAccess(room);
      if (latest?.canJoinNow) {
        hideMeetingGate();
        const main2 = document.querySelector('main.call-container.main');
        if (main2) main2.style.display = '';
        showPrejoinOverlay();
      } else {
        renderMeetingGate(latest || access);
      }
    };
    if (joinBtn) joinBtn.onclick = async () => {
      hideMeetingGate();
      const main2 = document.querySelector('main.call-container.main');
      if (main2) main2.style.display = '';
      showPrejoinOverlay();
    };

    if (access?.state === 'before_open') {
      meetingGateTickId = setInterval(() => renderMeetingGate(access), 1000);
      meetingGatePollId = setInterval(async () => {
        const latest = await checkScheduledRoomAccess(room);
        if (!latest) return;
        access = latest;
        renderMeetingGate(access);
        if (latest.canJoinNow) {
          clearMeetingGateTimers();
        }
      }, 5000);
    }
  }

  function promptLoginRetry(message = '') {
    try {
      const commElem = document.getElementsByClassName('room-comm');
      for (let i = 0; i < commElem.length; i++) commElem[i].setAttribute('hidden', true);
      const u = document.querySelector('#username-set');
      if (u) u.attributes.removeNamedItem('hidden');
      const e1 = document.querySelector('#err-msg-username');
      if (e1 && message) e1.innerText = message;
      const once = () => {
        window.removeEventListener('deso:login-success', once);
        if (sessionStorage.getItem('username')) location.reload();
      };
      window.addEventListener('deso:login-success', once);
    } catch (err) { console.warn('promptLoginRetry error:', err); }
  }

  if (!room) {
    const rc = document.querySelector('#room-create');
    if (rc) rc.attributes.removeNamedItem('hidden');
    return;
  }

  const desoKey = localStorage.getItem('deso_user_key');
  if (!desoKey) {
    promptLoginRetry('Please log in with your DeSo account to join this room.');
    return;
  }

  if (!username) {
    const resolved = await resolveUsernameFromProfile(desoKey);
    if (resolved) username = resolved;
  }

  if (!username) {
    const us = document.querySelector('#username-set');
    if (us) us.attributes.removeNamedItem('hidden');
  } else {
    setHidden('username-set', true);
  }

  // ------- Socket.io -------
  const socket = io('/stream', { transports: ['websocket'], auth: { publicKey: desoKey } });

  socket.on('connect_error', (err) => {
    if (String(err?.message || '').includes('UNAUTHORIZED')) {
      try { socket.close(); } catch {}
      promptLoginRetry('Login failed or expired. Please try logging in with DeSo again.');
    } else {
      console.error('Socket connect_error:', err);
    }
  });

  socket.on('room-create-denied', async (payload = {}) => {
    const reason = String(payload.reason || 'NOT_ALLOWED');
    let msg = 'You are not allowed to create this room. Please contact the administrator.';
    if (reason === 'MISSING_TITLE') msg = 'Room title is required. Please provide a title.';
    if (reason === 'MISSING_ROOM')  msg = 'Room ID is missing.';
    if (reason === 'SCHEDULED_TOO_EARLY') {
      const joinOpen = payload.joinOpensAtMs ? formatDatePair(payload.joinOpensAtMs, payload.timezone || 'Europe/Zagreb') : 'unknown';
      const startAt = payload.startsAtMs ? formatDatePair(payload.startsAtMs, payload.timezone || 'Europe/Zagreb') : 'unknown';
      msg = `This meeting can be joined only 15 minutes before the start.\n\nJoin opens: ${joinOpen}\nMeeting starts: ${startAt}`;
    }
    if (reason === 'SCHEDULED_CLOSED') {
      const closedAt = payload.joinClosesAtMs ? formatDatePair(payload.joinClosesAtMs, payload.timezone || 'Europe/Zagreb') : 'unknown';
      msg = `This meeting is no longer open.\n\nJoin window ended: ${closedAt}`;
    }
    const scheduledPayload = {
      state: reason === 'SCHEDULED_TOO_EARLY' ? 'before_open' : (reason === 'SCHEDULED_CLOSED' ? 'closed' : 'error'),
      canJoinNow: false,
      meeting: { title: payload.title || roomTitle || room, timezone: payload.timezone || 'Europe/Zagreb' },
      timezone: payload.timezone || 'Europe/Zagreb',
      joinOpensAtMs: payload.joinOpensAtMs || null,
      joinClosesAtMs: payload.joinClosesAtMs || null,
      startsAtMs: payload.startsAtMs || null,
      endsAtMs: payload.endsAtMs || null,
    };
    if (reason === 'SCHEDULED_TOO_EARLY' || reason === 'SCHEDULED_CLOSED') {
      showMeetingGate(scheduledPayload);
      return;
    }
    alert(msg);
    try { localStopAll(); } catch {}
    window.location.href = '/';
  });

  socket.on('subscribed', ({ room: roomNameAck, created }) => {
    log('subscribed OK', { roomNameAck, created });
    const commElem = document.getElementsByClassName('room-comm');
    for (let i = 0; i < commElem.length; i++) commElem[i].removeAttribute('hidden');
    NAME_RETRY_DELAYS.forEach((delay) => announceMyName(delay));
  });

  // ------- ICE path badge -------
  async function labelIcePath(pc, tileId) {
    try {
      const stats = await pc.getStats(null);
      let localType = null, remoteType = null, transport = null, rttMs = null, jitterMs = null;

      stats.forEach(report => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          const pair = stats.get(report.selectedCandidatePairId);
          if (pair) {
            const l = stats.get(pair.localCandidateId);
            const r = stats.get(pair.remoteCandidateId);
            if (l) { localType = l.candidateType; transport = l.protocol; }
            if (r) { remoteType = r.candidateType; }
            if (typeof pair.currentRoundTripTime === 'number') rttMs = Math.round(pair.currentRoundTripTime * 1000);
          }
        }
      });

      if (!localType && !remoteType) {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.selected) {
            const l = stats.get(report.localCandidateId);
            const r = stats.get(report.remoteCandidateId);
            if (l) { localType = l.candidateType; transport = l.protocol; }
            if (r) { remoteType = r.candidateType; }
            if (typeof report.currentRoundTripTime === 'number') rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
        });
      }

      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && !report.isRemote && typeof report.jitter === 'number') {
          const jm = Math.round(report.jitter * 1000);
          jitterMs = jitterMs == null ? jm : Math.max(jitterMs, jm);
        }
      });

      let path = 'UNKNOWN';
      if (localType === 'relay' || remoteType === 'relay') path = 'TURN';
      else if (localType || remoteType) path = 'P2P';

      const card = document.getElementById(tileId);
      if (card) {
        let badge = card.querySelector('.ice-badge');
        const label = `${path}${rttMs != null ? ` • ${rttMs}ms` : ''}${jitterMs != null ? ` • jitter ${jitterMs}ms` : ''}`;
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'ice-badge';
          Object.assign(badge.style, {
            position:'absolute', top:'6px', left:'6px', padding:'2px 6px', borderRadius:'4px',
            fontSize:'11px', color:'#fff', zIndex:'10',
            background: path === 'TURN' ? 'rgba(220,53,69,0.9)' : 'rgba(40,167,69,0.9)'
          });
          badge.title = `Local: ${localType || '-'}, Remote: ${remoteType || '-'}, Transport: ${transport || '-'}${rttMs != null ? `, RTT: ${rttMs}ms` : ''}${jitterMs != null ? `, Jitter: ${jitterMs}ms` : ''}`;
          badge.textContent = label;
          card.style.position = 'relative';
          card.appendChild(badge);
        } else {
          badge.textContent = label;
          badge.style.background = path === 'TURN' ? 'rgba(220,53,69,0.9)' : 'rgba(40,167,69,0.9)';
          badge.title = `Local: ${localType || '-'}, Remote: ${remoteType || '-'}, Transport: ${transport || '-'}${rttMs != null ? `, RTT: ${rttMs}ms` : ''}${jitterMs != null ? `, Jitter: ${jitterMs}ms` : ''}`;
        }
      }
    } catch {}
  }
  function monitorIcePath(conn, tileId) {
    const run = () => labelIcePath(conn, tileId);
    conn.addEventListener('iceconnectionstatechange', () => {
      if (conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed') {
        run(); setTimeout(run, 1000); setTimeout(run, 3000); setTimeout(run, 7000);
      }
    });
    let pollId = null;
    const startPoll = () => { if (!pollId) pollId = setInterval(run, 5000); };
    const stopPoll  = () => { if (pollId) { clearInterval(pollId); pollId = null; } };
    conn.addEventListener('connectionstatechange', () => {
      const s = conn.connectionState || conn.iceConnectionState;
      if (s === 'connected') startPoll();
      if (s === 'disconnected' || s === 'failed' || s === 'closed') stopPoll();
    });
  }

  // ------- RTC state -------
  const pc = {};                // peerId -> RTCPeerConnection
  const pendingIce = {};        // peerId -> queued candidates before setRemoteDescription
  let socketId = '';
  const rand32 = () => (crypto.getRandomValues(new Uint32Array(1))[0]);
  const randomNumber = `__${rand32()}__${rand32()}__`;
  const NAME_RETRY_DELAYS = [0, 250, 1000];
  const peerNames = {};
  let myStream = null;
  let screen = null;

  const grid = document.getElementById('videos');

  function shortKey(key = '') {
    const s = String(key || '').trim();
    return s.length > 12 ? `${s.slice(0, 4)}...${s.slice(-4)}` : s;
  }

  function formatDisplayName(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return 'Guest';
    if (value.startsWith('@')) return value;
    if (/^BC1[0-9A-Za-z]+$/.test(value)) return shortKey(value);
    return `@${value}`;
  }

  function getMyDisplayName() {
    if (username) return formatDisplayName(username);
    try {
      const sessionName = sessionStorage.getItem('username');
      if (sessionName) return formatDisplayName(sessionName);
    } catch {}
    try {
      const key = localStorage.getItem('deso_user_key');
      const cached = readCachedUsername(key);
      if (cached) return formatDisplayName(cached);
      if (key) return formatDisplayName(key);
    } catch {}
    return 'Guest';
  }

  function ensureNameBadge(tileId) {
    const card = document.getElementById(tileId);
    if (!card) return null;
    let badge = card.querySelector('.name-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'name-badge';
      card.appendChild(badge);
    }
    return badge;
  }

  function syncPeerNameBadge(tileId) {
    const badge = ensureNameBadge(tileId);
    if (!badge) return;
    const rawLabel = peerNames[tileId] || '';
    const isLocal = tileId === 'local-grid';
    const label = isLocal ? (rawLabel ? `You · ${rawLabel}` : 'You') : rawLabel;
    badge.textContent = label;
    badge.hidden = !label;
    badge.classList.toggle('local', isLocal);
  }

  function setPeerName(tileId, name) {
    if (!tileId) return;
    const label = formatDisplayName(name);
    if (!label) return;
    peerNames[tileId] = label;
    syncPeerNameBadge(tileId);
  }

  function removePeerName(tileId) {
    if (!tileId) return;
    delete peerNames[tileId];
    const card = document.getElementById(tileId);
    const badge = card?.querySelector?.('.name-badge');
    if (badge) badge.remove();
  }

  function announceMyName(delay = 0) {
    const run = () => {
      try {
        const me = socket.id || socketId;
        if (!me) return;
        const name = getMyDisplayName();
        setPeerName('local-grid', name);
        socket.emit('chat', { __sys: 'name', id: me, name });
      } catch {}
    };
    if (delay > 0) setTimeout(run, delay);
    else run();
  }


  // ===== Spotlight (screen-share full view) =====
  let __spotlightId = null;
  let __spotlightWanted = null;
  function enterSpotlight(cardOrId) {
    const cont = document.getElementById('videos');
    if (!cont) return;
    const el = (typeof cardOrId === 'string') ? document.getElementById(cardOrId) : cardOrId;
    if (!el) return;
    cont.querySelectorAll('.card, .card-sm').forEach(e => e.classList.remove('spotlight-target'));
    el.classList.add('spotlight-target');
    cont.classList.add('spotlight');
    __spotlightId = el.id || null;
  }
  function exitSpotlight() {
    const cont = document.getElementById('videos');
    if (!cont) return;
    cont.classList.remove('spotlight');
    const prev = cont.querySelector('.spotlight-target');
    if (prev) prev.classList.remove('spotlight-target');
    __spotlightId = null;
  }

  // ---- Fullscreen helpers ----
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }
  function requestFs(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
  }
  function exitFs() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
  }
  function toggleFullscreen(el) {
    try { if (isFullscreen()) exitFs(); else requestFs(el); } catch(e) { console.error('fullscreen toggle failed', e); }
  }



  // ===== SCALE =====
  const SCALE_PROFILES = [
    { maxPeers: 8,  label: '720p', constraints: { width: 1280, height: 720,  frameRate: 30 }, maxBitrateKbps: 1800 },
    { maxPeers: 14,  label: '540p', constraints: { width:  960, height: 540,  frameRate: 24 }, maxBitrateKbps: 1200 },
    { maxPeers: 99, label: '360p', constraints: { width:  640, height: 360,  frameRate: 20 }, maxBitrateKbps:  600, audioOnlyAbove: 15 },
  ];
  function chooseScaleProfile(peerCount){ for(const p of SCALE_PROFILES) if(peerCount<=p.maxPeers) return p; return SCALE_PROFILES[SCALE_PROFILES.length-1]; }
  function currentPeerCount(){ try { return Object.keys(pc||{}).length; } catch { return 0; } }

  async function applyVideoConstraints(stream,constraints){
    try{
      const vt=stream?.getVideoTracks?.()[0]; if(!vt) return;
      await vt.applyConstraints({width:constraints.width,height:constraints.height,frameRate:constraints.frameRate});
    }catch(e){ console.warn('[SCALE] applyConstraints fail',e); }
  }
  async function applySenderBitrate(maxKbps){
    try{
      const conns=Object.values(pc||{});
      const senders=conns.map(c=>c.getSenders()).flat();
      for(const s of senders){
        if(s.track&&s.track.kind==='video'){
          const params=s.getParameters()||{}; params.encodings=(params.encodings&&params.encodings.length)?params.encodings:[{}];
          params.encodings[0].maxBitrate=Math.max(150000,(maxKbps|0)*1000);
          await s.setParameters(params);
        }
      }
    }catch(e){ console.warn('[SCALE] setParameters fail',e); }
  }

  let __lastScaleLabel=null;
  let runtimeAudioOnlyAbove = 15;

  function setRuntimeAudioOnlyAbove(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    runtimeAudioOnlyAbove = Math.max(0, Math.floor(n));
    try { console.log('[SCALE] audioOnlyAbove policy =', runtimeAudioOnlyAbove); } catch {}
  }
  async function applyScalePolicy(){
    const peers=currentPeerCount();
    const prof=chooseScaleProfile(peers);

    try{
      const ps=window.__prejoinSettings||null;
      if(ps&&myStream){
        const vt=myStream.getVideoTracks?.()[0];
        const at=myStream.getAudioTracks?.()[0];
        if(ps.video===false&&vt) vt.enabled=false;
        if(ps.audio===false&&at) at.enabled=false;
        if(ps.video===false){
          await applySenderBitrate(128);
          if(__lastScaleLabel!=='audio-only') console.log('[SCALE] → audio-only (prejoin OFF)');
          __lastScaleLabel='audio-only'; return;
        }
      }
    }catch{}

    if(runtimeAudioOnlyAbove>0&&peers>=runtimeAudioOnlyAbove){
      try{
        if(myStream){ const vt=myStream.getVideoTracks?.()[0]; if(vt) vt.enabled=false; }
        await applySenderBitrate(128);
        if(__lastScaleLabel!=='audio-only') console.log('[SCALE] → audio-only (peers='+peers+', policy='+runtimeAudioOnlyAbove+')');
        __lastScaleLabel='audio-only'; return;
      }catch(e){ console.warn(e); }
    }

    try{
      if(myStream){
        const vt=myStream.getVideoTracks?.()[0];
        const ps=window.__prejoinSettings||{};
        if(vt&&vt.enabled===false&&ps.video!==false) vt.enabled=true;
        await applyVideoConstraints(myStream,prof.constraints);
      }
      await applySenderBitrate(prof.maxBitrateKbps);
      if(__lastScaleLabel!==prof.label) console.log('[SCALE] → '+prof.label+' (peers='+peers+')');
      __lastScaleLabel=prof.label;
    }catch(e){ console.warn(e); }
  }
  let __scaleTimer=null;
  function scheduleScaleApply(delay=400){ clearTimeout(__scaleTimer); __scaleTimer=setTimeout(()=>{ applyScalePolicy().catch(()=>{}); },delay); }

  // ------- Layout -------
  function applyGridLayout() {}
  if (grid) {
    const obs = new MutationObserver(() => applyGridLayout());
    obs.observe(grid, { childList: true });
  }
  window.addEventListener('resize', applyGridLayout);

  // ------- Media helpers -------
  async function ensureLocalMedia() {
    if (myStream) return myStream;
    const insecure = location.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(location.hostname);
    if (insecure) showMediaWarn(true);

    try {
      log('getting local media…');
      myStream = await h.getUserFullMedia();
      try {
        const ps = window.__prejoinSettings || null;
        if (ps && myStream) {
          const vt = (myStream.getVideoTracks && myStream.getVideoTracks()[0]) || null;
          const at = (myStream.getAudioTracks && myStream.getAudioTracks()[0]) || null;
          if (vt && typeof ps.video === 'boolean') vt.enabled = !!ps.video;
          if (at && typeof ps.audio === 'boolean') at.enabled = !!ps.audio;
        }
      } catch {}
      showMediaWarn(false);
      h.setLocalStream(myStream);
      ensureLocalTile(myStream);
      return myStream;
    } catch (e) {
      console.error('getUserFullMedia failed:', e);
      showMediaWarn(true);
      const lv = document.getElementById('local');
      if (lv) { lv.style.display = ''; lv.removeAttribute('hidden'); }
      return null;
    }
  }

  function ensureLocalTile(stream) {
    if (!stream) return;
    const floatingLocal = document.getElementById('local');

    let localGridVid = document.getElementById('local-grid-video');
    if (localGridVid) {
      localGridVid.srcObject = stream;
      localGridVid.onloadedmetadata = () => {
        localGridVid.play().catch(()=>{});
        if (floatingLocal) floatingLocal.style.display = 'none';
      };
      setPeerName('local-grid', getMyDisplayName());
      return;
    }

    localGridVid = document.createElement('video');
    localGridVid.id = 'local-grid-video';
    localGridVid.srcObject = stream;
    localGridVid.autoplay = true;
    localGridVid.muted = true;
    localGridVid.playsInline = true;
    localGridVid.setAttribute('playsinline', '');
    localGridVid.className = 'remote-video mirror-mode';
    localGridVid.onloadedmetadata = () => {
      localGridVid.play().catch(()=>{});
      if (floatingLocal) floatingLocal.style.display = 'none';
    };

    const controlDiv = document.createElement('div');
    controlDiv.className = 'remote-video-controls';
    controlDiv.innerHTML = `<i class="fa fa-microphone text-white pr-3" title="Mute (local)"></i>
                            <i class="fa fa-expand text-white" title="Expand"></i>`;

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card card-sm';
    cardDiv.id = 'local-grid';
    cardDiv.appendChild(localGridVid);
    cardDiv.appendChild(controlDiv);

    
    // Fullscreen handlers on local tile
    try {
      const exp = controlDiv.querySelector('.fa-expand');
      if (exp) exp.onclick = (ev) => { ev.stopPropagation(); toggleFullscreen(cardDiv); };
      localGridVid.ondblclick = () => toggleFullscreen(cardDiv);
    } catch {}
    if (grid.firstChild) grid.insertBefore(cardDiv, grid.firstChild);
    else grid.appendChild(cardDiv);
    setPeerName('local-grid', getMyDisplayName());
  }

  function localStopAll() {
    try { myStream && myStream.getTracks().forEach(t => { try{ t.stop(); }catch{} }); } catch {}
    try { screen && screen.getTracks().forEach(t => { try{ t.stop(); }catch{} }); } catch {}
  }

  function removeTile(peerId) {
    try { scheduleScaleApply(250); } catch {}
    removePeerName(peerId);
    try { const card = document.getElementById(peerId); if (card) card.remove(); } catch {}
  }
  function closePeer(peerId, reason='') {
    const conn = pc[peerId];
    if (!conn) { removeTile(peerId); return; }
    try {
      conn.onicecandidate = null;
      conn.ontrack = null;
      conn.onnegotiationneeded = null;
      try { conn.getReceivers?.().forEach(r => { try { r.track?.stop?.(); } catch {} }); } catch {}
      conn.close();
    } catch {}
    delete pc[peerId];
    removeTile(peerId);
    applyGridLayout();
    log('peer removed', peerId, reason);
  }

  // ===== Prejoin Overlay =====
  async function showPrejoinOverlay() {
    try {
      const access = await checkScheduledRoomAccess(room);
      if (access?.isScheduled && !access?.canJoinNow) {
        const joinOpen = access.joinOpensAtMs ? formatDatePair(access.joinOpensAtMs, access.meeting?.timezone || access.timezone || 'Europe/Zagreb') : 'unknown';
        const startAt = access.startsAtMs ? formatDatePair(access.startsAtMs, access.meeting?.timezone || access.timezone || 'Europe/Zagreb') : 'unknown';
        if (access.state === 'before_open') {
          await showMeetingGate(access);
          return;
        }
        if (access.state === 'closed') {
          await showMeetingGate(access);
          return;
        }
      }

      hideMeetingGate();
      const mainEl = document.querySelector('main.call-container.main');
      if (mainEl) mainEl.style.display = '';
      const overlay = document.getElementById('prejoin-overlay');
      const videoEl = document.getElementById('prejoin-preview');
      const joinBtn = document.getElementById('prejoin-join-btn');
      const btnCam  = document.getElementById('toggle-prejoin-video');
      const btnMic  = document.getElementById('toggle-prejoin-audio');

      if (!overlay || !videoEl || !joinBtn) { tryJoinOrCreate(); return; }
      overlay.hidden = false;

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoEl.srcObject = stream;
        try { videoEl.play && videoEl.play(); } catch {}
      } catch (e) { console.warn('[Prejoin] preview failed:', e); }

      let camOn = true, micOn = true;
      function updateButtons() {
        if (btnCam) btnCam.textContent = camOn ? '📷 Camera On' : '📷 Camera Off';
        if (btnMic) btnMic.textContent = micOn ? '🎤 Mic On'    : '🎤 Mic Off';
      }
      updateButtons();

      if (btnCam) btnCam.onclick = function() {
        camOn = !camOn;
        try { stream?.getVideoTracks?.().forEach(t => { t.enabled = camOn; }); } catch {}
        updateButtons();
      };
      if (btnMic) btnMic.onclick = function() {
        micOn = !micOn;
        try { stream?.getAudioTracks?.().forEach(t => { t.enabled = micOn; }); } catch {}
        updateButtons();
      };

      joinBtn.onclick = async function() {
        overlay.hidden = true;
        try { stream?.getTracks?.().forEach(t => { try { t.stop(); } catch {} }); } catch {}
        try { window.__prejoinSettings = { video: camOn, audio: micOn }; } catch {}
        try { await ensureLocalMedia(); } catch {}
        tryJoinOrCreate();
      };
    } catch (e) {
      console.warn('[Prejoin] error:', e);
      tryJoinOrCreate();
    }
  }

  // ------- Signaling wiring -------
 socket.on('connect', async () => {
  socketId = socket.io.engine.id;
  const rn = document.getElementById('randomNumber');
  const displayTitle = (roomTitle && roomTitle.trim()) || room;
  if (rn) rn.innerText = displayTitle;


    scheduleScaleApply(0);

    socket.on('new user', (data) => {
      log('new user', data.socketId);
      socket.emit('newUserStart', { to: data.socketId, sender: socketId });
      initPeerIfMissing(data.socketId, true);
      setTimeout(() => announceMyName(), 80);
      scheduleScaleApply(250);
    });

    socket.on('newUserStart', (data) => {
      log('newUserStart from', data.sender);
      initPeerIfMissing(data.sender, false);
      scheduleScaleApply(250);
    });

    socket.on('user-left', (data = {}) => {
      const id = data.socketId;
      if (!id) return;
      closePeer(id, 'server user-left');
      scheduleScaleApply(250);
    });

    socket.on('ice candidates', async (data) => {
      const sender = data.sender;
      const cand = data.candidate || null;
      if (!cand) return;
      if (!pc[sender]) {
        (pendingIce[sender] ||= []).push(cand);
        return;
      }
      try { await pc[sender].addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { console.error('addIceCandidate error', e); }
    });

    socket.on('sdp', async (data) => {
      const sender = data.sender;
      const desc = data.description;

      if (!pc[sender]) initPeerIfMissing(sender, false);

      if (desc.type === 'offer') {
        try {
          await pc[sender].setRemoteDescription(new RTCSessionDescription(desc));
          const s = await ensureLocalMedia();
          if (s) s.getTracks().forEach(track => { try { pc[sender].addTrack(track, s); } catch {} });
          const answer = await pc[sender].createAnswer();
          await pc[sender].setLocalDescription(answer);
          socket.emit('sdp', { description: pc[sender].localDescription, to: sender, sender: socketId });
          await flushQueuedIce(sender);
        } catch (e) { console.error('handle offer error', e); }
      } else if (desc.type === 'answer') {
        try {
          await pc[sender].setRemoteDescription(new RTCSessionDescription(desc));
          await flushQueuedIce(sender);
        } catch (e) { console.error('handle answer error', e); }
      }
    });

    socket.on('chat', (data = {}) => {
      try {
        if (data.__sys === 'spotlight') {
          if (data.on) {
            __spotlightWanted = data.id || null;
            const tryApply = () => {
              if (!__spotlightWanted) return;
              const el = document.getElementById(__spotlightWanted);
              if (el) { enterSpotlight(el); __spotlightWanted = null; }
            };
            tryApply();
            setTimeout(tryApply, 200);
            setTimeout(tryApply, 600);
            setTimeout(tryApply, 1200);
          } else {
            __spotlightWanted = null;
            exitSpotlight();
          }
          return;
        }
        if (data.__sys === 'name' && data.id) {
          setPeerName(data.id, data.name);
          return;
        }
      } catch {}
      h.addChat(data, 'remote');
    });

    showPrejoinOverlay();
  });

  function initPeerIfMissing(partnerId, createOffer) {
    if (pc[partnerId]) return;
    const conn = new RTCPeerConnection(h.getIceServer());
    pc[partnerId] = conn;

    monitorIcePath(conn, partnerId);

    const addTracks = (stream) => {
      stream.getTracks().forEach((track) => { try { conn.addTrack(track, stream); } catch(e){} });
    };
    (async () => {
      try {
        const s = await ensureLocalMedia();
        if (s) {
          if (screen && screen.getTracks().length) addTracks(screen);
          else addTracks(s);
        }
      } catch {}
    })();

    if (createOffer) {
      conn.onnegotiationneeded = async () => {
        try {
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          socket.emit('sdp', { description: conn.localDescription, to: partnerId, sender: socketId });
        } catch (e) { console.error('createOffer error', e); }
      };
    }

    conn.onicecandidate = ({ candidate }) => {
      socket.emit('ice candidates', { candidate: candidate || null, to: partnerId, sender: socketId });
    };

    conn.ontrack = (e) => {
      const str = e.streams[0];
      const vidId = `${partnerId}-video`;
      let v = document.getElementById(vidId);
      if (!v) {
        v = document.createElement('video');
        v.id = vidId;
        v.autoplay = true;
        v.playsInline = true;
        v.setAttribute('playsinline','');
        v.className = 'remote-video';
        v.onloadedmetadata = () => v.play().catch(()=>{});
        const controlDiv = document.createElement('div');
        controlDiv.className = 'remote-video-controls';
        controlDiv.innerHTML = `<i class="fa fa-microphone text-white pr-3 mute-remote-mic" title="Mute"></i>
                                <i class="fa fa-expand text-white" title="Expand"></i>`;
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card card-sm';
        cardDiv.id = partnerId;
        cardDiv.appendChild(v);
        cardDiv.appendChild(controlDiv);
        document.getElementById('videos').appendChild(cardDiv);
        syncPeerNameBadge(partnerId);
      
      
      try { if (__spotlightWanted === partnerId) { enterSpotlight(cardDiv); __spotlightWanted = null; } } catch {}
// Fullscreen handlers on remote tile
      try {
        const exp = controlDiv.querySelector('.fa-expand');
        if (exp) exp.onclick = (ev) => { ev.stopPropagation(); toggleFullscreen(cardDiv); };
        v.ondblclick = () => toggleFullscreen(cardDiv);
      } catch {}
    }
      v.srcObject = str;
    };

    conn.addEventListener('connectionstatechange', () => {
      const s = conn.connectionState || conn.iceConnectionState;
      if (s === 'disconnected' || s === 'failed') {
        const checkId = setTimeout(() => {
          const stillBad = !pc[partnerId] || ['disconnected','failed','closed'].includes(pc[partnerId].connectionState);
          if (stillBad) closePeer(partnerId, `conn ${s} timeout`);
          clearTimeout(checkId);
        }, 4000);
      }
    });
  }

  async function flushQueuedIce(peerId) {
    const list = pendingIce[peerId];
    if (!list || !pc[peerId]) return;
    try { for (const c of list) await pc[peerId].addIceCandidate(new RTCIceCandidate(c)); }
    catch (e) { console.error('flushQueuedIce error', e); }
    delete pendingIce[peerId];
  }

  // ------- Screen share -------
  function shareScreen() {
    h.shareScreen().then((stream) => {
      h.toggleShareIcons(true);
      screen = stream;
      broadcastNewTracks(stream, 'video', false);
      try { enterSpotlight('local-grid'); socket.emit('chat', { __sys:'spotlight', on:true, id: socketId }); } catch {}
      const [track] = stream.getVideoTracks();
      if (track) track.addEventListener('ended', () => { stopSharingScreen().catch(()=>{}); });
    }).catch((e) => {
      console.error(e);
      alert('Screen sharing failed. Please allow screen capture.');
    });
  }
  function stopSharingScreen() {
    return new Promise((res) => {
      if (screen && screen.getTracks().length) screen.getTracks().forEach(t => { try { t.stop(); } catch {} });
      res();
    }).then(() => {
      h.toggleShareIcons(false);
      if (myStream) broadcastNewTracks(myStream, 'video');
      try { socket.emit('chat', { __sys:'spotlight', on:false, id: socketId }); exitSpotlight(); } catch {}
      screen = null;
    }).catch((e) => console.error(e));
  }

  function broadcastNewTracks(stream, type, mirrorMode = true) {
    if (!stream) return;
    h.setLocalStream(stream, mirrorMode);
    const localGridVid = document.getElementById('local-grid-video');
    if (localGridVid) localGridVid.srcObject = stream;
    const track = type === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!track) return;
    for (let id in pc) {
      const conn = pc[id];
      if (conn && typeof conn === 'object') h.replaceTrack(track, conn);
    }
  }

  // ------- Chat send (ONLY FIXED PART) -------
  function sendMsg(msg) {
    const data = { room, msg, sender: `${username} (${randomNumber})` };
    socket.emit('chat', data);
    h.addChat(data, 'local');
  }

  function handleChatSend(e){
    if (e) e.preventDefault();
    // primarno: ID po kojem si nas učio
    let input = document.getElementById('chat-input');
    // fallback: prvi input u .chat-input-row (ako se markup razlikuje)
    if (!input) input = document.querySelector('.chat-input-row input, .chat-input-row textarea');
    if (!input) return;
    const val = (input.value || '').trim();
    if (!val) return;
    sendMsg(val);
    input.value = '';
    input.focus();
  }

  // Klik točno na #chat-input-btn
  document.getElementById('chat-input-btn')?.addEventListener('click', handleChatSend);
  // Fallback: ako gumb nema ID (ili ima ikonu koja hvata klik)
  const chatRowBtn = document.querySelector('.chat-input-row button');
  if (chatRowBtn) {
    // osiguraj da nije submit
    try { if (!chatRowBtn.type) chatRowBtn.type = 'button'; } catch {}
    chatRowBtn.addEventListener('click', handleChatSend);
  }
  // Delegacija (bilo što s data-send="chat")
  document.addEventListener('click', (e) => {
    const t = e.target?.closest?.('[data-send="chat"]');
    if (t) handleChatSend(e);
  });
  // Enter u polju
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleChatSend(e);
  });

  // ------- Chat open/close -------
  const chatToggleBtn = document.getElementById('toggle-chat-pane');
  const chatPane = document.getElementById('chat-pane') || document.querySelector('.chat-col');
  const chatCloseBtn = document.getElementById('close-chat-pane');
  let chatBackdrop = document.getElementById('chat-backdrop');

  if (!chatBackdrop) {
    chatBackdrop = document.createElement('div');
    chatBackdrop.id = 'chat-backdrop';
    chatBackdrop.setAttribute('hidden', true);
    document.body.appendChild(chatBackdrop);
  }

  function openChat() {
    if (!chatPane) return;
    chatPane.removeAttribute('hidden');
    chatPane.classList.add('chat-opened');
    chatBackdrop?.removeAttribute('hidden');
    chatPane.addEventListener('mousedown', (e)=>e.stopPropagation());
    chatPane.addEventListener('click', (e)=>e.stopPropagation());
  }
  function closeChat() {
    if (!chatPane) return;
    chatPane.classList.remove('chat-opened');
    if (chatPane.id === 'chat-pane') chatPane.setAttribute('hidden', true);
    chatBackdrop?.setAttribute('hidden', true);
  }

  chatToggleBtn?.addEventListener('click', () => {
    const isHidden = chatPane.hasAttribute('hidden') || !chatPane.classList.contains('chat-opened');
    if (isHidden) openChat(); else closeChat();
  });
  chatCloseBtn?.addEventListener('click', closeChat);
  chatBackdrop?.addEventListener('click', closeChat);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });

  // ------- Header buttons (camera / mic / screen) -------
  const shareBtn = document.getElementById('share-screen');
  shareBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const isSharing = !!(screen && screen.getTracks && screen.getTracks().some(t => t.readyState === 'live'));
    if (isSharing) await stopSharingScreen(); else shareScreen();
  });

  const toggleVideoBtn = document.getElementById('toggle-video');
  toggleVideoBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const s = await ensureLocalMedia();
    if (s && s.getVideoTracks()[0]) {
      const track = s.getVideoTracks()[0];
      track.enabled = !track.enabled;
      const icon = toggleVideoBtn.querySelector('i') || toggleVideoBtn;
      if (track.enabled) { icon.classList.remove('fa-video-slash'); icon.classList.add('fa-video'); toggleVideoBtn.title = 'Hide Video'; }
      else { icon.classList.remove('fa-video'); icon.classList.add('fa-video-slash'); toggleVideoBtn.title = 'Show Video'; }
      broadcastNewTracks(s, 'video');
    }
  });

  const toggleMuteBtn = document.getElementById('toggle-mute');
  toggleMuteBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const s = await ensureLocalMedia();
    if (s && s.getAudioTracks()[0]) {
      const track = s.getAudioTracks()[0];
      track.enabled = !track.enabled;
      const icon = toggleMuteBtn.querySelector('i') || toggleMuteBtn;
      if (track.enabled) { icon.classList.remove('fa-microphone-alt-slash'); icon.classList.add('fa-microphone-alt'); toggleMuteBtn.title = 'Mute'; }
      else { icon.classList.remove('fa-microphone-alt'); icon.classList.add('fa-microphone-alt-slash'); toggleMuteBtn.title = 'Unmute'; }
      broadcastNewTracks(s, 'audio');
    }
  });

  // ------- join/create -------
  async function roomExists(roomId, pubKey) {
    try {
      const res = await fetch('/api/rooms', { headers: { 'x-deso-pubkey': pubKey }});
      if (!res.ok) return false;
      const data = await res.json();
      setRuntimeAudioOnlyAbove(data.audioOnlyAbove);
      return Array.isArray(data.rooms) && data.rooms.some(r => r.id === roomId);
    } catch { return false; }
  }
  async function tryJoinOrCreate() {
    const exists = await roomExists(room, desoKey);
    if (exists) socket.emit('subscribe', { room, socketId });
    else {
      const finalTitle = (roomTitle && roomTitle.trim()) || room;
      socket.emit('subscribe', { room, socketId, title: finalTitle, createdByName: (username || null) });
    }
  }

  // ------- cleanup -------
  window.addEventListener('deso:logout', () => {
    clearMeetingGateTimers();
    try { localStopAll(); } catch {}
    try { Object.keys(pc).forEach(id => closePeer(id, 'logout')); } catch {}
    try { socket?.close(); } catch {}
    window.__rtcCleaned = true;
  });
  window.addEventListener('beforeunload', () => {
    clearMeetingGateTimers();
    try { Object.keys(pc).forEach(id => closePeer(id, 'beforeunload')); } catch {}
    try { localStopAll(); } catch {}
  });
});
