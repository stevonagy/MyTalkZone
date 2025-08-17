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
    const isMaster = pub && pub === current.MASTER_PUBLIC_KEY;
    if (!isMaster) return res.status(403).json({ error: 'forbidden' });
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
    const payload = {
      rooms,
      ttlMs: TTL_MS,
      now: Date.now(),
      canCreate: canCreateWithPolicy(pub)
    };
    res.json(payload);
  } catch (e) {
    console.error('rooms api error', e);
    res.status(500).json({ rooms: [], ttlMs: 0, now: Date.now(), canCreate: false });
  }
});

// Lightweight boolean for UI checks
app.get('/api/can-create', (req, res) => {
  const pub = String(req.header('x-deso-pubkey') || '').trim();
  res.json({ canCreate: canCreateWithPolicy(pub) });
});

// Require DeSo public key in Socket.IO auth payload (namespace /stream)
stream(io);

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});