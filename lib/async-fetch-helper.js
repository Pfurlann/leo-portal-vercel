/**
 * Async wrapper for UrlFetchApp-style fetch calls.
 * All backend functions that call UrlFetchApp must be async.
 */
async function gasStyleFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = options.headers || {};
  let body;
  if (options.payload) {
    body = typeof options.payload === 'string' ? options.payload : JSON.stringify(options.payload);
  }
  if (options.body) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
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
