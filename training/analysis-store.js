(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrainingAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const KEY='basketball-analysis-v1',SCHEMA='basketball-analysis-run-v1';
    const TIMESTAMP_SOURCES=['camera-frame','pose-result'];
    const code=(v,max)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9_-]+$/.test(v);
    function normalize(value){
        if(!value || value.schemaVersion!==SCHEMA || !code(value.id,80) || !code(value.participantId,32) || !code(value.sessionId,80) || !code(value.blockId,80) || !['auditory','visual','baseline'].includes(value.condition) || !['left','right'].includes(value.shootingSide) || typeof value.startedAt!=='string' || !Number.isFinite(Date.parse(value.startedAt)) || typeof value.stoppedAt!=='string' || !Number.isFinite(Date.parse(value.stoppedAt)) || Date.parse(value.stoppedAt)<Date.parse(value.startedAt) || !Array.isArray(value.trials) || value.trials.length>200) throw new Error('動作資料格式不符。');
        const seen=new Set();
        const trials=value.trials.map(t=>{
            if(!t || !Number.isInteger(t.trialOrder) || t.trialOrder<1 || seen.has(t.trialOrder) || !['accepted','low_quality','invalid','aborted'].includes(t.trialStatus) || !(t.dt===null || Number.isFinite(t.dt)) || (t.trialStatus==='accepted' && !Number.isFinite(t.dt)) || typeof t.timestamp!=='string' || !Number.isFinite(Date.parse(t.timestamp)) || typeof t.reasonCode!=='string' || t.reasonCode.length>300)throw new Error('動作試次格式不符。');
            // Optional fields from the player page: an explicit shot link, the peak-definition
            // interval, which clock timed the samples, and the measured frame rate.
            if((t.shotId!==undefined && t.shotId!==null && !code(t.shotId,80)) || (t.dtPeak!==undefined && !(t.dtPeak===null || Number.isFinite(t.dtPeak))) || (t.timestampSource!==undefined && !TIMESTAMP_SOURCES.includes(t.timestampSource)) || (t.measuredFps!==undefined && !(t.measuredFps===null || (Number.isFinite(t.measuredFps) && t.measuredFps>0 && t.measuredFps<1000))) || (t.algorithmVersion!==undefined && !code(t.algorithmVersion,40)))throw new Error('動作試次格式不符。');
            seen.add(t.trialOrder);
            const out={trialOrder:t.trialOrder,trialStatus:t.trialStatus,dt:t.dt,timestamp:t.timestamp,reasonCode:t.reasonCode};
            for(const k of ['shotId','dtPeak','timestampSource','measuredFps','algorithmVersion'])if(t[k]!==undefined && t[k]!==null)out[k]=t[k];
            return out;
        });
        return {schemaVersion:SCHEMA,id:value.id,participantId:value.participantId,sessionId:value.sessionId,blockId:value.blockId,condition:value.condition,shootingSide:value.shootingSide,startedAt:value.startedAt,stoppedAt:value.stoppedAt,trials};
    }
    function parse(text){const data=JSON.parse(text);if(!Array.isArray(data)||data.length>30)throw new Error('動作資料格式不符。');return merge([],data);}
    function merge(previous,incoming){const map=new Map();for(const item of [...previous,...incoming]){const run=normalize(item);if(map.has(run.id) && JSON.stringify(map.get(run.id))!==JSON.stringify(run))throw new Error('動作資料代碼重複且內容不同。');map.set(run.id,run);}return [...map.values()].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));}
    function forSession(session,runs){return merge(session.analysisRuns || [],runs.filter(r=>r.sessionId===session.id&&r.participantId===session.playerCode)).filter(r=>r.sessionId===session.id&&r.participantId===session.playerCode).slice(0,30);}
    function summary(runs){const trials=runs.flatMap(r=>r.trials.map(t=>({...t,condition:r.condition}))),accepted=trials.filter(t=>t.trialStatus==='accepted'),visible=accepted.filter(t=>t.condition!=='baseline');return {runs:runs.length,total:trials.length,accepted:accepted.length,excluded:trials.length-accepted.length,meanDt:visible.length?Math.round(visible.reduce((n,t)=>n+t.dt,0)/visible.length*10)/10:null};}
    // Pair manual make/miss records with motion trials by time.
    // A motion trial is stamped about 1 s after release; a make/miss tap usually follows the
    // release by a few seconds, so a tap is expected roughly expectedLagMs after its trial.
    // Pairs keep time order and each trial is used once. Among all such alignments the one
    // with the most pairs wins, then the one whose lags sit closest to expectedLagMs, so a
    // spurious trial or a missed detection is skipped instead of shifting later pairs.
    const PAIRING={id:'time-ordered-alignment-v2',leadMs:3000,lagMs:10000,expectedLagMs:2000};
    function pair(shots,runs,options={}){
        const {leadMs,lagMs,expectedLagMs}={...PAIRING,...options};
        const all=runs.flatMap(r=>r.trials.map(t=>({...t,runId:r.id,condition:r.condition,time:Date.parse(t.timestamp)})))
            .filter(t=>Number.isFinite(t.time)).sort((a,b)=>a.time-b.time||a.trialOrder-b.trialOrder);
        // Trials recorded by the player page name their shot; those links are used as they
        // are, and only the remaining shots and trials are aligned by time.
        const matched=new Map(),shotIds=new Set(shots.map(s=>s.id));
        for(const t of all)if(t.shotId && shotIds.has(t.shotId) && !matched.has(t.shotId))matched.set(t.shotId,{...t,linked:true});
        const usedTrials=new Set([...matched.values()].map(t=>t.runId+'#'+t.trialOrder));
        const trials=all.filter(t=>!t.shotId && !usedTrials.has(t.runId+'#'+t.trialOrder));
        const ordered=[...shots].filter(s=>!matched.has(s.id)).map((s,index)=>({...s,index,time:Date.parse(s.recordedAt)})).sort((a,b)=>a.time-b.time||a.index-b.index);
        const n=ordered.length,m=trials.length;
        // best[i][j]: optimal alignment of the first i shots with the first j trials.
        const better=(a,b)=>a.pairs>b.pairs || (a.pairs===b.pairs && a.cost<b.cost);
        const best=Array.from({length:n+1},()=>Array(m+1));
        for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
            let cell={pairs:0,cost:0,move:'start'};
            if(i>0){const c=best[i-1][j];cell={pairs:c.pairs,cost:c.cost,move:'skipShot'};}
            if(j>0){const c=best[i][j-1];if(better(c,cell) || cell.move==='start')cell={pairs:c.pairs,cost:c.cost,move:'skipTrial'};}
            if(i>0 && j>0){
                const lag=ordered[i-1].time-trials[j-1].time;
                if(lag>=-leadMs && lag<=lagMs){
                    const c=best[i-1][j-1],cand={pairs:c.pairs+1,cost:c.cost+Math.abs(lag-expectedLagMs),move:'match'};
                    if(better(cand,cell))cell=cand;
                }
            }
            best[i][j]=cell;
        }
        for(let i=n,j=m;i>0 || j>0;){
            const move=best[i][j].move;
            if(move==='match'){matched.set(ordered[i-1].id,trials[j-1]);i--;j--;}
            else if(move==='skipShot')i--;
            else j--;
        }
        return shots.map(shot=>{
            const t=matched.get(shot.id);
            if(!t)return {shotId:shot.id,made:shot.made,trial:null};
            return {shotId:shot.id,made:shot.made,trial:{runId:t.runId,trialOrder:t.trialOrder,trialStatus:t.trialStatus,condition:t.condition,dt:t.dt,dtPeak:t.dtPeak ?? null,linked:!!t.linked,lagMs:Date.parse(shot.recordedAt)-t.time}};
        });
    }
    function group(values){
        if(!values.length)return {count:0,meanDt:null,sdDt:null};
        const mean=values.reduce((n,v)=>n+v,0)/values.length;
        const sd=values.length>1?Math.sqrt(values.reduce((n,v)=>n+(v-mean)**2,0)/(values.length-1)):null;
        return {count:values.length,meanDt:Math.round(mean*10)/10,sdDt:sd===null?null:Math.round(sd*10)/10};
    }
    // Only accepted, non-baseline trials contribute timing; baseline stays blind.
    // metric 'dt' is the onset definition; 'dtPeak' the peak definition (player page only).
    function pairedSummary(pairs,metric='dt'){
        const usable=pairs.filter(p=>p.trial && p.trial.trialStatus==='accepted' && p.trial.condition!=='baseline' && Number.isFinite(p.trial[metric]));
        return {metric,shots:pairs.length,paired:pairs.filter(p=>p.trial).length,usable:usable.length,
            made:group(usable.filter(p=>p.made).map(p=>p.trial[metric])),missed:group(usable.filter(p=>!p.made).map(p=>p.trial[metric]))};
    }
    return {KEY,SCHEMA,PAIRING,TIMESTAMP_SOURCES,normalize,parse,merge,forSession,summary,pair,pairedSummary};
});
