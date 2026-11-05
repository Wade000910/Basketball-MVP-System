// Proves that the player page's detector (shoot/engine.js) makes the same decisions as
// the research page (專題程式/index.html, timing-validity-v3).
//
// The research page runs unmodified in Chromium. Only its inputs are replaced: the pose
// model returns our synthetic landmarks, performance.now() returns the synthetic frame
// time, and the 2 s cooldown timer fires on that clock. The same frames go through
// ShootEngine.createDetector in Node. For every random scenario (frame rate, jitter,
// noise, body lost, poor visibility, shots without a raised arm, shots during the
// cooldown, left and right side) both must record the same trials with the same status,
// reason, Δt, event times, frame count, frame rate, visibility and recording time.
//   node tools/research-equivalence-check.cjs [scenarios=200] [seed=20261105]
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const E=require('../shoot/engine.js');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(execFileSync('npm',['root','-g']).toString().trim(),'playwright')));}
const COUNT=Number(process.argv[2]||200),SEED=Number(process.argv[3]||20261105);

function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const rad=d=>d*Math.PI/180;
const ramp=(t,t0,t1,a,b)=>t<=t0?a:t>=t1?b:a+(b-a)*(1-Math.cos(Math.PI*(t-t0)/(t1-t0)))/2;
function landmarks(k,e,{armUp,vis,torso,noise,r}){
    const n=()=>noise?(r()-0.5)*2*noise:0;
    const l=Array.from({length:33},()=>({x:0.5,y:0.5,z:0,visibility:vis}));
    const put=(i,x,y,v=vis)=>{l[i]={x:x+n(),y:y+n(),z:0,visibility:v};};
    for(const [hip,knee,ankle,sh,el,wr] of [[24,26,28,12,14,16],[23,25,27,11,13,15]]){
        put(hip,0.5,0.5,torso);put(knee,0.5,0.7);put(ankle,0.5+0.2*Math.sin(rad(k)),0.7-0.2*Math.cos(rad(k)));
        if(armUp){put(sh,0.5,0.3,torso);put(el,0.5,0.2);put(wr,0.5+0.1*Math.sin(rad(e)),0.2+0.1*Math.cos(rad(e)));}
        else{put(sh,0.5,0.3,torso);put(el,0.5,0.4);put(wr,0.5+0.1*Math.sin(rad(e)),0.4-0.1*Math.cos(rad(e)));}
    }
    return l;
}
function scenario(seed){
    const r=rng(seed),pick=a=>a[Math.floor(r()*a.length)];
    const fps=pick([15,20,24,30,30,45,60]),jitter=pick([0,0,2,5,10]),noise=pick([0,0,0.002,0.006]);
    const side=r()<0.5?'right':'left',T0=1000+Math.floor(r()*5000);
    const shots=[];let at=1500+r()*1500;
    const n=1+Math.floor(r()*4);
    for(let i=0;i<n;i++){
        const dip=300+r()*500,ext=200+r()*250,lag=40+r()*260,elbowDur=150+r()*250;
        shots.push({start:at,dip,ext,lag,elbowDur,depth:100+r()*40,armUp:r()>0.15});
        at+=dip+ext+elbowDur+(r()<0.25?800+r()*1500:2500+r()*3000);
    }
    const gaps=[];
    for(let i=0;i<Math.floor(r()*3);i++){const s=r()*at,len=50+r()*600;gaps.push({s,e:s+len,kind:r()<0.5?'missing':'lowTorso'});}
    const frames=[];
    for(let t=0;t<=at+2500;){
        const sh=shots.find(s=>t>=s.start&&t<s.start+s.dip+s.ext+s.elbowDur+600);
        let k=170,e=70,armUp=true;
        if(sh){const u=t-sh.start,ke=sh.dip+sh.ext,eb=sh.dip+sh.ext/2+sh.lag;
            k=u<sh.dip?ramp(u,0,sh.dip,170,sh.depth):ramp(u,sh.dip,ke,sh.depth,175);
            e=ramp(u,eb,eb+sh.elbowDur,70,178);armUp=sh.armUp;}
        const g=gaps.find(g=>t>=g.s&&t<g.e);
        frames.push({t:T0+t,landmarks:g&&g.kind==='missing'?null:landmarks(k,e,{armUp,vis:0.9+r()*0.08,torso:g?0.5:0.95,noise,r})});
        t+=Math.max(1,1000/fps+(r()-0.5)*2*jitter);
    }
    // Times rounded to the 1/1000 ms so both sides see identical numbers.
    for(const f of frames)f.t=Math.round(f.t*1000)/1000;
    return {seed,fps,jitter,noise,side,T0,frames};
}
function engineRun(sc){
    const d=E.createDetector({side:sc.side,timestampSource:'pose-result'}),out=[];
    for(const f of sc.frames){const ev=d.push(f);if(ev)out.push(norm({...ev.trial,at:f.t}));}
    return out;
}
const norm=t=>({at:t.at,status:t.status,reasonCode:t.reasonCode||'',dt:t.dt ?? null,
    kneePeak:t.events?.kneePeakPerfMs ?? t.kneePeakPerfMs ?? null,onset:t.events?.elbowOnsetPerfMs ?? t.elbowOnsetPerfMs ?? null,peak:t.events?.elbowPeakPerfMs ?? t.elbowPeakPerfMs ?? null,
    frames:t.status==='aborted'?null:t.sourceFrameCount,fps:t.measuredFps ?? null,vis:t.meanVisibility ?? null});

