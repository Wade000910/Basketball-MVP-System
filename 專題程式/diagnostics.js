(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.DeviceDiagnostics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const BUILD_ID = 'phase0-diagnostics-v1';

    function round(value, digits = 2) {
        return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
    }

    function percentile(sorted, fraction) {
        if (!sorted.length) return null;
        const index = (sorted.length - 1) * fraction;
        const lower = Math.floor(index), upper = Math.ceil(index);
        if (lower === upper) return sorted[lower];
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }

    function summarize(values) {
        const clean = values.filter(Number.isFinite).filter(value => value >= 0).sort((a, b) => a - b);
        if (!clean.length) return {count:0, mean:null, median:null, p90:null, p95:null, min:null, max:null, stdDev:null};
        const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
        const variance = clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / clean.length;
        return {
            count:clean.length, mean:round(mean), median:round(percentile(clean, 0.5)),
            p90:round(percentile(clean, 0.9)), p95:round(percentile(clean, 0.95)),
            min:round(clean[0]), max:round(clean[clean.length - 1]), stdDev:round(Math.sqrt(variance))
        };
    }

    function sanitizeCameraSettings(settings = {}) {
        const allowed = ['width', 'height', 'frameRate', 'facingMode', 'aspectRatio', 'resizeMode'];
        return Object.fromEntries(allowed.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
    }

    function coarseEnvironment(userAgent = '') {
        const browserMatches = [
            ['Edge', /Edg\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
            ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Safari', /Version\/(\d+).+Safari/]
        ];
        const osMatches = [
            ['Android', /Android\s(\d+)/], ['iOS', /OS\s(\d+)[_.]/],
            ['Windows', /Windows NT\s([0-9.]+)/], ['macOS', /Mac OS X\s(\d+)[_.]/]
        ];
        const find = entries => {
            for (const [name, pattern] of entries) { const match = userAgent.match(pattern); if (match) return {name, major:String(match[1])}; }
            return {name:'unknown', major:null};
        };
        return {browser:find(browserMatches), os:find(osMatches)};
    }

    function buildExport(raw) {
        const frameStats = summarize(raw.frameIntervalsMs || []);
        const inferenceStats = summarize(raw.inferenceDurationsMs || []);
        const targetInterval = Number.isFinite(raw.actualCameraSettings?.frameRate) && raw.actualCameraSettings.frameRate > 0
            ? 1000 / raw.actualCameraSettings.frameRate : frameStats.median;
        const longFrameThreshold = Number.isFinite(targetInterval) ? targetInterval * 2 : null;
        const longFrameCount = longFrameThreshold === null ? 0 : (raw.frameIntervalsMs || []).filter(value => value > longFrameThreshold).length;
        return {
            schemaVersion:'phase0-device-diagnostics-v1', buildId:BUILD_ID,
            exportedAt:new Date().toISOString(), startedAt:raw.startedAt || null,
            diagnosticDurationSec:round(raw.durationMs / 1000),
            environment:{
                ...coarseEnvironment(raw.userAgent || ''),
                viewport:{width:raw.viewport?.width || null, height:raw.viewport?.height || null},
                orientation:raw.orientation || 'unknown', devicePixelRatio:round(raw.devicePixelRatio),
                audioSampleRate:raw.audioSampleRate || null
            },
            camera:{requested:raw.requestedCameraSettings || {}, actual:sanitizeCameraSettings(raw.actualCameraSettings)},
            performance:{
                frameCallbackMode:raw.frameCallbackMode || 'unknown', presentedFrameCount:raw.presentedFrameCount || 0,
                poseResultCount:raw.poseResultCount || 0, frameIntervalMs:frameStats,
                calculatedMeanFps:frameStats.mean ? round(1000 / frameStats.mean) : null,
                inferenceDurationMs:inferenceStats, longFrameThresholdMs:round(longFrameThreshold),
                longFrameCount, longFrameRatePercent:frameStats.count ? round(longFrameCount / frameStats.count * 100) : 0
            },
            privacy:{localExportOnly:true, excludedFields:['deviceId','groupId','label','ip','fullUserAgent','persistentIdentifier']}
        };
    }

    return {BUILD_ID, summarize, sanitizeCameraSettings, coarseEnvironment, buildExport};
});
