(function(){
    'use strict';
    const $=id=>document.getElementById(id);
    const api=Cloud.connect();
    let user=null,syncing=false,pending=false,timer=null,teams=[];
    const time=()=>new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
    function status(text,pill){$('cloud-status').textContent=text;if(pill)$('cloud-pill').textContent=pill;}
    function busy(form,on){form.querySelectorAll('button,input').forEach(el=>{el.disabled=on;});}
    async function guarded(form,action){
        busy(form,true);
        try{await action();}catch(error){status(Cloud.friendlyError(error));}
        finally{busy(form,false);}
    }
    if(!api){
        $('cloud-pill').textContent='未啟用';
        status('雲端功能尚未設定，紀錄只存在這台裝置。請定期下載備份。');
        return;
    }
    $('cloud-signin').hidden=false;

    async function sync(){
        if(!user)return;
        if(syncing){pending=true;return;}
        syncing=true;status('同步中…','同步中');
        try{
            const store=TrainingApp.snapshot();
            await api.upsertSessions(Cloud.uploadRows(store,user.id,TrainingApp.withAnalysis));
            const remote=(await api.ownSessions(user.id)).map(Cloud.fromRow);
            const restored=TrainingApp.applyRemote(remote);
            status('已同步 '+time()+' · 雲端共 '+remote.length+' 組'+(restored?'，已還原 '+restored+' 組到這台裝置':'')+'。','已登入');
        }catch(error){status('同步失敗：'+Cloud.friendlyError(error)+' 紀錄仍保存在這台裝置。','未同步');}
        finally{syncing=false;if(pending){pending=false;sync();}}
    }
    function scheduleSync(){if(!user)return;clearTimeout(timer);timer=setTimeout(sync,1500);}

    function renderTeams(){
        const list=$('cloud-teams');list.replaceChildren();
        if(!teams.length){const li=document.createElement('li');li.className='muted';li.textContent='還沒有加入球隊。個人使用不需要球隊。';list.appendChild(li);return;}
        for(const team of teams){
            const li=document.createElement('li'),info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('span'),actions=document.createElement('div');
            name.textContent=team.name;
            detail.textContent=team.role==='coach'?'教練 · 邀請碼 '+team.invite_code:'球員';
            info.append(name,detail);actions.className='row-actions';
            if(team.role==='coach'){
                const open=document.createElement('a');open.href='../coach/?team='+encodeURIComponent(team.id);open.textContent='教練總覽 ↗';open.className='text-button';
                actions.appendChild(open);
            }
            const leave=document.createElement('button');leave.type='button';leave.className='text-button';leave.textContent='退出';
            leave.addEventListener('click',async()=>{
                if(!confirm('退出「'+team.name+'」？教練將無法再看到你的紀錄，你自己的資料會保留。'))return;
                try{await api.leaveTeam(team.id,user.id);await loadTeams();status('已退出「'+team.name+'」。');}catch(error){status(Cloud.friendlyError(error));}
            });
            actions.appendChild(leave);li.append(info,actions);list.appendChild(li);
        }
    }
    async function loadTeams(){teams=await api.myTeams(user.id);renderTeams();}

    async function signedIn(next){
        if(next?.id===user?.id)return;
        user=next;
        $('cloud-signin').hidden=!!user;$('cloud-account').hidden=!user;
        if(!user){teams=[];status('已登出。這台裝置上的紀錄仍保留；共用裝置請記得清除紀錄。','未登入');return;}
        status('已登入 '+(user.email || '')+'，準備同步…','已登入');
        try{
            const profile=await api.profile(user.id);
            $('cloud-name').value=profile?.display_name || '';
            if(!profile)status('請先設定在球隊中顯示的名字。','已登入');
            await loadTeams();
        }catch(error){status(Cloud.friendlyError(error));}
        await sync();
    }

    $('cloud-signin').addEventListener('submit',event=>{event.preventDefault();guarded($('cloud-signin'),async()=>{
        await signedIn(await api.signIn($('cloud-email').value.trim(),$('cloud-password').value));
    });});
    $('cloud-signup-btn').addEventListener('click',()=>{
        if(!$('cloud-signin').reportValidity())return;
        guarded($('cloud-signin'),async()=>{
            const result=await api.signUp($('cloud-email').value.trim(),$('cloud-password').value);
            if(result.needsConfirmation)status('已寄出確認信，請到信箱點連結後回來登入。');
            else await signedIn(result.user);
        });
    });
    $('cloud-signout-btn').addEventListener('click',()=>guarded($('cloud-account'),async()=>{await api.signOut();await signedIn(null);}));
    $('cloud-sync-btn').addEventListener('click',()=>sync());
    $('cloud-profile').addEventListener('submit',event=>{event.preventDefault();guarded($('cloud-profile'),async()=>{
        await api.saveProfile(user.id,$('cloud-name').value.trim());status('名字已儲存。');
    });});
    $('cloud-join').addEventListener('submit',event=>{event.preventDefault();guarded($('cloud-join'),async()=>{
        if(!$('cloud-name').value.trim())throw new Error('請先設定在球隊中顯示的名字，教練才認得你。');
        await api.saveProfile(user.id,$('cloud-name').value.trim());
        const team=await api.joinTeam($('cloud-join-code').value.trim());
        $('cloud-join-code').value='';await loadTeams();status('已加入「'+team.name+'」。教練現在可以看到你的練習紀錄。');
    });});
    $('cloud-create').addEventListener('submit',event=>{event.preventDefault();guarded($('cloud-create'),async()=>{
        if(!$('cloud-name').value.trim())throw new Error('請先設定顯示名字。');
        await api.saveProfile(user.id,$('cloud-name').value.trim());
        const team=await api.createTeam($('cloud-team-name').value.trim());
        $('cloud-team-name').value='';await loadTeams();status('已建立「'+team.name+'」，邀請碼 '+team.invite_code+'。把邀請碼給球員即可加入。');
    });});

    window.addEventListener('training:saved',scheduleSync);
    api.onAuthChange(next=>{signedIn(next);});
    api.currentUser().then(signedIn).catch(error=>status(Cloud.friendlyError(error)));
})();
