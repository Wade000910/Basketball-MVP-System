// Rebuilds every figure for the project report into docs/report-figures/.
//
// Each figure comes from running the real check or opening the real page, so a teammate
// can regenerate them after a change. Test outputs are drawn as console screenshots of
// what the command actually printed; page figures are browser screenshots. Pages that
// need a person (camera shots, sign-in) use the same synthetic inputs as the automated
// checks and are labelled as such in figures.json.
//   node tools/report-figures.cjs            (all figures; about 10 minutes)
//   node tools/report-figures.cjs --quick    (skip the 300-scenario equivalence run: 30 scenarios)
// Optional: BROWSER_BIN=/path/to/chrome for tools/training-browser-smoke.cjs.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs','report-figures');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(execFileSync('npm',['root','-g']).toString().trim(),'playwright')));}
const quick=process.argv.includes('--quick');
fs.mkdirSync(out,{recursive:true});
const figures=[];
const add=(file,chapter,caption,source)=>figures.push({file,chapter,caption,source});

function run(cmd,args,opts={}){
    const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,timeout:opts.timeout||900000,env:{...process.env,...opts.env}});
    const text=(r.stdout||'')+(r.stderr||'');
    if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})\n${text.slice(-3000)}`);
    return text;
}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
function consoleHtml(command,lines){
    const body=lines.map(l=>{
        const cls=/^(ok|✔|PASS|# pass)|passed|通過/i.test(l)?'ok':/^(not ok|✖|FAIL)|fail [1-9]/i.test(l)?'bad':/^#|^ℹ|^—/.test(l)?'dim':'';
        return `<div class="${cls}">${esc(l)||'&nbsp;'}</div>`;
    }).join('');
    return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font-family:"Noto Sans CJK TC",sans-serif}
.win{margin:12px;border-radius:10px;overflow:hidden;border:1px solid #c9d1c7;width:1000px}
.bar{background:#e8ece6;padding:9px 14px;font:13px "Noto Sans Mono","DejaVu Sans Mono",monospace;color:#2b3a33;display:flex;gap:7px;align-items:center}
.bar i{width:11px;height:11px;border-radius:50%;display:inline-block;background:#c9d1c7}
.term{background:#14211b;color:#d9e5d8;padding:14px 18px;font:14px/1.55 "Noto Sans Mono","DejaVu Sans Mono","Noto Sans CJK TC",monospace;white-space:pre-wrap;word-break:break-all}
.ok{color:#a8dd8a}.bad{color:#ff9b85}.dim{color:#8fa597}.prompt{color:#e6b36a}
</style><div class="win"><div class="bar"><i></i><i></i><i></i><span>Basketball-MVP-System</span></div>
<div class="term"><div class="prompt">$ ${esc(command)}</div>${body}</div></div>`;
}

