const test = require('node:test');
const assert = require('node:assert/strict');
const { zoomConfiguration, showDiagnosticSkeleton } = require('../專題程式/camera-controls.js');

test('normalizes a supported camera zoom range', () => {
    assert.deepEqual(zoomConfiguration({ zoom: { min: 1, max: 5, step: 0.5 } }, { zoom: 2 }),
        { supported: true, min: 1, max: 5, step: 0.5, value: 2 });
});

test('rejects missing or malformed zoom capability', () => {
    assert.deepEqual(zoomConfiguration({}, {}), { supported: false });
    assert.deepEqual(zoomConfiguration({ zoom: { min: 5, max: 1 } }, {}), { supported: false });
});

test('limits diagnostic skeleton to setup and cooldown', () => {
    assert.equal(showDiagnosticSkeleton(true, 'IDLE'), true);
    assert.equal(showDiagnosticSkeleton(true, 'COOLDOWN'), true);
    assert.equal(showDiagnosticSkeleton(true, 'RECORDING'), false);
    assert.equal(showDiagnosticSkeleton(false, 'IDLE'), false);
});
