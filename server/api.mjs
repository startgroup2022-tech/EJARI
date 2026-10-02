import { db, nowIso } from './db.mjs';
import { hashPassword, verifyPassword, parseCookies } from './auth.mjs';
import crypto from 'node:crypto';

db.exec(`CREATE TABLE IF NOT EXISTS user_prefs(user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(user_id,key));`);

// ---------- small helpers ----------
const S = (v) => (v === null || v === undefined ? null : String(v));
const N = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const bool = (v) => !!v;
const today = () => new Date();
const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

function getSetting(key, fallback) { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : fallback; }
function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value)); }
function pref(userId, key, fallback) { const r = db.prepare('SELECT value FROM user_prefs WHERE user_id=? AND key=?').get(userId, key); return r ? r.value : fallback; }
function setPref(userId, key, value) { db.prepare('INSERT INTO user_prefs(user_id,key,value) VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value').run(userId, key, String(value)); }

function audit(userId, actionAr, actionEn, entity) {
  db.prepare('INSERT INTO audit_log(user_id,action_ar,action_en,entity,ip,created_at) VALUES (?,?,?,?,?,?)').run(userId, actionAr, actionEn, entity || null, '127.0.0.1', nowIso());
}
// Records the previous and new value alongside the action, when a change is meaningful.
function auditChange(userId, actionAr, actionEn, entity, before, after) {
  db.prepare('INSERT INTO audit_log(user_id,action_ar,action_en,entity,ip,created_at,before_value,after_value) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, actionAr, actionEn, entity || null, '127.0.0.1', nowIso(), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}
function notify(userId, type, ar, en, subAr, subEn) {
  db.prepare('INSERT INTO notifications(user_id,type,text_ar,text_en,sub_ar,sub_en,read,created_at) VALUES (?,?,?,?,?,?,0,?)').run(userId, type, ar, en, subAr || '', subEn || '', nowIso());
}
function receiptNo() { const r = db.prepare("SELECT receipt FROM payments WHERE receipt LIKE 'RC-%' ORDER BY id DESC LIMIT 1").get(); const n = r ? Number(r.receipt.slice(3)) + 1 : 700001; return 'RC-' + n; }
function nextContractNo() { const r = db.prepare("SELECT no FROM contracts ORDER BY id DESC LIMIT 1").get(); const n = r ? Number(r.no.split('-')[2]) + 1 : 500001; return `EJ-2026-${String(n).padStart(5, '0')}`; }

// ---------- row -> wire-format mappers (string ids, ISO dates; field names match the client's original shape) ----------
const mapUser = (u) => ({ id: S(u.id), role: u.role, sub: u.sub_role, name: { ar: u.name_ar, en: u.name_en }, cpr: u.cpr, phone: u.phone, email: u.email, status: u.status, verified: bool(u.verified), joined: u.created_at });
const mapProp = (p) => ({ id: S(p.id), owner: S(p.owner_id), name: { ar: p.name_ar, en: p.name_en }, area: p.area, type: p.type, deed: p.deed, verified: bool(p.verified), dup: bool(p.dup) });
const mapUnit = (u) => ({ id: S(u.id), prop: S(u.property_id), no: u.no, type: u.type, beds: u.beds, size: u.size, rent: u.rent, listed: bool(u.listed), flag: u.flag });
const mapContract = (c) => ({
  id: S(c.id), no: c.no, unit: S(c.unit_id), landlord: S(c.landlord_id), tenant: S(c.tenant_id),
  start: c.start_date, months: c.months, rent: c.rent, deposit: c.deposit, dueDay: c.due_day, freq: c.freq,
  utilities: bool(c.utilities), status: c.status, signedL: bool(c.signed_landlord), signedT: bool(c.signed_tenant),
  notes: c.notes || '', flag: c.flag_ar ? { ar: c.flag_ar, en: c.flag_en } : null,
  renewal: c.renewal_state ? { state: c.renewal_state, rent: c.renewal_rent, months: c.renewal_months, by: c.renewal_by } : null,
  check: { keys: bool(c.check_keys), meters: bool(c.check_meters), photos: bool(c.check_photos), inv: bool(c.check_inv) },
  created: c.created_at,
});
const mapPayment = (p) => ({ id: S(p.id), c: S(p.contract_id), kind: p.kind, due: p.due_date, amount: p.amount, status: p.status, paidOn: p.paid_on, method: p.method, receipt: p.receipt });
const mapMaint = (m) => ({ id: S(m.id), unit: S(m.unit_id), by: S(m.requester_id), title: { ar: m.title_ar, en: m.title_en }, cat: m.category, pri: m.priority, st: m.status, tech: m.technician, rating: m.rating, created: m.created_at });
const mapDoc = (d) => ({ id: S(d.id), owner: S(d.owner_id), c: d.contract_id ? S(d.contract_id) : null, name: d.name, type: d.type, size: `${d.size_kb} KB`, date: d.created_at, dataUrl: d.data_url || null });
const mapNotif = (n) => ({ id: S(n.id), ty: n.type, ar: n.text_ar, en: n.text_en, sub: { ar: n.sub_ar, en: n.sub_en }, read: bool(n.read), t: n.created_at });
const mapAudit = (a) => ({ id: S(a.id), u: S(a.user_id), ar: a.action_ar, en: a.action_en, ent: a.entity, ip: a.ip, t: a.created_at, before: a.before_value ? JSON.parse(a.before_value) : null, after: a.after_value ? JSON.parse(a.after_value) : null });
const mapTicket = (t) => ({
  id: t.id, from: S(t.from_user), subj: t.subject, cat: t.category, pri: t.priority, st: t.status, asg: t.assignee ? S(t.assignee) : null, created: t.created_at,
  msgs: db.prepare('SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id').all(t.id).map((m) => ({ f: S(m.from_user), x: m.message, t: m.created_at })),
});
const mapFaq = (f) => ({ id: S(f.id), pub: bool(f.published), q: { ar: f.q_ar, en: f.q_en }, a: { ar: f.a_ar, en: f.a_en } });
const mapTpl = (t) => ({ id: t.id, name: { ar: t.name_ar, en: t.name_en }, ver: t.version, upd: t.updated_at, pub: bool(t.published), uses: t.uses });
const mapMsg = (m) => ({ id: m.id, ev: { ar: m.event_ar, en: m.event_en }, ar: m.text_ar, en: m.text_en });
const mapInteg = (i) => ({ id: i.id, name: { ar: i.name_ar, en: i.name_en }, desc: { ar: i.desc_ar, en: i.desc_en }, on: bool(i.enabled), st: i.enabled ? i.status : 'off', ms: i.latency_ms, last: i.last_sync_min });
const mapRole = (r) => ({ id: r.id, ar: r.name_ar, en: r.name_en, editable: bool(r.editable) });
const mapVerif = (v) => ({ id: S(v.id), u: S(v.user_id), kind: v.kind, prop: v.property_id ? S(v.property_id) : null, t: v.created_at });
const mapRefund = (r) => ({ id: r.id, c: S(r.contract_id), amount: r.amount, why: { ar: r.reason_ar, en: r.reason_en }, st: r.status });

function contractRow(id) { return db.prepare('SELECT * FROM contracts WHERE id=?').get(id); }
function userRow(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function unitRow(id) { return db.prepare('SELECT * FROM units WHERE id=?').get(id); }

// schedule/refresh a rent-payment row's computed status (upcoming/due/overdue) based on today's date; paid rows are untouched
function refreshPaymentStatus(p) {
  if (p.status === 'paid') return p;
  const due = new Date(p.due_date);
  const d = daysBetween(due, today()); // positive = days until due, negative = days overdue
  const status = d < 0 ? 'overdue' : d <= 30 ? 'due' : 'upcoming';
  if (status !== p.status) db.prepare('UPDATE payments SET status=? WHERE id=?').run(status, p.id);
  return { ...p, status };
}
function touchContractPayments(contractId) {
  const rows = db.prepare('SELECT * FROM payments WHERE contract_id=?').all(contractId);
  return rows.map(refreshPaymentStatus);
}

// ---------- rate limiting (in-memory, per client IP) ----------
const rateBuckets = new Map();
function rateLimit(req, key, max, windowMs) {
  const ip = req.socket.remoteAddress || 'unknown';
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const b = rateBuckets.get(bucketKey);
  if (!b || now > b.reset) { rateBuckets.set(bucketKey, { count: 1, reset: now + windowMs }); return true; }
  b.count++;
  return b.count <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of rateBuckets) if (now > b.reset) rateBuckets.delete(k); }, 60000).unref?.();

// ---------- auth/session ----------
function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.ejari_session;
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return userRow(s.user_id);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const created = nowIso();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(token, userId, created, expires);
  return token;
}

// ---------- scoped read helpers ----------
function myContractRows(user) {
  if (user.role === 'admin') return db.prepare('SELECT * FROM contracts').all();
  if (user.role === 'landlord') return db.prepare('SELECT * FROM contracts WHERE landlord_id=?').all(user.id);
  return db.prepare('SELECT * FROM contracts WHERE tenant_id=?').all(user.id);
}
function myPropertyRows(user) {
  if (user.role === 'admin') return db.prepare('SELECT * FROM properties').all();
  if (user.role === 'landlord') return db.prepare('SELECT * FROM properties WHERE owner_id=?').all(user.id);
  return [];
}
function unitsForProps(propIds) { if (!propIds.length) return []; return db.prepare(`SELECT * FROM units WHERE property_id IN (${propIds.map(() => '?').join(',')})`).all(...propIds); }

// ================= ROUTES =================
export const routes = [];
const add = (method, pattern, auth, handler) => routes.push({ method, pattern, auth, handler });

function matchPath(pattern, pathname) {
  const pp = pattern.split('/').filter(Boolean);
  const pv = pathname.split('/').filter(Boolean);
  if (pp.length !== pv.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(pv[i]);
    else if (pp[i] !== pv[i]) return null;
  }
  return params;
}
export function findRoute(method, pathname) {
  for (const r of routes) { if (r.method !== method) continue; const params = matchPath(r.pattern, pathname); if (params) return { ...r, params }; }
  return null;
}

const AR = { landlord: 'مؤجر', tenant: 'مستأجر', admin: 'مدير' };

// ---- public ----
add('GET', '/api/faq', false, () => ({ status: 200, body: db.prepare('SELECT * FROM faq WHERE published=1').all().map(mapFaq) }));

add('GET', '/api/stats', false, () => {
  const one = (sql) => db.prepare(sql).get().n;
  return { status: 200, body: {
    properties: one('SELECT COUNT(*) n FROM properties'),
    contracts: one('SELECT COUNT(*) n FROM contracts'),
    users: one('SELECT COUNT(*) n FROM users'),
    transactions: one('SELECT COUNT(*) n FROM payments'),
    services: one('SELECT COUNT(*) n FROM services'),
  } };
});

// Public runtime configuration. `demo` is the single source of truth the client uses to
// decide whether to offer demo sign-in — it is false in production, so the demo buttons
// are never rendered there (rather than relying on the API rejecting the call).
add('GET', '/api/config', false, () => ({
  status: 200,
  body: {
    demo: !(process.env.NODE_ENV === 'production' || process.env.EJARI_DISABLE_DEMO === '1'),
    version: '2.0.0',
  },
}));

