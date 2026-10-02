// Futtatás: node --test tests/web
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../web/js/core/anim.js');

const scene = { width: 1600, height: 1200, duration: 6 };
const cat = { id: 1, name: 'cica', image: 'cat.png', x: 300, y: 700, w: 260, h: 210 };

function close(a, b, eps = 0.01) {
  assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
}

test('lineáris interpoláció két kulcskocka között', () => {
  const tr = { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 2, x: 100, y: 50, rot: 90 }] };
  const s = A.sampleTrack(tr, 1);
  close(s.x, 50); close(s.y, 25); close(s.rot, 45); close(s.scale, 1);
});

test('az első előtt és az utolsó után kitart', () => {
  const tr = { keyframes: [{ t: 1, x: 10, y: 10 }, { t: 2, x: 20, y: 20 }] };
  assert.equal(A.sampleTrack(tr, 0).x, 10);
  assert.equal(A.sampleTrack(tr, 5).x, 20);
});

test('step ease: nincs átmenet, a t-ben ugrik', () => {
  const tr = { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 1, x: 100, y: 0, ease: 'step' }] };
  assert.equal(A.sampleTrack(tr, 0.99).x, 0);
  assert.equal(A.sampleTrack(tr, 1).x, 100);
});

test('flipX az előző kulcskockától érvényes, nem interpolálódik', () => {
  const tr = { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 1, x: 1, y: 0, flipX: true }, { t: 2, x: 2, y: 0 }] };
  assert.equal(A.sampleTrack(tr, 0.5).flipX, false);
  assert.equal(A.sampleTrack(tr, 1.5).flipX, true);
});

test('localTime: loop körbeér, loop:false megáll a végén', () => {
  close(A.localTime({ duration: 6 }, 7.5), 1.5);
  close(A.localTime({ duration: 6, loop: false }, 7.5), 6);
});

test('mind a 8 minta érvényes, illeszkedő hurkot ad', () => {
  for (const p of A.PRESETS) {
    for (const speed of Object.keys(A.SPEEDS)) {
      const anim = A.buildAnimation({ ...scene, elements: [{ ...cat, preset: p.key, speed }] });
      assert.deepEqual(A.validate(anim), [], `${p.key}/${speed}`);
      const tr = anim.tracks[0];
      assert.ok(tr.keyframes.length >= 2, p.key);
      if (p.key === 'enter') continue; // egyszeri érkezés, nem periodikus
      const a = A.sampleTrack(tr, 0);
      const b = A.sampleTrack(tr, scene.duration);
      close(a.x, b.x, 0.5); close(a.y, b.y, 0.5); close(a.scale, b.scale);
      close(((a.rot % 360) + 360) % 360, ((b.rot % 360) + 360) % 360, 0.5);
    }
  }
});

test('a minták a kiinduló helyről indulnak (kivéve beúszik/repül szélén)', () => {
  for (const key of ['float', 'wave', 'pulse', 'spin', 'walk']) {
    const tr = A.generatePresetTrack(key, cat, scene, 'medium');
    const s = A.sampleTrack(tr, 0);
    const px = cat.x + cat.w * tr.pivot[0];
    const py = cat.y + cat.h * tr.pivot[1];
    close(s.x, px, 1); close(s.y, py, 1);
  }
});

test('sétál: a jelenetben marad, és a széleken megfordul', () => {
  const tr = A.generatePresetTrack('walk', cat, scene, 'fast');
  let flips = 0, prev = null;
  for (let t = 0; t <= scene.duration; t += 0.01) {
    const s = A.sampleTrack(tr, t);
    assert.ok(s.x - cat.w / 2 >= 0 && s.x + cat.w / 2 <= scene.width, `x=${s.x} @${t}`);
    if (prev !== null && prev !== s.flipX) flips++;
    prev = s.flipX;
  }
  assert.ok(flips >= 2, 'legalább egyszer oda-vissza');
});

test('ugrál: nem megy ki a kép tetején', () => {
  const high = { ...cat, y: 40 };
  const tr = A.generatePresetTrack('bounce', high, scene, 'medium');
  for (let t = 0; t <= scene.duration; t += 0.02) {
    const s = A.sampleTrack(tr, t);
    assert.ok(s.y - high.h >= -1, `y=${s.y}`);
  }
});

test('lüktet: 100% és 110% között', () => {
  const tr = A.generatePresetTrack('pulse', cat, scene, 'medium');
  for (let t = 0; t <= scene.duration; t += 0.05) {
    const s = A.sampleTrack(tr, t);
    assert.ok(s.scale >= 0.999 && s.scale <= 1.101, String(s.scale));
  }
});

test('repül: kiröpül jobbra és balról jön vissza, nem csúszik át a képen', () => {
  const tr = A.generatePresetTrack('fly', cat, scene, 'fast');
  let prevX = null;
  for (let t = 0; t <= scene.duration; t += 0.005) {
    const s = A.sampleTrack(tr, t);
    if (prevX !== null && s.x < prevX) {
      // Csak a kép két szélén kívül szabad visszaugrani.
      assert.ok(prevX >= scene.width, `prevX=${prevX}`);
      assert.ok(s.x <= 0, `x=${s.x}`);
    }
    prevX = s.x;
  }
});

test('validate: hibás adatot kiszűr', () => {
  assert.ok(A.validate(null).length);
  assert.ok(A.validate({ format: 1, width: 10, height: 10, duration: 0, tracks: [] }).length);
  const bad = { format: 1, width: 10, height: 10, duration: 1, tracks: [{ image: 'a', w: 1, h: 1, keyframes: [{ t: 1, x: 0, y: 0 }, { t: 0, x: 0, y: 0 }] }] };
  assert.ok(A.validate(bad).some((e) => e.includes('növekvő')));
});

test('egy oldal animációja kicsi (pár kilobájt)', () => {
  const anim = A.buildAnimation({ ...scene, elements: A.PRESETS.slice(0, 4).map((p, i) => ({ ...cat, id: i, preset: p.key })) });
  const kb = JSON.stringify(anim).length / 1024;
  assert.ok(kb < 40, `${kb.toFixed(1)} KB`);
});
