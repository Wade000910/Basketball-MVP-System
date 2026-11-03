const fs=require('node:fs'),path=require('node:path');
// Cloud backup, team join and coach view, driven through the real pages with an in-memory API.
module.exports=async function({run,send,evaluate,ready,sleep,screenshot,url}){
    const checks=[];
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Network.enable');
    await send('Network.setBlockedURLs',{urls:['https://cdn.jsdelivr.net/*','https://cdn.tailwindcss.com/*']});
    const fake=await send('Page.addScriptToEvaluateOnNewDocument',{source:fs.readFileSync(path.join(__dirname,'cloud-fake.js'),'utf8')});
    const coachUrl=new URL('../coach/',url).href;
    const go=async(target,readyExpr='typeof TrainingCore!=="undefined"')=>{await send('Page.navigate',{url:target});for(let i=0;i<100;i++){if(await evaluate(`document.readyState==="complete" && ${readyExpr}`))return;await sleep(100);}throw new Error('Load timed out: '+target);};
    const until=async(expr,label)=>{for(let i=0;i<60;i++){if(await evaluate(expr))return;await sleep(100);}throw new Error('Timed out: '+label);};
    await evaluate('localStorage.clear()');await go(url);
    await run(`check(!$('cloud-signin').hidden && $('cloud-account').hidden,'Signed-out form missing');check($('cloud-pill').textContent==='未登入','Pill');`);
    checks.push('signed-out local use');

    // Coach creates the team.
    await run(`$('cloud-email').value='coach@test.tw';$('cloud-password').value='secret1';$('cloud-signup-btn').click();`);
    await until(`!document.getElementById('cloud-account').hidden`,'coach sign-up');
    await run(`$('cloud-team-name').value='大同資工系隊';$('cloud-create').requestSubmit();`);
    await until(`document.getElementById('cloud-status').textContent.includes('請先設定顯示名字')`,'name required before creating');
    await run(`$('cloud-name').value='林教練';$('cloud-create').requestSubmit();`);
    await until(`document.getElementById('cloud-teams').textContent.includes('邀請碼')`,'team created');
    const code=await evaluate(`document.getElementById('cloud-teams').textContent.match(/邀請碼 ([A-Z0-9]{8})/)[1]`);
    await run(`check($('cloud-teams').querySelector('a').href.includes('/coach/?team='),'Coach link missing');$('cloud-signout-btn').click();`);
    await until(`!document.getElementById('cloud-signin').hidden`,'coach sign-out');
    checks.push('coach sign-up, team creation with invite code');

    // Player signs up, joins and trains with the camera summary.
    await run(`$('cloud-email').value='p1@test.tw';$('cloud-password').value='secret2';$('cloud-signup-btn').click();`);
    await until(`!document.getElementById('cloud-account').hidden`,'player sign-up');
    await run(`$('cloud-name').value='阿峻 #23';$('cloud-join-code').value='WRONG123';$('cloud-join').requestSubmit();`);
    await until(`document.getElementById('cloud-status').textContent.includes('找不到這個邀請碼')`,'bad code explained');
    await run(`$('cloud-join-code').value=${JSON.stringify(code.toLowerCase())};$('cloud-join').requestSubmit();`);
    await until(`document.getElementById('cloud-teams').textContent.includes('大同資工系隊') && document.getElementById('cloud-teams').textContent.includes('球員')`,'joined team');
    await run(`$('player-code').value='JUN23';$('drill-type').value='free_throw';$('setup-form').requestSubmit();$('made-btn').click();$('made-btn').click();$('missed-btn').click();
        const s=JSON.parse(localStorage.getItem('basketball-training-v1')).active;
        const trials=s.shots.map((x,i)=>({trialOrder:i+1,trialStatus:'accepted',dt:[90,110,170][i],timestamp:new Date(Date.parse(x.recordedAt)-2000).toISOString(),reasonCode:''}));
        localStorage.setItem(TrainingAnalysis.KEY,JSON.stringify([{schemaVersion:TrainingAnalysis.SCHEMA,id:'run-1',participantId:'JUN23',sessionId:s.id,blockId:'B01',condition:'auditory',shootingSide:'right',startedAt:s.startedAt,stoppedAt:new Date().toISOString(),trials}]));
        window.confirm=()=>true;$('finish-btn').click();
        check(!$('analysis-paired').hidden && $('analysis-paired').textContent.includes('3 球中 3 球'),'Pairing summary missing');`);
    await until(`document.getElementById('cloud-status').textContent.includes('已同步') && JSON.parse(localStorage.getItem('fake-cloud-db')).sessions && Object.values(JSON.parse(localStorage.getItem('fake-cloud-db')).sessions).some(s=>s.finished_at && s.analysis_runs.length===1)`,'auto sync after finishing');
    checks.push('invite code join, bad code message, auto sync with motion summary, made/missed pairing');
    await screenshot('10-cloud-panel-desktop.png');

    // Sync failure keeps local data and says so.
    await run(`window.fakeCloudFail='upsertSessions';$('cloud-sync-btn').click();`);
    await until(`document.getElementById('cloud-status').textContent.includes('同步失敗') && document.getElementById('cloud-status').textContent.includes('網路')`,'sync failure message');
    await run(`window.fakeCloudFail=null;check(JSON.parse(localStorage.getItem('basketball-training-v1')).history.length===1,'Local data lost on failure');`);
    checks.push('offline sync failure keeps device data');

    // A new phone: device storage is empty, the cloud copy comes back after sign-in.
    await evaluate(`localStorage.removeItem('basketball-training-v1');localStorage.removeItem(TrainingAnalysis.KEY);`);
    await go(url);
    await until(`document.getElementById('cloud-status').textContent.includes('已還原 1 組')`,'restore on new device');
    await run(`check(document.querySelectorAll('.history-item').length===1,'Restored history not shown');[...document.querySelectorAll('.history-item')][0].click();check($('analysis-paired').textContent.includes('3 球中 3 球'),'Motion summary not restored');check(document.documentElement.scrollWidth<=window.innerWidth,'Overflow');`);
    checks.push('restore history and motion summaries on a new device');

    // Coach view with real (fake-backed) data.
    await run(`$('cloud-signout-btn').click();`);await until(`!document.getElementById('cloud-signin').hidden`,'player sign-out');
    await go(coachUrl,'typeof CoachCore!=="undefined"');
    await run(`check(!$('coach-signin').hidden,'Coach sign-in missing');$('coach-email').value='p1@test.tw';$('coach-password').value='secret2';$('coach-signin-form').requestSubmit();`);
    await until(`document.getElementById('coach-message').textContent.includes('還不是任何球隊的教練')`,'player blocked from coach view');
    await evaluate(`(()=>{const db=JSON.parse(localStorage.getItem('fake-cloud-db'));db.me=null;localStorage.setItem('fake-cloud-db',JSON.stringify(db));})()`);
    await go(coachUrl,'typeof CoachCore!=="undefined"');
    await run(`$('coach-email').value='coach@test.tw';$('coach-password').value='secret1';$('coach-signin-form').requestSubmit();`);
    await until(`!document.getElementById('coach-dashboard').hidden && document.getElementById('roster-rows').textContent.includes('阿峻')`,'coach dashboard');
    await run(`check($('team-title').textContent==='大同資工系隊','Team title');check($('kpi-active').textContent==='1 / 1','Active KPI');check($('kpi-shots').textContent==='3','Shots KPI');check($('roster-rows').textContent.includes('66.7%'),'FT rate');
        $('roster-rows').querySelector('button').click();check(!$('player-detail').hidden,'Detail hidden');check($('detail-motion').textContent.includes('100 ms') && $('detail-motion').textContent.includes('170 ms'),'Motion means missing');`);
    await screenshot('11-coach-real-desktop.png');
    await run(`window.confirm=()=>true;$('remove-player').click();`);
    await until(`document.getElementById('roster-rows').textContent.includes('還沒有球員加入')`,'player removed');
    checks.push('coach dashboard with members only, player blocked from coach view, coach removes player');

    // Without a configured project the app stays local-only.
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:fake.identifier});
    await go(url);
    await run(`check($('cloud-pill').textContent==='未啟用' && $('cloud-signin').hidden,'Unconfigured cloud not explained');`);
    await go(coachUrl,'typeof CoachCore!=="undefined"');
    await run(`check($('coach-message').textContent.includes('尚未設定'),'Coach unconfigured message');`);
    checks.push('unconfigured project stays local-only');

    // Synthetic demo team for presentations.
    await go(coachUrl+'?demo=1','typeof CoachCore!=="undefined"');
    await run(`check(!$('demo-note').hidden,'Demo not labelled');check(document.querySelectorAll('#roster-rows tr').length===6,'Demo roster');check(!$('player-detail').hidden,'Demo detail');check(document.documentElement.scrollWidth<=window.innerWidth,'Coach overflow');`);
    await screenshot('12-coach-demo-desktop.png');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await go(coachUrl+'?demo=1','typeof CoachCore!=="undefined"');
    await run(`check(document.documentElement.scrollWidth<=window.innerWidth,'Coach mobile overflow');`);
    await screenshot('13-coach-demo-mobile.png');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    checks.push('demo coach view desktop and mobile');
    await evaluate('localStorage.clear()');await go(url);
    return checks;
};
