(function(){
    'use strict';
    const status=document.getElementById('offline-status'),button=document.getElementById('install-app');
    let available=false,promptEvent=null,waiting=false,failed=false;
    function render(){
        status.textContent=(available?(navigator.onLine?'已備妥離線訓練：沒網路也能記錄、回看報告與備份。':'目前離線：可繼續訓練記錄、報告與備份。'):(navigator.onLine?'正在準備離線訓練…':'目前離線；先前若未完成準備，請連線後再開啟本頁。'))+(waiting?' 有新版可用，完成練習後關閉所有訓練頁，再重新開啟即可更新。':'');
        if(failed && !available)status.textContent='離線版本未準備完成，請保持連線稍後再開啟；訓練紀錄仍可下載備份。';
        const installed=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
        button.hidden=!promptEvent || installed;
    }
    window.addEventListener('online',render);window.addEventListener('offline',render);
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;render();});
    window.addEventListener('appinstalled',()=>{promptEvent=null;render();});
    button.addEventListener('click',async()=>{if(!promptEvent)return;const event=promptEvent;promptEvent=null;button.hidden=true;try{await event.prompt();await event.userChoice;}catch{status.textContent='可使用瀏覽器選單加入主畫面。';}});
    if(!('serviceWorker' in navigator) || !window.isSecureContext){status.textContent='目前瀏覽器無法準備離線版本。可繼續連線使用並下載備份。';return;}
    function observe(registration){
        available=!!registration.active;waiting=!!registration.waiting;render();
        const track=()=>{const worker=registration.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'){waiting=!!registration.waiting;render();}else if(worker.state==='redundant'&&!registration.active){failed=true;render();}});};
        registration.addEventListener('updatefound',track);track();
        navigator.serviceWorker.ready.then(()=>{available=true;waiting=!!registration.waiting;render();});
    }
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(observe).catch(async()=>{
        try{const current=await navigator.serviceWorker.getRegistration('./');if(current?.active){observe(current);return;}}catch{}
        status.textContent='離線版本未準備完成，請保持連線稍後再試；訓練紀錄仍可下載備份。';
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{available=!!navigator.serviceWorker.controller;render();});
})();
