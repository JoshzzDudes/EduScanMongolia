// EduScan service worker: the app opens without internet once it has loaded one time.
// Own files are fetched fresh when online (so updates and config changes arrive), with the cache as fallback.
// Libraries and fonts from CDNs come from the cache first. Sign-in and sync traffic is never touched.
const CACHE = 'eduscan-v4';
const CORE = ['./', './index.html', './manifest.webmanifest', './firebase-config.js', './cloud.js', './icons/icon-192.png', './icons/icon-512.png'];
const STATIC_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }) // revalidate with the server, so updates show at once
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }
  if (!STATIC_HOSTS.includes(url.hostname)) return; // Firebase, Google sign-in: straight to the network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
