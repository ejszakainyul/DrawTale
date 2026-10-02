# API – amit a web elvár (javaslat a PHP szerverhez)

> A webes felület jelenleg a böngészőben futó **mock szerverrel** működik (`web/js/mock/server.js`).
> Ez a fájl leírja, pontosan milyen kéréseket küld és milyen válaszokat vár, így a PHP API
> ehhez igazodva készülhet el. Ha a szerver kész, a `web/js/config.js`-ben `mock: false`, és a web
> változtatás nélkül a valódi API-t használja.
>
> Alap: SRS 3.2.4 (végpontok), 3.2.5 (tokenek), 3.2.7 (hibaformátum), 8.2 (táblák).
> A **⚠ javaslat** jelölésűek nincsenek benne az SRS-ben, de a webnek kellenek.

## Általános szabályok

- Minden végpont `/api/v1` alatt, JSON (UTF-8), dátumok ISO 8601-ben (`2026-10-12T14:30:00Z`).
- Védett végpont: `Authorization: Bearer <accessToken>`.
- Sikeres válasz: a tartalom közvetlenül (pl. `{ "story": {…} }`), törlésnél `204` üres törzzsel.
- Hiba mindig így:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Ezt az oldalt közben máshol módosították…", "requestId": "7f3c9a1e", "details": { } } }
```

  A `message` magyar, a felhasználónak szól; a web változtatás nélkül kiírja. A `details` opcionális
  (mezőhibák: `{ "email": "…" }`, ütközésnél `{ "current": … }`).
- Lejárt access tokenre `401 TOKEN_EXPIRED` → a kliens csendben `POST /auth/refresh`, majd megismétli a kérést.
- Más felhasználó erőforrására **404** (nem 403), hogy azt se lehessen kitalálni, mi létezik (REQ-API-03, TC-05).

## Hitelesítés

| Kérés | Törzs | Válasz | Hibák |
|-------|-------|--------|-------|
| `POST /auth/register` | `{ email, password, display_name?, consent: true }` | `201 { user, accessToken, refreshToken }` | `422 CONSENT_REQUIRED`, `422 VALIDATION_FAILED`, `409 EMAIL_TAKEN` |
| `POST /auth/login` | `{ email, password }` | `200 { user, accessToken, refreshToken }` | `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS` (5 rossz → 15 perc), `403 ACCOUNT_BLOCKED` |
| `POST /auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` (a régi refresh token érvénytelen lesz) | `401 INVALID_REFRESH` |
| `POST /auth/logout` | `{ refreshToken }` | `204` | – |
| `POST /auth/forgot` | `{ email }` | `202 { ok: true }` – akkor is, ha nincs ilyen fiók | – |
| `POST /auth/reset` | `{ token, password }` | `200 { user, accessToken, refreshToken }`, minden más token visszavonva | `410 RESET_EXPIRED`, `422 VALIDATION_FAILED` |

A jelszó-visszaállító link formája: `https://…/reset.html#token=<token>` (a `#` miatt a token nem kerül szervernaplóba).

`user` = `{ id, email, display_name, role: "parent"|"admin", consent_at, created_at }`

## Fiók és gyerekek

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `GET /users/me` | – | `{ user }` |
| `PATCH /users/me` | `{ display_name? }` vagy `{ current_password, password }` | `{ user }` · `403 WRONG_PASSWORD` |
| `DELETE /users/me` | `{ password }` | `204` – megosztások visszavonva, tokenek törölve · `403 WRONG_PASSWORD` |
| `GET /children` | – | `{ children: [{ id, nickname, avatar, created_at }] }` |
| `POST /children` | `{ nickname, avatar }` | `201 { child }` · `422 TOO_MANY_CHILDREN` (max. 10) |
| ⚠ `PATCH /children/{id}` | `{ nickname?, avatar? }` | `{ child }` |
| ⚠ `DELETE /children/{id}` | – | `204` (a mesék megmaradnak, `child_profile_id = null`) |

Avatarok: `lion, cat, bear, fox, owl, frog, bunny, whale`.

## Mesék és oldalak

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `GET /stories` | – | `{ stories: [storySummary] }` |
| `POST /stories` | `{ title, child_profile_id? }` | `201 { story }` – egy üres oldallal |
| `GET /stories/{id}` | – | `{ story }` – oldalakkal |
| `PATCH /stories/{id}` | `{ title?, child_profile_id? }` | `{ story }` |
| `DELETE /stories/{id}` | – | `204` |
| `POST /stories/{id}/pages` | `{ text? }` | `201 { page }` (a végére kerül) |
| `PATCH /stories/{id}/pages/{pid}` | `{ text, version }` és/vagy `{ page_no }` | `{ page }` · `409 VERSION_CONFLICT` + `details.current` |
| `DELETE /stories/{id}/pages/{pid}` | – | `204`, a sorszámok újraszámozva |

