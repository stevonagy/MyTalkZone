const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'meetings.json');
const JOIN_EARLY_MS = 15 * 60 * 1000;
const JOIN_LATE_MS = 60 * 60 * 1000;
const REMINDER_READY_MS = 10 * 60 * 1000;

function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '[]\n', 'utf8');
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readRaw() {
  ensureFile();
  try {
    const txt = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(txt || '[]');
    return safeArray(parsed);
  } catch (e) {
    console.error('meetingsStore read error:', e);
    return [];
  }
}

function writeRaw(items) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(safeArray(items), null, 2) + '\n', 'utf8');
}

function normalizeMention(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_.-]/g, '');
}

function normalizeMentions(input) {
  const arr = Array.isArray(input)
    ? input
    : String(input || '').split(',');
  return Array.from(new Set(arr.map(normalizeMention).filter(Boolean)));
}

function slugifyRoomId(value) {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `room-${Date.now()}`;
}

function genId() {
  return `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function deriveStatus(meeting, now = Date.now()) {
  const start = toMs(meeting?.scheduledFor);
  const durationMin = Math.max(1, Number(meeting?.durationMin) || 60);
  if (!Number.isFinite(start)) return 'scheduled';
  const end = start + durationMin * 60 * 1000;
  if (now < start) return 'scheduled';
  if (now >= start && now <= end) return 'live';
  return 'ended';
}

function withComputed(meeting, now = Date.now()) {
  const start = toMs(meeting?.scheduledFor);
  const durationMin = Math.max(1, Number(meeting?.durationMin) || 60);
  const end = Number.isFinite(start) ? start + durationMin * 60 * 1000 : null;
  const joinOpensAtMs = Number.isFinite(start) ? start - JOIN_EARLY_MS : null;
  const joinClosesAtMs = Number.isFinite(end) ? end + JOIN_LATE_MS : null;
  const reminderOpensAtMs = Number.isFinite(start) ? start - REMINDER_READY_MS : null;
  const canJoinNow = Number.isFinite(joinOpensAtMs) && Number.isFinite(joinClosesAtMs)
    ? now >= joinOpensAtMs && now <= joinClosesAtMs
    : false;
  const canPostReminderNow = Number.isFinite(reminderOpensAtMs) && Number.isFinite(end)
    ? !!meeting?.invitePostedAt && now >= reminderOpensAtMs && now <= end && !meeting?.reminderPostedAt
    : false;
  return {
    ...meeting,
    durationMin,
    participantMentions: normalizeMentions(meeting?.participantMentions || []),
    roomId: slugifyRoomId(meeting?.roomId || meeting?.id || ''),
    status: deriveStatus(meeting, now),
    startsInMs: Number.isFinite(start) ? start - now : null,
    startsAtMs: Number.isFinite(start) ? start : null,
    endsAtMs: end,
    joinOpensAtMs,
    joinClosesAtMs,
    reminderOpensAtMs,
    canJoinNow,
    canPostReminderNow,
  };
}

function list() {
  const now = Date.now();
  return readRaw()
    .map(item => withComputed(item, now))
    .sort((a, b) => {
      const av = Number.isFinite(a.startsAtMs) ? a.startsAtMs : 0;
      const bv = Number.isFinite(b.startsAtMs) ? b.startsAtMs : 0;
      return av - bv;
    });
}

function get(id) {
  const items = readRaw();
  const found = items.find(m => String(m.id) === String(id));
  return found ? withComputed(found) : null;
}

function findByRoomId(roomId) {
  const items = readRaw();
  const normalized = slugifyRoomId(roomId);
  const found = items.find(m => slugifyRoomId(m.roomId) === normalized);
  return found ? withComputed(found) : null;
}

function create(payload = {}) {
  const items = readRaw();
  const nowIso = new Date().toISOString();
  const meeting = {
    id: genId(),
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    roomId: slugifyRoomId(payload.roomId || payload.title || ''),
    scheduledFor: new Date(payload.scheduledFor).toISOString(),
    durationMin: Math.max(1, Number(payload.durationMin) || 60),
    timezone: String(payload.timezone || 'Europe/Zagreb'),
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: String(payload.createdBy || '').trim(),
    createdByName: payload.createdByName ? String(payload.createdByName).trim() : '',
    participantMentions: normalizeMentions(payload.participantMentions || []),
    isPrivate: !!payload.isPrivate,
    password: payload.isPrivate ? String(payload.password || '') : '',
    invitePostHashHex: '',
    invitePostedAt: null,
    reminderPostHashHex: '',
    reminderPostedAt: null,
  };
  items.push(meeting);
  writeRaw(items);
  return withComputed(meeting);
}

function update(id, patch = {}) {
  const items = readRaw();
  const idx = items.findIndex(m => String(m.id) === String(id));
  if (idx < 0) return null;
  const current = items[idx];
  const next = {
    ...current,
    title: patch.title !== undefined ? String(patch.title || '').trim() : current.title,
    description: patch.description !== undefined ? String(patch.description || '').trim() : current.description,
    roomId: patch.roomId !== undefined ? slugifyRoomId(patch.roomId) : current.roomId,
    scheduledFor: patch.scheduledFor !== undefined ? new Date(patch.scheduledFor).toISOString() : current.scheduledFor,
    durationMin: patch.durationMin !== undefined ? Math.max(1, Number(patch.durationMin) || 60) : current.durationMin,
    timezone: patch.timezone !== undefined ? String(patch.timezone || 'Europe/Zagreb') : (current.timezone || 'Europe/Zagreb'),
    participantMentions: patch.participantMentions !== undefined ? normalizeMentions(patch.participantMentions) : normalizeMentions(current.participantMentions || []),
    isPrivate: patch.isPrivate !== undefined ? !!patch.isPrivate : !!current.isPrivate,
    password: patch.password !== undefined ? String(patch.password || '') : String(current.password || ''),
    updatedAt: new Date().toISOString(),
  };
  if (!next.isPrivate) next.password = '';
  items[idx] = next;
  writeRaw(items);
  return withComputed(next);
}

function remove(id) {
  const items = readRaw();
  const next = items.filter(m => String(m.id) !== String(id));
  const changed = next.length !== items.length;
  if (changed) writeRaw(next);
  return changed;
}

function markInvitePosted(id, invitePostHashHex) {
  const items = readRaw();
  const idx = items.findIndex(m => String(m.id) === String(id));
  if (idx < 0) return null;
  items[idx] = {
    ...items[idx],
    invitePostHashHex: String(invitePostHashHex || '').trim(),
    invitePostedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeRaw(items);
  return withComputed(items[idx]);
}

function markReminderPosted(id, reminderPostHashHex) {
  const items = readRaw();
  const idx = items.findIndex(m => String(m.id) === String(id));
  if (idx < 0) return null;
  items[idx] = {
    ...items[idx],
    reminderPostHashHex: String(reminderPostHashHex || '').trim(),
    reminderPostedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeRaw(items);
  return withComputed(items[idx]);
}

function getJoinAccess(roomId, now = Date.now()) {
  const meeting = findByRoomId(roomId);
  if (!meeting) {
    return {
      isScheduled: false,
      canJoinNow: false,
      state: 'not_scheduled',
      meeting: null,
      joinOpensAtMs: null,
      joinClosesAtMs: null,
      startsAtMs: null,
      endsAtMs: null,
    };
  }

  const computed = withComputed(meeting, now);
  const start = computed.startsAtMs;
  const end = computed.endsAtMs;
  const joinOpensAtMs = computed.joinOpensAtMs;
  const joinClosesAtMs = computed.joinClosesAtMs;

  let state = 'not_scheduled';
  if (Number.isFinite(joinOpensAtMs) && now < joinOpensAtMs) state = 'before_open';
  else if (Number.isFinite(joinClosesAtMs) && now > joinClosesAtMs) state = 'closed';
  else state = 'join_open';

  return {
    isScheduled: true,
    canJoinNow: state === 'join_open',
    state,
    meeting: computed,
    joinOpensAtMs,
    joinClosesAtMs,
    startsAtMs: start,
    endsAtMs: end,
  };
}

function canOpenScheduledRoom(roomId, now = Date.now()) {
  const access = getJoinAccess(roomId, now);
  if (!access.canJoinNow) return null;
  return access.meeting;
}

module.exports = {
  FILE_PATH,
  JOIN_EARLY_MS,
  JOIN_LATE_MS,
  REMINDER_READY_MS,
  slugifyRoomId,
  normalizeMentions,
  list,
  get,
  findByRoomId,
  create,
  update,
  remove,
  markInvitePosted,
  markReminderPosted,
  deriveStatus,
  getJoinAccess,
  canOpenScheduledRoom,
};
