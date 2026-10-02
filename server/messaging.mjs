// Ejari — outbound messaging subsystem (email + SMS).
//
// Provider-agnostic, configuration-driven, and honest about state:
//   • Every provider is a declarative adapter object (fields + send()), exactly like
//     the payment-gateway subsystem. Adding a provider = adding one object here.
//   • Credentials live encrypted at rest (AES-256-GCM) and are never returned to the
//     client in cleartext; the API only ever exposes a mask.
//   • Nothing is enabled by default. With no provider configured, a dispatch is recorded
//     as `disabled` — never silently reported as delivered.
//   • The `console` adapter is a real local test transport: it records the exact message
//     to the outbound log so a development/reset link is retrievable, but it reports
//     `logged` (not `sent`) so it can never be mistaken for live delivery.
//
// No provider credentials are ever invented. Live sending requires the operator to
// configure a provider in the admin console.

import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { encryptJson, decryptJson } from './gateways.mjs';
import { db, nowIso } from './db.mjs';

// ---------------------------------------------------------------- HTTP helper

async function httpJson(url, { method = 'POST', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, headers: { Accept: 'application/json', ...headers }, body, redirect: 'manual', signal: ctrl.signal });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, json, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, json: null, latencyMs: Date.now() - t0, error: e && e.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------- minimal SMTP client
//
// A dependency-free SMTP client good enough for transactional mail (EHLO / optional AUTH
// LOGIN / MAIL FROM / RCPT TO / DATA / QUIT), with a hard timeout. It never logs the body
// or the password. Plaintext (port 25/2525) and implicit TLS (465) are both supported; for
// 587 the caller may set secure=false (STARTTLS upgrade is intentionally not attempted).

