'use strict';
// ─── Event-staff HMAC token helpers ───────────────────────────────────────
// Shared by api/index.js (gate) and lib/code.js (generate/validate actions).
// Never throws at module load — missing secret falls back to a dev constant
// so preview deploys are self-consistent (generate & validate agree).

const crypto = require('crypto');

let _warnedOnce = false;
function eventStaffSecret() {
  if (!process.env.EVENT_STAFF_SECRET && !_warnedOnce) {
    _warnedOnce = true;
    console.warn(
      '[event-staff-auth] EVENT_STAFF_SECRET is not set — using insecure dev fallback. ' +
      'Set it in Vercel env vars for production.'
    );
  }
  return process.env.EVENT_STAFF_SECRET || 'dev-insecure-event-staff-secret';
}

function computeEventStaffToken(eventoId) {
  return crypto
    .createHmac('sha256', eventStaffSecret())
    .update(String(eventoId))
    .digest('hex')
    .slice(0, 32);
}

function validEventStaffToken(eventoId, token) {
  if (!eventoId || !token) return false;
  const expected = computeEventStaffToken(eventoId);
  const a = Buffer.from(String(token));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { computeEventStaffToken, validEventStaffToken };
