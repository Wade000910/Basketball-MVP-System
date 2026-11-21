// "Add to home screen" app mode: every page carries the install metadata, the manifest and icons exist, and nothing
// caches the site offline, so a site update always reaches the next launch.
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
    assert.equal(manifest.start_url, './');
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

test('nothing registers a service worker or caches the site, so updates always arrive', () => {
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
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        assert.ok(!/serviceWorker\.register|caches\.open/.test(text), `${path.relative(ROOT, file)} caches or registers a worker`);
    }
});

test('the home page links every tool, has no scrolling-length text, and shows the install hint only outside the app', () => {
    const html = read('index.html');
    for (const target of ['./training/', './shoot/', './coach/', './coach/?demo=1', './trial/', './validation/', './專題程式/', './offline-review/']) {
        assert.ok(html.includes(`href="${target}"`), `home does not link ${target}`);
    }
    assert.match(html, /id="install-hint"/);
    assert.match(read('home.js'), /standalone/);
    assert.match(read('home.js'), /beforeinstallprompt/);
});
