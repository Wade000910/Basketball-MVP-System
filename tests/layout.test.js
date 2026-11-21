const test = require('node:test');
const assert = require('node:assert/strict');
const {stageAspect} = require('../shoot/layout.js');

test('landscape and portrait video each get their own shape', () => {
    assert.equal(stageAspect(640, 480), '640 / 480');
    assert.equal(stageAspect(480, 640), '480 / 640');
});

test('unknown or absurd sizes fall back to the 4:3 default', () => {
    assert.equal(stageAspect(0, 0), '4 / 3');
    assert.equal(stageAspect(NaN, 480), '4 / 3');
    assert.equal(stageAspect(3000, 100), '4 / 3');
    assert.equal(stageAspect(100, 3000), '4 / 3');
});

test('describes the page as portrait or landscape from the video', () => {
    const {orientationOf} = require('../shoot/layout.js');
    assert.equal(orientationOf(480, 640), 'portrait');
    assert.equal(orientationOf(640, 480), 'landscape');
    assert.equal(orientationOf(0, 0), 'landscape');
});

test('a tap on the camera frame becomes 0-1 picture coordinates, whatever the bars around the picture', () => {
    const {tapToPicture, hoopFromTaps} = require('../shoot/layout.js');
    // a 400 x 400 frame showing a 640 x 480 picture: the picture fills the width and is centred vertically (bars of 50 px)
    const rect = {left: 0, top: 0, width: 400, height: 400};
    assert.deepEqual(tapToPicture(rect, 640, 480, 200, 200), {x: 0.5, y: 0.5});
    assert.deepEqual(tapToPicture(rect, 640, 480, 0, 50), {x: 0, y: 0});
    assert.deepEqual(tapToPicture(rect, 640, 480, 400, 350), {x: 1, y: 1});
    assert.equal(tapToPicture(rect, 640, 480, 200, 10), null, 'a tap on the black bar is not on the picture');
    assert.equal(tapToPicture(rect, 0, 0, 200, 200), null);
    // upright picture in a wide frame: bars on the sides
    const wide = {left: 10, top: 20, width: 800, height: 400};
    const p = tapToPicture(wide, 480, 640, 410, 220);
    assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9);
});

test('two taps on the rim edges give the hoop centre and opening width', () => {
    const {hoopFromTaps} = require('../shoot/layout.js');
    const h = hoopFromTaps({x: 0.4, y: 0.3}, {x: 0.6, y: 0.32});
    assert.ok(Math.abs(h.cx - 0.5) < 1e-9 && Math.abs(h.cy - 0.31) < 1e-9 && Math.abs(h.w - 0.2) < 1e-9);
    assert.equal(hoopFromTaps({x: 0.4, y: 0.3}, {x: 0.401, y: 0.3}), null, 'too narrow to be a rim');
    assert.equal(hoopFromTaps(null, {x: 0.6, y: 0.3}), null);
});
