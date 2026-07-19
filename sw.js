/* Mission Apéro — Service Worker (v11-audit-fixes)
   Rôle : rendre l'app tolérante aux coupures réseau en cours de partie.
   - Données Supabase (/rest/v1/) : réseau d'abord, repli sur le cache si coupure.
   - Tout le reste (app, polices, images, sons, jsQR) : cache d'abord, mise en
     cache au premier chargement (y compris réponses opaques cross-origin). */

const CACHE = 'mission-apero-v1';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La page elle-même (navigations) : réseau d'abord — les mises à jour de
  // l'application arrivent immédiatement, le cache ne sert qu'en cas de coupure
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
          return r;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Données de mission : réseau d'abord (fraîcheur), cache en secours
  if (url.pathname.includes('/rest/v1/')) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
          return r;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App + médias : cache d'abord, réseau en secours avec mise en cache
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r && (r.ok || r.type === 'opaque')) {
            const cp = r.clone();
            caches.open(CACHE).then((c) => c.put(req, cp));
          }
          return r;
        })
    )
  );
});
