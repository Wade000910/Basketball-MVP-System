const test = require('node:test');
const assert = require('node:assert/strict');
const {createHoopWatch} = require('../shoot/hoop-watch.js');

const HOOP = {cx: 0.5, cy: 0.3, w: 0.12};
const fall = [[0.45, 0.12], [0.49, 0.2], [0.5, 0.27], [0.5, 0.33], [0.5, 0.42]];

function feed(w, startAt, pts) { pts.forEach((p, i) => w.push(startAt + i * 33, {ball: {x: p[0], y: p[1], r: 0.025}, hoop: HOOP})); }

test('sightings before a shot is released are not part of the shot', () => {
    const w = createHoopWatch({windowMs: 500});
    feed(w, 0, fall);
    w.start(1000);
    assert.equal(w.finished(1100), false);
    assert.equal(w.finish(1100), null, 'nothing to report until the window has run');
});

test('collects a window after release and then classifies it', () => {
    const w = createHoopWatch({windowMs: 500});
    w.start(0);
    feed(w, 10, fall);
    assert.equal(w.finished(200), false);
    assert.equal(w.finished(600), true);
    const r = w.finish(600);
    assert.equal(r.result, 'made');
    assert.equal(w.finished(700), false, 'a finished watch is closed until the next release');
});

test('sightings after the window are ignored', () => {
    const w = createHoopWatch({windowMs: 300});
    w.start(0);
    feed(w, 10, fall.slice(0, 2));
    feed(w, 900, fall.slice(2));
    assert.equal(w.finish(400).result, 'unknown', 'only two sightings fell inside the window');
    assert.equal(w.finish(500), null);
});

test('the hoop position is the middle of what was seen, so one wrong box does not move it', () => {
    const w = createHoopWatch({windowMs: 500});
    for (const h of [HOOP, HOOP, {cx: 0.9, cy: 0.9, w: 0.5}, HOOP, HOOP]) w.noteHoop(h);
    assert.deepEqual(w.hoop(), HOOP);
    assert.equal(createHoopWatch().hoop(), null);
});

test('with no hoop seen the answer is unknown', () => {
    const w = createHoopWatch({windowMs: 300});
    w.start(0);
    fall.forEach((p, i) => w.push(i * 33, {ball: {x: p[0], y: p[1], r: 0.025}, hoop: null}));
    assert.equal(w.finished(400), true);
    assert.equal(w.finish(400).result, 'unknown');
});
