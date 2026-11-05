// Browser check for shoot/ (player shooting page) and shoot/mark.html (teammate marking).
// Chromium's fake camera supplies frames (no person in them), so detected shots are
// injected through the page's own trial handler; voice uses a scripted recogniser and the
// cloud uses tools/cloud-fake.js. Screenshots go to the directory printed at the end.
//   node tools/shoot-browser-check.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(execFileSync('npm',['root','-g']).toString().trim(),'playwright')));}
const out=fs.mkdtempSync(path.join(os.tmpdir(),'shoot-check-'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.data':'application/octet-stream','.tflite':'application/octet-stream','.binarypb':'application/octet-stream'};
const server=http.createServer((req,res)=>{
    let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';
    const file=path.join(root,rel);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const fakeVoice=`(()=>{class R{constructor(){window.fakeRec=this;}start(){window.fakeRecStarted=(window.fakeRecStarted||0)+1;}stop(){}}
window.webkitSpeechRecognition=R;window.SpeechRecognition=R;
window.say=(...alts)=>{const r=Object.assign(alts.map(t=>({transcript:t})),{isFinal:true});window.fakeRec.onresult({resultIndex:0,results:[r]});};})();`;
const signedIn=`(()=>{if(!localStorage.getItem('fake-cloud-db'))localStorage.setItem('fake-cloud-db',JSON.stringify({users:[{id:'user-1',email:'p@test.tw',password:'x'}],me:'user-1',profiles:{'user-1':'阿峻'},teams:[],members:[],sessions:{}}));})();`;
const fed=async(page,t)=>{const n=Number(await page.getAttribute('#last-dt','data-count')||0);await page.evaluate(t=>window.ShootApp.onTrial(t),t);await page.waitForFunction(n=>Number(document.getElementById('last-dt').dataset.count||0)>n,n);};
const trial=(dtPeak,status='accepted')=>({status,reasonCode:status==='accepted'?'':'LOW_VISIBILITY',dt:dtPeak-40,dtPeak,measuredFps:29.6,meanVisibility:0.9,sourceFrameCount:30,timestampSource:'camera-frame',algorithmVersion:'player-peak-v1',events:{}});

(async()=>{
    await new Promise(r=>server.listen(0,r));
    const base=`http://localhost:${server.address().port}`;
    const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
    const errors=[],checks=[];
    try{
        const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,permissions:['camera']});
        await ctx.route(/cdn\.jsdelivr\.net/,r=>r.abort());
        await ctx.addInitScript({content:fakeVoice});
        await ctx.addInitScript({content:signedIn});
        await ctx.addInitScript({path:path.join(__dirname,'cloud-fake.js')});
        const page=await ctx.newPage();
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base+'/shoot/');
        await page.waitForFunction(()=>document.getElementById('cloud-pill').textContent==='已登入');
        assert.match(await page.textContent('#cloud-line'),/即時上傳/);
        await page.screenshot({path:path.join(out,'01-setup-mobile.png'),fullPage:true});
        checks.push('setup screen, signed-in state');

        await page.fill('#player-code','JUN23');
        await page.selectOption('#target-shots','10');
        await page.click('#start-btn');
        await page.waitForFunction(()=>!document.getElementById('practice-view').hidden);
        // Camera + pose model: frames are analysed (no person in the fake feed).
        await page.waitForFunction(()=>/fps/.test(document.getElementById('fps').textContent),null,{timeout:60000});
        assert.match(await page.textContent('#guide'),/找不到身體/);
        const source=await page.evaluate(()=>window.ShootApp.practice&&document.getElementById('fps').textContent);
        checks.push('camera starts, pose model runs on frames ('+source+')');
        // Software pose inference makes headless timing slow; the rest uses injected trials.
        await page.evaluate(()=>window.ShootApp.stopCamera());

        // Shot 1: motion detected, then spoken result.
        await fed(page,trial(120));
        assert.equal(await page.textContent('#last-dt'),'120 ms',await page.textContent('#practice-message')+' / '+await page.textContent('#last-note'));
        assert.match(await page.textContent('#last-note'),/再 5 顆/);
        await page.evaluate(()=>window.say('教練','進'));
        await page.waitForFunction(()=>document.getElementById('score-made').textContent==='1');
        assert.match(await page.textContent('#voice-line'),/聽到「進」/);
        // The same shot said twice and tapped counts once.
        await page.evaluate(()=>window.say('進'));
        await page.click('#made-btn');
        assert.equal(await page.textContent('#score-total'),'1');
        assert.match(await page.textContent('#practice-message'),/已經記過/);
        checks.push('voice make linked to its motion trial; duplicates ignored');
        await page.screenshot({path:path.join(out,'02-practice-mobile.png')});

        // Build a personal reference: four more made shots, then judge a steady and an off shot.
        for(const p of [110,125,115,130]){
            await fed(page,trial(p));
            await page.evaluate(()=>window.say('進球'));
            await page.waitForTimeout(3100);
        }
        await fed(page,trial(122));
        assert.match(await page.textContent('#last-note'),/接近/);
        assert.equal(await page.getAttribute('#last-dt','class'),'steady');
        await page.evaluate(()=>window.say('沒進'));
        await page.waitForTimeout(3100);
        await fed(page,trial(220));
        assert.match(await page.textContent('#last-note'),/晚 \d+ ms/);
        checks.push('personal rhythm reference after 5 made shots; steady and off feedback');

        // A low-quality shot gives a reason, and a missed detection still records the result.
        await page.click('#missed-btn');
        await page.waitForTimeout(3100);
        await fed(page,trial(150,'low_quality'));
        assert.match(await page.textContent('#last-note'),/沒量到：身體看不清楚/);
        await page.click('#missed-btn');
        assert.equal(await page.textContent('#score-total'),'8');
        checks.push('low-quality explanation; results kept without a measurement');

        // Upload after each shot.
        await page.waitForFunction(()=>/已上傳 8 球/.test(document.getElementById('sync-line').textContent));
        const remote=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('fake-cloud-db')).sessions)[0]);
        assert.equal(remote.shots.length,8);assert.equal(remote.finished_at,null);
        assert.equal(remote.analysis_runs[0].trials.filter(t=>t.shotId).length,8);
        assert.equal(remote.shots.filter(s=>s.source==='voice').length,6);
        checks.push('every shot uploaded with links and entry source');

        // Offline: kept locally, retried when back online.
        await page.evaluate(()=>{window.fakeCloudFail='upsertSessions';});
        await page.waitForTimeout(3100);
        await page.click('#made-btn');
        await page.waitForFunction(()=>/暫時無法上傳/.test(document.getElementById('sync-line').textContent));
        await page.evaluate(()=>{window.fakeCloudFail=null;window.dispatchEvent(new Event('online'));});
        await page.waitForFunction(()=>/已上傳 9 球/.test(document.getElementById('sync-line').textContent));
        checks.push('offline shot queued and uploaded on reconnect');

        // Teammate marks from a second phone.
        await page.waitForTimeout(3100);
        await page.click('#teammate-btn');
        await page.waitForFunction(()=>/^[A-Z2-9]{6}$/.test(document.getElementById('mark-code').textContent));
        const code=await page.textContent('#mark-code');
        const mate=await ctx.newPage();
        mate.on('pageerror',e=>errors.push(e.message));
        await mate.goto(base+'/shoot/mark.html');
        await mate.fill('#code','wrong1');await mate.click('#code-form button');
        await mate.click('#made');
        await mate.waitForFunction(()=>/不存在或已過期/.test(document.getElementById('message').textContent));
        await mate.click('#change-code');
        await mate.fill('#code',code.toLowerCase());await mate.click('#code-form button');
        await mate.click('#missed');
        await mate.waitForFunction(()=>/第 1 筆：沒進/.test(document.getElementById('sent').textContent),null,{timeout:5000}).catch(async e=>{throw new Error(code+' '+await mate.textContent('#message')+' '+await mate.textContent('#sent')+' '+mate.url());});
        await mate.screenshot({path:path.join(out,'03-teammate-mobile.png')});
        await page.waitForFunction(()=>document.getElementById('score-total').textContent==='10',null,{timeout:8000});
        assert.match(await page.textContent('#practice-message'),/隊友記錄：沒進/);
        checks.push('teammate phone: bad code explained, mark arrives on the shooter phone');

        // Undo, then end and correct.
        await page.click('#undo-btn');
        assert.equal(await page.textContent('#score-total'),'9');
        await page.click('#end-btn');
        await page.waitForFunction(()=>!document.getElementById('summary-view').hidden);
        assert.equal(await page.textContent('#summary-title'),'6 / 9 進');
        const firstToggle=page.locator('#sum-rows li').first().locator('button').first();
        await firstToggle.click();
        assert.equal(await page.textContent('#summary-title'),'5 / 9 進');
        assert.match(await page.locator('#sum-rows li').first().textContent(),/已修正/);
        await page.screenshot({path:path.join(out,'04-summary-mobile.png'),fullPage:true});
        await page.click('#again-btn');
        await page.waitForFunction(()=>/已存到/.test(document.getElementById('sum-save').textContent));
        assert.match(await page.textContent('#sum-save'),/也已上傳雲端/);
        const stored=await page.evaluate(()=>({training:JSON.parse(localStorage.getItem('basketball-training-v1')),active:localStorage.getItem('basketball-shoot-active-v1'),
            remote:Object.values(JSON.parse(localStorage.getItem('fake-cloud-db')).sessions)[0]}));
        assert.equal(stored.active,null);
        assert.equal(stored.training.history[0].shots.length,9);
        assert.ok(stored.remote.finished_at);
        checks.push('post-set correction, finish into history and cloud');

        // The training page shows the set with made/missed rhythm.
        await page.goto(base+'/training/');
        await page.waitForFunction(()=>document.querySelectorAll('.history-item').length===1);
        await page.locator('.history-item').first().click();
        await page.waitForFunction(()=>!document.getElementById('analysis-paired').hidden);
        assert.match(await page.textContent('#analysis-paired'),/9 球中 \d 球/);
        checks.push('set appears in training history with paired motion');

        // Resume after a reload mid-set.
        await page.goto(base+'/shoot/');
        await page.fill('#player-code','JUN23');await page.click('#start-btn');
        await page.waitForFunction(()=>!document.getElementById('practice-view').hidden);
        await page.click('#made-btn');
        await page.reload();
        await page.waitForFunction(()=>!document.getElementById('resume-card').hidden);
        assert.match(await page.textContent('#resume-text'),/已記 1 球/);
        checks.push('unfinished set offered for resume after reload');

        // Landscape layout and no horizontal overflow.
        await page.click('#resume-btn');
        await page.setViewportSize({width:844,height:390});
        await page.waitForTimeout(300);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'landscape overflow');
        await page.screenshot({path:path.join(out,'05-practice-landscape.png')});
        checks.push('landscape layout');
    }finally{
        await browser.close();server.close();
    }
    assert.deepEqual(errors,[],'page errors');
    for(const c of checks)console.log('ok -',c);
    console.log('Screenshots:',out);
})().catch(e=>{console.error(e);process.exit(1);});
