// Every number in the write-up's summary tables must equal the number the simulation produced (the CSV files),
// so the report cannot drift from the data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const csv = f => { const [h, ...rows] = read(f).trim().split('\n'); const cols = h.split(','); return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v]))); };
const doc = read('docs/simulation-study.md');
const first = cell => Number(/-?\d+(?:\.\d+)?/.exec(cell.replace(/−/g, '-'))[0]);
const rowsOf = (section) => section.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| ---') && !l.startsWith('|---'));

test('robustness summary table equals robustness-results.csv (peak SD)', () => {
    const data = csv('docs/simulation/robustness-results.csv');
    const section = doc.slice(doc.indexOf('## 壓力情境'));
    const ids = ['none', 'bw10', 'bw6', 'zp6', 'kf2'];
    let checked = 0;
    for (const row of rowsOf(section)) {
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        const m = /^(R\d)\b/.exec(cells[0]);
        if (!m) continue;
        ids.forEach((id, i) => {
            const rec = data.find(r => r.condition === m[1] && r.filter === id);
            assert.ok(rec, `${m[1]} ${id}`);
            assert.equal(first(cells[1 + i]), Number(rec.peakSd), `${m[1]} ${id}`);
            checked++;
        });
    }
    assert.equal(checked, 50, 'ten conditions x five filters');
});
test('filter comparison summary table equals filters-results.csv (peak SD for C1, C2, C4)', () => {
    const data = csv('docs/simulation/filters-results.csv');
    const section = doc.slice(doc.indexOf('## 濾波器比較'), doc.indexOf('## 壓力情境'));
    const names = [['不濾波', 'none'], ['Butterworth 10 Hz（現行）', 'bw10'], ['Butterworth 6 Hz', 'bw6'], ['Butterworth 4 Hz', 'bw4'], ['零相位 6 Hz', 'zp6'], ['Savitzky-Golay 7 點', 'sg7'], ['One Euro（2 Hz，β 0.01）', 'oe1'], ['Kalman（q = 20000）', 'kf2']];
    let checked = 0;
    for (const row of rowsOf(section)) {
        const cells = row.split('|').slice(1, -1).map(c => c.trim()), hit = names.find(([n]) => n === cells[0]);
        if (!hit) continue;
        ['C1', 'C2', 'C4'].forEach((cond, i) => {
            const rec = data.find(r => r.condition === cond && r.filter === hit[1]);
            assert.equal(first(cells[1 + i]), Number(rec.peakSd), `${cond} ${hit[1]}`);
            checked++;
        });
    }
    assert.equal(checked, 24, 'eight filters x three conditions');
});
