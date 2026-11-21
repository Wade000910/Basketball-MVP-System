const test=require('node:test');
const assert=require('node:assert/strict');
const Cloud=require('../shared/cloud.js');
const C=require('../training/core.js');
const at=s=>new Date(Date.parse('2026-11-03T08:00:00.000Z')+s*1000).toISOString();
function session(id,startSec,{finished=true,drill='free_throw',runs}={}){
    let s=C.createSession({playerCode:'P001',targetShots:10,id,drill,now:at(startSec)});
    s=C.addShot(s,true,id+'-a',at(startSec+10));s=C.addShot(s,false,id+'-b',at(startSec+20));
    if(finished)s=C.finishSession(s,at(startSec+60));
    if(runs)s={...s,analysisRuns:runs};
    return s;
}

test('a session survives the trip to a cloud row and back unchanged',()=>{
    const run={schemaVersion:'basketball-analysis-run-v1',id:'r1',participantId:'P001',sessionId:'s1',blockId:'B01',condition:'auditory',shootingSide:'right',startedAt:at(0),stoppedAt:at(60),trials:[{trialOrder:1,trialStatus:'accepted',dt:90,timestamp:at(8),reasonCode:''}]};
    const original=session('s1',0,{runs:[run]});
    const row=Cloud.toRow(original,'user-1');
    assert.equal(row.user_id,'user-1');assert.equal(row.position,'center');assert.equal(row.shots.length,2);
    assert.ok(!('made_shots' in row) && !('total_shots' in row),'server-derived counts are not sent');
    const back=Cloud.fromRow({...row,started_at:'2026-11-03 16:00:00+08',finished_at:row.finished_at});
    assert.equal(back.startedAt,original.startedAt);
    assert.deepEqual(C.cleanSession(back),C.cleanSession(original));
});
test('demo sessions are never uploaded',()=>{
    assert.throws(()=>Cloud.toRow(C.demoSession(),'u'),/示範/);
    const rows=Cloud.uploadRows({active:C.demoSession(),history:[session('h1',0)]},'u');
    assert.deepEqual(rows.map(r=>r.id),['h1']);
});
test('upload includes the unfinished active session and attaches motion summaries',()=>{
    const rows=Cloud.uploadRows({active:session('live',500,{finished:false}),history:[session('h1',0)]},'u',s=>({...s,analysisRuns:s.id==='h1'?[{id:'x'}]:[]}));
    assert.deepEqual(rows.map(r=>r.id),['live','h1']);
    assert.equal(rows[0].finished_at,null);assert.deepEqual(rows[1].analysis_runs,[{id:'x'}]);
});
test('restoring keeps the device copy, ignores unfinished remote sets and respects the local limit',()=>{
    const localEdit={...session('same',0),note:'edited here'};
    const remote=[{...session('same',0),note:'old cloud copy'},session('new',100),session('open',200,{finished:false})];
    const {store,restored}=Cloud.mergeRemote({active:null,history:[localEdit]},remote);
    assert.equal(restored,1);
    assert.deepEqual(store.history.map(s=>s.id),['new','same']);
    assert.equal(store.history.find(s=>s.id==='same').note,'edited here');
    const many=Array.from({length:35},(_,i)=>session('r'+i,i*100));
    const capped=Cloud.mergeRemote({active:null,history:[]},many);
    assert.equal(capped.store.history.length,Cloud.LOCAL_LIMIT);
    assert.equal(capped.restored,Cloud.LOCAL_LIMIT);
    assert.equal(capped.store.history[0].id,'r34');
});
test('cloud errors are explained in plain language',()=>{
    assert.match(Cloud.friendlyError(new Error('Invalid login credentials')),/密碼不正確/);
    assert.match(Cloud.friendlyError({message:'invite code not found'}),/邀請碼/);
    assert.match(Cloud.friendlyError(new TypeError('Failed to fetch')),/網路/);
    assert.match(Cloud.friendlyError({message:'only a coach can rename the team'}),/教練/);
    assert.match(Cloud.friendlyError({message:'delete the team or remove its players first'}),/先刪除球隊/);
});
test('without configuration the app stays local-only',()=>{
    delete globalThis.CloudApiOverride;globalThis.CloudConfig={url:'',publishableKey:''};
    assert.equal(Cloud.connect(),null);
});
test('the adapter calls supabase-js with the expected tables, filters and conflict key',async()=>{
    const calls=[];
    const chain=(table)=>{const q={};for(const m of ['select','eq','in','gte','order','limit','delete','maybeSingle'])q[m]=(...a)=>{calls.push([table,m,...a]);return q;};
        q.upsert=(...a)=>{calls.push([table,'upsert',...a]);return Promise.resolve({data:null,error:null});};
        q.then=(res)=>res({data:table==='team_members'?[{role:'coach',team_id:'t',teams:{id:'t',name:'隊',invite_code:'ABCDEFGH'}}]:[],error:null});return q;};
    const client={from:chain,rpc:(fn,args)=>{calls.push(['rpc',fn,args]);return Promise.resolve({data:{id:'t'},error:null});},auth:{}};
    const api=Cloud.supabaseApi(client);
    await api.upsertSessions([{id:'s'}]);
    assert.deepEqual(calls.at(-1),['training_sessions','upsert',[{id:'s'}],{onConflict:'id'}]);
    assert.deepEqual(await api.myTeams('u'),[{role:'coach',id:'t',name:'隊',invite_code:'ABCDEFGH'}]);
    await api.joinTeam('abc');assert.deepEqual(calls.at(-1),['rpc','join_team',{code:'abc'}]);
    await api.createTeam('隊');assert.deepEqual(calls.at(-1),['rpc','create_team',{team_name:'隊'}]);
    await api.renameTeam('t','新名');assert.deepEqual(calls.at(-1),['rpc','rename_team',{team:'t',new_name:'新名'}]);
    await api.regenerateInviteCode('t');assert.deepEqual(calls.at(-1),['rpc','regenerate_invite_code',{team:'t'}]);
    await api.deleteTeam('t');assert.deepEqual(calls.at(-1),['rpc','delete_team',{team:'t'}]);
    await api.deleteAccount();assert.deepEqual(calls.at(-1),['rpc','delete_my_account',{}]);
    calls.length=0;await api.teamSessions([],'2026-01-01');assert.equal(calls.length,0,'no query for an empty roster');
    const failing={from:()=>({upsert:()=>Promise.resolve({data:null,error:new Error('denied')})})};
    await assert.rejects(Cloud.supabaseApi(failing).upsertSessions([{id:'s'}]),/denied/);
});

