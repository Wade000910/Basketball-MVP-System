// Monte Carlo comparison of smoothing filters for the free-throw timing pipeline, with known ground truth.
//
// Same simulated shots and same capture trigger as tools/simulate-timing.cjs. Every candidate filter sees the
// SAME noisy samples of the SAME shot (paired comparison), then goes through the page's MotionCore.detectTiming.
// This measures only how well a filter preserves event timing under sampling noise; it does not model pose-estimation
// bias, camera angle or a real athlete, and the One Euro / Kalman parameters are plain defaults, not tuned on real data.
//
//   node tools/simulate-filters.cjs           -> docs/simulation/filters-*.{md,csv,svg}
//   node tools/simulate-filters.cjs --quick   -> fewer trials, prints only
const fs=require('node:fs'),path=require('node:path');
const M=require('../專題程式/motion-core.js');
const quick=process.argv.includes('--quick');
const N=quick?150:1000;
const THRESH=M.ONSET_THRESHOLD_DEG_PER_S;

function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const logistic=x=>1/(1+Math.exp(-x));
function makeShot(r){
    const tDown=600+r()*100,tauDown=60+r()*30;
    const tKnee=tDown+380+r()*160,tauKnee=40+r()*25;
    const dtPeak=60+r()*140;
    const tElbow=tKnee+dtPeak,tauElbow=25+r()*15;
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
    ...[4,6,8,10,12,15].map(fc=>({id:`bw${fc}`,label:`Butterworth 4 階 ${fc} Hz`+(fc===10?'（現行）':''),kind:'即時',...causalButter(fc),group:'bw',fc})),
    ...[6,8,10,12,15].map(fc=>({id:`zp${fc}`,label:`零相位 Butterworth ${fc} Hz`,kind:'事後',...zeroPhase(fc),group:'zp',fc})),
    {id:'sg5',label:'Savitzky-Golay 5 點（2 次）',kind:'事後',...savgol([-3,12,17,12,-3])},
    {id:'sg7',label:'Savitzky-Golay 7 點（2 次）',kind:'事後',...savgol([-2,3,6,7,6,3,-2])},
    {id:'oe1',label:'One Euro（最低 2 Hz，β 0.01）',kind:'即時',...oneEuro(2,0.01)},
    {id:'oe2',label:'One Euro（最低 4 Hz，β 0.02）',kind:'即時',...oneEuro(4,0.02)},
    {id:'kf1',label:'Kalman（q = 2000）',kind:'即時',...kalman(2000)},
    {id:'kf2',label:'Kalman（q = 20000）',kind:'即時',...kalman(20000)},
    {id:'kf3',label:'Kalman（q = 200000）',kind:'即時',...kalman(200000)},
];

