const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const diagnostics = require('../專題程式/diagnostics.js');

test('summary reports stable distribution statistics', () => {
    assert.deepEqual(diagnostics.summarize([10, 20, 30]), {count:3,mean:20,median:20,p90:28,p95:29,min:10,max:30,stdDev:8.16});
});

test('camera sanitizer excludes persistent camera identifiers', () => {
    const safe = diagnostics.sanitizeCameraSettings({width:640,height:480,frameRate:30,deviceId:'secret',groupId:'secret',label:'Rear Camera'});
    assert.deepEqual(safe, {width:640,height:480,frameRate:30});
    assert.equal(JSON.stringify(safe).includes('secret'), false);
});

test('export uses coarse environment and privacy allowlist', () => {
    const result = diagnostics.buildExport({
        durationMs:10000, userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/126.0.0.0',
        viewport:{width:400,height:800}, orientation:'portrait-primary', devicePixelRatio:3,
        audioSampleRate:48000, requestedCameraSettings:{width:640,height:480,facingMode:'environment'},
        actualCameraSettings:{width:640,height:480,frameRate:30,deviceId:'do-not-export'},
        frameIntervalsMs:[33,34,100], inferenceDurationsMs:[10,12,14], presentedFrameCount:4, poseResultCount:3,
        analysisErrorCount:2, lastAnalysisError:'Pose send failed'
    });
    const json = JSON.stringify(result);
    assert.equal(result.environment.browser.name, 'Chrome');
    assert.equal(result.environment.os.name, 'Android');
    for (const forbidden of ['do-not-export','deviceId":"','groupId":"','label":"','fullUserAgent":"']) assert.equal(json.includes(forbidden), false);
    assert.equal(result.performance.longFrameCount, 1);
    assert.equal(result.performance.analysisErrorCount, 2);
    assert.equal(result.performance.lastAnalysisError, 'Pose send failed');
    assert.equal(result.privacy.localExportOnly, true);
});

test('diagnostic collector contains no upload transport', () => {
    const source = fs.readFileSync('專題程式/diagnostics.js', 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon|WebSocket/);
});
