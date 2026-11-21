// Trial questionnaire: the System Usability Scale (SUS), five product questions and three open questions.
// Each participant's answers become one small JSON file (no name, only a player code); the person running
// the trial loads the files together to get n, mean and standard deviation for the report. Pure functions.
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.TrialCore=api;
})(typeof self!=='undefined'?self:this,function(){
    const SCHEMA='basketball-mvp-trial-v1',TARGET=70;
    const SUS_ITEMS=['我想我會經常使用這個系統。','我覺得這個系統不必要地複雜。','我覺得這個系統容易使用。','我想我需要有人協助才能使用這個系統。','我覺得這個系統的各項功能整合得很好。','我覺得這個系統有太多不一致的地方。','我想大部分的人能很快學會使用這個系統。','我覺得這個系統用起來很麻煩。','使用這個系統時，我很有信心。','我需要先學很多東西，才能開始使用這個系統。'];
    const PRODUCT_ITEMS=['記錄一組投籃的過程很順手。','趨勢圖讓我更清楚自己的進步。','動作分析的回饋讓我更注意自己的出手。','在球場上用手機記錄不會打斷練習。','知道教練看得到我的紀錄，讓我更願意練習。'];
    const OPEN_ITEMS=['最常用的功能是什麼？','最不方便的地方是什麼？','如果只能加一個功能，你希望是什麼？'];
    const isAnswer=v=>Number.isInteger(v)&&v>=1&&v<=5;
    // Odd items count (answer - 1), even items count (5 - answer); the sum times 2.5 is 0-100.
    function susScore(answers){
        if(!Array.isArray(answers)||answers.length!==10||!answers.every(isAnswer))return null;
        return answers.reduce((sum,a,i)=>sum+(i%2===0?a-1:5-a),0)*2.5;
    }
    function buildResponse({code,sus,product,open=[],device=''},now=new Date().toISOString()){
        const c=String(code||'').trim().toUpperCase();
        if(!/^[A-Z0-9_-]{1,32}$/.test(c))throw new Error('請填球員代碼（英文字母、數字，最多 32 字）。');
        if(!Array.isArray(sus)||sus.length!==10||!sus.every(isAnswer))throw new Error('系統易用性量表 10 題都要回答（1 到 5）。');
        if(!Array.isArray(product)||product.length!==5||!product.every(isAnswer))throw new Error('產品問題 5 題都要回答（1 到 5）。');
        const clean=s=>String(s||'').trim().slice(0,500);
        return {schema:SCHEMA,code:c,submittedAt:now,susScore:susScore(sus),sus:[...sus],product:[...product],open:OPEN_ITEMS.map((_,i)=>clean(open[i])),device:clean(device).slice(0,80)};
    }
    const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
    const sd=v=>{if(v.length<2)return null;const m=mean(v);return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(v.length-1));};
    const round=(v,d=1)=>v===null?null:Math.round(v*10**d)/10**d;
    // One participant counts once: the latest answer for a code wins.
    function latestPerCode(responses){
        const by=new Map();
        for(const r of responses){const old=by.get(r.code);if(!old||String(r.submittedAt)>=String(old.submittedAt))by.set(r.code,r);}
        return [...by.values()];
    }
    function summarize(responses){
        const rs=latestPerCode(responses),scores=rs.map(r=>r.susScore);
        const m=mean(scores);
        return {n:rs.length,mean:round(m),sd:round(sd(scores)),min:scores.length?Math.min(...scores):null,max:scores.length?Math.max(...scores):null,
            meetsTarget:m!==null&&m>=TARGET,target:TARGET,
            productMeans:PRODUCT_ITEMS.map((_,i)=>round(mean(rs.map(r=>r.product[i])),2)),
            susMeans:SUS_ITEMS.map((_,i)=>round(mean(rs.map(r=>r.sus[i])),2)),
            open:OPEN_ITEMS.map((_,i)=>rs.map(r=>({code:r.code,text:r.open[i]})).filter(x=>x.text))};
    }
    function validResponse(r){
        try{return r&&r.schema===SCHEMA?buildResponse({code:r.code,sus:r.sus,product:r.product,open:r.open,device:r.device},r.submittedAt):null;}catch{return null;}
    }
    // Reads several files' text: each may hold one response or a list of them.
    function parseFiles(texts){
        const responses=[],skipped=[];
        texts.forEach((t,i)=>{
            let data;
            try{data=JSON.parse(t);}catch{skipped.push({index:i,reason:'不是有效的 JSON'});return;}
            for(const item of Array.isArray(data)?data:[data]){
                const r=validResponse(item);
                if(r)responses.push(r);else skipped.push({index:i,reason:'格式不符或答案不完整'});
            }
        });
        return {responses,skipped};
    }
    const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
    function toCsv(responses){
        const head=['code','susScore',...SUS_ITEMS.map((_,i)=>'sus'+(i+1)),...PRODUCT_ITEMS.map((_,i)=>'product'+(i+1)),...OPEN_ITEMS.map((_,i)=>'open'+(i+1)),'device','submittedAt'];
        const rows=latestPerCode(responses).map(r=>[r.code,r.susScore,...r.sus,...r.product,...r.open.map(q),q(r.device),r.submittedAt]);
        return [head.join(','),...rows.map(r=>r.join(','))].join('\n')+'\n';
    }
    return {SCHEMA,TARGET,SUS_ITEMS,PRODUCT_ITEMS,OPEN_ITEMS,susScore,buildResponse,summarize,parseFiles,toCsv};
});
