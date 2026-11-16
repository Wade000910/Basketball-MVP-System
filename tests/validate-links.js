const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Every local link, stylesheet and script in the shipped pages must resolve to a real file or directory page.
const pages = ['index.html', 'training/index.html', 'coach/index.html', 'validation/index.html', 'shoot/index.html', 'shoot/mark.html', 'offline-review/index.html', '專題程式/index.html'];
const broken = [];
for (const page of pages) {
    assert.equal(fs.existsSync(page), true, page + ' is missing');
    const html = fs.readFileSync(page, 'utf8');
    for (const [, , ref] of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
        if (!ref || /^(https?:|mailto:|data:|blob:|#|javascript:)/.test(ref)) continue;
        const target = path.join(path.dirname(page), decodeURIComponent(ref.split(/[?#]/)[0]));
        const ok = fs.existsSync(target) && (!fs.statSync(target).isDirectory() || fs.existsSync(path.join(target, 'index.html')));
        if (!ok) broken.push(page + ' -> ' + ref);
    }
}
assert.deepEqual(broken, [], 'Broken local references:\n' + broken.join('\n'));
console.log('Local link validation passed.');
