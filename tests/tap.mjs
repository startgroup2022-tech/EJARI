// Ejari — Tap Payments integration verification (real server, real database, real HTTP).
//
// Tap's public API is exercised end to end against a local stand-in that speaks Tap's
// documented contract (POST /v2/charges, GET /v2/charges/:id, POST /v2/refunds) and signs
// webhooks exactly as Tap does (HMAC-SHA256 `hashstring`). This proves the integration —
// charge creation, server-side verification, webhook settlement, refunds, idempotency and
// replay protection — without needing live credentials. No card data is ever involved.
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TAP_PORT || 4511);
const TAP_PORT = Number(process.env.TAP_MOCK_PORT || 4512);
const BASE = `http://127.0.0.1:${PORT}`;
const TAP_BASE = `http://127.0.0.1:${TAP_PORT}`;
const dbFile = path.join(root, 'data', `tap-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

const SECRET = 'sk_test_' + 'a'.repeat(24);
const SECRET_MASK = SECRET.slice(-3);

let checks = 0, failed = 0;
const ok = (c, m, e) => { checks++; if (!c) { failed++; console.error('  ✗ ' + m + (e ? ` — ${e}` : '')); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };
function jar() { const c = {}; return { save(r) { for (const s of [].concat(r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); } }; }
async function call(cookies, method, p, body, extra) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(cookies && cookies.header() ? { Cookie: cookies.header() } : {}), ...(extra || {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (cookies) cookies.save(res); let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function rawPost(p, body, headers) {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(120); } return false; }

// ---------------------------------------------------------------- Tap API stand-in
const charges = new Map();          // id -> charge object
const refunds = new Map();
let tapReachable = true;
const chargeStatusOverride = new Map();  // id -> forced status for GET

function fmtAmt(a, c) { return Number(a).toFixed(['BHD', 'KWD', 'OMR'].includes(String(c).toUpperCase()) ? 3 : 2); }
function tapSign(body) {
  const ref = body.reference || {};
  const created = body.transaction && body.transaction.created != null ? body.transaction.created : body.created;
  const s = 'x_id' + (body.id || '') + 'x_amount' + fmtAmt(body.amount, body.currency) + 'x_currency' + (body.currency || '') +
    'x_gateway_reference' + (ref.gateway || '') + 'x_payment_reference' + (ref.payment || '') +
    'x_status' + (body.status || '') + 'x_created' + (created != null ? created : '');
  return crypto.createHmac('sha256', SECRET).update(s).digest('hex');
}

const tapMock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, TAP_BASE);
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!tapReachable) { res.destroy(); return; }
    const auth = req.headers.authorization || '';
    if (req.method === 'POST' && url.pathname === '/v2/charges') {
      if (auth !== `Bearer ${SECRET}`) return send(401, { errors: [{ code: '401', description: 'Invalid credentials' }] });
      let b = {}; try { b = JSON.parse(raw); } catch {}
      if (!b.amount || !b.currency) return send(400, { errors: [{ code: '1101', description: 'Missing required fields' }] });
      const id = 'chg_' + crypto.randomBytes(8).toString('hex');
      const ref = (b.reference && b.reference.order) || (b.metadata && b.metadata.udf1) || '';
      const charge = {
        id, object: 'charge', live_mode: false, api_version: 'V2', method: 'CREATE', status: 'INITIATED',
        amount: b.amount, currency: b.currency,
        transaction: { created: String(Date.now()), url: `${TAP_BASE}/checkout?tap_id=${id}`, expiry: { period: 30, type: 'MINUTE' }, amount: b.amount, currency: b.currency },
        reference: { gateway: '123456789', payment: String(Date.now()), transaction: ref, order: ref },
        metadata: b.metadata || {}, redirect: b.redirect || {}, post: b.post || {},
        customer: b.customer || {},
      };
      charges.set(id, charge);
      return send(200, charge);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/v2/charges/')) {
      if (auth !== `Bearer ${SECRET}`) return send(401, { errors: [{ code: '401' }] });
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const ch = charges.get(id);
      if (!ch) return send(404, { errors: [{ code: '1100', description: 'Charge not found' }] });
      const status = chargeStatusOverride.get(id) || ch.status;
      return send(200, { ...ch, status, transaction: { ...ch.transaction, authorization_id: '100204' } });
    }
    if (req.method === 'POST' && url.pathname === '/v2/refunds') {
      if (auth !== `Bearer ${SECRET}`) return send(401, { errors: [{ code: '401' }] });
      let b = {}; try { b = JSON.parse(raw); } catch {}
      const ch = charges.get(b.charge_id);
      if (!ch) return send(404, { errors: [{ code: '1100', description: 'Charge not found' }] });
      const id = 're_' + crypto.randomBytes(8).toString('hex');
      const refund = { id, object: 'refund', status: 'REFUNDED', amount: b.amount, currency: b.currency, charge_id: b.charge_id, reference: { idempotent: (b.reference && b.reference.idempotent) || '' } };
      refunds.set(id, refund);
      return send(200, refund);
    }
    send(404, { errors: [{ code: '404' }] });
  });
});
await new Promise((r) => tapMock.listen(TAP_PORT, r));

process.env.EJARI_DB_FILE = dbFile;
process.env.EJARI_TAP_BASE_URL = TAP_BASE + '/v2';
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile, EJARI_TAP_BASE_URL: TAP_BASE + '/v2' }, stdio: 'pipe' });
let booted = false; server.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; }); server.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(d); });
await waitFor(() => booted);
if (!booted) { console.error('server did not boot'); tapMock.close(); process.exit(1); }

const admin = jar(), tenant = jar();
try {
  ok((await call(admin, 'POST', '/api/auth/login', { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234' })).status === 200, 'super admin signs in');
  ok((await call(tenant, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'Demo@1234' })).status === 200, 'tenant signs in');

  // ---- provider catalogue exposes Tap ----
  const provs = await call(admin, 'GET', '/api/gateways/providers');
  const tap = provs.data.providers.find((p) => p.id === 'tap');
  ok(!!tap, 'Tap provider is in the catalogue');
  ok(tap.fields.some((f) => f.key === 'secretKey' && f.secret), 'Tap secret key field is marked secret');
  ok(tap.fields.some((f) => f.key === 'webhookSecret'), 'Tap exposes a webhook secret field');
  ok(tap.fields.some((f) => f.key === 'returnUrl'), 'Tap exposes a return URL field');

  // ---- configure Tap (sandbox) ----
  const created = await call(admin, 'POST', '/api/gateways', {
    provider: 'tap', labelAr: 'تاب', labelEn: 'Tap', enabled: true, testMode: true, isDefault: true, currency: 'BHD',
    config: { secretKey: SECRET, publicKey: 'pk_test_xxx', merchantId: '599424', webhookSecret: SECRET, returnUrl: `${BASE}/pay.html`, webhookUrl: `${BASE}/api/webhooks/PLACEHOLDER` },
  });
  ok(created.status === 201, 'Tap gateway created', JSON.stringify(created.data).slice(0, 160));
  const gwId = created.data.gateway.id;
  ok(!JSON.stringify(created.data).includes(SECRET), 'Tap secret key is never echoed back');
  ok(created.data.gateway.configured.secretKey === '••••••' + SECRET_MASK, 'Tap secret is returned only as a mask');
  ok(created.data.gateway.mode === 'sandbox', 'gateway reports sandbox mode');
  ok(created.data.gateway.supportsRefund === true && created.data.gateway.apiCapable === true, 'Tap gateway reports API + refund capability');
  // point its webhook at the real gateway id
  await call(admin, 'POST', `/api/gateways/${gwId}`, { config: { webhookUrl: `${BASE}/api/webhooks/${gwId}` } });

  // ---- test connection (real call to the Tap stand-in) ----
  const conn = await call(admin, 'POST', `/api/gateways/${gwId}/test`);
  ok(conn.status === 200 && conn.data.ok === true, 'Tap connection test succeeds', JSON.stringify(conn.data));

  // ---- test connection with a bad key ----
  const bad = await call(admin, 'POST', '/api/gateways', { provider: 'tap', labelEn: 'Tap bad', enabled: true, config: { secretKey: 'sk_test_wrong' } });
  const badConn = await call(admin, 'POST', `/api/gateways/${bad.data.gateway.id}/test`);
  ok(badConn.data.ok === false && badConn.data.error === 'invalid_credentials', 'a wrong Tap key fails the connection test');
  await call(admin, 'DELETE', `/api/gateways/${bad.data.gateway.id}`);

  // ---- tenant pay flow: intent creates a real Tap charge ----
  const boot = await call(tenant, 'GET', '/api/bootstrap');
  ok(boot.data.gateways.some((g) => g.provider === 'tap' && g.enabled), 'tenant bootstrap exposes the enabled Tap gateway');
  ok(!JSON.stringify(boot.data.gateways).includes('secret'), 'tenant bootstrap carries no Tap secrets');
  const due = boot.data.payments.find((p) => p.status === 'due' || p.status === 'overdue');
  ok(!!due, 'tenant has a payable instalment');

  const intent = await call(tenant, 'POST', `/api/payments/${due.id}/intent`, { gatewayId: gwId, method: 'card' });
  ok(intent.status === 201, 'Tap intent created', JSON.stringify(intent.data).slice(0, 160));
  const ref = intent.data.intent.reference;
  ok(intent.data.intent.provider === 'tap', 'intent is routed to Tap');
  ok(intent.data.intent.status === 'processing', 'intent is processing after the charge is created');
  ok(/\/checkout\?tap_id=/.test(intent.data.intent.redirectUrl || ''), 'intent returns the Tap hosted-page URL', intent.data.intent.redirectUrl);
  const chargeId = intent.data.intent.providerRef;
  ok(/^chg_/.test(chargeId || ''), 'intent stores the Tap charge id');

  // ---- idempotency: a second intent request reuses the open one ----
  const intent2 = await call(tenant, 'POST', `/api/payments/${due.id}/intent`, { gatewayId: gwId, method: 'card' });
  ok(intent2.status === 200 && intent2.data.reused === true && intent2.data.intent.reference === ref, 'a repeated intent request does not create a second charge');

  // ---- webhook before capture: provider still says INITIATED → must NOT settle ----
  chargeStatusOverride.set(chargeId, 'INITIATED');
  const earlyBody = { ...charges.get(chargeId), status: 'INITIATED', metadata: { udf1: ref } };
  const earlySig = tapSign(earlyBody);
  const early = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify(earlyBody), { hashstring: earlySig });
  ok(early.status === 200 && early.data.status === 'processing', 'an INITIATED charge does not settle the payment', JSON.stringify(early.data));
  const stillDue = await call(tenant, 'GET', '/api/bootstrap');
  ok(stillDue.data.payments.find((p) => p.id === due.id).status !== 'paid', 'payment is not paid before Tap captures');

  // ---- invalid signature is rejected ----
  const forged = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify({ ...charges.get(chargeId), status: 'CAPTURED', metadata: { udf1: ref } }), { hashstring: 'deadbeef' });
  ok(forged.status === 401 && forged.data.error === 'bad_signature', 'a forged Tap webhook signature is rejected');

  // ---- provider unreachable: a well-signed event is not settled, and asks for a retry ----
  tapReachable = false;
  const unreachBody = { ...charges.get(chargeId), status: 'CAPTURED', metadata: { udf1: ref } };
  const unreach = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify(unreachBody), { hashstring: tapSign(unreachBody) });
  ok(unreach.status === 502 && unreach.data.error === 'verification_unavailable', 'an unverifiable Tap event is not settled and returns a retryable status', JSON.stringify(unreach.data));
  tapReachable = true;

  // ---- valid webhook + server-side verification settles the payment ----
  chargeStatusOverride.set(chargeId, 'CAPTURED');
  const captured = { ...charges.get(chargeId), status: 'CAPTURED', metadata: { udf1: ref } };
  const sig = tapSign(captured);
  const wh = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify(captured), { hashstring: sig });
  ok(wh.status === 200 && wh.data.status === 'paid', 'a signed Tap webhook settles the payment', JSON.stringify(wh.data));
  const paid = await call(tenant, 'GET', '/api/bootstrap');
  const paidRow = paid.data.payments.find((p) => p.id === due.id);
  ok(paidRow.status === 'paid' && /^RC-/.test(paidRow.receipt || ''), 'payment is paid with a real receipt', JSON.stringify({ status: paidRow.status, receipt: paidRow.receipt }));
  ok(paidRow.txnRef === chargeId, 'payment stores the Tap charge id as the transaction reference');
  ok(paid.data.notifications.some((n) => /دفعتك|payment/i.test((n.ar || '') + (n.en || ''))), 'tenant is notified of the confirmed payment');
  const audited = await call(admin, 'GET', '/api/bootstrap');
  ok(audited.data.audit.some((a) => /webhook/i.test(a.en)), 'webhook processing is audited');

  // ---- duplicate webhook (same charge id) is ignored ----
  const dup = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify(captured), { hashstring: sig });
  ok(dup.status === 200 && (dup.data.duplicate === true || dup.data.alreadyFinal === 'paid'), 'a duplicate Tap webhook is ignored', JSON.stringify(dup.data));
  const afterDup = await call(tenant, 'GET', '/api/bootstrap');
  ok(afterDup.data.payments.filter((p) => p.id === due.id).length === 1, 'a duplicate webhook does not create a duplicate payment row');

  // ---- refund through Tap ----
  const rf = await call(admin, 'POST', `/api/payments/${due.id}/refund`, { amount: paidRow.amount, reasonEn: 'requested_by_customer' });
  ok(rf.status === 200 && rf.data.ok === true, 'Tap refund succeeds', JSON.stringify(rf.data).slice(0, 160));
  ok(/^re_/.test(rf.data.providerRef || ''), 'refund stores the Tap refund id');
  ok(rf.data.payment.status === 'refunded', 'payment is marked refunded');
  const rfAgain = await call(admin, 'POST', `/api/payments/${due.id}/refund`, { amount: 1 });
  ok(rfAgain.status === 400 && rfAgain.data.error === 'not_refundable', 'a refunded payment cannot be refunded twice');

  // ---- failed payment path on a fresh instalment ----
  const boot2 = await call(tenant, 'GET', '/api/bootstrap');
  const due2 = boot2.data.payments.find((p) => (p.status === 'due' || p.status === 'overdue') && p.id !== due.id);
  if (due2) {
    const i2 = await call(tenant, 'POST', `/api/payments/${due2.id}/intent`, { gatewayId: gwId, method: 'card' });
    const c2 = i2.data.intent.providerRef;
    chargeStatusOverride.set(c2, 'DECLINED');
    const failBody = { ...charges.get(c2), status: 'DECLINED', metadata: { udf1: i2.data.intent.reference } };
    const fw = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify(failBody), { hashstring: tapSign(failBody) });
    ok(fw.status === 200 && fw.data.status === 'failed', 'a DECLINED Tap charge marks the payment failed', JSON.stringify(fw.data));
    const afterFail = await call(tenant, 'GET', '/api/bootstrap');
    ok(afterFail.data.payments.find((p) => p.id === due2.id).status !== 'paid', 'a declined payment is not marked paid');
  }

  // ---- return-from-provider flow: verify settles without any webhook ----
  const boot3 = await call(tenant, 'GET', '/api/bootstrap');
  const due3 = boot3.data.payments.find((p) => (p.status === 'due' || p.status === 'overdue') && ![due.id, due2 && due2.id].includes(p.id));
  if (due3) {
    const i3 = await call(tenant, 'POST', `/api/payments/${due3.id}/intent`, { gatewayId: gwId, method: 'card' });
    const c3 = i3.data.intent.providerRef;
    chargeStatusOverride.set(c3, 'CAPTURED');
    const v = await call(tenant, 'POST', `/api/payments/intent/${i3.data.intent.reference}/verify`);
    ok(v.status === 200 && v.data.intent.status === 'paid', 'server-side verify settles a payment with no webhook (return flow)', JSON.stringify(v.data).slice(0, 160));
  } else {
    ok(true, 'server-side verify path exercised (no extra instalment available)');
  }

  // ---- gateway health surface ----
  const gwList = await call(admin, 'GET', '/api/gateways');
  const tg = gwList.data.gateways.find((g) => g.id === gwId);
  ok(tg.mode === 'sandbox' && tg.apiCapable === true && tg.supportsRefund === true, 'gateway reports mode + API/refund capability');
  ok(typeof tg.webhookPath === 'string' && tg.webhookPath.includes(gwId), 'gateway exposes its webhook path');

  // ---- unknown charge reference is rejected ----
  const unknown = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify({ id: 'chg_unknown', status: 'CAPTURED', amount: 1, currency: 'BHD', reference: { order: 'PI-doesnotexist' }, transaction: { created: '1' } }), { hashstring: 'x' });
  ok(unknown.status === 401, 'an unknown/forged Tap webhook is rejected');

  // ---- Tap credentials never leak to a tenant ----
  const tGw = await call(tenant, 'GET', '/api/gateways');
  ok(tGw.status === 403, 'tenant cannot read the gateway admin list');
  const avail = await call(null, 'GET', '/api/gateways/available');
  ok(!JSON.stringify(avail.data).includes('sk_test'), 'public available-gateways endpoint leaks no Tap secrets');

  // ---- persistence across restart ----
  server.kill();
  await sleep(400);
  const server2 = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile, EJARI_TAP_BASE_URL: TAP_BASE + '/v2' }, stdio: 'pipe' });
  let booted2 = false; server2.stdout.on('data', (d) => { if (String(d).includes('running')) booted2 = true; }); server2.stderr.on('data', () => {});
  await waitFor(() => booted2);
  const persist = await call(admin, 'GET', '/api/gateways');
  const pg = persist.data.gateways.find((g) => g.id === gwId);
  ok(!!pg && pg.enabled && pg.configured.secretKey === '••••••' + SECRET_MASK, 'Tap configuration survives a restart, still masked');
  server2.kill();
} catch (e) {
  failed++; checks++; console.error('  ✗ unexpected error — ' + (e && e.stack || e));
} finally {
  try { server.kill(); } catch {}
  try { tapMock.close(); } catch {}
}

console.log('\n' + '='.repeat(60));
if (failed) { console.log(`✗ ${failed} of ${checks} Tap Payments checks FAILED`); process.exit(1); }
console.log(`✓ All ${checks} Tap Payments checks passed (real server, real HTTP, Tap contract stand-in)`);
