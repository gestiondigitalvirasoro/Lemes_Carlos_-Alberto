const CACHE_NAME = 'lemes-v1';

// Recursos estáticos a cachear
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/css/doctor.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalar service worker y cachear recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si algún recurso falla, continuar igual
      });
    })
  );
  self.skipWaiting();
});

// Activar y limpiar caches viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: Network First (siempre intenta red, fallback a caché)
// Perfecto para un sistema médico donde los datos deben estar actualizados
self.addEventListener('fetch', (event) => {
  // Solo interceptar GET requests
  if (event.request.method !== 'GET') return;

  // No interceptar llamadas a la API ni a CDNs externos
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || !url.origin.includes(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar en caché si la respuesta es válida
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sin red: intentar desde caché
        return caches.match(event.request);
      })
  );
});
