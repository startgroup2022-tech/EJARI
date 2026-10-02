// Ejari — messaging + password-reset verification (real server, real database, real HTTP).
//
// Proves the outbound email/SMS subsystem and the self-service password reset end to end:
//   • channels start disabled with no provider — a dispatch is recorded as `disabled`, never `sent`
//   • configurable providers with encrypted, non-echoed, blank-preserving credentials
//   • the `console` test adapter really records the message and reports `logged` (not `sent`)
//   • password reset: generic response, hashed single-use token, expiry, session invalidation
//   • RBAC on every messaging endpoint
// No mocks: the actual server process and SQLite file are exercised.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.MSG_PORT || 4609);
const BASE = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(root, 'data', `msg-${PORT}.db`);
for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }

let checks = 0, failed = 0;
const ok = (c, m, e) => { checks++; if (!c) { failed++; console.error('  ✗ ' + m + (e ? ` — ${e}` : '')); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };
function jar() { const c = {}; return { save(r) { for (const s of [].concat(r.headers.getSetCookie ? r.headers.getSetCookie() : [])) { const m = /^([^=]+)=([^;]*)/.exec(s); if (m) c[m[1]] = m[2]; } }, header() { return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; '); } }; }
async function call(j, method, p, body) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(j && j.header() ? { Cookie: j.header() } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (j) j.save(res); let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch {} await sleep(100); } return false; }

process.env.EJARI_DB_FILE = dbFile;
const server = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: root, env: { ...process.env, EJARI_DB_FILE: dbFile }, stdio: 'pipe' });
let booted = false; server.stdout.on('data', (d) => { if (String(d).includes('running')) booted = true; }); server.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(d); });
await waitFor(() => booted);
if (!booted) { console.error('server did not boot'); process.exit(1); }

const db = new DatabaseSync(dbFile);
const admin = jar(), finance = jar(), tenant = jar();

