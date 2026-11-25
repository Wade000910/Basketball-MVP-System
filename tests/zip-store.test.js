const assert = require('node:assert/strict');
const test = require('node:test');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zip = require('../專題程式/zip-store.js');

test('crc32 matches the standard check value', () => {
    assert.equal(zip.crc32(Buffer.from('123456789')), 0xCBF43926);
    assert.equal(zip.crc32(new Uint8Array(0)), 0);
});

test('buildZip makes an archive that unzip reads back identically', async () => {
    const files = {
        'a_live-trials.csv': new Blob(['id,dt\n1,120\n中文,3\n'], {type: 'text/csv'}),
        'b_video.mp4': new Blob([new Uint8Array(200000).map((_, i) => i % 251)]),
        'c_empty.json': new Blob([])
    };
    const blob = await zip.buildZip(files);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const listing = execFileSync('python3', ['-I', '-c',
        'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;' +
        'print("|".join(f"{i.filename}:{i.file_size}:{i.compress_type}" for i in z.infolist()))', file]).toString().trim();
    assert.equal(listing, `a_live-trials.csv:${files['a_live-trials.csv'].size}:0|b_video.mp4:200000:0|c_empty.json:0:0`);
    const csv = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("a_live-trials.csv"))', file]);
    assert.equal(csv.toString('utf8'), 'id,dt\n1,120\n中文,3\n');
});
