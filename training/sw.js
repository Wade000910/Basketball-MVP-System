'use strict';
// Regenerate the shell version with node tools/update-offline-shell.cjs.
const PREFIX='basketball-training-shell:'+self.registration.scope+':';
const CACHE=PREFIX+'48f45cd27555b5df';
const ROOT=new URL('./',self.location.href);
const FILES=["./","./index.html","./styles.css","./analysis-store.js","./core.js","./app.js","./offline.js","./manifest.webmanifest","./icon.svg"];
const ASSETS=new Set(FILES.map(file=>new URL(file,ROOT).href));
self.addEventListener('install',event=>{
    // No skipWaiting: an open training session keeps its current shell version.
    event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.addAll(FILES.map(file=>new Request(new URL(file,ROOT),{cache:'reload'})));}catch(error){await caches.delete(CACHE);throw error;}})());
});
self.addEventListener('activate',event=>{
    event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());
});
self.addEventListener('fetch',event=>{
    if(event.request.method!=='GET')return;
    const url=new URL(event.request.url);url.search='';url.hash='';
    if(!ASSETS.has(url.href))return;
    event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(url.href) || fetch(event.request);})());
});
