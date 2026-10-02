/*
 * DrawTale web – beállítások.
 *
 * mock: true  → a böngészőben futó ál-szerver (js/mock/) válaszol, a PHP API nélkül
 *               is végig lehet kattintani a teljes fő útvonalat. Az adatok a
 *               böngészőben (localStorage + IndexedDB) maradnak.
 * mock: false → a valódi PHP API-t hívja az apiBase címen.
 *
 * Felülírható az URL-ben is: ?mock=0 vagy ?mock=1 (megjegyzi).
 */
(function () {
  var stored = null;
  try {
    var q = new URLSearchParams(location.search).get('mock');
    if (q === '0' || q === '1') localStorage.setItem('drawtale.mock', q);
    stored = localStorage.getItem('drawtale.mock');
  } catch (e) { /* privát mód */ }

  window.DT_CONFIG = {
    apiBase: '/api/v1',
    mediaBase: '/media/',
    mock: stored === null ? true : stored === '1',
    mockLatencyMs: 180
  };
})();
