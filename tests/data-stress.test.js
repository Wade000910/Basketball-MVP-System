// Training data under load and abuse: a full history, repeated backup/restore, merges that must not change anything
// when they are refused, and damaged backup files. Whatever comes in, the store is either valid or untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../training/core.js');

const T0 = Date.parse('2026-09-01T10:00:00.000Z');
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function fullSession(n, shots = 200, code = 'P001', r = rng(n + 7)) {
    const start = new Date(T0 + n * 86400000).toISOString();
    let s = C.createSession({ playerCode: code, targetShots: 200, id: `s${n}`, now: start });
    for (let i = 0; i < shots; i++) s = C.addShot(s, r() < 0.7, `s${n}-${i}`, new Date(T0 + n * 86400000 + (i + 1) * 1000).toISOString());
    return C.finishSession(s, new Date(T0 + n * 86400000 + (shots + 5) * 1000).toISOString());
}
const history = k => Array.from({ length: k }, (_, i) => fullSession(i));
const store = h => ({ schemaVersion: C.SCHEMA, active: null, history: h });
const backup = h => JSON.stringify({ schemaVersion: 'basketball-training-backup-v1', store: store(h) });

test('a full history (30 sets of 200 shots) survives backup and restore unchanged and stays under the 5 MB limit', () => {
    const h = history(30), text = backup(h);
    assert.ok(text.length < 5 * 1024 * 1024, `backup is ${text.length} bytes`);
    const back = C.parseBackup(text);
    assert.equal(back.history.length, 30);
    assert.deepEqual(back.history.map(s => C.summarize(s)), h.map(s => C.summarize(s)));
    assert.equal(back.history.reduce((n, s) => n + s.shots.length, 0), 6000);
});
test('restoring the same backup again changes nothing (idempotent), repeated ten times', () => {
    const h = history(12);
    let current = store(h);
    for (let i = 0; i < 10; i++) {
        const merged = C.mergeBackup(current, C.parseBackup(backup(h)));
        assert.equal(merged.added, 0); assert.equal(merged.skipped, 12);
        current = { schemaVersion: merged.schemaVersion, active: merged.active, history: merged.history };
    }
    assert.deepEqual(current.history.map(s => s.id).sort(), h.map(s => s.id).sort());
});
test('a merge that would exceed 30 sets is refused and leaves the current records untouched', () => {
    const current = store(history(30)), snapshot = JSON.stringify(current);
    const extra = store([fullSession(99)]);
    assert.throws(() => C.mergeBackup(current, extra), /30/);
    assert.equal(JSON.stringify(current), snapshot);
});
test('merging two devices keeps every set once, newest first', () => {
    const a = store([0, 1, 2, 3].map(i => fullSession(i))), b = store([2, 3, 4, 5].map(i => fullSession(i)));
    const m = C.mergeBackup(a, b);
    assert.deepEqual(m.history.map(s => s.id), ['s5', 's4', 's3', 's2', 's1', 's0']);
    assert.equal(m.added, 2); assert.equal(m.skipped, 2);
});
test('damaged backups are rejected cleanly: random truncation and byte damage never produce an invalid store', () => {
    const text = backup(history(3)), r = rng(42);
    let accepted = 0, rejected = 0;
    for (let i = 0; i < 400; i++) {
        let t = text;
        if (i % 2) t = t.slice(0, Math.floor(r() * t.length));
        else { const k = Math.floor(r() * t.length); t = t.slice(0, k) + String.fromCharCode(32 + Math.floor(r() * 90)) + t.slice(k + 1); }
        try {
            const out = C.parseBackup(t);
            for (const s of out.history) C.validateSession(s);
            accepted++;
        } catch (e) { assert.ok(e instanceof Error); rejected++; }
    }
    assert.ok(rejected > 0, 'truncation must be caught');
    assert.equal(accepted + rejected, 400);
});
test('hostile fields in a backup are rejected: formula codes, oversized notes, duplicate ids, impossible times', () => {
    const good = fullSession(1, 5);
    for (const bad of [{ ...good, playerCode: '=cmd|"/c calc"!A1' }, { ...good, note: 'x'.repeat(301) }, { ...good, drill: 'dunk' }, { ...good, targetShots: 5000 }, { ...good, shots: [...good.shots, good.shots[0]] }])
        assert.throws(() => C.parseBackup(backup([bad])), Error);
    assert.throws(() => C.parseBackup(backup([good, good])), Error);
    assert.throws(() => C.parseBackup('x'.repeat(5 * 1024 * 1024 + 1)), /5 MB/);
});
test('a 200-shot set with a thousand-row history stays fast: summary, trend, progress and CSV in well under a second', () => {
    const h = history(30), t0 = Date.now();
    for (let i = 0; i < 30; i++) { C.summarize(h[i]); C.csv(h[i]); }
    C.progress(h, 'P001', new Date(T0 + 40 * 86400000)); C.trend(h, 'P001', 'free_throw');
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
});
test('exported CSV never starts a cell with a formula character and doubles embedded quotes', () => {
    const csv = C.csv(fullSession(1, 3));
    for (const row of csv.replace('﻿', '').split('\r\n')) for (const cell of row.split('","')) assert.doesNotMatch(cell.replace(/^"/, ''), /^[=+\-@]/);
});
