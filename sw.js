/* InkNest v2 — offline, but prefer fresh files when connected. */
const CACHE='inknest-v2.0.0';
const ASSETS=['./','./index.html','./styles.css?v=2.0','./app.js?v=2.0','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inknest-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  // Never cache user notebooks. Those remain in IndexedDB, not the website files.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(response.ok&&url.pathname.startsWith(new URL(self.registration.scope).pathname))cache.put(event.request,response.clone()).catch(()=>{});
      return response;
    }catch(_){
      return await caches.match(event.request) || await caches.match('./index.html') ||
        Response.error();
    }
  })());
});
