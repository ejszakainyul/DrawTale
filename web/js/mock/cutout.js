/*
 * Kivágás a böngészőben – CSAK a mock módhoz.
 *
 * A valódi rendszerben ezt a szerver Python + OpenCV szkriptje végzi (SRS 3.2.2).
 * Ez annak a prototípusnak a lépésről lépésre átírt, egyszerűsített mása, hogy
 * a web demó a PHP/Python rész nélkül is ki tudjon vágni egy feltöltött rajzot:
 *
 *   1. üres papír becslése (erős elmosás)    → paper
 *   2. sötétebb VAGY színes a papírnál = rajz → ink
 *   3. apró rések bezárása (closing)
 *   4. lyukak kitöltése (a cica belseje is a cicáé)
 *   5. közeli darabok összevonása (a nap sugarai a naphoz tartoznak)
 *   6. elemek szétválasztása, morzsák eldobása
 *   7. átlátszó PNG-k + háttér papírszínnel kitöltve
 */
(function (g) {
  'use strict';

  var MAX_SIDE = 1600;
  var DIFF = 35;   // mennyivel sötétebb a papírnál
  var SAT = 70;    // mennyire színes (0–255)
  var CLOSE_R = 4; // kernel9
  var GROUP_R = 15; // kernel31
  var MIN_AREA_RATIO = 0.0012;

  function loadBitmap(src) {
    if (src instanceof Blob) {
      if (g.createImageBitmap) return createImageBitmap(src);
      src = URL.createObjectURL(src);
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('A kép nem olvasható.')); };
      img.src = src;
    });
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // ------------------------------------------------- bináris morfológia (O(n))

  /** 1D ablakos max/min egy bináris tömb soraira vagy oszlopaira. */
  function morph1D(src, w, h, r, horizontal, dilate) {
    var out = new Uint8Array(w * h);
    var len = horizontal ? w : h, lines = horizontal ? h : w;
    var pre = new Int32Array(len + 1);
    for (var l = 0; l < lines; l++) {
      var i;
      for (i = 0; i < len; i++) {
        var idx = horizontal ? l * w + i : i * w + l;
        pre[i + 1] = pre[i] + src[idx];
      }
      for (i = 0; i < len; i++) {
        var a = Math.max(0, i - r), b = Math.min(len - 1, i + r);
        var cnt = pre[b + 1] - pre[a];
        var o = horizontal ? l * w + i : i * w + l;
        out[o] = dilate ? (cnt > 0 ? 1 : 0) : (cnt === b - a + 1 ? 1 : 0);
      }
    }
    return out;
  }
  function dilate(m, w, h, r) { return morph1D(morph1D(m, w, h, r, true, true), w, h, r, false, true); }
  function erode(m, w, h, r) { return morph1D(morph1D(m, w, h, r, true, false), w, h, r, false, false); }

  /** A körvonalakon belüli lyukak kitöltése: ami a szélről nem érhető el, az a rajzé. */
  function fillHoles(m, w, h) {
    var seen = new Uint8Array(w * h);
    var stack = new Int32Array(w * h);
    var sp = 0, i;
    function push(p) { if (!m[p] && !seen[p]) { seen[p] = 1; stack[sp++] = p; } }
    for (i = 0; i < w; i++) { push(i); push((h - 1) * w + i); }
    for (i = 0; i < h; i++) { push(i * w); push(i * w + w - 1); }
    while (sp) {
      var p = stack[--sp], x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }
    var out = new Uint8Array(w * h);
    for (i = 0; i < w * h; i++) out[i] = m[i] || !seen[i] ? 1 : 0;
    return out;
  }

  /** Összefüggő foltok címkézése (4-szomszédság). */
  function label(m, w, h) {
    var labels = new Int32Array(w * h);
    var stack = new Int32Array(w * h);
    var n = 0;
    for (var s = 0; s < w * h; s++) {
      if (!m[s] || labels[s]) continue;
      n++;
      var sp = 0;
      labels[s] = n; stack[sp++] = s;
      while (sp) {
        var p = stack[--sp], x = p % w;
        var nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
        for (var k = 0; k < 4; k++) {
          var q = nb[k];
          if (q >= 0 && q < w * h && m[q] && !labels[q]) { labels[q] = n; stack[sp++] = q; }
        }
      }
    }
    return { labels: labels, count: n };
  }

  // ------------------------------------------------------- papír becslése

  /** Kicsinyített képen: max-szűrő (eltünteti a vonalakat) + elmosás, majd vissza. */
  function estimatePaper(data, w, h) {
    var f = 8;
    var sw = Math.ceil(w / f), sh = Math.ceil(h / f);
    var chans = [new Float32Array(sw * sh), new Float32Array(sw * sh), new Float32Array(sw * sh)];
    var x, y, c, i;
    // 1) kicsinyítés: blokkonként a legvilágosabb képpont (papír)
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
      var best = -1, br = 0, bgc = 0, bb = 0;
      for (var yy = y * f; yy < Math.min(h, y * f + f); yy += 2) for (var xx = x * f; xx < Math.min(w, x * f + f); xx += 2) {
        var o = (yy * w + xx) * 4;
        var lum = data[o] + data[o + 1] + data[o + 2];
        if (lum > best) { best = lum; br = data[o]; bgc = data[o + 1]; bb = data[o + 2]; }
      }
      i = y * sw + x;
      chans[0][i] = br; chans[1][i] = bgc; chans[2][i] = bb;
    }
    // 2) max-szűrő (~15 px eredetiben) majd doboz-elmosás többször (~ medianBlur 51)
    function maxFilter(a) {
      var o = new Float32Array(a.length);
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
        var m = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var X = Math.min(sw - 1, Math.max(0, x + dx)), Y = Math.min(sh - 1, Math.max(0, y + dy));
          m = Math.max(m, a[Y * sw + X]);
        }
        o[y * sw + x] = m;
      }
      return o;
    }
    function boxBlur(a, r) {
      var o = new Float32Array(a.length);
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
        var s = 0, n = 0;
        for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
          var X = x + dx, Y = y + dy;
          if (X >= 0 && X < sw && Y >= 0 && Y < sh) { s += a[Y * sw + X]; n++; }
        }
        o[y * sw + x] = s / n;
      }
      return o;
    }
    for (c = 0; c < 3; c++) chans[c] = boxBlur(boxBlur(maxFilter(maxFilter(chans[c])), 2), 2);
    // 3) visszanagyítás (bilineáris)
    var paper = new Uint8ClampedArray(w * h * 3);
    for (y = 0; y < h; y++) {
      var fy = Math.min(sh - 1.001, Math.max(0, y / f - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
      for (x = 0; x < w; x++) {
        var fx = Math.min(sw - 1.001, Math.max(0, x / f - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
        var i00 = y0 * sw + x0, i01 = i00 + 1, i10 = i00 + sw, i11 = i10 + 1;
        for (c = 0; c < 3; c++) {
          var a = chans[c];
          paper[(y * w + x) * 3 + c] = (a[i00] * (1 - tx) + a[i01] * tx) * (1 - ty) + (a[i10] * (1 - tx) + a[i11] * tx) * ty;
        }
      }
    }
    return paper;
  }

  /**
   * A kivágott helyek kitöltése a környező papír színével (az OpenCV inpaint egyszerű mása):
   * kicsinyített rácson a maszkon kívüli képpontok átlaga, a lyukakat a szomszédokból
   * töltjük fel kívülről befelé, majd simítva visszanagyítjuk. Így az árnyékos papír
   * fényátmenete is folytatódik, és nem marad „szellemkép”.
   */
  function inpaint(d, w, h, mask) {
    var f = 8;
    var sw = Math.ceil(w / f), sh = Math.ceil(h / f), n = sw * sh;
    var sum = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    var cnt = new Float32Array(n);
    var x, y, i, c;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var p = y * w + x;
      if (mask[p]) continue;
      i = ((y / f) | 0) * sw + ((x / f) | 0);
      sum[0][i] += d[p * 4]; sum[1][i] += d[p * 4 + 1]; sum[2][i] += d[p * 4 + 2]; cnt[i]++;
    }
    var grid = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    var ok = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      if (cnt[i] < f) continue; // kevés papír a cellában: inkább a szomszédokból
      ok[i] = 1;
      for (c = 0; c < 3; c++) grid[c][i] = sum[c][i] / cnt[i];
    }
    var known = ok.slice();
    // Feltöltés kívülről befelé.
    var missing = true, guard = sw + sh;
    while (missing && guard-- > 0) {
      missing = false;
      var next = ok.slice();
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
        i = y * sw + x;
        if (ok[i]) continue;
        var acc = [0, 0, 0], k = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= sw || Y >= sh) continue;
          var j = Y * sw + X;
          if (!ok[j]) continue;
          acc[0] += grid[0][j]; acc[1] += grid[1][j]; acc[2] += grid[2][j]; k++;
        }
        if (k) { for (c = 0; c < 3; c++) grid[c][i] = acc[c] / k; next[i] = 1; } else missing = true;
      }
      ok = next;
    }
    // Relaxáció: a kitöltött cellák a szomszédaik átlagát veszik fel (Laplace),
    // így a megvilágítás átmenete folytonos marad a lyukon át is.
    for (var it = 0; it < 60; it++) {
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
        i = y * sw + x;
        if (known[i]) continue;
        var s4 = [0, 0, 0], m4 = 0;
        if (x > 0) { m4++; for (c = 0; c < 3; c++) s4[c] += grid[c][i - 1]; }
        if (x < sw - 1) { m4++; for (c = 0; c < 3; c++) s4[c] += grid[c][i + 1]; }
        if (y > 0) { m4++; for (c = 0; c < 3; c++) s4[c] += grid[c][i - sw]; }
        if (y < sh - 1) { m4++; for (c = 0; c < 3; c++) s4[c] += grid[c][i + sw]; }
        for (c = 0; c < 3; c++) grid[c][i] = s4[c] / m4;
      }
    }
    // Enyhe simítás, hogy ne legyen kockás.
    for (c = 0; c < 3; c++) {
      var g = grid[c], o = new Float32Array(n);
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) {
        var s = 0, m = 0;
        for (var yy = Math.max(0, y - 1); yy <= Math.min(sh - 1, y + 1); yy++) for (var xx = Math.max(0, x - 1); xx <= Math.min(sw - 1, x + 1); xx++) { s += g[yy * sw + xx]; m++; }
        o[y * sw + x] = s / m;
      }
      grid[c] = o;
    }
    for (y = 0; y < h; y++) {
      var fy = Math.min(sh - 1.001, Math.max(0, y / f - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
      for (x = 0; x < w; x++) {
        var q = y * w + x;
        if (!mask[q]) continue;
        var fx = Math.min(sw - 1.001, Math.max(0, x / f - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
        var i00 = y0 * sw + x0, i01 = i00 + 1, i10 = i00 + sw, i11 = i10 + 1;
        for (c = 0; c < 3; c++) {
          var a = grid[c];
          d[q * 4 + c] = (a[i00] * (1 - tx) + a[i01] * tx) * (1 - ty) + (a[i10] * (1 - tx) + a[i11] * tx) * ty;
        }
      }
    }
  }

  // ---------------------------------------------------------------- fő lépés

  /**
   * @param {Blob|string} src  fotó (Blob) vagy kép URL
   * @returns Promise<{ width, height, background: Blob, elements: [{ blob, x, y, w, h, area }] }>
   */
  function cutout(src) {
    return loadBitmap(src).then(function (bmp) {
      var k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      var cv = canvas(w, h);
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var n = w * h, i;

      var paper = estimatePaper(d, w, h);

      // ink = sötétebb a papírnál VAGY színes
      var ink = new Uint8Array(n);
      for (i = 0; i < n; i++) {
        var r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        var gray = 0.299 * r + 0.587 * gg + 0.114 * b;
        var pg = 0.299 * paper[i * 3] + 0.587 * paper[i * 3 + 1] + 0.114 * paper[i * 3 + 2];
        var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        var sat = mx === 0 ? 0 : ((mx - mn) * 255) / mx;
        ink[i] = pg - gray > DIFF || (sat > SAT && mx > 60) ? 1 : 0;
      }

      var mask = erode(dilate(ink, w, h, CLOSE_R), w, h, CLOSE_R); // closing
      var filled = fillHoles(mask, w, h);
      var groups = dilate(filled, w, h, GROUP_R);
      var lab = label(groups, w, h);

      // statisztika a kitöltött maszkon
      var stats = [];
      for (i = 0; i <= lab.count; i++) stats.push({ area: 0, x0: w, y0: h, x1: -1, y1: -1 });
      for (i = 0; i < n; i++) {
        if (!filled[i]) continue;
        var st = stats[lab.labels[i]];
        var x = i % w, y = (i - x) / w;
        st.area++;
        if (x < st.x0) st.x0 = x; if (x > st.x1) st.x1 = x;
        if (y < st.y0) st.y0 = y; if (y > st.y1) st.y1 = y;
      }
      var minArea = n * MIN_AREA_RATIO;
      var keep = [];
      for (i = 1; i <= lab.count; i++) if (stats[i].area > minArea) keep.push(i);
      // Ha szinte az egész lap „rajz”, az inkább rossz fotó (pl. színes asztal).
      keep = keep.filter(function (l) { var s = stats[l]; return (s.x1 - s.x0) * (s.y1 - s.y0) < n * 0.9; });

      var jobs = keep.map(function (l) {
        var s = stats[l], pad = 4;
        var x0 = Math.max(0, s.x0 - pad), y0 = Math.max(0, s.y0 - pad);
        var x1 = Math.min(w - 1, s.x1 + pad), y1 = Math.min(h - 1, s.y1 + pad);
        var ew = x1 - x0 + 1, eh = y1 - y0 + 1;
        var ec = canvas(ew, eh), ectx = ec.getContext('2d');
        var out = ectx.createImageData(ew, eh);
        for (var yy = 0; yy < eh; yy++) for (var xx = 0; xx < ew; xx++) {
          var si = (y0 + yy) * w + (x0 + xx), di = (yy * ew + xx) * 4;
          if (filled[si] && lab.labels[si] === l) {
            out.data[di] = d[si * 4]; out.data[di + 1] = d[si * 4 + 1]; out.data[di + 2] = d[si * 4 + 2]; out.data[di + 3] = 255;
          }
        }
        ectx.putImageData(out, 0, 0);
        return toBlob(ec, 'image/png').then(function (blob) {
          return { blob: blob, x: x0, y: y0, w: ew, h: eh, area: s.area };
        });
      });

      // Háttér: a kivágott helyek papírszínnel kitöltve (a széleken kicsit bővebben,
      // hogy a vonalak elmosódott széle se maradjon ott).
      var kept = new Uint8Array(lab.count + 1);
      keep.forEach(function (l) { kept[l] = 1; });
      var hole = new Uint8Array(n);
      for (i = 0; i < n; i++) hole[i] = filled[i] && kept[lab.labels[i]] ? 1 : 0;
      inpaint(d, w, h, dilate(hole, w, h, 3));
      ctx.putImageData(img, 0, 0);

      return Promise.all([toBlob(cv, 'image/jpeg', 0.88)].concat(jobs)).then(function (res) {
        return {
          width: w, height: h, background: res[0],
          elements: res.slice(1).sort(function (a, b) { return a.x - b.x; })
        };
      });
    });
  }

  function toBlob(c, type, q) {
    return new Promise(function (resolve) { c.toBlob(resolve, type, q); });
  }

  /** Normalizált fotó: max. 2048 px, újrakódolva (ezzel az EXIF/GPS is elvész). */
  function normalizePhoto(file) {
    return loadBitmap(file).then(function (bmp) {
      var k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      var c = canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return toBlob(c, 'image/jpeg', 0.9);
    });
  }

  g.DTCutout = { cutout: cutout, normalizePhoto: normalizePhoto, _internal: { dilate: dilate, erode: erode, fillHoles: fillHoles, label: label } };
})(window);
