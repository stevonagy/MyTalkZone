const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, 'roomPolicy.json');

const DEFAULT_POLICY = {
  MASTER_PUBLIC_KEY: "BC1YLhUQS3L6kn7biWxa3LCXe1KmzGDro6TFo3Jro2Bi3n31EKZyUoJ",
  ALLOWED_CREATORS: [
    "BC1YLhUQS3L6kn7biWxa3LCXe1KmzGDro6TFo3Jro2Bi3n31EKZyUoJ",
    "BC1YLgjmxcCff55PsmYBphBrriDmeBMvru6uRdTVnzdb1BPZQiVxgPB"
  ],
  AUDIO_ONLY_ABOVE: 8
};

function normalize(policy) {
  const p = policy || {};
  const master = String(p.MASTER_PUBLIC_KEY || DEFAULT_POLICY.MASTER_PUBLIC_KEY);
  const allowed = Array.isArray(p.ALLOWED_CREATORS) ? p.ALLOWED_CREATORS.map(String) : [];
  const audioOnlyAbove = Number.isFinite(p.AUDIO_ONLY_ABOVE) ? Math.max(0, p.AUDIO_ONLY_ABOVE|0) : DEFAULT_POLICY.AUDIO_ONLY_ABOVE;
  // Ensure master is always in allowed
  const uniq = Array.from(new Set([master, ...allowed]));
  return {
    MASTER_PUBLIC_KEY: master,
    ALLOWED_CREATORS: uniq,
    AUDIO_ONLY_ABOVE: audioOnlyAbove
  };
}

function ensurePolicy() {
  if (!fs.existsSync(POLICY_PATH)) {
    fs.writeFileSync(POLICY_PATH, JSON.stringify(DEFAULT_POLICY, null, 2), 'utf8');
    return { ...DEFAULT_POLICY };
  }
  try {
    const raw = fs.readFileSync(POLICY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch (e) {
    const fixed = normalize(DEFAULT_POLICY);
    fs.writeFileSync(POLICY_PATH, JSON.stringify(fixed, null, 2), 'utf8');
    return fixed;
  }
}

function readPolicy() {
  return ensurePolicy();
}

function writePolicy(policy) {
  const normalized = normalize(policy || {});
  fs.writeFileSync(POLICY_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

module.exports = { readPolicy, writePolicy, POLICY_PATH };
