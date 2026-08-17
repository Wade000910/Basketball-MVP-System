(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SessionCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const VIDEO_TYPES = [
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];

    function cleanSegment(value, fallback) {
        const cleaned = String(value || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        return cleaned || fallback;
    }

    function selectMimeType(MediaRecorderClass) {
        if (!MediaRecorderClass) return '';
        if (typeof MediaRecorderClass.isTypeSupported !== 'function') return '';
        return VIDEO_TYPES.find(type => MediaRecorderClass.isTypeSupported(type)) || '';
    }

    function extensionForMime(mimeType) {
        return String(mimeType || '').toLowerCase().includes('mp4') ? 'mp4' : 'webm';
    }

    function escapeCsv(value) {
        if (value === null || value === undefined) return '';
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function rowsToCsv(rows, columns) {
        return [columns.join(','), ...rows.map(row => columns.map(column => escapeCsv(row[column])).join(','))].join('\n');
    }

    function textBlob(text, type) {
        return new Blob([text], {type});
    }

    function sanitizeCameraSettings(settings = {}) {
        const allowed = ['width','height','frameRate','facingMode','aspectRatio','resizeMode'];
        return Object.fromEntries(allowed.filter(key => settings[key] !== undefined).map(key => [key,settings[key]]));
    }

    class LocalSessionCapture {
        constructor(options = {}) {
            this.MediaRecorderClass = options.MediaRecorderClass || globalThis.MediaRecorder;
            this.nowIso = options.nowIso || (() => new Date().toISOString());
            this.nowPerf = options.nowPerf || (() => performance.now());
            this.reset();
        }

        reset() {
            this.status = 'idle';
            this.context = null;
            this.recorder = null;
            this.videoChunks = [];
            this.presentedFrames = [];
            this.inferences = [];
            this.landmarks = [];
            this.signals = [];
            this.trials = [];
            this.outputs = null;
            this.downloaded = new Set();
            this.stopPromise = null;
            this.stopResolve = null;
            this.recordingError = null;
        }

        start({stream, context, buildId, algorithmVersion, requestedCameraSettings}) {
            if (this.status === 'recording') throw new Error('A session is already recording.');
            if (!stream || typeof stream.getVideoTracks !== 'function' || !stream.getVideoTracks().length) throw new Error('A live video stream is required.');
            if (!context?.participantId || !context?.sessionId || !context?.blockId || !context?.condition || !context?.shootingSide) throw new Error('Complete session metadata is required.');
            if (!this.MediaRecorderClass) throw new Error('MediaRecorder is unavailable in this browser.');

            this.reset();
            const mimeType = selectMimeType(this.MediaRecorderClass);
            const options = mimeType ? {mimeType} : undefined;
            this.recorder = options ? new this.MediaRecorderClass(stream, options) : new this.MediaRecorderClass(stream);
            this.context = Object.freeze({...context});
            this.buildId = buildId;
            this.algorithmVersion = algorithmVersion;
            this.requestedCameraSettings = {...requestedCameraSettings};
            this.startedAt = this.nowIso();
            this.startedPerfMs = this.nowPerf();
            this.stopPromise = new Promise(resolve => { this.stopResolve = resolve; });
            this.recorder.addEventListener('dataavailable', event => { if (event.data && event.data.size) this.videoChunks.push(event.data); });
            this.recorder.addEventListener('error', event => { this.recordingError = event.error?.message || 'MediaRecorder error'; });
            this.recorder.addEventListener('stop', () => this.stopResolve());
            try {
                this.recorder.start(1000);
                this.status = 'recording';
            } catch (error) {
                this.status = 'idle';
                this.recorder = null;
                throw error;
            }
            return {mimeType: this.recorder.mimeType || mimeType || 'video/webm'};
        }

        recordPresentedFrame(row) {
            if (this.status !== 'recording') return null;
            const item = {frameIndex:this.presentedFrames.length + 1, ...row};
            this.presentedFrames.push(item);
            return item.frameIndex;
        }

        beginInference(row) {
            if (this.status !== 'recording') return null;
            const item = {processedFrameIndex:this.inferences.length + 1, inferenceStartPerfMs:this.nowPerf(), inferenceEndPerfMs:null, inferenceDurationMs:null, status:'pending', errorMessage:null, ...row};
            this.inferences.push(item);
            return item;
        }

        completeInference(item, endPerfMs = this.nowPerf()) {
            if (!item) return;
            item.inferenceEndPerfMs = endPerfMs;
            item.inferenceDurationMs = endPerfMs - item.inferenceStartPerfMs;
            item.status = 'succeeded';
        }

        failInference(item, error, endPerfMs = this.nowPerf()) {
            if (!item) return;
            item.inferenceEndPerfMs = endPerfMs;
            item.inferenceDurationMs = endPerfMs - item.inferenceStartPerfMs;
            item.status = 'failed';
            item.errorMessage = String(error?.message || error || 'Unknown analysis error').slice(0, 200);
        }

        recordLandmarks(inference, landmarks) {
            if (this.status !== 'recording' || !inference || !Array.isArray(landmarks)) return;
            landmarks.forEach((landmark, landmarkIndex) => this.landmarks.push({
                processedFrameIndex:inference.processedFrameIndex,
                sourceTimestampMs:inference.sourceTimestampMs,
                landmarkIndex,
                x:landmark.x,
                y:landmark.y,
                z:landmark.z,
                visibility:landmark.visibility
            }));
        }

        recordSignal(inference, signal) {
            if (this.status !== 'recording' || !inference) return;
            this.signals.push({processedFrameIndex:inference.processedFrameIndex, sourceTimestampMs:inference.sourceTimestampMs, ...signal});
        }

        recordTrial(row) {
            if (this.status === 'recording') this.trials.push({...row});
        }

        async stop({diagnostics, actualCameraSettings} = {}) {
            if (this.status !== 'recording') throw new Error('No active session.');
            this.stoppedAt = this.nowIso();
            this.stoppedPerfMs = this.nowPerf();
            this.status = 'stopping';
            if (this.recorder.state !== 'inactive') this.recorder.stop();
            await this.stopPromise;
            this.status = 'stopped';
            this.outputs = this.buildOutputs(diagnostics, actualCameraSettings);
            return this.outputs;
        }

        buildOutputs(diagnostics, actualCameraSettings) {
            const base = `session-${cleanSegment(this.context.participantId, 'TEST')}-${cleanSegment(this.context.sessionId, 'S01')}-${cleanSegment(this.context.blockId, 'B01')}`;
            const videoType = this.recorder.mimeType || this.videoChunks[0]?.type || 'video/webm';
            const files = {};
            files[`${base}_source-video.${extensionForMime(videoType)}`] = new Blob(this.videoChunks, {type:videoType});
            files[`${base}_frame-timestamps.csv`] = textBlob(rowsToCsv(this.presentedFrames, ['frameIndex','sourceTimestampMs','timestampSource','rawMediaTimeMs','videoCurrentTimeMs','callbackPerfMs','expectedDisplayPerfMs','width','height']), 'text/csv;charset=utf-8');
            files[`${base}_inference-timestamps.csv`] = textBlob(rowsToCsv(this.inferences, ['processedFrameIndex','sourceTimestampMs','presentedFrameIndex','inferenceStartPerfMs','inferenceEndPerfMs','inferenceDurationMs','status','errorMessage']), 'text/csv;charset=utf-8');
            files[`${base}_landmarks.csv`] = textBlob(rowsToCsv(this.landmarks, ['processedFrameIndex','sourceTimestampMs','landmarkIndex','x','y','z','visibility']), 'text/csv;charset=utf-8');
            files[`${base}_live-signals.csv`] = textBlob(rowsToCsv(this.signals, ['processedFrameIndex','sourceTimestampMs','shootingSide','rawElbowDeg','rawKneeDeg','filteredElbowDeg','filteredKneeDeg','sideVisibility','state']), 'text/csv;charset=utf-8');
            files[`${base}_live-trials.csv`] = textBlob(rowsToCsv(this.trials, ['id','participantId','sessionId','blockId','condition','trialOrder','timestamp','shootingSide','trialStatus','reasonCode','dt','result','sourceFrameCount','measuredFps','meanVisibility','qualityFlags','algorithmVersion','targetRangeMs']), 'text/csv;charset=utf-8');
            files[`${base}_diagnostics.json`] = textBlob(JSON.stringify(diagnostics || {}, null, 2), 'application/json');
            const manifestName = `${base}_manifest.json`;
            const manifest = {
                schemaVersion:'phase1a-local-session-v1',
                localOnly:true,
                context:this.context,
                startedAt:this.startedAt,
                stoppedAt:this.stoppedAt,
                durationMs:this.stoppedPerfMs - this.startedPerfMs,
                buildId:this.buildId,
                algorithmVersion:this.algorithmVersion,
                requestedCameraSettings:sanitizeCameraSettings(this.requestedCameraSettings),
                actualCameraSettings:sanitizeCameraSettings(actualCameraSettings),
                videoMimeType:videoType,
                recordingError:this.recordingError,
                counts:{
                    presentedFrames:this.presentedFrames.length,
                    inferenceAttempts:this.inferences.length,
                    processedFrames:this.inferences.filter(row => row.status === 'succeeded').length,
                    failedInferences:this.inferences.filter(row => row.status === 'failed').length,
                    landmarkRows:this.landmarks.length,
                    signalRows:this.signals.length,
                    trials:this.trials.length
                },
                files:Object.entries(files).map(([name, blob]) => ({name,sizeBytes:blob.size,type:blob.type})).concat({name:manifestName,type:'application/json'})
            };
            files[manifestName] = textBlob(JSON.stringify(manifest, null, 2), 'application/json');
            return files;
        }

        markDownloaded(name) { if (this.outputs?.[name]) this.downloaded.add(name); }
        hasUnsavedData() { return this.status === 'recording' || this.status === 'stopping' || Boolean(this.outputs && this.downloaded.size < Object.keys(this.outputs).length); }
    }

    return {LocalSessionCapture, cleanSegment, selectMimeType, extensionForMime, rowsToCsv, sanitizeCameraSettings};
});