add('GET', '/api/verify/:no', false, (req) => {
  const c = db.prepare('SELECT * FROM contracts WHERE no=?').get(req.params.no.toUpperCase());
  if (!c) return { status: 404, body: { found: false } };
  const u = unitRow(c.unit_id); const p = db.prepare('SELECT * FROM properties WHERE id=?').get(u.property_id);
  return { status: 200, body: { found: true, no: c.no, status: c.status, start: c.start_date, end: iso(addDays(addMonths(new Date(c.start_date), c.months), -1)), property: { ar: p.name_ar, en: p.name_en }, area: p.area, unit: { type: u.type, no: u.no }, signedBoth: bool(c.signed_landlord) && bool(c.signed_tenant) } };
});

// ---- auth ----
add('POST', '/api/auth/register', false, (req) => {
  const b = req.body || {};
  if (!rateLimit(req, 'register', 10, 15 * 60 * 1000)) return { status: 429, body: { error: 'too_many_requests' } };
  if (!b.name || !b.email || !b.password || !/^\d{9}$/.test(String(b.cpr || ''))) return { status: 400, body: { error: 'invalid_input' } };
  if (!['landlord', 'tenant'].includes(b.role)) return { status: 400, body: { error: 'invalid_role' } };
  if (String(b.password).length < 8) return { status: 400, body: { error: 'weak_password' } };
  if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email)) return { status: 409, body: { error: 'email_taken' } };
  const r = db.prepare('INSERT INTO users(role,name_ar,name_en,cpr,phone,email,password_hash,status,verified,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)')
    .run(b.role, b.name, b.name, b.cpr, b.phone || null, b.email, hashPassword(b.password), 'pending', nowIso());
  const token = createSession(Number(r.lastInsertRowid));
  audit(Number(r.lastInsertRowid), 'إنشاء حساب جديد', 'Account created', b.email);
  return { status: 201, body: { user: mapUser(userRow(Number(r.lastInsertRowid))) }, cookie: token };
});

add('POST', '/api/auth/login', false, (req) => {
  const b = req.body || {};
  if (!rateLimit(req, 'login', 10, 15 * 60 * 1000)) return { status: 429, body: { error: 'too_many_requests' } };
  // Coerce before binding: node:sqlite rejects non-string/null bind values, and a missing
  // email must read as "invalid credentials", not surface as a 500.
  const email = String(b.email == null ? '' : b.email).toLowerCase().trim();
  const u = email ? db.prepare('SELECT * FROM users WHERE email=?').get(email) : null;
  if (!u || !verifyPassword(b.password == null ? '' : b.password, u.password_hash)) return { status: 401, body: { error: 'invalid_credentials' } };
  if (u.status === 'suspended') return { status: 403, body: { error: 'suspended' } };
  const token = createSession(u.id);
  return { status: 200, body: { user: mapUser(u) }, cookie: token };
});

add('POST', '/api/auth/demo', false, (req) => {
  // Quick demo sign-in is a development convenience only: it hands out a real session
  // for a seeded account with no password. Never expose it in production.
  if (process.env.NODE_ENV === 'production' || process.env.EJARI_DISABLE_DEMO === '1') return { status: 404, body: { error: 'not_found' } };
  const role = (req.body || {}).role;
  const emails = { landlord: 'rashed.almanai@example.bh', tenant: 'sara.aldosari@example.bh', admin: 'zainab.almahroos@ejari.bh' };
  const email = Object.prototype.hasOwnProperty.call(emails, role) ? emails[role] : null;
  if (typeof email !== 'string') return { status: 400, body: { error: 'unknown_role' } };
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u) return { status: 400, body: { error: 'unknown_role' } };
  const token = createSession(u.id);
  return { status: 200, body: { user: mapUser(u) }, cookie: token };
});

add('POST', '/api/auth/logout', true, (req) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.ejari_session) db.prepare('DELETE FROM sessions WHERE token=?').run(cookies.ejari_session);
  return { status: 200, body: { ok: true }, clearCookie: true };
});

add('GET', '/api/auth/me', false, (req) => ({ status: 200, body: { user: req.user ? mapUser(req.user) : null } }));

// ---- bootstrap: everything the signed-in role needs, in one call ----
add('GET', '/api/bootstrap', true, (req) => {
  const user = req.user;
  const contracts = myContractRows(user);
  const cIds = contracts.map((c) => c.id);
  const payments = cIds.length ? db.prepare(`SELECT * FROM payments WHERE contract_id IN (${cIds.map(() => '?').join(',')})`).all(...cIds).map(refreshPaymentStatus) : [];
  const unitIds = [...new Set(contracts.map((c) => c.unit_id))];
  const props = myPropertyRows(user);
  const propIds = props.map((p) => p.id);
  let units = unitsForProps(propIds);
  // tenants/admins also need units referenced by their contracts even if outside "my properties"
  const missingUnits = unitIds.filter((id) => !units.some((u) => u.id === id));
  if (missingUnits.length) units = units.concat(missingUnits.map(unitRow).filter(Boolean));
  const propIdsFromUnits = [...new Set(units.map((u) => u.property_id))].filter((id) => !propIds.includes(id));
  const extraProps = propIdsFromUnits.map((id) => db.prepare('SELECT * FROM properties WHERE id=?').get(id)).filter(Boolean);

  const userIds = new Set([user.id]);
  contracts.forEach((c) => { userIds.add(c.landlord_id); userIds.add(c.tenant_id); });
  [...props, ...extraProps].forEach((p) => userIds.add(p.owner_id));

  const maint = user.role === 'admin' ? db.prepare('SELECT * FROM maintenance').all()
    : user.role === 'tenant' ? db.prepare('SELECT * FROM maintenance WHERE requester_id=?').all(user.id)
    : (unitIds.length ? db.prepare(`SELECT * FROM maintenance WHERE unit_id IN (${[...new Set([...unitIds, ...units.map(u=>u.id)])].map(() => '?').join(',')})`).all(...[...new Set([...unitIds, ...units.map(u=>u.id)])]) : []);
  maint.forEach((m) => userIds.add(m.requester_id));

  const docs = user.role === 'admin' ? [] : db.prepare('SELECT * FROM documents WHERE owner_id=?').all(user.id);
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC').all(user.id);

  const body = {
    me: mapUser(user),
    users: [...userIds].map(userRow).filter(Boolean).map(mapUser),
    properties: [...props, ...extraProps].map(mapProp),
    units: units.map(mapUnit),
    contracts: contracts.map(mapContract),
    payments: payments.map(mapPayment),
    maintenance: maint.map(mapMaint),
    documents: docs.map(mapDoc),
    notifications: notifs.map(mapNotif),
    faq: db.prepare('SELECT * FROM faq').all().map(mapFaq),
    services: db.prepare('SELECT * FROM services WHERE active=1 ORDER BY sort_order, id').all().map(mapService),
    categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all().map(mapCategory),
    posts: db.prepare('SELECT * FROM posts WHERE published=1 ORDER BY created_at DESC').all().map(mapPost),
    requests: db.prepare('SELECT * FROM service_requests WHERE user_id=? OR provider_id=? ORDER BY id DESC').all(user.id, user.id).map(mapRequest),
    autopay: pref(user.id, 'autopay', '0') === '1',
  };

  if (user.role === 'admin') {
    body.users = db.prepare('SELECT * FROM users').all().map(mapUser);
    body.properties = db.prepare('SELECT * FROM properties').all().map(mapProp);
    body.units = db.prepare('SELECT * FROM units').all().map(mapUnit);
    body.contracts = db.prepare('SELECT * FROM contracts').all().map(mapContract);
    body.payments = db.prepare('SELECT * FROM payments').all().map(refreshPaymentStatus).map(mapPayment);
    body.maintenance = db.prepare('SELECT * FROM maintenance').all().map(mapMaint);
    body.verifications = db.prepare('SELECT * FROM verification_requests').all().map(mapVerif);
    body.tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all().map(mapTicket);
    body.audit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all().map(mapAudit);
    body.templates = db.prepare('SELECT * FROM templates').all().map(mapTpl);
    body.messages = db.prepare('SELECT * FROM message_templates').all().map(mapMsg);
    body.integrations = db.prepare('SELECT * FROM integrations').all().map(mapInteg);
    body.roles = db.prepare('SELECT * FROM roles').all().map(mapRole);
    body.refunds = db.prepare('SELECT * FROM refunds').all().map(mapRefund);
    const perm = {};
    for (const r of db.prepare('SELECT * FROM roles').all()) { perm[r.id] = {}; for (const rp of db.prepare('SELECT * FROM role_permissions WHERE role_id=?').all(r.id)) perm[r.id][rp.perm] = bool(rp.allowed); }
    body.perm = perm;
    body.fees = { reg: Number(getSetting('fee_registration', 10)), renew: Number(getSetting('fee_renewal', 5)), remind: Number(getSetting('remind_days', 3)), late: Number(getSetting('late_repeat_days', 5)), twofa: getSetting('two_factor_required', '1') === '1', session: Number(getSetting('session_timeout_min', 30)), retention: Number(getSetting('retention_months', 60)), maintenanceMode: getSetting('maintenance_mode', '0') === '1', adminIp: getSetting('admin_ip_allowlist', '') };
    body.services = db.prepare('SELECT * FROM services ORDER BY sort_order, id').all().map(mapService);
    body.posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all().map(mapPost);
    body.requests = db.prepare('SELECT * FROM service_requests ORDER BY id DESC').all().map(mapRequest);
    body.notificationLog = db.prepare('SELECT * FROM notification_log ORDER BY id DESC LIMIT 100').all().map(mapNotifLog);
  } else if (user.role === 'landlord') {
    // tenants need to be selectable in the "new contract" wizard
    body.users = [...new Set([...userIds, ...db.prepare("SELECT id FROM users WHERE role='tenant' AND verified=1 AND status='active'").all().map((r) => r.id)])].map(userRow).filter(Boolean).map(mapUser);
  }
  return { status: 200, body };
});

