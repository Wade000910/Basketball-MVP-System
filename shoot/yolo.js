// Turns the raw output of a YOLO-style detector into the ball and hoop positions the shot logic needs.
// Expected layout: [1, 4 + classes, boxes], channel by channel: centre x, centre y, width, height, then one
// score per class (class 0 = ball, class 1 = hoop). The picture is stretched to a square input, so box
// values divide by the input size to give 0-1 picture coordinates. Pure maths; no model is loaded here.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootYolo=api;
})(typeof self!=='undefined'?self:this,function(){
    const BALL=0,HOOP=1;
    function iou(a,b){
        const ax1=a.cx-a.w/2,ax2=a.cx+a.w/2,ay1=a.cy-a.h/2,ay2=a.cy+a.h/2,bx1=b.cx-b.w/2,bx2=b.cx+b.w/2,by1=b.cy-b.h/2,by2=b.cy+b.h/2;
        const iw=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1)),ih=Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));
        const inter=iw*ih,union=a.w*a.h+b.w*b.h-inter;
        return union>0?inter/union:0;
    }
    function decodeYolo(data,{numBoxes,numClasses=2,inputSize=640,scoreThreshold=0.35,iouThreshold=0.5}={}){
        if(!data||!numBoxes||data.length<(4+numClasses)*numBoxes)return [];
        const found=[];
        for(let i=0;i<numBoxes;i++){
            let cls=0,score=-1;
            for(let c=0;c<numClasses;c++){const s=data[(4+c)*numBoxes+i];if(s>score){score=s;cls=c;}}
            if(!(score>=scoreThreshold))continue;
            found.push({cls,score,cx:data[i]/inputSize,cy:data[numBoxes+i]/inputSize,w:data[2*numBoxes+i]/inputSize,h:data[3*numBoxes+i]/inputSize});
        }
        found.sort((a,b)=>b.score-a.score);
        const kept=[];
        for(const box of found)if(!kept.some(k=>k.cls===box.cls&&iou(k,box)>iouThreshold))kept.push(box);
        return kept;
    }
    const best=(list,cls)=>list.filter(b=>b.cls===cls).sort((a,b)=>b.score-a.score)[0]||null;
    function pickBall(list){const b=best(list,BALL);return b?{x:b.cx,y:b.cy,r:(b.w+b.h)/4}:null;}
    function pickHoop(list){const b=best(list,HOOP);return b?{cx:b.cx,cy:b.cy,w:b.w}:null;}
    return {decodeYolo,pickBall,pickHoop,BALL,HOOP};
});
