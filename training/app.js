(function() {
    'use strict';
    const C=TrainingCore, KEY='basketball-training-v1';
    const $=id=>document.getElementById(id);
    let active=null,history=[],loadFailed=false;
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
    function renderHistory() {
        const parent=$('history-list');parent.replaceChildren();
        if(!history.length) {const p=document.createElement('p');p.className='muted';p.textContent='第一組練習完成後，報告會出現在這裡。';parent.appendChild(p);}
        history.forEach(session=>{
            const stats=C.summarize(session),button=document.createElement('button');
            button.type='button';button.className='history-item';
            const info=document.createElement('span'),title=document.createElement('strong'),date=document.createElement('small'),score=document.createElement('span');
            title.textContent=session.playerCode+' · '+C.DRILLS[session.drill];date.textContent=formatDate(session.startedAt)+' · '+stats.made+'/'+stats.total+' 命中';score.textContent=rate(stats);
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
    }
    function render() {
        renderDashboard();
        $('setup-panel').hidden=!!active;$('session-panel').hidden=!active;
        for(const id of ['step-setup','step-train','step-report']) $(id).removeAttribute('aria-current');
        $(active?(active.finishedAt?'step-report':'step-train'):'step-setup').setAttribute('aria-current','step');
        renderHistory();if(!active)return;
        const stats=C.summarize(active),finished=!!active.finishedAt;
        $('session-label').textContent=active.isDemo?'SYNTHETIC DEMO / 合成示範':'SHOOTING / 人工紀錄';
        $('session-title').textContent=active.playerCode+' 的'+C.DRILLS[active.drill]+'練習';
        $('session-state').textContent=finished?'訓練報告':'進行中';
        $('demo-banner').hidden=!active.isDemo;
        $('session-focus').textContent=active.note || '今天的重點：完成一組罰球並如實記錄。';
        $('total-value').textContent=stats.total;$('made-value').textContent=stats.made;$('percentage-value').textContent=rate(stats);
        $('shot-progress').max=active.targetShots;$('shot-progress').value=Math.min(stats.total,active.targetShots);
        $('progress-label').textContent=stats.targetReached?'已達 '+active.targetShots+' 球目標'+(finished?'。':'，可結束看報告或繼續記錄。'):'目標 '+active.targetShots+' 球 · 還有 '+stats.remaining+' 球'+(finished?'（本組提前結束）':'');
        $('record-controls').hidden=finished;$('report-panel').hidden=!finished;$('new-btn').hidden=!finished;
        $('discard-btn').hidden=finished;
        $('repeat-btn').hidden=!finished || active.isDemo;
        $('undo-btn').disabled=!stats.total;$('finish-btn').disabled=!stats.total;
        $('made-btn').disabled=stats.total>=200;$('missed-btn').disabled=stats.total>=200;
        $('report-summary').textContent=formatDate(active.startedAt)+' 開始 · 已記錄 '+stats.total+' 球，命中 '+stats.made+' 球，未中 '+stats.missed+' 球。'+(stats.percentage===null?'尚無可計算的命中率。':'本組命中率 '+rate(stats)+'。');
        const previous=C.previousSession(active,history),previousStats=previous?C.summarize(previous):null;
        $('comparison').textContent=previousStats && previousStats.percentage!==null && stats.percentage!==null
            ?'同代碼、同類型上一組：'+previousStats.made+'/'+previousStats.total+'（'+rate(previousStats)+'）。本組差異 '+(stats.percentage-previousStats.percentage>=0?'+':'')+(stats.percentage-previousStats.percentage).toFixed(1)+' 個百分點。'
            :'累積同代碼、同投籃類型的下一組紀錄後，就能回看跨次差異。';
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
        setActive(C.createSession({playerCode:$('player-code').value,drill:$('drill-type').value,targetShots:Number($('target-shots').value),note:$('focus-note').value,id:uid()}));
        $('made-btn').focus();
    });});
    $('made-btn').addEventListener('click',()=>perform(()=>setActive(C.addShot(active,true,uid()))));
    $('missed-btn').addEventListener('click',()=>perform(()=>setActive(C.addShot(active,false,uid()))));
    $('undo-btn').addEventListener('click',()=>perform(()=>setActive(C.removeShot(active,active.shots.at(-1)?.id))));
    $('finish-btn').addEventListener('click',()=>perform(()=>{
        if(C.summarize(active).remaining && !confirm('尚未達到目標球數，仍要結束並產生報告嗎？'))return;
        setActive(C.finishSession(active));$('report-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }));
    $('new-btn').addEventListener('click',()=>perform(()=>{const code=active.playerCode;setActive(null);$('player-code').value=code==='DEMO01'?'':code;$('player-code').focus();}));
    $('repeat-btn').addEventListener('click',()=>perform(()=>{
        if(!active?.finishedAt || active.isDemo)return;
        setActive(C.createSession({playerCode:active.playerCode,drill:active.drill,targetShots:active.targetShots,note:active.note,id:uid()}));
        $('made-btn').focus();
    }));
    $('dashboard-player').addEventListener('input',renderDashboard);
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
        const report={...active,summary:C.summarize(active),limitations:{outcomes:'manual',automaticShotDetection:false,poseAnalysisLinked:false,trainingEfficacyValidated:false}};
        download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),(active.isDemo?'DEMO-':'')+'training-'+active.playerCode+'.json');
    }));
    $('download-csv').addEventListener('click',()=>perform(()=>download(new Blob([C.csv(active)],{type:'text/csv;charset=utf-8'}),(active.isDemo?'DEMO-':'')+'training-'+active.playerCode+'.csv')));
    $('print-report').addEventListener('click',()=>window.print());
    $('clear-history').addEventListener('click',()=>perform(()=>{
        if(active && !active.finishedAt)throw new Error('請先結束目前練習並下載報告，再清除紀錄。');
        if(!confirm('永久清除此裝置的全部訓練紀錄？請先下載需要的報告。'))return;
        localStorage.removeItem(KEY);history=[];active=null;loadFailed=false;persist();render();message('此裝置的訓練紀錄已清除。');
    }));
    try {
        const saved=localStorage.getItem(KEY);
        if(saved){const data=C.parseStore(saved);history=data.history;active=data.active;}
    }catch(error){loadFailed=true;$('storage-status').textContent='無法讀取本機紀錄；舊資料保留，暫停自動儲存。仍可練習並下載報告。';}
    $('dashboard-player').value=active?.isDemo?'':(active?.playerCode || history[0]?.playerCode || '');
    render();
})();