test('shot source survives a round trip through the database row',()=>{
    const Cl=require('../shared/cloud.js');
    const session={schemaVersion:'basketball-training-v1',id:'s9',playerCode:'P001',targetShots:5,note:'',drill:'free_throw',position:'center',inputSource:'manual',isDemo:false,
        startedAt:'2026-11-03T08:00:00.000Z',finishedAt:null,shots:[{id:'a',made:true,recordedAt:'2026-11-03T08:00:05.000Z',source:'voice'},{id:'b',made:false,recordedAt:'2026-11-03T08:00:09.000Z'}]};
    const row=Cl.toRow(session,'u1');
    assert.deepEqual(row.shots[0],{id:'a',made:true,recordedAt:'2026-11-03T08:00:05.000Z',source:'voice'});
    assert.deepEqual(Cl.fromRow(row).shots,session.shots);
});

test('a large team is read in pages, so the report is never silently cut at the server row limit', async () => {
    const all = Array.from({length: 2500}, (_, i) => ({id: 's' + i, user_id: 'u' + (i % 40), started_at: '2026-11-10T10:00:00Z'}));
    const ranges = [];
    const query = {};
    for (const m of ['select', 'in', 'gte', 'order']) query[m] = () => query;
    query.range = (from, to) => { ranges.push([from, to]); return Promise.resolve({data: all.slice(from, to + 1), error: null}); };
    query.limit = () => { throw new Error('limit() would be cut at the server row limit'); };
    const api = Cloud.supabaseApi({from: () => query, rpc: () => Promise.resolve({data: null, error: null}), auth: {}});
    const rows = await api.teamSessions(['u1'], '2026-11-01');
    assert.equal(rows.length, 2500);
    assert.ok(ranges.length >= 3 && ranges.every(([a, b]) => b - a + 1 <= 1000), 'pages of at most 1000 rows');
});

test('reading a team stops after a sane maximum instead of looping forever', async () => {
    let calls = 0;
    const query = {};
    for (const m of ['select', 'in', 'gte', 'order']) query[m] = () => query;
    query.range = (from, to) => { calls++; return Promise.resolve({data: Array.from({length: to - from + 1}, (_, i) => ({id: 'r' + (from + i)})), error: null}); };
    const api = Cloud.supabaseApi({from: () => query, rpc: () => Promise.resolve({data: null, error: null}), auth: {}});
    const rows = await api.teamSessions(['u1'], '2026-11-01');
    assert.ok(calls <= 10, `${calls} requests`);
    assert.ok(rows.length <= 10000);
});

test('a team with exactly one full page of sessions is read correctly (the empty second page ends it)', async () => {
    const all = Array.from({length: 1000}, (_, i) => ({id: 's' + i}));
    let calls = 0;
    const query = {};
    for (const m of ['select', 'in', 'gte', 'order']) query[m] = () => query;
    query.range = (from, to) => { calls++; return Promise.resolve({data: all.slice(from, to + 1), error: null}); };
    const api = Cloud.supabaseApi({from: () => query, rpc: () => Promise.resolve({data: null, error: null}), auth: {}});
    assert.equal((await api.teamSessions(['u1'], '2026-11-01')).length, 1000);
    assert.equal(calls, 2);
    calls = 0;
    assert.equal((await api.teamSessions([], '2026-11-01')).length, 0);
    assert.equal(calls, 0, 'no request for an empty roster');
});
