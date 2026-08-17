const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('專題程式/index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(script => script.trim());

for (const script of inlineScripts) new Function(script);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const references = [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
const missing = [...new Set(references.filter(id => !ids.has(id)))];

if (missing.length) throw new Error(`Missing HTML IDs: ${missing.join(', ')}`);
assert.match(html, /latestPresentedFrameIndex===lastAnalyzedPresentedFrameIndex/, 'Pose loop must skip an already analyzed presented frame.');
assert.match(html, /lastAnalyzedPresentedFrameIndex=latestPresentedFrameIndex/, 'Pose loop must mark the presented frame before sending it.');
assert.match(html, /\.\/vendor\/mediapipe-pose\/pose\.js/, 'Pose JavaScript must load from the same-origin vendor directory.');
assert.match(html, /locateFile:\(f\)=>`\.\/vendor\/mediapipe-pose\/\$\{f\}`/, 'Pose runtime assets must resolve from the same-origin vendor directory.');
for (const file of ['pose.js','pose_landmark_full.tflite','pose_solution_packed_assets.data','pose_solution_packed_assets_loader.js','pose_solution_simd_wasm_bin.js','pose_solution_simd_wasm_bin.wasm','pose_solution_wasm_bin.js','pose_solution_wasm_bin.wasm','pose_web.binarypb','LICENSE','THIRD_PARTY_NOTICES.md']) {
    assert.equal(fs.existsSync(`專題程式/vendor/mediapipe-pose/${file}`), true, `Missing self-hosted MediaPipe Pose asset: ${file}`);
}
console.log(`HTML validation passed: ${inlineScripts.length} inline script(s), ${references.length} ID reference(s).`);
