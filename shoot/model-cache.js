// Asks the worker (sw.js) to keep the pose model on this phone and reports how far the download is, so a court with a weak
// signal waits once instead of every launch. Without worker support the page works exactly as before.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.ModelCache = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function percent(loaded, total) { return total > 0 ? Math.max(0, Math.min(100, Math.floor(loaded / total * 100))) : 0; }
    function megabytes(bytes) { return (bytes / 1048576).toFixed(1); }
    function describe(state) {
        if (state.cached) return '分析模型已存在手機，沒有網路也能用。';
        if (state.error) return '分析模型還沒下載完（' + state.error + '）。連上網路會再試，也可以按「重試下載」。';
        if (state.total) return '正在下載分析模型 ' + percent(state.loaded, state.total) + '%（' + megabytes(state.loaded) + ' / ' + megabytes(state.total) + ' MB）。下載完成後離線也能用，這頁先不要關。';
        return '';
    }
    // onState({cached, loaded, total, error}) is called on every change.
    function start(onState, scope) {
        const nav = (scope || globalThis).navigator;
        if (!nav || !nav.serviceWorker) return null;
        const state = { cached: false, loaded: 0, total: 0, error: '' };
        function push(change) { Object.assign(state, change); onState({ ...state }); }
        nav.serviceWorker.addEventListener('message', event => {
            const m = event.data;
            if (!m || m.type !== 'model-progress') return;
            push({ loaded: m.loaded, total: m.total, error: m.error || '', cached: !!(m.done || m.cached) || state.cached });
            if (m.done && nav.storage && nav.storage.persist) nav.storage.persist().catch(() => {});
        });
        function send(type) {
            nav.serviceWorker.ready.then(reg => { const worker = reg.active || reg.waiting || reg.installing; if (worker) worker.postMessage({ type }); }).catch(() => {});
        }
        nav.serviceWorker.register('../sw.js').then(() => send('precache')).catch(() => {});
        return { retry() { push({ error: '' }); send('precache'); } };
    }
    return { start, describe, percent };
});
