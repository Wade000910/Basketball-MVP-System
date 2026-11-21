// Runs a ball-and-hoop detector in the browser with onnxruntime-web. No model file ships with the site
// yet: available() is false until ./models/ball-hoop.onnx exists and onnxruntime-web is loaded, and the
// shooting page keeps the camera option switched off until then. Experimental; the detector and the
// shot logic built on it are not validated on real video.
(function(root,factory){
    const deps=typeof module==='object'&&module.exports?{Y:require('./yolo.js')}:{Y:root.ShootYolo};
    const api=factory(deps);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootBallDetector=api;
})(typeof self!=='undefined'?self:this,function({Y}){
    function createBallDetector({modelUrl='./models/ball-hoop.onnx',inputSize=640,scope=globalThis}={}){
        let session=null,canvas=null,ctx=null;
        async function available(){
            if(!scope.ort||!scope.fetch)return false;
            try{const r=await scope.fetch(modelUrl,{method:'HEAD'});return r.ok;}catch{return false;}
        }
        async function load(){
            if(session)return;
            session=await scope.ort.InferenceSession.create(modelUrl,{executionProviders:['wasm']});
            canvas=scope.document.createElement('canvas');canvas.width=canvas.height=inputSize;ctx=canvas.getContext('2d',{willReadFrequently:true});
        }
        async function detect(video){
            if(!session)await load();
            ctx.drawImage(video,0,0,inputSize,inputSize);
            const rgba=ctx.getImageData(0,0,inputSize,inputSize).data,n=inputSize*inputSize,chw=new Float32Array(3*n);
            for(let i=0;i<n;i++){chw[i]=rgba[4*i]/255;chw[n+i]=rgba[4*i+1]/255;chw[2*n+i]=rgba[4*i+2]/255;}
            const out=await session.run({[session.inputNames[0]]:new scope.ort.Tensor('float32',chw,[1,3,inputSize,inputSize])});
            const tensor=out[session.outputNames[0]];
            const boxes=Y.decodeYolo(tensor.data,{numBoxes:tensor.dims[2],numClasses:tensor.dims[1]-4,inputSize});
            return {ball:Y.pickBall(boxes),hoop:Y.pickHoop(boxes)};
        }
        return {available,load,detect};
    }
    return {createBallDetector};
});
