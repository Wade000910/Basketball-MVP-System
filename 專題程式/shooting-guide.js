(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ShootingGuide=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    function check(landmarks,side='right'){
        if(!Array.isArray(landmarks)||landmarks.length<29)return {ready:false,text:'找不到身體，請站入畫面並增加照明。'};
        const indices=side==='left'?[11,13,15,23,25,27]:[12,14,16,24,26,28];
        if(indices.some(i=>!landmarks[i] || !Number.isFinite(landmarks[i].visibility) || landmarks[i].visibility<0.6))return {ready:false,text:'請調整角度，讓慣用側的肩、肘、手腕、髖、膝與腳踝清楚入鏡。'};
        if(indices.some(i=>!Number.isFinite(landmarks[i].x)||!Number.isFinite(landmarks[i].y)||landmarks[i].x<0.03||landmarks[i].x>0.97||landmarks[i].y<0.03||landmarks[i].y>0.97))return {ready:false,text:'身體太靠近畫面邊緣，請把手機移遠一點，留出舉手空間。'};
        return {ready:true,text:'已偵測到慣用側身體。準備好後舉球，開始罰球。'};
    }
    return {check};
});
