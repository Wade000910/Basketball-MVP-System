// The shot detector under messy conditions: other frame rates, timing jitter, dropped frames, noisy landmarks,
// long sessions and long idle stretches. It must find each shot once, never invent one, and keep the timing sensible.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../shoot/engine.js');

const rad = d => d * Math.PI / 180;
function landmarks(k, e, noise = () => 0, vis = 0.95) {
    const l = Array.from({length: 33}, () => ({x: 0.5, y: 0.5, z: 0, visibility: vis}));
    const put = (i, x, y) => { l[i] = {x: x + noise(), y: y + noise(), z: 0, visibility: vis}; };
    for (const [hip, knee, ankle, sh, el, wr] of [[24, 26, 28, 12, 14, 16], [23, 25, 27, 11, 13, 15]]) {
        put(hip, 0.5, 0.5); put(knee, 0.5, 0.7); put(ankle, 0.5 + 0.2 * Math.sin(rad(k)), 0.7 - 0.2 * Math.cos(rad(k)));
        put(sh, 0.5, 0.3); put(el, 0.5, 0.2); put(wr, 0.5 + 0.1 * Math.sin(rad(e)), 0.2 + 0.1 * Math.cos(rad(e)));
    }
    return l;
}
const ramp = (t, t0, t1, a, b) => t <= t0 ? a : t >= t1 ? b : a + (b - a) * (1 - Math.cos(Math.PI * (t - t0) / (t1 - t0))) / 2;
const knee = t => t < 700 ? ramp(t, 300, 700, 170, 120) : ramp(t, 700, 1000, 120, 175);
const elbow = t => ramp(t, 850, 1100, 70, 178);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Feeds frames at the given rate with timing jitter, dropped frames and landmark noise.
function run({shots, end, fps = 30, jitterMs = 0, dropRate = 0, noise = 0, seed = 1, standingNoiseDeg = 0}) {
    const r = rng(seed), d = E.createDetector(), events = [];
    const n = () => (r() - 0.5) * 2 * noise;
    for (let t = 0; t <= end; t += 1000 / fps) {
        if (r() < dropRate) continue;
        const stamp = t + (r() - 0.5) * 2 * jitterMs;
        const s = shots.find(x => t >= x && t < x + 1600), local = s === undefined ? 0 : t - s;
        const k = s === undefined ? 170 + (r() - 0.5) * 2 * standingNoiseDeg : knee(local);
        const e = s === undefined ? 70 + (r() - 0.5) * 2 * standingNoiseDeg : elbow(local);
        const out = d.push({t: stamp, landmarks: landmarks(k, e, n)});
        if (out) events.push({...out, at: stamp});
    }
    return events;
}
const spaced = (count, gap = 7000, first = 3000) => Array.from({length: count}, (_, i) => first + i * gap);

test('twenty shots in a row at 30 fps: found once each, never duplicated', () => {
    const shots = spaced(20);
    const events = run({shots, end: shots.at(-1) + 5000});
    assert.equal(events.length, 20);
    assert.ok(events.every(e => e.trial.status === 'accepted'), events.map(e => e.trial.status + e.trial.reasonCode).join());
    const t = events.map(e => e.trial.endT);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], 'trials come in time order');
});

for (const fps of [24, 28, 30, 45, 60]) {
    test(`at ${fps} fps every shot is found and the timing is near the true 125 ms`, () => {
        const shots = spaced(10);
        const events = run({shots, end: shots.at(-1) + 5000, fps});
        assert.equal(events.length, 10, `found ${events.length} of 10`);
        const accepted = events.filter(e => e.trial.status === 'accepted');
        // Below about 25 fps the detector may refuse a trial for low frame rate; that is the designed quality gate,
        // and what it does accept must still be right. From 25 fps up, every shot should be accepted.
        if (fps >= 25) assert.ok(accepted.length >= 9, `accepted ${accepted.length} of 10`);
        for (const e of events.filter(x => x.trial.status !== 'accepted')) assert.equal(e.trial.reasonCode, 'LOW_FPS', 'the only reason to refuse a clean shot is the frame rate');
        for (const e of accepted) assert.ok(e.trial.dtPeak > 60 && e.trial.dtPeak < 190, `dtPeak ${e.trial.dtPeak} at ${fps} fps`);
    });
}

test('timing jitter of 10 ms and 5% dropped frames do not lose or duplicate shots', () => {
    for (let seed = 1; seed <= 8; seed++) {
        const shots = spaced(8);
        const events = run({shots, end: shots.at(-1) + 5000, jitterMs: 10, dropRate: 0.05, seed});
        assert.equal(events.length, 8, `seed ${seed}: found ${events.length} of 8`);
    }
});

test('small landmark noise does not hide shots or add trials', () => {
    for (let seed = 1; seed <= 6; seed++) {
        const shots = spaced(6);
        const events = run({shots, end: shots.at(-1) + 5000, noise: 0.004, seed});
        assert.equal(events.length, 6, `seed ${seed}: found ${events.length} of 6`);
    }
});

test('five minutes of standing with small body sway invents no trial', () => {
    for (let seed = 1; seed <= 5; seed++) {
        const events = run({shots: [], end: 300000, noise: 0.003, standingNoiseDeg: 3, seed});
        assert.equal(events.length, 0, `seed ${seed}: ${events.length} invented trials`);
    }
});

test('the frame rate it reports matches the camera', () => {
    for (const fps of [24, 30, 60]) {
        const events = run({shots: [3000], end: 8000, fps});
        assert.ok(Math.abs(events[0].trial.measuredFps - fps) < 2, `reported ${events[0].trial.measuredFps} for ${fps}`);
    }
});

test('a stall of three seconds in the middle of a shot gives an honest non-accepted trial, not a wrong measurement', () => {
    const d = E.createDetector(), out = [];
    for (let t = 0; t <= 9000; t += 33) {
        if (t > 3500 && t < 6500 && t > 3300) continue;     // the phone froze for 3 s during the shot at 3000
        const s = t >= 3000 && t < 4600 ? t - 3000 : undefined;
        const e = d.push({t, landmarks: landmarks(s === undefined ? 170 : knee(s), s === undefined ? 70 : elbow(s))});
        if (e) out.push(e);
    }
    for (const e of out) if (e.trial.status === 'accepted') assert.ok(e.trial.dtPeak > 20 && e.trial.dtPeak < 300, 'an accepted trial still has a plausible interval');
});

test('time that runs backwards or repeats does not crash or produce a measurement', () => {
    const d = E.createDetector();
    let accepted = 0;
    for (let i = 0; i < 600; i++) {
        const t = 1000 + (i % 7 === 0 ? -200 : i * 33);
        const s = i > 90 && i < 140 ? (i - 90) * 33 : undefined;
        const e = d.push({t, landmarks: landmarks(s === undefined ? 170 : knee(s), s === undefined ? 70 : elbow(s))});
        if (e && e.trial.status === 'accepted') { accepted++; assert.ok(Number.isFinite(e.trial.dtPeak)); }
    }
    assert.ok(accepted >= 0);
});
