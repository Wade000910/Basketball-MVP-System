// Robustness of the timing pipeline under stress: dropped frames, fast/slow shooters, a camera that compresses the joint
// angles, correlated landmark noise, and a short tracking dropout. Same shots, same trigger and same MotionCore as
// tools/simulate-filters.cjs; compares the current filter with the best candidates from that study.
//
// Same simulated shots and same capture trigger as tools/simulate-timing.cjs. Every candidate filter sees the
// SAME noisy samples of the SAME shot (paired comparison), then goes through the page's MotionCore.detectTiming.
// This measures only how well a filter preserves event timing under sampling noise; it does not model pose-estimation
// bias, camera angle or a real athlete, and the One Euro / Kalman parameters are plain defaults, not tuned on real data.
//
//   node tools/simulate-robustness.cjs           -> docs/simulation/robustness-*.{md,csv,svg}
//   node tools/simulate-robustness.cjs --quick   -> fewer trials, prints only
const fs=require('node:fs'),path=require('node:path');
const M=require('../專題程式/motion-core.js');
const quick=process.argv.includes('--quick');
const N=quick?150:1000;
const THRESH=M.ONSET_THRESHOLD_DEG_PER_S;

function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const logistic=x=>1/(1+Math.exp(-x));
function makeShot(r,speed=1){
    const tDown=600+r()*100,tauDown=(60+r()*30)*speed;
    const tKnee=tDown+(380+r()*160)*speed,tauKnee=(40+r()*25)*speed;
    const dtPeak=60+r()*140;
    const tElbow=tKnee+dtPeak,tauElbow=(25+r()*15)*speed;
    const knee=t=>170-60*logistic((t-tDown)/tauDown)+60*logistic((t-tKnee)/tauKnee);
    const elbow=t=>70+105*logistic((t-tElbow)/tauElbow);
    const vel=t=>105*logistic((t-tElbow)/tauElbow)*(1-logistic((t-tElbow)/tauElbow))/tauElbow*1000;
    let tOnset=tElbow;while(vel(tOnset)>THRESH)tOnset-=0.01;
    return {knee,elbow,tKnee,tElbow,tOnset,truthPeak:tElbow-tKnee,truthOnset:tOnset-tKnee};
}

// ---- causal filters (run sample by sample, as on the phone) ----
const causalButter=fc=>({make:fps=>{const f=new M.ButterworthFilter(fc,30);f.update(fc,fps);return v=>f.filter(v);}});
// One Euro filter (Casiez et al. 2012): low cutoff when slow, higher cutoff when fast.
function oneEuro(minCutoff,beta,dCutoff=1){
    return {make:()=>{
        let xPrev=null,dxPrev=0,tPrev=null;
        const alpha=(dt,fc)=>{const tau=1/(2*Math.PI*fc);return 1/(1+tau/dt);};
        return (v,t)=>{
            if(xPrev===null){xPrev=v;tPrev=t;return v;}
            const dt=Math.max((t-tPrev)/1000,1e-3);
            const dx=(v-xPrev)/dt,aD=alpha(dt,dCutoff);
            const dxHat=aD*dx+(1-aD)*dxPrev;
            const a=alpha(dt,minCutoff+beta*Math.abs(dxHat));
            const xHat=a*v+(1-a)*xPrev;
            xPrev=xHat;dxPrev=dxHat;tPrev=t;return xHat;
        };
    }};
}
// Constant-velocity Kalman filter; q = process noise intensity, measurement variance fixed at 2 deg squared.
function kalman(q){
    return {make:()=>{
        let x=null,v=0,P=[[1,0],[0,1]],tPrev=null;const R=4;
        return (z,t)=>{
            if(x===null){x=z;tPrev=t;return z;}
            const dt=Math.max((t-tPrev)/1000,1e-3);tPrev=t;
            x+=v*dt;
            const p00=P[0][0]+dt*(P[1][0]+P[0][1])+dt*dt*P[1][1]+q*dt**3/3,p01=P[0][1]+dt*P[1][1]+q*dt*dt/2,
                p10=P[1][0]+dt*P[1][1]+q*dt*dt/2,p11=P[1][1]+q*dt;
            const S=p00+R,k0=p00/S,k1=p10/S,y=z-x;
            x+=k0*y;v+=k1*y;
            P=[[(1-k0)*p00,(1-k0)*p01],[p10-k1*p00,p11-k1*p01]];
            return x;
        };
    }};
}
// ---- offline filters (need the whole window; only usable after the shot) ----
const zeroPhase=fc=>({offline:(a,fps)=>M.zeroPhaseFilter(a,fc,fps)});
function savgol(coef){
    const h=(coef.length-1)/2,norm=coef.reduce((s,c)=>s+c,0);
    return {offline:a=>a.map((_,i)=>{let s=0;for(let k=-h;k<=h;k++){const j=Math.min(a.length-1,Math.max(0,i+k));s+=coef[k+h]*a[j];}return s/norm;})};
}

