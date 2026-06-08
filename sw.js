/**
 * ===================================================
 *  SERVICE WORKER — CTRL Shift ERP PWA
 * ===================================================
 */

const CACHE_NAME = 'erp-cache-v1';

// Assets to pre-cache on service worker install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/super-admin.html',
  '/landing.html',
  '/css/styles.css',
  '/css/landing.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/super-admin.js',
  '/js/students.js',
  '/js/teachers.js',
  '/js/attendance.js',
  '/js/teacher-attendance.js',
  '/js/fees.js',
  '/js/exams.js',
  '/js/timetable.js',
  '/js/help.js',
  '/js/chatbot.js',
  '/js/utils.js',
  '/js/landing.js',
  '/ctrl-shift-logo.png',
  '/school-logo-updated.jpg',
  '/images/logo.png',
  '/images/dashboard-mockup.png',
  '/manifest.json'
];

// Install Event — Pre-cache static UI shell assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error('[Service Worker] Pre-cache failed:', err))
  );
});

// Activate Event — Clean up older caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Offline Routing Strategies
self.addEventListener('fetch', (e) => {
  // Only handle GET requests
  if (e.request.method !== 'GET') {
    return;
  }

  const url = new URL(e.request.url);

  // Exclude Firebase database calls, googleapis, and chatbot API proxy from caching
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Determine if this is a page navigation or an HTML request
  const isHtmlRequest = e.request.mode === 'navigate' || 
                        (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) ||
                        url.pathname.endsWith('.html') ||
                        url.pathname === '/';

  if (isHtmlRequest) {
    // Strategy: Network First, falling back to cache
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // If response is valid, update cache
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] Offline fallback for navigation request:', url.pathname);
          return caches.match(e.request).then((cachedResponse) => {
            // Fallback to cached index.html or target page
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
  } else {
    // Strategy: Cache First, falling back to network
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((response) => {
          // Cache the new resource (support standard 200 and cross-origin opaque response status 0)
          if (response.status === 200 || response.status === 0) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        }).catch((err) => {
          console.warn('[Service Worker] Failed to fetch resource:', url.pathname, err);
        });
      })
    );
  }
});
