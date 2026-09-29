import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoute, attachUser } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 8 * 1024 * 1024) { reject(new Error('payload_too_large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/website.html' : pathname;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    let body = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try { body = await readBody(req); } catch { res.writeHead(413).end('Payload too large'); return; }
    }
    req.body = body;
    req.query = Object.fromEntries(url.searchParams);

    const route = findRoute(req.method, pathname);
    if (!route) { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'not_found' })); return; }

    attachUser(req);
    if (route.auth && !req.user) { res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'unauthenticated' })); return; }
    req.params = route.params;

    let result;
    try { result = route.handler(req); } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error', message: String(e.message || e) }));
      return;
    }

    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    const cookies = [];
    if (result.cookie) cookies.push(`ejari_session=${result.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
    if (result.clearCookie) cookies.push('ejari_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    if (cookies.length) headers['Set-Cookie'] = cookies;
    res.writeHead(result.status || 200, headers);
    res.end(JSON.stringify(result.body ?? {}));
  });
}
