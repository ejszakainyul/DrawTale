// Nyitóoldal: élő példamese + „próbáld ki” mozgásválasztó.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var DT = window.DT, A = window.DrawTaleAnim, h = DT.h;
  DT.layout('home');

  if (DT.api.isLoggedIn()) {
    DT.$('#hero-actions').replaceChildren(h('a.btn.btn-accent.btn-big', { href: 'dashboard.html' }, h('span.ico', '📚'), ' Meséim'));
  }

  var ART = 'assets/demo/';
  var els = [
    { id: 1, name: 'nap', image: ART + 'sun.svg', x: 1210, y: 60, w: 310, h: 310, preset: 'pulse' },
    { id: 2, name: 'virág', image: ART + 'flower.svg', x: 1220, y: 660, w: 145, h: 290, preset: null },
    { id: 3, name: 'pillangó', image: ART + 'butterfly.svg', x: 820, y: 300, w: 200, h: 160, preset: 'fly' },
    { id: 4, name: 'cica', image: ART + 'cat.svg', x: 440, y: 680, w: 340, h: 275, preset: 'walk', z: 5 }
  ];
  var player = new window.DrawTalePlayer(DT.$('#demo'), { resolve: DT.api.media });

  function build() {
    return A.buildAnimation({ width: 1600, height: 1200, duration: 6, background: ART + 'bg-meadow.svg', elements: els });
  }
  player.load(build());

  var box = DT.$('#demo-presets');
  A.PRESETS.forEach(function (p) {
    var b = h('button.preset', { type: 'button', 'aria-pressed': String(p.key === 'walk'), title: p.hint }, h('span', { 'aria-hidden': 'true' }, p.icon), p.label);
    b.addEventListener('click', function () {
      box.querySelectorAll('.preset').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      els[3].preset = p.key;
      var wasPlaying = player.playing || player.autoplay;
      player.load(build()).then(function () { if (wasPlaying) player.play(); });
    });
    box.append(b);
  });
});
