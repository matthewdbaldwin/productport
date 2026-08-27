// src/middleware/apiKey.js — static bearer-key guard for inbound machine seams
// (OpsPort, ReviewPort). One implementation, parameterised by the env var that
// holds the consumer's key, so a fix here reaches every seam. 503 when the key
// is unset (fail closed on a mis-deployed env), 401 on a missing/wrong key,
// constant-time compare so the key length/prefix can't be probed.
'use strict';
const crypto = require('crypto');

function requireApiKey(envVar, label) {
  return function apiKeyGuard(req, res, next) {
    const key = process.env[envVar];
    if (!key) return res.status(503).json({ error: `${label} integration not configured.` });
    const header = req.headers.authorization || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (
      !provided ||
      provided.length !== key.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(key))
    ) {
      return res.status(401).json({ error: 'Invalid API key.' });
    }
    next();
  };
}

module.exports = { requireApiKey };
