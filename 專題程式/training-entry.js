(function() {
    'use strict';
    const params=new URLSearchParams(window.location.search);
    if(params.get('from')!=='training')return;
    const player=params.get('player'),session=params.get('session');
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(player || '') || !/^[A-Za-z0-9_-]{1,80}$/.test(session || ''))return;
    document.getElementById('participant_id').value=player;
    document.getElementById('session_id').value=session;
    document.getElementById('block_id').value='B01';
    document.getElementById('training-context').textContent='已帶入罰球訓練 '+player+' 的本組識別 · 命中請回訓練室記錄，動作資料於此頁另行下載';
})();
