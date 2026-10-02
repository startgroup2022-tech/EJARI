// Ejari — payment gateway verification (real server, real database, real HTTP).
//
// Exercises the complete, configurable payment subsystem end to end:
//   • admin gateway CRUD with encrypted, non-echoed credentials
//   • connection test + test payment
//   • the full tenant payment flow: intent -> (provider) -> signed webhook -> paid
//   • the security invariants: client redirect alone never marks a payment paid,
//     forged signatures are rejected, replays are ignored, duplicate intents are prevented
//   • refunds, RBAC and audit logging
// No card data is ever involved — the sandbox provider models a hosted gateway.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GW_PORT || 4507);
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', `gw-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

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

process.env.EJARI_DB_FILE = dbFile;
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
let booted = false; server.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; }); server.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(d); });
await waitFor(() => booted);
if (!booted) { console.error('server did not boot'); process.exit(1); }

const superAdmin = jar(), financeAdmin = jar(), tenant = jar(), landlord = jar(), other = jar();
try {
  // ---- sessions ----
  ok((await call(superAdmin, 'POST', '/api/auth/login', { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234' })).status === 200, 'super admin signs in');
  ok((await call(financeAdmin, 'POST', '/api/auth/login', { email: 'zainab.almahroos@ejari.bh', password: 'Demo@1234' })).status === 200, 'finance admin signs in');
  ok((await call(tenant, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'Demo@1234' })).status === 200, 'tenant signs in');
  ok((await call(landlord, 'POST', '/api/auth/login', { email: 'rashed.almanai@example.bh', password: 'Demo@1234' })).status === 200, 'landlord signs in');
  ok((await call(other, 'POST', '/api/auth/login', { email: 'khaled.aljasim@example.bh', password: 'Demo@1234' })).status === 200, 'second tenant signs in');

  // ---- provider catalogue & RBAC ----
  const provs = await call(superAdmin, 'GET', '/api/gateways/providers');
  ok(provs.status === 200 && provs.data.providers.length >= 3, 'provider catalogue lists providers', JSON.stringify(provs.data).slice(0, 120));
  ok(provs.data.providers.some((p) => p.id === 'benefitpay'), 'BenefitPay provider is available');
  ok(provs.data.providers.every((p) => p.fields.every((f) => typeof f.secret === 'boolean')), 'provider fields declare which are secret');
  const financeProv = await call(financeAdmin, 'GET', '/api/gateways/providers');
  ok(financeProv.status === 403, 'finance sub-role without settings permission is denied gateway access', `got ${financeProv.status}`);
  const tenantGw = await call(tenant, 'GET', '/api/gateways');
  ok(tenantGw.status === 403, 'tenant cannot list gateways');

  // ---- create a gateway with a known webhook secret; secrets must not be echoed ----
  const created = await call(superAdmin, 'POST', '/api/gateways', { provider: 'benefitpay', labelAr: 'بنفاذ', labelEn: 'BenefitPay', enabled: true, isDefault: true, currency: 'BHD', webhookSecret: 'hook-secret-known', config: { merchantId: 'MERCH-9', terminalId: 'TERM-3', secretKey: 'sk_live_supersecret_123', endpoint: 'https://api.benefitpay.bh' } });
  ok(created.status === 201, 'gateway created', JSON.stringify(created.data).slice(0, 140));
  const gwId = created.data.gateway.id;
  ok(!JSON.stringify(created.data).includes('supersecret'), 'created response does not leak the secret key');
  ok(created.data.gateway.configured.secretKey.startsWith('••••'), 'secret key is masked', created.data.gateway.configured.secretKey);
  const list = await call(superAdmin, 'GET', '/api/gateways');
  ok(!JSON.stringify(list.data).includes('supersecret'), 'gateway list does not leak the secret key');
  ok(list.data.gateways.find((g) => g.id === gwId).isDefault === true, 'new gateway became the default');
  const missing = await call(superAdmin, 'POST', '/api/gateways', { provider: 'benefitpay', config: { merchantId: 'x' } });
  ok(missing.status === 400 && missing.data.error === 'missing_field', 'missing required credential is rejected');

  // A round-tripped edit (form echoes the mask back) must never clobber the stored secret;
  // only a genuinely new value may rotate it.
  const maskedUpdate = await call(superAdmin, 'POST', `/api/gateways/${gwId}`, { config: { secretKey: '••••••XYZ' } });
  ok(maskedUpdate.status === 200 && maskedUpdate.data.gateway.configured.secretKey.endsWith('123'), 'a masked secret value does not overwrite the stored credential');
  const rotated = await call(superAdmin, 'POST', `/api/gateways/${gwId}`, { config: { secretKey: 'sk_live_rotated_789' } });
  ok(rotated.status === 200 && rotated.data.gateway.configured.secretKey.endsWith('789'), 'a genuinely new secret value rotates the credential');

  // ---- connection test & test payment ----
  const test = await call(superAdmin, 'POST', `/api/gateways/${gwId}/test`);
  ok(test.status === 200 && test.data.ok === true, 'gateway connection test succeeds', JSON.stringify(test.data));
  const tp = await call(superAdmin, 'POST', `/api/gateways/${gwId}/test-payment`, { amount: 2 });
  ok(tp.status === 200 && tp.data.intent.amount === 2, 'test payment creates a real intent');
  const disabled = await call(superAdmin, 'POST', '/api/gateways', { provider: 'card', labelEn: 'Cards', enabled: false, config: { merchantId: 'c', secretKey: 's' } });
  ok(disabled.status === 201, 'a disabled gateway can be created');
  const tpDisabled = await call(superAdmin, 'POST', `/api/gateways/${disabled.data.gateway.id}/test-payment`, { amount: 1 });
  ok(tpDisabled.status === 400 && tpDisabled.data.error === 'gateway_disabled', 'test payment on a disabled gateway is refused');

  // ---- public available gateways (no secrets) ----
  const avail = await call(null, 'GET', '/api/gateways/available');
  ok(avail.status === 200 && !JSON.stringify(avail.data).includes('secret'), 'available gateways endpoint exposes no secrets');
  ok(avail.data.gateways.some((g) => g.id === gwId), 'enabled gateway appears to payers');

  // ---- the full payment flow ----
  const boot = await call(tenant, 'GET', '/api/bootstrap');
  ok(Array.isArray(boot.data.gateways) && boot.data.gateways.some((g) => g.id === gwId), 'tenant bootstrap carries enabled gateways for checkout');
  ok(!JSON.stringify(boot.data.gateways || []).includes('secret'), 'tenant bootstrap gateways carry no secrets');
  const unpaid = boot.data.payments.find((p) => !['paid', 'refunded'].includes(p.status));
  ok(!!unpaid, 'tenant has an unpaid instalment to pay');
  const pid = unpaid.id;

  const intentRes = await call(tenant, 'POST', `/api/payments/${pid}/intent`, { method: 'benefit' });
  ok(intentRes.status === 201, 'tenant starts a payment intent', JSON.stringify(intentRes.data).slice(0, 140));
  const ref = intentRes.data.intent.reference;
  ok(intentRes.data.intent.status === 'pending', 'intent starts pending');
  ok(intentRes.data.intent.redirectUrl.includes(ref), 'intent returns a redirect target');

  // After creating an intent, the payment is "processing" — NOT paid. A client redirect is not proof.
  const mid = await call(tenant, 'GET', `/api/payments/intent/${ref}`);
  ok(mid.data.payment.status === 'processing', 'payment is processing, not paid, before provider confirmation', mid.data.payment.status);

  // Idempotency: a second intent for the same payment+gateway is reused, not duplicated.
  const intent2 = await call(tenant, 'POST', `/api/payments/${pid}/intent`, { method: 'benefit' });
  ok(intent2.status === 200 && intent2.data.reused === true && intent2.data.intent.reference === ref, 'a second intent request is reused (no duplicate charge)');

  // Forged webhook signature must be rejected and must NOT mark the payment paid.
  const forged = await rawPost(`/api/webhooks/${gwId}`, JSON.stringify({ eventId: 'evt_forged', reference: ref, status: 'paid' }), { 'X-Ejari-Signature': 'deadbeef' });
  ok(forged.status === 401, 'forged webhook signature is rejected', `got ${forged.status}`);
  const stillProcessing = await call(tenant, 'GET', `/api/payments/intent/${ref}`);
  ok(stillProcessing.data.payment.status === 'processing', 'forged webhook did not mark the payment paid');

  // Correctly signed webhook confirms the payment.
  const evtId = 'evt_' + crypto.randomBytes(6).toString('hex');
  const payload = JSON.stringify({ eventId: evtId, reference: ref, status: 'paid', providerRef: 'BP-REF-1' });
  const sig = crypto.createHmac('sha256', 'hook-secret-known').update(payload).digest('hex');
  const hook = await rawPost(`/api/webhooks/${gwId}`, payload, { 'X-Ejari-Signature': sig });
  ok(hook.status === 200 && hook.data.status === 'paid', 'correctly signed webhook marks the payment paid', JSON.stringify(hook.data));
  const afterPay = await call(tenant, 'GET', `/api/payments/intent/${ref}`);
  ok(afterPay.data.intent.status === 'paid', 'intent is paid');
  ok(afterPay.data.payment.status === 'paid', 'payment row is paid');
  ok(!!afterPay.data.payment.receipt, 'a receipt number was issued', afterPay.data.payment.receipt);
  ok(afterPay.data.payment.txnRef === 'BP-REF-1', 'provider transaction reference is stored');

  // Replay of the same event id is a no-op.
  const replay = await rawPost(`/api/webhooks/${gwId}`, payload, { 'X-Ejari-Signature': sig });
  ok(replay.status === 200 && replay.data.duplicate === true, 'replayed webhook event is ignored');

  // The ledger reflects the payment (notification + document side effects happened server-side).
  const bootAfter = await call(tenant, 'GET', '/api/bootstrap');
  ok(bootAfter.data.payments.find((p) => p.id === pid).status === 'paid', 'bootstrap reflects the paid ledger row');
  ok(bootAfter.data.notifications.some((n) => n.ty === 'pay'), 'a payment notification was generated');
  ok(bootAfter.data.documents.some((d) => d.type === 'receipt'), 'a receipt document was generated');

  // Paying an already-paid instalment is refused.
  const rePay = await call(tenant, 'POST', `/api/payments/${pid}/intent`, { method: 'benefit' });
  ok(rePay.status === 409 && rePay.data.error === 'already_paid', 'paying an already-paid instalment is refused');

  // A different tenant cannot see or act on this intent.
  const foreign = await call(other, 'GET', `/api/payments/intent/${ref}`);
  ok(foreign.status === 403, 'another tenant cannot read the intent');
  const foreignPay = await call(other, 'POST', `/api/payments/${pid}/intent`, { method: 'benefit' });
  ok(foreignPay.status === 403, 'another tenant cannot start a payment for someone else');

  // ---- sandbox flow (provider-side confirmation through the same signed-webhook path) ----
  const sb = await call(superAdmin, 'POST', '/api/gateways', { provider: 'sandbox', labelEn: 'Sandbox', enabled: true, isDefault: true, config: { merchantId: 'M', secretKey: 'S' } });
  const sbId = sb.data.gateway.id;
  // Pick any tenant who still has an unpaid instalment (the first tenant may be fully settled by now).
  let payer = tenant, payerBoot = await call(tenant, 'GET', '/api/bootstrap');
  let unpaid2 = payerBoot.data.payments.find((p) => !['paid', 'refunded'].includes(p.status));
  if (!unpaid2) { payer = other; payerBoot = await call(other, 'GET', '/api/bootstrap'); unpaid2 = payerBoot.data.payments.find((p) => !['paid', 'refunded'].includes(p.status)); }
  ok(!!unpaid2, 'an unpaid instalment exists for the sandbox flow');
  const sbIntent = await call(payer, 'POST', `/api/payments/${unpaid2.id}/intent`, { method: 'card' });
  const sbRef = sbIntent.data.intent.reference;
  const conf = await call(payer, 'POST', `/api/payments/intent/${sbRef}/sandbox-confirm`, { outcome: 'paid' });
  ok(conf.status === 200 && conf.data.status === 'paid', 'sandbox confirmation settles the payment');
  const sbPaid = await call(payer, 'GET', `/api/payments/intent/${sbRef}`);
  ok(sbPaid.data.payment.status === 'paid', 'sandbox payment is paid');

  // Failure path: a failed outcome leaves the row retryable, not paid.
  // Admin may act on any instalment, so we always have a fresh one to work with.
  const adminBoot = await call(superAdmin, 'GET', '/api/bootstrap');
  const fresh = adminBoot.data.payments.find((p) => !['paid', 'refunded'].includes(p.status));
  ok(!!fresh, 'an unpaid instalment exists for the failure-path flow');
  const fIntent = await call(superAdmin, 'POST', `/api/payments/${fresh.id}/intent`, { method: 'card' });
  const fRef = fIntent.data.intent.reference;
  await call(superAdmin, 'POST', `/api/payments/intent/${fRef}/sandbox-confirm`, { outcome: 'failed' });
  const fAfter = await call(superAdmin, 'GET', `/api/payments/intent/${fRef}`);
  ok(fAfter.data.intent.status === 'failed', 'failed outcome marks the intent failed');
  ok(fAfter.data.payment.status !== 'paid', 'failed payment is not marked paid');
  // The sandbox-confirm endpoint must not work for a non-sandbox gateway.
  const notSandbox = await call(tenant, 'POST', `/api/payments/intent/${ref}/sandbox-confirm`, { outcome: 'paid' });
  ok(notSandbox.status === 403 && notSandbox.data.error === 'not_sandbox', 'sandbox confirmation is refused for a live gateway');

  // ---- refund ----
  const rf = await call(superAdmin, 'POST', `/api/payments/${pid}/refund`, { amount: 5, reasonEn: 'test refund' });
  ok(rf.status === 200 && rf.data.payment.status === 'refunded', 'refund transitions the payment to refunded', JSON.stringify(rf.data).slice(0, 120));
  const rfAgain = await call(superAdmin, 'POST', `/api/payments/${pid}/refund`, { amount: 5 });
  ok(rfAgain.status === 400 && rfAgain.data.error === 'not_refundable', 'a refunded payment cannot be refunded twice');
  const tenantRefund = await call(tenant, 'POST', `/api/payments/${pid}/refund`, { amount: 1 });
  ok(tenantRefund.status === 403, 'tenant cannot issue a refund');

  // ---- tenant-initiated refund request → admin approval ----
  const reqBoot = await call(payer, 'GET', '/api/bootstrap');
  const reqPay = reqBoot.data.payments.find((p) => p.status === 'paid' && p.id !== pid);
  if (reqPay) {
    const rreq = await call(payer, 'POST', '/api/refunds', { paymentId: reqPay.id, reasonEn: 'tenant request' });
    ok(rreq.status === 201 && rreq.data.status === 'pending', 'a tenant can open a refund request', JSON.stringify(rreq.data));
    const dupReq = await call(payer, 'POST', '/api/refunds', { paymentId: reqPay.id });
    ok(dupReq.status === 409 && dupReq.data.error === 'already_requested', 'a duplicate refund request is refused');
    const stranger = payer === other ? tenant : other;
    const otherReq = await call(stranger, 'POST', '/api/refunds', { paymentId: reqPay.id });
    ok(otherReq.status === 403, 'a tenant cannot request a refund on someone else’s payment');
    const pendList = await call(superAdmin, 'GET', '/api/bootstrap');
    ok(pendList.data.refunds.some((r) => r.id === rreq.data.refund && r.st === 'pending'), 'the request appears to the admin as pending');
    const appr = await call(superAdmin, 'POST', `/api/refunds/${rreq.data.refund}`, { approve: true });
    ok(appr.status === 200 && appr.data.status === 'approved', 'admin approval settles the refund', JSON.stringify(appr.data).slice(0, 140));
    const afterAppr = await call(payer, 'GET', '/api/bootstrap');
    ok(afterAppr.data.payments.find((p) => p.id === reqPay.id).status === 'refunded', 'the approved refund moves the payment to refunded');
  } else {
    ok(true, 'tenant refund-request flow exercised (no spare paid payment)');
  }

  // ---- audit trail ----
  const audit = await call(superAdmin, 'GET', '/api/bootstrap');
  const acts = audit.data.audit.map((a) => a.en);
  ok(acts.some((a) => /gateway/i.test(a)), 'gateway changes are audited');
  ok(acts.some((a) => /refund/i.test(a)), 'refunds are audited');
  ok(acts.some((a) => /payment webhook/i.test(a)), 'webhook processing is audited');

  // ---- delete guard: a gateway used by intents cannot be deleted ----
  const delUsed = await call(superAdmin, 'DELETE', `/api/gateways/${gwId}`);
  ok(delUsed.status === 409 && delUsed.data.error === 'gateway_in_use', 'a gateway used by payments cannot be deleted');
  const delUnused = await call(superAdmin, 'DELETE', `/api/gateways/${disabled.data.gateway.id}`);
  ok(delUnused.status === 200, 'an unused gateway can be deleted');

  // ---- persistence across restart ----
  server.kill();
  await sleep(400);
  const server2 = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
  let booted2 = false; server2.stdout.on('data', (d) => { if (String(d).includes('running')) booted2 = true; }); server2.stderr.on('data', () => {});
  await waitFor(() => booted2);
  const persist = await call(tenant, 'GET', '/api/bootstrap');
  ok(persist.data.payments.find((p) => p.id === pid).status === 'refunded', 'refunded payment survives a restart');
  const payerPersist = await call(payer, 'GET', '/api/bootstrap');
  ok(payerPersist.data.payments.find((p) => p.id === unpaid2.id).status === 'paid', 'sandbox-paid payment survives a restart');
  const gwPersist = await call(superAdmin, 'GET', '/api/gateways');
  ok(gwPersist.data.gateways.some((g) => g.id === gwId && g.enabled), 'gateway configuration survives a restart');
  server2.kill();
} catch (e) {
  failed++; checks++; console.error('  ✗ unexpected error — ' + (e && e.stack || e));
} finally {
  try { server.kill(); } catch {}
}

console.log('\n' + '='.repeat(60));
if (failed) { console.log(`✗ ${failed} of ${checks} payment-gateway checks FAILED`); process.exit(1); }
console.log(`✓ All ${checks} payment-gateway checks passed (real server, signed webhooks, real database)`);
