const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const M=require('../專題程式/motion-core.js');
const logistic=x=>1/(1+Math.exp(-x));

// Clean known-answer shot sampled at `fps`: knee peak velocity at 500 ms, elbow at 620 ms.
function shot(fps,{filter=false}={}){
    const knee=t=>110+60*logistic((t-500)/50),elbow=t=>70+105*logistic((t-620)/30);
    const fk=new M.ButterworthFilter(10,fps),fe=new M.ButterworthFilter(10,fps);
    const out=[];
    for(let t=0;t<=900;t+=1000/fps){const kn=knee(t),eb=elbow(t);out.push({t,kn:filter?fk.filter(kn):kn,eb:filter?fe.filter(eb):eb});}
    return out.filter(s=>s.t>=250);
}
test('clean signals give the true peak timing within a few milliseconds',()=>{
    for(const fps of [28,60]){
        const r=M.detectTiming(shot(fps));
        assert.ok(!r.reason,r.reason);
        assert.ok(Math.abs(r.events.kneePeakPerfMs-500)<=3,'knee '+r.events.kneePeakPerfMs);
        assert.ok(Math.abs(r.events.elbowPeakPerfMs-620)<=3,'elbow '+r.events.elbowPeakPerfMs);
        assert.equal(r.dt,r.events.elbowOnsetPerfMs-r.events.kneePeakPerfMs);
        assert.ok(r.events.elbowOnsetPerfMs<r.events.elbowPeakPerfMs);
    }
});
test('the causal filter delays events; the zero-phase filter does not',()=>{
    const raw=shot(30),causal=M.detectTiming(shot(30,{filter:true}));
    const zp=(k)=>M.zeroPhaseFilter(raw.map(s=>s[k]),10,30);
    const kn=zp('kn'),eb=zp('eb'),zero=M.detectTiming(raw.map((s,i)=>({t:s.t,kn:kn[i],eb:eb[i]})));
    assert.ok(causal.events.elbowPeakPerfMs>622,'causal filter should lag');
    assert.ok(Math.abs(zero.events.elbowPeakPerfMs-620)<=4,'zero-phase '+zero.events.elbowPeakPerfMs);
});
test('zero-phase filter keeps length, passes constants and short inputs unchanged',()=>{
    assert.deepEqual(M.zeroPhaseFilter([5,5,5,5,5,5],10,30).map(v=>Math.round(v*1e9)/1e9),[5,5,5,5,5,5]);
    assert.deepEqual(M.zeroPhaseFilter([1,2],10,30),[1,2]);
    assert.equal(M.zeroPhaseFilter(Array.from({length:40},(_,i)=>i),10,30).length,40);
});
test('angle helper and filter clamp keep their documented behaviour',()=>{
    assert.equal(Math.round(M.calculateAngle({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:1,z:0})),90);
    const f=new M.ButterworthFilter(10,15);                 // cutoff above Nyquist is clamped
    assert.ok([f.b0,f.a1,f.a2].every(Number.isFinite));
});
test('the analysis page uses the shared module instead of an inline copy',()=>{
    const html=fs.readFileSync(path.join(__dirname,'../專題程式/index.html'),'utf8');
    assert.match(html,/<script src="\.\/motion-core\.js"><\/script>/);
    assert.match(html,/MotionCore\.detectTiming\(shotData,createSpline\)/);
    for(const stale of ['class ButterworthFilter','function createSpline','function calculateAngle'])assert.ok(!html.includes(stale),'inline '+stale+' remains');
});

// Field test 2026-11-25 (240 fps footage): a free throw has a deep gather dip long before the shot, and its
// rebound can be the fastest knee extension in the whole window while the knee drive that belongs to the shot
// is shallow. The knee event is searched only in the KNEE_WINDOW_MS before the elbow peak.
test('a fast early gather rebound does not become the knee event of the shot',()=>{
    const knee=t=>110+55*logistic((t-300)/25)-30*logistic((t-700)/60)+30*logistic((t-1000)/90);   // big rebound at 300, small drive at ~1000
    const elbow=t=>70+105*logistic((t-1100)/30);
    const data=[];for(let t=0;t<=1500;t+=1000/60)data.push({t,kn:knee(t),eb:elbow(t)});
    const r=M.detectTiming(data);
    assert.ok(!r.reason,r.reason);
    assert.ok(Math.abs(r.events.kneePeakPerfMs-1000)<=30,'knee '+r.events.kneePeakPerfMs);
    assert.ok(r.dt<=M.KNEE_WINDOW_MS+1,'dt '+r.dt);
});
test('the knee window is exported and a knee peak at the elbow peak is still allowed',()=>{
    assert.equal(M.KNEE_WINDOW_MS,400);
    const knee=t=>110+60*logistic((t-620)/30),elbow=t=>70+105*logistic((t-620)/30);
    const data=[];for(let t=250;t<=900;t+=1000/60)data.push({t,kn:knee(t),eb:elbow(t)});
    const r=M.detectTiming(data);
    assert.ok(!r.reason,r.reason);
    assert.ok(Math.abs(r.events.kneePeakPerfMs-620)<=30,'knee '+r.events.kneePeakPerfMs);
});
