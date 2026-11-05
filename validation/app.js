(function(){
    'use strict';
    const $=id=>document.getElementById(id);
    const V=Validation,video=$('video');
    const LABEL={knee_peak:'膝伸展最快',elbow_onset:'手肘開始伸展',elbow_peak:'手肘伸展最快',release:'球離手'};
    const DRAFT='slowmo-reference-draft';
    let state=null,trials=[],current=0,videoUrl=null,maxFrame=0;
    const status=(text,error=false)=>{$('status').textContent=text;$('status').style.color=error?'#a3361c':'';};
    const fmt=v=>v===null||v===undefined?'—':String(v);
    const ms=v=>v===null||v===undefined?'—':v+' ms';
    function fps(){return {capture:Number($('capture-fps').value),playback:Number($('playback-fps').value)};}
    function saveDraft(){try{if(state)localStorage.setItem(DRAFT,JSON.stringify(state));}catch{/* drafts are a convenience only */}}
    function frame(){return V.frameAt(video.currentTime,state.playbackFps);}
    function seek(f){
        f=Math.max(0,Math.min(maxFrame,f));
        video.pause();video.currentTime=V.timeOfFrame(f,state.playbackFps);
    }
    function renderFrame(){
        if(!state)return;
        const f=frame();
        $('scrub').value=String(f);
        $('frame-info').textContent='第 '+f+' 格 · 實際時間 '+V.frameMs(f,state.captureFps).toFixed(1)+' ms';
    }
    function renderShot(){
        const picker=$('shot-picker');picker.replaceChildren();
        state.shots.forEach((_,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=String(i+1);picker.appendChild(o);});
        picker.value=String(current);
        const shot=state.shots[current];
        document.querySelectorAll('#event-buttons button').forEach(b=>b.classList.toggle('marked',Number.isInteger(shot.marks[b.dataset.event])));
        const parts=V.EVENTS.map(e=>LABEL[e]+'：'+(Number.isInteger(shot.marks[e])?'第 '+shot.marks[e]+' 格':'—'));
        const onset=V.referenceDelta(shot,'onset',state.captureFps),peak=V.referenceDelta(shot,'peak',state.captureFps);
        $('shot-marks').textContent='第 '+(current+1)+' 球 · '+parts.join('；')+' ｜ 人工 Δt 起始 '+ms(onset)+'，峰值 '+ms(peak);
    }
    function addShot(){state.shots.push({marks:{},systemTrial:null,excluded:false,note:''});current=state.shots.length-1;assign();}
    // Shots without a manual choice follow the order of accepted trials.
    function assign(){
        if(!trials.length)return;
        const auto=V.defaultAssignment(state.shots.length,trials);
        state.shots.forEach((s,i)=>{if(!s.manualPair)s.systemTrial=auto[i];});
    }
    function mark(event){
        const shot=state.shots[current],f=frame();
        if(shot.marks[event]===f)delete shot.marks[event];else shot.marks[event]=f;
        saveDraft();renderShot();renderResults();
    }

    const ns='http://www.w3.org/2000/svg';
    function el(parent,tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}
    function blandAltman(result,metric){
        const pts=result.rows.filter(r=>!r.excluded&&r[metric+'Difference']!==null).map(r=>({x:(r[metric+'System']+r[metric+'Reference'])/2,y:r[metric+'Difference']}));
        const a=result.metrics[metric],svg=document.createElementNS(ns,'svg');
        svg.setAttribute('viewBox','0 0 420 260');svg.setAttribute('class','plot');svg.setAttribute('role','img');
        svg.setAttribute('aria-label','Bland-Altman 圖，'+V.METRICS[metric].label+'，'+a.n+' 球');
        const L=52,R=404,T=28,B=222;
        el(svg,'text',{x:L,y:16},V.METRICS[metric].label.split('（')[0]+' · Bland-Altman');
        if(!pts.length){el(svg,'text',{x:L,y:120},'尚無可比較的球');return svg;}
        const xs=pts.map(p=>p.x),ys=[...pts.map(p=>p.y),0,a.loaLow ?? 0,a.loaHigh ?? 0];
        let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
        {const px=Math.max(8,(x1-x0)*.12);x0-=px;x1+=px;}const py=Math.max(10,(y1-y0)*.15);y0-=py;y1+=py;
        const sx=x=>L+(x-x0)/(x1-x0)*(R-L),sy=y=>B-(y-y0)/(y1-y0)*(B-T);
        el(svg,'line',{x1:L,y1:B,x2:R,y2:B,class:'axis'});el(svg,'line',{x1:L,y1:T,x2:L,y2:B,class:'axis'});
        el(svg,'line',{x1:L,y1:sy(0),x2:R,y2:sy(0),class:'zero'});
        el(svg,'line',{x1:L,y1:sy(a.bias),x2:R,y2:sy(a.bias),class:'bias'});
        el(svg,'text',{x:L+6,y:sy(a.bias)-4,class:'line-label'},'平均差 '+a.bias);
        if(a.loaLow!==null)for(const v of [a.loaLow,a.loaHigh]){el(svg,'line',{x1:L,y1:sy(v),x2:R,y2:sy(v),class:'loa'});el(svg,'text',{x:L+6,y:sy(v)-4,class:'line-label'},'95% '+v);}
        for(const p of pts)el(svg,'circle',{cx:sx(p.x),cy:sy(p.y),r:4});
        el(svg,'text',{x:(L+R)/2,y:252,'text-anchor':'middle'},'兩者平均 Δt (ms)');
        el(svg,'text',{x:14,y:(T+B)/2,transform:'rotate(-90 14 '+(T+B)/2+')','text-anchor':'middle'},'系統－人工 (ms)');
        for(const v of [y0+py,y1-py])el(svg,'text',{x:L-6,y:sy(v)+4,'text-anchor':'end'},Math.round(v));
        for(const v of [x0,x1])el(svg,'text',{x:sx(v),y:B+16,'text-anchor':v===x0?'start':'end'},Math.round(v));
        return svg;
    }
    function summaryCard(metric,a){
        const box=document.createElement('div'),h=document.createElement('h3'),dl=document.createElement('dl');
        h.textContent=V.METRICS[metric].label;
        const rows=a.n?[['可比較球數',a.n],['平均差（偏差）',ms(a.bias)],['差的標準差',ms(a.sdDiff)],['95% 一致性界限',a.loaLow===null?'—':a.loaLow+' 到 '+a.loaHigh+' ms'],
            ['平均絕對誤差',ms(a.mae)],['相關係數 r',fmt(a.r)],['人工 Δt 平均 ± SD',a.meanReference+(a.sdReference===null?'':' ± '+a.sdReference)+' ms'],['系統 Δt 平均 ± SD',a.meanSystem+(a.sdSystem===null?'':' ± '+a.sdSystem)+' ms']]:[['可比較球數','0']];
        for(const [k,v] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=String(v);dl.append(dt,dd);}
        box.append(h,dl);return box;
    }
    function renderResults(){
        if(!state||!trials.length){$('results').hidden=true;return;}
        $('results').hidden=false;
        const r=V.compare(state,trials),body=document.querySelector('#shot-table tbody');body.replaceChildren();
        r.rows.forEach((row,i)=>{
            const tr=document.createElement('tr');if(row.excluded)tr.className='dim';
            const td=v=>{const c=document.createElement('td');c.textContent=v;tr.appendChild(c);return c;};
            td(String(row.shot));
            const pick=document.createElement('select'),cell=document.createElement('td');
            pick.setAttribute('aria-label','第 '+row.shot+' 球對應的系統試次');
            const none=document.createElement('option');none.value='';none.textContent='不配對';pick.appendChild(none);
            for(const t of trials){const o=document.createElement('option');o.value=String(t.trialOrder);o.textContent="#"+t.trialOrder+(t.condition?" "+t.condition:"")+(t.status==="accepted"?"":"（"+t.status+"）");pick.appendChild(o);}
            pick.value=row.systemTrial===null?'':String(row.systemTrial);
            pick.addEventListener('change',()=>{state.shots[i].systemTrial=pick.value?Number(pick.value):null;state.shots[i].manualPair=true;saveDraft();renderResults();});
            cell.appendChild(pick);tr.appendChild(cell);
            td(row.systemStatus);
            for(const m of ['onset','peak']){td(fmt(row[m+'Reference']));td(fmt(row[m+'System']));td(fmt(row[m+'Difference']));}
            const ex=document.createElement('input'),exCell=document.createElement('td');ex.type='checkbox';ex.checked=row.excluded;
            ex.setAttribute('aria-label','排除第 '+row.shot+' 球');
            ex.addEventListener('change',()=>{state.shots[i].excluded=ex.checked;saveDraft();renderResults();});
            exCell.appendChild(ex);tr.appendChild(exCell);
            tr.addEventListener('dblclick',()=>{current=i;renderShot();const f=state.shots[i].marks.release ?? state.shots[i].marks.knee_peak;if(Number.isInteger(f))seek(f);});
            body.appendChild(tr);
        });
        const c=r.counts;
        $('pair-note').textContent='共 '+c.shots+' 球，'+c.paired+' 球已對應試次，其中 '+c.accepted+' 球系統判定有效'+(c.excluded?'，排除 '+c.excluded+' 球':'')+'。預設依順序對到系統有效試次；可逐球改選。'+(r.duplicates.length?' ⚠ 試次 #'+r.duplicates.join('、#')+' 被重複使用，請檢查配對。':'')+' 雙擊一列可跳回該球。';
        $('summary').replaceChildren(summaryCard('onset',r.metrics.onset),summaryCard('peak',r.metrics.peak));
        $('plots').replaceChildren(blandAltman(r,'onset'),blandAltman(r,'peak'));
        $('resolution').textContent=String(r.resolutionMs);
    }
    function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function begin(restored){
        const {capture,playback}=fps(),file=$('video-file').files[0];
        try{V.checkFps(capture,playback);}catch(e){status(e.message,true);return;}
        state=restored || V.newState({videoName:file.name,videoSize:file.size,captureFps:capture,playbackFps:playback});
        if(!state.shots.length)addShot();
        current=Math.min(current,state.shots.length-1);
        $('marking').hidden=false;assign();renderShot();renderResults();saveDraft();
    }

    $('video-file').addEventListener('change',()=>{
        const file=$('video-file').files[0];if(!file)return;
        if(videoUrl)URL.revokeObjectURL(videoUrl);
        videoUrl=URL.createObjectURL(file);video.src=videoUrl;status('讀取影片中…');
    });
    video.addEventListener('loadedmetadata',()=>{
        if(!Number.isFinite(video.duration)){status('無法讀取影片長度，請換一個影片檔。',true);return;}
        const file=$('video-file').files[0];let restored=null;
        try{const draft=JSON.parse(localStorage.getItem(DRAFT) || 'null');
            if(draft&&draft.video?.name===file.name&&draft.video?.size===file.size){restored=V.restore(draft);$('capture-fps').value=restored.captureFps;$('playback-fps').value=restored.playbackFps;}}catch{/* ignore a broken draft */}
        begin(restored);
        maxFrame=Math.max(0,V.frameAt(video.duration,state.playbackFps)-1);$('scrub').max=String(maxFrame);
        status('已載入 '+file.name+'（'+(maxFrame+1)+' 格）'+(restored?'，已接續上次的標記':'')+'。'+(trials.length?'':' 接著選擇系統試次 CSV。'));
        seek(0);
        // Keyboard stepping should work right away, not edit the frame-rate box.
        video.focus({preventScroll:true});
    });
    for(const id of ['capture-fps','playback-fps'])$(id).addEventListener('change',()=>{
        if(!state)return;const {capture,playback}=fps();
        try{V.checkFps(capture,playback);}catch(e){status(e.message,true);return;}
        state.captureFps=capture;state.playbackFps=playback;maxFrame=Math.max(0,V.frameAt(video.duration,playback)-1);$('scrub').max=String(maxFrame);
        saveDraft();renderFrame();renderShot();renderResults();status('已更新影格率。已標記的是影格編號，換算成時間會跟著改變。');
    });
    $('trials-file').addEventListener('change',async()=>{
        const file=$('trials-file').files[0];if(!file)return;
        try{trials=V.parseTrials(OfflineReview.parseCsv(await file.text()));
            if(state)state.shots.forEach(s=>{if(s.manualPair&&s.systemTrial!==null&&!trials.some(t=>t.trialOrder===s.systemTrial)){s.manualPair=false;}});
            assign();renderResults();
            status('已讀取 '+trials.length+' 筆系統試次，其中 '+trials.filter(t=>t.status==='accepted').length+' 筆有效。');
        }catch(e){trials=[];renderResults();status('試次 CSV 無法讀取：'+e.message,true);}
    });
    $('marks-file').addEventListener('change',async()=>{
        const file=$('marks-file').files[0];if(!file)return;
        try{const restored=V.restore(JSON.parse(await file.text()));
            if(!video.src){status('請先選擇同一支慢動作影片，再載入標記檔。',true);return;}
            $('capture-fps').value=restored.captureFps;$('playback-fps').value=restored.playbackFps;current=0;begin(restored);
            maxFrame=Math.max(0,V.frameAt(video.duration,state.playbackFps)-1);$('scrub').max=String(maxFrame);
            status('已載入 '+restored.shots.length+' 球的標記'+(restored.video.name&&restored.video.name!==$('video-file').files[0]?.name?'（注意：標記檔記錄的影片是 '+restored.video.name+'）':'')+'。');
        }catch(e){status('標記檔無法讀取：'+e.message,true);}
    });
    video.addEventListener('seeked',renderFrame);video.addEventListener('timeupdate',renderFrame);
    $('scrub').addEventListener('input',()=>seek(Number($('scrub').value)));
    for(const [id,step] of [['back10',-10],['back1',-1],['fwd1',1],['fwd10',10]])$(id).addEventListener('click',()=>seek(frame()+step));
    document.querySelectorAll('#event-buttons button').forEach(b=>b.addEventListener('click',()=>mark(b.dataset.event)));
    $('shot-picker').addEventListener('change',()=>{current=Number($('shot-picker').value);renderShot();});
    $('new-shot').addEventListener('click',()=>{addShot();saveDraft();renderShot();renderResults();});
    $('clear-shot').addEventListener('click',()=>{state.shots[current].marks={};saveDraft();renderShot();renderResults();});
    $('save-marks').addEventListener('click',()=>download('slowmo-marks_'+(state.video.name||'video').replace(/\.[^.]+$/,'')+'.json',JSON.stringify(state,null,2),'application/json'));
    $('save-csv').addEventListener('click',()=>download('slowmo-comparison_'+(state.video.name||'video').replace(/\.[^.]+$/,'')+'.csv',V.rowsCsv(V.compare(state,trials)),'text/csv;charset=utf-8'));
    document.addEventListener('keydown',e=>{
        // The frame slider handles arrows natively; its number keys still mark events.
        if(!state||$('marking').hidden)return;
        if(e.target.id==='scrub'){const n=['1','2','3','4'].indexOf(e.key);if(n>=0){e.preventDefault();mark(V.EVENTS[n]);}return;}
        if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(frame()+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1));}
        const n=['1','2','3','4'].indexOf(e.key);if(n>=0){e.preventDefault();mark(V.EVENTS[n]);}
    });
})();
