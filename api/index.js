'use strict';

// ─── Rate limiting (in-memory, best-effort) ────────────────────────────────
// NOTE: Vercel serverless has NO shared memory across instances. This limiter
// throttles bursts hitting the *same warm instance* only — it is best-effort,
// not a full solution. For production-grade limiting (all instances), replace
// _rateLimitStore with Vercel KV or Upstash Redis:
//
//   TODO (KV): npm i @upstash/redis, then:
//     import { Redis } from '@upstash/redis';
//     const redis = Redis.fromEnv();
//     // INCR key; EXPIRE key RL_WINDOW_S; read count → 429 if over limit.
//   Use environment vars UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
//
// Login brute-force is NOT a concern here: Supabase login goes to GoTrue
// directly in the browser — it does NOT pass through /api. The relevant
// abuse surfaces are:
//   • Guest-form writes (registrarInscricaoConvidadoExterno): spam/flood.
//   • General endpoint flooding: DoS against authenticated actions.

// ── Tuneable limits ─────────────────────────────────────────────────────────
const RL_WINDOW_MS    = 60_000; // sliding window length (ms)
const RL_PUBLIC_LIMIT = 30;     // req/window for PUBLIC_ACTIONS (guest form)
//  30/min: generous for a legitimate guest (a handful of calls), but caps
//  scripted spam quickly. Raise if real event sign-up flows need more.
const RL_AUTH_LIMIT   = 200;    // req/window for authenticated / staff actions
//  200/min: a busy admin dashboard can fire many actions on page load.
//  This only fires on extreme misuse; raise further if you see false positives.

// ── In-memory store ─────────────────────────────────────────────────────────
/** @type {Map<string, { count: number, windowStart: number }>} */
const _rateLimitStore = new Map();

// Periodic cleanup to prevent unbounded Map growth on long-lived instances.
// Entries older than one window are stale and safe to delete.
const _cleanup = setInterval(() => {
  const cutoff = Date.now() - RL_WINDOW_MS;
  for (const [ip, entry] of _rateLimitStore) {
    if (entry.windowStart < cutoff) _rateLimitStore.delete(ip);
  }
}, 5 * 60_000); // every 5 min
if (_cleanup.unref) _cleanup.unref(); // don't keep Node alive in test harnesses

// ── Helpers ──────────────────────────────────────────────────────────────────
function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window counter per IP.
 * Returns true (allowed) or false (limit exceeded).
 */
function checkRateLimit(ip, limit) {
  const now = Date.now();
  let entry = _rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart >= RL_WINDOW_MS) {
    _rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true; // first request in fresh window — always allowed
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

// ─── Backend modules ───────────────────────────────────────────────────────
let _loaded = false;
const allFunctions = {};

function loadBackend() {
  if (_loaded) return;

  try {
    const modules = [
      require('../lib/code'),
      require('../lib/rtma_pessoas'),
      require('../lib/rtma_supabase'),
      require('../lib/rtma_amigos'),
      require('../lib/rtma_cache'),
      require('../lib/rtma_config'),
      require('../lib/rtma_utils'),
      require('../lib/portal_supabase'),
      require('../lib/sistema_permissoes_cargos'),
      require('../lib/funcao_match_storage'),
    ];

    for (const mod of modules) {
      Object.assign(allFunctions, mod);
    }
    _loaded = true;
  } catch (err) {
    console.error('[API] Failed to load backend modules:', err.message);
    throw err;
  }
}

// ─── Auth verification ─────────────────────────────────────────────────────
async function verifyAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  // URL e anon key são públicos (a anon key vai pro browser por design); usar fallback
  // garante que verifyAuth funcione mesmo se a env var não estiver no escopo do deploy
  // (ex.: SUPABASE_URL ausente em Preview) — sem isso, auth falharia em todos os requests.
  const supabaseUrl = process.env.SUPABASE_URL || 'https://bqkttaflhtsdkamgscnf.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa3R0YWZsaHRzZGthbWdzY25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTA4MjEsImV4cCI6MjA4Mjc2NjgyMX0.yGxyrn2nMTEbl6w8Lk8HwsblgqNzGS36ckZBGXAIitQ';
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      }
    });
    if (res.status !== 200) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Event-staff token verification ───────────────────────────────────────
const { validEventStaffToken } = require('../lib/event-staff-auth');

