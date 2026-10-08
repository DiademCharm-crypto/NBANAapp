/* NBANA Portal service worker — makes the installed app open instantly and
   keep working on a weak connection. Bump the cache name to push fresh files. */
const CACHE = 'nbana-v17';
const CORE = [
  'portal.html', 'index.html', 'login.html', 'students.html', 'about.html', 'app.html',
  'app.js', 'portal.js', 'login.js', 'portal.css', 'style.css', 'manifest.json',
  'supabase-config.js', 'supabase-sync.js', 'faculty-roster.js', 'students-roster.js'
];

self.addEventListener('install', (e) => {
  /* cache: 'reload' keeps the browser's HTTP cache out of the precache, so a
     page and its stylesheets are never stored at different ages. */
  const fresh = CORE.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate: show the cached copy right away, refresh behind it */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
