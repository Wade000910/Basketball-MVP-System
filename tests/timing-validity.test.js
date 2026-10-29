const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../專題程式/experiment-core.js');
const html=fs.readFileSync(path.join(__dirname,'../專題程式/index.html'),'utf8');
function runtime() {
    const c={shotData:Array.from({length:11},(_,i)=>({t:i*10,kn:90,eb:90})),timingReason:'',velocityChart:{data:{datasets:[{},{}]},update(){}}};
    vm.createContext(c);
    vm.runInContext(html.slice(html.indexOf('function createSpline'),html.indexOf('const {TIMING_DEFINITION')),c);
    vm.runInContext(html.slice(html.indexOf('function processData'),html.indexOf('function onResults')),c);
    return c;
}
test('real spline rejects constant, nonfinite, short and duplicate-time recordings',()=>{
    for(const [change,reason] of [
        [()=>{},'KNEE_EXTENSION_NOT_FOUND'],
        [c=>c.shotData[4].kn=NaN,'NONFINITE_SAMPLE'],
        [c=>c.shotData[4].eb=Infinity,'NONFINITE_SAMPLE'],
        [c=>c.shotData.pop() && c.shotData.pop(),'INSUFFICIENT_SAMPLES'],
        [c=>c.shotData[4].t=c.shotData[3].t,'INVALID_TIMESTAMPS']
    ]) {const c=runtime();change(c);assert.equal(c.processData(),null);assert.equal(c.timingReason,reason);}
});
function events(c,onset=30,kneePeak=30) {
    let call=0;
    c.createSpline=()=>{
        const knee=call++===0;
        const values=[90];
        for(let t=1;t<=100;t++) values[t]=values[t-1]+.001*(knee ? (t===kneePeak?100:20) : (t<=onset?0:t<=60?(t-onset)*10:20));
        return t=>values[Math.max(0,Math.min(100,t))];
    };
}
test('two confirmed events retain true zero and signed delta',()=>{
    for(const [onset,knee,delta] of [[30,30,0],[40,30,10],[20,30,-10]]) {
        const c=runtime();events(c,onset,knee);assert.equal(c.processData(),delta);assert.equal(c.timingReason,'');
        assert.equal(c.timingEvents.kneePeakPerfMs,knee);
        assert.equal(c.timingEvents.elbowOnsetPerfMs,onset);
        assert.equal(c.timingEvents.elbowPeakPerfMs,60);
        assert.equal(c.timingEvents.elbowOnsetPerfMs-c.timingEvents.kneePeakPerfMs,delta);
    }
});

test('a rejected recording clears event estimates from the previous trial',()=>{
    const c=runtime();events(c,40,30);
    assert.equal(c.processData(),10);
    assert.ok(c.timingEvents);
    c.shotData[4].eb=NaN;
    assert.equal(c.processData(),null);
    assert.equal(c.timingEvents,null);
});
test('missing onset and a truncated peak are rejected rather than replaced',()=>{
    const c=runtime();events(c,0,30);assert.equal(c.processData(),null);assert.equal(c.timingReason,'ELBOW_ONSET_NOT_FOUND');
    const d=runtime();events(d,30,100);assert.equal(d.processData(),null);assert.equal(d.timingReason,'PEAK_AT_WINDOW_END');
});
test('real spline rejects a maximum plateau continuing through the last sample',()=>{
    const c=runtime();
    c.shotData=Array.from({length:11},(_,i)=>({t:i*10,kn:90+i*1.25,eb:90+Math.max(0,Math.min(60,i*10)-30)*.25}));
    assert.equal(c.processData(),null);
    assert.equal(c.timingReason,'PEAK_AT_WINDOW_END');
});
test('invalid timing is excluded; low-quality timing gets no feedback; true zero enters numeric branch',()=>{
    const start=html.indexOf("case 'FEEDBACK':");
    const code=html.slice(start,html.indexOf('prevEb=sEb',start));
    for(const value of [null,0]) {
        const rows=[],captures=[],sounds=[],stats=[];
        const c={timingEvents:{kneePeakPerfMs:100,elbowOnsetPerfMs:100,elbowPeakPerfMs:150},calcDt:value,modeSel:{value:'auditory'},currentShotContext:{blockId:'B'},currentShotSide:'right',shotHistory:rows,shotData:[],shotFrameIntervals:[20,20],shotVisibility:[0.9,0.9],timingReason:'NONFINITE_SAMPLE',sameExperimentalBlock:core.sameExperimentalBlock,maskForBaseline:core.maskForBaseline,qualityFlags:core.qualityFlags,calculateSD:v=>{stats.push(v);return core.calculateSD(v);},localCapture:{trials:captures,recordTrial:r=>captures.push(r)},beep:(...v)=>sounds.push(v),dtDisp:{},sdDisp:{},cvDisp:{},vBar:{style:{}},document:{getElementById:()=>({style:{}}),createElement:()=>({})},hBody:{insertBefore(){}},updateUI(){},setTimeout(){},setContextControlsDisabled(){}};
        vm.createContext(c);vm.runInContext('switch("FEEDBACK"){'+code,c);
        assert.equal(rows.length,1);assert.equal(captures.length,1);
        assert.equal(rows[0].dt,value);assert.equal(rows[0].trialStatus,value===null?'invalid':'accepted');
        assert.equal(rows[0].eventDefinitionId,core.TIMING_DEFINITION.id);
        assert.equal(rows[0].timingClock,core.TIMING_DEFINITION.clock);
        assert.equal(rows[0].kneePeakPerfMs,value===null?null:100);
        assert.equal(rows[0].elbowOnsetPerfMs,value===null?null:100);
        assert.equal(sounds.length,value===null?0:1);assert.equal(stats.length,value===null?0:1);
    }
    const rows=[],captures=[],sounds=[],stats=[];
    const c={timingEvents:{kneePeakPerfMs:100,elbowOnsetPerfMs:175,elbowPeakPerfMs:200},calcDt:75,modeSel:{value:'auditory'},currentShotContext:{blockId:'B'},currentShotSide:'right',shotHistory:rows,shotData:[],shotFrameIntervals:[50],shotVisibility:[0.9],timingReason:'',sameExperimentalBlock:core.sameExperimentalBlock,maskForBaseline:core.maskForBaseline,qualityFlags:core.qualityFlags,calculateSD:v=>{stats.push(v);return core.calculateSD(v);},localCapture:{trials:captures,recordTrial:r=>captures.push(r)},beep:(...v)=>sounds.push(v),dtDisp:{},sdDisp:{},cvDisp:{},vBar:{style:{}},document:{getElementById:()=>({style:{}}),createElement:()=>({})},hBody:{insertBefore(){}},updateUI(){},setTimeout(){},setContextControlsDisabled(){}};
    vm.createContext(c);vm.runInContext('switch("FEEDBACK"){'+code,c);
    assert.equal(rows[0].trialStatus,'low_quality');assert.equal(rows[0].result,'not_evaluated_low_quality');
    assert.equal(rows[0].elbowOnsetPerfMs-rows[0].kneePeakPerfMs,75);
    assert.equal(sounds.length,0);assert.equal(stats[0].length,0);
});