// Actions the scanner and camisas pages call — authorised by event-staff token OR JWT.
// Enumerated from grep of public/scanner_refeicoes.html and public/camisas_enumeradas.html.
const EVENT_STAFF_ACTIONS = new Set([
  // scanner_refeicoes.html
  'credenciarPlenariaLote',
  'consumirRefeicoesPassaporteLote',
  'credenciarInscricoesModalidadeLote',
  'validarSaldoRefeicaoPassaporte',
  'obterCacheValidacaoAlimentacao',
  'obterCacheValidacaoCredenciamento',
  'obterCachePlenaria',
  'listarModalidadesEvento',
  'listarCredenciadosModalidade',
  'removerCredenciamentoModalidade',
  'removerCredenciamentoPlenaria',
  'listarCredenciadosPlenaria',
  // camisas_enumeradas.html
  'listarCamisasEnumeradas',
  'salvarCamisaEnumerada',
  'enviarComprovanteCamisaParaDrive',
]);

// ─── Public actions (no auth required) ────────────────────────────────────
// These are callable without a valid session — guest event form only.
// Everything else requires a valid Supabase JWT or an event-staff token.
const PUBLIC_ACTIONS = new Set([
  'obterInfoFormularioConvidado',
  'registrarInscricaoConvidadoExterno',
  'isFormularioConvidadosAtivo', // harmless read used as guest-form gate
  'validarAcessoStaffEvento',    // token validity check used by scanner/camisas UI (no data returned)
]);

// TODO (A1-02): per-action role enforcement — stub below for next task.
// const ACTION_ROLES = {
//   'deletarInscricao': ['admin', 'diretoria'],
//   // ...
// };

// ─── Handler ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://leo-portal-vercel.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-event-id, x-event-token');

  // OPTIONS preflight must never be rate-limited — browsers send it automatically.
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body && req.method === 'POST') {
    // parse body manually if needed
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
  }

  const { action, args = [] } = body || {};
  if (!action) return res.status(400).json({ sucesso: false, erro: 'Missing action' });

  // ─── Rate limiting (best-effort, in-memory) ─────────────────────────────
  // Applied BEFORE auth so unauthenticated floods are stopped early.
  // Limits differ by action class: public (guest form) gets a stricter cap;
  // authenticated actions get a generous cap that only fires on misuse/DoS.
  const clientIP = getClientIP(req);
  const isPublicAction = PUBLIC_ACTIONS.has(action);
  const rlLimit = isPublicAction ? RL_PUBLIC_LIMIT : RL_AUTH_LIMIT;
  if (!checkRateLimit(clientIP, rlLimit)) {
    res.setHeader('Retry-After', String(Math.ceil(RL_WINDOW_MS / 1000)));
    return res.status(429).json({
      sucesso: false,
      erro: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
    });
  }

  // ─── Auth enforcement ───────────────────────────────────────────────────
  if (!PUBLIC_ACTIONS.has(action)) {
    // For event-staff actions: accept a valid event token OR a valid JWT.
    if (EVENT_STAFF_ACTIONS.has(action)) {
      const eventId = req.headers['x-event-id'];
      const eventToken = req.headers['x-event-token'];
      const tokenOk = validEventStaffToken(eventId, eventToken);
      if (!tokenOk) {
        // Token missing or invalid — fall back to JWT auth
        const authUser = await verifyAuth(req);
        if (!authUser) {
          return res.status(401).json({ sucesso: false, erro: 'Não autenticado. Faça login ou use um link de acesso de evento válido.' });
        }
      }
    } else {
      // Non-staff action: always requires JWT
      const authUser = await verifyAuth(req);
      if (!authUser) {
        return res.status(401).json({ sucesso: false, erro: 'Não autenticado. Faça login novamente.' });
      }
    }
  }

  loadBackend();

  const fn = allFunctions[action];
  if (!fn) {
    console.warn(`Unknown action: ${action}`);
    return res.status(404).json({ sucesso: false, erro: `Action not found: ${action}` });
  }

  try {
    const result = await fn(...(Array.isArray(args) ? args : [args]));
    return res.status(200).json(result !== undefined ? result : { sucesso: true });
  } catch (err) {
    console.error(`[API] Error in ${action}:`, err);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno do servidor. Tente novamente.' });
  }
};
