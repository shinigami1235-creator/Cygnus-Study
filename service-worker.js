// Cygnus Study -- service worker
//
// This app stores all of its actual data (notes, flashcards, everything) locally in IndexedDB,
// entirely on-device -- this service worker has nothing to do with that. Its only job is caching
// the app SHELL (the HTML/CSS/JS/icons that make up the app itself) so the app installs to a
// home screen, launches instantly, and still opens when the phone has no signal.
//
// CACHE_VERSION is the whole update mechanism: bump this string on every deploy. A new version
// number means a new cache name, which means the browser treats this as a new service worker,
// installs it alongside the still-running old one, and waits for the page to say it's safe to
// switch over (see the SKIP_WAITING handling below and the update-banner code in index.html).
// Forgetting to bump this is the one way an update can silently fail to show up.
const CACHE_VERSION = 'v8';
const CACHE_NAME = 'cygnus-study-' + CACHE_VERSION;

// The app shell: everything needed to load and run with no network at all. This is a single-page
// app with exactly one HTML document (all CSS/JS inlined into it, images already base64'd in) plus
// the PWA-specific files, so the precache list is short by design.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      // Don't auto-activate yet -- stay in "waiting" until the page explicitly asks us to
      // (via the SKIP_WAITING message below), so an update never swaps out from under someone
      // mid-note without warning.
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name.startsWith('cygnus-study-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// The page's "Update available" banner posts this once the user taps it, to move the new
// worker out of "waiting" and into control.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // App shell: cache-first. This is the app itself -- once cached there's no reason to hit
    // the network for it again except when a whole new version is deployed (a new CACHE_NAME),
    // which install/activate above already handles.
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
  } else {
    // Cross-origin (Google Fonts): stale-while-revalidate. Show whatever's cached instantly if
    // we have it, and quietly refresh the cache in the background -- keeps fonts working offline
    // after the first successful load, without ever blocking on the network.
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
  }
});
