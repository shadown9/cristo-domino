/* Cristo Domino — Service Worker. App shell cacheado para uso sin conexión. */
var CACHE = 'cristo-domino-v8';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './audio/risa.mp3',
  './audio/risa.ogg',
  './audio/rayo.mp3',
  './audio/rayo.ogg',
  './audio/fiesta.mp3',
  './audio/fiesta.ogg',
  './audio/trompeta.mp3',
  './audio/trompeta.ogg',
  './audio/corona.mp3',
  './audio/corona.ogg',
  './audio/copa.mp3',
  './audio/copa.ogg',
  './audio/aleluya.mp3',
  './audio/aleluya.ogg',
  './audio/estrella.mp3',
  './audio/estrella.ogg',
  './audio/burro.mp3',
  './audio/burro.ogg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon.ico'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copia = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(e.request, copia); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
