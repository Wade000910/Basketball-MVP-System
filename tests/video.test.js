// Practice video: choosing a format, keeping only the newest videos, the recorder's life cycle, and how sizes read.
const test = require('node:test');
const assert = require('node:assert/strict');
const VideoStore = require('../shared/video-store.js');
const Recorder = require('../shoot/recorder.js');

test('the first format the browser supports wins, mp4 before webm', () => {
    assert.equal(Recorder.pickMime(t => /mp4/.test(t) && !/avc1/.test(t)), 'video/mp4');
    assert.equal(Recorder.pickMime(t => t === 'video/webm'), 'video/webm');
    assert.equal(Recorder.pickMime(() => false), '');
    assert.equal(Recorder.pickMime(undefined), '');
    assert.equal(Recorder.pickMime(() => { throw new Error('boom'); }), '');
});

test('only the newest videos are kept', () => {
    const list = [{id: 'a', savedAt: 1}, {id: 'b', savedAt: 5}, {id: 'c', savedAt: 3}, {id: 'd', savedAt: 9}];
    assert.deepEqual(VideoStore.overflow(list, 2), ['c', 'a']);
    assert.deepEqual(VideoStore.overflow(list, 4), []);
    assert.deepEqual(VideoStore.overflow(list, 0), ['d', 'b', 'c', 'a']);
    assert.deepEqual(VideoStore.overflow([], 3), []);
    assert.equal(VideoStore.MAX_VIDEOS, 12);
});

test('sizes and lengths read plainly', () => {
    assert.equal(VideoStore.sizeText(8.4 * 1048576), '8.4 MB');
    assert.equal(VideoStore.sizeText(2048), '2 KB');
    assert.equal(VideoStore.sizeText(10), '1 KB');
    assert.equal(VideoStore.sizeText(-1), '');
    assert.equal(VideoStore.durationText(155000), '2:35');
    assert.equal(VideoStore.durationText(5000), '0:05');
    assert.equal(VideoStore.durationText(-3), '0:00');
});

function fakeMR({emit = true} = {}) {
    return class FakeMR {
        static isTypeSupported(t) { return t === 'video/webm'; }
        constructor(stream, opts) { this.opts = opts; this.state = 'inactive'; this.mimeType = opts.mimeType; this.l = {}; FakeMR.last = this; }
        addEventListener(n, f) { this.l[n] = f; }
        start() { this.state = 'recording'; if (emit) this.l.dataavailable({data: new Blob(['x'.repeat(100)])}); }
        stop() { this.state = 'inactive'; this.l.stop(); }
    };
}

test('the recorder returns the video with its length when stopped', async () => {
    let t = 1000; const r = Recorder.createRecorder({MediaRecorderClass: fakeMR(), now: () => t});
    assert.equal(r.supported(), true);
    r.start({});
    assert.equal(r.active(), true);
    t = 6500;
    const out = await r.stop();
    assert.equal(out.durationMs, 5500);
    assert.equal(out.blob.size, 100);
    assert.equal(r.active(), false);
});

test('a recording with no data, or no recorder at all, gives null and never throws', async () => {
    const empty = Recorder.createRecorder({MediaRecorderClass: fakeMR({emit: false})});
    empty.start({});
    assert.equal(await empty.stop(), null);
    const idle = Recorder.createRecorder({MediaRecorderClass: fakeMR()});
    assert.equal(await idle.stop(), null, 'stop before start');
    const none = Recorder.createRecorder({MediaRecorderClass: null});
    assert.equal(none.supported(), false);
    assert.throws(() => none.start({}), /不能錄影/);
});

test('the recorder asks for a modest bit rate so a set stays small', () => {
    const MR = fakeMR(); const r = Recorder.createRecorder({MediaRecorderClass: MR});
    r.start({});
    assert.equal(MR.last.opts.videoBitsPerSecond, 1500000);
    assert.equal(MR.last.opts.mimeType, 'video/webm');
});

test('restarting on a new stream (lens change) gives a clean video; the old recorder\'s last data does not leak into it', async () => {
    const made = [];
    class MR2 {
        static isTypeSupported() { return true; }
        constructor(stream) { this.state = 'inactive'; this.mimeType = 'video/webm'; this.l = {}; this.tag = stream.tag; made.push(this); }
        addEventListener(n, f) { this.l[n] = f; }
        start() { this.state = 'recording'; this.l.dataavailable({data: new Blob(['x'.repeat(100)])}); }
        stop() { this.state = 'inactive'; const l = this.l; setTimeout(() => { l.dataavailable({data: new Blob(['y'.repeat(50)])}); l.stop(); }, 0); }
    }
    let t = 0; const r = Recorder.createRecorder({MediaRecorderClass: MR2, now: () => t});
    r.start({tag: 'a'});
    t = 1000; r.restart({tag: 'b'});
    assert.equal(r.active(), true);
    t = 4000;
    const out = await r.stop();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(made.map(m => m.tag), ['a', 'b']);
    assert.equal(out.blob.size, 150, 'only the new recorder\'s own data: 100 + its last 50');
    assert.equal(out.durationMs, 3000, 'the length counts from the restart');
    const idle = Recorder.createRecorder({MediaRecorderClass: MR2, now: () => t});
    idle.restart({tag: 'c'});
    assert.equal(idle.active(), true, 'restart with nothing running just starts');
});
