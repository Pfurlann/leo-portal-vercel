'use strict';

/**
 * Local development server for the LEO Portal.
 *
 * Production runs on Vercel: static assets from `public/` plus a single
 * serverless function at `api/index.js`, with routing/headers defined in
 * `vercel.json`. This server reproduces that contract locally (without
 * needing a Vercel account) so the app can be exercised end-to-end:
 *
 *   • serves static files from `public/`
 *   • applies the `rewrites` from `vercel.json` (/, /rtma, /scanner, ...)
 *   • applies the `headers` from `vercel.json` (CSP, X-Frame-Options, ...)
 *   • dispatches POST /api (and /api/*) to the real serverless handler,
 *     shimming the Vercel-style `res.status()/res.json()` helpers.
 *
 * Usage: node scripts/dev-server.js [--port 3000] [--host 127.0.0.1]
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const apiHandler = require(path.join(ROOT, 'api', 'index.js'));

function parseArgs(argv) {
  const opts = { port: Number(process.env.PORT) || 3000, host: process.env.HOST || '127.0.0.1' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) opts.host = argv[++i];
  }
  return opts;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Resolve a request pathname to a static file destination using vercel.json
// rewrites. Returns an absolute file path under ROOT, or null when the request
// should be handled elsewhere (e.g. the API).
function resolveStaticTarget(pathname) {
  const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];
  for (const rule of rewrites) {
    if (rule.source === pathname) {
      // Destinations look like "/public/index.html" → file under ROOT.
      return path.join(ROOT, rule.destination.replace(/^\//, ''));
    }
  }
  // No explicit rewrite: serve from public/ directly (js/, images, etc.).
  const rel = pathname.replace(/^\//, '');
  return path.join(PUBLIC_DIR, rel);
}

// Apply the security headers from vercel.json whose `source` matches the path.
function applyConfiguredHeaders(res, pathname) {
  const headerRules = Array.isArray(vercelConfig.headers) ? vercelConfig.headers : [];
  for (const rule of headerRules) {
    let matches = false;
    if (rule.source === '/(.*)') matches = true;
    else if (rule.source === '/api/(.*)') matches = pathname.startsWith('/api');
    else matches = rule.source === pathname;
    if (!matches) continue;
    for (const h of rule.headers || []) res.setHeader(h.key, h.value);
  }
}

// Wrap a native ServerResponse with the Vercel-style helpers the handler uses.
function decorateResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = err.code === 'ENOENT' ? 404 : 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Internal error');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  applyConfiguredHeaders(res, pathname);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    decorateResponse(res);
    try {
      await apiHandler(req, res);
    } catch (err) {
      console.error('[dev-server] handler threw:', err);
      if (!res.headersSent) res.status(500).json({ sucesso: false, erro: 'dev-server: handler error' });
    }
    return;
  }

  // Prevent path traversal outside the served directories.
  const target = resolveStaticTarget(pathname);
  if (!target.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  serveStatic(res, target);
});

const { port, host } = parseArgs(process.argv.slice(2));
server.listen(port, host, () => {
  console.log(`[dev-server] LEO Portal running at http://${host}:${port}`);
  console.log('[dev-server] static: public/  |  api: api/index.js  |  routes from vercel.json');
});
