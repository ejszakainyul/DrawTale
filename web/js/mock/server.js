/*
 * DrawTale – ál-szerver a böngészőben (csak demó / fejlesztés).
 *
 * Ugyanazokat a végpontokat, válaszokat és hibakódokat adja, mint amit a
 * PHP API-tól várunk (docs/api-web.md), így a web a szerver elkészülte előtt
 * is fejleszthető és bemutatható. A DT_CONFIG.mock = false kapcsolóval
 * a valódi szerverre vált.
 *
 * Tárolás: táblák → localStorage, képek → IndexedDB.
 */
(function (g) {
  'use strict';

  var DB_KEY = 'drawtale.mockdb.v1';
  var A = g.DrawTaleAnim;
  var cfg = g.DT_CONFIG || {};
  var db = null;
  var ready = null;

  // ------------------------------------------------------------ segédek

  function now() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function rid() { return Math.random().toString(16).slice(2, 10); }
  function randomToken(bytes) {
    var a = new Uint8Array(bytes || 32);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function sha256(text) {
    if (!(g.crypto && crypto.subtle)) return Promise.resolve('plain:' + text);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('drawtale-mock:' + text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function nextId(table) { db.seq[table] = (db.seq[table] || 0) + 1; return db.seq[table]; }
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('Mock DB mentése nem sikerült', e); }
  }
  function find(table, pred) { return db[table].filter(pred)[0] || null; }
  function byId(table, id) { id = +id; return find(table, function (r) { return r.id === id; }); }
  function remove(table, pred) { db[table] = db[table].filter(function (r) { return !pred(r); }); }

  function HttpError(status, code, message, details) {
    this.status = status; this.code = code; this.message = message; this.details = details;
  }
  function fail(status, code, message, details) { throw new HttpError(status, code, message, details); }
  var NOT_FOUND = function () { fail(404, 'NOT_FOUND', 'Ezt nem találjuk. Lehet, hogy törölték?'); };

  // ------------------------------------------------------- képtár (IndexedDB)

  var idb = null;
  var urlCache = {};
  function openIdb() {
    if (idb) return idb;
    idb = new Promise(function (resolve, reject) {
      var req = indexedDB.open('drawtale-mock', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('blobs'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return idb;
  }
  function blobOp(mode, fn) {
    return openIdb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('blobs', mode);
        var r = fn(tx.objectStore('blobs'));
        tx.oncomplete = function () { resolve(r && r.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function putBlob(blob) {
    var key = 'mock/' + randomToken(9);
    return blobOp('readwrite', function (s) { s.put(blob, key); }).then(function () { return key; });
  }
  function getBlob(key) { return blobOp('readonly', function (s) { return s.get(key); }); }
  function deleteBlobs(keys) {
    keys = keys.filter(function (k) { return k && k.indexOf('mock/') === 0; });
    if (!keys.length) return Promise.resolve();
    return blobOp('readwrite', function (s) { keys.forEach(function (k) { s.delete(k); }); });
  }
  function mediaUrl(path) {
    if (urlCache[path]) return Promise.resolve(urlCache[path]);
    return getBlob(path).then(function (b) {
      if (!b) return null;
      urlCache[path] = URL.createObjectURL(b);
      return urlCache[path];
    });
  }

  // ---------------------------------------------------------- inicializálás

  function init() {
    if (ready) return ready;
    ready = Promise.resolve().then(function () {
      try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
      if (db && db.seq) return;
      return Promise.all([sha256('demo1234'), sha256('admin1234')]).then(function (h) {
        db = g.DTMockSeed.build({ demo: h[0], admin: h[1] });
        save();
      });
    });
    return ready;
  }

  function reset() {
    localStorage.removeItem(DB_KEY);
    db = null; ready = null;
    var all = Object.keys(urlCache);
    all.forEach(function (k) { URL.revokeObjectURL(urlCache[k]); delete urlCache[k]; });
    return openIdb().then(function () { return blobOp('readwrite', function (s) { s.clear(); }); }).catch(function () {}).then(init);
  }

  // -------------------------------------------------------------- tokenek

  var ACCESS_TTL = 15 * 60 * 1000;
  var REFRESH_TTL = 14 * 864e5;

  function issueTokens(user) {
    var access = 'acc_' + randomToken(24);
    var refresh = 'ref_' + randomToken(32);
    db.sessions[access] = { user_id: user.id, exp: Date.now() + ACCESS_TTL };
    db.refresh_tokens.push({ id: nextId('refresh_tokens'), user_id: user.id, token_hash: refresh, expires_at: Date.now() + REFRESH_TTL, revoked: false });
    // lejárt munkamenetek takarítása
    Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].exp < Date.now()) delete db.sessions[k]; });
    return { accessToken: access, refreshToken: refresh };
  }
  function revokeAllTokens(userId) {
    Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].user_id === userId) delete db.sessions[k]; });
    db.refresh_tokens.forEach(function (t) { if (t.user_id === userId) t.revoked = true; });
  }

  function publicUser(u) {
    return { id: u.id, email: u.email, display_name: u.display_name, role: u.role, consent_at: u.consent_at, created_at: u.created_at };
  }

  function authUser(req) {
    var h = req.headers && req.headers.Authorization;
    var tok = h && h.indexOf('Bearer ') === 0 ? h.slice(7) : null;
    var s = tok && db.sessions[tok];
    if (!s) fail(401, 'UNAUTHORIZED', 'Jelentkezz be újra!');
    if (s.exp < Date.now()) fail(401, 'TOKEN_EXPIRED', 'Lejárt a belépésed, frissítjük…');
    var u = byId('users', s.user_id);
    if (!u || u.deleted_at) fail(401, 'UNAUTHORIZED', 'Jelentkezz be újra!');
    if (u.is_blocked) fail(403, 'ACCOUNT_BLOCKED', 'Ezt a fiókot letiltottuk. Írj nekünk, ha szerinted tévedés!');
    return u;
  }
  function requireAdmin(u) { if (u.role !== 'admin') fail(403, 'FORBIDDEN', 'Ehhez nincs jogosultságod.'); }

  // ------------------------------------------------- tulajdonos-ellenőrzés

  // REQ-API-03: másé = 404, hogy azt se áruljuk el, létezik-e.
  function ownStory(u, id) {
    var s = byId('stories', id);
    if (!s || (s.owner_id !== u.id && u.role !== 'admin')) NOT_FOUND();
    return s;
  }
  function ownPage(u, id) {
    var p = byId('story_pages', id);
    if (!p) NOT_FOUND();
    ownStory(u, p.story_id);
    return p;
  }
  function ownDrawing(u, id) {
    var d = byId('drawings', id);
    if (!d) NOT_FOUND();
    ownPage(u, d.story_page_id);
    return d;
  }
  function ownElement(u, id) {
    var e = byId('drawing_elements', id);
    if (!e || e.is_deleted) NOT_FOUND();
    ownDrawing(u, e.drawing_id);
    return e;
  }

  // ------------------------------------------------------------ nézetek

  function elementView(e) {
    return { id: e.id, image_url: e.image_path, bbox: { x: e.bbox_x, y: e.bbox_y, w: e.bbox_w, h: e.bbox_h }, label: e.label, is_animated: e.is_animated, z_order: e.z_order };
  }
  function drawingView(d) {
    if (!d) return null;
    var els = db.drawing_elements.filter(function (e) { return e.drawing_id === d.id; })
      .sort(function (a, b) { return a.z_order - b.z_order; });
    return {
      id: d.id, page_id: d.story_page_id, status: d.status, error_code: d.error_code || null,
      width: d.width, height: d.height, original_url: d.original_path, background_url: d.background_path,
      elements: els.filter(function (e) { return !e.is_deleted; }).map(elementView),
      // A törölt elemek „a háttérben maradnak, mintha le lennének rajzolva” (UC-06).
      baked: els.filter(function (e) { return e.is_deleted; }).map(elementView),
      created_at: d.created_at
    };
  }
  function pageDrawing(page) {
    var ds = db.drawings.filter(function (d) { return d.story_page_id === page.id; });
    return ds[ds.length - 1] || null;
  }
  function pageView(p) {
    var anim = find('page_animations', function (a) { return a.story_page_id === p.id; });
    return {
      id: p.id, story_id: p.story_id, page_no: p.page_no, text: p.text, version: p.version, updated_at: p.updated_at,
      drawing: drawingView(pageDrawing(p)),
      animation: anim ? { data: anim.data, version: anim.version, updated_at: anim.updated_at } : null
    };
  }
  function storyPages(s) {
    return db.story_pages.filter(function (p) { return p.story_id === s.id; }).sort(function (a, b) { return a.page_no - b.page_no; });
  }
  function storySummary(s) {
    var pages = storyPages(s);
    var cover = null;
    for (var i = 0; i < pages.length && !cover; i++) {
      var v = pageView(pages[i]);
      if (v.drawing && v.drawing.status === 'done') cover = v;
    }
    var processing = pages.some(function (p) { var d = pageDrawing(p); return d && (d.status === 'processing' || d.status === 'uploaded'); });
    return {
      id: s.id, title: s.title, status: s.status, processing: processing, child_profile_id: s.child_profile_id,
      page_count: pages.length, cover_page: cover, created_at: s.created_at, updated_at: s.updated_at
    };
  }
  function storyView(s) {
    var o = storySummary(s);
    delete o.cover_page;
    o.pages = storyPages(s).map(pageView);
    return o;
  }
  function touchStory(s) {
    s.updated_at = now();
    var pages = storyPages(s);
    var animated = pages.filter(function (p) { return find('page_animations', function (a) { return a.story_page_id === p.id; }); }).length;
    s.status = pages.length && animated === pages.length ? 'done' : animated > 0 || pages.some(function (p) { return pageDrawing(p); }) ? 'in_progress' : 'draft';
  }
  function audit(u, action, ref) {
    db.audit_log.push({ at: now(), user_id: u ? u.id : null, action: action, ref: ref || null });
    if (db.audit_log.length > 500) db.audit_log.shift();
  }

  // ---------------------------------------------------------- validáció

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

  // ---------------------------------------------------------- feldolgozás

  function runCutout(drawing, source) {
    var job = { id: nextId('processing_jobs'), type: 'cutout', ref_id: drawing.id, status: 'queued', attempts: 0, error_msg: null, created_at: now(), updated_at: now() };
    db.processing_jobs.push(job);
    save();
    processJob(job, source);
    return job;
  }

  function processJob(job, source) {
    var drawing = byId('drawings', job.ref_id);
    job.status = 'processing'; job.attempts++; job.updated_at = now();
    drawing.status = 'processing';
    save();
    var started = Date.now();
    var src = source ? Promise.resolve(source) : (drawing.original_path.indexOf('mock/') === 0 ? getBlob(drawing.original_path) : Promise.resolve(drawing.original_path));
    return src.then(function (s) { return g.DTCutout.cutout(s); }).then(function (res) {
      if (!res.elements.length) {
        drawing.status = 'failed';
        drawing.error_code = 'DRAWING_NO_ELEMENTS';
        job.status = 'done'; job.error_msg = 'Nem található rajz a képen.';
        return;
      }
      return Promise.all([putBlob(res.background)].concat(res.elements.map(function (e) { return putBlob(e.blob); }))).then(function (keys) {
        drawing.background_path = keys[0];
        drawing.width = res.width; drawing.height = res.height;
        remove('drawing_elements', function (e) { return e.drawing_id === drawing.id; });
        res.elements.forEach(function (e, i) {
          db.drawing_elements.push({ id: nextId('drawing_elements'), drawing_id: drawing.id, image_path: keys[i + 1], bbox_x: e.x, bbox_y: e.y, bbox_w: e.w, bbox_h: e.h, label: 'elem ' + (i + 1), is_animated: true, is_deleted: false, z_order: i });
        });
        drawing.status = 'done'; drawing.error_code = null;
        job.status = 'done'; job.error_msg = null;
      });
    }).catch(function (err) {
      job.error_msg = String(err && err.message || err);
      if (job.attempts < 3) { job.status = 'queued'; drawing.status = 'processing'; return processJob(job, source); }
      job.status = 'failed'; drawing.status = 'failed'; drawing.error_code = 'PROCESSING_FAILED';
    }).then(function () {
      // Hogy a „Feldolgozás…” állapot látszódjon (valódi szerveren 5–30 mp).
      var wait = Math.max(0, 1600 - (Date.now() - started));
      return new Promise(function (r) { setTimeout(r, wait); });
    }).then(function () {
      job.updated_at = now();
      var page = byId('story_pages', drawing.story_page_id);
      var story = page && byId('stories', page.story_id);
      if (story) touchStory(story);
      save();
    });
  }

  function compositeElements(els) {
    // Két elem összevonása egy PNG-be (REQ-API-11).
    var x0 = Math.min.apply(null, els.map(function (e) { return e.bbox_x; }));
    var y0 = Math.min.apply(null, els.map(function (e) { return e.bbox_y; }));
    var x1 = Math.max.apply(null, els.map(function (e) { return e.bbox_x + e.bbox_w; }));
    var y1 = Math.max.apply(null, els.map(function (e) { return e.bbox_y + e.bbox_h; }));
    var c = document.createElement('canvas');
    c.width = Math.round(x1 - x0); c.height = Math.round(y1 - y0);
    var ctx = c.getContext('2d');
    return Promise.all(els.map(function (e) {
      return g.DT.api.media(e.image_path).then(g.DrawTalePlayer.loadImage);
    })).then(function (imgs) {
      imgs.forEach(function (img, i) {
        var e = els[i];
        ctx.drawImage(img, e.bbox_x - x0, e.bbox_y - y0, e.bbox_w, e.bbox_h);
      });
      return new Promise(function (r) { c.toBlob(r, 'image/png'); });
    }).then(putBlob).then(function (key) {
      return { key: key, x: x0, y: y0, w: c.width, h: c.height };
    });
  }

  function cascadeDeleteStory(s) {
    var blobs = [];
    storyPages(s).forEach(function (p) {
      db.drawings.filter(function (d) { return d.story_page_id === p.id; }).forEach(function (d) {
        blobs.push(d.original_path, d.background_path);
        db.drawing_elements.filter(function (e) { return e.drawing_id === d.id; }).forEach(function (e) { blobs.push(e.image_path); });
        remove('drawing_elements', function (e) { return e.drawing_id === d.id; });
      });
      remove('drawings', function (d) { return d.story_page_id === p.id; });
      remove('page_animations', function (a) { return a.story_page_id === p.id; });
    });
    remove('story_pages', function (p) { return p.story_id === s.id; });
    remove('share_links', function (l) { return l.story_id === s.id; });
    remove('stories', function (x) { return x.id === s.id; });
    deleteBlobs(blobs);
  }

  function renumber(storyId) {
    db.story_pages.filter(function (p) { return p.story_id === storyId; })
      .sort(function (a, b) { return a.page_no - b.page_no; })
      .forEach(function (p, i) { p.page_no = i + 1; });
  }

  function shareView(l) {
    var s = byId('stories', l.story_id);
    var expired = l.expires_at && new Date(l.expires_at) < new Date();
    return {
      id: l.id, story_id: l.story_id, story_title: s ? s.title : '', token: l.token,
      expires_at: l.expires_at, revoked: l.revoked, active: !l.revoked && !expired,
      view_count: l.view_count, created_at: l.created_at
    };
  }

  var publicMisses = {};

  // --------------------------------------------------------------- útvonalak

  var routes = [];
  function route(method, pattern, handler) {
    var keys = [];
    var re = new RegExp('^' + pattern.replace(/\{(\w+)\}/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method: method, re: re, keys: keys, handler: handler });
  }

  // --- auth
  route('POST', '/auth/register', function (req) {
    var b = req.body || {};
    var email = str(b.email, 190).toLowerCase();
    var errors = {};
    if (!EMAIL_RE.test(email)) errors.email = 'Adj meg egy érvényes e-mail címet!';
    if (typeof b.password !== 'string' || b.password.length < 8) errors.password = 'Legalább 8 karakter legyen.';
    if (b.consent !== true) fail(422, 'CONSENT_REQUIRED', 'A regisztrációhoz el kell fogadnod a szülői nyilatkozatot.');
    if (Object.keys(errors).length) fail(422, 'VALIDATION_FAILED', 'Néhány mező hibás.', errors);
    if (find('users', function (u) { return u.email === email && !u.deleted_at; })) {
      fail(409, 'EMAIL_TAKEN', 'Ezzel az e-mail címmel már regisztráltak. Belépsz inkább?');
    }
    return sha256(b.password).then(function (hash) {
      var u = { id: nextId('users'), email: email, password_hash: hash, display_name: str(b.display_name, 80) || email.split('@')[0], role: 'parent', consent_at: now(), is_blocked: false, created_at: now(), deleted_at: null };
      db.users.push(u);
      audit(u, 'register');
      var t = issueTokens(u);
      return [201, { user: publicUser(u), accessToken: t.accessToken, refreshToken: t.refreshToken }];
    });
  });

  route('POST', '/auth/login', function (req) {
    var b = req.body || {};
    var email = str(b.email, 190).toLowerCase();
    var att = db.login_attempts[email] || { count: 0, until: 0 };
    if (att.until > Date.now()) fail(429, 'TOO_MANY_ATTEMPTS', 'Túl sok próbálkozás. Próbáld újra 15 perc múlva, vagy kérj új jelszót!');
    var u = find('users', function (x) { return x.email === email && !x.deleted_at; });
    return sha256(String(b.password || '')).then(function (hash) {
      if (!u || u.password_hash !== hash) {
        att.count++;
        if (att.count >= 5) { att.until = Date.now() + 15 * 60 * 1000; att.count = 0; }
        db.login_attempts[email] = att;
        save();
        fail(401, 'INVALID_CREDENTIALS', 'Hibás e-mail vagy jelszó.');
      }
      if (u.is_blocked) fail(403, 'ACCOUNT_BLOCKED', 'Ezt a fiókot letiltottuk. Írj nekünk, ha szerinted tévedés!');
      delete db.login_attempts[email];
      audit(u, 'login');
      var t = issueTokens(u);
      return [200, { user: publicUser(u), accessToken: t.accessToken, refreshToken: t.refreshToken }];
    });
  });

  route('POST', '/auth/refresh', function (req) {
    var tok = (req.body || {}).refreshToken;
    var r = find('refresh_tokens', function (x) { return x.token_hash === tok; });
    if (!r || r.revoked || r.expires_at < Date.now()) fail(401, 'INVALID_REFRESH', 'Jelentkezz be újra!');
    var u = byId('users', r.user_id);
    if (!u || u.deleted_at || u.is_blocked) fail(401, 'INVALID_REFRESH', 'Jelentkezz be újra!');
    r.revoked = true; // rotáció: a régi refresh token egyszer használható
    return [200, issueTokens(u)];
  });

  route('POST', '/auth/logout', function (req) {
    var tok = (req.body || {}).refreshToken;
    var r = find('refresh_tokens', function (x) { return x.token_hash === tok; });
    if (r) r.revoked = true;
    var h = req.headers.Authorization;
    if (h) delete db.sessions[h.slice(7)];
    return [204, null];
  });

  route('POST', '/auth/forgot', function (req) {
    var email = str((req.body || {}).email, 190).toLowerCase();
    var u = find('users', function (x) { return x.email === email && !x.deleted_at; });
    var body = { ok: true };
    if (u) {
      var token = randomToken(32);
      db.reset_tokens.push({ token: token, user_id: u.id, expires_at: Date.now() + 3600e3, used: false });
      // Valódi szerveren ez e-mailben megy ki; a demóban visszaadjuk, hogy ki lehessen próbálni.
      body._demoResetLink = 'reset.html#token=' + token;
    }
    return [202, body];
  });

  route('POST', '/auth/reset', function (req) {
    var b = req.body || {};
    var r = find('reset_tokens', function (x) { return x.token === b.token; });
    if (!r || r.used || r.expires_at < Date.now()) fail(410, 'RESET_EXPIRED', 'Ez a link már lejárt. Kérj újat!');
    if (typeof b.password !== 'string' || b.password.length < 8) fail(422, 'VALIDATION_FAILED', 'Legalább 8 karakter legyen.', { password: 'Legalább 8 karakter legyen.' });
    var u = byId('users', r.user_id);
    return sha256(b.password).then(function (hash) {
      u.password_hash = hash;
      r.used = true;
      revokeAllTokens(u.id); // minden más eszközön kiléptet
      var t = issueTokens(u);
      return [200, { user: publicUser(u), accessToken: t.accessToken, refreshToken: t.refreshToken }];
    });
  });

  // --- fiók
  route('GET', '/users/me', function (req, p, u) { return [200, { user: publicUser(u) }]; });

  route('PATCH', '/users/me', function (req, p, u) {
    var b = req.body || {};
    var chain = Promise.resolve();
    if (b.display_name !== undefined) u.display_name = str(b.display_name, 80) || u.display_name;
    if (b.password !== undefined) {
      if (typeof b.password !== 'string' || b.password.length < 8) fail(422, 'VALIDATION_FAILED', 'Legalább 8 karakter legyen.', { password: 'Legalább 8 karakter legyen.' });
      chain = sha256(String(b.current_password || '')).then(function (h) {
        if (h !== u.password_hash) fail(403, 'WRONG_PASSWORD', 'Hibás jelenlegi jelszó.');
        return sha256(b.password);
      }).then(function (h) { u.password_hash = h; });
    }
    return chain.then(function () { return [200, { user: publicUser(u) }]; });
  });

  route('DELETE', '/users/me', function (req, p, u) {
    return sha256(String((req.body || {}).password || '')).then(function (h) {
      if (h !== u.password_hash) fail(403, 'WRONG_PASSWORD', 'Hibás jelszó.');
      u.deleted_at = now();
      db.stories.filter(function (s) { return s.owner_id === u.id; }).forEach(function (s) {
        db.share_links.forEach(function (l) { if (l.story_id === s.id) l.revoked = true; });
      });
      revokeAllTokens(u.id);
      audit(u, 'account_deleted');
      return [204, null];
    });
  });

  // --- gyerekprofilok
  var AVATARS = ['lion', 'cat', 'bear', 'fox', 'owl', 'frog', 'bunny', 'whale'];
  route('GET', '/children', function (req, p, u) {
    return [200, { children: db.child_profiles.filter(function (c) { return c.parent_id === u.id; }) }];
  });
  route('POST', '/children', function (req, p, u) {
    var b = req.body || {};
    var nick = str(b.nickname, 40);
    if (!nick) fail(422, 'VALIDATION_FAILED', 'Adj egy nevet a profilnak!', { nickname: 'Adj egy nevet a profilnak!' });
    if (db.child_profiles.filter(function (c) { return c.parent_id === u.id; }).length >= 10) {
      fail(422, 'TOO_MANY_CHILDREN', 'Legfeljebb 10 gyerekprofil lehet egy fiókban.');
    }
    var c = { id: nextId('child_profiles'), parent_id: u.id, nickname: nick, avatar: AVATARS.indexOf(b.avatar) >= 0 ? b.avatar : 'lion', created_at: now() };
    db.child_profiles.push(c);
    return [201, { child: c }];
  });
  function ownChild(u, id) {
    var c = byId('child_profiles', id);
    if (!c || c.parent_id !== u.id) NOT_FOUND();
    return c;
  }
  route('PATCH', '/children/{id}', function (req, p, u) {
    var c = ownChild(u, p.id), b = req.body || {};
    if (b.nickname !== undefined) {
      var nick = str(b.nickname, 40);
      if (!nick) fail(422, 'VALIDATION_FAILED', 'Adj egy nevet a profilnak!');
      c.nickname = nick;
    }
    if (AVATARS.indexOf(b.avatar) >= 0) c.avatar = b.avatar;
    return [200, { child: c }];
  });
  route('DELETE', '/children/{id}', function (req, p, u) {
    var c = ownChild(u, p.id);
    db.stories.forEach(function (s) { if (s.child_profile_id === c.id) s.child_profile_id = null; });
    remove('child_profiles', function (x) { return x.id === c.id; });
    return [204, null];
  });

  // --- mesék
  route('GET', '/stories', function (req, p, u) {
    var child = req.query.child ? +req.query.child : null;
    var list = db.stories.filter(function (s) { return s.owner_id === u.id && (!child || s.child_profile_id === child); })
      .sort(function (a, b) { return b.updated_at < a.updated_at ? -1 : 1; });
    return [200, { stories: list.map(storySummary) }];
  });
  route('POST', '/stories', function (req, p, u) {
    var b = req.body || {};
    var title = str(b.title, 120);
    if (!title) fail(422, 'VALIDATION_FAILED', 'Adj címet a mesének!', { title: 'Adj címet a mesének!' });
    var childId = b.child_profile_id ? ownChild(u, b.child_profile_id).id : null;
    var s = { id: nextId('stories'), owner_id: u.id, child_profile_id: childId, title: title, status: 'draft', created_at: now(), updated_at: now() };
    db.stories.push(s);
    db.story_pages.push({ id: nextId('story_pages'), story_id: s.id, page_no: 1, text: '', version: 1, updated_at: now() });
    return [201, { story: storyView(s) }];
  });
  route('GET', '/stories/{id}', function (req, p, u) { return [200, { story: storyView(ownStory(u, p.id)) }]; });
  route('PATCH', '/stories/{id}', function (req, p, u) {
    var s = ownStory(u, p.id), b = req.body || {};
    if (b.title !== undefined) {
      var t = str(b.title, 120);
      if (!t) fail(422, 'VALIDATION_FAILED', 'Adj címet a mesének!');
      s.title = t;
    }
    if (b.child_profile_id !== undefined) s.child_profile_id = b.child_profile_id ? ownChild(u, b.child_profile_id).id : null;
    s.updated_at = now();
    return [200, { story: storyView(s) }];
  });
  route('DELETE', '/stories/{id}', function (req, p, u) {
    cascadeDeleteStory(ownStory(u, p.id));
    return [204, null];
  });

  // --- oldalak
  route('POST', '/stories/{id}/pages', function (req, p, u) {
    var s = ownStory(u, p.id);
    var pages = storyPages(s);
    if (pages.length >= 40) fail(422, 'TOO_MANY_PAGES', 'Egy mese legfeljebb 40 oldalas lehet.');
    var pg = { id: nextId('story_pages'), story_id: s.id, page_no: pages.length + 1, text: str((req.body || {}).text, 2000), version: 1, updated_at: now() };
    db.story_pages.push(pg);
    touchStory(s);
    return [201, { page: pageView(pg) }];
  });
  route('PATCH', '/stories/{id}/pages/{pid}', function (req, p, u) {
    var s = ownStory(u, p.id);
    var pg = byId('story_pages', p.pid);
    if (!pg || pg.story_id !== s.id) NOT_FOUND();
    var b = req.body || {};
    if (b.text !== undefined) {
      if (b.version !== undefined && b.version !== pg.version) {
        fail(409, 'VERSION_CONFLICT', 'Ezt az oldalt közben máshol módosították. Melyik változat maradjon?', { current: pageView(pg) });
      }
      pg.text = str(b.text, 2000);
      pg.version++;
    }
    if (b.page_no !== undefined) {
      var pages = storyPages(s).filter(function (x) { return x.id !== pg.id; });
      var to = Math.max(1, Math.min(pages.length + 1, +b.page_no));
      pages.splice(to - 1, 0, pg);
      pages.forEach(function (x, i) { x.page_no = i + 1; });
    }
    pg.updated_at = now();
    touchStory(s);
    return [200, { page: pageView(pg) }];
  });
  route('DELETE', '/stories/{id}/pages/{pid}', function (req, p, u) {
    var s = ownStory(u, p.id);
    var pg = byId('story_pages', p.pid);
    if (!pg || pg.story_id !== s.id) NOT_FOUND();
    remove('story_pages', function (x) { return x.id === pg.id; });
    remove('page_animations', function (a) { return a.story_page_id === pg.id; });
    renumber(s.id);
    touchStory(s);
    return [204, null];
  });

  // --- rajzok
  route('POST', '/pages/{id}/drawing', function (req, p, u) {
    var pg = ownPage(u, p.id);
    var file = req.body instanceof FormData ? req.body.get('photo') : null;
    if (!file || !(file instanceof Blob)) fail(422, 'UNSUPPORTED_FILE', 'Ez a fájl nem használható. Válassz egy JPG vagy PNG képet!');
    if (file.size > 10 * 1024 * 1024) fail(413, 'FILE_TOO_LARGE', 'A kép túl nagy (legfeljebb 10 MB lehet).');
    // Nem elég a kiterjesztés: a fájl elejét (magic bytes) is megnézzük (NFR-SEC-06).
    return file.slice(0, 8).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      var jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
      var png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
      if (!jpg && !png) fail(422, 'UNSUPPORTED_FILE', 'Ez a fájl nem használható. Válassz egy JPG vagy PNG képet!');
      return g.DTCutout.normalizePhoto(file);
    }).then(putBlob).then(function (key) {
      // új rajz: a régi animáció érvénytelen
      remove('page_animations', function (a) { return a.story_page_id === pg.id; });
      var d = { id: nextId('drawings'), story_page_id: pg.id, original_path: key, background_path: null, width: 0, height: 0, status: 'uploaded', error_code: null, created_at: now() };
      db.drawings.push(d);
      touchStory(byId('stories', pg.story_id));
      runCutout(d);
      return [202, { drawing: drawingView(d) }];
    });
  });
  route('GET', '/drawings/{id}', function (req, p, u) { return [200, { drawing: drawingView(ownDrawing(u, p.id)) }]; });

  // --- elemek
  route('PATCH', '/elements/{id}', function (req, p, u) {
    var e = ownElement(u, p.id), b = req.body || {};
    if (b.label !== undefined) e.label = str(b.label, 40);
    if (b.is_animated !== undefined) e.is_animated = !!b.is_animated;
    return [200, { element: elementView(e) }];
  });
  route('DELETE', '/elements/{id}', function (req, p, u) {
    var e = ownElement(u, p.id);
    e.is_deleted = true;
    e.is_animated = false;
    return [204, null];
  });
  route('POST', '/elements/merge', function (req, p, u) {
    var ids = (req.body || {}).ids || [];
    if (ids.length < 2) fail(422, 'VALIDATION_FAILED', 'Legalább két elemet jelölj ki!');
    var els = ids.map(function (id) { return ownElement(u, id); });
    if (els.some(function (e) { return e.drawing_id !== els[0].drawing_id; })) fail(422, 'VALIDATION_FAILED', 'Csak egy rajz elemei vonhatók össze.');
    return compositeElements(els).then(function (m) {
      var first = els[0];
      var ne = { id: nextId('drawing_elements'), drawing_id: first.drawing_id, image_path: m.key, bbox_x: m.x, bbox_y: m.y, bbox_w: m.w, bbox_h: m.h, label: first.label, is_animated: true, is_deleted: false, z_order: Math.min.apply(null, els.map(function (e) { return e.z_order; })) };
      remove('drawing_elements', function (e) { return ids.indexOf(e.id) >= 0; });
      db.drawing_elements.push(ne);
      return [201, { element: elementView(ne) }];
    });
  });

  // --- animáció
  route('GET', '/presets', function () {
    return [200, { presets: A.PRESETS, speeds: Object.keys(A.SPEEDS) }];
  });

  function animationFor(pg, req, u) {
    var d = pageDrawing(pg);
    if (!d || d.status !== 'done') fail(409, 'DRAWING_NOT_READY', 'Ehhez az oldalhoz még nincs kész rajz.');
    var b = req.body || {};
    var choice = {};
    (b.elements || []).forEach(function (c) { choice[c.id] = c.preset || null; });
    var els = db.drawing_elements.filter(function (e) { return e.drawing_id === d.id; });
    els.forEach(function (e) {
      if (e.is_deleted) return;
      if (Object.prototype.hasOwnProperty.call(choice, e.id)) {
        if (choice[e.id] && !A.PRESETS.some(function (x) { return x.key === choice[e.id]; })) fail(422, 'UNKNOWN_PRESET', 'Ismeretlen mozgásminta.');
        e.is_animated = !!choice[e.id];
      }
    });
    var speed = A.SPEEDS[b.speed] ? b.speed : 'medium';
    var duration = Math.min(20, Math.max(3, +b.duration || 6));
    return A.buildAnimation({
      width: d.width, height: d.height, duration: duration, background: d.background_path,
      elements: els.slice().sort(function (a, c) { return a.z_order - c.z_order; }).map(function (e) {
        return { id: e.id, name: e.label, image: e.image_path, x: e.bbox_x, y: e.bbox_y, w: e.bbox_w, h: e.bbox_h, z: e.z_order + (e.is_animated ? 100 : 0), preset: e.is_animated && !e.is_deleted ? (choice[e.id] || 'float') : null, speed: speed };
      })
    });
  }

  function saveAnimation(pg, data, expectedVersion) {
    var a = find('page_animations', function (x) { return x.story_page_id === pg.id; });
    if (a && expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== a.version) {
      fail(409, 'VERSION_CONFLICT', 'Ezt az oldalt közben máshol módosították. Felülírod, vagy betöltöd az újat?', { current: { data: a.data, version: a.version } });
    }
    if (!a) { a = { id: nextId('page_animations'), story_page_id: pg.id, data: data, version: 1, updated_at: now() }; db.page_animations.push(a); }
    else { a.data = data; a.version++; a.updated_at = now(); }
    touchStory(byId('stories', pg.story_id));
    return { data: a.data, version: a.version, updated_at: a.updated_at };
  }

  route('POST', '/pages/{id}/animation/auto', function (req, p, u) {
    var pg = ownPage(u, p.id);
    var data = animationFor(pg, req, u);
    // Az Életre kel! mindig új változatot ír (a mobilon „Jó így!” után marad meg).
    var cur = find('page_animations', function (x) { return x.story_page_id === pg.id; });
    return [200, { animation: saveAnimation(pg, data, cur ? cur.version : null) }];
  });
  route('GET', '/pages/{id}/animation', function (req, p, u) {
    var pg = ownPage(u, p.id);
    var a = find('page_animations', function (x) { return x.story_page_id === pg.id; });
    if (!a) fail(404, 'NO_ANIMATION', 'Ehhez az oldalhoz még nincs animáció.');
    return [200, { animation: { data: a.data, version: a.version, updated_at: a.updated_at } }];
  });
  route('PUT', '/pages/{id}/animation', function (req, p, u) {
    var pg = ownPage(u, p.id), b = req.body || {};
    var errs = A.validate(b.data);
    if (errs.length) fail(422, 'INVALID_ANIMATION', 'Az animáció hibás: ' + errs[0]);
    return [200, { animation: saveAnimation(pg, b.data, b.version === undefined ? null : b.version) }];
  });

  // --- megosztás
  route('POST', '/stories/{id}/share', function (req, p, u) {
    var s = ownStory(u, p.id);
    var days = (req.body || {}).expires_in_days;
    if (days !== null && days !== undefined && [7, 30].indexOf(+days) < 0) fail(422, 'VALIDATION_FAILED', 'A lejárat 7 nap, 30 nap vagy „soha” lehet.');
    var l = { id: nextId('share_links'), story_id: s.id, token: randomToken(32), expires_at: days ? new Date(Date.now() + days * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z') : null, revoked: false, view_count: 0, created_at: now() };
    db.share_links.push(l);
    audit(u, 'share_created', s.id);
    return [201, { share: shareView(l) }];
  });
  route('GET', '/shares', function (req, p, u) {
    var mine = db.stories.filter(function (s) { return s.owner_id === u.id; }).map(function (s) { return s.id; });
    var story = req.query.story ? +req.query.story : null;
    var list = db.share_links.filter(function (l) { return mine.indexOf(l.story_id) >= 0 && (!story || l.story_id === story); })
      .sort(function (a, b) { return b.id - a.id; });
    return [200, { shares: list.map(shareView) }];
  });
  route('DELETE', '/shares/{id}', function (req, p, u) {
    var l = byId('share_links', p.id);
    if (!l) NOT_FOUND();
    var s = byId('stories', l.story_id);
    if (!s || (s.owner_id !== u.id && u.role !== 'admin')) NOT_FOUND();
    l.revoked = true;
    return [204, null];
  });

  route('GET', '/public/{token}', function (req, p) {
    var key = 'guest';
    var m = publicMisses[key] || { n: 0, until: 0 };
    if (m.until > Date.now()) fail(429, 'TOO_MANY_REQUESTS', 'Túl sok próbálkozás. Próbáld újra később!');
    var l = find('share_links', function (x) { return x.token === p.token; });
    var s = l && byId('stories', l.story_id);
    var owner = s && byId('users', s.owner_id);
    var ok = l && !l.revoked && (!l.expires_at || new Date(l.expires_at) > new Date()) && s && owner && !owner.deleted_at && !owner.is_blocked;
    if (!ok) {
      m.n++;
      if (m.n >= 20) { m.until = Date.now() + 10 * 60 * 1000; m.n = 0; }
      publicMisses[key] = m;
      fail(404, 'SHARE_UNAVAILABLE', 'Ez a mese már nem érhető el. Kérj új linket attól, aki küldte!');
    }
    l.view_count++;
    var child = s.child_profile_id && byId('child_profiles', s.child_profile_id);
    var v = storyView(s);
    // A vendég csak azt kapja, ami a lejátszáshoz kell.
    return [200, {
      story: {
        title: v.title, child_nickname: child ? child.nickname : null, child_avatar: child ? child.avatar : null,
        pages: v.pages.map(function (pg) { return { page_no: pg.page_no, text: pg.text, drawing: pg.drawing && pg.drawing.status === 'done' ? pg.drawing : null, animation: pg.animation ? { data: pg.animation.data } : null }; })
      }
    }];
  });

  // --- admin
  route('GET', '/admin/users', function (req, p, u) {
    requireAdmin(u);
    return [200, {
      users: db.users.map(function (x) {
        var o = publicUser(x);
        o.is_blocked = x.is_blocked; o.deleted_at = x.deleted_at;
        o.story_count = db.stories.filter(function (s) { return s.owner_id === x.id; }).length;
        return o;
      })
    }];
  });
  route('PATCH', '/admin/users/{id}', function (req, p, u) {
    requireAdmin(u);
    var x = byId('users', p.id);
    if (!x) NOT_FOUND();
    if (x.id === u.id) fail(422, 'CANNOT_BLOCK_SELF', 'Saját magadat nem tilthatod le.');
    if ((req.body || {}).is_blocked !== undefined) {
      x.is_blocked = !!req.body.is_blocked;
      if (x.is_blocked) revokeAllTokens(x.id);
      audit(u, x.is_blocked ? 'user_blocked' : 'user_unblocked', x.id);
    }
    return [200, { user: publicUser(x) }];
  });
  route('GET', '/admin/jobs', function (req, p, u) {
    requireAdmin(u);
    var st = req.query.status;
    var list = db.processing_jobs.filter(function (j) { return !st || j.status === st; }).slice().sort(function (a, b) { return b.id - a.id; });
    return [200, {
      jobs: list.map(function (j) {
        var d = byId('drawings', j.ref_id);
        var pg = d && byId('story_pages', d.story_page_id);
        var s = pg && byId('stories', pg.story_id);
        var owner = s && byId('users', s.owner_id);
        return Object.assign({}, j, { original_url: d ? d.original_path : null, story_title: s ? s.title : null, owner_email: owner ? owner.email : null });
      })
    }];
  });
  route('POST', '/admin/jobs/{id}/retry', function (req, p, u) {
    requireAdmin(u);
    var j = byId('processing_jobs', p.id);
    if (!j) NOT_FOUND();
    if (j.status !== 'failed') fail(409, 'JOB_NOT_FAILED', 'Csak hibás feladat indítható újra.');
    j.status = 'queued'; j.attempts = 0; j.error_msg = null; j.updated_at = now();
    audit(u, 'job_retry', j.id);
    processJob(j);
    return [202, { job: j }];
  });
  route('GET', '/admin/reports', function (req, p, u) {
    requireAdmin(u);
    var today = now().slice(0, 10);
    var todayJobs = db.processing_jobs.filter(function (j) { return j.created_at.slice(0, 10) === today; });
    var live = {
      date: today,
      new_users: db.users.filter(function (x) { return x.created_at.slice(0, 10) === today; }).length,
      uploads: todayJobs.length,
      cutouts_ok: todayJobs.filter(function (j) { return j.status === 'done'; }).length,
      cutouts_failed: todayJobs.filter(function (j) { return j.status === 'failed'; }).length,
      partial: true
    };
    return [200, { reports: db.reports.concat([live]), totals: { users: db.users.length, stories: db.stories.length, shares: db.share_links.filter(function (l) { return !l.revoked; }).length } }];
  });

  var PUBLIC = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/forgot', '/auth/reset', '/presets'];

  // ----------------------------------------------------------------- belépő

  function handle(req) {
    var latency = cfg.mockLatencyMs || 0;
    var path = req.path, query = {};
    var qi = path.indexOf('?');
    if (qi >= 0) {
      new URLSearchParams(path.slice(qi + 1)).forEach(function (v, k) { query[k] = v; });
      path = path.slice(0, qi);
    }
    req.query = query;
    req.headers = req.headers || {};
    var requestId = rid();

    return init().then(function () {
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        var m = r.method === req.method && path.match(r.re);
        if (!m) continue;
        var params = {};
        r.keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        var isPublic = PUBLIC.indexOf(path) >= 0 || path.indexOf('/public/') === 0;
        var user = isPublic ? null : authUser(req);
        return Promise.resolve(r.handler(req, params, user));
      }
      fail(404, 'NOT_FOUND', 'Ismeretlen végpont: ' + req.method + ' ' + path);
    }).then(function (res) {
      if (req.method !== 'GET') save();
      return { status: res[0], body: res[1] };
    }, function (err) {
      if (!(err instanceof HttpError)) {
        console.error('[mock]', requestId, err);
        err = new HttpError(500, 'SERVER_ERROR', 'Valami elromlott nálunk, már dolgozunk rajta.');
      }
      if (req.method !== 'GET') save();
      var body = { error: { code: err.code, message: err.message, requestId: requestId } };
      if (err.details) body.error.details = err.details;
      return { status: err.status, body: body };
    }).then(function (res) {
      return new Promise(function (r) { setTimeout(function () { r(res); }, latency); });
    });
  }

  g.DTMock = { handle: handle, mediaUrl: function (p) { return init().then(function () { return mediaUrl(p); }); }, reset: reset, _db: function () { return db; } };
})(window);
