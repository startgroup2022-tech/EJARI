# AGENTS.md — إيجاري (Ejari)

Persistent notes for future agents working in this repository.

## What this is
A rental-management platform for the Kingdom of Bahrain. One Node.js process serves
three front-ends and a JSON REST API from a real, persistent SQLite database.

- Website (marketing + public verify): `website.html`
- Dashboard (landlord / tenant / admin roles): `dashboard.html`
- Mobile PWA (installable): `app.html` (desktop phone frame) → `app-screen.html` (real shell)
- `index.html` only redirects to `website.html`

Zero external runtime dependencies. Uses only Node's standard library
(`node:http`, `node:sqlite`, `node:crypto`). Requires **Node >= 22.5** (needs `node:sqlite`).

## Layout
- `server.mjs` — entry point; `node server.mjs [port]` (default 4000).
- `server/http.mjs` — static file allow-list + REST dispatch + security headers.
- `server/api.mjs` — all ~106 routes, scoping helpers, rate limiting, CSV/HTML renderers.
- `server/db.mjs` — schema (35 tables), seeding, migrations/back-fill.
- `server/auth.mjs` — scrypt password hashing, session tokens, cookie helpers.
- `assets/js/*.js` — classic scripts (not ES modules), loaded in a fixed order. Order matters.
- `assets/css/*.css` — tokens → base → landing → responsive → mobile.
- `tests/smoke.mjs` — the only test suite. Real server, real SQLite, real HTTP.
- `mobile/` — the **native Flutter client** (see `mobile/README.md`). Separate toolchain,
  separate tests, talks to the same REST API. Nothing here affects the web build.

## Mobile client (mobile/)
Native Flutter app, package id `bh.ejari.ejari_mobile`. Deliberately **not** a WebView or a
PWA wrapper — every screen is real Flutter widgets over the REST API.

```bash
cd mobile
flutter analyze                                    # must be clean
flutter test                                       # hermetic; no network
flutter test --dart-define=EJARI_BASE_URL=http://127.0.0.1:12000 test/live_api_test.dart
flutter build apk --release --dart-define=API_BASE_URL=https://api.ejari.bh
```
Env: `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`, `ANDROID_HOME=$HOME/Android/Sdk`,
`PATH=$HOME/dev/flutter/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH`. `flutter doctor`
shows no connected device in this container (no `/dev/kvm`), so verification is `analyze` +
`test` + `build apk`; interactive install/run cannot be done here.

**Toolchain is not baked into the image — re-provision after a container reset:**
- Flutter must be **3.47.5** (its bundled Dart 3.13.4 matches `environment.sdk: ^3.13.4`).
  `flutter_linux_3.47.5-stable.tar.xz` from `storage.googleapis.com/flutter_infra_release`.
- JDK 21 (`sudo apt-get install openjdk-21-jdk-headless`) — AGP 9.1 needs JDK 17+.
- Android SDK: `commandlinetools-linux-*_latest.zip`, then
  `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`.
- Release APK is signed with the **debug key** (see `android/app/build.gradle.kts`); a store
  upload must supply its own signing config. Built artifact: `dist/Ejari-release.apk`.

Release-APK facts (verified with `aapt2`/`apksigner`): package `bh.ejari.ejari_mobile`,
label `إيجاري`, `targetSdk 36`, v2-signed, **no `usesCleartextTraffic`**, production API
`https://api.ejari.bh` baked in, no demo credentials embedded.

Rules that matter when editing it:
- **Base URL is compile-time.** `lib/core/config/app_config.dart` defaults to the production
  API and never falls back to localhost. Use `--dart-define=API_BASE_URL=...` to override;
  `10.0.2.2` reaches the host from an Android emulator.
- **Auth is a cookie, not a bearer token.** `ApiClient` captures `ejari_session` from
  `set-cookie`, stores it in the platform keystore, replays it as a `Cookie` header, and
  clears it on any `401`. Do not add a parallel token mechanism.
- **Errors are typed.** Throw/expect `ApiException` with its `kind` + `serverCode`, and render
  copy through `describeApiError`. Never surface a raw Dio error or a backend English string.
