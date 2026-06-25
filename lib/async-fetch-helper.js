/**
 * Async wrapper for UrlFetchApp-style fetch calls.
 * All backend functions that call UrlFetchApp must be async.
 */
async function gasStyleFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};

  // Converte payloads binários (Buffer, TypedArray ou array de bytes vindo de
  // blob.getBytes()) para Buffer. Sem isso, JSON.stringify transformava os bytes
  // em texto "[137,80,...]" e corrompia uploads de imagem/vídeo no Storage.
  const toBody = (value) => {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return Buffer.from(value);
    }
    if (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'number')) {
      return Buffer.from(value);
    }
    return JSON.stringify(value);
  };

  let body;
  if (options.payload != null) {
    body = toBody(options.payload);
  }
  if (options.body != null) {
    body = toBody(options.body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : body,
  });

  const text = await res.text();
  return {
    getResponseCode: () => res.status,
    getContentText: () => text,
    getHeaders: () => Object.fromEntries(res.headers.entries()),
  };
}

module.exports = { gasStyleFetch };
