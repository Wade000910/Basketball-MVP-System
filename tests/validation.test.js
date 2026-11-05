const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../validation/core.js');
const {parseCsv}=require('../offline-review/core.js');

const csv=[
    'trialOrder,trialStatus,dt,kneePeakPerfMs,elbowOnsetPerfMs,elbowPeakPerfMs,timestamp',
    '1,accepted,100,1000,1100,1250,2026-11-05T08:00:01Z',
    '2,low_quality,,2000,,,2026-11-05T08:00:11Z',
    '3,accepted,80,3000,3080,3230,2026-11-05T08:00:21Z',
    '4,accepted,120,4000,4120,4260,2026-11-05T08:00:31Z'
].join('\n');

test('reads the system trial export, including the peak-based candidate metric',()=>{
    const trials=V.parseTrials(parseCsv(csv));
    assert.deepEqual(trials.map(t=>[t.trialOrder,t.status,t.onset,t.peak]),[[1,'accepted',100,250],[2,'low_quality',null,null],[3,'accepted',80,230],[4,'accepted',120,260]]);
    assert.throws(()=>V.parseTrials(parseCsv('a,b\n1,2')),/缺少欄位/);
    assert.throws(()=>V.parseTrials(parseCsv('trialOrder,trialStatus,dt\n1,accepted,1\n1,accepted,2')),/重複/);
});
test('frame index converts to real time using the capture rate, also for slowed exports',()=>{
    assert.equal(V.frameMs(24,240),100);
    // 240 fps footage exported as a 30 fps file: one file frame per captured frame.
    assert.equal(V.frameAt(V.timeOfFrame(57,30),30),57);
    assert.equal(V.frameAt(V.timeOfFrame(57,240),240),57);
    assert.equal(V.frameAt(57/240,240),57,'exact frame start');
    assert.equal(V.frameAt(57.99/240,240),57,'late in the frame');
    assert.throws(()=>V.newState({captureFps:240,playbackFps:480}),/影片檔影格率/);
});
test('default pairing skips trials the system rejected and supports an offset',()=>{
    const trials=V.parseTrials(parseCsv(csv));
    assert.deepEqual(V.defaultAssignment(4,trials),[1,3,4,null]);
    assert.deepEqual(V.defaultAssignment(2,trials,1),[3,4]);
});
test('agreement statistics follow Bland-Altman with system minus reference',()=>{
    const a=V.agreement([{system:110,reference:100},{system:90,reference:100},{system:130,reference:120},{system:100,reference:80}]);
    // differences 10,-10,10,20: mean 7.5, sample SD sqrt(475/3)=12.58
    assert.equal(a.n,4);assert.equal(a.bias,7.5);assert.equal(a.sdDiff,12.6);
    assert.equal(a.loaLow,-17.2);assert.equal(a.loaHigh,32.2);
    assert.equal(a.mae,12.5);assert.equal(a.rmse,13.2);
    assert.equal(V.agreement([]).n,0);
    assert.equal(V.agreement([{system:1,reference:2}]).sdDiff,null);
});
test('comparison pairs marked shots with trials and reports both definitions',()=>{
    const trials=V.parseTrials(parseCsv(csv));
    const state=V.newState({captureFps:240,playbackFps:240});
    // Reference frames at 240 fps: onset 24 frames = 100 ms, peak 60 frames = 250 ms.
    state.shots=[
        {marks:{knee_peak:100,elbow_onset:124,elbow_peak:160,release:170},systemTrial:1},
        {marks:{knee_peak:500,elbow_onset:521,elbow_peak:556},systemTrial:3},
        {marks:{knee_peak:900,elbow_onset:930},systemTrial:2},
        {marks:{knee_peak:1300,elbow_onset:1330,elbow_peak:1360},systemTrial:4,excluded:true}
    ];
    const r=V.compare(state,trials);
    assert.deepEqual(r.rows.map(x=>[x.onsetReference,x.onsetSystem,x.onsetDifference]),[[100,100,0],[87.5,80,-7.5],[125,null,null],[125,120,-5]]);
    assert.deepEqual(r.rows.map(x=>x.peakDifference),[0,-3.3,null,10]);
    assert.equal(r.metrics.onset.n,2,'rejected trial and excluded shot are left out');
    assert.equal(r.metrics.onset.bias,-3.8);
    assert.deepEqual(r.counts,{shots:4,paired:4,accepted:3,excluded:1});
    assert.equal(r.resolutionMs,4.17);
    assert.match(V.rowsCsv(r).split('\r\n')[1],/^1,1,accepted,false,100,100,0,250,250,0$/);
});
test('a trial used for two shots is flagged',()=>{
    const trials=V.parseTrials(parseCsv(csv));
    const state=V.newState();state.shots=[{marks:{},systemTrial:1},{marks:{},systemTrial:1}];
    assert.deepEqual(V.compare(state,trials).duplicates,[1]);
});
test('saved marks restore only valid content',()=>{
    const ok=V.restore({schemaVersion:V.SCHEMA,video:{name:'a.mov',size:9},captureFps:240,playbackFps:30,shots:[{marks:{knee_peak:3,bogus:1},systemTrial:null,note:'x'}]});
    assert.deepEqual(ok.shots[0],{marks:{knee_peak:3},systemTrial:null,manualPair:false,excluded:false,note:'x'});
    assert.throws(()=>V.restore({schemaVersion:'other'}),/不是/);
    assert.throws(()=>V.restore({schemaVersion:V.SCHEMA,captureFps:240,playbackFps:240,shots:[{marks:{knee_peak:-1}}]}),/影格/);
});
test('the analysis page CSV repeats trialOrder per block, so the unique id is used',()=>{
    const text=['id,condition,trialOrder,trialStatus,dt,kneePeakPerfMs,elbowPeakPerfMs',
        '1,visual,1,accepted,90,0,200','2,visual,2,accepted,95,0,210','3,auditory,1,accepted,100,0,220'].join('\n');
    const trials=V.parseTrials(parseCsv(text));
    assert.deepEqual(trials.map(t=>[t.trialOrder,t.blockOrder,t.condition]),[[1,1,'visual'],[2,2,'visual'],[3,1,'auditory']]);
    assert.deepEqual(V.defaultAssignment(3,trials),[1,2,3]);
});
