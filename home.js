// Install hint for the home page: tells the player how to add the site to the home screen, and stays out of the way
// once it runs as an installed app. The page itself is never cached, so a site update reaches the next launch.
(function () {
    'use strict';
    var hint = document.getElementById('install-hint');
    var text = document.getElementById('install-text');
    var button = document.getElementById('install-btn');
    var close = document.getElementById('install-close');
    var KEY = 'bmvp-install-hint-dismissed';

    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked: just show the hint */ }
    if (standalone || dismissed) return;

    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var deferred = null;

    function show(message) { text.textContent = message; hint.hidden = false; }

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferred = event;
        button.hidden = false;
        show('可以安裝成 App，從桌面直接開，沒有網址列。先登入再安裝，資料才會一起帶過去。');
    });
    window.addEventListener('appinstalled', function () { hint.hidden = true; });

    button.addEventListener('click', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred = null;
        button.hidden = true;
    });
    close.addEventListener('click', function () {
        hint.hidden = true;
        try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    });

    if (ios) show('想當 App 用：點瀏覽器的分享鈕，再按「加入主畫面」。先登入再安裝，資料才會一起帶過去。');
})();
