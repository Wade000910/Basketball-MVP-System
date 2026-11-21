// Runs a ball detector in the browser with onnxruntime-web, reading the YOLOX output layout (class
// "sports ball") from the model named in camera-config.js (none is shipped yet). The hoop is not detected; the player taps its two rim edges
// on the picture (see layout.js). The model is a general detector and has not been validated on basketballs in
// flight, so the shooting page presents the camera option as experimental. onnxruntime-web is loaded from a
// pinned CDN version the first time the option is switched on.
(function(root,factory){
    const deps=typeof module==='object'&&module.exports?{X:require('./yolox.js'),Y:require('./yolo.js')}:{X:root.ShootYolox,Y:root.ShootYolo};
    const api=factory(deps);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootBallDetector=api;
})(typeof self!=='undefined'?self:this,function({X,Y}){
    const ORT_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
    function loadOrt(scope){
        if(scope.ort)return Promise.resolve(scope.ort);
        return new Promise((resolve,reject)=>{
            const s=scope.document.createElement('script');
            s.src=ORT_BASE+'ort.min.js';s.onload=()=>{scope.ort.env.wasm.wasmPaths=ORT_BASE;resolve(scope.ort);};s.onerror=()=>reject(new Error('onnxruntime-web 載入失敗'));
            scope.document.head.appendChild(s);
        });
    }
    function createBallDetector({modelUrl=globalThis.ShootCameraModel||null,inputSize=416,scoreThreshold=0.3,scope=globalThis}={}){
        let session=null,canvas=null,ctx=null,ort=null;
        async function available(){
            if(!modelUrl||!scope.fetch)return false;
            try{const r=await scope.fetch(modelUrl,{method:'HEAD'});return r.ok;}catch{return false;}
        }
        async function load(){
            if(session)return;
            ort=await loadOrt(scope);
            session=await ort.InferenceSession.create(modelUrl,{executionProviders:['wasm']});
            canvas=scope.document.createElement('canvas');canvas.width=canvas.height=inputSize;ctx=canvas.getContext('2d',{willReadFrequently:true});
        }
        // YOLOX takes 0-255 values in BGR order, the picture scaled to fit and padded with grey (114) on the right and bottom.
        async function detect(source){
            if(!session)await load();
            const w=source.videoWidth||source.width,h=source.videoHeight||source.height;
            if(!w||!h)return {ball:null,hoop:null};
            const lb=X.letterbox(w,h,inputSize);
            ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,inputSize,inputSize);
            ctx.drawImage(source,0,0,w,h,0,0,lb.width,lb.height);
            const rgba=ctx.getImageData(0,0,inputSize,inputSize).data,n=inputSize*inputSize,chw=new Float32Array(3*n);
            for(let i=0;i<n;i++){chw[i]=rgba[4*i+2];chw[n+i]=rgba[4*i+1];chw[2*n+i]=rgba[4*i];}
            const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',chw,[1,3,inputSize,inputSize])});
            const boxes=X.decodeYoloX(out[session.outputNames[0]].data,{imgW:w,imgH:h,inputSize,scoreThreshold});
            return {ball:Y.pickBall(boxes),hoop:null};
        }
        return {available,load,detect};
    }
    return {createBallDetector};
});
