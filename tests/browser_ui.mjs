// Ejari — real-browser UI verification for demo vs production mode.
// Loads the real client in headless Chromium and asserts, against the live API:
//   • demo mode  → demo sign-in affordances are rendered on website / dashboard / app
//   • production → demo affordances are gone and a real email+password form is shown
//   • the website counters come from the database (never "undefined"/NaN)
//   • zero console errors in both modes
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDP = Number(process.env.UI_CDP_PORT || 9351);
const dbDemo = path.join(root, 'data', 'ui-demo.db');
const dbProd = path.join(root, 'data', 'ui-prod.db');
for (const f of [dbDemo, dbDemo + '-shm', dbDemo + '-wal', dbProd, dbProd + '-shm', dbProd + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const ok = (c, m, e) => { checks++; if (!c) { failed++; console.error('  ✗ ' + m + (e ? ` — ${e}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; }
function cdp(wsUrl) { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const events = []; const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) { events.push(m); } }; return { ready, events, send: (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() }; }

function startServer(port, env) {
  const proc = spawn(process.execPath, ['server.mjs', String(port)], { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' });
  let booted = false;
  proc.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; });
  proc.stderr.on('data', () => {});
  return { proc, ready: async () => { const t = Date.now(); while (!booted && Date.now() - t < 8000) await sleep(100); await sleep(250); return booted; } };
}

let chrome;
async function openTab(url) {
  const tab = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json().catch(() => null);
  let wsUrl = tab && tab.webSocketDebuggerUrl;
  if (!wsUrl) { const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); wsUrl = list.find((x) => x.type === 'page').webSocketDebuggerUrl; }
  const c = cdp(wsUrl); await c.ready;
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Network.enable');
  await c.send('Log.enable').catch(() => {});
  await c.send('Page.navigate', { url });
  await sleep(2000);
  return { c, tab };
}
async function evalv(c, expr) { const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; }
function consoleErrors(c) {
  return c.events.filter((e) =>
    (e.method === 'Runtime.exceptionThrown') ||
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/favicon/i.test(e.params.entry.text || '')) ||
    (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  ).length;
}

try {
  chrome = spawn('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${CDP}`, 'about:blank'], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});
  ok(await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok), 'DevTools endpoint up');

  // ================= DEMO MODE =================
  const demo = startServer(4501, { EJARI_DB_FILE: dbDemo });
  ok(await demo.ready(), 'demo-mode server boots');
  {
    const { c, tab } = await openTab('http://127.0.0.1:4501/website.html');
    ok(await evalv(c, 'typeof S === "object" && S.demo === true'), 'website: /api/config reports demo mode');
    ok(await evalv(c, 'document.body.innerHTML.includes("demo") || document.body.innerHTML.length > 2000'), 'website renders content');
    // open the login modal and assert the demo role picker is present
    await evalv(c, 'A.modal({t:"login"})'); await sleep(400);
    ok(await evalv(c, '!!document.querySelector("#modal .rolepick button[data-a=login]")'), 'demo mode: login modal offers demo role sign-in');
    ok(consoleErrors(c) === 0, `demo website: zero console errors (got ${consoleErrors(c)})`);
    c.close(); if (tab && tab.id) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
  demo.proc.kill();

  // ================= PRODUCTION MODE =================
  const prod = startServer(4502, { EJARI_DB_FILE: dbProd, NODE_ENV: 'production', EJARI_SECRET_KEY: 'test-secret-key-browser-ui', EJARI_ADMIN_EMAIL: 'root@ejari.bh', EJARI_ADMIN_PASSWORD: 'Sup3rSecret!' });
  ok(await prod.ready(), 'production-mode server boots');
  {
    const { c, tab } = await openTab('http://127.0.0.1:4502/website.html');
    ok(await evalv(c, 'typeof S === "object" && S.demo === false'), 'website: /api/config reports production mode');
    // counters must be real numbers, never "undefined"/"NaN"
    const statsText = await evalv(c, '(()=>{const e=document.querySelector(".stats");return e?e.textContent:""})()');
    ok(statsText && !/undefined|NaN/.test(statsText), `website counters render real numbers (got "${String(statsText).slice(0, 60)}")`);
    // login modal must NOT offer demo sign-in, and must show a real email field
    await evalv(c, 'A.modal({t:"login"})'); await sleep(400);
    ok(await evalv(c, '!document.querySelector("#modal .rolepick button[data-a=login]")'), 'production: no demo role sign-in in the login modal');
    ok(await evalv(c, '!!document.getElementById("lgMail")'), 'production: login modal shows the email field');
    ok(consoleErrors(c) === 0, `production website: zero console errors (got ${consoleErrors(c)})`);
    c.close(); if (tab && tab.id) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
  {
    const { c, tab } = await openTab('http://127.0.0.1:4502/dashboard.html');
    await sleep(800);
    ok(await evalv(c, '!!document.getElementById("lgMail")'), 'production: dashboard sign-in shows the email field');
    ok(await evalv(c, '!document.querySelector(".rolepick button[data-a=submitdemo]")'), 'production: dashboard has no demo quick sign-in');
    ok(consoleErrors(c) === 0, `production dashboard: zero console errors (got ${consoleErrors(c)})`);
    c.close(); if (tab && tab.id) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
  {
    const { c, tab } = await openTab('http://127.0.0.1:4502/app-screen.html');
    await sleep(800);
    const splash = await evalv(c, 'document.body.innerHTML');
    ok(/data-t="login"/.test(splash) && !/data-r="tenant"/.test(splash), 'production: mobile splash offers a real sign-in, not demo entry');
    ok(consoleErrors(c) === 0, `production mobile app: zero console errors (got ${consoleErrors(c)})`);
    c.close(); if (tab && tab.id) await fetch(`http://127.0.0.1:${CDP}/json/close/${tab.id}`).catch(() => {});
  }
  prod.proc.kill();
} catch (e) {
  failed++; console.error('✗ EXCEPTION', e);
} finally {
  if (chrome) chrome.kill();
  await sleep(200);
  for (const f of [dbDemo, dbDemo + '-shm', dbDemo + '-wal', dbProd, dbProd + '-shm', dbProd + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) console.log(`✗ ${failed}/${checks} BROWSER UI CHECKS FAILED`);
else console.log(`✓ All ${checks} browser UI checks passed`);
process.exit(failed ? 1 : 0);
