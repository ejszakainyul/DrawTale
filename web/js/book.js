/*
 * DrawTale – lapozható mesekönyv (REQ-WEB-02, REQ-WEB-07, REQ-WEB-08).
 * Bal oldalon a szöveg, jobb oldalon a mozgó jelenet; borító, „Vége” oldal,
 * átforduló lap, billentyűk, húzás, teljes képernyő és mesélő mód.
 *
 *   new DT.Book(container, story, { mode: 'owner' | 'guest', storyId, start })
 *   story: { title, child_nickname, child_avatar, pages: [{ page_no, text, drawing, animation }] }
 */
(function (g) {
  'use strict';

  var DT = g.DT;
  var h = DT.h;
  var api = DT.api;
  var FLIP_MS = 760;

  function sentences(text) {
    var t = (text || '').trim();
    if (!t) return [];
    return t.match(/[^.!?…]+[.!?…]*["”]?\s*/g) || [t];
  }

  function Book(root, story, opts) {
    this.root = root;
    this.story = story;
    this.opts = opts || {};
    this.pages = story.pages.slice().sort(function (a, b) { return a.page_no - b.page_no; });
    this.scenes = this.pages.map(DT.sceneForPage);
    this.coverScene = this.scenes.filter(Boolean)[0] || null;
    this.index = 0;
    this.busy = false;
    this.narrating = false;
    this._build();
    var start = Math.max(0, Math.min(this.last(), +this.opts.start || 0));
    this._show(start, true);
  }

  Book.prototype.last = function () { return this.pages.length + 1; };

  Book.prototype._build = function () {
    var self = this;
    this.canvas = h('canvas', { role: 'img', 'aria-label': 'Mozgó jelenet' });
    this.noDraw = h('div.nodraw', { 'aria-hidden': 'true' }, '🖍️');
    this.left = h('div.leaf-l');
    this.right = h('div.leaf-r', this.canvas, this.noDraw);
    this.spread = h('div.bspread', this.left, this.right);
    this.book = h('div.book', { tabindex: '0', 'aria-roledescription': 'mesekönyv', 'aria-label': this.story.title }, this.spread);
    this.live = h('div.sr-only', { 'aria-live': 'polite' });

    this.prevBtn = h('button.btn', { type: 'button', 'aria-label': 'Előző oldal', onclick: function () { self.stopNarration(); self.prev(); } }, h('span.ico', '◀'), h('span', 'Előző'));
    this.nextBtn = h('button.btn.btn-primary', { type: 'button', 'aria-label': 'Következő oldal', onclick: function () { self.stopNarration(); self.next(); } }, h('span', 'Következő'), h('span.ico', '▶'));
    this.pos = h('span.pos');
    this.playBtn = h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'Animáció megállítása', onclick: function () { self.togglePlay(); } }, '⏸');
    this.narrBtn = h('button.btn', { type: 'button', 'aria-pressed': 'false', onclick: function () { self.toggleNarration(); } }, h('span.ico', '🔊'), h('span', 'Mesélő mód'));
    this.fsBtn = h('button.btn.btn-ghost', { type: 'button', 'aria-label': 'Teljes képernyő', onclick: function () { self.toggleFullscreen(); } }, '⛶');

    this.shell = h('div.book-shell', this.book, this.live, h('div.controls-bar', this.prevBtn, this.pos, this.nextBtn, this.playBtn, this.narrBtn, this.fsBtn));
    this.root.append(this.shell);

    this.player = new g.DrawTalePlayer(this.canvas, { resolve: api.media, showFps: DT.param('fps') === '1' });
    if (!this.player.autoplay) this.playBtn.textContent = '▶';

    this._onKey = function (e) {
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); self.stopNarration(); self.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); self.stopNarration(); self.prev(); }
      else if (e.key === ' ' && e.target === self.book) { e.preventDefault(); self.togglePlay(); }
      else if (e.key === 'f' || e.key === 'F') self.toggleFullscreen();
    };
    document.addEventListener('keydown', this._onKey);

    // Lapozás húzással (érintőképernyőn is).
    var sx = null, sy = 0;
    this.book.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    this.book.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 80) { self.stopNarration(); if (dx < 0) self.next(); else self.prev(); }
    });
    this.book.addEventListener('pointercancel', function () { sx = null; });
  };

  // --------------------------------------------------------------- tartalom

  Book.prototype._leftContent = function (i) {
    var self = this;
    var s = this.story;
    if (i === 0) {
      return h('div.text.cover-l',
        h('div',
          h('div.av', { 'aria-hidden': 'true' }, DT.AVATARS[s.child_avatar] || '📖'),
          h('h1', s.title),
          s.child_nickname ? h('p.by', s.child_nickname + ' meséje') : null,
          h('p.by', 'Lapozz! ▶')));
    }
    if (i === this.last()) {
      var acts = this.opts.mode === 'guest'
        ? [h('a.btn.btn-accent', { href: 'index.html' }, '✨ Te is szeretnél ilyet?')]
        : [h('button.btn', { type: 'button', onclick: function () { self.go(1); } }, '↺ Újra'),
           h('a.btn.btn-accent', { href: 'shares.html?story=' + this.opts.storyId }, '🔗 Megosztás')];
      if (this.opts.mode === 'guest') acts.unshift(h('button.btn', { type: 'button', onclick: function () { self.go(1); } }, '↺ Újra'));
      return h('div.text.end-l', h('div.the-end', 'Vége'), h('p.by', s.title), h('div.row', { style: 'justify-content:center' }, acts));
    }
    var page = this.pages[i - 1];
    var text = h('div.text');
    var list = sentences(page.text);
    if (!list.length) text.append(h('p.muted', '(Ezen az oldalon nincs szöveg.)'));
    else text.append(h('p', list.map(function (x) { return h('span.s', x); })));
    text.append(h('span.pg', String(i)));
    return text;
  };

  Book.prototype._sceneFor = function (i) {
    if (i === 0 || i === this.last()) return this.coverScene;
    return this.scenes[i - 1];
  };

  Book.prototype._loadRight = function (i) {
    var anim = this._sceneFor(i);
    var label = i === 0 ? 'Borító' : i === this.last() ? 'Vége' : 'A(z) ' + i + '. oldal rajza';
    this.canvas.setAttribute('aria-label', label);
    this.canvas.hidden = !anim;
    this.noDraw.hidden = !!anim;
    if (!anim) { this.player.pause(); return Promise.resolve(); }
    var self = this;
    return this.player.load(anim).then(function () {
      self.playBtn.textContent = self.player.playing ? '⏸' : '▶';
    }).catch(function (e) { console.warn(e); });
  };

  /** Egy jelenet álló képe külön vásznon (a visszafelé forduló lap hátára). */
  Book.prototype._stillCanvas = function (anim) {
    var c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    if (!anim) return Promise.resolve(c);
    var p = new g.DrawTalePlayer(document.createElement('canvas'), { resolve: api.media, autoplay: false });
    return p.load(anim).then(function () {
      p.drawFrame(c.getContext('2d'), c.width, c.height, 0);
      p.destroy();
      return c;
    }, function () { p.destroy(); return c; });
  };

  Book.prototype._updateUi = function () {
    var i = this.index;
    this.prevBtn.disabled = i === 0;
    this.nextBtn.disabled = i === this.last();
    this.pos.textContent = i === 0 ? 'Borító' : i === this.last() ? 'Vége' : i + ' / ' + this.pages.length;
    this.live.textContent = i === 0 ? this.story.title + ', borító' : i === this.last() ? 'Vége a mesének' : i + '. oldal';
    if (this.opts.onChange) this.opts.onChange(i);
    var nxt = this._sceneFor(i + 1);
    if (nxt) g.DrawTalePlayer.preload(nxt, api.media); // lapozáskor ne kelljen várni
  };

  Book.prototype._show = function (i, instant) {
    this.index = i;
    this.left.replaceChildren(this._leftContent(i));
    this._updateUi();
    return this._loadRight(i);
  };

  // ----------------------------------------------------------------- lapozás

  function narrow() { return g.matchMedia('(max-width: 760px)').matches; }
  function reduced() { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  Book.prototype.go = function (to) {
    var self = this;
    to = Math.max(0, Math.min(this.last(), to));
    if (to === this.index || this.busy) return Promise.resolve();
    var from = this.index;
    if (narrow() || reduced()) {
      this.spread.classList.remove('turn');
      void this.spread.offsetWidth;
      this.spread.classList.add('turn');
      return this._show(to);
    }
    this.busy = true;
    var forward = to > from;
    var newLeft = this._leftContent(to);
    var flipper = h('div.flipper.' + (forward ? 'fwd' : 'back'), { 'aria-hidden': 'true' });
    var front = h('div.face.f'), back = h('div.face.b');
    flipper.append(front, back);

    var prepared;
    if (forward) {
      front.append(this.player.snapshot());
      back.classList.add('leaf-l');
      back.append(newLeft.cloneNode(true));
      prepared = Promise.resolve();
    } else {
      front.classList.add('leaf-l');
      front.append(this.left.firstChild.cloneNode(true));
      prepared = this._stillCanvas(this._sceneFor(to)).then(function (c) { back.append(c); });
    }

    return prepared.then(function () {
      self.book.append(flipper);
      self.index = to;
      if (forward) self._loadRight(to); // a lap alatt már az új jelenet látszik
      else self.left.replaceChildren(newLeft);
      self._updateUi();
      void flipper.offsetWidth;
      flipper.classList.add('go');
      return new Promise(function (r) { setTimeout(r, FLIP_MS); });
    }).then(function () {
      if (forward) self.left.replaceChildren(newLeft);
      else return self._loadRight(to);
    }).then(function () {
      flipper.remove();
      self.busy = false;
    });
  };

  Book.prototype.next = function () { return this.go(this.index + 1); };
  Book.prototype.prev = function () { return this.go(this.index - 1); };

  Book.prototype.togglePlay = function () {
    if (this.canvas.hidden) return;
    var on = this.player.toggle();
    this.playBtn.textContent = on ? '⏸' : '▶';
    this.playBtn.setAttribute('aria-label', on ? 'Animáció megállítása' : 'Animáció indítása');
  };

  Book.prototype.toggleFullscreen = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (this.shell.requestFullscreen) this.shell.requestFullscreen().catch(function () {});
  };

  // ------------------------------------------------------------ mesélő mód

  function huVoice() {
    if (!('speechSynthesis' in g)) return Promise.resolve(null);
    function pick() {
      var vs = speechSynthesis.getVoices();
      return vs.filter(function (v) { return /^hu(-|_|$)/i.test(v.lang); })[0] || null;
    }
    var v = pick();
    if (v || speechSynthesis.getVoices().length) return Promise.resolve(v);
    return new Promise(function (resolve) {
      var done = false;
      speechSynthesis.addEventListener('voiceschanged', function () { if (!done) { done = true; resolve(pick()); } }, { once: true });
      setTimeout(function () { if (!done) { done = true; resolve(pick()); } }, 1200);
    });
  }

  Book.prototype.toggleNarration = function () {
    if (this.narrating) this.stopNarration(); else this.startNarration();
  };

  Book.prototype.startNarration = function () {
    var self = this;
    this.narrating = true;
    this._narrToken = {};
    this.narrBtn.setAttribute('aria-pressed', 'true');
    this.narrBtn.lastChild.textContent = 'Mesélő leállítása';
    huVoice().then(function (voice) {
      if (!self.narrating) return;
      self.voice = voice;
      if (!voice) DT.toast('Ezen az eszközön nem érhető el felolvasás – lapozni azért lapozok helyetted. 📖');
      var go = self.index === 0 || self.index === self.last() ? self.go(1) : Promise.resolve();
      go.then(function () { self._narratePage(self._narrToken); });
    });
  };

  Book.prototype.stopNarration = function () {
    if (!this.narrating) return;
    this.narrating = false;
    this._narrToken = null;
    clearTimeout(this._narrTimer);
    if ('speechSynthesis' in g) speechSynthesis.cancel();
    this.left.querySelectorAll('.s.reading').forEach(function (s) { s.classList.remove('reading'); });
    this.narrBtn.setAttribute('aria-pressed', 'false');
    this.narrBtn.lastChild.textContent = 'Mesélő mód';
  };

  Book.prototype._narratePage = function (token) {
    var self = this;
    if (token !== this._narrToken) return;
    var spans = Array.prototype.slice.call(this.left.querySelectorAll('.s'));
    var k = 0;
    function turn() {
      if (token !== self._narrToken) return;
      if (self.index >= self.pages.length) { self.go(self.last()).then(function () { self.stopNarration(); }); return; }
      self.go(self.index + 1).then(function () { self._narratePage(token); });
    }
    function step() {
      if (token !== self._narrToken) return;
      spans.forEach(function (s) { s.classList.remove('reading'); });
      if (k >= spans.length) { self._narrTimer = setTimeout(turn, 1400); return; }
      var span = spans[k++];
      span.classList.add('reading');
      var text = span.textContent;
      if (self.voice) {
        var u = new SpeechSynthesisUtterance(text);
        u.voice = self.voice; u.lang = self.voice.lang; u.rate = 0.92; u.pitch = 1.05;
        u.onend = u.onerror = function () { step(); };
        speechSynthesis.speak(u);
      } else {
        self._narrTimer = setTimeout(step, Math.max(1600, text.length * 70));
      }
    }
    step();
  };

  Book.prototype.destroy = function () {
    this.stopNarration();
    document.removeEventListener('keydown', this._onKey);
    this.player.destroy();
    this.shell.remove();
  };

  DT.Book = Book;
})(window);
