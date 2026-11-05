// Monte Carlo simulation of the free-throw timing pipeline with known ground truth.
//
// Each simulated shot has smooth knee and elbow angle curves whose true event times are
// known exactly. The curves are sampled like the phone does (frame rate, timestamp
// jitter from inference latency, angle noise from landmark noise), fed through the same
// state machine trigger and the same MotionCore code as the page, and the measured
// Δt is compared with the true Δt. This isolates sampling/processing error; it does not
// model pose-estimation bias, camera angle or a real athlete.
//
//   node tools/simulate-timing.cjs            -> docs/simulation-study.md + CSV + SVG
//   node tools/simulate-timing.cjs --quick    -> fewer trials, prints only
const fs=require('node:fs'),path=require('node:path');
const M=require('../專題程式/motion-core.js');
const quick=process.argv.includes('--quick');
const N=quick?120:1000;
const THRESH=M.ONSET_THRESHOLD_DEG_PER_S;

// Deterministic RNG so results are reproducible.
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const logistic=x=>1/(1+Math.exp(-x));

// A shot: stand (knee 170) -> squat (knee 110) -> extend (knee 170); elbow 70 -> 175.
function makeShot(r){
    const tDown=600+r()*100, tauDown=60+r()*30;
    const tKnee=tDown+380+r()*160, tauKnee=40+r()*25;
    const dtPeak=60+r()*140;                 // true elbow-peak minus knee-peak, ms
    const tElbow=tKnee+dtPeak, tauElbow=25+r()*15;
    const knee=t=>170-60*logistic((t-tDown)/tauDown)+60*logistic((t-tKnee)/tauKnee);
    const elbow=t=>70+105*logistic((t-tElbow)/tauElbow);
    // True onset with the same definition as the algorithm: last time before the elbow
    // velocity peak where velocity <= threshold, on a fine 0.01 ms grid of the true curve.
    const vel=t=>105*logistic((t-tElbow)/tauElbow)*(1-logistic((t-tElbow)/tauElbow))/tauElbow*1000;
    let tOnset=tElbow;while(vel(tOnset)>THRESH)tOnset-=0.01;
    return {knee,elbow,tKnee,tElbow,tOnset,truthPeak:tElbow-tKnee,truthOnset:tOnset-tKnee};
}

// Replays the page's capture: causal filters always running, IDLE->RECORDING when the
// filtered knee drops below 155 deg while flexing faster than 40 deg/s, and RECORDING ends
// when the filtered elbow passes 155 deg and slows below 40 deg/s, or after 1700 ms.
function capture(shot,{fps,noiseDeg,jitterMs,variant},r){
    const fk=new M.ButterworthFilter(10,30),fe=new M.ButterworthFilter(10,30);
    fk.update(10,fps);fe.update(10,fps);         // the page refreshes fs from the measured rate
    const latency=40;                            // constant part cancels in Δt
    let state='IDLE',prevKn=null,prevEb=null,lastT=null,rec=[],raw=[];
    for(let i=0;;i++){
        const tCap=i*1000/fps;
        if(tCap>shot.tElbow+1500)return {reason:'NOT_TRIGGERED'};
        const now=tCap+latency+Math.abs(gauss(r))*jitterMs;
        if(lastT!==null&&now<=lastT)continue;    // results arrive in order; a late one is dropped
        const rk=shot.knee(tCap)+gauss(r)*noiseDeg,re=shot.elbow(tCap)+gauss(r)*noiseDeg;
        const sKn=fk.filter(rk),sEb=fe.filter(re);
        if(prevKn!==null){
            const dtSec=(now-lastT)/1000,knV=(sKn-prevKn)/dtSec;
            if(state==='IDLE'&&sKn<155&&knV<-40){state='RECORDING';rec=[];raw=[];}
            else if(state==='RECORDING'){
                rec.push({t:now,kn:sKn,eb:sEb});raw.push({t:now,kn:rk,eb:re});
                if((sEb>155&&(sEb-prevEb)/dtSec<40)||(now-rec[0].t>1700))break;
            }
        }
        prevKn=sKn;prevEb=sEb;lastT=now;
    }
    let samples=rec;
    if(variant==='zero-phase'){
        const kn=M.zeroPhaseFilter(raw.map(s=>s.kn),10,fps),eb=M.zeroPhaseFilter(raw.map(s=>s.eb),10,fps);
        samples=raw.map((s,i)=>({t:s.t,kn:kn[i],eb:eb[i]}));
    }else if(variant==='unfiltered')samples=raw;
    const res=M.detectTiming(samples);
    if(res.reason)return {reason:res.reason};
    return {onset:res.dt,peak:res.events.elbowPeakPerfMs-res.events.kneePeakPerfMs};
}

