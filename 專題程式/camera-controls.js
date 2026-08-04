(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CameraControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function finiteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function zoomConfiguration(capabilities = {}, settings = {}) {
        const zoom = capabilities.zoom;
        if (!zoom || typeof zoom !== 'object') return { supported: false };
        const min = finiteNumber(zoom.min);
        const max = finiteNumber(zoom.max);
        if (min === null || max === null || max < min) return { supported: false };
        const reportedStep = finiteNumber(zoom.step);
        const step = reportedStep !== null && reportedStep > 0 ? reportedStep : 0.1;
        const current = finiteNumber(settings.zoom);
        const value = Math.min(max, Math.max(min, current === null ? min : current));
        return { supported: true, min, max, step, value };
    }

    function showDiagnosticSkeleton(enabled, state) {
        return Boolean(enabled && (state === 'IDLE' || state === 'COOLDOWN'));
    }

    return { zoomConfiguration, showDiagnosticSkeleton };
});
