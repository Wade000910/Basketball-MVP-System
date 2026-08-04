const assert = require('node:assert/strict');
const fs = require('node:fs');

const landing = fs.readFileSync('index.html', 'utf8');

assert.match(landing, /<meta name="viewport"/);
assert.match(landing, /href="\.\/專題程式\/"/);
assert.match(landing, /研究原型/);
assert.match(landing, /請勿輸入真實姓名/);
assert.equal(fs.existsSync('專題程式/index.html'), true);
assert.equal(fs.existsSync('.nojekyll'), true);

console.log('GitHub Pages landing-page validation passed.');
