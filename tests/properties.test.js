// Model-based tests: long random sequences of real actions, checking rules that must always hold.
const test = require('node:test');
const assert = require('node:assert/strict');
const TC = require('../training/core.js');
const TA = require('../training/analysis-store.js');
const P = require('../shoot/practice.js');
const Cloud = require('../shared/cloud.js');

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const iso = (n) => new Date(Date.UTC(2026, 10, 1) + n * 1000).toISOString();
const trialOf = (status, dtPeak) => ({status, reasonCode: status === 'accepted' ? '' : 'LOW_FPS', dt: status === 'aborted' ? null : dtPeak - 40, dtPeak: status === 'aborted' ? null : dtPeak, measuredFps: 29.5, timestampSource: 'camera-frame', algorithmVersion: 'player-peak-v1'});

test('a training session stays consistent through any sequence of taps, corrections and removals', () => {
    for (let seed = 1; seed <= 200; seed++) {
        const r = rng(seed);
        let s = TC.createSession({playerCode: 'P' + seed, targetShots: 1 + Math.floor(r() * 50), id: 'set' + seed, now: iso(0)});
        let clock = 1, ids = [];
        for (let step = 0; step < 80; step++) {
            const roll = r();
            try {
                if (roll < 0.6) { const id = 's' + step; s = TC.addShot(s, r() < 0.5, id, iso(clock += 5), pick(r)); ids.push(id); }
                else if (roll < 0.8 && ids.length) s = TC.correctShot(s, ids[Math.floor(r() * ids.length)], r() < 0.5);
                else if (ids.length) { const id = ids.splice(Math.floor(r() * ids.length), 1)[0]; s = TC.removeShot(s, id); }
            } catch (e) { assert.ok(e instanceof Error && !(e instanceof TypeError), e.stack); }
            const sum = TC.summarize(s);
            assert.equal(sum.total, s.shots.length, 'total equals the shots recorded');
            assert.ok(sum.made >= 0 && sum.made <= sum.total, 'made is between 0 and total');
            assert.ok(sum.percentage === null || (sum.percentage >= 0 && sum.percentage <= 100), 'percentage within 0-100');
            assert.equal(new Set(s.shots.map(x => x.id)).size, s.shots.length, 'shot ids stay unique');
            TC.validateSession(s);
        }
        const done = TC.finishSession(s, iso(clock + 60));
        TC.validateSession(done);
        const csvRows = TC.csv(done).trim().split('\r\n');
        assert.equal(csvRows.length, done.shots.length + 1, 'one CSV row per shot plus the header');
    }
    function pick(r) { return ['manual', 'voice', 'teammate', 'camera'][Math.floor(r() * 4)]; }
});

test('a practice set keeps its links and survives a save and reload at every step', () => {
    for (let seed = 1; seed <= 120; seed++) {
        const r = rng(seed * 7);
        let p = P.newPractice({playerCode: 'P' + seed, targetShots: 40, side: 'right', sound: true, id: 'shoot' + seed, now: iso(0)});
        let clock = 1, shots = [];
        for (let step = 0; step < 40; step++) {
            const roll = r();
            if (roll < 0.45) {
                const status = ['accepted', 'accepted', 'low_quality', 'aborted'][Math.floor(r() * 4)];
                const out = P.addTrial(p, trialOf(status, 80 + Math.floor(r() * 120)), iso(clock += 4));
                p = out.practice;
                if (status !== 'aborted' && r() < 0.8) { const id = 'a' + step; p = P.addResult(p, {made: r() < 0.5, source: 'voice', shotId: id, trialOrder: out.trialOrder, now: iso(clock += 3)}); shots.push(id); }
            } else if (roll < 0.7) { const id = 'm' + step; p = P.addResult(p, {made: r() < 0.5, source: 'manual', shotId: id, now: iso(clock += 6)}); shots.push(id); }
            else if (roll < 0.85 && shots.length) p = P.correct(p, shots[Math.floor(r() * shots.length)], r() < 0.5);
            else if (shots.length) { const id = shots.splice(Math.floor(r() * shots.length), 1)[0]; p = P.remove(p, id); }
            // what is saved is what comes back
            const back = P.restore(JSON.stringify(p));
            assert.deepEqual(back, p, 'save and reload is lossless');
            // each trial is linked to at most one shot, and each shot to at most one trial
            const linked = p.run.trials.filter(t => t.shotId).map(t => t.shotId);
            assert.equal(new Set(linked).size, linked.length, 'a shot is linked to one trial only');
            assert.deepEqual(p.run.trials.map(t => t.trialOrder), p.run.trials.map((_, i) => i + 1), 'trial numbers run 1..n without gaps');
        }
        const out = P.finish(p, null, null, iso(clock + 60));
        const store = TC.parseStore(out.training);
        assert.equal(store.history.length, 1);
        assert.equal(TA.parse(out.analysis).length, 1);
    }
});

test('the history keeps the NEWEST sets and the NEWEST motion runs once the limits are reached', () => {
    let training = null, analysis = null;
    const total = 36;
    for (let i = 1; i <= total; i++) {
        let p = P.newPractice({playerCode: 'P1', targetShots: 10, side: 'right', sound: true, id: 'set' + String(i).padStart(3, '0'), now: iso(i * 1000)});
        const out = P.addTrial(p, trialOf('accepted', 120), iso(i * 1000 + 5));
        p = P.addResult(out.practice, {made: true, source: 'manual', shotId: 's1', trialOrder: out.trialOrder, now: iso(i * 1000 + 9)});
        const done = P.finish(p, training, analysis, iso(i * 1000 + 30));
        training = done.training; analysis = done.analysis;
    }
    const history = TC.parseStore(training).history;
    assert.equal(history.length, 30);
    assert.equal(history[0].id, 'set' + String(total).padStart(3, '0'), 'the newest set is kept first');
    const runs = TA.parse(analysis);
    assert.ok(runs.some(r => r.sessionId === 'set' + String(total).padStart(3, '0')), 'the newest motion run was not dropped when the store is full');
});

test('a session survives the trip to the cloud and back', () => {
    for (let seed = 1; seed <= 60; seed++) {
        const r = rng(seed * 13);
        let s = TC.createSession({playerCode: 'P' + seed, targetShots: 20, id: 'cloud' + seed, now: iso(0), drill: 'free_throw'});
        for (let i = 0; i < 1 + Math.floor(r() * 15); i++) s = TC.addShot(s, r() < 0.5, 'x' + i, iso(i * 7 + 1), ['manual', 'voice', 'teammate', 'camera'][Math.floor(r() * 4)]);
        s = TC.finishSession(s, iso(500));
        const row = Cloud.toRow(s, '00000000-0000-0000-0000-000000000001');
        const back = Cloud.fromRow(row);
        assert.equal(back.id, s.id);
        assert.deepEqual(back.shots.map(x => [x.id, x.made, x.source || 'manual']), s.shots.map(x => [x.id, x.made, x.source || 'manual']));
        assert.equal(back.startedAt, new Date(s.startedAt).toISOString());
        TC.validateSession(back);
    }
});
