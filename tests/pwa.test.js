// "Add to home screen" app mode: every page carries the install metadata, the manifest and icons exist, and the only worker keeps the pose model
// (and, as a fallback, the pages) on the phone; pages are always revalidated first, so a site update still reaches the next launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'coach/index.html', 'offline-review/index.html', 'shoot/index.html', 'shoot/mark.html', 'training/index.html', 'trial/index.html', 'validation/index.html', '專題程式/index.html'];
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

test('the manifest describes a standalone app that starts at the home page', () => {
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './shoot/', 'the app opens straight into practice');
    assert.equal(manifest.scope, './');
    assert.ok(manifest.name && manifest.short_name && manifest.short_name.length <= 12);
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
    assert.notEqual(manifest.orientation, 'portrait', 'the player must be able to film in landscape');
    assert.notEqual(manifest.orientation, 'landscape');
});

test('the manifest icons exist, are real PNG files, and include a maskable one', () => {
    const sizes = new Set();
    for (const icon of manifest.icons) {
        const file = path.join(ROOT, icon.src);
        assert.ok(fs.existsSync(file), `${icon.src} is missing`);
        const png = fs.readFileSync(file);
        assert.equal(png.subarray(1, 4).toString(), 'PNG', `${icon.src} is not a PNG`);
        const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
        assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} is ${w}x${h}`);
        sizes.add(icon.sizes + ':' + (icon.purpose || 'any'));
    }
    assert.ok(sizes.has('192x192:any') && sizes.has('512x512:any'));
    assert.ok(sizes.has('512x512:maskable'));
});

test('the iPhone home-screen icon exists and is 180x180', () => {
    const png = fs.readFileSync(path.join(ROOT, 'icons/apple-touch-icon.png'));
    assert.equal([png.readUInt32BE(16), png.readUInt32BE(20)].join('x'), '180x180');
});

test('every page links the manifest and the install metadata, with paths that resolve', () => {
    for (const file of PAGES) {
        const html = read(file);
        const up = path.dirname(file) === '.' ? '.' : '..';
        const link = /<link rel="manifest" href="([^"]+)"/.exec(html);
        assert.ok(link, `${file} has no manifest link`);
        assert.equal(link[1], `${up}/manifest.webmanifest`, file);
        const icon = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html);
        assert.ok(icon, `${file} has no apple-touch-icon`);
        assert.ok(fs.existsSync(path.join(ROOT, path.dirname(file), icon[1])), `${file} icon ${icon[1]} does not resolve`);
        assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/, file);
        assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/, file);
        assert.match(html, /<meta name="apple-mobile-web-app-title" content="[^"]+">/, file);
        assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/i, file);
        assert.match(html, /<meta name="viewport"[^>]*viewport-fit=cover/, `${file} must draw under the notch`);
    }
});

test('the security policy lets the manifest load and still blocks everything else', () => {
    for (const file of PAGES) {
        const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read(file))[1];
        assert.match(policy, /manifest-src 'self'/, file);
        assert.match(policy, /default-src 'none'/, file);
    }
});

test('only the model worker registers, and it never serves a stale page while the network answers', () => {
    const files = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', '.git', 'vendor', 'tests', 'docs'].includes(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(js|html)$/.test(entry.name)) files.push(full);
        }
    };
    walk(ROOT);
    const allowed = new Set(['sw.js', path.join('shoot', 'model-cache.js')]);
    for (const file of files) {
        const rel = path.relative(ROOT, file);
        if (allowed.has(rel)) continue;
        const text = fs.readFileSync(file, 'utf8');
        assert.ok(!/serviceWorker\.register|caches\.open/.test(text), `${rel} caches or registers a worker`);
    }
    const worker = read('sw.js');
    assert.match(worker, /no-cache/, 'pages are revalidated on every load so a site update reaches the next launch');
    assert.match(read('shoot/model-cache.js'), /serviceWorker\.register\('\.\.\/sw\.js'\)/);
});

test('the worker caches the pose model first and pages network-first, and skips every other origin', () => {
    const { kindOf } = require('../sw.js');
    const scope = 'https://example.github.io/Basketball-MVP-System/';
    assert.equal(kindOf(scope + '%E5%B0%88%E9%A1%8C%E7%A8%8B%E5%BC%8F/vendor/mediapipe-pose/pose_landmark_full.tflite', scope), 'model');
    assert.equal(kindOf(scope + 'shoot/', scope), 'shell');
    assert.equal(kindOf(scope + 'shoot/app.js', scope), 'shell');
    assert.equal(kindOf('https://cdn.jsdelivr.net/npm/x.js', scope), 'skip');
    assert.equal(kindOf('https://mhwzadmfihtcnujaadng.supabase.co/rest/v1/x', scope), 'skip');
    assert.equal(kindOf('https://example.github.io/Other/app.js', scope), 'skip');
    assert.equal(kindOf(scope + 'shoot/%E0%A4%A', scope), 'skip', 'a malformed escape is left to the network instead of throwing');
});

test('the root page hands over to practice, and the me pane links every tool and shows the install hint', () => {
    assert.match(read('index.html'), /url=\.\/shoot\//);
    assert.match(read('redirect.js'), /location\.replace\('\.\/shoot\/'/);
    const html = read('training/index.html');
    for (const target of ['../trial/', '../coach/', '../coach/?demo=1', '../validation/', '../專題程式/', '../offline-review/']) {
        assert.ok(html.includes(`href="${target}"`), `the me pane does not link ${target}`);
    }
    assert.match(html, /id="install-hint"/);
    assert.match(read('home.js'), /standalone/);
    assert.match(read('home.js'), /beforeinstallprompt/);
});

test('the four tabs point at real pages and every tab page loads the bar', () => {
    const bar = read('shared/tabbar.js');
    for (const target of ["'shoot/'", "'training/#records'", "'training/#team'", "'training/#me'"]) assert.ok(bar.includes(target), target);
    for (const [file, tab] of [['shoot/index.html', 'shoot'], ['training/index.html', 'panes'], ['coach/index.html', 'team']]) {
        const html = read(file);
        assert.match(html, new RegExp(`<body class="app" data-tab="${tab}">`), file);
        assert.match(html, /shared\/tabbar\.js/, file);
        assert.match(html, /shared\/app-skin\.css/, file);
    }
});
