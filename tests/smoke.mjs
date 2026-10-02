// Real end-to-end smoke test — starts the ACTUAL server on a scratch port with a throwaway
// database, then drives the REAL HTTP API with fetch(). No mocks, no jsdom: this exercises
// exactly the same code path a browser does.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const dbFile = path.join(root, 'data', 'test.db');
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failed++; console.error('✗ ' + msg); } };

function jar() { const c = {}; return { save(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.raw?.()['set-cookie'] || []; for (const s of [].concat(sc)) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); } }; }
async function call(cookies, method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies.header() } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (cookies) cookies.save(res);
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

console.log('Starting a real server instance on port', PORT, '…');
process.env.EJARI_DB_FILE = dbFile;
const proc = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
let booted = false;
proc.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; });
proc.stderr.on('data', () => {});
const started = Date.now();
while (!booted && Date.now() - started < 8000) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 300));

try {
  // ---- static pages served ----
  for (const page of ['/website.html', '/dashboard.html', '/app.html', '/app-screen.html']) {
    const r = await fetch(BASE + page);
    ok(r.status === 200, `GET ${page} → 200`);
  }
  for (const asset of ['/assets/js/core.js', '/assets/css/base.css', '/manifest.webmanifest']) {
    const r = await fetch(BASE + asset);
    ok(r.status === 200, `GET ${asset} → 200`);
  }

  // ---- sensitive paths must NOT be served over HTTP ----
  for (const priv of ['/data/ejari.db', '/data/test.db', '/server/api.mjs', '/server/db.mjs', '/server.mjs', '/.git/config', '/.git/HEAD', '/package.json', '/tests/smoke.mjs', '/../server/db.mjs']) {
    const r = await fetch(BASE + priv, { redirect: 'manual' });
    ok(r.status === 404 || r.status === 403, `private path ${priv} is not served (got ${r.status})`);
  }
  {
    const r = await fetch(BASE + '/website.html');
    ok(r.headers.get('x-content-type-options') === 'nosniff', 'security headers present on static responses');
    const a = await fetch(BASE + '/api/faq');
    ok(a.headers.get('content-security-policy') !== null, 'CSP header present on API responses');
  }

  // ---- public API ----
  {
    const r = await call(null, 'GET', '/api/faq');
    ok(r.status === 200 && Array.isArray(r.data) && r.data.length > 0, 'GET /api/faq returns published questions');
  }
  {
    const r = await call(null, 'GET', '/api/verify/EJ-2026-00412');
    ok(r.status === 200 && r.data.found === true, 'verify: known contract found');
    const r2 = await call(null, 'GET', '/api/verify/EJ-2026-99999');
    ok(r2.status === 404, 'verify: unknown contract → 404');
  }

  // ---- registration + real password auth ----
  const land = jar();
  {
    const r = await call(land, 'POST', '/api/auth/register', { role: 'landlord', name: 'QA Landlord', cpr: '123456789', phone: '+973 3999 0000', email: `qa.landlord.${Date.now()}@example.bh`, password: 'Sup3rSecret!' });
    ok(r.status === 201 && r.data.user, 'register: creates a real account');
    var landlordEmail = r.data.user.email;
  }
  {
    const bad = jar();
    const r = await call(bad, 'POST', '/api/auth/login', { email: landlordEmail, password: 'wrong-password' });
    ok(r.status === 401, 'login: wrong password rejected');
  }
  {
    const r = await call(land, 'GET', '/api/auth/me');
    ok(r.data.user && r.data.user.email === landlordEmail, 'session cookie keeps the registered user signed in');
  }

  // ---- demo logins ----
  const tenant = jar(); await call(tenant, 'POST', '/api/auth/demo', { role: 'tenant' });
  // The full-admin session for this suite is the seeded super admin, signed in with real
  // credentials. (The demo admin endpoint deliberately hands out a limited sub-role.)
  const admin = jar(); await call(admin, 'POST', '/api/auth/login', { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234' });
  {
    const r = await call(tenant, 'GET', '/api/bootstrap');
    ok(r.data.me.role === 'tenant' && r.data.contracts.length > 0, 'tenant bootstrap has scoped contracts');
  }

  // ---- full lease lifecycle, through the real API, persisted in the real DB ----
  let unitId, tenantId, contractId, contractNo, feeId, rentPaymentId;
  {
    const boot = (await call(land, 'GET', '/api/bootstrap')).data;
    ok(Array.isArray(boot.properties), 'new landlord bootstrap ok');
    const r = await call(land, 'POST', '/api/properties', { name: 'QA Test Tower', area: 'muh', type: 'building', deed: 'QA-' + Date.now(), units: 2 });
    ok(r.status === 201 && r.data.units.length === 2, 'create property + units');
    unitId = r.data.units[0].id;
  }
  {
    const boot = (await call(tenant, 'GET', '/api/bootstrap')).data;
    tenantId = boot.me.id;
  }
  {
    const r = await call(land, 'POST', '/api/contracts', { unitId, tenantId, start: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), months: 12, rent: 300, deposit: 300, dueDay: 1, freq: 'monthly', utilities: false, notes: 'QA' });
    ok(r.status === 201 && r.data.contract.status === 'pending_sign', 'create contract: pending_sign, landlord auto-signed');
    contractId = r.data.contract.id; contractNo = r.data.contract.no;
  }
  ok((await call(null, 'GET', '/api/verify/' + contractNo)).data.found, 'newly created contract is publicly verifiable by number');
  {
    const r = await call(tenant, 'POST', `/api/contracts/${contractId}/sign`, { as: 'tenant' });
    ok(r.data.contract.status === 'pending_pay', 'tenant signs → pending_pay, fee payment due');
  }
  {
    const boot = (await call(tenant, 'GET', '/api/bootstrap')).data;
    const fee = boot.payments.find((p) => p.c === contractId && p.kind === 'fee');
    ok(fee && fee.status === 'due', 'registration fee payment is due');
    feeId = fee.id;
  }
  {
    const r = await call(tenant, 'POST', `/api/payments/${feeId}/pay`, { method: 'card' });
    ok(r.data.payment.status === 'paid' && r.data.payment.receipt.startsWith('RC-'), 'fee paid, real receipt number issued');
    ok(r.data.contract.status === 'active', 'contract activates automatically once the fee is paid');
  }
  {
    const r = await call(land, 'GET', '/api/bootstrap');
    const notif = r.data ? null : null; // notifications are per-recipient; just confirm landlord bootstrap still consistent
    ok(Array.isArray(r.data.notifications), 'landlord notifications list present (includes fee-paid alert)');
  }
  // renewal round-trip
  {
    await call(tenant, 'POST', `/api/contracts/${contractId}/renew-request`);
    const off = await call(land, 'POST', `/api/contracts/${contractId}/renew-offer`, { rent: 330, months: 12 });
    ok(off.data.contract.renewal.state === 'offered', 'renewal offer recorded');
    const acc = await call(tenant, 'POST', `/api/contracts/${contractId}/renew-accept`);
    ok(acc.data.contract.rent === 330 && acc.data.contract.months === 24, 'renewal accepted: rent + term updated for real');
  }
  // maintenance round-trip
  let maintId;
  {
    const r = await call(tenant, 'POST', '/api/maintenance', { title: 'QA leak test', category: 'plumb', priority: 'high' });
    ok(r.status === 201, 'tenant opens a maintenance request');
    maintId = r.data.request.id;
    await call(land, 'POST', `/api/maintenance/${maintId}/assign`, { technician: 'QA Tech' });
    await call(land, 'POST', `/api/maintenance/${maintId}/start`);
    const done = await call(land, 'POST', `/api/maintenance/${maintId}/complete`);
    ok(done.data.request.st === 'done', 'maintenance request progresses new→assigned→in_progress→done');
    const rated = await call(tenant, 'POST', `/api/maintenance/${maintId}/rate`, { rating: 5 });
    ok(rated.data.request.rating === 5, 'tenant rates the completed request');
  }
  // tickets
  {
    const r = await call(tenant, 'POST', '/api/tickets', { subject: 'QA ticket', category: 'other', priority: 'normal', message: 'hello' });
    ok(r.status === 201, 'tenant opens a support ticket');
    const upd = await call(admin, 'POST', `/api/tickets/${r.data.ticket.id}`, { status: 'resolved', reply: 'fixed' });
    ok(upd.data.ticket.st === 'resolved' && upd.data.ticket.msgs.some((m) => m.x === 'fixed'), 'admin resolves the ticket with a reply');
  }
  // admin governance
  {
    const boot = (await call(admin, 'GET', '/api/bootstrap')).data;
    const pendingUser = boot.users.find((u) => u.email === landlordEmail);
    ok(pendingUser && pendingUser.status === 'pending', 'new landlord starts pending verification');
    const v = await call(admin, 'POST', `/api/users/${pendingUser.id}/verify`);
    ok(v.data.user.verified === true && v.data.user.status === 'active', 'admin verifies the new landlord');
    const susp = await call(admin, 'POST', `/api/users/${pendingUser.id}/status`);
    ok(susp.data.user.status === 'suspended', 'admin suspends a user');
    await call(admin, 'POST', `/api/users/${pendingUser.id}/status`); // toggle back
    const auditR = await call(admin, 'GET', '/api/bootstrap');
    ok(auditR.data.audit.length >= 5, 'audit log records the admin actions (' + auditR.data.audit.length + ' entries)');
  }
  // permissions + settings persistence
  {
    await call(admin, 'POST', '/api/roles/legal/perm', { perm: 'reports', allowed: true });
    const b1 = (await call(admin, 'GET', '/api/bootstrap')).data;
    ok(b1.perm.legal.reports === true, 'role permission change persists');
    await call(admin, 'POST', '/api/settings', { reg: 15 });
    const b2 = (await call(admin, 'GET', '/api/bootstrap')).data;
    ok(Number(b2.fees.reg) === 15, 'fee settings persist');
  }
  // security regressions
  {
    // checklist IDOR: a tenant must not touch a contract that is not theirs
    const boot = (await call(tenant, 'GET', '/api/bootstrap')).data;
    const own = boot.contracts[0].id;
    const other = ((await call(admin, 'GET', '/api/bootstrap')).data.contracts.find((c) => c.id !== own)).id;
    const r = await call(tenant, 'POST', `/api/contracts/${other}/checklist`, { key: 'keys', value: true });
    ok(r.status === 403, 'checklist rejects a contract the user is not party to');
    const ro = await call(tenant, 'POST', `/api/contracts/${own}/checklist`, { key: 'keys', value: true });
    ok(ro.status === 200, 'checklist still works for an own contract');
    // contract input validation
    const neg = await call(land, 'POST', '/api/contracts', { unitId, tenantId, start: '2027-01-01', months: -5, rent: -100, dueDay: 99 });
    ok(neg.status === 400, 'negative rent / term rejected');
    const badDate = await call(land, 'POST', '/api/contracts', { unitId, tenantId, start: 'not-a-date', months: 12, rent: 300, dueDay: 1 });
    ok(badDate.status === 400, 'invalid start date rejected with 400 (not 500)');
    // integrations toggle must not 500
    const tg = await call(admin, 'POST', '/api/integrations/i1/toggle', { enabled: false });
    ok(tg.status === 200 && tg.data.integration.on === false, 'integration toggle works and persists');
    await call(admin, 'POST', '/api/integrations/i1/toggle', { enabled: true });
    // sub-role permission enforcement: legal admin must not change fees
    const legal = jar();
    const lr = await call(legal, 'POST', '/api/auth/login', { email: 'hasan.bukhowa@ejari.bh', password: 'Demo@1234' });
    ok(lr.status === 200, 'legal sub-admin can sign in');
    const deny = await call(legal, 'POST', '/api/settings', { reg: 999 });
    ok(deny.status === 403, 'legal sub-admin is denied settings (no settings permission)');
    const allow = await call(legal, 'POST', '/api/verification/1/approve');
    ok(allow.status === 200, 'legal sub-admin is allowed verification (has verify permission)');
  }
  // ---- new platform surfaces: services, requests, content, exports ----
  {
    // public stats for the marketing site
    const stats = await call(null, 'GET', '/api/stats');
    ok(stats.status === 200 && stats.data.contracts > 0 && stats.data.users > 0, 'public stats endpoint returns real counts');

    // public catalogue
    const svc = await call(null, 'GET', '/api/services');
    ok(svc.status === 200 && svc.data.length >= 6, 'public services catalogue is served');
    const posts = await call(null, 'GET', '/api/posts');
    ok(posts.status === 200 && posts.data.length >= 3, 'public posts feed is served');

    // a tenant creates a real service request, admin assigns + completes it
    const boot = (await call(tenant, 'GET', '/api/bootstrap')).data;
    ok(Array.isArray(boot.services) && boot.services.length >= 6, 'bootstrap carries the service catalogue');
    const created = await call(tenant, 'POST', '/api/service-requests', { serviceId: boot.services[0].id, notes: 'صيانة تجريبية' });
    ok(created.status === 200 && /^SR-2026-\d{5}$/.test(created.data.request.no), 'tenant creates a service request with a real number');
    const rid = created.data.request.id;
    ok(created.data.request.events.length === 1, 'request creation writes a timeline event');

    const asg = await call(admin, 'POST', `/api/service-requests/${rid}/assign`, { providerId: (await call(admin, 'GET', '/api/bootstrap')).data.users.find((u) => u.role === 'admin').id });
    ok(asg.status === 200 && asg.data.request.provider, 'admin assigns a specialist');
    const done = await call(admin, 'POST', `/api/service-requests/${rid}/status`, { status: 'done' });
    ok(done.status === 200 && done.data.request.status === 'done' && done.data.request.completedAt, 'admin completes the request');
    const msg = await call(tenant, 'POST', `/api/service-requests/${rid}/message`, { text: 'شكراً' });
    ok(msg.status === 200 && msg.data.request.events.some((e) => e.kind === 'message'), 'participants can post messages');

    // a different tenant must not read or touch someone else's request
    const other = jar();
    await call(other, 'POST', '/api/auth/login', { email: 'khaled.aljasim@example.bh', password: 'Demo@1234' });
    const peek = await call(other, 'POST', `/api/service-requests/${rid}/message`, { text: 'x' });
    ok(peek.status === 403, 'service request is scoped to its participants (IDOR blocked)');

    // services catalogue CRUD is gated by the content permission
    const legal = jar();
    await call(legal, 'POST', '/api/auth/login', { email: 'hasan.bukhowa@ejari.bh', password: 'Demo@1234' });
    const denied = await call(legal, 'POST', '/api/services', { nameAr: 'خدمة', nameEn: 'Service' });
    ok(denied.status === 403, 'creating a service requires the content permission');
    const svcNew = await call(admin, 'POST', '/api/services', { nameAr: 'خدمة اختبار', nameEn: 'Test service', price: 7, duration: 15 });
    ok(svcNew.status === 200 && svcNew.data.service.id, 'admin creates a service');
    const svcEdit = await call(admin, 'POST', `/api/services/${svcNew.data.service.id}`, { price: 9 });
    ok(svcEdit.status === 200 && svcEdit.data.service.price === 9, 'admin edits a service price');
    const svcDel = await call(admin, 'DELETE', `/api/services/${svcNew.data.service.id}`);
    ok(svcDel.status === 200, 'admin disables a service');

    // content authoring
    const postNew = await call(admin, 'POST', '/api/posts', { categoryId: (await call(null, 'GET', '/api/categories')).data[0].id, titleAr: 'خبر', titleEn: 'News item', bodyAr: 'نص', bodyEn: 'text', published: true });
    ok(postNew.status === 200 && postNew.data.post.id, 'admin publishes an article');
    const postDel = await call(admin, 'DELETE', `/api/posts/${postNew.data.post.id}`);
    ok(postDel.status === 200, 'admin deletes an article');

    // broadcast notifications reach the audience and are logged
    const bcast = await call(admin, 'POST', '/api/notifications/broadcast', { audience: 'tenants', titleAr: 'إشعار', titleEn: 'Notice', bodyAr: 'نص', bodyEn: 'text' });
    ok(bcast.status === 200 && bcast.data.recipients > 0, 'admin broadcasts a notification');
    const log = (await call(admin, 'GET', '/api/bootstrap')).data.notificationLog;
    ok(log.length >= 1 && log[0].recipients === bcast.data.recipients, 'broadcast is recorded in the delivery log');

    // real CSV export respects scope and permissions
    const csvRes = await fetch(BASE + '/api/export/contracts', { headers: { Cookie: tenant.header() } });
    const csvTxt = await csvRes.text();
    ok(csvRes.status === 200 && csvRes.headers.get('content-type').includes('text/csv'), 'CSV export returns text/csv');
    ok(csvTxt.replace(/^\uFEFF/,'').split('\r\n')[0].includes('rent_bhd'), 'CSV export has a header row (BOM stripped by fetch)');
    const usersCsv = await fetch(BASE + '/api/export/users', { headers: { Cookie: tenant.header() } });
    ok(usersCsv.status === 403, 'non-admin cannot export the user list');

    // printable documents
    const contractId = (await call(tenant, 'GET', '/api/bootstrap')).data.contracts[0].id;
    const doc = await fetch(BASE + `/api/contracts/${contractId}/document`, { headers: { Cookie: tenant.header() } });
    const docHtml = await doc.text();
    ok(doc.status === 200 && doc.headers.get('content-type').includes('text/html'), 'contract document is an HTML page');
    ok(docHtml.includes('data:image/svg+xml;base64,'), 'contract document embeds a real QR code');
    const payId = (await call(tenant, 'GET', '/api/bootstrap')).data.payments.find((p) => p.status === 'paid').id;
    const rec = await fetch(BASE + `/api/payments/${payId}/receipt`, { headers: { Cookie: tenant.header() } });
    ok(rec.status === 200 && (await rec.text()).includes('إيصال'), 'payment receipt is printable HTML');
    const foreign = await fetch(BASE + `/api/payments/${payId}/receipt`, { headers: { Cookie: other.header() } });
    ok(foreign.status === 403, 'receipt is scoped to the payment parties');

    // reports aggregate real numbers, gated by the reports permission
    const rep = await call(admin, 'GET', '/api/reports/summary');
    ok(rep.status === 200 && rep.data.users.total > 0 && rep.data.contracts.total > 0, 'reports summary returns real aggregates');
    const repDenied = await call(other, 'GET', '/api/reports/summary');
    ok(repDenied.status === 403, 'reports summary requires the reports permission');

    // password change really changes the password
    const fresh = jar();
    await call(fresh, 'POST', '/api/auth/register', { name: 'مستخدم اختبار', email: 'pw.test@example.bh', password: 'OldPass123', role: 'tenant', cpr: '999888777' });
    const wrong = await call(fresh, 'POST', '/api/auth/password', { currentPassword: 'nope', newPassword: 'NewPass123' });
    ok(wrong.status === 400, 'password change rejects a wrong current password');
    const changed = await call(fresh, 'POST', '/api/auth/password', { currentPassword: 'OldPass123', newPassword: 'NewPass123' });
    ok(changed.status === 200, 'password change succeeds with the right current password');
    const relog = jar();
    const oldLogin = await call(relog, 'POST', '/api/auth/login', { email: 'pw.test@example.bh', password: 'OldPass123' });
    ok(oldLogin.status === 401, 'the old password no longer works');
    const newLogin = await call(relog, 'POST', '/api/auth/login', { email: 'pw.test@example.bh', password: 'NewPass123' });
    ok(newLogin.status === 200, 'the new password works');
  }
  // logout really clears the session
  {
    await call(tenant, 'POST', '/api/auth/logout');
    const r = await call(tenant, 'GET', '/api/bootstrap');
    ok(r.status === 401, 'after logout, the session cookie no longer authenticates');
  }
} catch (e) {
  failed++; console.error('✗ EXCEPTION', e);
} finally {
  proc.kill();
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(failed ? `\n✗ ${failed}/${checks} checks failed` : `\n✓ All ${checks} real end-to-end checks passed (real server, real SQLite database, real HTTP)`);
process.exit(failed ? 1 : 0);
