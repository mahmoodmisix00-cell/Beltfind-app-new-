const STATIC_CACHE = 'beltfind-static-v10';
const CDN_CACHE = 'beltfind-cdn-v10';

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

// فقط کتابخانه‌هایی که واقعاً در index.html استفاده شده‌اند
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// به‌جای cache.addAll (که اتمیک است و با یک فایل ۴۰۴ کل کش رو خراب می‌کند)
// هر فایل را جدا کش می‌کنیم تا خرابی یک فایل بقیه را از بین نبرد
function cacheFilesSafely(cacheName, files) {
  return caches.open(cacheName).then(cache =>
    Promise.all(
      files.map(url =>
        cache.add(url).catch(err => {
          console.warn('[SW] cache failed for', url, err);
        })
      )
    )
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      cacheFilesSafely(STATIC_CACHE, APP_FILES),
      cacheFilesSafely(CDN_CACHE, CDN_FILES)
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(networkResponse => {
          if (networkResponse.ok) {
            caches.open(event.request.url.includes(self.location.origin) ? STATIC_CACHE : CDN_CACHE)
              .then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
