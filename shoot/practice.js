// One practice set on the shooting page: the training session (make/miss per shot) and
// its motion run (one trial per detected shot), kept together and validated with the
// same rules as the training page. Finishing a set moves it into the training history
// and the motion store on this device, so history, reports, sync and the coach view work
// unchanged.
(function(root,factory){
    const deps=typeof module==='object'&&module.exports
        ?{C:require('../training/core.js'),A:require('../training/analysis-store.js')}
        :{C:root.TrainingCore,A:root.TrainingAnalysis};
    const api=factory(deps);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootPractice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
    'use strict';
    const {C,A}=deps;
    const SCHEMA='basketball-shoot-active-v1',KEY=SCHEMA,TRAINING_KEY='basketball-training-v1',HISTORY_LIMIT=30,RUN_LIMIT=30;
    const fail=m=>{throw new Error(m);};
    function check(p){
        if(!p||p.schemaVersion!==SCHEMA||!p.session||!p.run)fail('投籃紀錄格式不符。');
        C.validateSession({...p.session,analysisRuns:[p.run]});
        if(!['left','right'].includes(p.run.shootingSide))fail('投籃手設定不符。');
        if(!Number.isInteger(p.lastMarkId)||p.lastMarkId<0)fail('隊友紀錄位置不符。');
        return p;
    }
    function newPractice({playerCode,targetShots,side,sound,id,now=new Date().toISOString()}){
        const session=C.createSession({playerCode,targetShots,drill:'free_throw',position:'center',note:'',id,now});
        // Sound on: auditory feedback plus the number on screen. Sound off: screen only.
        const run={schemaVersion:A.SCHEMA,id:'run-'+id,participantId:session.playerCode,sessionId:session.id,blockId:'SHOOT',
            condition:sound?'auditory':'visual',shootingSide:side,startedAt:now,stoppedAt:now,trials:[]};
        return check({schemaVersion:SCHEMA,session,run,lastMarkId:0});
    }
    const touch=(run,now)=>({...run,stoppedAt:Date.parse(now)>Date.parse(run.stoppedAt)?now:run.stoppedAt});
    // trial: from ShootEngine.createDetector. Returns {practice, trialOrder}.
    function addTrial(p,trial,now=new Date().toISOString()){
        if(p.run.trials.length>=200)fail('每組最多記錄 200 次動作。');
        const trialOrder=p.run.trials.length+1;
        const accepted=trial.status==='accepted';
        const t={trialOrder,trialStatus:trial.status,dt:Number.isFinite(trial.dt)?trial.dt:null,timestamp:now,reasonCode:trial.reasonCode||'',
            timestampSource:trial.timestampSource,algorithmVersion:trial.algorithmVersion};
        if(Number.isFinite(trial.dtPeak))t.dtPeak=trial.dtPeak;
        if(Number.isFinite(trial.measuredFps))t.measuredFps=trial.measuredFps;
        if(accepted&&!Number.isFinite(t.dt))fail('動作試次格式不符。');
        return {practice:check({...p,run:touch({...p.run,trials:[...p.run.trials,t]},now)}),trialOrder};
    }
    function addResult(p,{made,source,shotId,trialOrder=null,now=new Date().toISOString()}){
        let session=C.addShot(p.session,made,shotId,now,source);
        let run=touch(p.run,now);
        if(trialOrder!==null){
            const t=run.trials.find(x=>x.trialOrder===trialOrder);
            if(t&&!t.shotId)run={...run,trials:run.trials.map(x=>x===t?{...x,shotId}:x)};
        }
        return check({...p,session,run});
    }
    const correct=(p,shotId,made)=>check({...p,session:C.correctShot(p.session,shotId,made)});
    // Removing a shot keeps its motion trial; the dangling link is ignored by pairing.
    const remove=(p,shotId)=>check({...p,session:C.removeShot(p.session,shotId)});
    const withMarks=(p,lastMarkId)=>check({...p,lastMarkId});
    function restore(text){return check(JSON.parse(text));}
    const combined=p=>({...p.session,analysisRuns:[p.run]});

    // Returns the new texts for the training store and the motion store.
    function finish(p,trainingText,analysisText,now=new Date().toISOString()){
        const session=C.finishSession(p.session,now);
        const store=trainingText?C.parseStore(trainingText):{schemaVersion:C.SCHEMA,active:null,history:[]};
        if(store.history.some(s=>s.id===session.id))fail('這組已經存過了。');
        const history=[session,...store.history].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,HISTORY_LIMIT);
        const runs=A.merge(analysisText?A.parse(analysisText):[],[touch(p.run,now)]).slice(0,RUN_LIMIT);
        return {training:JSON.stringify({schemaVersion:C.SCHEMA,active:store.active,history}),analysis:JSON.stringify(runs),session};
    }
    // Peak intervals of this player's past made shots, oldest first, for the rhythm reference.
    function pastMadePeaks(playerCode,trainingText,analysisText){
        let history=[],runs=[];
        try{history=trainingText?C.parseStore(trainingText).history:[];}catch{history=[];}
        try{runs=analysisText?A.parse(analysisText):[];}catch{runs=[];}
        const out=[];
        for(const s of [...history].filter(s=>s.playerCode===playerCode&&s.drill==='free_throw').sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt))){
            const own=A.forSession(s,runs);
            for(const pr of A.pair(s.shots,own))if(pr.made&&pr.trial&&pr.trial.trialStatus==='accepted'&&Number.isFinite(pr.trial.dtPeak))out.push(pr.trial.dtPeak);
        }
        return out;
    }
    return {SCHEMA,KEY,TRAINING_KEY,newPractice,addTrial,addResult,correct,remove,withMarks,restore,combined,finish,pastMadePeaks};
});
