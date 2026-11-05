// Slow-motion reference comparison for the free-throw timing metric.
//
// A second phone films the same shots at high frame rate. A person steps through that
// video frame by frame and marks the events; the frame index divided by the capture
// frame rate gives reference times that do not depend on the analysis phone's clock.
// The system's per-trial export is then compared shot by shot with the reference.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.Validation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const SCHEMA='slowmo-reference-v1';
    const EVENTS=['knee_peak','elbow_onset','elbow_peak','release'];
    const METRICS={
        onset:{label:'起始定義（手肘開始伸展－膝伸展最快）',from:'knee_peak',to:'elbow_onset'},
        peak:{label:'峰值定義（手肘伸展最快－膝伸展最快）',from:'knee_peak',to:'elbow_peak'}
    };
    const fail=message=>{throw new Error(message);};
    const finite=v=>typeof v==='number'&&Number.isFinite(v);
    const num=v=>v===''||v===null||v===undefined?null:(Number.isFinite(Number(v))?Number(v):null);
    // Half away from zero, so a bias of -3.75 and +3.75 round symmetrically.
    const round=(v,d=1)=>v===null?null:Math.sign(v)*Math.round(Math.abs(v)*10**d)/10**d;

    function checkFps(captureFps,playbackFps){
        if(!finite(captureFps)||captureFps<24||captureFps>1000)fail('拍攝影格率需介於 24 到 1000');
        if(!finite(playbackFps)||playbackFps<1||playbackFps>captureFps)fail('影片檔影格率需介於 1 到拍攝影格率');
    }
    // A slowed export (e.g. 240 fps footage saved as 30 fps) still has one file frame per
    // captured frame, so file frame index = currentTime x file fps.
    function frameAt(currentTimeSec,playbackFps){return Math.floor(currentTimeSec*playbackFps+1e-3);}
    function timeOfFrame(frame,playbackFps){return (frame+0.5)/playbackFps;}
    function frameMs(frame,captureFps){return frame/captureFps*1000;}

    // System export: c802_trials_*.csv or *_live-trials.csv from the analysis page.
    function parseTrials(table){
        // The analysis page's CSV numbers trialOrder within each condition block, so it can
        // repeat; `id` is unique in both export types and is used as the trial number here.
        const key=table.headers.includes('id')?'id':'trialOrder';
        const need=[key,'trialStatus','dt'];
        for(const h of need)if(!table.headers.includes(h))fail('試次 CSV 缺少欄位 '+h+'，請匯出分析頁的試次 CSV');
        const trials=table.rows.map(r=>{
            const knee=num(r.kneePeakPerfMs),elbowPeak=num(r.elbowPeakPerfMs);
            return {trialOrder:num(r[key]),blockOrder:num(r.trialOrder),condition:r.condition||'',status:r.trialStatus,timestamp:r.timestamp||'',
                onset:num(r.dt),peak:knee!==null&&elbowPeak!==null?round(elbowPeak-knee):null};
        });
        if(trials.some(t=>!Number.isInteger(t.trialOrder)||t.trialOrder<1))fail('試次編號格式錯誤');
        if(new Set(trials.map(t=>t.trialOrder)).size!==trials.length)fail('試次編號重複');
        return trials.sort((a,b)=>a.trialOrder-b.trialOrder);
    }
    // Default: the n-th marked shot is the n-th accepted trial. A person can then fix
    // individual shots, e.g. when the system missed one or fired on a fake.
    function defaultAssignment(shotCount,trials,offset=0){
        const accepted=trials.filter(t=>t.status==='accepted').map(t=>t.trialOrder);
        return Array.from({length:shotCount},(_,i)=>accepted[i+offset] ?? null);
    }
    function referenceDelta(shot,metric,captureFps){
        const {from,to}=METRICS[metric],a=shot.marks?.[from],b=shot.marks?.[to];
        return Number.isInteger(a)&&Number.isInteger(b)?round(frameMs(b-a,captureFps)):null;
    }
    function mean(v){return v.reduce((n,x)=>n+x,0)/v.length;}
    function sd(v){if(v.length<2)return null;const m=mean(v);return Math.sqrt(v.reduce((n,x)=>n+(x-m)**2,0)/(v.length-1));}
    function pearson(x,y){
        if(x.length<3)return null;
        const mx=mean(x),my=mean(y);let sxy=0,sxx=0,syy=0;
        for(let i=0;i<x.length;i++){sxy+=(x[i]-mx)*(y[i]-my);sxx+=(x[i]-mx)**2;syy+=(y[i]-my)**2;}
        return sxx&&syy?sxy/Math.sqrt(sxx*syy):null;
    }
    // Bland-Altman agreement: difference = system - reference.
    function agreement(pairs){
        const n=pairs.length;
        if(!n)return {n:0};
        const sys=pairs.map(p=>p.system),ref=pairs.map(p=>p.reference),diff=pairs.map(p=>p.system-p.reference);
        const bias=mean(diff),s=sd(diff);
        return {n,bias:round(bias),sdDiff:round(s),
            loaLow:s===null?null:round(bias-1.96*s),loaHigh:s===null?null:round(bias+1.96*s),
            mae:round(mean(diff.map(Math.abs))),rmse:round(Math.sqrt(mean(diff.map(d=>d*d)))),
            r:pearson(sys,ref)===null?null:round(pearson(sys,ref),3),
            meanSystem:round(mean(sys)),meanReference:round(mean(ref)),sdSystem:round(sd(sys)),sdReference:round(sd(ref))};
    }
    function compare(state,trials){
        const byOrder=new Map(trials.map(t=>[t.trialOrder,t]));
        const rows=state.shots.map((shot,i)=>{
            const t=shot.systemTrial===null?null:byOrder.get(shot.systemTrial) ?? null;
            const row={shot:i+1,systemTrial:t?.trialOrder ?? null,systemStatus:t?.status ?? 'unpaired',excluded:!!shot.excluded};
            for(const m of Object.keys(METRICS)){
                row[m+'Reference']=referenceDelta(shot,m,state.captureFps);
                row[m+'System']=t&&t.status==='accepted'?t[m]:null;
                row[m+'Difference']=row[m+'Reference']!==null&&row[m+'System']!==null?round(row[m+'System']-row[m+'Reference']):null;
            }
            return row;
        });
        const usable=m=>rows.filter(r=>!r.excluded&&r[m+'Difference']!==null).map(r=>({system:r[m+'System'],reference:r[m+'Reference']}));
        const counts={shots:rows.length,paired:rows.filter(r=>r.systemTrial!==null).length,
            accepted:rows.filter(r=>r.systemStatus==='accepted').length,excluded:rows.filter(r=>r.excluded).length};
        // A pairing is suspicious when the same trial is used twice.
        const used=rows.map(r=>r.systemTrial).filter(v=>v!==null);
        const duplicates=[...new Set(used.filter((v,i)=>used.indexOf(v)!==i))];
        return {rows,counts,duplicates,resolutionMs:round(1000/state.captureFps,2),
            metrics:Object.fromEntries(Object.keys(METRICS).map(m=>[m,agreement(usable(m))]))};
    }
    function newState({videoName='',videoSize=0,captureFps=240,playbackFps=240}={}){
        checkFps(captureFps,playbackFps);
        return {schemaVersion:SCHEMA,video:{name:videoName,size:videoSize},captureFps,playbackFps,shots:[]};
    }
    function restore(input){
        if(!input||input.schemaVersion!==SCHEMA)fail('不是慢動作對照標記檔');
        checkFps(input.captureFps,input.playbackFps);
        if(!Array.isArray(input.shots)||input.shots.length>300)fail('標記資料格式錯誤');
        const shots=input.shots.map(s=>{
            const marks={};
            for(const e of EVENTS){const v=s.marks?.[e];if(v!==undefined&&v!==null){if(!Number.isInteger(v)||v<0)fail('影格編號錯誤');marks[e]=v;}}
            const trial=s.systemTrial===null||s.systemTrial===undefined?null:s.systemTrial;
            if(trial!==null&&(!Number.isInteger(trial)||trial<1))fail('試次編號錯誤');
            return {marks,systemTrial:trial,manualPair:!!s.manualPair,excluded:!!s.excluded,note:String(s.note||'').slice(0,200)};
        });
        return {schemaVersion:SCHEMA,video:{name:String(input.video?.name||''),size:Number(input.video?.size)||0},captureFps:input.captureFps,playbackFps:input.playbackFps,shots};
    }
    function rowsCsv(result){
        const cols=['shot','systemTrial','systemStatus','excluded','onsetReference','onsetSystem','onsetDifference','peakReference','peakSystem','peakDifference'];
        const q=v=>{const s=v===null||v===undefined?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
        return '﻿'+[cols.join(','),...result.rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\r\n');
    }
    return {SCHEMA,EVENTS,METRICS,frameAt,timeOfFrame,frameMs,parseTrials,defaultAssignment,referenceDelta,agreement,compare,newState,restore,rowsCsv,checkFps};
});
