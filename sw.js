/* Ejari service worker — makes the PWA genuinely installable and usable offline.
 *
 * Strategy:
 *   • Never touch /api/ or /pay.html: payments and live data must always hit the server.
 *   • Navigations: network-first with an offline fallback to the cached app shell.
 *   • Static assets: cache-first (hashed-free but versioned via the cache name).
 */
const VERSION = 'ejari-v1';
const SHELL = [
  'app-screen.html', 'dashboard.html', 'app.html',
  'assets/css/tokens.css', 'assets/css/base.css', 'assets/css/landing.css',
  'assets/css/responsive.css', 'assets/css/mobile.css',
  'assets/js/logo.js', 'assets/js/core.js', 'assets/js/api.js', 'assets/js/data.js',
  'assets/js/app.js', 'assets/js/views-role.js', 'assets/js/auth.js',
  'assets/js/mobile.js', 'assets/js/boot-app.js', 'assets/js/main.js', 'assets/js/pwa.js',
  'manifest.webmanifest', 'favicon.ico',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

function isPrivate(url) {
  return url.pathname.startsWith('/api/') || url.pathname.endsWith('/pay.html');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never proxy third parties (e.g. Tap)
  if (isPrivate(url)) return;                        // live data + payments go straight to the network

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('app-screen.html').then((r) => r || caches.match('dashboard.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached))
  );
});
