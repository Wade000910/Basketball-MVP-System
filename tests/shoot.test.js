const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../shoot/engine.js');
const V=require('../shoot/voice.js');

// Synthetic side-view landmarks: right knee angle k and right elbow angle e, in degrees.
const rad=d=>d*Math.PI/180;
function landmarks(k,e,{armUp=true,vis=0.95}={}){
    const l=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:vis}));
    const put=(i,x,y)=>{l[i]={x,y,z:0,visibility:vis};};
    for(const [hip,knee,ankle,sh,el,wr] of [[24,26,28,12,14,16],[23,25,27,11,13,15]]){
        put(hip,0.5,0.5);put(knee,0.5,0.7);put(ankle,0.5+0.2*Math.sin(rad(k)),0.7-0.2*Math.cos(rad(k)));
        if(armUp){put(sh,0.5,0.3);put(el,0.5,0.2);put(wr,0.5+0.1*Math.sin(rad(e)),0.2+0.1*Math.cos(rad(e)));}
        else{put(sh,0.5,0.3);put(el,0.5,0.4);put(wr,0.5+0.1*Math.sin(rad(e)),0.4-0.1*Math.cos(rad(e)));}
    }
    return l;
}
const ramp=(t,t0,t1,a,b)=>t<=t0?a:t>=t1?b:a+(b-a)*(1-Math.cos(Math.PI*(t-t0)/(t1-t0)))/2;
// Knee: 170 -> dip to 120 -> extend to 175 (fastest at 850 ms). Elbow: 70 -> 178 (fastest at 975 ms).
const knee=t=>t<700?ramp(t,300,700,170,120):ramp(t,700,1000,120,175);
const elbow=t=>ramp(t,850,1100,70,178);
// Feeds a continuous timeline: idle standing, then shots starting at the given times.
function timeline(detector,{shots=[],end,fps=30,armUp=true,drop=()=>false}){
    const events=[];
    for(let t=0;t<=end;t+=1000/fps){
        const s=shots.find(s=>t>=s&&t<s+1600),local=s===undefined?0:t-s;
        const lm=drop(t)?null:landmarks(s===undefined?170:knee(local),s===undefined?70:elbow(local),{armUp});
        const r=detector.push({t,landmarks:lm});if(r)events.push({...r,at:t});
    }
    return events;
}

test('a synthetic free throw yields one accepted trial with both timing definitions',()=>{
    const d=E.createDetector();
    const out=timeline(d,{shots:[2000],end:5000});
    assert.equal(out.length,1);
    const t=out[0].trial;
    assert.equal(t.status,'accepted');
    assert.equal(t.timestampSource,'camera-frame');
    assert.equal(t.algorithmVersion,E.ALGORITHM_VERSION);
    assert.ok(t.dtPeak>95 && t.dtPeak<155,'peak interval near the true 125 ms, got '+t.dtPeak);
    assert.equal(t.dtPeak,t.events.elbowPeakPerfMs-t.events.kneePeakPerfMs);
    assert.ok(Math.abs(t.measuredFps-30)<1);
    // Feedback comes about 1 s after the recording ends, as on the research page.
    assert.ok(out[0].at-t.endT>1000 && out[0].at-t.endT<1100);
});
test('standing still never starts a trial',()=>{
    const d=E.createDetector();
    assert.equal(timeline(d,{end:5000}).length,0);
    assert.equal(d.state,'IDLE');
});
test('repeated or out-of-order camera frames are ignored',()=>{
    const d=E.createDetector();
    d.push({t:100,landmarks:landmarks(170,70)});
    assert.equal(d.push({t:100,landmarks:landmarks(120,70)}),null);
    assert.equal(d.push({t:50,landmarks:landmarks(120,70)}),null);
});
test('a shot inside the 2 s cooldown is not captured; the next one is',()=>{
    // Shot 1 at 2000 ends ~3100, feedback ~4100, cooldown to ~6100.
    const d=E.createDetector();
    const out=timeline(d,{shots:[2000,4600,8000],end:12000});
    assert.equal(out.length,2);
    assert.ok(out[1].trial.endT>8000);
});
test('losing the body after the arm is raised records an aborted trial at once',()=>{
    const d=E.createDetector();
    const out=timeline(d,{shots:[2000],end:5000,drop:t=>t>2950&&t<3300});
    assert.equal(out[0].trial.status,'aborted');
    assert.equal(out[0].trial.reasonCode,'POSE_LANDMARKS_MISSING');
    assert.ok(out[0].at<3000);
});
test('a squat without raising the arm is discarded, not recorded',()=>{
    const d=E.createDetector();
    assert.equal(timeline(d,{shots:[2000],end:5000,armUp:false}).length,0);
    assert.equal(d.state,'IDLE');
});
test('low frame rate marks the trial low quality',()=>{
    const d=E.createDetector();
    const out=timeline(d,{shots:[2000],end:5000,fps:15});
    assert.equal(out.length,1);
    assert.equal(out[0].trial.status,'low_quality');
    assert.match(out[0].trial.reasonCode,/LOW_FPS/);
});

