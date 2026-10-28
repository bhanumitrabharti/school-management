/**
 * ===================================================
 *  SERVICE WORKER — CTRL Shift ERP PWA
 * ===================================================
 */

const BUILD_VERSION = 'v64';
const CACHE_NAME = `erp-cache-${BUILD_VERSION}`;

// Assets to pre-cache on service worker install
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/super-admin.html',
  '/register.html',
  '/landing.html',
  '/privacy.html',
  '/terms.html',
  `/css/styles.css?v=${BUILD_VERSION}`,
  `/js/app.js?v=${BUILD_VERSION}`,
  `/js/admin.js?v=${BUILD_VERSION}`,
  `/js/super-admin.js?v=${BUILD_VERSION}`,
  `/js/register.js?v=${BUILD_VERSION}`,
  `/js/students.js?v=${BUILD_VERSION}`,
  `/js/teachers.js?v=${BUILD_VERSION}`,
  `/js/attendance.js?v=${BUILD_VERSION}`,
  `/js/fees.js?v=${BUILD_VERSION}`,
  `/js/exams.js?v=${BUILD_VERSION}`,
  `/js/documents.js?v=${BUILD_VERSION}`,
  `/js/timetable.js?v=${BUILD_VERSION}`,
  `/js/help.js?v=${BUILD_VERSION}`,
  `/js/auth-utils.js?v=${BUILD_VERSION}`,
  `/js/storage-utils.js?v=${BUILD_VERSION}`,
  `/js/chatbot.js?v=${BUILD_VERSION}`,
  `/js/notifications.js?v=${BUILD_VERSION}`,
  `/js/teacher-attendance.js?v=${BUILD_VERSION}`,
  `/js/utils.js?v=${BUILD_VERSION}`,
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
        console.log(`[Service Worker ${BUILD_VERSION}] Pre-caching offline assets...`);
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error(`[Service Worker ${BUILD_VERSION}] Pre-cache failed:`, err))
  );
});

// Activate Event — Clean up older caches (purges v46..v50)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log(`[Service Worker ${BUILD_VERSION}] Deleting old cache:`, key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Lets the page trigger skipWaiting explicitly on demand
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event — Network-First for online accuracy; offline fallback only
self.addEventListener('fetch', (e) => {
  // Only handle GET requests
  if (e.request.method !== 'GET') {
    return;
  }

  const url = new URL(e.request.url);

  // Exclude Firebase database calls, googleapis, backend/chatbot APIs, and version.json from SW cache
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json'
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
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log(`[Service Worker ${BUILD_VERSION}] Offline fallback for navigation request:`, url.pathname);
          return caches.match(e.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html') || caches.match('/');
          });
        })
    );
  } else {
    // Strategy: Network First for all assets (JS, CSS, images, etc.)
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
          console.log(`[Service Worker ${BUILD_VERSION}] Offline — serving cached copy for:`, url.pathname);
          return caches.match(e.request);
        })
    );
  }
});