const stub=`(()=>{
    window.__t=Number(new URLSearchParams(location.search).get('t0'));window.__timers=[];window.__trials=[];
    Object.defineProperty(performance,'now',{value:()=>window.__t,configurable:true});
    const realSetTimeout=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...a)=>{if(ms===2000){window.__timers.push({due:window.__t+2000,fn});return -1;}return realSetTimeout(fn,ms,...a);};
    window.Pose=class{setOptions(){}onResults(f){window.__onResults=f;}send(){return Promise.resolve();}initialize(){return Promise.resolve();}close(){}};
    window.Camera=class{constructor(v){this.v=v;}async start(){this.v.srcObject=await navigator.mediaDevices.getUserMedia({video:true});await this.v.play();}stop(){}};
    window.Chart=class{constructor(){this.data={labels:[],datasets:[{data:[]},{data:[]}]};}update(){}};
    window.drawConnectors=()=>{};window.drawLandmarks=()=>{};window.POSE_CONNECTIONS=[];
})();`;

(async()=>{
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
    const server=http.createServer((req,res)=>{
        let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';
        const file=path.join(root,rel);
        if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
        fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
    });
    await new Promise(r=>server.listen(0,r));
    const base=`http://localhost:${server.address().port}/${encodeURIComponent('專題程式')}/`;
    const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
    const ctx=await browser.newContext();
    await ctx.route(/cdn\.|vendor\/mediapipe-pose\/pose\.js/,r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await ctx.addInitScript({content:stub});
    const page=await ctx.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let trials=0,statuses={};
    try{
        for(let i=0;i<COUNT;i++){
            const sc=scenario(SEED+i);
            await page.goto(base+'?t0='+sc.T0);
            await page.evaluate(side=>{for(const [id,v] of [['participant_id','P001'],['session_id','S01'],['block_id','B01'],['shooting_side',side]]){const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}},sc.side);
            await page.evaluate(()=>{const p=SessionCapture.LocalSessionCapture.prototype,orig=p.recordTrial;p.recordTrial=function(row){window.__trials.push({...row,at:window.__t});return orig.call(this,row);};});
            await page.evaluate(()=>document.getElementById('start_btn').click());
            await page.waitForFunction(()=>!document.getElementById('stop_btn').classList.contains('hidden'));
            const research=await page.evaluate(frames=>{
                for(const f of frames){
                    window.__t=f.t;
                    const due=window.__timers.filter(x=>x.due<=f.t);window.__timers=window.__timers.filter(x=>x.due>f.t);due.forEach(x=>x.fn());
                    window.__onResults({poseLandmarks:f.landmarks||undefined});
                }
                return window.__trials;
            },sc.frames);
            const a=research.map(t=>norm({...t,status:t.trialStatus})),b=engineRun(sc);
            assert.deepEqual(b,a,`scenario seed ${sc.seed} (fps ${sc.fps}, jitter ${sc.jitter}, noise ${sc.noise}, ${sc.side})`);
            trials+=a.length;for(const t of a)statuses[t.status]=(statuses[t.status]||0)+1;
        }
    }finally{await browser.close();server.close();}
    assert.deepEqual(errors,[],'research page errors');
    console.log(`Research-page equivalence passed: ${COUNT} scenarios, ${trials} trials identical`,statuses);
})().catch(e=>{console.error(e);process.exit(1);});
