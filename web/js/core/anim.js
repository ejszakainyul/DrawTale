/*
 * DrawTale – animáció mag (v1 formátum, lásd docs/animation-format.md)
 *
 * Tiszta függvények, DOM nélkül: a böngészőben `window.DrawTaleAnim`,
 * Node-ban `require()`-rel érhető el (így tesztelhető, és a PHP-s
 * mozgásminta-generátor ennek a pontos mása lehet).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DrawTaleAnim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 1;
  var NUMERIC = ['x', 'y', 'rot', 'scale', 'sx', 'sy', 'opacity'];
  var DEFAULTS = { rot: 0, scale: 1, sx: 1, sy: 1, opacity: 1 };

  var SPEEDS = { slow: 0.6, medium: 1, fast: 1.6 };

  var PRESETS = [
    { key: 'bounce', label: 'Ugrál', icon: '🦘', hint: 'Fel-le pattog' },
    { key: 'float', label: 'Lebeg', icon: '🎈', hint: 'Lágyan fel-le úszik' },
    { key: 'walk', label: 'Sétál', icon: '🚶', hint: 'Oda-vissza sétál, billeg' },
    { key: 'wave', label: 'Integet', icon: '👋', hint: 'Ide-oda dől' },
    { key: 'pulse', label: 'Lüktet', icon: '💓', hint: 'Nő és zsugorodik' },
    { key: 'fly', label: 'Repül', icon: '🕊️', hint: 'Hullámozva átszáll' },
    { key: 'spin', label: 'Pörög', icon: '🌀', hint: 'Körbe forog' },
    { key: 'enter', label: 'Beúszik', icon: '➡️', hint: 'A szélről érkezik' }
  ];

  // ---------------------------------------------------------------- easing

  var EASE = {
    linear: function (p) { return p; },
    easeIn: function (p) { return p * p; },
    easeOut: function (p) { return 1 - (1 - p) * (1 - p); },
    easeInOut: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    step: function () { return 0; }
  };

  function easeFn(name) { return EASE[name] || EASE.linear; }

  // ------------------------------------------------------------ lejátszás

  /** Az animáció helyi ideje (loop esetén körbeér). */
  function localTime(anim, elapsed) {
    var d = anim.duration > 0 ? anim.duration : 0;
    if (d === 0) return 0;
    if (anim.loop === false) return Math.min(Math.max(elapsed, 0), d);
    var t = elapsed % d;
    return t < 0 ? t + d : t;
  }

  /** Utolsó olyan kulcskocka indexe, amelynek t-je <= t (bináris keresés). */
  function findSegment(kfs, t) {
    var lo = 0, hi = kfs.length - 1;
    if (t < kfs[0].t) return -1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (kfs[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function val(kf, key) {
    return kf[key] !== undefined ? kf[key] : DEFAULTS[key];
  }

  /** Egy sáv állapota a t. másodpercben. */
  function sampleTrack(track, t) {
    var kfs = track.keyframes;
    var out = {};
    var i;
    if (!kfs || !kfs.length) return null;
    var idx = findSegment(kfs, t);
    if (idx < 0 || idx >= kfs.length - 1) {
      var only = kfs[idx < 0 ? 0 : kfs.length - 1];
      for (i = 0; i < NUMERIC.length; i++) out[NUMERIC[i]] = val(only, NUMERIC[i]);
      out.flipX = !!only.flipX;
      return out;
    }
    var a = kfs[idx], b = kfs[idx + 1];
    var span = b.t - a.t;
    var p = span > 0 ? (t - a.t) / span : 1;
    var e = easeFn(b.ease)(p);
    for (i = 0; i < NUMERIC.length; i++) {
      var k = NUMERIC[i];
      var va = val(a, k), vb = val(b, k);
      out[k] = va + (vb - va) * e;
    }
    out.flipX = !!a.flipX;
    return out;
  }

  /** A sávok rajzolási sorrendben (z szerint, stabilan). */
  function orderedTracks(anim) {
    return (anim.tracks || [])
      .map(function (tr, i) { return { tr: tr, i: i }; })
      .sort(function (a, b) { return ((a.tr.z || 0) - (b.tr.z || 0)) || (a.i - b.i); })
      .map(function (o) { return o.tr; });
  }

  // ------------------------------------------------------------ ellenőrzés

  /** Az animáció JSON ellenőrzése. Hibák listáját adja (üres = jó). */
  function validate(anim) {
    var errors = [];
    if (!anim || typeof anim !== 'object') return ['Az animáció nem objektum.'];
    if (anim.format !== FORMAT) errors.push('Ismeretlen formátum: ' + anim.format);
    if (!(anim.width > 0 && anim.height > 0)) errors.push('Hiányzó vagy hibás width/height.');
    if (!(anim.duration > 0)) errors.push('A duration legyen pozitív szám.');
    if (!Array.isArray(anim.tracks)) { errors.push('A tracks tömb hiányzik.'); return errors; }
    anim.tracks.forEach(function (tr, i) {
      var where = 'tracks[' + i + ']';
      if (!tr.image) errors.push(where + ': hiányzik az image.');
      if (!(tr.w > 0 && tr.h > 0)) errors.push(where + ': hibás w/h.');
      if (!Array.isArray(tr.keyframes) || !tr.keyframes.length) {
        errors.push(where + ': legalább egy kulcskocka kell.');
        return;
      }
      var prev = -Infinity;
      tr.keyframes.forEach(function (kf, j) {
        if (typeof kf.t !== 'number' || typeof kf.x !== 'number' || typeof kf.y !== 'number') {
          errors.push(where + '.keyframes[' + j + ']: t, x, y kötelező szám.');
        } else if (kf.t < prev) {
          errors.push(where + '.keyframes[' + j + ']: a t értékek nem növekvők.');
        }
        if (kf.ease && !EASE[kf.ease]) errors.push(where + '.keyframes[' + j + ']: ismeretlen ease: ' + kf.ease);
        prev = kf.t;
      });
    });
    return errors;
  }

  // --------------------------------------------------------- mozgásminták

  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function cyclesFor(duration, perSecond) { return Math.max(1, Math.round(duration * perSecond)); }

  /** Egyenletes mintavételi időpontok 0..duration között (a végpontokkal). */
  function sampleTimes(duration, step) {
    var n = Math.max(2, Math.round(duration / step));
    var out = [];
    for (var i = 0; i <= n; i++) out.push(duration * i / n);
    return out;
  }

  function kf(t, props) {
    var o = { t: r2(t), x: r2(props.x), y: r2(props.y), rot: r2(props.rot || 0), scale: r2(props.scale === undefined ? 1 : props.scale) };
    if (props.sx !== undefined && props.sx !== 1) o.sx = r2(props.sx);
    if (props.sy !== undefined && props.sy !== 1) o.sy = r2(props.sy);
    if (props.flipX) o.flipX = true;
    if (props.ease && props.ease !== 'linear') o.ease = props.ease;
    return o;
  }

  function dedupeSorted(kfs) {
    kfs.sort(function (a, b) { return a.t - b.t; });
    var out = [];
    kfs.forEach(function (k) {
      var last = out[out.length - 1];
      if (last && Math.abs(last.t - k.t) < 1e-6) out[out.length - 1] = k; else out.push(k);
    });
    return out;
  }

  /**
   * Kulcskockák generálása egy mozgásmintából.
   * el: { id, name, image, x, y, w, h }   – x, y a befoglaló téglalap bal felső sarka
   * scene: { width, height, duration }
   */
  function generatePresetTrack(preset, el, scene, speedKey) {
    var sp = SPEEDS[speedKey] || 1;
    var W = scene.width, H = scene.height, D = scene.duration;
    var w = el.w, h = el.h;
    var pivot = [0.5, 0.5];
    var kfs = [];
    var cx, cy, cycles, A;

    function center(p) {
      cx = el.x + w * p[0];
      cy = el.y + h * p[1];
    }

    switch (preset) {
      case 'bounce': {
        pivot = [0.5, 1];
        center(pivot);
        cycles = cyclesFor(D, 1.1 * sp);
        A = Math.min(clamp(h * 0.55, 30, H * 0.25), Math.max(el.y, 10));
        sampleTimes(D, 1 / 30).forEach(function (t) {
          var ph = (t / D) * cycles;
          var s = Math.abs(Math.sin(Math.PI * ph));
          var squash = s < 0.15 ? (1 - s / 0.15) : 0;
          kfs.push(kf(t, { x: cx, y: cy - A * s, sx: 1 + 0.1 * squash, sy: 1 - 0.14 * squash }));
        });
        break;
      }
      case 'float': {
        center(pivot);
        cycles = cyclesFor(D, 0.3 * sp);
        A = clamp(h * 0.1, 8, 40);
        sampleTimes(D, 1 / 12).forEach(function (t) {
          var a = 2 * Math.PI * (t / D) * cycles;
          kfs.push(kf(t, { x: cx, y: cy + A * Math.sin(a), rot: 2.5 * Math.sin(a + Math.PI / 2) }));
        });
        break;
      }
      case 'walk': {
        center(pivot);
        var margin = W * 0.02;
        var minX = w / 2 + margin, maxX = W - w / 2 - margin;
        var steps = cyclesFor(D, 2 * sp);
        if (maxX - minX < w * 0.5) {
          // Nincs hely sétálni: billegés helyben.
          sampleTimes(D, 1 / 12).forEach(function (t) {
            var a = 2 * Math.PI * (t / D) * steps;
            kfs.push(kf(t, { x: cx, y: cy - 6 * Math.abs(Math.sin(a)), rot: 5 * Math.sin(a) }));
          });
          break;
        }
        var seg = maxX - minX, L = 2 * seg;
        var startX = clamp(cx, minX, maxX);
        var offset = startX - minX;
        cycles = cyclesFor(D, (W * 0.12 * sp) / L);
        var walkAt = function (t) {
          var d = (offset + (t / D) * cycles * L) % L;
          var right = d < seg; // a jobb szélen (d === seg) már visszafelé néz
          var x = d <= seg ? minX + d : maxX - (d - seg);
          var a = 2 * Math.PI * (t / D) * steps;
          return { x: x, y: cy - 6 * Math.abs(Math.sin(a)), rot: 5 * Math.sin(a), flipX: !right };
        };
        sampleTimes(D, 1 / 12).forEach(function (t) { kfs.push(kf(t, walkAt(t))); });
        // Pontos fordulópontok, hogy a tükrözés a kép szélén történjen.
        for (var m = 0; m <= 2 * cycles + 2; m++) {
          var tt = ((m * seg - offset) / (cycles * L)) * D;
          if (tt > 0 && tt < D) kfs.push(kf(tt, walkAt(tt)));
        }
        break;
      }
      case 'wave': {
        pivot = [0.5, 1];
        center(pivot);
        cycles = cyclesFor(D, 0.9 * sp);
        sampleTimes(D, 1 / 12).forEach(function (t) {
          kfs.push(kf(t, { x: cx, y: cy, rot: 15 * Math.sin(2 * Math.PI * (t / D) * cycles) }));
        });
        break;
      }
      case 'pulse': {
        center(pivot);
        cycles = cyclesFor(D, 0.9 * sp);
        sampleTimes(D, 1 / 12).forEach(function (t) {
          var s = 1.05 - 0.05 * Math.cos(2 * Math.PI * (t / D) * cycles);
          kfs.push(kf(t, { x: cx, y: cy, scale: s }));
        });
        break;
      }
      case 'fly': {
        center(pivot);
        var S = W + w;
        cycles = cyclesFor(D, (W * 0.16 * sp) / S);
        var waves = cyclesFor(D, 0.7 * sp);
        A = Math.min(clamp(h * 0.4, 20, 90), cy - h / 2, H - cy - h / 2);
        A = Math.max(A, 0);
        var base = cx + w / 2; // 0..S tartományban mért kezdőpont
        var flyAt = function (t, x) {
          var a = 2 * Math.PI * (t / D) * waves;
          return { x: x, y: cy + A * Math.sin(a), rot: -12 * Math.cos(a) * (A > 0 ? 1 : 0) };
        };
        sampleTimes(D, 1 / 12).forEach(function (t) {
          var x = ((base + (t / D) * cycles * S) % S) - w / 2;
          kfs.push(kf(t, flyAt(t, x)));
        });
        // Kiröpül jobbra, balról visszajön (átmenet nélkül).
        for (var j = 1; j <= cycles + 1; j++) {
          var tw = ((j * S - base) / (cycles * S)) * D;
          if (tw > 0 && tw < D) {
            kfs.push(kf(tw - 0.001, flyAt(tw, W + w / 2)));
            var enter = flyAt(tw, -w / 2);
            enter.ease = 'step';
            kfs.push(kf(tw, enter));
          }
        }
        break;
      }
      case 'spin': {
        center(pivot);
        cycles = cyclesFor(D, 0.45 * sp);
        var quarters = cycles * 4;
        for (var q = 0; q <= quarters; q++) {
          kfs.push(kf((D * q) / quarters, { x: cx, y: cy, rot: 90 * q }));
        }
        break;
      }
      case 'enter': {
        center(pivot);
        var dl = cx, dr = W - cx, dt = cy;
        var from;
        if (dl <= dr && dl <= dt) from = { x: -w / 2, y: cy };
        else if (dr <= dt) from = { x: W + w / 2, y: cy };
        else from = { x: cx, y: -h / 2 };
        var arrive = Math.min(1.6 / sp, D * 0.6);
        kfs.push(kf(0, from));
        kfs.push(kf(arrive, { x: cx, y: cy, ease: 'easeOut' }));
        kfs.push(kf(D, { x: cx, y: cy }));
        break;
      }
      default: {
        center(pivot);
        kfs.push(kf(0, { x: cx, y: cy }));
      }
    }

    return {
      element: el.id,
      name: el.name || '',
      image: el.image,
      w: w,
      h: h,
      pivot: pivot,
      z: el.z || 0,
      preset: preset,
      speed: speedKey || 'medium',
      keyframes: dedupeSorted(kfs)
    };
  }

  /**
   * Egy teljes oldal-animáció összeállítása.
   * opts: { width, height, duration, background, elements: [{…el, preset, speed}] }
   * A minta nélküli (háttér) elemek egyetlen kulcskockás, álló sávként kerülnek
   * bele – így akkor is látszanak, ha a háttérkép csak a papírt tartalmazza.
   * opts.includeStatic === false esetén kimaradnak.
   */
  function buildAnimation(opts) {
    var scene = { width: opts.width, height: opts.height, duration: opts.duration || 6 };
    var els = (opts.elements || []).filter(function (el) {
      return el.preset || opts.includeStatic !== false;
    });
    return {
      format: FORMAT,
      width: scene.width,
      height: scene.height,
      duration: scene.duration,
      loop: true,
      background: opts.background || null,
      tracks: els.map(function (el) {
        var tr = generatePresetTrack(el.preset || 'none', el, scene, el.speed);
        if (!el.preset) { tr.preset = null; delete tr.speed; }
        return tr;
      })
    };
  }

  return {
    FORMAT: FORMAT,
    PRESETS: PRESETS,
    SPEEDS: SPEEDS,
    EASE: EASE,
    localTime: localTime,
    sampleTrack: sampleTrack,
    orderedTracks: orderedTracks,
    validate: validate,
    generatePresetTrack: generatePresetTrack,
    buildAnimation: buildAnimation
  };
});
