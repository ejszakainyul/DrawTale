// Irányítópult: gyerekprofilok + mesekártyák (REQ-WEB-01, UC-03, UC-04).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  if (!DT.requireAuth()) return;
  DT.layout('dashboard');

  var state = { children: [], stories: [], child: null };
  var pollTimer = null;
  try { state.child = +sessionStorage.getItem('drawtale.child') || null; } catch (e) { /* */ }

  $('#hello').textContent = 'Szia, ' + api.user().display_name + '!';
  $('#new-story').addEventListener('click', newStory);

  // ---------------------------------------------------------- gyerekek

  function renderKids() {
    var box = $('#kids');
    box.replaceChildren();
    function chip(id, label, av) {
      var b = h('button.kid', { type: 'button', 'aria-pressed': String(state.child === id) }, h('span.av', { 'aria-hidden': 'true' }, av), label);
      b.addEventListener('click', function () {
        state.child = id;
        try { sessionStorage.setItem('drawtale.child', id || ''); } catch (e) { /* */ }
        renderKids();
        renderStories();
      });
      return b;
    }
    box.append(chip(null, 'Mindenki', '📚'));
    state.children.forEach(function (c) { box.append(chip(c.id, c.nickname, DT.AVATARS[c.avatar] || '🙂')); });
    box.append(h('button.kid.add', { type: 'button', onclick: newChild }, '＋ Új gyerek'));
  }

  function avatarPicker(selected) {
    return h('div.avatar-pick', { role: 'radiogroup', 'aria-label': 'Avatar' },
      Object.keys(DT.AVATARS).map(function (k, i) {
        return h('label', { title: k },
          h('input', { type: 'radio', name: 'avatar', value: k, checked: selected ? k === selected : i === 0 }),
          h('span', { 'aria-hidden': 'true' }, DT.AVATARS[k]), h('span.sr-only', k));
      }));
  }

  function newChild() {
    var body = h('div.form',
      h('div.field', h('label', { for: 'nick' }, 'Becenév'),
        h('input.input#nick', { name: 'nickname', maxlength: '40', placeholder: 'pl. Bence', autocomplete: 'off' }),
        h('span.hint', 'Elég a becenév, valódi nevet nem kérünk.'), h('span.err')),
      h('div.field', h('span.label', 'Válassz egy avatart'), avatarPicker()));
    return DT.dialog('Új gyerekprofil', body, [
      { label: 'Mégse', value: null, cls: 'btn-ghost' },
      { label: 'Mentés', value: 'save', cls: 'btn-primary', submit: true, validate: function (f) {
        if (!f.nickname.value.trim()) { DT.fieldErrors(f, { nickname: 'Adj egy nevet a profilnak!' }); f.nickname.focus(); return false; }
        return true;
      } }
    ]).then(function (r) {
      if (r.value !== 'save') return;
      return api.post('/children', { nickname: r.form.nickname.value, avatar: r.form.avatar.value }).then(function (res) {
        state.children.push(res.child);
        state.child = res.child.id;
        renderKids();
        renderStories();
        DT.toast(res.child.nickname + ' polca elkészült! 🎉', { type: 'ok' });
      }, DT.showError);
    });
  }

  // -------------------------------------------------------------- mesék

  function storyCard(s) {
    var cover = h('div.cover');
    var child = state.children.filter(function (c) { return c.id === s.child_profile_id; })[0];
    var status = s.processing ? 'processing' : s.status;
    var card = h('article.card.story-card',
      cover,
      h('div.body',
        h('div.row.spread', { style: 'flex-wrap:nowrap;align-items:flex-start' },
          h('h3', s.title),
          h('div.row', { style: 'gap:2px;flex-wrap:nowrap' },
            h('a.btn.btn-sm.btn-ghost', { href: 'shares.html?story=' + s.id, 'aria-label': 'Megosztás: ' + s.title, title: 'Megosztás' }, '🔗'),
            h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': 'Törlés: ' + s.title, title: 'Törlés', onclick: function () { deleteStory(s); } }, '🗑'))),
        h('div.meta',
          h('span.badge.badge-' + status, DT.STATUS[status]),
          h('span', s.page_count + ' oldal'),
          child ? h('span', '· ' + (DT.AVATARS[child.avatar] || '') + ' ' + child.nickname) : null),
        h('div.actions',
          h('a.btn.btn-primary.btn-sm', { href: 'player.html?id=' + s.id, 'aria-label': 'Lejátszás: ' + s.title }, '▶ Lejátszás'),
          h('a.btn.btn-sm', { href: 'editor.html?id=' + s.id, 'aria-label': 'Szerkesztés: ' + s.title }, '✏️ Szerkesztés'))));
    var scene = s.cover_page && DT.sceneForPage(s.cover_page);
    if (scene) {
      var c = h('canvas', { 'aria-hidden': 'true' });
      cover.append(c);
      requestAnimationFrame(function () { DT.drawStill(c, scene, 1.2); });
    } else {
      cover.append(h('span.placeholder', { 'aria-hidden': 'true' }, s.processing ? '⏳' : '🖍️'));
    }
    return card;
  }

  function renderStories() {
    var box = $('#stories');
    var list = state.stories.filter(function (s) { return !state.child || s.child_profile_id === state.child; });
    box.replaceChildren();
    if (!list.length) {
      box.append(h('div.empty', { style: 'grid-column: 1 / -1' },
        h('div.big', { 'aria-hidden': 'true' }, '📖'),
        h('h2', 'Még üres a polc'),
        h('p.muted', 'Találjatok ki együtt egy mesét, és rajzoljátok le!'),
        h('button.btn.btn-accent', { type: 'button', onclick: newStory }, '＋ Első mese')));
      return;
    }
    list.forEach(function (s) { box.append(storyCard(s)); });
  }

  function newStory() {
    var sel = h('select.select#child', { name: 'child' },
      h('option', { value: '' }, '– nem választok –'),
      state.children.map(function (c) { return h('option', { value: c.id, selected: c.id === state.child }, c.nickname); }));
    var body = h('div.form',
      h('div.field', h('label', { for: 'title' }, 'A mese címe'),
        h('input.input#title', { name: 'title', maxlength: '120', placeholder: 'pl. A bátor cica', autocomplete: 'off' }), h('span.err')),
      state.children.length ? h('div.field', h('label', { for: 'child' }, 'Kinek a meséje?'), sel) : null);
    DT.dialog('Új mese', body, [
      { label: 'Mégse', value: null, cls: 'btn-ghost' },
      { label: 'Kezdjük!', value: 'ok', cls: 'btn-accent', submit: true, validate: function (f) {
        if (!f.title.value.trim()) { DT.fieldErrors(f, { title: 'Adj címet a mesének!' }); f.title.focus(); return false; }
        return true;
      } }
    ]).then(function (r) {
      if (r.value !== 'ok') return;
      var childId = r.form.child && r.form.child.value ? +r.form.child.value : null;
      return api.post('/stories', { title: r.form.title.value, child_profile_id: childId }).then(function (res) {
        location.href = 'editor.html?id=' + res.story.id;
      }, DT.showError);
    });
  }

  function deleteStory(s) {
    DT.confirm('Törlöd a mesét?', '„' + s.title + '” minden oldala, rajza és megosztása törlődik. Ezt nem lehet visszacsinálni.', 'Törlés', true).then(function (ok) {
      if (!ok) return;
      api.del('/stories/' + s.id).then(function () {
        state.stories = state.stories.filter(function (x) { return x.id !== s.id; });
        renderStories();
        DT.toast('A mese törölve.');
      }, DT.showError);
    });
  }

  function loadStories() {
    return api.get('/stories').then(function (res) {
      state.stories = res.stories;
      renderStories();
      clearTimeout(pollTimer);
      if (state.stories.some(function (s) { return s.processing; })) pollTimer = setTimeout(loadStories, 3000);
    });
  }

  Promise.all([api.get('/children'), loadStories()]).then(function (r) {
    state.children = r[0].children;
    if (state.child && !state.children.some(function (c) { return c.id === state.child; })) state.child = null;
    renderKids();
    renderStories();
    if (DT.param('welcome') && !state.children.length) {
      DT.toast('Üdv a DrawTale-ben! Először hozzunk létre egy gyerekprofilt. 🎨', { type: 'ok' });
      newChild();
    }
  }).catch(DT.showError);
});
