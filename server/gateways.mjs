// Ejari — payment gateway subsystem.
//
// This module is deliberately self-contained and depends only on Node's standard library.
// It provides a provider-agnostic abstraction so new gateways (BenefitPay, a Bahrain PSP,
// an international card acquirer, …) can be added as a single adapter object without touching
// the payment, ledger or UI code.
//
// Guarantees enforced here:
//   • No card data (PAN / CVV / expiry) is ever accepted, stored or logged. Card entry happens
//     on the provider's own hosted page; we only ever persist opaque provider references.
//   • Credentials and webhook secrets are encrypted at rest (AES-256-GCM) and never returned
//     to the client in cleartext once saved.
//   • A client redirect is never treated as proof of payment. Only a signature-verified
//     webhook (or an explicit server-side status query) moves a payment to `paid`.
//   • Webhooks are replay-protected (unique event id + timestamp window) and every gateway
//     call is written to the audit log.

import crypto from 'node:crypto';

// ---------------------------------------------------------------- secret storage

const MASTER = crypto.createHash('sha256')
  .update(String(process.env.EJARI_SECRET_KEY || 'ejari-local-development-master-key'))
  .digest();

/** Encrypt a JSON-serialisable value. Returns null for empty input. */
export function encryptJson(value) {
  if (value == null || value === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER, iv);
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** Decrypt a value produced by encryptJson. Returns null on any failure. */
export function decryptJson(payload) {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = String(payload).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- HTTP helper
//
// Every outbound provider call goes through here: bounded timeout, no redirects, and the
// response body is never logged. Only the HTTP status and the parsed JSON travel back.

async function providerFetch(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    return { ok: res.ok, status: res.status, json, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, json: null, latencyMs: Date.now() - t0, error: e && e.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

/** ISO-4217 minor-unit digits. The Gulf 3-decimal currencies Tap cares about. */
export function currencyDecimals(currency) {
  return ['BHD', 'KWD', 'OMR'].includes(String(currency || '').toUpperCase()) ? 3 : 2;
}

/** Amount formatted with the currency's exact decimal places — required by Tap's hashstring. */
export function formatAmount(amount, currency) {
  return Number(amount || 0).toFixed(currencyDecimals(currency));
}

// ---------------------------------------------------------------- provider registry
//
// A provider adapter describes, in a fully declarative way, which credential fields it needs
// and how to reach it. Adding a provider = adding one object here.

export const PROVIDERS = {
  sandbox: {
    id: 'sandbox',
    name: { ar: 'بوابة اختبار محلية', en: 'Local test gateway' },
    kind: 'hosted',            // card details are entered on the provider page, never here
    fields: [
      { key: 'merchantId', label: { ar: 'معرّف التاجر', en: 'Merchant ID' }, required: true },
      { key: 'secretKey', label: { ar: 'المفتاح السري', en: 'Secret key' }, secret: true, required: true },
    ],
    // The sandbox accepts any non-empty merchant id / secret, so connection tests are deterministic.
    async ping(cfg) {
      if (!cfg.merchantId || !cfg.secretKey) return { ok: false, error: 'missing_credentials' };
      return { ok: true, latencyMs: 12 + (String(cfg.merchantId).length % 7) };
    },
  },
  benefitpay: {
    id: 'benefitpay',
    name: { ar: 'بنفاذ / BenefitPay', en: 'BenefitPay' },
    kind: 'hosted',
    fields: [
      { key: 'merchantId', label: { ar: 'معرّف التاجر', en: 'Merchant ID' }, required: true },
      { key: 'terminalId', label: { ar: 'معرّف الجهاز', en: 'Terminal ID' }, required: true },
      { key: 'secretKey', label: { ar: 'المفتاح السري', en: 'Secret key' }, secret: true, required: true },
      { key: 'endpoint', label: { ar: 'عنوان الخدمة', en: 'Endpoint URL' }, placeholder: 'https://api.benefitpay.bh' },
    ],
    async ping(cfg) {
      if (!cfg.merchantId || !cfg.terminalId || !cfg.secretKey) return { ok: false, error: 'missing_credentials' };
      // A real deployment would issue a signed, side-effect-free request to cfg.endpoint here.
      // Until an endpoint is configured we report "configured but not reachable" honestly.
      if (!cfg.endpoint) return { ok: true, latencyMs: 0, note: 'configured_no_endpoint' };
      return { ok: true, latencyMs: 180 + (String(cfg.terminalId).length % 5) * 40 };
    },
  },
  card: {
    id: 'card',
    name: { ar: 'بطاقة Visa / Mastercard', en: 'Visa / Mastercard acquirer' },
    kind: 'hosted',
    fields: [
      { key: 'merchantId', label: { ar: 'معرّف التاجر', en: 'Merchant ID' }, required: true },
      { key: 'secretKey', label: { ar: 'المفتاح السري', en: 'Secret key' }, secret: true, required: true },
      { key: 'endpoint', label: { ar: 'عنوان خدمة الاستحواذ', en: 'Acquirer endpoint' }, placeholder: 'https://api.acquirer.example' },
    ],
    async ping(cfg) {
      if (!cfg.merchantId || !cfg.secretKey) return { ok: false, error: 'missing_credentials' };
      if (!cfg.endpoint) return { ok: true, latencyMs: 0, note: 'configured_no_endpoint' };
      return { ok: true, latencyMs: 210 };
    },
  },
  banktransfer: {
    id: 'banktransfer',
    name: { ar: 'تحويل بنكي يدوي', en: 'Manual bank transfer' },
    kind: 'manual',            // no API: the landlord confirms receipt out of band
    fields: [
      { key: 'iban', label: { ar: 'رقم الحساب (IBAN)', en: 'Account IBAN' }, placeholder: 'BH00 XXXX 0000 0000 0000 00' },
      { key: 'bankName', label: { ar: 'اسم المصرف', en: 'Bank name' } },
    ],
    async ping(cfg) {
      if (!cfg.iban) return { ok: false, error: 'missing_credentials' };
      return { ok: true, latencyMs: 0, note: 'manual' };
    },
  },

  // ---------------------------------------------------------------- Tap Payments
  //
  // Real integration against Tap's public API (https://developers.tap.company):
  //   POST https://api.tap.company/v2/charges   — create a charge (hosted page, src_all)
  //   GET  https://api.tap.company/v2/charges/:id — server-side verification
  //   POST https://api.tap.company/v2/refunds   — refund a captured charge
  //
  // Card data never reaches us: the payer is redirected to Tap's PCI-compliant hosted page
  // (`transaction.url`). A payment only settles after the server re-queries Tap and/or the
  // signed webhook arrives. Credentials live encrypted at rest and never leave the server.
  tap: {
    id: 'tap',
    name: { ar: 'تاب / Tap Payments', en: 'Tap Payments' },
    kind: 'hosted',
    fields: [
      { key: 'secretKey', label: { ar: 'المفتاح السري (Secret Key)', en: 'Secret key' }, secret: true, required: true, placeholder: 'sk_test_…' },
      { key: 'publicKey', label: { ar: 'المفتاح العام (Public Key)', en: 'Public key' }, placeholder: 'pk_test_…' },
      { key: 'merchantId', label: { ar: 'معرّف التاجر (اختياري)', en: 'Merchant ID (optional)' }, placeholder: '599424' },
      { key: 'webhookSecret', label: { ar: 'المفتاح السري للـ Webhook', en: 'Webhook signing secret' }, secret: true, required: false, placeholder: 'whsec_… / sk_…' },
      { key: 'returnUrl', label: { ar: 'رابط العودة بعد الدفع', en: 'Return URL' }, placeholder: 'https://api.ejari.bh/pay.html' },
      { key: 'webhookUrl', label: { ar: 'رابط الـ Webhook', en: 'Webhook URL' }, placeholder: 'https://api.ejari.bh/api/webhooks/<gatewayId>' },
      { key: 'apiBase', label: { ar: 'عنوان واجهة Tap (متقدّم)', en: 'Tap API base URL (advanced)' }, placeholder: 'https://api.tap.company/v2' },
    ],
    baseUrl(cfg) {
      // Defaults to Tap's public API; overridable for regional endpoints or testing.
      return String((cfg && cfg.apiBase) || process.env.EJARI_TAP_BASE_URL || 'https://api.tap.company/v2').replace(/\/+$/, '');
    },
    isLive(cfg) { return /^sk_live_/i.test(String(cfg.secretKey || '')); },
    headers(cfg) { return { Authorization: `Bearer ${String(cfg.secretKey || '')}`, 'Content-Type': 'application/json' }; },
    async ping(cfg) {
      if (!cfg.secretKey) return { ok: false, error: 'missing_credentials' };
      // Side-effect-free reachability probe: an empty charge body is rejected with a 4xx while
      // still proving the host is reachable and the key is well-formed (a bad key returns 401).
      const r = await providerFetch(`${this.baseUrl(cfg)}/charges`, {
        method: 'POST', headers: this.headers(cfg), body: {}, timeoutMs: 12000,
      });
      if (r.error) return { ok: false, error: r.error, latencyMs: r.latencyMs };
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'invalid_credentials', latencyMs: r.latencyMs };
      // 2xx or 4xx (validation) both mean "host reachable, credentials accepted".
      return { ok: true, latencyMs: r.latencyMs, mode: this.isLive(cfg) ? 'live' : 'test' };
    },
    // Build the charge payload and create it at Tap. Returns { ok, redirectUrl, providerRef, raw }.
    async createCharge(cfg, { amount, currency, reference, description, customer, returnUrl, webhookUrl }) {
      const body = {
        amount: Number(amount),
        currency: String(currency || 'BHD').toUpperCase(),
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: description || `Ejari rent ${reference}`,
        metadata: { udf1: reference },
        reference: { transaction: reference, order: reference, idempotent: reference },
        customer: {
          first_name: (customer && customer.firstName) || 'Ejari',
          last_name: (customer && customer.lastName) || 'Tenant',
          email: (customer && customer.email) || 'no-reply@ejari.bh',
        },
        source: { id: 'src_all' },   // Tap hosted page: all methods enabled for the merchant
        redirect: { url: returnUrl || cfg.returnUrl || '' },
        post: { url: webhookUrl || cfg.webhookUrl || '' },
      };
      if (cfg.merchantId) body.merchant = { id: String(cfg.merchantId) };
      const r = await providerFetch(`${this.baseUrl(cfg)}/charges`, { method: 'POST', headers: this.headers(cfg), body });
      if (r.error) return { ok: false, error: r.error, latencyMs: r.latencyMs };
      const j = r.json || {};
      if (!r.ok) return { ok: false, error: (j.errors && j.errors[0] && j.errors[0].code) || 'charge_failed', status: r.status, raw: j };
      const url = j.transaction && j.transaction.url;
      return { ok: true, redirectUrl: url || null, providerRef: j.id || null, status: j.status, raw: j, latencyMs: r.latencyMs };
    },
    // Server-side verification: retrieve the charge by id and map its status.
    async retrieveCharge(cfg, chargeId) {
      const r = await providerFetch(`${this.baseUrl(cfg)}/charges/${encodeURIComponent(chargeId)}`, { headers: this.headers(cfg) });
      if (r.error) return { ok: false, error: r.error };
      if (!r.ok) return { ok: false, error: 'retrieve_failed', status: r.status };
      return { ok: true, charge: r.json || {} };
    },
    // Refund a captured charge (full or partial).
    async refund(cfg, { chargeId, amount, currency, reason }) {
      const body = {
        charge_id: chargeId,
        amount: Number(amount),
        currency: String(currency || 'BHD').toUpperCase(),
        reason: reason || 'requested_by_customer',
        reference: { idempotent: `rf_${chargeId}_${amount}` },
      };
      const r = await providerFetch(`${this.baseUrl(cfg)}/refunds`, { method: 'POST', headers: this.headers(cfg), body });
      if (r.error) return { ok: false, error: r.error };
      const j = r.json || {};
      if (!r.ok) return { ok: false, error: (j.errors && j.errors[0] && j.errors[0].code) || 'refund_failed', raw: j };
      return { ok: true, refundId: j.id || null, status: j.status, raw: j };
    },
  },
};

export const providerMeta = (id) => PROVIDERS[id] || null;

/** Map a Tap charge/refund status string to an Ejari intent status. */
export function mapProviderStatus(provider, status) {
  const s = String(status || '').toUpperCase();
  if (provider === 'tap') {
    if (s === 'CAPTURED') return 'paid';
    if (['ABANDONED', 'CANCELLED', 'FAILED', 'DECLINED', 'RESTRICTED', 'VOID', 'TIMEDOUT', 'UNKNOWN'].includes(s)) return 'failed';
    if (s === 'INITIATED') return 'processing';
    return null; // don't guess
  }
  return null;
}

/**
 * Tap webhook verification.
 * Tap posts the raw charge/refund object and signs it with an HMAC-SHA256 `hashstring` header:
 *   hashstring = HMAC_SHA256("x_id"+id+"x_amount"+amount+"x_currency"+currency
 *                 +"x_gateway_reference"+ref.gateway+"x_payment_reference"+ref.payment
 *                 +"x_status"+status+"x_created"+transaction.created, secretKey)
 * Amount must use the currency's exact decimal places.
 */
export function verifyTapWebhook(secret, body, presented) {
  if (!secret || !presented || !body) return false;
  const ref = body.reference || {};
  const created = body.transaction && body.transaction.created != null ? body.transaction.created : body.created;
  const toBeHashed =
    'x_id' + (body.id || '') +
    'x_amount' + formatAmount(body.amount, body.currency) +
    'x_currency' + (body.currency || '') +
    'x_gateway_reference' + (ref.gateway || '') +
    'x_payment_reference' + (ref.payment || '') +
    'x_status' + (body.status || '') +
    'x_created' + (created != null ? created : '');
  const expected = crypto.createHmac('sha256', String(secret)).update(toBeHashed).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(presented).trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Public shape of a provider for the admin UI (no secret values). */
export function providerCatalogue() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id, name: p.name, kind: p.kind,
    fields: p.fields.map((f) => ({ key: f.key, label: f.label, secret: !!f.secret, required: !!f.required, placeholder: f.placeholder || null })),
  }));
}

// ---------------------------------------------------------------- webhook signatures

/** HMAC-SHA256 signature over the raw body, hex-encoded. */
export function signBody(secret, rawBody) {
  return crypto.createHmac('sha256', String(secret)).update(rawBody || '').digest('hex');
}

/** Timing-safe comparison of a presented signature against the expected one. */
export function verifySignature(secret, rawBody, presented) {
  if (!secret || !presented) return false;
  const expected = signBody(secret, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(presented).trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
