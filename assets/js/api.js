/* ===== real API client (fetch + session cookie) ===== */
const API = (() => {
  async function req(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw { network: true, message: e.message };
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw { status: res.status, error: (data && data.error) || 'error', data };
    return data;
  }
  return {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b || {}),
    del: (p) => req('DELETE', p),
  };
})();

/* Populate the client-side DB cache from a /api/bootstrap payload.
   Keeps the exact shape the existing view code already expects (DB.users, DB.props, …)
   so every view function written against the old in-memory mock keeps working unchanged —
   the only difference is the data now comes from, and is persisted in, the real server/database. */
function hydrate(boot) {
  const dt = (s) => (s ? new Date(s) : null);
  DB.users = boot.users.map((u) => ({ ...u, joined: dt(u.joined) }));
  DB.props = boot.properties;
  DB.units = boot.units;
  DB.contracts = boot.contracts.map((c) => ({ ...c, start: dt(c.start), created: dt(c.created) }));
  DB.payments = boot.payments.map((p) => ({ ...p, due: dt(p.due), paidOn: dt(p.paidOn) }));
  DB.maint = boot.maintenance.map((m) => ({ ...m, created: dt(m.created) }));
  DB.docs = boot.documents.map((x) => ({ ...x, date: dt(x.date) }));
  DB.notifs = boot.notifications.map((n) => ({ ...n, t: dt(n.t) }));
  DB.faq = boot.faq;
  DB.autopay = !!boot.autopay;
  if (boot.verifications) DB.verif = boot.verifications.map((v) => ({ ...v, t: dt(v.t) }));
  if (boot.tickets) DB.tickets = boot.tickets.map((t) => ({ ...t, created: dt(t.created), msgs: t.msgs.map((m) => ({ ...m, t: dt(m.t) })) }));
  if (boot.audit) DB.audit = boot.audit.map((a) => ({ ...a, t: dt(a.t) }));
  if (boot.templates) DB.templates = boot.templates.map((t) => ({ ...t, upd: dt(t.upd) }));
  if (boot.messages) DB.msgs = boot.messages;
  if (boot.integrations) DB.integ = boot.integrations;
  if (boot.roles) DB.roles = boot.roles;
  if (boot.perm) DB.perm = boot.perm;
  if (boot.fees) DB.fees = boot.fees;
  if (boot.refunds) DB.refunds = boot.refunds;
  DB.services = boot.services || [];
  DB.categories = boot.categories || [];
  DB.posts = boot.posts || [];
  DB.requests = (boot.requests || []).map((r) => ({ ...r, created: dt(r.created), updated: dt(r.updated), scheduledAt: dt(r.scheduledAt), completedAt: dt(r.completedAt), events: (r.events || []).map((e) => ({ ...e, t: dt(e.t) })) }));
  DB.notifLog = (boot.notificationLog || []).map((n) => ({ ...n, t: dt(n.t) }));
  TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  NOW = new Date();
}

/* fetch a fresh bootstrap snapshot and re-render — the pattern every mutation uses:
   call the API, then resync the cache from the server so the UI always reflects
   what is actually persisted in the database. */
async function refresh() {
  const boot = await API.get('/api/bootstrap');
  hydrate(boot);
}
async function afterMutation(promise, { silent } = {}) {
  const result = await promise;
  await refresh();
  if (S.page === 'app') renderView(); else render();
  return result;
}
function apiError(e, fallbackAr, fallbackEn) {
  if (e && e.network) return toast(T('تعذّر الاتصال بالخادم، تحقق من الاتصال', 'Could not reach the server — check your connection'), true);
  toast(T(fallbackAr, fallbackEn), true);
}
