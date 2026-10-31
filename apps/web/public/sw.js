// Service worker do Controle de Obras: deixa "Tarefas de hoje" abrir sem sinal.
// - Arquivos do build (_next/static): cache primeiro (têm hash no nome).
// - Página "hoje" de cada obra: rede primeiro; sem rede, a última versão salva.
// Os apontamentos feitos offline ficam no localStorage da página (fila), não aqui.
const CACHE = 'obras-campo-v1';
const PAGINA_HOJE = /^\/projetos\/[0-9a-f-]{36}\/hoje\/?$/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(
      caches.match(req).then(
        (salvo) =>
          salvo ||
          fetch(req).then((resp) => {
            if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
            return resp;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate' && PAGINA_HOJE.test(url.pathname)) {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok && !resp.redirected) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copia));
          }
          return resp;
        })
        .catch(() => caches.match(url.pathname).then((salvo) => salvo || Response.error())),
    );
  }
});
