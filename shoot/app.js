(function(){
    'use strict';
    const $=id=>document.getElementById(id);
    const E=ShootEngine,P=ShootPractice,V=ShotVoice,A=TrainingAnalysis;
    const PLAYER_KEY='basketball-shoot-player';
    const REASONS={LOW_FPS:'畫面太慢',LOW_VISIBILITY:'身體看不清楚',RATE_UNAVAILABLE:'畫面速度不明',VISIBILITY_UNAVAILABLE:'身體看不清楚',
        INSUFFICIENT_SAMPLES:'動作太快、畫面不夠',PEAK_AT_WINDOW_END:'出手還沒拍完',ELBOW_ONSET_NOT_FOUND:'看不到手肘開始伸直',
        ELBOW_EXTENSION_NOT_FOUND:'看不到手肘伸直',KNEE_EXTENSION_NOT_FOUND:'看不到膝蓋伸直',POSE_LANDMARKS_MISSING:'身體離開畫面',
        TORSO_VISIBILITY_LOW:'身體看不清楚',NONFINITE_ANGLE:'關節位置不明',NONFINITE_SAMPLE:'關節位置不明',INVALID_TIMESTAMPS:'畫面時間錯亂'};
    const reason=code=>String(code||'').split('|').map(c=>REASONS[c]||c).join('、');
    const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>localStorage.setItem(k,v),remove:k=>{try{localStorage.removeItem(k);}catch{/* ignore */}}};
    const newId=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

    const api=Cloud.connect();
    let user=null,practice=null,detector=null,log=null,madePeaks=[],lastShot=null,running=false;
    let stream=null,pose=null,perf=ShootPerf.createPerfMonitor(),busy=false,frameT=null,tsSource=null,voice=null,wakeLock=null,markTimer=null,retryTimer=null,uploading=null;
    let audioCtx=null,flashTimer=null;

    $('algo-version').textContent=E.ALGORITHM_VERSION;
    function message(text,el='message'){const m=$(el);m.textContent=text||'';m.hidden=!text&&el==='message';}
    function show(view){for(const v of ['setup-view','practice-view','summary-view'])$(v).hidden=v!==view;document.body.classList.toggle('practicing',view==='practice-view');window.scrollTo(0,0);}

    // ---------- audio ----------
    async function ensureAudio(){
        try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state!=='running')await audioCtx.resume();}catch{/* no audio */}
    }
    function beep(freq,dur,type='sine',gain=0.5){
        if(!audioCtx||audioCtx.state!=='running')return;
        const osc=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;
        osc.type=type;osc.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+0.03);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
        osc.connect(g);g.connect(audioCtx.destination);osc.start(t);osc.stop(t+dur);
    }

    // ---------- storage and upload ----------
    function save(){
        try{store.set(P.KEY,JSON.stringify(practice));}catch{message('這支手機的瀏覽器無法儲存，請保持頁面開啟並盡快結束這組。','practice-message');}
        upload();
    }
    function syncLine(text){$('sync-line').textContent=text;}
    // Uploads the whole set; the server rebuilds per-shot rows from it. Safe to repeat.
    function upload(){
        if(!api||!user||!practice)return Promise.resolve(false);
        clearTimeout(retryTimer);
        const snapshot=practice;
        uploading=(uploading||Promise.resolve()).then(async()=>{
            try{
                await api.upsertSessions([Cloud.toRow(P.combined(snapshot),user.id)]);
                if(practice===snapshot)syncLine('已上傳 '+snapshot.session.shots.length+' 球到雲端。');
                return true;
            }catch(error){
                syncLine('暫時無法上傳（'+Cloud.friendlyError(error)+'），紀錄已存在這支手機，恢復連線後會自動補傳。');
                retryTimer=setTimeout(upload,10000);
                return false;
            }
        });
        return uploading;
    }
    window.addEventListener('online',()=>upload());

    async function initCloud(){
        if(!api){$('cloud-pill').textContent='本機';$('cloud-line').textContent='紀錄存在這支手機，結束後會出現在「紀錄」。';return;}
        try{user=await api.currentUser();}catch{user=null;}
        $('cloud-pill').textContent=user?'已登入':'未登入';
        $('cloud-line').innerHTML='';
        const text=document.createTextNode(user?'已登入：每一球會即時上傳，教練端看得到。':'未登入：紀錄先存在這支手機。要上傳或讓隊友幫記，請先到 ');
        $('cloud-line').appendChild(text);
        if(!user){const a=document.createElement('a');a.href='../training/#me';a.textContent='到「我的」登入';$('cloud-line').append(a,'。');}
    }

    // ---------- setup ----------
    function lastPlayerCode(){
        const saved=store.get(PLAYER_KEY);if(saved)return saved;
        try{const t=store.get(P.TRAINING_KEY);if(t){const s=TrainingCore.parseStore(t);return s.active?.playerCode||s.history[0]?.playerCode||'';}}catch{/* ignore */}
        return '';
    }
    // A new player starts without typing anything: a short random code is filled in and can be changed.
    $('player-code').value=lastPlayerCode()||'P'+String(Math.floor(Math.random()*900)+100);
    function settingsLine(){
        const side=document.querySelector('input[name=side]:checked');
        const parts=[$('target-shots').value+' 球',side&&side.value==='left'?'左手':'右手',$('sound-on').checked?'聲音開':'聲音關',$('voice-on').checked?'語音記球':'按鈕記球'];
        if($('video-on').checked)parts.push('錄影');
        $('settings-line').textContent='· '+parts.join(' · ');
        $('setup-line').textContent='罰球 · '+$('target-shots').value+' 球';
    }
    const recorder=ShootRecorder.createRecorder();
    {
        const VIDEO_PREF='bmvp-video-pref';
        if(!recorder.supported()){$('video-on').disabled=true;$('video-on').checked=false;$('video-on').nextElementSibling.querySelector('small').textContent='這個瀏覽器不能錄影。';}
        else{try{$('video-on').checked=localStorage.getItem(VIDEO_PREF)==='1';}catch{/* off */}}
        $('video-on').addEventListener('change',()=>{try{localStorage.setItem(VIDEO_PREF,$('video-on').checked?'1':'0');}catch{/* ignore */}});
    }
    $('setup-form').addEventListener('change',settingsLine);settingsLine();
    if(!V.supported()){$('voice-on').checked=false;$('voice-on').disabled=true;$('voice-on').nextElementSibling.querySelector('small').textContent='這個瀏覽器不支援語音辨識，請用按鈕記錄。';}
    // ---------- camera make/miss (experimental) ----------
    function makeDetector(){return globalThis.BallDetectorOverride||ShootBallDetector.createBallDetector();}
    makeDetector().available().then(ok=>{
        if(!ok)return;
        $('camera-on').disabled=false;$('camera-note').textContent='開始練習後先在畫面上點籃框的左右邊緣；球和籃框都拍進畫面時，球出手後約 2.5 秒自動判斷進或沒進；沒看清楚的球請按進或沒進。每球請間隔約 3 秒。實驗功能，準確度還沒驗證。';
    }).catch(()=>{});
    let rimTaps=[];
    function hoopHint(text){const el=$('hoop-hint');el.textContent=text||'';el.hidden=!text;}
    function startHoopWatch(){
        hoopWatch=null;ballDetector=null;rimTaps=[];hoopHint('');$('rim-btn').hidden=true;
        if(!$('camera-on').checked||$('camera-on').disabled)return;
        ballDetector=makeDetector();hoopWatch=ShootHoopWatch.createHoopWatch();
        $('rim-btn').hidden=false;hoopHint('點籃框的左邊緣，再點右邊緣');
    }
    // The hoop is not detected: the player taps the left and right edge of the rim on the picture.
    document.querySelector('.stage').addEventListener('click',event=>{
        if(!hoopWatch||hoopWatch.hoop()&&rimTaps.length===0)return;
        const v=$('video'),p=ShootLayout.tapToPicture(document.querySelector('.stage').getBoundingClientRect(),v.videoWidth,v.videoHeight,event.clientX,event.clientY);
        if(!p)return;
        rimTaps.push(p);
        if(rimTaps.length<2){hoopHint('再點籃框的右邊緣');return;}
        const rim=ShootLayout.hoopFromTaps(rimTaps[0],rimTaps[1]);rimTaps=[];
        if(!rim){hoopHint('兩點太近了，請重新點籃框的左邊緣和右邊緣');return;}
        hoopWatch.setHoop(rim);hoopHint('');
    });
    $('rim-btn').addEventListener('click',()=>{if(!hoopWatch)return;hoopWatch.setHoop(null);rimTaps=[];hoopHint('點籃框的左邊緣，再點右邊緣');});
    function lookForBall(video,now){
        if(!ballDetector||hoopBusy)return;
        const watching=hoopWatchActive||hoopWatch.hoop()===null;
        if(!watching&&now-lastHoopLook<2000)return;
        hoopBusy=true;lastHoopLook=now;
        ballDetector.detect(video).then(res=>hoopWatch.push(performance.now(),res)).catch(()=>{}).finally(()=>{hoopBusy=false;});
    }
    function settleHoopWatch(){
        if(!hoopWatch)return;
        const r=hoopWatch.finish(performance.now());
        if(!r)return;hoopWatchActive=false;
        if(answeredByPlayer)return; // the player, a voice call or a teammate already answered this shot
        if(r.result==='unknown'){$('last-note').textContent='相機沒看清楚這球（'+r.reason+'），請按進或沒進。';return;}
        handleResult(r.result==='made','camera');
    }
    function loadResume(){
        const saved=store.get(P.KEY);if(!saved)return;
        try{
            const p=P.restore(saved),s=p.session;
            $('resume-text').textContent=s.playerCode+' · '+new Date(s.startedAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' 開始 · 已記 '+s.shots.length+' 球';
            $('resume-card').hidden=false;
            $('resume-btn').onclick=()=>{practice=p;enterPractice();};
            $('resume-finish-btn').onclick=()=>{practice=p;showSummary();};
        }catch{message('上次未結束的紀錄無法讀取，已保留原始資料。開始新的一組會覆蓋它。');}
    }
    $('setup-form').addEventListener('submit',event=>{
        event.preventDefault();
        try{
            const playerCode=$('player-code').value.trim();
            practice=P.newPractice({playerCode,targetShots:Number($('target-shots').value),side:document.querySelector('input[name=side]:checked').value,sound:$('sound-on').checked,id:newId('shoot-')});
            try{store.set(PLAYER_KEY,playerCode);}catch{/* ignore */}
            save();
            enterPractice();
        }catch(error){message(error.message);}
    });

    // ---------- practice ----------
    function linkedMadePeaks(p){
        const byShot=new Map(p.run.trials.filter(t=>t.shotId).map(t=>[t.shotId,t]));
        return p.session.shots.map(s=>s.made&&byShot.get(s.id)).filter(t=>t&&t.trialStatus==='accepted'&&Number.isFinite(t.dtPeak)).map(t=>t.dtPeak);
    }
    async function enterPractice(){
        message('');
        show('practice-view');
        log=E.createResultLog();detector=null;tsSource=null;lastShot=null;
        startHoopWatch();
        madePeaks=[...P.pastMadePeaks(practice.session.playerCode,store.get(P.TRAINING_KEY),store.get(A.KEY)),...linkedMadePeaks(practice)];
        render();
        $('last-note').textContent='站進畫面，下蹲準備投籃';
        // None of these may hold up the camera: some browsers leave audio resume() and the screen-lock request
        // pending forever without a gesture. Audio is asked for synchronously here, inside the tap that started the set.
        ensureAudio();
        voiceStarted=false;   // the microphone is opened after the analysis model answers (see startVoiceOnce)
        try{Promise.resolve(navigator.wakeLock?.request('screen')).then(l=>{wakeLock=l||null;},()=>{wakeLock=null;});}catch{wakeLock=null;}
        if(practice.markCode)openTeammatePanel(practice.markCode);
        await startCamera();
    }
    let voiceStarted=false,modelWatch=null;
    // Speech recognition and the camera analysis compete for the phone while the model is loading, so the microphone
    // is opened after the first analysis result, or at once when no analysis will run, or when the model does not answer.
    function startVoiceOnce(){if(voiceStarted)return;voiceStarted=true;startVoice();}
    // The last script, file or promise failure, shown if the model never answers so a screenshot tells what went wrong.
    let lastProblem='';
    window.addEventListener('error',e=>{lastProblem=e.target&&e.target.src?'檔案載入失敗：'+String(e.target.src).slice(-60):String(e.message||'').slice(0,100);},true);
    window.addEventListener('unhandledrejection',e=>{lastProblem=String((e.reason&&e.reason.message)||e.reason||'').slice(0,100);});
    const MODEL_WAIT_MS=Number(globalThis.__MODEL_WAIT_MS)||30000;   // the override is only for the browser test
    function watchModel(){
        clearTimeout(modelWatch);
        modelWatch=setTimeout(()=>{
            if(!running||$('state-badge').textContent!=='載入分析模型…')return;
            message('分析模型 30 秒內沒有回應。請確認是用 Safari（不是 LINE 或其他 App 內的瀏覽器）、改連 Wi-Fi，再重新整理；這組仍可用按鈕或語音記錄進球。'+(lastProblem?'（最後一個錯誤：'+lastProblem+'）':''),'practice-message');
            startVoiceOnce();
        },MODEL_WAIT_MS);
    }
    let modelComplexity=1,hoopWatch=null,ballDetector=null,hoopBusy=false,lastHoopLook=0,hoopWatchActive=false,answeredByPlayer=false;
    $('lite-btn').addEventListener('click',()=>{modelComplexity=0;pose.setOptions({modelComplexity:0});$('lite-btn').hidden=true;perf=ShootPerf.createPerfMonitor();$('last-note').textContent='已改用較輕的分析模型';});
    function fitStage(){
        const v=$('video'),w=v.videoWidth,h=v.videoHeight,view=$('practice-view');
        view.style.setProperty('--stage-ratio',ShootLayout.stageAspect(w,h));
        view.classList.toggle('portrait',ShootLayout.orientationOf(w,h)==='portrait');
    }
    $('video').addEventListener('loadedmetadata',fitStage);
    $('video').addEventListener('resize',fitStage);
    // MediaPipe draws with WebGL. Without it (some headless or very old browsers) the analysis cannot run, and the
    // player should be told in plain words and still be able to record by hand.
    function webglAvailable(){
        try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch{return false;}
    }
    async function startCamera(){
        running=true;perf=ShootPerf.createPerfMonitor();$('lite-btn').hidden=true;
        try{
            stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:640},height:{ideal:480}},audio:false});
            const video=$('video');video.srcObject=stream;await video.play();
            // Optional: keep this set's video on this phone. A recorder problem never stops the practice.
            if($('video-on').checked&&recorder.supported()&&!recorder.active()){try{recorder.start(stream);}catch{/* practice goes on without a video */}}
            if(!pose&&!webglAvailable()){
                running=false;$('state-badge').textContent='無法分析動作';startVoiceOnce();
                message('這個瀏覽器無法執行動作分析（缺少 WebGL）。請改用手機的 Safari 或 Chrome；這組仍可用按鈕或語音記錄進球。','practice-message');
                return;
            }
            if(!pose){
                $('state-badge').textContent='載入分析模型…';
                pose=new Pose({locateFile:f=>'../專題程式/vendor/mediapipe-pose/'+f});
                pose.setOptions({modelComplexity:modelComplexity,smoothLandmarks:true,minDetectionConfidence:0.7,minTrackingConfidence:0.7});
                pose.onResults(onResults);
                try{Promise.resolve(pose.initialize()).catch(error=>{lastProblem='模型初始化失敗：'+String((error&&error.message)||error).slice(0,100);});}catch(error){lastProblem='模型初始化失敗：'+String((error&&error.message)||error).slice(0,100);}
                watchModel();
            }
            nextFrame();
        }catch(error){
            running=false;
            $('state-badge').textContent='相機未啟動';startVoiceOnce();
            message('無法開啟相機：'+(error?.message||error)+'。仍可用按鈕或語音記錄進球，但這組不會量節奏。','practice-message');
        }
    }
    function nextFrame(){
        const video=$('video');
        if(!running)return;
        if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(onFrame);
        else requestAnimationFrame(()=>onFrame(performance.now(),null));
    }
    // Each frame is timed by its camera presentation time (mediaTime). Without it, the
    // time the frame is handed to pose analysis is used and recorded as such.
    function onFrame(now,meta){
        if(!running)return;
        perf.offered();
        const video=$('video');
        if(hoopWatch){settleHoopWatch();if(hoopWatch.hoop()&&rimTaps.length===0)hoopHint('');if(video.readyState>=2)lookForBall(video,performance.now());}
        if(!busy&&video.readyState>=2&&video.videoWidth){
            const camera=meta&&Number.isFinite(meta.mediaTime)&&meta.mediaTime>0;
            const src=camera?'camera-frame':'pose-result',t=camera?meta.mediaTime*1000:performance.now();
            if(tsSource===null){tsSource=src;detector=E.createDetector({side:practice.run.shootingSide,timestampSource:src});}
            if(src===tsSource){
                busy=true;frameT=t;perf.started(performance.now());
                pose.send({image:video}).catch(error=>{message('動作分析停止，這組仍可用按鈕或語音記錄進球。（原因：'+(error?.message||error)+'）','practice-message');running=false;}).finally(()=>{busy=false;});
            }
        }
        nextFrame();
    }
    const BONES=s=>s==='left'?[[11,13],[13,15],[23,25],[25,27],[11,23]]:[[12,14],[14,16],[24,26],[26,28],[12,24]];
    function draw(landmarks){
        const c=$('overlay'),v=$('video'),ctx=c.getContext('2d');
        if(c.width!==v.videoWidth||c.height!==v.videoHeight){c.width=v.videoWidth||640;c.height=v.videoHeight||480;}
        ctx.clearRect(0,0,c.width,c.height);
        const rim=hoopWatch&&hoopWatch.hoop();
        if(rim){ctx.save();ctx.lineWidth=Math.max(3,c.width/160);ctx.strokeStyle='#da743c';ctx.beginPath();ctx.moveTo((rim.cx-rim.w/2)*c.width,rim.cy*c.height);ctx.lineTo((rim.cx+rim.w/2)*c.width,rim.cy*c.height);ctx.stroke();ctx.restore();}
        if(!landmarks)return;
        ctx.lineWidth=Math.max(3,c.width/160);ctx.strokeStyle='#c9e996';ctx.fillStyle='#da743c';
        for(const [a,b] of BONES(practice.run.shootingSide)){const p=landmarks[a],q=landmarks[b];if(!p||!q)continue;ctx.beginPath();ctx.moveTo(p.x*c.width,p.y*c.height);ctx.lineTo(q.x*c.width,q.y*c.height);ctx.stroke();}
        for(const i of new Set(BONES(practice.run.shootingSide).flat())){const p=landmarks[i];if(!p)continue;ctx.beginPath();ctx.arc(p.x*c.width,p.y*c.height,ctx.lineWidth*1.4,0,7);ctx.fill();}
    }
    const STATES={IDLE:'準備投籃',RECORDING:'擷取動作',PROCESSING:'計算中',DELAY:'計算中',FEEDBACK:'計算中',COOLDOWN:'下一球準備'};
    function onResults(res){
        if(!running||!detector)return;
        perf.finished(performance.now());
        clearTimeout(modelWatch);startVoiceOnce();
        draw(res.poseLandmarks);
        const ev=detector.push({t:frameT,landmarks:res.poseLandmarks||null});
        const badge=$('state-badge');
        badge.textContent=STATES[detector.state]||detector.state;badge.classList.toggle('rec',detector.state==='RECORDING');
        if(detector.fps){const ps=perf.stats();$('fps').textContent=Math.round(detector.fps)+' fps'+(ps.medianMs===null?'':' · 分析 '+ps.medianMs+' ms · 略過 '+ps.dropPct+'%');}
        if(modelComplexity===1&&perf.suggest()==='lite')$('lite-btn').hidden=false;
        const guide=ShootingGuide.check(res.poseLandmarks,practice.run.shootingSide);
        $('guide').textContent=detector.state==='IDLE'?guide.text:detector.hint;
        if(ev)onTrial(ev.trial);
    }
    function onTrial(trial){
        try{
            const r=P.addTrial(practice,trial);
            practice=r.practice;log.trial({...trial,trialOrder:r.trialOrder},Date.now());save();
        }catch(error){message(error.message,'practice-message');return;}
        if(trial.status==='aborted'){$('last-note').textContent='這球中斷了：'+reason(trial.reasonCode);return;}
        if(hoopWatch){hoopWatch.start(performance.now());hoopWatchActive=true;answeredByPlayer=false;}
        // The detector already waits about 1 s after release, as on the research page.
        feedback(trial);
    }
    function drawRhythm(dt,ref){
        const g=ShootGauge.gauge(dt,ref),box=$('rhythm'),text=$('rhythm-text');
        box.hidden=text.hidden=!g;
        if(!g)return;
        const band=box.querySelector('.band'),mark=box.querySelector('.mark');
        band.style.left=g.bandStartPct+'%';band.style.width=(g.bandEndPct-g.bandStartPct)+'%';mark.style.left=g.markerPct+'%';
        box.classList.toggle('off',g.tone==='off');box.classList.toggle('clipped',g.clipped);
        text.textContent='綠色是你進球時的節奏範圍'+(g.side==='inside'?'；這球在範圍內':'；這球'+(g.side==='late'?'偏晚':'偏早'));
    }
    function feedback(trial){
        const dt=$('last-dt');dt.className='';dt.dataset.count=String(Number(dt.dataset.count||0)+1);
        if(trial.status!=='accepted'){dt.textContent='-- ms';$('last-note').textContent='這球沒量到：'+reason(trial.reasonCode);return;}
        const ref=E.personalReference(madePeaks),j=E.judge(trial.dtPeak,ref);
        drawRhythm(trial.dtPeak,ref);
        dt.textContent=Math.round(trial.dtPeak)+' ms';
        const sound=practice.run.condition==='auditory';
        if(j==='steady'){dt.className='steady';$('last-note').textContent='和你進球時的節奏接近（'+ref.low+'–'+ref.high+' ms）';if(sound)beep(800,0.5);}
        else if(j==='off'){
            dt.className='off';const diff=Math.round(trial.dtPeak-ref.mean);
            $('last-note').textContent='手比你進球時'+(diff>0?'晚 ':'早 ')+Math.abs(diff)+' ms';if(sound)beep(150,0.3,'sawtooth');
        }else{$('last-note').textContent='建立個人節奏中：再 '+ref.needed+' 顆有量到的進球';if(sound)beep(600,0.08,'sine',0.25);}
    }
    function handleResult(made,source){
        if(!practice||$('practice-view').hidden)return;
        if(source!=='camera'&&hoopWatchActive)answeredByPlayer=true;
        const r=log.result(made,source,Date.now());
        if(!r.accepted){if(source==='camera')return;message(r.reason==='duplicate'?'這球已經記過了。':'和剛才的紀錄不同，已保留第一筆；結束後可以修正。','practice-message');return;}
        const shotId=newId('s');
        try{practice=P.addResult(practice,{made,source,shotId,trialOrder:r.trial?.trialOrder ?? null});}
        catch(error){message(error.message,'practice-message');return;}
        lastShot={id:shotId,peak:made&&r.trial?.status==='accepted'&&Number.isFinite(r.trial.dtPeak)};
        if(lastShot.peak)madePeaks.push(r.trial.dtPeak);
        flash(made?'進':'沒進');save();
        const full=render();
        message([source==='teammate'?'隊友記錄：'+(made?'進':'沒進')+'。':'',full].join(''),'practice-message');
    }
    function flash(text){const f=$('result-flash');f.textContent=text;f.hidden=false;clearTimeout(flashTimer);flashTimer=setTimeout(()=>{f.hidden=true;},900);}
    function render(){
        const s=practice.session,made=s.shots.filter(x=>x.made).length;
        $('score-made').textContent=made;$('score-total').textContent=s.shots.length;$('score-target').textContent='/ '+s.targetShots+' 球';
        $('score-pct').textContent=s.shots.length?Math.round(made/s.shots.length*100)+'%':'--';
        $('undo-btn').disabled=!lastShot;
        return s.shots.length===s.targetShots?'已投滿 '+s.targetShots+' 球，可以結束這組，也可以繼續投。':'';
    }
    $('made-btn').addEventListener('click',()=>handleResult(true,'manual'));
    $('missed-btn').addEventListener('click',()=>handleResult(false,'manual'));
    $('undo-btn').addEventListener('click',()=>{
        if(!lastShot)return;
        try{practice=P.remove(practice,lastShot.id);if(lastShot.peak)madePeaks.pop();lastShot=null;save();render();message('已取消上一球。','practice-message');}
        catch(error){message(error.message,'practice-message');}
    });

    // ---------- voice ----------
    function startVoice(){
        const line=$('voice-line');
        if(!$('voice-on').checked){line.hidden=true;return;}
        if(!V.supported()){line.hidden=false;line.textContent='這個瀏覽器不支援語音，請用按鈕記錄。';return;}
        line.hidden=false;line.textContent='🎙 正在聽：投完說「進」或「沒進」';
        voice=V.createListener({
            onResult:({made,heard})=>{
                line.textContent='🎙 聽到「'+heard+'」'+(made===null?'：沒聽懂，請說「進」或「沒進」':'');
                if(made!==null)handleResult(made,'voice');
            },
            onState:s=>{if(s==='denied')line.textContent='麥克風權限被拒絕，請用按鈕記錄。';}
        });
        voice?.start();
    }

    // ---------- teammate ----------
    const markUrl=()=>location.href.split(/[?#]/)[0].replace(/[^/]*$/,'')+'mark.html';
    function openTeammatePanel(code){
        $('teammate-panel').hidden=false;$('mark-code').textContent=code;$('mark-url').textContent=markUrl().replace(/^https?:\/\//,'');
        clearInterval(markTimer);markTimer=setInterval(pollMarks,2000);
    }
    async function pollMarks(){
        if(!practice||!api||!user)return;
        try{
            const marks=await api.shotMarks(practice.session.id,practice.lastMarkId);
            for(const m of marks){practice=P.withMarks(practice,m.id);handleResult(m.made,'teammate');}
            if(marks.length)save();
        }catch{/* retried on the next tick */}
    }
    $('teammate-btn').addEventListener('click',async()=>{
        if(!api){message('雲端尚未設定，隊友幫記需要雲端。','practice-message');return;}
        if(!user){message('請先到「我的」登入，才能讓隊友幫記。','practice-message');return;}
        if(practice.markCode){openTeammatePanel(practice.markCode);return;}
        $('teammate-btn').disabled=true;
        try{
            if(!await upload())throw new Error('需要網路才能產生記錄碼');
            const code=await api.openMarkCode(practice.session.id);
            practice={...practice,markCode:code};save();openTeammatePanel(code);
        }catch(error){message(Cloud.friendlyError(error),'practice-message');}
        finally{$('teammate-btn').disabled=false;}
    });

    // ---------- end and summary ----------
    let pendingVideo=null,videoReady=null,videoSettling=false;
    function stopAll(){
        running=false;
        pendingVideo=recorder.active()?recorder.stop():null;
        stream?.getTracks().forEach(t=>t.stop());stream=null;
        clearTimeout(modelWatch);voice?.stop();voice=null;
        clearInterval(markTimer);
        try{wakeLock?.release();}catch{/* ignore */}wakeLock=null;
    }
    $('end-btn').addEventListener('click',()=>{stopAll();showSummary();});
    function showSummary(){
        show('summary-view');
        $('discard-btn').hidden=false;$('discard-btn').textContent='丟掉這組';
        $('keep-video-row').hidden=true;videoReady=null;
        // The save button waits (a moment) until the recorder has handed over the video, so a quick tap cannot lose it.
        videoSettling=!!pendingVideo;
        // A recorder that never answers must not hold the save button: give up on the video after 4 seconds.
        if(pendingVideo)Promise.race([pendingVideo,new Promise(r=>setTimeout(()=>r(null),4000))]).then(v=>{
            videoSettling=false;
            if(practice&&!$('summary-view').hidden&&$('again-btn').dataset.mode==='save')renderSummary();
            if(!v||!practice||$('summary-view').hidden||$('again-btn').dataset.mode!=='save')return;
            videoReady=v;$('keep-video').checked=true;$('keep-video-row').hidden=false;
            $('keep-video-info').textContent=VideoStore.durationText(v.durationMs)+' · '+VideoStore.sizeText(v.blob.size)+'。只存在這支手機，不會上傳。';
        });
        $('sum-save').textContent='';$('again-btn').textContent='儲存這組';$('again-btn').dataset.mode='save';
        renderSummary();
    }
    function renderSummary(){
        const s=E.setSummary(practice.session,practice.run);
        $('summary-title').textContent=s.total?s.made+' / '+s.total+' 進':'這組還沒有記錄任何一球';
        $('sum-pct').textContent=s.percentage===null?'--':Math.round(s.percentage)+'%';
        $('sum-peak').textContent=s.meanPeak ?? '--';$('sum-sd').textContent=s.sdPeak ?? '--';
        const parts=['有量到節奏 '+s.measured+' 球。'];
        if(s.madeMeanPeak!==null&&s.missedMeanPeak!==null)parts.push('進球平均 '+s.madeMeanPeak+' ms，沒進平均 '+s.missedMeanPeak+' ms。');
        if(s.unmatchedTrials)parts.push('另有 '+s.unmatchedTrials+' 次動作沒有對到進球紀錄，不列入。');
        if(!s.measured)parts.push('沒有量到節奏時，命中紀錄仍會保存。');
        $('sum-compare').textContent=parts.join('');
        const list=$('sum-rows');list.replaceChildren();
        const SOURCE={manual:'按鈕',voice:'語音',teammate:'隊友',camera:'相機',corrected:'已修正'};
        for(const r of s.rows){
            const li=document.createElement('li'),n=document.createElement('span'),info=document.createElement('div'),res=document.createElement('span'),meta=document.createElement('span'),btns=document.createElement('div');
            n.textContent='#'+r.order;res.className=r.made?'made-tag':'missed-tag';res.textContent=r.made?'進':'沒進';
            meta.className='meta';meta.textContent=' · '+SOURCE[r.source]+' · '+(r.dtPeak!==null?Math.round(r.dtPeak)+' ms':r.trialStatus==='none'?'沒有動作資料':'沒量到');
            info.append(res,meta);
            const toggle=document.createElement('button');toggle.type='button';toggle.textContent='改成'+(r.made?'沒進':'進');
            toggle.onclick=()=>{practice=P.correct(practice,r.id,!r.made);save();renderSummary();};
            const del=document.createElement('button');del.type='button';del.textContent='刪除';
            del.onclick=()=>{practice=P.remove(practice,r.id);save();renderSummary();};
            btns.append(toggle,del);li.append(n,info,btns);list.appendChild(li);
        }
        $('again-btn').disabled=$('again-btn').dataset.mode==='save'&&(!s.total||videoSettling);
        if(!s.total){
            $('sum-save').textContent='';
            const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='放棄這組';
            back.onclick=()=>{store.remove(P.KEY);practice=null;location.reload();};
            $('sum-save').appendChild(back);
        }
    }
    // Two presses, so a thumb slip cannot throw a set away.
    $('discard-btn').addEventListener('click',()=>{
        if($('discard-btn').textContent==='丟掉這組'){$('discard-btn').textContent='確定丟掉？再按一次';return;}
        store.remove(P.KEY);practice=null;videoReady=null;location.href=location.pathname;
    });
    $('again-btn').addEventListener('click',async()=>{
        if($('again-btn').dataset.mode!=='save'){location.href=location.pathname;return;}
        try{
            const run=practice.run,out=P.finish(practice,store.get(P.TRAINING_KEY),store.get(A.KEY));
            store.set(P.TRAINING_KEY,out.training);store.set(A.KEY,out.analysis);store.remove(P.KEY);
            const finalRun=A.parse(out.analysis).find(r=>r.id===run.id)||run;
            practice={...practice,session:out.session,run:finalRun};
            $('sum-rows').querySelectorAll('button').forEach(b=>{b.disabled=true;});
            let text='已存到這支手機的「紀錄」。';
            if(videoReady&&$('keep-video').checked){
                try{await VideoStore.put(out.session.id,videoReady.blob,{durationMs:videoReady.durationMs});text+=' 影片也存好了。';}
                catch(error){text+=' 影片沒有存成：'+error.message;}
            }
            videoReady=null;$('keep-video-row').hidden=true;
            if(user){text+=(await upload())?' 也已上傳雲端。':' 雲端稍後會自動同步。';}
            $('sum-save').textContent=text;
            $('again-btn').textContent='再投一組';$('again-btn').dataset.mode='again';
            $('discard-btn').hidden=true;
        }catch(error){$('sum-save').textContent=error.message;}
    });
    document.addEventListener('visibilitychange',async()=>{
        if(document.visibilityState==='visible'&&running&&!wakeLock){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{wakeLock=null;}}
    });
    window.addEventListener('pagehide',()=>{if(practice&&!$('practice-view').hidden)try{store.set(P.KEY,JSON.stringify(practice));}catch{/* ignore */}});

    loadResume();
    initCloud();
    // For browser checks only.
    window.ShootApp={handleResult,onTrial,stopCamera(){running=false;stream?.getTracks().forEach(t=>t.stop());},get practice(){return practice;},hoop(){return hoopWatch?hoopWatch.hoop():null;}};
})();