test('personal reference needs five made shots and judges steadiness',()=>{
    assert.deepEqual(E.personalReference([100,110]),{ready:false,needed:3,count:2});
    const ref=E.personalReference([100,110,120,105,115]);
    assert.equal(ref.ready,true);assert.equal(ref.mean,110);assert.equal(ref.low,110-Math.max(ref.sd,15));
    assert.equal(E.judge(112,ref),'steady');
    assert.equal(E.judge(200,ref),'off');
    assert.equal(E.judge(null,ref),null);
    assert.equal(E.judge(100,E.personalReference([1])),null);
});
test('voice and teammate reports of the same shot count once',()=>{
    const log=E.createResultLog();
    log.trial({status:'accepted',dtPeak:120},1000);
    const first=log.result(true,'voice',2500);
    assert.equal(first.accepted,true);assert.equal(first.trial.dtPeak,120);
    assert.deepEqual(log.result(true,'teammate',3200),{accepted:false,reason:'duplicate'});
    assert.deepEqual(log.result(false,'teammate',3300),{accepted:false,reason:'conflict'});
    // A new trial in between means a new shot even if it is quick.
    log.trial({status:'accepted',dtPeak:130},4000);
    assert.equal(log.result(false,'manual',4500).trial.dtPeak,130);
});
test('a result long after the trial, or after an aborted trial, is not linked',()=>{
    const log=E.createResultLog();
    log.trial({status:'accepted'},0);
    assert.equal(log.result(true,'manual',20000).trial,null);
    log.trial({status:'aborted'},30000);
    assert.equal(log.result(true,'manual',31000).trial,null);
});
test('set summary separates made and missed timing',()=>{
    const session={shots:[{id:'a',made:true},{id:'b',made:false,source:'voice'},{id:'c',made:true}]};
    const run={trials:[{shotId:'a',trialStatus:'accepted',dtPeak:100},{shotId:'b',trialStatus:'accepted',dtPeak:160},{shotId:'c',trialStatus:'low_quality',dtPeak:90},{trialStatus:'invalid'}]};
    const s=E.setSummary(session,run);
    assert.equal(s.percentage,66.7);assert.equal(s.measured,2);
    assert.equal(s.madeMeanPeak,100);assert.equal(s.missedMeanPeak,160);
    assert.equal(s.rows[1].source,'voice');assert.equal(s.rows[2].dtPeak,null);
    assert.equal(s.unmatchedTrials,1);
});

test('voice parser hears miss phrases before make phrases',()=>{
    for(const t of ['沒進','沒有進','沒中','不進','打鐵','miss'])assert.equal(V.parse(t),false,t);
    for(const t of ['進','進球','進了','中','好球','空心','made','in'])assert.equal(V.parse(t),true,t);
    for(const t of ['','今天天氣很好我們去打球吧','我投進了嗎','教練'])assert.equal(V.parse(t),null,t);
    assert.equal(V.parse('近'),true,'common mis-hearing of 進');
    assert.deepEqual(V.fromAlternatives(['教練','進']),{made:true,heard:'進'});
});
test('voice listener restarts after the engine stops and reports denial',()=>{
    const created=[];
    class Fake{constructor(){created.push(this);}start(){this.started=(this.started||0)+1;}stop(){this.onend();}}
    const states=[];const results=[];
    const l=V.createListener({onResult:r=>results.push(r),onState:s=>states.push(s),scope:{webkitSpeechRecognition:Fake}});
    l.start();
    const rec=created[0];
    assert.equal(rec.lang,'zh-TW');
    const final=Object.assign([{transcript:'沒進'}],{isFinal:true});
    rec.onresult({resultIndex:0,results:[final]});
    assert.deepEqual(results,[{made:false,heard:'沒進'}]);
    rec.onerror({error:'not-allowed'});
    rec.onend();
    assert.deepEqual(states,['listening','denied','off']);
    assert.equal(V.createListener({onResult(){},scope:{}}),null);
});

