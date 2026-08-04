const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../專題程式/experiment-core.js');

test('sample SD is calculated within one supplied block', () => {
    assert.equal(core.calculateSD([100]), 0);
    assert.equal(core.calculateSD([100, 120]), Math.sqrt(200));
});

test('block identity includes participant, session, block, and condition', () => {
    const context = {participantId:'P1', sessionId:'S1', blockId:'B1', condition:'baseline'};
    assert.equal(core.sameExperimentalBlock({...context}, context), true);
    assert.equal(core.sameExperimentalBlock({...context, condition:'auditory'}, context), false);
    assert.equal(core.sameExperimentalBlock({...context, blockId:'B2'}, context), false);
});

test('quality flags expose low frame rate and visibility', () => {
    assert.equal(core.qualityFlags(30, 0.9), 'OK');
    assert.equal(core.qualityFlags(20, 0.6), 'LOW_FPS|LOW_VISIBILITY');
});

test('CSV output quotes commas, quotes, and missing values', () => {
    const csv = core.rowsToCsv([{participantId:'P,1', note:'a"b', missing:null}], ['participantId','note','missing']);
    assert.equal(csv, 'participantId,note,missing\n"P,1","a""b",""');
});

test('baseline condition masks augmented feedback values', () => {
    assert.equal(core.maskForBaseline('baseline', '87 ms'), '--');
    assert.equal(core.maskForBaseline('auditory', '87 ms'), '87 ms');
});
