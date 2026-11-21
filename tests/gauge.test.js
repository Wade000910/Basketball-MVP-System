const test = require('node:test');
const assert = require('node:assert/strict');
const {gauge} = require('../shoot/gauge.js');

const ref = {ready: true, mean: 100, low: 80, high: 120};

test('no gauge until a personal reference exists', () => {
    assert.equal(gauge(100, {ready: false, needed: 3, count: 2}), null);
    assert.equal(gauge(NaN, ref), null);
});

test('centres the player\'s own range and puts the latest shot on the same scale', () => {
    const g = gauge(100, ref);
    assert.equal(g.markerPct, 50);
    assert.ok(g.bandStartPct < 50 && g.bandEndPct > 50);
    assert.ok(Math.abs((g.bandStartPct + g.bandEndPct) / 2 - 50) < 0.01);
    assert.equal(g.tone, 'steady');
});

test('a late shot sits right of the band, an early one left of it', () => {
    const late = gauge(135, ref), early = gauge(65, ref);
    assert.ok(late.markerPct > late.bandEndPct);
    assert.ok(early.markerPct < early.bandStartPct);
    assert.equal(late.tone, 'off');
    assert.equal(late.side, 'late');
    assert.equal(early.side, 'early');
});

test('shots far outside the scale stay on the bar and are flagged', () => {
    const g = gauge(400, ref);
    assert.equal(g.markerPct, 100);
    assert.equal(g.clipped, true);
    assert.equal(gauge(-300, ref).markerPct, 0);
});

test('a very narrow personal range still gets a readable band', () => {
    const g = gauge(100, {ready: true, mean: 100, low: 95, high: 105});
    assert.ok(g.bandEndPct - g.bandStartPct >= 10);
});
