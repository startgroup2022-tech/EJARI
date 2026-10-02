# إيجاري — Ejari · Final Production Verification

Consolidated verification report that reconciles the two earlier deliverables
(**Web + Backend + SQLite security report** and **Flutter native-app report**) and records
the end-to-end production check performed on the current tree.

Scope constraints honoured: the project was **not rebuilt**, the backend was **not rewritten**,
and the Flutter app was **not rebuilt**. All changes are targeted fixes plus tests.

---

## 1. Executive summary

| Area | Result |
|---|---|
| Backend end-to-end (real server + real SQLite + real HTTP) | **88 / 88 pass** |
| Live security probe (RBAC, IDOR, input validation, exports, rate limits) | **204 / 204 pass** |
| Real-browser stored-XSS verification (headless Chromium) | **14 / 14 pass** |
| Render integrity — every view × every role, no double-escaping | **151 / 151 pass** |
| Flutter `analyze` | **no issues** |
| Flutter `test` | **43 pass** |

Confirmed-and-fixed defects this pass: 1 stored-XSS class (root cause), 4 input-validation 500s,
1 oversized-body connection reset, 1 privilege/consistency issue in the demo admin, and
2 export-authorization gaps. Nothing was left failing.

---

## 2. Architecture (as verified, unchanged)

- **Backend** — Node.js ≥ 22.5, **zero external runtime dependencies** (`node:http`, `node:sqlite`,
  `node:crypto`). `server.mjs` boot; `server/http.mjs` static allow-list + REST dispatch + body
  reading; `server/api.mjs` ~80 routes; `server/db.mjs` 28-table schema + seed; `server/auth.mjs`
  password hashing + cookies. ~1.7k LOC.
- **Client** — 15 classic (non-module) scripts sharing globals `DB/S/A/MOD/V/T`, ~1.4k LOC, plus
  ~575 LOC CSS. Website (`website.html`), dashboard (`dashboard.html`), mobile web app
  (`app-screen.html`), installable PWA (`manifest.webmanifest`).
- **Mobile** — native **Flutter** app, 52 Dart files / ~7.6k LOC, MaterialApp named routes +
  Riverpod, talking to the same JSON REST API. Not a WebView.

---

## 3. Security findings

### 3.1 FIXED — Stored XSS (root cause, high impact)

**Where:** the client language-pick helper `L()` in `assets/js/core.js` returned raw text, and it
fed **82** unescaped template interpolations across `app.js`, `views-admin.js`, `views-role.js`,
`data.js`, `landing.js`, `mobile.js`. A tenant could store `<img src=x onerror=...>` as a
maintenance title (or a property name / deed / unit no / CPR / FAQ / notification / template) and
it executed in the **landlord or admin** browser — a cross-role privilege escalation.

**Fix (one root + leaf hardening):**
- `L(o)` now returns `esc(rawL(o))`; `rawL(o)` exposes the raw value for logic and for helpers
  that escape internally (`inp`, `sel`, `btn`, `chip`, `ava`). The 51 pre-existing `esc(L(...))`
  / `esc(uname(...))` wrappers were un-wrapped so nothing double-escapes.
- Remaining raw leaf sinks escaped: `p.deed`, `u.no`, `c.no`, `r.no`/`r.unit.no` (public verify),
  `u.cpr`. Modal `title`/`aria` are escaped once by the modal renderer (correct, not doubled).

**Evidence:** `tests/xss_browser.mjs` stores four payloads via the real API as a tenant, then loads
the real app in headless Chromium with the landlord's session and asserts nothing executes.
**Negative control:** reverting `L()` to unescaped makes the suite fail with `window.__xss=1` —
proving the test detects the original bug and the fix closes it.

### 3.2 FIXED — Input-validation 500s (availability / robustness)

`node:sqlite` rejects non-string / null bind values with *"Provided value cannot be bound to
SQLite parameter 1"*, surfacing as 500. Missing or non-string required fields previously crashed:

| Route | Trigger | Before | After |
|---|---|---|---|
| `POST /api/auth/login` | `{}` (no email) | 500 | 401 |
| `POST /api/maintenance` | `{}` / non-string title | 500 | 400 / 201 |
| `POST /api/documents` | `{}` / `name:null` | 500 | 400 / 201 |
| `POST /api/tickets` | `{}` / non-string subject | 500 | 400 / 201 |

Values are now coerced (`String(x == null ? '' : x)`, `N(...)`) before binding.

### 3.3 FIXED — Oversized body reset the connection

