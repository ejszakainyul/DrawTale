// Meseszerkesztő: oldalak, rajz feltöltése, „Mi mozogjon?”, Életre kel!
// (UC-04, UC-05, UC-06, UC-07 – a weben is, ahogy a mobilon)
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, api = DT.api, h = DT.h, $ = DT.$, A = window.DrawTaleAnim;
  if (!DT.requireAuth()) return;
  DT.layout('dashboard');

  var storyId = +DT.param('id');
  var state = { story: null, pageId: null, choices: {}, selected: new Set(), speed: 'medium', dirty: false };
  var preview = null;
  var pollTimer = null;
  var saveTimers = {};
  var DRAFTS = 'drawtale.drafts';

  var ERRORS = {
    DRAWING_NO_ELEMENTS: 'Nem találtunk rajzot a képen. Próbáld újra világosabb helyen, fehér papírral!',
    PROCESSING_FAILED: 'Valami elromlott nálunk, már dolgozunk rajta. Az eredeti képed megvan.'
  };

  function page() { return state.story.pages.filter(function (p) { return p.id === state.pageId; })[0]; }
  function setSave(text, cls) {
    var el = $('#save-state');
    el.className = 'save-state' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  // ------------------------------------------------------------ betöltés

  function load() {
    return api.get('/stories/' + storyId).then(function (res) {
      state.story = res.story;
      document.title = res.story.title + ' – szerkesztés – DrawTale';
      $('#story-title').value = res.story.title;
      $('#play-link').href = 'player.html?id=' + storyId;
      $('#share-link').href = 'shares.html?story=' + storyId;
      var want = +new URLSearchParams(location.hash.slice(1)).get('page');
      var p = res.story.pages.filter(function (x) { return x.id === want; })[0] || res.story.pages[0];
      restoreDrafts();
      select(p ? p.id : null);
    }).catch(function (err) {
      if (err.status === 404) {
        $('#page-editor').replaceChildren(h('div.empty', h('div.big', '🔍'), h('h2', 'Ez a mese nem található'), h('a.btn', { href: 'dashboard.html' }, 'Vissza a mesepolchoz')));
      } else DT.showError(err);
    });
  }

  function select(id) {
    state.pageId = id;
    state.selected.clear();
    history.replaceState(null, '', '#page=' + id);
    var p = page();
    initChoices(p);
    renderList();
    renderPage();
  }

  // ----------------------------------------------------------- oldallista

  function pageIcon(p) {
    var d = p.drawing;
    if (!d) return ['🖍️', 'Még nincs rajz'];
    if (d.status === 'failed') return ['⚠️', 'Hibás feldolgozás'];
    if (d.status !== 'done') return ['⏳', 'Feldolgozás…'];
    if (p.animation) return ['✨', 'Életre kelt'];
    return ['🖼️', 'Rajz kész, még nem mozog'];
  }

  function renderList() {
    var box = $('#page-list');
    box.replaceChildren();
    var pages = state.story.pages;
    pages.forEach(function (p, i) {
      var ic = pageIcon(p);
      var item = h('button.page-item', { type: 'button', 'aria-current': String(p.id === state.pageId), draggable: 'true', dataset: { id: p.id } },
        h('span.no', String(p.page_no)),
        h('span.txt', p.text ? p.text : h('i.muted', 'üres oldal')),
        h('span.st', { title: ic[1], 'aria-label': ic[1] }, ic[0]));
      item.addEventListener('click', function () { if (p.id !== state.pageId) select(p.id); });
      item.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(p.id)); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover', function (e) { e.preventDefault(); item.style.borderColor = 'var(--orange)'; });
      item.addEventListener('dragleave', function () { item.style.borderColor = ''; });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        item.style.borderColor = '';
        var from = +e.dataTransfer.getData('text/plain');
        if (from && from !== p.id) movePage(from, p.page_no);
      });
      var row = h('div.row', { style: 'gap:6px;flex-wrap:nowrap' }, item);
      if (p.id === state.pageId && pages.length > 1) {
        row.append(h('div.page-tools', { style: 'flex-direction:column' },
          h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'Oldal feljebb', disabled: i === 0, onclick: function () { movePage(p.id, p.page_no - 1); } }, '▲'),
          h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'Oldal lejjebb', disabled: i === pages.length - 1, onclick: function () { movePage(p.id, p.page_no + 1); } }, '▼')));
      }
      box.append(row);
    });
  }

  function movePage(id, to) {
    api.patch('/stories/' + storyId + '/pages/' + id, { page_no: to }).then(function () {
      return api.get('/stories/' + storyId);
    }).then(function (res) {
      mergePages(res.story.pages);
      renderList();
      var p = page();
      $('#page-title').textContent = p.page_no + '. oldal';
      DT.toast('Sorrend elmentve.');
    }).catch(DT.showError);
  }

  /** A szerver friss oldalai, a még el nem mentett szöveget megtartva. */
  function mergePages(fresh) {
    var local = {};
    state.story.pages.forEach(function (p) { local[p.id] = p; });
    state.story.pages = fresh.map(function (p) {
      if (saveTimers[p.id] && local[p.id]) { p.text = local[p.id].text; }
      return p;
    });
  }

  $('#add-page').addEventListener('click', function (e) {
    var btn = e.currentTarget;
    DT.busy(btn, true);
    api.post('/stories/' + storyId + '/pages', {}).then(function (res) {
      DT.busy(btn, false);
      state.story.pages.push(res.page);
      select(res.page.id);
      var ta = $('#page-text');
      if (ta) ta.focus();
    }).catch(function (err) { DT.busy(btn, false); DT.showError(err); });
  });

  $('#story-title').addEventListener('change', function (e) {
    var v = e.target.value.trim();
    if (!v) { e.target.value = state.story.title; return; }
    api.patch('/stories/' + storyId, { title: v }).then(function (res) {
      state.story.title = res.story.title;
      setSave('Cím elmentve ✓');
    }).catch(DT.showError);
  });

  // ---------------------------------------------------------- szöveg mentése

  function drafts() { try { return JSON.parse(localStorage.getItem(DRAFTS)) || {}; } catch (e) { return {}; } }
  function setDraft(id, text) {
    var d = drafts();
    if (text === null) delete d[id]; else d[id] = text;
    try { localStorage.setItem(DRAFTS, JSON.stringify(d)); } catch (e) { /* */ }
  }
  function restoreDrafts() {
    var d = drafts();
    state.story.pages.forEach(function (p) {
      if (d[p.id] !== undefined && d[p.id] !== p.text) { p.text = d[p.id]; scheduleSave(p, 0); }
    });
  }

  function scheduleSave(p, delay) {
    clearTimeout(saveTimers[p.id]);
    setDraft(p.id, p.text); // a böngészőben is megvan, ha elmenne a net
    if (!navigator.onLine) { setSave('☁̸ Offline – mentve a böngészőbe', 'offline'); return; }
    setSave('Mentés…');
    saveTimers[p.id] = setTimeout(function () { saveText(p); }, delay === undefined ? 800 : delay);
  }

  function saveText(p) {
    var sent = p.text;
    return api.patch('/stories/' + storyId + '/pages/' + p.id, { text: sent, version: p.version }).then(function (res) {
      delete saveTimers[p.id];
      p.version = res.page.version;
      if (p.text === sent) setDraft(p.id, null);
      setSave('Elmentve ✓');
      renderList();
    }).catch(function (err) {
      delete saveTimers[p.id];
      if (err.code === 'VERSION_CONFLICT') return resolveConflict(p, err.details.current);
      if (err.code === 'NETWORK') { setSave('☁̸ Offline – mentve a böngészőbe', 'offline'); return; }
      setSave('Nem sikerült menteni', 'offline');
      DT.showError(err);
    });
  }

  function resolveConflict(p, current) {
    var body = h('div',
      h('p', 'Ezt az oldalt közben máshol (pl. a telefonon) is módosították. Melyik változat maradjon?'),
      h('div.field', h('span.label', 'A te változatod'), h('div.card.tight', p.text || '(üres)')),
      h('div.field', { style: 'margin-top:10px' }, h('span.label', 'A másik változat'), h('div.card.tight', current.text || '(üres)')));
    return DT.dialog('Ütközés', body, [
      { label: 'A másik maradjon', value: 'theirs', cls: 'btn-ghost' },
      { label: 'Az enyém maradjon', value: 'mine', cls: 'btn-primary' }
    ]).then(function (r) {
      p.version = current.version;
      if (r.value === 'mine') return saveText(p);
      p.text = current.text;
      setDraft(p.id, null);
      if (p.id === state.pageId) { var ta = $('#page-text'); if (ta) ta.value = p.text; }
      renderList();
      setSave('A másik változat betöltve');
    });
  }

  window.addEventListener('online', function () {
    setSave('Újra van net, szinkronizálás…');
    state.story && state.story.pages.forEach(function (p) { if (drafts()[p.id] !== undefined) scheduleSave(p, 0); });
  });
  window.addEventListener('offline', function () { setSave('☁̸ Offline – mentve a böngészőbe', 'offline'); });
  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(saveTimers).length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------- oldal törlése

  function deletePage(p) {
    if (state.story.pages.length === 1) { DT.toast('Egy oldalnak mindig maradnia kell.'); return; }
    DT.confirm('Törlöd az oldalt?', 'A(z) ' + p.page_no + '. oldal szövege és rajza törlődik.', 'Törlés', true).then(function (ok) {
      if (!ok) return;
      // 5 másodpercig visszavonható (UC-04): addig csak elrejtjük.
      var idx = state.story.pages.indexOf(p);
      state.story.pages.splice(idx, 1);
      var next = state.story.pages[Math.min(idx, state.story.pages.length - 1)];
      select(next.id);
      var undone = false;
      DT.toast('Oldal törölve.', { action: { label: 'Visszavonás', fn: function () {
        undone = true;
        state.story.pages.splice(idx, 0, p);
        select(p.id);
      } }, timeout: 5000 });
      setTimeout(function () {
        if (undone) return;
        clearTimeout(saveTimers[p.id]);
        delete saveTimers[p.id];
        setDraft(p.id, null);
        api.del('/stories/' + storyId + '/pages/' + p.id).then(function () {
          return api.get('/stories/' + storyId);
        }).then(function (res) { mergePages(res.story.pages); renderList(); if (page()) $('#page-title').textContent = page().page_no + '. oldal'; })
          .catch(DT.showError);
      }, 5200);
    });
  }

  // ------------------------------------------------------------- oldal nézet

  function renderPage() {
    var box = $('#page-editor');
    if (preview) { preview.destroy(); preview = null; }
    clearTimeout(pollTimer);
    var p = page();
    if (!p) { box.replaceChildren(h('p', 'Nincs oldal.')); return; }

    var ta = h('textarea.input#page-text', { 'aria-label': 'Az oldal szövege', maxlength: '2000', placeholder: 'Mi történik ezen az oldalon? Mondd el, én leírom… ✏️' });
    ta.value = p.text || '';
    ta.addEventListener('input', function () { p.text = ta.value; scheduleSave(p); });

    box.replaceChildren(
      h('div.row.spread', { style: 'margin-bottom:12px' },
        h('h2#page-title', { style: 'margin:0' }, p.page_no + '. oldal'),
        h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { deletePage(p); } }, '🗑 Oldal törlése')),
      h('div.field', h('label', { for: 'page-text' }, 'Szöveg'), ta),
      h('h3', { style: 'margin-top:22px' }, 'Rajz'),
      h('div#drawing-area')
    );
    renderDrawing(p);
  }

  function renderDrawing(p) {
    var area = $('#drawing-area');
    if (!area) return;
    if (preview) { preview.destroy(); preview = null; }
    clearTimeout(pollTimer);
    var d = p.drawing;
    var fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png', capture: 'environment', hidden: true });
    fileInput.addEventListener('change', function () { if (fileInput.files[0]) upload(p, fileInput.files[0]); });
    var pickBtn = function (label, cls) {
      return h('button.btn' + (cls || ''), { type: 'button', onclick: function () { fileInput.click(); } }, h('span.ico', '📷'), label);
    };
    var sampleBtn = h('button.btn.btn-ghost', { type: 'button', onclick: function () {
      DT.busy(sampleBtn, true);
      fetch('assets/demo/sample-photo.jpg').then(function (r) { return r.blob(); }).then(function (b) {
        DT.busy(sampleBtn, false);
        upload(p, new File([b], 'minta.jpg', { type: 'image/jpeg' }));
      }).catch(function () { DT.busy(sampleBtn, false); DT.toast('A mintafotó nem tölthető be.', { type: 'error' }); });
    } }, '🧪 Kipróbálom a mintafotóval');

    if (!d) {
      var drop = h('div.drawing-box', { style: 'aspect-ratio:auto;min-height:280px;padding:24px' },
        h('div.stack',
          h('div', { style: 'font-size:3rem', 'aria-hidden': 'true' }, '🖍️📸'),
          h('p', h('b', 'Húzd ide a rajz fotóját'), h('br'), h('span.muted.small', 'JPG vagy PNG, legfeljebb 10 MB. Tipp: fehér papír, jó fény, vastag filc.')),
          h('div.row', { style: 'justify-content:center' }, pickBtn('Fotó kiválasztása', '.btn-primary'), sampleBtn),
          fileInput));
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('drag');
        var f = e.dataTransfer.files[0];
        if (f) upload(p, f);
      });
      area.replaceChildren(drop);
      return;
    }

    if (d.status === 'uploaded' || d.status === 'processing') {
      area.replaceChildren(h('div.drawing-box', h('div.processing',
        h('span.pencil', { 'aria-hidden': 'true' }, '✏️'),
        h('b', 'Kivágjuk a figurákat…'),
        h('span.muted.small', 'Ez általában pár másodperc. Közben nyugodtan írhatod a következő oldalt!'))));
      pollTimer = setTimeout(function () { refreshDrawing(p); }, 1200);
      return;
    }

    if (d.status === 'failed') {
      area.replaceChildren(h('div.drawing-box', { style: 'aspect-ratio:auto;min-height:220px;padding:24px' }, h('div.stack',
        h('div', { style: 'font-size:3rem', 'aria-hidden': 'true' }, '😕'),
        h('p.alert.alert-error', ERRORS[d.error_code] || 'A kép feldolgozása nem sikerült.'),
        h('div.row', { style: 'justify-content:center' }, pickBtn('Új fotó', '.btn-primary'), sampleBtn), fileInput)));
      return;
    }

    // --- kész rajz: előnézet + „Mi mozogjon?”
    var canvas = h('canvas', { role: 'img', 'aria-label': 'A(z) ' + p.page_no + '. oldal jelenete' });
    var box = h('div.drawing-box', { style: 'border-style:solid' }, canvas);
    var playBtn = h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': 'Előnézet megállítása / indítása' }, '⏸');
    area.replaceChildren(
      box,
      h('div.row.spread', { style: 'margin:8px 0 18px' },
        h('span.small.muted', p.animation ? '✨ Ez az oldal már életre kelt. Változtass, és nyomd meg újra!' : 'Válaszd ki, mi mozogjon, aztán: Életre kel!'),
        h('div.row', playBtn, pickBtn('Új fotó', '.btn-sm'), fileInput)),
      h('h3', 'Mi mozogjon?'),
      elementsPanel(p),
      lifeBar(p));
    preview = new window.DrawTalePlayer(canvas, { resolve: api.media });
    preview.load(DT.sceneForPage(p)).then(function () { playBtn.textContent = preview.playing ? '⏸' : '▶'; });
    playBtn.addEventListener('click', function () { playBtn.textContent = preview.toggle() ? '⏸' : '▶'; });
  }

  function refreshDrawing(p) {
    api.get('/drawings/' + p.drawing.id).then(function (res) {
      p.drawing = res.drawing;
      if (res.drawing.status === 'done') {
        initChoices(p, true);
        DT.toast('Kész a rajz! Nézzétek meg, mit találtunk. 🎉', { type: 'ok' });
      }
      renderList();
      if (p.id === state.pageId) renderDrawing(p);
    }).catch(function (err) {
      DT.showError(err);
      pollTimer = setTimeout(function () { refreshDrawing(p); }, 4000);
    });
  }

  function upload(p, file) {
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      DT.toast('Ez a fájl nem használható. Válassz egy JPG vagy PNG képet!', { type: 'error' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      DT.toast('A kép túl nagy (legfeljebb 10 MB lehet).', { type: 'error' });
      return;
    }
    var fd = new FormData();
    fd.append('photo', file);
    var area = $('#drawing-area');
    area.replaceChildren(h('div.drawing-box', h('div.processing', h('span.pencil', '📤'), h('b', 'Feltöltés…'))));
    api.post('/pages/' + p.id + '/drawing', fd).then(function (res) {
      p.drawing = res.drawing;
      p.animation = null;
      renderList();
      renderDrawing(p);
    }).catch(function (err) {
      DT.showError(err);
      renderDrawing(p);
    });
  }

  // --------------------------------------------------------- Mi mozogjon?

  function suggest(el, d) {
    var b = el.bbox;
    if (b.y + b.h / 2 < d.height * 0.3) return b.w > b.h * 1.3 ? 'fly' : 'float';
    if (b.h > b.w * 1.4) return 'wave';
    if (b.w > b.h * 1.2) return 'walk';
    return 'bounce';
  }

  function initChoices(p, fresh) {
    if (!p || !p.drawing || p.drawing.status !== 'done') return;
    var fromAnim = {};
    if (p.animation && !fresh) {
      p.animation.data.tracks.forEach(function (t) {
        fromAnim[t.element] = t.preset || null;
        if (t.speed) state.speed = t.speed;
      });
    }
    p.drawing.elements.forEach(function (el) {
      if (Object.prototype.hasOwnProperty.call(fromAnim, el.id)) state.choices[el.id] = fromAnim[el.id];
      else if (!(el.id in state.choices) || fresh) state.choices[el.id] = el.is_animated ? suggest(el, p.drawing) : null;
    });
  }

  function elementsPanel(p) {
    var d = p.drawing;
    var list = h('div.elements');
    if (!d.elements.length) list.append(h('p.muted', 'Nincs kivágott elem ezen az oldalon.'));
    d.elements.forEach(function (el) {
      var moving = !!state.choices[el.id];
      var thumb = h('div.thumb', { role: 'img', 'aria-label': el.label || 'elem' });
      api.media(el.image_url).then(function (u) { if (u) thumb.style.backgroundImage = 'url("' + u + '")'; });
      var check = h('input', { type: 'checkbox', 'aria-label': 'Kijelölés: ' + (el.label || 'elem'), checked: state.selected.has(el.id) });
      var name = h('input.name', { value: el.label || '', maxlength: '40', 'aria-label': 'Az elem neve', placeholder: 'névtelen' });
      name.addEventListener('change', function () {
        api.patch('/elements/' + el.id, { label: name.value }).then(function (r) { el.label = r.element.label; }, DT.showError);
      });
      var row = h('div.el-row' + (state.selected.has(el.id) ? '.selected' : ''));
      check.addEventListener('change', function () {
        if (check.checked) state.selected.add(el.id); else state.selected.delete(el.id);
        row.classList.toggle('selected', check.checked);
        updateSelTools();
      });
      var seg = h('div.seg', { role: 'group', 'aria-label': 'Mozog vagy háttér' },
        h('button', { type: 'button', 'aria-pressed': String(moving), onclick: function () { setChoice(el, state.choices[el.id] || suggest(el, d)); } }, '🏃 Mozog'),
        h('button', { type: 'button', 'aria-pressed': String(!moving), onclick: function () { setChoice(el, null); } }, '🖼️ Háttér'));
      var presets = h('div.presets', { role: 'group', 'aria-label': 'Mozgásminta' },
        A.PRESETS.map(function (pr) {
          return h('button.preset', { type: 'button', title: pr.hint, disabled: !moving, 'aria-pressed': String(state.choices[el.id] === pr.key), onclick: function () { setChoice(el, pr.key); } },
            h('span', { 'aria-hidden': 'true' }, pr.icon), pr.label);
        }));
      row.append(check, thumb, h('div.controls', h('div.row.spread', name, seg), presets));
      list.append(row);
    });
    var tools = h('div.row#sel-tools', { style: 'margin-top:10px' });
    var wrap = h('div', list, tools);
    setTimeout(updateSelTools);
    return wrap;
  }

  function setChoice(el, preset) {
    state.choices[el.id] = preset;
    state.dirty = true;
    renderDrawing(page());
  }

  function updateSelTools() {
    var box = $('#sel-tools');
    if (!box) return;
    var n = state.selected.size;
    box.replaceChildren();
    if (!n) { box.append(h('span.small.muted', 'Tipp: jelölj ki elemeket a négyzettel, ha törölnéd vagy összevonnád őket.')); return; }
    box.append(
      h('span.small', h('b', n + ' kijelölve')),
      h('button.btn.btn-sm', { type: 'button', disabled: n < 2, onclick: mergeSelected }, '🔗 Összevonás'),
      h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: deleteSelected }, '🗑 Törlés'));
  }

  function mergeSelected() {
    var p = page(), ids = Array.from(state.selected);
    api.post('/elements/merge', { ids: ids }).then(function (res) {
      p.drawing.elements = p.drawing.elements.filter(function (e) { return ids.indexOf(e.id) < 0; }).concat([res.element])
        .sort(function (a, b) { return a.z_order - b.z_order; });
      state.choices[res.element.id] = state.choices[ids[0]] || suggest(res.element, p.drawing);
      state.selected.clear();
      state.dirty = true;
      DT.toast('Összevontuk: most már egy elem. 🧩', { type: 'ok' });
      renderDrawing(p);
    }).catch(DT.showError);
  }

  function deleteSelected() {
    var p = page(), ids = Array.from(state.selected);
    DT.confirm('Törlöd a kijelölt elemeket?', 'Ezek nem fognak mozogni, de a rajzon a helyükön maradnak (mintha le lennének rajzolva).', 'Törlés', true).then(function (ok) {
      if (!ok) return;
      Promise.all(ids.map(function (id) { return api.del('/elements/' + id); })).then(function () {
        return api.get('/drawings/' + p.drawing.id);
      }).then(function (res) {
        p.drawing = res.drawing;
        state.selected.clear();
        state.dirty = true;
        renderDrawing(p);
      }).catch(DT.showError);
    });
  }

  // ----------------------------------------------------------- Életre kel!

  function lifeBar(p) {
    var btn = h('button.btn.btn-accent.btn-big', { type: 'button' }, h('span.ico', '✨'), 'Életre kel!');
    var speed = h('div.seg', { role: 'group', 'aria-label': 'Sebesség' },
      [['slow', '🐢 Lassú'], ['medium', 'Közepes'], ['fast', '🐇 Gyors']].map(function (s) {
        return h('button', { type: 'button', 'aria-pressed': String(state.speed === s[0]), onclick: function () { state.speed = s[0]; state.dirty = true; renderDrawing(p); } }, s[1]);
      }));
    btn.addEventListener('click', function () {
      var started = performance.now();
      DT.busy(btn, true);
      var payload = {
        speed: state.speed,
        elements: p.drawing.elements.map(function (e) { return { id: e.id, preset: state.choices[e.id] || null }; })
      };
      api.post('/pages/' + p.id + '/animation/auto', payload).then(function (res) {
        p.animation = res.animation;
        p.drawing.elements.forEach(function (e) { e.is_animated = !!state.choices[e.id]; });
        state.dirty = false;
        renderList();
        renderDrawing(p);
        var ms = Math.round(performance.now() - started);
        DT.toast('Életre kelt! ✨ (' + (ms / 1000).toFixed(1) + ' mp)', { type: 'ok' });
        $('#drawing-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function (err) { DT.busy(btn, false); DT.showError(err); });
    });
    return h('div.life-bar', h('div.row', h('span.label', 'Sebesség:'), speed), btn);
  }

  load();
});
