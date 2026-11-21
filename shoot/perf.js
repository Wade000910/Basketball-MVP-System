// Measures how smoothly pose analysis runs on this phone: how long each analysed frame takes
// and how many camera frames had to be skipped because analysis was still busy. It only
// observes; it never changes what is analysed. suggest() returns 'lite' when the phone
// cannot keep up, so the page can offer the lighter model instead of silently losing shots.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootPerf=api;
})(typeof self!=='undefined'?self:this,function(){
    const MIN_FRAMES=30,SLOW_MEDIAN_MS=45,DROP_LIMIT_PCT=40;
    function createPerfMonitor({window:size=60}={}){
        let offeredCount=0,startedCount=0,startAt=null;
        const times=[],marks=[];
        function trim(){while(times.length>size)times.shift();while(marks.length>size)marks.shift();}
        function offered(){offeredCount++;}
        function started(t){startedCount++;startAt=t;}
        function finished(t){
            if(startAt===null)return;
            times.push(t-startAt);startAt=null;
            marks.push({offered:offeredCount,started:startedCount});
            trim();
        }
        const pct=(sorted,q)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];
        function stats(){
            const n=times.length;
            if(!n)return {n:0,medianMs:null,p95Ms:null,dropPct:0};
            const sorted=[...times].sort((a,b)=>a-b);
            const first=marks[0],last=marks[n-1];
            const offeredN=last.offered-first.offered,startedN=last.started-first.started;
            const dropPct=offeredN>0?Math.max(0,Math.round((1-startedN/offeredN)*100)):0;
            return {n,medianMs:Math.round(pct(sorted,0.5)),p95Ms:Math.round(pct(sorted,0.95)),dropPct};
        }
        function suggest(){
            const s=stats();
            if(s.n<MIN_FRAMES)return null;
            return s.medianMs>SLOW_MEDIAN_MS||s.dropPct>DROP_LIMIT_PCT?'lite':null;
        }
        return {offered,started,finished,stats,suggest};
    }
    return {createPerfMonitor,MIN_FRAMES,SLOW_MEDIAN_MS,DROP_LIMIT_PCT};
});