// ================= CONTRACTS =================
add('POST', '/api/contracts', true, (req) => {
  const u = req.user; if (u.role !== 'landlord') return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const unit = unitRow(N(b.unitId));
  if (!unit) return { status: 400, body: { error: 'unit_not_found' } };
  const prop = db.prepare('SELECT * FROM properties WHERE id=?').get(unit.property_id);
  if (prop.owner_id !== u.id) return { status: 403, body: { error: 'not_your_unit' } };
  const tenant = userRow(N(b.tenantId));
  if (!tenant || tenant.role !== 'tenant') return { status: 400, body: { error: 'tenant_not_found' } };
  const start = new Date(b.start);
  if (!b.start || Number.isNaN(start.getTime())) return { status: 400, body: { error: 'invalid_start_date' } };
  const months = N(b.months) || 12, rent = N(b.rent), deposit = N(b.deposit), dueDay = N(b.dueDay) || 1;
  if (!(months >= 1 && months <= 120)) return { status: 400, body: { error: 'invalid_months' } };
  if (!(rent > 0)) return { status: 400, body: { error: 'invalid_rent' } };
  if (deposit != null && deposit < 0) return { status: 400, body: { error: 'invalid_deposit' } };
  if (!(dueDay >= 1 && dueDay <= 28)) return { status: 400, body: { error: 'invalid_due_day' } };
  const no = nextContractNo();
  const r = db.prepare(`INSERT INTO contracts(no,unit_id,landlord_id,tenant_id,start_date,months,rent,deposit,due_day,freq,utilities,status,signed_landlord,signed_tenant,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?)`)
    .run(no, unit.id, u.id, tenant.id, b.start, months, rent, deposit != null ? deposit : rent, dueDay, b.freq || 'monthly', b.utilities ? 1 : 0, 'pending_sign', b.notes || '', nowIso());
  const cid = Number(r.lastInsertRowid);
  const feeDue = addDays(new Date(b.start), -1);
  db.prepare(`INSERT INTO payments(contract_id,kind,due_date,amount,status,created_at) VALUES (?,?,?,?,?,?)`).run(cid, 'fee', feeDue.toISOString().slice(0, 10), Number(getSetting('fee_registration', 10)), 'upcoming', nowIso());
  notify(tenant.id, 'contract', `العقد ${no} بانتظار توقيعك`, `Contract ${no} is waiting for your signature`, prop.name_ar, prop.name_en);
  db.prepare('INSERT INTO documents(owner_id,contract_id,name,type,size_kb,created_at) VALUES (?,?,?,?,?,?)').run(u.id, cid, `عقد إيجار ${no}.pdf`, 'contract', 410, nowIso());
  audit(u.id, 'إنشاء عقد جديد', 'Created a new contract', no);
  return { status: 201, body: { contract: mapContract(contractRow(cid)) } };
});

function assertParty(c, u, role) {
  if (role === 'landlord' && c.landlord_id !== u.id && u.role !== 'admin') return false;
  if (role === 'tenant' && c.tenant_id !== u.id && u.role !== 'admin') return false;
  return true;
}

