'use strict';

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
    console.error(`[API] Error in ${action}:`, err.message);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
};
