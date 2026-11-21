// Decides make or miss from where the ball was seen around the hoop. It reads a list of ball
// sightings (centre x, y in 0-1 picture coordinates, y grows downward) and the hoop (rim centre
// and opening width in the same units). A make is a ball that crosses the rim line going down
// through the opening and does not come back out. The net may hide the ball afterwards, so
// missing frames after the crossing do not count against it. When the ball never gets near the
// hoop or is seen too few times, the answer is "unknown" and the player records it by hand.
// This only reads detections; it does not detect anything itself and is not validated on video yet.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootHoop=api;
})(typeof self!=='undefined'?self:this,function(){
    const MIN_SIGHTINGS=3,NEAR_WIDTHS=3,NEAR_BAND=0.25,INSIDE_FRACTION=0.9,TRUST_GAP_MS=80;
    function classifyShot(observations,hoop){
        const unknown=reason=>({result:'unknown',reason,confidence:'low'});
        if(!hoop||!Number.isFinite(hoop.cx)||!Number.isFinite(hoop.cy)||!(hoop.w>0))return unknown('籃框位置不明');
        const seen=(observations||[]).filter(o=>o&&o.ball&&Number.isFinite(o.ball.x)&&Number.isFinite(o.ball.y)).sort((a,b)=>a.t-b.t);
        if(seen.length<MIN_SIGHTINGS)return unknown('球被看到的次數太少');
        const near=seen.some(o=>Math.abs(o.ball.x-hoop.cx)<NEAR_WIDTHS*hoop.w&&Math.abs(o.ball.y-hoop.cy)<NEAR_BAND);
        if(!near)return unknown('球沒有靠近籃框');
        const downs=[],ups=[];
        for(let i=1;i<seen.length;i++){
            const a=seen[i-1],b=seen[i];
            const crossesDown=a.ball.y<hoop.cy&&b.ball.y>=hoop.cy,crossesUp=a.ball.y>hoop.cy&&b.ball.y<=hoop.cy;
            if(!crossesDown&&!crossesUp)continue;
            const k=(hoop.cy-a.ball.y)/(b.ball.y-a.ball.y);
            const at={x:a.ball.x+k*(b.ball.x-a.ball.x),t:a.t+k*(b.t-a.t),gap:b.t-a.t};
            (crossesDown?downs:ups).push(at);
        }
        if(!downs.length)return {result:'missed',reason:'球到了籃框附近，沒有從上方穿過籃框',confidence:'high'};
        const last=downs[downs.length-1];
        const inside=Math.abs(last.x-hoop.cx)<=hoop.w/2*INSIDE_FRACTION;
        const confidence=last.gap<=TRUST_GAP_MS?'high':'low';
        if(!inside)return {result:'missed',reason:'球從籃框旁邊掉下去',confidence};
        if(ups.some(u=>u.t>last.t))return {result:'missed',reason:'球穿過後又彈回籃框上方',confidence};
        return {result:'made',reason:'球從上方穿過籃框中間',confidence};
    }
    return {classifyShot,MIN_SIGHTINGS};
});
