// The stress simulation must run, be reproducible, and keep covering every stress condition.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const run = () => spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'simulate-robustness.cjs'), '--quick'], { encoding: 'utf8' });

test('quick robustness simulation covers ten stress conditions for every filter', () => {
    const out = run();
    assert.equal(out.status, 0, out.stderr);
    for (const id of ['none', 'bw10', 'bw6', 'zp6', 'kf2']) assert.equal(out.stdout.split('\n').filter(l => new RegExp(`^${id}\\s+valid \\d+`).test(l)).length, 10, id);
});
test('the robustness simulation is deterministic', () => {
    const strip = s => s.replace(/seconds .*/, '');
    assert.equal(strip(run().stdout), strip(run().stdout));
});
test('a strongly compressed camera view makes the current filter far worse than the baseline', () => {
    const out = run().stdout, blocks = out.split('\n\n');
    const sd = (block, id) => Number(new RegExp(`^${id}\\s+valid \\d+ peak [-\\d.]+ ± ([\\d.]+)`, 'm').exec(block)[1]);
    const base = blocks.find(b => b.includes('基準')), squeezed = blocks.find(b => b.includes('縮小到 70%'));
    assert.ok(sd(squeezed, 'bw10') > 2 * sd(base, 'bw10'));
});