// One simulated capture. The page's own trigger (causal 10 Hz) decides when a shot is recorded; every candidate
// filter runs on the same raw samples, continuously, like a live filter would.
function capture(shot,{fps,noiseDeg,jitterMs},r){
    const trig={k:new M.ButterworthFilter(10,30),e:new M.ButterworthFilter(10,30)};
    trig.k.update(10,fps);trig.e.update(10,fps);
    const live=CANDIDATES.filter(c=>c.make).map(c=>({c,k:c.make(fps),e:c.make(fps)}));
    const latency=40;
    let state='IDLE',prevKn=null,prevEb=null,lastT=null,raw=[],out=null;
    for(let i=0;;i++){
        const tCap=i*1000/fps;
        if(tCap>shot.tElbow+1500)return null;
        const now=tCap+latency+Math.abs(gauss(r))*jitterMs;
        if(lastT!==null&&now<=lastT)continue;
        const rk=shot.knee(tCap)+gauss(r)*noiseDeg,re=shot.elbow(tCap)+gauss(r)*noiseDeg;
        const sKn=trig.k.filter(rk),sEb=trig.e.filter(re);
        const cand={};for(const l of live)cand[l.c.id]={kn:l.k(rk,now),eb:l.e(re,now)};
        if(prevKn!==null){
            const dtSec=(now-lastT)/1000,knV=(sKn-prevKn)/dtSec;
            if(state==='IDLE'&&sKn<155&&knV<-40){state='RECORDING';raw=[];}
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
        const res=M.detectTiming(samples,undefined,{kneeWindowMs:Infinity});
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
        const shot=makeShot(r),res=capture(shot,cond,r);
        if(!res)continue;triggered++;
        for(const c of CANDIDATES){
            const m=res[c.id];
            if(m.reason){bad[c.id]++;continue;}
            err[c.id].onset.push(m.onset-shot.truthOnset);err[c.id].peak.push(m.peak-shot.truthPeak);
        }
    }
    return {...cond,triggered,rows:CANDIDATES.map(c=>({id:c.id,label:c.label,kind:c.kind,valid:err[c.id].peak.length,onset:stats(err[c.id].onset),peak:stats(err[c.id].peak)}))};
}

const CONDITIONS=[
    {id:'C1',name:'手機實況：28 fps、角度雜訊 2°、時間抖動 8 ms',fps:28,noiseDeg:2,jitterMs:8},
    {id:'C2',name:'相機影格時間：28 fps、角度雜訊 2°、無抖動',fps:28,noiseDeg:2,jitterMs:0},
    {id:'C3',name:'低雜訊：28 fps、角度雜訊 1°、時間抖動 8 ms',fps:28,noiseDeg:1,jitterMs:8},
    {id:'C4',name:'高雜訊：28 fps、角度雜訊 4°、時間抖動 8 ms',fps:28,noiseDeg:4,jitterMs:8},
    {id:'C5',name:'低影格率：15 fps、角度雜訊 2°、時間抖動 8 ms',fps:15,noiseDeg:2,jitterMs:8},
];
const t0=Date.now();
const results=CONDITIONS.map((c,i)=>runCondition(c,(i+1)*104729));
const r1=x=>Number.isNaN(x)||x===undefined?'—':(Math.round(x*10)/10).toFixed(1);

if(quick){
    for(const c of results){console.log('\n'+c.name,`triggered ${c.triggered}/${N}`);for(const r of c.rows)console.log(r.id.padEnd(5),`valid ${r.valid}`,'peak',r1(r.peak.mean),'±',r1(r.peak.sd),' onset',r1(r.onset.mean),'±',r1(r.onset.sd));}
    console.log('seconds',(Date.now()-t0)/1000);process.exit(0);
}

// ---- outputs ----
const outDir=path.join(__dirname,'..','docs','simulation');
fs.mkdirSync(outDir,{recursive:true});
const md=[`<!-- generated by tools/simulate-filters.cjs, N=${N} shots per condition, same shots for every filter -->`,
    '誤差 = 量到的 Δt − 真實 Δt（ms）。SD 越小越穩，平均接近 0 代表沒有系統性偏差。有效率 = 觸發後能算出時序的比例。',''];
for(const c of results){
    md.push(`### ${c.id} ${c.name}（觸發 ${c.triggered}／${N}）`,'',
        '| 濾波器 | 類型 | 有效率 | 峰值：平均 ± SD (ms) | 峰值：平均絕對誤差 | 峰值：誤差 ≤ 20 ms | 起始：平均 ± SD (ms) | 起始：誤差 ≤ 20 ms |','|---|---|---|---|---|---|---|---|');
    for(const r of c.rows)md.push(`| ${r.label} | ${r.kind} | ${Math.round(r.valid/c.triggered*100)}% | ${r1(r.peak.mean)} ± ${r1(r.peak.sd)} | ${r1(r.peak.mae)} | ${Math.round(r.peak.within20*100)}% | ${r1(r.onset.mean)} ± ${r1(r.onset.sd)} | ${Math.round(r.onset.within20*100)}% |`);
    md.push('');
}
fs.writeFileSync(path.join(outDir,'filters-tables.md'),md.join('\n'));
const cols=['condition','fps','noiseDeg','jitterMs','filter','kind','valid','triggered','peakMean','peakSd','peakMae','peakWithin20','onsetMean','onsetSd','onsetMae','onsetWithin20'];
fs.writeFileSync(path.join(outDir,'filters-results.csv'),[cols.join(','),...results.flatMap(c=>c.rows.map(r=>[c.id,c.fps,c.noiseDeg,c.jitterMs,r.id,r.kind,r.valid,c.triggered,r1(r.peak.mean),r1(r.peak.sd),r1(r.peak.mae),r1(r.peak.within20*100),r1(r.onset.mean),r1(r.onset.sd),r1(r.onset.mae),r1(r.onset.within20*100)].join(',')))].join('\n')+'\n');

const PAL=['#16597c','#d9822b','#2f8f5b','#8a4fb0','#c23b3b'];
const svgHead=(W,H,title)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,'Noto Sans CJK TC',sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/><text x="12" y="20" font-size="14" font-weight="600">${title}</text>`;
// Figure 1: grouped horizontal bars of peak-definition SD, condition C1 and C2, all filters.
function barChart(cond,defn,title){
    const rows=cond.rows,W=640,rowH=22,T=40,L=250,R=60,H=T+rows.length*rowH+36;
    const max=Math.ceil(Math.max(...rows.map(r=>r[defn].sd))/10)*10,sx=v=>L+v/max*(W-L-R);
    let s=svgHead(W,H,title);
    for(let v=0;v<=max;v+=10)s+=`<line x1="${sx(v)}" x2="${sx(v)}" y1="${T-6}" y2="${H-30}" stroke="#e3e8ec"/><text x="${sx(v)}" y="${H-14}" text-anchor="middle" fill="#55636e">${v}</text>`;
    s+=`<text x="${(L+W-R)/2}" y="${H-1}" text-anchor="middle" fill="#55636e">誤差標準差 (ms)，越小越好</text>`;
    rows.forEach((r,i)=>{const y=T+i*rowH,cur=r.id==='bw10',col=r.kind==='事後'?'#d9822b':'#16597c';
        s+=`<text x="${L-8}" y="${y+14}" text-anchor="end" ${cur?'font-weight="700"':''}>${r.label}</text><rect x="${L}" y="${y+3}" width="${sx(r[defn].sd)-L}" height="${rowH-8}" fill="${col}" opacity="${cur?1:.78}"/><text x="${sx(r[defn].sd)+5}" y="${y+14}" fill="#33414b">${r1(r[defn].sd)}</text>`;});
    s+=`<rect x="${W-170}" y="${T-30}" width="10" height="10" fill="#16597c"/><text x="${W-156}" y="${T-21}">即時（手機上可用）</text><rect x="${W-170}" y="${T-16}" width="10" height="10" fill="#d9822b"/><text x="${W-156}" y="${T-7}">事後（要等整球結束）</text>`;
    return s+'</svg>\n';
}
// Figure 2: Butterworth cutoff sweep, causal vs zero-phase, SD vs cutoff, one line per condition.
function sweepChart(defn,title){
    const W=660,H=320,L=56,R=190,T=36,B=50,fcs=[4,6,8,10,12,15];
    const val=(c,id)=>{const r=c.rows.find(x=>x.id===id);return r?r[defn].sd:null;};
    const all=results.flatMap(c=>fcs.flatMap(f=>[val(c,'bw'+f),val(c,'zp'+f)]).filter(v=>v!==null));
    const ymax=Math.ceil(Math.max(...all)/10)*10,sx=f=>L+(fcs.indexOf(f))/(fcs.length-1)*(W-L-R),sy=v=>H-B-v/ymax*(H-T-B);
    let s=svgHead(W,H,title);
    for(let v=0;v<=ymax;v+=10)s+=`<line x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e3e8ec"/><text x="${L-6}" y="${sy(v)+4}" text-anchor="end" fill="#55636e">${v}</text>`;
    for(const f of fcs)s+=`<text x="${sx(f)}" y="${H-B+18}" text-anchor="middle" fill="#55636e">${f}</text>`;
    s+=`<text x="${(L+W-R)/2}" y="${H-12}" text-anchor="middle" fill="#55636e">截止頻率 (Hz)</text><text x="14" y="${(T+H-B)/2}" transform="rotate(-90 14 ${(T+H-B)/2})" text-anchor="middle" fill="#55636e">誤差標準差 (ms)</text>`;
    let ly=T+6;
    results.forEach((c,i)=>{
        const col=PAL[i%PAL.length];
        for(const [g,dash] of [['bw',''],['zp','5 4']]){
            const pts=fcs.filter(f=>val(c,g+f)!==null).map(f=>`${sx(f)},${sy(val(c,g+f))}`).join(' ');
            s+=`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
        }
        s+=`<line x1="${W-R+10}" x2="${W-R+30}" y1="${ly}" y2="${ly}" stroke="${col}" stroke-width="2"/><text x="${W-R+36}" y="${ly+4}">${c.id}</text>`;ly+=18;
    });
    s+=`<text x="${W-R+10}" y="${ly+8}" fill="#55636e">實線＝即時　虛線＝事後</text>`;
    return s+'</svg>\n';
}
fs.writeFileSync(path.join(outDir,'filters-peak-sd-C1.svg'),barChart(results[0],'peak','峰值定義：各濾波器誤差標準差（C1 手機實況 28 fps）'));
fs.writeFileSync(path.join(outDir,'filters-peak-sd-C2.svg'),barChart(results[1],'peak','峰值定義：各濾波器誤差標準差（C2 相機影格時間 28 fps）'));
fs.writeFileSync(path.join(outDir,'filters-onset-sd-C1.svg'),barChart(results[0],'onset','起始定義：各濾波器誤差標準差（C1 手機實況 28 fps）'));
fs.writeFileSync(path.join(outDir,'filters-cutoff-sweep-peak.svg'),sweepChart('peak','峰值定義：Butterworth 截止頻率 vs 誤差標準差'));
fs.writeFileSync(path.join(outDir,'filters-cutoff-sweep-onset.svg'),sweepChart('onset','起始定義：Butterworth 截止頻率 vs 誤差標準差'));
console.log('Wrote filters-* in docs/simulation in',(Date.now()-t0)/1000,'s');
