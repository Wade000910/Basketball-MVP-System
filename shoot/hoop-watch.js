// Collects ball sightings for a short window after each shot is released and asks the shot logic
// for a verdict. The hoop is placed once from the middle of everything seen (a median, so one wrong
// box does not move it); the hoop does not move during a set. Pure bookkeeping, no camera or model.
(function(root,factory){
    const deps=typeof module==='object'&&module.exports?{H:require('./hoop.js')}:{H:root.ShootHoop};
    const api=factory(deps);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.ShootHoopWatch=api;
})(typeof self!=='undefined'?self:this,function({H}){
    const KEEP=31;
    const median=v=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:null;};
    function createHoopWatch({windowMs=2500}={}){
        let startedAt=null,obs=[],closed=false;
        const hoops=[];
        let fixed=null;
        function noteHoop(h){
            if(!h||![h.cx,h.cy,h.w].every(Number.isFinite))return;
            hoops.push(h);if(hoops.length>KEEP)hoops.shift();
        }
        function setHoop(h){fixed=h&&[h.cx,h.cy,h.w].every(Number.isFinite)?{cx:h.cx,cy:h.cy,w:h.w}:null;}
        function hoop(){
            if(fixed)return fixed;
            if(!hoops.length)return null;
            return {cx:median(hoops.map(h=>h.cx)),cy:median(hoops.map(h=>h.cy)),w:median(hoops.map(h=>h.w))};
        }
        function start(t){startedAt=t;obs=[];closed=false;}
        function push(t,{ball,hoop:h}){
            noteHoop(h);
            if(startedAt===null||closed||t<startedAt||t-startedAt>windowMs)return;
            obs.push({t,ball:ball||null});
        }
        function finished(t){return startedAt!==null&&!closed&&t-startedAt>=windowMs;}
        function finish(t){
            if(!finished(t))return null;
            closed=true;startedAt=null;
            return H.classifyShot(obs,hoop());
        }
        return {start,push,noteHoop,setHoop,hoop,finished,finish};
    }
    return {createHoopWatch};
});
