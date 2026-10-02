/* ===== reference data (static labels — not persisted, safe to ship in the client) ===== */
let TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
let NOW = new Date();
const addM = (dt, n) => new Date(dt.getFullYear(), dt.getMonth() + n, dt.getDate());
const addD = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);

const AREAS = {
  muh: { ar: 'المحرق', en: 'Muharraq', gov: 'muh' }, riff: { ar: 'الرفاع', en: 'Riffa', gov: 'south' }, san: { ar: 'السنابس', en: 'Sanabis', gov: 'cap' },
  juf: { ar: 'الجفير', en: 'Juffair', gov: 'cap' }, isa: { ar: 'مدينة عيسى', en: 'Isa Town', gov: 'south' }, amw: { ar: 'أمواج', en: 'Amwaj Islands', gov: 'muh' },
  man: { ar: 'المنامة', en: 'Manama', gov: 'cap' }, hid: { ar: 'الحد', en: 'Hidd', gov: 'muh' }, jid: { ar: 'جدحفص', en: 'Jidhafs', gov: 'cap' }, sit: { ar: 'مدينة حمد', en: 'Hamad Town', gov: 'north' },
};
const GOV = { cap: { ar: 'العاصمة', en: 'Capital' }, muh: { ar: 'المحرق', en: 'Muharraq' }, north: { ar: 'الشمالية', en: 'Northern' }, south: { ar: 'الجنوبية', en: 'Southern' } };
const UT = { apt: { ar: 'شقة', en: 'Apartment' }, villa: { ar: 'فيلا', en: 'Villa' }, shop: { ar: 'محل', en: 'Shop' }, office: { ar: 'مكتب', en: 'Office' } };
const PT = { building: { ar: 'عمارة', en: 'Building' }, villa: { ar: 'فيلا', en: 'Villa' }, commercial: { ar: 'تجاري', en: 'Commercial' } };
const CAT = { ac: { ar: 'تكييف', en: 'A/C' }, plumb: { ar: 'سباكة', en: 'Plumbing' }, elec: { ar: 'كهرباء', en: 'Electrical' }, carp: { ar: 'نجارة', en: 'Carpentry' }, paint: { ar: 'دهان وعزل', en: 'Painting & sealing' }, other: { ar: 'أخرى', en: 'Other' } };
const DT = { contract: { ar: 'عقود', en: 'Contracts' }, deed: { ar: 'سندات ملكية', en: 'Title deeds' }, receipt: { ar: 'إيصالات', en: 'Receipts' }, id: { ar: 'هوية', en: 'ID' }, other: { ar: 'أخرى', en: 'Other' } };
const NTY = { pay: ['card', 'ok'], maint: ['wrench', 'warn'], renew: ['refresh', 'info'], contract: ['file', 'teal'], sys: ['shield', 'brand'] };
const TCAT = { dispute: { ar: 'نزاع', en: 'Dispute' }, tech: { ar: 'مشكلة تقنية', en: 'Technical' }, account: { ar: 'الحساب', en: 'Account' }, payment: { ar: 'المدفوعات', en: 'Payments' }, contract: { ar: 'العقود', en: 'Contracts' }, other: { ar: 'أخرى', en: 'Other' } };
const VK = { cpr: { ar: 'الهوية الوطنية', en: 'National ID' }, deed: { ar: 'سند ملكية عقار', en: 'Property title deed' }, cr: { ar: 'السجل التجاري', en: 'Commercial registration' }, phone: { ar: 'رقم الهاتف', en: 'Phone number' } };
const DB = { users: [], props: [], units: [], contracts: [], payments: [], maint: [], docs: [], notifs: [], faq: [], verif: [], tickets: [], audit: [], templates: [], msgs: [], integ: [], roles: [], perm: {}, refunds: [], autopay: false, services: [], categories: [], posts: [], requests: [], notifLog: [], gateways: [], gatewayProviders: [], settings: null, fees: { reg: 10, renew: 5, remind: 3, late: 5, twofa: true, session: 30, retention: 60, maintenanceMode: false } };
// Service-request lifecycle (shared by tenant, provider and admin screens)
const RQST = { new: ['جديد', 'New', 'brand'], assigned: ['تم التعيين', 'Assigned', 'info'], scheduled: ['مجدول', 'Scheduled', 'gold'], in_progress: ['قيد التنفيذ', 'In progress', 'warn'], done: ['مكتمل', 'Completed', 'ok'], cancelled: ['ملغى', 'Cancelled', 'bad'] };
// catalog of permission keys shown on the Roles & Permissions screen (labels only — allow/deny state comes from the server)
DB.perms = [
  ['users.view', 'عرض المستخدمين', 'View users'], ['users.manage', 'إدارة المستخدمين', 'Manage users'], ['verify', 'اعتماد التوثيق', 'Approve verification'],
  ['contracts.review', 'مراجعة العقود', 'Review contracts'], ['contracts.terminate', 'تعليق/فسخ العقود', 'Suspend/terminate contracts'],
  ['payments.view', 'عرض المدفوعات', 'View payments'], ['payments.refund', 'استرجاع المبالغ', 'Issue refunds'], ['fees.config', 'إعداد الرسوم', 'Configure fees'],
  ['tickets', 'معالجة التذاكر', 'Handle tickets'], ['content', 'إدارة المحتوى', 'Manage content'], ['integrations', 'إدارة الربط', 'Manage integrations'],
  ['reports', 'تصدير التقارير', 'Export reports'], ['audit', 'عرض سجل التدقيق', 'View audit log'], ['roles', 'إدارة الأدوار', 'Manage roles'], ['settings', 'إعدادات النظام', 'System settings'],
];
const TECHS = ['مؤسسة الراحة للتكييف', 'أبو ياسر للسباكة', 'مؤسسة الألوان الحديثة', 'مؤسسة الواحة', 'كهربائي الخليج'];

