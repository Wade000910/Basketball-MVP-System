(function(){
    'use strict';
    const $=id=>document.getElementById(id);
    const api=Cloud.connect();
    let code='',count=0,sending=false;
    function message(text){$('message').textContent=text||'';$('message').hidden=!text;}
    const clean=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    function use(c){code=c;$('code-label').textContent=c;$('code-form').hidden=true;$('mark-panel').hidden=false;history.replaceState(null,'','?code='+c);}
    if(!api){message('雲端尚未設定，無法幫記。');$('code-form').querySelector('button').disabled=true;}
    const fromUrl=clean(new URLSearchParams(location.search).get('code'));
    if(fromUrl.length===6)use(fromUrl);
    $('code-form').addEventListener('submit',e=>{e.preventDefault();const c=clean($('code').value);if(c.length!==6){message('記錄碼是 6 個字元。');return;}message('');use(c);});
    $('change-code').addEventListener('click',()=>{$('mark-panel').hidden=true;$('code-form').hidden=false;$('code').value='';});
    async function send(made){
        if(sending||!api)return;
        sending=true;$('made').disabled=$('missed').disabled=true;
        try{
            await api.addShotMark(code,made);
            count++;message('');
            $('sent').textContent='已送出第 '+count+' 筆：'+(made?'進':'沒進')+'（'+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'）';
        }catch(error){message(Cloud.friendlyError(error));}
        finally{sending=false;setTimeout(()=>{$('made').disabled=$('missed').disabled=false;},600);}
    }
    $('made').addEventListener('click',()=>send(true));
    $('missed').addEventListener('click',()=>send(false));
})();
