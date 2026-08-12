# Reference Port — Punch List

Honest state of the port from the shop's Figma Make reference deck
(`~/Downloads/POS System UI Design`) into this app, as of 2026-08-11.

**Rule for all of it:** the working flow, routes, API calls and component
ownership stay exactly as they are. Only the visual and interaction layer
changes. See `DESIGN.md` for the token system this all runs on.

---

## Before you touch anything

**Three** caches will make correct edits look like they did nothing. All three
bit this session; one nearly caused correct code to be rewritten.

The worst is the **service worker**. `public/sw.js` caches the app shell, so an
edited component or stylesheet keeps being served from `pos-v1-shell` no matter
what the dev server sends — and it re-registers on every page load, so clearing
it by hand does not stick. This is now fixed: `OfflineBar.tsx` only registers
the worker in production, and in development it unregisters any leftover copy
and deletes its caches. If you meet a browser tab that predates that fix, it is
still controlled by the old worker and its bundle has no unregister code —
close the tab, or run this in its console:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
caches.keys().then(ks => ks.forEach(k => caches.delete(k)))
```

The other two:

```bash
pkill -f "next dev"
rm -rf .next/dev        # Turbopack keeps a stale server build
npm run dev
```

A `Cache-Control: no-store` rule was tried in `next.config.ts` and then
removed — Next warns that a custom Cache-Control header can break dev
behaviour, and it was not what fixed anything. The service worker was. If a
change still will not appear, verify from outside the browser first:

```bash
curl -s localhost:3000/orders/new | grep -c 'ข้อความที่คาดว่าจะเจอ'
```

If the HTML has it and the screen does not, it is the browser. If the HTML
does not have it, it is the dev cache.

**Local database:** work against a local copy of the shop's Supabase, restored
with `pg_dump`, and set the admin password on that copy to whatever you like.
Never point `.env` at the live instance — the POS writes real bills.

---

## Done

| Piece | Where |
|---|---|
| Token system — sand palette, three type roles, AA-checked | `globals.css`, `DESIGN.md` |
| Dark 86px icon rail, 4 items + "เพิ่มเติม" popover | `PosShell.tsx`, `globals.css` |
| Underline category tabs with a count slot | `.seg`, `.seg-item`, `.seg-count` |
| Menu card composition — reserved 2-line name, mono price, sold-out veil, qty badge, "ขายดี" chip | `.menu-card*`, `.sold-veil` |
| Checkout — amount hero, payment tiles, cash keypad, change block | `checkout/page.tsx` |
| Order panel — table chips, net total | `orders/new/page.tsx` |
| Shop header — name + shift pill | `ShopHeader.tsx` |
| CSS ready but **not wired**: `.discount-chip` (gold), `.count-chip`, `.menu-card-hot`, `.menu-card-qty` | `globals.css` |

---

## Not done — 10 of 12 screens

Only `orders/new` and `checkout` have had composition work. Everything below
inherited the palette and type but keeps its original layout.

### Task A — wire the CSS that already exists

Cheapest wins; no new styles needed.

- [x] **Gold discount chips** in `checkout/page.tsx` — ไม่ลด / 5% / 10% / 20%, writing into the existing `discount` state. Which chip is lit is *derived* from the baht figure, so typing by hand clears it instead of leaving a wrong one on.
- [x] **`.count-chip`** — item counts beside category and sub-category names in `menu/page.tsx`.
- [x] **`.seg-count`** — counts inside the category tabs in `MenuBrowser.tsx`.
- [x] **`.sold-veil`** — sold-out now reads across the whole photo; the second bright "+" button became a quiet "ตัวเลือก".
- [ ] **`.menu-card-qty`** — how many of an item are already on the ticket. Needs the cart passed into `MenuBrowser`.
- [ ] **`.menu-card-hot`** — a "ขายดี" chip. **There is no popularity field in the schema.** Do not invent one; either derive it from order history or drop the chip.

### Task A2 — done alongside

- [x] Rail cut from 9 buttons to 4 + a "เพิ่มเติม" popover (`PosShell.tsx`).
- [x] **BottomNav** cut from 6 to 4 + a "เพิ่มเติม" sheet that opens upward (`BottomNav.tsx`). This is the one the Sunmi actually uses.
- [x] Rail wordmark fixed — the label was a bare text node, so hiding "the text" hid the mark instead.
- [x] `ShopHeader` on `orders/new`: shop name in serif, shift pill.
- [x] Table chips and the mono net total in the order panel.

### Task B — screens with no composition work yet

- [ ] `menu/page.tsx` (1,057 lines — the heaviest) — category sections, inline editors, the multi-select mode
- [ ] `orders/page.tsx` — the order list
- [ ] `orders/[id]/page.tsx` — order detail, status flow, the edit mode
- [ ] `kitchen/page.tsx` — the kitchen display. Reference has no equivalent; design from the same tokens
- [ ] `reports/page.tsx` — Z-report and the day summary
- [ ] `settings/page.tsx`
- [ ] `dashboard/page.tsx`
- [ ] `qr/page.tsx`
- [ ] `page.tsx` (login/home)

### Task C — the customer side

- [ ] `q/page.tsx` — has the `.cust` scope applied via `q/layout.tsx`, but the page still renders the staff card grid. The intended treatment (photo-led list, description lines, more air) exists only in the preview artifact, not in the app.

### Task D — the header, finished properly

- [ ] Move the search field out of `MenuBrowser` and into `ShopHeader`, so the shop name, shift pill and search sit on one bar as in the reference. This moves state ownership across components — do it deliberately, and keep the filtering behaviour identical.

### Task E — reference screens with no counterpart here

The deck has five screens this app does not: ผังโต๊ะ (floor plan), บิลย้อนหลัง,
สต๊อก, and its own รายงาน / ตั้งค่า layouts. **Do not build these** unless the
shop asks — they are features, not styling, and the brief was to keep the
existing flow.

---

## Known issues

- [x] Lint is back to the 5 errors that pre-date this work — the extra one was a redundant `useEffect` in `PosShell.tsx` closing the menu on pathname change, which the item handler already did.
- [x] `.ticket-net` and the table chips both render correctly; the earlier reports were screenshots taken before paint, not layout faults. Measured: rail padding 14px, more-button 14px clear of the bottom, 32/32 images loaded.
- [ ] The shop name wraps to two lines at 360px in `ShopHeader`, pushing the shift pill down. Consider dropping to `--text-md` under ~420px.
- [ ] `adminPassword` is stored and compared in plaintext (`src/lib/session.ts:33`). Security, not design — flagged for whenever it gets scheduled.

## A lesson worth keeping

Three times this session a correct edit looked like it had done nothing, and
the reflex was to rewrite the code. Every time the code was already right. The
check that settles it in one step, before touching anything:

```js
getComputedStyle(document.querySelector('.the-thing')).theProperty
```

If the file says one value and the browser says another, it is a cache, not
your code.

## Verify like this

`tsc` and the test suite pass throughout, but neither one can see a layout. For
every screen you change:

1. `curl` the page and grep for the markup you expect
2. then look at it at **360px** (the Sunmi V3 handheld) **and** at 1440px
3. only then call it done
