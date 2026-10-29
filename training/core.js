(function(root, factory) {
    const api=factory();
    if(typeof module==='object' && module.exports) module.exports=api;
    else root.TrainingCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
    const SCHEMA='basketball-training-v1';
    function createSession({playerCode,targetShots,note='',id,now=new Date().toISOString(),isDemo=false}) {
        if(typeof playerCode!=='string' || !/^[A-Za-z0-9_-]{1,32}$/.test(playerCode.trim())) throw new Error('請填 1–32 字的學員代碼（英文、數字、底線或連字號）。');
        if(!Number.isInteger(targetShots) || targetShots<1 || targetShots>200) throw new Error('目標球數須為 1–200 的整數。');
        if(typeof note!=='string' || note.length>300) throw new Error('練習重點限 300 字。');
        if(typeof id!=='string' || !id || !Number.isFinite(Date.parse(now))) throw new Error('無法建立訓練識別或時間。');
        return {schemaVersion:SCHEMA,id,playerCode:playerCode.trim(),targetShots,note,drill:'free_throw',
            inputSource:'manual',isDemo:!!isDemo,startedAt:now,finishedAt:null,shots:[]};
    }
    function validateSession(value) {
        if(!value || value.schemaVersion!==SCHEMA || value.drill!=='free_throw' || value.inputSource!=='manual' || typeof value.isDemo!=='boolean') throw new Error('訓練紀錄格式不符。');
        createSession({...value,now:value.startedAt});
        if(!Array.isArray(value.shots) || value.shots.length>200) throw new Error('投籃紀錄格式不符。');
        if(value.finishedAt!==null && (!Number.isFinite(Date.parse(value.finishedAt)) || Date.parse(value.finishedAt)<Date.parse(value.startedAt))) throw new Error('訓練結束時間不符。');
        const ids=new Set();
        for(const shot of value.shots) {
            if(!shot || typeof shot.id!=='string' || !shot.id || ids.has(shot.id) || typeof shot.made!=='boolean' || !Number.isFinite(Date.parse(shot.recordedAt))) throw new Error('逐球紀錄格式不符。');
            ids.add(shot.id);
        }
        return value;
    }
    function addShot(session,made,id,now=new Date().toISOString()) {
        validateSession(session);
        if(session.finishedAt) throw new Error('這組已結束，請開始新一組。');
        if(typeof made!=='boolean' || typeof id!=='string' || !id || session.shots.some(s=>s.id===id) || !Number.isFinite(Date.parse(now))) throw new Error('投籃紀錄不符。');
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
        return history.filter(s=>s.id!==session.id && s.playerCode===session.playerCode && s.drill===session.drill && s.isDemo===session.isDemo && s.finishedAt && Date.parse(s.startedAt)<Date.parse(session.startedAt))
            .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0] || null;
    }
    function csv(session) {
        validateSession(session);
        const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
        // Codes/IDs are generated or constrained; free-text notes are only in JSON.
        const columns=['sessionId','playerCode','drill','inputSource','isDemo','shotOrder','made','recordedAt'];
        return '\uFEFF'+[columns.join(','),...session.shots.map((s,i)=>[session.id,session.playerCode,session.drill,session.inputSource,session.isDemo,i+1,s.made,s.recordedAt].map(quote).join(','))].join('\r\n');
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
    return {SCHEMA,createSession,validateSession,addShot,correctShot,removeShot,finishSession,summarize,previousSession,csv,parseStore,demoSession};
});
