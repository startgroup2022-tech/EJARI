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
const mapAudit = (a) => ({ id: S(a.id), u: S(a.user_id), ar: a.action_ar, en: a.action_en, ent: a.entity, ip: a.ip, t: a.created_at });
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

add('GET', '/api/verify/:no', false, (req) => {
  const c = db.prepare('SELECT * FROM contracts WHERE no=?').get(req.params.no.toUpperCase());
  if (!c) return { status: 404, body: { found: false } };
  const u = unitRow(c.unit_id); const p = db.prepare('SELECT * FROM properties WHERE id=?').get(u.property_id);
  return { status: 200, body: { found: true, no: c.no, status: c.status, start: c.start_date, end: iso(addDays(addMonths(new Date(c.start_date), c.months), -1)), property: { ar: p.name_ar, en: p.name_en }, area: p.area, unit: { type: u.type, no: u.no }, signedBoth: bool(c.signed_landlord) && bool(c.signed_tenant) } };
});

// ---- auth ----
add('POST', '/api/auth/register', false, (req) => {
  const b = req.body || {};
  if (!b.name || !b.email || !b.password || !/^\d{9}$/.test(String(b.cpr || ''))) return { status: 400, body: { error: 'invalid_input' } };
  if (!['landlord', 'tenant'].includes(b.role)) return { status: 400, body: { error: 'invalid_role' } };
  if (db.prepare('SELECT id FROM users WHERE email=?').get(b.email)) return { status: 409, body: { error: 'email_taken' } };
  const r = db.prepare('INSERT INTO users(role,name_ar,name_en,cpr,phone,email,password_hash,status,verified,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)')
    .run(b.role, b.name, b.name, b.cpr, b.phone || null, b.email, hashPassword(b.password), 'pending', nowIso());
  const token = createSession(Number(r.lastInsertRowid));
  audit(Number(r.lastInsertRowid), 'إنشاء حساب جديد', 'Account created', b.email);
  return { status: 201, body: { user: mapUser(userRow(Number(r.lastInsertRowid))) }, cookie: token };
});

add('POST', '/api/auth/login', false, (req) => {
  const b = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').toLowerCase().trim()) || db.prepare('SELECT * FROM users WHERE email=?').get(b.email);
  if (!u || !verifyPassword(b.password || '', u.password_hash)) return { status: 401, body: { error: 'invalid_credentials' } };
  if (u.status === 'suspended') return { status: 403, body: { error: 'suspended' } };
  const token = createSession(u.id);
  return { status: 200, body: { user: mapUser(u) }, cookie: token };
});

