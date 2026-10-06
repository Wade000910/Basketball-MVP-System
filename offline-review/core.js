(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OfflineReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    const SCHEMA = 'phase1a-local-session-v1';
    const tables = {
        frames: ['_frame-timestamps.csv', 'presentedFrames', ['frameIndex','sourceTimestampMs','timestampSource','width','height']],
        inferences: ['_inference-timestamps.csv', 'inferenceAttempts', ['processedFrameIndex','sourceTimestampMs','presentedFrameIndex','status']],
        landmarks: ['_landmarks.csv', 'landmarkRows', ['processedFrameIndex','sourceTimestampMs','landmarkIndex','x','y','z','visibility']],
        signals: ['_live-signals.csv', 'signalRows', ['processedFrameIndex','sourceTimestampMs','rawElbowDeg','rawKneeDeg','filteredElbowDeg','filteredKneeDeg','sideVisibility','state']],
        trials: ['_live-trials.csv', 'trials', ['id','participantId','sessionId','blockId','condition','dt','trialStatus','qualityFlags']]
    };
    function fail(message) { throw new Error(message); }
    function number(value, name, optional = false) {
        if ((typeof value === 'string' && value.trim() === '') || value === null || value === undefined) {
            if (optional) return null;
            fail(`${name} 缺少數值`);
        }
        if (typeof value !== 'number' && typeof value !== 'string') fail(`${name} 不是有效數值`);
        if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) fail(`${name} 不是有效數值`);
        const result = Number(value);
        if (!Number.isFinite(result)) fail(`${name} 不是有效數值`);
        return result;
    }
    function integer(value, name, min = 0) {
        const result = number(value, name);
        if (!Number.isSafeInteger(result) || result < min) fail(`${name} 不是有效整數`);
        return result;
    }
    function parseCsv(text) {
        const rows = []; let row = [], field = '', quoted = false, closed = false;
        text = String(text).replace(/^\uFEFF/, '');
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
                else if (c === '"') { quoted = false; closed = true; }
                else field += c;
            } else if (c === ',' || c === '\n' || c === '\r') {
                row.push(field); field = ''; closed = false;
                if (c !== ',') {
                    rows.push(row); row = [];
                    if (c === '\r' && text[i+1] === '\n') i++;
                }
            } else if (c === '"' && field === '' && !closed) quoted = true;
            else { if (closed || c === '"') fail('CSV 引號格式錯誤'); field += c; }
        }
        if (quoted) fail('CSV 引號未結束');
        if (field !== '' || row.length || closed) { row.push(field); rows.push(row); }
        if (!rows.length) fail('CSV 沒有欄位名稱');
        const headers = rows.shift();
        if (headers.some(h => !h) || new Set(headers).size !== headers.length) fail('CSV 欄位名稱空白或重複');
        return {headers, rows:rows.map(cells => {
            if (cells.length !== headers.length) fail('CSV 欄位數不一致');
            return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
        })};
    }
    function uniqueIndex(rows, key) {
        const map = new Map();
        for (const row of rows) {
            row[key] = integer(row[key], key, 1);
            if (map.has(row[key])) fail(`${key} 重複`);
            map.set(row[key], row);
        }
        return map;
    }
    function chronology(rows, key, strict) {
        let last = -Infinity;
        for (const row of rows) {
            row[key] = number(row[key], key);
            if (row[key] < 0 || row[key] < last || (strict && row[key] === last)) fail(`${key} 時間順序錯誤`);
            last = row[key];
        }
    }
    async function readSession(fileList) {
        const files = new Map();
        for (const file of fileList) {
            if (files.has(file.name)) fail('選取的檔案名稱重複');
            files.set(file.name, file);
        }
        const manifestFiles = [...files.values()].filter(f => f.name.endsWith('_manifest.json'));
        if (manifestFiles.length !== 1) fail('請一次選取一組完整 Session，包含一份 manifest');
        const manifestFile = manifestFiles[0];
        const manifest = JSON.parse(await manifestFile.text());
        if (manifest.schemaVersion !== SCHEMA) fail('不支援的 Session 格式');
        const prefix = manifestFile.name.slice(0, -'_manifest.json'.length);
        const expected = [manifestFile.name, `${prefix}_diagnostics.json`, ...Object.values(tables).map(t => prefix+t[0])];
        if (!Array.isArray(manifest.files) || manifest.files.length !== 8) fail('manifest 檔案清單不完整');
        const videos = manifest.files.filter(f => f.name === `${prefix}_source-video.mp4` || f.name === `${prefix}_source-video.webm`);
        if (videos.length !== 1) fail('manifest 必須有一份來源影片');
        expected.push(videos[0].name);
        if (files.size !== 8 || new Set(manifest.files.map(f=>f.name)).size !== 8) fail('請選取同一組八份檔案');
        for (const entry of manifest.files) {
            if (!expected.includes(entry.name) || !files.has(entry.name)) fail('檔案名稱不符合 manifest');
            if (entry.name !== manifestFile.name && integer(entry.sizeBytes, 'sizeBytes') !== files.get(entry.name).size) fail(`檔案大小不符：${entry.name}`);
        }
        for (const key of ['participantId','sessionId','blockId','condition','shootingSide']) {
            if (typeof manifest.context?.[key] !== 'string' || !manifest.context[key]) fail('Session 基本資料缺漏');
        }
        if (manifest.recordingError) fail('manifest 記錄錄影錯誤，請先檢查原始資料');
        JSON.parse(await files.get(`${prefix}_diagnostics.json`).text());
        const data = {};
        for (const [key, [suffix, countKey, required]] of Object.entries(tables)) {
            const parsed = parseCsv(await files.get(prefix+suffix).text());
            if (required.some(h=>!parsed.headers.includes(h))) fail(`${key} 缺少必要欄位`);
            if (parsed.rows.length !== integer(manifest.counts?.[countKey], countKey)) fail(`${key} 筆數與 manifest 不符`);
            data[key] = parsed.rows;
        }
        if (!data.frames.length) fail('沒有來源影格記錄');
        const framesById = uniqueIndex(data.frames, 'frameIndex');
        chronology(data.frames, 'sourceTimestampMs', true);
        for (const f of data.frames) { f.width = integer(f.width,'width',1); f.height = integer(f.height,'height',1); }
        const inferencesById = uniqueIndex(data.inferences, 'processedFrameIndex');
        chronology(data.inferences, 'sourceTimestampMs', false);
        let succeeded = 0, failed = 0;
        const samples = new Map();
        for (const inf of data.inferences) {
            inf.presentedFrameIndex = integer(inf.presentedFrameIndex,'presentedFrameIndex',1);
            if (!framesById.has(inf.presentedFrameIndex)) fail('分析引用不存在的來源影格');
            if (!['succeeded','failed'].includes(inf.status)) fail('分析狀態未完成');
            if (inf.status === 'succeeded') succeeded++; else failed++;
            samples.set(inf.processedFrameIndex, {inference:inf, landmarks:[], signal:null});
        }
        if (succeeded !== integer(manifest.counts.processedFrames,'processedFrames') || failed !== integer(manifest.counts.failedInferences,'failedInferences')) fail('分析成功／失敗筆數不符');
        const landmarkKeys = new Set();
        for (const lm of data.landmarks) {
            lm.processedFrameIndex = integer(lm.processedFrameIndex,'processedFrameIndex',1);
            lm.sourceTimestampMs = number(lm.sourceTimestampMs,'sourceTimestampMs');
            const inf = inferencesById.get(lm.processedFrameIndex);
            if (!inf || inf.status !== 'succeeded' || inf.sourceTimestampMs !== lm.sourceTimestampMs) fail('骨架與分析記錄不匹配');
            lm.landmarkIndex = integer(lm.landmarkIndex,'landmarkIndex');
            if (lm.landmarkIndex > 32) fail('不支援的關鍵點編號');
            const key = `${lm.processedFrameIndex}:${lm.landmarkIndex}`;
            if (landmarkKeys.has(key)) fail('骨架關鍵點重複'); landmarkKeys.add(key);
            for (const n of ['x','y','z']) lm[n] = number(lm[n],n);
            lm.visibility = number(lm.visibility,'visibility',true);
            if (lm.visibility !== null && (lm.visibility < 0 || lm.visibility > 1)) fail('關鍵點可見度超出範圍');
            samples.get(lm.processedFrameIndex).landmarks.push(lm);
        }
        for (const sig of data.signals) {
            sig.processedFrameIndex = integer(sig.processedFrameIndex,'processedFrameIndex',1);
            sig.sourceTimestampMs = number(sig.sourceTimestampMs,'sourceTimestampMs');
            const inf = inferencesById.get(sig.processedFrameIndex);
            if (!inf || inf.status !== 'succeeded' || inf.sourceTimestampMs !== sig.sourceTimestampMs) fail('訊號與分析記錄不匹配');
            const sample = samples.get(sig.processedFrameIndex);
            if (sample.signal) fail('訊號記錄重複');
            for (const n of ['rawElbowDeg','rawKneeDeg','filteredElbowDeg','filteredKneeDeg','sideVisibility']) sig[n] = number(sig[n],n,true);
            sample.signal = sig;
        }
        uniqueIndex(data.trials,'id');
        for (const trial of data.trials) {
            for (const k of ['participantId','sessionId','blockId','condition']) if (trial[k] !== manifest.context[k]) fail('試次屬於不同 Session 或條件');
            trial.dt = number(trial.dt,'dt',true);
        }
        const byFrame = new Map();
        for (const sample of samples.values()) {
            const id = sample.inference.presentedFrameIndex;
            if (!byFrame.has(id)) byFrame.set(id, []);
            byFrame.get(id).push(sample);
        }
        return {manifest, manifestName:manifestFile.name, prefix, video:files.get(videos[0].name), ...data, byFrame};
    }
    function mappedTime(sourceMs, anchorSourceMs, anchorVideoMs, durationMs) {
        const time = number(sourceMs,'source time') - number(anchorSourceMs,'anchor source') + number(anchorVideoMs,'anchor video');
        const duration = number(durationMs,'duration');
        return time < 0 || time > duration ? null : time;
    }
    function sampleForFrame(session, frame, toleranceMs) {
        const tolerance = number(toleranceMs,'tolerance');
        if (tolerance < 0) fail('時間容許範圍不可為負');
        const candidates = session.byFrame.get(frame.frameIndex) || [];
        let sample=null, distance=Infinity;
        for (const s of candidates) {
            const d=Math.abs(s.inference.sourceTimestampMs-frame.sourceTimestampMs);
            if(s.inference.status==='succeeded' && d<distance) {sample=s;distance=d;}
        }
        return sample && Math.abs(sample.inference.sourceTimestampMs-frame.sourceTimestampMs) <= tolerance ? sample : null;
    }
    function nearestFrameIndex(frames, sourceMs) {
        sourceMs=number(sourceMs,'source time');
        if(!frames.length || sourceMs<frames[0].sourceTimestampMs || sourceMs>frames.at(-1).sourceTimestampMs)return null;
        let lo=0,hi=frames.length-1;
        while(lo<hi){const mid=Math.floor((lo+hi)/2);if(frames[mid].sourceTimestampMs<sourceMs)lo=mid+1;else hi=mid;}
        return lo>0 && sourceMs-frames[lo-1].sourceTimestampMs<=frames[lo].sourceTimestampMs-sourceMs ? lo-1:lo;
    }
    class Annotations {
        constructor(session) { this.session = session; this.rows = new Map(); this.history=[];this.future=[]; }
        change(key,next) {
            this.history.push({key,before:this.rows.get(key)||null,after:next});this.future=[];
            if(next)this.rows.set(key,next);else this.rows.delete(key);
        }
        mark(trialId, event, frame, alignment, evidence = {}) {
            if (!this.session.trials.some(t=>t.id === trialId)) fail('請選擇有效試次');
            if (!['knee_peak','elbow_onset','release'].includes(event)) fail('不支援的事件');
            if (!this.session.frames.includes(frame)) fail('影格不屬於這組資料');
            if (!alignment?.confirmed) fail('請先確認影片與來源時間對齊');
            const row={trialId,event,sourceFrameIndex:frame.frameIndex,sourceTimestampMs:frame.sourceTimestampMs};
            if(evidence.videoTimeMs!==undefined)row.videoTimeMs=number(evidence.videoTimeMs,'video time');
            if(evidence.displayedMediaTimeMs!==undefined)row.displayedMediaTimeMs=number(evidence.displayedMediaTimeMs,'displayed time',true);
            if(evidence.algorithmVisible!==undefined){if(typeof evidence.algorithmVisible!=='boolean')fail('顯示模式不是布林值');row.algorithmVisible=evidence.algorithmVisible;}
            this.change(`${trialId}:${event}`,row);
        }
        remove(trialId,event) {const key=`${trialId}:${event}`;if(this.rows.has(key))this.change(key,null);}
        undo() {const action=this.history.pop();if(!action)return null;if(action.before)this.rows.set(action.key,action.before);else this.rows.delete(action.key);this.future.push(action);return action;}
        redo() {const action=this.future.pop();if(!action)return null;if(action.after)this.rows.set(action.key,action.after);else this.rows.delete(action.key);this.history.push(action);return action;}
        forTrial(trialId) { return [...this.rows.values()].filter(r=>r.trialId === trialId); }
        delta(trialId) {
            const k = this.rows.get(`${trialId}:knee_peak`), e = this.rows.get(`${trialId}:elbow_onset`);
            return k && e ? e.sourceTimestampMs-k.sourceTimestampMs : null;
        }
        export(alignment, blind) {
            return {schemaVersion:'offline-review-annotations-v1',sourceManifest:this.session.manifestName,
                context:this.session.manifest.context,buildId:this.session.manifest.buildId,algorithmVersion:this.session.manifest.algorithmVersion,
                sourceFiles:this.session.manifest.files.map(f=>({name:f.name,...(f.sizeBytes===undefined?{}:{sizeBytes:f.sizeBytes})})),
                alignment:{...alignment},annotationMode:blind && ![...this.rows.values()].some(r=>r.algorithmVisible===true)?'algorithm-hidden':'assisted',
                signConvention:'elbow_onset_source_ms - knee_peak_source_ms',
                association:'trial chosen manually; source trial event boundaries are not exported',
                timingValidation:{validated:false,model:'single-anchor-offset',driftChecked:false,uncertaintyMs:null},
                annotations:[...this.rows.values()],comparison:this.session.trials.map(t=>({trialId:t.id,manualDeltaTMs:this.delta(t.id),
                    ...(blind?{}:{liveDeltaTMs:t.dt,differenceMs:this.delta(t.id) === null || t.dt === null ? null:this.delta(t.id)-t.dt})}))};
        }
    }
    function restoreAnnotations(session,input,durationMs) {
        if(input.schemaVersion!=='offline-review-annotations-v1' || input.sourceManifest!==session.manifestName)fail('標記檔不屬於這份 Session');
        for(const k of ['participantId','sessionId','blockId','condition','shootingSide'])if(input.context?.[k]!==session.manifest.context[k])fail('標記檔 Session 或條件不符');
        if(input.buildId!==session.manifest.buildId || input.algorithmVersion!==session.manifest.algorithmVersion)fail('標記檔版本不符');
        if(input.signConvention!=='elbow_onset_source_ms - knee_peak_source_ms')fail('標記檔正負方向不符');
        if(!['algorithm-hidden','assisted'].includes(input.annotationMode))fail('標記模式不符');
        if(!Array.isArray(input.sourceFiles) || input.sourceFiles.length!==session.manifest.files.length)fail('標記檔缺少來源清單');
        const inputs=new Map(input.sourceFiles.map(f=>[f.name,f.sizeBytes]));
        if(inputs.size!==session.manifest.files.length || session.manifest.files.some(f=>!inputs.has(f.name)||inputs.get(f.name)!==f.sizeBytes))fail('標記檔來源清單不符');
        const a=input.alignment;
        if(a?.confirmed!==true || a.method!=='user-selected-correspondence')fail('標記檔未確認對齊');
        const alignment={confirmed:true,method:a.method,anchorSourceMs:number(a.anchorSourceMs,'anchorSourceMs'),anchorVideoMs:number(a.anchorVideoMs,'anchorVideoMs')};
        if(!session.frames.some(f=>f.sourceTimestampMs===alignment.anchorSourceMs) || alignment.anchorVideoMs<0 || alignment.anchorVideoMs>durationMs)fail('對齊點超出來源或影片範圍');
        if(!Array.isArray(input.annotations))fail('標記資料缺漏');
        const result=new Annotations(session),seen=new Set();
        for(const row of input.annotations){
            const trial=integer(row.trialId,'trialId',1),key=`${trial}:${row.event}`;
            if(seen.has(key))fail('標記重複');seen.add(key);
            const frame=session.frames.find(f=>f.frameIndex===row.sourceFrameIndex);
            if(!frame || frame.sourceTimestampMs!==row.sourceTimestampMs)fail('標記影格與時間不符');
            if(mappedTime(frame.sourceTimestampMs,alignment.anchorSourceMs,alignment.anchorVideoMs,durationMs)===null)fail('標記超出影片範圍');
            for(const k of ['videoTimeMs','displayedMediaTimeMs'])if(row[k]!==undefined && row[k]!==null && (number(row[k],k)<0 || number(row[k],k)>durationMs))fail('標記影片時間超出範圍');
            result.mark(trial,row.event,frame,alignment,row);
        }
        result.history=[];result.future=[];
        return {notes:result,alignment,assisted:input.annotationMode==='assisted' || input.annotations.some(r=>r.algorithmVisible===true)};
    }
    return {parseCsv,readSession,mappedTime,sampleForFrame,nearestFrameIndex,Annotations,restoreAnnotations};
});
