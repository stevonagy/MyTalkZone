// src/app.js
let express = require('express');
let app = express();
let server = require('http').Server(app);
let io = require('socket.io')(server);
let stream = require('./ws/stream');
let path = require('path');
let favicon = require('serve-favicon');
let { readPolicy, writePolicy } = require('./ws/loadPolicy');
const { list: listRooms, TTL_MS } = require('./ws/roomsStore');
const meetingsStore = require('./ws/meetingsStore');

// Helper: check if a pubkey is allowed to create rooms per policy
function canCreateWithPolicy(pub) {
  try {
    const p = readPolicy();
    const allowed = new Set([String(p.MASTER_PUBLIC_KEY || ''), ...(p.ALLOWED_CREATORS || []).map(String)]);
    return allowed.has(String(pub || ''));
  } catch (e) {
    return false;
  }
}

function isMaster(pub) {
  try {
    const p = readPolicy();
    return !!String(pub || '').trim() && String(pub || '').trim() === String(p.MASTER_PUBLIC_KEY || '');
  } catch (e) {
    return false;
  }
}

function escapeInput(v) {
  return String(v || '').trim();
}

function parseMentions(input) {
  return meetingsStore.normalizeMentions(input);
}

function validateMeetingPayload(body = {}, { isPatch = false } = {}) {
  const title = escapeInput(body.title);
  const description = escapeInput(body.description);
  const roomId = meetingsStore.slugifyRoomId(body.roomId || body.title || '');
  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  const durationMin = Number(body.durationMin);
  const participantMentions = parseMentions(body.participantMentions || []);
  const isPrivate = !!body.isPrivate;
  const password = isPrivate ? String(body.password || '') : '';

  if (!isPatch || body.title !== undefined) {
    if (!title) return { error: 'title_required' };
  }
  if (!isPatch || body.roomId !== undefined || body.title !== undefined) {
    if (!roomId) return { error: 'room_required' };
  }
  if (!isPatch || body.scheduledFor !== undefined) {
    if (!scheduledFor || !Number.isFinite(scheduledFor.getTime())) return { error: 'scheduledFor_invalid' };
  }
  if (!isPatch || body.durationMin !== undefined) {
    if (!Number.isFinite(durationMin) || durationMin <= 0) return { error: 'duration_invalid' };
  }

  const payload = {};
  if (!isPatch || body.title !== undefined) payload.title = title;
  if (!isPatch || body.description !== undefined) payload.description = description;
  if (!isPatch || body.roomId !== undefined || body.title !== undefined) payload.roomId = roomId;
  if (!isPatch || body.scheduledFor !== undefined) payload.scheduledFor = scheduledFor.toISOString();
  if (!isPatch || body.durationMin !== undefined) payload.durationMin = Math.max(1, Math.round(durationMin));
  if (!isPatch || body.timezone !== undefined) payload.timezone = escapeInput(body.timezone) || 'Europe/Zagreb';
  if (!isPatch || body.participantMentions !== undefined) payload.participantMentions = participantMentions;
  if (!isPatch || body.isPrivate !== undefined) payload.isPrivate = isPrivate;
  if (!isPatch || body.password !== undefined || body.isPrivate !== undefined) payload.password = password;

  return { payload };
}

function canManageMeeting(pub, meeting) {
  const pk = String(pub || '').trim();
  if (!pk || !meeting) return false;
  return isMaster(pk) || String(meeting.createdBy || '') === pk;
}

app.use(favicon(path.join(__dirname, 'favicon.ico')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.json());

// --- Pages ---
// New Home → Hub
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'hub.html'));
});