add('POST', '/api/auth/demo', false, (req) => {
  const role = (req.body || {}).role;
  const emails = { landlord: 'rashed.almanai@example.bh', tenant: 'sara.aldosari@example.bh', admin: 'fatima.alhammadi@ejari.bh' };
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(emails[role]);
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
    body.fees = { reg: Number(getSetting('fee_registration', 10)), renew: Number(getSetting('fee_renewal', 5)), remind: Number(getSetting('remind_days', 3)), late: Number(getSetting('late_repeat_days', 5)), twofa: getSetting('two_factor_required', '1') === '1', session: Number(getSetting('session_timeout_min', 30)), retention: Number(getSetting('retention_months', 60)), maintenanceMode: getSetting('maintenance_mode', '0') === '1' };
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
  const no = nextContractNo();
  const r = db.prepare(`INSERT INTO contracts(no,unit_id,landlord_id,tenant_id,start_date,months,rent,deposit,due_day,freq,utilities,status,signed_landlord,signed_tenant,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?)`)
    .run(no, unit.id, u.id, tenant.id, b.start, N(b.months) || 12, N(b.rent), N(b.deposit) || N(b.rent), N(b.dueDay) || 1, b.freq || 'monthly', b.utilities ? 1 : 0, 'pending_sign', b.notes || '', nowIso());
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
  const r = db.prepare(`INSERT INTO maintenance(unit_id,requester_id,title_ar,title_en,category,priority,status,created_at) VALUES (?,?,?,?,?,?, 'new', ?)`)
    .run(active.unit_id, u.id, b.title, b.title, b.category || 'other', b.priority || 'normal', nowIso());
  const unit = unitRow(active.unit_id); const prop = db.prepare('SELECT * FROM properties WHERE id=?').get(unit.property_id);
  notify(prop.owner_id, 'maint', `طلب صيانة جديد: ${b.title}`, `New maintenance request: ${b.title}`, prop.name_ar, prop.name_en);
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
  const r = db.prepare('INSERT INTO documents(owner_id,contract_id,name,type,size_kb,data_url,created_at) VALUES (?,?,?,?,?,?,?)').run(req.user.id, N(b.contractId), b.name, b.type || 'other', N(b.sizeKb) || 1, b.dataUrl || null, nowIso());
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
add('POST', '/api/users/:id/verify', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const u = userRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  db.prepare("UPDATE users SET verified=1, status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=?").run(u.id);
  db.prepare("DELETE FROM verification_requests WHERE user_id=? AND kind!='deed'").run(u.id);
  notify(u.id, 'sys', 'تم اعتماد توثيقك', 'Your verification was approved');
  audit(req.user.id, 'اعتماد توثيق مستخدم', 'Approved user verification', String(u.id));
  return { status: 200, body: { user: mapUser(userRow(u.id)) } };
});
add('POST', '/api/users/:id/status', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const u = userRow(N(req.params.id)); if (!u) return { status: 404, body: { error: 'not_found' } };
  const status = u.status === 'suspended' ? 'active' : 'suspended';
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, u.id);
  audit(req.user.id, status === 'suspended' ? 'تعليق حساب مستخدم' : 'إعادة تفعيل حساب', status === 'suspended' ? 'Suspended account' : 'Reactivated account', String(u.id));
  return { status: 200, body: { user: mapUser(userRow(u.id)) } };
});
add('POST', '/api/users/invite', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
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

// ================= VERIFICATION REQUESTS (admin) =================
add('POST', '/api/verification/:id/approve', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const v = db.prepare('SELECT * FROM verification_requests WHERE id=?').get(N(req.params.id)); if (!v) return { status: 404, body: { error: 'not_found' } };
  if (v.kind === 'deed' && v.property_id) { db.prepare('UPDATE properties SET verified=1 WHERE id=?').run(v.property_id); }
  else { db.prepare("UPDATE users SET verified=1, status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=?").run(v.user_id); notify(v.user_id, 'sys', 'تم اعتماد توثيقك', 'Your verification was approved'); }
  db.prepare('DELETE FROM verification_requests WHERE id=?').run(v.id);
  audit(req.user.id, 'اعتماد طلب توثيق', 'Approved verification request', String(v.user_id));
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/verification/:id/reject', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const v = db.prepare('SELECT * FROM verification_requests WHERE id=?').get(N(req.params.id)); if (!v) return { status: 404, body: { error: 'not_found' } };
  db.prepare('DELETE FROM verification_requests WHERE id=?').run(v.id);
  notify(v.user_id, 'sys', 'تم رفض طلب التوثيق', 'Your verification request was rejected');
  audit(req.user.id, 'رفض طلب توثيق', 'Rejected verification request', String(v.user_id));
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/properties/:id/verify', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE properties SET verified=1 WHERE id=?').run(N(req.params.id));
  db.prepare("DELETE FROM verification_requests WHERE property_id=?").run(N(req.params.id));
  audit(req.user.id, 'توثيق عقار', 'Verified property', req.params.id);
  return { status: 200, body: { ok: true } };
});
add('POST', '/api/properties/:id/clear-duplicate', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  db.prepare('UPDATE properties SET dup=0 WHERE id=?').run(N(req.params.id));
  audit(req.user.id, 'إغلاق اشتباه تكرار عقار', 'Cleared duplicate flag', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= TICKETS =================
add('POST', '/api/tickets', true, (req) => {
  const b = req.body || {};
  const id = 'T-' + (1045 + db.prepare('SELECT COUNT(*) c FROM tickets').get().c);
  db.prepare('INSERT INTO tickets(id,from_user,subject,category,priority,status,created_at) VALUES (?,?,?,?,?,?,?)').run(id, req.user.id, b.subject, b.category || 'other', b.priority || 'normal', 'open', nowIso());
  db.prepare('INSERT INTO ticket_messages(ticket_id,from_user,message,created_at) VALUES (?,?,?,?)').run(id, req.user.id, b.message, nowIso());
  for (const admin of db.prepare("SELECT id FROM users WHERE role='admin'").all()) notify(admin.id, 'maint', `تذكرة دعم جديدة: ${b.subject}`, `New support ticket: ${b.subject}`, req.user.name_ar, req.user.name_en);
  return { status: 201, body: { ticket: mapTicket(db.prepare('SELECT * FROM tickets WHERE id=?').get(id)) } };
});
add('POST', '/api/tickets/:id', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id); if (!t) return { status: 404, body: { error: 'not_found' } };
  const b = req.body || {};
  db.prepare('UPDATE tickets SET status=?, assignee=? WHERE id=?').run(b.status || t.status, N(b.assignee), t.id);
  if (b.reply) db.prepare('INSERT INTO ticket_messages(ticket_id,from_user,message,created_at) VALUES (?,?,?,?)').run(t.id, req.user.id, b.reply, nowIso());
  audit(req.user.id, 'تحديث تذكرة', 'Updated ticket', t.id);
  return { status: 200, body: { ticket: mapTicket(db.prepare('SELECT * FROM tickets WHERE id=?').get(t.id)) } };
});

