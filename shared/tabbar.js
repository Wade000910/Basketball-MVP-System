// Bottom tab bar for the installed-app look. The pages with data-tab get a four-tab bar; the records, team and me
// panes all live on the training page and are switched with the URL hash, so the bar never reloads between them.
// The theme choice (follow the phone, light, dark) is applied here too so every page agrees.
(function () {
    'use strict';
    var THEME_KEY = 'bmvp-theme';
    function theme(value) {
        try { if (value) localStorage.setItem(THEME_KEY, value === 'system' ? '' : value); value = localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { value = value || 'system'; }
        if (value === 'light' || value === 'dark') document.documentElement.setAttribute('data-theme', value);
        else document.documentElement.removeAttribute('data-theme');
        return value;
    }
    theme();
    window.AppTheme = { get: function () { return theme(); }, set: theme };

    var script = document.currentScript;
    var root = new URL('../', script ? script.src : location.href).href;
    var TABS = [
        { id: 'shoot', label: '練投', href: root + 'shoot/', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/>' },
        { id: 'records', label: '紀錄', href: root + 'training/#records', icon: '<path d="M4 19V5M4 19h16M8 15l4-5 3 3 5-7"/>' },
        { id: 'team', label: '球隊', href: root + 'training/#team', icon: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M15 15c3 0 6 1.4 6 4"/>' },
        { id: 'me', label: '我的', href: root + 'training/#me', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>' }
    ];
    var PANES = ['records', 'team', 'me'];

    function paneFromHash() {
        var h = location.hash.replace('#', '');
        return PANES.indexOf(h) >= 0 ? h : 'records';
    }
    function current() {
        var tab = document.body.getAttribute('data-tab');
        return tab === 'panes' ? paneFromHash() : tab;
    }
    function applyPanes() {
        var pane = paneFromHash();
        document.querySelectorAll('[data-pane]').forEach(function (el) {
            el.classList.toggle('pane-off', el.getAttribute('data-pane').split(' ').indexOf(pane) < 0);
        });
        mark();
        window.scrollTo(0, 0);
    }
    function mark() {
        var now = current();
        document.querySelectorAll('.tabbar a').forEach(function (a) {
            if (a.getAttribute('data-tab') === now) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
    }
    function build() {
        if (!document.body.getAttribute('data-tab')) return;
        var nav = document.createElement('nav');
        nav.className = 'tabbar';
        nav.setAttribute('aria-label', '主要分頁');
        nav.innerHTML = TABS.map(function (t) {
            return '<a href="' + t.href + '" data-tab="' + t.id + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg>' + t.label + '</a>';
        }).join('');
        document.body.appendChild(nav);
        if (document.body.getAttribute('data-tab') === 'panes') {
            // links to the pane you are already on still need to switch panes, so they go through the hash handler
            window.addEventListener('hashchange', applyPanes);
            applyPanes();
        } else mark();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
