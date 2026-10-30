const test=require('node:test'),assert=require('node:assert/strict'),C=require('../training/core.js');
const start='2026-10-30T01:00:00Z',end='2026-10-30T01:05:00Z';
const steps=[{sessionId:'g1',drill:'free_throw',position:'center',targetShots:10,note:'準備動作'},{sessionId:'g2',drill:'mid_range',position:'left',targetShots:20,note:''},{sessionId:'g3',drill:'three_point',position:'right',targetShots:20,note:''}];
const create=(changes={})=>C.createPlan({id:'plan1',name:'今天訓練',playerCode:'P001',steps,now:start,...changes});
const store=(plan,active,history=[])=>({schemaVersion:C.SCHEMA,plan,active,history});
function completeFirst(){const s=create();return C.completePlanStep(s.plan,C.addShot(s.active,true,'a',start),end);}
test('plan validates bounded unique groups and starts the correct first session',()=>{
    const s=create();assert.equal(s.active.planId,'plan1');assert.equal(s.active.planStep,1);assert.equal(s.active.targetShots,10);assert.equal(s.plan.currentIndex,0);
    for(const changes of [{steps:[]},{steps:Array.from({length:11},(_,i)=>({...steps[0],sessionId:'a'+i}))},{steps:[steps[0],steps[0]]},{steps:[{...steps[0],targetShots:201}]},{name:''},{id:'=formula'},{playerCode:'<script>'}])assert.throws(()=>create(changes));
});
test('finish advances once with settings intact and blocks zero-shot or wrong-session advancement',()=>{
    const s=create();assert.throws(()=>C.completePlanStep(s.plan,s.active,end),/至少/);
    const next=completeFirst();assert.equal(next.plan.currentIndex,1);assert.equal(next.active.id,'g2');assert.equal(next.active.position,'left');assert.equal(next.active.targetShots,20);assert.equal(next.active.shots.length,0);assert.equal(s.plan.currentIndex,0);
    assert.throws(()=>C.completePlanStep(next.plan,next.finished,end),/不屬於/);
    assert.equal(C.parseStore(JSON.stringify(store(next.plan,next.active,[next.finished]))).plan.currentIndex,1);
});
test('completed plan preserves per-group reports and weighted totals',()=>{
    let s=create();
    for(let i=0;i<3;i++){let active=s.active;for(let j=0;j<=i;j++)active=C.addShot(active,j===0,'shot'+j,end);s=C.completePlanStep(s.plan,active,end);}
    assert.equal(s.plan.status,'completed');assert.equal(s.plan.currentIndex,3);assert.equal(s.plan.endedAt,end);
    assert.deepEqual(C.planSummary(s.plan),{completed:3,groups:3,total:6,made:3,percentage:50,target:50});
    assert.throws(()=>C.completePlanStep(s.plan,s.active,end));assert.match(C.csv(s.active),/,"plan1","3"/);
});
test('stop keeps finished reports and rejects impossible progress, dates and ownership',()=>{
    const s=completeFirst(),stopped=C.stopPlan(s.plan,end);assert.equal(stopped.status,'stopped');assert.equal(stopped.reports.length,1);assert.equal(C.planSummary(stopped).total,1);
    assert.throws(()=>C.stopPlan(stopped,end));assert.throws(()=>C.stopPlan(s.plan,'2020-01-01'));
    for(const changed of [{...s.plan,currentIndex:2},{...s.plan,status:'completed',endedAt:end},{...s.plan,reports:[{...s.finished,playerCode:'OTHER'}]},{...s.plan,reports:[{...s.finished,planStep:2}]}])assert.throws(()=>C.normalizePlan(changed));
    assert.throws(()=>C.parseStore(JSON.stringify(store(s.plan,{...s.active,id:'wrong'},[]))));
});
test('plan backups round trip mid-plan and completed data without losing linkage',()=>{
    const s=completeFirst(),original=store(s.plan,s.active,[s.finished]),backup={schemaVersion:'basketball-training-backup-v1',store:original};
    const incoming=C.parseBackup(JSON.stringify(backup));assert.deepEqual(incoming,original);
    const restored=C.mergeBackup({schemaVersion:C.SCHEMA,active:null,history:[]},incoming);assert.equal(restored.plan.currentIndex,1);assert.equal(restored.active.id,'g2');assert.equal(restored.history.length,1);
    const replaced=C.mergeBackup({schemaVersion:C.SCHEMA,active:s.finished,history:[s.finished]},incoming);assert.equal(replaced.active.id,'g2');assert.equal(replaced.history.length,1);
});
test('import rejects conflicting plans and preserves device progress when the same plan is reimported',()=>{
    const s=completeFirst(),current=store(s.plan,s.active,[s.finished]),other=create({id:'other'});
    assert.throws(()=>C.mergeBackup(current,store(other.plan,other.active)),/未完成|計畫/);
    const original=create(),merged=C.mergeBackup(current,store(original.plan,original.active));assert.equal(merged.plan.currentIndex,1);assert.equal(merged.active.id,'g2');
});
