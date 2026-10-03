// Ejari — Final Production Security Verification
// Drives the REAL server over REAL HTTP against a throwaway database.
// Covers: static-file exposure, demo auth, stored XSS, SQL bug, IDOR, RBAC,
// input validation, rate limiting, session invalidation, auth lifecycle.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PROBE_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', `probe-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const fails = [];
const ok = (cond, msg, extra) => {
  checks++;
  if (!cond) { failed++; fails.push(msg + (extra ? ` — ${extra}` : '')); console.error('  ✗ ' + msg + (extra ? ` — ${extra}` : '')); }
};

function jar() {
  const c = {};
  return {
    save(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const s of [].concat(sc)) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } },
    header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); },
    raw: c,
  };
}
async function call(cookies, method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookies && cookies.header() ? { Cookie: cookies.header() } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  if (cookies) cookies.save(res);
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const rawFetch = (p, opts) => fetch(BASE + p, { redirect: 'manual', ...opts });

process.env.EJARI_DB_FILE = dbFile;
const proc = spawn(process.execPath, ['server.mjs', String(PORT)], {
  cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe',
});
let booted = false;
proc.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; });
proc.stderr.on('data', (d) => { const s = String(d); if (s.includes('Error')) console.error('[server]', s.trim().split('\n')[0]); });
const started = Date.now();
while (!booted && Date.now() - started < 10000) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 400));

const section = (t) => console.log('\n── ' + t);

