const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../training/analysis-store.js');
const C=require('../training/core.js');

const base=Date.parse('2026-11-03T08:00:00.000Z');
const at=s=>new Date(base+s*1000).toISOString();
const trial=(order,sec,dt,status='accepted')=>({trialOrder:order,trialStatus:status,dt:status==='accepted'?dt:null,timestamp:at(sec),reasonCode:status==='accepted'?'':'X'});
const run=(trials,condition='auditory',id='run1')=>({schemaVersion:A.SCHEMA,id,participantId:'P001',sessionId:'s1',blockId:'B01',condition,shootingSide:'right',startedAt:at(0),stoppedAt:at(300),trials});
const shot=(id,sec,made)=>({id,made,recordedAt:at(sec)});

test('each shot pairs with its own motion trial',()=>{
    const pairs=A.pair([shot('a',13,true),shot('b',33,false),shot('c',53,true)],[run([trial(1,10,80),trial(2,30,120),trial(3,50,95)])]);
    assert.deepEqual(pairs.map(p=>p.trial.trialOrder),[1,2,3]);
    assert.deepEqual(pairs.map(p=>p.trial.lagMs),[3000,3000,3000]);
});
test('a spurious extra trial is skipped instead of shifting later pairs',()=>{
    const pairs=A.pair([shot('a',13,true),shot('b',33,false)],[run([trial(1,10,80),trial(2,25,999,'invalid'),trial(3,30,120)])]);
    assert.deepEqual(pairs.map(p=>p.trial.trialOrder),[1,3]);
});
test('a shot without a detected motion stays unpaired and does not steal the next trial',()=>{
    const pairs=A.pair([shot('a',13,true),shot('b',33,false),shot('c',53,true)],[run([trial(1,10,80),trial(3,50,95)])]);
    assert.equal(pairs[0].trial.trialOrder,1);
    assert.equal(pairs[1].trial,null);
    assert.equal(pairs[2].trial.trialOrder,3);
});
test('one trial is never paired with two shots, and late taps beyond the window are unpaired',()=>{
    const pairs=A.pair([shot('a',12,true),shot('b',14,false),shot('c',80,true)],[run([trial(1,10,80),trial(2,60,90)])]);
    assert.equal(pairs[0].trial.trialOrder,1);
    assert.equal(pairs[1].trial,null);
    assert.equal(pairs[2].trial,null);
});
test('a tap slightly before the trial stamp still pairs within the lead window',()=>{
    const pairs=A.pair([shot('a',9,true)],[run([trial(1,10,80)])]);
    assert.equal(pairs[0].trial.lagMs,-1000);
    assert.equal(A.pair([shot('a',6,true)],[run([trial(1,10,80)])])[0].trial,null);
});
test('pairs return in the original shot order even if taps were recorded out of order',()=>{
    const pairs=A.pair([shot('late',33,false),shot('early',13,true)],[run([trial(1,10,80),trial(2,30,120)])]);
    assert.deepEqual(pairs.map(p=>p.shotId),['late','early']);
    assert.deepEqual(pairs.map(p=>p.trial.trialOrder),[2,1]);
});
test('summary separates made and missed timing and keeps baseline and excluded trials out',()=>{
    const pairs=A.pair([shot('a',13,true),shot('b',33,true),shot('c',53,false),shot('d',73,false)],
        [run([trial(1,10,80),trial(2,30,100),trial(3,50,150),trial(4,70,0,'low_quality')])]);
    const s=A.pairedSummary(pairs);
    assert.equal(s.paired,4);assert.equal(s.usable,3);
    assert.deepEqual(s.made,{count:2,meanDt:90,sdDt:14.1});
    assert.deepEqual(s.missed,{count:1,meanDt:150,sdDt:null});
    const blind=A.pairedSummary(A.pair([shot('a',13,true)],[run([trial(1,10,80)],'baseline')]));
    assert.equal(blind.paired,1);assert.equal(blind.usable,0);assert.equal(blind.made.meanDt,null);
});
test('CSV keeps original columns first and appends paired motion status and timing',()=>{
    let s=C.createSession({playerCode:'P001',targetShots:10,id:'s1',now:at(0)});
    s=C.addShot(s,true,'a',at(13));s=C.addShot(s,false,'b',at(33));
    s={...C.finishSession(s,at(60)),analysisRuns:[run([trial(1,10,80)])]};
    const rows=C.csv(s).replace('﻿','').split('\r\n');
    assert.match(rows[0],/^sessionId,playerCode,drill,inputSource,isDemo,shotOrder,made,recordedAt,position,motionStatus,motionDtMs$/);
    assert.match(rows[1],/"accepted","80"$/);
    assert.match(rows[2],/"unpaired",""$/);
    const blind=C.csv({...s,analysisRuns:[run([trial(1,10,80)],'baseline')]}).split('\r\n')[1];
    assert.match(blind,/"accepted",""$/);
});
test('fast cadence: a tap soon after the next release still pairs with its own shot',()=>{
    // Releases every 5 s; trials stamped 1 s after release; taps 3 s after release.
    const trials=[0,5,10,15].map((r,i)=>trial(i+1,r+1,80+i));
    const shots=[0,5,10,15].map((r,i)=>shot('s'+i,r+3,i%2===0));
    assert.deepEqual(A.pair(shots,[run(trials)]).map(p=>p.trial.trialOrder),[1,2,3,4]);
});
test('rapid taps recorded milliseconds apart still align one-to-one in order',()=>{
    const shots=[shot('a',10,true),shot('b',10.01,true),shot('c',10.02,false)];
    const trials=[trial(1,8,90),trial(2,8.01,110),trial(3,8.02,170)];
    assert.deepEqual(A.pair(shots,[run(trials)]).map(p=>p.trial.dt),[90,110,170]);
});
test('pairing stays fast for a full 200-shot set',()=>{
    const trials=Array.from({length:200},(_,i)=>trial(i+1,i*6+1,100));
    const shots=Array.from({length:200},(_,i)=>shot('s'+i,i*6+3,true));
    const start=Date.now();const pairs=A.pair(shots,[run(trials)]);
    assert.equal(pairs.filter(p=>p.trial).length,200);
    assert.ok(Date.now()-start<500,'alignment too slow');
});
