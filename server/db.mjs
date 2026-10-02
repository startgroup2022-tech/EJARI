// Real persistent SQLite database using Node's built-in node:sqlite module.
// No native compilation, no external dependency — the data survives restarts
// in data/ejari.db. Delete that file to reset to the seed dataset.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.mjs';
import { encryptJson } from './gateways.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.EJARI_DB_FILE || path.join(dataDir, 'ejari.db');
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,            -- landlord | tenant | admin
  sub_role TEXT,                 -- admin only: super/legal/finance/support/viewer
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  cpr TEXT, phone TEXT, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active | pending | suspended
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name_ar TEXT, name_en TEXT, area TEXT, type TEXT, deed TEXT,
  verified INTEGER NOT NULL DEFAULT 0, dup INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS units(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  no TEXT, type TEXT, beds INTEGER, size INTEGER, rent REAL,
  listed INTEGER NOT NULL DEFAULT 0, flag TEXT
);
CREATE TABLE IF NOT EXISTS contracts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT UNIQUE NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  landlord_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id INTEGER NOT NULL REFERENCES users(id),
  start_date TEXT, months INTEGER, rent REAL, deposit REAL, due_day INTEGER, freq TEXT,
  utilities INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,          -- pending_sign|pending_pay|active|expired|terminated|disputed|under_review|rejected
  signed_landlord INTEGER NOT NULL DEFAULT 0, signed_tenant INTEGER NOT NULL DEFAULT 0,
  notes TEXT, flag_ar TEXT, flag_en TEXT,
  renewal_state TEXT, renewal_rent REAL, renewal_months INTEGER, renewal_by TEXT,
  check_keys INTEGER DEFAULT 0, check_meters INTEGER DEFAULT 0, check_photos INTEGER DEFAULT 0, check_inv INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  kind TEXT NOT NULL,            -- rent | fee
  due_date TEXT NOT NULL, amount REAL NOT NULL,
  status TEXT NOT NULL,          -- upcoming|due|overdue|paid
  paid_on TEXT, method TEXT, receipt TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS maintenance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  requester_id INTEGER NOT NULL REFERENCES users(id),
  title_ar TEXT, title_en TEXT, category TEXT, priority TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new|assigned|in_progress|done
  technician TEXT, rating INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  contract_id INTEGER, name TEXT, type TEXT, size_kb INTEGER, data_url TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT, text_ar TEXT, text_en TEXT, sub_ar TEXT, sub_en TEXT,
  read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets(
  id TEXT PRIMARY KEY,
  from_user INTEGER NOT NULL REFERENCES users(id),
  subject TEXT, category TEXT, priority TEXT, status TEXT NOT NULL DEFAULT 'open',
  assignee INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  from_user INTEGER NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, action_ar TEXT, action_en TEXT, entity TEXT, ip TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS faq(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q_ar TEXT, q_en TEXT, a_ar TEXT, a_en TEXT, published INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS templates(
  id TEXT PRIMARY KEY, name_ar TEXT, name_en TEXT, version TEXT,
  updated_at TEXT, published INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS message_templates(
  id TEXT PRIMARY KEY, event_ar TEXT, event_en TEXT, text_ar TEXT, text_en TEXT
);
CREATE TABLE IF NOT EXISTS integrations(
  id TEXT PRIMARY KEY, name_ar TEXT, name_en TEXT, desc_ar TEXT, desc_en TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, status TEXT, latency_ms INTEGER, last_sync_min INTEGER
);
CREATE TABLE IF NOT EXISTS roles(
  id TEXT PRIMARY KEY, name_ar TEXT, name_en TEXT, editable INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS role_permissions(
  role_id TEXT NOT NULL, perm TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(role_id, perm)
);
CREATE TABLE IF NOT EXISTS refunds(
  id TEXT PRIMARY KEY, contract_id INTEGER, amount REAL, reason_ar TEXT, reason_en TEXT, status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS settings( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS verification_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, property_id INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  desc_ar TEXT, desc_en TEXT, price REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'BHD',
  duration_min INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, icon TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT UNIQUE NOT NULL, service_id INTEGER NOT NULL REFERENCES services(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'new',          -- new|assigned|scheduled|in_progress|done|cancelled
  amount REAL, notes TEXT, scheduled_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS request_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES service_requests(id),
  from_user INTEGER, kind TEXT, note TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  excerpt_ar TEXT, excerpt_en TEXT, body_ar TEXT, body_en TEXT,
  published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, mime TEXT, data_url TEXT, size_kb INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT, audience_label TEXT, title_ar TEXT, title_en TEXT,
  body_ar TEXT, body_en TEXT, recipients INTEGER NOT NULL DEFAULT 0,
  sent_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_gateways(
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,            -- sandbox | benefitpay | card | banktransfer | …
  label_ar TEXT NOT NULL, label_en TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  test_mode INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BHD',
  config_enc TEXT,                   -- AES-256-GCM encrypted JSON of provider credentials
  webhook_secret_enc TEXT,           -- encrypted signing secret for inbound webhooks
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_intents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,    -- our idempotency key, sent to the provider
  payment_id INTEGER REFERENCES payments(id),
  contract_id INTEGER REFERENCES contracts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  gateway_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'BHD',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|processing|paid|failed|cancelled|refunded
  method TEXT,
  provider_ref TEXT,                 -- opaque provider transaction id
  redirect_url TEXT,                 -- provider-hosted page the client is sent to
  failure_reason TEXT,
  test_mode INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS webhook_events(
  event_id TEXT PRIMARY KEY,         -- provider-supplied unique id (replay protection)
  gateway_id TEXT,
  intent_reference TEXT,
  status TEXT,
  signature_ok INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,          -- SHA-256 of the one-time token; the token itself is never stored
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_settings(
  kind TEXT PRIMARY KEY,             -- email | sms
  enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT,                     -- smtp | sendgrid | twilio | unifonic | console | null
  config_enc TEXT,                   -- AES-256-GCM encrypted JSON of provider credentials
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbound_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,             -- email | sms
  kind TEXT,                         -- password_reset | payment | refund | contract | otp | generic …
  to_addr TEXT, subject TEXT, body TEXT,
  status TEXT NOT NULL,              -- sent | logged | failed | disabled
  provider TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, sent_at TEXT
);
`);

const now = () => new Date().toISOString();
const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

// Demo/test data is only ever created outside production. A production database is
// initialised empty — only the authorization config (roles/permissions/settings) and, when
// EJARI_ADMIN_EMAIL/EJARI_ADMIN_PASSWORD are supplied, a single super admin are created.
// No demo users, properties, contracts, payments or transactions are ever inserted in production.
const IS_PROD = process.env.NODE_ENV === 'production';
const SEED = !IS_PROD || process.env.EJARI_SEED === '1';

function bootstrapSystem() {
  const PERMS = ['users.view', 'users.manage', 'verify', 'contracts.review', 'contracts.terminate', 'payments.view', 'payments.refund', 'fees.config', 'tickets', 'content', 'integrations', 'reports', 'audit', 'roles', 'settings'];
  if (count('roles') === 0) {
    const insR = db.prepare('INSERT INTO roles(id,name_ar,name_en,editable) VALUES (?,?,?,?)');
    insR.run('super', 'مدير النظام', 'Super admin', 0);
    insR.run('legal', 'مراجع قانوني', 'Legal reviewer', 1);
    insR.run('finance', 'مالي', 'Finance', 1);
    insR.run('support', 'دعم فني', 'Support', 1);
    const grant = { super: PERMS, legal: ['users.view', 'verify', 'contracts.review', 'contracts.terminate', 'tickets', 'audit'], finance: ['users.view', 'payments.view', 'payments.refund', 'fees.config', 'reports', 'audit'], support: ['users.view', 'tickets', 'content'] };
    const insRP = db.prepare('INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,?)');
    for (const role of Object.keys(grant)) for (const p of PERMS) insRP.run(role, p, grant[role].includes(p) ? 1 : 0);
  }
  const insSet = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
  for (const [k, v] of [
    ['fee_registration', '10'], ['fee_renewal', '5'], ['remind_days', '3'], ['late_repeat_days', '5'],
    ['two_factor_required', '1'], ['session_timeout_min', '30'], ['retention_months', '60'], ['maintenance_mode', '0'],
    // Company / locale / notification / email defaults — all editable from the admin console.
    ['company_name_ar', 'إيجاري'], ['company_name_en', 'Ejari'],
    ['currency', 'BHD'], ['timezone', 'Asia/Bahrain'], ['locale_default', 'ar'],
    ['support_email', 'info@ejari.bh'], ['support_phone', '+973 1753 7070'],
    ['notify_rent_due', '1'], ['notify_payment', '1'], ['notify_expiry', '1'], ['notify_renewal', '1'], ['notify_maintenance', '1'],
    ['email_enabled', '0'], ['smtp_host', ''], ['smtp_port', '587'], ['smtp_user', ''], ['smtp_from', 'no-reply@ejari.bh'],
  ]) insSet.run(k, v);

  if (count('users') === 0) {
    const email = String(process.env.EJARI_ADMIN_EMAIL || '').toLowerCase().trim();
    const password = String(process.env.EJARI_ADMIN_PASSWORD || '');
    if (!email || password.length < 8) {
      console.warn('\n  ⚠  No administrator account exists and EJARI_ADMIN_EMAIL / EJARI_ADMIN_PASSWORD are not set.');
      console.warn('     Set both (password ≥ 8 characters) and restart to create the first super admin.');
      console.warn('     No demo or default-password account was created.\n');
    } else {
      const name = String(process.env.EJARI_ADMIN_NAME || 'Platform administrator').trim();
      db.prepare(`INSERT INTO users(role,sub_role,name_ar,name_en,cpr,phone,email,password_hash,status,verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run('admin', 'super', name, name, null, null, email, hashPassword(password), 'active', 1, now());
      console.log(`  ✔  Created the initial super admin: ${email}`);
    }
  }
}

if (count('users') === 0) {
  if (SEED) {
    console.log('Seeding database with demo data (development/test only)…');
    seed();
  } else {
    console.log('Initialising an empty production database — no demo data is created.');
    bootstrapSystem();
  }
} else {
  // Existing database from an earlier version: make sure the newer catalogue tables exist.
  // Demo content is never injected into a production database.
  if (SEED) {
    try {
      const ids = {};
      for (const u of db.prepare('SELECT id, email FROM users').all()) {
        if (u.email === 'rashed.almanai@example.bh') ids.landlord = u.id;
        if (u.email === 'sara.aldosari@example.bh') ids.tenant = u.id;
        if (u.email === 'fatima.alhammadi@ejari.bh') ids.admin = u.id;
        if (u.email === 'hasan.bukhowa@ejari.bh') ids.admin2 = u.id;
        if (u.email === 'zainab.almahroos@ejari.bh') ids.admin3 = u.id;
      }
      if (ids.admin) seedCatalog(ids);
    } catch (e) { console.error('Catalog back-fill skipped:', e.message); }
  } else {
    bootstrapSystem(); // ensure roles/permissions/settings exist for a live database
  }
}

// Additive column migrations — no destructive change to existing data.
for (const [table, col, type] of [
  ['audit_log', 'before_value', 'TEXT'], ['audit_log', 'after_value', 'TEXT'],
  ['payments', 'gateway_id', 'TEXT'], ['payments', 'intent_id', 'INTEGER'], ['payments', 'txn_ref', 'TEXT'],
  ['refunds', 'payment_id', 'INTEGER'], ['refunds', 'gateway_id', 'TEXT'], ['refunds', 'provider', 'TEXT'],
  ['refunds', 'provider_ref', 'TEXT'], ['refunds', 'created_at', 'TEXT'],
  ['payment_intents', 'verified', 'INTEGER'], ['payment_intents', 'failure_reason', 'TEXT'],
]) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

// Additive indexes for the newer lookup paths (safe on both a clean and an existing database).
for (const sql of [
  'CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_outbound_created ON outbound_messages(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
]) { try { db.exec(sql); } catch { /* index already present or unsupported */ } }

// Messaging channels start unconfigured and disabled on every database (clean or existing).
// Nothing is ever sent until an operator configures a provider from the admin console.
for (const ch of ['email', 'sms']) {
  db.prepare('INSERT OR IGNORE INTO provider_settings(kind,enabled,provider,config_enc,updated_at) VALUES (?,0,NULL,NULL,?)').run(ch, now());
}

function seed() {
  const DEMO_PASSWORD = 'Demo@1234';
  const hash = hashPassword(DEMO_PASSWORD);
  const insU = db.prepare(`INSERT INTO users(role,sub_role,name_ar,name_en,cpr,phone,email,password_hash,status,verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const uid = {};
  const U = (key, role, ar, en, opts = {}) => {
    const r = insU.run(role, opts.sub || null, ar, en, opts.cpr || null, opts.phone || null, opts.email, hash, opts.status || 'active', opts.verified ?? 1, opts.created || now());
    uid[key] = Number(r.lastInsertRowid);
  };
  U('landlord', 'landlord', 'راشد المناعي', 'Rashed Al-Manai', { email: 'rashed.almanai@example.bh', phone: '+973 3612 4471', cpr: '810552391' });
  U('tenant', 'tenant', 'سارة الدوسري', 'Sara Al-Dosari', { email: 'sara.aldosari@example.bh', phone: '+973 3388 2054', cpr: '820147733' });
  U('tenant2', 'tenant', 'خالد الجاسم', 'Khaled Al-Jasim', { email: 'khaled.aljasim@example.bh', cpr: '830224415' });
  U('tenant3', 'tenant', 'نورة الكواري', 'Noora Al-Kuwari', { email: 'noora.alkuwari@example.bh', cpr: '840317729' });
  U('tenant4', 'tenant', 'يوسف بوعلي', 'Yousef Bu Ali', { email: 'yousef.bu@example.bh', cpr: '790115582' });
  U('tenant5', 'tenant', 'مريم العوضي', 'Maryam Al-Awadhi', { email: 'maryam.alawadhi@example.bh', cpr: '850621147' });
  U('tenant6', 'tenant', 'عبدالله فخرو', 'Abdulla Fakhro', { email: 'abdulla.fakhro@example.bh', cpr: '780512298' });
  U('tenant7', 'tenant', 'هند الزياني', 'Hind Al-Zayani', { email: 'hind.alzayani@example.bh', cpr: '860812734' });
  U('tenant8', 'tenant', 'أحمد بن رجب', 'Ahmed Bin Rajab', { email: 'ahmed.binrajab@example.bh', cpr: '900112837', status: 'pending', verified: 0 });
  U('landlord2', 'landlord', 'شركة الخليج للعقارات', 'Gulf Real Estate Co.', { email: 'info@gulf-realestate.example.bh', cpr: '700000001' });
  U('landlord3', 'landlord', 'جاسم الحمر', 'Jasim Al-Hammar', { email: 'jasim.alhammar@example.bh', cpr: '751122334' });
  U('tenant9', 'tenant', 'ليلى العريض', 'Layla Al-Areed', { email: 'layla.alareed@example.bh', cpr: '820933441' });
  U('tenant10', 'tenant', 'سلمان الغتم', 'Salman Al-Ghatam', { email: 'salman.alghatam@example.bh', cpr: '880223114' });
  U('tenant11', 'tenant', 'ريم القصيبي', 'Reem Al-Qusaibi', { email: 'reem.alqusaibi@example.bh', cpr: '910314552', status: 'pending', verified: 0 });
  U('tenant12', 'tenant', 'منى السيد', 'Mona Al-Sayed', { email: 'mona.alsayed@example.bh', cpr: '830518822', status: 'suspended' });
  U('admin', 'admin', 'فاطمة الحمادي', 'Fatima Al-Hammadi', { email: 'fatima.alhammadi@ejari.bh', sub: 'super', cpr: '750102233' });
  U('admin2', 'admin', 'حسن بوخوة', 'Hasan Bukhowa', { email: 'hasan.bukhowa@ejari.bh', sub: 'legal', cpr: '760203344' });
  U('admin3', 'admin', 'زينب المحروس', 'Zainab Al-Mahroos', { email: 'zainab.almahroos@ejari.bh', sub: 'finance', cpr: '770304455' });

  const insP = db.prepare(`INSERT INTO properties(owner_id,name_ar,name_en,area,type,deed,verified,dup,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const pid = {};
  const P = (key, owner, ar, en, area, type, deed, verified = 1, dup = 0) => { pid[key] = Number(insP.run(uid[owner], ar, en, area, type, deed, verified, dup, now()).lastInsertRowid); };
  P('p1', 'landlord', 'برج لؤلؤة المحرق', 'Muharraq Pearl Tower', 'muh', 'building', 'MH-20418');
  P('p2', 'landlord', 'فيلا الرفاع الشرقي', 'East Riffa Villa', 'riff', 'villa', 'RF-11072');
  P('p3', 'landlord', 'عمارة السنابس', 'Sanabis Residence', 'san', 'building', 'SN-30955');
  P('p4', 'landlord2', 'مجمع الجفير التجاري', 'Juffair Commercial Complex', 'juf', 'commercial', 'JF-40231');
  P('p5', 'landlord3', 'عمارة مدينة عيسى', 'Isa Town Building', 'isa', 'building', 'IS-50877', 0);
  P('p6', 'landlord2', 'مجمع أمواج السكني', 'Amwaj Residential Complex', 'amw', 'building', 'AM-60144', 1, 1);

  const insUnit = db.prepare(`INSERT INTO units(property_id,no,type,beds,size,rent,flag) VALUES (?,?,?,?,?,?,?)`);
  const un = {};
  const UNIT = (key, prop, no, type, beds, size, rent, flag = null) => { un[key] = Number(insUnit.run(pid[prop], no, type, beds, size, rent, flag).lastInsertRowid); };
  UNIT('un1', 'p1', '3', 'apt', 2, 105, 320); UNIT('un2', 'p1', '7', 'apt', 1, 70, 240); UNIT('un3', 'p1', '12', 'apt', 2, 118, 400);
  UNIT('un4', 'p1', '15', 'apt', 3, 150, 520); UNIT('un5', 'p1', '21', 'apt', 2, 120, 410); UNIT('un6', 'p1', '24', 'apt', 3, 155, 540);
  UNIT('un7', 'p2', '—', 'villa', 5, 420, 1100);
  UNIT('un8', 'p3', 'A1', 'apt', 2, 95, 300); UNIT('un9', 'p3', 'A2', 'apt', 2, 95, 300); UNIT('un10', 'p3', 'B1', 'apt', 1, 60, 210);
  UNIT('un11', 'p3', 'B2', 'apt', 1, 60, 210, 'maint');
  UNIT('un12', 'p4', 'G1', 'shop', 0, 80, 900); UNIT('un13', 'p4', '3', 'office', 0, 60, 700); UNIT('un14', 'p4', '5', 'office', 0, 65, 750);
  UNIT('un15', 'p5', '1', 'apt', 3, 130, 380); UNIT('un16', 'p5', '2', 'apt', 2, 100, 300);
  UNIT('un17', 'p6', '5B', 'apt', 2, 115, 650); UNIT('un18', 'p6', '6C', 'apt', 3, 160, 820);

  const d = (y, m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const insC = db.prepare(`INSERT INTO contracts(no,unit_id,landlord_id,tenant_id,start_date,months,rent,deposit,due_day,freq,utilities,status,signed_landlord,signed_tenant,created_at,flag_ar,flag_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const cid = {};
  const C = (key, no, unit, landlord, tenant, start, months, rent, deposit, dueDay, status, created, opts = {}) => {
    cid[key] = Number(insC.run(no, un[unit], uid[landlord], uid[tenant], start, months, rent, deposit, dueDay, 'monthly', opts.util ? 1 : 0, status, 1, status === 'pending_sign' && opts.noTenantSign ? 0 : 1, created, opts.flagAr || null, opts.flagEn || null).lastInsertRowid);
  };
  C('c1', 'EJ-2026-00412', 'un3', 'landlord', 'tenant', d(2025, 11, 1), 12, 400, 400, 25, 'active', d(2025, 10, 24), { util: 1 });
  C('c2', 'EJ-2026-00377', 'un1', 'landlord', 'tenant2', d(2026, 2, 1), 12, 320, 320, 1, 'active', d(2026, 1, 25));
  C('c3', 'EJ-2026-00455', 'un2', 'landlord', 'tenant3', d(2026, 6, 1), 12, 240, 240, 5, 'active', d(2026, 5, 24));
  C('c4', 'EJ-2026-00398', 'un5', 'landlord', 'tenant4', d(2025, 10, 15), 12, 410, 410, 15, 'active', d(2025, 10, 8));
  C('c5', 'EJ-2026-00421', 'un6', 'landlord', 'tenant5', d(2026, 4, 1), 12, 540, 540, 10, 'active', d(2026, 3, 27));
  C('c6', 'EJ-2026-00361', 'un7', 'landlord', 'tenant6', d(2025, 12, 1), 24, 1100, 2200, 1, 'active', d(2025, 11, 20));
  C('c7', 'EJ-2026-00433', 'un8', 'landlord', 'tenant7', d(2026, 3, 1), 12, 300, 300, 15, 'active', d(2026, 2, 22));
  C('c8', 'EJ-2026-00502', 'un9', 'landlord', 'tenant8', d(2026, 10, 1), 12, 300, 300, 1, 'pending_sign', d(2026, 9, 14), { noTenantSign: 1 });
  C('c9', 'EJ-2026-00289', 'un10', 'landlord', 'tenant9', d(2025, 8, 1), 12, 210, 210, 1, 'expired', d(2025, 7, 22));
  C('c10', 'EJ-2026-00340', 'un12', 'landlord2', 'tenant10', d(2026, 1, 1), 12, 900, 1800, 1, 'active', d(2025, 12, 20));
  C('c11', 'EJ-2026-00448', 'un13', 'landlord2', 'tenant10', d(2026, 5, 1), 12, 700, 700, 1, 'active', d(2026, 4, 22));
  C('c12', 'EJ-2026-00498', 'un17', 'landlord2', 'tenant11', d(2026, 9, 1), 12, 650, 650, 1, 'under_review', d(2026, 9, 17), { flagAr: 'قيمة الإيجار أعلى من متوسط المنطقة بنسبة 38%', flagEn: 'Rent is 38% above the area average' });
  C('c13', 'EJ-2026-00371', 'un18', 'landlord2', 'tenant7', d(2025, 11, 15), 12, 820, 820, 15, 'active', d(2025, 11, 8));
  C('c14', 'EJ-2026-00383', 'un15', 'landlord3', 'tenant6', d(2026, 1, 10), 12, 380, 380, 10, 'active', d(2026, 1, 3));
  C('c15', 'EJ-2026-00301', 'un16', 'landlord3', 'tenant12', d(2025, 9, 1), 12, 300, 300, 1, 'disputed', d(2025, 8, 24), { flagAr: 'نزاع على استرداد مبلغ التأمين', flagEn: 'Dispute over security deposit refund' });

  db.prepare(`UPDATE contracts SET renewal_state='requested', renewal_by='tenant' WHERE id=?`).run(cid.c4);

  // realistic payment schedule up to "today" for every active/expired/disputed contract
  const TODAY = new Date();
  const addMonths = (dt, n) => new Date(dt.getFullYear(), dt.getMonth() + n, dt.getDate());
  const insPay = db.prepare(`INSERT INTO payments(contract_id,kind,due_date,amount,status,paid_on,method,receipt,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  let receiptN = 700001;
  const rows = db.prepare('SELECT * FROM contracts').all();
  for (const c of rows) {
    if (!['active', 'expired', 'disputed'].includes(c.status)) continue;
    const start = new Date(c.start_date);
    const end = new Date(addMonths(start, c.months).getTime() - 86400000);
    for (let i = 0; i < c.months; i++) {
      let due = new Date(start.getFullYear(), start.getMonth() + i, c.due_day);
      if (i === 0 && start.getDate() > 1) due = start;
      if (due > end) break;
      const daysFromDue = Math.round((TODAY - due) / 86400000);
      if (daysFromDue < -45) break;
      if (daysFromDue > 400) continue;
      const past = due < TODAY;
      const sameMonth = due.getMonth() === TODAY.getMonth() && due.getFullYear() === TODAY.getFullYear();
      let overdueMark = (c.no === 'EJ-2026-00455' || c.no === 'EJ-2026-00433') && sameMonth;
      let status = past ? (overdueMark ? 'overdue' : 'paid') : (daysFromDue >= -30 ? 'due' : 'upcoming');
      const h = (i * 3) % 4;
      const paidOn = status === 'paid' ? new Date(due.getTime() - h * 86400000) : null;
      insPay.run(c.id, 'rent', due.toISOString().slice(0, 10), c.rent, status, paidOn ? paidOn.toISOString().slice(0, 10) : null, ['benefit', 'card', 'bank', 'benefit'][h], status === 'paid' ? 'RC-' + receiptN++ : null, now());
    }
  }
  insPay.run(cid.c8, 'fee', d(2026, 9, 30), 10, 'due', null, null, null, now());

  const insM = db.prepare(`INSERT INTO maintenance(unit_id,requester_id,title_ar,title_en,category,priority,status,technician,rating,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const M = (unit, by, ar, en, cat, pri, st, tech, rating, created) => insM.run(un[unit], uid[by], ar, en, cat, pri, st, tech, rating, created);
  M('un3', 'tenant', 'مكيف غرفة المعيشة لا يبرّد', 'Living-room AC is not cooling', 'ac', 'high', 'in_progress', 'مؤسسة الراحة للتكييف', 0, d(2026, 9, 15));
  M('un3', 'tenant', 'تسرّب من حنفية المطبخ', 'Kitchen tap leaking', 'plumb', 'normal', 'done', 'أبو ياسر للسباكة', 5, d(2026, 8, 28));
  M('un1', 'tenant2', 'عطل في مفتاح كهرباء الصالة', 'Hall light switch not working', 'elec', 'normal', 'new', null, 0, d(2026, 9, 18));
  M('un5', 'tenant4', 'رطوبة في سقف غرفة النوم', 'Damp patch on bedroom ceiling', 'paint', 'high', 'assigned', 'مؤسسة الألوان الحديثة', 0, d(2026, 9, 10));
  M('un6', 'tenant5', 'باب الشرفة لا يُغلق جيداً', 'Balcony door does not close properly', 'carp', 'normal', 'new', null, 0, d(2026, 9, 19));
  M('un8', 'tenant7', 'انقطاع الماء الساخن', 'No hot water', 'plumb', 'high', 'in_progress', 'أبو ياسر للسباكة', 0, d(2026, 9, 17));
  M('un7', 'tenant6', 'صيانة دورية لمضخة المسبح', 'Routine pool pump service', 'other', 'low', 'done', 'مؤسسة الواحة', 4, d(2026, 9, 2));
  M('un2', 'tenant3', 'تسرّب مياه من الحمّام', 'Water leak in bathroom', 'plumb', 'high', 'new', null, 0, d(2026, 9, 19));

  const insN = db.prepare(`INSERT INTO notifications(user_id,type,text_ar,text_en,sub_ar,sub_en,read,created_at) VALUES (?,?,?,?,?,?,?,?)`);
  const N = (u, ty, ar, en, subAr, subEn, read, created) => insN.run(uid[u], ty, ar, en, subAr || '', subEn || '', read ? 1 : 0, created);
  N('landlord', 'pay', 'تم استلام إيجار سبتمبر من خالد الجاسم', 'September rent received from Khaled Al-Jasim', '320 د.ب · شقة 3', 'BD 320 · Apt 3', 0, now());
  N('landlord', 'maint', 'طلب صيانة جديد عاجل: تسرّب مياه في شقة 7', 'New urgent request: water leak in apartment 7', 'برج لؤلؤة المحرق', 'Muharraq Pearl Tower', 0, now());
  N('landlord', 'renew', 'طلب تجديد من المستأجر يوسف بوعلي', 'Renewal request from tenant Yousef Bu Ali', 'ينتهي العقد خلال 25 يوماً', 'Contract ends in 25 days', 0, now());
  N('tenant', 'pay', 'موعد سداد الإيجار قريباً', 'Rent is due soon', '400 د.ب', 'BD 400', 0, now());
  N('tenant', 'maint', 'تحديث: تم تعيين فني لطلب تكييف الصالة', 'Update: a technician was assigned to your A/C request', 'مؤسسة الراحة للتكييف', 'Al-Raha A/C Est.', 0, now());
  N('admin', 'sys', 'طلبات توثيق بانتظار المراجعة', 'Verification requests awaiting review', '', '', 0, now());

  const insD = db.prepare(`INSERT INTO documents(owner_id,contract_id,name,type,size_kb,created_at) VALUES (?,?,?,?,?,?)`);
  insD.run(uid.landlord, cid.c1, 'عقد إيجار EJ-2026-00412.pdf', 'contract', 412, now());
  insD.run(uid.landlord, null, 'سند ملكية MH-20418.pdf', 'deed', 1800, now());
  insD.run(uid.tenant, cid.c1, 'عقد إيجار EJ-2026-00412.pdf', 'contract', 412, now());

  const insV = db.prepare(`INSERT INTO verification_requests(user_id,kind,property_id,created_at) VALUES (?,?,?,?)`);
  insV.run(uid.tenant11, 'cpr', null, now());
  insV.run(uid.tenant8, 'cpr', null, now());
  insV.run(uid.landlord3, 'deed', pid.p5, now());

  const insT = db.prepare(`INSERT INTO tickets(id,from_user,subject,category,priority,status,assignee,created_at) VALUES (?,?,?,?,?,?,?,?)`);
  insT.run('T-1044', uid.tenant12, 'نزاع على استرداد مبلغ التأمين', 'dispute', 'high', 'open', uid.admin2, now());
  db.prepare(`INSERT INTO ticket_messages(ticket_id,from_user,message,created_at) VALUES (?,?,?,?)`).run('T-1044', uid.tenant12, 'انتهى العقد منذ أسبوعين ولم يُعد المؤجر مبلغ التأمين رغم تسليم الشقة بحالة جيدة.', now());

  const insF = db.prepare(`INSERT INTO faq(q_ar,q_en,a_ar,a_en,published) VALUES (?,?,?,?,1)`);
  insF.run('كيف أنشئ حساباً جديداً؟', 'How do I create an account?', 'اضغط «إنشاء حساب جديد»، اختر نوع الحساب، وأدخل بياناتك. يُفعّل الحساب بعد التحقق من الهوية.', 'Select “Create account”, choose your account type and enter your details. The account activates after identity verification.');
  insF.run('كيف أنشئ عقد إيجار؟', 'How do I create a lease contract?', 'من لوحة المؤجر اختر «عقد جديد»، حدّد الوحدة والمستأجر والشروط، ثم وقّع إلكترونياً.', 'From the landlord dashboard choose “New contract”, pick the unit, tenant and terms, then sign electronically.');
  insF.run('كيف أتحقق من صحة عقد؟', 'How can I verify a contract?', 'أدخل رقم العقد في صفحة «التحقق من عقد» لعرض حالته دون كشف بيانات شخصية.', 'Enter the contract number on the “Verify a contract” page to see its status without exposing personal data.');
  insF.run('كيف أدفع الإيجار؟', 'How do I pay my rent?', 'من «المدفوعات» اختر الدفعة ثم وسيلة الدفع. يصدر الإيصال فوراً.', 'Under “Payments” pick the instalment and a payment method. The receipt is issued instantly.');

  const insTpl = db.prepare(`INSERT INTO templates(id,name_ar,name_en,version,updated_at,published,uses) VALUES (?,?,?,?,?,1,?)`);
  insTpl.run('t1', 'عقد إيجار سكني', 'Residential lease', '3.2', now(), 52310);
  insTpl.run('t2', 'عقد إيجار تجاري', 'Commercial lease', '2.4', now(), 14082);
  insTpl.run('t3', 'ملحق تجديد عقد', 'Lease renewal addendum', '1.3', now(), 18844);

  const insMsg = db.prepare(`INSERT INTO message_templates(id,event_ar,event_en,text_ar,text_en) VALUES (?,?,?,?,?)`);
  insMsg.run('ms1', 'تذكير باستحقاق الإيجار', 'Rent due reminder', 'تنبيه: يستحق إيجار وحدتك بتاريخ {date} بمبلغ {amount}.', 'Reminder: your unit rent of {amount} is due on {date}.');
  insMsg.run('ms2', 'تأكيد استلام دفعة', 'Payment received', 'تم استلام دفعتك بمبلغ {amount}. رقم الإيصال {receipt}.', 'We received your payment of {amount}. Receipt no. {receipt}.');

  const insI = db.prepare(`INSERT INTO integrations(id,name_ar,name_en,desc_ar,desc_en,enabled,status,latency_ms,last_sync_min) VALUES (?,?,?,?,?,1,?,?,?)`);
  insI.run('i1', 'مؤسسة التنظيم العقاري', 'Real Estate Regulatory Authority', 'سجل تكامل — يتطلب ربطاً رسمياً مع الجهة (غير متصل حالياً)', 'Integration record — requires a formal connection with the authority (not currently connected)', 'ok', 310, 2);
  insI.run('i2', 'هيئة الكهرباء والماء', 'Electricity & Water Authority', 'سجل تكامل — يتطلب ربطاً رسمياً مع الجهة (غير متصل حالياً)', 'Integration record — requires a formal connection with the authority (not currently connected)', 'warn', 2400, 5);
  insI.run('i3', 'بوابة الدفع (بنفاذ / البطاقات / تاب)', 'Payment gateway (Benefit Pay / cards / Tap)', 'مُدارة عبر شاشة بوابات الدفع — المحوّل الحقيقي الوحيد', 'Managed from the Payment gateways screen — the only real adapter', 'ok', 180, 1);

  const insR = db.prepare(`INSERT INTO roles(id,name_ar,name_en,editable) VALUES (?,?,?,?)`);
  insR.run('super', 'مدير النظام', 'Super admin', 0);
  insR.run('legal', 'مراجع قانوني', 'Legal reviewer', 1);
  insR.run('finance', 'مالي', 'Finance', 1);
  insR.run('support', 'دعم فني', 'Support', 1);
  const PERMS = ['users.view', 'users.manage', 'verify', 'contracts.review', 'contracts.terminate', 'payments.view', 'payments.refund', 'fees.config', 'tickets', 'content', 'integrations', 'reports', 'audit', 'roles', 'settings'];
  const grant = { super: PERMS, legal: ['users.view', 'verify', 'contracts.review', 'contracts.terminate', 'tickets', 'audit'], finance: ['users.view', 'payments.view', 'payments.refund', 'fees.config', 'reports', 'audit'], support: ['users.view', 'tickets', 'content'] };
  const insRP = db.prepare(`INSERT INTO role_permissions(role_id,perm,allowed) VALUES (?,?,?)`);
  for (const role of Object.keys(grant)) for (const p of PERMS) insRP.run(role, p, grant[role].includes(p) ? 1 : 0);

  const insSet = db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)`);
  for (const [k, v] of [
    ['fee_registration', '10'], ['fee_renewal', '5'], ['remind_days', '3'], ['late_repeat_days', '5'],
    ['two_factor_required', '1'], ['session_timeout_min', '30'], ['retention_months', '60'], ['maintenance_mode', '0'],
    ['company_name_ar', 'إيجاري'], ['company_name_en', 'Ejari'],
    ['currency', 'BHD'], ['timezone', 'Asia/Bahrain'], ['locale_default', 'ar'],
    ['support_email', 'info@ejari.bh'], ['support_phone', '+973 1753 7070'],
    ['notify_rent_due', '1'], ['notify_payment', '1'], ['notify_expiry', '1'], ['notify_renewal', '1'], ['notify_maintenance', '1'],
    ['email_enabled', '0'], ['smtp_host', ''], ['smtp_port', '587'], ['smtp_user', ''], ['smtp_from', 'no-reply@ejari.bh'],
  ]) insSet.run(k, v);

  // ---- service catalogue, categories, content, and sample requests ----
  seedCatalog(uid);

  // ---- a working default payment gateway (sandbox) so the payment flow is real out of the box ----
  seedGateways();

  console.log(`Seed complete: ${count('users')} users, ${count('properties')} properties, ${count('contracts')} contracts, ${count('payments')} payments.`);
}

// Seeds the newer tables. Safe to call on an existing database: each block is guarded,
// so an older data/ejari.db that predates these tables gets back-filled on next start.
function seedCatalog(uid) {
  if (count('services') === 0) {
    const insSvc = db.prepare(`INSERT INTO services(name_ar,name_en,desc_ar,desc_en,price,currency,duration_min,active,sort_order,icon,created_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)`);
    const SVC = (ar, en, da, de, price, dur, order, icon) => insSvc.run(ar, en, da, de, price, 'BHD', dur, order, icon, now());
    SVC('صياغة عقد إيجار', 'Lease drafting', 'إعداد عقد إيجار سكني أو تجاري وفق النموذج المعتمد.', 'Prepare a residential or commercial lease from the approved template.', 15, 30, 1, 'file');
    SVC('استشارة عقارية', 'Property consultation', 'استشارة قانونية أو عقارية مع مختص معتمد.', 'Legal or property consultation with an accredited specialist.', 25, 45, 2, 'users');
    SVC('توثيق سند ملكية', 'Title-deed verification', 'مراجعة وتوثيق سند الملكية للعقار.', 'Review and verify a property title deed.', 10, 20, 3, 'shield');
    SVC('معاينة وحدة', 'Unit inspection', 'معاينة حالة الوحدة قبل التسليم أو الاستلام.', 'Inspect a unit’s condition before hand-over.', 12, 40, 4, 'search');
    SVC('وساطة نزاع إيجاري', 'Lease dispute mediation', 'وساطة بين المؤجر والمستأجر لحل النزاع ودياً.', 'Mediate between landlord and tenant to resolve a dispute.', 30, 60, 5, 'alert');
    SVC('مراجعة قانونية للعقد', 'Contract legal review', 'مراجعة قانونية دقيقة لبنود العقد.', 'Detailed legal review of the lease terms.', 20, 30, 6, 'pen');
  }
  if (count('categories') === 0) {
    const insCat = db.prepare(`INSERT INTO categories(name_ar,name_en,sort_order) VALUES (?,?,?)`);
    insCat.run('أخبار', 'News', 1); insCat.run('أدلة', 'Guides', 2); insCat.run('أنظمة', 'Regulations', 3);
  }
  if (count('posts') === 0) {
    const news = db.prepare("SELECT id FROM categories WHERE name_en='News'").get();
    const guide = db.prepare("SELECT id FROM categories WHERE name_en='Guides'").get();
    const reg = db.prepare("SELECT id FROM categories WHERE name_en='Regulations'").get();
    const insPost = db.prepare(`INSERT INTO posts(category_id,title_ar,title_en,excerpt_ar,excerpt_en,body_ar,body_en,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`);
    insPost.run(reg.id, 'تحديثات على لائحة الإيجارات', 'Updates to the rent schedule', 'ملخص أهم التعديلات على أحكام الإيجار.', 'A summary of the key changes to rental provisions.', 'نُشرت تحديثات على لائحة الإيجارات تشمل آليات التجديد وزيادة القيمة الإيجارية. يُنصح المؤجرون والمستأجرون بمراجعة بنود عقودهم الحالية.', 'Updates to the rent schedule cover renewal mechanics and rent increases. Landlords and tenants are advised to review their current lease terms.', now(), now());
    insPost.run(guide.id, 'دليل المستأجر الجديد', 'New tenant guide', 'خطوات عملية من البحث عن وحدة حتى التوقيع.', 'Practical steps from finding a unit to signing.', 'يشرح هذا الدليل رحلة المستأجر: البحث عن الوحدة، التحقق من العقد، التوقيع الإلكتروني، ثم دفع رسوم التسجيل.', 'This guide walks through the tenant journey: finding a unit, verifying the contract, e-signing, then paying the registration fee.', now(), now());
    insPost.run(news.id, 'إطلاق التحقق الفوري من العقود', 'Instant contract verification launched', 'تحقق من صحة أي عقد برقمه دون كشف بيانات شخصية.', 'Verify any lease by its number without exposing personal data.', 'أصبح بإمكان أي طرف التحقق من صحة عقد إيجار مسجّل في المنصة باستخدام رقم العقد فقط، مع الحفاظ على خصوصية بيانات الأطراف.', 'Any party can now verify a lease registered on the platform using only its number, while preserving the parties’ privacy.', now(), now());
  }
  if (count('service_requests') === 0) {
    const svcId = (en) => db.prepare('SELECT id FROM services WHERE name_en=?').get(en).id;
    const insReq = db.prepare(`INSERT INTO service_requests(no,service_id,user_id,provider_id,status,amount,notes,scheduled_at,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insEv = db.prepare(`INSERT INTO request_events(request_id,from_user,kind,note,created_at) VALUES (?,?,?,?,?)`);
    const d = (y, m, day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const REQ = (no, s, user, prov, status, amount, notes, sched, done, created) => {
      const id = Number(insReq.run(no, svcId(s), uid[user], prov ? uid[prov] : null, status, amount, notes, sched, done, created, created).lastInsertRowid);
      insEv.run(id, uid[user], 'created', 'تم إنشاء الطلب', created);
      if (status !== 'new') insEv.run(id, uid.admin, 'assigned', 'تم تعيين مختص', created);
      if (['scheduled', 'in_progress', 'done'].includes(status)) insEv.run(id, uid[prov] || uid.admin, 'scheduled', 'تم تحديد الموعد', created);
      if (status === 'done') insEv.run(id, uid[prov] || uid.admin, 'done', 'تم إنجاز الطلب', done || created);
    };
    REQ('SR-2026-00001', 'Property consultation', 'tenant', 'admin2', 'scheduled', 25, 'استشارة حول تجديد العقد', d(2026, 10, 8), null, d(2026, 9, 20));
    REQ('SR-2026-00002', 'Title-deed verification', 'landlord', 'admin3', 'done', 10, 'توثيق سند ملكية برج لؤلؤة المحرق', d(2026, 9, 25), d(2026, 9, 25), d(2026, 9, 18));
    REQ('SR-2026-00003', 'Lease drafting', 'landlord', null, 'new', 15, 'صياغة عقد إيجار جديد لوحدة 15', null, null, d(2026, 9, 22));
    REQ('SR-2026-00004', 'Lease dispute mediation', 'tenant', 'admin2', 'in_progress', 30, 'وساطة في نزاع استرداد التأمين', null, null, d(2026, 9, 19));
  }
}

// Seeds a single, enabled sandbox gateway so that payments can be exercised end-to-end
// immediately. In production this is replaced by whatever the administrator configures.
export function seedGateways() {
  if (count('payment_gateways') > 0) return;
  const id = 'gw_sandbox';
  const cfg = { merchantId: 'SANDBOX-MERCHANT', secretKey: 'sandbox-secret-key' };
  const hook = crypto.randomBytes(24).toString('hex');
  db.prepare(`INSERT INTO payment_gateways(id,provider,label_ar,label_en,enabled,test_mode,is_default,currency,config_enc,webhook_secret_enc,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'sandbox', 'بوابة اختبار', 'Sandbox gateway', 1, 1, 1, 'BHD', encryptJson(cfg), encryptJson({ secret: hook }), now(), now());
}

export const nowIso = now;
