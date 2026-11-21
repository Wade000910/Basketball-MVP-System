const test = require('node:test');
const assert = require('node:assert/strict');
const {decodeYoloX, letterbox, SPORTS_BALL} = require('../shoot/yolox.js');

const INPUT = 416, STRIDES = [8, 16, 32];
const COUNT = STRIDES.reduce((n, s) => n + (INPUT / s) ** 2, 0); // 3549
const CLASSES = 80;

// A fake raw model output: one box written at the anchor whose cell contains its centre, the way the model stores it.
function raw(boxes) {
    const out = new Float32Array(COUNT * (5 + CLASSES));
    for (const b of boxes) {
        let offset = 0;
        const stride = b.stride || 8;
        for (const s of STRIDES) {
            const cells = INPUT / s;
            if (s === stride) {
                const gx = Math.floor(b.cx / s), gy = Math.floor(b.cy / s);
                const i = offset + gy * cells + gx, o = i * (5 + CLASSES);
                out[o] = b.cx / s - gx; out[o + 1] = b.cy / s - gy;
                out[o + 2] = Math.log(b.w / s); out[o + 3] = Math.log(b.h / s);
                out[o + 4] = b.obj; out[o + 5 + b.cls] = b.score;
            }
            offset += cells * cells;
        }
    }
    return out;
}
const view = {imgW: 640, imgH: 480};

test('letterbox keeps the picture shape and pads the short side', () => {
    const l = letterbox(640, 480, INPUT);
    assert.equal(l.scale, INPUT / 640);
    assert.equal(l.width, 416);
    assert.equal(l.height, 312);
});

test('reads a sports ball and returns picture coordinates in 0-1', () => {
    // centre (320, 156) in the 416 input is (492, 240) in a 640 x 480 picture, i.e. 0.77, 0.5
    const d = decodeYoloX(raw([{cx: 320, cy: 156, w: 26, h: 26, cls: SPORTS_BALL, obj: 0.9, score: 0.9}]), {...view, inputSize: INPUT});
    assert.equal(d.length, 1);
    assert.ok(Math.abs(d[0].cx - 320 / 416) < 0.01, `x ${d[0].cx}`);
    assert.ok(Math.abs(d[0].cy - 0.5) < 0.01, `y ${d[0].cy}`);
    assert.equal(d[0].cls, 0, 'returned as the ball class used by the rest of the code');
    assert.ok(d[0].score > 0.8);
});

test('ignores people, chairs and every other class', () => {
    const d = decodeYoloX(raw([{cx: 200, cy: 150, w: 100, h: 200, cls: 0, obj: 0.95, score: 0.95}]), {...view, inputSize: INPUT});
    assert.deepEqual(d, []);
});

test('score is objectness times class score, so a weak object is dropped', () => {
    const weak = decodeYoloX(raw([{cx: 320, cy: 156, w: 26, h: 26, cls: SPORTS_BALL, obj: 0.4, score: 0.5}]), {...view, inputSize: INPUT});
    assert.deepEqual(weak, []);
});

test('keeps one box where the same ball is found at two scales', () => {
    const d = decodeYoloX(raw([
        {cx: 320, cy: 156, w: 26, h: 26, cls: SPORTS_BALL, obj: 0.9, score: 0.9, stride: 8},
        {cx: 322, cy: 158, w: 28, h: 28, cls: SPORTS_BALL, obj: 0.8, score: 0.8, stride: 16}
    ]), {...view, inputSize: INPUT});
    assert.equal(d.length, 1);
});

test('a malformed output gives no boxes instead of an error', () => {
    assert.deepEqual(decodeYoloX(new Float32Array(5), {...view, inputSize: INPUT}), []);
    assert.deepEqual(decodeYoloX(null, {...view, inputSize: INPUT}), []);
});
