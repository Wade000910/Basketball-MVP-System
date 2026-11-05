// Free-throw timing algorithm, moved out of index.html so it can be tested and
// simulated directly. The arithmetic is unchanged from timing-validity-v3:
// angles -> causal 4th-order Butterworth (two cascaded biquads) -> natural cubic
// spline evaluated on a 1 ms computational grid -> knee peak extension velocity,
// elbow peak extension velocity, and elbow onset (last crossing <= 10 deg/s before
// the elbow peak). The 1 ms grid does not raise the physical sampling rate.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.MotionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const ONSET_THRESHOLD_DEG_PER_S=10;

    class ButterworthFilter {
        constructor(fc, fs) { this.update(fc, fs); this.initVal = 0; this.initialized = false; }
        update(fc, fs) {
            if (fc >= fs / 2) fc = fs / 2 - 0.1;
            const w = 2 * Math.PI * (fc / fs);
            const K = Math.tan(w / 2);
            const Q = 1 / Math.SQRT2;
            const norm = 1 / (1 + K / Q + K * K);
            this.b0 = K * K * norm; this.b1 = 2 * this.b0; this.b2 = this.b0;
            this.a1 = 2 * (K * K - 1) * norm; this.a2 = (1 - K / Q + K * K) * norm;
        }
        init(v) { this.x1=this.x2=this.y1=this.y2=v; this.x1b=this.x2b=this.y1b=this.y2b=v; this.initialized=true; }
        filter(v) {
            if (!this.initialized) this.init(v);
            let y1 = this.b0 * v + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
            this.x2 = this.x1; this.x1 = v; this.y2 = this.y1; this.y1 = y1;
            let y2 = this.b0 * y1 + this.b1 * this.x1b + this.b2 * this.x2b - this.a1 * this.y1b - this.a2 * this.y2b;
            this.x2b = this.x1b; this.x1b = y1; this.y2b = this.y1b; this.y1b = y2;
            return y2;
        }
    }

    function createSpline(x, y) {
        let n = x.length; let a = y; let h = new Float64Array(n-1); let alpha = new Float64Array(n-1);
        for(let i=0; i<n-1; i++) h[i] = x[i+1]-x[i];
        for(let i=1; i<n-1; i++) alpha[i] = (3/h[i])*(a[i+1]-a[i])-(3/h[i-1])*(a[i]-a[i-1]);
        let l=new Float64Array(n), mu=new Float64Array(n), z=new Float64Array(n), c=new Float64Array(n), b=new Float64Array(n), d=new Float64Array(n);
        l[0]=1; mu[0]=0; z[0]=0;
        for(let i=1; i<n-1; i++) { l[i]=2*(x[i+1]-x[i-1])-h[i-1]*mu[i-1]; mu[i]=h[i]/l[i]; z[i]=(alpha[i]-h[i-1]*z[i-1])/l[i]; }
        l[n-1]=1; z[n-1]=0; c[n-1]=0;
        for(let j=n-2; j>=0; j--) { c[j]=z[j]-mu[j]*c[j+1]; b[j]=(a[j+1]-a[j])/h[j]-h[j]*(c[j+1]+2*c[j])/3; d[j]=(c[j+1]-c[j])/(3*h[j]); }
        return (xi) => {
            if(xi<=x[0]) return a[0]; if(xi>=x[n-1]) return a[n-1];
            let i=0, j=n-1; while(i<=j) { let k=Math.floor((i+j)/2); if(x[k]<xi) i=k+1; else j=k-1; }
            let idx=j, dx=xi-x[idx]; return a[idx]+b[idx]*dx+c[idx]*dx*dx+d[idx]*dx*dx*dx;
        };
    }

    function calculateAngle(a, b, c) {
        const v1 = {x: a.x - b.x, y: a.y - b.y, z: a.z - b.z};
        const v2 = {x: c.x - b.x, y: c.y - b.y, z: c.z - b.z};
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const m1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const m2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
        return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
    }

    // Zero-phase variant for offline use: the same 4th-order filter run forward and then
    // backward over a recorded window, so the two passes' phase delays cancel. Edges are
    // padded by odd reflection to limit start-up transients. Not used by the live page yet.
    function zeroPhaseFilter(values, fc, fs){
        if(values.length<3)return values.slice();
        const pad=Math.min(values.length-1,Math.max(3,Math.round(fs/2)));
        const first=values[0],last=values[values.length-1];
        const head=[],tail=[];
        for(let i=pad;i>=1;i--)head.push(2*first-values[i]);
        for(let i=1;i<=pad;i++)tail.push(2*last-values[values.length-1-i]);
        const run=xs=>{const f=new ButterworthFilter(fc,fs);return xs.map(v=>f.filter(v));};
        const forward=run([...head,...values,...tail]);
        const backward=run(forward.reverse()).reverse();
        return backward.slice(pad,pad+values.length);
    }

    // samples: [{t (ms), kn (deg), eb (deg)}] already filtered. Returns either
    // {reason} or {dt, events:{kneePeakPerfMs, elbowOnsetPerfMs, elbowPeakPerfMs}, chart}.
    // `spline` is injectable so tests can supply exact velocity profiles.
    function detectTiming(shotData, spline=createSpline){
        if(shotData.length < 10) return {reason:'INSUFFICIENT_SAMPLES'};
        if(shotData.some(d=>![d.t,d.kn,d.eb].every(Number.isFinite))) return {reason:'NONFINITE_SAMPLE'};
        if(shotData.some((d,i)=>i>0 && d.t<=shotData[i-1].t)) return {reason:'INVALID_TIMESTAMPS'};
        const ts = shotData.map(d=>d.t), kns = shotData.map(d=>d.kn), ebs = shotData.map(d=>d.eb);
        const sKn = spline(ts, kns), sEb = spline(ts, ebs);
        let start = Math.ceil(ts[0]), end = Math.floor(ts[ts.length-1]);
        let maxKv = -1e9, tK = -1, maxEv = -1e9, pE = -1;
        let chartK = [], chartE = [], chartLabels = [];
        for(let t=start; t<=end; t++) {
            let kv = (sKn(t)-sKn(t-1))/0.001; if(kv>maxKv){ maxKv=kv; tK=t; }
            let ev = (sEb(t)-sEb(t-1))/0.001; if(ev>maxEv){ maxEv=ev; pE=t; }
            chartK.push(kv); chartE.push(ev); chartLabels.push(t);
        }
        if(!chartK.every(Number.isFinite) || !chartE.every(Number.isFinite)) return {reason:'NONFINITE_VELOCITY'};
        if(maxKv<=0) return {reason:'KNEE_EXTENSION_NOT_FOUND'};
        if(maxEv<=ONSET_THRESHOLD_DEG_PER_S) return {reason:'ELBOW_EXTENSION_NOT_FOUND'};
        // Tied maxima can start earlier yet remain truncated at the end.
        // Allow only floating-point roundoff, not a biomechanical tolerance.
        const peakReachesEnd=(values,max)=>values[values.length-1]>=max-4096*Number.EPSILON*Math.max(1,Math.abs(max));
        if(peakReachesEnd(chartK,maxKv) || peakReachesEnd(chartE,maxEv)) return {reason:'PEAK_AT_WINDOW_END'};
        let tE = null;
        // Require an observed crossing; exclude the spline's artificial boundary extension.
        for(let t=pE; t>start; t--){ if((sEb(t)-sEb(t-1))/0.001 <= ONSET_THRESHOLD_DEG_PER_S){ tE=t; break; } }
        if(tE===null) return {reason:'ELBOW_ONSET_NOT_FOUND'};
        // Estimates on the pose-result performance.now() clock, not video PTS.
        return {dt:tE - tK,events:{kneePeakPerfMs:tK,elbowOnsetPerfMs:tE,elbowPeakPerfMs:pE},chart:{labels:chartLabels,knee:chartK,elbow:chartE}};
    }
    return {ONSET_THRESHOLD_DEG_PER_S,ButterworthFilter,createSpline,calculateAngle,detectTiming,zeroPhaseFilter};
});
