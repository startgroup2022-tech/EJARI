// Ejari — real-browser stored-XSS verification.
// Starts the real server, stores XSS payloads through the real API as a tenant, then opens the
// real app shell in headless Chromium with the landlord's session and asserts that NOTHING
// executes. Uses the Chrome DevTools Protocol over Node's built-in WebSocket — no npm deps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.XSS_PORT || 4402);
const CDP = Number(process.env.CDP_PORT || 9333);
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', `xss-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const fails = [];
const ok = (cond, msg, extra) => {
  checks++;
  if (!cond) { failed++; fails.push(msg + (extra ? ` — ${extra}` : '')); console.error('  ✗ ' + msg + (extra ? ` — ${extra}` : '')); }
};

const PAYLOADS = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=2</script>',
  '<svg onload="window.__xss=3"></svg>',
  '"><script>window.__xss=4</script>',
];

function jar() { const c = {}; return { save(r) { const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; for (const s of [].concat(sc)) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); }, token: () => c.ejari_session }; }
async function call(cookies, method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(cookies && cookies.header() ? { Cookie: cookies.header() } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (cookies) cookies.save(res);
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

// ---- minimal CDP client over the built-in WebSocket ----
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = (e) => rej(new Error('ws error')); });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }

process.env.EJARI_DB_FILE = dbFile;
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
let booted = false;
server.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; });
server.stderr.on('data', () => {});
await waitFor(() => booted);

let chrome;
try {
  // ---- store the payloads through the real API ----
  const t = jar(); await call(t, 'POST', '/api/auth/demo', { role: 'tenant' });
  const l = jar(); await call(l, 'POST', '/api/auth/demo', { role: 'landlord' });
  const lboot = (await call(l, 'GET', '/api/bootstrap')).data;
  const landlordId = lboot.me.id;
  const landlordToken = l.token();
  ok(!!landlordToken, 'landlord session token captured');

  for (const p of PAYLOADS) {
    const r = await call(t, 'POST', '/api/maintenance', { title: p, category: 'other', priority: 'normal' });
    ok(r.status === 201, `payload stored via API: ${p.slice(0, 24)}… (got ${r.status})`);
  }
  // a property name payload too (landlord-owned, rendered in lists)
  await call(l, 'POST', '/api/properties', { name: PAYLOADS[0], area: 'muh', type: 'building', deed: PAYLOADS[1], units: 1 });

  // ---- launch headless Chromium and drive it over CDP ----
  chrome = spawn('chromium', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP}`, 'about:blank',
  ], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});

  const targetOk = await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP}/json/version`);
    return r.ok;
  }, 20000);
  ok(targetOk, 'headless Chromium exposed the DevTools endpoint');

  // open a fresh tab on the app origin
  const newTab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(BASE + '/app-screen.html')}`, { method: 'PUT' })).json().catch(() => null);
  let wsUrl = newTab && newTab.webSocketDebuggerUrl;
  if (!wsUrl) {
    const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
    const page = list.find((x) => x.type === 'page');
    wsUrl = page && page.webSocketDebuggerUrl;
  }
  ok(!!wsUrl, 'obtained a page target websocket');

  const c = cdp(wsUrl);
  await c.ready;
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Network.enable');

  // give the browser the landlord session cookie (HttpOnly, so it must be set via CDP)
  await c.send('Network.setCookie', { name: 'ejari_session', value: landlordToken, domain: '127.0.0.1', path: '/', httpOnly: true });
  await c.send('Page.navigate', { url: BASE + '/app-screen.html' });
  await sleep(2500);

  const evalJs = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
    return { value: r.result && r.result.result ? r.result.result.value : undefined };
  };

  // the app auto-restores the session; force the maintenance view for the landlord
  const render = await evalJs(`(() => {
    try {
      const me = DB.users.find(u => String(u.id) === String('${landlordId}')) || DB.users[0];
      S.role = 'landlord'; S.uid = String('${landlordId}'); S.page = 'app'; S.view = 'maintenance';
      if (typeof render === 'function') render();
      return { ok: true, html: document.body.innerHTML.length, role: S.role };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  ok(render.value && render.value.ok, 'rendered the landlord maintenance view in the browser', JSON.stringify(render.value || render.error));

  // let any inline handler have a chance to fire
  await sleep(1200);

  const xss = await evalJs('window.__xss === undefined ? null : window.__xss');
  ok(xss.value === null || xss.value === undefined, `no injected script executed (window.__xss=${JSON.stringify(xss.value)})`);

  const dom = await evalJs('document.body.innerHTML');
  const html = String(dom.value || '');
  // the payload must be present as inert text, never as a live element
  const hasLiveImg = /<img[^>]+onerror/i.test(html);
  const hasLiveSvg = /<svg[^>]+onload/i.test(html);
  const hasLiveScript = /<script>window\.__xss/i.test(html);
  ok(!hasLiveImg, 'no live <img onerror> element in the rendered DOM');
  ok(!hasLiveSvg, 'no live <svg onload> element in the rendered DOM');
  ok(!hasLiveScript, 'no live injected <script> element in the rendered DOM');
  // and the escaped form IS present (proves the payload was actually rendered, just inert)
  const escapedPresent = /&lt;(img|script|svg)/.test(html) || /onerror=&quot;/.test(html);
  ok(escapedPresent, 'the payload is rendered as escaped text (not dropped)');

  // verify the page itself loaded its real scripts (sanity: we really are on the app)
  const shell = await evalJs('typeof V !== "undefined" && typeof hydrate === "function"');
  ok(shell.value === true, 'the real client scripts are loaded in the browser');

  c.close();
} catch (e) {
  failed++; fails.push('EXCEPTION ' + e.message);
  console.error('✗ EXCEPTION', e);
} finally {
  if (chrome) chrome.kill();
  server.kill();
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) { console.log(`✗ ${failed}/${checks} BROWSER XSS CHECKS FAILED`); for (const f of fails) console.log('  - ' + f); }
else console.log(`✓ All ${checks} real-browser XSS checks passed`);
process.exit(failed ? 1 : 0);