add('POST', '/api/contracts/:id/sign', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  const as = (req.body || {}).as;
  if (as === 'landlord') { if (c.landlord_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } }; db.prepare('UPDATE contracts SET signed_landlord=1 WHERE id=?').run(c.id); notify(c.tenant_id, 'contract', `العقد ${c.no} بانتظار توقيعك`, `Contract ${c.no} is waiting for your signature`); }
  else if (as === 'tenant') {
    if (c.tenant_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
    db.prepare("UPDATE contracts SET signed_tenant=1, status='pending_pay' WHERE id=?").run(c.id);
    db.prepare("UPDATE payments SET status='due' WHERE contract_id=? AND kind='fee'").run(c.id);
    const landlord = userRow(c.landlord_id);
    notify(landlord.id, 'contract', `وقّع ${req.user.name_ar} العقد ${c.no}`, `${req.user.name_en} signed contract ${c.no}`);
  } else return { status: 400, body: { error: 'invalid_as' } };
  audit(req.user.id, 'توقيع عقد', 'Signed contract', c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/approve', true, (req) => {
  if (req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  db.prepare("UPDATE contracts SET status='active', flag_ar=NULL, flag_en=NULL WHERE id=?").run(c.id);
  notify(c.landlord_id, 'contract', `تم اعتماد العقد ${c.no}`, `Contract ${c.no} approved`);
  audit(req.user.id, 'اعتماد عقد', 'Approved contract', c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/reject', true, (req) => {
  if (req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  db.prepare("UPDATE contracts SET status='rejected' WHERE id=?").run(c.id);
  notify(c.landlord_id, 'contract', `تم رفض العقد ${c.no}`, `Contract ${c.no} was rejected`);
  audit(req.user.id, 'رفض عقد', 'Rejected contract', c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/resolve', true, (req) => {
  if (req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  db.prepare("UPDATE contracts SET status='expired', flag_ar=NULL, flag_en=NULL WHERE id=?").run(c.id);
  audit(req.user.id, 'إغلاق نزاع عقد', 'Resolved contract dispute', c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/terminate', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  if (req.user.role === 'admin') {
    db.prepare("UPDATE contracts SET status='disputed', flag_ar='تم تعليق العقد من الإدارة', flag_en='Suspended by administrators' WHERE id=?").run(c.id);
    notify(c.landlord_id, 'contract', `تم تعليق العقد ${c.no}`, `Contract ${c.no} suspended`);
    audit(req.user.id, 'تعليق عقد', 'Suspended contract', c.no);
  } else if (assertParty(c, req.user, 'landlord')) {
    db.prepare("UPDATE contracts SET status='terminated' WHERE id=?").run(c.id);
    notify(c.tenant_id, 'contract', `تم إنهاء العقد ${c.no}`, `Contract ${c.no} terminated`);
  } else return { status: 403, body: { error: 'forbidden' } };
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/renew-request', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c || !assertParty(c, req.user, 'tenant')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare("UPDATE contracts SET renewal_state='requested', renewal_by='tenant' WHERE id=?").run(c.id);
  notify(c.landlord_id, 'renew', `طلب تجديد من ${req.user.name_ar}`, `Renewal request from ${req.user.name_en}`, c.no, c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/renew-offer', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c || !assertParty(c, req.user, 'landlord')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  db.prepare("UPDATE contracts SET renewal_state='offered', renewal_rent=?, renewal_months=?, renewal_by='landlord' WHERE id=?").run(N(b.rent) || c.rent, N(b.months) || 12, c.id);
  notify(c.tenant_id, 'renew', `عرض تجديد للعقد ${c.no}`, `Renewal offer for contract ${c.no}`);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/renew-accept', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c || !assertParty(c, req.user, 'tenant')) return { status: 403, body: { error: 'forbidden' } };
  if (c.renewal_state !== 'offered') return { status: 400, body: { error: 'no_offer' } };
  db.prepare("UPDATE contracts SET months=months+?, rent=?, renewal_state='accepted' WHERE id=?").run(c.renewal_months, c.renewal_rent, c.id);
  notify(c.landlord_id, 'renew', `قبل ${req.user.name_ar} عرض التجديد`, `${req.user.name_en} accepted the renewal offer`, c.no, c.no);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/renew-decline', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c || !assertParty(c, req.user, 'tenant')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare("UPDATE contracts SET renewal_state='declined' WHERE id=?").run(c.id);
  notify(c.landlord_id, 'renew', `رفض ${req.user.name_ar} عرض التجديد`, `${req.user.name_en} declined the renewal offer`);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/contracts/:id/checklist', true, (req) => {
  const c = contractRow(N(req.params.id)); if (!c) return { status: 404, body: { error: 'not_found' } };
  if (req.user.role !== 'admin' && c.landlord_id !== req.user.id && c.tenant_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  const key = (req.body || {}).key; const val = bool((req.body || {}).value);
  const col = { keys: 'check_keys', meters: 'check_meters', photos: 'check_photos', inv: 'check_inv' }[key];
  if (!col) return { status: 400, body: { error: 'invalid_key' } };
  db.prepare(`UPDATE contracts SET ${col}=? WHERE id=?`).run(val ? 1 : 0, c.id);
  return { status: 200, body: { contract: mapContract(contractRow(c.id)) } };
});

// ================= PAYMENTS =================
function paymentRow(id) { return db.prepare('SELECT * FROM payments WHERE id=?').get(id); }

add('POST', '/api/payments/:id/pay', true, (req) => {
  const p = paymentRow(N(req.params.id)); if (!p) return { status: 404, body: { error: 'not_found' } };
  const c = contractRow(p.contract_id);
  if (req.user.id !== c.tenant_id && req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  const method = (req.body || {}).method || 'benefit';
  const receipt = receiptNo();
  db.prepare("UPDATE payments SET status='paid', paid_on=?, method=?, receipt=? WHERE id=?").run(nowIso().slice(0, 10), method, receipt, p.id);
  if (p.kind === 'fee') {
    db.prepare("UPDATE contracts SET status='active' WHERE id=?").run(c.id);
    notify(c.landlord_id, 'contract', `تم تفعيل العقد ${c.no}`, `Contract ${c.no} is now active`);
  } else {
    const tenant = userRow(c.tenant_id);
    notify(c.landlord_id, 'pay', `تم استلام إيجار من ${tenant.name_ar}`, `Rent received from ${tenant.name_en}`, `${p.amount} د.ب`, `BD ${p.amount}`);
  }
  db.prepare('INSERT INTO documents(owner_id,contract_id,name,type,size_kb,created_at) VALUES (?,?,?,?,?,?)').run(c.tenant_id, c.id, `إيصال دفع ${receipt}.pdf`, 'receipt', 90, nowIso());
  db.prepare('INSERT INTO documents(owner_id,contract_id,name,type,size_kb,created_at) VALUES (?,?,?,?,?,?)').run(c.landlord_id, c.id, `إيصال دفع ${receipt}.pdf`, 'receipt', 90, nowIso());
  return { status: 200, body: { payment: mapPayment(paymentRow(p.id)), contract: mapContract(contractRow(c.id)) } };
});

add('POST', '/api/payments/:id/mark-cash', true, (req) => {
  const p = paymentRow(N(req.params.id)); if (!p) return { status: 404, body: { error: 'not_found' } };
  const c = contractRow(p.contract_id);
  if (req.user.id !== c.landlord_id && req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  const receipt = receiptNo();
  db.prepare("UPDATE payments SET status='paid', paid_on=?, method='cash', receipt=? WHERE id=?").run(nowIso().slice(0, 10), receipt, p.id);
  audit(req.user.id, 'تسجيل دفعة نقدية', 'Recorded a cash payment', c.no);
  return { status: 200, body: { payment: mapPayment(paymentRow(p.id)) } };
});

add('POST', '/api/payments/:id/remind', true, (req) => {
  const p = paymentRow(N(req.params.id)); if (!p) return { status: 404, body: { error: 'not_found' } };
  const c = contractRow(p.contract_id);
  if (req.user.id !== c.landlord_id) return { status: 403, body: { error: 'forbidden' } };
  notify(c.tenant_id, 'pay', `تذكير: إيجار ${p.amount} د.ب مستحق`, `Reminder: BD ${p.amount} rent is due`);
  return { status: 200, body: { ok: true } };
});

add('POST', '/api/payments/remind-all', true, (req) => {
  if (req.user.role !== 'landlord') return { status: 403, body: { error: 'forbidden' } };
  const rows = db.prepare(`SELECT p.* FROM payments p JOIN contracts c ON c.id=p.contract_id WHERE c.landlord_id=? AND p.status='overdue'`).all(req.user.id);
  for (const p of rows) { const c = contractRow(p.contract_id); notify(c.tenant_id, 'pay', 'تذكير بإيجار متأخر', 'Overdue rent reminder'); }
  return { status: 200, body: { count: rows.length } };
});

add('POST', '/api/payments/autopay', true, (req) => { setPref(req.user.id, 'autopay', (req.body || {}).enabled ? '1' : '0'); return { status: 200, body: { ok: true } }; });

// ================= MAINTENANCE =================
add('POST', '/api/maintenance', true, (req) => {
  const u = req.user; if (u.role !== 'tenant') return { status: 403, body: { error: 'forbidden' } };
  const active = db.prepare("SELECT * FROM contracts WHERE tenant_id=? AND status IN ('active','pending_pay') ORDER BY id DESC LIMIT 1").get(u.id);
  if (!active) return { status: 400, body: { error: 'no_active_contract' } };
  const b = req.body || {};
  const title = String(b.title || '');
  const r = db.prepare(`INSERT INTO maintenance(unit_id,requester_id,title_ar,title_en,category,priority,status,created_at) VALUES (?,?,?,?,?,?, 'new', ?)`)
    .run(active.unit_id, u.id, title, title, String(b.category || 'other'), String(b.priority || 'normal'), nowIso());
  const unit = unitRow(active.unit_id); const prop = db.prepare('SELECT * FROM properties WHERE id=?').get(unit.property_id);
  notify(prop.owner_id, 'maint', `طلب صيانة جديد: ${title}`, `New maintenance request: ${title}`, prop.name_ar, prop.name_en);
  return { status: 201, body: { request: mapMaint(db.prepare('SELECT * FROM maintenance WHERE id=?').get(Number(r.lastInsertRowid))) } };
});

function canManageMaint(m, u) { if (u.role === 'admin') return true; const unit = unitRow(m.unit_id); const prop = db.prepare('SELECT * FROM properties WHERE id=?').get(unit.property_id); return prop.owner_id === u.id; }

add('POST', '/api/maintenance/:id/assign', true, (req) => {
  const m = db.prepare('SELECT * FROM maintenance WHERE id=?').get(N(req.params.id)); if (!m) return { status: 404, body: { error: 'not_found' } };
  if (!canManageMaint(m, req.user)) return { status: 403, body: { error: 'forbidden' } };
  const tech = (req.body || {}).technician || 'فني الصيانة';
  db.prepare("UPDATE maintenance SET status='assigned', technician=? WHERE id=?").run(tech, m.id);
  notify(m.requester_id, 'maint', `تم تعيين فني لطلبك: ${m.title_ar}`, `A technician was assigned: ${m.title_en}`, tech, tech);
  return { status: 200, body: { request: mapMaint(db.prepare('SELECT * FROM maintenance WHERE id=?').get(m.id)) } };
});
add('POST', '/api/maintenance/:id/start', true, (req) => {
  const m = db.prepare('SELECT * FROM maintenance WHERE id=?').get(N(req.params.id)); if (!m || !canManageMaint(m, req.user)) return { status: 403, body: { error: 'forbidden' } };
  db.prepare("UPDATE maintenance SET status='in_progress' WHERE id=?").run(m.id);
  return { status: 200, body: { request: mapMaint(db.prepare('SELECT * FROM maintenance WHERE id=?').get(m.id)) } };
});
add('POST', '/api/maintenance/:id/complete', true, (req) => {
  const m = db.prepare('SELECT * FROM maintenance WHERE id=?').get(N(req.params.id)); if (!m || !canManageMaint(m, req.user)) return { status: 403, body: { error: 'forbidden' } };
  db.prepare("UPDATE maintenance SET status='done' WHERE id=?").run(m.id);
  notify(m.requester_id, 'maint', `اكتملت الصيانة: ${m.title_ar}. قيّم الخدمة`, `Repair completed: ${m.title_en}. Rate the service`);
  return { status: 200, body: { request: mapMaint(db.prepare('SELECT * FROM maintenance WHERE id=?').get(m.id)) } };
});
add('POST', '/api/maintenance/:id/rate', true, (req) => {
  const m = db.prepare('SELECT * FROM maintenance WHERE id=?').get(N(req.params.id)); if (!m || m.requester_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE maintenance SET rating=? WHERE id=?').run(Math.max(1, Math.min(5, N((req.body || {}).rating) || 5)), m.id);
  return { status: 200, body: { request: mapMaint(db.prepare('SELECT * FROM maintenance WHERE id=?').get(m.id)) } };
});

// ================= PROPERTIES / UNITS =================
add('POST', '/api/properties', true, (req) => {
  if (req.user.role !== 'landlord') return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.name || !b.deed) return { status: 400, body: { error: 'invalid_input' } };
  const r = db.prepare('INSERT INTO properties(owner_id,name_ar,name_en,area,type,deed,verified,created_at) VALUES (?,?,?,?,?,?,0,?)').run(req.user.id, b.name, b.name, b.area || 'muh', b.type || 'building', b.deed, nowIso());
  const pid = Number(r.lastInsertRowid);
  const n = Math.max(1, Math.min(40, N(b.units) || 1));
  for (let i = 1; i <= n; i++) db.prepare('INSERT INTO units(property_id,no,type,beds,size,rent) VALUES (?,?,?,?,?,?)').run(pid, String(i), b.type === 'commercial' ? 'office' : b.type === 'villa' ? 'villa' : 'apt', 2, 90, 300);
  db.prepare('INSERT INTO verification_requests(user_id,kind,property_id,created_at) VALUES (?,?,?,?)').run(req.user.id, 'deed', pid, nowIso());
  for (const admin of db.prepare("SELECT id FROM users WHERE role='admin'").all()) notify(admin.id, 'sys', `طلب توثيق عقار جديد: ${b.name}`, `New property verification: ${b.name}`);
  audit(req.user.id, 'إضافة عقار جديد', 'Added a new property', b.name);
  return { status: 201, body: { property: mapProp(db.prepare('SELECT * FROM properties WHERE id=?').get(pid)), units: db.prepare('SELECT * FROM units WHERE property_id=?').all(pid).map(mapUnit) } };
});

add('POST', '/api/properties/:id/units', true, (req) => {
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(N(req.params.id)); if (!p || p.owner_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const r = db.prepare('INSERT INTO units(property_id,no,type,beds,size,rent) VALUES (?,?,?,?,?,?)').run(p.id, b.no, b.type || 'apt', N(b.beds) || 0, N(b.size) || 0, N(b.rent) || 0);
  return { status: 201, body: { unit: mapUnit(db.prepare('SELECT * FROM units WHERE id=?').get(Number(r.lastInsertRowid))) } };
});

add('POST', '/api/units/:id/list', true, (req) => {
  const u = unitRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  const p = db.prepare('SELECT * FROM properties WHERE id=?').get(u.property_id); if (p.owner_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE units SET listed=? WHERE id=?').run(bool((req.body || {}).listed) ? 1 : 0, u.id);
  return { status: 200, body: { unit: mapUnit(unitRow(u.id)) } };
});

// ================= DOCUMENTS =================
add('POST', '/api/documents', true, (req) => {
  const b = req.body || {};
  const r = db.prepare('INSERT INTO documents(owner_id,contract_id,name,type,size_kb,data_url,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, N(b.contractId), String(b.name || ''), String(b.type || 'other'), N(b.sizeKb) || 1, b.dataUrl == null ? null : String(b.dataUrl), nowIso());
  return { status: 201, body: { document: mapDoc(db.prepare('SELECT * FROM documents WHERE id=?').get(Number(r.lastInsertRowid))) } };
});
add('DELETE', '/api/documents/:id', true, (req) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(N(req.params.id)); if (!d || d.owner_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('DELETE FROM documents WHERE id=?').run(d.id);
  return { status: 200, body: { ok: true } };
});

// ================= NOTIFICATIONS =================
add('POST', '/api/notifications/:id/read', true, (req) => { db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').run(N(req.params.id), req.user.id); return { status: 200, body: { ok: true } }; });
add('POST', '/api/notifications/read-all', true, (req) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); return { status: 200, body: { ok: true } }; });

// ================= USERS (admin) =================
function requireAdmin(req) { return req.user && req.user.role === 'admin'; }
// Enforce the role_permissions matrix on the server. The super admin bypasses it;
// every other admin sub-role (legal/finance/support/…) is limited to its granted permissions.
function hasPerm(req, perm) {
  if (!requireAdmin(req)) return false;
  const sub = req.user.sub_role;
  if (!sub || sub === 'super') return true;
  const rp = db.prepare('SELECT allowed FROM role_permissions WHERE role_id=? AND perm=?').get(sub, perm);
  return !!(rp && rp.allowed);
}
add('POST', '/api/users/:id/verify', true, (req) => {
  if (!hasPerm(req, 'verify')) return { status: 403, body: { error: 'forbidden' } };
  const u = userRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  db.prepare("UPDATE users SET verified=1, status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=?").run(u.id);
  db.prepare("DELETE FROM verification_requests WHERE user_id=? AND kind!='deed'").run(u.id);
  notify(u.id, 'sys', 'تم اعتماد توثيقك', 'Your verification was approved');
  audit(req.user.id, 'اعتماد توثيق مستخدم', 'Approved user verification', String(u.id));
  return { status: 200, body: { user: mapUser(userRow(u.id)) } };
});
add('POST', '/api/users/:id/status', true, (req) => {
  if (!hasPerm(req, 'users.manage')) return { status: 403, body: { error: 'forbidden' } };
  const u = userRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  const status = u.status === 'suspended' ? 'active' : 'suspended';
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, u.id);
  audit(req.user.id, status === 'suspended' ? 'تعليق حساب مستخدم' : 'إعادة تفعيل حساب', status === 'suspended' ? 'Suspended account' : 'Reactivated account', String(u.id));
  return { status: 200, body: { user: mapUser(userRow(u.id)) } };
});
add('POST', '/api/users/invite', true, (req) => {
  if (!hasPerm(req, 'users.manage')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.name || !/.+@.+\..+/.test(b.email || '')) return { status: 400, body: { error: 'invalid_input' } };
  if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email)) return { status: 409, body: { error: 'email_taken' } };
  const isStaff = String(b.role).startsWith('admin:');
  const tempPass = crypto.randomBytes(6).toString('hex');
  const r = db.prepare('INSERT INTO users(role,sub_role,name_ar,name_en,email,password_hash,status,verified,created_at) VALUES (?,?,?,?,?,?,?,0,?)')
    .run(isStaff ? 'admin' : b.role, isStaff ? b.role.split(':')[1] : null, b.name, b.name, b.email, hashPassword(tempPass), 'pending', nowIso());
  audit(req.user.id, 'دعوة مستخدم جديد', 'Invited a new user', b.email);
  return { status: 201, body: { user: mapUser(userRow(Number(r.lastInsertRowid))), tempPassword: tempPass } };
});

add('GET', '/api/users/:id/export', true, (req) => {
  if (!hasPerm(req, 'users.view')) return { status: 403, body: { error: 'forbidden' } };
  const u = userRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  const contracts = db.prepare('SELECT * FROM contracts WHERE landlord_id=? OR tenant_id=? ORDER BY id').all(u.id, u.id);
  const cids = contracts.map((c) => c.id);
  const payments = cids.length ? db.prepare(`SELECT * FROM payments WHERE contract_id IN (${cids.map(() => '?').join(',')}) ORDER BY id`).all(...cids) : [];
  const properties = db.prepare('SELECT * FROM properties WHERE owner_id=?').all(u.id);
  const maintenance = db.prepare('SELECT * FROM maintenance WHERE requester_id=?').all(u.id);
  const documents = db.prepare('SELECT id,name,type,size_kb,created_at FROM documents WHERE owner_id=?').all(u.id);
  const payload = {
    exportedAt: nowIso(),
    account: { id: S(u.id), role: u.role, name: { ar: u.name_ar, en: u.name_en }, cpr: u.cpr, phone: u.phone, email: u.email, status: u.status, verified: bool(u.verified), joined: u.created_at },
    properties: properties.map(mapProp), contracts: contracts.map(mapContract), payments: payments.map(mapPayment),
    maintenance: maintenance.map(mapMaint), documents,
  };
  audit(req.user.id, 'تصدير بيانات مستخدم', 'Exported user data', 'user:' + u.id);
  return { status: 200, contentType: 'application/json; charset=utf-8', raw: JSON.stringify(payload, null, 2), headers: { 'Content-Disposition': `attachment; filename="user-${u.id}-${new Date().toISOString().slice(0, 10)}.json"` } };
});

// ================= VERIFICATION REQUESTS (admin) =================
add('POST', '/api/verification/:id/approve', true, (req) => {
  if (!hasPerm(req, 'verify')) return { status: 403, body: { error: 'forbidden' } };
  const v = db.prepare('SELECT * FROM verification_requests WHERE id=?').get(N(req.params.id)); if (!v) return { status: 404, body: { error: 'not_found' } };
  if (v.kind === 'deed' && v.property_id) { db.prepare('UPDATE properties SET verified=1 WHERE id=?').run(v.property_id); }
  else { db.prepare("UPDATE users SET verified=1, status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=?").run(v.user_id); notify(v.user_id, 'sys', 'تم اعتماد توثيقك', 'Your verification was approved'); }
  db.prepare('DELETE FROM verification_requests WHERE id=?').run(v.id);
  audit(req.user.id, 'اعتماد طلب توثيق', 'Approved verification request', String(v.user_id));
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/verification/:id/reject', true, (req) => {
  if (!hasPerm(req, 'verify')) return { status: 403, body: { error: 'forbidden' } };
  const v = db.prepare('SELECT * FROM verification_requests WHERE id=?').get(N(req.params.id)); if (!v) return { status: 404, body: { error: 'not_found' } };
  db.prepare('DELETE FROM verification_requests WHERE id=?').run(v.id);
  notify(v.user_id, 'sys', 'تم رفض طلب التوثيق', 'Your verification request was rejected');
  audit(req.user.id, 'رفض طلب توثيق', 'Rejected verification request', String(v.user_id));
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/properties/:id/verify', true, (req) => {
  if (!hasPerm(req, 'verify')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE properties SET verified=1 WHERE id=?').run(N(req.params.id));
  db.prepare("DELETE FROM verification_requests WHERE property_id=?").run(N(req.params.id));
  audit(req.user.id, 'توثيق عقار', 'Verified property', req.params.id);
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/properties/:id/clear-duplicate', true, (req) => {
  if (!hasPerm(req, 'verify')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE properties SET dup=0 WHERE id=?').run(N(req.params.id));
  audit(req.user.id, 'إغلاق اشتباه تكرار عقار', 'Cleared duplicate flag', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= TICKETS =================
add('POST', '/api/tickets', true, (req) => {
  const b = req.body || {};
  const subject = String(b.subject || '');
  const id = 'T-' + (1045 + db.prepare('SELECT COUNT(*) c FROM tickets').get().c);
  db.prepare('INSERT INTO tickets(id,from_user,subject,category,priority,status,created_at) VALUES (?,?,?,?,?,?,?)').run(id, req.user.id, subject, String(b.category || 'other'), String(b.priority || 'normal'), 'open', nowIso());
  db.prepare('INSERT INTO ticket_messages(ticket_id,from_user,message,created_at) VALUES (?,?,?,?)').run(id, req.user.id, String(b.message || ''), nowIso());
  for (const admin of db.prepare("SELECT id FROM users WHERE role='admin'").all()) notify(admin.id, 'maint', `تذكرة دعم جديدة: ${subject}`, `New support ticket: ${subject}`, req.user.name_ar, req.user.name_en);
  return { status: 201, body: { ticket: mapTicket(db.prepare('SELECT * FROM tickets WHERE id=?').get(id)) } };
});
add('POST', '/api/tickets/:id', true, (req) => {
  if (!hasPerm(req, 'tickets')) return { status: 403, body: { error: 'forbidden' } };
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id); if (!t) return { status: 404, body: { error: 'not_found' } };
  const b = req.body || {};
  db.prepare('UPDATE tickets SET status=?, assignee=? WHERE id=?').run(b.status || t.status, N(b.assignee), t.id);
  if (b.reply) db.prepare('INSERT INTO ticket_messages(ticket_id,from_user,message,created_at) VALUES (?,?,?,?)').run(t.id, req.user.id, b.reply, nowIso());
  audit(req.user.id, 'تحديث تذكرة', 'Updated ticket', t.id);
  return { status: 200, body: { ticket: mapTicket(db.prepare('SELECT * FROM tickets WHERE id=?').get(t.id)) } };
});

// ================= CONTENT (admin) =================
add('POST', '/api/faq', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.qAr || !b.aAr) return { status: 400, body: { error: 'invalid_input' } };
  if (b.id) { db.prepare('UPDATE faq SET q_ar=?,q_en=?,a_ar=?,a_en=? WHERE id=?').run(b.qAr, b.qEn || b.qAr, b.aAr, b.aEn || b.aAr, N(b.id)); }
  else db.prepare('INSERT INTO faq(q_ar,q_en,a_ar,a_en,published) VALUES (?,?,?,?,1)').run(b.qAr, b.qEn || b.qAr, b.aAr, b.aEn || b.aAr);
  audit(req.user.id, 'تعديل الأسئلة الشائعة', 'Edited FAQ', 'faq');
  return { status: 200, body: { faq: db.prepare('SELECT * FROM faq').all().map(mapFaq) } };
});
add('POST', '/api/faq/:id/publish', true, (req) => { if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } }; db.prepare('UPDATE faq SET published=? WHERE id=?').run(bool((req.body || {}).published) ? 1 : 0, N(req.params.id)); return { status: 200, body: { ok: true } }; });
add('DELETE', '/api/faq/:id', true, (req) => { if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } }; db.prepare('DELETE FROM faq WHERE id=?').run(N(req.params.id)); return { status: 200, body: { ok: true } }; });

add('POST', '/api/templates/:id', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id); if (!t) return { status: 404, body: { error: 'not_found' } };
  const b = req.body || {};
  const parts = t.version.split('.'); const ver = `${parts[0]}.${Number(parts[1]) + 1}`;
  db.prepare('UPDATE templates SET name_ar=?, name_en=?, version=?, updated_at=?, published=? WHERE id=?').run(b.name || t.name_ar, b.name || t.name_en, ver, nowIso(), bool(b.published) ? 1 : 0, t.id);
  audit(req.user.id, 'تحديث قالب عقد', 'Updated contract template', t.id);
  return { status: 200, body: { template: mapTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(t.id)) } };
});
add('POST', '/api/messages/:id', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  db.prepare('UPDATE message_templates SET text_ar=?, text_en=? WHERE id=?').run(b.textAr, b.textEn, req.params.id);
  audit(req.user.id, 'تعديل نص إشعار', 'Edited notification text', req.params.id);
  return { status: 200, body: { message: mapMsg(db.prepare('SELECT * FROM message_templates WHERE id=?').get(req.params.id)) } };
});

// ================= INTEGRATIONS (admin) =================
add('POST', '/api/integrations/:id/toggle', true, (req) => {
  if (!hasPerm(req, 'integrations')) return { status: 403, body: { error: 'forbidden' } };
  const i = db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id);
  if (!i) return { status: 404, body: { error: 'not_found' } };
  const enabled = bool((req.body || {}).enabled) ? 1 : 0;
  db.prepare("UPDATE integrations SET enabled=?, status=CASE WHEN ?=1 AND status='off' THEN 'ok' ELSE status END WHERE id=?").run(enabled, enabled, req.params.id);
  audit(req.user.id, enabled ? 'تفعيل ربط' : 'إيقاف ربط', enabled ? 'Enabled integration' : 'Disabled integration', req.params.id);
  return { status: 200, body: { integration: mapInteg(db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id)) } };
});
add('POST', '/api/integrations/:id/test', true, (req) => {
  if (!hasPerm(req, 'integrations')) return { status: 403, body: { error: 'forbidden' } };
  const i = db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id); if (!i) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body: { ok: i.enabled === 1, ms: i.latency_ms, status: i.status } };
});

