# إيجاري — Ejari mobile (native Flutter)

The native Android/iOS client for the Ejari rental-management platform.

This is a **real Flutter application**. It is not a WebView, not a PWA wrapper, and not a
remote-URL shell. Every screen is composed from Flutter widgets and talks to the same JSON
REST API the website and dashboard use.

## Requirements

- Flutter 3.47.x stable (Dart SDK `^3.13.4`)
- Android SDK 36 + build-tools, `JAVA_HOME` on JDK 17 or 21
- For iOS: macOS with Xcode 15+

## Commands

```bash
flutter pub get
flutter analyze                 # must report no issues
flutter test                    # hermetic unit/widget tests, no network

# Contract tests against a real, running server (see below)
flutter test --dart-define=EJARI_BASE_URL=http://127.0.0.1:12000 test/live_api_test.dart

flutter run                     # debug, on a connected device/emulator
flutter build apk --debug
flutter build apk --release --dart-define=API_BASE_URL=https://api.ejari.bh
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.ejari.bh
```

## Pointing at a backend

The API base URL is a compile-time constant (`lib/core/config/app_config.dart`). It defaults
to `https://api.ejari.bh` and deliberately never falls back to `localhost`, so a release
build cannot accidentally ship pointing at a developer machine.

Override per build:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:12000     # Android emulator → host
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:12000 # physical device on LAN
```

`10.0.2.2` is the Android emulator's alias for the host machine's `127.0.0.1`.

## Architecture

```
lib/
  core/
    config/app_config.dart      compile-time base URL, timeouts, cookie name
    errors/api_exception.dart   typed failures: network/timeout/unauthorized/forbidden/
                                notFound/rateLimited/badRequest/server
    network/api_client.dart     Dio wrapper: session cookie capture, persistence,
                                onSessionExpired, binary downloads
    network/error_messages.dart maps ApiErrorKind + server code → localized message
    storage/secure_store.dart   Android Keystore / iOS Keychain session storage
    storage/preferences.dart    non-secret preferences (language, theme)
    localization/               AppStrings (ar/en), formatters, domain_labels
    theme/                      brand palette + light/dark ThemeData
  models/                       typed parsers for every API payload
  services/api/ejari_api.dart   one method per endpoint
  providers/                    Riverpod: auth state, locale, theme, api client
  screens/                      auth, shell, home, properties, contracts, payments,
                                maintenance, notifications, documents, requests, profile, more
  routing/app_routes.dart       named routes for pushed (non-tab) screens
```

### Session handling

The backend authenticates with a `ejari_session` cookie. `ApiClient` reads it out of the
`set-cookie` header on login, persists the token in the platform keystore, and replays it as
a `Cookie` header on every subsequent request. On a `401` the client clears the stored
session and fires `onSessionExpired`, which `auth_provider` uses to return the user to the
login screen. This is why the app stays signed in across restarts without a token in
plain-text storage.

### Errors

Every failure surfaces as an `ApiException` with a stable `kind` plus the backend's
`serverCode`. `describeApiError` turns that pair into a localized sentence, so a new backend
error code degrades to a sensible generic message instead of leaking English internals into
the Arabic UI.

## Testing

`flutter test` runs three hermetic suites and never touches the network:

- `test/models_test.dart` — parses payloads shaped exactly like the real backend responses,
  including missing fields, unknown enum values and derived fields (contract end date,
  overdue detection, unread counts).
- `test/api_client_test.dart` — drives the genuine request pipeline with a stub
  `HttpClientAdapter`, so cookie capture, `Cookie` replay, `401` session clearing, every
  error mapping and binary download are all exercised as real code, not mocks.
- `test/formatters_test.dart` — money, date and date-time formatting in both languages.

`test/live_api_test.dart` is an opt-in contract test. With `EJARI_BASE_URL` set it logs in as
each seeded role and performs **real writes** — creating a maintenance request, paying a due
payment, marking notifications read — then re-fetches the bootstrap snapshot to prove the
changes persisted server-side. It is skipped when the variable is absent.

## Release signing

Release builds are signed with a real keystore. `android/app/build.gradle.kts` reads
credentials from `android/key.properties`; when that file is absent it falls back to the
debug key so local builds still work, but **a store upload must supply a keystore**. Both
`android/key.properties` and `**/*.jks` are git-ignored — never commit them.

Generate a keystore (once, kept in a secure location outside the repo):

```bash
keytool -genkeypair -v -keystore ~/keystores/ejari-release.jks -alias ejari \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Ejari, OU=Mobile Applications, O=Ejari Real Estate, L=Manama, ST=Capital, C=BH"
```

Then create `android/key.properties` (git-ignored):

```properties
storeFile=/absolute/path/to/ejari-release.jks
storePassword=...
keyAlias=ejari
keyPassword=...
```

Verify the result before uploading — the signer must **not** be `CN=Android Debug`:

```bash
apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab
```

## Known gaps

- **iOS** — `ios/` has not been generated or built; no macOS/Xcode in this environment.
- **Password reset** — the backend exposes no reset/forgot-password endpoint
  (`/api/auth/*` is register, login, demo, logout, me, password), so the app intentionally
  offers change-password only.
- **Documents without a stored file** — documents that carry metadata but no `dataUrl` are
  shown as unavailable rather than offering a download that would fail.
