// Keeps the pose-model files on the phone so practice starts without a network, and keeps the last good copy of each page
// as a fallback for a court with no signal. Pages are always revalidated first (cache: 'no-cache'), so while the phone
// is online a site update reaches the next launch exactly as before. Other origins (CDN scripts, the cloud) are untouched.
'use strict';
const MODEL_CACHE = 'bball-pose-model-v1', SHELL_CACHE = 'bball-shell-v1', SHELL_WAIT_MS = 6000;
const MODEL_DIR = '專題程式/vendor/mediapipe-pose/';
// The files practice actually downloads (measured on the live site, about 15.5 MB), with their sizes for the progress bar.
const MODEL_FILES = {
    'pose.js': 47089, 'pose_web.binarypb': 1007, 'pose_solution_packed_assets.data': 2962288, 'pose_solution_simd_wasm_bin.js': 276478,
    'pose_solution_simd_wasm_bin.wasm': 6104372, 'pose_landmark_full.tflite': 6440512,
    // Small files the engine also asks for; missing them offline stops the analysis (the .data file is empty by design).
    'pose_solution_packed_assets_loader.js': 8002, 'pose_solution_simd_wasm_bin.data': 0
};

function kindOf(url, scope) {
    const u = new URL(url);
    if (u.origin !== new URL(scope).origin || !u.href.startsWith(scope)) return 'skip';
    return decodeURIComponent(u.pathname).includes('/vendor/mediapipe-pose/') ? 'model' : 'shell';
}
if (typeof module === 'object' && module.exports) module.exports = { kindOf, MODEL_FILES };

if (typeof self !== 'undefined' && self.registration) {
    const total = () => Object.values(MODEL_FILES).reduce((a, b) => a + b, 0);
    const loaded = new Map(), inflight = new Map();
    let lastPost = 0;
    const modelUrl = name => new URL(MODEL_DIR + name, self.registration.scope).href;

    async function tell(message, force) {
        const now = Date.now();
        if (!force && now - lastPost < 250) return;
        lastPost = now;
        const sum = Math.min([...loaded.values()].reduce((a, b) => a + b, 0), total());
        for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type: 'model-progress', loaded: sum, total: total(), ...message });
    }

    // One download per file at a time: the page asking for a file that the background download is already fetching waits for it.
    async function modelResponse(url) {
        const cache = await caches.open(MODEL_CACHE);
        const hit = await cache.match(url);
        if (hit) return hit;
        if (!inflight.has(url)) {
            inflight.set(url, (async () => {
                const res = await fetch(url);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const reader = res.body.getReader(), chunks = [];
                let got = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value); got += value.length; loaded.set(url, got); tell({});
                }
                const blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' });
                // Content-Length matters: the engine's data-file loader reads it for its progress arithmetic and aborts without it.
                await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type, 'Content-Length': String(blob.size) } }));
                loaded.set(url, blob.size); tell({}, true);
            })().finally(() => inflight.delete(url)));
        }
        await inflight.get(url);
        return cache.match(url);
    }

    async function modelStatus() {
        const cache = await caches.open(MODEL_CACHE);
        let have = 0;
        for (const name of Object.keys(MODEL_FILES)) if (await cache.match(modelUrl(name))) { have++; loaded.set(modelUrl(name), MODEL_FILES[name]); }
        return have === Object.keys(MODEL_FILES).length;
    }

    async function precache() {
        try {
            for (const name of Object.keys(MODEL_FILES)) await modelResponse(modelUrl(name));
            await tell({ done: true }, true);
        } catch (error) { await tell({ error: String((error && error.message) || error) }, true); }
    }

    async function shellResponse(request) {
        const cache = await caches.open(SHELL_CACHE);
        const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
            if (res.ok && res.status === 200) cache.put(request.url, res.clone());
            return res;
        });
        const hit = await cache.match(request.url);
        if (!hit) return network;
        return Promise.race([network.catch(() => hit), new Promise(resolve => setTimeout(() => resolve(hit), SHELL_WAIT_MS))]);
    }

    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', event => event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key !== MODEL_CACHE && key !== SHELL_CACHE) await caches.delete(key);
        await self.clients.claim();
    })()));
    self.addEventListener('fetch', event => {
        const request = event.request;
        if (request.method !== 'GET' || request.headers.has('range')) return;
        const kind = kindOf(request.url, self.registration.scope);
        if (kind === 'model') event.respondWith(modelResponse(request.url.split('#')[0].split('?')[0]).catch(() => fetch(request)));
        else if (kind === 'shell') event.respondWith(shellResponse(request).catch(() => fetch(request)));
    });
    self.addEventListener('message', event => {
        if (!event.data) return;
        if (event.data.type === 'status') event.waitUntil(modelStatus().then(cached => tell({ cached }, true)));
        if (event.data.type === 'precache') event.waitUntil(modelStatus().then(cached => (cached ? tell({ done: true, cached: true }, true) : precache())));
    });
}
