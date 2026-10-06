const test = require('node:test');
const assert = require('node:assert/strict');
const {LocalSessionCapture} = require('../專題程式/session-capture.js');
const R = require('../offline-review/core.js');

async function fixture() {
    class Recorder {
        static isTypeSupported() { return true; }
        constructor() { this.mimeType='video/webm';this.state='inactive';this.listeners={}; }
        addEventListener(k,cb) {this.listeners[k]=cb;}
        start() {this.state='recording';}
        stop() {this.state='inactive';this.listeners.dataavailable({data:new Blob(['synthetic'],{type:'video/webm'})});this.listeners.stop();}
    }
    const context={participantId:'TEST',sessionId:'S1',blockId:'B1',condition:'auditory',shootingSide:'right'};
    const c = new LocalSessionCapture({MediaRecorderClass:Recorder});
    c.start({stream:{getVideoTracks:()=>[{}]},context,buildId:'test',algorithmVersion:'experiment-readiness-v1'});
    for (const ms of [1000,1037,1100]) {
        const id=c.recordPresentedFrame({sourceTimestampMs:ms,timestampSource:'mediaTime',width:640,height:480});
        const inf=c.beginInference({sourceTimestampMs:ms+2,presentedFrameIndex:id});
        c.recordLandmarks(inf,[{x:.3,y:.4,z:0,visibility:.9}]);
        c.recordSignal(inf,{rawElbowDeg:120,rawKneeDeg:100,filteredElbowDeg:121,filteredKneeDeg:101,sideVisibility:.9,state:'RECORDING'});
        c.completeInference(inf);
    }
    for (const id of [1,2]) c.recordTrial({id,...context,dt:50,trialStatus:'accepted',qualityFlags:'OK'});
    const output=await c.stop();
    return Object.entries(output).map(([name,b])=>({name,size:b.size,text:()=>b.text()}));
}
async function alter(files,suffix,change) {
    const f=files.find(f=>f.name.endsWith(suffix));
    const blob=new Blob([change(await f.text())]);f.size=blob.size;f.text=()=>blob.text();
    if(suffix!=='_manifest.json') {
        const mf=files.find(f=>f.name.endsWith('_manifest.json'));
        const m=JSON.parse(await mf.text());m.files.find(e=>e.name===f.name).sizeBytes=f.size;
        const mb=new Blob([JSON.stringify(m)]);mf.size=mb.size;mf.text=()=>mb.text();
    }
}
test('offline import reads unchanged capture format and variable frame intervals',async()=>{
    const s=await R.readSession(await fixture());
    assert.deepEqual(s.frames.map(f=>f.sourceTimestampMs),[1000,1037,1100]);
    assert.equal(R.sampleForFrame(s,s.frames[1],5).signal.filteredKneeDeg,101);
    assert.equal(R.sampleForFrame(s,s.frames[1],1),null);
});
test('CSV supports multiline and escaped quotes and rejects damaged records',()=>{
    assert.deepEqual(R.parseCsv('a,b\r\n"hello, world","line\n""quote"""\r\n').rows,[{a:'hello, world',b:'line\n"quote"'}]);
    assert.throws(()=>R.parseCsv('a,a\n1,2'),/重複/);
    assert.throws(()=>R.parseCsv('a,b\n"unfinished'),/未結束/);
    assert.throws(()=>R.parseCsv('a,b\n1'),/不一致/);
});
test('import rejects missing files, mixed file names, sizes and counts',async()=>{
    let f=await fixture();await assert.rejects(R.readSession(f.slice(1)),/八份|不符合/);
    f=await fixture();f[0].size++;await assert.rejects(R.readSession(f),/大小/);
    f=await fixture();await alter(f,'_manifest.json',t=>{const m=JSON.parse(t);m.counts.signalRows++;return JSON.stringify(m);});
    await assert.rejects(R.readSession(f),/筆數/);
    f=await fixture();f[0].name='other_source-video.webm';await assert.rejects(R.readSession(f),/名稱/);
});
test('import rejects mixed trial context and orphaned inference',async()=>{
    let f=await fixture();await alter(f,'_live-trials.csv',t=>t.replace('"S1"','"other"'));await assert.rejects(R.readSession(f),/不同 Session/);
    f=await fixture();await alter(f,'_inference-timestamps.csv',t=>t.replace('"1002","1"','"1002","99"'));await assert.rejects(R.readSession(f),/不存在/);
});
test('import rejects blank time, repeated frames and mismatched landmark time',async()=>{
    let f=await fixture();await alter(f,'_frame-timestamps.csv',t=>t.replace('"1000"','""'));await assert.rejects(R.readSession(f),/缺少/);
    f=await fixture();await alter(f,'_frame-timestamps.csv',t=>t.replace('"2","1037"','"1","1037"'));await assert.rejects(R.readSession(f),/重複/);
    f=await fixture();await alter(f,'_landmarks.csv',t=>t.replace('"1002"','"1003"'));await assert.rejects(R.readSession(f),/不匹配/);
});
test('manual time alignment rejects video bounds rather than clamping',()=>{
    assert.equal(R.mappedTime(1037,1000,20,150),57);
    assert.equal(R.mappedTime(900,1000,20,150),null);
    assert.equal(R.mappedTime(1200,1000,20,150),null);
    assert.throws(()=>R.mappedTime('',1000,20,150),/缺少/);
});
test('annotations require alignment and stay bound to session/trial/frame',async()=>{
    const s=await R.readSession(await fixture()),a=new R.Annotations(s);
    assert.throws(()=>a.mark(1,'knee_peak',s.frames[0],{}),/對齊/);
    a.mark(1,'knee_peak',s.frames[0],{confirmed:true});
    a.mark(1,'elbow_onset',s.frames[2],{confirmed:true});
    assert.equal(a.delta(1),100);assert.equal(a.delta(2),null);assert.deepEqual(a.forTrial(2),[]);
    a.mark(2,'knee_peak',s.frames[2],{confirmed:true});a.mark(2,'elbow_onset',s.frames[0],{confirmed:true});assert.equal(a.delta(2),-100);
    assert.throws(()=>a.mark(1,'release',{...s.frames[0]},{confirmed:true}),/不屬於/);
    assert.equal(new R.Annotations(s).rows.size,0);
});
test('blind export excludes live results and stores exact sign convention',async()=>{
    const s=await R.readSession(await fixture()),a=new R.Annotations(s);
    const out=a.export({confirmed:true,anchorSourceMs:1000,anchorVideoMs:0},true);
    assert.equal(out.signConvention,'elbow_onset_source_ms - knee_peak_source_ms');
    assert.equal(out.annotationMode,'algorithm-hidden');
    assert.deepEqual(out.timingValidation,{validated:false,model:'single-anchor-offset',driftChecked:false,uncertaintyMs:null});
    assert.ok(out.comparison.every(r=>!('liveDeltaTMs' in r)&&!('differenceMs' in r)));
});
module.exports={fixture};