const CANDIDATES=[
    {id:'none',label:'不濾波',kind:'即時',raw:true},
    {id:'bw10',label:'Butterworth 10 Hz（現行）',kind:'即時',...causalButter(10)},
    {id:'bw6',label:'Butterworth 6 Hz',kind:'即時',...causalButter(6)},
    {id:'zp6',label:'零相位 6 Hz',kind:'事後',...zeroPhase(6)},
    {id:'kf2',label:'Kalman（q = 20000）',kind:'即時',...kalman(20000)},
];

// One simulated capture. Stress options: drop (per-frame loss probability), gain (the camera sees angles compressed
// toward their mean: measured = mean + gain*(true-mean)), ar (lag-1 autocorrelation of the landmark noise),
// gap = [startFrameAfterTrigger, frames] (tracking lost; those frames never arrive).
function capture(shot,{fps,noiseDeg,jitterMs,drop=0,gain=1,ar=0,gap=null},r){
    const trig={k:new M.ButterworthFilter(10,30),e:new M.ButterworthFilter(10,30)};
    trig.k.update(10,fps);trig.e.update(10,fps);
    const live=CANDIDATES.filter(c=>c.make).map(c=>({c,k:c.make(fps),e:c.make(fps)}));
    const latency=40;
    let state='IDLE',prevKn=null,prevEb=null,lastT=null,raw=[],out=null,nk=0,ne=0,since=-1;
    for(let i=0;;i++){
        const tCap=i*1000/fps;
        if(tCap>shot.tElbow+1500)return null;
        if(state==='RECORDING')since++;
        if(drop&&r()<drop)continue;
        if(gap&&since>=gap[0]&&since<gap[0]+gap[1])continue;
        const now=tCap+latency+Math.abs(gauss(r))*jitterMs;
        if(lastT!==null&&now<=lastT)continue;
        nk=ar*nk+Math.sqrt(1-ar*ar)*gauss(r)*noiseDeg;ne=ar*ne+Math.sqrt(1-ar*ar)*gauss(r)*noiseDeg;
        const rk=170-(170-shot.knee(tCap))*gain+nk,re=70+(shot.elbow(tCap)-70)*gain+ne;
        const sKn=trig.k.filter(rk),sEb=trig.e.filter(re);
        const cand={};for(const l of live)cand[l.c.id]={kn:l.k(rk,now),eb:l.e(re,now)};
        if(prevKn!==null){
            const dtSec=(now-lastT)/1000,knV=(sKn-prevKn)/dtSec;
            if(state==='IDLE'&&sKn<155&&knV<-40){state='RECORDING';raw=[];since=0;}
            else if(state==='RECORDING'){
                raw.push({t:now,kn:rk,eb:re,cand});
                if((sEb>155&&(sEb-prevEb)/dtSec<40)||(now-raw[0].t>1700)){out=raw;break;}
            }
        }
        prevKn=sKn;prevEb=sEb;lastT=now;
    }
    const results={};
    for(const c of CANDIDATES){
        let samples;
        if(c.raw)samples=out.map(s=>({t:s.t,kn:s.kn,eb:s.eb}));
        else if(c.offline){const kn=c.offline(out.map(s=>s.kn),fps),eb=c.offline(out.map(s=>s.eb),fps);samples=out.map((s,i)=>({t:s.t,kn:kn[i],eb:eb[i]}));}
        else samples=out.map(s=>({t:s.t,kn:s.cand[c.id].kn,eb:s.cand[c.id].eb}));
        const res=M.detectTiming(samples);
        results[c.id]=res.reason?{reason:res.reason}:{onset:res.dt,peak:res.events.elbowPeakPerfMs-res.events.kneePeakPerfMs};
    }
    return results;
}
function stats(v){
    if(!v.length)return {n:0,mean:NaN,sd:NaN,mae:NaN,within20:NaN};
    const mean=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,v.length-1));
    const abs=v.map(Math.abs);
    return {n:v.length,mean,sd,mae:abs.reduce((a,b)=>a+b,0)/v.length,within20:abs.filter(x=>x<=20).length/v.length};
}
function runCondition(cond,seed){
    const r=rng(seed),err={},bad={};
    for(const c of CANDIDATES){err[c.id]={onset:[],peak:[]};bad[c.id]=0;}
    let triggered=0;
    for(let k=0;k<N;k++){
        const shot=makeShot(r,cond.speed||1),res=capture(shot,cond,r);
        if(!res)continue;triggered++;
        for(const c of CANDIDATES){
            const m=res[c.id];
            if(m.reason){bad[c.id]++;continue;}
            err[c.id].onset.push(m.onset-shot.truthOnset);err[c.id].peak.push(m.peak-shot.truthPeak);
        }
    }
    return {...cond,triggered,rows:CANDIDATES.map(c=>({id:c.id,label:c.label,valid:err[c.id].peak.length,onset:stats(err[c.id].onset),peak:stats(err[c.id].peak)}))};
}
const B={fps:28,noiseDeg:2,jitterMs:8};
const CONDITIONS=[
    {id:'R0',name:'基準（28 fps、雜訊 2°、抖動 8 ms）',...B},
    {id:'R1',name:'掉影格 5%',...B,drop:.05},
    {id:'R2',name:'掉影格 15%',...B,drop:.15},
    {id:'R3',name:'快速投籃者（動作時間 ×0.6）',...B,speed:.6},
    {id:'R4',name:'慢速投籃者（動作時間 ×1.5）',...B,speed:1.5},
    {id:'R5',name:'相機視角使關節角度縮小到 85%',...B,gain:.85},
    {id:'R6',name:'相機視角使關節角度縮小到 70%',...B,gain:.7},
    {id:'R7',name:'相關雜訊（ρ = 0.8，標準差同為 2°）',...B,ar:.8},
    {id:'R8',name:'追蹤中斷：出手中途連續掉 3 幀',...B,gap:[8,3]},
    {id:'R9',name:'追蹤中斷：出手中途連續掉 6 幀',...B,gap:[8,6]},
];
const t0=Date.now();
const results=CONDITIONS.map((c,i)=>runCondition(c,(i+1)*130003));
const r1=x=>Number.isNaN(x)||x===undefined?'—':(Math.round(x*10)/10).toFixed(1);
if(quick){
    for(const c of results){console.log('\n'+c.name,`triggered ${c.triggered}/${N}`);for(const r of c.rows)console.log(r.id.padEnd(5),`valid ${r.valid}`,'peak',r1(r.peak.mean),'±',r1(r.peak.sd),' onset',r1(r.onset.mean),'±',r1(r.onset.sd));}
    console.log('seconds',(Date.now()-t0)/1000);process.exit(0);
}
const outDir=path.join(__dirname,'..','docs','simulation');
fs.mkdirSync(outDir,{recursive:true});
const md=[`<!-- generated by tools/simulate-robustness.cjs, N=${N} shots per condition, same shots for every filter -->`,
    '誤差 = 量到的 Δt − 真實 Δt（ms）。有效率 = 觸發後能算出時序的比例（算不出來的球被丟掉，不算進誤差）。觸發率 = 系統有沒有偵測到這一球。',''];
