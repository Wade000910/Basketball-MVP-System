(function(root, factory) {
    const api=factory(typeof module==='object'&&module.exports?require('./analysis-store.js'):root.TrainingAnalysis);
    if(typeof module==='object' && module.exports) module.exports=api;
    else root.TrainingCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Analysis) {
    const SCHEMA='basketball-training-v1';
    const DRILLS={free_throw:'罰球',mid_range:'中距離',three_point:'三分球'};
    const POSITIONS={left:'左側',center:'中央',right:'右側',unspecified:'未標記'};
    const positionOf=session=>session.position ?? (session.drill==='free_throw'?'center':'unspecified');
    function createSession({playerCode,targetShots,note='',drill='free_throw',position,id,now=new Date().toISOString(),isDemo=false}) {
        if(!Object.hasOwn(DRILLS,drill)) throw new Error('請選擇有效的投籃類型。');
        position=position===undefined?(drill==='free_throw'?'center':'unspecified'):position;
        if(!Object.hasOwn(POSITIONS,position) || (drill==='free_throw' && position!=='center'))throw new Error('請選擇有效的投籃位置；罰球使用中央位置。');
        if(typeof playerCode!=='string' || !/^[A-Za-z0-9_-]{1,32}$/.test(playerCode.trim())) throw new Error('請填 1–32 字的學員代碼（英文、數字、底線或連字號）。');
        if(!Number.isInteger(targetShots) || targetShots<1 || targetShots>200) throw new Error('目標球數須為 1–200 的整數。');
        if(typeof note!=='string' || note.length>300) throw new Error('練習重點限 300 字。');
        if(typeof id!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || typeof now!=='string' || !Number.isFinite(Date.parse(now))) throw new Error('無法建立訓練識別或時間。');
        return {schemaVersion:SCHEMA,id,playerCode:playerCode.trim(),targetShots,note,drill,position,
            inputSource:'manual',isDemo:!!isDemo,startedAt:now,finishedAt:null,shots:[]};
    }
    function validateSession(value) {
        if(!value || value.schemaVersion!==SCHEMA || !Object.hasOwn(DRILLS,value.drill) || value.inputSource!=='manual' || typeof value.isDemo!=='boolean') throw new Error('訓練紀錄格式不符。');
        createSession({...value,now:value.startedAt});
        if(!Array.isArray(value.shots) || value.shots.length>200) throw new Error('投籃紀錄格式不符。');
        if(value.finishedAt!==null && (typeof value.finishedAt!=='string' || !Number.isFinite(Date.parse(value.finishedAt)) || Date.parse(value.finishedAt)<Date.parse(value.startedAt))) throw new Error('訓練結束時間不符。');
        const ids=new Set();
        for(const shot of value.shots) {
            if(!shot || typeof shot.id!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(shot.id) || ids.has(shot.id) || typeof shot.made!=='boolean' || typeof shot.recordedAt!=='string' || !Number.isFinite(Date.parse(shot.recordedAt))) throw new Error('逐球紀錄格式不符。');
            ids.add(shot.id);
        }
        if(value.analysisRuns!==undefined){
            if(!Array.isArray(value.analysisRuns)||value.analysisRuns.length>30)throw new Error('動作紀錄格式不符。');
            for(const run of value.analysisRuns){Analysis.normalize(run);if(value.isDemo || value.drill!=='free_throw' || run.sessionId!==value.id || run.participantId!==value.playerCode)throw new Error('動作紀錄與訓練不符。');}
            Analysis.merge([],value.analysisRuns);
        }
        return value;
    }
    function addShot(session,made,id,now=new Date().toISOString()) {
        validateSession(session);
        if(session.finishedAt) throw new Error('這組已結束，請開始新一組。');
        if(typeof made!=='boolean' || typeof id!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || session.shots.some(s=>s.id===id) || typeof now!=='string' || !Number.isFinite(Date.parse(now))) throw new Error('投籃紀錄不符。');
        if(session.shots.length>=200) throw new Error('每組最多記錄 200 球。');
        return {...session,shots:[...session.shots,{id,made,recordedAt:now}]};
    }
    function correctShot(session,id,made) {
        validateSession(session);
        if(typeof made!=='boolean' || !session.shots.some(s=>s.id===id)) throw new Error('找不到要修正的球。');
        return {...session,shots:session.shots.map(s=>s.id===id?{...s,made}:s)};
    }
    function removeShot(session,id) {
        validateSession(session);
        if(!session.shots.some(s=>s.id===id)) throw new Error('找不到要刪除的球。');
        return {...session,shots:session.shots.filter(s=>s.id!==id)};
    }
    function finishSession(session,now=new Date().toISOString()) {
        validateSession(session);
        if(!session.shots.length) throw new Error('至少記錄一球，再結束這組。');
        if(!Number.isFinite(Date.parse(now)) || Date.parse(now)<Date.parse(session.startedAt)) throw new Error('結束時間不符。');
        return {...session,finishedAt:session.finishedAt || now};
    }
    function summarize(session) {
        validateSession(session);
        const total=session.shots.length,made=session.shots.filter(s=>s.made).length;
        return {total,made,missed:total-made,percentage:total?Math.round(made/total*1000)/10:null,
            remaining:Math.max(0,session.targetShots-total),targetReached:total>=session.targetShots};
    }
    function previousSession(session,history) {
        return history.filter(s=>s.id!==session.id && s.playerCode===session.playerCode && s.drill===session.drill && positionOf(s)===positionOf(session) && s.isDemo===session.isDemo && s.finishedAt && Date.parse(s.startedAt)<Date.parse(session.startedAt))
            .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0] || null;
    }
    function csv(session) {
        validateSession(session);
        const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
        // Codes/IDs are generated or constrained; free-text notes are only in JSON.
        const columns=['sessionId','playerCode','drill','inputSource','isDemo','shotOrder','made','recordedAt','position'];
        return '\uFEFF'+[columns.join(','),...session.shots.map((s,i)=>[session.id,session.playerCode,session.drill,session.inputSource,session.isDemo,i+1,s.made,s.recordedAt,positionOf(session)].map(quote).join(','))].join('\r\n');
    }
    function parseStore(text) {
        const data=JSON.parse(text);
        if(data.schemaVersion!==SCHEMA || !Array.isArray(data.history) || data.history.length>30) throw new Error('本機紀錄格式不符。');
        const ids=new Set();
        data.history.forEach(s=>{validateSession(s);if(s.isDemo || !s.finishedAt || ids.has(s.id))throw new Error('本機歷史紀錄不符。');ids.add(s.id);});
        if(data.active!==null) {validateSession(data.active);if(data.active.isDemo)throw new Error('示範資料不得存入正式紀錄。');}
        return data;
    }
    function demoSession() {
        let s=createSession({playerCode:'DEMO01',targetShots:10,id:'demo-session',now:'2026-10-30T01:00:00.000Z',isDemo:true,note:'示範：每次出手前固定準備流程。此為合成資料。'});
        [true,false,true,true,false,true,false,true,true,true].forEach((made,i)=>{s=addShot(s,made,'demo-'+i,new Date(Date.parse(s.startedAt)+(i+1)*15000).toISOString());});
        return finishSession(s,'2026-10-30T01:03:00.000Z');
    }
    function cleanSession(value){
        validateSession(value);
        if(value.isDemo)throw new Error('示範報告不會匯入訓練紀錄。');
        const s=createSession({...value,now:value.startedAt});
        s.finishedAt=value.finishedAt;
        s.shots=value.shots.map(t=>({id:t.id,made:t.made,recordedAt:t.recordedAt}));
        if(value.analysisRuns)s.analysisRuns=Analysis.merge([],value.analysisRuns);
        return s;
    }
    function parseBackup(text){
        if(typeof text!=='string'||text.length>5*1024*1024)throw new Error('備份檔限 5 MB。');
        const data=JSON.parse(text);
        if(!data || typeof data!=='object')throw new Error('請選擇訓練 JSON 報告或備份。');
        if(data.schemaVersion===SCHEMA && data.shots){const s=cleanSession(data);return {schemaVersion:SCHEMA,active:s.finishedAt?null:s,history:s.finishedAt?[s]:[]};}
        if(data.schemaVersion!=='basketball-training-backup-v1')throw new Error('請選擇訓練 JSON 報告或備份。');
        const store=parseStore(JSON.stringify(data.store));
        return {schemaVersion:SCHEMA,active:store.active?cleanSession(store.active):null,history:store.history.map(cleanSession)};
    }
    function mergeBackup(current,incoming){
        parseStore(JSON.stringify(current));parseStore(JSON.stringify(incoming));
        if(current.active && !current.active.finishedAt && incoming.active && !incoming.active.finishedAt && current.active.id!==incoming.active.id)throw new Error('請先結束或放棄目前練習，再匯入另一組未完成練習。');
        const map=new Map(current.history.map(s=>[s.id,s]));
        if(current.active?.finishedAt)map.set(current.active.id,current.active);
        const candidates=[...incoming.history,...(incoming.active?.finishedAt?[incoming.active]:[])];
        let added=0,skipped=0;
        for(const s of candidates){
            if(map.has(s.id) || current.active?.id===s.id){skipped++;continue;}
            map.set(s.id,cleanSession(s));added++;
        }
        if(map.size>30)throw new Error('匯入後超過 30 組，未變更現有紀錄。請先下載備份並整理歷史。');
        let active=current.active;
        if(!active && incoming.active && !incoming.active.finishedAt){if(map.has(incoming.active.id))throw new Error('匯入的練習代碼與已完成紀錄重複。');active=cleanSession(incoming.active);added++;}
        else if(incoming.active && !incoming.active.finishedAt)skipped++;
        return {schemaVersion:SCHEMA,active,history:[...map.values()].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)),added,skipped};
    }
    function progress(history,playerCode,now=new Date()) {
        const sessions=history.filter(s=>!s.isDemo && s.finishedAt && s.playerCode===playerCode);
        const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-6);
        const recent=sessions.filter(s=>Date.parse(s.startedAt)>=start.getTime() && Date.parse(s.startedAt)<=now.getTime());
        const shots=recent.reduce((n,s)=>n+s.shots.length,0);
        const drills=Object.entries(DRILLS).map(([id,label])=>{
            const groups=sessions.filter(s=>s.drill===id),total=groups.reduce((n,s)=>n+s.shots.length,0),made=groups.reduce((n,s)=>n+summarize(s).made,0);
            return {id,label,total,made,percentage:total?Math.round(made/total*1000)/10:null};
        });
        return {sessions:sessions.length,recentSessions:recent.length,recentShots:shots,drills};
    }
    function trend(history,playerCode,drill,position='all') {
        if(!Object.hasOwn(DRILLS,drill) || (position!=='all'&&!Object.hasOwn(POSITIONS,position)))throw new Error('趨勢篩選條件不符。');
        const sessions=history.filter(s=>!s.isDemo && s.finishedAt && s.playerCode===playerCode && s.drill===drill && (position==='all'||positionOf(s)===position));
        const ordered=sessions.filter(s=>s.shots.length).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)||a.id.localeCompare(b.id)).slice(-10);
        const points=ordered.map(s=>({id:s.id,startedAt:s.startedAt,position:positionOf(s),...summarize(s)}));
        const positions=Object.entries(POSITIONS).map(([id,label])=>{
            const groups=history.filter(s=>!s.isDemo && s.finishedAt && s.playerCode===playerCode && s.drill===drill && positionOf(s)===id);
            const total=groups.reduce((n,s)=>n+s.shots.length,0),made=groups.reduce((n,s)=>n+summarize(s).made,0);
            return {id,label,total,made,percentage:total?Math.round(made/total*1000)/10:null};
        });
        return {points,positions};
    }
    return {SCHEMA,DRILLS,POSITIONS,positionOf,trend,progress,createSession,validateSession,addShot,correctShot,removeShot,finishSession,summarize,previousSession,csv,parseStore,demoSession,cleanSession,parseBackup,mergeBackup};
});
