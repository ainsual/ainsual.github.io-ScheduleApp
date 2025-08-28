// Простой Service Worker для GitHub Pages
const CACHE_NAME = 'sched-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './sv.js'
];

// Установка и предзагрузка статики
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Активизация: чистим старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Стратегия: cache-first для статики; network-first для запросов к Google Sheets API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Google Sheets API — пробуем из сети, на случай обновлений
  const isSheets = url.hostname.endsWith('googleapis.com') && url.pathname.includes('/spreadsheets/');
  if (isSheets) {
    event.respondWith(
      fetch(event.request).then(resp => {
        // не кэшируем API-ответы в SW (кэшируем в localStorage на стороне клиента)
        return resp;
      }).catch(async () => {
        // офлайн: отдадим что есть из кэша (вряд ли будет), иначе фоллбек 504
        const cached = await caches.match(event.request);
        return cached || new Response(JSON.stringify({error:'offline'}), {
          status: 504, headers: {'Content-Type':'application/json'}
        });
      })
    );
    return;
  }

  // Для статики — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // Закэшируем только GET и успешные
        if (event.request.method === 'GET' && resp.ok) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        }
        return resp;
      }).catch(() => {
        // Фоллбек для навигации
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
