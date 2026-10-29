(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ExperimentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const TIMING_DEFINITION = Object.freeze({
        id:'knee-peak-elbow-onset-v1',
        kneeEvent:'peak_extension_angular_velocity',
        elbowEvent:'last_at_or_below_threshold_before_peak_extension_velocity',
        elbowOnsetThresholdDegPerSec:10,
        deltaT:'elbowOnsetPerfMs - kneePeakPerfMs',
        clock:'pose-result-performance-now',
        interpolationStepMs:1,
        validated:false
    });
    function calculateSD(values) {
        if (!Array.isArray(values) || values.length < 2 || values.some(value => !Number.isFinite(value))) return null;
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance);
    }

    function sameExperimentalBlock(row, context) {
        return row.participantId === context.participantId &&
            row.sessionId === context.sessionId &&
            row.blockId === context.blockId &&
            row.condition === context.condition;
    }

    function qualityFlags(measuredFps, meanVisibility) {
        const flags = [];
        if (!Number.isFinite(measuredFps)) flags.push('RATE_UNAVAILABLE');
        else if (measuredFps < 24) flags.push('LOW_FPS');
        if (!Number.isFinite(meanVisibility)) flags.push('VISIBILITY_UNAVAILABLE');
        else if (meanVisibility < 0.7) flags.push('LOW_VISIBILITY');
        return flags.length ? flags.join('|') : 'OK';
    }

    function escapeCsv(value) {
        return `"${String(value ?? '').replaceAll('"', '""')}"`;
    }

    function rowsToCsv(rows, columns) {
        return [columns.join(','), ...rows.map(row => columns.map(key => escapeCsv(row[key])).join(','))].join('\n');
    }

    function maskForBaseline(condition, value, hiddenValue = '--') {
        return condition === 'baseline' ? hiddenValue : value;
    }

    function hasRaisedArm(landmarks, minVisibility = 0.6) {
        if (!Array.isArray(landmarks)) return false;
        return [[11, 15], [12, 16]].some(([shoulderIndex, wristIndex]) => {
            const shoulder = landmarks[shoulderIndex];
            const wrist = landmarks[wristIndex];
            return shoulder && wrist &&
                Number(shoulder.visibility || 0) >= minVisibility &&
                Number(wrist.visibility || 0) >= minVisibility &&
                Number(wrist.y) < Number(shoulder.y);
        });
    }

    return { TIMING_DEFINITION, calculateSD, sameExperimentalBlock, qualityFlags, escapeCsv, rowsToCsv, maskForBaseline, hasRaisedArm };
});
