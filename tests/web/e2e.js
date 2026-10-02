// A web fő útvonalának végigkattintása böngészőben (demó / mock módban).
// Futtatás:  npm i -g playwright  (vagy npx)  →  node tests/web/e2e.js
// Képernyőképek: SHOTS=mappa node tests/web/e2e.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..', 'web');
const SHOTS = process.env.SHOTS || null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(decodeURIComponent(req.url.split(/[?#]/)[0])).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, () => ok(srv)));
}

(async () => {
  const srv = await serve();
  const B = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  let failed = 0;
  const shot = (name) => SHOTS && p.screenshot({ path: path.join(SHOTS, name + '.png') });
  async function step(name, fn) {
    try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '–', e.message.split('\n')[0]); }
  }

  await step('nyitóoldal élő demóval', async () => {
    await p.goto(B + 'index.html');
    await p.waitForSelector('#demo-presets .preset');
    await shot('01-home');
  });
  await step('belépés demó fiókkal (UC-02)', async () => {
    await p.goto(B + 'login.html');
    await p.click('#fill-demo');
    await p.click('#login-form [type=submit]');
    await p.waitForURL(/dashboard/);
    await p.waitForSelector('.story-card');
    await shot('02-dashboard');
  });
  await step('lejátszás és lapozás (UC-09)', async () => {
    await p.goto(B + 'player.html?id=1');
    await p.waitForSelector('.book canvas');
    await p.click('[aria-label="Következő oldal"]');
    await p.waitForFunction(() => document.querySelector('.controls-bar .pos').textContent.includes('1 /'));
    await p.waitForTimeout(900);
    await shot('03-player');
  });
  await step('új mese, fotó feltöltése és kivágás (UC-04, UC-05)', async () => {
    await p.goto(B + 'dashboard.html');
    await p.click('#new-story');
    await p.fill('#title', 'E2E mese');
    await p.click('dialog .btn-accent');
    await p.waitForURL(/editor/);
    await p.fill('#page-text', 'A cica sétál a réten.');
    await p.click('text=Kipróbálom a mintafotóval');
    await p.waitForSelector('.el-row', { timeout: 30000 });
    const n = await p.$$eval('.el-row', (r) => r.length);
    if (n !== 5) throw new Error('5 elemet vártunk, ennyi lett: ' + n);
  });
  await step('Mi mozogjon? + Életre kel! (UC-06, UC-07)', async () => {
    await p.click('.el-row:nth-child(4) .seg button:last-child'); // a virág háttér marad
    await p.click('.life-bar .btn-accent');
    await p.waitForSelector('text=Ez az oldal már életre kelt', { timeout: 5000 });
    await shot('04-alive');
  });
  let url;
  await step('megosztás linkkel és QR-kóddal (UC-10)', async () => {
    await p.click('#share-link');
    await p.waitForURL(/shares/);
    await p.click('#share-form [type=submit]:not([disabled])');
    await p.waitForSelector('.qr svg');
    url = await p.inputValue('.linkbox input');
  });
  await step('vendég nézet belépés nélkül (UC-11)', async () => {
    // Ugyanabban a böngészőben, mert demó módban az adatok a böngészőben vannak.
    // A vendég nézet nem küld tokent (auth: false), csak a link tokenjét.
    const g = await ctx.newPage();
    await g.goto(url);
    await g.waitForSelector('.book canvas');
    await g.close();
  });
  await step('visszavont link „nem érhető el” (TC-18)', async () => {
    await p.click('tbody tr:first-child >> text=Visszavonás');
    await p.click('dialog .btn-danger');
    await p.waitForTimeout(400);
    const g = await ctx.newPage();
    await g.goto(url);
    await g.waitForSelector('text=Ez a mese már nem érhető el');
    await g.close();
  });
  await step('más meséje nem érhető el (TC-05)', async () => {
    await p.goto(B + 'player.html?id=4'); // Péter meséje
    await p.waitForSelector('text=Ez a mese nem található');
  });
  await step('XSS: a szöveg szövegként jelenik meg (TC-23)', async () => {
    await p.goto(B + 'dashboard.html');
    await p.click('#new-story');
    await p.fill('#title', '<img src=x onerror=window.__xss=1>');
    await p.click('dialog .btn-accent');
    await p.waitForURL(/editor/);
    await p.goto(B + 'dashboard.html');
    await p.waitForSelector('.story-card');
    if (await p.evaluate(() => window.__xss)) throw new Error('lefutott a beinjektált kód');
  });
  await step('kijelentkezés után a Vissza nem mutat védett oldalt (REQ-WEB-01)', async () => {
    await p.click('text=Kilépés');
    await p.waitForURL(/index/);
    await p.goBack();
    await p.waitForURL(/login/);
  });
  await step('admin: hibás feldolgozás újraindítása (UC-13)', async () => {
    await p.goto(B + 'login.html');
    await p.fill('#email', 'dani@demo.hu');
    await p.fill('#password', 'admin1234');
    await p.click('#login-form [type=submit]');
    await p.waitForURL(/dashboard/);
    await p.goto(B + 'admin.html');
    await p.click('text=Újraindítás');
    await p.waitForFunction(() => !document.querySelector('.badge-processing') && document.querySelectorAll('.badge-done').length > 0, null, { timeout: 30000 });
    await shot('05-admin');
  });
  await step('telefon szélesség: nincs vízszintes görgetés', async () => {
    const m = await browser.newPage({ viewport: { width: 360, height: 740 } });
    for (const page of ['index.html', 'login.html', 'register.html']) {
      await m.goto(B + page);
      const w = await m.evaluate(() => document.documentElement.scrollWidth);
      if (w > 360) throw new Error(page + ': ' + w + 'px széles');
    }
    await m.close();
  });

  if (errors.length) { failed++; console.log('Hibák a konzolon:\n' + errors.join('\n')); }
  await browser.close();
  srv.close();
  console.log(failed ? `\n${failed} lépés elbukott` : '\nMinden lépés rendben ✓');
  process.exit(failed ? 1 : 0);
})();
