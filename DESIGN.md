# Design System — Ember, in daylight

The look for a crepe & dessert café that runs its own floor. One token set, two
faces: a dense face for staff on a 6" handheld, and an airier, photo-led face
for guests on their own phone.

The design language is adopted from the POS reference deck the shop supplied
(`Downloads/POS System UI Design`, a Figma Make export). **Language only — the
existing work flow, routes, and components are unchanged.** What was taken,
what was rejected, and why is recorded below.

Supersedes the previous grey-canvas theme. `PRODUCT.md`'s "app is always dark"
line is **overridden** — the shop chose a light system in review on
2026-08-11.

---

## Where this came from

Two reference decks, both from the shop, both Figma Make exports.

The **first** (`POS System UI Design`) was a desktop till: sand ground, chilli
red, gold highlights. Its palette shipped and is now superseded.

The **second** (`POS System UI_UX Design`) is the one this system follows. It
is mobile-first, which matches the Sunmi handheld the shop actually uses, and
it is built on a dark warm ground with ember actions, amber figures, cards
tinted by status, and every number set in mono. The shop asked for it as a
light theme.

**Turning it over into daylight** meant inverting the ramp and moving each
accent down until it clears AA on a light ground. The hues are the deck's.

| Deck (dark) | Here (light) | Note |
|---|---|---|
| ground `#0E0C0A` | `#FAF7F2` | inverted |
| surface `#1A1714` | `#1A1714` as **ink** | the deck's surface makes a good warm black |
| ember `#E8541E` | `#C13F0C` | 3.44:1 on light → **4.93:1** |
| amber `#F2A830` | `#8F6006` | 1.89:1 → **5.11:1**, which is what finally lets amber set type |
| green `#4CAF82` | `#297A52` | 2.53:1 → **4.91:1** |
| red `#E84040` | `#C62828` | 3.75:1 → **5.26:1** |

Rejected from the deck:

- **Fraunces as the display face.** It has no Thai glyphs. The deck's Thai
  headings are a system serif fallback, not a design decision, so there was
  nothing there to adopt. Prompt carries display and body, per the shop.
- **Its type sizes.** Same reason as the first deck: they are set for a large
  screen and this ships to a 6" handheld.

---

## Two warm roles, not one

The previous palette used a single chilli red for both actions and prices, so
every price on the screen looked like a button. The deck separates them and
this keeps that separation:

- **Ember `#C13F0C`** — what you can press. Buttons, active tabs, the add
  control on a menu row.
- **Amber `#8F6006`** — what things cost. Prices, totals, money in reports.

Destructive intent stays separated by **form**, not only hue, because ember
and any danger red sit close together:

- `.btn-primary` — solid ember, 48px.
- `.btn-danger` — **outline**. Safe beside a primary.
- `.btn-danger-solid` — solid, only where it is the sole committed action.

---

## Color

| Token | Value | Job |
|---|---|---|
| `--c-bg` | `#FAF7F2` | The canvas |
| `--c-surface` | `#FFFFFF` | Cards, rows |
| `--c-surface-2` | `#F3EFE8` | Recessed, thumbnails |
| `--c-surface-3` | `#E8E2D8` | Pressed, empty seat dots |
| `--c-border` | `#DDD5C8` | Structure |
| `--c-border-2` | `#C3B9A8` | Control edges |
| `--c-text` | `#1A1714` | Ink |
| `--c-text-2` | `#4A423A` | Secondary |
| `--c-text-3` | `#6B6055` | Labels, meta |
| `--c-text-4` | `#95897B` | Decoration and disabled only — **never body text** |
| `--c-primary` | `#C13F0C` ember | Actions |
| `--c-accent` | `#8F6006` amber | Money |
| `--c-success` | `#297A52` | Free, completed |
| `--c-danger` | `#C62828` | Destructive, late, voided |
| `--c-info` | `#3D6288` | Preparing |

### Contrast — measured

Every text-carrying colour clears **4.5:1** on `--c-bg` and on `--c-surface`:

```
text 16.70 · text-2 9.22 · text-3 5.73
ember 4.93 · amber 5.11 · green 4.91 · danger 5.26
white on ember 5.27 · on amber 5.46 · on green 5.25 · on danger 5.62
badge on its own tint: ember 4.51 · amber 4.82 · green 4.51 · danger 4.70
```

