const test = require('node:test');
const assert = require('node:assert/strict');
const {LocalSessionCapture, cleanSegment, selectMimeType, extensionForMime, sanitizeCameraSettings} = require('../專題程式/session-capture.js');
const fs = require('node:fs');

class FakeRecorder {
    static isTypeSupported(type) { return type === 'video/mp4'; }
    constructor(stream, options = {}) { this.stream=stream; this.mimeType=options.mimeType || 'video/webm'; this.state='inactive'; this.listeners={}; }
    addEventListener(name, callback) { this.listeners[name]=callback; }
    start() { this.state='recording'; }
    stop() { this.state='inactive'; this.listeners.dataavailable({data:new Blob(['video'], {type:this.mimeType})}); this.listeners.stop(); }
}

const stream = {getVideoTracks: () => [{}]};
const context = {participantId:'TEST 01',sessionId:'S01',blockId:'B01',condition:'baseline',shootingSide:'right'};

test('selects a supported recording type and extension', () => {
    assert.equal(selectMimeType(FakeRecorder), 'video/mp4');
    assert.equal(extensionForMime('video/mp4;codecs=h264'), 'mp4');
    assert.equal(cleanSegment('TEST 01', 'x'), 'TEST-01');
});

test('camera settings exclude persistent identifiers', () => {
    assert.deepEqual(sanitizeCameraSettings({width:640,frameRate:30,deviceId:'private',groupId:'private'}),{width:640,frameRate:30});
});

test('builds a bound local session package and tracks downloads', async () => {
    let perf=100;
    const capture=new LocalSessionCapture({MediaRecorderClass:FakeRecorder,nowIso:()=> '2026-08-06T00:00:00.000Z',nowPerf:()=> perf+=10});
    capture.start({stream,context,buildId:'build',algorithmVersion:'algo',requestedCameraSettings:{width:640}});
    const presentedFrameIndex=capture.recordPresentedFrame({sourceTimestampMs:20,callbackPerfMs:120});
    const inference=capture.beginInference({sourceTimestampMs:20,presentedFrameIndex});
    capture.recordLandmarks(inference,[{x:1,y:2,z:3,visibility:.9}]);
    capture.recordSignal(inference,{shootingSide:'right',rawElbowDeg:1,rawKneeDeg:2,filteredElbowDeg:3,filteredKneeDeg:4,sideVisibility:.9,state:'IDLE'});
    capture.completeInference(inference,150);
    capture.recordTrial({id:1,participantId:'TEST 01'});
    const files=await capture.stop({diagnostics:{ok:true},actualCameraSettings:{frameRate:30}});
    const names=Object.keys(files);
    assert.equal(names.length,8);
    assert.ok(names.some(name=>name.endsWith('_source-video.mp4')));
    assert.ok(names.some(name=>name.endsWith('_manifest.json')));
    const manifestName=names.find(name=>name.endsWith('_manifest.json'));
    const manifest=JSON.parse(await files[manifestName].text());
    assert.equal(manifest.counts.inferenceAttempts,1);
    assert.equal(manifest.counts.processedFrames,1);
    assert.equal(manifest.counts.failedInferences,0);
    assert.equal(capture.hasUnsavedData(),true);
    names.forEach(name=>capture.markDownloaded(name));
    assert.equal(capture.hasUnsavedData(),false);
});

test('failed inference is closed and counted separately', async () => {
    let perf=100;
    const capture=new LocalSessionCapture({MediaRecorderClass:FakeRecorder,nowIso:()=> '2026-08-17T00:00:00.000Z',nowPerf:()=> perf+=10});
    capture.start({stream,context,buildId:'build',algorithmVersion:'algo',requestedCameraSettings:{width:640}});
    const inference=capture.beginInference({sourceTimestampMs:20,presentedFrameIndex:1});
    capture.failInference(inference,new Error('Load failed'),150);
    const files=await capture.stop({});
    const manifestName=Object.keys(files).find(name=>name.endsWith('_manifest.json'));
    const manifest=JSON.parse(await files[manifestName].text());
    assert.equal(manifest.counts.inferenceAttempts,1);
    assert.equal(manifest.counts.processedFrames,0);
    assert.equal(manifest.counts.failedInferences,1);
    const inferenceName=Object.keys(files).find(name=>name.endsWith('_inference-timestamps.csv'));
    assert.match(await files[inferenceName].text(),/"failed","Load failed"/);
});

test('requires complete metadata and a live stream', () => {
    const capture=new LocalSessionCapture({MediaRecorderClass:FakeRecorder});
    assert.throws(()=>capture.start({stream,context:{},buildId:'x'}),/metadata/);
    assert.throws(()=>capture.start({stream:null,context,buildId:'x'}),/stream/);
});

test('capture module contains no upload transport', () => {
    const source=fs.readFileSync('專題程式/session-capture.js','utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
});
