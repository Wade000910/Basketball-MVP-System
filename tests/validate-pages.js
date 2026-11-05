const assert = require('node:assert/strict');
const fs = require('node:fs');

const landing = fs.readFileSync('index.html', 'utf8');

assert.match(landing, /<meta name="viewport"/);
assert.match(landing, /href="\.\/專題程式\/"/);
assert.match(landing, /球員訓練室/);
assert.match(landing, /href="\.\/training\/"/);
assert.match(landing, /href="\.\/offline-review\/"/);
assert.match(landing, /請勿輸入真實姓名/);
assert.equal(fs.existsSync('專題程式/index.html'), true);
assert.equal(fs.existsSync('專題程式/session-capture.js'), true);
assert.match(fs.readFileSync('專題程式/index.html','utf8'), /下載影片與分析資料/);
assert.equal(fs.existsSync('.nojekyll'), true);
assert.match(landing, /href="\.\/coach\/"/);
assert.match(landing, /href="\.\/validation\/"/);
const config = fs.readFileSync('shared/cloud-config.js', 'utf8').replace(/\/\/.*$/gm, '');
assert.doesNotMatch(config, /service_role|sb_secret_/, 'Never ship a secret Supabase key');
for (const page of ['training/index.html', 'coach/index.html', 'validation/index.html']) {
    const html = fs.readFileSync(page, 'utf8');
    for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) {
        if (/^https:\/\//.test(src)) assert.match(src, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\//, page + ' loads an unexpected remote script');
        else assert.equal(fs.existsSync(require('node:path').join(require('node:path').dirname(page), src)), true, page + ' references a missing script ' + src);
    }
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const scripts = [...html.matchAll(/<script src="(\.[^"]+)"/g)].map(m => fs.readFileSync(require('node:path').join(require('node:path').dirname(page), m[1]), 'utf8')).join('\n');
    for (const [, id] of scripts.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) assert.ok(ids.has(id), page + ' script references missing #' + id);
}

console.log('GitHub Pages landing-page validation passed.');
