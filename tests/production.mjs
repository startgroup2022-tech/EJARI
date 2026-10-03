// Ejari — production-mode verification.
// Boots the REAL server with NODE_ENV=production against a throwaway database and proves:
//   • no demo data / demo accounts are created, demo auth is 404, /api/config reports demo:false
//   • a super admin is bootstrapped from EJARI_ADMIN_EMAIL/EJARI_ADMIN_PASSWORD
//   • the full real scenario works end to end: user → login → property → tenant → contract → payment
//   • data survives logout/login AND a full server restart (real persistence)
//   • the admin IP allow-list is enforced server-side
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4477;
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', 'production-test.db');
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failed++; console.error('  ✗ ' + msg); } };

function jar() { const c = {}; return { save(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const s of [].concat(sc)) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); } }; }
async function call(cookies, method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(cookies && cookies.header() ? { Cookie: cookies.header() } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (cookies) cookies.save(res);
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const ADMIN_EMAIL = 'root@ejari.bh', ADMIN_PASS = 'Sup3rSecret!';
function startServer(extraEnv = {}) {
  const proc = spawn(process.execPath, ['server.mjs', String(PORT)], {
    cwd: root,
    env: { ...process.env, EJARI_DB_FILE: dbFile, NODE_ENV: 'production', EJARI_SECRET_KEY: 'test-secret-key-production', EJARI_ADMIN_EMAIL: ADMIN_EMAIL, EJARI_ADMIN_PASSWORD: ADMIN_PASS, ...extraEnv },
    stdio: 'pipe',
  });
  let booted = false;
  proc.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; });
  proc.stderr.on('data', () => {});
  return { proc, ready: async () => { const t = Date.now(); while (!booted && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 250)); return booted; } };
}

