const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../trial/core.js');

const best = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];   // agree with every positive item, disagree with every negative one
const worst = [1, 5, 1, 5, 1, 5, 1, 5, 1, 5];
const middle = Array(10).fill(3);

test('SUS scores follow the standard formula', () => {
    assert.equal(T.susScore(best), 100);
    assert.equal(T.susScore(worst), 0);
    assert.equal(T.susScore(middle), 50);
    // odd items count (answer - 1), even items count (5 - answer): [4,2,4,2,4,2,4,2,4,2] -> 3+3+3+3+3+3+3+3+3+3 = 30 -> 75
    assert.equal(T.susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]), 75);
});

test('an incomplete or out-of-range set of answers has no score', () => {
    assert.equal(T.susScore([5, 1, 5]), null);
    assert.equal(T.susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 6]), null);
    assert.equal(T.susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 0]), null);
    assert.equal(T.susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1.5]), null);
    assert.equal(T.susScore(null), null);
});

test('a response is checked and carries its own score', () => {
    const r = T.buildResponse({code: ' p007 ', sus: best, product: [4, 5, 3, 4, 5], open: ['記錄', '', '圖表'], device: 'iPhone 13'}, '2026-11-21T10:00:00Z');
    assert.equal(r.code, 'P007');
    assert.equal(r.susScore, 100);
    assert.equal(r.schema, T.SCHEMA);
    assert.deepEqual(r.open, ['記錄', '', '圖表']);
    assert.throws(() => T.buildResponse({code: '', sus: best, product: [4, 5, 3, 4, 5]}), /代碼/);
    assert.throws(() => T.buildResponse({code: 'P1', sus: [5, 5], product: [4, 5, 3, 4, 5]}), /10 題/);
    assert.throws(() => T.buildResponse({code: 'P1', sus: best, product: [4, 5]}), /5 題/);
});

test('the summary gives n, mean and sample standard deviation, and flags the 70 target', () => {
    const rs = [best, [4, 2, 4, 2, 4, 2, 4, 2, 4, 2], middle].map((sus, i) => T.buildResponse({code: 'P' + i, sus, product: [5, 4, 3, 4, 5]}, '2026-11-21T10:00:00Z'));
    const s = T.summarize(rs);
    assert.equal(s.n, 3);
    assert.equal(s.mean, 75);                   // (100 + 75 + 50) / 3
    assert.equal(s.sd, 25);                      // sample SD of 100, 75, 50
    assert.equal(s.min, 50);
    assert.equal(s.max, 100);
    assert.equal(s.meetsTarget, true);
    assert.deepEqual(s.productMeans, [5, 4, 3, 4, 5]);
    assert.equal(T.summarize([T.buildResponse({code: 'P1', sus: middle, product: [3, 3, 3, 3, 3]})]).meetsTarget, false);
});

test('an empty summary and a single response are reported without inventing a spread', () => {
    assert.equal(T.summarize([]).n, 0);
    assert.equal(T.summarize([]).mean, null);
    const one = T.summarize([T.buildResponse({code: 'P1', sus: best, product: [5, 5, 5, 5, 5]})]);
    assert.equal(one.mean, 100);
    assert.equal(one.sd, null);
});

test('the same participant twice counts once, keeping the latest answer', () => {
    const a = T.buildResponse({code: 'P1', sus: worst, product: [1, 1, 1, 1, 1]}, '2026-11-20T10:00:00Z');
    const b = T.buildResponse({code: 'P1', sus: best, product: [5, 5, 5, 5, 5]}, '2026-11-21T10:00:00Z');
    const s = T.summarize([a, b]);
    assert.equal(s.n, 1);
    assert.equal(s.mean, 100);
});

test('files are read defensively: bad JSON and the wrong shape are skipped with a reason', () => {
    const good = T.buildResponse({code: 'P1', sus: best, product: [5, 5, 5, 5, 5]});
    const r = T.parseFiles([JSON.stringify(good), '{not json', JSON.stringify({schema: 'other'}), JSON.stringify([good])]);
    assert.equal(r.responses.length, 2);
    assert.equal(r.skipped.length, 2);
});

test('the CSV has one row per participant and quotes free text', () => {
    const r = T.buildResponse({code: 'P1', sus: best, product: [5, 4, 3, 2, 1], open: ['好用, 但"慢"', '', '']}, '2026-11-21T10:00:00Z');
    const csv = T.toCsv([r]);
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /code,susScore,sus1/);
    assert.match(lines[1], /^P1,100,5,1,5,1,5,1,5,1,5,1,5,4,3,2,1/);
    assert.ok(lines[1].includes('"好用, 但""慢"""'));
});
