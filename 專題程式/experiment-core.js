(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ExperimentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function calculateSD(values) {
        if (values.length < 2) return 0;
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
        if (Number.isFinite(measuredFps) && measuredFps < 24) flags.push('LOW_FPS');
        if (Number.isFinite(meanVisibility) && meanVisibility < 0.7) flags.push('LOW_VISIBILITY');
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

    return { calculateSD, sameExperimentalBlock, qualityFlags, escapeCsv, rowsToCsv, maskForBaseline, hasRaisedArm };
});
