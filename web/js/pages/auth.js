// Belépés, regisztráció, elfelejtett jelszó (UC-01, UC-02).
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$;
  var page = document.body.dataset.page;
  DT.layout(page);

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function nextUrl() {
    var n = DT.param('next');
    // Csak saját, relatív oldalra irányítunk vissza (nyílt átirányítás ellen).
    return n && /^[a-z]+\.html(\?[\w=&%.-]*)?$/i.test(n) ? n : 'dashboard.html';
  }
  function showAlert(el, err) {
    el.hidden = false;
    el.replaceChildren(document.createTextNode(err.message));
    if (err.requestId) el.append(h('div.small', { style: 'font-weight:400' }, 'Hibakód: ' + err.requestId));
  }

  if (api.isLoggedIn() && page !== 'reset') { location.replace(nextUrl()); return; }
  if (!(window.DT_CONFIG && window.DT_CONFIG.mock)) document.querySelectorAll('[data-mock-only]').forEach(function (e) { e.remove(); });

  // ------------------------------------------------------------------ belépés
  if (page === 'login') {
    var form = $('#login-form'), errBox = $('#login-error');
    var fill = $('#fill-demo');
    if (fill) fill.addEventListener('click', function () { form.email.value = 'anna@demo.hu'; form.password.value = 'demo1234'; form.querySelector('[type=submit]').focus(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errBox.hidden = true;
      var btn = form.querySelector('[type=submit]');
      DT.busy(btn, true);
      api.login(form.email.value.trim(), form.password.value).then(function () {
        location.replace(nextUrl());
      }).catch(function (err) {
        DT.busy(btn, false);
        showAlert(errBox, err);
        if (err.code === 'TOO_MANY_ATTEMPTS') errBox.append(' ', h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); showForgot(); } }, 'Új jelszót kérek'));
        form.password.select();
      });
    });

    var showForgot = function () {
      $('#login-card').hidden = true;
      $('#forgot-card').hidden = false;
      $('#forgot-email').value = form.email.value;
      $('#forgot-email').focus();
    };
    $('#forgot-link').addEventListener('click', function (e) { e.preventDefault(); showForgot(); });
    if (location.hash === '#forgot') showForgot();

    $('#forgot-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, out = $('#forgot-result'), btn = f.querySelector('[type=submit]');
      if (!EMAIL_RE.test(f.email.value.trim())) { out.replaceChildren(h('div.alert.alert-error', 'Adj meg egy érvényes e-mail címet!')); return; }
      DT.busy(btn, true);
      api.post('/auth/forgot', { email: f.email.value.trim() }).then(function (res) {
        DT.busy(btn, false);
        // Biztonsági okból akkor is ezt írjuk, ha nincs ilyen fiók.
        out.replaceChildren(h('div.alert.alert-ok', 'Ha van ilyen fiók, elküldtük a linket. Nézd meg a postafiókod (a spam mappát is)!'));
        if (res && res._demoResetLink) {
          out.append(h('p.demo-hint', { style: 'margin-top:10px' }, 'Demó módban nincs e-mail küldés – itt a link: ', h('a', { href: res._demoResetLink }, 'új jelszó megadása')));
        }
      }).catch(function (err) { DT.busy(btn, false); DT.showError(err); });
    });
  }

  // ------------------------------------------------------------ regisztráció
  if (page === 'register') {
    var rf = $('#register-form'), rbtn = $('#register-btn'), rerr = $('#register-error');
    // Csak a nyilatkozat elfogadása után aktív (UC-01, 3. lépés).
    rf.consent.addEventListener('change', function () { rbtn.disabled = !rf.consent.checked; });

    function clientCheck() {
      var errs = {};
      if (!EMAIL_RE.test(rf.email.value.trim())) errs.email = 'Adj meg egy érvényes e-mail címet!';
      if (rf.password.value.length < 8) errs.password = 'Legalább 8 karakter legyen.';
      if (rf.password2.value !== rf.password.value) errs.password2 = 'A két jelszó nem egyezik.';
      return errs;
    }
    // Rögtön jelez, még küldés előtt (UC-01, 2. lépés).
    ['email', 'password', 'password2'].forEach(function (n) {
      rf[n].addEventListener('blur', function () {
        var errs = clientCheck();
        var all = {};
        ['email', 'password', 'password2'].forEach(function (k) { if (rf[k].value && errs[k]) all[k] = errs[k]; });
        DT.fieldErrors(rf, all);
      });
    });

    rf.addEventListener('submit', function (e) {
      e.preventDefault();
      rerr.hidden = true;
      var errs = clientCheck();
      DT.fieldErrors(rf, errs);
      if (Object.keys(errs).length) { rf.querySelector('[aria-invalid]').focus(); return; }
      DT.busy(rbtn, true);
      api.register({ email: rf.email.value.trim(), password: rf.password.value, display_name: rf.display_name.value.trim(), consent: rf.consent.checked })
        .then(function () { location.replace('dashboard.html?welcome=1'); })
        .catch(function (err) {
          DT.busy(rbtn, false);
          rbtn.disabled = !rf.consent.checked;
          if (err.details) DT.fieldErrors(rf, err.details);
          showAlert(rerr, err);
          if (err.code === 'EMAIL_TAKEN') {
            rerr.append(h('div.row', { style: 'margin-top:8px' }, h('a.btn.btn-sm', { href: 'login.html' }, 'Belépés'), h('a.btn.btn-sm.btn-ghost', { href: 'login.html#forgot' }, 'Elfelejtett jelszó')));
          }
        });
    });
  }

  // ---------------------------------------------------------- új jelszó
  if (page === 'reset') {
    var token = new URLSearchParams(location.hash.slice(1)).get('token');
    var sf = $('#reset-form'), serr = $('#reset-error');
    if (!token) {
      showAlert(serr, { message: 'Hiányzik a link kódja. Kérj új linket!' });
      sf.querySelector('[type=submit]').disabled = true;
    }
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      serr.hidden = true;
      if (sf.password.value.length < 8) { DT.fieldErrors(sf, { password: 'Legalább 8 karakter legyen.' }); return; }
      var btn = sf.querySelector('[type=submit]');
      DT.busy(btn, true);
      api.resetPassword(token, sf.password.value).then(function () {
        location.replace('dashboard.html');
      }).catch(function (err) {
        DT.busy(btn, false);
        showAlert(serr, err);
        if (err.code === 'RESET_EXPIRED') serr.append(' ', h('a', { href: 'login.html#forgot' }, 'Új linket kérek'));
      });
    });
  }
});
