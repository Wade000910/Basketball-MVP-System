// First-run guide: three short cards, shown once. "?guide=1" shows it again (linked from the me tab).
(function () {
    'use strict';
    var KEY = 'bmvp-onboarded';
    var box = document.getElementById('onboarding');
    if (!box) return;
    var forced = /[?&]guide=1\b/.test(location.search);
    var seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked: show the guide each time */ }
    if (seen && !forced) return;

    var STEPS = [
        { art: '<rect x="30" y="60" width="16" height="30" rx="3"/><path d="M38 90v28"/><circle cx="120" cy="40" r="10"/><path d="M120 50v36M120 86l-10 32M120 86l10 32M120 62l-16 12M120 62l18 8"/><path d="M52 70l56-14M52 82l56 20" stroke-dasharray="4 4"/><path d="M10 118h160"/>', title: '手機放側面，拍到全身', text: '離你約 3 公尺，高度和腰差不多，鏡頭對著投籃的那一側。用腳架或靠在固定的東西上，不要手拿。' },
        { art: '<rect x="68" y="20" width="24" height="44" rx="12"/><path d="M56 56a24 24 0 0 0 48 0M80 80v18M64 100h32"/>', title: '投完說「進」或「沒進」', text: '也可以按畫面上的按鈕，或請隊友用他的手機幫記。記錯的球，練完可以改。' },
        { art: '<path d="M40 70l28 28 54-60"/>', title: '練完確認再存', text: '一組結束會先看到成績，確認後按「儲存」。資料先存在這支手機，登入後才會備份到雲端。' }
    ];
    var i = 0;
    var art = document.getElementById('ob-art'), title = document.getElementById('ob-title'), text = document.getElementById('ob-text'), dots = document.getElementById('ob-dots'), next = document.getElementById('ob-next');

    function render() {
        var st = STEPS[i];
        art.innerHTML = st.art;
        title.textContent = st.title;
        text.textContent = st.text;
        dots.innerHTML = STEPS.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('');
        next.textContent = i === STEPS.length - 1 ? '開始練投' : '下一步';
    }
    function close() {
        box.hidden = true;
        try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    }
    next.addEventListener('click', function () { if (i < STEPS.length - 1) { i++; render(); } else close(); });
    document.getElementById('ob-skip').addEventListener('click', close);
    render();
    box.hidden = false;
    next.focus();
})();