```text
storySummary = { id, title, status: draft|in_progress|done, processing: bool, child_profile_id,
                 page_count, cover_page: page|null, created_at, updated_at }
story        = storySummary – cover_page + { pages: [page] }
page         = { id, story_id, page_no, text, version, updated_at, drawing: drawing|null,
                 animation: { data, version, updated_at } | null }
```

A mese állapota: `done`, ha minden oldalnak van animációja; `in_progress`, ha van rajz vagy animáció; különben `draft`.

## Rajzok és elemek

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `POST /pages/{id}/drawing` | `multipart/form-data`, mező: `photo` (JPG/PNG, max. 10 MB) | `202 { drawing }` 1 mp-en belül, `status: "uploaded"` · `422 UNSUPPORTED_FILE`, `413 FILE_TOO_LARGE` |
| `GET /drawings/{id}` | – | `{ drawing }` – a web 1,2 mp-enként kérdezi, amíg kész nem lesz |
| `PATCH /elements/{id}` | `{ label?, is_animated? }` | `{ element }` |
| `DELETE /elements/{id}` | – | `204` – az elem a `baked` listába kerül (a rajzon marad, de nem mozog) |
| `POST /elements/merge` | `{ ids: [a, b, …] }` | `201 { element }` – egy PNG a darabokból |

```text
drawing = { id, page_id, status: uploaded|processing|done|failed, error_code, width, height,
            original_url, background_url, elements: [element], baked: [element], created_at }
element = { id, image_url, bbox: { x, y, w, h }, label, is_animated, z_order }
```

`error_code`: `DRAWING_NO_ELEMENTS` (nem talált rajzot), `PROCESSING_FAILED` (3 próbálkozás után is hiba).
A `*_url` mezők a médiamappához képesti útvonalak (`DT_CONFIG.mediaBase` elé kerül).

> A web feltételezése: a háttérkép (`background_url`) **minden** kivágott elem helyét papírszínnel
> kitöltve tartalmazza, az álló („háttér”) elemeket pedig az animáció egy kulcskockás sávként rajzolja ki.
> Így a „mozog / háttér” átkapcsolásához nem kell új háttérképet számolni.

## Animáció

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `GET /presets` | – | `{ presets: [{ key, label, icon, hint }], speeds: ["slow","medium","fast"] }` |
| `POST /pages/{id}/animation/auto` | `{ speed, duration?, elements: [{ id, preset \| null }] }` | `{ animation: { data, version, updated_at } }` · `409 DRAWING_NOT_READY`, `422 UNKNOWN_PRESET` |
| `GET /pages/{id}/animation` | – | `{ animation }` · `404 NO_ANIMATION` |
| `PUT /pages/{id}/animation` | `{ data, version }` | `{ animation }` · `409 VERSION_CONFLICT`, `422 INVALID_ANIMATION` |

`data` formátuma: [`animation-format.md`](animation-format.md). A mozgásminták pontos számítása a
`web/js/core/anim.js`-ben van – a PHP változat ennek a mása legyen, a `tests/web/anim.test.js` esetei
jó kiindulópontok a PHPUnit tesztekhez.

## Megosztás

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `POST /stories/{id}/share` | `{ expires_in_days: 7 \| 30 \| null }` | `201 { share }` |
| ⚠ `GET /shares[?story=id]` | – | `{ shares: [share] }` – a „Megosztások” lista (UC-10, 4. lépés) |
| `DELETE /shares/{id}` | – | `204` |
| `GET /public/{token}` | – (token nélkül!) | `{ story: { title, child_nickname, child_avatar, pages: [{ page_no, text, drawing, animation: { data } }] } }` · `404 SHARE_UNAVAILABLE`, `429 TOO_MANY_REQUESTS` |

`share = { id, story_id, story_title, token, expires_at, revoked, active, view_count, created_at }`

A link: `https://…/view.html#t=<token>` – a token a `#` után van, így nem kerül a webszerver naplójába
és a `Referer` fejlécbe. A token legalább 32 véletlen bájt (base64url, 43 karakter – `share_links.token CHAR(43)`).

## Admin

| Kérés | Törzs | Válasz |
|-------|-------|--------|
| `GET /admin/users` | – | `{ users: [user + { is_blocked, deleted_at, story_count }] }` |
| `PATCH /admin/users/{id}` | `{ is_blocked }` | `{ user }` – tiltáskor minden token visszavonva |
| `GET /admin/jobs[?status=failed]` | – | `{ jobs: [{ id, type, ref_id, status, attempts, error_msg, created_at, updated_at, original_url, story_title, owner_email }] }` |
| `POST /admin/jobs/{id}/retry` | – | `202 { job }` · `409 JOB_NOT_FAILED` |
| `GET /admin/reports` | – | `{ reports: [{ date, new_users, uploads, cutouts_ok, cutouts_failed, partial? }], totals: { users, stories, shares } }` |
