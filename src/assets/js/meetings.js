(function () {
  const meetingsEl = document.getElementById('meetings');
  const emptyEl = document.getElementById('meetingsEmptyMsg');
  const scheduleBtn = document.getElementById('scheduleMeetingBtn');
  const modal = document.getElementById('meetingModal');
  const modalTitle = document.getElementById('meetingModalTitle');
  const closeBtn = document.getElementById('meetingModalClose');
  const cancelBtn = document.getElementById('meetingCancelBtn');
  const saveBtn = document.getElementById('meetingSaveBtn');
  const savePublishBtn = document.getElementById('meetingSavePublishBtn');
  const form = document.getElementById('meetingForm');
  const searchEl = document.getElementById('search');

  const els = {
    id: document.getElementById('meetingId'),
    title: document.getElementById('meetingTitle'),
    description: document.getElementById('meetingDescription'),
    roomId: document.getElementById('meetingRoomId'),
    date: document.getElementById('meetingDate'),
    time: document.getElementById('meetingTime'),
    duration: document.getElementById('meetingDuration'),
    mentions: document.getElementById('meetingMentions'),
  };

  let state = {
    meetings: [],
    currentPubKey: '',
    isMaster: false,
    canSchedule: false,
    timezone: 'Europe/Zagreb',
  };
  let meetingsPollId = null;
  let meetingsSocket = null;

  function getPubKey() {
    try { return localStorage.getItem('deso_user_key') || ''; } catch { return ''; }
  }

  function getUsername() {
    try { return sessionStorage.getItem('username') || ''; } catch { return ''; }
  }

  function headers() {
    return {
      'Content-Type': 'application/json',
      'x-deso-pubkey': getPubKey(),
      'x-deso-username': getUsername(),
    };
  }

  function esc(str = '') {
    return String(str).replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]));
  }

  function formatDateInZone(iso, timeZone, locale = 'hr-HR') {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone,
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));
    } catch {
      return String(iso || '');
    }
  }

  function formatDatePair(iso) {
    const zagreb = formatDateInZone(iso, state.timezone || 'Europe/Zagreb', 'hr-HR');
    const utc = formatDateInZone(iso, 'UTC', 'en-GB');
    return `${zagreb} Europe/Zagreb / ${utc} UTC`;
  }

  function toLocalParts(iso) {
    const d = new Date(iso);
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return {
      date: z.toISOString().slice(0, 10),
      time: z.toISOString().slice(11, 16),
    };
  }

  function statusLabel(m) {
    if (m.status === 'live') return '<span class="pill pill-live">🟢 Live now</span>';
    if (m.status === 'ended') return '<span class="pill">Ended</span>';
    if (typeof m.startsInMs === 'number' && m.startsInMs <= 15 * 60 * 1000 && m.startsInMs >= 0) {
      return '<span class="pill">Starting soon</span>';
    }
    return '<span class="pill">Scheduled</span>';
  }

  function canManage(m) {
    return !!state.currentPubKey && (state.isMaster || state.currentPubKey === String(m.createdBy || ''));
  }

  function reminderInfoLine(m) {
    if (m.reminderPostedAt) {
      return `Reminder posted: ${formatDatePair(m.reminderPostedAt)}${m.reminderPostHashHex ? ` · Hash: ${String(m.reminderPostHashHex).slice(0, 12)}…` : ''}`;
    }
    if (!m.invitePostedAt) {
      return 'Reminder becomes available after the invite is posted.';
    }
    if (m.canPostReminderNow) {
      return 'Reminder ready: you can post it now.';
    }
    if (m.reminderOpensAtMs) {
      return `Reminder available: ${formatDatePair(m.reminderOpensAtMs)}`;
    }
    return '';
  }

  async function fetchMeetings() {
    const res = await fetch('/api/meetings', { headers: getPubKey() ? { 'x-deso-pubkey': getPubKey() } : {} });
    const payload = await res.json();
    state = {
      ...state,
      meetings: Array.isArray(payload.meetings) ? payload.meetings : [],
      currentPubKey: payload.currentPubKey || '',
      isMaster: !!payload.isMaster,
      canSchedule: !!payload.canSchedule,
      timezone: payload.timezone || 'Europe/Zagreb',
    };
    if (scheduleBtn) scheduleBtn.classList.toggle('d-none', !state.canSchedule);
    render();
  }

  function render() {
    if (!meetingsEl) return;
    const q = String(searchEl?.value || '').trim().toLowerCase();
    const source = state.meetings.filter(m => !m.hideFromUpcoming);
    const filtered = !q ? source.slice() : source.filter(m => {
      const hay = [m.title, m.roomId, m.description, ...(m.participantMentions || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });

    meetingsEl.innerHTML = '';
    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    filtered.forEach(m => {
      const card = document.createElement('div');
      card.className = 'room-card';
      const mentions = (m.participantMentions || []).map(v => `@${esc(v)}`).join(' ');
      const canJoin = !!m.canJoinNow;
      const manage = canManage(m);
      const reminderLine = reminderInfoLine(m);
      card.innerHTML = `
        <div class="room-title">${esc(m.title || m.roomId)}</div>
        <div class="muted" style="margin-top:4px;">${statusLabel(m)} · Room: ${esc(m.roomId)}</div>
        <div class="muted">When: ${esc(formatDatePair(m.scheduledFor))} · ${esc(String(m.durationMin || 60))} min</div>
        ${m.joinOpensAtMs && !m.canJoinNow ? `<div class="muted">Join opens: ${esc(formatDatePair(m.joinOpensAtMs))}</div>` : ''}
        ${m.description ? `<div class="muted" style="margin-top:6px;">${esc(m.description)}</div>` : ''}
        ${mentions ? `<div class="muted" style="margin-top:6px;">Participants: ${mentions}</div>` : ''}
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-soft" data-copy="${esc(m.id)}">Copy invite text</button>
          ${manage && !m.invitePostedAt ? `<button class="btn-soft" data-publish="${esc(m.id)}">Publish invite</button>` : ''}
          ${manage && m.canPostReminderNow && !m.reminderPostedAt ? `<button class="btn-soft" data-reminder="${esc(m.id)}">Post reminder</button>` : ''}
          ${canJoin ? `<button class="btn-soft" data-join="${esc(m.id)}">Join meeting</button>` : ''}
          ${manage ? `<button class="btn-soft" data-edit="${esc(m.id)}">Edit</button>` : ''}
          ${manage ? `<button class="btn-soft" data-delete="${esc(m.id)}">Delete</button>` : ''}
        </div>
        ${m.invitePostedAt ? `<div class="muted" style="margin-top:8px;">Invite posted: ${esc(formatDatePair(m.invitePostedAt))}${m.invitePostHashHex ? ` · Hash: ${esc(String(m.invitePostHashHex).slice(0, 12))}…` : ''}</div>` : ''}
        ${reminderLine ? `<div class="muted" style="margin-top:6px;">${esc(reminderLine)}</div>` : ''}
      `;
      meetingsEl.appendChild(card);
    });

    meetingsEl.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', (e) => {
      const m = state.meetings.find(x => x.id === e.currentTarget.getAttribute('data-join'));
      if (!m) return;
      const url = new URL('/call', window.location.origin);
      url.searchParams.set('room', m.roomId);
      url.searchParams.set('title', m.title || m.roomId);
      url.searchParams.set('meeting', m.id);
      window.location.href = url.toString();
    }));

    meetingsEl.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async (e) => {
      const m = state.meetings.find(x => x.id === e.currentTarget.getAttribute('data-copy'));
      if (!m) return;
      try {
        await window.MyTalkZoneDeSoPost.copyInviteText(m);
        alert('Invite text copied.');
      } catch (err) {
        alert('Copy failed.');
      }
    }));

    meetingsEl.querySelectorAll('[data-publish]').forEach(btn => btn.addEventListener('click', async (e) => {
      const m = state.meetings.find(x => x.id === e.currentTarget.getAttribute('data-publish'));
      if (!m) return;
      try {
        const result = await window.MyTalkZoneDeSoPost.publishInvite(m);
        if (result.ok && canManage(m)) {
          await fetch(`/api/meetings/${encodeURIComponent(m.id)}/invite-posted`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ invitePostHashHex: result.postHashHex || '' }),
          });
          await fetchMeetings();
        } else if (result.ok) {
          await fetchMeetings();
        }
        alert(result.reason || (result.ok ? 'Invite published.' : 'Invite prepared.'));
      } catch (err) {
        alert('Invite publishing failed.');
      }
    }));

    meetingsEl.querySelectorAll('[data-reminder]').forEach(btn => btn.addEventListener('click', async (e) => {
      const m = state.meetings.find(x => x.id === e.currentTarget.getAttribute('data-reminder'));
      if (!m) return;
      try {
        const result = await window.MyTalkZoneDeSoPost.publishReminder(m);
        if (result.ok && canManage(m)) {
          const res = await fetch(`/api/meetings/${encodeURIComponent(m.id)}/reminder-posted`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ reminderPostHashHex: result.postHashHex || '' }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(json.error || 'Reminder could not be marked as posted.');
            await fetchMeetings();
            return;
          }
          await fetchMeetings();
        } else if (result.ok) {
          await fetchMeetings();
        }
        alert(result.reason || (result.ok ? 'Reminder published.' : 'Reminder prepared.'));
      } catch (err) {
        alert('Reminder publishing failed.');
      }
    }));

    meetingsEl.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', (e) => {
      const m = state.meetings.find(x => x.id === e.currentTarget.getAttribute('data-edit'));
      if (m) openModal(m);
    }));

    meetingsEl.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-delete');
      const m = state.meetings.find(x => x.id === id);
      if (!m) return;
      if (!confirm(`Delete meeting "${m.title}"?`)) return;
      const res = await fetch(`/api/meetings/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-deso-pubkey': getPubKey() } });
      if (!res.ok) {
        alert('Delete failed.');
        return;
      }
      await fetchMeetings();
    }));
  }

  function openModal(meeting) {
    if (!modal) return;
    modal.hidden = false;
    modalTitle.textContent = meeting ? 'Edit meeting' : 'Schedule meeting';
    els.id.value = meeting?.id || '';
    els.title.value = meeting?.title || '';
    els.description.value = meeting?.description || '';
    els.roomId.value = meeting?.roomId || '';
    const parts = meeting?.scheduledFor ? toLocalParts(meeting.scheduledFor) : toLocalParts(new Date(Date.now() + 3600000).toISOString());
    els.date.value = parts.date;
    els.time.value = parts.time;
    els.duration.value = String(meeting?.durationMin || 60);
    els.mentions.value = (meeting?.participantMentions || []).map(v => `@${v}`).join(', ');
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    if (form && typeof form.reset === 'function') {
      form.reset();
    } else {
      Object.values(els).forEach((el) => { if (el && 'value' in el) el.value = ''; });
    }
    if (els.duration) els.duration.value = '60';
    if (els.id) els.id.value = '';
  }

  function buildPayload() {
    const date = els.date.value;
    const time = els.time.value;
    if (!date || !time) throw new Error('Please fill date and time.');
    return {
      title: els.title.value.trim(),
      description: els.description.value.trim(),
      roomId: els.roomId.value.trim() || els.title.value.trim(),
      scheduledFor: new Date(`${date}T${time}:00`).toISOString(),
      durationMin: Number(els.duration.value || 60),
      participantMentions: els.mentions.value,
      timezone: state.timezone || 'Europe/Zagreb',
    };
  }

  async function saveMeeting({ publishAfter = false } = {}) {
    const id = els.id.value.trim();
    const payload = buildPayload();
    const url = id ? `/api/meetings/${encodeURIComponent(id)}` : '/api/meetings';
    const method = id ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Save failed.');
      return;
    }
    closeModal();
    await fetchMeetings();
    const meeting = json.meeting;
    if (publishAfter && meeting) {
      try {
        const result = await window.MyTalkZoneDeSoPost.publishInvite(meeting);
        if (result.ok) {
          await fetch(`/api/meetings/${encodeURIComponent(meeting.id)}/invite-posted`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ invitePostHashHex: result.postHashHex || '' }),
          });
          await fetchMeetings();
        }
        alert(result.reason || (result.ok ? 'Invite published.' : 'Meeting saved.')); 
      } catch {
        alert('Meeting saved, but invite action failed.');
      }
    }
  }

  function wireSocket() {
    try {
      meetingsSocket?.close?.();
    } catch {}
    try {
      meetingsSocket = io('/stream', {
        transports: ['websocket'],
        auth: { publicKey: getPubKey() || undefined }
      });
      meetingsSocket.on('rooms:update', () => {
        fetchMeetings().catch(() => {});
      });
    } catch {}
  }

  function wire() {
    scheduleBtn?.addEventListener('click', () => openModal(null));
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    saveBtn?.addEventListener('click', () => saveMeeting({ publishAfter: false }).catch(err => alert(err.message || 'Save failed.')));
    savePublishBtn?.addEventListener('click', () => saveMeeting({ publishAfter: true }).catch(err => alert(err.message || 'Save failed.')));
    searchEl?.addEventListener('input', render);
    window.addEventListener('deso:login-success', fetchMeetings);
    window.addEventListener('deso:logout', fetchMeetings);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  window.addEventListener('load', async () => {
    wire();
    wireSocket();
    if (window.MyTalkZoneDeSoPost?.preload) {
      window.MyTalkZoneDeSoPost.preload().catch(() => {});
    }
    await fetchMeetings();
    meetingsPollId = window.setInterval(() => {
      fetchMeetings().catch(() => {});
    }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) fetchMeetings().catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      if (meetingsPollId) window.clearInterval(meetingsPollId);
      try { meetingsSocket?.close?.(); } catch {}
    });
  });
})();