// ================= ROLES / PERMISSIONS (admin) =================
add('POST', '/api/roles', true, (req) => {
  if (!hasPerm(req, 'roles')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {}; if (!b.nameAr) return { status: 400, body: { error: 'invalid_input' } };
  const id = 'r' + Date.now();
  db.prepare('INSERT INTO roles(id,name_ar,name_en,editable) VALUES (?,?,?,1)').run(id, b.nameAr, b.nameEn || b.nameAr);
  const PERMS = ['users.view', 'users.manage', 'verify', 'contracts.review', 'contracts.terminate', 'payments.view', 'payments.refund', 'fees.config', 'tickets', 'content', 'integrations', 'reports', 'audit', 'roles', 'settings'];
  for (const p of PERMS) db.prepare('INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,0)').run(id, p);
  audit(req.user.id, 'إنشاء دور جديد', 'Created a new role', id);
  return { status: 201, body: { role: mapRole(db.prepare('SELECT * FROM roles WHERE id=?').get(id)) } };
});
add('POST', '/api/roles/:id/perm', true, (req) => {
  if (!hasPerm(req, 'roles')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  db.prepare('INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,?) ON CONFLICT(role_id,perm) DO UPDATE SET allowed=excluded.allowed').run(req.params.id, b.perm, bool(b.allowed) ? 1 : 0);
  audit(req.user.id, 'تعديل صلاحيات دور', 'Edited role permissions', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= SETTINGS / FEES (admin) =================
add('POST', '/api/settings', true, (req) => {
  if (!hasPerm(req, 'settings')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const map = { reg: 'fee_registration', renew: 'fee_renewal', remind: 'remind_days', late: 'late_repeat_days', session: 'session_timeout_min', retention: 'retention_months', twofa: 'two_factor_required', maintenanceMode: 'maintenance_mode', adminIp: 'admin_ip_allowlist' };
  for (const k of Object.keys(b)) if (map[k]) setSetting(map[k], typeof b[k] === 'boolean' ? (b[k] ? '1' : '0') : b[k]);
  audit(req.user.id, 'حفظ إعدادات النظام', 'Saved system settings', 'settings');
  return { status: 200, body: { ok: true } };
});

// ================= REFUNDS (admin) =================
add('POST', '/api/refunds/:id', true, (req) => {
  if (!hasPerm(req, 'payments.refund')) return { status: 403, body: { error: 'forbidden' } };
  const status = bool((req.body || {}).approve) ? 'approved' : 'rejected';
  db.prepare('UPDATE refunds SET status=? WHERE id=?').run(status, req.params.id);
  audit(req.user.id, status === 'approved' ? 'اعتماد استرجاع' : 'رفض استرجاع', status === 'approved' ? 'Approved refund' : 'Rejected refund', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= MIDDLEWARE-FACING HELPERS =================
const mapService = (s) => ({ id: S(s.id), name: { ar: s.name_ar, en: s.name_en }, desc: { ar: s.desc_ar, en: s.desc_en }, price: s.price, currency: s.currency, duration: s.duration_min, active: bool(s.active), order: s.sort_order, icon: s.icon });
const mapRequest = (r) => ({
  id: S(r.id), no: r.no, service: S(r.service_id), user: S(r.user_id), provider: r.provider_id ? S(r.provider_id) : null,
  status: r.status, amount: r.amount, notes: r.notes || '', scheduledAt: r.scheduled_at, completedAt: r.completed_at,
  created: r.created_at, updated: r.updated_at,
  events: db.prepare('SELECT * FROM request_events WHERE request_id=? ORDER BY id').all(r.id).map((e) => ({ id: S(e.id), from: e.from_user ? S(e.from_user) : null, kind: e.kind, note: e.note, t: e.created_at })),
});
const mapPost = (p) => ({ id: S(p.id), cat: p.category_id ? S(p.category_id) : null, title: { ar: p.title_ar, en: p.title_en }, excerpt: { ar: p.excerpt_ar, en: p.excerpt_en }, body: { ar: p.body_ar, en: p.body_en }, pub: bool(p.published), created: p.created_at, updated: p.updated_at });
const mapCategory = (c) => ({ id: S(c.id), name: { ar: c.name_ar, en: c.name_en }, order: c.sort_order });
const mapNotifLog = (n) => ({ id: S(n.id), audience: n.audience, label: n.audience_label, title: { ar: n.title_ar, en: n.title_en }, body: { ar: n.body_ar, en: n.body_en }, recipients: n.recipients, by: n.sent_by ? S(n.sent_by) : null, t: n.created_at });

function nextRequestNo() { const r = db.prepare("SELECT no FROM service_requests ORDER BY id DESC LIMIT 1").get(); const n = r ? Number(r.no.split('-')[2]) + 1 : 1; return `SR-2026-${String(n).padStart(5, '0')}`; }
function requestRow(id) { return db.prepare('SELECT * FROM service_requests WHERE id=?').get(id); }
function canSeeRequest(u, r) { return u.role === 'admin' || r.user_id === u.id || r.provider_id === u.id; }
function addRequestEvent(reqId, fromUser, kind, note) { db.prepare('INSERT INTO request_events(request_id,from_user,kind,note,created_at) VALUES (?,?,?,?,?)').run(reqId, fromUser, kind, note || '', nowIso()); }

// ================= AUTH: password change =================
add('POST', '/api/auth/password', true, (req) => {
  if (!rateLimit(req, 'password', 10, 15 * 60 * 1000)) return { status: 429, body: { error: 'too_many_requests' } };
  const b = req.body || {};
  const current = String(b.currentPassword || ''), next = String(b.newPassword || '');
  if (next.length < 8) return { status: 400, body: { error: 'weak_password' } };
  if (!verifyPassword(current, req.user.password_hash)) return { status: 400, body: { error: 'wrong_password' } };
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token!=?').run(req.user.id, parseCookies(req.headers.cookie).ejari_session || '');
  audit(req.user.id, 'تغيير كلمة المرور', 'Changed password', 'user:' + req.user.id);
  notify(req.user.id, 'sys', 'تم تغيير كلمة المرور', 'Your password was changed');
  return { status: 200, body: { ok: true } };
});

// ================= SERVICES (catalogue) =================
add('GET', '/api/services', false, () => ({ status: 200, body: db.prepare('SELECT * FROM services ORDER BY sort_order, id').all().map(mapService) }));
add('POST', '/api/services', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const nameAr = String(b.nameAr || '').trim(), nameEn = String(b.nameEn || '').trim();
  if (!nameAr || !nameEn) return { status: 400, body: { error: 'name_required' } };
  const r = db.prepare(`INSERT INTO services(name_ar,name_en,desc_ar,desc_en,price,currency,duration_min,active,sort_order,icon,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(nameAr, nameEn, b.descAr || '', b.descEn || '', Number(b.price) || 0, 'BHD', Number(b.duration) || 0, b.active === false ? 0 : 1, Number(b.order) || 99, b.icon || 'tag', nowIso());
  audit(req.user.id, 'إضافة خدمة', 'Added service', 'service:' + r.lastInsertRowid);
  return { status: 200, body: { service: mapService(db.prepare('SELECT * FROM services WHERE id=?').get(r.lastInsertRowid)) } };
});
add('POST', '/api/services/:id', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const s = db.prepare('SELECT * FROM services WHERE id=?').get(N(req.params.id));
  if (!s) return { status: 404, body: { error: 'not_found' } };
  const b = req.body || {};
  const before = { price: s.price, active: bool(s.active) };
  db.prepare(`UPDATE services SET name_ar=?,name_en=?,desc_ar=?,desc_en=?,price=?,duration_min=?,active=?,sort_order=?,icon=? WHERE id=?`)
    .run(b.nameAr != null ? b.nameAr : s.name_ar, b.nameEn != null ? b.nameEn : s.name_en, b.descAr != null ? b.descAr : s.desc_ar, b.descEn != null ? b.descEn : s.desc_en, b.price != null ? Number(b.price) : s.price, b.duration != null ? Number(b.duration) : s.duration_min, b.active != null ? (b.active ? 1 : 0) : s.active, b.order != null ? Number(b.order) : s.sort_order, b.icon || s.icon, s.id);
  const after = db.prepare('SELECT * FROM services WHERE id=?').get(s.id);
  auditChange(req.user.id, 'تعديل خدمة', 'Updated service', 'service:' + s.id, before, { price: after.price, active: bool(after.active) });
  return { status: 200, body: { service: mapService(after) } };
});
add('DELETE', '/api/services/:id', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE services SET active=0 WHERE id=?').run(N(req.params.id));
  audit(req.user.id, 'تعطيل خدمة', 'Disabled service', 'service:' + req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= SERVICE REQUESTS / APPOINTMENTS =================
add('GET', '/api/service-requests', true, (req) => {
  const rows = req.user.role === 'admin' ? db.prepare('SELECT * FROM service_requests ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM service_requests WHERE user_id=? OR provider_id=? ORDER BY id DESC').all(req.user.id, req.user.id);
  return { status: 200, body: { requests: rows.map(mapRequest) } };
});
add('POST', '/api/service-requests', true, (req) => {
  const b = req.body || {};
  const svc = db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(N(b.serviceId));
  if (!svc) return { status: 400, body: { error: 'service_not_found' } };
  const no = nextRequestNo();
  const r = db.prepare(`INSERT INTO service_requests(no,service_id,user_id,provider_id,status,amount,notes,scheduled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(no, svc.id, req.user.id, null, 'new', svc.price, String(b.notes || ''), b.scheduledAt || null, nowIso(), nowIso());
  const id = Number(r.lastInsertRowid);
  addRequestEvent(id, req.user.id, 'created', 'تم إنشاء الطلب');
  db.prepare("INSERT INTO notifications(user_id,type,text_ar,text_en,sub_ar,sub_en,read,created_at) SELECT id,'sys','طلب خدمة جديد','New service request',?,?,0,? FROM users WHERE role='admin'")
    .run(`طلب ${no}: ${svc.name_ar}`, `${no}: ${svc.name_en}`, nowIso());
  notify(req.user.id, 'sys', `تم استلام طلبك ${no}`, `Your request ${no} was received`, svc.name_ar, svc.name_en);
  audit(req.user.id, 'إنشاء طلب خدمة', 'Created service request', no);
  return { status: 200, body: { request: mapRequest(requestRow(id)) } };
});
add('POST', '/api/service-requests/:id/assign', true, (req) => {
  if (!hasPerm(req, 'tickets')) return { status: 403, body: { error: 'forbidden' } };
  const r = requestRow(N(req.params.id)); if (!r) return { status: 404, body: { error: 'not_found' } };
  const p = userRow(N((req.body || {}).providerId));
  if (!p || p.role !== 'admin') return { status: 400, body: { error: 'provider_not_found' } };
  db.prepare("UPDATE service_requests SET provider_id=?, status='assigned', updated_at=? WHERE id=?").run(p.id, nowIso(), r.id);
  addRequestEvent(r.id, req.user.id, 'assigned', `تم تعيين ${p.name_en}`);
  notify(r.user_id, 'sys', `تم تعيين مختص لطلبك ${r.no}`, `A specialist was assigned to ${r.no}`, p.name_ar, p.name_en);
  notify(p.id, 'sys', `تم تعيينك لطلب ${r.no}`, `You were assigned to ${r.no}`);
  audit(req.user.id, 'تعيين مختص لطلب', 'Assigned specialist', r.no);
  return { status: 200, body: { request: mapRequest(requestRow(r.id)) } };
});
add('POST', '/api/service-requests/:id/status', true, (req) => {
  const r = requestRow(N(req.params.id)); if (!r) return { status: 404, body: { error: 'not_found' } };
  if (!canSeeRequest(req.user, r) || (req.user.role !== 'admin' && r.provider_id !== req.user.id)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const allowed = ['new', 'assigned', 'scheduled', 'in_progress', 'done', 'cancelled'];
  const status = allowed.includes(b.status) ? b.status : r.status;
  const sched = b.scheduledAt !== undefined ? b.scheduledAt : r.scheduled_at;
  const done = status === 'done' ? nowIso() : r.completed_at;
  db.prepare('UPDATE service_requests SET status=?, scheduled_at=?, completed_at=?, updated_at=? WHERE id=?').run(status, sched, done, nowIso(), r.id);
  addRequestEvent(r.id, req.user.id, status, b.note || `الحالة: ${status}`);
  notify(r.user_id, 'sys', `تحديث حالة طلبك ${r.no}`, `Request ${r.no} updated`, `الحالة الجديدة: ${status}`, `New status: ${status}`);
  audit(req.user.id, 'تحديث حالة طلب', 'Updated request status', r.no);
  return { status: 200, body: { request: mapRequest(requestRow(r.id)) } };
});
add('POST', '/api/service-requests/:id/message', true, (req) => {
  const r = requestRow(N(req.params.id)); if (!r) return { status: 404, body: { error: 'not_found' } };
  if (!canSeeRequest(req.user, r)) return { status: 403, body: { error: 'forbidden' } };
  const text = String((req.body || {}).text || '').trim();
  if (!text) return { status: 400, body: { error: 'empty' } };
  addRequestEvent(r.id, req.user.id, 'message', text);
  const other = r.user_id === req.user.id ? r.provider_id : r.user_id;
  if (other) notify(other, 'msg', `رسالة جديدة على الطلب ${r.no}`, `New message on ${r.no}`);
  return { status: 200, body: { request: mapRequest(requestRow(r.id)) } };
});

// ================= CONTENT: categories, posts, media =================
add('GET', '/api/categories', false, () => ({ status: 200, body: db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all().map(mapCategory) }));
add('GET', '/api/posts', false, () => ({ status: 200, body: db.prepare('SELECT * FROM posts WHERE published=1 ORDER BY created_at DESC').all().map(mapPost) }));
add('POST', '/api/categories', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {}; if (!b.nameAr || !b.nameEn) return { status: 400, body: { error: 'name_required' } };
  const r = db.prepare('INSERT INTO categories(name_ar,name_en,sort_order) VALUES (?,?,?)').run(b.nameAr, b.nameEn, Number(b.order) || 99);
  audit(req.user.id, 'إضافة تصنيف', 'Added category', 'category:' + r.lastInsertRowid);
  return { status: 200, body: { category: mapCategory(db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid)) } };
});
add('POST', '/api/posts', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.titleAr || !b.titleEn) return { status: 400, body: { error: 'title_required' } };
  if (b.id) {
    const p = db.prepare('SELECT * FROM posts WHERE id=?').get(N(b.id));
    if (!p) return { status: 404, body: { error: 'not_found' } };
    db.prepare('UPDATE posts SET category_id=?,title_ar=?,title_en=?,excerpt_ar=?,excerpt_en=?,body_ar=?,body_en=?,published=?,updated_at=? WHERE id=?')
      .run(N(b.categoryId) || p.category_id, b.titleAr, b.titleEn, b.excerptAr || '', b.excerptEn || '', b.bodyAr || '', b.bodyEn || '', b.published ? 1 : 0, nowIso(), p.id);
    audit(req.user.id, 'تعديل مقال', 'Updated article', 'post:' + p.id);
    return { status: 200, body: { post: mapPost(db.prepare('SELECT * FROM posts WHERE id=?').get(p.id)) } };
  }
  const r = db.prepare('INSERT INTO posts(category_id,title_ar,title_en,excerpt_ar,excerpt_en,body_ar,body_en,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(N(b.categoryId), b.titleAr, b.titleEn, b.excerptAr || '', b.excerptEn || '', b.bodyAr || '', b.bodyEn || '', b.published ? 1 : 0, nowIso(), nowIso());
  audit(req.user.id, 'نشر مقال', 'Published article', 'post:' + r.lastInsertRowid);
  return { status: 200, body: { post: mapPost(db.prepare('SELECT * FROM posts WHERE id=?').get(r.lastInsertRowid)) } };
});
add('DELETE', '/api/posts/:id', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('DELETE FROM posts WHERE id=?').run(N(req.params.id));
  audit(req.user.id, 'حذف مقال', 'Deleted article', 'post:' + req.params.id);
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/media', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.dataUrl || String(b.dataUrl).length > 4 * 1024 * 1024) return { status: 400, body: { error: 'invalid_media' } };
  const r = db.prepare('INSERT INTO media(name,mime,data_url,size_kb,created_at) VALUES (?,?,?,?,?)').run(String(b.name || 'file'), String(b.mime || 'image/*'), b.dataUrl, Number(b.sizeKb) || 0, nowIso());
  audit(req.user.id, 'رفع وسيط', 'Uploaded media', 'media:' + r.lastInsertRowid);
  return { status: 200, body: { id: S(r.lastInsertRowid) } };
});

// ================= NOTIFICATIONS: broadcast + log =================
function audienceUserIds(audience) {
  if (audience === 'all') return db.prepare("SELECT id FROM users WHERE status!='suspended'").all().map((r) => r.id);
  if (audience === 'landlords') return db.prepare("SELECT id FROM users WHERE role='landlord'").all().map((r) => r.id);
  if (audience === 'tenants') return db.prepare("SELECT id FROM users WHERE role='tenant'").all().map((r) => r.id);
  if (audience === 'staff') return db.prepare("SELECT id FROM users WHERE role='admin'").all().map((r) => r.id);
  return [];
}
add('GET', '/api/notification-log', true, (req) => {
  if (!hasPerm(req, 'reports')) return { status: 403, body: { error: 'forbidden' } };
  return { status: 200, body: { log: db.prepare('SELECT * FROM notification_log ORDER BY id DESC LIMIT 100').all().map(mapNotifLog) } };
});
add('POST', '/api/notifications/broadcast', true, (req) => {
  if (!hasPerm(req, 'content')) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const ids = audienceUserIds(String(b.audience || 'all'));
  if (!ids.length) return { status: 400, body: { error: 'empty_audience' } };
  const titleAr = String(b.titleAr || '').trim(), titleEn = String(b.titleEn || titleAr).trim();
  if (!titleAr) return { status: 400, body: { error: 'title_required' } };
  for (const id of ids) notify(id, 'sys', titleAr, titleEn, String(b.bodyAr || ''), String(b.bodyEn || ''));
  db.prepare('INSERT INTO notification_log(audience,audience_label,title_ar,title_en,body_ar,body_en,recipients,sent_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(String(b.audience || 'all'), String(b.label || ''), titleAr, titleEn, String(b.bodyAr || ''), String(b.bodyEn || ''), ids.length, req.user.id, nowIso());
  auditChange(req.user.id, 'إرسال إشعار جماعي', 'Sent broadcast notification', 'audience:' + (b.audience || 'all'), null, { recipients: ids.length });
  return { status: 200, body: { recipients: ids.length } };
});

// ================= REPORTS (real aggregates) =================
add('GET', '/api/reports/summary', true, (req) => {
  if (!hasPerm(req, 'reports')) return { status: 403, body: { error: 'forbidden' } };
  const g = (sql, ...p) => db.prepare(sql).get(...p).c;
  const byStatus = {};
  for (const r of db.prepare('SELECT status, COUNT(*) c FROM contracts GROUP BY status').all()) byStatus[r.status] = r.c;
  const fee = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind='fee' AND status='paid'").get().s;
  const rentCollected = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind='rent' AND status='paid'").get().s;
  const rentOutstanding = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind='rent' AND status IN ('due','overdue')").get().s;
  const reqByStatus = {};
  for (const r of db.prepare('SELECT status, COUNT(*) c FROM service_requests GROUP BY status').all()) reqByStatus[r.status] = r.c;
  return {
    status: 200, body: {
      users: { total: g('SELECT COUNT(*) c FROM users'), landlords: g("SELECT COUNT(*) c FROM users WHERE role='landlord'"), tenants: g("SELECT COUNT(*) c FROM users WHERE role='tenant'"), staff: g("SELECT COUNT(*) c FROM users WHERE role='admin'"), verified: g('SELECT COUNT(*) c FROM users WHERE verified=1') },
      properties: { total: g('SELECT COUNT(*) c FROM properties'), verified: g('SELECT COUNT(*) c FROM properties WHERE verified=1'), units: g('SELECT COUNT(*) c FROM units') },
      contracts: { total: g('SELECT COUNT(*) c FROM contracts'), byStatus },
      payments: { feeRevenue: fee, rentCollected, rentOutstanding, transactions: g("SELECT COUNT(*) c FROM payments WHERE status='paid'") },
      requests: { total: g('SELECT COUNT(*) c FROM service_requests'), byStatus: reqByStatus },
      maintenance: { total: g('SELECT COUNT(*) c FROM maintenance'), open: g("SELECT COUNT(*) c FROM maintenance WHERE status!='done'") },
      tickets: { total: g('SELECT COUNT(*) c FROM tickets'), open: g("SELECT COUNT(*) c FROM tickets WHERE status='open'") },
    },
  };
});

// ================= EXPORTS: receipt (HTML), document download, CSV =================
function escHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Server-side QR (byte mode, versions 1..3, EC level L, mask 0) — mirrors the client encoder
// so the printable documents carry a genuinely scannable code.
const _QEXP = new Uint8Array(512), _QLOG = new Uint8Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { _QEXP[i] = x; _QLOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) _QEXP[i] = _QEXP[i - 255]; })();
const _qmul = (a, b) => (a === 0 || b === 0 ? 0 : _QEXP[_QLOG[a] + _QLOG[b]]);
function _qgen(deg) { let p = [1]; for (let i = 0; i < deg; i++) { const n = new Array(p.length + 1).fill(0); for (let j = 0; j < p.length; j++) { n[j] ^= p[j]; n[j + 1] = _qmul(p[j], _QEXP[i]); } p = n; } return p; }
function _qec(data, len) { const g = _qgen(len), r = new Array(len).fill(0); for (const b of data) { const f = b ^ r[0]; r.shift(); r.push(0); for (let i = 0; i < len; i++) r[i] ^= _qmul(g[i + 1], f); } return r; }
const _QSZ = { 1: [26, 19], 2: [44, 34], 3: [70, 55] }, _QAL = { 1: [], 2: [6, 18], 3: [6, 22] };
function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let ver = 0; for (const v of [1, 2, 3]) if (bytes.length <= _QSZ[v][1] - 2) { ver = v; break; }
  if (!ver) throw new Error('qr_too_long');
  const [total, dataCw] = _QSZ[ver];
  const bits = []; const push = (v, l) => { for (let i = l - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(0b0100, 4); push(bytes.length, 8); for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; cw.push(v); }
  for (let i = 0; cw.length < dataCw; i++) cw.push([0xEC, 0x11][i % 2]);
  const msg = cw.concat(_qec(cw, total - dataCw));
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const res = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) { m[r][c] = v; res[r][c] = true; } };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue; const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4); set(rr, cc, on); } };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const r of _QAL[ver]) for (const c of _QAL[ver]) { if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i++) { res[8][i] = true; res[i][8] = true; }
  for (let i = 0; i < 8; i++) { res[8][size - 1 - i] = true; res[size - 1 - i][8] = true; }
  const dbits = []; for (const w of msg) for (let i = 7; i >= 0; i--) dbits.push((w >> i) & 1);
  let dir = -1, row = size - 1, bi = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    const c0 = col <= 6 ? col - 1 : col;
    for (let i = 0; i < size; i++) { const r = dir === -1 ? row - i : row + i; for (const c of [c0, c0 - 1]) { if (res[r][c]) continue; let bit = bi < dbits.length ? dbits[bi++] : 0; if ((r + c) % 2 === 0) bit ^= 1; m[r][c] = bit === 1; } }
    dir = -dir; row = dir === -1 ? size - 1 : 0;
  }
  const fmtData = (0b01 << 3) | 0; let rem = fmtData << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  const fmt = ((fmtData << 10) | rem) ^ 0b101010000010010; const fb = (i) => ((fmt >> i) & 1) === 1;
  for (let i = 0; i < 15; i++) {
    if (i < 6) m[i][8] = fb(i); else if (i < 8) m[i + 1][8] = fb(i); else m[size - 15 + i][8] = fb(i);
    if (i < 8) m[8][size - i - 1] = fb(i); else if (i < 9) m[8][15 - i] = fb(i); else m[8][15 - i - 1] = fb(i);
  }
  m[size - 8][8] = true;
  return m;
}
function qrDataUrl(text) {
  try {
    const m = qrMatrix(text), n = m.length; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c} ${r}h1v1h-1z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch { return null; }
}
function contractHtml(c, u, p, landlord, tenant, e, qr) {
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
  const row = (k, v) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escHtml(c.no)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:15px/1.7 'Segoe UI',Tahoma,sans-serif;color:#17253B;margin:0;padding:32px;background:#F2F5F9}
.r{max-width:720px;margin:0 auto;background:#fff;border:1px solid #DEE4EC;border-radius:14px;padding:36px}
h1{font-size:22px;margin:0 0 4px}.mut{color:#7D8CA1;font-size:13px}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:2px solid #0C7D63;padding-bottom:16px}
table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:9px 0;border-bottom:1px solid #EAEEF4}
td:first-child{color:#7D8CA1;width:40%}td:last-child{font-weight:600}
.sign{margin-top:28px;display:flex;gap:40px}.sign div{flex:1;border-top:1px dashed #7D8CA1;padding-top:6px;font-size:13px;color:#4A5B74}
button{margin-top:24px;background:#0C7D63;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer}
@media print{body{background:#fff;padding:0}.r{border:0}button{display:none}}
</style></head><body><div class="r">
<div class="head"><div><h1>عقد إيجار · Lease agreement</h1><div class="mut">إيجاري — منصة إدارة الإيجارات</div></div>
<div style="text-align:center">${qr ? `<img src="${qr}" width="96" height="96" alt="QR">` : ''}<div class="mut" style="font-size:11px">امسح للتحقق</div></div></div>
<table>
${row('رقم العقد · Contract no.', c.no)}
${row('المؤجر · Landlord', landlord ? landlord.name_ar : '—')}
${row('المستأجر · Tenant', tenant ? tenant.name_ar : '—')}
${row('العقار · Property', p ? p.name_ar : '—')}
${row('الوحدة · Unit', u ? `${u.no} — ${u.size} m²` : '—')}
${row('المدة · Term', `${c.months} شهراً · months`)}
${row('من · From', iso(c.start_date))}
${row('إلى · To', iso(e))}
${row('الإيجار · Rent', `BD ${Number(c.rent).toFixed(3)} / ${c.freq === 'monthly' ? 'شهر · month' : 'ربع سنة · quarter'}`)}
${row('مبلغ التأمين · Deposit', `BD ${Number(c.deposit).toFixed(3)}`)}
${row('يوم الاستحقاق · Due day', c.due_day)}
${row('الحالة · Status', c.status)}
${row('توقيع المؤجر · Landlord signature', c.signed_landlord ? 'موقّع · Signed' : 'غير مكتمل · Incomplete')}
${row('توقيع المستأجر · Tenant signature', c.signed_tenant ? 'موقّع · Signed' : 'غير مكتمل · Incomplete')}
</table>
<div class="sign"><div>توقيع المؤجر · Landlord</div><div>توقيع المستأجر · Tenant</div></div>
<button onclick="window.print()">طباعة · Print</button>
<div class="mut" style="margin-top:16px">© 2026 إيجاري — وثيقة صادرة إلكترونياً عن المنصة.</div>
</div></body></html>`;
}
function receiptHtml(p, c, tenant) {
  const money = (n) => `BD ${Number(n || 0).toFixed(3)}`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escHtml(p.receipt)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:15px/1.6 'Segoe UI',Tahoma,sans-serif;color:#17253B;margin:0;padding:32px;background:#F2F5F9}
.r{max-width:640px;margin:0 auto;background:#fff;border:1px solid #DEE4EC;border-radius:14px;padding:32px}
h1{font-size:20px;margin:0 0 4px}.mut{color:#7D8CA1;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:8px 0;border-bottom:1px solid #EAEEF4}
td:last-child{text-align:end;font-weight:600}.t{font-size:26px;font-weight:700;margin:16px 0}
.ok{display:inline-block;background:#DFF2E8;color:#17794F;border-radius:99px;padding:4px 12px;font-size:13px}
button{margin-top:24px;background:#0C7D63;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer}
@media print{body{background:#fff;padding:0}.r{border:0}button{display:none}}
</style></head><body><div class="r">
<h1>إيجاري — إيصال دفع</h1><div class="mut">Ejari — payment receipt</div>
<div class="t">${money(p.amount)} <span class="ok">${p.status === 'paid' ? 'مدفوعة · Paid' : escHtml(p.status)}</span></div>
<table>
<tr><td>رقم الإيصال · Receipt no.</td><td>${escHtml(p.receipt)}</td></tr>
<tr><td>رقم العقد · Contract</td><td>${escHtml(c ? c.no : '—')}</td></tr>
<tr><td>الدافع · Payer</td><td>${escHtml(tenant ? tenant.name_ar : '—')}</td></tr>
<tr><td>النوع · Type</td><td>${p.kind === 'fee' ? 'رسوم تسجيل · Registration fee' : 'إيجار · Rent'}</td></tr>
<tr><td>تاريخ الاستحقاق · Due date</td><td>${escHtml(p.due_date)}</td></tr>
<tr><td>تاريخ السداد · Paid on</td><td>${escHtml(p.paid_on || '—')}</td></tr>
<tr><td>الوسيلة · Method</td><td>${escHtml(p.method || '—')}</td></tr>
</table>
<button onclick="window.print()">طباعة · Print</button>
<div class="mut" style="margin-top:16px">© 2026 إيجاري — وثيقة صادرة إلكترونياً.</div>
</div></body></html>`;
}
function canAccessPayment(u, p) {
  if (u.role === 'admin') return true;
  const c = contractRow(p.contract_id);
  return c && (c.landlord_id === u.id || c.tenant_id === u.id);
}
add('GET', '/api/contracts/:id/document', true, (req) => {
  const c = contractRow(N(req.params.id));
  if (!c) return { status: 404, body: { error: 'not_found' } };
  if (req.user.role !== 'admin' && c.landlord_id !== req.user.id && c.tenant_id !== req.user.id) return { status: 403, body: { error: 'forbidden' } };
  const u = unitRow(c.unit_id), p = u ? db.prepare('SELECT * FROM properties WHERE id=?').get(u.property_id) : null;
  const landlord = userRow(c.landlord_id), tenant = userRow(c.tenant_id);
  const e = new Date(addMonths(new Date(c.start_date), c.months) - 86400000);
  const qr = qrDataUrl(c.no);
  return { status: 200, contentType: 'text/html; charset=utf-8', raw: contractHtml(c, u, p, landlord, tenant, e, qr) };
});
add('GET', '/api/payments/:id/receipt', true, (req) => {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(N(req.params.id));
  if (!p) return { status: 404, body: { error: 'not_found' } };
  if (!canAccessPayment(req.user, p)) return { status: 403, body: { error: 'forbidden' } };
  const c = contractRow(p.contract_id);
  const tenant = c ? userRow(c.tenant_id) : null;
  return { status: 200, contentType: 'text/html; charset=utf-8', raw: receiptHtml(p, c, tenant) };
});
add('GET', '/api/documents/:id/download', true, (req) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(N(req.params.id));
  if (!d) return { status: 404, body: { error: 'not_found' } };
  if (d.owner_id !== req.user.id && req.user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  if (!d.data_url) return { status: 404, body: { error: 'no_file' } };
  const m = /^data:([^;]+);base64,(.*)$/.exec(d.data_url);
  if (!m) return { status: 400, body: { error: 'bad_file' } };
  const buf = Buffer.from(m[2], 'base64');
  return { status: 200, contentType: m[1], raw: buf, headers: { 'Content-Disposition': `attachment; filename="${String(d.name).replace(/[^\w.\-]/g, '_')}"` } };
});

function csv(rows) { return '\uFEFF' + rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n'); }
add('GET', '/api/export/:kind', true, (req) => {
  const kind = req.params.kind; let rows; let name = kind;
  if (kind === 'contracts') {
    const cs = myContractRows(req.user);
    rows = [['no', 'tenant', 'landlord', 'unit', 'start', 'end', 'rent_bhd', 'status'], ...cs.map((c) => { const u = unitRow(c.unit_id); const e = new Date(addMonths(new Date(c.start_date), c.months) - 86400000); return [c.no, (userRow(c.tenant_id) || {}).name_en || '', (userRow(c.landlord_id) || {}).name_en || '', u ? u.no : '', c.start_date, e.toISOString().slice(0, 10), c.rent, c.status]; })];
  } else if (kind === 'payments') {
    if (req.user.role === 'admin' && !hasPerm(req, 'payments.view')) return { status: 403, body: { error: 'forbidden' } };
    const cs = myContractRows(req.user); const ids = cs.map((c) => c.id);
    const ps = ids.length ? db.prepare(`SELECT * FROM payments WHERE contract_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    rows = [['receipt', 'contract', 'kind', 'due', 'amount_bhd', 'status', 'paid_on', 'method'], ...ps.map((p) => { const c = contractRow(p.contract_id); return [p.receipt, c ? c.no : '', p.kind, p.due_date, p.amount, p.status, p.paid_on || '', p.method || '']; })];
  } else if (kind === 'users') {
    if (!hasPerm(req, 'users.view')) return { status: 403, body: { error: 'forbidden' } };
    rows = [['id', 'name', 'email', 'role', 'status', 'verified'], ...db.prepare('SELECT * FROM users').all().map((u) => [u.id, u.name_en, u.email, u.role, u.status, u.verified ? 1 : 0])];
  } else if (kind === 'audit') {
    if (!hasPerm(req, 'audit')) return { status: 403, body: { error: 'forbidden' } };
    rows = [['time', 'user', 'action', 'entity', 'before', 'after'], ...db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1000').all().map((a) => [a.created_at, (userRow(a.user_id) || {}).name_en || '', a.action_en, a.entity || '', a.before_value || '', a.after_value || ''])];
  } else if (kind === 'income') {
    if (req.user.role === 'admin' && !hasPerm(req, 'payments.view')) return { status: 403, body: { error: 'forbidden' } };
    const cs = myContractRows(req.user); const ids = cs.map((c) => c.id);
    const ps = ids.length ? db.prepare("SELECT * FROM payments WHERE kind='rent' AND status!='upcoming' AND contract_id IN (" + ids.map(() => '?').join(',') + ")").all(...ids) : [];
    const byMonth = {};
    for (const p of ps) { const k = String(p.due_date).slice(0, 7); byMonth[k] = byMonth[k] || { paid: 0, exp: 0 }; byMonth[k].exp += p.amount; if (p.status === 'paid') byMonth[k].paid += p.amount; }
    rows = [['month', 'collected_bhd', 'expected_bhd'], ...Object.keys(byMonth).sort().map((k) => [k, byMonth[k].paid, byMonth[k].exp])];
  } else if (kind === 'requests') {
    if (!hasPerm(req, 'reports')) return { status: 403, body: { error: 'forbidden' } };
    rows = [['no', 'service', 'user', 'provider', 'status', 'amount', 'scheduled', 'created'], ...db.prepare('SELECT * FROM service_requests ORDER BY id DESC').all().map((r) => [r.no, (db.prepare('SELECT name_en FROM services WHERE id=?').get(r.service_id) || {}).name_en || '', (userRow(r.user_id) || {}).name_en || '', r.provider_id ? (userRow(r.provider_id) || {}).name_en || '' : '', r.status, r.amount, r.scheduled_at || '', r.created_at])];
  } else return { status: 404, body: { error: 'unknown_export' } };
  return { status: 200, contentType: 'text/csv; charset=utf-8', raw: csv(rows), headers: { 'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` } };
});

// ================= MIDDLEWARE ENTRY POINT =================
export function attachUser(req) { req.user = currentUser(req); return req.user; }

// ---------- admin IP allow-list (persisted setting, enforced server-side) ----------
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function ipToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  return (((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + (+m[4])) >>> 0;
}
function ipAllowed(ip, list) {
  for (const raw of list.split(/[\s,]+/).filter(Boolean)) {
    if (raw === ip) return true;
    const cidr = /^(.+)\/(\d{1,2})$/.exec(raw);
    if (cidr) {
      const base = ipToInt(cidr[1]); const bits = +cidr[2]; const t = ipToInt(ip);
      if (base != null && t != null && bits >= 0 && bits <= 32) {
        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        if ((t & mask) === (base & mask)) return true;
      }
    }
  }
  return false;
}
// Returns true when an authenticated admin's client IP is outside the configured allow-list.
// An empty allow-list disables the restriction. Everyone but admins is unaffected.
export function adminIpBlocked(req) {
  if (!req.user || req.user.role !== 'admin') return false;
  const list = String(getSetting('admin_ip_allowlist', '') || '').trim();
  if (!list) return false;
  return !ipAllowed(clientIp(req), list);
}
