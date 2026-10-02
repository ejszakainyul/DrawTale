# Az animáció adatformátuma (v1 – javaslat)

> Ez a fájl a portfólió 6. pontjában szereplő „animáció adatformátuma” kérdésre ad egy konkrét, kipróbált javaslatot.
> A webes lejátszó (`web/js/core/anim.js`, `web/js/player.js`) már pontosan ezt olvassa.
> Ha a csapat módosít rajta, a `format` mezőt növeljük, és ezt a fájlt is frissítjük.

Egy oldal animációja egyetlen JSON objektum (`page_animations.data`). A lejátszó élőben rajzolja ki, videó nem készül.

## Példa

```json
{
  "format": 1,
  "width": 1600,
  "height": 1200,
  "duration": 6.0,
  "loop": true,
  "background": "drawings/812/background.png",
  "tracks": [
    {
      "element": 3051,
      "name": "cica",
      "image": "drawings/812/el_3051.png",
      "w": 260, "h": 210,
      "pivot": [0.5, 0.5],
      "z": 1,
      "preset": "walk",
      "speed": "medium",
      "keyframes": [
        { "t": 0.0, "x": 420, "y": 820, "rot": 0,  "scale": 1.0 },
        { "t": 0.5, "x": 460, "y": 816, "rot": -5, "scale": 1.0 },
        { "t": 1.0, "x": 500, "y": 820, "rot": 5,  "scale": 1.0, "flipX": true }
      ]
    }
  ]
}
```

## Mezők

### Oldal szint

| Mező | Típus | Kötelező | Jelentés |
|------|-------|----------|----------|
| `format` | int | igen | A formátum verziója. Most `1`. (Nem azonos a `page_animations.version` ütközésfigyelő számmal!) |
| `width`, `height` | int | igen | A jelenet mérete pixelben = az eredeti rajz mérete. Minden koordináta ebben értendő. |
| `duration` | float (mp) | igen | Egy kör hossza. |
| `loop` | bool | nem (`true`) | A végén elölről kezdi-e. |
| `background` | string | nem | A háttérkép útvonala (a mozgó elemek helye papírszínnel kitöltve). |
| `tracks` | tömb | igen | Az elemek sávjai. Egy álló („háttér”) elem egyetlen kulcskockás sáv `preset: null`-lal – így akkor is jó, ha a háttérképből minden elemet kivettünk. Üres tömb = csak a háttér. |

### Sáv (track) – egy mozgó elem

| Mező | Típus | Kötelező | Jelentés |
|------|-------|----------|----------|
| `element` | int | igen | `drawing_elements.id` |
| `name` | string | nem | Megjelenített név („cica”). |
| `image` | string | igen | Az elem átlátszó hátterű PNG-je. |
| `w`, `h` | float | igen | Az elem mérete a jelenetben (alapból a befoglaló téglalap). |
| `pivot` | [float, float] | nem (`[0.5, 0.5]`) | A forgatás/méretezés középpontja az elemen belül, 0–1 között. Az `integet` mintánál `[0.5, 1]` (alsó közép). |
| `z` | int | nem (`0`) | Rajzolási sorrend; nagyobb = elöl. |
| `preset`, `speed` | string | nem | Csak tájékoztató: melyik mintából készült (a stúdió ezt mutatja). |
| `keyframes` | tömb | igen | Legalább 1 kulcskocka, `t` szerint növekvő sorrendben. |

### Kulcskocka

| Mező | Típus | Alap | Jelentés |
|------|-------|------|----------|
| `t` | float | – | Időpont másodpercben (0 … `duration`). |
| `x`, `y` | float | – | A **forgáspont** (pivot) helye a jelenetben. |
| `rot` | float | `0` | Forgatás fokban, óramutató szerint. |
| `scale` | float | `1` | Méretarány. |
| `sx`, `sy` | float | `1` | Külön vízszintes / függőleges nyújtás (pl. landoláskor „lapítás”). |
| `opacity` | float | `1` | Átlátszatlanság 0–1. |
| `flipX` | bool | `false` | Tükrözve rajzolja (megfordul a kép szélén). Nem interpolálódik: a kulcskockától érvényes. |
| `ease` | string | `"linear"` | Hogyan érkezik ide az előző kulcskockából: `linear`, `easeIn`, `easeOut`, `easeInOut`, `step` (ugrás, átmenet nélkül). |

## Lejátszás szabályai

1. Az aktuális idő `t = eltelt % duration` (ha `loop`), különben `min(eltelt, duration)`.
2. Az első kulcskocka előtt az elsőt, az utolsó után az utolsót mutatja.
3. Két kulcskocka között a számértékeket a második kocka `ease` függvénye szerint interpolálja.
4. Rajzolás: háttér → sávok `z` szerint → minden sávnál `translate(x, y) · rotate(rot) · scale(scale·sx·(flipX ? -1 : 1), scale·sy)`, majd a kép a pivothoz igazítva.
5. Ha egy oldalnak nincs animációja, a rajzot állóképként mutatja; ha rajz sincs, csak a szöveget.

## Mozgásminták (presetek)

A szerver (`POST /pages/{id}/animation/auto`) a mintákból kulcskockákat generál. A web demó módja ugyanezt a kódot használja (`web/js/core/anim.js` → `generatePresetTrack`), így a PHP változat ennek a pontos mása lehet. A mintákat úgy számoljuk, hogy a kör vége és eleje illeszkedjen (egész számú ismétlés a `duration` alatt), így a hurok nem „ugrik”.

| Kulcs | Név | Mit csinál |
|-------|-----|-----------|
| `bounce` | Ugrál | \|sin\| pálya felfelé, landoláskor rövid lapítás (`sx`/`sy`). |
| `float` | Lebeg | Lassú, kis kitérésű szinusz az y tengelyen. |
| `walk` | Sétál | Oda-vissza halad, ±5° billegés, a kép szélén megfordul (`flipX`). |
| `wave` | Integet | ±15° dőlés, forgáspont az alsó közép. |
| `pulse` | Lüktet | Méret 100% ↔ 110%. |
| `fly` | Repül | x egyenletesen nő, y szinusz; a jobb szélen kiröpül, balról visszajön (`step`). |
| `spin` | Pörög | 0° → 360°. |
| `enter` | Beúszik | A kép széléről lassulva érkezik a helyére, ott megáll. |

Sebesség: `slow` (×0,6), `medium` (×1), `fast` (×1,6).
