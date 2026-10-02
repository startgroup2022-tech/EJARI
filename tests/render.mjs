// Ejari — render-integrity verification (real browser).
// Loads the real client in headless Chromium, renders EVERY view for EVERY role, and asserts
// that no view throws, that each view produces markup, and that the escaping change introduced
// no double-escaping artifacts (e.g. a visible "&amp;lt;").
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RENDER_PORT || 4403);
const CDP = Number(process.env.CDP_PORT || 9334);
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', `render-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0; const fails = [];
const ok = (c, m, e) => { checks++; if (!c) { failed++; fails.push(m + (e ? ` — ${e}` : '')); console.error('  ✗ ' + m + (e ? ` — ${e}` : '')); } };

function jar() { const c = {}; return { save(r) { for (const s of [].concat(r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); }, token: () => c.ejari_session }; }
async function call(cookies, method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(cookies && cookies.header() ? { Cookie: cookies.header() } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (cookies) cookies.save(res); let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function cdp(wsUrl) { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } }; return { ready, send: (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() }; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }

process.env.EJARI_DB_FILE = dbFile;
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
let booted = false; server.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; }); server.stderr.on('data', () => {});
await waitFor(() => booted);

const ROLES = {
  landlord: { email: 'rashed.almanai@example.bh', password: 'Demo@1234', page: 'app' },
  tenant: { email: 'sara.aldosari@example.bh', password: 'Demo@1234', page: 'app' },
  admin: { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234', page: 'dashboard' },
};
const VIEWS = {
  landlord: ['overview', 'properties', 'contracts', 'payments', 'renewals', 'maintenance', 'calendar', 'documents', 'services', 'requests', 'reports', 'verify', 'support', 'notifications', 'profile'],
  tenant: ['overview', 'contracts', 'payments', 'renewals', 'maintenance', 'calendar', 'documents', 'services', 'requests', 'verify', 'support', 'notifications', 'profile'],
  admin: ['overview', 'users', 'verification', 'contracts', 'properties', 'payments', 'tickets', 'services', 'requests', 'appointments', 'integrations', 'gateways', 'content', 'roles', 'reports', 'notifications-admin', 'audit', 'settings', 'notifications', 'profile'],
};

let chrome;
try {
  const tokens = {};
  for (const [role, cfg] of Object.entries(ROLES)) {
    const j = jar(); const r = await call(j, 'POST', '/api/auth/login', { email: cfg.email, password: cfg.password });
    ok(r.status === 200, `${role} logs in for render check (got ${r.status})`);
    tokens[role] = j.token();
  }

  chrome = spawn('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${CDP}`, 'about:blank'], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});
  ok(await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok), 'DevTools endpoint up');

  for (const [role, cfg] of Object.entries(ROLES)) {
    const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(BASE + '/' + (cfg.page === 'app' ? 'app-screen.html' : 'dashboard.html'))}`, { method: 'PUT' })).json().catch(() => null);
    let wsUrl = tab && tab.webSocketDebuggerUrl;
    if (!wsUrl) { const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); wsUrl = list.find((x) => x.type === 'page').webSocketDebuggerUrl; }
    const c = cdp(wsUrl); await c.ready;
    await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Network.enable');
    await c.send('Network.setCookie', { name: 'ejari_session', value: tokens[role], domain: '127.0.0.1', path: '/', httpOnly: true });
    await c.send('Page.navigate', { url: BASE + '/' + (cfg.page === 'app' ? 'app-screen.html' : 'dashboard.html') });
    await sleep(2200);
    const ev = async (expression) => { const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };

    // make sure the client scripts are present, then render every declared view
    const shell = await ev('typeof V === "object" && typeof hydrate === "function"');
    ok(shell === true, `${role}: client scripts loaded in browser`);

    const res = await ev(`(() => {
      const out = [];
      const me = (curUser && curUser()) || DB.users.find(u => u.email === ${JSON.stringify(cfg.email)});
      S.role = ${JSON.stringify(role)}; S.uid = me ? String(me.id) : S.uid; S.page = ${JSON.stringify(cfg.page)}; S.modal = null;
      for (const v of ${JSON.stringify(VIEWS[role])}) {
        S.view = v;
        try { const html = String(View() || ''); out.push({ v, ok: true, len: html.length, html }); }
        catch (e) { out.push({ v, ok: false, err: String(e) }); }
      }
      return out;
    })()`);

    ok(Array.isArray(res) && res.length === VIEWS[role].length, `${role}: rendered ${VIEWS[role].length} views`, Array.isArray(res) ? res.length : String(res));
    for (const r of (res || [])) {
      ok(r.ok, `${role}/${r.v}: renders without throwing`, r.err);
      ok(r.len > 200, `${role}/${r.v}: produces real markup (${r.len} chars)`);
      const dbl = r.html && (r.html.includes('&amp;lt;') || r.html.includes('&amp;amp;') || r.html.includes('&amp;quot;'));
      ok(!dbl, `${role}/${r.v}: no double-escaping artifact`);
    }
    c.close();
    // close the tab we opened for this role
    if (tab && tab.id) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
} catch (e) { failed++; fails.push('EXCEPTION ' + e.message); console.error('✗ EXCEPTION', e); }
finally {
  if (chrome) chrome.kill(); server.kill();
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) { console.log(`✗ ${failed}/${checks} RENDER CHECKS FAILED`); for (const f of fails) console.log('  - ' + f); }
else console.log(`✓ All ${checks} render-integrity checks passed`);
process.exit(failed ? 1 : 0);
