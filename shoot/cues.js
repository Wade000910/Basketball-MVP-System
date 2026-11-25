// Sound cues for a shot, kept free of the audio API so they can be tested.
// Phone speakers cannot reproduce low or very short tones, and a Bluetooth headset can swallow the first ~100 ms,
// so every cue is a mid-range pitch with a real duration, started after a short lead-in.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ShootCues=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const LEAD=0.1;
    const CUES={
        steady:[{at:LEAD,freq:880,dur:0.4,type:'sine',gain:0.7}],                              // rhythm close to your made shots
        off:[{at:LEAD,freq:440,dur:0.25,type:'triangle',gain:0.7},{at:LEAD+0.3,freq:330,dur:0.3,type:'triangle',gain:0.7}], // falling pair
        learning:[{at:LEAD,freq:660,dur:0.25,type:'sine',gain:0.6}],                           // still building your own range
        unmeasured:[{at:LEAD,freq:520,dur:0.15,type:'triangle',gain:0.6},{at:LEAD+0.25,freq:520,dur:0.15,type:'triangle',gain:0.6}] // a shot was seen but not measured
    };
    function notes(name){return (CUES[name]||[]).map(n=>({...n}));}
    // judged: 'steady', 'off' or null (no personal range yet), for an accepted trial.
    function forTrial(trial,judged){
        if(trial.status!=='accepted')return 'unmeasured';
        return judged==='steady'||judged==='off'?judged:'learning';
    }
    return {notes,forTrial};
});
