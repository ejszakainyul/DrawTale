// Megosztások: link + QR-kód, lejárat, visszavonás (UC-10, REQ-WEB-04, REQ-WEB-05).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  if (!DT.requireAuth()) return;
  DT.layout('shares');

  var wanted = +DT.param('story') || null;
  var form = $('#share-form');

  function shareUrl(token) {
    return new URL('view.html#t=' + encodeURIComponent(token), location.href).href;
  }

  function qrNode(url) {
    var box = h('div.qr', { role: 'img', 'aria-label': 'QR-kód a mese linkjéhez' });
    if (!window.qrcode) { box.append(h('span.small.muted', 'QR-kód nem elérhető')); return box; }
    var qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    // A könyvtár saját, megbízható SVG-kimenete (felhasználói szöveg nincs benne).
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    box.dataset.png = qr.createDataURL(8, 4);
    return box;
  }

  function copy(text) {
    var done = function () { DT.toast('Link kimásolva! Most már beillesztheted Messengerbe. 📋', { type: 'ok' }); };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done, fallback);
    fallback();
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { DT.toast('Nem sikerült a másolás – jelöld ki és másold kézzel!'); }
      ta.remove();
    }
  }

  function showResult(share, title) {
    var url = shareUrl(share.token);
    var input = h('input.input', { value: url, readonly: true, 'aria-label': 'Megosztási link', onfocus: function (e) { e.target.select(); } });
    var qr = qrNode(url);
    var actions = h('div.row',
      h('button.btn.btn-primary', { type: 'button', onclick: function () { copy(url); } }, '📋 Másolás'),
      h('a.btn', { href: url, target: '_blank', rel: 'noopener' }, '👀 Megnézem'),
      navigator.share ? h('button.btn', { type: 'button', onclick: function () {
        navigator.share({ title: title, text: 'Nézd meg a mesénket: ' + title, url: url }).catch(function () {});
      } }, '📤 Küldés…') : null,
      qr.dataset.png ? h('a.btn.btn-ghost', { href: qr.dataset.png, download: 'drawtale-qr.gif' }, '⬇ QR letöltése') : null);
    $('#share-result').replaceChildren(h('div.share-new',
      h('div.stack',
        h('div.alert.alert-ok', '✅ Kész a link! ' + (share.expires_at ? 'Érvényes eddig: ' + DT.fmtDate(share.expires_at) : 'Addig érvényes, amíg vissza nem vonod.')),
        h('div.linkbox', input),
        actions,
        h('p.small.muted', 'A QR-kódot telefonnal beolvasva is megnyílik a mese – a vizsgabizottság is kipróbálhatja. 😉')),
      qr));
    input.focus();
  }

  function statusOf(s) {
    if (s.revoked) return ['revoked', 'Visszavonva'];
    if (!s.active) return ['expired', 'Lejárt'];
    return ['active', 'Aktív'];
  }

  function loadList() {
    return api.get('/shares').then(function (res) {
      var box = $('#share-list');
      if (!res.shares.length) { box.replaceChildren(h('p.muted', 'Még nem osztottál meg mesét.')); return; }
      var rows = res.shares.map(function (s) {
        var st = statusOf(s);
        return h('tr',
          h('td', { 'data-label': 'Mese' }, h('b', s.story_title)),
          h('td', { 'data-label': 'Létrehozva' }, DT.fmtDate(s.created_at)),
          h('td', { 'data-label': 'Lejár' }, s.expires_at ? DT.fmtDate(s.expires_at) : 'soha'),
          h('td', { 'data-label': 'Megnyitások' }, String(s.view_count)),
          h('td', { 'data-label': 'Állapot' }, h('span.badge.badge-' + st[0], st[1])),
          h('td', s.active ? h('div.row', { style: 'gap:6px' },
            h('button.btn.btn-sm', { type: 'button', onclick: function () { showResult(s, s.story_title); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Link / QR'),
            h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: function () { revoke(s); } }, 'Visszavonás')) : null));
      });
      box.replaceChildren(h('table.list.responsive',
        h('thead', h('tr', ['Mese', 'Létrehozva', 'Lejár', 'Megnyitások', 'Állapot', ''].map(function (t) { return h('th', { scope: 'col' }, t); }))),
        h('tbody', rows)));
    }).catch(DT.showError);
  }

  function revoke(s) {
    DT.confirm('Visszavonod a linket?', 'Aki ezzel a linkkel próbálja megnyitni „' + s.story_title + '” mesét, az ezután egy „nem érhető el” oldalt lát.', 'Visszavonás', true).then(function (ok) {
      if (!ok) return;
      api.del('/shares/' + s.id).then(function () {
        DT.toast('A link visszavonva.');
        $('#share-result').replaceChildren();
        loadList();
      }, DT.showError);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = +form.story.value;
    if (!id) return;
    var exp = form.exp.value;
    var btn = form.querySelector('[type=submit]');
    DT.busy(btn, true);
    api.post('/stories/' + id + '/share', { expires_in_days: exp ? +exp : null }).then(function (res) {
      DT.busy(btn, false);
      showResult(res.share, form.story.selectedOptions[0].textContent);
      loadList();
    }).catch(function (err) { DT.busy(btn, false); DT.showError(err); });
  });

  api.get('/stories').then(function (res) {
    var sel = form.story;
    if (!res.stories.length) sel.append(h('option', { value: '' }, 'Még nincs meséd'));
    else form.querySelector('[type=submit]').disabled = false;
    res.stories.forEach(function (s) {
      sel.append(h('option', { value: s.id, selected: s.id === wanted }, s.title + (s.status === 'done' ? '' : ' (' + DT.STATUS[s.status].toLowerCase() + ')')));
    });
  }).catch(DT.showError);
  loadList();
});
