/*
 * DrawTale – közös felület: fejléc, lábléc, értesítések, párbeszédablakok.
 * Minden felhasználói szöveg textContent-tel kerül a lapra (NFR-SEC-04).
 */
(function (g) {
  'use strict';

  var DT = g.DT = g.DT || {};
  var api = DT.api;

  DT.AVATARS = { lion: '🦁', cat: '🐱', bear: '🐻', fox: '🦊', owl: '🦉', frog: '🐸', bunny: '🐰', whale: '🐳' };
  DT.STATUS = { draft: 'Vázlat', in_progress: 'Folyamatban', done: 'Kész', processing: 'Feldolgozás…', failed: 'Hibás' };

  /** Kis DOM-építő: h('a.btn.btn-primary', { href: '#' }, 'Szöveg', h(...)) */
  function h(sel, attrs) {
    var tokens = sel.match(/[.#]?[^.#]+/g) || ['div'];
    var el = document.createElement(/^[.#]/.test(tokens[0]) ? 'div' : tokens[0]);
    var classes = [];
    tokens.forEach(function (t) {
      if (t[0] === '#') el.id = t.slice(1);
      else if (t[0] === '.') classes.push(t.slice(1));
    });
    if (classes.length) el.className = classes.join(' ');
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'text') el.textContent = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) add(c);
        else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  DT.h = h;
  DT.$ = function (s, root) { return (root || document).querySelector(s); };

  DT.param = function (k) { return new URLSearchParams(location.search).get(k); };

  DT.fmtDate = function (iso, withTime) {
    if (!iso) return '–';
    var d = new Date(iso);
    var o = { year: 'numeric', month: 'short', day: 'numeric' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleDateString('hu-HU', o);
  };

  // ------------------------------------------------------------------ logó

  DT.logo = function () {
    var a = h('a.logo', { href: api.isLoggedIn() ? 'dashboard.html' : 'index.html', 'aria-label': 'DrawTale – kezdőlap' });
    a.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="7" width="34" height="36" rx="5" fill="#fffdf8" stroke="#2b2b33" stroke-width="3"/>' +
      '<path d="M9 34 Q14 24 19 30 T29 26" fill="none" stroke="#2f6fde" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="28" cy="16" r="4" fill="#ffd23f" stroke="#e6a700" stroke-width="2"/>' +
      '<path d="M33 40 L44 9 L47 10 L36 41 L32 44 Z" fill="#ff8a3d" stroke="#2b2b33" stroke-width="2.5" stroke-linejoin="round"/></svg>' +
      '<span>Draw<b>Tale</b></span>';
    return a;
  };

  // --------------------------------------------------------- fejléc/lábléc

  DT.layout = function (active) {
    var user = api.user();
    var header = h('header.site-header');
    var nav = h('nav.nav', { id: 'main-nav', 'aria-label': 'Fő menü' });
    function link(href, label, key) {
      return h('a', { href: href, 'aria-current': active === key ? 'page' : null }, label);
    }
    if (user) {
      [
        link('dashboard.html', 'Meséim', 'dashboard'),
        link('shares.html', 'Megosztások', 'shares'),
        link('account.html', 'Fiókom', 'account'),
        user.role === 'admin' ? link('admin.html', 'Admin', 'admin') : null,
        h('span.who', { title: user.email }, '👋 ' + user.display_name),
        h('a', { href: '#', onclick: function (e) { e.preventDefault(); DT.logout(); } }, 'Kilépés')
      ].forEach(function (n) { if (n) nav.append(n); });
    } else {
      nav.append(link('index.html', 'Kezdőlap', 'home'), link('login.html', 'Belépés', 'login'), link('register.html', 'Regisztráció', 'register'));
    }
    var menu = h('button.btn.btn-ghost.menu-btn', { 'aria-controls': 'main-nav', 'aria-expanded': 'false', 'aria-label': 'Menü' }, '☰');
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
    });
    header.append(h('div.wrap', DT.logo(), menu, nav));
    document.body.prepend(header);

    if (g.DT_CONFIG && g.DT_CONFIG.mock) {
      var banner = h('div.mock-banner', { role: 'note' }, h('div.wrap',
        h('span', '🧪 Demó mód: a szerver helyett a böngésző válaszol, az adatok csak ezen a gépen vannak.'),
        h('button', { type: 'button', onclick: function () {
          DT.confirm('Demó adatok visszaállítása', 'Minden itt létrehozott mese és fiók törlődik, és visszakerülnek a kiinduló demó mesék.', 'Visszaállítás', true).then(function (ok) {
            if (!ok) return;
            g.DTMock.reset().then(function () { api.clearSession(); location.href = 'index.html'; });
          });
        } }, 'Demó adatok visszaállítása')
      ));
      header.after(banner);
    }

    var footer = h('footer.site-footer', h('div.wrap',
      h('span', '© 2026–27 DrawTale · Vizsgaremek · 13.A'),
      h('span', 'A gyerek alkot, nem a gép. 🖍️')
    ));
    document.body.append(footer);
    document.body.append(h('div.toasts', { id: 'toasts', role: 'status', 'aria-live': 'polite' }));
  };

  DT.logout = function () {
    api.logout().then(function () { location.replace('index.html'); });
  };

  /** Védett oldal: belépés nélkül a belépésre visz, utána vissza ide. */
  DT.requireAuth = function (opts) {
    opts = opts || {};
    function check() {
      var u = api.user();
      if (!api.isLoggedIn()) {
        location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
        return false;
      }
      if (opts.admin && u.role !== 'admin') { location.replace('dashboard.html'); return false; }
      return true;
    }
    // Kijelentkezés után a Vissza gomb ne mutasson védett oldalt (REQ-WEB-01).
    g.addEventListener('pageshow', function (e) { if (e.persisted) check(); });
    g.addEventListener('drawtale:logout', function () { check(); });
    return check();
  };

  // --------------------------------------------------------------- toast

  DT.toast = function (msg, opts) {
    opts = opts || {};
    var box = document.getElementById('toasts') || document.body.appendChild(h('div.toasts', { id: 'toasts', role: 'status', 'aria-live': 'polite' }));
    var t = h('div.toast' + (opts.type ? '.' + opts.type : ''), h('div', msg, opts.requestId ? h('small', 'Hibakód: ' + opts.requestId) : null));
    var timer;
    function close() { clearTimeout(timer); t.remove(); }
    if (opts.action) {
      t.append(h('button', { type: 'button', onclick: function () { close(); opts.action.fn(); } }, opts.action.label));
    }
    box.append(t);
    timer = setTimeout(close, opts.timeout || (opts.action ? 6000 : 4000));
    return close;
  };

  DT.showError = function (err) {
    if (!err) return;
    console.warn(err);
    DT.toast(err.message || 'Váratlan hiba történt.', { type: 'error', requestId: err.requestId, timeout: 6000 });
  };

  // ------------------------------------------------------------- dialog

  DT.dialog = function (title, body, actions) {
    return new Promise(function (resolve) {
      var dlg = h('dialog', { 'aria-labelledby': 'dlg-title' });
      var act = h('div.dlg-actions');
      (actions || []).forEach(function (a) {
        act.append(h('button.btn' + (a.cls ? '.' + a.cls : ''), {
          type: a.submit ? 'submit' : 'button',
          onclick: function (e) {
            if (a.submit) return; // a form kezeli
            e.preventDefault();
            done(a.value);
          }
        }, a.label));
      });
      var form = h('form', { method: 'dialog' }, h('div.dlg-body', h('h2#dlg-title', title), body), act);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var a = (actions || []).filter(function (x) { return x.submit; })[0];
        if (a && a.validate && !a.validate(form)) return;
        done(a ? a.value : true);
      });
      dlg.append(form);
      dlg.addEventListener('cancel', function () { done(null); });
      function done(v) { dlg.close(); dlg.remove(); resolve({ value: v, form: form }); }
      document.body.append(dlg);
      dlg.showModal();
      var first = form.querySelector('input, textarea, select');
      if (first) first.focus();
    });
  };

  DT.confirm = function (title, text, okLabel, danger) {
    return DT.dialog(title, h('p', text), [
      { label: 'Mégse', value: false, cls: 'btn-ghost' },
      { label: okLabel || 'Rendben', value: true, cls: danger ? 'btn-danger' : 'btn-primary' }
    ]).then(function (r) { return r.value === true; });
  };

  DT.busy = function (btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-busy', !!on);
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
  };

  /** Űrlap mezőhibák kiírása (a szerver details mezőjéből). */
  DT.fieldErrors = function (form, details) {
    form.querySelectorAll('.field .err').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    Object.keys(details || {}).forEach(function (name) {
      var inp = form.elements[name];
      if (!inp) return;
      inp.setAttribute('aria-invalid', 'true');
      var err = inp.closest('.field') && inp.closest('.field').querySelector('.err');
      if (err) err.textContent = details[name];
    });
  };

  // ------------------------------------------------------------- jelenet

  /** Egy oldal lejátszható animációja: a mentett, vagy a rajzból álló kép. */
  DT.sceneForPage = function (page) {
    if (page.animation && page.animation.data) return page.animation.data;
    var d = page.drawing;
    if (!d || d.status !== 'done') return null;
    var els = (d.elements || []).concat(d.baked || []);
    return g.DrawTaleAnim.buildAnimation({
      width: d.width, height: d.height, duration: 6, background: d.background_url,
      elements: els.map(function (e) {
        return { id: e.id, name: e.label, image: e.image_url, x: e.bbox.x, y: e.bbox.y, w: e.bbox.w, h: e.bbox.h, z: e.z_order, preset: null };
      })
    });
  };

  /** Kis, álló előnézet egy vásznon (pl. mesekártya borítója). */
  DT.drawStill = function (canvas, anim, t) {
    var p = new g.DrawTalePlayer(canvas, { resolve: api.media, autoplay: false });
    return p.load(anim).then(function () { p.seek(t || 0); p.destroy(); }).catch(function () { p.destroy(); });
  };
})(window);
