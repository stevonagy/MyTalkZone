// src/ws/roomsStore.js
// In-memory room store with TTL auto-cleanup + DeSo username resolution.

const DEFAULT_TTL_HOURS = Number(process.env.ROOMS_TTL_HOURS || 12); // default: 12h
const TTL_MS = DEFAULT_TTL_HOURS * 60 * 60 * 1000;

// shape: { id, title, createdBy, createdByName, createdAt, participants, lastActive }
const rooms = new Map();

// simple in-memory cache: pubKey -> username (or null if not found)
const desoNameCache = new Map();

// Node 18+ has global fetch; Node v22 (your env) supports it.
// Resolve a pubkey to username and cache it. Non-blocking best-effort.
async function resolveDesoUsername(pubKey) {
  if (!pubKey) return null;

  if (desoNameCache.has(pubKey)) {
    return desoNameCache.get(pubKey);
  }

  try {
    const url = `https://node.deso.org/api/v0/get-single-profile?PublicKeyBase58Check=${encodeURIComponent(pubKey)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      desoNameCache.set(pubKey, null);
      return null;
    }
    const data = await res.json();
    const username =
      data?.Profile?.Username || data?.Profile?.PublicKeyBase58Check || null;
    desoNameCache.set(pubKey, username || null);
    return username || null;
  } catch {
    desoNameCache.set(pubKey, null);
    return null;
  }
}

function list() {
  // newest first by lastActive
  return Array.from(rooms.values()).sort(
    (a, b) => (b.lastActive || b.createdAt) - (a.lastActive || a.createdAt)
  );
}

function upsertOnCreate({ id, title, createdBy, createdByName }) {
  const now = Date.now();
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      title: title || id,
      createdBy: createdBy || '',
      createdByName: (createdByName !== undefined ? createdByName : null),
      createdAt: now,
      lastActive: now,
      participants: 0,
    });
  } else {
    const r = rooms.get(id);
    if (title && !r.title) r.title = title;
    r.lastActive = now;
  }

  // Best-effort async username resolution (doesn't block room creation)
  if (createdBy) {
    resolveDesoUsername(createdBy).then((uname) => {
      const r = rooms.get(id);
      if (r && uname && !r.createdByName) {
        r.createdByName = uname;
      }
    });
  }
}

function touch(id) {
  const r = rooms.get(id);
  if (!r) return;
  r.lastActive = Date.now();
}

function setParticipants(id, count) {
  const r = rooms.get(id);
  if (!r) return;
  r.participants = Math.max(0, Number(count) || 0);
  r.lastActive = Date.now();
  // Do NOT delete immediately when 0 — cleanup job will handle it after TTL.
}

function remove(id) {
  rooms.delete(id);
}

// Periodic cleanup of empty & inactive rooms by TTL.
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms.entries()) {
    const inactiveFor = now - (r.lastActive || r.createdAt);
    if ((r.participants || 0) === 0 && inactiveFor > TTL_MS) {
      rooms.delete(id);
    }
  }
}, Math.max(30 * 1000, Math.min(TTL_MS / 12, 5 * 60 * 1000))); // every 30s–5min depending on TTL

module.exports = { list, upsertOnCreate, setParticipants, remove, touch, TTL_MS };
