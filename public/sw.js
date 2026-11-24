// The classic page's service worker (it registers /sw.js, so it covers the whole site, /next too).
// 20 Nov: `/` now sends visitors on to the new game (/next/); the classic page is at /classic, kept here.
// 17 Nov: until now it answered every request and kept a copy of each response, so a phone that had
// played the classic game stored everything the new game fetched (tracks of up to 10 MB each), and it
// tried to store the live connection's requests too. Now it keeps only the classic page's own few
// files, for playing offline, and leaves every other request alone: the new game (/next), its sounds
// and pictures, the server's connection (/socket.io) and anything that isn't a plain GET.
const CACHE_NAME = '2424-cache-v66'; // (a new name: activating it deletes the old, overgrown cache)
const urlsToCache = [
  '/classic',
  '/index.html',
  '/shared/rules.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
const kept = new Set(urlsToCache);

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    // Not one of the classic page's own files: the browser fetches it as if there were no worker.
    if (request.method !== 'GET' || url.origin !== self.location.origin || !kept.has(url.pathname)) return;
    // The classic page's files: the network first (always the latest), the stored copy when offline.
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok && response.status === 200) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
