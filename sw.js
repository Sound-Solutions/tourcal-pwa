// TourCal PWA - Service Worker

const CACHE_NAME = 'tourcal-v15';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  './js/router.js',
  './js/cloudkit-config.js',
  './js/services/auth.js',
  './js/services/tour-service.js',
  './js/services/event-service.js',
  './js/services/daysheet-service.js',
  './js/services/setlist-service.js',
  './js/services/busstock-service.js',
  './js/services/venue-service.js',
  './js/services/crew-service.js',
  './js/services/announcement-service.js',
  './js/services/cache.js',
  './js/models/permissions.js',
  './js/models/formatters.js',
  './js/views/auth-view.js',
  './js/views/tour-list-view.js',
  './js/views/schedule-view.js',
  './js/views/event-detail-view.js',
  './js/views/daysheet-view.js',
  './js/views/setlist-view.js',
  './js/views/busstock-view.js',
  './js/views/venue-notes-view.js',
  './js/views/crew-view.js',
  './js/views/announcements-view.js',
  './js/components/nav-bar.js',
  './js/components/tour-picker.js',
  './js/components/toast.js',
  './js/components/pull-to-refresh.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first for API, cache first for app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip CloudKit API requests (let them go to network)
  if (url.hostname.includes('apple-cloudkit') || url.hostname.includes('icloud')) {
    return;
  }

  // App shell: cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cache and update in background
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {});

        return cached;
      }

      // Not in cache: try network
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