try {
  // ---- sessions ----
  ok((await call(admin, 'POST', '/api/auth/login', { email: 'fatima.alhammadi@ejari.bh', password: 'Demo@1234' })).status === 200, 'super admin signs in');
  ok((await call(finance, 'POST', '/api/auth/login', { email: 'zainab.almahroos@ejari.bh', password: 'Demo@1234' })).status === 200, 'finance admin signs in');
  ok((await call(tenant, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'Demo@1234' })).status === 200, 'tenant signs in');

  // ---- messaging catalogue & RBAC ----
  const cat = await call(admin, 'GET', '/api/messaging');
  ok(cat.status === 200, 'admin reads the messaging console');
  ok(cat.data.catalogue.map((c) => c.channel).join(',') === 'email,sms', 'catalogue exposes email and sms channels');
  const emailProv = cat.data.catalogue.find((c) => c.channel === 'email').providers.map((p) => p.id);
  const smsProv = cat.data.catalogue.find((c) => c.channel === 'sms').providers.map((p) => p.id);
  ok(emailProv.includes('smtp') && emailProv.includes('sendgrid') && emailProv.includes('console'), 'email providers available');
  ok(smsProv.includes('twilio') && smsProv.includes('unifonic') && smsProv.includes('console'), 'sms providers available');
  ok(cat.data.channels.email.enabled === false && cat.data.channels.email.provider === null, 'email channel starts disabled with no provider');
  ok(cat.data.channels.sms.enabled === false, 'sms channel starts disabled');
  ok((await call(tenant, 'GET', '/api/messaging')).status === 403, 'tenant is denied the messaging console');
  ok((await call(finance, 'GET', '/api/messaging')).status === 403, 'finance sub-role without settings permission is denied');

  // ---- disabled channel dispatch is recorded as `disabled`, never `sent` ----
  const forgot1 = await call(null, 'POST', '/api/auth/forgot-password', { email: 'sara.aldosari@example.bh' });
  ok(forgot1.status === 200 && forgot1.data.ok === true, 'forgot-password accepted');
  const disabledRow = db.prepare("SELECT status, provider FROM outbound_messages WHERE kind='password_reset' ORDER BY id DESC LIMIT 1").get();
  ok(disabledRow && disabledRow.status === 'disabled', 'dispatch on an unconfigured channel is recorded as disabled', JSON.stringify(disabledRow));

  // ---- generic response: unknown email looks identical, and creates no record ----
  const before = db.prepare('SELECT COUNT(*) c FROM outbound_messages').get().c;
  const forgotUnknown = await call(null, 'POST', '/api/auth/forgot-password', { email: 'nobody@example.com' });
  ok(forgotUnknown.status === 200 && JSON.stringify(forgotUnknown.data) === JSON.stringify(forgot1.data), 'unknown email returns the identical generic response');
  ok(db.prepare('SELECT COUNT(*) c FROM outbound_messages').get().c === before, 'unknown email sends nothing and writes no outbound record');

  // ---- configure the console email adapter and capture a real token ----
  ok((await call(admin, 'POST', '/api/messaging/email', { enabled: true, provider: 'console', config: {} })).status === 200, 'email set to the console test adapter');
  await call(null, 'POST', '/api/auth/forgot-password', { email: 'sara.aldosari@example.bh' });
  const loggedRow = db.prepare("SELECT status, body FROM outbound_messages WHERE kind='password_reset' ORDER BY id DESC LIMIT 1").get();
  ok(loggedRow && loggedRow.status === 'logged', 'console adapter records the message and reports `logged`, not `sent`');
  const token = (/token=([a-f0-9]{32,})/.exec(loggedRow.body) || [])[1];
  ok(!!token, 'the reset link is delivered through the channel and carries a real token');
  const tokenRow = db.prepare('SELECT token_hash FROM password_resets ORDER BY id DESC LIMIT 1').get();
  ok(tokenRow && tokenRow.token_hash && tokenRow.token_hash !== token, 'only the token hash is stored, never the token itself');

  // ---- token validation + single use ----
  ok((await call(null, 'GET', '/api/auth/reset-password/' + token)).status === 200, 'a fresh token validates');
  ok((await call(null, 'GET', '/api/auth/reset-password/deadbeefdeadbeefdeadbeefdeadbeef')).status === 404, 'an unknown token is rejected');
  ok((await call(null, 'POST', '/api/auth/reset-password', { token, password: 'short' })).status === 400, 'a weak password is refused');
  ok((await call(null, 'POST', '/api/auth/reset-password', { token, password: 'BrandNew@123' })).status === 200, 'the password is reset with a valid token');
  ok((await call(null, 'POST', '/api/auth/reset-password', { token, password: 'Another@1234' })).status === 400, 'the token cannot be reused');

  // ---- reset invalidates existing sessions and the old password ----
  ok((await call(tenant, 'GET', '/api/auth/me')).data.user === null, 'an existing session was invalidated by the reset');
  ok((await call(null, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'Demo@1234' })).status === 401, 'the old password no longer works');
  ok((await call(null, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'BrandNew@123' })).status === 200, 'the new password works');
  // the reset dropped the tenant's old session, so re-establish it for the RBAC checks below
  ok((await call(tenant, 'POST', '/api/auth/login', { email: 'sara.aldosari@example.bh', password: 'BrandNew@123' })).status === 200, 'tenant re-authenticates after the reset');

  // ---- expiry (issue a fresh, still-unused token, then age it) ----
  await call(null, 'POST', '/api/auth/forgot-password', { email: 'sara.aldosari@example.bh' });
  const freshRow = db.prepare("SELECT body FROM outbound_messages WHERE kind='password_reset' ORDER BY id DESC LIMIT 1").get();
  const freshToken = (/token=([a-f0-9]{32,})/.exec(freshRow.body) || [])[1];
  db.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z' WHERE used=0").run();
  ok((await call(null, 'GET', '/api/auth/reset-password/' + freshToken)).status === 410, 'an expired token is reported as expired (410)');
  ok((await call(null, 'POST', '/api/auth/reset-password', { token: freshToken, password: 'Whatever@123' })).status === 410, 'an expired token is refused on submit');

  // ---- provider config: secrets encrypted, masked, and blank-preserving ----
  ok((await call(admin, 'POST', '/api/messaging/email', { enabled: true, provider: 'smtp', config: { host: 'smtp.example.com', port: '587', from: 'no-reply@ejari.bh', user: 'bot', password: 'S3cr3t-K3y' } })).status === 200, 'smtp config saved');
  const masked = (await call(admin, 'GET', '/api/messaging')).data.channels.email;
  ok(masked.config.password && masked.config.password.startsWith('••'), 'the secret is returned only as a mask', JSON.stringify(masked.config));
  ok(!JSON.stringify(masked).includes('S3cr3t-K3y'), 'the raw secret is never echoed back to the client');
  const raw = db.prepare("SELECT config_enc FROM provider_settings WHERE kind='email'").get().config_enc;
  ok(!raw.includes('S3cr3t-K3y'), 'the secret is stored encrypted at rest, not in cleartext');
  ok((await call(admin, 'POST', '/api/messaging/email', { enabled: true, provider: 'smtp', config: { host: 'smtp2.example.com', port: '2525', from: 'x@ejari.bh', password: '' } })).status === 200, 'a blank secret field is accepted');
  const afterBlank = (await call(admin, 'GET', '/api/messaging')).data.channels.email;
  ok(afterBlank.config.password.startsWith('••'), 'a blank secret field keeps the stored credential');
  ok(afterBlank.config.host === 'smtp2.example.com', 'non-secret fields are updated');

  // ---- validation & RBAC on mutations ----
  ok((await call(admin, 'POST', '/api/messaging/push', { enabled: true })).status === 400, 'an unknown channel is rejected');
  ok((await call(tenant, 'POST', '/api/messaging/email', { enabled: true })).status === 403, 'tenant cannot save channel settings');
  ok((await call(admin, 'POST', '/api/messaging/sms/test')).status === 502, 'testing a disabled channel returns a failure, not a fake ok');
  ok((await call(tenant, 'POST', '/api/messaging/email/test')).status === 403, 'tenant cannot test a provider');
  ok((await call(admin, 'POST', '/api/messaging/console')).status === 400, 'the reserved console provider is not a channel');

  // ---- integrations are honestly classified ----
  const boot = await call(admin, 'GET', '/api/bootstrap');
  const i1 = boot.data.integrations.find((i) => i.id === 'i1');
  const i3 = boot.data.integrations.find((i) => i.id === 'i3');
  ok(i1 && i1.kind === 'config', 'the regulatory entry is classified as a config record');
  ok(i3 && i3.kind === 'gateway', 'the payment entry is classified as a real adapter');
  const it = await call(admin, 'POST', '/api/integrations/i1/test');
  ok(it.status === 200 && it.data.note === 'configuration_only_no_external_call' && it.data.reachable === false, 'testing a config record is honest — no fake external call');
} catch (e) {
  failed++; console.error('✗ EXCEPTION', e);
} finally {
  try { server.kill(); } catch {}
  await sleep(200);
  for (const f of [dbFile, dbFile + '-shm', dbFile + '-wal']) { try { fs.unlinkSync(f); } catch {} }
}

console.log(`\n${'='.repeat(60)}`);
if (failed) console.log(`✗ ${failed}/${checks} MESSAGING CHECKS FAILED`);
else console.log(`✓ All ${checks} messaging & password-reset checks passed (real server, real database)`);
process.exit(failed ? 1 : 0);
