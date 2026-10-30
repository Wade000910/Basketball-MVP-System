(function() {
    'use strict';
    const params=new URLSearchParams(window.location.search);
    const token=()=>globalThis.crypto.randomUUID();
    document.getElementById('participant_id').value='P'+token().replaceAll('-','').slice(0,8);
    document.getElementById('session_id').value=token();
    document.getElementById('block_id').value='B01';
    if(params.get('from')!=='training')return;
    const player=params.get('player'),session=params.get('session');
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(player || '') || !/^[A-Za-z0-9_-]{1,80}$/.test(session || ''))return;
    document.getElementById('participant_id').value=player;
    document.getElementById('session_id').value=session;
    document.getElementById('block_id').value='B01';
    document.getElementById('participant_id').readOnly=true;
    document.getElementById('session_id').readOnly=true;
    document.getElementById('training-context').textContent='已連結 '+player+' 的罰球訓練 · 停止分析後，回訓練室查看本組動作摘要';
})();
