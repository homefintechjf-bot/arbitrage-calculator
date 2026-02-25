const CACHE_NAME = 'arbitrage-sentinel-v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache TTL

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
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
  self.clients.claim();
});

// Network-first strategy with 5 minute cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests from caching
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return SPA index for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html').then((indexResponse) => {
              return indexResponse || caches.match('/');
            });
          }
          // Return empty JSON for API-like requests
          if (event.request.url.includes('/api/')) {
            return new Response(JSON.stringify({ offline: true, error: 'No network connection' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          // For other assets, return empty response
          return new Response('', { status: 503 });
        });
      })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Arbitrage Alert';
  const options = {
    body: data.body || 'New opportunity found!',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    vibrate: [200, 100, 200],
    tag: 'arbitrage-alert',
    requireInteraction: true,
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click - only allow internal URLs
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';
  
  // Security: Only allow internal navigation (starts with /)
  const safeUrl = targetUrl.startsWith('/') ? targetUrl : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          return client.navigate(safeUrl);
        }
      }
      // Otherwise open new window
      return clients.openWindow(safeUrl);
    })
  );
});
