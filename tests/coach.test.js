const test=require('node:test');
const assert=require('node:assert/strict');
const Coach=require('../coach/core.js');
const DAY=86400000,now=new Date('2026-11-03T12:00:00.000Z');
const ago=(d,h=0)=>new Date(now.getTime()-d*DAY-h*3600000).toISOString();
const session=(userId,id,daysAgo,drill,results,finished=true)=>({id,userId,drill,startedAt:ago(daysAgo),finishedAt:finished?ago(daysAgo,-1):null,
    shots:results.map((made,i)=>({id:id+i,made,recordedAt:ago(daysAgo,-i/100)}))});
const roster=[{user_id:'c',display_name:'教練',role:'coach'},{user_id:'a',display_name:'甲',role:'player'},{user_id:'b',display_name:'乙',role:'player'},{user_id:'z',display_name:'丙',role:'player'}];

test('team report counts recent work, uses total makes over total shots and flags inactive players',()=>{
    const sessions=[session('a','a1',1,'free_throw',[true,true,false]),session('a','a2',2,'free_throw',[true]),
        session('a','a3',20,'three_point',[false,false,true]),session('b','b1',10,'free_throw',[true,false]),
        session('b','b2',0,'free_throw',[true],false),session('x','x1',1,'free_throw',[true,true])];
    const r=Coach.teamReport(roster,sessions,now);
    assert.equal(r.team.players,3,'coach is not counted as a player');
    assert.equal(r.team.active7,1);assert.equal(r.team.shots7,4);assert.equal(r.team.sessions7,2);
    const a=r.players.find(p=>p.userId==='a');
    assert.deepEqual(a.byDrill.free_throw,{made:3,total:4,percentage:75});
    assert.equal(a.overall.percentage,57.1);
    assert.equal(r.team.byDrill.free_throw.total,6,'unfinished sets and non-members are excluded');
    assert.deepEqual(r.inactive.map(p=>[p.name,p.daysSince]),[['乙',10],['丙',null]]);
    assert.equal(r.players[0].userId,'a','most active first');
});
test('weekly buckets end today and keep empty weeks visible',()=>{
    const r=Coach.teamReport(roster,[session('a','a1',0,'free_throw',[true,false]),session('a','a2',8,'mid_range',[true])],now,{weeks:4});
    assert.deepEqual(r.team.weekly.map(w=>w.total),[0,0,1,2]);
    assert.equal(r.team.weekly[0].percentage,null);
});
test('motion summary pairs free-throw shots with camera trials',()=>{
    const s=session('a','a1',1,'free_throw',[true,false]);
    s.analysisRuns=[{schemaVersion:'basketball-analysis-run-v1',id:'r',participantId:'P',sessionId:'a1',blockId:'B01',condition:'visual',shootingSide:'right',startedAt:s.startedAt,stoppedAt:s.finishedAt,
        trials:s.shots.map((x,i)=>({trialOrder:i+1,trialStatus:'accepted',dt:i?150:90,timestamp:new Date(Date.parse(x.recordedAt)-2000).toISOString(),reasonCode:''}))}];
    const m=Coach.teamReport(roster,[s],now).players.find(p=>p.userId==='a').motion;
    assert.equal(m.usable,2);assert.equal(m.made.meanDt,90);assert.equal(m.missed.meanDt,150);
});
test('demo data is deterministic, valid and clearly labelled synthetic',()=>{
    const A=Coach.demoData(now),B=Coach.demoData(now);
    assert.deepEqual(A,B);
    assert.match(A.team.name,/合成/);
    const C=require('../training/core.js');
    for(const s of A.sessions){const {userId,...rest}=s;C.validateSession(rest);}
    const r=Coach.teamReport(A.roster,A.sessions,now);
    assert.equal(r.players.length,6);
    assert.ok(r.inactive.length>=1,'demo shows the check-in list');
    assert.ok(r.players[0].motion.usable>20,'demo shows motion timing');
});