// ================= CONTENT (admin) =================
add('POST', '/api/faq', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  if (!b.qAr || !b.aAr) return { status: 400, body: { error: 'invalid_input' } };
  if (b.id) { db.prepare('UPDATE faq SET q_ar=?,q_en=?,a_ar=?,a_en=? WHERE id=?').run(b.qAr, b.qEn || b.qAr, b.aAr, b.aEn || b.aAr, N(b.id)); }
  else db.prepare('INSERT INTO faq(q_ar,q_en,a_ar,a_en,published) VALUES (?,?,?,?,1)').run(b.qAr, b.qEn || b.qAr, b.aAr, b.aEn || b.aAr);
  audit(req.user.id, 'تعديل الأسئلة الشائعة', 'Edited FAQ', 'faq');
  return { status: 200, body: { faq: db.prepare('SELECT * FROM faq').all().map(mapFaq) } };
});
add('POST', '/api/faq/:id/publish', true, (req) => { if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } }; db.prepare('UPDATE faq SET published=? WHERE id=?').run(bool((req.body || {}).published) ? 1 : 0, N(req.params.id)); return { status: 200, body: { ok: true } }; });
add('DELETE', '/api/faq/:id', true, (req) => { if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } }; db.prepare('DELETE FROM faq WHERE id=?').run(N(req.params.id)); return { status: 200, body: { ok: true } }; });

add('POST', '/api/templates/:id', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id); if (!t) return { status: 404, body: { error: 'not_found' } };
  const b = req.body || {};
  const parts = t.version.split('.'); const ver = `${parts[0]}.${Number(parts[1]) + 1}`;
  db.prepare('UPDATE templates SET name_ar=?, name_en=?, version=?, updated_at=?, published=? WHERE id=?').run(b.name || t.name_ar, b.name || t.name_en, ver, nowIso(), bool(b.published) ? 1 : 0, t.id);
  audit(req.user.id, 'تحديث قالب عقد', 'Updated contract template', t.id);
  return { status: 200, body: { template: mapTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(t.id)) } };
});
add('POST', '/api/messages/:id', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  db.prepare('UPDATE message_templates SET text_ar=?, text_en=? WHERE id=?').run(b.textAr, b.textEn, req.params.id);
  audit(req.user.id, 'تعديل نص إشعار', 'Edited notification text', req.params.id);
  return { status: 200, body: { message: mapMsg(db.prepare('SELECT * FROM message_templates WHERE id=?').get(req.params.id)) } };
});

