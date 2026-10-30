const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function({run,send,evaluate,ready,sleep,screenshot,url,output}){
    await run(`$('new-btn').click();$('player-code').value='WORKFLOW';$('drill-type').value='free_throw';$('setup-form').requestSubmit();$('made-btn').click();window.workflowId=JSON.parse(localStorage.getItem('basketball-training-v1')).active.id;`);
    const id=await evaluate('window.workflowId');
    console.log('Workflow: checking camera page with simulated provider.');
    await send('Network.enable');
    await send('Network.setBlockedURLs',{urls:['https://cdn.tailwindcss.com/*','https://cdn.jsdelivr.net/*','*/vendor/mediapipe-pose/pose.js']});
    // Simulate only the camera provider and pose results; use the real page,
    // canvas MediaStream, native MediaRecorder, stop handler and storage bridge.
    const injected=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
        window.Chart=class{constructor(){this.data={labels:[],datasets:[{},{}]};}update(){}};
        window.Pose=class{setOptions(){}onResults(fn){window.testPoseResult=fn;}async send(){}};
        window.drawConnectors=()=>{};window.drawLandmarks=()=>{};window.POSE_CONNECTIONS=[];
        window.Camera=class{constructor(video){this.video=video;}async start(){if(window.failCamera)throw new Error('Permission denied');this.canvas=document.createElement('canvas');this.canvas.width=640;this.canvas.height=480;this.stream=this.canvas.captureStream(30);this.video.srcObject=this.stream;this.timer=setInterval(()=>{this.canvas.getContext('2d').fillRect(0,0,640,480);},33);await this.video.play();}stop(){clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());}};
    `});
    await send('Page.navigate',{url:new URL('../專題程式/?from=training&player=WORKFLOW&session='+id,url).href});
    for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && typeof startBtn!=="undefined"'))break;await sleep(100);}
    await run(`check($('participant_id').value==='WORKFLOW','Linked code missing');check($('session_id').value===${JSON.stringify(id)},'Linked session missing');check($('participant_id').readOnly,'Linked code editable');check(!$('identity-settings').open && !$('advanced-diagnostics').open,'Advanced controls not collapsed');check(!$('analysis-downloads').open,'Downloads expanded on entry');check($('camera-guide').textContent.includes('尚未開啟'),'Misleading camera readiness');`);
    await evaluate('window.failCamera=true;startBtn.onclick()');
    console.log('Workflow: permission rejection recovered; starting canvas camera.');
    await run(`check(!$('start_btn').disabled,'Camera rejection trapped start');check($('camera-guide').textContent.includes('檢查瀏覽器權限'),'Camera denial feedback missing');window.failCamera=false;`);
    await evaluate('startBtn.onclick()');
    await run(`check($('start_btn').classList.contains('hidden'),'Camera did not start');check($('participant_id').disabled,'Context editable during recording');testPoseResult({poseLandmarks:null});check($('camera-guide').textContent.includes('找不到身體'),'Missing body guidance');const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.9}));testPoseResult({poseLandmarks:points});check($('camera-guide').textContent.includes('已偵測'),'Visible body guidance missing');points[28].x=.99;testPoseResult({poseLandmarks:points});check($('camera-guide').textContent.includes('移遠'),'Cropped body guidance missing');localCapture.recordTrial({trialOrder:1,trialStatus:'accepted',dt:0,timestamp:new Date().toISOString(),reasonCode:''});localCapture.recordTrial({trialOrder:2,trialStatus:'invalid',dt:null,timestamp:new Date().toISOString(),reasonCode:'INSUFFICIENT_SAMPLES'});`);
    await evaluate('stopBtn.onclick()');
    console.log('Workflow: native recording stopped.');
    await run(`check($('training-sync').textContent.includes('已存於此瀏覽器'),'Analysis summary not saved');check($('analysis-downloads').open,'Downloads not revealed after stop');const saved=TrainingAnalysis.parse(localStorage.getItem(TrainingAnalysis.KEY));check(saved[0].sessionId===${JSON.stringify(id)} && saved[0].trials.length===2,'Wrong summary context or trials');check($('capture_downloads').children.length===8,'Source package lost');`);
    // A subsequent start must protect the video from accidental replacement.
    await run(`window.confirm=()=>false;`);await evaluate('startBtn.onclick()');
    await run(`check(!$('start_btn').classList.contains('hidden'),'Cancelled restart destroyed recording');`);
    await run(`check(document.documentElement.scrollWidth<=window.innerWidth,'Analysis mobile overflow');`);
    await screenshot('06-analysis-mobile.png');
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected.identifier});
    // The test explicitly abandons its synthetic video after checking the guard.
    await evaluate('localCapture.downloaded=new Set(Object.keys(localCapture.outputs));');
    await send('Page.navigate',{url});await sleep(300);await ready();
    await run(`check($('analysis-summary').textContent.includes('2 個動作試次'),'Training summary missing');check($('analysis-summary').textContent.includes('平均時序差 0 ms'),'True zero lost');check($('analysis-runs').textContent.includes('動作資料不足'),'Invalid trial omitted');window.confirm=()=>true;$('finish-btn').click();$('download-report').click();$('download-backup').click();`);
    const reportFile=path.join(output,'training-WORKFLOW.json');
    for(let n=0;n<100;n++){if(fs.existsSync(reportFile)&&fs.readdirSync(output).some(f=>/^basketball-backup-.*\.json$/.test(f)))break;await sleep(100);}
    const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
    assert.equal(report.analysisRuns[0].trials.length,2);assert.equal(report.analysisSummary.meanDt,0);assert.equal(report.recording.shotPairing,'separate_order');
    const backupFile=fs.readdirSync(output).find(f=>/^basketball-backup-.*\.json$/.test(f));
    const backup=JSON.parse(fs.readFileSync(path.join(output,backupFile),'utf8'));
    assert.equal(backup.store.active.id,id);assert.equal(backup.store.active.analysisRuns.length,1);
    const importFile=async data=>{
        await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(data)}],'backup.json',{type:'application/json'}));const input=document.getElementById('import-backup');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
        for(let n=0;n<50;n++){if(await evaluate('!document.getElementById("import-backup").disabled'))return;await sleep(50);}throw new Error('Import timed out');
    };
    await run(`$('clear-history').click();check(!localStorage.getItem('basketball-analysis-v1'),'Clear retained analysis');check(document.querySelectorAll('.history-item').length===0,'Clear retained history');`);
    await importFile(JSON.stringify(backup));
    await run(`check($('import-status').textContent.includes('匯入完成'),'Backup import failed');check(document.querySelectorAll('.history-item').length===${backup.store.history.length},'History restore mismatch');[...document.querySelectorAll('.history-item')].find(b=>b.textContent.includes('WORKFLOW')).click();`);
    await send('Page.reload');await sleep(300);await ready();
    await run(`window.confirm=()=>true;check($('analysis-summary').textContent.includes('2 個動作試次'),'Imported analysis not durable');`);
    await importFile(JSON.stringify(report));
    await run(`check($('import-status').textContent.includes('保留既有版本 1 組'),'Duplicate not preserved');window.beforeBroken=localStorage.getItem('basketball-training-v1');`);
    await importFile('{broken');
    await run(`check($('import-status').textContent.includes('未匯入'),'Malformed JSON accepted');check(localStorage.getItem('basketball-training-v1')===window.beforeBroken,'Malformed import altered data');`);
    await run(`$('new-btn').click();$('player-code').value='BUSY';$('setup-form').requestSubmit();window.beforeConflict=localStorage.getItem('basketball-training-v1');`);
    const active={...report,id:'different-active',finishedAt:null,analysisRuns:[]};
    await importFile(JSON.stringify(active));
    await run(`check($('import-status').textContent.includes('未匯入'),'Unfinished conflict accepted');check(localStorage.getItem('basketball-training-v1')===window.beforeConflict,'Conflict changed storage');$('discard-btn').click();`);
    await run(`window.savedSetter=Storage.prototype.setItem;window.beforeDenied=localStorage.getItem('basketball-training-v1');window.beforeDeniedHistory=document.querySelectorAll('.history-item').length;Storage.prototype.setItem=()=>{throw new Error('QuotaExceededError');};`);
    await importFile(JSON.stringify({...report,id:'storage-denied-import',analysisRuns:[]}));
    await run(`Storage.prototype.setItem=window.savedSetter;check($('import-status').textContent.includes('未匯入'),'Failed storage reported import success');check(localStorage.getItem('basketball-training-v1')===window.beforeDenied,'Failed import changed storage');check(document.querySelectorAll('.history-item').length===window.beforeDeniedHistory,'Failed import changed view');`);
    await run(`check(document.documentElement.scrollWidth<=window.innerWidth,'Backup mobile overflow');`);
    await screenshot('07-backup-mobile.png');
    await send('Network.setBlockedURLs',{urls:[]});
    return ['camera permission recovery (simulated provider)','automatic identifiers','collapsed advanced settings','live framing guidance (synthetic landmarks)','native recording stop and linked summary','video replacement guard','linked JSON and full backup downloads','backup import and reload','duplicate preservation','malformed and conflicting import rejection','failed import storage preserves data and view'];
};
