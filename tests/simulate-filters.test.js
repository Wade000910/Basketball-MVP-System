// The filter-comparison simulation must run, stay reproducible, and keep comparing the current filter with the rest.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const run = () => spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'simulate-filters.cjs'), '--quick'], { encoding: 'utf8' });

test('quick filter simulation lists every candidate under every condition, with valid results', () => {
    const out = run();
    assert.equal(out.status, 0, out.stderr);
    for (const id of ['none', 'bw10', 'zp6', 'sg7', 'oe1', 'kf2']) assert.match(out.stdout, new RegExp(`^${id}\\s+valid \\d+`, 'm'), id);
    assert.equal(out.stdout.split('\n').filter(l => /^bw10\s/.test(l)).length, 5, 'five conditions');
});
test('the simulation is deterministic: two runs print identical numbers', () => {
    const strip = s => s.replace(/seconds .*/, '');
    assert.equal(strip(run().stdout), strip(run().stdout));
});
test('in the noisy phone condition, filtering lowers the peak error SD versus no filter', () => {
    const out = run().stdout;
    const sd = id => Number(new RegExp(`^${id}\\s+valid \\d+ peak [-\\d.]+ ± ([\\d.]+)`, 'm').exec(out)[1]);
    assert.ok(sd('none') > sd('bw10'), 'filtering must help in the first (noisy phone) condition');
});