function stats(v){
    if(!v.length)return {n:0};
    const mean=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,v.length-1));
    const mae=v.reduce((a,b)=>a+Math.abs(b),0)/v.length;
    const abs=v.map(Math.abs).sort((a,b)=>a-b);
    return {n:v.length,mean,sd,mae,within20:abs.filter(x=>x<=20).length/v.length};
}
function runCell(cond,seed){
    const r=rng(seed),errOnset=[],errPeak=[],reasons={};
    for(let k=0;k<N;k++){
        const shot=makeShot(r),m=capture(shot,cond,r);
        if(m.reason){reasons[m.reason]=(reasons[m.reason]||0)+1;continue;}
        errOnset.push(m.onset-shot.truthOnset);errPeak.push(m.peak-shot.truthPeak);
    }
    return {...cond,valid:errOnset.length,total:N,reasons,onset:stats(errOnset),peak:stats(errPeak)};
}

const base={noiseDeg:2,jitterMs:8};
const variants=['causal (current)','zero-phase','unfiltered'];
const key=v=>v.startsWith('causal')?'causal':v;
const experiments=[];
let seed=1;
// E1: frame rate, at moderate noise and jitter
for(const fps of [15,20,28,30,60])for(const v of variants)experiments.push({exp:'E1',fps,...base,variant:key(v),seed:seed++});
// E2: angle noise at 28 fps
for(const noiseDeg of [0,1,2,4])for(const v of variants)experiments.push({exp:'E2',fps:28,noiseDeg,jitterMs:8,variant:key(v),seed:seed++});
// E3: timestamp jitter at 28 fps
for(const jitterMs of [0,8,20])for(const v of variants)experiments.push({exp:'E3',fps:28,noiseDeg:2,jitterMs,variant:key(v),seed:seed++});

// E4: frame rate when timestamps come from the camera frame (no inference jitter)
for(const fps of [15,20,28,30,60])for(const v of variants)experiments.push({exp:'E4',fps,noiseDeg:2,jitterMs:0,variant:key(v),seed:seed++});
// E0: no noise and no jitter: checks the pipeline itself
for(const fps of [28,60])for(const v of variants)experiments.push({exp:'E0',fps,noiseDeg:0,jitterMs:0,variant:key(v),seed:seed++});

const t0=Date.now();
const results=experiments.map(e=>runCell(e,e.seed*7919));
const r1=x=>x===undefined||x===null||Number.isNaN(x)?'—':(Math.round(x*10)/10).toFixed(1);
const label={causal:'即時濾波（現行）','zero-phase':'零相位濾波',unfiltered:'不濾波'};
function table(exp,col,colName){
    const rows=results.filter(r=>r.exp===exp);
    const out=[`| ${colName} | 處理方式 | 有效率 | 起始：誤差 平均 ± SD (ms) | 起始：誤差 ≤ 20 ms | 峰值：誤差 平均 ± SD (ms) | 峰值：誤差 ≤ 20 ms |`,'|---|---|---|---|---|---|---|'];
    for(const r of rows)out.push(`| ${r[col]} | ${label[r.variant]} | ${Math.round(r.valid/r.total*100)}% | ${r1(r.onset.mean)} ± ${r1(r.onset.sd)} | ${Math.round(r.onset.within20*100)}% | ${r1(r.peak.mean)} ± ${r1(r.peak.sd)} | ${Math.round(r.peak.within20*100)}% |`);
    return out.join('\n');
}
if(quick){for(const r of results)console.log(r.exp,r.fps,r.noiseDeg,r.jitterMs,r.variant,`${r.valid}/${r.total}`,'onset',r1(r.onset.mean),r1(r.onset.sd),'peak',r1(r.peak.mean),r1(r.peak.sd),JSON.stringify(r.reasons));console.log('seconds',(Date.now()-t0)/1000);process.exit(0);}

