(function() {
  'use strict';

  const API_BASE = '/api';

  function getToken() {
    try {
      const s = localStorage.getItem('sb-session') || localStorage.getItem('supabase.auth.token') || '{}';
      const parsed = JSON.parse(s);
      return parsed.access_token || parsed.currentSession?.access_token || '';
    } catch { return ''; }
  }

  // callGAS('functionName', arg1, arg2, ...) → Promise<result>
  window.callGAS = async function callGAS(action, ...args) {
    const token = getToken();
    // Event-staff token: set window.__eventStaffAuth = { eventoId, token } to authenticate
    // scanner/camisas pages without a user session (HMAC-based per-event access).
    const staffAuth = window.__eventStaffAuth;
    const staffHeaders = (staffAuth && staffAuth.eventoId && staffAuth.token)
      ? { 'x-event-id': String(staffAuth.eventoId), 'x-event-token': String(staffAuth.token) }
      : {};
    const res = await fetch(`${API_BASE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...staffHeaders,
      },
      body: JSON.stringify({ action, args }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ erro: res.statusText }));
      const msg = err.erro || res.statusText;
      if (res.status === 401) {
        // Session expired or missing — surface clearly; caller may redirect to login
        const e = new Error(msg || 'Sessão expirada. Faça login novamente.');
        e.status = 401;
        throw e;
      }
      throw new Error(msg);
    }
    return res.json();
  };

  // Shim: replaces google.script.run with callGAS-based proxy
  // Usage: google.script.run.withSuccessHandler(fn).withFailureHandler(fn2).myFunc(args)
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = new Proxy({}, {
    get(_, action) {
      if (action === 'withSuccessHandler' || action === 'withFailureHandler') {
        return () => window.google.script.run; // fluent no-op
      }
      return (...args) => callGAS(action, ...args);
    }
  });

  // Override the fluent builder pattern properly
  function GASRunner() {
    this._success = null;
    this._failure = null;
  }
  GASRunner.prototype.withSuccessHandler = function(fn) { this._success = fn; return this; };
  GASRunner.prototype.withFailureHandler = function(fn) { this._failure = fn; return this; };
  GASRunner.prototype._call = function(action, args) {
    const self = this;
    callGAS(action, ...args)
      .then(result => { if (self._success) self._success(result); })
      .catch(err => { if (self._failure) self._failure(err); else console.error(err); });
  };

  window.google.script.run = new Proxy(new GASRunner(), {
    get(target, prop) {
      if (prop === 'withSuccessHandler') return (fn) => { target._success = fn; return window.google.script.run; };
      if (prop === 'withFailureHandler') return (fn) => { target._failure = fn; return window.google.script.run; };
      // It's a function name
      return (...args) => {
        const runner = new GASRunner();
        runner._success = target._success;
        runner._failure = target._failure;
        target._success = null;
        target._failure = null;
        runner._call(prop, args);
      };
    }
  });
})();
