// Admin felület: feldolgozások újraindítása, felhasználók tiltása, napi riportok
// (UC-13, REQ-WEB-06, REQ-API-15).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  if (!DT.requireAuth({ admin: true })) return;
  DT.layout('admin');

  var panel = $('#panel');
  var jobFilter = 'failed';
  var pollTimer = null;
  var JOB = { queued: ['processing', 'Sorban'], processing: ['processing', 'Fut'], done: ['done', 'Kész'], failed: ['failed', 'Hibás'] };

  var tabs = document.querySelectorAll('[role=tab]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { open(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(tabs), i = list.indexOf(t);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var n = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
        n.focus();
        open(n.dataset.tab);
      }
    });
  });

  function open(tab) {
    clearTimeout(pollTimer);
    tabs.forEach(function (t) {
      var on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', 'tab-' + tab);
    panel.replaceChildren(h('p.muted', 'Betöltés…'));
    ({ jobs: loadJobs, users: loadUsers, reports: loadReports })[tab]();
  }

  // ------------------------------------------------------------- feladatok

  function loadJobs() {
    api.get('/admin/jobs' + (jobFilter ? '?status=' + jobFilter : '')).then(function (res) {
      var filter = h('div.choice', { role: 'group', 'aria-label': 'Szűrés' },
        [['failed', 'Hibásak'], ['', 'Mind']].map(function (f) {
          var inp = h('input', { type: 'radio', name: 'jf', value: f[0], checked: jobFilter === f[0] });
          inp.addEventListener('change', function () { jobFilter = f[0]; loadJobs(); });
          return h('label', inp, ' ' + f[1]);
        }));
      var failed = res.jobs.filter(function (j) { return j.status === 'failed'; });
      var head = h('div.row.spread', { style: 'margin-bottom:12px' }, filter,
        failed.length > 1 ? h('button.btn.btn-accent', { type: 'button', onclick: function () { retry(failed); } }, '↻ Mind újraindítása (' + failed.length + ')') : null);
      if (!res.jobs.length) {
        panel.replaceChildren(head, h('div.empty', h('div.big', '🎉'), h('h2', 'Nincs hibás feldolgozás'), h('p.muted', 'Minden rajz rendben kivágva.')));
        return;
      }
      var rows = res.jobs.map(function (j) {
        var st = JOB[j.status] || ['draft', j.status];
        var img = j.original_url ? h('img.thumb-photo', { alt: 'Eredeti fotó' }) : h('span.muted', '–');
        if (j.original_url) api.media(j.original_url).then(function (u) { if (u) img.src = u; });
        return h('tr',
          h('td', { 'data-label': 'Fotó' }, img),
          h('td', { 'data-label': 'Feladat' }, h('b', '#' + j.id), h('div.small.muted', (j.story_title || '–') + ' · ' + (j.owner_email || '–'))),
          h('td', { 'data-label': 'Idő' }, DT.fmtDate(j.updated_at, true)),
          h('td', { 'data-label': 'Próbálkozás' }, String(j.attempts)),
          h('td', { 'data-label': 'Állapot' }, h('span.badge.badge-' + st[0], st[1]), j.error_msg ? h('div.small', { style: 'color:var(--red);max-width:320px' }, j.error_msg) : null),
          h('td', j.status === 'failed' ? h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: function () { retry([j]); } }, '↻ Újraindítás') : null));
      });
      panel.replaceChildren(head, h('div.table-scroll', h('table.list.responsive',
        h('thead', h('tr', ['Fotó', 'Feladat', 'Idő', 'Próbálkozás', 'Állapot', ''].map(function (t) { return h('th', { scope: 'col' }, t); }))),
        h('tbody', rows))));
      if (res.jobs.some(function (j) { return j.status === 'queued' || j.status === 'processing'; })) pollTimer = setTimeout(loadJobs, 1500);
    }).catch(DT.showError);
  }

  function retry(jobs) {
    Promise.all(jobs.map(function (j) { return api.post('/admin/jobs/' + j.id + '/retry'); })).then(function () {
      DT.toast(jobs.length + ' feladat visszakerült a sorba.', { type: 'ok' });
      jobFilter = '';
      loadJobs();
    }).catch(DT.showError);
  }

  // ----------------------------------------------------------- felhasználók

  function loadUsers() {
    var me = api.user();
    api.get('/admin/users').then(function (res) {
      var rows = res.users.map(function (u) {
        var state = u.deleted_at ? h('span.badge.badge-expired', 'Törölt') : u.is_blocked ? h('span.badge.badge-failed', 'Tiltva') : h('span.badge.badge-done', 'Aktív');
        return h('tr',
          h('td', { 'data-label': 'Felhasználó' }, h('b', u.display_name), h('div.small.muted', u.email)),
          h('td', { 'data-label': 'Szerep' }, u.role === 'admin' ? h('span.badge.badge-admin', 'admin') : 'szülő'),
          h('td', { 'data-label': 'Regisztrált' }, DT.fmtDate(u.created_at)),
          h('td', { 'data-label': 'Mesék' }, String(u.story_count)),
          h('td', { 'data-label': 'Állapot' }, state),
          h('td', u.id === me.id || u.deleted_at ? null : h('button.btn.btn-sm' + (u.is_blocked ? '' : '.btn-danger'), { type: 'button', onclick: function () { toggleBlock(u); } }, u.is_blocked ? 'Tiltás feloldása' : 'Tiltás')));
      });
      panel.replaceChildren(h('div.table-scroll', h('table.list.responsive',
        h('thead', h('tr', ['Felhasználó', 'Szerep', 'Regisztrált', 'Mesék', 'Állapot', ''].map(function (t) { return h('th', { scope: 'col' }, t); }))),
        h('tbody', rows))));
    }).catch(DT.showError);
  }

  function toggleBlock(u) {
    var block = !u.is_blocked;
    var go = block
      ? DT.confirm('Letiltod ' + u.email + ' fiókját?', 'Azonnal kilépteti minden eszközön, és nem tud belépni, amíg fel nem oldod.', 'Tiltás', true)
      : Promise.resolve(true);
    go.then(function (ok) {
      if (!ok) return;
      api.patch('/admin/users/' + u.id, { is_blocked: block }).then(function () {
        DT.toast(block ? 'Fiók letiltva.' : 'Tiltás feloldva.');
        loadUsers();
      }, DT.showError);
    });
  }

  // --------------------------------------------------------------- riportok

  function loadReports() {
    api.get('/admin/reports').then(function (res) {
      var reps = res.reports.slice().reverse();
      var last = res.reports[res.reports.length - 2] || res.reports[0];
      var max = Math.max.apply(null, reps.map(function (r) { return r.uploads; }).concat([1]));
      var sumOk = 0, sumBad = 0;
      res.reports.forEach(function (r) { sumOk += r.cutouts_ok; sumBad += r.cutouts_failed; });
      var rate = sumOk + sumBad ? Math.round((sumOk / (sumOk + sumBad)) * 100) : 100;
      panel.replaceChildren(
        h('div.stats',
          h('div.stat', h('b', String(res.totals.users)), 'felhasználó'),
          h('div.stat', h('b', String(res.totals.stories)), 'mese'),
          h('div.stat', h('b', String(res.totals.shares)), 'aktív megosztás'),
          h('div.stat', h('b', rate + '%'), 'sikeres kivágás (7 nap)')),
        h('h3', 'Tegnapi összesítő (' + last.date + ')'),
        h('p', last.new_users + ' új fiók, ' + last.uploads + ' feltöltés, ' + last.cutouts_ok + ' sikeres és ' + last.cutouts_failed + ' hibás kivágás.'),
        h('h3', { style: 'margin-top:18px' }, 'Feltöltések naponta'),
        h('div.bars', { role: 'list' }, reps.map(function (r) {
          return h('div.bar-row', { role: 'listitem', 'aria-label': r.date + ': ' + r.cutouts_ok + ' sikeres, ' + r.cutouts_failed + ' hibás' },
            h('span', r.date.slice(5).replace('-', '. ') + '.' + (r.partial ? ' (ma)' : '')),
            h('div.bar', { 'aria-hidden': 'true' },
              h('i.ok', { style: 'width:' + (r.cutouts_ok / max) * 100 + '%' }),
              h('i.bad', { style: 'width:' + (r.cutouts_failed / max) * 100 + '%' })),
            h('span.small', r.uploads + ' db'));
        })),
        h('p.small.muted', { style: 'margin-top:10px' }, '■ zöld: sikeres · ■ piros: hibás kivágás. A riport minden éjjel 2:00-kor készül.'));
    }).catch(DT.showError);
  }

  open('jobs');
});
