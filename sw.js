/**
 * ===================================================
 *  SERVICE WORKER — CTRL Shift ERP PWA
 * ===================================================
 */

// Bumped to v26 for login page clean auto-reload and in-progress typing safeguard.
const CACHE_NAME = 'erp-cache-v26';

// Assets to pre-cache on service worker install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/super-admin.html',
  '/landing.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/admin.js',
  '/js/super-admin.js',
  '/js/students.js',
  '/js/teachers.js',
  '/js/attendance.js',
  '/js/fees.js',
  '/js/exams.js',
  '/js/timetable.js',
  '/js/help.js',
  '/js/auth-utils.js',
  '/js/chatbot.js',
  '/js/notifications.js',
  '/js/teacher-attendance.js',
  '/js/utils.js',
  '/ctrl-shift-logo.png',
  '/school-logo-updated.jpg',
  '/images/logo.png',
  '/images/dashboard-mockup.png',
  '/favicon.ico',
  '/images/favicon/favicon-16.png',
  '/images/favicon/favicon-32.png',
  '/images/favicon/favicon-48.png',
  '/images/favicon/apple-touch-icon.png',
  '/images/favicon/icon-192.png',
  '/images/favicon/icon-512.png',
  '/manifest.json'
];

// Install Event — Pre-cache static UI shell assets and immediately activate
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

// Lets the page hand control to a new, already-installed-but-waiting service
// worker on demand (when the user clicks "Update Now"), instead of it forcing
// itself in automatically.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
    // Strategy: Network First, falling back to cache (same as HTML above).
    // WAS "Cache First" — once a JS/CSS file was cached it was served
    // forever and network was never even checked again, so a code deploy
    // (a bug fix, a new feature) never reached an already-installed user
    // until they manually cleared site data or uninstalled/reinstalled the
    // PWA. Network First means every load picks up the latest deployed
    // code when online, and only falls back to the cached copy when offline.
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 200 || response.status === 0) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] Offline — serving cached copy for:', url.pathname);
          return caches.match(e.request);
        })
    );
  }
});
