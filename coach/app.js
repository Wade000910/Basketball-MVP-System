(function(){
    'use strict';
    const $=id=>document.getElementById(id);
    const params=new URLSearchParams(location.search),demo=params.get('demo')==='1';
    const api=demo?null:Cloud.connect();
    const WEEKS=4,SINCE_DAYS=WEEKS*7;
    let user=null,teams=[],team=null,roster=[],sessions=[],report=null,selected=null;
    const rate=r=>r.percentage===null?'—':r.percentage+'%';
    const day=v=>new Date(v).toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'});
    function message(text=''){$('coach-message').textContent=text;$('coach-message').hidden=!text;}
    const ns='http://www.w3.org/2000/svg';
    function svg(attrs){const n=document.createElementNS(ns,'svg');for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
    function add(parent,tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;}

    // HTML bars keep labels at full text size on phones; each bar carries its own text.
    function weeklyChart(weeks,label){
        const max=Math.max(1,...weeks.map(w=>w.total)),wrap=document.createElement('div');
        wrap.className='week-bars';wrap.setAttribute('role','list');wrap.setAttribute('aria-label',label);
        weeks.forEach((w,i)=>{
            const col=document.createElement('div'),r=document.createElement('strong'),track=document.createElement('div'),bar=document.createElement('div'),n=document.createElement('span'),when=document.createElement('small');
            col.className='week';col.setAttribute('role','listitem');
            const name=i===weeks.length-1?'最近 7 天':(weeks.length-1-i)+' 週前';
            r.textContent=w.total?rate(w):'—';track.className='week-track';bar.className='week-bar';
            bar.style.height=Math.max(w.total?4:0,Math.round(w.total/max*100))+'%';
            n.textContent=w.total+' 球';when.textContent=name;
            col.setAttribute('aria-label',name+'：'+w.total+' 球，命中率 '+rate(w));
            track.appendChild(bar);col.append(r,track,n,when);wrap.appendChild(col);
        });
        return wrap;
    }
    function sparkline(points){
        const s=svg({viewBox:'0 0 96 28',class:'spark',role:'img','aria-label':points.length?'最近 '+points.length+' 組罰球命中率：'+points.map(rate).join('、'):'沒有罰球紀錄'});
        if(!points.length)return s;
        const xy=points.map((p,i)=>[points.length===1?48:4+i*88/(points.length-1),24-(p.percentage ?? 0)*.2]);
        if(xy.length>1)add(s,'polyline',{points:xy.map(c=>c.join(',')).join(' ')});
        add(s,'circle',{cx:xy.at(-1)[0],cy:xy.at(-1)[1],r:3});
        return s;
    }

    function render(){
        report=CoachCore.teamReport(roster,sessions,new Date(),{weeks:WEEKS});
        const t=report.team;
        $('team-title').textContent=team.name;
        $('team-subtitle').textContent=demo?'合成資料示範 · 近 '+WEEKS+' 週':'邀請碼 '+team.invite_code+' · 球員在訓練室輸入邀請碼即可加入 · 近 '+WEEKS+' 週資料';
        $('kpi-active').textContent=t.active7+' / '+t.players;
        $('kpi-shots').textContent=t.shots7;
        $('kpi-sessions').textContent=t.sessions7;
        $('kpi-ft').textContent=rate(t.byDrill.free_throw);
        $('team-weekly').replaceChildren(weeklyChart(t.weekly,'全隊每週出手數與命中率'));
        const alerts=$('inactive-list');alerts.replaceChildren();
        if(!report.inactive.length){const li=document.createElement('li');li.textContent='近 7 天每位球員都有練習。';alerts.appendChild(li);}
        report.inactive.forEach(p=>{const li=document.createElement('li'),n=document.createElement('strong'),d=document.createElement('span');n.textContent=p.name;d.textContent=p.daysSince===null?'還沒有練習紀錄':p.daysSince+' 天沒有練習';li.append(n,d);alerts.appendChild(li);});
        $('roster-count').textContent=report.players.length+' 位球員';
        const rows=$('roster-rows');rows.replaceChildren();
        if(!report.players.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.className='muted';td.textContent='還沒有球員加入。把邀請碼給球員，他們在訓練室登入後輸入即可。';tr.appendChild(td);rows.appendChild(tr);}
        report.players.forEach(p=>{
            const tr=document.createElement('tr'),name=document.createElement('td'),button=document.createElement('button');
            button.type='button';button.textContent=p.name;button.addEventListener('click',()=>select(p.userId));name.appendChild(button);tr.appendChild(name);
            tr.setAttribute('aria-selected',String(p.userId===selected));
            tr.addEventListener('click',event=>{if(event.target!==button)select(p.userId);});
            for(const v of [p.sessions7,p.shots7,rate(p.byDrill.free_throw),rate(p.byDrill.mid_range),rate(p.byDrill.three_point)]){const td=document.createElement('td');td.className='num';td.textContent=String(v);tr.appendChild(td);}
            const spark=document.createElement('td');spark.appendChild(sparkline(p.trend));tr.appendChild(spark);
            const last=document.createElement('td');last.textContent=p.lastPracticeAt?day(p.lastPracticeAt)+(p.daysSince>=7?' · '+p.daysSince+' 天前':''):'尚未練習';tr.appendChild(last);
            rows.appendChild(tr);
        });
        renderDetail();
    }
    function select(userId){selected=userId;render();$('player-detail').scrollIntoView({behavior:'smooth',block:'start'});}
    function renderDetail(){
        const p=report.players.find(x=>x.userId===selected);
        $('player-detail').hidden=!p;if(!p)return;
        $('detail-name').textContent=p.name;
        $('detail-pill').textContent='共 '+p.sessions+' 組 · 整體 '+rate(p.overall);
        $('detail-weekly').replaceChildren(weeklyChart(p.weekly,p.name+' 每週出手數與命中率'));
        const m=p.motion,box=$('detail-motion');box.replaceChildren();
        $('detail-motion-lead').textContent=m.paired?'近 '+WEEKS+' 週罰球中，'+m.paired+' 球對到相機動作紀錄，其中 '+m.usable+' 球有可用時序。':'這位球員近 '+WEEKS+' 週沒有搭配相機的罰球紀錄。';
        if(m.usable)for(const [label,g] of [['命中時',m.made],['未中時',m.missed]]){
            const card=document.createElement('div'),title=document.createElement('span'),value=document.createElement('strong'),note=document.createElement('small');
            title.textContent=label+'平均 Δt';value.textContent=g.meanDt===null?'—':g.meanDt+' ms';
            note.textContent=g.count+' 球'+(g.sdDt===null?'':' · 標準差 '+g.sdDt+' ms（越小代表動作越一致）');
            card.append(title,value,note);box.appendChild(card);
        }
        $('remove-player').hidden=demo;
    }

    async function loadTeam(){
        message();
        if(demo)return render();
        const since=new Date(Date.now()-SINCE_DAYS*86400000).toISOString();
        roster=await api.roster(team.id);
        const rows=await api.teamSessions(roster.filter(m=>m.role==='player').map(m=>m.user_id),since);
        sessions=rows.map(r=>({...Cloud.fromRow(r),userId:r.user_id}));
        if(selected && !roster.some(m=>m.user_id===selected))selected=null;
        render();
    }
    async function signedIn(next){
        user=next;
        $('coach-signin').hidden=!!user;$('coach-dashboard').hidden=!user;
        if(!user)return;
        teams=(await api.myTeams(user.id)).filter(t=>t.role==='coach');
        if(!teams.length){$('coach-dashboard').hidden=true;message('這個帳號還不是任何球隊的教練。請先到球員訓練室登入，在「雲端備份與球隊」建立球隊。');return;}
        const picker=$('team-picker');picker.replaceChildren();
        teams.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;picker.appendChild(o);});
        $('team-picker-label').hidden=teams.length<2;
        team=teams.find(t=>t.id===params.get('team')) || teams[0];picker.value=team.id;
        await loadTeam();
    }
    const fail=error=>message(Cloud.friendlyError(error));

    $('print-btn').addEventListener('click',()=>window.print());
    $('refresh-btn').addEventListener('click',()=>loadTeam().catch(fail));
    $('team-picker').addEventListener('change',()=>{team=teams.find(t=>t.id===$('team-picker').value);selected=null;loadTeam().catch(fail);});
    $('signout-btn').addEventListener('click',()=>{if(demo){location.search='';return;}api.signOut().then(()=>signedIn(null)).catch(fail);});
    $('remove-player').addEventListener('click',()=>{
        const p=report.players.find(x=>x.userId===selected);if(!p)return;
        if(!confirm('將「'+p.name+'」移出球隊？你將無法再看到他的紀錄，球員自己的資料不會刪除。'))return;
        api.removeMember(team.id,p.userId).then(()=>{selected=null;return loadTeam();}).catch(fail);
    });
    $('coach-signin-form').addEventListener('submit',event=>{
        event.preventDefault();
        api.signIn($('coach-email').value.trim(),$('coach-password').value).then(signedIn).catch(fail);
    });

    if(demo){
        const data=CoachCore.demoData();
        team=data.team;roster=data.roster;sessions=data.sessions;selected=roster[1].user_id;
        $('demo-note').hidden=false;$('coach-dashboard').hidden=false;$('signout-btn').textContent='離開示範';
        render();return;
    }
    if(!api){
        $('coach-signin').hidden=false;$('coach-signin-form').querySelector('button[type=submit]').disabled=true;
        message('雲端功能尚未設定，目前只能查看示範球隊。');return;
    }
    $('coach-signin').hidden=false;
    api.currentUser().then(signedIn).catch(fail);
})();