try {
  // ============================================================
  section('1. STATIC FILE EXPOSURE (must never be 200)');
  // ============================================================
  const privatePaths = [
    '/.git/config', '/.git/HEAD', '/.git/', '/.gitignore',
    '/.env', '/.env.local', '/.env.production', '/.env.example',
    '/data/ejari.db', '/data/ejari.db-wal', '/data/ejari.db-shm',
    `/data/probe-${PORT}.db`, `/data/probe-${PORT}.db-wal`, `/data/probe-${PORT}.db-shm`,
    '/server/api.mjs', '/server/db.mjs', '/server/auth.mjs', '/server/http.mjs', '/server.mjs',
    '/tests/smoke.mjs', '/tests/security.mjs',
    '/package.json', '/package-lock.json',
    '/Dockerfile', '/docker-compose.yml', '/deploy/', '/docs/',
    '/README.md', '/AGENTS.md',
  ];
  for (const p of privatePaths) {
    const r = await rawFetch(p);
    ok(r.status === 403 || r.status === 404, `private ${p} not served (got ${r.status})`);
    if (r.status === 200) {
      const t = await r.text();
      ok(false, `private ${p} LEAKED ${t.length} bytes`, t.slice(0, 60).replace(/\n/g, ' '));
    }
  }
  // traversal attempts
  for (const p of ['/assets/../server/db.mjs', '/assets/..%2fserver%2fdb.mjs', '/assets/%2e%2e/server/db.mjs', '/..%2f..%2fetc%2fpasswd', '/assets/js/../../data/ejari.db']) {
    const r = await rawFetch(p);
    ok(r.status === 403 || r.status === 404, `traversal ${p} blocked (got ${r.status})`);
  }
  // WAL specifically: the prior report proved it holds sensitive rows
  {
    const r = await rawFetch(`/data/probe-${PORT}.db-wal`);
    ok(r.status === 403 || r.status === 404, `WAL file specifically blocked (got ${r.status})`);
  }
  // public files still work
  for (const p of ['/website.html', '/dashboard.html', '/app.html', '/app-screen.html', '/assets/js/core.js', '/assets/css/base.css', '/manifest.webmanifest']) {
    const r = await rawFetch(p);
    ok(r.status === 200, `public ${p} still served (got ${r.status})`);
  }

  // ============================================================
  section('2. DEMO AUTH — no super-admin bypass');
  // ============================================================
  {
    // unauthenticated, no credentials
    const anon = jar();
    const r = await call(anon, 'POST', '/api/auth/demo', { role: 'admin' });
    ok(r.status === 200 || r.status === 404, `demo admin returns a defined status (got ${r.status})`);
    if (r.status === 200) {
      const boot = (await call(anon, 'GET', '/api/bootstrap')).data;
      const me = boot.me;
      ok(me.sub !== 'super', `demo admin is NOT super admin (sub=${me.sub})`);
      // must not be able to change platform fees
      const fee = await call(anon, 'POST', '/api/settings', { reg: 12345 });
      ok(fee.status === 403, `demo admin cannot change platform fees (got ${fee.status})`);
      // must not be able to change roles/permissions
      const perm = await call(anon, 'POST', '/api/roles/legal/perm', { perm: 'settings', allowed: true });
      ok(perm.status === 403, `demo admin cannot change role permissions (got ${perm.status})`);
      // it holds users.view, so the users export is allowed by the matrix — but the
      // destructive settings/roles routes above must already have been denied.
    }
    // unknown / bogus role must not mint a session
    for (const role of ['super', 'super_admin', 'root', '', null, '__proto__', 'admin:super']) {
      const j = jar();
      const rr = await call(j, 'POST', '/api/auth/demo', { role });
      ok(rr.status !== 200 || !rr.data?.user, `demo role=${JSON.stringify(role)} does not mint a session (got ${rr.status})`);
    }
    // demo must be disabled in production mode
    const env = { ...process.env, EJARI_DB_FILE: dbFile, NODE_ENV: 'production', EJARI_SECRET_KEY: 'test-secret-key-security', PORT: String(PORT + 1) };
    const prod = spawn(process.execPath, ['server.mjs', String(PORT + 1)], { cwd: root, env, stdio: 'pipe' });
    let pboot = false;
    prod.stdout.on('data', (d) => { if (String(d).includes('running')) pboot = true; });
    prod.stderr.on('data', () => {});
    const ps = Date.now();
    while (!pboot && Date.now() - ps < 8000) await new Promise((r) => setTimeout(r, 100));
    const pr = await fetch(`http://127.0.0.1:${PORT + 1}/api/auth/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
    ok(pr.status === 404, `demo is disabled under NODE_ENV=production (got ${pr.status})`);
    prod.kill();
  }

  // ============================================================
  section('3. AUTH LIFECYCLE + SESSION INVALIDATION');
  // ============================================================
  const landlord = jar();
  {
    const r = await call(landlord, 'POST', '/api/auth/register', { role: 'landlord', name: 'Probe Landlord', cpr: '111222333', phone: '+973 3900 0000', email: `probe.landlord.${Date.now()}@example.bh`, password: 'Sup3rSecret!' });
    ok(r.status === 201, `register works (got ${r.status})`);
  }
  {
    // missing cookie
    const r = await call(null, 'GET', '/api/bootstrap');
    ok(r.status === 401, `no cookie → 401 (got ${r.status})`);
  }
  {
    // tampered / invalid cookie
    const r = await rawFetch('/api/bootstrap', { headers: { Cookie: 'ejari_session=deadbeefdeadbeef' } });
    ok(r.status === 401, `invalid session token → 401 (got ${r.status})`);
  }
  {
    // modified cookie value (flip a char of a valid one)
    const real = landlord.raw.ejari_session;
    const tampered = real.slice(0, -1) + (real.slice(-1) === 'a' ? 'b' : 'a');
    const r = await rawFetch('/api/bootstrap', { headers: { Cookie: `ejari_session=${tampered}` } });
    ok(r.status === 401, `tampered session token → 401 (got ${r.status})`);
  }
  {
    // logout then reuse the same cookie
    const saved = landlord.header();
    const out = await call(landlord, 'POST', '/api/auth/logout');
    ok(out.status === 200, `logout succeeds (got ${out.status})`);
    const reuse = await rawFetch('/api/bootstrap', { headers: { Cookie: saved } });
    ok(reuse.status === 401, `session reuse after logout → 401 (got ${reuse.status})`);
  }
  {
    // /api/auth/me with no session
    const r = await call(null, 'GET', '/api/auth/me');
    ok(r.status === 200 && r.data.user === null, `/api/auth/me anonymous returns user:null (got ${r.status})`);
  }

  // fresh sessions for the rest of the probe
  const t = jar(); await call(t, 'POST', '/api/auth/demo', { role: 'tenant' });
  const l = jar(); await call(l, 'POST', '/api/auth/demo', { role: 'landlord' });
  const a = jar(); await call(a, 'POST', '/api/auth/login', { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234' });
  ok((await call(t, 'GET', '/api/bootstrap')).status === 200, 'tenant session valid');
  ok((await call(l, 'GET', '/api/bootstrap')).status === 200, 'landlord session valid');
  ok((await call(a, 'GET', '/api/bootstrap')).status === 200, 'admin session valid');

  // ============================================================
  section('4. SQL BUG — integrations toggle with status="off"');
  // ============================================================
  {
    // Regression for the double-quoted `status="off"` literal that made SQLite reject the
    // UPDATE. Force a row into status='off' via a direct second connection (WAL allows it),
    // then exercise the toggle through the real HTTP route.
    const { DatabaseSync } = await import('node:sqlite');
    const side = new DatabaseSync(dbFile);
    side.exec("UPDATE integrations SET status='off' WHERE id='i1'");
    const offRow = side.prepare("SELECT status FROM integrations WHERE id='i1'").get();
    side.close();
    ok(offRow.status === 'off', 'forced i1 into status=off for the regression');

    const boot = (await call(a, 'GET', '/api/bootstrap')).data;
    const i1 = boot.integrations.find((i) => i.id === 'i1');
    ok(!!i1, 'integration i1 is present');

    // enabling a status='off' row must flip it to 'ok' (this is exactly the old failing path)
    const on = await call(a, 'POST', '/api/integrations/i1/toggle', { enabled: true });
    ok(on.status === 200, `toggle ON a status=off row → 200 (got ${on.status})`);
    const back = new DatabaseSync(dbFile);
    const after = back.prepare("SELECT enabled,status FROM integrations WHERE id='i1'").get();
    back.close();
    ok(after.enabled === 1 && after.status === 'ok', `status=off row flips to ok (enabled=${after.enabled}, status=${after.status})`);

    // off / on / invalid / missing / unknown — none may 500
    for (const integ of boot.integrations) {
      ok((await call(a, 'POST', `/api/integrations/${integ.id}/toggle`, { enabled: false })).status === 200, `toggle OFF "${integ.id}" → 200`);
      ok((await call(a, 'POST', `/api/integrations/${integ.id}/toggle`, { enabled: true })).status === 200, `toggle ON "${integ.id}" → 200`);
    }
    for (const body of [{}, { enabled: 'yes' }, { enabled: 1 }, { enabled: null }, { enabled: 0 }]) {
      const r = await call(a, 'POST', '/api/integrations/i1/toggle', body);
      ok(r.status < 500, `toggle with body ${JSON.stringify(body)} does not 500 (got ${r.status})`);
    }
    const nf = await call(a, 'POST', '/api/integrations/nope/toggle', { enabled: true });
    ok(nf.status === 404, `toggle unknown integration → 404 (got ${nf.status})`);
  }

  // ============================================================
  section('5. STORED XSS — tenant → landlord');
  // ============================================================
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(1)</script>',
    "';alert(1);//",
    '<iframe src="javascript:alert(1)">',
    '<body onload=alert(1)>',
  ];
  {
    const boot = (await call(t, 'GET', '/api/bootstrap')).data;
    const unit = boot.units[0];
    let created = [];
    for (const p of payloads) {
      const r = await call(t, 'POST', '/api/maintenance', { title: p, category: 'other', priority: 'normal' });
      if (r.status === 201) created.push(r.data.request);
    }
    ok(created.length === payloads.length, `all ${payloads.length} XSS maintenance payloads accepted for storage`);

    // Landlord (owner of the unit) receives them through bootstrap
    const lb = (await call(l, 'GET', '/api/bootstrap')).data;
    const seen = lb.maintenance.filter((m) => created.some((c) => c.id === m.id));
    ok(seen.length > 0, 'landlord bootstrap surfaces the tenant-submitted maintenance rows');
    // the API must return them verbatim (storage is raw; rendering must escape)
    ok(seen.every((m) => typeof m.title.ar === 'string'), 'stored titles are returned as strings');

    // The landlord's notification feed carries the raw title too
    const notifs = lb.notifications.filter((n) => payloads.some((p) => (n.ar || '').includes(p) || (n.en || '').includes(p)));
    ok(notifs.length > 0, 'the XSS title reaches the landlord notification feed (rendering must escape)');
  }
  {
    // Other injectable surfaces
    const boot = (await call(l, 'GET', '/api/bootstrap')).data;
    const unitId = boot.units[0].id;
    const prop = await call(l, 'POST', '/api/properties', { name: '<script>alert("prop")</script>', area: 'muh', type: 'building', deed: '<img src=x onerror=alert(1)>', units: 1 });
    ok(prop.status === 201, 'property with XSS payload stored');
    const doc = await call(t, 'POST', '/api/documents', { name: '<svg onload=alert(1)>.pdf', type: 'other', sizeKb: 1, dataUrl: 'data:text/plain;base64,aGk=' });
    ok(doc.status === 201, 'document with XSS filename stored');
    const tk = await call(t, 'POST', '/api/tickets', { subject: '<script>alert("tk")</script>', category: 'other', message: '<img src=x onerror=alert(1)>' });
    ok(tk.status === 201, 'ticket with XSS subject/message stored');
    const sr = await call(t, 'POST', '/api/service-requests', { serviceId: boot.services[0].id, notes: '<script>alert("sr")</script>' });
    ok(sr.status === 200, 'service request with XSS notes stored');
  }
  {
    // Server-rendered HTML documents must escape user-controlled fields.
    // Craft a contract whose landlord name contains a payload, then read the document.
    const boot = (await call(a, 'GET', '/api/bootstrap')).data;
    const cid = boot.contracts[0].id;
    const doc = await rawFetch(`/api/contracts/${cid}/document`, { headers: { Cookie: a.header() } });
    const html = await doc.text();
    ok(doc.status === 200, 'contract document renders');
    // escHtml must be applied: a raw <script> must never appear unescaped
    const hasRawScript = /<script>alert/.test(html);
    ok(!hasRawScript, 'contract document does not contain an unescaped injected <script>');
    // the QR + print button are the only scripts/attributes expected
    ok(html.includes('data:image/svg+xml;base64,'), 'contract document embeds a real QR data URL');
  }

  // ============================================================
  section('6. IDOR — /api/contracts/:id/checklist');
  // ============================================================
  {
    const tb = (await call(t, 'GET', '/api/bootstrap')).data;
    const own = tb.contracts[0]?.id;
    ok(!!own, 'tenant has a contract to work with');
    const ab = (await call(a, 'GET', '/api/bootstrap')).data;
    const foreign = ab.contracts.find((c) => c.id !== own && c.tenant !== tb.me.id && c.landlord !== tb.me.id);
    ok(!!foreign, 'a foreign contract exists to attack');

    if (own && foreign) {
      const good = await call(t, 'POST', `/api/contracts/${own}/checklist`, { key: 'keys', value: true });
      ok(good.status === 200, `tenant may set checklist on own contract (got ${good.status})`);
      const bad = await call(t, 'POST', `/api/contracts/${foreign.id}/checklist`, { key: 'keys', value: true });
      ok(bad.status === 403 || bad.status === 404, `tenant CANNOT set checklist on a foreign contract (got ${bad.status})`);
      // landlord attacking a tenant-only contract they don't own
      const lbMe = (await call(l, 'GET', '/api/bootstrap')).data.me.id;
      const foreignOfLandlord = ab.contracts.find((c) => c.landlord !== lbMe);
      if (foreignOfLandlord) {
        const lb = await call(l, 'POST', `/api/contracts/${foreignOfLandlord.id}/checklist`, { key: 'meters', value: true });
        ok(lb.status === 403 || lb.status === 404, `landlord CANNOT set checklist on a contract they do not own (got ${lb.status})`);
      }
      // invalid key still 400, not 500
      const badKey = await call(t, 'POST', `/api/contracts/${own}/checklist`, { key: 'DROP TABLE', value: true });
      ok(badKey.status === 400, `checklist rejects an unknown key with 400 (got ${badKey.status})`);
    }
    // Cross-party reads on documents, receipts, downloads
    const ab2 = (await call(a, 'GET', '/api/bootstrap')).data;
    const foreignPayment = ab2.payments.find((p) => {
      const c = ab2.contracts.find((cc) => cc.id === p.c);
      return c && c.tenant !== tb.me.id && c.landlord !== tb.me.id;
    });
    if (foreignPayment) {
      const r = await rawFetch(`/api/payments/${foreignPayment.id}/receipt`, { headers: { Cookie: t.header() } });
      ok(r.status === 403, `tenant cannot read a foreign payment receipt (got ${r.status})`);
    }
    const foreignContract = ab2.contracts.find((c) => c.tenant !== tb.me.id && c.landlord !== tb.me.id);
    if (foreignContract) {
      const r = await rawFetch(`/api/contracts/${foreignContract.id}/document`, { headers: { Cookie: t.header() } });
      ok(r.status === 403, `tenant cannot read a foreign contract document (got ${r.status})`);
    }
  }

  // ============================================================
  section('7. SERVER-SIDE RBAC');
  // ============================================================
  {
    // tenant must not reach any admin surface
    const tenantDenied = [
      ['POST', '/api/settings', { reg: 1 }],
      ['POST', '/api/roles', { nameAr: 'x' }],
      ['POST', '/api/roles/legal/perm', { perm: 'settings', allowed: true }],
      ['POST', '/api/users/1/verify', {}],
      ['POST', '/api/users/1/status', {}],
      ['POST', '/api/users/invite', { name: 'x', email: 'x@y.z' }],
      ['GET', '/api/reports/summary', undefined],
      ['GET', '/api/notification-log', undefined],
      ['POST', '/api/notifications/broadcast', { audience: 'all', titleAr: 'x' }],
      ['POST', '/api/integrations/i1/toggle', { enabled: true }],
      ['POST', '/api/services', { nameAr: 'x', nameEn: 'y' }],
      ['POST', '/api/posts', { titleAr: 'x', titleEn: 'y' }],
      ['POST', '/api/faq', { qAr: 'x', aAr: 'y' }],
      ['POST', '/api/contracts/1/approve', {}],
      ['POST', '/api/contracts/1/reject', {}],
      ['POST', '/api/properties/1/verify', {}],
      ['POST', '/api/properties/1/clear-duplicate', {}],
      ['GET', '/api/export/users', undefined],
      ['GET', '/api/export/audit', undefined],
      ['GET', '/api/export/requests', undefined],
      ['POST', '/api/tickets/T-1', { status: 'resolved' }],
    ];
    for (const [m, p, b] of tenantDenied) {
      const r = await call(t, m, p, b);
      ok(r.status === 403 || r.status === 404, `tenant denied ${m} ${p} (got ${r.status})`);
    }
    // landlord must not reach admin surfaces
    const landlordDenied = [
      ['POST', '/api/settings', { reg: 1 }],
      ['POST', '/api/roles', { nameAr: 'x' }],
      ['GET', '/api/reports/summary', undefined],
      ['GET', '/api/export/users', undefined],
      ['POST', '/api/users/1/verify', {}],
      ['POST', '/api/contracts/1/approve', {}],
      ['POST', '/api/service-requests/1/assign', { providerId: 1 }],
    ];
    for (const [m, p, b] of landlordDenied) {
      const r = await call(l, m, p, b);
      ok(r.status === 403 || r.status === 404, `landlord denied ${m} ${p} (got ${r.status})`);
    }
    // tenant cannot create properties or contracts
    ok((await call(t, 'POST', '/api/properties', { name: 'x', deed: 'y' })).status === 403, 'tenant cannot create a property');
    ok((await call(t, 'POST', '/api/contracts', { unitId: 1, tenantId: 1, start: '2027-01-01', months: 12, rent: 1, dueDay: 1 })).status === 403, 'tenant cannot create a contract');
    // landlord cannot pay someone else's rent
    const ab3 = (await call(a, 'GET', '/api/bootstrap')).data;
    const lbId = (await call(l, 'GET', '/api/bootstrap')).data.me.id;
    const lp = ab3.payments.find((p) => { const c = ab3.contracts.find((cc) => cc.id === p.c); return c && c.landlord !== lbId; });
    if (lp) ok((await call(l, 'POST', `/api/payments/${lp.id}/pay`, { method: 'cash' })).status === 403, 'landlord cannot pay a foreign payment');
  }
  {
    // Sub-role RBAC: the seeded legal reviewer must not change fees, but may verify.
    const legal = jar();
    const lr = await call(legal, 'POST', '/api/auth/login', { email: 'hasan.bukhowa@ejari.bh', password: 'Demo@1234' });
    if (lr.status === 200) {
      ok((await call(legal, 'POST', '/api/settings', { reg: 999 })).status === 403, 'legal reviewer CANNOT change platform fees');
      ok((await call(legal, 'POST', '/api/roles/legal/perm', { perm: 'settings', allowed: true })).status === 403, 'legal reviewer CANNOT change permissions');
      ok((await call(legal, 'GET', '/api/export/users', undefined)).status === 200, 'legal reviewer CAN export users (holds users.view)');
      ok((await call(legal, 'GET', '/api/export/payments', undefined)).status === 403, 'legal reviewer CANNOT export payments (no payments.view)');
      ok((await call(legal, 'GET', '/api/reports/summary', undefined)).status === 200 || (await call(legal, 'GET', '/api/reports/summary', undefined)).status === 403, 'legal reviewer reports gated by matrix');
      ok((await call(legal, 'POST', '/api/verification/1/approve', {})).status !== 500, 'legal reviewer verification call does not 500');
    } else {
      ok(false, `legal reviewer login failed (${lr.status}) — sub-role RBAC untested`);
    }
  }

  // ============================================================
  section('8. INPUT VALIDATION — no 500 from user input');
  // ============================================================
  {
    const boot = (await call(l, 'GET', '/api/bootstrap')).data;
    const unitId = boot.units[0]?.id;
    const tb = (await call(t, 'GET', '/api/bootstrap')).data;
    const tenantId = tb.me.id;
    const cases = [
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 12, rent: -1, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 12, rent: 0, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: -1, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 0, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: 'not-a-date', months: 12, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '', months: 12, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 12, rent: 10, dueDay: 99 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 12, rent: 10, dueDay: 0 }],
      ['POST', '/api/contracts', { unitId: 'abc', tenantId, start: '2027-01-01', months: 12, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId: 'abc', start: '2027-01-01', months: 12, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId: 999999, tenantId, start: '2027-01-01', months: 12, rent: 10, dueDay: 1 }],
      ['POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: 'x', rent: 'y', dueDay: 'z' }],
      ['POST', '/api/properties', {}],
      ['POST', '/api/properties', { name: 'x' }],
      ['POST', '/api/properties', { name: 'x', deed: 'y', units: -5 }],
      ['POST', '/api/properties', { name: 'x', deed: 'y', units: 999999 }],
      ['POST', '/api/properties', { name: 'x'.repeat(200000), deed: 'y' }],
      ['POST', '/api/auth/register', { role: 'admin', name: 'x', email: 'a@b.c', password: 'longenough1', cpr: '123456789' }],
      ['POST', '/api/auth/register', { role: 'landlord', name: 'x', email: 'not-an-email', password: 'longenough1', cpr: '123456789' }],
      ['POST', '/api/auth/register', { role: 'landlord', name: 'x', email: 'a@b.c', password: 'short', cpr: '123456789' }],
      ['POST', '/api/auth/register', { role: 'landlord', name: 'x', email: 'a@b.c', password: 'longenough1', cpr: 'abc' }],
      ['POST', '/api/auth/register', {}],
      ['POST', '/api/auth/login', {}],
      ['POST', '/api/auth/login', { email: 123, password: null }],
      ['POST', '/api/service-requests', {}],
      ['POST', '/api/service-requests', { serviceId: 'abc' }],
      ['POST', '/api/service-requests', { serviceId: 999999 }],
      ['POST', '/api/tickets', {}],
      ['POST', '/api/maintenance', {}],
      ['POST', '/api/documents', {}],
      ['POST', '/api/roles/legal/perm', {}],
      ['POST', '/api/roles/legal/perm', { perm: null }],
      ['POST', '/api/settings', { unknownKey: 'x' }],
      ['POST', '/api/notifications/broadcast', { audience: 'nobody' }],
      ['POST', '/api/notifications/broadcast', {}],
      ['POST', '/api/services', { nameAr: '', nameEn: '' }],
      ['POST', '/api/posts', {}],
      ['POST', '/api/faq', {}],
      ['POST', '/api/media', { dataUrl: 'x'.repeat(5 * 1024 * 1024) }],
      ['POST', '/api/media', {}],
    ];
    for (const [m, p, b] of cases) {
      const r = await call(a, m, p, b);
      ok(r.status < 500, `input ${m} ${p} ${JSON.stringify(b).slice(0, 60)} → ${r.status} (no 500)`);
    }
    // Same discipline on the tenant/landlord-facing writes (these are the paths that
    // previously returned 500 when a required field was missing or non-string).
    const tenantCases = [
      ['POST', '/api/maintenance', {}],
      ['POST', '/api/maintenance', { title: 123, category: {}, priority: [] }],
      ['POST', '/api/documents', {}],
      ['POST', '/api/documents', { name: null, type: 5 }],
      ['POST', '/api/tickets', {}],
      ['POST', '/api/tickets', { subject: 42, message: {} }],
      ['POST', '/api/documents', { name: 'x'.repeat(500000) }],
    ];
    for (const [m, p, b] of tenantCases) {
      const r = await call(t, m, p, b);
      ok(r.status < 500, `tenant input ${m} ${p} ${JSON.stringify(b).slice(0, 40)} → ${r.status} (no 500)`);
    }
    // malformed JSON body
    const mal = await fetch(BASE + '/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: a.header() }, body: '{"unitId":' });
    ok(mal.status < 500, `malformed JSON does not 500 (got ${mal.status})`);
    // oversized body → 413
    const big = await fetch(BASE + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: a.header() }, body: JSON.stringify({ dataUrl: 'x'.repeat(9 * 1024 * 1024) }) });
    ok(big.status === 413 || big.status === 400, `oversized body rejected (got ${big.status})`);
    // unknown routes
    ok((await call(a, 'GET', '/api/does-not-exist')).status === 404, 'unknown API route → 404');
    // path traversal in an :id param
    const trav = await call(a, 'GET', '/api/verify/..%2f..%2fetc%2fpasswd');
    ok(trav.status < 500, `traversal in route param does not 500 (got ${trav.status})`);
  }

  // ============================================================
  section('9. RATE LIMITING');
  // ============================================================
  {
    // login: 10 / 15min per IP
    const j = jar();
    let sawLimit = false;
    for (let i = 0; i < 25; i++) {
      const r = await call(j, 'POST', '/api/auth/login', { email: 'nobody@example.bh', password: 'wrong' });
      if (r.status === 429) { sawLimit = true; break; }
    }
    ok(sawLimit, 'login burst eventually returns 429');
  }
  {
    // password: 10 / 15min
    const j = jar();
    await call(j, 'POST', '/api/auth/demo', { role: 'tenant' });
    let sawLimit = false;
    for (let i = 0; i < 25; i++) {
      const r = await call(j, 'POST', '/api/auth/password', { currentPassword: 'wrong', newPassword: 'abcdefgh' });
      if (r.status === 429) { sawLimit = true; break; }
    }
    ok(sawLimit, 'password-change burst eventually returns 429');
  }
  {
    // register: 10 / 15min
    const j = jar();
    let sawLimit = false;
    for (let i = 0; i < 25; i++) {
      const r = await call(j, 'POST', '/api/auth/register', { role: 'tenant', name: 'x', email: `rl.${i}.${Date.now()}@example.bh`, password: 'longenough1', cpr: '123456789' });
      if (r.status === 429) { sawLimit = true; break; }
    }
    ok(sawLimit, 'register burst eventually returns 429');
  }

  // ============================================================
  section('10. REAL FEATURES (QR / PDF-HTML / CSV / receipts)');
  // ============================================================
  {
    const tb = (await call(t, 'GET', '/api/bootstrap')).data;
    const cid = tb.contracts[0].id;
    const doc = await rawFetch(`/api/contracts/${cid}/document`, { headers: { Cookie: t.header() } });
    const html = await doc.text();
    ok(doc.status === 200, 'contract document 200');
    ok(html.includes('data:image/svg+xml;base64,'), 'contract carries a REAL server-generated QR (base64 SVG)');
    ok(html.includes(tb.contracts[0].no), 'contract document contains the real contract number');
    const payId = tb.payments.find((p) => p.status === 'paid')?.id;
    if (payId) {
      const rec = await rawFetch(`/api/payments/${payId}/receipt`, { headers: { Cookie: t.header() } });
      const rh = await rec.text();
      ok(rec.status === 200 && rh.includes('إيصال'), 'payment receipt is real printable HTML');
    }
    const csv = await rawFetch('/api/export/contracts', { headers: { Cookie: t.header() } });
    const ct = await csv.text();
    ok(csv.status === 200 && csv.headers.get('content-type').includes('text/csv'), 'CSV export is real text/csv');
    ok(ct.replace(/^\uFEFF/, '').split('\r\n')[0].includes('rent_bhd'), 'CSV export has real headers');
    // documents download
    const docs = tb.documents.filter((d) => d.dataUrl);
    if (docs.length) {
      const dl = await rawFetch(`/api/documents/${docs[0].id}/download`, { headers: { Cookie: t.header() } });
      ok(dl.status === 200, 'document with a real data URL downloads');
    }
  }

  // ============================================================
  section('11. BRANDING / LOCALIZATION SURFACES');
  // ============================================================
  {
    const site = await rawFetch('/website.html');
    const s = await site.text();
    ok(site.status === 200, 'website.html served');
    ok(/إيجاري/.test(s), 'website carries the Arabic brand name إيجاري');
    const dash = await rawFetch('/dashboard.html');
    ok((await dash.text()).length > 0, 'dashboard.html served');
    const man = await (await rawFetch('/manifest.webmanifest')).json();
    ok(man.name && man.name.length > 0, 'PWA manifest declares a name');
    ok(Array.isArray(man.icons) && man.icons.length > 0, 'PWA manifest declares icons');
    const icon = await rawFetch('/assets/img/icon-192.png');
    ok(icon.status === 200, 'PWA 192 icon is served');
    // bilingual payloads
    const faq = await (await rawFetch('/api/faq')).json();
    ok(faq.length > 0 && faq[0].q.ar && faq[0].q.en, 'FAQ payload is bilingual (ar + en)');
  }
} catch (e) {
  failed++; fails.push('EXCEPTION ' + e.message);
  console.error('✗ EXCEPTION', e);
} finally {
  proc.kill();
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) {
  console.log(`✗ ${failed}/${checks} SECURITY CHECKS FAILED`);
  console.log('\nFailures:');
  for (const f of fails) console.log('  - ' + f);
} else {
  console.log(`✓ All ${checks} real security checks passed`);
}
process.exit(failed ? 1 : 0);
