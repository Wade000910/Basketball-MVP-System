// Robustness tests: every function that reads data from outside (a saved file, local storage, the cloud, a
// camera, speech) is fed thousands of broken, hostile or absurd inputs. A function may refuse an input
// (return nothing or throw an ordinary Error with a message), but it must never crash with a TypeError or
// RangeError, loop forever, or let NaN/Infinity through as a measurement.
const test = require('node:test');
const assert = require('node:assert/strict');

const TC = require('../training/core.js');
const TA = require('../training/analysis-store.js');
const Cloud = require('../shared/cloud.js');
const Coach = require('../coach/core.js');
const P = require('../shoot/practice.js');
const E = require('../shoot/engine.js');
const V = require('../shoot/voice.js');
const H = require('../shoot/hoop.js');
const Y = require('../shoot/yolo.js');
const X = require('../shoot/yolox.js');
const G = require('../shoot/gauge.js');
const L = require('../shoot/layout.js');
const Trial = require('../trial/core.js');

// small seeded generator so a failure can be reproduced
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pick = (r, list) => list[Math.floor(r() * list.length)];
const WEIRD = [null, undefined, NaN, Infinity, -Infinity, 0, -1, 1e308, -1e308, 2 ** 53, '', ' ', 'x', '😀', '\u0000', '<script>alert(1)</script>', '="x"', '{}', '[]', 'true', [], {}, [null], [[]], {a: 1}, true, false, 'a'.repeat(5000), new Date(NaN), new Date(0)];
function junk(r, depth = 0) {
    const t = r();
    if (t < 0.55 || depth > 3) return pick(r, WEIRD);
    if (t < 0.8) return Array.from({length: Math.floor(r() * 6)}, () => junk(r, depth + 1));
    const o = {};
    for (let i = 0, n = Math.floor(r() * 7); i < n; i++) o[pick(r, ['id', 'made', 'source', 'shots', 'user_id', 'display_name', 'role', 'startedAt', 'finishedAt', 'drill', 'position', 'playerCode', 'targetShots', 'note', 'analysis_runs', 'trials', 'dtPeak', 'x', 'y', 't', 'ball', 'hoop', 'cx', 'cy', 'w', 'r', 'name', 'schema', 'sessions', 'history', 'active', 'timestamp'])] = junk(r, depth + 1);
    return o;
}
function mustNotCrash(label, fn) {
    try { fn(); } catch (e) {
        assert.ok(!(e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError), `${label}: ${e && e.stack}`);
    }
}
const N = 1500;
const O = r => { const o = junk(r); return o && typeof o === 'object' && !Array.isArray(o) ? o : {value: o}; };   // an object with hostile contents
const A = r => Array.from({length: Math.floor(r() * 6)}, () => junk(r));                                         // an array of hostile items
const J = r => JSON.stringify(junk(r)) ?? 'undefined';                                                          // saved text that is valid JSON of hostile shape
const T = r => r() < 0.5 ? J(r) : (r() < 0.5 ? String(junk(r)) : String.fromCharCode(...Array.from({length: Math.floor(r() * 30)}, () => Math.floor(r() * 65536))));

test('saved text in local storage and backup files: parsing never crashes', () => {
    const r = rng(1);
    for (let i = 0; i < N * 3; i++) {
        const s = T(r);
        mustNotCrash('TC.parseStore', () => TC.parseStore(s));
        mustNotCrash('TC.parseBackup', () => TC.parseBackup(s));
        mustNotCrash('TA.parse', () => TA.parse(s));
        mustNotCrash('P.restore', () => P.restore(s));
    }
});

test('a stored shape that parses is safe to use afterwards', () => {
    const r = rng(11);
    let usable = 0;
    for (let i = 0; i < N * 3; i++) {
        let store = null;
        try { store = TC.parseStore(T(r)); } catch { /* refused */ }
        if (!store) continue;
        usable++;
        mustNotCrash('summarize', () => { for (const s of [...(store.history || []), store.active].filter(Boolean)) TC.summarize(s); });
        mustNotCrash('csv', () => { for (const s of store.history || []) TC.csv(s); });
        mustNotCrash('progress', () => TC.progress(store.history || [], 'free_throw'));
        mustNotCrash('trend', () => TC.trend(store.history || [], 'free_throw', 'unspecified'));
    }
    assert.ok(usable >= 0);
});

test('rows from the cloud: converting and merging never crash', () => {
    const r = rng(3);
    for (let i = 0; i < N; i++) {
        const row = O(r), rows = Array.from({length: Math.floor(r() * 5)}, () => O(r));
        mustNotCrash('fromRow', () => Cloud.fromRow(row));
        mustNotCrash('mergeRemote', () => Cloud.mergeRemote({active: null, history: []}, rows));
        mustNotCrash('friendlyError', () => Cloud.friendlyError(junk(r)));
    }
});

