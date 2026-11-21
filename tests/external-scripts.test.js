// Pages run with the player's sign-in session and the cloud key, so a script loaded from another site must
// be exactly the file that was reviewed: pinned to one version and checked with a hash (Subresource Integrity).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function htmlFiles(dir, out = []) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (['node_modules', '.git', 'vendor', 'docs'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) htmlFiles(p, out); else if (e.name.endsWith('.html')) out.push(p);
    }
    return out;
}

test('every script loaded from another site is pinned to an exact version and carries an integrity hash', () => {
    const problems = [];
    for (const file of htmlFiles(path.join(__dirname, '..'))) {
        const html = fs.readFileSync(file, 'utf8');
        for (const m of html.matchAll(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi)) {
            const tag = m[0], url = m[1];
            if (!/@\d+\.\d+\.\d+\//.test(url)) problems.push(`${path.basename(path.dirname(file))}/${path.basename(file)}: ${url} is not pinned to an exact version`);
            if (!/\bintegrity=["']sha(256|384|512)-/.test(tag)) problems.push(`${path.basename(path.dirname(file))}/${path.basename(file)}: ${url} has no integrity hash`);
            if (!/\bcrossorigin=/.test(tag)) problems.push(`${path.basename(path.dirname(file))}/${path.basename(file)}: ${url} needs crossorigin for the integrity check`);
        }
    }
    assert.deepEqual(problems, []);
});

test('no page loads a stylesheet, image, font or frame from another site', () => {
    const found = [];
    for (const file of htmlFiles(path.join(__dirname, '..'))) {
        const html = fs.readFileSync(file, 'utf8');
        for (const m of html.matchAll(/<(link|img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|href|data)=["'](https?:\/\/[^"']+)["']/gi)) {
            if (m[1].toLowerCase() === 'link' && /rel=["'](?:canonical|alternate|author|license)/.test(m[0])) continue;
            found.push(`${path.basename(file)}: ${m[2]}`);
        }
    }
    assert.deepEqual(found, []);
});
