const C = 'tk-spacemap-v3',
      SHELL = ['./', 'embed', 'index.html', 'style.css', 'script.js', 'app.js', 'manifest.webmanifest', 'icon.svg'],
      VENDOR = ['vendor/three.min.js', 'vendor/fonts.css'];

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(C);
  await c.addAll(SHELL);
  await Promise.allSettled(VENDOR.map(u => c.add(u)));
  try { // файлы шрифта, на которые ссылается fonts.css
    const css = await (await c.match('vendor/fonts.css')).text(), base = new URL('vendor/fonts.css', self.registration.scope);
    await Promise.allSettled([...css.matchAll(/url\(([^)]+)\)/g)].map(m => c.add(new URL(m[1].replace(/['"]/g, ''), base).href)));
  } catch {}
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x != C).map(x => caches.delete(x)))).then(() => clients.claim())
));

// сначала кэш (работает без сети), в фоне обновляем; API не кэшируем
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method != 'GET' || u.origin != location.origin || u.pathname.startsWith('/api')) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => {
      if (res.ok) { const k = res.clone(); caches.open(C).then(c => c.put(r, k)); }
      return res;
    }).catch(() => hit || (r.mode == 'navigate' ? caches.match('index.html') : Response.error()));
    return hit || net;
  }));
});