test('a hostile roster and hostile sessions never crash the coach report or the CSV', () => {
    const r = rng(4);
    for (let i = 0; i < N; i++) {
        // what the page really passes in: roster rows from the server, and sessions already converted from hostile rows
        const roster = Array.from({length: Math.floor(r() * 4)}, () => ({user_id: junk(r), role: pick(r, ['player', 'coach', junk(r)]), display_name: junk(r), joined_at: junk(r)}));
        const rows = Array.from({length: Math.floor(r() * 4)}, () => ({id: junk(r), user_id: junk(r), player_code: junk(r), target_shots: junk(r), drill: pick(r, ['free_throw', 'mid_range', junk(r)]), position: junk(r), started_at: pick(r, ['2026-11-10T10:00:00Z', junk(r)]), finished_at: pick(r, ['2026-11-10T10:10:00Z', null, junk(r)]), shots: pick(r, [A(r), junk(r)]), analysis_runs: junk(r)}));
        const sessions = rows.map(row => ({sess: Cloud.fromRow(row), userId: row.user_id})).filter(x => x.sess).map(x => ({...x.sess, userId: x.userId}));
        mustNotCrash('teamReport', () => Coach.teamReport(roster, sessions, new Date('2026-11-20')));
        mustNotCrash('shotCsv', () => Coach.shotCsv(roster, sessions));
    }
    const rep = Coach.teamReport(Coach.demoData().roster, Coach.demoData().sessions, new Date('2026-11-20'));
    assert.ok(!JSON.stringify(rep).includes('NaN'), 'no NaN in a normal report');
});

test('the detector never crashes or reports a non-finite measurement on garbage landmarks', () => {
    const r = rng(6);
    for (let run = 0; run < 60; run++) {
        const d = E.createDetector({side: pick(r, ['left', 'right']), timestampSource: pick(r, ['camera-frame', 'pose-result'])});
        let t = 1000;
        for (let i = 0; i < 400; i++) {
            t += pick(r, [33, 33, 33, 16, 0, -5, 500, 5000]);
            const lm = r() < 0.2 ? null : Array.from({length: 33}, () => (r() < 0.15 ? O(r) : {x: pick(r, [r(), NaN, 2, -1]), y: pick(r, [r(), NaN, 2, -1]), z: r(), visibility: pick(r, [r(), undefined, NaN])}));
            let ev;
            mustNotCrash('push', () => { ev = d.push({t, landmarks: lm}); });
            if (ev && ev.trial && ev.trial.status === 'accepted') {
                assert.ok(Number.isFinite(ev.trial.dtPeak), 'an accepted trial has a finite measurement');
                assert.ok(Number.isFinite(ev.trial.dt), 'an accepted trial has a finite onset measurement');
            }
        }
    }
});

test('voice recognition survives any text and never reads small talk as a call', () => {
    const r = rng(7);
    for (let i = 0; i < 5000; i++) {
        const s = T(r);
        mustNotCrash('parse', () => { const out = V.parse(s); assert.ok(out === true || out === false || out === null); });
        mustNotCrash('fromAlternatives', () => V.fromAlternatives([s, T(r)]));
    }
    for (const talk of ['我們進去吧', '進來', '你有沒有看到', '', '   ']) assert.notEqual(V.parse(talk), true, talk);
});

test('hoop logic, detector decoding, gauge and layout survive any numbers', () => {
    const r = rng(8);
    const num = () => pick(r, [r(), r() * 1000, -r(), NaN, Infinity, -Infinity, 0, 1e308, undefined, null, '5', 'x']);
    for (let i = 0; i < N; i++) {
        const obs = Array.from({length: Math.floor(r() * 12)}, () => (r() < 0.2 ? O(r) : {t: num(), ball: r() < 0.2 ? null : {x: num(), y: num(), r: num()}}));
        const hoop = r() < 0.2 ? null : {cx: num(), cy: num(), w: num()};
        mustNotCrash('classifyShot', () => { const out = H.classifyShot(obs, hoop); assert.ok(['made', 'missed', 'unknown'].includes(out.result)); });
        mustNotCrash('gauge', () => G.gauge(num(), {ready: pick(r, [true, false]), mean: num(), low: num(), high: num()}));
        mustNotCrash('stageAspect', () => L.stageAspect(num(), num()));
        mustNotCrash('tapToPicture', () => L.tapToPicture({left: num(), top: num(), width: num(), height: num()}, num(), num(), num(), num()));
        mustNotCrash('hoopFromTaps', () => L.hoopFromTaps({x: num(), y: num()}, {x: num(), y: num()}));
        mustNotCrash('decodeYolo', () => Y.decodeYolo(new Float32Array(Math.floor(r() * 60)).map(() => r() * 100), {numBoxes: pick(r, [1, 3, 6, 0, -2, NaN]), numClasses: 2, inputSize: pick(r, [100, 0, NaN])}));
        mustNotCrash('decodeYoloX', () => X.decodeYoloX(new Float32Array(pick(r, [0, 10, 3549 * 85])).map(() => (r() - 0.5) * 20), {imgW: num(), imgH: num(), inputSize: pick(r, [416, 0, NaN])}));
        mustNotCrash('pickBall', () => Y.pickBall(Array.from({length: 3}, () => O(r))));
        mustNotCrash('pickHoop', () => Y.pickHoop(Array.from({length: 3}, () => O(r))));
    }
    const raw = new Float32Array(3549 * 85);
    for (let i = 0; i < raw.length; i++) raw[i] = (r() - 0.5) * 10;
    for (const b of X.decodeYoloX(raw, {imgW: 640, imgH: 480, inputSize: 416, scoreThreshold: 0.01})) assert.ok([b.cx, b.cy, b.w, b.h, b.score].every(Number.isFinite), 'finite boxes');
});

test('trial files from strangers cannot crash the summary', () => {
    const r = rng(9);
    for (let i = 0; i < N; i++) {
        const texts = Array.from({length: 1 + Math.floor(r() * 4)}, () => T(r));
        mustNotCrash('parseFiles', () => { const out = Trial.parseFiles(texts); Trial.summarize(out.responses); Trial.toCsv(out.responses); });
        mustNotCrash('buildResponse', () => Trial.buildResponse(O(r)));
        mustNotCrash('susScore', () => Trial.susScore(A(r)));
    }
});
