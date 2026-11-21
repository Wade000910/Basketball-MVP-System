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
    // A tap on the frame, as 0-1 picture coordinates. The picture is fitted inside the frame (bars at the
    // sides or at the top and bottom), so the tap is measured against the picture, not the whole frame.
    function tapToPicture(rect,videoW,videoH,clientX,clientY){
        if(!(videoW>0&&videoH>0&&rect&&rect.width>0&&rect.height>0))return null;
        const scale=Math.min(rect.width/videoW,rect.height/videoH),w=videoW*scale,h=videoH*scale;
        const left=rect.left+(rect.width-w)/2,top=rect.top+(rect.height-h)/2;
        const x=(clientX-left)/w,y=(clientY-top)/h;
        if(x<0||x>1||y<0||y>1)return null;
        return {x,y};
    }
    // The hoop from two taps on the left and right edge of the rim.
    const MIN_RIM_WIDTH=0.02;
    function hoopFromTaps(a,b){
        if(!a||!b)return null;
        const w=Math.abs(b.x-a.x);
        if(!(w>=MIN_RIM_WIDTH))return null;
        return {cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,w};
    }
    return {stageAspect,orientationOf,tapToPicture,hoopFromTaps};
});
