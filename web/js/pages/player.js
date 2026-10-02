// Lejátszó oldal: saját mese (player.html?id=) vagy megosztott mese vendégként (view.html#t=).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  var guest = document.body.dataset.mode === 'guest';
  if (!guest && !DT.requireAuth()) return;
  DT.layout(guest ? 'view' : 'dashboard');

  var box = $('#book');
  var hash = new URLSearchParams(location.hash.slice(1));
  var start = +hash.get('p') || 0;

  function onChange(i) {
    var q = new URLSearchParams(location.hash.slice(1));
    q.set('p', i);
    history.replaceState(null, '', '#' + q.toString());
  }

  function unavailable(title, text) {
    document.title = 'Nem érhető el – DrawTale';
    box.replaceChildren(h('div.card.unavailable',
      h('div.big', { 'aria-hidden': 'true' }, '🙈'),
      h('h1', { style: 'font-size:2rem' }, title),
      h('p.muted', text),
      h('a.btn.btn-accent', { href: 'index.html' }, 'Mi az a DrawTale?')));
  }

  function canvasSupported() {
    var c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('2d'));
  }

  function show(story, opts) {
    document.title = story.title + ' – DrawTale';
    box.replaceChildren();
    if (!canvasSupported()) {
      box.append(h('p.alert.alert-info', 'Ez a böngésző nem tudja lejátszani az animációt, ezért csak a szöveget mutatjuk.'));
      story.pages.forEach(function (p) { box.append(h('div.card', { style: 'margin-top:12px' }, h('b', p.page_no + '. oldal'), h('p', p.text))); });
      return;
    }
    new DT.Book(box, story, Object.assign({ start: start, onChange: onChange }, opts));
  }

  if (guest) {
    var token = hash.get('t') || DT.param('t');
    if (!token) { unavailable('Hiányos link', 'Úgy tűnik, a link nem teljes. Kérd el újra attól, aki küldte!'); return; }
    api.request('GET', '/public/' + encodeURIComponent(token), undefined, { auth: false }).then(function (res) {
      show(res.story, { mode: 'guest' });
      box.after(h('p.promo.small.muted', 'Ezt a mesét egy gyerek rajzolta és egy szülő mesélte. A DrawTale-lel ti is készíthettek ilyet. ✨'));
    }).catch(function (err) {
      if (err.status === 404) unavailable('Ez a mese már nem érhető el', 'Kérj új linket attól, aki küldte!');
      else if (err.status === 429) unavailable('Túl sok próbálkozás', 'Próbáld újra egy kicsit később!');
      else unavailable('Hoppá!', err.message);
    });
  } else {
    var id = +DT.param('id');
    $('#edit-link').href = 'editor.html?id=' + id;
    api.get('/stories/' + id).then(function (res) {
      var s = res.story;
      return api.get('/children').then(function (c) {
        var child = c.children.filter(function (x) { return x.id === s.child_profile_id; })[0];
        s.child_nickname = child ? child.nickname : null;
        s.child_avatar = child ? child.avatar : null;
        show(s, { mode: 'owner', storyId: id });
      });
    }).catch(function (err) {
      if (err.status === 404) unavailable('Ez a mese nem található', 'Lehet, hogy törölték, vagy nem a te meséd.');
      else DT.showError(err);
    });
  }
});
