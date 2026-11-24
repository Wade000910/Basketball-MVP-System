// Zoom and lens choice for the practice camera. The phone may sit on a tripod where the player cannot move it, so the
// picture can be zoomed in the app: with the camera's own zoom when it has one, otherwise by cropping the centre of the
// picture (digital zoom). Pure functions only; the page does the camera calls.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootZoom=api;
})(typeof self!=='undefined'?self:this,function(){
    'use strict';
    const MIN=1,MAX=3,PREFS_KEY='basketball-shoot-zoom';
    function clampZoom(z,caps){
        const lo=caps&&Number.isFinite(caps.min)?Math.max(MIN,caps.min):MIN,hi=caps&&Number.isFinite(caps.max)?Math.min(MAX,caps.max):MAX;
        const n=typeof z==='number'?z:NaN;
        if(!Number.isFinite(n))return lo;
        return Math.min(hi,Math.max(lo,n));
    }
    // The centre of the picture that stays visible, as 0-1 fractions of the whole picture. It has the same shape as the
    // picture, so both axes scale the same and joint angles do not change when the landmarks are mapped back.
    function cropRect(zoom){
        const z=clampZoom(zoom),s=1/z;
        return {x:(1-s)/2,y:(1-s)/2,w:s,h:s};
    }
    // Landmarks come back from the analysis in 0-1 positions inside the crop; the rest of the page works in the whole picture.
    function mapLandmarks(landmarks,crop){
        if(!landmarks||!crop)return landmarks;
        return landmarks.map(l=>l&&{...l,x:crop.x+l.x*crop.w,y:crop.y+l.y*crop.h});
    }
    // The stage shows the picture scaled around its centre. A point of the picture lands here, and a tap on the stage maps back.
    const around=(v,f)=>0.5+(v-0.5)*f;
    function scaleToStage(p,zoom){return p&&{x:around(p.x,zoom),y:around(p.y,zoom)};}
    function tapToPictureUnzoomed(p,zoom){return p&&{x:around(p.x,1/zoom),y:around(p.y,1/zoom)};}

    function classifyLens(label){
        const s=String(label||'').toLowerCase();
        if(/front|前置|前鏡|facetime|user/.test(s))return 'front';
        if(/ultra|超廣|超广/.test(s))return 'ultrawide';
        if(/tele|望遠|望远|長焦/.test(s))return 'tele';
        return 'main';
    }
    const LENS_NAME={main:'主鏡頭',ultrawide:'超廣角',tele:'望遠'},LENS_ORDER=['main','ultrawide','tele'];
    // The back lenses the phone lists, one per kind, main first. Labels are only filled in after the camera permission is given.
    function pickLenses(devices){
        const seen={};
        for(const d of devices||[]){
            if(!d||d.kind!=='videoinput')continue;
            const kind=classifyLens(d.label);
            if(kind==='front'||seen[kind])continue;
            seen[kind]={deviceId:d.deviceId,label:d.label,kind,name:LENS_NAME[kind]};
        }
        return LENS_ORDER.filter(k=>seen[k]).map(k=>seen[k]);
    }
    const hasLensChoice=lenses=>Array.isArray(lenses)&&lenses.length>=2;
    const usableLens=(lenses,id)=>typeof id==='string'&&(lenses||[]).some(l=>l.deviceId===id)?id:null;

    // The last zoom and lens, kept on this phone. A blocked or broken storage is not an error.
    function loadPrefs(storage){
        const none={zoom:1,lens:null};
        try{
            const p=JSON.parse(storage.getItem(PREFS_KEY));
            return {zoom:clampZoom(p&&p.zoom),lens:p&&typeof p.lens==='string'?p.lens:null};
        }catch{return none;}
    }
    function savePrefs(storage,prefs){
        try{storage.setItem(PREFS_KEY,JSON.stringify({zoom:clampZoom(prefs.zoom),lens:prefs.lens||null}));}catch{/* not remembered */}
    }
    return {MIN,MAX,PREFS_KEY,clampZoom,cropRect,mapLandmarks,scaleToStage,tapToPictureUnzoomed,classifyLens,pickLenses,hasLensChoice,usableLens,loadPrefs,savePrefs};
});
