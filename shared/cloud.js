// Cloud backup and team sharing for Basketball MVP.
//
// The app stays local-first: without sign-in nothing here runs. After sign-in, the
// player's own finished and in-progress sessions are copied to Supabase, and sessions
// stored in the cloud but missing on this device are brought back.
// Videos never leave the device; only the session JSON the app already exports.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.Cloud=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const LOCAL_LIMIT=30;

    // Local session object -> training_sessions row. Demo sessions never sync.
    function toRow(session,userId){
        if(!session || session.isDemo)throw new Error('示範資料不會同步。');
        return {id:session.id,user_id:userId,player_code:session.playerCode,drill:session.drill,
            position:session.position ?? (session.drill==='free_throw'?'center':'unspecified'),
            target_shots:session.targetShots,note:session.note || '',started_at:session.startedAt,
            finished_at:session.finishedAt,
            shots:session.shots.map(s=>({id:s.id,made:s.made,recordedAt:s.recordedAt})),
            analysis_runs:session.analysisRuns || []};
    }
    // training_sessions row -> local session object in the app's existing schema.
    function fromRow(row){
        const session={schemaVersion:'basketball-training-v1',id:row.id,playerCode:row.player_code,
            targetShots:row.target_shots,note:row.note || '',drill:row.drill,position:row.position,
            inputSource:'manual',isDemo:false,startedAt:new Date(row.started_at).toISOString(),
            finishedAt:row.finished_at?new Date(row.finished_at).toISOString():null,
            shots:(row.shots || []).map(s=>({id:s.id,made:s.made,recordedAt:s.recordedAt}))};
        if(Array.isArray(row.analysis_runs) && row.analysis_runs.length)session.analysisRuns=row.analysis_runs;
        return session;
    }
    // Sessions present on this device are the edited copy and win; cloud-only finished
    // sessions are restored up to the local history limit, newest first.
    function mergeRemote(store,remoteSessions){
        const local=new Set([...(store.history || []).map(s=>s.id),...(store.active?[store.active.id]:[])]);
        const restored=remoteSessions.filter(s=>s.finishedAt && !local.has(s.id));
        const history=[...(store.history || []),...restored].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,LOCAL_LIMIT);
        const kept=new Set(history.map(s=>s.id));
        return {store:{...store,history},restored:restored.filter(s=>kept.has(s.id)).length};
    }
    // Upload set: every real local session plus its motion summaries.
    function uploadRows(store,userId,withAnalysis=s=>s){
        return [...(store.active && !store.active.isDemo?[store.active]:[]),...(store.history || [])]
            .filter(s=>!s.isDemo).map(s=>toRow(withAnalysis(s),userId));
    }
    function friendlyError(error){
        const text=String(error?.message || error || '');
        if(/Invalid login credentials/i.test(text))return '帳號或密碼不正確。';
        if(/Email not confirmed/i.test(text))return '請先到信箱點確認連結，再登入。';
        if(/already registered|already been registered/i.test(text))return '這個信箱已註冊，請直接登入。';
        if(/Password should be/i.test(text))return '密碼至少需要 6 個字元。';
        if(/invite code not found/i.test(text))return '找不到這個邀請碼，請向教練確認。';
        if(/Failed to fetch|NetworkError|network/i.test(text))return '連不上雲端，請檢查網路後再試。';
        return text || '雲端操作未完成，請稍後再試。';
    }

    const SESSION_COLUMNS='id,user_id,player_code,drill,position,target_shots,note,started_at,finished_at,shots,analysis_runs,total_shots,made_shots,updated_at';
    // Thin adapter over supabase-js v2. Every method resolves with data or throws.
    function supabaseApi(client){
        const must=({data,error})=>{if(error)throw error;return data;};
        return {
            async currentUser(){const {data}=await client.auth.getSession();return data.session?.user || null;},
            onAuthChange(fn){client.auth.onAuthStateChange((_event,session)=>fn(session?.user || null));},
            async signUp(email,password){const data=must(await client.auth.signUp({email,password,options:{emailRedirectTo:location.href.split('#')[0]}}));return {user:data.user,needsConfirmation:!data.session};},
            async signIn(email,password){return must(await client.auth.signInWithPassword({email,password})).user;},
            async signOut(){must(await client.auth.signOut());},
            async profile(userId){return must(await client.from('profiles').select('id,display_name').eq('id',userId).maybeSingle());},
            async saveProfile(userId,displayName){must(await client.from('profiles').upsert({id:userId,display_name:displayName}));},
            async upsertSessions(rows){if(rows.length)must(await client.from('training_sessions').upsert(rows,{onConflict:'id'}));},
            async ownSessions(userId){return must(await client.from('training_sessions').select(SESSION_COLUMNS).eq('user_id',userId).order('started_at',{ascending:false}).limit(500));},
            async deleteSessions(ids){if(ids.length)must(await client.from('training_sessions').delete().in('id',ids));},
            async myTeams(userId){return must(await client.from('team_members').select('role,team_id,teams(id,name,invite_code)').eq('user_id',userId)).map(m=>({role:m.role,...m.teams}));},
            async createTeam(name){return must(await client.rpc('create_team',{team_name:name}));},
            async joinTeam(code){return must(await client.rpc('join_team',{code}));},
            async leaveTeam(teamId,userId){must(await client.from('team_members').delete().eq('team_id',teamId).eq('user_id',userId));},
            async removeMember(teamId,userId){must(await client.from('team_members').delete().eq('team_id',teamId).eq('user_id',userId));},
            async roster(teamId){
                const members=must(await client.from('team_members').select('user_id,role,joined_at').eq('team_id',teamId));
                const ids=members.map(m=>m.user_id);
                const profiles=ids.length?must(await client.from('profiles').select('id,display_name').in('id',ids)):[];
                const names=new Map(profiles.map(p=>[p.id,p.display_name]));
                return members.map(m=>({...m,display_name:names.get(m.user_id) || '未命名球員'}));
            },
            async teamSessions(userIds,sinceIso){
                if(!userIds.length)return [];
                return must(await client.from('training_sessions').select(SESSION_COLUMNS).in('user_id',userIds).gte('started_at',sinceIso).order('started_at',{ascending:false}).limit(2000));
            }
        };
    }
    // Test pages may provide an in-memory API; production uses the configured project.
    function connect(){
        if(globalThis.CloudApiOverride)return globalThis.CloudApiOverride;
        const config=globalThis.CloudConfig || {};
        if(!config.url || !config.publishableKey || !globalThis.supabase?.createClient)return null;
        return supabaseApi(globalThis.supabase.createClient(config.url,config.publishableKey));
    }
    return {LOCAL_LIMIT,toRow,fromRow,mergeRemote,uploadRows,friendlyError,supabaseApi,connect};
});
