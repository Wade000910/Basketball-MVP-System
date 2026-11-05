// Browser check for validation/ (slow-motion reference comparison).
// Needs ffmpeg and Playwright with Chromium. Generates numbered 240 fps test videos
// (real speed and a slowed 30 fps export), marks frames, and checks the comparison.
//   node tools/validation-browser-check.cjs
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(execFileSync('npm',['root','-g']).toString().trim(),'playwright')));}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'validation-check-'));
const ff=args=>execFileSync('ffmpeg',['-loglevel','error','-y',...args]);
ff(['-f','lavfi','-i','color=c=0x223344:s=320x240:r=240:d=3','-vf',"drawtext=text='%{n}':fontsize=72:fontcolor=white:x=40:y=80",'-c:v','libvpx','-b:v','1M',path.join(dir,'slowmo240.webm')]);
ff(['-i',path.join(dir,'slowmo240.webm'),'-vf','setpts=8*PTS','-r','30','-c:v','libvpx','-b:v','1M',path.join(dir,'slowed30.webm')]);

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
    let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
    if(req.url.split('?')[0].endsWith('/'))file+='index.html';
    if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
});

(async()=>{
    await new Promise(r=>server.listen(0,r));
    const url=`http://localhost:${server.address().port}/validation/`;
    const browser=await chromium.launch();
    const errors=[];
    try{
        for(const [file,playback] of [['slowmo240.webm',240],['slowed30.webm',30]]){
            const page=await browser.newPage({viewport:{width:1100,height:900}});
            page.on('pageerror',e=>errors.push(e.message));
            await page.goto(url);
            await page.fill('#playback-fps',String(playback));
            await page.setInputFiles('#video-file',path.join(dir,file));
            await page.waitForFunction(()=>!document.getElementById('marking').hidden);
            const go=async f=>{await page.evaluate(f=>{const s=document.getElementById('scrub');s.value=String(f);s.dispatchEvent(new Event('input'));},f);await page.waitForTimeout(200);};
            await go(250);
            assert.match(await page.textContent('#frame-info'),/第 250 格 · 實際時間 1041\.7 ms/,file+' frame mapping');
            await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);
            assert.match(await page.textContent('#frame-info'),/第 251 格/,file+' one-frame step');
            await page.keyboard.press('Shift+ArrowLeft');await page.waitForTimeout(200);
            assert.match(await page.textContent('#frame-info'),/第 241 格/,file+' ten-frame step');
            await page.close();
        }

        const page=await browser.newPage({viewport:{width:1100,height:900}});
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);
        await page.setInputFiles('#video-file',path.join(dir,'slowmo240.webm'));
        await page.waitForFunction(()=>!document.getElementById('marking').hidden);
        const go=async f=>{await page.evaluate(f=>{const s=document.getElementById('scrub');s.value=String(f);s.dispatchEvent(new Event('input'));},f);await page.waitForTimeout(200);};
        await go(100);await page.keyboard.press('1');await go(124);await page.keyboard.press('2');await go(160);await page.keyboard.press('3');
        await page.click('#new-shot');
        await go(400);await page.keyboard.press('1');await go(432);await page.keyboard.press('2');await go(466);await page.keyboard.press('3');
        assert.match(await page.textContent('#shot-marks'),/人工 Δt 起始 133\.3 ms，峰值 275 ms/);
        await page.setInputFiles('#trials-file',path.join(__dirname,'fixtures','validation-trials.csv'));
        await page.waitForFunction(()=>!document.getElementById('results').hidden);
        const rows=await page.$$eval('#shot-table tbody tr',rs=>rs.map(r=>[...r.cells].map(c=>c.querySelector('select')?.value ?? c.textContent).join('|')));
        assert.deepEqual(rows,['1|1|accepted|100|95|-5|250|240|-10|','2|2|accepted|133.3|130|-3.3|275|270|-5|']);
        assert.match((await page.textContent('#summary')).replace(/\s+/g,''),/平均差（偏差）-4.2ms.*平均差（偏差）-7.5ms/);
        assert.equal(await page.$$eval('#plots svg',s=>s.length),2);
        // Re-pair shot 2 by hand, exclude shot 1, and check the summary follows.
        await page.selectOption('#shot-table tbody tr:nth-child(2) select','3');
        assert.match(await page.textContent('#shot-table tbody tr:nth-child(2)'),/low_quality/);
        await page.check('#shot-table tbody tr:nth-child(1) input[type=checkbox]');
        assert.match((await page.textContent('#summary')).replace(/\s+/g,''),/可比較球數0/);
        // Draft survives a reload with the same video, including the manual pairing.
        await page.reload();
        await page.setInputFiles('#video-file',path.join(dir,'slowmo240.webm'));
        await page.waitForFunction(()=>!document.getElementById('marking').hidden);
        assert.match(await page.textContent('#status'),/接續上次的標記/);
        await page.setInputFiles('#trials-file',path.join(__dirname,'fixtures','validation-trials.csv'));
        await page.waitForFunction(()=>!document.getElementById('results').hidden);
        assert.equal(await page.$eval('#shot-table tbody tr:nth-child(2) select',s=>s.value),'3');
        // Exports.
        const [json]=await Promise.all([page.waitForEvent('download'),page.click('#save-marks')]);
        const saved=JSON.parse(fs.readFileSync(await json.path(),'utf8'));
        assert.equal(saved.schemaVersion,'slowmo-reference-v1');assert.equal(saved.shots.length,2);
        const [csv]=await Promise.all([page.waitForEvent('download'),page.click('#save-csv')]);
        assert.match(fs.readFileSync(await csv.path(),'utf8'),/^﻿shot,systemTrial/);
        // Bad CSV is explained, not thrown.
        fs.writeFileSync(path.join(dir,'bad.csv'),'a,b\n1,2');
        await page.setInputFiles('#trials-file',path.join(dir,'bad.csv'));
        await page.waitForFunction(()=>document.getElementById('status').textContent.includes('缺少欄位'),null,{timeout:5000});
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'mobile overflow');
        assert.deepEqual(errors,[]);
        console.log('Validation browser check passed');
    }finally{
        await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});
    }
})().catch(e=>{console.error(e);process.exit(1);});
