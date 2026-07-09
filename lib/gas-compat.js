/**
 * GAS → Node.js compatibility layer
 * Replaces Google Apps Script built-in services with Node.js equivalents
 */

// ─── UrlFetchApp ───────────────────────────────────────────────────────────
const UrlFetchApp = {
  fetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const body = options.payload
      ? (typeof options.payload === 'string' ? options.payload : JSON.stringify(options.payload))
      : options.body || undefined;

    // synchronous-style via synchronous fetch polyfill isn't available in pure Node
    // We use a sync wrapper via node-fetch or built-in fetch (Node 18+)
    // Since GAS code is synchronous we return a response-like object
    // IMPORTANT: callers must be converted to async or use the async wrapper
    throw new Error('UrlFetchApp.fetch must be called via asyncFetch helper');
  },

  async asyncFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    let body;
    if (options.payload) {
      body = typeof options.payload === 'string' ? options.payload : JSON.stringify(options.payload);
    }

    const res = await fetch(url, { method, headers, body });
    const text = await res.text();

    return {
      getResponseCode: () => res.status,
      getContentText: () => text,
      getHeaders: () => Object.fromEntries(res.headers.entries()),
    };
  }
};

// ─── PropertiesService ────────────────────────────────────────────────────
const PropertiesService = {
  getScriptProperties() {
    return {
      getProperty: (key) => process.env[key] || null,
      setProperty: (key, value) => { process.env[key] = value; },
      getProperties: () => ({ ...process.env }),
    };
  }
};

// ─── CacheService (in-memory per process) ─────────────────────────────────
const _cacheStore = new Map();
const CacheService = {
  getScriptCache() {
    return {
      get: (key) => _cacheStore.get(key) || null,
      put: (key, value, ttl) => {
        _cacheStore.set(key, value);
        if (ttl) setTimeout(() => _cacheStore.delete(key), ttl * 1000);
      },
      remove: (key) => _cacheStore.delete(key),
      removeAll: (keys) => keys.forEach(k => _cacheStore.delete(k)),
      getAll: (keys) => {
        const result = {};
        keys.forEach(k => { if (_cacheStore.has(k)) result[k] = _cacheStore.get(k); });
        return result;
      },
      putAll: (obj, ttl) => {
        Object.entries(obj).forEach(([k, v]) => {
          _cacheStore.set(k, v);
          if (ttl) setTimeout(() => _cacheStore.delete(k), ttl * 1000);
        });
      }
    };
  }
};

// ─── LockService (no-op — Supabase handles atomicity) ─────────────────────
const LockService = {
  getScriptLock() {
    return {
      tryLock: () => true,
      hasLock: () => true,
      releaseLock: () => {},
      waitLock: () => {},
    };
  },
  getDocumentLock() { return LockService.getScriptLock(); },
  getUserLock() { return LockService.getScriptLock(); },
};

// ─── Utilities ────────────────────────────────────────────────────────────
const Utilities = {
  base64Decode(str) {
    return Buffer.from(str, 'base64');
  },
  base64Encode(bytes) {
    if (Buffer.isBuffer(bytes)) return bytes.toString('base64');
    return Buffer.from(bytes).toString('base64');
  },
  base64EncodeWebSafe(value) {
    const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  newBlob(bytes, mimeType, name) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return {
      _buf: buf, _mime: mimeType, _name: name,
      getBytes: () => Array.from(buf),
      getContentType: () => mimeType,
      getName: () => name,
      setName: function(n) { this._name = n; return this; },
      getDataAsString: () => buf.toString('utf8'),
    };
  },
  gzip(blob) { return blob; }, // stub
  ungzip(blob) { return blob; }, // stub
  getUuid() { return require('crypto').randomUUID(); },
  sleep: async (ms) => new Promise(r => setTimeout(r, ms)),
  formatDate(date, timezone, format) {
    // Basic implementation for dd/MM/yyyy format
    if (!date || isNaN(date.getTime())) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return format
      .replace('dd', d)
      .replace('MM', m)
      .replace('yyyy', y);
  },
};

// ─── Session (no-op) ──────────────────────────────────────────────────────
const Session = {
  getActiveUser: () => ({ getEmail: () => process.env.ADMIN_EMAIL || '' }),
  getEffectiveUser: () => ({ getEmail: () => process.env.ADMIN_EMAIL || '' }),
  getScriptTimeZone: () => process.env.TZ || 'America/Sao_Paulo',
};

