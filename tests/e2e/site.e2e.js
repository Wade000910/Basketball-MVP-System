// Browser tests for everything that does not need a real person: every page loads clean at phone and
// desktop sizes, the practice flow works with a fake camera, the coach page and the account flows work
// against an in-memory cloud. Needs Playwright with Chromium, so it is not part of `npm test`:
//   NODE_PATH=<dir with playwright> npm run test:e2e
// It skips itself when Playwright is not installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium, devices;
const ENGINE = process.env.E2E_BROWSER || 'chromium';   // chromium (default) or firefox
try {
    const pw = require('playwright');
    chromium = pw[ENGINE];
    // Firefox has no mobile emulation: keep the phone-sized screen, drop the touch flags
    devices = ENGINE === 'firefox' ? new Proxy(pw.devices, {get: (t, k) => (t[k] ? {...t[k], isMobile: undefined, hasTouch: undefined} : t[k])}) : pw.devices;
} catch { /* skipped below */ }
let axeSource = null;
try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* the accessibility test skips itself */ }
const skip = chromium ? false : 'playwright is not installed';
const ROOT = path.join(__dirname, '..', '..');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.data': 'application/octet-stream', '.binarypb': 'application/octet-stream', '.tflite': 'application/octet-stream'};

function serve() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
            if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
            res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
            fs.createReadStream(file).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve({server, base: `http://127.0.0.1:${server.address().port}/`}));
    });
}

// An in-memory stand-in for the cloud, used through the page's own override hook.
const FAKE_CLOUD = () => {
    const db = {user: null, teams: [{id: 't1', name: '大同資工系隊', invite_code: 'ABCDEFGH', role: 'coach'}], profileName: 'Coach', log: []};
    const note = name => db.log.push(name);
    globalThis.__cloud = db;
    const listeners = [];
    const setUser = u => { db.user = u; listeners.forEach(f => f(u)); };
    globalThis.CloudApiOverride = {
        async currentUser() { return db.user; },
        onAuthChange(fn) { listeners.push(fn); },
        async signIn(email) { setUser({id: 'u-coach', email}); return db.user; },
        async signUp(email) { setUser({id: 'u-coach', email}); return {user: db.user, needsConfirmation: false}; },
        async signOut() { setUser(null); },
        async profile() { return {id: 'u-coach', display_name: db.profileName}; },
        async saveProfile(id, name) { db.profileName = name; },
        async upsertSessions() {}, async ownSessions() { return []; }, async deleteSessions() {},
        async myTeams() { return db.teams.map(t => ({...t})); },
        async roster() { return [{user_id: 'u-coach', role: 'coach', name: 'Coach'}, {user_id: 'u-p1', role: 'player', name: '小明'}]; },
        async teamSessions() { return []; },
        async removeMember() { note('removeMember'); },
        async leaveTeam() { note('leaveTeam'); },
        async createTeam(name) { return {id: 't2', name, invite_code: 'ZZZZZZZZ'}; },
        async joinTeam() { return db.teams[0]; },
        async renameTeam(id, name) { note('rename:' + name); db.teams[0].name = name.trim(); return db.teams[0]; },
        async regenerateInviteCode() { note('rotate'); db.teams[0].invite_code = 'NEWCODE22'.slice(0, 8); return db.teams[0].invite_code; },
        async deleteTeam() { note('deleteTeam'); db.teams = []; },
        async deleteAccount() { note('deleteAccount'); }
    };
};

