// The training page is the host of the records, team and me panes. The account block drives which team controls
// and reminders are visible, and the theme buttons live here.
(function () {
    'use strict';
    var account = document.getElementById('cloud-account');
    var banner = document.getElementById('backup-banner');
    function sync() {
        var loggedIn = !!account && !account.hidden;
        document.querySelectorAll('[data-needs-login]').forEach(function (el) { el.hidden = !loggedIn; });
        document.querySelectorAll('[data-needs-logout]').forEach(function (el) { el.hidden = loggedIn; });
        if (banner) banner.hidden = loggedIn;
    }
    if (account) new MutationObserver(sync).observe(account, { attributes: true, attributeFilter: ['hidden'] });
    sync();

    function marks() {
        var now = window.AppTheme ? window.AppTheme.get() : 'system';
        document.querySelectorAll('#theme-choice button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-value') === now)); });
    }
    document.querySelectorAll('#theme-choice button').forEach(function (b) {
        b.addEventListener('click', function () { if (window.AppTheme) window.AppTheme.set(b.getAttribute('data-theme-value')); marks(); });
    });
    marks();
})();

// The records pane follows the code used on the practice page, so the player does not retype it.
(function () {
    'use strict';
    window.addEventListener('load', function () {
        var box = document.getElementById('dashboard-player');
        if (!box || box.value) return;
        var code = '';
        try { code = localStorage.getItem('basketball-shoot-player') || ''; } catch (e) { /* ignore */ }
        if (/^[A-Za-z0-9_-]{1,32}$/.test(code)) { box.value = code; box.dispatchEvent(new Event('input', { bubbles: true })); }
    });
})();
