const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../training/core.js');
const fs=require('node:fs');
const start='2026-10-30T01:00:00.000Z',end='2026-10-30T01:05:00.000Z';
const create=(changes={})=>C.createSession({playerCode:'P001',targetShots:10,id:'one',now:start,...changes});

test('training validates setup and reports an empty rate as unavailable',()=>{
    for(const playerCode of ['', 'real name', '=formula', 'x'.repeat(33)])assert.throws(()=>create({playerCode}));
    for(const targetShots of [0,201,1.5,NaN])assert.throws(()=>create({targetShots}));
    assert.throws(()=>create({note:'x'.repeat(301)}));
    assert.equal(C.summarize(create()).percentage,null);
    assert.throws(()=>C.finishSession(create(),end),/至少/);
});
test('manual shot correction and deletion recalculate the report without mutating prior data',()=>{
    const original=create();let s=C.addShot(original,true,'a',start);s=C.addShot(s,false,'b',start);
    assert.equal(original.shots.length,0);
    assert.equal(C.summarize(s).percentage,50);
    s=C.finishSession(s,end);const previous=s;
    s=C.correctShot(s,'b',true);assert.equal(C.summarize(s).percentage,100);assert.equal(previous.shots[1].made,false);
    s=C.removeShot(s,'a');assert.equal(C.summarize(s).total,1);
    assert.throws(()=>C.addShot(s,true,'c'),/已結束/);
    assert.throws(()=>C.correctShot(s,'missing',false));
});
test('target completion is independent of the actual count and preserves partial sessions',()=>{
    let s=create({targetShots:1});s=C.addShot(s,false,'a',start);s=C.addShot(s,true,'b',start);
    assert.equal(C.summarize(s).total,2);assert.equal(C.summarize(s).remaining,0);
    assert.equal(C.summarize(C.finishSession(s,end)).targetReached,true);
    const partial=C.finishSession(C.addShot(create(),true,'a',start),end);
    assert.equal(C.summarize(partial).remaining,9);
});
test('duplicate and malformed shots are rejected and the 200-shot cap is enforced',()=>{
    let s=C.addShot(create(),true,'a',start);
    assert.throws(()=>C.addShot(s,false,'a',start));
    assert.throws(()=>C.addShot(s,true,3,start));
    assert.throws(()=>C.addShot(s,'made','b',start));
    for(let i=1;i<200;i++)s=C.addShot(s,false,'shot-'+i,start);
    assert.throws(()=>C.addShot(s,true,'overflow',start),/200/);
});
test('history comparison isolates player, drill, chronology and synthetic data',()=>{
    const previous=C.finishSession(C.addShot(create({id:'previous'}),true,'a',start),end);
    const current=create({id:'current',now:'2026-10-31T01:00:00Z'});
    const other={...previous,id:'other',playerCode:'P002'};
    assert.equal(C.previousSession(current,[other,C.demoSession(),previous,current]).id,'previous');
    assert.equal(C.previousSession(current,[other,C.demoSession(),current]),null);
});
test('persistent storage round trips an unfinished session and rejects synthetic or corrupt histories',()=>{
    const active=C.addShot(create(),false,'a',start);
    const store={schemaVersion:C.SCHEMA,active,history:[]};
    assert.deepEqual(C.parseStore(JSON.stringify(store)).active,active);
    assert.throws(()=>C.parseStore('{bad json'));
    assert.throws(()=>C.parseStore(JSON.stringify({...store,history:[active]})));
    assert.throws(()=>C.parseStore(JSON.stringify({...store,active:C.demoSession()})));
    const finished=C.finishSession(active,end);
    assert.throws(()=>C.parseStore(JSON.stringify({...store,active:null,history:[finished,finished]})));
    assert.throws(()=>C.validateSession({...active,shots:[{id:'bad',made:'yes',recordedAt:start}]}));
});
test('demo report remains explicitly synthetic and CSV carries the source',()=>{
    const demo=C.demoSession(),stats=C.summarize(demo);
    assert.equal(stats.total,10);assert.equal(stats.made,7);assert.equal(stats.percentage,70);
    assert.equal(demo.isDemo,true);
    assert.match(C.csv(demo),/"manual","true"/);
    assert.equal(C.csv(demo).split('\r\n').length,11);
});
test('training entry references real local assets and all application element IDs exist',()=>{
    const html=fs.readFileSync('training/index.html','utf8'),js=fs.readFileSync('training/app.js','utf8');
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length);
    for(const [,id] of js.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),'Missing element '+id);
    for(const asset of ['core.js','app.js','styles.css'])assert.ok(fs.existsSync('training/'+asset));
    assert.match(fs.readFileSync('index.html','utf8'),/href="\.\/training\/"/);
    assert.doesNotMatch(js,/innerHTML|\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
});

test('shooting types preserve old free-throw records and isolate comparisons',()=>{
    assert.equal(create().drill,'free_throw');
    for(const drill of ['free_throw','mid_range','three_point']) {
        const s=C.finishSession(C.addShot(create({drill,id:drill}),true,'a',start),end);
        assert.equal(C.parseStore(JSON.stringify({schemaVersion:C.SCHEMA,active:s,history:[s]})).active.drill,drill);
        assert.match(C.csv(s),new RegExp(drill));
    }
    assert.throws(()=>create({drill:'toString'}));
    const old=C.finishSession(C.addShot(create(),true,'a',start),end);
    assert.equal(C.previousSession(create({drill:'three_point',now:end}),[old]),null);
});

test('player progress uses weighted rates and excludes demos, other players and unfinished groups',()=>{
    const one=C.finishSession(C.addShot(create(),true,'a',start),end);
    let two=create({id:'two'});for(let i=0;i<3;i++)two=C.addShot(two,false,'b'+i,start);
    two=C.finishSession(two,end);
    const other={...one,id:'other',playerCode:'P002'};
    const old={...one,id:'old',drill:'three_point',startedAt:'2026-09-01T00:00:00Z',finishedAt:'2026-09-01T00:05:00Z'};
    const data=C.progress([one,two,other,old,create(),C.demoSession()],'P001',new Date('2026-10-30T12:00:00Z'));
    assert.equal(data.sessions,3);assert.equal(data.recentSessions,2);assert.equal(data.recentShots,4);
    assert.equal(data.drills[0].percentage,25);assert.equal(data.drills[1].percentage,null);
    assert.equal(data.drills[2].percentage,100);
    assert.equal(C.progress([], 'NEW').recentShots,0);
});

test('analysis entry pre-fills only valid training identifiers without starting the camera',()=>{
    const vm=require('node:vm'),script=fs.readFileSync('專題程式/training-entry.js','utf8');
    function run(search){
        const elements={participant_id:{value:''},session_id:{value:''},block_id:{value:''},'training-context':{textContent:''}};
        vm.runInNewContext(script,{URLSearchParams,window:{location:{search}},document:{getElementById:id=>elements[id]}});
        return elements;
    }
    const valid=run('?from=training&player=P001&session=abc-123');
    assert.equal(valid.participant_id.value,'P001');assert.equal(valid.session_id.value,'abc-123');assert.equal(valid.block_id.value,'B01');
    assert.match(valid['training-context'].textContent,/尚未自動配對/);
    for(const query of ['', '?player=P001&session=abc', '?from=training&player=%3Cscript%3E&session=abc','?from=training&player=P001&session='+ 'x'.repeat(81)]) {
        assert.equal(run(query).participant_id.value,'');
    }
    const html=fs.readFileSync('專題程式/index.html','utf8');
    assert.match(html,/href="\.\.\/training\/"/);assert.match(html,/src="\.\/training-entry.js"/);
});
