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
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.SUPABASE_ANON_KEY,
      }
    });
    if (res.status !== 200) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