// ================= INTEGRATIONS (admin) =================
add('POST', '/api/integrations/:id/toggle', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const enabled = bool((req.body || {}).enabled) ? 1 : 0;
  db.prepare('UPDATE integrations SET enabled=?, status=CASE WHEN ?=1 AND status="off" THEN "ok" ELSE status END WHERE id=?').run(enabled, enabled, req.params.id);
  audit(req.user.id, enabled ? 'تفعيل ربط' : 'إيقاف ربط', enabled ? 'Enabled integration' : 'Disabled integration', req.params.id);
  return { status: 200, body: { integration: mapInteg(db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id)) } };
});
add('POST', '/api/integrations/:id/test', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const i = db.prepare('SELECT * FROM integrations WHERE id=?').get(req.params.id); if (!i) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body: { ok: i.enabled === 1, ms: i.latency_ms, status: i.status } };
});

// ================= ROLES / PERMISSIONS (admin) =================
add('POST', '/api/roles', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {}; if (!b.nameAr) return { status: 400, body: { error: 'invalid_input' } };
  const id = 'r' + Date.now();
  db.prepare('INSERT INTO roles(id,name_ar,name_en,editable) VALUES (?,?,?,1)').run(id, b.nameAr, b.nameEn || b.nameAr);
  const PERMS = ['users.view', 'users.manage', 'verify', 'contracts.review', 'contracts.terminate', 'payments.view', 'payments.refund', 'fees.config', 'tickets', 'content', 'integrations', 'reports', 'audit', 'roles', 'settings'];
  for (const p of PERMS) db.prepare('INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,0)').run(id, p);
  audit(req.user.id, 'إنشاء دور جديد', 'Created a new role', id);
  return { status: 201, body: { role: mapRole(db.prepare('SELECT * FROM roles WHERE id=?').get(id)) } };
});
add('POST', '/api/roles/:id/perm', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  db.prepare('INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,?) ON CONFLICT(role_id,perm) DO UPDATE SET allowed=excluded.allowed').run(req.params.id, b.perm, bool(b.allowed) ? 1 : 0);
  audit(req.user.id, 'تعديل صلاحيات دور', 'Edited role permissions', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= SETTINGS / FEES (admin) =================
add('POST', '/api/settings', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const b = req.body || {};
  const map = { reg: 'fee_registration', renew: 'fee_renewal', remind: 'remind_days', late: 'late_repeat_days', session: 'session_timeout_min', retention: 'retention_months', twofa: 'two_factor_required', maintenanceMode: 'maintenance_mode' };
  for (const k of Object.keys(b)) if (map[k]) setSetting(map[k], typeof b[k] === 'boolean' ? (b[k] ? '1' : '0') : b[k]);
  audit(req.user.id, 'حفظ إعدادات النظام', 'Saved system settings', 'settings');
  return { status: 200, body: { ok: true } };
});

// ================= REFUNDS (admin) =================
add('POST', '/api/refunds/:id', true, (req) => {
  if (!requireAdmin(req)) return { status: 403, body: { error: 'forbidden' } };
  const status = bool((req.body || {}).approve) ? 'approved' : 'rejected';
  db.prepare('UPDATE refunds SET status=? WHERE id=?').run(status, req.params.id);
  audit(req.user.id, status === 'approved' ? 'اعتماد استرجاع' : 'رفض استرجاع', status === 'approved' ? 'Approved refund' : 'Rejected refund', req.params.id);
  return { status: 200, body: { ok: true } };
});

// ================= middleware entry point used by http.mjs =================
export function attachUser(req) { req.user = currentUser(req); return req.user; }
