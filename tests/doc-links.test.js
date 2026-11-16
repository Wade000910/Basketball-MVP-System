const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = ['README.md', 'ROADMAP.md']
  .concat(fs.readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f));

function brokenLinks(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  const out = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(target));
    if (!fs.existsSync(resolved)) out.push(m[1]);
  }
  return out;
}

test('relative links in README, ROADMAP and docs point to existing files', () => {
  const broken = {};
  for (const f of files) {
    const b = brokenLinks(f);
    if (b.length) broken[f] = b;
  }
  assert.deepEqual(broken, {});
});
