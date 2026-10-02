# DrawTale 🎨✨

**Ahol a gyerekrajzok életre kelnek.**

A gyerek rajzol egy képet papírra, a szülő lefotózza, és pár perc múlva a rajzon lévő cica tényleg végigsétál a képernyőn – a közösen kitalált mese oldalain, egy lapozható, megosztható animált mesekönyvben.

> Vizsgaremek · Informatika és távközlés · Szoftverfejlesztő és -tesztelő · 13.A · 2026–27 · határidő: 2027. április

## Hogyan működik?
1. **Rajzolás és fotó:** a gyerek papírra rajzol, a szülő a mobilappal lefotózza.
2. **Kivágás:** a szerver a háttérben kivágja a figurákat (Python + OpenCV).
3. **Mi mozogjon?:** a szülő eldönti, melyik elem mozogjon, melyik maradjon háttér.
4. **Életre kel!:** egy gombnyomással a figurák ugrálnak, sétálnak, repülnek.
5. **Lejátszás és megosztás:** lapozós mesekönyv weben és mobilon, megosztás linkkel vagy QR-kóddal.

## Részek
| Rész | Technológia |
|------|-------------|
| Adatbázis | MySQL / MariaDB |
| Szerver (REST API) | PHP 8 |
| Képfeldolgozó | Python + OpenCV |
| Webes felület és lejátszó | HTML, CSS, JavaScript (canvas) |
| Mobilalkalmazás | Android |
| Animációs stúdió | Java (JavaFX) |

Az animáció nem videó, hanem kis JSON fájl, amit a lejátszó élőben rajzol ki.

## Mappák
```
database/   migrációk és demó adatok
server/     PHP API
imageproc/  Python kivágó
web/        weboldal és lejátszó  ✅ demó módban kész
docs/       formátumok, API leírás
mobile/     Android app
studio/     JavaFX stúdió
tests/      automatikus tesztek
```
> A mappák a fejlesztés során jönnek létre, szakaszonként (lásd a portfóliót).

## Indítás
🚧 A szerver, a kivágó, a mobilapp és a stúdió még készül.

**A webes felület már kipróbálható** – demó módban a böngésző játssza a szervert, így a teljes fő útvonal végigkattintható:

```bash
npx http-server web -p 8080   # majd: http://localhost:8080  ·  belépés: anna@demo.hu / demo1234
```

Részletek: [`web/README.md`](web/README.md).

## Dokumentáció
- [`DrawTale_SRS_v2.0.docx`](DrawTale_SRS_v2.0.docx) – a teljes szoftver igény specifikáció
- [`PORTFOLIO.md`](PORTFOLIO.md) – ki mit csinál, szakaszok, bemutató
- [`docs/animation-format.md`](docs/animation-format.md) – az animáció JSON formátuma (v1 javaslat)
- [`docs/api-web.md`](docs/api-web.md) – az API, ahogy a web használja (a PHP szerver ehhez igazodhat)

## Csapat
Cserép Zoltán Győző · Fazekas Krisztián Dániel · Winkler László