// SVG: SD of error vs fps for each variant and definition.
function chart(defn,title,exp='E1'){
    const W=560,H=300,L=56,R=150,T=36,B=50,rows=results.filter(r=>r.exp===exp);
    const fpsList=[15,20,28,30,60],ymax=Math.max(...results.filter(r=>r.exp==='E1'||r.exp==='E4').map(r=>r[defn].sd||0))*1.05;const step=ymax>120?50:25;const ymaxNice=Math.ceil(ymax/step)*step;
    const sx=f=>L+(fpsList.indexOf(f))/(fpsList.length-1)*(W-L-R),sy=v=>H-B-(v/ymaxNice)*(H-T-B);
    const colors={causal:'#16597c','zero-phase':'#d9822b',unfiltered:'#8a99a6'};
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
    s+=`<text x="${L}" y="20" font-size="14" font-weight="600">${title}</text>`;
    for(let v=0;v<=ymaxNice;v+=step){s+=`<line x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e8ec"/><text x="${L-6}" y="${sy(v)+4}" text-anchor="end" fill="#55636e">${Math.round(v)}</text>`;}
    for(const f of fpsList)s+=`<text x="${sx(f)}" y="${H-B+18}" text-anchor="middle" fill="#55636e">${f}</text>`;
    s+=`<text x="${(L+W-R)/2}" y="${H-12}" text-anchor="middle" fill="#55636e">影格率 (fps)</text><text x="14" y="${(T+H-B)/2}" transform="rotate(-90 14 ${(T+H-B)/2})" text-anchor="middle" fill="#55636e">誤差標準差 (ms)</text>`;
    let ly=T+8;
    for(const v of ['causal','zero-phase','unfiltered']){
        const pts=rows.filter(r=>r.variant===v).map(r=>`${sx(r.fps)},${sy(r[defn].sd)}`).join(' ');
        s+=`<polyline points="${pts}" fill="none" stroke="${colors[v]}" stroke-width="2.5"/>`;
        for(const r of rows.filter(r=>r.variant===v))s+=`<circle cx="${sx(r.fps)}" cy="${sy(r[defn].sd)}" r="3.5" fill="${colors[v]}"/>`;
        s+=`<line x1="${W-R+14}" x2="${W-R+34}" y1="${ly}" y2="${ly}" stroke="${colors[v]}" stroke-width="2.5"/><text x="${W-R+40}" y="${ly+4}">${label[v]}</text>`;ly+=20;
    }
    return s+'</svg>\n';
}
const outDir=path.join(__dirname,'..','docs','simulation');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'error-sd-onset.svg'),chart('onset','起始定義：誤差標準差 vs 影格率'));
fs.writeFileSync(path.join(outDir,'error-sd-peak.svg'),chart('peak','峰值定義：誤差標準差 vs 影格率'));
fs.writeFileSync(path.join(outDir,'error-sd-peak-camera-timestamps.svg'),chart('peak','峰值定義（相機影格時間）：誤差標準差 vs 影格率','E4'));
fs.writeFileSync(path.join(outDir,'error-sd-onset-camera-timestamps.svg'),chart('onset','起始定義（相機影格時間）：誤差標準差 vs 影格率','E4'));
const csvCols=['exp','fps','noiseDeg','jitterMs','variant','valid','total','onsetMean','onsetSd','onsetMae','peakMean','peakSd','peakMae','reasons'];
fs.writeFileSync(path.join(outDir,'results.csv'),[csvCols.join(','),...results.map(r=>[r.exp,r.fps,r.noiseDeg,r.jitterMs,r.variant,r.valid,r.total,r1(r.onset.mean),r1(r.onset.sd),r1(r.onset.mae),r1(r.peak.mean),r1(r.peak.sd),r1(r.peak.mae),'"'+Object.entries(r.reasons).map(([k,v])=>k+':'+v).join(' ')+'"'].join(','))].join('\n')+'\n');
fs.writeFileSync(path.join(outDir,'tables.md'),[
    `<!-- generated by tools/simulate-timing.cjs, N=${N} per condition -->`,
    '### E1 影格率（角度雜訊 2°、時間抖動 8 ms）','',table('E1','fps','fps'),'',
    '### E2 角度雜訊（28 fps、時間抖動 8 ms）','',table('E2','noiseDeg','雜訊 (°)'),'',
    '### E3 時間戳抖動（28 fps、角度雜訊 2°）','',table('E3','jitterMs','抖動 (ms)'),'',
    '### E4 影格率，改用相機影格時間（角度雜訊 2°、無抖動）','',table('E4','fps','fps'),'',
    '### E0 無雜訊、無抖動（檢查流程本身）','',table('E0','fps','fps'),''
].join('\n'));
console.log('Wrote docs/simulation/ in',(Date.now()-t0)/1000,'s');
