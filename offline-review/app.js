(function() {
    'use strict';
    const R = window.OfflineReview, $ = id => document.getElementById(id);
    const video=$('video'), overlay=$('overlay');
    let session=null, notes=null, url=null, loadVersion=0, alignment={confirmed:false}, everAssisted=false, dirty=false;
    let presentedMediaMs=null, chartBase=null, queued=false;
    const eventNames={knee_peak:'膝部事件',elbow_onset:'肘部事件',release:'出手'};
    const edges=[[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    function status(text,error=false) { $('status').textContent=text;$('status').dataset.error=String(error); }
    function currentFrame() { return session.frames[Number($('frame').value)]; }
    function currentTrial() { return Number($('trial').value); }
    function fmt(value) {return value===null || value===undefined?'—':Number(value).toFixed(2);}
    function mapped(frame) { return alignment.confirmed && Number.isFinite(video.duration) ? R.mappedTime(frame.sourceTimestampMs,alignment.anchorSourceMs,alignment.anchorVideoMs,video.duration*1000):null; }
    function clearOverlay() { const ctx=overlay.getContext('2d');ctx.clearRect(0,0,overlay.width,overlay.height); }
    function sample() { return R.sampleForFrame(session,currentFrame(),Number($('tolerance').value)); }
    function buildChart() {
        const canvas=document.createElement('canvas');canvas.width=960;canvas.height=220;
        const ctx=canvas.getContext('2d');
        const signals=[...session.signals].sort((a,b)=>a.sourceTimestampMs-b.sourceTimestampMs);
        if (!signals.length) return canvas;
        const start=session.frames[0].sourceTimestampMs,end=session.frames.at(-1).sourceTimestampMs;
        ctx.font='14px sans-serif';ctx.fillStyle='#163044';ctx.fillText('預存角度：膝（藍）／肘（橙），0–180°；缺失或長間隔中斷',12,20);
        for (const [field,color] of [['filteredKneeDeg','#1674a7'],['filteredElbowDeg','#c26820']]) {
            ctx.strokeStyle=color;ctx.beginPath();let last=null;
            for (const s of signals) {
                if(s[field]===null || s[field]<0 || s[field]>180) {last=null;continue;}
                const x=20+(s.sourceTimestampMs-start)/Math.max(1,end-start)*920,y=200-s[field]/180*165;
                if(last!==null && s.sourceTimestampMs-last<=100)ctx.lineTo(x,y);else ctx.moveTo(x,y);
                last=s.sourceTimestampMs;
            }
            ctx.stroke();
        }
        return canvas;
    }
    function renderChart() {
        const canvas=$('chart'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
        if($('blind').checked)return;
        if(!chartBase)chartBase=buildChart();ctx.drawImage(chartBase,0,0);
        const start=session.frames[0].sourceTimestampMs,end=session.frames.at(-1).sourceTimestampMs;
        const x=20+(currentFrame().sourceTimestampMs-start)/Math.max(1,end-start)*920;ctx.strokeStyle='#163044';ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x,205);ctx.stroke();
    }
    function draw() {
        clearOverlay();
        if (!session || $('blind').checked || !alignment.confirmed || video.seeking || video.readyState<2 || !video.paused) return;
        const t=mapped(currentFrame());
        if(t===null || !atFrame(t)) return;
        const s=sample();if(!s)return;
        const ctx=overlay.getContext('2d'),pts=new Map(s.landmarks.map(p=>[p.landmarkIndex,p]));
        overlay.width=video.videoWidth;overlay.height=video.videoHeight;
        // Canvas has the same intrinsic aspect ratio as video; CSS contain preserves letterboxing.
        ctx.strokeStyle='#00e6d2';ctx.lineWidth=3;
        for(const [a,b] of edges){const p=pts.get(a),q=pts.get(b);if(!p||!q||p.visibility===null||q.visibility===null||p.visibility<.5||q.visibility<.5)continue;ctx.beginPath();ctx.moveTo(p.x*overlay.width,p.y*overlay.height);ctx.lineTo(q.x*overlay.width,q.y*overlay.height);ctx.stroke();}
    }
    function comparison() {
        $('comparison').replaceChildren();
        const blind=$('blind').checked;
        document.querySelectorAll('.assisted').forEach(e=>e.hidden=blind);
        for(const trial of session.trials){
            const tr=document.createElement('tr'),manual=notes.delta(trial.id);
            const cells=[trial.id,fmt(manual)];
            if(!blind)cells.push(fmt(trial.dt),fmt(manual===null||trial.dt===null?null:manual-trial.dt),trial.qualityFlags || trial.trialStatus);
            for(const value of cells){const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);} $('comparison').appendChild(tr);
        }
    }
    function atFrame(t) {
        const tolerance=Number($('tolerance').value);
        return Math.abs(video.currentTime*1000-t)<=tolerance && (!video.requestVideoFrameCallback || (presentedMediaMs!==null && Math.abs(presentedMediaMs-t)<=tolerance));
    }
    function render(details=true) {
        if(!session)return;
        const f=currentFrame(),blind=$('blind').checked,t=mapped(f);
        $('clock').textContent=`來源影格 ${f.frameIndex}｜來源 ${fmt(f.sourceTimestampMs)} ms｜影片播放 ${fmt(video.currentTime*1000)} ms｜實際呈現影格 ${presentedMediaMs===null?'尚無資料':fmt(presentedMediaMs)+' ms'}`;
        $('alignment').textContent=alignment.confirmed?`人工對齊：來源 ${fmt(alignment.anchorSourceMs)} ms ↔ 影片 ${fmt(alignment.anchorVideoMs)} ms。${t===null?'目前來源時間超出影片範圍。':'仍須核對畫面與錄影時間，不能視為已校正。'}`:'尚未確認對齊，無法標記。';
        $('sample').hidden=blind;$('chart').hidden=blind;
        if(blind)$('sample').textContent='';
        else {
            const s=sample();
            $('sample').textContent=s?`最近分析來源時間 ${fmt(s.inference.sourceTimestampMs)} ms；與來源影格差 ${fmt(s.inference.sourceTimestampMs-f.sourceTimestampMs)} ms\n膝角 ${fmt(s.signal?.filteredKneeDeg)}°／肘角 ${fmt(s.signal?.filteredElbowDeg)}°\n可見度 ${fmt(s.signal?.sideVisibility)}；狀態 ${s.signal?.state || '無訊號'}\n骨架僅在暫停、完成尋址且時間在設定範圍內時顯示。`:'此來源影格沒有容許範圍內的成功分析；不補造資料。';
        }
        for(const id of ['markKnee','markElbow','markRelease'])$(id).disabled=!alignment.confirmed || t===null || !atFrame(t) || video.readyState<2 || video.seeking || !video.paused || !session.trials.length;
        $('export').disabled=!alignment.confirmed;
        $('previous').disabled=Number($('frame').value)===0;$('next').disabled=Number($('frame').value)===session.frames.length-1;
        $('undo').disabled=!notes.history.length;$('redo').disabled=!notes.future.length;
        if(details){
            const rows=notes.forTrial(currentTrial());
            $('marks').textContent=rows.length?rows.map(r=>`${eventNames[r.event]}：來源影格 ${r.sourceFrameIndex}／${fmt(r.sourceTimestampMs)} ms`).join('；'):'此試次尚無人工標記。';
            $('jumpMarks').replaceChildren();
            for(const row of rows){const b=document.createElement('button');b.type='button';b.textContent=`回到${eventNames[row.event]}`;b.addEventListener('click',()=>{$('frame').value=session.frames.findIndex(f=>f.frameIndex===row.sourceFrameIndex);seekCurrent();});$('jumpMarks').appendChild(b);}
            comparison();
        }
        renderChart();draw();
    }
    function seekCurrent() {
        video.pause();clearOverlay();
        const t=mapped(currentFrame());
        if(t!==null)video.currentTime=t/1000;
        render();
    }
    function reset() {
        video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);
        url=null;session=null;notes=null;alignment={confirmed:false};everAssisted=false;dirty=false;presentedMediaMs=null;chartBase=null;$('restore').value='';
        $('blind').checked=true;$('frame').value=0;$('trial').replaceChildren();$('review').hidden=true;clearOverlay();
    }
    $('files').addEventListener('change',async()=>{
        if(dirty && !window.confirm('本次人工標記尚未下載，仍要換資料嗎？')){$('files').value='';return;}
        const version=++loadVersion;reset();status('檢查資料中…');
        try{
            const loaded=await R.readSession([...$('files').files]);if(version!==loadVersion)return;
            session=loaded;notes=new R.Annotations(session);$('frame').max=session.frames.length-1;
            for(const t of session.trials){const option=document.createElement('option');option.value=t.id;option.textContent=`試次 ${t.id}`;$('trial').appendChild(option);}
            url=URL.createObjectURL(session.video);video.src=url;$('review').hidden=false;
            status(`檔案結構檢查通過：${session.frames.length}筆來源影格、${session.inferences.length}筆分析、${session.trials.length}個試次。請核對影片並設定對齊。`);render();
        }catch(error){if(version===loadVersion){reset();status(error.message,true);}}
    });
    $('frame').addEventListener('input',seekCurrent);
    for(const [id,step] of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{if(!session)return;$('frame').value=Math.max(0,Math.min(session.frames.length-1,Number($('frame').value)+step));seekCurrent();});
    $('align').addEventListener('click',()=>{
        if(!session || !Number.isFinite(video.duration) || video.readyState<2 || video.seeking){status('請等影片載入並完成尋址後再對齊。',true);return;}
        if(dirty && !window.confirm('更改對齊會清除本次標記，是否繼續？'))return;
        video.pause();notes=new R.Annotations(session);dirty=false;
        alignment={confirmed:true,anchorSourceMs:currentFrame().sourceTimestampMs,anchorVideoMs:video.currentTime*1000,method:'user-selected-correspondence'};render();
    });
    $('resetAlignment').addEventListener('click',()=>{if(dirty&&!window.confirm('清除對齊及尚未下載的標記？'))return;alignment={confirmed:false};notes=new R.Annotations(session);dirty=false;render();});
    $('speed').addEventListener('change',()=>video.playbackRate=Number($('speed').value));
    $('blind').addEventListener('change',()=>{if(!$('blind').checked)everAssisted=true;render();});
    $('tolerance').addEventListener('change',()=>{const n=Number($('tolerance').value);if($('tolerance').value===''||!Number.isFinite(n)||n<0||n>1000)$('tolerance').value=40;render();});
    $('trial').addEventListener('change',()=>render());
    for(const [id,event] of [['markKnee','knee_peak'],['markElbow','elbow_onset'],['markRelease','release']])$(id).addEventListener('click',()=>{
        try{
            const t=mapped(currentFrame());
            if(t===null || video.seeking || !video.paused || video.readyState<2 || !atFrame(t))throw new Error('請先移到已對齊的來源影格，暫停並核對畫面後標記。');
            notes.mark(currentTrial(),event,currentFrame(),alignment,{videoTimeMs:video.currentTime*1000,displayedMediaTimeMs:presentedMediaMs,algorithmVisible:!$('blind').checked});dirty=true;render();
        }catch(error){status(error.message,true);}
    });
    $('clearTrial').addEventListener('click',()=>{for(const r of notes.forTrial(currentTrial()))notes.remove(r.trialId,r.event);dirty=true;render();});
    for(const method of ['undo','redo'])$(method).addEventListener('click',()=>{const action=notes[method]();if(action){$('trial').value=(action.after||action.before).trialId;dirty=true;render();}});
    $('export').addEventListener('click',()=>{
        const output=notes.export(alignment,!everAssisted);output.matchToleranceMs=Number($('tolerance').value);
        const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'}),download=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=download;a.download=`${session.prefix}_manual-review.json`;a.click();setTimeout(()=>URL.revokeObjectURL(download),1000);dirty=false;
        status('已產生標記下載，請確認檔案已保存。');
    });
    $('restore').addEventListener('change',async()=>{
        const file=$('restore').files[0],version=loadVersion;if(!file)return;
        try{
            if(!session || !Number.isFinite(video.duration))throw new Error('請先載入 Session 影片。');
            const input=JSON.parse(await file.text());
            if(version!==loadVersion)return;
            const loaded=R.restoreAnnotations(session,input,video.duration*1000);
            if(dirty&&!window.confirm('重新載入標記會取代目前尚未下載的標記，是否繼續？'))return;
            video.pause();notes=loaded.notes;alignment=loaded.alignment;everAssisted=everAssisted||loaded.assisted;dirty=false;
            const tolerance=Number(input.matchToleranceMs);
            if(Number.isFinite(tolerance)&&tolerance>=0&&tolerance<=1000)$('tolerance').value=tolerance;
            seekCurrent();status('人工標記已載入；仍請核對對齊與試次歸屬。');
        }catch(error){status(error.message,true);}finally{$('restore').value='';}
    });
    document.addEventListener('keydown',e=>{
        if(!session || e.altKey||e.ctrlKey||e.metaKey||e.shiftKey || ['INPUT','SELECT','TEXTAREA','VIDEO'].includes(e.target.tagName))return;
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();$(e.key==='ArrowLeft'?'previous':'next').click();}
    });
    function scheduleRender(){
        if(queued)return;queued=true;requestAnimationFrame(()=>{
            queued=false;if(!session)return;
            if(alignment.confirmed&&!video.paused&&$('follow').checked){const source=video.currentTime*1000-alignment.anchorVideoMs+alignment.anchorSourceMs;const index=R.nearestFrameIndex(session.frames,source);if(index!==null)$('frame').value=index;}
            render(false);
        });
    }
    for(const event of ['loadedmetadata','loadeddata','seeked','pause','play','timeupdate'])video.addEventListener(event,scheduleRender);
    video.addEventListener('seeking',()=>{presentedMediaMs=null;clearOverlay();scheduleRender();});
    if(video.requestVideoFrameCallback){const onFrame=(_now,metadata)=>{presentedMediaMs=metadata.mediaTime*1000;scheduleRender();video.requestVideoFrameCallback(onFrame);};video.requestVideoFrameCallback(onFrame);}
    video.addEventListener('error',()=>{if(session){alignment={confirmed:false};clearOverlay();status('瀏覽器無法播放這份影片；請保留原檔，不能進行對齊或標記。',true);render();}});
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
})();