const P=require('../shoot/practice.js');
const C=require('../training/core.js');
const A=require('../training/analysis-store.js');
const iso=s=>new Date(Date.parse('2026-11-05T08:00:00.000Z')+s*1000).toISOString();
const trialOf=(status,dtPeak)=>({status,reasonCode:status==='accepted'?'':'LOW_FPS',dt:status==='aborted'?null:dtPeak-40,dtPeak:status==='aborted'?null:dtPeak,measuredFps:29.5,timestampSource:'camera-frame',algorithmVersion:E.ALGORITHM_VERSION});

test('a practice set links each result to its trial and finishes into the training history',()=>{
    let p=P.newPractice({playerCode:'P001',targetShots:10,side:'right',sound:true,id:'set1',now:iso(0)});
    let r=P.addTrial(p,trialOf('accepted',120),iso(5));p=r.practice;
    p=P.addResult(p,{made:true,source:'voice',shotId:'s1',trialOrder:r.trialOrder,now:iso(7)});
    p=P.addResult(p,{made:false,source:'manual',shotId:'s2',now:iso(20)}); // motion not detected
    r=P.addTrial(p,trialOf('low_quality',150),iso(30));p=r.practice;
    p=P.addResult(p,{made:false,source:'teammate',shotId:'s3',trialOrder:r.trialOrder,now:iso(31)});
    assert.equal(p.run.trials[0].shotId,'s1');assert.equal(p.run.trials[1].shotId,'s3');
    assert.equal(p.run.condition,'auditory');
    p=P.correct(p,'s3',true);
    assert.deepEqual(P.restore(JSON.stringify(p)),p);
    const before=JSON.stringify({schemaVersion:C.SCHEMA,active:null,history:[C.demoSession&&C.finishSession(C.addShot(C.createSession({playerCode:'P001',targetShots:1,id:'old',now:iso(-9000)}),true,'o1',iso(-8990)),iso(-8980))]});
    const out=P.finish(p,before,null,iso(60));
    const store=C.parseStore(out.training);
    assert.deepEqual(store.history.map(s=>s.id),['set1','old']);
    assert.deepEqual(store.history[0].shots.map(s=>s.source),['voice',undefined,'corrected']);
    const runs=A.parse(out.analysis);
    assert.equal(runs[0].trials.length,2);assert.equal(runs[0].stoppedAt,iso(60));
    assert.throws(()=>P.finish(p,out.training,out.analysis,iso(61)),/存過/);
    // The training page and the coach pair by the explicit links.
    const pairs=A.pair(store.history[0].shots,runs);
    assert.deepEqual(pairs.map(x=>x.trial?.trialOrder ?? null),[1,null,2]);
    assert.deepEqual(P.pastMadePeaks('P001',out.training,out.analysis),[120]);
});
test('practice rejects tampered or mismatched data',()=>{
    const p=P.newPractice({playerCode:'P001',targetShots:10,side:'left',sound:false,id:'set2',now:iso(0)});
    assert.equal(p.run.condition,'visual');
    assert.throws(()=>P.restore(JSON.stringify({...p,run:{...p.run,participantId:'OTHER'}})));
    assert.throws(()=>P.restore(JSON.stringify({...p,lastMarkId:-1})));
    assert.throws(()=>P.addResult(p,{made:true,source:'guess',shotId:'x',now:iso(1)}));
    assert.throws(()=>P.finish(p,null,null,iso(2)),/至少記錄一球/);
});