// ─── ScriptApp ───────────────────────────────────────────────────────────
const ScriptApp = {
  getService: () => ({ getUrl: () => process.env.VERCEL_URL || '' }),
};

// ─── Logger ──────────────────────────────────────────────────────────────
const Logger = {
  log: (...args) => console.log(...args),
  getLog: () => '',
};

// ─── MimeType ────────────────────────────────────────────────────────────
const MimeType = {
  MICROSOFT_EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
  CSV: 'text/csv',
  PLAIN_TEXT: 'text/plain',
  JSON: 'application/json',
};

// ─── DriveApp stub (file operations via Supabase Storage or Drive API) ────
const DriveApp = {
  getFolderById: (id) => ({ createFile: () => ({}), getFoldersByName: () => ({ hasNext: () => false }) }),
  getFileById: (id) => ({
    setTrashed: () => {},
    setSharing: () => {},
    getAs: (mime) => Utilities.newBlob(Buffer.from(''), mime, 'file'),
    getId: () => id,
    getName: () => '',
  }),
  createFile: (blob) => ({
    setSharing: () => {},
    getId: () => `file_${Date.now()}`,
    getName: () => blob._name || 'file',
  }),
  getRootFolder: () => ({ removeFile: () => {} }),
  getFoldersByName: (name) => ({ hasNext: () => false, next: () => null }),
  Access: { ANYONE_WITH_LINK: 'anyoneWithLink' },
  Permission: { VIEW: 'view' },
};

// ─── SpreadsheetApp stub (legacy — should not be reached) ─────────────────
const SpreadsheetApp = {
  openById: (id) => { throw new Error(`SpreadsheetApp.openById called with ${id} — migrate to Supabase`); },
  create: (name) => { throw new Error('SpreadsheetApp.create called — migrate to exceljs'); },
};

// ─── HtmlService stub ─────────────────────────────────────────────────────
const HtmlService = {
  createHtmlOutput: (html) => ({ content: html }),
  createHtmlOutputFromFile: (file) => ({ content: '' }),
  createTemplateFromFile: (file) => ({ evaluate: () => ({ content: '' }) }),
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
};

// ─── console passthrough (GAS uses console.log too) ──────────────────────
// Already available in Node.js

// ─── Portal Supabase bridge (makes portalBuscar* available in code.js scope) ─
let _portalBridge = null;
function getPortalBridge() {
  if (!_portalBridge) {
    try { _portalBridge = require('./portal_supabase'); } catch(e) { _portalBridge = {}; }
  }
  return _portalBridge;
}

const PORTAL_USAR_SUPABASE = true;

// Proxy globals so code.js can call portalBuscarCampanhas etc. directly
const portalBuscarCampanhas = (...a) => getPortalBridge().portalBuscarCampanhas?.(...a) ?? [];
const portalBuscarAtividades = (...a) => getPortalBridge().portalBuscarAtividades?.(...a) ?? [];
const portalBuscarTodasAtividades = (...a) => getPortalBridge().portalBuscarTodasAtividades?.(...a) ?? [];
const portalBuscarTodasCampanhas = (...a) => getPortalBridge().portalBuscarTodasCampanhas?.(...a) ?? [];

// RTMA_SUPABASE_CONFIG stub (populated at runtime by rtma_supabase)
let RTMA_SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

// PLANILHAS_CAMPANHAS/ATIVIDADES stubs (replaced by Supabase - kept for compat)
const PLANILHAS_CAMPANHAS = {};
const PLANILHAS_ATIVIDADES = {};
const SOURCE_PLANILHAS_CLUBES = {};

module.exports = {
  UrlFetchApp, PropertiesService, CacheService, LockService,
  Utilities, Session, ScriptApp, Logger, MimeType,
  DriveApp, SpreadsheetApp, HtmlService,
  PORTAL_USAR_SUPABASE,
  portalBuscarCampanhas, portalBuscarAtividades,
  portalBuscarTodasAtividades, portalBuscarTodasCampanhas,
  RTMA_SUPABASE_CONFIG,
  PLANILHAS_CAMPANHAS, PLANILHAS_ATIVIDADES, SOURCE_PLANILHAS_CLUBES,
};
