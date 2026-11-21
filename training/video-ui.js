// Shows which saved sets have a video (a tag on the list) and plays it inside the opened set. Videos live only on
// this phone; a set from the cloud on a new phone simply has none.
(function () {
    'use strict';
    var box = document.getElementById('session-video');
    if (!box || typeof VideoStore === 'undefined') return;
    var player = document.getElementById('video-player');
    var info = document.getElementById('video-info');
    var del = document.getElementById('video-delete');
    var DELETE_LABEL = '刪除這段影片';
    var url = null, shownId = null;

    function release() {
        if (url) { URL.revokeObjectURL(url); url = null; }
        player.removeAttribute('src');
        try { player.load(); } catch (e) { /* ignore */ }
    }
    function hide() { release(); shownId = null; box.hidden = true; }

    function tag() {
        VideoStore.list().then(function (rows) {
            var have = {};
            rows.forEach(function (r) { have[r.id] = r; });
            document.querySelectorAll('#history-list .history-item').forEach(function (button) {
                var old = button.querySelector('.video-tag');
                if (old) old.remove();
                if (!have[button.dataset.id]) return;
                var span = document.createElement('span');
                span.className = 'video-tag';
                span.textContent = '▶ 影片';
                button.querySelector('strong').after(span);
            });
        }).catch(function () { /* no database: no tags */ });
    }
    function show(id) {
        del.textContent = DELETE_LABEL;   // a half-pressed delete never carries over to another set
        if (!id) return hide();
        if (id === shownId) return;
        hide();
        VideoStore.get(id).then(function (row) {
            if (!row || !row.blob) return;
            shownId = id;
            url = URL.createObjectURL(row.blob);
            player.src = url;
            info.textContent = VideoStore.durationText(row.durationMs) + ' · ' + VideoStore.sizeText(row.size) + '。只存在這支手機。';
            box.hidden = false;
        }).catch(function () { hide(); });
    }
    document.addEventListener('history-rendered', tag);
    document.addEventListener('session-shown', function (e) { show(e.detail.id); });

    del.addEventListener('click', function () {
        if (del.textContent !== DELETE_LABEL) {
            var id = shownId;
            hide();
            del.textContent = DELETE_LABEL;
            if (id) VideoStore.remove(id).then(tag);
            return;
        }
        del.textContent = '確定刪除？再按一次';
    });
})();
