// Fiókbeállítások: adatok, gyerekprofilok, jelszócsere, fióktörlés (UC-12).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  if (!DT.requireAuth()) return;
  DT.layout('account');

  var pf = $('#profile-form');
  api.refreshMe().then(function (u) {
    $('#email').value = u.email;
    pf.display_name.value = u.display_name;
  }).catch(DT.showError);

  pf.addEventListener('submit', function (e) {
    e.preventDefault();
    api.patch('/users/me', { display_name: pf.display_name.value }).then(function () {
      return api.refreshMe();
    }).then(function () { DT.toast('Elmentve ✓', { type: 'ok' }); }, DT.showError);
  });

  // ------------------------------------------------------------- gyerekek

  function kidRow(c) {
    var nick = h('input.input', { value: c.nickname, maxlength: '40', 'aria-label': 'Becenév' });
    var av = h('select.select', { 'aria-label': 'Avatar', style: 'width:auto' },
      Object.keys(DT.AVATARS).map(function (k) { return h('option', { value: k, selected: k === c.avatar }, DT.AVATARS[k]); }));
    function save() {
      api.patch('/children/' + c.id, { nickname: nick.value, avatar: av.value }).then(function (r) {
        Object.assign(c, r.child);
        DT.toast('Elmentve ✓', { type: 'ok' });
      }, function (err) { nick.value = c.nickname; DT.showError(err); });
    }
    nick.addEventListener('change', save);
    av.addEventListener('change', save);
    return h('div.row', { style: 'flex-wrap:nowrap' }, av, nick,
      h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'Profil törlése: ' + c.nickname, onclick: function () {
        DT.confirm('Törlöd ' + c.nickname + ' profilját?', 'A meséi megmaradnak, csak nem lesznek gyerekhez rendelve.', 'Törlés', true).then(function (ok) {
          if (ok) api.del('/children/' + c.id).then(loadKids, DT.showError);
        });
      } }, '🗑'));
  }
  function loadKids() {
    return api.get('/children').then(function (res) {
      var box = $('#kids');
      box.replaceChildren();
      if (!res.children.length) box.append(h('p.muted', 'Még nincs gyerekprofil. A mesepolcon tudsz újat felvenni.'));
      res.children.forEach(function (c) { box.append(kidRow(c)); });
    }).catch(DT.showError);
  }
  loadKids();

  // ------------------------------------------------------------- jelszó

  var pw = $('#pw-form');
  pw.addEventListener('submit', function (e) {
    e.preventDefault();
    if (pw.password.value.length < 8) { DT.fieldErrors(pw, { password: 'Legalább 8 karakter legyen.' }); return; }
    DT.fieldErrors(pw, {});
    api.patch('/users/me', { current_password: pw.current_password.value, password: pw.password.value }).then(function () {
      pw.reset();
      DT.toast('Jelszó módosítva ✓', { type: 'ok' });
    }).catch(function (err) {
      if (err.code === 'WRONG_PASSWORD') DT.fieldErrors(pw, { current_password: err.message });
      else DT.showError(err);
    });
  });

  // -------------------------------------------------------- fióktörlés

  $('#delete-account').addEventListener('click', function () {
    var body = h('div.form',
      h('p', 'Biztosan törlöd a fiókodat? Minden mese, rajz és megosztás törlődik.'),
      h('p.small.muted', 'Tipp: ha meg szeretnéd tartani a meséket, előbb nézd meg őket, vagy készíts róluk képernyőfelvételt.'),
      h('div.field', h('label', { for: 'del-pw' }, 'Írd be a jelszavad a megerősítéshez'),
        h('input.input#del-pw', { type: 'password', name: 'password', autocomplete: 'current-password' }), h('span.err')));
    DT.dialog('Fiók törlése', body, [
      { label: 'Mégse', value: null, cls: 'btn-ghost' },
      { label: 'Végleges törlés', value: 'del', cls: 'btn-danger', submit: true }
    ]).then(function (r) {
      if (r.value !== 'del') return;
      api.del('/users/me', { password: r.form.password.value }).then(function () {
        api.clearSession();
        location.replace('index.html');
      }).catch(DT.showError);
    });
  });
});
