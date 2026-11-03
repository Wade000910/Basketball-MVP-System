// In-memory stand-in for the Supabase adapter used only by browser checks.
// It mirrors the access rules of supabase/migrations (owner writes, coach reads members).
(function(){
    const KEY='fake-cloud-db',load=()=>JSON.parse(localStorage.getItem(KEY) || '{"users":[],"me":null,"profiles":{},"teams":[],"members":[],"sessions":{}}');
    const save=db=>localStorage.setItem(KEY,JSON.stringify(db));
    const tx=fn=>{const db=load();const out=fn(db);save(db);return out;};
    const me=db=>{if(!db.me)throw new Error('not signed in');return db.me;};
    const coachOf=(db,uid,player)=>db.members.some(c=>c.user_id===uid&&c.role==='coach'&&db.members.some(p=>p.team_id===c.team_id&&p.user_id===player));
    const listeners=[];let n=0;
    window.fakeCloudCalls=[];
    const log=(name,v)=>{window.fakeCloudCalls.push(name);if(window.fakeCloudFail===name)return Promise.reject(new TypeError('Failed to fetch'));return Promise.resolve(v);};
    window.CloudApiOverride={
        currentUser:()=>Promise.resolve(tx(db=>db.me?{id:db.me,email:db.users.find(u=>u.id===db.me).email}:null)),
        onAuthChange(fn){listeners.push(fn);},
        signUp:(email,password)=>log('signUp',tx(db=>{if(db.users.some(u=>u.email===email))throw new Error('User already registered');const u={id:'user-'+(db.users.length+1),email,password};db.users.push(u);db.me=u.id;return {user:{id:u.id,email},needsConfirmation:false};})),
        signIn:(email,password)=>{try{return log('signIn',tx(db=>{const u=db.users.find(x=>x.email===email&&x.password===password);if(!u)throw new Error('Invalid login credentials');db.me=u.id;return {id:u.id,email};}));}catch(e){return Promise.reject(e);}},
        signOut:()=>log('signOut',tx(db=>{db.me=null;})),
        profile:uid=>log('profile',tx(db=>db.profiles[uid]?{id:uid,display_name:db.profiles[uid]}:null)),
        saveProfile:(uid,name)=>log('saveProfile',tx(db=>{if(uid!==me(db))throw new Error('denied');db.profiles[uid]=name;})),
        upsertSessions:rows=>log('upsertSessions',tx(db=>{for(const r of rows){if(r.user_id!==me(db))throw new Error('denied');const old=db.sessions[r.id];if(old&&old.user_id!==r.user_id)throw new Error('denied');db.sessions[r.id]={...r,made_shots:r.shots.filter(s=>s.made).length,total_shots:r.shots.length};}})),
        ownSessions:uid=>log('ownSessions',tx(db=>Object.values(db.sessions).filter(s=>s.user_id===uid).sort((a,b)=>b.started_at.localeCompare(a.started_at)))),
        myTeams:uid=>log('myTeams',tx(db=>db.members.filter(m=>m.user_id===uid).map(m=>({role:m.role,...db.teams.find(t=>t.id===m.team_id)})))),
        createTeam:name=>log('createTeam',tx(db=>{const t={id:'team-'+(db.teams.length+1),name,invite_code:'TEAMCODE'.slice(0,7)+(db.teams.length+2)};db.teams.push(t);db.members.push({team_id:t.id,user_id:me(db),role:'coach',joined_at:new Date().toISOString()});return t;})),
        joinTeam:code=>{try{return log('joinTeam',tx(db=>{const t=db.teams.find(x=>x.invite_code===code.trim().toUpperCase());if(!t)throw new Error('invite code not found');if(!db.members.some(m=>m.team_id===t.id&&m.user_id===me(db)))db.members.push({team_id:t.id,user_id:me(db),role:'player',joined_at:new Date().toISOString()});return t;}));}catch(e){return Promise.reject(e);}},
        leaveTeam:(team,uid)=>log('leaveTeam',tx(db=>{db.members=db.members.filter(m=>!(m.team_id===team&&m.user_id===uid&&uid===me(db)));})),
        removeMember:(team,uid)=>log('removeMember',tx(db=>{const coach=db.members.some(m=>m.team_id===team&&m.user_id===me(db)&&m.role==='coach');db.members=db.members.filter(m=>!(coach&&m.team_id===team&&m.user_id===uid&&m.role==='player'));})),
        roster:team=>log('roster',tx(db=>db.members.filter(m=>m.team_id===team).map(m=>({...m,display_name:db.profiles[m.user_id] || '未命名球員'})))),
        teamSessions:(ids,since)=>log('teamSessions',tx(db=>Object.values(db.sessions).filter(s=>ids.includes(s.user_id)&&s.started_at>=since&&(s.user_id===me(db)||coachOf(db,me(db),s.user_id)))))
    };
})();
