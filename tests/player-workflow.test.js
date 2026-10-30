const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../training/core.js'),A=require('../training/analysis-store.js'),G=require('../專題程式/shooting-guide.js');
const start='2026-10-30T01:00:00Z',end='2026-10-30T01:05:00Z';
const session=(id='s1')=>C.finishSession(C.addShot(C.createSession({playerCode:'P001',targetShots:10,id,now:start}),true,'a',start),end);
const trial=(trialOrder,trialStatus,dt)=>({trialOrder,trialStatus,dt,timestamp:start,reasonCode:trialStatus==='accepted'?'':'LOW_FPS'});
const run=(changes={})=>({schemaVersion:A.SCHEMA,id:'run1',participantId:'P001',sessionId:'s1',blockId:'B01',condition:'auditory',shootingSide:'right',startedAt:start,stoppedAt:end,trials:[trial(1,'accepted',0),trial(2,'low_quality',90),trial(3,'invalid',null)],...changes});
const store=(history=[],active=null)=>({schemaVersion:C.SCHEMA,history,active});
test('linked analysis isolates player and session and excludes low quality and baseline from visible timing',()=>{
    const runs=[run(),run({id:'wrong-player',participantId:'OTHER'}),run({id:'wrong-session',sessionId:'other'}),run({id:'baseline',condition:'baseline',trials:[trial(1,'accepted',500)]})];
    const selected=A.forSession(session(),runs),summary=A.summary(selected);
    assert.equal(selected.length,2);assert.deepEqual(summary,{runs:2,total:4,accepted:2,excluded:2,meanDt:0});
    assert.equal(A.summary([runs[3]]).meanDt,null);
});
test('analysis rejects malformed, duplicated, unbounded or conflicting trials and strips extra fields',()=>{
    for(const change of [{id:'=CMD()'},{condition:'other'},{stoppedAt:'2020-01-01'},{trials:[trial(1,'accepted',null)]},{trials:[trial(1,'accepted',0),trial(1,'accepted',3)]},{trials:Array.from({length:201},(_,i)=>trial(i+1,'accepted',1))}])assert.throws(()=>A.normalize(run(change)));
    assert.equal(A.normalize(run({video:'private',trials:[{...trial(1,'accepted',0),landmarks:'private'}]})).video,undefined);
    assert.equal(A.normalize(run({trials:[{...trial(1,'accepted',0),landmarks:'private'}]})).trials[0].landmarks,undefined);
    assert.equal(A.merge([run()],[run()]).length,1);
    assert.throws(()=>A.merge([run()],[run({trials:[]})]),/內容不同/);
});
test('single report and whole backup round trip active, completed and linked records',()=>{
    const s={...session(),analysisRuns:[run()]};
    const single=C.parseBackup(JSON.stringify({...s,summary:{total:999}}));
    assert.deepEqual(single.history[0],s);assert.equal(single.active,null);
    const active=C.createSession({id:'unfinished',playerCode:'P001',targetShots:10,now:start});
    const backup={schemaVersion:'basketball-training-backup-v1',store:store([s],active)};
    assert.deepEqual(C.parseBackup(JSON.stringify(backup)),backup.store);
    assert.deepEqual(C.parseBackup(JSON.stringify(active)).active,active);
});
test('backup rejects demos, malformed data, formula IDs, excessive size and mismatched analysis',()=>{
    for(const value of [null,{},C.demoSession(),{...session(),id:'=formula'},{...session(),analysisRuns:[run({participantId:'OTHER'})]},{...session(),shots:[{id:'bad',made:'yes',recordedAt:start}]}])assert.throws(()=>C.parseBackup(JSON.stringify(value)));
    assert.throws(()=>C.parseBackup(' '.repeat(5*1024*1024+1)));
    assert.throws(()=>C.parseBackup('{broken'));
});
test('import preserves local edits, deduplicates and never evicts existing history',()=>{
    const local=C.correctShot(session(),'a',false),incoming=store([session(),session('s2')]);
    const merged=C.mergeBackup(store([local]),incoming);
    assert.equal(merged.added,1);assert.equal(merged.skipped,1);assert.equal(merged.history.find(s=>s.id==='s1').shots[0].made,false);
    const full=Array.from({length:30},(_,i)=>session('group'+i));
    assert.throws(()=>C.mergeBackup(store(full),incoming),/超過 30/);assert.equal(full.length,30);
});
test('import protects unfinished sessions and restores one into an empty device',()=>{
    const create=id=>C.createSession({id,playerCode:'P001',targetShots:10,now:start});
    assert.throws(()=>C.mergeBackup(store([],create('local')),store([],create('other'))),/未完成/);
    const merged=C.mergeBackup(store(),store([],create('restore')));
    assert.equal(merged.active.id,'restore');assert.equal(merged.added,1);
    assert.throws(()=>C.mergeBackup(store([session()]),store([],create('s1'))),/重複/);
});
test('framing guidance handles absent, occluded, cropped and visible selected-side landmarks',()=>{
    const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:.9}));
    assert.equal(G.check(null).ready,false);assert.equal(G.check([]).ready,false);
    assert.equal(G.check(landmarks).ready,true);
    landmarks[14].visibility=.1;assert.equal(G.check(landmarks).ready,false);assert.equal(G.check(landmarks,'left').ready,true);
    landmarks[14].visibility=.9;landmarks[28].x=.99;assert.match(G.check(landmarks).text,/移遠/);
    landmarks[28].x=NaN;assert.equal(G.check(landmarks).ready,false);
});
