// Reads the raw output of a YOLOX detector (Apache-2.0, trained on COCO) and keeps the sports balls.
// YOLOX stores boxes relative to a grid at three strides (8, 16, 32): centre = (value + cell) * stride and
// size = exp(value) * stride, followed by an objectness score and 80 class scores (class 32 = sports ball).
// The picture is letterboxed (scaled to fit, padded on the right and bottom), so box values divide by the
// scale to give picture pixels, then by the picture size to give 0-1 coordinates. Pure maths; no model is loaded here.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootYolox=api;
})(typeof self!=='undefined'?self:this,function(){
    const SPORTS_BALL=32,CLASSES=80,STRIDES=[8,16,32];
    function letterbox(imgW,imgH,inputSize){
        const scale=Math.min(inputSize/imgW,inputSize/imgH);
        return {scale,width:Math.round(imgW*scale),height:Math.round(imgH*scale)};
    }
    function iou(a,b){
        const ax1=a.cx-a.w/2,ax2=a.cx+a.w/2,ay1=a.cy-a.h/2,ay2=a.cy+a.h/2,bx1=b.cx-b.w/2,bx2=b.cx+b.w/2,by1=b.cy-b.h/2,by2=b.cy+b.h/2;
        const iw=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1)),ih=Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));
        const inter=iw*ih,union=a.w*a.h+b.w*b.h-inter;
        return union>0?inter/union:0;
    }
    function decodeYoloX(data,{imgW,imgH,inputSize=416,scoreThreshold=0.3,iouThreshold=0.5}={}){
        const stride=5+CLASSES;
        const count=STRIDES.reduce((n,s)=>n+(inputSize/s)**2,0);
        if(!data||!imgW||!imgH||data.length<count*stride)return [];
        const {scale}=letterbox(imgW,imgH,inputSize);
        const found=[];
        let index=0;
        for(const s of STRIDES){
            const cells=inputSize/s;
            for(let gy=0;gy<cells;gy++)for(let gx=0;gx<cells;gx++,index++){
                const o=index*stride,score=data[o+4]*data[o+5+SPORTS_BALL];
                if(!(score>=scoreThreshold))continue;
                const cx=(data[o]+gx)*s,cy=(data[o+1]+gy)*s,w=Math.exp(data[o+2])*s,h=Math.exp(data[o+3])*s;
                found.push({cls:0,score,cx:cx/scale/imgW,cy:cy/scale/imgH,w:w/scale/imgW,h:h/scale/imgH});
            }
        }
        found.sort((a,b)=>b.score-a.score);
        const kept=[];
        for(const box of found)if(!kept.some(k=>iou(k,box)>iouThreshold))kept.push(box);
        return kept;
    }
    return {decodeYoloX,letterbox,SPORTS_BALL,STRIDES,CLASSES};
});