`--c-text-4` at 3.20:1 is the one exception and is not for reading.

---

## Patterns taken from the deck

**Menu rows, not a photo grid.** Thumbnail, name, amber price, one 52px add
target. A row gives a Thai dish name its full width; the two-column grid was
truncating half this shop's names, which run long because they list their
fillings. The row and the button do the same thing — the button is the surer
aim, the row is the faster one.

**Status-tinted cards.** `.status-card` takes its border and badge colour
from a `--status` custom property, set by one of the `.s-*` classes. A floor
of tables reads at a glance without parsing labels. Nothing hard-codes a
state, so a new status is one class.

**Seat dots.** Filled and empty dots beside a count, so occupancy reads
without arithmetic.

**Figures in mono.** Prices, totals, elapsed times. A proportional face makes
a column of prices jitter row to row whatever `tabular-nums` claims.

---

## Type — two roles

| Role | Face | Token | Carries |
|---|---|---|---|
| Body & display | **Prompt** | `--font`, `--font-display` | Everything you read, headings included. 400/500/600/700 |
| Figures | **JetBrains Mono** | `--font-num` | Prices, totals, quantities. 500/700 |

Prompt was the shop's choice, replacing an earlier Anuphan + Noto Serif Thai
pairing. One voice across headings and text reads more settled on a till
screen than a serif fighting a sans; hierarchy comes from weight and size.

Monospaced figures stay, and are not decoration: prices sit in columns, and a
proportional face makes those columns jitter row to row no matter what
`tabular-nums` claims.

Both load through `next/font/google` in `layout.tsx`; verified present in the
installed Next with these weights and the `thai` subset (JetBrains Mono is
Latin-only by design — it never sets Thai).

| Token | px | Job |
|---|---|---|
| `--text-xs` | 13 | Badges, timestamps. **Floor — nothing smaller ships** |
| `--text-sm` | 15 | Option names, dense cells |
| `--text-base` | 17 | Body, buttons, inputs, menu card names |
| `--text-md` | 18 | Inline prices |
| `--text-lg` | 21 | Card prices, section headings |
| `--text-xl` | 26 | Page titles, cart total |
| `--text-2xl` | 32 | Kitchen order number |
| `--text-3xl` | 40 | Checkout grand total |

Thai stacks vowels above the line and tone marks above those, so a Thai glyph
needs more vertical room than a Latin one at the same px. The previous scale
was set as if it were Latin: body sat at 14.7px, option names at 11.5px, the
"หมด" badge at 9.9px.

**Weights.** 400 body · 500 names · 600 controls · 700 figures and totals.

---

## Form

**Radius** `4px` chips · `6px` controls · `8px` cards · `12px` sheets.

**Borders over shadows.** Structure comes from a visible 1px border on white
against sand. Shadow is reserved for things that genuinely float — sheets,
modals, the sticky cart bar.

**Touch.** `--tap-lg` 48px primary · `--tap` 44px standard · `--tap-sm` 40px ·
`--tap-xs` 34px floor. Sized for a thumb on a handheld held one-handed.

**State reads as form, not only colour.** Sold out is a solid berry chip *and*
a struck-through name *and* a desaturated photo.

---

## Two faces

Same tokens; the guest scope re-declares a few.

**Staff — dense.** 8px gutters, 2-up menu grid, cart bar pinned. Every screen
is a work surface.

**Customer (`.cust`) — open.** Applied in `src/app/q/layout.tsx` so all four of
that page's return paths inherit it. Larger photos, more air, body one step
up, because the guest is browsing on their own phone in unknown light rather
than working a rush. Before this scope existed, `/q` borrowed the staff classes
wholesale and showed a customer the back-office tool.

---

## Rules

1. **Nothing under 13px.** If a label will not fit at 13px, the layout is
   wrong, not the type size.
2. **Ember acts, amber costs.** Ember marks what you can press; amber marks
   money. Semantic colours are state. None of them are decoration.
3. **Status colour comes from `--status`**, set by an `.s-*` class. Never
   hard-code a state colour on a component.
4. **Destructive is outline unless it is the only committed action.**
5. **Never hard-code a colour or size** in a component. Missing token? Add it
   here first.
6. **Figures use `--font-num`.** If it sits in a column, it is monospaced.
7. **Check contrast before shipping a new colour**, on sand *and* on white.
