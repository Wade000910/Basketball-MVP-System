// Where the latest shot's timing sits against the player's own made-shot range, as percentages
// of a bar, so the page can draw it instead of only printing numbers. The bar is centred on the
// player's mean and wide enough to show shots well outside the range. Display only.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootGauge=api;
})(typeof self!=='undefined'?self:this,function(){
    const MIN_SPAN_MS=60,SPAN_FACTOR=2.6,MIN_BAND_PCT=10;
    const clamp=v=>Math.max(0,Math.min(100,v));
    function gauge(dt,ref){
        if(!Number.isFinite(dt)||!ref||!ref.ready)return null;
        const half=Math.max(ref.high-ref.low,MIN_SPAN_MS)*SPAN_FACTOR/2;
        const min=ref.mean-half,span=half*2;
        const pct=v=>(v-min)/span*100;
        let start=pct(ref.low),end=pct(ref.high);
        if(end-start<MIN_BAND_PCT){const mid=(start+end)/2;start=mid-MIN_BAND_PCT/2;end=mid+MIN_BAND_PCT/2;}
        const raw=pct(dt),inside=dt>=ref.low&&dt<=ref.high;
        return {markerPct:clamp(raw),bandStartPct:clamp(start),bandEndPct:clamp(end),clipped:raw<0||raw>100,
            tone:inside?'steady':'off',side:inside?'inside':(dt>ref.high?'late':'early')};
    }
    return {gauge};
});
