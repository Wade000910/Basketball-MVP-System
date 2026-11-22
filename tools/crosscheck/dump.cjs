// Writes inputs and the JS pipeline's answers so tools/crosscheck/crosscheck.py can re-compute them independently.
//   node tools/crosscheck/dump.cjs > dump.json
const M=require('../../專題程式/motion-core.js');
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const r=rng(2026112201);
const filterCases=[];
for(const [fc,fs] of [[10,28],[6,28],[10,15],[4,60],[10,30]]){
    const x=Array.from({length:120},(_,i)=>170-60/(1+Math.exp(-(i-60)/6))+(r()-0.5)*8);
    const f=new M.ButterworthFilter(fc,30);f.update(fc,fs);
    filterCases.push({fc,fs,x,y:x.map(v=>f.filter(v))});
}
const zp={fc:6,fs:28,x:filterCases[1].x,y:M.zeroPhaseFilter(filterCases[1].x,6,28)};
const windows=[];
for(let k=0;k<300;k++){
    const fps=[15,20,28,30,60][k%5],n=Math.round(fps*1.6);
    let t=0;const s=[];
    const tK=500+r()*300,tE=tK+60+r()*140,sd=r()<.5?0:2;
    const lg=x=>1/(1+Math.exp(-x));
    for(let i=0;i<n;i++){t+=1000/fps+(r()-.5)*6;
        s.push({t,kn:170-60*lg((t-tK+200)/60)+60*lg((t-tK)/45)+(r()-.5)*2*sd,eb:70+105*lg((t-tE)/30)+(r()-.5)*2*sd});}
    const res=M.detectTiming(s);
    windows.push({s,reason:res.reason||null,dt:res.dt??null,kneePeak:res.events?.kneePeakPerfMs??null,elbowOnset:res.events?.elbowOnsetPerfMs??null,elbowPeak:res.events?.elbowPeakPerfMs??null});
}
console.log(JSON.stringify({threshold:M.ONSET_THRESHOLD_DEG_PER_S,filterCases,zp,windows}));
