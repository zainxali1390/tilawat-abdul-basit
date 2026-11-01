/* Service worker: offline app shell, cached Qur'an text/API responses and fonts.
   Audio is deliberately NOT cached here: streaming stays streaming, and offline
   audio is handled only by the app's explicit Download feature (IndexedDB). */
const VERSION = 'ab-1.2.1';
const SHELL_CACHE = 'ab-shell-' + VERSION;
const DATA_CACHE = 'ab-data-v1';
const FONT_CACHE = 'ab-fonts-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(k => k.startsWith('ab-shell-') && k !== SHELL_CACHE)
      .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isAudio = url => /\.(mp3|m4a|ogg|opus|wav|aac|flac)(\?|$)/i.test(url.pathname) || url.pathname.includes('/download/');
const isData = url =>
  url.hostname === 'api.alquran.cloud' ||
  (url.hostname.endsWith('mp3quran.net') && url.pathname.startsWith('/api/')) ||
  (url.hostname === 'archive.org' && (url.pathname.startsWith('/metadata/') || url.pathname.startsWith('/advancedsearch.php')));
const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.headers.has('range') || isAudio(url)) return; // let the browser stream audio directly

  if (url.origin === self.location.origin) {
    // App shell: serve from cache, refresh in the background.
    event.respondWith(
      caches.open(SHELL_CACHE).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
        const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
        if (hit) { event.waitUntil(net); return hit; }
        return net.then(res => res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
      }))
    );
    return;
  }

  if (isFont(url)) {
    event.respondWith(caches.open(FONT_CACHE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }))));
    return;
  }

  if (isData(url)) {
    // Network first so lists stay current; fall back to the last copy when offline.
    event.respondWith(caches.open(DATA_CACHE).then(cache => fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cache.match(req).then(hit => hit || Response.error()))));
  }
});
