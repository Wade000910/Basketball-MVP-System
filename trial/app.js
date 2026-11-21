(function(){
    'use strict';
    const T=TrialCore,$=id=>document.getElementById(id);
    function scale(name,text,i,list){
        const q=document.createElement('fieldset');q.className='q';
        const l=document.createElement('legend');l.textContent=(i+1)+'. '+text;q.appendChild(l);
        const row=document.createElement('div');row.className='scale';
        for(let v=1;v<=5;v++){
            const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');
            input.type='radio';input.name=name+i;input.value=String(v);span.textContent=String(v);
            label.append(input,span);row.appendChild(label);
        }
        const ends=document.createElement('div');ends.className='ends';ends.innerHTML='<span>非常不同意</span><span>非常同意</span>';
        q.append(row,ends);list.appendChild(q);
    }
    T.SUS_ITEMS.forEach((t,i)=>scale('sus',t,i,$('sus-list')));
    T.PRODUCT_ITEMS.forEach((t,i)=>scale('product',t,i,$('product-list')));
    T.OPEN_ITEMS.forEach((t,i)=>{const l=document.createElement('label');l.className='open-q';l.textContent=t;const a=document.createElement('textarea');a.id='open'+i;a.maxLength=500;l.appendChild(a);$('open-list').appendChild(l);});
    const answers=name=>[...Array(name==='sus'?10:5).keys()].map(i=>{const c=document.querySelector('input[name="'+name+i+'"]:checked');return c?Number(c.value):null;});
    function download(name,text,type){
        const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;
        document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }
    $('survey').addEventListener('submit',event=>{
        event.preventDefault();
        const msg=$('survey-message');msg.hidden=true;$('done-note').hidden=true;
        const sus=answers('sus'),product=answers('product');
        if(sus.includes(null)||product.includes(null)){
            msg.textContent='還有題目沒回答，請把 A 和 B 的每一題都選一個分數。';msg.hidden=false;return;
        }
        try{
            const r=T.buildResponse({code:$('code').value,sus,product,open:T.OPEN_ITEMS.map((_,i)=>$('open'+i).value),device:$('device').value});
            download('trial-'+r.code+'.json',JSON.stringify(r,null,2),'application/json');
            $('done-note').hidden=false;
        }catch(error){msg.textContent=error.message;msg.hidden=false;}
    });
    let loaded=[];
    function showTab(summary){
        $('fill-view').hidden=summary;$('summary-view').hidden=!summary;
        $('tab-fill').toggleAttribute('aria-current',!summary);$('tab-sum').toggleAttribute('aria-current',summary);
        if(summary)$('tab-sum').setAttribute('aria-current','page');else $('tab-fill').setAttribute('aria-current','page');
    }
    $('tab-fill').addEventListener('click',e=>{e.preventDefault();showTab(false);});
    $('tab-sum').addEventListener('click',e=>{e.preventDefault();showTab(true);});
    if(location.hash==='#summary')showTab(true);
    function render(){
        const s=T.summarize(loaded);
        $('summary-result').hidden=!s.n;
        if(!s.n)return;
        $('sum-n').textContent=String(s.n);$('sum-mean').textContent=String(s.mean);$('sum-sd').textContent=s.sd===null?'—':String(s.sd);$('sum-range').textContent=s.min+' – '+s.max;
        $('sum-target').textContent=(s.meetsTarget?'達到':'未達到')+'目標（平均 ≥ '+s.target+'）。n＝'+s.n+'，人數少，只能描述這群人的感受。';
        const rows=$('product-rows');rows.replaceChildren();
        T.PRODUCT_ITEMS.forEach((t,i)=>{const tr=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td');a.textContent=(i+1)+'. '+t;b.textContent=String(s.productMeans[i]);b.className='num';tr.append(a,b);rows.appendChild(tr);});
        const box=$('open-answers');box.replaceChildren();
        T.OPEN_ITEMS.forEach((t,i)=>{
            const h=document.createElement('h4');h.textContent=t;box.appendChild(h);
            if(!s.open[i].length){const p=document.createElement('p');p.className='muted';p.textContent='沒有人填。';box.appendChild(p);}
            for(const a of s.open[i]){const d=document.createElement('div');d.className='answer';d.textContent=a.text;const sm=document.createElement('small');sm.className='muted';sm.textContent=a.code;d.appendChild(sm);box.appendChild(d);}
        });
    }
    $('files').addEventListener('change',async()=>{
        const files=[...$('files').files];
        // an answer file is a few KB; anything much larger is not one
        const texts=await Promise.all(files.map(f=>f.size>200000?Promise.resolve('{"tooLarge":true}'):f.text()));
        const r=T.parseFiles(texts);loaded=r.responses;
        $('summary-message').textContent='讀入 '+files.length+' 個檔案，有效答案 '+r.responses.length+' 份'+(r.skipped.length?'；略過 '+r.skipped.length+' 份（'+r.skipped.map(x=>'第 '+(x.index+1)+' 個檔案：'+x.reason).join('、')+'）':'')+'。';
        render();
    });
    $('csv-btn').addEventListener('click',()=>download('trial-answers.csv',T.toCsv(loaded),'text/csv;charset=utf-8'));
})();
