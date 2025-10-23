// NOME DO CACHE - Mude o número da versão se atualizar os arquivos
const CACHE_NAME = 'admin-panel-cache-v1';

// Arquivos que serão salvos em cache
const FILES_TO_CACHE = [
    'admin.html',
    'admin-style.css',
    'admin.js',
    'config.js',
    'logo.jpg',
    'icon-192x192.png',
    'icon-512x512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Evento de Instalação: Salva os arquivos em cache
self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pré-cache de arquivos da aplicação');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', (evt) => {
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removendo cache antigo', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Evento de Fetch: Responde com os arquivos do cache quando possível
self.addEventListener('fetch', (evt) => {
    // Responde com o cache primeiro, e depois busca na rede (cache-first)
    evt.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(evt.request)
                .then((response) => {
                    return response || fetch(evt.request);
                });
        })
    );
});
/* FIM DO ARQUIVO */
