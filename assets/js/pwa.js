/* Registers the Ejari service worker so the PWA is installable and works offline.
 * Registration is skipped on http (service workers need a secure context, i.e. https or localhost). */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is best-effort */ });
  });
})();