// Calls UI (old index)
app.get('/call', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Policy API ---
app.get('/api/policy', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const current = readPolicy();
    const isMasterUser = pub && pub === current.MASTER_PUBLIC_KEY;
    if (!isMasterUser) return res.status(403).json({ error: 'forbidden' });
    res.json(current);
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/policy', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const current = readPolicy();
    if (pub !== current.MASTER_PUBLIC_KEY) return res.status(403).json({ error: 'forbidden' });

    const { allowedCreators, audioOnlyAbove } = req.body || {};
    if (!Array.isArray(allowedCreators)) return res.status(400).json({ error: 'invalid_payload' });

    const next = {
      MASTER_PUBLIC_KEY: current.MASTER_PUBLIC_KEY,
      ALLOWED_CREATORS: Array.from(new Set([current.MASTER_PUBLIC_KEY, ...allowedCreators.map(String)])),
      AUDIO_ONLY_ABOVE: Number.isFinite(audioOnlyAbove) ? Math.max(0, audioOnlyAbove|0) : current.AUDIO_ONLY_ABOVE
    };

    const prev = readPolicy();
    const prevAllowed = new Set(prev.ALLOWED_CREATORS || []);
    const added = next.ALLOWED_CREATORS.filter(x => !prevAllowed.has(x));
    const removed = [...prevAllowed].filter(x => !new Set(next.ALLOWED_CREATORS).has(x));

    writePolicy(next);

    const ts = new Date().toISOString();
    console.log(`[${ts}] POLICY UPDATE by ${pub}`);
    if (added.length)   console.log(`  + added:   ${added.join(', ')}`);
    if (removed.length) console.log(`  - removed: ${removed.join(', ')}`);
    console.log(`  audioOnlyAbove: ${next.AUDIO_ONLY_ABOVE}`);

    res.json(next);
  } catch (e) {
    console.error('Policy write error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// Rooms list + canCreate flag for Hub
app.get('/api/rooms', async (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const rooms = await listRooms();
    const visibleRooms = (Array.isArray(rooms) ? rooms : []).filter((room) => {
      const access = meetingsStore.getJoinAccess(room?.id || '');
      return !access.isScheduled || access.canJoinNow;
    });
    const policy = readPolicy();
    const payload = {
      rooms: visibleRooms,
      ttlMs: TTL_MS,
      now: Date.now(),
      canCreate: canCreateWithPolicy(pub),
      audioOnlyAbove: Number.isFinite(Number(policy.AUDIO_ONLY_ABOVE)) ? Math.max(0, Number(policy.AUDIO_ONLY_ABOVE) | 0) : 8,
    };
    res.json(payload);
  } catch (e) {
    console.error('rooms api error', e);
    res.status(500).json({ rooms: [], ttlMs: 0, now: Date.now(), canCreate: false, audioOnlyAbove: 8 });
  }
});

// Lightweight boolean for UI checks
app.get('/api/can-create', (req, res) => {
  const pub = String(req.header('x-deso-pubkey') || '').trim();
  res.json({ canCreate: canCreateWithPolicy(pub) });
});

// --- Meetings API ---
app.get('/api/meetings/access/:roomId', (req, res) => {
  try {
    const roomId = escapeInput(req.params.roomId);
    const access = meetingsStore.getJoinAccess(roomId);
    res.json({
      roomId,
      ...access,
      timezone: 'Europe/Zagreb',
      now: Date.now(),
    });
  } catch (e) {
    console.error('meeting access api error', e);
    res.status(500).json({
      roomId: escapeInput(req.params.roomId),
      isScheduled: false,
      canJoinNow: false,
      state: 'error',
      meeting: null,
      timezone: 'Europe/Zagreb',
      now: Date.now(),
    });
  }
});

app.get('/api/meetings', async (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const rooms = await listRooms();
    const liveRoomIds = new Set((Array.isArray(rooms) ? rooms : []).map((room) => String(room?.id || '')).filter(Boolean));
    const meetings = meetingsStore.list().map((meeting) => {
      const roomId = String(meeting?.roomId || '');
      const isLiveRoomActive = !!roomId && liveRoomIds.has(roomId);
      return {
        ...meeting,
        isLiveRoomActive,
        hideFromUpcoming: isLiveRoomActive || meeting.status === 'ended',
      };
    });
    res.json({
      meetings,
      now: Date.now(),
      canSchedule: canCreateWithPolicy(pub),
      isLoggedIn: !!pub,
      currentPubKey: pub || '',
      isMaster: isMaster(pub),
      timezone: 'Europe/Zagreb',
    });
  } catch (e) {
    console.error('meetings api error', e);
    res.status(500).json({ meetings: [], now: Date.now(), canSchedule: false, timezone: 'Europe/Zagreb' });
  }
});

app.post('/api/meetings', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const createdByName = escapeInput(req.header('x-deso-username') || '');
    if (!canCreateWithPolicy(pub)) return res.status(403).json({ error: 'forbidden' });

    const checked = validateMeetingPayload(req.body || {}, { isPatch: false });
    if (checked.error) return res.status(400).json({ error: checked.error });

    const payload = checked.payload;
    const conflict = meetingsStore.list().find(m => m.roomId === payload.roomId && m.status !== 'ended');
    if (conflict) return res.status(409).json({ error: 'room_conflict' });

    const meeting = meetingsStore.create({
      ...payload,
      createdBy: pub,
      createdByName,
    });
    io.of('/stream').emit('rooms:update');
    res.status(201).json({ meeting });
  } catch (e) {
    console.error('meeting create error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.patch('/api/meetings/:id', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const existing = meetingsStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!canManageMeeting(pub, existing)) return res.status(403).json({ error: 'forbidden' });

    const checked = validateMeetingPayload(req.body || {}, { isPatch: true });
    if (checked.error) return res.status(400).json({ error: checked.error });

    const payload = checked.payload;
    if (payload.roomId) {
      const conflict = meetingsStore.list().find(m => m.id !== existing.id && m.roomId === payload.roomId && m.status !== 'ended');
      if (conflict) return res.status(409).json({ error: 'room_conflict' });
    }

    const meeting = meetingsStore.update(req.params.id, payload);
    io.of('/stream').emit('rooms:update');
    res.json({ meeting });
  } catch (e) {
    console.error('meeting patch error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/meetings/:id', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const existing = meetingsStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!canManageMeeting(pub, existing)) return res.status(403).json({ error: 'forbidden' });
    const ok = meetingsStore.remove(req.params.id);
    io.of('/stream').emit('rooms:update');
    res.json({ ok });
  } catch (e) {
    console.error('meeting delete error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/meetings/:id/invite-posted', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const existing = meetingsStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!canManageMeeting(pub, existing)) return res.status(403).json({ error: 'forbidden' });
    const invitePostHashHex = escapeInput(req.body?.invitePostHashHex || '');
    const meeting = meetingsStore.markInvitePosted(req.params.id, invitePostHashHex);
    res.json({ meeting });
  } catch (e) {
    console.error('meeting invite-posted error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/meetings/:id/reminder-posted', (req, res) => {
  try {
    const pub = String(req.header('x-deso-pubkey') || '').trim();
    const existing = meetingsStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (!canManageMeeting(pub, existing)) return res.status(403).json({ error: 'forbidden' });
    if (!existing.invitePostedAt) return res.status(409).json({ error: 'invite_not_posted' });
    if (existing.reminderPostedAt) return res.status(409).json({ error: 'reminder_already_posted' });
    if (!existing.canPostReminderNow) return res.status(409).json({ error: 'reminder_not_ready' });
    const reminderPostHashHex = escapeInput(req.body?.reminderPostHashHex || '');
    const meeting = meetingsStore.markReminderPosted(req.params.id, reminderPostHashHex);
    res.json({ meeting });
  } catch (e) {
    console.error('meeting reminder-posted error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// Require DeSo public key in Socket.IO auth payload (namespace /stream)
stream(io);

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
