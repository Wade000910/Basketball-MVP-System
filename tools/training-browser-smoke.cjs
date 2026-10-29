const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const previewRoot=path.join(require('node:os').tmpdir(),'basketball-training-preview');fs.mkdirSync(previewRoot,{recursive:true});
const output=fs.mkdtempSync(path.join(previewRoot,'run-'));
const profile=fs.mkdtempSync(path.join(output,'chrome-profile-'));
const server=http.createServer((req,res)=>{
    try{
        let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(name.endsWith('/'))name+='index.html';
        const file=path.resolve(root,'.'+name);
        if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).on('error',()=>res.writeHead(404).end()).pipe(res);
    }catch{res.writeHead(400).end();}
});
let browser,ws;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const url='http://127.0.0.1:'+server.address().port+'/training/';
    if(!process.env.BROWSER_BIN)throw new Error('Set BROWSER_BIN to a Chrome/Chromium executable.');
    browser=spawn(process.env.BROWSER_BIN,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);let stderr='';
        browser.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
        browser.on('error',reject);
    });
    const origin='http://'+new URL(endpoint).host;
    const target=await (await fetch(origin+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    let seq=0;const pending=new Map(),exceptions=[];
    ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || 'Browser evaluation failed');return r.result.value;};
    const ready=async()=>{for(let n=0;n<100;n++){if(await evaluate('document.readyState==="complete" && typeof TrainingCore!=="undefined"'))return;await sleep(100);}throw new Error('Page load timed out');};
    const run=code=>evaluate(`(()=>{const $=id=>document.getElementById(id);const check=(ok,msg)=>{if(!ok)throw new Error(msg);};${code}})()`);
    await send('Runtime.enable');await send('Page.enable');await ready();
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(output,name),Buffer.from(r.data,'base64'));};
    await screenshot('01-setup-desktop.png');
    await run(`$('demo-btn').click();check($('percentage-value').textContent==='70%','Demo rate');check(!$('demo-banner').hidden,'Demo banner');check(localStorage.getItem('basketball-training-v1')===null,'Demo leaked to storage');`);
    await screenshot('02-demo-report-desktop.png');
    await run(`$('new-btn').click();$('player-code').value='P001';$('focus-note').value='<img src=x onerror=alert(1)>'; $('setup-form').requestSubmit();check(!$('session-panel').hidden,'Start');for(let i=0;i<5;i++)$('made-btn').click();for(let i=0;i<3;i++)$('missed-btn').click();$('undo-btn').click();$('shot-list').querySelector('button').click();check($('total-value').textContent==='7','Undo total');check($('made-value').textContent==='4','Correct made');check(!$('session-focus').querySelector('img'),'Unsafe note');window.confirm=()=>true;$('finish-btn').click();check(!$('report-panel').hidden,'Finish report');check(document.querySelectorAll('.history-item').length===1,'History');`);
    await send('Page.reload');await sleep(300);await ready();
    await run(`check($('total-value').textContent==='7','Restore total');check(!$('report-panel').hidden,'Restore report');$('shot-list').querySelector('button').click();check($('made-value').textContent==='5','Finished correction');`);
    await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
    await run(`$('download-report').click();$('download-csv').click();`);
    for(let i=0;i<60;i++){if(fs.existsSync(path.join(output,'training-P001.json'))&&fs.existsSync(path.join(output,'training-P001.csv')))break;await sleep(100);}
    const report=JSON.parse(fs.readFileSync(path.join(output,'training-P001.json'),'utf8'));
    assert.equal(report.summary.total,7);assert.equal(report.summary.made,5);assert.equal(report.inputSource,'manual');assert.equal(report.isDemo,false);
    assert.equal(fs.readFileSync(path.join(output,'training-P001.csv'),'utf8').split('\r\n').length,8);
    await run(`$('new-btn').click();$('setup-form').requestSubmit();$('missed-btn').click();window.confirm=()=>true;$('finish-btn').click();check($('comparison').textContent.includes('-71.4'),'Prior comparison');check(document.querySelectorAll('.history-item').length===2,'Two histories');`);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await screenshot('03-report-mobile.png');
    await run(`check(document.documentElement.scrollWidth<=window.innerWidth,'Mobile horizontal overflow');$('new-btn').click();$('demo-btn').click();check(document.querySelectorAll('.history-item').length===2,'Demo changed real history');check(JSON.parse(localStorage.getItem('basketball-training-v1')).history.length===2,'Demo stored history');`);
    await screenshot('04-demo-report-mobile.png');
    const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});fs.writeFileSync(path.join(output,'demo-training-report.pdf'),Buffer.from(pdf.data,'base64'));
    await run(`$('new-btn').click();$('player-code').value='P002';$('setup-form').requestSubmit();$('made-btn').click();`);
    await send('Page.reload');await sleep(300);await ready();
    await run(`check($('total-value').textContent==='1','Active recovery');check(!$('record-controls').hidden,'Active session became completed');$('missed-btn').click();window.confirm=()=>true;$('finish-btn').click();check($('total-value').textContent==='2','Resume recording');`);
    // Verify storage denial is explicit and the session still supports export.
    await run(`$('new-btn').click();Storage.prototype.setItem=()=>{throw new Error('QuotaExceededError');};$('player-code').value='P003';$('setup-form').requestSubmit();check($('storage-status').textContent.includes('未成功儲存'),'Storage failure hidden');$('made-btn').click();window.confirm=()=>true;$('finish-btn').click();check($('total-value').textContent==='1','Denied storage blocked session');`);
    assert.deepEqual(exceptions,[]);
    console.log(JSON.stringify({passed:true,checks:['setup','synthetic isolation','manual recording','undo','correction','finish','completed and active reload recovery','JSON/CSV actual download','print PDF','same-player comparison','mobile width','storage denial'],screenshots:4,output},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(ws)ws.close();if(browser)browser.kill();server.close();});
