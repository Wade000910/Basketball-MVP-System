const fs = require('node:fs');

const html = fs.readFileSync('專題程式/index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(script => script.trim());

for (const script of inlineScripts) new Function(script);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const references = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
const missing = [...new Set(references.filter(id => !ids.has(id)))];

if (missing.length) throw new Error(`Missing HTML IDs: ${missing.join(', ')}`);
console.log(`HTML validation passed: ${inlineScripts.length} inline script(s), ${references.length} ID reference(s).`);
