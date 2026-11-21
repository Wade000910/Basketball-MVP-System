// Browser tests for everything that does not need a real person: every page loads clean at phone and
// desktop sizes, the practice flow works with a fake camera, the coach page and the account flows work
// against an in-memory cloud. Needs Playwright with Chromium, so it is not part of `npm test`:
//   NODE_PATH=<dir with playwright> node --test tests/e2e/
// It skips itself when Playwright is not installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium, devices;
try { ({chromium, devices} = require('playwright')); } catch { /* skipped below */ }
const skip = chromium ? false : 'playwright is not installed';
const ROOT = path.join(__dirname, '..', '..');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.data': 'application/octet-stream', '.binarypb': 'application/octet-stream', '.tflite': 'application/octet-stream'};

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
    const browser = await chromium.launch({args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']});
    t.after(async () => { await browser.close(); server.close(); });

    const PAGES = ['', 'coach/', 'coach/?demo=1', 'offline-review/', 'shoot/', 'shoot/mark.html', 'training/', 'validation/', '專題程式/'];
    const PROFILES = {'phone upright': devices['iPhone 13'], 'phone on its side': devices['iPhone 13 landscape'], desktop: {viewport: {width: 1280, height: 800}}};

    for (const [pname, profile] of Object.entries(PROFILES)) {
        await t.test(`every page loads clean on ${pname}`, async () => {
            const context = await browser.newContext({...profile, permissions: ['camera', 'microphone']});
            const problems = [];
            for (const url of PAGES) {
                const page = await context.newPage();
                page.on('pageerror', e => problems.push(`${url} JS: ${e.message}`));
                page.on('console', m => { if (m.type() === 'error' && !/supabase|jsdelivr|Failed to load resource/.test(m.text())) problems.push(`${url} console: ${m.text()}`); });
                page.on('response', r => { if (r.status() >= 400 && !/supabase|jsdelivr/.test(r.url())) problems.push(`${url} ${r.status()} ${r.url()}`); });
                await page.goto(base + url, {waitUntil: 'load'});
                await page.waitForTimeout(400);
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

    await t.test('practice: make and miss buttons, undo, finish, and the set reaches the training history', async () => {
        const context = await browser.newContext({...devices['iPhone 13'], permissions: ['camera', 'microphone']});
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        await page.goto(base + 'shoot/');
        await page.fill('#player-code', 'P777');
        await page.click('#start-btn');
        await page.waitForSelector('#practice-view:not([hidden])');
        await page.waitForFunction(() => document.getElementById('video').videoWidth > 0, null, {timeout: 20000});
        const ratio = await page.evaluate(() => document.getElementById('practice-view').style.getPropertyValue('--stage-ratio'));
        assert.match(ratio, /^\d+ \/ \d+$/, 'the picture frame follows the real video shape');
        for (const id of ['made-btn', 'made-btn', 'made-btn', 'missed-btn', 'missed-btn']) { await page.click('#' + id); await page.waitForTimeout(3200); }
        assert.equal(await page.textContent('#score-made'), '3');
        assert.equal(await page.textContent('#score-total'), '5');
        await page.click('#undo-btn');
        assert.equal(await page.textContent('#score-total'), '4');
        await page.click('#end-btn');
        await page.waitForTimeout(800);
        const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
        assert.match(stored, /P777/, 'the finished set is saved on this device');
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
        await page.goto(base + 'training/');
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
});
