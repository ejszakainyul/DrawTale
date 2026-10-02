# DrawTale – webes felület és lejátszó

HTML + CSS + JavaScript, build lépés és külső keretrendszer nélkül. A lejátszó HTML5 canvas-ra rajzol;
ugyanez a kód fut majd a mobil WebView-ban is (SRS 2.1, „Egy lejátszó, sok helyen”).

## Indítás

Bármilyen statikus szerver jó, pl. a repó gyökeréből:

```bash
npx http-server web -p 8080      # vagy: cd web && python3 -m http.server 8080
```

Majd: <http://localhost:8080>. (Fájlként, `file://`-ról megnyitva nem működik minden, kell egy szerver.)

**Demó fiókok:** `anna@demo.hu` / `demo1234` (szülő, 3 kész mese) · `dani@demo.hu` / `admin1234` (admin)

## Demó (mock) mód

Amíg a PHP szerver nem készül el, a `js/mock/` mappában lévő **ál-szerver** válaszol a böngészőben,
ugyanazokkal a végpontokkal és hibakódokkal, amiket a valódi API-tól várunk ([`docs/api-web.md`](../docs/api-web.md)).
Így a teljes fő útvonal végigkattintható: regisztráció → mese írása → fotó feltöltése → kivágás →
Mi mozogjon? → Életre kel! → lejátszás → megosztás → vendég nézet.

- Az adatok a böngészőben maradnak (localStorage + IndexedDB) – egy megosztási link ezért csak
  ugyanabban a böngészőben nyílik meg. A fejléc alatti sárga sávban vissza lehet állítani a demó adatokat.
- A kivágást a `js/mock/cutout.js` végzi: a Python + OpenCV prototípus (SRS 3.2.2) lépéseinek JavaScript mása.
  A szerkesztőben a **„Kipróbálom a mintafotóval”** gomb egy árnyékos fotón mutatja meg.
- Átkapcsolás a valódi szerverre: `js/config.js` → `mock: false`, vagy az URL-ben `?mock=0`.

## Mi hol van?

```
index.html        nyitóoldal élő példamesével („Mit csináljon a cica?”)
login.html        belépés + elfelejtett jelszó          register.html  regisztráció nyilatkozattal
reset.html        új jelszó a levélben kapott linkből
dashboard.html    mesepolc: gyerekprofilok, mesekártyák
editor.html       meseszerkesztő: oldalak, fotó, Mi mozogjon?, Életre kel!
player.html       lapozós könyv (saját mese)            view.html      vendég nézet megosztott linkkel
shares.html       megosztások: link, QR-kód, lejárat, visszavonás
account.html      fiók, gyerekprofilok, jelszó, fióktörlés
admin.html        hibás feldolgozások, felhasználók tiltása, napi riport

js/core/anim.js   ★ animáció mag: kulcskocka-interpoláció + 8 mozgásminta (DOM nélkül, Node-ban is fut)
js/player.js      ★ canvas lejátszó egy oldalhoz (ezt használja a mobil WebView is)
js/book.js        lapozható könyv: borító, átforduló lap, mesélő mód (Web Speech API)
js/api.js         API kliens: tokenek, csendes token-megújítás, egységes hibák
js/ui.js          fejléc, értesítések, párbeszédablakok, segédfüggvények
js/pages/*.js     az egyes oldalak logikája
js/mock/          ál-szerver, demó adatok, böngészős kivágás
assets/demo/      gyerekrajz-stílusú demó képek (tools/gen-demo-art.js generálja)
vendor/qrcode.js  QR-kód generátor (Kazuhiko Arase, MIT)
```

Az animáció JSON formátuma: [`docs/animation-format.md`](../docs/animation-format.md).

## Tesztek

```bash
node --test tests/web/anim.test.js   # animáció mag: interpoláció, minták, hurok, határok (13 eset)
node tests/web/e2e.js                # böngészős végigkattintás Playwrighttal (13 lépés)
```

Az e2e teszt a TC-05 (más meséje), TC-18 (visszavont link), TC-23 (XSS) eseteket és a REQ-WEB-01
„Vissza gomb kilépés után” feltételt is ellenőrzi. Képernyőképek: `SHOTS=mappa node tests/web/e2e.js`.
Lejátszás közben az FPS mérő: `player.html?id=1&fps=1` (NFR-PERF-06).

## Követelmények állapota (web)

| ID | Mit | Állapot |
|----|-----|---------|
| REQ-WEB-01 | Regisztráció, belépés, kijelentkezés | ✅ (mock API-val) |
| REQ-WEB-02 | Lejátszó canvas-szal, lapozással | ✅ |
| REQ-WEB-03 | Megosztott mese belépés nélkül | ✅ |
| REQ-WEB-04 | Megosztások kezelése | ✅ |
| REQ-WEB-05 | QR-kód | ✅ |
| REQ-WEB-06 | Admin felület | ✅ |
| REQ-WEB-07 | Lapozós effekt, teljes képernyő | ✅ |
| REQ-WEB-08 | Mesélő mód gépi felolvasással | ✅ (ha a böngészőnek van magyar hangja; különben időzített lapozás) |
| REQ-WEB-09 | Nyomtatható mesekártya (PDF) | ⏳ még nincs |

Weben is elérhető (a mobil mellett): mese írása (UC-04), fotó feltöltése (UC-05), Mi mozogjon? törléssel
és összevonással (UC-06), Életre kel! (UC-07). Ütközéskezelés (verziószám), offline szövegmentés,
5 mp-ig visszavonható oldaltörlés.