/* ===== helpers operating on the hydrated DB cache ===== */
const end = (c) => addD(addM(c.start, c.months), -1);
const days = (a, b) => Math.round((a - b) / 864e5);
const cst = (c) => { if (c.status === 'active') { const l = days(end(c), TODAY); if (l < 0) return 'expired'; if (l <= 60) return 'expiring'; } return c.status; };
const unitOf = (id) => DB.units.find((u) => u.id === id);
const propOf = (id) => DB.props.find((p) => p.id === id);
const userOf = (id) => DB.users.find((u) => u.id === id);
const ctOf = (id) => DB.contracts.find((c) => c.id === id);
const uname = (id) => { const u = userOf(id); return u ? L(u.name) : '—'; };
const unitLabel = (u) => `${L(UT[u.type])} ${esc(u.no)} · ${L(propOf(u.prop).name)}`;
const unitStatus = (u) => {
  const cs = DB.contracts.filter((c) => c.unit === u.id);
  if (cs.some((c) => ['active', 'under_review', 'disputed'].includes(c.status) && cst(c) !== 'expired')) return 'occupied';
  if (cs.some((c) => ['pending_sign', 'pending_pay'].includes(c.status))) return 'reserved';
  if (u.flag === 'maint') return 'maint';
  return 'vacant';
};
const rentPays = () => DB.payments.filter((p) => p.kind === 'rent');
const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();
const rel = (d) => {
  const m = Math.round((NOW - d) / 6e4);
  if (m < 1) return T('الآن', 'just now');
  if (m < 60) return T(`قبل ${m} دقيقة`, `${m}m ago`);
  const h = Math.round(m / 60);
  if (h < 24) return T(`قبل ${h} ساعة`, `${h}h ago`);
  const dd = Math.round(h / 24);
  return T(`قبل ${dd} يوم`, `${dd}d ago`);
};
