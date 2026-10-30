(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrainingAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const KEY='basketball-analysis-v1',SCHEMA='basketball-analysis-run-v1';
    const code=(v,max)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9_-]+$/.test(v);
    function normalize(value){
        if(!value || value.schemaVersion!==SCHEMA || !code(value.id,80) || !code(value.participantId,32) || !code(value.sessionId,80) || !code(value.blockId,80) || !['auditory','visual','baseline'].includes(value.condition) || !['left','right'].includes(value.shootingSide) || typeof value.startedAt!=='string' || !Number.isFinite(Date.parse(value.startedAt)) || typeof value.stoppedAt!=='string' || !Number.isFinite(Date.parse(value.stoppedAt)) || Date.parse(value.stoppedAt)<Date.parse(value.startedAt) || !Array.isArray(value.trials) || value.trials.length>200) throw new Error('動作資料格式不符。');
        const seen=new Set();
        const trials=value.trials.map(t=>{
            if(!t || !Number.isInteger(t.trialOrder) || t.trialOrder<1 || seen.has(t.trialOrder) || !['accepted','low_quality','invalid','aborted'].includes(t.trialStatus) || !(t.dt===null || Number.isFinite(t.dt)) || (t.trialStatus==='accepted' && !Number.isFinite(t.dt)) || typeof t.timestamp!=='string' || !Number.isFinite(Date.parse(t.timestamp)) || typeof t.reasonCode!=='string' || t.reasonCode.length>300)throw new Error('動作試次格式不符。');
            seen.add(t.trialOrder);
            return {trialOrder:t.trialOrder,trialStatus:t.trialStatus,dt:t.dt,timestamp:t.timestamp,reasonCode:t.reasonCode};
        });
        return {schemaVersion:SCHEMA,id:value.id,participantId:value.participantId,sessionId:value.sessionId,blockId:value.blockId,condition:value.condition,shootingSide:value.shootingSide,startedAt:value.startedAt,stoppedAt:value.stoppedAt,trials};
    }
    function parse(text){const data=JSON.parse(text);if(!Array.isArray(data)||data.length>30)throw new Error('動作資料格式不符。');return merge([],data);}
    function merge(previous,incoming){const map=new Map();for(const item of [...previous,...incoming]){const run=normalize(item);if(map.has(run.id) && JSON.stringify(map.get(run.id))!==JSON.stringify(run))throw new Error('動作資料代碼重複且內容不同。');map.set(run.id,run);}return [...map.values()].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));}
    function forSession(session,runs){return merge(session.analysisRuns || [],runs.filter(r=>r.sessionId===session.id&&r.participantId===session.playerCode)).filter(r=>r.sessionId===session.id&&r.participantId===session.playerCode).slice(0,30);}
    function summary(runs){const trials=runs.flatMap(r=>r.trials.map(t=>({...t,condition:r.condition}))),accepted=trials.filter(t=>t.trialStatus==='accepted'),visible=accepted.filter(t=>t.condition!=='baseline');return {runs:runs.length,total:trials.length,accepted:accepted.length,excluded:trials.length-accepted.length,meanDt:visible.length?Math.round(visible.reduce((n,t)=>n+t.dt,0)/visible.length*10)/10:null};}
    return {KEY,SCHEMA,normalize,parse,merge,forSession,summary};
});