- **Bilingual everywhere.** All user-facing copy goes through `AppStrings` (ar/en); use
  `Fmt.*` for money and dates and `DomainLabels.*` for status/priority/category labels.
  The app is RTL by default.
- **Tests must exercise real code.** `test/api_client_test.dart` swaps only the socket
  (`HttpClientAdapter`); keep it that way. `test/live_api_test.dart` performs real writes
  against a running server and is skipped unless `EJARI_BASE_URL` is set.
- **Release builds are debug-signed** (`android/app/build.gradle.kts`). Replace with a real
  signing config before publishing.
- **Not yet done:** `ios/` is ungenerated (no macOS/Xcode here). The web forgot-password flow
  exists (`POST /api/auth/forgot-password` + `reset.html`); the Flutter client now exposes it
  too (`ForgotPasswordScreen` / `ResetPasswordScreen`, routed at `/auth/reset-password`, plus
  an `ejari://reset-password` deep link registered in `AndroidManifest.xml`). The reset email
  still points at the web page, so the deep link only fires if the mail is changed to the
  `ejari://` form.
- **Refunds:** tenants request a refund on a settled payment from `payments_screen.dart`
  (`POST /api/refunds`); `GET /api/bootstrap` returns contract-scoped `refunds` (admins get
  all), and `Refund`/`Bootstrap.refundOfPayment` drive the status chip. A rejected request may
  be re-submitted; a pending/approved one may not.


## Commands
```bash
npm test                 # 88 end-to-end checks (starts its own server on :4321)
npm run test:security    # 204 security probes
npm run test:render      # 158 render-integrity checks (views + the admin messaging modal)
npm run test:production  # 33 production-mode checks (empty DB, real scenario, restart, IP allow-list, PWA assets, secret-key fail-fast)
npm run test:ui          # 17 real-browser UI checks (demo vs production)
npm run test:gateway     # 70 payment-gateway checks (signed webhooks, refunds, real DB)
npm run test:tap         # 44 Tap Payments checks against a local Tap API contract stand-in
npm run test:xss         # 14 real-browser XSS checks
npm run test:all         # the whole gate (all of the above in order)
npm start                # serve on :4000
node server.mjs 12000    # custom port
rm -f data/ejari.db*     # reset to seed data (re-seeds on next start, dev only)
```
`data/ejari.db` is gitignored and is NOT served over HTTP.

## Production mode (no demo/mock data)
- `NODE_ENV=production` (or `EJARI_DISABLE_DEMO=1`) is the switch. In production `server/db.mjs`
  seeds **nothing** except roles/permissions/settings; no users, properties, contracts or payments.
- The first admin is bootstrapped from `EJARI_ADMIN_EMAIL` + `EJARI_ADMIN_PASSWORD` on first boot
  only (both required, and only when the users table is empty). Remove the password var afterwards.
