const test = require('node:test');
const assert = require('node:assert/strict');
const {createPerfMonitor} = require('../shoot/perf.js');

function run(m, n, {inferMs, every = 1}) {
    let t = 0;
    for (let i = 0; i < n; i++) {
        m.offered();
        if (i % every === 0) { m.started(t); m.finished(t + inferMs); }
        t += 33;
    }
}

test('reports median and p95 inference time', () => {
    const m = createPerfMonitor();
    run(m, 40, {inferMs: 20});
    const s = m.stats();
    assert.equal(s.n, 40);
    assert.equal(s.medianMs, 20);
    assert.equal(s.p95Ms, 20);
    assert.equal(s.dropPct, 0);
});

test('counts frames that were offered but not analysed', () => {
    const m = createPerfMonitor();
    run(m, 40, {inferMs: 20, every: 2});
    assert.equal(m.stats().dropPct, 50);
});

test('says nothing until enough frames are seen', () => {
    const m = createPerfMonitor();
    run(m, 10, {inferMs: 200});
    assert.equal(m.suggest(), null);
});

test('suggests the lighter model when analysis is slow or many frames are dropped', () => {
    const slow = createPerfMonitor();
    run(slow, 40, {inferMs: 80});
    assert.equal(slow.suggest(), 'lite');
    const dropping = createPerfMonitor();
    run(dropping, 120, {inferMs: 20, every: 3});
    assert.equal(dropping.suggest(), 'lite');
    const fine = createPerfMonitor();
    run(fine, 40, {inferMs: 20});
    assert.equal(fine.suggest(), null);
});

test('keeps only the most recent window', () => {
    const m = createPerfMonitor({window: 30});
    run(m, 30, {inferMs: 200});
    run(m, 30, {inferMs: 10});
    assert.equal(m.stats().medianMs, 10);
});

test('a finish without a start is ignored', () => {
    const m = createPerfMonitor();
    m.finished(100);
    assert.equal(m.stats().n, 0);
});
