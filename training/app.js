(function() {
    'use strict';
    const C=TrainingCore, A=TrainingAnalysis, KEY='basketball-training-v1';
    const $=id=>document.getElementById(id);
    let active=null,history=[],loadFailed=false;
    let lastRecordAt=-Infinity,lastRecordSession=null;
    const uid=()=>globalThis.crypto.randomUUID();
    const formatDate=value=>new Date(value).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const rate=s=>s.percentage===null?'—':s.percentage+'%';
    function message(text='') { $('message').textContent=text;$('message').hidden=!text; }
    function perform(action) {try{message();action();}catch(error){message(error.message || '操作未完成，請重試。');}}
    function persist() {
        if(active?.isDemo) { $('storage-status').textContent='示範模式：合成資料只在記憶體中，不會寫入正式訓練歷史。';return; }
        if(active?.finishedAt) history=[active,...history.filter(s=>s.id!==active.id)].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,30);
        try {
            if(loadFailed) throw new Error('尚有無法讀取的舊資料');
            localStorage.setItem(KEY,JSON.stringify({schemaVersion:C.SCHEMA,active,history}));
            $('storage-status').textContent='已儲存於此裝置的瀏覽器 · 清除網站資料會刪除紀錄，請下載報告備份。';
        } catch(error) {
            $('storage-status').textContent='目前只保留在本頁記憶體，未成功儲存於瀏覽器。關閉前請下載報告；舊資料不會被覆寫。';
        }
    }
    function download(blob,name) {
        const url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function setActive(next) {active=next;persist();render();}
    function withAnalysis(session) {
        if(!session || session.isDemo)return session;
        const saved=localStorage.getItem(A.KEY),runs=saved?A.parse(saved):[];
        return {...session,analysisRuns:A.forSession(session,runs)};
    }
    function renderAnalysis() {
        $('analysis-runs').replaceChildren();
        $('analysis-report').hidden=active.isDemo || active.drill!=='free_throw';
        if($('analysis-report').hidden)return;
        try {
            const session=withAnalysis(active),stats=A.summary(session.analysisRuns);
            $('analysis-summary').textContent=stats.runs?'共 '+stats.runs+' 次分析、'+stats.total+' 個動作試次，其中 '+stats.accepted+' 次可用、'+stats.excluded+' 次未納入統計。'+(stats.meanDt===null?'':'平均時序差 '+stats.meanDt+' ms。'):'本組還沒有動作紀錄。可按「開啟罰球動作分析」，停止分析後會自動帶回摘要。';
            session.analysisRuns.forEach(run=>{
                const item=document.createElement('li'),details=document.createElement('details'),title=document.createElement('summary'),list=document.createElement('ol');
                const modes={auditory:'聲音回饋',visual:'視覺回饋',baseline:'僅記錄'};
                title.textContent=formatDate(run.startedAt)+' · '+modes[run.condition]+' · '+run.trials.length+' 次';
                run.trials.forEach(t=>{const li=document.createElement('li');li.textContent='動作 '+t.trialOrder+' · '+(t.trialStatus==='accepted'?(run.condition==='baseline'?'已記錄（隱藏時序）':t.dt+' ms'):(t.trialStatus==='low_quality'?'畫面品質不足，未納入統計':t.trialStatus==='aborted'?'動作中斷，未納入統計':'動作資料不足，未納入統計'));list.appendChild(li);});
                details.append(title,list);item.appendChild(details);$('analysis-runs').appendChild(item);
            });
        }catch(error){$('analysis-summary').textContent='無法讀取動作摘要：'+error.message+' 請先下載動作頁的資料備份。';}
    }
    function renderHistory() {
        const parent=$('history-list');parent.replaceChildren();
        if(!history.length) {const p=document.createElement('p');p.className='muted';p.textContent='第一組練習完成後，報告會出現在這裡。';parent.appendChild(p);}
        history.forEach(session=>{
            const stats=C.summarize(session),button=document.createElement('button');
            button.type='button';button.className='history-item';
            const info=document.createElement('span'),title=document.createElement('strong'),date=document.createElement('small'),score=document.createElement('span');
            title.textContent=session.playerCode+' · '+C.DRILLS[session.drill]+(session.drill==='free_throw'?'':' · '+C.POSITIONS[C.positionOf(session)]);date.textContent=formatDate(session.startedAt)+' · '+stats.made+'/'+stats.total+' 命中';score.textContent=rate(stats);
            info.append(title,date);button.append(info,score);
            button.addEventListener('click',()=>perform(()=>{
                if(active && !active.finishedAt) throw new Error('請先結束目前這組，再開啟其他報告。');
                setActive(session);$('session-panel').scrollIntoView({behavior:'smooth',block:'start'});
            }));parent.appendChild(button);
        });
    }
    function renderDashboard() {
        const code=$('dashboard-player').value.trim(),data=C.progress(history,code);
        $('dashboard-summary').textContent=code?code+' · 近 7 天完成 '+data.recentSessions+' 組、投了 '+data.recentShots+' 球 · 累積 '+data.sessions+' 組':'輸入學員代碼，查看自己的訓練累積。完成第一組後，這裡會開始記錄你的進度。';
        $('drill-progress').replaceChildren();
        data.drills.forEach(d=>{
            const card=document.createElement('div'),title=document.createElement('strong'),score=document.createElement('span'),detail=document.createElement('small');
            title.textContent=d.label;score.textContent=rate(d);detail.textContent=d.made+' / '+d.total+' 命中';card.append(title,score,detail);$('drill-progress').appendChild(card);
        });
        $('home-action').textContent=active?(active.finishedAt?'查看本組報告 ↗':'繼續未完成練習 ↗'):'開始今天的訓練 ↗';
        renderTrend();
    }
    function renderTrend() {
        const code=$('dashboard-player').value.trim(),drill=$('trend-drill').value;
        for(const option of $('trend-position').options)option.disabled=drill==='free_throw'&&!['all','center'].includes(option.value);
        if($('trend-position').selectedOptions[0]?.disabled)$('trend-position').value='all';
        const position=$('trend-position').value;
        const data=C.trend(history,code,drill,position),points=data.points;
        $('trend-description').textContent=!code?'輸入上方學員代碼，查看自己的趨勢。':!points.length?'這個篩選條件還沒有已完成的投籃紀錄。':code+' · '+C.DRILLS[drill]+' · '+(position==='all'?'全部位置':C.POSITIONS[position])+' · 最近 '+points.length+' 組，各點依序代表一組練習。';
        $('trend-chart').replaceChildren();$('trend-rows').replaceChildren();$('trend-table').hidden=!points.length;
        if(points.length){
            const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
            svg.setAttribute('viewBox','0 0 600 230');svg.setAttribute('role','img');svg.setAttribute('aria-label','近期命中率折線圖，數值詳見下方表格');
            function element(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;svg.appendChild(node);return node;}
            for(const p of [0,50,100]){const y=190-p*1.6;element('line',{x1:48,x2:580,y1:y,y2:y,class:'trend-grid'});element('text',{x:40,y:y+5,'text-anchor':'end',class:'trend-axis'},p+'%');}
            const coords=points.map((p,i)=>({x:points.length===1?314:58+i*512/(points.length-1),y:190-p.percentage*1.6}));
            if(points.length>1)element('polyline',{points:coords.map(c=>c.x+','+c.y).join(' '),class:'trend-line'});
            points.forEach((p,i)=>{
                const circle=element('circle',{cx:coords[i].x,cy:coords[i].y,r:6,class:'trend-point'}),title=document.createElementNS(ns,'title');title.textContent=formatDate(p.startedAt)+' · '+p.made+'/'+p.total+'（'+rate(p)+'）';circle.appendChild(title);
                element('text',{x:coords[i].x,y:218,'text-anchor':'middle',class:'trend-axis'},String(i+1));
                const row=document.createElement('tr');for(const text of [formatDate(p.startedAt),C.POSITIONS[p.position],p.made+' / '+p.total,rate(p)]){const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell);}$('trend-rows').appendChild(row);
            });
            $('trend-chart').appendChild(svg);
        }
        $('position-progress').replaceChildren();
        data.positions.filter(p=>drill!=='free_throw'||p.id==='center').forEach(p=>{
            const card=document.createElement('div'),label=document.createElement('strong'),score=document.createElement('span'),detail=document.createElement('small');label.textContent=p.label;score.textContent=rate(p);detail.textContent=p.made+' / '+p.total+' 命中';card.append(label,score,detail);$('position-progress').appendChild(card);
        });
    }
    function updatePositionField(){
        const free=$('drill-type').value==='free_throw';$('position-field').hidden=free;$('shot-position').disabled=free;
        if(free)$('shot-position').value='center';
    }
    function render() {
        renderDashboard();
        $('setup-panel').hidden=!!active;$('session-panel').hidden=!active;
        for(const id of ['step-setup','step-train','step-report']) $(id).removeAttribute('aria-current');
        $(active?(active.finishedAt?'step-report':'step-train'):'step-setup').setAttribute('aria-current','step');
        renderHistory();if(!active)return;
        renderAnalysis();
        const stats=C.summarize(active),finished=!!active.finishedAt;
        $('session-label').textContent=active.isDemo?'SYNTHETIC DEMO / 合成示範':'SHOOTING / 人工紀錄';
        $('session-title').textContent=active.playerCode+' 的'+C.DRILLS[active.drill]+'練習'+(active.drill==='free_throw'?'':' · '+C.POSITIONS[C.positionOf(active)]);
        $('session-state').textContent=finished?'訓練報告':'進行中';
        $('demo-banner').hidden=!active.isDemo;
        $('session-focus').textContent=active.note || '今天的重點：完成一組'+C.DRILLS[active.drill]+'並記錄每一球。';
        const linked=active.drill==='free_throw' && !active.isDemo;
        const params=new URLSearchParams({from:'training',player:active.playerCode,session:active.id});
        $('session-analysis').href=linked?'../專題程式/?'+params.toString():'../專題程式/';
        $('analysis-context-note').textContent=linked?'另開分析頁並帶入本組代碼；停止分析後，本組報告會帶入動作摘要。命中結果仍在此手動記錄。':'相機分析適用於罰球。本組為其他投籃類型或示範，請在分析頁另設代碼。';
        $('total-value').textContent=stats.total;$('made-value').textContent=stats.made;$('percentage-value').textContent=rate(stats);
        $('shot-progress').max=active.targetShots;$('shot-progress').value=Math.min(stats.total,active.targetShots);
        $('progress-label').textContent=stats.targetReached?'已達 '+active.targetShots+' 球目標'+(finished?'。':'，可結束看報告或繼續記錄。'):'目標 '+active.targetShots+' 球 · 還有 '+stats.remaining+' 球'+(finished?'（本組提前結束）':'');
        $('record-controls').hidden=finished;$('report-panel').hidden=!finished;$('new-btn').hidden=!finished;
        $('discard-btn').hidden=finished;
        $('repeat-btn').hidden=!finished || active.isDemo;
        $('undo-btn').disabled=!stats.total;$('finish-btn').disabled=!stats.total;
        $('made-btn').disabled=stats.total>=200;$('missed-btn').disabled=stats.total>=200;
        $('record-feedback').textContent=!stats.total?'準備記錄第 1 球':('目前第 '+stats.total+' 球 · '+(active.shots.at(-1).made?'命中':'未中')+(stats.total>=200?' · 已達每組 200 球上限':' · 下一球：第 '+(stats.total+1)+' 球'));
        $('report-summary').textContent=formatDate(active.startedAt)+' 開始 · 已記錄 '+stats.total+' 球，命中 '+stats.made+' 球，未中 '+stats.missed+' 球。'+(stats.percentage===null?'尚無可計算的命中率。':'本組命中率 '+rate(stats)+'。');
        const previous=C.previousSession(active,history),previousStats=previous?C.summarize(previous):null;
        $('comparison').textContent=previousStats && previousStats.percentage!==null && stats.percentage!==null
            ?'同代碼、同類型、同位置上一組：'+previousStats.made+'/'+previousStats.total+'（'+rate(previousStats)+'）。本組差異 '+(stats.percentage-previousStats.percentage>=0?'+':'')+(stats.percentage-previousStats.percentage).toFixed(1)+' 個百分點。'
            :'累積同代碼、同投籃類型與位置的下一組紀錄後，就能回看跨次差異。';
        const list=$('shot-list');list.replaceChildren();
        active.shots.forEach((shot,index)=>{
            const li=document.createElement('li'),label=document.createElement('span'),actions=document.createElement('div');
            label.textContent='第 '+(index+1)+' 球 · '+(shot.made?'命中':'未中');actions.className='row-actions';
            const correct=document.createElement('button'),remove=document.createElement('button');
            correct.type='button';correct.textContent='改為'+(shot.made?'未中':'命中');correct.setAttribute('aria-label','第 '+(index+1)+' 球'+correct.textContent);
            remove.type='button';remove.textContent='刪除';remove.setAttribute('aria-label','刪除第 '+(index+1)+' 球');
            correct.addEventListener('click',()=>perform(()=>setActive(C.correctShot(active,shot.id,!shot.made))));
            remove.addEventListener('click',()=>perform(()=>{if(confirm('刪除第 '+(index+1)+' 球？誤記時可直接改為命中或未中。'))setActive(C.removeShot(active,shot.id));}));
            actions.append(correct,remove);li.append(label,actions);list.appendChild(li);
        });
    }
    $('setup-form').addEventListener('submit',event=>{event.preventDefault();perform(()=>{
        $('dashboard-player').value=$('player-code').value.trim();
        $('trend-drill').value=$('drill-type').value;
        setActive(C.createSession({playerCode:$('player-code').value,drill:$('drill-type').value,position:$('drill-type').value==='free_throw'?'center':$('shot-position').value,targetShots:Number($('target-shots').value),note:$('focus-note').value,id:uid()}));
        $('made-btn').focus();
    });});
    function recordShot(made,event){perform(()=>{
        const now=performance.now(),physicalInput=event.isTrusted || event.detail>0;
        if(physicalInput && active?.id===lastRecordSession && now-lastRecordAt<350){$('record-feedback').textContent='剛才已記錄一球，請下一次投籃後再按。';return;}
        setActive(C.addShot(active,made,uid()));
        if(physicalInput){lastRecordAt=now;lastRecordSession=active.id;}
        $('record-feedback').textContent='已記錄第 '+active.shots.length+' 球 · '+(made?'命中':'未中')+(active.shots.length<200?' · 下一球：第 '+(active.shots.length+1)+' 球':' · 已達每組上限');
    });}
    $('made-btn').addEventListener('click',event=>recordShot(true,event));
    $('missed-btn').addEventListener('click',event=>recordShot(false,event));
    $('undo-btn').addEventListener('click',()=>perform(()=>{setActive(C.removeShot(active,active.shots.at(-1)?.id));lastRecordAt=-Infinity;$('record-feedback').textContent='已撤回最後一球 · 現在 '+active.shots.length+' 球，下一球：第 '+(active.shots.length+1)+' 球';}));
    $('finish-btn').addEventListener('click',()=>perform(()=>{
        if(C.summarize(active).remaining && !confirm('尚未達到目標球數，仍要結束並產生報告嗎？'))return;
        setActive(C.finishSession(active));$('report-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }));
    $('new-btn').addEventListener('click',()=>perform(()=>{const previous=active;setActive(null);$('player-code').value=previous.isDemo?'':previous.playerCode;$('drill-type').value=previous.drill;updatePositionField();$('shot-position').value=C.positionOf(previous);$('player-code').focus();}));
    $('repeat-btn').addEventListener('click',()=>perform(()=>{
        if(!active?.finishedAt || active.isDemo)return;
        setActive(C.createSession({playerCode:active.playerCode,drill:active.drill,position:C.positionOf(active),targetShots:active.targetShots,note:active.note,id:uid()}));
        $('made-btn').focus();
    }));
    $('dashboard-player').addEventListener('input',renderDashboard);
    $('drill-type').addEventListener('change',updatePositionField);
    $('trend-drill').addEventListener('change',renderTrend);
    $('trend-position').addEventListener('change',renderTrend);
    $('home-action').addEventListener('click',()=>{
        if(!active && /^[A-Za-z0-9_-]{1,32}$/.test($('dashboard-player').value.trim()))$('player-code').value=$('dashboard-player').value.trim();
        $(active?'session-panel':'setup-panel').scrollIntoView({behavior:'smooth',block:'start'});
        if(!active)$('player-code').focus();
    });
    $('discard-btn').addEventListener('click',()=>perform(()=>{
        if(!active || active.finishedAt)return;
        if(!confirm('放棄目前這組練習？本組逐球紀錄將移除，已完成的歷史報告會保留。'))return;
        const code=active.playerCode;setActive(null);$('player-code').value=code;$('player-code').focus();
    }));
    $('demo-btn').addEventListener('click',()=>perform(()=>setActive(C.demoSession())));
    $('download-report').addEventListener('click',()=>perform(()=>{
        const session=withAnalysis(active);
        const report={...session,summary:C.summarize(active),analysisSummary:A.summary(session.analysisRuns || []),recording:{outcomes:'manual',analysisLink:'session',shotPairing:'separate_order'}};
        download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),(active.isDemo?'DEMO-':'')+'training-'+active.playerCode+'.json');
    }));
    $('download-csv').addEventListener('click',()=>perform(()=>download(new Blob([C.csv(active)],{type:'text/csv;charset=utf-8'}),(active.isDemo?'DEMO-':'')+'training-'+active.playerCode+'.csv')));
    $('print-report').addEventListener('click',()=>window.print());
    $('download-backup').addEventListener('click',()=>perform(()=>{
        const realActive=active?.isDemo?null:active;
        const store={schemaVersion:C.SCHEMA,active:realActive?withAnalysis(realActive):null,history:history.map(withAnalysis)};
        const backup={schemaVersion:'basketball-training-backup-v1',exportedAt:new Date().toISOString(),store};
        download(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),'basketball-backup-'+new Date().toISOString().slice(0,10)+'.json');
    }));
    $('import-backup').addEventListener('change',async()=>{
        const input=$('import-backup'),file=input.files[0];if(!file)return;
        input.disabled=true;$('import-status').textContent='正在檢查備份…';
        try {
            if(file.size>5*1024*1024)throw new Error('備份檔限 5 MB。');
            const incoming=C.parseBackup(await file.text());
            if(loadFailed)throw new Error('本機舊資料無法讀取，請先備份或清理後再匯入。');
            const saved=localStorage.getItem(KEY),store=saved?C.parseStore(saved):{schemaVersion:C.SCHEMA,active:null,history:[]};
            // Import against the displayed state; never overwrite another tab's edits.
            const current={schemaVersion:C.SCHEMA,active:active?.isDemo?store.active:active,history};
            if(saved && JSON.stringify(store)!==JSON.stringify(current))throw new Error('紀錄已在其他分頁變更，請重新整理後再匯入。');
            const next=C.mergeBackup(current,incoming);
            localStorage.setItem(KEY,JSON.stringify({schemaVersion:C.SCHEMA,active:next.active,history:next.history}));
            active=next.active;history=next.history;
            $('dashboard-player').value=active?.playerCode || history[0]?.playerCode || '';
            render();$('import-status').textContent='匯入完成：新增 '+next.added+' 組，保留既有版本 '+next.skipped+' 組。';
        }catch(error){$('import-status').textContent='未匯入：'+(error.message || '檔案無法讀取');}
        finally{input.disabled=false;input.value='';}
    });
    window.addEventListener('storage',event=>{if(event.key===A.KEY && active)renderAnalysis();});
    window.addEventListener('focus',()=>{if(active)renderAnalysis();});
    $('clear-history').addEventListener('click',()=>perform(()=>{
        if(active && !active.finishedAt)throw new Error('請先結束目前練習並下載報告，再清除紀錄。');
        if(!confirm('永久清除此裝置的全部訓練紀錄？請先下載需要的報告。'))return;
        localStorage.removeItem(A.KEY);localStorage.removeItem(KEY);history=[];active=null;loadFailed=false;persist();render();message('此裝置的訓練紀錄與動作摘要已清除。');
    }));
    try {
        const saved=localStorage.getItem(KEY);
        if(saved){const data=C.parseStore(saved);history=data.history;active=data.active;}
    }catch(error){loadFailed=true;$('storage-status').textContent='無法讀取本機紀錄；舊資料保留，暫停自動儲存。仍可練習並下載報告。';}
    $('dashboard-player').value=active?.isDemo?'':(active?.playerCode || history[0]?.playerCode || '');
    if(active)$('trend-drill').value=active.drill;
    updatePositionField();
    render();
})();