- `GET /api/config` is public and returns `{ demo }` — the single source of truth. The client
  stores it in `S.demo` (`core.js`), set by `boot-website.js` / `boot-dashboard.js` / `boot-app.js`;
  `demoOn()` reads it. All demo-only UI (role pickers, demo login, demo payment prefill, "demo
  account" switcher in `mobile.js`, demo CTA copy in `landing.js`) is gated on `demoOn()`.
- `POST /api/auth/demo` returns 404 in production. It also coerces `role` to a string before
  binding, so a bogus role is `400`, never a SQLite 500.
- `EJARI_SECRET_KEY` is **required** in production: it derives the AES-256-GCM master key for
  stored gateway/messaging credentials. `server.mjs` calls `assertCryptoReady()` (from
  `gateways.mjs`) before it imports the DB, so a missing key aborts boot with a clear error
  instead of silently encrypting with the public development default. Dev/test keep the
  fallback with a warning. `deploy/ejari.service` and `docker-compose.yml` set a placeholder
  that must be replaced (`openssl rand -hex 32`).

## Conventions that matter
- **Scripts are classic, not modules.** They share globals (`DB`, `S`, `A`, `MOD`, `V`, `T`).
  Adding a script means editing the ordered `<script>` list in each HTML shell.
- **The client mirrors the server.** `assets/js/data.js` defines an in-memory `DB` shape;
  `hydrate()` in `api.js` fills it from `GET /api/bootstrap`. View code reads `DB.*`
  and must keep working unchanged — do not rewrite views to fetch directly.
- **Actions** are `data-a="name"` attributes resolved against the `A` map in `app.js`.
  Modals are `data-a="modal" data-t="name"` resolved against `MOD`.
- **Bilingual everywhere.** Use `T('عربي','English')` and `L({ar,en})`; never hardcode one language.
- **Logo assets are polarity-named, not usage-named:**
  `logo-light.webp` = dark-ink logo for light backgrounds (headers, favicon),
  `logo-dark.webp` = white logo for dark backgrounds (footer, dark panels, splash).
  `logoImg(h, mode)` picks the right one; `mode='dark'` forces the white version.
- **Public routes** are the 4th arg `false` in `add(method, pattern, auth, handler)`.
  Only `register`, `login`, `demo`, `faq`, `stats`, `verify`, `services`, `categories`,
  `posts`, `auth/me` are public. Everything else must be `true` plus a permission check.
- **Static allow-list is explicit.** `server/http.mjs` serves only the files in `PUBLIC_FILES`
  plus anything under `assets/`. `robots.txt`, `sitemap.xml` and `favicon.ico` live at the repo
  root and are in that set; `tests/security.mjs` asserts every other root path 404s. Add a new
  public root file to `PUBLIC_FILES` *and* the security allow-list test together.
- **SEO/PWA metadata is hand-written per shell.** `website.html` is the only indexable page
  (canonical + OG/Twitter + hreflang `https://ejari.bh`); `dashboard.html`, `app.html` and
  `app-screen.html` carry `robots noindex`. Never emit localhost/demo URLs into these tags.
- **Contrast tokens are tuned to WCAG AA.** `tokens.css` light `--ink3`, `--brand`/`--teal`
  and `--gold` were darkened so muted text and colored chips clear 4.5:1 on their surfaces.
  Re-check contrast before changing any of those values; dark theme already passes.
- **Bump the service-worker cache version when shipping JS/CSS changes.** `sw.js` serves static
  assets cache-first, and the browser also HTTP-caches `sw.js` itself (the server sends
  `Cache-Control: no-cache`), so a changed script can stay invisible for a reload or two. Editing
  any file in `SHELL` requires bumping `VERSION` (e.g. `ejari-v3` → `ejari-v4`); without it the
  fix works in tests (which load from disk) but not in a browser that already has the SW installed.

## Server rules to respect
- `add()` handlers may be sync or `async` — `http.mjs` awaits `route.handler(req)`. Use
  `node:sqlite`'s synchronous API for database work regardless.
- Admin-only writes gate on `hasPerm(req, '<perm>')` (checks `requireAdmin` + `role_permissions`).
- Row-level access: `myContractRows(user)`, `myPropertyRows(user)`, `canAccessPayment(u, p)`.
  Reuse these instead of writing new WHERE clauses.
- Rate limits are in-memory per IP (`rateLimit(req, key, max, windowMs)`); applied to
  register, login, and password change.

## Testing notes
- `tests/smoke.mjs` boots a real server and drives real HTTP. Add checks there, not as unit tests.
- `tests/security.mjs` is the live security probe (RBAC matrix, IDOR, input-validation/no-500,
  rate limiting, exports). Run it before any release.
- `tests/xss_browser.mjs` and `tests/render.mjs` drive headless Chromium over the CDP using
  Node's built-in `WebSocket` — no npm deps. `xss_browser` proves stored payloads never execute;
  `render` renders every view for every role and guards against double-escaping.
- `npm run test:all` runs the whole gate. Chromium must be on `PATH` for the browser suites.
- CSV exports: assert against a BOM-stripped header, not the raw first line.

## Security invariants (do not regress)
- **`L()` returns escaped text.** `core.js` defines `rawL(o)` (the raw language pick) and
  `L(o)=esc(rawL(o))`. Every `L(...)`/`uname(...)`/`unitLabel(...)`/`dispName(...)` that reaches
  the DOM is already escaped — do NOT wrap them in `esc()` again (that double-escapes). Use
  `rawL()` only where the raw value is needed (logic/comparison) or where the receiving helper
  escapes internally (`inp`, `sel`, `btn`, `chip`, `ava`).
- **`/api/auth/demo` is a dev convenience.** It hands out real sessions with no password for the
  seeded demo accounts, so it returns 404 when `NODE_ENV=production` or `EJARI_DISABLE_DEMO=1`.
  The demo admin is a *limited* sub-role (its permissions come from `role_permissions`); the
  seeded super admin `fatima.alhammadi@ejari.bh` must be signed in with `Demo@1234` for full-admin tests.
- **Bind only strings/numbers to `node:sqlite`.** A non-string (object/array/null) or a missing
  required value throws "cannot be bound to SQLite parameter" → 500. Coerce with
  `String(x == null ? '' : x)` (or `N(...)` for numbers) before `.run()`.
- **Exports honour the permission matrix:** `users` → `users.view`, `audit` → `audit`,
  `payments`/`income` → `payments.view` (admins only). Contract/tenant/landlord exports stay row-scoped.

## Payment gateways
- Tenant/landlord `GET /api/bootstrap` must carry the enabled gateways so the checkout
  gateway picker works. It exposes **display fields only** — `id, provider, label, kind,
  enabled, testMode, currency, isDefault` — never `configured`/credential material. The admin
  projection (`mapGateway`) is not safe for non-admin roles.
- `enabled: true` is required in that projection: the client's `activeGateways()` filters on it.
- Gateway secrets are returned only as a mask (`••••••<last3>`). The edit form must never
  prefill secret fields, and `POST /api/gateways/:id` ignores any value starting with `•` so a
  round-tripped mask cannot overwrite the stored credential. Blank keeps the old value.
- The tenant pay flow (`views-role.js` `MOD.pay`/`A.paynow`, `_confirmPay` in Flutter) is:
  choose gateway → `POST /api/payments/:id/intent` → provider stage → signed webhook
  (sandbox: `POST /api/payments/intent/:ref/sandbox-confirm`) → payment `paid` + receipt.
- **Tap Payments is the real API-capable provider** (`server/gateways.mjs` `tapProvider`). Its
  `apiBase` is configurable per gateway so the same adapter serves live and the test stand-in.
  Lifecycle: `createCharge` (Tap `/v2/charges`) → hosted redirect → `GET /v2/charges/:id` poll
  (return flow, `POST /api/payments/intent/:ref/verify`) **and/or** signed webhook
  (`hashstring` = HMAC-SHA256 of the raw body, header `hashstring`/`x-tap-signature`).
- **A payment only becomes `paid` on provider truth**, never on a client callback: the webhook
  handler re-queries Tap (`verifyChargeWithProvider`) before calling `processWebhook`, and the
  verify endpoint does the same. A well-signed event that cannot be confirmed returns **502
  `verification_unavailable`** (retryable) — do not collapse that into a 401, which would make
  Tap stop retrying a real event.
- **Tap reuses the charge id across status changes**, so the webhook event id is
  `id + ':' + status` to stay unique while still deduplicating a genuine replay.
- **Refunds:** `settleRefund()` is shared by the direct admin refund and by approving a tenant
  request. For API-capable gateways it calls the provider first and only writes the ledger on
  success; on provider failure it returns 502 and the caller rolls the refund back to `pending`.
  A tenant opens a request with `POST /api/refunds` (pending); admin approves with
  `POST /api/refunds/:id {approve:true}`. Never allow a second refund on the same payment.
- **PWA:** `sw.js` (network-first for navigations, cache-first for static assets) + `assets/js/pwa.js`
  register the service worker; `/api/*` and `pay.html` are always network-only. `sw.js` must stay
  in `PUBLIC_FILES` in `server/http.mjs`.
