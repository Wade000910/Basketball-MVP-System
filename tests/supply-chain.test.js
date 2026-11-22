// Code fetched from a CDN must be pinned: every script added by JavaScript from a remote address carries an
// integrity hash, so a swapped file is refused by the browser instead of running.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'tests', 'docs', 'vendor'].includes(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, out); else if (f.endsWith('.js')) out.push(f);
    }
    return out;
};

test('every script injected from a remote address has an integrity hash and anonymous CORS', () => {
    let remote = 0;
    for (const file of walk(ROOT)) {
        const text = fs.readFileSync(file, 'utf8');
        if (!/createElement\(['"]script['"]\)/.test(text) || !/https:\/\/cdn\./.test(text)) continue;
        remote++;
        assert.match(text, /\.integrity\s*=\s*\w+/, `${path.relative(ROOT, file)} injects a CDN script without integrity`);
        assert.match(text, /crossOrigin\s*=\s*['"]anonymous['"]/, `${path.relative(ROOT, file)} needs crossOrigin = 'anonymous' for integrity`);
        assert.match(text, /sha384-[A-Za-z0-9+/]{64}/, `${path.relative(ROOT, file)} has no pinned sha384 value`);
    }
    assert.ok(remote >= 1, 'the onnxruntime loader must be covered');
});
