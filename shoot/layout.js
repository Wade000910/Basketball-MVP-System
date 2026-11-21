// The camera picture is shaped by how the phone is held. The practice page sizes its picture
// frame from the real video, so a phone held upright or on its side both fill the frame
// instead of leaving a small letterboxed strip. Layout only; the analysis does not use this.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootLayout=api;
})(typeof self!=='undefined'?self:this,function(){
    const DEFAULT='4 / 3',MIN_RATIO=0.4,MAX_RATIO=2.5;
    const valid=(w,h)=>Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0&&w/h>=MIN_RATIO&&w/h<=MAX_RATIO;
    function stageAspect(w,h){return valid(w,h)?w+' / '+h:DEFAULT;}
    function orientationOf(w,h){return valid(w,h)&&h>w?'portrait':'landscape';}
    return {stageAspect,orientationOf};
});
