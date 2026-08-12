# Design System — Sand Counter

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

## What came from the reference, and what did not

| Axis | Reference | Decision |
|---|---|---|
| Sand ground `#ece8e1` | ✔ | **Adopted.** The signature move: white cards separate against sand with no shadow |
| Ink `#201a16` | ✔ | **Adopted** unchanged |
| Chilli red `#c33d24` | ✔ | **Adopted, darkened** to `#BB3921` — the original was 4.28:1 on sand, under AA |
| Gold `#e0982a` | ✔ | **Adopted as fill only.** White on it is 2.42:1; it takes ink, never white |
| A distinct display face + mono figures | ✔ | **Adopted in principle, changed in practice.** The deck's Anuphan + Noto Serif Thai pairing was tried and then replaced with Prompt at the shop's request; mono figures stayed |
| ~8px radius, near-zero shadow | ✔ | **Adopted** |
| `--border: #e2d9cc` | ✘ | **Rejected** — 1.14:1 on sand, invisible. Promoted to the deck's own `border-strong` |
| `muted #857a6d` as body text | ✘ | **Rejected** at 3.44:1. Demoted to decoration; `#6E6356` carries text |
| No distinct danger colour | ✘ | **Rejected.** See "Two reds" below |
| `text-xs` ×27, `text-[11px]` ×8, `text-[8px]` | ✘ | **Rejected.** The deck targets a desktop till; this ships to a 6" handheld |

The reference was not built to WCAG AA. Four of its colours fail. Everything
below was re-measured.

---

## Two reds — the one thing the reference gets wrong

The deck uses a single red for both the primary action and destructive intent.
Measured, its action red and any conventional danger red sit **24° apart** in
hue. On `orders/[id]` the "ปฏิเสธ" button sits directly beside a primary
action; two near-identical reds there is a mis-tap that voids a real order.

**The rule: destructive intent is separated by form, not only by hue.**

- `.btn-primary` — solid chilli red, 48px. The thing you meant to press.
- `.btn-danger` — **outline** berry. Safe to place next to a primary.
- `.btn-danger-solid` — solid berry, 48px. Only where the destructive action
  is the sole committed action, i.e. inside `ConfirmModal`.

---

## Color

| Token | Value | Job |
|---|---|---|
| `--c-bg` | `#ECE8E1` sand | The canvas |
| `--c-surface` | `#FFFFFF` | Cards |
| `--c-surface-2` | `#F6F3EE` | Recessed rows |
| `--c-surface-3` | `#E2DCD1` | Pressed states |
| `--c-border` | `#D0C4B2` | Structure |
| `--c-border-2` | `#B9AB93` | Control edges |
| `--c-text` | `#201A16` | Ink |
| `--c-text-2` | `#4A4139` | Secondary |
| `--c-text-3` | `#6E6356` | Labels, meta — lowest value that still passes AA |
| `--c-text-4` | `#857A6D` | Decoration and disabled only — **never body text** |
| `--c-primary` | `#BB3921` chilli | Actions and prices |
| `--c-accent` | `#E0982A` gold | Highlight fills — "แนะนำ", popular. **Ink on top, never white** |
| `--c-success` | `#2A7147` | Available, completed |
| `--c-warning` | `#8A5A08` | Pending |
| `--c-danger` | `#9B2140` berry | Destructive, sold out, voided |
| `--c-info` | `#3D6288` | Preparing |

### Contrast — measured, on both grounds

Every colour that carries text clears **4.5:1** on `--c-bg` and `--c-surface`:

```
text 14.09 · text-2 8.16 · text-3 4.80 · primary 4.62
success 4.84 · warning 4.85 · danger 6.40 · info 5.21
white on primary 5.64 · white on danger 7.82 · ink on gold 7.12
```

Two deliberate exceptions, both non-text:

- `--c-text-4` at 3.44:1 — decoration and disabled affordances only.
  Placeholders use `--c-text-3`.
- `--c-accent` gold at 1.98:1 as text — which is why it is a **fill token**.
  Gold never sets type; ink sits on it at 7.12:1.

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
2. **One action colour.** Chilli red marks what you can act on and what things
   cost. Gold highlights. Semantic colours are state. None of them are decoration.
3. **Gold never sets type.**
4. **Destructive is outline unless it is the only committed action.**
5. **Never hard-code a colour or size** in a component. Missing token? Add it
   here first.
6. **Figures use `--font-num`.** If it sits in a column, it is monospaced.
7. **Check contrast before shipping a new colour**, on sand *and* on white.