test('browser tests', {skip}, async t => {
    const {server, base} = await serve();
    const browser = await chromium.launch(ENGINE === 'firefox'
        ? {firefoxUserPrefs: {'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true}}
        : {args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']});
    if (ENGINE === 'firefox') { const real = browser.newContext.bind(browser); browser.newContext = o => { const {permissions, ...rest} = o || {}; return real(rest); }; }
    t.after(async () => { await browser.close(); server.close(); });
    // The first-run guide covers the page; tests start with it already seen unless they ask for it.
    {
        const real = browser.newContext.bind(browser);
        browser.newContext = async (options, {guide = false} = {}) => {
            const context = await real(options);
            if (!guide) await context.addInitScript(() => { try { localStorage.setItem('bmvp-onboarded', '1'); } catch { /* ignore */ } });
            return context;
        };
    }

    const PAGES = ['', 'coach/', 'coach/?demo=1', 'offline-review/', 'shoot/', 'shoot/mark.html', 'training/', 'validation/', 'trial/', 'trial/#summary', '專題程式/'];
    const PROFILES = {'phone upright': devices['iPhone 13'], 'phone on its side': devices['iPhone 13 landscape'], desktop: {viewport: {width: 1280, height: 800}}};

    for (const [pname, profile] of Object.entries(PROFILES)) {
        await t.test(`every page loads clean on ${pname}`, async () => {
            const context = await browser.newContext({...profile, permissions: ['camera', 'microphone']});
            const problems = [];
            for (const url of PAGES) {
                const page = await context.newPage();
                page.on('pageerror', e => problems.push(`${url} JS: ${e.message}`));
                page.on('console', m => { if (/Content.Security.Policy|Refused to/i.test(m.text())) problems.push(`${url} policy violation: ${m.text()}`); else if (m.type() === 'error' && !/supabase|jsdelivr|Failed to load resource/.test(m.text())) problems.push(`${url} console: ${m.text()}`); });
                page.on('response', r => { if (r.status() >= 400 && !/supabase|jsdelivr/.test(r.url())) problems.push(`${url} ${r.status()} ${r.url()}`); });
                await page.goto(base + url, {waitUntil: 'networkidle'});
                const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                if (over > 1) problems.push(`${url} scrolls sideways by ${over}px`);
                const unnamed = await page.evaluate(() => [...document.querySelectorAll('button,a,input,select')].filter(e => !e.hidden && e.offsetParent && !(e.textContent.trim() || e.getAttribute('aria-label') || (e.labels && e.labels.length) || e.title || e.placeholder)).map(e => e.id || e.tagName));
                if (unnamed.length) problems.push(`${url} controls without a name: ${unnamed}`);
                await page.close();
            }
            await context.close();
            assert.deepEqual(problems, []);
        });
    }

    const noPose = ENGINE === 'firefox' ? 'headless Firefox has no WebGL, which the pose model needs' : false;
    await t.test('practice: make and miss buttons, undo, finish, and the set reaches the training history', {skip: noPose}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P777');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 20000});
        const ratio = await page.evaluate(() => document.getElementById('practice-view').style.getPropertyValue('--stage-ratio'));
        assert.match(ratio, /^\d+ \/ \d+$/, 'the picture frame follows the real video shape');
        // the lighter-model switch: the button is hidden until the phone struggles, so show it and press it
        await page.evaluate(() => { document.getElementById('lite-btn').hidden = false; });
        await page.click('#lite-btn');
        assert.equal(await page.isHidden('#lite-btn'), true);
        assert.match(await page.textContent('#last-note'), /較輕/);
        await page.waitForTimeout(1500);
        assert.match(await page.textContent('#fps'), /fps/, 'analysis keeps running after the switch');
        for (const id of ['made-btn', 'made-btn', 'made-btn', 'missed-btn', 'missed-btn']) { await page.click('#' + id); await page.waitForTimeout(3200); /* two results within 3 s with no motion trial count as the same shot, on purpose */ }
        assert.equal(await page.textContent('#score-made'), '3');
        assert.equal(await page.textContent('#score-total'), '5');
        await page.click('#undo-btn');
        assert.equal(await page.textContent('#score-total'), '4');
        await page.click('#end-btn');
        assert.equal(await page.evaluate(() => localStorage.getItem('basketball-training-v1')), null, 'ending a set only shows the summary; nothing is saved to the history yet');
        await page.click('#again-btn');   // 存起來
        await page.waitForFunction(() => /已存到/.test(document.getElementById('sum-save').textContent));
        assert.match(await page.evaluate(() => localStorage.getItem('basketball-training-v1')), /P777/, 'the finished set is saved on this device');
        assert.equal(await page.evaluate(() => localStorage.getItem('basketball-shoot-active-v1')), null, 'and the unfinished copy is cleared');
        assert.deepEqual(errors, [], 'no script errors during the whole practice');
        await context.close();
    });

    await t.test('practice video: recorded when asked for, kept on the phone, tagged in the records and played back; deleting removes it', {skip: noPose || (ENGINE !== 'chromium' && 'only Chromium records the fake camera here')}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P888');
        await page.click('#settings summary');
        await page.check('#video-on');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 20000});
        await page.waitForTimeout(2500);
        await page.click('#made-btn');
        await page.click('#end-btn');
        await page.waitForSelector('#keep-video-row:not([hidden])', {timeout: 8000});
        assert.match(await page.textContent('#keep-video-info'), /\d+:\d\d · .*不會上傳/);
        await page.click('#again-btn');
        await page.waitForFunction(() => /影片也存好了/.test(document.getElementById('sum-save').textContent), null, {timeout: 8000});
        assert.equal(await page.isHidden('#keep-video-row'), true);

        await page.goto(base + 'training/#records');
        await page.waitForSelector('#history-list .history-item .video-tag');
        await page.click('#history-list .history-item');
        await page.waitForSelector('#session-video:not([hidden])');
        assert.ok(await page.evaluate(() => document.getElementById('video-player').src.startsWith('blob:')), 'the video plays from this phone');
        await page.click('#video-delete');
        assert.match(await page.textContent('#video-delete'), /確定刪除/);
        await page.click('#history-list .history-item');   // opening a set again cancels a half-pressed delete
        assert.equal(await page.textContent('#video-delete'), '刪除這段影片');
        await page.click('#video-delete');
        await page.click('#video-delete');
        await page.waitForSelector('#session-video', {state: 'hidden'});
        assert.equal(await page.evaluate(() => VideoStore.list().then(r => r.length)), 0, 'deleted from the phone');
        assert.deepEqual(errors, []);
        await context.close();
    });

    await t.test('a set recorded without the video option never asks to keep one', {skip: noPose}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        const page = await context.newPage();
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P889');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.click('#made-btn');
        await page.click('#end-btn');
        await page.waitForSelector('#summary-view:not([hidden])');
        await page.waitForTimeout(600);
        assert.equal(await page.isHidden('#keep-video-row'), true);
        await context.close();
    });

    await t.test('records filter: by period; only free throws are listed and older sets of other types are kept untouched', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        await page.goto(base + 'training/#records');
        await page.evaluate(() => {
            const C = TrainingCore, day = 864e5, now = Date.now();
            const make = (id, drill, ago) => {
                const at = new Date(now - ago * day).toISOString();
                let s = C.createSession({playerCode: 'P1', targetShots: 10, drill, position: drill === 'free_throw' ? 'center' : 'left', id, now: at});
                s = C.addShot(s, true, id + '-a', at); s = C.addShot(s, false, id + '-b', at);
                return C.finishSession(s, at);
            };
            const history = [make('s-today', 'free_throw', 0), make('s-ten', 'free_throw', 10), make('s-fifty', 'free_throw', 50), make('s-three', 'three_point', 2)];
            localStorage.setItem('basketball-training-v1', JSON.stringify({schemaVersion: C.SCHEMA, active: null, history}));
        });
        await page.reload();
        const count = () => page.locator('#history-list .history-item').count();
        assert.equal(await count(), 3, 'free throws only; the three-point set is not listed');
        await page.click('#history-filter [data-days="7"]');
        assert.equal(await count(), 1);
        await page.click('#history-filter [data-days="30"]');
        assert.equal(await count(), 2);
        await page.click('#history-filter [data-days="all"]');
        assert.equal(await count(), 3);
        assert.equal(await page.isHidden('#drill-type'), true, 'no drill choice any more');
        assert.equal(await page.locator('#drill-progress > div').count(), 1, 'only the free-throw card');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('basketball-training-v1')).history.length), 4, 'nothing deleted');
        await context.close();
    });

    await t.test('coach demo: summary, roster detail, CSV download, no team admin', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], acceptDownloads: true});
        const page = await context.newPage();
        await page.goto(base + 'coach/?demo=1');
        await page.waitForSelector('#coach-dashboard:not([hidden])');
        assert.notEqual((await page.textContent('#kpi-shots')).trim(), '—');
        assert.equal(await page.isHidden('#team-admin'), true, 'demo has no team management');
        await page.click('#csv-btn', {noWaitAfter: true}).catch(() => {});
        const [download] = await Promise.all([page.waitForEvent('download'), page.click('#csv-btn')]);
        assert.match(download.suggestedFilename(), /^DEMO-team-shots-/);
        const first = page.locator('.roster tbody tr').first();
        await first.click();
        await page.waitForSelector('#player-detail:not([hidden])');
        await context.close();
    });

    for (const [label, viewport] of [['small phone', {width: 360, height: 640}], ['iPhone', {width: 390, height: 844}], ['phone on its side', {width: 844, height: 390}]]) {
        await t.test(`the start button and the tab bar are on screen without scrolling on a ${label}`, async () => {
            const context = await browser.newContext({viewport});
            await context.addInitScript(() => { try { localStorage.setItem('bmvp-onboarded', '1'); } catch { /* ignore */ } });
            const page = await context.newPage();
            await page.goto(base + 'shoot/');
            const box = async sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return {top: r.top, bottom: r.bottom, h: r.height}; }, sel);
            const start = await box('#start-btn'), bar = await box('.tabbar');
            assert.ok(start.top >= 0 && start.bottom <= bar.top + 1, `start button is cut off (${JSON.stringify(start)} vs bar ${bar.top})`);
            assert.ok(bar.bottom <= viewport.height + 1 && bar.h >= 40);
            assert.equal(await page.locator('.tabbar a').count(), 4);
            await context.close();
        });
    }

    await t.test('the first-run guide shows once, can be skipped, and ?guide=1 brings it back', async () => {
        const context = await browser.newContext({...devices['iPhone 13']}, {guide: true});
        const page = await context.newPage();
        await page.goto(base + 'shoot/');
        assert.equal(await page.isVisible('#onboarding'), true);
        assert.equal(await page.textContent('#ob-next'), '下一步');
        await page.click('#ob-next'); await page.click('#ob-next');
        assert.equal(await page.textContent('#ob-next'), '開始練投');
        await page.click('#ob-next');
        assert.equal(await page.isVisible('#onboarding'), false);
        await page.reload();
        assert.equal(await page.isVisible('#onboarding'), false, 'seen once, stays closed');
        await page.goto(base + 'shoot/?guide=1');
        assert.equal(await page.isVisible('#onboarding'), true);
        await page.click('#ob-skip');
        assert.equal(await page.isVisible('#onboarding'), false);
        await context.close();
    });

    await t.test('tabs switch panes on the training page without reloading, and the tab bar marks the current one', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        await page.goto(base + 'training/#records');
        await page.evaluate(() => { window.__same = true; });
        const current = async () => { await page.waitForTimeout(150); return page.evaluate(() => document.querySelector('.tabbar a[aria-current=page]').dataset.tab); };
        assert.equal(await current(), 'records');
        assert.equal(await page.isVisible('#player-home'), true);
        assert.equal(await page.isVisible('#cloud-panel'), false);
        await page.click('.tabbar a[data-tab=team]');
        assert.equal(await current(), 'team');
        assert.equal(await page.isVisible('#team-panel'), true);
        assert.equal(await page.isVisible('#player-home'), false);
        await page.click('.tabbar a[data-tab=me]');
        assert.equal(await current(), 'me');
        assert.equal(await page.isVisible('#cloud-panel'), true);
        assert.equal(await page.isVisible('#backup-banner'), true, 'logged out: the backup reminder shows');
        assert.equal(await page.evaluate(() => window.__same), true, 'same page, no reload');
        await page.click('.tabbar a[data-tab=shoot]');
        await page.waitForURL(/shoot\//);
        await context.close();
    });

    await t.test('the me pane: install hint on iPhone Safari is closable and remembered, and hidden inside the installed app', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        await page.goto(base + 'training/#me');
        assert.equal(await page.isVisible('#install-hint'), true);
        assert.match(await page.textContent('#install-text'), /分享鈕.*加入主畫面/);
        await page.click('#install-close');
        assert.equal(await page.isVisible('#install-hint'), false);
        await page.reload();
        assert.equal(await page.isVisible('#install-hint'), false, 'a closed hint stays closed');
        await context.close();

        const installed = await browser.newContext({...devices['iPhone 13']});
        await installed.addInitScript(() => Object.defineProperty(navigator, 'standalone', {value: true}));
        const app = await installed.newPage();
        await app.goto(base + 'training/#me');
        assert.equal(await app.isVisible('#install-hint'), false, 'no hint inside the installed app');
        await installed.close();
    });

    await t.test('theme choice: dark, light and follow-the-phone are applied and remembered', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], colorScheme: 'dark'});
        const page = await context.newPage();
        await page.goto(base + 'training/#me');
        const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const dark = await bg();
        await page.click('#theme-choice [data-theme-value=light]');
        const light = await bg();
        assert.notEqual(dark, light);
        await page.reload();
        assert.equal(await bg(), light, 'remembered');
        await page.click('#theme-choice [data-theme-value=system]');
        assert.equal(await bg(), dark, 'follows the phone again');
        await context.close();
    });

    await t.test('the manifest and icon are served', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        assert.equal((await page.goto(base + 'manifest.webmanifest')).status(), 200);
        assert.equal((await page.request.get(base + 'icons/icon-192.png')).status(), 200);
        await context.close();
    });

    await t.test('coach management against the in-memory cloud: rename, rotate the code, delete the team', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        await context.addInitScript(FAKE_CLOUD);
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'coach/');
        await page.fill('#coach-email', 'coach@example.com');
        await page.fill('#coach-password', 'secret1');
        await page.click('#coach-signin-form button[type=submit]');
        await page.waitForSelector('#team-admin:not([hidden])');
        assert.equal(await page.inputValue('#rename-input'), '大同資工系隊');
        assert.equal(await page.textContent('#invite-code'), 'ABCDEFGH');
        await page.fill('#rename-input', '  資工系籃  ');
        await page.click('#rename-form button[type=submit]');
        await page.waitForTimeout(300);
        await page.click('#rotate-code');
        await page.waitForFunction(() => document.getElementById('invite-code').textContent !== 'ABCDEFGH');
        await page.click('#delete-team');
        await page.waitForTimeout(400);
        const log = await page.evaluate(() => globalThis.__cloud.log);
        assert.deepEqual(log.filter(x => !x.startsWith('rename') || x === 'rename:  資工系籃  '), ['rename:  資工系籃  ', 'rotate', 'deleteTeam']);
        assert.equal(await page.isHidden('#coach-dashboard'), true, 'no team left, so the dashboard closes');
        await context.close();
    });

    await t.test('player account: signing in shows the account panel and deleting the account signs out', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        await context.addInitScript(FAKE_CLOUD);
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'training/#me');
        await page.fill('#cloud-email', 'p@example.com');
        await page.fill('#cloud-password', 'secret1');
        await page.click('#cloud-signin-btn');
        await page.waitForSelector('#cloud-account:not([hidden])');
        await page.click('#cloud-delete-btn');
        await page.waitForSelector('#cloud-signin:not([hidden])');
        const log = await page.evaluate(() => globalThis.__cloud.log);
        assert.ok(log.includes('deleteAccount'));
        await context.close();
    });
    await t.test('teammate marking page: the code is checked, then make and miss go to the cloud', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        await context.addInitScript(() => { globalThis.CloudApiOverride = {marks: [], async addShotMark(code, made) { this.marks.push([code, made]); globalThis.__marks = this.marks; }}; });
        const page = await context.newPage();
        await page.goto(base + 'shoot/mark.html');
        await page.fill('#code', 'abc');
        await page.press('#code', 'Enter');
        assert.equal(await page.isHidden('#mark-panel'), true, 'a short code is refused');
        await page.fill('#code', 'abc234');
        await page.press('#code', 'Enter');
        await page.waitForSelector('#mark-panel:not([hidden])');
        assert.equal(await page.textContent('#code-label'), 'ABC234');
        await page.click('#made');
        await page.waitForFunction(() => !document.getElementById('made').disabled);
        await page.click('#missed');
        await page.waitForFunction(() => /第 2 筆/.test(document.getElementById('sent').textContent));
        assert.deepEqual(await page.evaluate(() => globalThis.__marks), [['ABC234', true], ['ABC234', false]]);
        await context.close();
    });

    await t.test('training page: record a free-throw set by hand and read the report', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'training/');
        await page.fill('#player-code', 'P888');
        await page.selectOption('#target-shots', {index: 0});
        await page.click('#setup-form button[type=submit]');
        await page.waitForSelector('#session-panel:not([hidden])');
        const target = Number((await page.textContent('#progress-label')).match(/\d+/g).pop());
        for (let i = 0; i < target; i++) { await page.click(i % 2 ? '#missed-btn' : '#made-btn'); }
        await page.waitForSelector('#report-panel:not([hidden])', {timeout: 8000}).catch(async () => { await page.click('#finish-btn'); await page.waitForSelector('#report-panel:not([hidden])'); });
        assert.match(await page.textContent('#report-summary'), /\d/);
        const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
        assert.match(stored, /P888/);
        await context.close();
    });
    await t.test('accessibility: no WCAG AA violations on the main pages (needs axe-core)', {skip: axeSource ? false : 'axe-core is not installed'}, async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const found = [];
        for (const url of ['', 'coach/?demo=1', 'shoot/', 'shoot/mark.html', 'training/', 'offline-review/', 'validation/', 'trial/', 'trial/#summary', '專題程式/']) {
            const page = await context.newPage();
            await page.goto(base + url);
            await page.waitForTimeout(400);
            await page.evaluate(axeSource);
            const result = await page.evaluate(() => axe.run({runOnly: ['wcag2a', 'wcag2aa']}));
            for (const v of result.violations) found.push(`${url} ${v.id} (${v.nodes.length})`);
            await page.close();
        }
        await context.close();
        assert.deepEqual(found, []);
    });
    await t.test('camera make/miss (experimental): a scripted detector makes the page record a make, a miss, and ask when unsure', {skip: noPose}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        await context.addInitScript(() => {
            // a scripted detector: the next shot's ball path is chosen by the test
            const HOOP = {cx: 0.5, cy: 0.3, w: 0.12};
            const paths = {make: [[0.45, 0.12], [0.49, 0.2], [0.5, 0.27], [0.5, 0.33], [0.5, 0.42]], miss: [[0.3, 0.1], [0.34, 0.2], [0.36, 0.28], [0.37, 0.36], [0.37, 0.5]], none: []};
            let step = 0;
            globalThis.__script = {path: 'none', arm(name) { this.path = name; step = 0; }};
            globalThis.BallDetectorOverride = {
                async available() { return true; },
                async detect() {
                    const p = paths[globalThis.__script.path][step++];
                    return {ball: p ? {x: p[0], y: p[1], r: 0.025} : null, hoop: HOOP};
                }
            };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + 'shoot/');
        await page.waitForFunction(() => !document.getElementById('camera-on').disabled);
        await page.click('#settings summary');   // the options are folded away until asked for
        await page.check('#camera-on');
        await page.fill('#player-code', 'P555');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 20000});
        const release = () => page.evaluate(() => ShootApp.onTrial({status: 'accepted', reasonCode: '', dt: 80, dtPeak: 120, measuredFps: 29.5, timestampSource: 'camera-frame', algorithmVersion: 'player-peak-v1'}));
        await page.waitForTimeout(1500);
        await page.evaluate(() => globalThis.__script.arm('make'));
        await release();
        await page.waitForFunction(() => document.getElementById('score-total').textContent === '1', null, {timeout: 8000});
        assert.equal(await page.textContent('#score-made'), '1', 'the ball dropping through the hoop is recorded as a make');
        await page.waitForTimeout(3300);
        await page.evaluate(() => globalThis.__script.arm('miss'));
        await release();
        await page.waitForFunction(() => document.getElementById('score-total').textContent === '2', null, {timeout: 8000});
        assert.equal(await page.textContent('#score-made'), '1', 'a ball beside the rim is a miss');
        await page.waitForTimeout(3300);
        await page.evaluate(() => globalThis.__script.arm('none'));
        await release();
        await page.waitForFunction(() => /請按進或沒進/.test(document.getElementById('last-note').textContent), null, {timeout: 8000});
        assert.equal(await page.textContent('#score-total'), '2', 'an unclear shot is not recorded by the camera');
        await page.waitForTimeout(3300);
        await page.evaluate(() => globalThis.__script.arm('make'));
        await release();
        await page.click('#missed-btn'); // the player answers first; the camera must not add a second entry
        await page.waitForTimeout(4500);
        assert.equal(await page.textContent('#score-total'), '3', 'one shot is counted once even when the camera also saw it');
        assert.equal(await page.textContent('#score-made'), '1', 'the player\'s answer wins');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await t.test('camera make/miss: the player taps the rim edges, and the page uses that hoop', {skip: noPose}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        await context.addInitScript(() => {
            const make = [[0.45, 0.12], [0.49, 0.2], [0.5, 0.27], [0.5, 0.33], [0.5, 0.42]];
            let step = 0;
            globalThis.__arm = () => { step = 0; };
            // the detector finds the ball only; the hoop comes from the player's taps
            globalThis.BallDetectorOverride = {
                async available() { return true; },
                async detect() { const p = make[step++]; return {ball: p ? {x: p[0], y: p[1], r: 0.025} : null, hoop: null}; }
            };
        });
        const page = await context.newPage();
        await page.goto(base + 'shoot/');
        await page.waitForFunction(() => !document.getElementById('camera-on').disabled);
        await page.click('#settings summary');   // the options are folded away until asked for
        await page.check('#camera-on');
        await page.fill('#player-code', 'P556');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 20000});
        assert.match(await page.textContent('#hoop-hint'), /左邊緣/);
        const at = (px, py) => page.evaluate(([x, y]) => {
            const r = document.querySelector('.stage').getBoundingClientRect(), v = document.getElementById('video');
            const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
            return {x: r.left + (r.width - w) / 2 + x * w, y: r.top + (r.height - h) / 2 + y * h};
        }, [px, py]);
        const left = await at(0.44, 0.3), right = await at(0.56, 0.3);
        await page.mouse.click(left.x, left.y);
        assert.match(await page.textContent('#hoop-hint'), /右邊緣/);
        await page.mouse.click(right.x, right.y);
        const hoop = await page.evaluate(() => ShootApp.hoop());
        assert.ok(Math.abs(hoop.cx - 0.5) < 0.01 && Math.abs(hoop.cy - 0.3) < 0.01 && Math.abs(hoop.w - 0.12) < 0.01, JSON.stringify(hoop));
        assert.equal(await page.isHidden('#hoop-hint'), true);
        await page.evaluate(() => { globalThis.__arm(); return ShootApp.onTrial({status: 'accepted', reasonCode: '', dt: 80, dtPeak: 120, measuredFps: 29.5, timestampSource: 'camera-frame', algorithmVersion: 'player-peak-v1'}); });
        await page.waitForFunction(() => document.getElementById('score-total').textContent === '1', null, {timeout: 8000});
        assert.equal(await page.textContent('#score-made'), '1', 'with the tapped hoop, the ball dropping through is a make');
        await page.click('#rim-btn');
        assert.equal(await page.evaluate(() => ShootApp.hoop()), null, 'the hoop can be set again');
        await context.close();
    });
    await t.test('trial survey: a participant fills it in and downloads an answer file, then the lead sums two files', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], acceptDownloads: true});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + 'trial/');
        // submitting with nothing filled in is refused with a clear message
        await page.fill('#code', 'P101');
        await page.click('#finish-btn');
        assert.match(await page.textContent('#survey-message'), /沒回答/);
        const fill = async (name, values) => { for (let i = 0; i < values.length; i++) await page.click(`label:has(input[name="${name}${i}"][value="${values[i]}"])`); };
        await fill('sus', [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
        await fill('product', [5, 4, 3, 4, 5]);
        await page.fill('#open0', '記錄很快');
        const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#finish-btn')]);
        assert.equal(d1.suggestedFilename(), 'trial-P101.json');
        const file1 = await d1.createReadStream().then(s => new Promise(r => { let x = ''; s.on('data', c => x += c); s.on('end', () => r(x)); }));
        const answer1 = JSON.parse(file1);
        assert.equal(answer1.susScore, 100);
        assert.equal(answer1.code, 'P101');
        // a second participant with a middling score, built the same way
        const answer2 = {...answer1, code: 'P102', susScore: 50, sus: Array(10).fill(3), open: ['', '同步慢', '']};
        // the lead loads both files and a broken one
        await page.click('#tab-sum');
        await page.setInputFiles('#files', [
            {name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(file1)},
            {name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(answer2))},
            {name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops')}
        ]);
        await page.waitForSelector('#summary-result:not([hidden])');
        assert.equal(await page.textContent('#sum-n'), '2');
        assert.equal(await page.textContent('#sum-mean'), '75');
        assert.match(await page.textContent('#summary-message'), /略過 1/);
        assert.match(await page.textContent('#sum-target'), /達到目標/);
        assert.match(await page.textContent('#open-answers'), /同步慢/);
        const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#csv-btn')]);
        assert.equal(csv.suggestedFilename(), 'trial-answers.csv');
        assert.deepEqual(errors, []);
        await context.close();
    });
    // ---------- hostile and awkward conditions ----------
    const GARBAGE = ['null', '{', '[]', '"text"', '123', '{"schemaVersion":"basketball-training-v1","active":null,"history":"x"}', '{"schemaVersion":"basketball-training-v1","active":{"id":1},"history":[]}', '{"__proto__":{"polluted":1}}', '\u0000\u0001', 'x'.repeat(200000)];
    for (const [pageName, url] of [['training', 'training/'], ['shooting', 'shoot/'], ['coach demo', 'coach/?demo=1']]) {
        await t.test(`corrupted saved data does not break the ${pageName} page`, async () => {
            const context = await browser.newContext({...devices['iPhone 13']});
            const problems = [];
            for (const garbage of GARBAGE) {
                const page = await context.newPage();
                page.on('pageerror', e => problems.push(`${garbage.slice(0, 40)} -> ${e.message}`));
                await page.addInitScript(g => { for (const k of ['basketball-training-v1', 'basketball-analysis-v1', 'basketball-shoot-active-v1', 'basketball-shoot-player']) localStorage.setItem(k, g); }, garbage);
                await page.goto(base + url, {waitUntil: 'load'});
                await page.waitForTimeout(500);
                const visible = await page.evaluate(() => [...document.querySelectorAll('button,input,select,a')].filter(e => !e.hidden && e.offsetParent).length);
                if (visible < 3) problems.push(`${garbage.slice(0, 40)} -> the page shows almost nothing`);
                await page.close();
            }
            await context.close();
            assert.deepEqual(problems, []);
        });
    }

    await t.test('a camera that is refused still lets the player record by hand', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});   // no camera permission, no fake device
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P321');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => /相機未啟動/.test(document.getElementById('state-badge').textContent));
        assert.match(await page.textContent('#practice-message'), /仍可用按鈕/);
        await page.click('#made-btn');
        assert.equal(await page.textContent('#score-total'), '1');
        assert.deepEqual(errors, []);
        await context.close();
    });

    await t.test('double taps and rapid taps record one shot each, not two', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera']});
        const page = await context.newPage();
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P322');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.dblclick('#made-btn');
        await page.waitForTimeout(200);
        assert.equal(await page.textContent('#score-total'), '1', 'a double tap is one shot');
        await page.click('#missed-btn');
        await page.waitForTimeout(100);
        assert.equal(await page.textContent('#score-total'), '1', 'a conflicting tap right after is not a second shot');
        await context.close();
    });

    await t.test('reloading in the middle of a set offers to resume, and nothing is lost', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera']});
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P323');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.click('#made-btn');
        await page.waitForTimeout(3300);
        await page.click('#missed-btn');
        await page.reload();
        await page.waitForSelector('#resume-card:not([hidden])');
        await page.click('#resume-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        assert.equal(await page.textContent('#score-total'), '2');
        assert.equal(await page.textContent('#score-made'), '1');
        await page.click('#end-btn');
        await page.click('#again-btn');
        await page.waitForFunction(() => /已存到/.test(document.getElementById('sum-save').textContent));
        const stored = await page.evaluate(() => localStorage.getItem('basketball-training-v1'));
        assert.match(stored, /P323/);
        assert.match(stored, /"made":true/, 'the resumed set keeps the shots recorded before the reload');
        assert.equal(await page.evaluate(() => localStorage.getItem('basketball-shoot-active-v1')), null, 'the unfinished set is cleared after it is saved');
        await context.close();
    });

    await t.test('player code and set size are checked before a set starts', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const page = await context.newPage();
        await page.goto(base + 'shoot/');
        assert.equal(await page.getAttribute('#player-code', 'maxlength'), '32');
        for (const bad of ['', 'a b', '<script>', '王小明', '../../etc', 'a;b', 'a\nb']) {
            await page.fill('#player-code', bad);
            await page.click('#start-btn');
            assert.equal(await page.isVisible('#practice-view'), false, `"${bad}" must not start a set`);
        }
        await context.close();
    });

    await t.test('signing in while the network fails keeps local records and explains what happened', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        await context.addInitScript(() => {
            const real = {online: false, calls: 0};
            globalThis.__net = real;
            const down = () => Promise.reject(new TypeError('Failed to fetch'));
            let user = null; const listeners = [];
            globalThis.CloudApiOverride = {
                async currentUser() { return user; }, onAuthChange(fn) { listeners.push(fn); },
                async signIn(email) { user = {id: 'u1', email}; listeners.forEach(f => f(user)); return user; },
                async signOut() { user = null; listeners.forEach(f => f(null)); },
                async profile() { return {id: 'u1', display_name: 'P'}; }, async saveProfile() {},
                async myTeams() { return []; },
                async ownSessions() { real.calls++; return real.online ? [] : down(); },
                async upsertSessions(rows) { real.calls++; return real.online ? undefined : down(); },
                async deleteSessions() {}
            };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + 'training/');
        await page.fill('#player-code', 'P324');
        await page.click('#setup-form button[type=submit]');
        await page.waitForSelector('#session-panel:not([hidden])');
        await page.click('#made-btn');
        await page.click('.tabbar a[data-tab=me]');
        await page.fill('#cloud-email', 'p@example.com');
        await page.fill('#cloud-password', 'secret1');
        await page.click('#cloud-signin-btn');
        await page.waitForSelector('#cloud-account:not([hidden])');
        await page.waitForFunction(() => /連不上雲端|仍保存在這台裝置/.test(document.getElementById('cloud-status').textContent), null, {timeout: 8000});
        assert.match(await page.evaluate(() => localStorage.getItem('basketball-training-v1')), /P324/, 'local records are untouched');
        await page.evaluate(() => { globalThis.__net.online = true; });
        await page.click('#cloud-sync-btn');
        await page.waitForFunction(() => /已同步/.test(document.getElementById('cloud-status').textContent), null, {timeout: 8000});
        assert.deepEqual(errors, []);
        await context.close();
    });
    await t.test('the training page survives a full storage, a blocked storage and a clock set far from now', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        // storage that throws on every use, as in some private windows
        const blocked = await context.newPage();
        const blockedErrors = [];
        blocked.on('pageerror', e => blockedErrors.push(e.message));
        await blocked.addInitScript(() => {
            const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
            Object.defineProperty(window, 'localStorage', {get: boom});
        });
        await blocked.goto(base + 'training/');
        await blocked.waitForTimeout(500);
        assert.deepEqual(blockedErrors, [], 'blocked storage must not break the page');
        await blocked.close();
        // storage that is full: saving fails with a quota error
        const full = await context.newPage();
        const fullErrors = [];
        full.on('pageerror', e => fullErrors.push(e.message));
        await full.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
        await full.goto(base + 'training/');
        await full.fill('#player-code', 'P401');
        await full.click('#setup-form button[type=submit]');
        await full.waitForTimeout(500);
        assert.deepEqual(fullErrors, [], 'a full disk is reported, not thrown');
        await full.close();
        // a clock in the year 2099 and one in 1970
        for (const iso of ['2099-01-01T00:00:00Z', '1970-01-01T00:00:00Z']) {
            const fresh = await browser.newContext({...devices['iPhone 13']});   // each clock starts with empty storage
            const p = await fresh.newPage();
            const errs = [];
            p.on('pageerror', e => errs.push(e.message));
            await p.addInitScript(fake => { const real = Date, offset = new real(fake).getTime() - real.now(); globalThis.Date = class extends real { constructor(...a) { a.length ? super(...a) : super(real.now() + offset); } static now() { return real.now() + offset; } }; }, iso);
            await p.goto(base + 'training/');
            await p.fill('#player-code', 'P402');
            await p.click('#setup-form button[type=submit]');
            await p.waitForSelector('#session-panel:not([hidden])');
            await p.click('#made-btn');
            await p.click('#finish-btn').catch(() => {});
            await p.waitForTimeout(300);
            assert.deepEqual(errs, [], `clock ${iso}`);
            await fresh.close();
        }
        await context.close();
    });

    await t.test('hostile names and notes are shown as text, never run', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        await context.addInitScript(() => {
            const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
            globalThis.__evil = evil;
            const db = {teams: [{id: 't1', name: evil, invite_code: 'ABCDEFGH', role: 'coach'}]};
            globalThis.CloudApiOverride = {
                async currentUser() { return {id: 'u1', email: 'c@example.com'}; }, onAuthChange() {},
                async signIn() { return {id: 'u1', email: 'c@example.com'}; }, async signOut() {},
                async profile() { return {id: 'u1', display_name: evil}; }, async saveProfile() {},
                async myTeams() { return db.teams; },
                async roster() { return [{user_id: 'u1', role: 'coach', display_name: evil}, {user_id: 'u2', role: 'player', display_name: evil}]; },
                async teamSessions() { return [{id: 's1', user_id: 'u2', player_code: 'P1', drill: 'free_throw', position: 'center', target_shots: 10, note: evil, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), shots: [{id: 'a', made: true, recordedAt: new Date().toISOString()}], analysis_runs: []}]; },
                async removeMember() {}, async leaveTeam() {}, async renameTeam() {}, async regenerateInviteCode() {}, async deleteTeam() {}
            };
        });
        const page = await context.newPage();
        await page.goto(base + 'coach/');
        await page.waitForSelector('#coach-dashboard:not([hidden])');
        await page.locator('.roster tbody tr').first().click();
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => globalThis.__xss), undefined, 'no script from a name ran');
        assert.equal(await page.locator('img[src="x"]').count(), 0, 'no image element was created from a name');
        const tp = await context.newPage();
        await tp.goto(base + 'training/');
        await tp.waitForTimeout(500);
        assert.equal(await tp.evaluate(() => globalThis.__xss), undefined);
        await context.close();
    });
    await t.test('two tabs of the training page never overwrite each other\'s finished sets', async () => {
        const context = await browser.newContext({...devices['iPhone 13']});
        const a = await context.newPage(), b = await context.newPage();
        const errors = [];
        for (const p of [a, b]) { p.on('dialog', d => d.accept()); p.on('pageerror', e => errors.push(e.message)); await p.goto(base + 'training/'); }
        const run = async (p, code) => {
            await p.fill('#player-code', code);
            await p.click('#setup-form button[type=submit]');
            await p.waitForSelector('#session-panel:not([hidden])');
            await p.click('#made-btn');
            await p.click('#finish-btn');
            await p.waitForSelector('#report-panel:not([hidden])');
        };
        await run(a, 'PAAA');
        await run(b, 'PBBB');   // this tab was opened before PAAA existed
        const store = JSON.parse(await a.evaluate(() => localStorage.getItem('basketball-training-v1')));
        const codes = [...store.history.map(s => s.playerCode), store.active && store.active.playerCode].filter(Boolean);
        assert.ok(codes.includes('PAAA') && codes.includes('PBBB'), 'both sets are kept, got ' + codes);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await t.test('accessibility in the working states: practice, summary, coach detail, survey results (needs axe-core)', {skip: axeSource ? false : 'axe-core is not installed'}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        const found = [];
        const check = async (page, label) => {
            await page.evaluate(axeSource);
            const result = await page.evaluate(() => axe.run({runOnly: ['wcag2a', 'wcag2aa']}));
            for (const v of result.violations) found.push(`${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0].html.slice(0, 80)}`);
        };
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P501');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForTimeout(800);
        await check(page, 'practice');
        await page.click('#made-btn');
        await page.click('#end-btn');
        await page.waitForTimeout(400);
        await check(page, 'shooting summary');
        const coach = await context.newPage();
        await coach.goto(base + 'coach/?demo=1');
        await coach.waitForSelector('#coach-dashboard:not([hidden])');
        await coach.locator('.roster tbody tr').first().click();
        await coach.waitForSelector('#player-detail:not([hidden])');
        await check(coach, 'coach detail');
        const training = await context.newPage();
        training.on('dialog', d => d.accept());
        await training.goto(base + 'training/');
        await training.fill('#player-code', 'P502');
        await training.click('#setup-form button[type=submit]');
        await training.waitForSelector('#session-panel:not([hidden])');
        await training.click('#made-btn');
        await check(training, 'training session');
        await training.click('#finish-btn');
        await training.waitForSelector('#report-panel:not([hidden])');
        await check(training, 'training report');
        const survey = await context.newPage();
        await survey.goto(base + 'trial/#summary');
        const good = JSON.stringify({schema: 'basketball-mvp-trial-v1', code: 'P1', submittedAt: '2026-11-21T10:00:00Z', susScore: 100, sus: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], product: [5, 4, 3, 4, 5], open: ['好', '慢', ''], device: 'x'});
        await survey.setInputFiles('#files', [{name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(good)}]);
        await survey.waitForSelector('#summary-result:not([hidden])');
        await check(survey, 'survey summary');
        await context.close();
        assert.deepEqual(found, []);
    });
    await t.test('the pinned cloud library loads on every page that uses it (integrity hash accepted) and no page contacts an unexpected site', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera']});
        const hosts = new Map(), failures = [];
        for (const url of ['training/', 'shoot/', 'shoot/mark.html', 'coach/', 'trial/', 'validation/', 'offline-review/']) {
            const page = await context.newPage();
            page.on('request', r => { const u = new URL(r.url()); if (!u.hostname.startsWith('127.0.0.1')) hosts.set(u.hostname, (hosts.get(u.hostname) || new Set()).add(url)); });
            page.on('console', m => { if (/integrity|Failed to find a valid digest|blocked/i.test(m.text())) failures.push(`${url}: ${m.text()}`); });
            await page.goto(base + url, {waitUntil: 'networkidle'});
            if (['training/', 'shoot/', 'shoot/mark.html', 'coach/'].includes(url)) await page.waitForFunction(() => typeof globalThis.supabase?.createClient === 'function', null, {timeout: 15000}).catch(() => assert.fail(`${url}: the cloud library did not load`));
            await page.close();
        }
        await context.close();
        assert.deepEqual(failures, []);
        // the only outside host a normal visit may touch is the CDN that serves the pinned cloud library
        assert.deepEqual([...hosts.keys()].sort(), ['cdn.jsdelivr.net']);
    });
    await t.test('the camera starts even when the browser leaves audio and screen-lock requests pending forever', {skip: noPose}, async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera']});
        const page = await context.newPage();
        await page.addInitScript(() => {
            // some browsers never answer these without a user gesture; the camera must not wait for them
            const never = () => new Promise(() => {});
            if (globalThis.AudioContext) AudioContext.prototype.resume = never;
            if (navigator.wakeLock) navigator.wakeLock.request = never;
        });
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P601');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 8000});
        await context.close();
    });
    await t.test('without WebGL the analysis explains itself in plain words and manual recording still works', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera']});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => {
            const real = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : real.call(this, type, ...rest); };
        });
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P602');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => /缺少 WebGL/.test(document.getElementById('practice-message').textContent), null, {timeout: 10000});
        assert.match(await page.textContent('#state-badge'), /無法分析動作/);
        await page.click('#made-btn');
        assert.equal(await page.textContent('#score-total'), '1');
        assert.deepEqual(errors, []);
        await context.close();
    });
});
