const test = require('node:test');
const assert = require('node:assert/strict');
const {decodeYolo, pickHoop, pickBall} = require('../shoot/yolo.js');

// A fake model output in the usual [1, 4 + classes, boxes] layout, channel by channel.
function output(boxes, numBoxes = 6, numClasses = 2) {
    const data = new Float32Array((4 + numClasses) * numBoxes);
    boxes.forEach((b, i) => {
        data[0 * numBoxes + i] = b.cx; data[1 * numBoxes + i] = b.cy; data[2 * numBoxes + i] = b.w; data[3 * numBoxes + i] = b.h;
        data[(4 + b.cls) * numBoxes + i] = b.score;
    });
    return data;
}
const opts = {numBoxes: 6, numClasses: 2, inputSize: 100, scoreThreshold: 0.35, iouThreshold: 0.5};

test('reads boxes and scales them to 0-1 of the picture', () => {
    const d = decodeYolo(output([{cx: 50, cy: 20, w: 10, h: 10, cls: 0, score: 0.9}]), opts);
    assert.equal(d.length, 1);
    assert.deepEqual([d[0].cls, d[0].cx, d[0].cy, d[0].w, d[0].h], [0, 0.5, 0.2, 0.1, 0.1]);
    assert.equal(d[0].score, Math.fround(0.9));
});

test('drops weak boxes', () => {
    assert.equal(decodeYolo(output([{cx: 50, cy: 20, w: 10, h: 10, cls: 0, score: 0.2}]), opts).length, 0);
});

test('keeps the best of overlapping boxes of the same class but not of different classes', () => {
    const d = decodeYolo(output([
        {cx: 50, cy: 50, w: 20, h: 20, cls: 0, score: 0.9},
        {cx: 51, cy: 50, w: 20, h: 20, cls: 0, score: 0.6},
        {cx: 50, cy: 50, w: 20, h: 20, cls: 1, score: 0.7}
    ]), opts);
    assert.equal(d.length, 2);
    assert.deepEqual(d.map(x => x.cls).sort(), [0, 1]);
    assert.equal(d.find(x => x.cls === 0).score, Math.fround(0.9));
});

test('picks the single best ball and hoop for the shot logic', () => {
    const d = decodeYolo(output([
        {cx: 30, cy: 30, w: 8, h: 8, cls: 0, score: 0.6},
        {cx: 70, cy: 70, w: 8, h: 8, cls: 0, score: 0.8},
        {cx: 50, cy: 10, w: 20, h: 6, cls: 1, score: 0.7}
    ]), opts);
    assert.deepEqual(pickBall(d), {x: 0.7, y: 0.7, r: 0.04});
    assert.deepEqual(pickHoop(d), {cx: 0.5, cy: 0.1, w: 0.2});
    assert.equal(pickBall([]), null);
    assert.equal(pickHoop([]), null);
});

test('a malformed output gives no boxes instead of an error', () => {
    assert.deepEqual(decodeYolo(new Float32Array(3), opts), []);
    assert.deepEqual(decodeYolo(null, opts), []);
});