test('binary time lookup respects boundaries and nonuniform intervals',()=>{
    const frames=[{sourceTimestampMs:10},{sourceTimestampMs:20},{sourceTimestampMs:100}];
    assert.equal(R.nearestFrameIndex(frames,9),null);assert.equal(R.nearestFrameIndex(frames,101),null);
    assert.equal(R.nearestFrameIndex(frames,15),0);assert.equal(R.nearestFrameIndex(frames,90),2);
    assert.throws(()=>R.nearestFrameIndex(frames,NaN),/有效/);
});
test('annotation undo/redo preserves replacements and resets redo on a new edit',async()=>{
    const s=await R.readSession(await fixture()),a=new R.Annotations(s),alignment={confirmed:true};
    a.mark(1,'release',s.frames[0],alignment);a.mark(1,'release',s.frames[1],alignment);
    a.undo();assert.equal(a.forTrial(1)[0].sourceFrameIndex,1);
    a.redo();assert.equal(a.forTrial(1)[0].sourceFrameIndex,2);
    a.remove(1,'release');assert.equal(a.forTrial(1).length,0);a.undo();assert.equal(a.forTrial(1).length,1);
    a.mark(2,'release',s.frames[2],alignment);assert.equal(a.redo(),null);
});
test('annotation reload validates provenance, alignment, frames and exposure',async()=>{
    const s=await R.readSession(await fixture()),a=new R.Annotations(s);
    const alignment={confirmed:true,method:'user-selected-correspondence',anchorSourceMs:1000,anchorVideoMs:0};
    a.mark(1,'knee_peak',s.frames[0],alignment,{videoTimeMs:0,displayedMediaTimeMs:0,algorithmVisible:true});
    a.mark(1,'elbow_onset',s.frames[1],alignment);
    const out=a.export(alignment,true);assert.equal(out.annotationMode,'assisted');
    const restored=R.restoreAnnotations(s,out,1000);assert.equal(restored.notes.delta(1),37);assert.equal(restored.assisted,true);
    const bad=structuredClone(out);bad.annotations[0].sourceTimestampMs++;assert.throws(()=>R.restoreAnnotations(s,bad,1000),/影格與時間/);
    const other=structuredClone(out);other.context.sessionId='other';assert.throws(()=>R.restoreAnnotations(s,other,1000),/Session/);
    const offset=structuredClone(out);offset.alignment.anchorVideoMs=2000;assert.throws(()=>R.restoreAnnotations(s,offset,1000),/範圍/);
    const list=structuredClone(out);list.sourceFiles[0].sizeBytes++;assert.throws(()=>R.restoreAnnotations(s,list,1000),/來源清單/);
    assert.equal(a.delta(1),37);
});
test('numeric import rejects whitespace and hexadecimal values',async()=>{
    for(const value of [' ','0x10']){
        const files=await fixture();await alter(files,'_frame-timestamps.csv',t=>t.replace('"1000"',`"${value}"`));
        await assert.rejects(R.readSession(files),/缺少|有效/);
    }
});
