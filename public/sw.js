/* Bento service worker: Web Share Target (POST /share) + offline shell */
const SHELL = 'bento-shell-v1';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bento-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname === '/share') {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const c = await caches.open('bento-share');
        const img = fd.get('image');
        if (img && img.size) await c.put('/shared-image', new Response(img, { headers: { 'content-type': img.type || 'image/jpeg' } }));
        const txt = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join('\n');
        if (txt) await c.put('/shared-text', new Response(txt, { headers: { 'content-type': 'text/plain' } }));
      } catch {}
      return Response.redirect('/?share=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  // network first for the shell, cache fallback
  e.respondWith(fetch(e.request).then(r => { if (r.ok && ASSETS.includes(url.pathname)) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('/index.html'))));
});
