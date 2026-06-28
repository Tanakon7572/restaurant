# Menu Options & Delivery-App Ordering Flow — Design

Date: 2026-06-27
Status: Approved

## Goal

Rebuild the ordering workflow across the whole system to work like a food-delivery
app (browse → item detail with options → cart → submit → track), and add a full
menu **option/modifier** system (required choice groups, optional multi-select
toppings with prices, required variants) as shown in the reference screenshots
(GrabFood/LineMan-style item detail).

Keep the existing visual identity and code conventions (light terracotta theme,
existing CSS component classes in `globals.css`). The "delivery-app" quality lives
in the **flow and option-selection UX**, not in a louder aesthetic. No extra
features beyond ordering-with-options (no payments, customer accounts, or delivery).

## Scope

Whole system:
- `/q` — customer QR ordering (rebuilt)
- `/orders/new` — staff POS ordering (same pattern)
- `/menu` — admin management of option groups/choices per item
- `/orders/[id]` + `/kitchen` — render selected options under each line item

## Data Model (Prisma)

New models:

```prisma
model OptionGroup {
  id         Int            @id @default(autoincrement())
  menuItemId Int
  menuItem   MenuItem       @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  name       String         // "ระดับความสุก", "ท็อปปิ้ง", "ตัวเลือกประเภทข้าว"
  required   Boolean        @default(false)
  minSelect  Int            @default(0)
  maxSelect  Int            @default(1)   // 1 = radio (single), >1 = checkbox (multi)
  order      Int            @default(0)
  choices    OptionChoice[]
}

model OptionChoice {
  id         Int          @id @default(autoincrement())
  groupId    Int
  group      OptionGroup  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name       String       // "แรร์", "ไข่ดองซีอิ๊วญี่ปุ่น"
  priceDelta Float        @default(0)     // 0 or e.g. 30, 129
  available  Boolean      @default(true)
  order      Int          @default(0)
}

model OrderItemOption {
  id          Int       @id @default(autoincrement())
  orderItemId Int
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  groupName   String    // snapshot
  choiceName  String    // snapshot
  priceDelta  Float     @default(0)       // snapshot
}
```

Relations added: `MenuItem.optionGroups OptionGroup[]`, `OrderItem.options OrderItemOption[]`.

Pricing convention:
- `OrderItem.price` = base item price + sum of selected `priceDelta` (per single unit).
- Existing `totalPrice = Σ price × quantity` math is unchanged.
- `OrderItemOption` rows snapshot group/choice names + priceDelta so deleting a
  menu option later never corrupts past orders (mirrors the existing `itemName`
  snapshot pattern).

`OrderItem.note` (existing) is reused for the free-text "รายละเอียดเพิ่มเติม".

## Validation rules (server-authoritative)

For each order item the server:
1. Re-fetches the menu item and its option groups/choices from DB.
2. Verifies every required group has between `minSelect` and `maxSelect` choices.
3. Verifies optional groups do not exceed `maxSelect`.
4. Verifies chosen choices belong to the item and are `available`.
5. Computes unit price = base + Σ chosen `priceDelta`. **Client price is ignored.**
6. On any violation → 400 with a Thai error message; no order is created.

## API Changes

- `GET /api/public/menu` — include `optionGroups` (with `choices`) for each item.
- `POST /api/public/orders` and `POST /api/orders` — accept items shaped as
  `{ menuItemId, quantity, note, optionChoiceIds: number[] }`. Apply validation +
  pricing above, create `OrderItemOption` snapshots.
- `GET /api/orders/[id]`, `GET /api/public/orders/[id]`, `GET /api/public/kitchen`
  — include `items.options` so detail, kitchen, and receipts show selections.
- Admin option management (session-protected):
  - `POST/PATCH/DELETE /api/option-groups` (+ `/[id]`) scoped to a menuItemId
  - `POST/PATCH/DELETE /api/option-choices` (+ `/[id]`) scoped to a groupId
  Shared pricing/validation logic factored into `src/lib/order.ts` so both order
  endpoints and any future caller stay consistent.

## Frontend

Shared building blocks (keep existing CSS classes, terracotta theme):
- **Menu list**: category tabs (`.scroll-x` chips) + item rows/cards with photo,
  name, price; best-seller-style accent optional but not required.
- **Item detail bottom-sheet**: option groups rendered as radio (maxSelect 1) or
  checkbox (maxSelect >1) with per-choice price; required badge ("ต้องระบุ");
  live running price; quantity stepper; note field; "ใส่ตะกร้า ฿X" CTA.
  Add-to-cart disabled until required groups satisfied.
- **Cart**: line items keyed by (menuItemId + sorted choiceIds + note); quantity
  edit/remove; total; submit.
- **Status tracking** (customer): unchanged conceptually, kept from current `/q`.

Pages:
- `/q` — rebuilt around the shared blocks; cart state in component (or
  localStorage keyed by table) ; submit to `/api/public/orders`.
- `/orders/new` — same blocks; submit to `/api/orders`.
- `/menu` — per item, manage option groups (name, required, min/max) and choices
  (name, priceDelta, available, order).
- `/orders/[id]` and `/kitchen` — list each item's selected options + note
  indented beneath the line.

## Non-goals

Payments, customer accounts, delivery/driver tracking, promotions, multi-language.

## Testing

- Server pricing/validation unit-tested via the shared `order.ts` helper
  (required-group enforcement, max-select enforcement, price computation, unknown
  choice rejection).
- Manual walkthrough: customer order with required doneness + toppings + rice,
  POS order, kitchen display shows options, order detail/receipt shows options.
