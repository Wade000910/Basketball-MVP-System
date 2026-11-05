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
    const CONFIG={filterHz:10,startKneeDeg:155,startKneeVel:-40,startTorsoVis:0.7,minTorsoVis:0.6,
        endElbowDeg:155,endElbowVel:40,maxRecordMs:1700,cooldownMs:3000,fallbackFps:30};
    const R={shoulder:12,elbow:14,wrist:16,hip:24,knee:26,ankle:28},L={shoulder:11,elbow:13,wrist:15,hip:23,knee:25,ankle:27};

    // frame: {t: ms on the camera clock, landmarks: MediaPipe pose landmarks or null}.
    // push() returns null or {type:'trial', trial} when a shot attempt ends.
    function createDetector({side='right',timestampSource='camera-frame',config={}}={}){
        const c={...CONFIG,...config},idx=side==='left'?L:R;
        const knF=new MotionCore.ButterworthFilter(c.filterHz,c.fallbackFps),ebF=new MotionCore.ButterworthFilter(c.filterHz,c.fallbackFps);
        let state='IDLE',hint='請下蹲準備投籃',lastT=null,prevKn=null,prevEb=null,windowStart=null,windowFrames=0,fps=null,cooldownUntil=0;
        let shot=null;
        const status=(s,h)=>{state=s;hint=h;};
        function finish(trial){
            shot=null;status('COOLDOWN','準備下一球');cooldownUntil=trial.endT+c.cooldownMs;
            return {type:'trial',trial:{...trial,timestampSource,algorithmVersion:ALGORITHM_VERSION}};
        }
        function abort(t,reason){
            const armed=shot&&shot.armed;
            shot=null;
            if(armed)return finish({status:'aborted',reasonCode:reason,dt:null,dtPeak:null,events:null,measuredFps:null,meanVisibility:null,sourceFrameCount:0,endT:t});
            status('IDLE','請下蹲準備投籃');return null;
        }
        function evaluate(t){
            const data=shot.data,result=MotionCore.detectTiming(data);
            const meanInterval=shot.intervals.length?shot.intervals.reduce((a,b)=>a+b,0)/shot.intervals.length:null;
            const measuredFps=meanInterval?Math.round(1000/meanInterval*10)/10:null;
            const meanVisibility=shot.vis.length?Math.round(shot.vis.reduce((a,b)=>a+b,0)/shot.vis.length*1000)/1000:null;
            const base={measuredFps,meanVisibility,sourceFrameCount:data.length,endT:t};
            if(result.reason)return finish({...base,status:'invalid',reasonCode:result.reason,dt:null,dtPeak:null,events:null});
            const flags=ExperimentCore.qualityFlags(measuredFps,meanVisibility),ok=flags==='OK';
            const e=result.events;
            return finish({...base,status:ok?'accepted':'low_quality',reasonCode:ok?'':flags,dt:result.dt,dtPeak:e.elbowPeakPerfMs-e.kneePeakPerfMs,events:e});
        }
        function push({t,landmarks}){
            if(!Number.isFinite(t)||(lastT!==null&&t<=lastT))return null; // repeated or out-of-order frame
            if(windowStart===null)windowStart=t;
            windowFrames++;
            if(t-windowStart>=1000){fps=windowFrames*1000/(t-windowStart);knF.update(c.filterHz,fps);ebF.update(c.filterHz,fps);windowStart=t;windowFrames=0;}
            const dtSec=lastT===null?null:(t-lastT)/1000;
            lastT=t;
            if(state==='COOLDOWN'){if(t<cooldownUntil)return null;status('IDLE','請下蹲準備投籃');}
            if(!Array.isArray(landmarks)||landmarks.length<29){hint='找不到身體';return state==='RECORDING'?abort(t,'POSE_LANDMARKS_MISSING'):null;}
            const torso=(landmarks[11].visibility+landmarks[12].visibility+landmarks[23].visibility+landmarks[24].visibility)/4;
            if(!(torso>=c.minTorsoVis)){hint='身體辨識度不足';return state==='RECORDING'?abort(t,'TORSO_VISIBILITY_LOW'):null;}
            const sideVis=[idx.shoulder,idx.elbow,idx.wrist,idx.hip,idx.knee,idx.ankle].reduce((n,i)=>n+(landmarks[i].visibility||0),0)/6;
            const rawEb=MotionCore.calculateAngle(landmarks[idx.shoulder],landmarks[idx.elbow],landmarks[idx.wrist]);
            const rawKn=MotionCore.calculateAngle(landmarks[idx.hip],landmarks[idx.knee],landmarks[idx.ankle]);
            if(!Number.isFinite(rawEb)||!Number.isFinite(rawKn)){
                if(state!=='RECORDING')return null;
                if(shot.armed){shot.data.push({t,kn:rawKn,eb:rawEb});return evaluate(t);}
                return abort(t,'NONFINITE_ANGLE');
            }
            const sKn=knF.filter(rawKn),sEb=ebF.filter(rawEb);
            const knV=dtSec&&prevKn!==null?(sKn-prevKn)/dtSec:0,ebV=dtSec&&prevEb!==null?(sEb-prevEb)/dtSec:0;
            prevKn=sKn;prevEb=sEb;
            if(state==='IDLE'){
                if(sKn<c.startKneeDeg&&knV<c.startKneeVel&&torso>c.startTorsoVis){
                    shot={data:[],vis:[],intervals:[],armed:false,lastFrameT:null};status('RECORDING','動作擷取中');
                }else{hint='請下蹲準備投籃';return null;}
            }
            // RECORDING
            shot.data.push({t,kn:sKn,eb:sEb});shot.vis.push(sideVis);
            if(shot.lastFrameT!==null)shot.intervals.push(t-shot.lastFrameT);
            shot.lastFrameT=t;
            if(ExperimentCore.hasRaisedArm(landmarks))shot.armed=true;
            if((sEb>c.endElbowDeg&&ebV<c.endElbowVel)||t-shot.data[0].t>c.maxRecordMs){
                if(shot.armed)return evaluate(t);
                shot=null;status('IDLE','未確認出手，請再投一次');
            }
            return null;
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
    return {ALGORITHM_VERSION,CONFIG,REFERENCE,RESULTS,createDetector,personalReference,judge,createResultLog,setSummary};
});
