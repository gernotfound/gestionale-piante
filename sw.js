const CACHE_NAME = 'piante-pro-cache-v4';

// Elenco di tutti i file necessari per far funzionare l'app OFFLINE 100%
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://unpkg.com/leaflet/dist/leaflet.css',
    'https://unpkg.com/leaflet/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/html5-qrcode',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// FASE 1: Installazione (Scarica tutto e mettilo nella memoria del telefono)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aperta. Salvataggio risorse in corso...');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// FASE 2: Attivazione (Pulisce vecchie versioni dell'app se carichi aggiornamenti su GitHub)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Rimozione vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// FASE 3: Intercettazione Richieste (Network First Strategy)
self.addEventListener('fetch', event => {
    const req = event.request;
    
    // Sicurezza: intercetta solo le richieste web standard, evita bug con estensioni browser
    if (!(req.url.startsWith('http:') || req.url.startsWith('https:'))) {
        return;
    }
    
    // Strategia "Network First": Cerca prima su internet
    // Se non c'è internet (offline), pesca la versione salvata nella cache.
    event.respondWith(
        fetch(req).then(networkResponse => {
            // Se la connessione c'è, aggiorna la cache in silenzio
            if (networkResponse && networkResponse.status === 200 && req.method === 'GET') {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(req, responseClone);
                });
            }
            return networkResponse;
        }).catch(() => {
            // Sei offline: usa la cache!
            return caches.match(req);
        })
    );
});