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
