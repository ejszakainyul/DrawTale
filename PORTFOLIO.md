
# DrawTale – Projekt portfólió (nagy vonalakban)

> Forrás: `DrawTale_SRS_v2.0.docx`. A specifikáció még néhány ponton pontatlan, ezért ez a dokumentum szándékosan **nagy vonalakban** fogalmaz: iránytű, nem kőbe vésett terv. A részleteket építés közben pontosítjuk.
> Határidő: **2027. április** (az SRS-ben szereplő januári dátum már nem érvényes).
> Csapat: Cserép Zoltán Győző, Fazekas Krisztián Dániel, Winkler László · 13.A · Szoftverfejlesztő és -tesztelő

## 1. Az ötlet
A gyerek rajzol papírra → a szülő lefotózza → a szerver kivágja a figurákat → a figurák életre kelnek → lapozható, megosztható animált mesekönyv lesz belőle.

*(Nincs AI-rajzolás vagy AI-meseírás: a gyerek alkot, nem a gép.)*

## 2. Miből áll
| Rész | Technológia | Feladata |
|------|-------------|----------|
| Adatbázis | MySQL / MariaDB | Fiókok, mesék, rajzok, animációk, megosztások |
| Szerver | PHP (REST API) | Belépés, jogosultság, mesék, feltöltés, megosztás |
| Képfeldolgozó | Python + OpenCV | Figurák kivágása a fotóból |
| Web és lejátszó | HTML, CSS, JavaScript | Mesék lejátszása, megosztás, admin |
| Mobilapp | Android | Meseírás, fotózás, animálás, lejátszás |
| Animációs stúdió | Java (JavaFX) | Finomhangolás, rendezői mód |

Három kliens (mobil, web, stúdió), egy szerver, egy adatbázis. Az animáció videó helyett kis adatfájl (JSON), amit **egyetlen** lejátszó rajzol ki weben és mobilon is.

## 3. Prioritások
1. **ALAP** – ez nélkül nincs termék: regisztráció, mese írása, rajz feltöltése, automatikus kivágás, „Mi mozogjon?”, „Életre kel!”, lejátszás, megosztás linkkel.
2. **BŐVÍTETT** – ettől lesz kerek: animációs stúdió, QR-kód, admin, elemek javítása, offline mód.
3. **EXTRA** – ha marad idő: mesélő mód, hangok, PDF mesekártya.

Alapelv: **az ALAP mindig előbbre való**, a többi csak utána jön.

## 4. Szakaszok (április felé)
Pontos sprintek helyett négy nagy szakasz. A hosszuk később igazodik ahhoz, hol tartunk.

| Szakasz | Nagyjából mikor | Fókusz |
|---------|-----------------|--------|
| **1. Alapok** | október – november | Specifikáció tisztázása, adatbázis, szerver váza, belépés, animáció adatformátum rögzítése |
| **2. Fő útvonal** | november – január | Mesék, fotózás, feltöltés, kivágás, „Életre kel!”, lejátszó. **Cél: papírtól a mozgó meséig végigmegy** |
| **3. Bővítés** | január – március | Webes felület, megosztás, stúdió, majd a további BŐVÍTETT és EXTRA funkciók |
| **4. Lezárás** | március – április | Tesztelés, hibajavítás, dokumentáció, bemutató gyakorlása |

Ha a fő útvonal a 2. szakasz végére nem megy végig, a bővítést egyszerűsítjük (pl. a stúdió csak alap szinten készül el).

## 5. Munkamegosztás (javaslat, a csapat dönt)
| Szerep | Terület |
|--------|---------|
| Szerveres | Adatbázis, szerver, kivágó |
| Mobilos | Android app |
| Webes és stúdiós | Weboldal, lejátszó, JavaFX stúdió |
| Mindenki | Tesztelés, dokumentáció, bemutató, egymás kódjának átnézése |

Mindenki tudja az egész rendszert röviden elmondani.

## 6. Mit kell előbb tisztázni (pontatlan pontok)
Ezeket érdemes az elején eldönteni, mert mindhárom részt érintik:
- Az animáció adatformátuma (mit tárol egy oldal animációja)
- A szerver és a kliensek közti kapcsolat (API) alapjai és a hibaüzenetek formája
- Az adatbázis szerkezete
- A nyitott kérdések: Android nyelve (Java vagy Kotlin), hol fut a bemutató szerver, melyik mozgásminták legyenek az alapok
- Mi számít „késznek” az egyes funkcióknál
