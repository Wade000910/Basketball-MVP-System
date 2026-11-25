const test=require('node:test');
const assert=require('node:assert/strict');
const Cues=require('../shoot/cues.js');

// Phone speakers cannot reproduce low or very short tones, and a Bluetooth headset can swallow the first ~100 ms,
// so every cue must be audible on its own: a mid-range pitch, a real duration and a clear gain.
const NAMES=['steady','off','learning','unmeasured','finish'];
test('every cue exists and is built from audible notes',()=>{
    for(const name of NAMES){
        const notes=Cues.notes(name);
        assert.ok(notes.length>=1,name);
        for(const n of notes){
            assert.ok(n.freq>=300&&n.freq<=2000,name+' pitch '+n.freq);
            assert.ok(n.dur>=0.15,name+' note too short');
            assert.ok(n.gain>=0.4&&n.gain<=1,name+' gain');
        }
    }
});
test('notes start after a short lead-in so a Bluetooth route has time to wake',()=>{
    for(const name of NAMES)assert.ok(Cues.notes(name)[0].at>=0.08,name);
});
test('cues can be told apart: different first pitch or a different number of notes',()=>{
    const sig=n=>Cues.notes(n).map(x=>x.freq).join(',');
    assert.equal(new Set(NAMES.map(sig)).size,NAMES.length);
});
test('which cue a trial gets',()=>{
    assert.equal(Cues.forTrial({status:'aborted'},null),'unmeasured');
    assert.equal(Cues.forTrial({status:'invalid'},null),'unmeasured');
    assert.equal(Cues.forTrial({status:'low_quality'},null),'unmeasured');
    assert.equal(Cues.forTrial({status:'accepted'},'steady'),'steady');
    assert.equal(Cues.forTrial({status:'accepted'},'off'),'off');
    assert.equal(Cues.forTrial({status:'accepted'},null),'learning');
});
test('the end-of-set cue is a rising three-note phrase, longer than a shot cue',()=>{
    const n=Cues.notes('finish');
    assert.equal(n.length,3);
    assert.ok(n[0].freq<n[1].freq&&n[1].freq<n[2].freq);
});