(async()=>{
    const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const shot=async(html,file)=>{
        const page=await browser.newPage({deviceScaleFactor:2,viewport:{width:1024,height:200}});
        await page.setContent(html);
        await page.locator('.win').screenshot({path:path.join(out,file)});
        await page.close();
    };
    try{
        // ---------- test outputs ----------
        process.stdout.write('unit tests… ');
        const tap=run('node',['--test','--test-reporter=tap',...fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.js')).map(f=>path.join('tests',f))]);
        const files=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.js')).sort();
        const perFile=files.map(f=>{
            const t=run('node',['--test','--test-reporter=tap',path.join('tests',f)]);
            const pass=Number(/# pass (\d+)/.exec(t)[1]),fail=Number(/# fail (\d+)/.exec(t)[1]);
            return {f,pass,fail};
        });
        const total=n=>Number(new RegExp('# '+n+' (\\d+)').exec(tap)[1]);
        const html1=run('node',['tests/validate-html.js']).trim().split('\n'),html2=run('node',['tests/validate-pages.js']).trim().split('\n');
        await shot(consoleHtml('npm test',[
            ...perFile.map(p=>`${p.fail?'✖':'✔'} tests/${p.f.padEnd(34)} ${String(p.pass).padStart(3)} 項通過${p.fail?'，'+p.fail+' 項失敗':''}`),
            '',`ℹ tests ${total('tests')}`,`ℹ pass ${total('pass')}`,`ℹ fail ${total('fail')}`,'',...html1,...html2]),'test-unit.png');
        add('test-unit.png','4','自動化單元測試結果（依測試檔彙整，共 '+total('tests')+' 項全部通過）','npm test');
        console.log(total('pass')+'/'+total('tests'));

        process.stdout.write('database permission tests… ');
        const rls=run('bash',['supabase/tests/run.sh']).trim().split('\n').filter(l=>!/^(SET|BEGIN|COMMIT|ROLLBACK|DO|CREATE|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|SELECT|NOTICE:\s*$|psql|\s*$)/.test(l)).map(l=>l.replace(/^(psql:[^:]*:\d+: )?NOTICE:\s*/,''));
        const rlsOk=rls.filter(l=>/^ok - /.test(l));
        await shot(consoleHtml('bash supabase/tests/run.sh',rls),'test-rls.png');
        add('test-rls.png','4',`資料庫權限（RLS）測試：${rlsOk.length} 個情境全部通過`,'supabase/tests/run.sh');
        console.log(rlsOk.length);

        process.stdout.write('research equivalence… ');
        const n=quick?'30':'300';
        const eq=run('node',['tools/research-equivalence-check.cjs',n],{timeout:1800000}).trim().split('\n').filter(Boolean);
        await shot(consoleHtml('node tools/research-equivalence-check.cjs '+n,eq),'test-equivalence.png');
        add('test-equivalence.png','4',`球員版偵測器與研究頁判斷邏輯比對：${n} 種模擬情境結果完全相同`,'tools/research-equivalence-check.cjs');
        console.log(eq.at(-1));

        process.stdout.write('shoot page browser check… ');
        const shoot=run('node',['tools/shoot-browser-check.cjs'],{timeout:900000}).trim().split('\n');
        const shotDir=/Screenshots: (.+)/.exec(shoot.join('\n'))[1].trim();
        await shot(consoleHtml('node tools/shoot-browser-check.cjs',shoot.filter(l=>!/^Screenshots/.test(l))),'test-shoot-flow.png');
        add('test-shoot-flow.png','4','罰球投籃頁與隊友幫記的瀏覽器流程測試','tools/shoot-browser-check.cjs');
        console.log('ok');

        if(process.env.BROWSER_BIN){
            process.stdout.write('training smoke… ');
            const smokeOut=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'smoke-'));
            const sm=run('node',['tools/training-browser-smoke.cjs'],{env:{SMOKE_OUTPUT:smokeOut},timeout:900000});
            const json=JSON.parse(sm.slice(sm.indexOf('{'),sm.lastIndexOf('}')+1));
            const cloudLine=sm.split('\n').find(l=>/^Cloud checks passed/.test(l))||'';
            const lines=['passed: '+json.passed,'',...json.checks.map(c=>'✔ '+c),'','雲端流程：',...cloudLine.replace('Cloud checks passed: ','').split(', ').map(c=>'  ✔ '+c)];
            await shot(consoleHtml('node tools/training-browser-smoke.cjs',lines),'test-training-flow.png');
            add('test-training-flow.png','4',`球員首頁、場邊記錄與雲端流程的瀏覽器測試（${json.checks.length} 項）`,'tools/training-browser-smoke.cjs');
            console.log(json.checks.length);
        }

        process.stdout.write('validation page check… ');
        run('node',['tools/validation-browser-check.cjs']);console.log('ok');

        // ---------- page screenshots ----------
        for(const [src,file,caption] of [
            ['01-setup-mobile.png','ui-shoot-setup.png','罰球投籃頁：設定與拍攝引導（手機畫面）'],
            ['02-practice-mobile.png','ui-shoot-practice.png','罰球投籃頁：練習中，顯示上一球節奏、比分與語音記錄（測試資料）'],
            ['03-teammate-mobile.png','ui-shoot-teammate.png','隊友幫記頁：輸入記錄碼後按「進／沒進」'],
            ['04-summary-mobile.png','ui-shoot-summary.png','結束一組：命中率、平均節奏與逐球修正（測試資料）'],
            ['05-practice-landscape.png','ui-shoot-landscape.png','罰球投籃頁橫放版面（測試資料）']]){
            fs.copyFileSync(path.join(shotDir,src),path.join(out,file));
            add(file,'4',caption,'tools/shoot-browser-check.cjs');
        }

        const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
        const server=http.createServer((req,res)=>{
            let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';
            const file=path.join(root,rel);
            if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
            fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
        });
        await new Promise(r=>server.listen(0,r));
        const base=`http://localhost:${server.address().port}`;
        const ctx=await browser.newContext({deviceScaleFactor:2});
        await ctx.route(/cdn\.jsdelivr\.net/,r=>r.abort());
        const page=await ctx.newPage();
        const capture=async(url,file,{width=390,height=844,full=true,mobile=true,wait}={},chapter,caption)=>{
            await page.setViewportSize({width,height});
            await page.goto(base+url);
            if(wait)await wait(page);else await page.waitForTimeout(800);
            await page.screenshot({path:path.join(out,file),fullPage:full});
            add(file,chapter,caption,url);
            void mobile;
        };
        await capture('/','ui-home.png',{full:false},'4','系統首頁（手機畫面）');
        await capture('/training/','ui-training-home.png',{full:false},'4','球員首頁：開始訓練與雲端備份入口（手機畫面）');
        await capture('/coach/?demo=1','ui-coach-demo.png',{width:1280,height:900,full:false,wait:p=>p.waitForTimeout(1200)},'4','教練總覽（示範資料，非真實結果）');
        await capture('/validation/','ui-validation.png',{width:1280,height:800,full:false},'5','慢動作對照頁：逐格標記事件，與系統試次比較');
        await capture('/專題程式/','ui-research.png',{width:1280,height:800,full:false},'4','研究模式：完整角度、速度曲線與實驗分組');
        server.close();

        // ---------- simulation charts ----------
        for(const [svg,file,caption] of [
            ['error-sd-onset.svg','sim-onset-sd.png','模擬實驗：起始定義的誤差標準差與影格率、時間抖動的關係'],
            ['error-sd-peak.svg','sim-peak-sd.png','模擬實驗：峰值定義的誤差標準差與影格率、時間抖動的關係'],
            ['error-sd-peak-camera-timestamps.svg','sim-peak-camera.png','模擬實驗：改用相機影格時間後的峰值定義誤差']]){
            run('rsvg-convert',['-z','2','-b','white','-o',path.join(out,file),path.join(root,'docs','simulation',svg)]);
            add(file,'5',caption,'tools/simulate-timing.cjs');
        }
    }finally{await browser.close();}

    // Number figures per chapter in a fixed reading order.
    const order=['ui-home.png','ui-shoot-setup.png','ui-shoot-practice.png','ui-shoot-teammate.png','ui-shoot-summary.png','ui-shoot-landscape.png','ui-training-home.png','ui-coach-demo.png','ui-research.png',
        'test-unit.png','test-rls.png','test-equivalence.png','test-shoot-flow.png','test-training-flow.png','sim-onset-sd.png','sim-peak-sd.png','sim-peak-camera.png','ui-validation.png'];
    figures.sort((a,b)=>order.indexOf(a.file)-order.indexOf(b.file));
    const counters={};
    for(const f of figures){counters[f.chapter]=(counters[f.chapter]||0)+1;f.number=`${f.chapter}.${counters[f.chapter]}`;}
    fs.writeFileSync(path.join(out,'figures.json'),JSON.stringify({generatedAt:new Date().toISOString(),figures},null,2)+'\n');
    fs.writeFileSync(path.join(out,'README.md'),'# 報告圖片\n\n由 `node tools/report-figures.cjs` 產生，請勿手動修改圖片。標示「測試資料」或「示範資料」的畫面不是真實使用結果。\n\n| 圖號 | 檔案 | 說明 | 來源 |\n| --- | --- | --- | --- |\n'+
        figures.map(f=>`| 圖 ${f.number} | [${f.file}](./${f.file}) | ${f.caption} | \`${f.source}\` |`).join('\n')+'\n');
    console.log(`${figures.length} figures in ${path.relative(root,out)}`);
})().catch(e=>{console.error(e);process.exit(1);});
