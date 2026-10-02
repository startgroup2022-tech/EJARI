import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoute, attachUser, adminIpBlocked } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };

// Only these files/directories are ever served over HTTP. Everything else on disk
// (the SQLite database, server source, .git, tests, deploy configs) stays private.
const PUBLIC_DIR = path.join(root, 'assets');
const PUBLIC_FILES = new Set(['index.html', 'website.html', 'dashboard.html', 'app.html', 'app-screen.html', 'pay.html', 'reset.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'robots.txt', 'sitemap.xml']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        // Stop consuming and reject, but leave the socket alive so the caller can
        // still deliver a real 413 instead of resetting the connection.
        settled = true;
        req.pause();
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      if (!chunks.length) return resolve(null);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve({ parsed: raw ? JSON.parse(raw) : null, raw }); } catch { resolve({ parsed: null, raw }); }
    });
    req.on('error', reject);
  });
}

function isPublicPath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true;
  const rel = pathname.replace(/^\/+/, '');
  if (!rel || rel.includes('\0')) return false;
  if (PUBLIC_FILES.has(rel)) return true;
  return pathname.startsWith('/assets/') && path.resolve(PUBLIC_DIR, rel.slice('assets/'.length)).startsWith(PUBLIC_DIR + path.sep);
}

async function serveStatic(req, res, pathname) {
  if (!isPublicPath(pathname)) { res.writeHead(404, SECURITY_HEADERS).end('Not found'); return; }
  const rel = pathname === '/' ? '/website.html' : pathname;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403, SECURITY_HEADERS).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    let body = null;
    let rawBody = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try { const r = await readBody(req); body = r && r.parsed; rawBody = r && r.raw; }
      catch {
        // Respond with a real 413 and close cleanly rather than resetting the socket.
        res.writeHead(413, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' })
          .end(JSON.stringify({ error: 'payload_too_large' }));
        return;
      }
    }
    req.body = body;
    req.rawBody = rawBody;
    req.query = Object.fromEntries(url.searchParams);

    const route = findRoute(req.method, pathname);
    if (!route) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' })); return; }

    attachUser(req);
    if (route.auth && !req.user) { res.writeHead(401, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'unauthenticated' })); return; }
    // Enforce the admin IP allow-list (when configured) on every authenticated admin request.
    if (adminIpBlocked(req)) { res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'ip_not_allowed' })); return; }
    req.params = route.params;

    let result;
    try { result = await route.handler(req); } catch (e) {
      console.error(e);
      res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }));
      return;
    }

    const headers = { ...SECURITY_HEADERS, 'Content-Type': result.contentType || 'application/json; charset=utf-8' };
    const cookies = [];
    // Secure only when actually served over HTTPS (direct TLS or behind a proxy that forwards the scheme)
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    if (result.cookie) cookies.push(`ejari_session=${result.cookie}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${30 * 86400}`);
    if (result.clearCookie) cookies.push(`ejari_session=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
    if (cookies.length) headers['Set-Cookie'] = cookies;
    if (result.headers) Object.assign(headers, result.headers);
    res.writeHead(result.status || 200, headers);
    // `raw` carries pre-rendered bodies (HTML receipt, CSV export); otherwise JSON.
    res.end(result.raw != null ? result.raw : JSON.stringify(result.body ?? {}));
  });
}
