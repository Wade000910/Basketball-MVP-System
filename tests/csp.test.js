// Every page carries a Content-Security-Policy that only allows what the page really uses. GitHub Pages cannot set
// headers, so it is a meta tag. If the cloud project address changes, the policy must change with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'coach/index.html', 'offline-review/index.html', 'shoot/index.html', 'shoot/mark.html', 'training/index.html', 'trial/index.html', 'validation/index.html', '專題程式/index.html'];
const policy = file => (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, file), 'utf8')) || [])[1];

test('every page has a content security policy', () => {
    for (const file of PAGES) assert.ok(policy(file), `${file} has no content security policy`);
});

test('the policy blocks everything it does not list and never allows eval or arbitrary scripts', () => {
    for (const file of PAGES) {
        const p = policy(file);
        assert.match(p, /default-src 'none'/, file);
        assert.match(p, /object-src 'none'/, file);
        assert.match(p, /base-uri 'none'/, file);
        assert.ok(!/'unsafe-eval'/.test(p), `${file} allows eval`);
        assert.ok(!/script-src[^;]*'unsafe-inline'/.test(p), `${file} allows any inline script`);
        assert.ok(!/script-src[^;]*\*/.test(p), `${file} allows scripts from anywhere`);
    }
});

test('inline scripts are allowed only by hash, and the hash matches the script', () => {
    const crypto = require('node:crypto');
    for (const file of PAGES) {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
            const hash = 'sha256-' + crypto.createHash('sha256').update(m[1]).digest('base64');
            assert.ok(policy(file).includes(`'${hash}'`), `${file}: the inline script changed, update its hash in the policy`);
        }
    }
});

test('the policy lets the page reach exactly the cloud project in the configuration', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'shared/cloud-config.js'), 'utf8');
    const host = /url:'https:\/\/([^']+)'/.exec(cfg)[1];
    for (const file of ['training/index.html', 'shoot/index.html', 'shoot/mark.html', 'coach/index.html']) {
        assert.ok(policy(file).includes(`https://${host}`), `${file} cannot reach ${host}`);
    }
});
