// Socket.IO namespace: /stream
// Uses loadPolicy + roomsStore; emits 'subscribed' for UI to unhide controls.

const roomsStore = require('./roomsStore');
const meetingsStore = require('./meetingsStore');
const { readPolicy } = require('./loadPolicy');

function isCreatorAllowed(pub) {
  try {
    const policy = readPolicy() || {};
    const allowed = new Set([String(policy.MASTER_PUBLIC_KEY || ''), ...(policy.ALLOWED_CREATORS || []).map(String)]);
    return allowed.has(String(pub || ''));
  } catch (e) {
    return false;
  }
}

function roomExistsInStore(roomId) {
  try {
    const data = roomsStore.list ? roomsStore.list() : {};
    const list = Array.isArray(data) ? data : (data.rooms || []);
    return list.some(r => String(r.id) === String(roomId));
  } catch (e) {
    return false;
  }
}

function broadcastParticipants(roomName, nsp) {
  try {
    const room = nsp.adapter.rooms.get(roomName);
    const count = room ? room.size : 0;
    if (typeof roomsStore.setParticipants === 'function') {
      roomsStore.setParticipants(roomName, count);
    }
  } catch (e) {/* noop */}
}

module.exports = function attachStreamNamespace(io) {
  const nsp = io.of('/stream');

  nsp.use((socket, next) => {
    const pub = socket.handshake?.auth?.publicKey || null;
    if (!pub) return next(new Error('UNAUTHORIZED'));
    socket.desoPublicKey = pub;
    next();
  });

  nsp.on('connection', (socket) => {
    socket.on('subscribe', ({ room, title, createdByName }) => {
      const roomName = String(room || '').trim();
      if (!roomName) {
        socket.emit('room-create-denied', { reason: 'MISSING_ROOM' });
        return;
      }

      const exists = roomExistsInStore(roomName);
      const scheduledAccess = meetingsStore.getJoinAccess(roomName);
      const scheduledMeeting = scheduledAccess.canJoinNow ? scheduledAccess.meeting : null;

      if (scheduledAccess.isScheduled && !scheduledAccess.canJoinNow) {
        socket.emit('room-create-denied', {
          reason: scheduledAccess.state === 'before_open' ? 'SCHEDULED_TOO_EARLY' : 'SCHEDULED_CLOSED',
          room: roomName,
          meetingId: scheduledAccess.meeting?.id || null,
          title: scheduledAccess.meeting?.title || roomName,
          timezone: scheduledAccess.meeting?.timezone || 'Europe/Zagreb',
          scheduledFor: scheduledAccess.meeting?.scheduledFor || null,
          joinOpensAtMs: scheduledAccess.joinOpensAtMs,
          joinClosesAtMs: scheduledAccess.joinClosesAtMs,
          startsAtMs: scheduledAccess.startsAtMs,
          endsAtMs: scheduledAccess.endsAtMs,
        });
        return;
      }

      if (!exists) {
        const pk = socket.desoPublicKey;

        if (scheduledMeeting) {
          if (typeof roomsStore.upsertOnCreate === 'function') {
            roomsStore.upsertOnCreate({
              id: roomName,
              title: scheduledMeeting.title || title || roomName,
              createdBy: scheduledMeeting.createdBy || pk,
              createdByName: scheduledMeeting.createdByName || createdByName || null,
            });
          }
        } else {
          // CREATE path needs title + permission
          if (!title || !String(title).trim()) {
            socket.emit('room-create-denied', { reason: 'MISSING_TITLE' });
            return;
          }
          if (!isCreatorAllowed(pk)) {
            socket.emit('room-create-denied', { reason: 'NOT_ALLOWED' });
            return;
          }
          if (typeof roomsStore.upsertOnCreate === 'function') {
            roomsStore.upsertOnCreate({ id: roomName, title: String(title).trim(), createdBy: pk, createdByName: createdByName || null });
          }
        }
      }

      // JOIN path (works for both fresh created and existing)
      socket.join(roomName);
      if (typeof roomsStore.touch === 'function') roomsStore.touch(roomName);
      broadcastParticipants(roomName, nsp);
      nsp.emit('rooms:update');

      // Let UI show controls
      socket.emit('subscribed', {
        room: roomName,
        created: !exists,
        scheduledMeeting: scheduledMeeting ? {
          id: scheduledMeeting.id,
          title: scheduledMeeting.title,
          scheduledFor: scheduledMeeting.scheduledFor,
          durationMin: scheduledMeeting.durationMin,
        } : null,
      });

      // Wire per-room handlers
      wireRoomHandlers(socket, roomName);
    });

    function wireRoomHandlers(socket, roomName) {
      // Tell existing peers about the newcomer
      socket.to(roomName).emit('new user', { socketId: socket.id });

      socket.on('newUserStart', (data = {}) => {
        const to = data.to || data.socketId;
        if (!to) return;
        socket.to(to).emit('newUserStart', { to, sender: socket.id });
      });

      socket.on('sdp', (data = {}) => {
        const to = data.to;
        const desc = data.description;
        if (!to || !desc) return;
        socket.to(to).emit('sdp', { description: desc, sender: socket.id });
      });

      socket.on('ice candidates', (data = {}) => {
        const to = data.to;
        const candidate = data.candidate;
        if (!to || !candidate) return;
        socket.to(to).emit('ice candidates', { candidate, sender: socket.id });
      });

      socket.on('chat', (payload) => {
        socket.to(roomName).emit('chat', payload);
      });

      socket.on('disconnect', () => {
        socket.to(roomName).emit('user-left', { socketId: socket.id });
        if (typeof roomsStore.touch === 'function') roomsStore.touch(roomName);
        broadcastParticipants(roomName, nsp);
        nsp.emit('rooms:update');
      });
    }
  });
};
