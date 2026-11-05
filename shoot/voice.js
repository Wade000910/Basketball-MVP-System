// Spoken make/miss. The shooter says 「進」 or 「沒進」 after each shot.
// Miss phrases are checked first because most of them contain a make word (沒「進」).
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ShotVoice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const MISS=['沒進','沒有進','沒中','沒有中','不進','沒','不中','打鐵','麵包','miss','missed','no'];
    const MADE=['進球','進了','進','有中','中了','中','好球','空心','漂亮','made','make','in','yes','good'];
    // Speech engines often hear 進 as homophones; these are accepted as 進.
    const MADE_HOMOPHONES=['近','緊','盡','金','今','晉','勁','錦','禁'];
    function parse(text){
        const s=String(text||'').toLowerCase().replace(/[\s，。！？、,.!?]/g,'');
        if(!s || s.length>12 || /[嗎呢]$/.test(s))return null; // long phrases or questions are conversation, not a call
        const words=String(text||'').toLowerCase().split(/[\s,.!?]+/).filter(Boolean);
        const has=w=>/^[a-z]+$/.test(w)?words.includes(w):s.includes(w);
        if(MISS.some(has))return false;
        if(MADE.some(has)||MADE_HOMOPHONES.some(w=>s===w||s===w+'了'))return true;
        return null;
    }
    // Picks the first alternative that parses, so a confident wrong transcript does not hide
    // a usable second guess.
    function fromAlternatives(alternatives){
        for(const a of alternatives){const r=parse(a);if(r!==null)return {made:r,heard:a};}
        return {made:null,heard:alternatives[0]||''};
    }
    function supported(scope=globalThis){return !!(scope.SpeechRecognition||scope.webkitSpeechRecognition);}
    // Continuous listener that restarts itself; onResult({made, heard}) for each final phrase.
    function createListener({onResult,onState=()=>{},lang='zh-TW',scope=globalThis}){
        const Ctor=scope.SpeechRecognition||scope.webkitSpeechRecognition;
        if(!Ctor)return null;
        let rec=null,wanted=false,restarts=0;
        function start(){
            wanted=true;
            rec=new Ctor();rec.lang=lang;rec.continuous=true;rec.interimResults=false;rec.maxAlternatives=3;
            rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(!r.isFinal)continue;onResult(fromAlternatives(Array.from(r,x=>x.transcript)));}};
            rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){wanted=false;onState('denied');}else onState('error:'+e.error);};
            rec.onend=()=>{if(wanted&&restarts<500){restarts++;setTimeout(()=>{if(wanted)try{rec.start();}catch{/* already started */}},250);}else onState('off');};
            try{rec.start();onState('listening');}catch(error){onState('error:'+error.message);}
        }
        function stop(){wanted=false;if(rec)try{rec.stop();}catch{/* not started */}}
        return {start,stop,get listening(){return wanted;}};
    }
    return {MISS,MADE,parse,fromAlternatives,supported,createListener};
});
