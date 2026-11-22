// The JavaScript timing pipeline must agree with the independent pure-Python re-implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const have = spawnSync('python3', ['--version']).status === 0;
test('JS and independent Python agree on the filters and on detectTiming', { skip: !have && 'python3 not installed' }, () => {
    const dump = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'crosscheck', 'dump.cjs')], { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(dump.status, 0, dump.stderr);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xcheck-')), 'dump.json');
    fs.writeFileSync(file, dump.stdout);
    const py = spawnSync('python3', ['-I', path.join(__dirname, '..', 'tools', 'crosscheck', 'crosscheck.py'), file], { encoding: 'utf8' });
    assert.equal(py.status, 0, py.stdout + py.stderr);
    assert.match(py.stdout, /300 identical results, 0 identical rejections, 0 mismatches/);
    assert.match(py.stdout, /two identical Q=0\.707 sections give 0\.500/);
});
