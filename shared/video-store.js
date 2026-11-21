// Practice videos kept on this phone only, in IndexedDB (never uploaded). Keyed by the id of the saved set.
// The pure helpers are tested in node; the database calls are covered by the browser tests.
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.VideoStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var DB = 'bmvp-video', STORE = 'videos', MAX_VIDEOS = 12;

    // Ids to delete so that only the newest `max` remain.
    function overflow(list, max) {
        var keep = Math.max(0, max === undefined ? MAX_VIDEOS : max);
        return list.slice().sort(function (a, b) { return b.savedAt - a.savedAt; }).slice(keep).map(function (v) { return v.id; });
    }
    function sizeText(bytes) {
        if (!(bytes >= 0)) return '';
        return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }
    function durationText(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function open() {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') return reject(new Error('這個瀏覽器不能儲存影片。'));
            var req;
            try { req = indexedDB.open(DB, 1); } catch (e) { return reject(e); }
            req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('影片資料庫打不開。')); };
            req.onblocked = function () { reject(new Error('影片資料庫被其他頁面占用。')); };
        });
    }
    function run(mode, work) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, mode), out;
                try { out = work(tx.objectStore(STORE)); } catch (e) { db.close(); return reject(e); }
                tx.oncomplete = function () { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
                tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('影片儲存失敗，手機空間可能不足。')); };
            });
        });
    }
    function put(id, blob, meta) {
        var record = { id: id, blob: blob, type: blob.type, size: blob.size, savedAt: Date.now(), durationMs: meta && meta.durationMs || 0 };
        return run('readwrite', function (s) { return s.put(record); }).then(function () { return list(); }).then(function (all) {
            var drop = overflow(all, MAX_VIDEOS);
            return Promise.all(drop.map(remove)).then(function () { return drop; });
        });
    }
    function get(id) { return run('readonly', function (s) { return s.get(id); }); }
    function remove(id) { return run('readwrite', function (s) { return s.delete(id); }); }
    // Light records only (no blobs would be ideal, but IndexedDB returns whole rows; the list is small, 12 at most).
    function list() {
        return run('readonly', function (s) { return s.getAll(); }).then(function (rows) {
            return (rows || []).map(function (r) { return { id: r.id, size: r.size, savedAt: r.savedAt, durationMs: r.durationMs, type: r.type }; });
        });
    }
    return { MAX_VIDEOS: MAX_VIDEOS, overflow: overflow, sizeText: sizeText, durationText: durationText, put: put, get: get, remove: remove, list: list };
});
