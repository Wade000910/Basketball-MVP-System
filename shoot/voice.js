// Spoken make/miss. The shooter says 「進」 or 「沒進」 after each shot.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ShotVoice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    // Teammates talk during a drill, so only a short utterance that is clearly a result counts: the whole
    // phrase must be a call (a result word with an optional lead-in such as 這球 and an optional ending such as 了),
    // never a longer sentence that merely contains one. 進來, 進去吧 and 你有沒有看到 are not calls; 進不去 is a miss.
    // Speech engines often hear 進 as homophones; these are accepted as 進.
    const HOMOPHONES='近|緊|盡|金|今|晉|勁|錦|禁';
    const PREFIX='(?:(?:哇|耶|唉|欸|喔|啊|可惜|太可惜了|差一點)?(?:我投|我|投|這球|那球|這顆|那顆|這個|那個|這|那)?)',SUFFIX='(?:了|啦|囉|喔|耶|喲){0,2}';
    // Some engines answer a zh-TW request in simplified characters; they are read as the traditional ones.
    const SIMPLIFIED={'进':'進','没':'沒','劲':'勁','尽':'盡','铁':'鐵','来':'來'};
    const MADE_RE=new RegExp('^'+PREFIX+'(?:進球|進去(?:了|啦)|進|有進|有中|中|空心球|空心|好球|漂亮|讚|有(?:'+HOMOPHONES+')|'+HOMOPHONES+')'+SUFFIX+'$');
    // 沒進 is often heard as 沒勁 (and 沒近, 沒金 ...), so a negation in front of a homophone is a miss too.
    const MISS_RE=new RegExp('^'+PREFIX+'(?:沒進去|沒有進去|沒進|沒有進|沒有中|沒中|進不去|不進|不中|打鐵|麵包|歪|沒有?(?:'+HOMOPHONES+')|沒)'+SUFFIX+'$');
    const MADE_WORDS=['made','make','in','yes','good','nice','nice shot','good shot','made it','make it'],MISS_WORDS=['miss','missed','no','missed it'];
    function parse(text){
        const s=String(text||'').toLowerCase().replace(/[\s，。！？、,.!?]/g,'').replace(/[进没劲尽铁来]/g,c=>SIMPLIFIED[c]);
        if(!s || s.length>12 || /[嗎呢]$/.test(s))return null; // long phrases or questions are conversation, not a call
        if(MISS_WORDS.map(w=>w.replace(/\s/g,'')).includes(s))return false;
        if(MADE_WORDS.map(w=>w.replace(/\s/g,'')).includes(s))return true;
        if(MISS_RE.test(s))return false;
        if(MADE_RE.test(s))return true;
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
    return {parse,fromAlternatives,supported,createListener};
});