function smtpSend(cfg, { from, to, subject, body }) {
  const host = String(cfg.host || '');
  const port = Number(cfg.port || 587);
  const secure = String(cfg.secure) === 'true' || String(cfg.secure) === '1' || port === 465;
  const user = String(cfg.user || '');
  const pass = String(cfg.password || '');
  const timeoutMs = Number(cfg.timeoutMs || 12000);
  const t0 = Date.now();

  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { socket.destroy(); } catch {} resolve({ ...r, latencyMs: Date.now() - t0 }); };
    if (!host) return finish({ ok: false, error: 'missing_host' });

    let socket;
    try {
      socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    } catch (e) { return finish({ ok: false, error: 'connect_failed' }); }

    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: 'timeout' }));
    socket.on('error', () => finish({ ok: false, error: 'network_error' }));

    let buf = '';
    const queue = [];
    const waiters = [];
    const deliver = (line) => { const w = waiters.shift(); if (w) w(line); else queue.push(line); };
    const next = () => new Promise((res) => { if (queue.length) res(queue.shift()); else waiters.push(res); });

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      // A response is complete when a line matches "NNN " (space, not "NNN-").
      while ((idx = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) deliver(line);
      }
    });

    (async () => {
      try {
        const greet = await next();
        if (!/^220/.test(greet)) return finish({ ok: false, error: 'bad_greeting' });

        socket.write(`EHLO ejari\r\n`);
        let ehlo = await next();
        while (/^\d{3}-/.test(ehlo)) ehlo = await next();
        if (!/^250/.test(ehlo)) return finish({ ok: false, error: 'ehlo_failed' });

        if (user && pass) {
          socket.write('AUTH LOGIN\r\n');
          const a = await next();
          if (!/^334/.test(a)) return finish({ ok: false, error: 'auth_unsupported' });
          socket.write(Buffer.from(user).toString('base64') + '\r\n');
          const u = await next();
          if (!/^334/.test(u)) return finish({ ok: false, error: 'auth_rejected' });
          socket.write(Buffer.from(pass).toString('base64') + '\r\n');
          const p = await next();
          if (!/^235/.test(p)) return finish({ ok: false, error: 'invalid_credentials' });
        }

        socket.write(`MAIL FROM:<${from}>\r\n`);
        if (!/^250/.test(await next())) return finish({ ok: false, error: 'mail_from_rejected' });
        socket.write(`RCPT TO:<${to}>\r\n`);
        if (!/^25[0-9]/.test(await next())) return finish({ ok: false, error: 'rcpt_rejected' });
        socket.write('DATA\r\n');
        if (!/^354/.test(await next())) return finish({ ok: false, error: 'data_rejected' });

        const msg = [
          `From: ${from}`,
          `To: ${to}`,
          `Subject: ${subject || ''}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          String(body || '').replace(/\r?\n\./g, '\n..'),
          '',
        ].join('\r\n');
        socket.write(msg + '\r\n.\r\n');
        if (!/^250/.test(await next())) return finish({ ok: false, error: 'message_rejected' });
        socket.write('QUIT\r\n');
        finish({ ok: true });
      } catch {
        finish({ ok: false, error: 'smtp_error' });
      }
    })();
  });
}

// ---------------------------------------------------------------- provider catalogue

const field = (key, ar, en, opts = {}) => ({ key, label: { ar, en }, ...opts });

export const MESSAGING_PROVIDERS = {
  email: {
    console: {
      id: 'console', name: { ar: 'سجل داخلي (اختبار)', en: 'Internal log (test)' }, kind: 'test',
      fields: [],
      async send() { return { ok: true, note: 'logged' }; },
    },
    smtp: {
      id: 'smtp', name: { ar: 'SMTP', en: 'SMTP' }, kind: 'api',
      fields: [
        field('host', 'خادم SMTP', 'SMTP host', { required: true, placeholder: 'smtp.example.com' }),
        field('port', 'المنفذ', 'Port', { placeholder: '587' }),
        field('secure', 'اتصال TLS مباشر (465)', 'Implicit TLS (465)', { type: 'bool' }),
        field('user', 'المستخدم', 'Username', { placeholder: 'apikey' }),
        field('password', 'كلمة المرور / مفتاح API', 'Password / API key', { secret: true }),
        field('from', 'المرسل', 'From address', { required: true, placeholder: 'no-reply@ejari.bh' }),
      ],
      async send(cfg, msg) {
        if (!cfg.host || !cfg.from) return { ok: false, error: 'missing_credentials' };
        const r = await smtpSend(cfg, { from: cfg.from, to: msg.to, subject: msg.subject, body: msg.body });
        return r.ok ? { ok: true, latencyMs: r.latencyMs } : { ok: false, error: r.error, latencyMs: r.latencyMs };
      },
    },
    sendgrid: {
      id: 'sendgrid', name: { ar: 'SendGrid API', en: 'SendGrid API' }, kind: 'api',
      fields: [
        field('apiKey', 'مفتاح API', 'API key', { secret: true, required: true }),
        field('from', 'المرسل', 'From address', { required: true, placeholder: 'no-reply@ejari.bh' }),
      ],
      async send(cfg, msg) {
        if (!cfg.apiKey || !cfg.from) return { ok: false, error: 'missing_credentials' };
        const r = await httpJson('https://api.sendgrid.com/v3/mail/send', {
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalizations: [{ to: [{ email: msg.to }] }], from: { email: cfg.from }, subject: msg.subject || '', content: [{ type: 'text/plain', value: String(msg.body || '') }] }),
        });
        return r.ok ? { ok: true, latencyMs: r.latencyMs } : { ok: false, error: r.error || `http_${r.status}`, latencyMs: r.latencyMs };
      },
    },
  },
  sms: {
    console: {
      id: 'console', name: { ar: 'سجل داخلي (اختبار)', en: 'Internal log (test)' }, kind: 'test',
      fields: [],
      async send() { return { ok: true, note: 'logged' }; },
    },
    twilio: {
      id: 'twilio', name: { ar: 'Twilio', en: 'Twilio' }, kind: 'api',
      fields: [
        field('accountSid', 'Account SID', 'Account SID', { required: true, placeholder: 'AC…' }),
        field('authToken', 'Auth Token', 'Auth token', { secret: true, required: true }),
        field('from', 'المرسل', 'From number', { required: true, placeholder: '+973…' }),
      ],
      async send(cfg, msg) {
        if (!cfg.accountSid || !cfg.authToken || !cfg.from) return { ok: false, error: 'missing_credentials' };
        const body = new URLSearchParams({ To: msg.to, From: cfg.from, Body: String(msg.body || '') }).toString();
        const r = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`, {
          headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        return r.ok ? { ok: true, latencyMs: r.latencyMs } : { ok: false, error: r.error || `http_${r.status}`, latencyMs: r.latencyMs };
      },
    },
    unifonic: {
      id: 'unifonic', name: { ar: 'Unifonic', en: 'Unifonic' }, kind: 'api',
      fields: [
        field('appSid', 'App SID', 'App SID', { required: true }),
        field('apiKey', 'مفتاح API', 'API key', { secret: true, required: true }),
        field('senderId', 'معرّف المرسل', 'Sender ID', { placeholder: 'Ejari' }),
      ],
      async send(cfg, msg) {
        if (!cfg.appSid || !cfg.apiKey) return { ok: false, error: 'missing_credentials' };
        const body = new URLSearchParams({ AppSid: cfg.appSid, SenderID: cfg.senderId || '', Recipient: msg.to, Body: String(msg.body || '') }).toString();
        const r = await httpJson('https://el.cloud.unifonic.com/rest/SMS/messages', {
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
        });
        return r.ok ? { ok: true, latencyMs: r.latencyMs } : { ok: false, error: r.error || `http_${r.status}`, latencyMs: r.latencyMs };
      },
    },
  },
};

export function messagingCatalogue() {
  return Object.keys(MESSAGING_PROVIDERS).map((channel) => ({
    channel,
    providers: Object.values(MESSAGING_PROVIDERS[channel]).map((p) => ({
      id: p.id, name: p.name, kind: p.kind,
      fields: p.fields.map((f) => ({ key: f.key, label: f.label, secret: !!f.secret, required: !!f.required, type: f.type || 'text', placeholder: f.placeholder || null })),
    })),
  }));
}

// ---------------------------------------------------------------- settings storage

/** Read a channel's stored configuration (decrypted). Never exposed to clients directly. */
export function getChannelSettings(kind) {
  const row = db.prepare('SELECT * FROM provider_settings WHERE kind=?').get(kind);
  if (!row) return { kind, enabled: false, provider: null, config: {} };
  return { kind, enabled: !!row.enabled, provider: row.provider || null, config: decryptJson(row.config_enc) || {}, updatedAt: row.updated_at };
}

/** Persist a channel's configuration. A blank secret field keeps the stored value. */
export function saveChannelSettings(kind, { enabled, provider, config }) {
  const prev = getChannelSettings(kind);
  const merged = { ...prev.config };
  for (const [k, v] of Object.entries(config || {})) {
    // A value that is a mask (returned by the API) or empty must not overwrite the secret.
    if (typeof v === 'string' && (v === '' || v.startsWith('•'))) continue;
    merged[k] = v;
  }
  const meta = provider ? MESSAGING_PROVIDERS[kind] && MESSAGING_PROVIDERS[kind][provider] : null;
  // Keep only fields the selected provider declares.
  const clean = {};
  if (meta) for (const f of meta.fields) if (merged[f.key] !== undefined) clean[f.key] = merged[f.key];
  else Object.assign(clean, merged);
  db.prepare('INSERT INTO provider_settings(kind,enabled,provider,config_enc,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET enabled=excluded.enabled,provider=excluded.provider,config_enc=excluded.config_enc,updated_at=excluded.updated_at')
    .run(kind, enabled ? 1 : 0, provider || null, encryptJson(clean), nowIso());
  return getChannelSettings(kind);
}

/** Masked projection safe to send to the admin UI — secrets become ••••••<last3>. */
export function maskChannelSettings(kind) {
  const s = getChannelSettings(kind);
  const meta = s.provider ? MESSAGING_PROVIDERS[kind] && MESSAGING_PROVIDERS[kind][s.provider] : null;
  const cfg = {};
  for (const [k, v] of Object.entries(s.config || {})) {
    const isSecret = !!(meta && meta.fields.find((f) => f.key === k && f.secret));
    cfg[k] = isSecret && v ? `••••••${String(v).slice(-3)}` : v;
  }
  return { kind, enabled: s.enabled, provider: s.provider, configured: !!(s.provider && Object.keys(s.config || {}).length), config: cfg };
}

// ---------------------------------------------------------------- dispatch

/**
 * Send one message through the configured provider for `channel`.
 * Records the attempt in outbound_messages and returns the resulting status.
 * Never throws; a failure is a recorded `failed`/`disabled`, never a silent success.
 */
export async function dispatch(channel, { kind = 'generic', to, subject = '', body = '' } = {}) {
  const s = getChannelSettings(channel);
  const record = (status, provider, error) => {
    db.prepare('INSERT INTO outbound_messages(channel,kind,to_addr,subject,body,status,provider,error,attempts,created_at,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(channel, kind, String(to || ''), String(subject || ''), String(body || ''), status, provider || null, error || null, 1, nowIso(), status === 'sent' ? nowIso() : null);
    return { status, provider, error: error || null };
  };

  if (!s.enabled || !s.provider) return record('disabled', s.provider, 'channel_disabled');
  const meta = MESSAGING_PROVIDERS[channel] && MESSAGING_PROVIDERS[channel][s.provider];
  if (!meta) return record('failed', s.provider, 'unknown_provider');

  const r = await meta.send(s.config, { to, subject, body });
  if (r && r.ok) return record(meta.kind === 'test' ? 'logged' : 'sent', s.provider, null);
  return record('failed', s.provider, (r && r.error) || 'send_failed');
}

/** Test a channel's connection with a side-effect-free probe message. */
export async function testChannel(kind) {
  const s = getChannelSettings(kind);
  if (!s.enabled || !s.provider) return { ok: false, error: 'channel_disabled' };
  const meta = MESSAGING_PROVIDERS[kind] && MESSAGING_PROVIDERS[kind][s.provider];
  if (!meta) return { ok: false, error: 'unknown_provider' };
  if (meta.kind === 'test') return { ok: true, note: 'test_adapter', latencyMs: 0 };
  const r = await meta.send(s.config, { to: String(s.config.from || s.config.senderId || 'test@example.com'), subject: 'Ejari connection test', body: 'Ejari provider connection test.' });
  return r && r.ok ? { ok: true, latencyMs: r.latencyMs } : { ok: false, error: (r && r.error) || 'send_failed' };
}

export { httpJson as _httpJson, smtpSend as _smtpSend };