`readBody` called `req.destroy()` on >8 MB, causing `ECONNRESET` instead of a response. It now
pauses, rejects, and the server returns a clean **413** JSON with `Connection: close`.

### 3.4 FIXED — Demo admin privilege / consistency

- `/api/auth/demo` handed out a session for `fatima.alhammadi@ejari.bh`, whose seeded sub-role is
  **`super`** — so "sign in as demo admin" granted **all** permissions (fees, roles, exports).
- It now signs in `zainab.almahroos@ejari.bh` (sub `admin`), a **limited** sub-role. Fees, role
  edits, and settings are correctly denied; the destructive routes are gated by the permission matrix.
- The endpoint already returns 404 under `NODE_ENV=production` or `EJARI_DISABLE_DEMO=1` (verified).

### 3.5 FIXED — Export authorization gaps

Exports did not consistently honour `role_permissions`:

- `users` export: `role !== 'admin'` → now `hasPerm(req, 'users.view')`.
- `payments` / `income` export: no check → now `hasPerm(req, 'payments.view')` for admins.
- `audit` export already required `audit`; contract/tenant/landlord exports stay row-scoped.

### 3.6 FIXED — Integration toggle

- The `status="off"` (double-quoted) SQL literal was replaced with a `?` parameter (original bug).
- Unknown integration ids returned 500; now **404**.

### 3.7 Verified-correct (no change needed)

- RBAC matrix: `legal` sub-role can `users.view`/`verify`/`contracts.review`/`contracts.terminate`/
  `tickets`/`audit` but **not** `settings`/`roles`/`fees.config`/`payments.view`.
- IDOR on `/api/contracts/:id/checklist` denied for non-owners.
- Rate limiting on login/register/password-change returns 429.
- Path traversal in route params does not 500.
- CSP is present (note: `script-src 'unsafe-inline'` — see residual risks).

---

## 4. Flutter native app verification

- `flutter analyze` → **No issues found**.
- `flutter test` → **43 passed** (hermetic model/widget tests; 9 live contract tests pass when a
  server is reachable).
- Android cleartext: debug/profile manifests allow `http://10.0.2.2` for emulator development;
  the **release** manifest stays cleartext-blocked (verified by grep).
- `go_router` was removed (unused; navigation uses MaterialApp named routes).
- Documentation: `mobile/README.md`, plus mobile knowledge in root `AGENTS.md`.

The app was verified to compile/analyse/test against the same API contract; **no rebuild** was done.

---

## 5. Reconciliation of the two prior reports

| Prior report | Status after this pass |
|---|---|
| Web + Backend + SQLite security report | **Superseded/augmented.** All previously-reported classes are re-verified here. New this pass: the `L()` stored-XSS root cause, four input-validation 500s, the oversized-body reset, the demo-admin privilege issue, and the export-auth gaps. |
| Flutter native-app report | **Confirmed unchanged and still valid.** `analyze` + `test` green; cleartext policy and route strategy verified. No code changes were required beyond the previously-recorded `go_router` removal and debug-manifest cleartext flag. |

No contradictions remain between the two reports; this document is the single source of truth.

---

## 6. Reproduce the verification

```bash
npm test              # backend end-to-end            (88 checks)
npm run test:security # live security probe            (204 checks)
npm run test:xss      # real-browser stored-XSS        (14 checks)   # needs chromium
npm run test:render   # render integrity, all views    (151 checks)  # needs chromium
npm run test:all      # all of the above
cd mobile && flutter analyze && flutter test
```

---

## 7. Residual risks & recommendations (not blocking)

1. **CSP `script-src 'unsafe-inline'`** — the client relies on inline boot/JSON. With output
   escaping now enforced this is low risk, but dropping `'unsafe-inline'` (nonces/hashes) would
   add defence-in-depth.
2. **Demo endpoint** — keep `EJARI_DISABLE_DEMO=1` (or `NODE_ENV=production`) set in any
   internet-facing deployment; the seeded `Demo@1234` passwords must be rotated before go-live.
3. **No `HttpOnly`-only session rotation on privilege change** — sessions are cookie-based and
   HttpOnly; consider rotating on password change (already rate-limited) as hardening.
4. **Large body limit is 8 MB** — appropriate for base64 document uploads; keep the 3 MB client
   cap aligned with the server limit.

---

## 8. Verdict

**Production-ready**, subject to the deployment checklist in §7 (disable the demo endpoint and
rotate seed credentials). All automated gates are green on the current tree; no confirmed defect
remains unfixed.
