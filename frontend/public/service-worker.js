// Cache version is controlled by the project version in package.json
// To update the cache, bump the version in package.json (automatically injected)
const PROJECT_VERSION = '__PROJECT_VERSION__';
const CACHE_NAME = `trustquery-cache-v${PROJECT_VERSION}`;
const FILES_TO_CACHE = [
  '/',
  '/favicon.png',
  '/logo.svg',
  '/manifest.json',
  '/robots.txt',
  // Images
  '/images/terminator.gif',
  // Sounds
  '/sounds/alert.mp3',
  '/sounds/click.mp3',
  '/sounds/error.mp3',
  '/sounds/startup.mp3',
  '/sounds/success.mp3',
  '/sounds/terminator.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
}); 