let server = startServer();
try {
  ok(await server.ready(), 'production server boots');

  // ---- 1. no demo surface ----
  {
    const cfg = await call(null, 'GET', '/api/config');
    ok(cfg.status === 200 && cfg.data && cfg.data.demo === false, `GET /api/config → demo:false (got ${JSON.stringify(cfg.data)})`);
    const demo = await call(null, 'POST', '/api/auth/demo', { role: 'admin' });
    ok(demo.status === 404, `demo auth disabled in production (got ${demo.status})`);
    const stats = await call(null, 'GET', '/api/stats');
    ok(stats.data && stats.data.properties === 0 && stats.data.contracts === 0 && stats.data.users === 1 && stats.data.transactions === 0,
      `empty production DB — only the bootstrap admin exists (got ${JSON.stringify(stats.data)})`);
  }

  // ---- 2. real admin sign-in ----
  const admin = jar();
  {
    const bad = await call(jar(), 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: 'wrong-password' });
    ok(bad.status === 401, `wrong password rejected (got ${bad.status})`);
    const good = await call(admin, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    ok(good.status === 200 && good.data.user.role === 'admin', `bootstrap admin can sign in (got ${good.status})`);
  }

  // ---- 3. full real scenario: property → tenant → contract → payment ----
  const landlord = jar();
  let unitId = null, contractId = null, tenantEmail = `tenant.${Date.now()}@example.bh`;
  {
    const r = await call(landlord, 'POST', '/api/auth/register', { role: 'landlord', name: 'Real Landlord', cpr: '123456789', phone: '+973 3900 0001', email: `landlord.${Date.now()}@example.bh`, password: 'Landlord#2026' });
    ok(r.status === 201, `landlord registers (got ${r.status})`);

    const p = await call(landlord, 'POST', '/api/properties', { name: 'Test Tower', area: 'muh', type: 'building', deed: 'MH-90001', units: 2 });
    ok(p.status === 201, `property created (got ${p.status})`);
    unitId = p.data.units[0].id;
    ok(!!unitId, 'property created real units');

    // tenant registers (becomes a real, persistent account)
    const t = await call(jar(), 'POST', '/api/auth/register', { role: 'tenant', name: 'Real Tenant', cpr: '987654321', phone: '+973 3900 0002', email: tenantEmail, password: 'Tenant#2026' });
    ok(t.status === 201, `tenant registers (got ${t.status})`);
    const tenantId = t.data.user.id;

    // admin verifies the tenant so they can be selected in a contract
    const v = await call(admin, 'POST', `/api/users/${tenantId}/verify`);
    ok(v.status === 200, `admin verifies tenant (got ${v.status})`);

    const c = await call(landlord, 'POST', '/api/contracts', { unitId, tenantId, start: '2026-11-01', months: 12, rent: 450, deposit: 450, dueDay: 5 });
    ok(c.status === 201, `contract created (got ${c.status})`);
    contractId = c.data.contract.id;

    // tenant signs, then pays the registration fee
    const tenantJar = jar();
    await call(tenantJar, 'POST', '/api/auth/login', { email: tenantEmail, password: 'Tenant#2026' });
    const s = await call(tenantJar, 'POST', `/api/contracts/${contractId}/sign`, { as: 'tenant' });
    ok(s.status === 200, `tenant signs the contract (got ${s.status})`);
    const boot = await call(tenantJar, 'GET', '/api/bootstrap');
    const fee = (boot.data.payments || []).find((p) => p.kind === 'fee');
    ok(!!fee, 'registration fee payment exists for the contract');
    const pay = await call(tenantJar, 'POST', `/api/payments/${fee.id}/pay`, { method: 'benefit' });
    ok(pay.status === 200 && pay.data.payment.status === 'paid' && !!pay.data.payment.receipt, `fee paid with a real receipt (got ${pay.status})`);
  }

  // ---- 4. logout → login again → data still there ----
  {
    await call(admin, 'POST', '/api/auth/logout');
    const me = await call(admin, 'GET', '/api/auth/me');
    ok(me.data.user === null, 'session cleared after logout');
    const admin2 = jar();
    await call(admin2, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    const boot = await call(admin2, 'GET', '/api/bootstrap');
    ok(boot.data.properties.some((p) => p.name.en === 'Test Tower'), 'property persisted after re-login');
    ok(boot.data.contracts.some((c) => c.id === contractId), 'contract persisted after re-login');
    ok(boot.data.payments.some((p) => p.status === 'paid' && p.receipt), 'payment persisted after re-login');
  }

  // ---- 5. restart the server → data survives on disk ----
  {
    server.proc.kill();
    await new Promise((r) => setTimeout(r, 400));
    const restarted = startServer();
    ok(await restarted.ready(), 'production server restarts');
    const admin3 = jar();
    const lg = await call(admin3, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    ok(lg.status === 200, `admin can sign in after restart (got ${lg.status})`);
    const boot = await call(admin3, 'GET', '/api/bootstrap');
    ok(boot.data.properties.some((p) => p.name.en === 'Test Tower'), 'property survived a full server restart');
    ok(boot.data.contracts.some((c) => c.id === contractId), 'contract survived a full server restart');
    ok(boot.data.payments.some((p) => p.status === 'paid'), 'payment survived a full server restart');
    server = restarted;
  }

  // ---- 6. admin IP allow-list enforced server-side ----
  {
    const admin4 = jar();
    await call(admin4, 'POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
    const set = await call(admin4, 'POST', '/api/settings', { adminIp: '10.9.9.9' });
    ok(set.status === 200, `admin IP allow-list saved (got ${set.status})`);
    const blocked = await call(admin4, 'GET', '/api/bootstrap');
    ok(blocked.status === 403 && blocked.data.error === 'ip_not_allowed', `admin request from a non-listed IP is refused (got ${blocked.status})`);
    // clear the setting directly at the database, then confirm access is restored
    const raw = new DatabaseSync(dbFile);
    raw.prepare("DELETE FROM settings WHERE key='admin_ip_allowlist'").run();
    raw.close();
    const restored = await call(admin4, 'GET', '/api/bootstrap');
    ok(restored.status === 200, `admin access restored once the allow-list is cleared (got ${restored.status})`);
  }

  // ---- PWA assets are publicly served so the app is genuinely installable ----
  for (const f of ['sw.js', 'manifest.webmanifest', 'assets/js/pwa.js']) {
    const r = await fetch(`${BASE}/${f}`);
    ok(r.status === 200, `${f} is served in production (got ${r.status})`);
  }
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  ok(manifest.start_url && manifest.icons && manifest.icons.length > 0, 'manifest declares a start_url and icons');

  // ---- fail fast without EJARI_SECRET_KEY: production must not encrypt with a public default ----
  {
    const noKey = spawn(process.execPath, ['server.mjs', String(PORT + 1)], {
      cwd: root,
      env: { ...process.env, EJARI_DB_FILE: dbFile, NODE_ENV: 'production', EJARI_SECRET_KEY: '', EJARI_ADMIN_EMAIL: ADMIN_EMAIL, EJARI_ADMIN_PASSWORD: ADMIN_PASS },
      stdio: 'pipe',
    });
    let out = '', booted = false;
    noKey.stdout.on('data', (d) => { out += String(d); if (String(d).includes('running')) booted = true; });
    noKey.stderr.on('data', (d) => { out += String(d); });
    const exited = await new Promise((res) => { const t = setTimeout(() => res(false), 6000); noKey.on('exit', () => { clearTimeout(t); res(true); }); });
    ok(exited && !booted, 'production refuses to start without EJARI_SECRET_KEY');
    ok(/EJARI_SECRET_KEY/.test(out), 'the boot error names the missing EJARI_SECRET_KEY');
    try { noKey.kill(); } catch {}
  }
} catch (e) {
  failed++; console.error('✗ EXCEPTION', e);
} finally {
  try { server.proc.kill(); } catch {}
  await new Promise((r) => setTimeout(r, 200));
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) console.log(`✗ ${failed}/${checks} PRODUCTION CHECKS FAILED`);
else console.log(`✓ All ${checks} production-mode checks passed`);
process.exit(failed ? 1 : 0);