for(const c of results){
    md.push(`### ${c.id} ${c.name}（觸發 ${c.triggered}／${N}）`,'','| 濾波器 | 有效率 | 峰值：平均 ± SD (ms) | 峰值：誤差 ≤ 20 ms | 起始：平均 ± SD (ms) | 起始：誤差 ≤ 20 ms |','|---|---|---|---|---|---|');
    for(const r of c.rows)md.push(`| ${r.label} | ${c.triggered?Math.round(r.valid/c.triggered*100):0}% | ${r1(r.peak.mean)} ± ${r1(r.peak.sd)} | ${Math.round(r.peak.within20*100)}% | ${r1(r.onset.mean)} ± ${r1(r.onset.sd)} | ${Math.round(r.onset.within20*100)}% |`);
    md.push('');
}
fs.writeFileSync(path.join(outDir,'robustness-tables.md'),md.join('\n'));
const cols=['condition','triggered','filter','valid','peakMean','peakSd','peakWithin20','onsetMean','onsetSd','onsetWithin20'];
fs.writeFileSync(path.join(outDir,'robustness-results.csv'),[cols.join(','),...results.flatMap(c=>c.rows.map(r=>[c.id,c.triggered,r.id,r.valid,r1(r.peak.mean),r1(r.peak.sd),r1(r.peak.within20*100),r1(r.onset.mean),r1(r.onset.sd),r1(r.onset.within20*100)].join(',')))].join('\n')+'\n');
const COL={none:'#8a99a6',bw10:'#16597c',bw6:'#2f8f5b',zp6:'#d9822b',kf2:'#8a4fb0'};
function chart(defn,title){
    const W=720,H=360,L=56,R=170,T=36,B=96,ids=CANDIDATES.map(c=>c.id);
    const ymax=Math.ceil(Math.max(...results.flatMap(c=>c.rows.map(r=>r[defn].sd)))/20)*20,gw=(W-L-R)/results.length,bw=gw/(ids.length+1);
    const sy=v=>H-B-v/ymax*(H-T-B);
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,'Noto Sans CJK TC',sans-serif" font-size="11"><rect width="${W}" height="${H}" fill="#fff"/><text x="12" y="20" font-size="14" font-weight="600">${title}</text>`;
    for(let v=0;v<=ymax;v+=20)s+=`<line x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e8ec"/><text x="${L-6}" y="${sy(v)+4}" text-anchor="end" fill="#55636e">${v}</text>`;
    s+=`<text x="14" y="${(T+H-B)/2}" transform="rotate(-90 14 ${(T+H-B)/2})" text-anchor="middle" fill="#55636e">誤差標準差 (ms)</text>`;
    results.forEach((c,gi)=>{
        c.rows.forEach((r,i)=>{const x=L+gi*gw+(i+.5)*bw;s+=`<rect x="${x}" y="${sy(r[defn].sd)}" width="${bw*.85}" height="${H-B-sy(r[defn].sd)}" fill="${COL[r.id]}"/>`;});
        s+=`<text x="${L+gi*gw+gw/2}" y="${H-B+16}" text-anchor="middle" fill="#33414b">${c.id}</text>`;
    });
    let ly=T+4;for(const c of CANDIDATES){s+=`<rect x="${W-R+14}" y="${ly}" width="12" height="12" fill="${COL[c.id]}"/><text x="${W-R+32}" y="${ly+10}">${c.label}</text>`;ly+=20;}
    s+=`<text x="${L}" y="${H-52}" fill="#55636e">R0 基準　R1/R2 掉影格 5%/15%　R3/R4 快/慢投籃者　R5/R6 角度縮小 85%/70%</text><text x="${L}" y="${H-36}" fill="#55636e">R7 相關雜訊　R8/R9 出手中途連掉 3/6 幀</text>`;
    return s+'</svg>\n';
}
fs.writeFileSync(path.join(outDir,'robustness-peak-sd.svg'),chart('peak','壓力情境：峰值定義誤差標準差'));
fs.writeFileSync(path.join(outDir,'robustness-onset-sd.svg'),chart('onset','壓力情境：起始定義誤差標準差'));
console.log('Wrote robustness-* in docs/simulation in',(Date.now()-t0)/1000,'s');
