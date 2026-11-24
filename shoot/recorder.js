// Records the camera stream of one practice set so the player can watch it again. The video stays in memory until the
// player decides to keep it; keeping stores it on this phone only.
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.ShootRecorder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    var BITS_PER_SECOND = 1500000, MAX_MS = 12 * 60 * 1000;

    function pickMime(isTypeSupported) {
        if (typeof isTypeSupported !== 'function') return '';
        for (var i = 0; i < TYPES.length; i++) { try { if (isTypeSupported(TYPES[i])) return TYPES[i]; } catch (e) { /* try the next */ } }
        return '';
    }
    function createRecorder(options) {
        options = options || {};
        var MR = options.MediaRecorderClass || (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);
        var now = options.now || Date.now;
        var recorder = null, chunks = [], startedAt = 0, finished = null, timer = null;
        function supported() { return !!MR; }
        function start(stream) {
            if (!MR) throw new Error('這個瀏覽器不能錄影。');
            var type = pickMime(MR.isTypeSupported && MR.isTypeSupported.bind(MR));
            var opts = { videoBitsPerSecond: BITS_PER_SECOND };
            if (type) opts.mimeType = type;
            var mine = chunks = []; startedAt = now();   // each recorder keeps its own pieces, so a stopped one cannot add to the next
            var rec = new MR(stream, opts);
            recorder = rec;
            finished = new Promise(function (resolve) {
                rec.addEventListener('dataavailable', function (e) { if (e.data && e.data.size) mine.push(e.data); });
                rec.addEventListener('error', function () { resolve(null); });
                rec.addEventListener('stop', function () {
                    var blob = mine.length ? new Blob(mine, { type: rec.mimeType || type || 'video/webm' }) : null;
                    resolve(blob && blob.size ? { blob: blob, durationMs: now() - startedAt } : null);
                });
            });
            rec.start(1000);
            timer = setTimeout(function () { if (rec.state === 'recording') rec.stop(); }, MAX_MS);
            if (timer && timer.unref) timer.unref();
        }
        // Resolves to {blob, durationMs}, or null when nothing was recorded.
        function stop() {
            clearTimeout(timer);
            if (!recorder) return Promise.resolve(null);
            var r = recorder; recorder = null;
            try { if (r.state !== 'inactive') r.stop(); } catch (e) { return Promise.resolve(null); }
            return finished;
        }
        // The camera changed (another lens): what was recorded so far is dropped and a new video starts on the new stream.
        function restart(stream) {
            clearTimeout(timer);
            if (recorder) { var old = recorder; recorder = null; try { if (old.state !== 'inactive') old.stop(); } catch (e) { /* already stopped */ } }
            start(stream);
        }
        return { supported: supported, start: start, restart: restart, stop: stop, active: function () { return !!recorder; } };
    }
    return { TYPES: TYPES, MAX_MS: MAX_MS, pickMime: pickMime, createRecorder: createRecorder };
});
