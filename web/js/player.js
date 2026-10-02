/*
 * DrawTale – canvas lejátszó egy oldalhoz.
 * Ugyanez fut a mobil WebView-ban is, ezért nem függ semmi mástól,
 * csak a core/anim.js-től.
 *
 *   const p = new DrawTalePlayer(canvas, { resolve: (path) => url });
 *   await p.load(animationJson);
 *   p.play();
 */
(function (global) {
  'use strict';

  var A = global.DrawTaleAnim;
  var imageCache = new Map();

  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    var pr = new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Nem tölthető be: ' + src)); };
      img.src = src;
    });
    imageCache.set(src, pr);
    pr.catch(function () { imageCache.delete(src); });
    return pr;
  }

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function DrawTalePlayer(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resolve = opts.resolve || function (p) { return p; };
    this.onTime = opts.onTime || null;
    this.anim = null;
    this.images = {};
    this.playing = false;
    this.elapsed = 0;
    this._last = 0;
    this._raf = 0;
    this._fps = { frames: 0, since: 0, value: 0 };
    this.showFps = !!opts.showFps;
    this.autoplay = opts.autoplay !== false && !prefersReducedMotion();
    this._tick = this._tick.bind(this);
    this._resize = this.resize.bind(this);
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(this._resize);
      this._ro.observe(canvas);
    } else {
      global.addEventListener('resize', this._resize);
    }
  }

  DrawTalePlayer.loadImage = loadImage;

  /** Képek előtöltése (pl. a következő oldalhoz), lejátszás nélkül. */
  DrawTalePlayer.preload = function (anim, resolve) {
    resolve = resolve || function (p) { return p; };
    var paths = [];
    if (anim && anim.background) paths.push(anim.background);
    ((anim && anim.tracks) || []).forEach(function (t) { paths.push(t.image); });
    return Promise.all(paths.map(function (p) {
      return Promise.resolve(resolve(p)).then(loadImage).catch(function () { return null; });
    }));
  };

  DrawTalePlayer.prototype.load = function (anim) {
    var self = this;
    var errors = A.validate(anim);
    if (errors.length) return Promise.reject(new Error('Hibás animáció: ' + errors.join(' ')));
    this.anim = anim;
    this.tracks = A.orderedTracks(anim);
    this.elapsed = 0;
    var jobs = [];
    var images = {};
    function add(path) {
      if (!path || images[path]) return;
      images[path] = true;
      jobs.push(Promise.resolve(self.resolve(path)).then(loadImage).then(
        function (img) { images[path] = img; },
        function () { images[path] = null; }
      ));
    }
    add(anim.background);
    this.tracks.forEach(function (t) { add(t.image); });
    return Promise.all(jobs).then(function () {
      if (self.anim !== anim) return; // közben másik oldal töltődött be
      self.images = images;
      self.resize();
      if (self.autoplay) self.play(); else self.render();
    });
  };

  DrawTalePlayer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(c.clientWidth * dpr));
    var h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    if (!this.playing) this.render();
  };

  DrawTalePlayer.prototype.play = function () {
    if (this.playing || !this.anim) return;
    this.playing = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  };

  DrawTalePlayer.prototype.pause = function () {
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.render();
  };

  DrawTalePlayer.prototype.toggle = function () {
    if (this.playing) this.pause(); else this.play();
    return this.playing;
  };

  DrawTalePlayer.prototype.seek = function (t) {
    this.elapsed = Math.max(0, t);
    this.render();
  };

  DrawTalePlayer.prototype._tick = function (now) {
    if (!this.playing) return;
    var dt = Math.min((now - this._last) / 1000, 0.1); // háttérfülről visszatérve ne ugorjon
    this._last = now;
    this.elapsed += dt;
    var f = this._fps;
    f.frames++;
    if (now - f.since >= 1000) {
      f.value = Math.round((f.frames * 1000) / (now - f.since));
      f.frames = 0;
      f.since = now;
    }
    this.render();
    this._raf = requestAnimationFrame(this._tick);
  };

  /** Egy képkocka kirajzolása tetszőleges vászonra (előnézethez, lapozáshoz is). */
  DrawTalePlayer.prototype.drawFrame = function (ctx, cw, ch, t) {
    var anim = this.anim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    if (!anim) return;
    var k = Math.min(cw / anim.width, ch / anim.height);
    var ox = (cw - anim.width * k) / 2;
    var oy = (ch - anim.height * k) / 2;
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.imageSmoothingQuality = 'high';

    var bg = anim.background && this.images[anim.background];
    if (bg) ctx.drawImage(bg, 0, 0, anim.width, anim.height);
    else {
      ctx.fillStyle = '#fbf6ea';
      ctx.fillRect(0, 0, anim.width, anim.height);
    }

    var lt = A.localTime(anim, t);
    for (var i = 0; i < this.tracks.length; i++) {
      var tr = this.tracks[i];
      var img = this.images[tr.image];
      var s = A.sampleTrack(tr, lt);
      if (!img || !s || s.opacity <= 0) continue;
      var pv = tr.pivot || [0.5, 0.5];
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.opacity);
      ctx.translate(s.x, s.y);
      if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
      ctx.scale(s.scale * s.sx * (s.flipX ? -1 : 1), s.scale * s.sy);
      ctx.drawImage(img, -tr.w * pv[0], -tr.h * pv[1], tr.w, tr.h);
      ctx.restore();
    }
  };

  DrawTalePlayer.prototype.render = function () {
    var c = this.canvas;
    this.drawFrame(this.ctx, c.width, c.height, this.elapsed);
    if (this.showFps && this.playing) {
      var ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(8, 8, 74, 26);
      ctx.fillStyle = '#fff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(this._fps.value + ' FPS', 16, 26);
    }
    if (this.onTime) this.onTime(this.elapsed);
  };

  /** Az aktuális kép másolata egy új vásznon (pl. a lapozó lap elejére). */
  DrawTalePlayer.prototype.snapshot = function () {
    var copy = document.createElement('canvas');
    copy.width = this.canvas.width;
    copy.height = this.canvas.height;
    this.drawFrame(copy.getContext('2d'), copy.width, copy.height, this.elapsed);
    return copy;
  };

  DrawTalePlayer.prototype.destroy = function () {
    this.pause();
    if (this._ro) this._ro.disconnect();
    else global.removeEventListener('resize', this._resize);
    this.anim = null;
  };

  global.DrawTalePlayer = DrawTalePlayer;
})(typeof window !== 'undefined' ? window : this);
