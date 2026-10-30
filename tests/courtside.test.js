const test=require('node:test'),assert=require('node:assert/strict'),C=require('../training/core.js');
const start='2026-10-30T01:00:00Z';
function group({id='s1',position='left',drill='three_point',playerCode='P001',made=1,total=2,day=1,isDemo=false}={}){
    const now=new Date(Date.parse(start)+day*86400000).toISOString();
    let s=C.createSession({id,position,drill,playerCode,targetShots:10,now,isDemo});
    for(let i=0;i<total;i++)s=C.addShot(s,i<made,'shot'+i,now);
    return C.finishSession(s,now);
}
test('position validation preserves legacy records without guessing non-free-throw locations',()=>{
    for(const position of ['left','center','right','unspecified'])assert.equal(group({position}).position,position);
    for(const position of ['bad','toString',3,null])assert.throws(()=>group({position}));
    assert.throws(()=>group({drill:'free_throw',position:'left'}));
    const old=group();delete old.position;
    assert.equal(C.positionOf(old),'unspecified');assert.equal(C.parseStore(JSON.stringify({schemaVersion:C.SCHEMA,active:null,history:[old]})).history[0].position,undefined);
    const free=group({drill:'free_throw',position:'center'});delete free.position;
    assert.equal(C.positionOf(free),'center');assert.equal(C.parseBackup(JSON.stringify(free)).history[0].position,'center');
});
test('position survives correction, undo, CSV, JSON backup and import',()=>{
    const s=group({position:'right'}),correct=C.correctShot(s,'shot1',true),removed=C.removeShot(correct,'shot0');
    assert.equal(removed.position,'right');assert.equal(C.summarize(removed).percentage,100);
    assert.match(C.csv(removed),/recordedAt,position/);assert.match(C.csv(removed),/,"right"/);
    const report=C.parseBackup(JSON.stringify(removed));
    const imported=C.mergeBackup({schemaVersion:C.SCHEMA,active:null,history:[]},report);
    assert.equal(imported.history[0].position,'right');
});
test('previous session compares the same position and keeps unknown legacy groups separate',()=>{
    const left=group({id:'left',day:1}),right=group({id:'right',position:'right',day:2}),current=group({id:'current',day:3});
    assert.equal(C.previousSession(current,[left,right]).id,'left');
    delete left.position;assert.equal(C.previousSession(current,[left,right]),null);
});
test('trend orders the latest ten completed non-demo groups and isolates player, drill and position',()=>{
    const groups=Array.from({length:12},(_,i)=>group({id:'s'+i,day:i+1,total:1,made:i%2}));
    const other=[group({id:'other',playerCode:'OTHER'}),group({id:'type',drill:'mid_range'}),group({id:'right',position:'right'}),group({id:'demo',isDemo:true})];
    const active={...groups[0],id:'active',finishedAt:null},empty={...groups[0],id:'empty',shots:[]};
    const result=C.trend([...other,...groups.reverse(),active,empty],'P001','three_point','left');
    assert.equal(result.points.length,10);assert.equal(result.points[0].id,'s2');assert.equal(result.points[9].id,'s11');
    assert.equal(result.points[0].percentage,0);assert.equal(result.points[1].percentage,100);
    assert.equal(C.trend(other,'P001','three_point','all').points.length,1);
    assert.equal(C.trend(groups,'EMPTY','three_point').points.length,0);
    assert.throws(()=>C.trend(groups,'P001','bad'));assert.throws(()=>C.trend(groups,'P001','three_point','bad'));
});
test('position totals use weighted shot counts and updates reflect manual edits',()=>{
    const one=group({id:'one',made:1,total:1}),three=group({id:'three',made:0,total:3}),unknown=group({id:'old',position:'unspecified',made:1,total:1});
    let result=C.trend([one,three,unknown],'P001','three_point');
    assert.equal(result.positions.find(p=>p.id==='left').percentage,25);assert.equal(result.positions.find(p=>p.id==='unspecified').total,1);
    result=C.trend([one,C.correctShot(three,'shot0',true),unknown],'P001','three_point');
    assert.equal(result.positions.find(p=>p.id==='left').percentage,50);
    assert.equal(result.positions.find(p=>p.id==='right').percentage,null);
});
