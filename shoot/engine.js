// Player shooting page logic, kept free of the DOM so it runs under Node tests.
//
// Detector: the research page's capture state machine (same thresholds and filter),
// fed with camera-frame timestamps instead of pose-result arrival times. Each detected
// shot yields both timing definitions: onset (elbow starts extending - knee fastest)
// and peak (elbow fastest - knee fastest). The player sees the peak definition, which
// the simulation found less sensitive to noise.
//
// Results: make/miss entries from taps, voice and a teammate's phone, with duplicate
// suppression and linking to the motion trial they belong to.
(function(root,factory){
    const deps=typeof module==='object'&&module.exports
        ?{MotionCore:require('../專題程式/motion-core.js'),ExperimentCore:require('../專題程式/experiment-core.js')}
        :{MotionCore:root.MotionCore,ExperimentCore:root.ExperimentCore};
    const api=factory(deps);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
    'use strict';
    const {MotionCore,ExperimentCore}=deps;
    const ALGORITHM_VERSION='player-peak-v1';
    const R={shoulder:12,elbow:14,wrist:16,hip:24,knee:26,ankle:28},L={shoulder:11,elbow:13,wrist:15,hip:23,knee:25,ankle:27};

    // A line-by-line port of onResults() in 專題程式/index.html (timing-validity-v3):
    // same thresholds, same filter start values and per-second rate update, same states
    // (IDLE -> RECORDING -> PROCESSING -> DELAY -> FEEDBACK -> 2 s cooldown -> IDLE), and
    // the filters keep running in every state, as on the research page. tests/
    // shoot-equivalence.test.js runs both on the same frames and requires equal results.
    // Differences, all outside the timing logic:
    //  - frames are timed by the camera clock when available; a repeated or older camera
    //    timestamp is dropped (the research page's clock never repeats);
    //  - the 2 s cooldown runs on frame time instead of a wall-clock setTimeout;
    //  - the result also carries the peak interval, elbow peak minus knee peak.
    // frame: {t: ms, landmarks: MediaPipe pose landmarks or null}.
    // push() returns null, or {type:'trial', trial} at the frame where the research page
    // gives feedback (about 1 s after release), or at once for an interrupted attempt.
    function createDetector({side='right',timestampSource='camera-frame'}={}){
        const idx=side==='left'?L:R;
        const knFilter=new MotionCore.ButterworthFilter(10,30),ebFilter=new MotionCore.ButterworthFilter(10,30);
        let state='IDLE',hint='請下蹲準備投籃',lastT=0,started=false,lastFpsT=null,frames=0,fps=null;
        let prevKn=180,prevEb=180,recEndT=0,cooldownUntil=null,pending=null;
        let shotData=[],shotVisibility=[],shotFrameIntervals=[],lastShotFrameT=null,armRaisedConfirmed=false;
        const out=trial=>({type:'trial',trial:{...trial,timestampSource,algorithmVersion:ALGORITHM_VERSION}});
        function resetProvisionalShot(text){state='IDLE';shotData=[];shotVisibility=[];shotFrameIntervals=[];lastShotFrameT=null;armRaisedConfirmed=false;hint=text;}
        function aborted(reasonCode,t){
            return armRaisedConfirmed?out({status:'aborted',reasonCode,dt:null,dtPeak:null,events:null,measuredFps:null,meanVisibility:null,sourceFrameCount:shotData.length,endT:t}):null;
        }
        function processData(){
            const result=MotionCore.detectTiming(shotData);
            const meanFrameInterval=shotFrameIntervals.length?shotFrameIntervals.reduce((a,b)=>a+b,0)/shotFrameIntervals.length:null;
            const measuredFps=meanFrameInterval?1000/meanFrameInterval:null;
            const meanVisibility=shotVisibility.length?shotVisibility.reduce((a,b)=>a+b,0)/shotVisibility.length:null;
            const base={measuredFps,meanVisibility,sourceFrameCount:shotData.length,endT:recEndT};
            if(result.reason)return {...base,measuredFps:null,meanVisibility:null,status:'invalid',reasonCode:result.reason,dt:null,dtPeak:null,events:null}; // research page stores no rate for invalid trials
            const flags=ExperimentCore.qualityFlags(measuredFps,meanVisibility),qualityOk=flags==='OK',e=result.events;
            return {...base,status:qualityOk?'accepted':'low_quality',reasonCode:qualityOk?'':flags,dt:result.dt,dtPeak:e.elbowPeakPerfMs-e.kneePeakPerfMs,events:e};
        }
        function push({t,landmarks}){
            if(!Number.isFinite(t)||(started&&t<=lastT))return null;
            started=true;
            if(lastFpsT===null)lastFpsT=t;
            frames++;
            if(t-lastFpsT>=1000){fps=frames;knFilter.update(10,frames>0?frames:30);ebFilter.update(10,frames>0?frames:30);frames=0;lastFpsT=t;}
            if(state==='COOLDOWN'&&t>=cooldownUntil){state='IDLE';hint='請下蹲準備投籃';}
            const l=landmarks;
            if(!Array.isArray(l)||l.length<29){
                let ev=null;
                if(state==='RECORDING'){ev=aborted('POSE_LANDMARKS_MISSING',t);resetProvisionalShot('找不到身體，請重新進入畫面');}
                lastT=t;return ev;
            }
            const torsoVis=(l[11].visibility+l[12].visibility+l[23].visibility+l[24].visibility)/4;
            if(torsoVis<0.6){
                let ev=null;
                if(state==='RECORDING'){ev=aborted('TORSO_VISIBILITY_LOW',t);resetProvisionalShot('身體辨識度不足');}
                lastT=t;return ev;
            }
            const ebIdx=[idx.shoulder,idx.elbow,idx.wrist],knIdx=[idx.hip,idx.knee,idx.ankle];
            const sideVis=[...ebIdx,...knIdx].reduce((sum,i)=>sum+(l[i].visibility||0),0)/6;
            const rawEb=MotionCore.calculateAngle(l[ebIdx[0]],l[ebIdx[1]],l[ebIdx[2]]);
            const rawKn=MotionCore.calculateAngle(l[knIdx[0]],l[knIdx[1]],l[knIdx[2]]);
            if(!Number.isFinite(rawEb)||!Number.isFinite(rawKn)){
                if(state==='RECORDING'){
                    shotData.push({t,kn:rawKn,eb:rawEb});
                    if(armRaisedConfirmed){state='PROCESSING';recEndT=t;}
                    else resetProvisionalShot('無法辨識動作，請重新投籃');
                    lastT=t;return null;
                }
                if(state==='IDLE'){lastT=t;return null;}
            }
            const sEb=Number.isFinite(rawEb)?ebFilter.filter(rawEb):prevEb;
            const sKn=Number.isFinite(rawKn)?knFilter.filter(rawKn):prevKn;
            const dtSec=(t-lastT)/1000,knV=(sKn-prevKn)/dtSec;
            let ev=null;
            switch(state){
                case 'IDLE':
                    hint='請下蹲準備投籃';
                    if(sKn<155&&knV<-40&&torsoVis>0.7){state='RECORDING';hint='動作擷取中';shotData=[];shotVisibility=[];shotFrameIntervals=[];lastShotFrameT=null;armRaisedConfirmed=false;}
                    break;
                case 'RECORDING':
                    shotData.push({t,kn:sKn,eb:sEb});shotVisibility.push(sideVis);
                    if(lastShotFrameT!==null)shotFrameIntervals.push(t-lastShotFrameT);
                    lastShotFrameT=t;
                    if(ExperimentCore.hasRaisedArm(l))armRaisedConfirmed=true;
                    if((sEb>155&&(sEb-prevEb)/dtSec<40)||(t-shotData[0].t>1700)){
                        if(armRaisedConfirmed){state='PROCESSING';recEndT=t;}
                        else resetProvisionalShot('未確認出手，請再投一次');
                    }
                    break;
                case 'PROCESSING':
                    hint='計算中';pending=processData();state='DELAY';
                    break;
                case 'DELAY':
                    if(t-recEndT>1000)state='FEEDBACK';
                    break;
                case 'FEEDBACK':
                    ev=out(pending);pending=null;armRaisedConfirmed=false;state='COOLDOWN';hint='準備下一球';cooldownUntil=t+2000;
                    break;
            }
            prevEb=sEb;prevKn=sKn;lastT=t;
            return ev;
        }
        return {push,get state(){return state;},get hint(){return hint;},get fps(){return fps;}};
    }

    // Personal rhythm reference: the player's own made shots (peak definition, accepted
    // only). This is a consistency cue, not a validated optimal range.
    const REFERENCE={minMade:5,maxMade:20,minHalfWidthMs:15};
    function personalReference(madePeaks){
        const v=madePeaks.filter(Number.isFinite).slice(-REFERENCE.maxMade);
        if(v.length<REFERENCE.minMade)return {ready:false,needed:REFERENCE.minMade-v.length,count:v.length};
        const mean=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/(v.length-1));
        const half=Math.max(sd,REFERENCE.minHalfWidthMs);
        return {ready:true,count:v.length,mean:Math.round(mean),sd:Math.round(sd*10)/10,low:Math.round(mean-half),high:Math.round(mean+half)};
    }
    function judge(dtPeak,reference){
        if(!Number.isFinite(dtPeak)||!reference||!reference.ready)return null;
        return dtPeak>=reference.low&&dtPeak<=reference.high?'steady':'off';
    }

    // Make/miss entries. Voice and a teammate may both report the same shot, so an entry
    // that arrives within dedupMs of the previous one, with no new motion trial in
    // between, is treated as the same shot. A trial waits up to linkMs for its result.
    const RESULTS={dedupMs:3000,linkMs:15000};
    function createResultLog(options={}){
        const o={...RESULTS,...options};
        let lastAt=null,lastMade=null,lastTrialAt=null,pending=null;
        return {
            trial(trial,at){lastTrialAt=at;pending=trial.status==='aborted'?null:{trial,at};},
            // Returns {accepted:false, reason} or {accepted:true, trial|null}.
            result(made,source,at){
                if(lastAt!==null&&at-lastAt<o.dedupMs&&(lastTrialAt===null||lastTrialAt<=lastAt))
                    return {accepted:false,reason:made===lastMade?'duplicate':'conflict'};
                lastAt=at;lastMade=made;
                const trial=pending&&at-pending.at<=o.linkMs?pending.trial:null;
                pending=null;
                return {accepted:true,trial,source};
            },
            get pending(){return pending?.trial || null;}
        };
    }

    // Summary of one set for the end screen and the coach export.
    function setSummary(session,run){
        const trials=run?run.trials:[];
        const byShot=new Map(trials.filter(t=>t.shotId).map(t=>[t.shotId,t]));
        const rows=session.shots.map((s,i)=>{const t=byShot.get(s.id);return {order:i+1,id:s.id,made:s.made,source:s.source||'manual',
            trialStatus:t?t.trialStatus:'none',dtPeak:t&&t.trialStatus==='accepted'&&Number.isFinite(t.dtPeak)?t.dtPeak:null};});
        const peaks=rows.filter(r=>r.dtPeak!==null);
        const mean=v=>v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null;
        const sd=v=>{if(v.length<2)return null;const m=v.reduce((a,b)=>a+b,0)/v.length;return Math.round(Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(v.length-1))*10)/10;};
        const made=rows.filter(r=>r.made).length;
        return {rows,total:rows.length,made,percentage:rows.length?Math.round(made/rows.length*1000)/10:null,
            measured:peaks.length,meanPeak:mean(peaks.map(r=>r.dtPeak)),sdPeak:sd(peaks.map(r=>r.dtPeak)),
            madeMeanPeak:mean(peaks.filter(r=>r.made).map(r=>r.dtPeak)),missedMeanPeak:mean(peaks.filter(r=>!r.made).map(r=>r.dtPeak)),
            unmatchedTrials:trials.filter(t=>!t.shotId&&t.trialStatus!=='aborted').length};
    }
    return {ALGORITHM_VERSION,REFERENCE,RESULTS,createDetector,personalReference,judge,createResultLog,setSummary};
});
