const test = require('node:test');
const assert = require('node:assert/strict');
const {classifyShot} = require('../shoot/hoop.js');

const HOOP = {cx: 0.5, cy: 0.3, w: 0.12};
// Build ball observations from [x, y] pairs, 33 ms apart; null means the ball was not found in that frame.
const track = pts => pts.map((p, i) => ({t: i * 33, ball: p && {x: p[0], y: p[1], r: 0.025}}));

test('a ball dropping straight through the opening is a make', () => {
    const r = classifyShot(track([[0.4, 0.1], [0.45, 0.18], [0.5, 0.26], [0.5, 0.33], [0.5, 0.4], [0.5, 0.5]]), HOOP);
    assert.equal(r.result, 'made');
});

test('the net hides the ball after it drops through: still a make', () => {
    const r = classifyShot(track([[0.45, 0.12], [0.49, 0.2], [0.5, 0.27], [0.5, 0.33], null, null, null]), HOOP);
    assert.equal(r.result, 'made');
});

test('a ball that comes down beside the rim is a miss', () => {
    const r = classifyShot(track([[0.3, 0.1], [0.34, 0.2], [0.36, 0.28], [0.37, 0.36], [0.37, 0.5]]), HOOP);
    assert.equal(r.result, 'missed');
});

test('a ball that reaches the rim and bounces back up is a miss', () => {
    const r = classifyShot(track([[0.44, 0.1], [0.47, 0.2], [0.5, 0.28], [0.52, 0.27], [0.56, 0.18], [0.6, 0.12]]), HOOP);
    assert.equal(r.result, 'missed');
});

test('a ball that drops short of the rim height is a miss', () => {
    const r = classifyShot(track([[0.2, 0.15], [0.25, 0.22], [0.3, 0.32], [0.33, 0.45]]), HOOP);
    assert.equal(r.result, 'missed');
});

test('a bounce off the backboard that then drops through is a make', () => {
    const r = classifyShot(track([[0.4, 0.15], [0.52, 0.2], [0.56, 0.24], [0.55, 0.22], [0.52, 0.28], [0.5, 0.34], [0.5, 0.45]]), HOOP);
    assert.equal(r.result, 'made');
});

test('too few sightings or a ball that never nears the hoop is unknown', () => {
    assert.equal(classifyShot(track([[0.5, 0.1], [0.5, 0.2]]), HOOP).result, 'unknown');
    assert.equal(classifyShot(track([[0.9, 0.7], [0.9, 0.75], [0.9, 0.8], [0.9, 0.85]]), HOOP).result, 'unknown');
    assert.equal(classifyShot([], HOOP).result, 'unknown');
    assert.equal(classifyShot(track([[0.5, 0.1], [0.5, 0.2], [0.5, 0.33]]), null).result, 'unknown');
});

test('every answer carries a reason the page can show', () => {
    for (const t of [track([[0.5, 0.1], [0.5, 0.2], [0.5, 0.33], [0.5, 0.4]]), track([[0.3, 0.1], [0.34, 0.2], [0.36, 0.28], [0.37, 0.36]]), []]) {
        const r = classifyShot(t, HOOP);
        assert.ok(['made', 'missed', 'unknown'].includes(r.result));
        assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    }
});

test('detection jitter at the rim edge does not turn a clean drop into a miss', () => {
    // the ball is seen once slightly back above the line, then drops through for good
    const r = classifyShot(track([[0.48, 0.15], [0.5, 0.28], [0.5, 0.31], [0.5, 0.29], [0.5, 0.33], [0.5, 0.42]]), HOOP);
    assert.equal(r.result, 'made', 'the last downward crossing decides, so one noisy sighting near the line does not flip the answer');
});
