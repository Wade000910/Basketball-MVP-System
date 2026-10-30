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

console.log('GitHub Pages landing-page validation passed.');
