/*
 * Cache-first service worker for the app shell.
 *
 * The game is fully playable offline against the bot — the engine, the bot and
 * the card data are all in the bundle — so the only thing standing between a
 * cold plane-mode launch and a match is the shell being cached. Online play
 * simply fails to connect and the socket screen says so.
 */
const CACHE = 'delezh-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];

/**
 * Vite hashes the bundle filenames, so they cannot be listed here. Caching them
 * lazily on first fetch does not work either: the worker only starts
 * controlling the page after it activates, which is *after* the first load has
 * already fetched them uninterrupted — so a reload offline got the cached
 * index.html and then failed on every asset it references, leaving a white page.
 *
 * Instead, read the freshly cached index.html and precache whatever it points at.
 */
async function precacheAssets(cache) {
  try {
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) return;
    const html = await response.text();
    const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    await cache.addAll([...new Set(urls)]);
  } catch {
    /* offline at install time; the lazy path in fetch will fill the cache */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        await precacheAssets(cache);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API: a stale leaderboard is worse than no leaderboard.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // Navigations fall back to the cached shell so a reload offline still boots.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html', { ignoreVary: true }).then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      /*
       * ignoreVary matters: Vite emits its module script with `crossorigin`, so
       * the browser sends an Origin header the precache fetch did not, and a
       * response carrying `Vary` then fails to match. The cache held the asset
       * and served nothing — a blank page on every offline reload.
       */
      const options = { ignoreVary: true };
      const cached = (await cache.match(request, options)) ?? (await cache.match(url.pathname, options));
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          void cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const fallback = await cache.match(url.pathname, options);
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
