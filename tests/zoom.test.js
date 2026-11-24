const test=require('node:test');
const assert=require('node:assert/strict');
const Z=require('../shoot/zoom.js');

test('zoom is kept between 1x and 3x and a bad value falls back to 1x',()=>{
    assert.equal(Z.clampZoom(0.4),1);
    assert.equal(Z.clampZoom(7),3);
    assert.equal(Z.clampZoom(2.25),2.25);
    for(const bad of [NaN,undefined,null,'abc',Infinity])assert.equal(Z.clampZoom(bad),1,String(bad));
    assert.equal(Z.clampZoom(9,{min:1,max:2}),2,'a camera that only zooms to 2x caps the slider');
});

test('the crop is the centre of the picture and keeps the picture shape',()=>{
    assert.deepEqual(Z.cropRect(1),{x:0,y:0,w:1,h:1});
    assert.deepEqual(Z.cropRect(2),{x:0.25,y:0.25,w:0.5,h:0.5});
    assert.ok(Math.abs(Z.cropRect(3).w-1/3)<1e-9&&Math.abs(Z.cropRect(3).x-1/3)<1e-9);
});

test('landmarks found in the crop are mapped back to the whole picture',()=>{
    const crop=Z.cropRect(2);
    const lm=[{x:0.5,y:0.5,z:-0.1,visibility:0.9},{x:0,y:0,z:0,visibility:0.5},{x:1,y:1,z:0,visibility:1}];
    const out=Z.mapLandmarks(lm,crop);
    assert.deepEqual([out[0].x,out[0].y],[0.5,0.5],'the crop centre stays the picture centre');
    assert.deepEqual([out[1].x,out[1].y],[0.25,0.25]);
    assert.deepEqual([out[2].x,out[2].y],[0.75,0.75]);
    assert.equal(out[0].visibility,0.9);assert.equal(out[0].z,-0.1,'visibility and depth are kept');
    assert.equal(lm[1].x,0,'the input is not changed');
    assert.equal(Z.mapLandmarks(null,crop),null);
    assert.equal(Z.mapLandmarks(lm,null),lm,'no crop: the same landmarks');
});

test('mapping back keeps joint angles, because both axes are scaled the same',()=>{
    const angle=(a,b,c)=>{const v=[a.x-b.x,a.y-b.y],w=[c.x-b.x,c.y-b.y];return Math.acos((v[0]*w[0]+v[1]*w[1])/Math.hypot(...v)/Math.hypot(...w));};
    const inCrop=[{x:0.2,y:0.3},{x:0.5,y:0.5},{x:0.8,y:0.35}];
    for(const zoom of [1,1.5,2,3]){
        const out=Z.mapLandmarks(inCrop,Z.cropRect(zoom));
        assert.ok(Math.abs(angle(...out)-angle(...inCrop))<1e-9,'zoom '+zoom);
    }
});

test('a tap on the zoomed picture is turned back into a picture position',()=>{
    for(const zoom of [1,2,3]){
        for(const p of [{x:0.5,y:0.5},{x:0.7,y:0.4}]){
            const shown=Z.scaleToStage(p,zoom);                 // where the point appears on the stage
            const back=Z.tapToPictureUnzoomed(shown,zoom);
            assert.ok(Math.abs(back.x-p.x)<1e-9&&Math.abs(back.y-p.y)<1e-9);
        }
    }
    assert.equal(Z.tapToPictureUnzoomed(null,2),null);
});

test('lenses are told apart by their names; the control only shows when there is a choice',()=>{
    assert.equal(Z.classifyLens('Back Ultra Wide Camera'),'ultrawide');
    assert.equal(Z.classifyLens('後置超廣角相機'),'ultrawide');
    assert.equal(Z.classifyLens('Back Telephoto Camera'),'tele');
    assert.equal(Z.classifyLens('後置望遠相機'),'tele');
    assert.equal(Z.classifyLens('Back Camera'),'main');
    assert.equal(Z.classifyLens('Front Camera'),'front');
    assert.equal(Z.classifyLens('前置相機'),'front');
    assert.equal(Z.classifyLens(''),'main');
    const dev=(deviceId,label,kind='videoinput')=>({deviceId,label,kind});
    const lenses=Z.pickLenses([dev('a','Back Camera'),dev('b','Back Ultra Wide Camera'),dev('c','Front Camera'),dev('m','Microphone','audioinput')]);
    assert.deepEqual(lenses.map(l=>[l.deviceId,l.kind,l.name]),[['a','main','主鏡頭'],['b','ultrawide','超廣角']],'front camera and microphone are left out; main comes first');
    assert.equal(Z.hasLensChoice(lenses),true);
    assert.equal(Z.hasLensChoice(Z.pickLenses([dev('a','Back Camera')])),false);
    assert.equal(Z.hasLensChoice(Z.pickLenses([dev('a','Back Camera'),dev('f','Front Camera')])),false,'one back lens: no control');
    assert.equal(Z.hasLensChoice(Z.pickLenses([dev('a',''),dev('b','')])),false,'unnamed lenses cannot be told apart, so no control');
});

test('the last zoom and lens are remembered, and a broken storage never throws',()=>{
    const mem={};const storage={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v;}};
    assert.deepEqual(Z.loadPrefs(storage),{zoom:1,lens:null});
    Z.savePrefs(storage,{zoom:2.5,lens:'b'});
    assert.deepEqual(Z.loadPrefs(storage),{zoom:2.5,lens:'b'});
    mem[Z.PREFS_KEY]='not json';
    assert.deepEqual(Z.loadPrefs(storage),{zoom:1,lens:null});
    mem[Z.PREFS_KEY]=JSON.stringify({zoom:99,lens:5});
    assert.deepEqual(Z.loadPrefs(storage),{zoom:3,lens:null},'a stored value outside the range is brought back into it');
    const broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
    assert.deepEqual(Z.loadPrefs(broken),{zoom:1,lens:null});
    assert.doesNotThrow(()=>Z.savePrefs(broken,{zoom:2,lens:null}));
    assert.deepEqual(Z.loadPrefs(null),{zoom:1,lens:null});
});

test('a lens that is no longer there is not used again',()=>{
    const lenses=Z.pickLenses([{deviceId:'a',label:'Back Camera',kind:'videoinput'},{deviceId:'b',label:'Back Ultra Wide Camera',kind:'videoinput'}]);
    assert.equal(Z.usableLens(lenses,'b'),'b');
    assert.equal(Z.usableLens(lenses,'gone'),null);
    assert.equal(Z.usableLens(lenses,null),null);
});
