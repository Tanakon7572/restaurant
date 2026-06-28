# Menu Options & Delivery-App Ordering Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a menu option/modifier system (required choices, optional toppings with prices, variants) and rebuild the ordering flow (browse → item detail with options → cart → submit → track) for both customers (`/q`) and staff (`/orders/new`), with admin management and kitchen/receipt display of selected options.

**Architecture:** Add `OptionGroup` / `OptionChoice` / `OrderItemOption` Prisma models. Factor all order pricing + validation into a single server-authoritative helper `src/lib/order.ts` used by both the public and admin order POST routes. Frontend reuses the existing terracotta theme and CSS component classes; the "delivery-app" feel comes from a shared item-detail bottom-sheet + cart pattern, not a new visual language.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 7.6 + `@prisma/adapter-pg`, PostgreSQL (Supabase). Tests: Vitest (added as devDependency) for the pure pricing/validation helper only.

---

## File Structure

**Created:**
- `src/lib/order.ts` — pure pricing + validation helper (cart line → priced order item). No DB calls; takes menu data + selections, returns priced items or validation error.
- `src/lib/order.test.ts` — Vitest unit tests for `order.ts`.
- `src/lib/types.ts` — shared TS types for menu-with-options and cart lines (client + server).
- `src/app/api/option-groups/route.ts` + `src/app/api/option-groups/[id]/route.ts` — admin CRUD for option groups.
- `src/app/api/option-choices/route.ts` + `src/app/api/option-choices/[id]/route.ts` — admin CRUD for option choices.
- `src/components/ItemOptionSheet.tsx` — shared bottom-sheet: option groups (radio/checkbox) + qty + note + add-to-cart. Used by `/q` and `/orders/new`.
- `src/components/Cart.tsx` — shared cart line list + total (presentational; state owned by page).
- `src/lib/cart.ts` — pure client cart helpers (line key, add, update qty, remove, totals).
- `vitest.config.ts` — minimal Vitest config.

**Modified:**
- `prisma/schema.prisma` — add 3 models + relations.
- `src/app/api/public/menu/route.ts` — include option groups/choices.
- `src/app/api/public/orders/route.ts` — use `order.ts` helper + create options.
- `src/app/api/orders/route.ts` — use `order.ts` helper + create options (POST).
- `src/app/api/orders/[id]/route.ts` — include `items.options` in GET.
- `src/app/api/public/orders/[id]/route.ts` — include `items.options`.
- `src/app/api/public/kitchen/route.ts` — include `items.options`.
- `src/app/q/page.tsx` — rebuild ordering flow.
- `src/app/orders/new/page.tsx` — rebuild ordering flow (POS).
- `src/app/menu/page.tsx` — per-item option group/choice management UI.
- `src/app/orders/[id]/page.tsx` — render options under each line.
- `src/app/kitchen/page.tsx` — render options under each line.
- `package.json` — add `vitest` devDependency + `test` script.

---

## Phase 1 — Schema & Pricing Helper

### Task 1: Add Prisma models for options

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models + relations**

Add to `MenuItem` (inside the model, after `orderItems`):
```prisma
  optionGroups OptionGroup[]
```

Add to `OrderItem` (after `note`):
```prisma
  options    OrderItemOption[]
```

Append new models at end of file:
```prisma
model OptionGroup {
  id         Int            @id @default(autoincrement())
  menuItemId Int
  menuItem   MenuItem       @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  name       String
  required   Boolean        @default(false)
  minSelect  Int            @default(0)
  maxSelect  Int            @default(1)
  order      Int            @default(0)
  choices    OptionChoice[]
}

model OptionChoice {
  id         Int          @id @default(autoincrement())
  groupId    Int
  group      OptionGroup  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name       String
  priceDelta Float        @default(0)
  available  Boolean      @default(true)
  order      Int          @default(0)
}

model OrderItemOption {
  id          Int       @id @default(autoincrement())
  orderItemId Int
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  groupName   String
  choiceName  String
  priceDelta  Float     @default(0)
}
```

- [ ] **Step 2: Push schema + regenerate client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema." and client regenerated. (Requires `DATABASE_URL` in `.env`.)

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma && git commit -m "feat: add option group/choice/orderItemOption models"
```
(If repo is not git-initialized, skip commit steps throughout.)

---

### Task 2: Shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the types**

```typescript
export type OptionChoiceDTO = {
  id: number
  name: string
  priceDelta: number
  available: boolean
  order: number
}

export type OptionGroupDTO = {
  id: number
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  order: number
  choices: OptionChoiceDTO[]
}

export type MenuItemDTO = {
  id: number
  name: string
  price: number
  imageUrl: string | null
  optionGroups: OptionGroupDTO[]
}

export type MenuCategoryDTO = {
  id: number
  name: string
  order: number
  items: MenuItemDTO[]
}

// One configured line in the cart / order request
export type CartLine = {
  key: string            // stable identity: menuItemId + sorted choiceIds + note
  menuItemId: number
  name: string           // snapshot for display
  basePrice: number
  quantity: number
  note: string | null
  optionChoiceIds: number[]
  // display-only snapshot of chosen options
  choices: { groupName: string; choiceName: string; priceDelta: number }[]
  unitPrice: number      // basePrice + Σ priceDelta (display; server recomputes)
}

// Wire format sent to order POST endpoints
export type OrderItemInput = {
  menuItemId: number
  quantity: number
  note?: string | null
  optionChoiceIds?: number[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts && git commit -m "feat: shared menu/option/cart types"
```

---

### Task 3: Pricing + validation helper (TDD)

**Files:**
- Create: `src/lib/order.ts`
- Test: `src/lib/order.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Vitest + test script**

In `package.json` `devDependencies` add `"vitest": "^3.2.4"`, and in `scripts` add `"test": "vitest run"`. Then run `npm install`.

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 2: Write the failing test**

`src/lib/order.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { priceOrderItems, type MenuItemForPricing } from './order'

const steak: MenuItemForPricing = {
  id: 1, name: 'ข้าวหน้าเนื้อ', price: 199,
  optionGroups: [
    { id: 10, name: 'ระดับความสุก', required: true, minSelect: 1, maxSelect: 1,
      choices: [
        { id: 100, name: 'แรร์', priceDelta: 0, available: true },
        { id: 101, name: 'เวลดัน', priceDelta: 0, available: true },
      ] },
    { id: 11, name: 'ท็อปปิ้ง', required: false, minSelect: 0, maxSelect: 10,
      choices: [
        { id: 110, name: 'ไข่ดอง', priceDelta: 30, available: true },
        { id: 111, name: 'เนื้อสไลด์', priceDelta: 129, available: false },
      ] },
  ],
}

const menu = new Map([[1, steak]])

it('prices base + selected option deltas', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 2, optionChoiceIds: [100, 110] }], menu)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.items[0].price).toBe(229)        // 199 + 30
  expect(r.totalPrice).toBe(458)            // 229 * 2
  expect(r.items[0].options).toEqual([
    { groupName: 'ระดับความสุก', choiceName: 'แรร์', priceDelta: 0 },
    { groupName: 'ท็อปปิ้ง', choiceName: 'ไข่ดอง', priceDelta: 30 },
  ])
})

it('rejects when required group missing', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [110] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects when exceeding maxSelect', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 101] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unavailable choice', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 111] }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unknown menu item', () => {
  const r = priceOrderItems([{ menuItemId: 999, quantity: 1 }], menu)
  expect(r.ok).toBe(false)
})

it('rejects unknown choice id', () => {
  const r = priceOrderItems([{ menuItemId: 1, quantity: 1, optionChoiceIds: [100, 555] }], menu)
  expect(r.ok).toBe(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `priceOrderItems` not found.

- [ ] **Step 4: Implement `src/lib/order.ts`**

```typescript
import type { OrderItemInput } from './types'

export type ChoiceForPricing = { id: number; name: string; priceDelta: number; available: boolean }
export type GroupForPricing = {
  id: number; name: string; required: boolean; minSelect: number; maxSelect: number
  choices: ChoiceForPricing[]
}
export type MenuItemForPricing = {
  id: number; name: string; price: number; optionGroups: GroupForPricing[]
}

export type PricedOption = { groupName: string; choiceName: string; priceDelta: number }
export type PricedItem = {
  menuItemId: number; itemName: string; quantity: number; price: number
  note: string | null; options: PricedOption[]
}
export type PriceResult =
  | { ok: true; items: PricedItem[]; totalPrice: number }
  | { ok: false; error: string }

export function priceOrderItems(
  inputs: OrderItemInput[],
  menu: Map<number, MenuItemForPricing>,
): PriceResult {
  const priced: PricedItem[] = []
  let totalPrice = 0

  for (const input of inputs) {
    const item = menu.get(input.menuItemId)
    if (!item) return { ok: false, error: `ไม่พบเมนู (id ${input.menuItemId})` }

    const qty = Math.max(1, Math.floor(input.quantity || 1))
    const chosenIds = input.optionChoiceIds ?? []
    const chosenSet = new Set(chosenIds)

    // index choices across all groups of this item
    const choiceToGroup = new Map<number, { group: GroupForPricing; choice: ChoiceForPricing }>()
    for (const g of item.optionGroups)
      for (const c of g.choices) choiceToGroup.set(c.id, { group: g, choice: c })

    // every chosen id must belong to this item and be available
    for (const id of chosenIds) {
      const found = choiceToGroup.get(id)
      if (!found) return { ok: false, error: `ตัวเลือกไม่ถูกต้องสำหรับ "${item.name}"` }
      if (!found.choice.available) return { ok: false, error: `"${found.choice.name}" ไม่พร้อมจำหน่าย` }
    }

    // per-group min/max enforcement
    const options: PricedOption[] = []
    let delta = 0
    for (const g of item.optionGroups) {
      const picks = g.choices.filter(c => chosenSet.has(c.id))
      const min = g.required ? Math.max(1, g.minSelect) : g.minSelect
      if (picks.length < min) return { ok: false, error: `กรุณาเลือก "${g.name}"` }
      if (picks.length > g.maxSelect) return { ok: false, error: `"${g.name}" เลือกได้สูงสุด ${g.maxSelect}` }
      for (const c of picks) {
        delta += c.priceDelta
        options.push({ groupName: g.name, choiceName: c.name, priceDelta: c.priceDelta })
      }
    }

    const unit = item.price + delta
    totalPrice += unit * qty
    priced.push({
      menuItemId: item.id, itemName: item.name, quantity: qty, price: unit,
      note: input.note?.trim() ? input.note.trim() : null, options,
    })
  }

  return { ok: true, items: priced, totalPrice }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/order.ts src/lib/order.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: server-authoritative order pricing + validation helper"
```

---

## Phase 2 — APIs

### Task 4: Public menu includes options

**Files:**
- Modify: `src/app/api/public/menu/route.ts`

- [ ] **Step 1: Replace the item select to include groups/choices**

Change the `items` include to:
```typescript
        items: {
          where: { available: true },
          orderBy: { order: 'asc' },
          select: {
            id: true, name: true, price: true, imageUrl: true,
            optionGroups: {
              orderBy: { order: 'asc' },
              select: {
                id: true, name: true, required: true, minSelect: true, maxSelect: true, order: true,
                choices: {
                  orderBy: { order: 'asc' },
                  select: { id: true, name: true, priceDelta: true, available: true, order: true },
                },
              },
            },
          },
        },
```

- [ ] **Step 2: Verify**

Run: `npm run build` (type-check). Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/public/menu/route.ts && git commit -m "feat: public menu API returns option groups"
```

---

### Task 5: Order POST routes use the helper

**Files:**
- Modify: `src/app/api/public/orders/route.ts`
- Modify: `src/app/api/orders/route.ts`

- [ ] **Step 1: Add a DB→pricing loader (shared inline pattern)**

In both files, replace the body-parsing + manual pricing with this pattern. For `src/app/api/public/orders/route.ts` POST:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { priceOrderItems, type MenuItemForPricing } from '@/lib/order'
import type { OrderItemInput } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const { tableNumber, note, items } = await request.json() as
      { tableNumber?: string; note?: string; items: OrderItemInput[] }

    if (!items || items.length === 0)
      return NextResponse.json({ error: 'ต้องมีรายการอาหารอย่างน้อย 1 รายการ' }, { status: 400 })

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map(i => i.menuItemId) }, available: true },
      select: {
        id: true, name: true, price: true,
        optionGroups: {
          select: {
            id: true, name: true, required: true, minSelect: true, maxSelect: true,
            choices: { select: { id: true, name: true, priceDelta: true, available: true } },
          },
        },
      },
    })
    const menu = new Map<number, MenuItemForPricing>(menuItems.map(m => [m.id, m]))

    const result = priceOrderItems(items, menu)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    const order = await prisma.order.create({
      data: {
        tableNumber: tableNumber || null,
        note: note || null,
        totalPrice: result.totalPrice,
        items: {
          create: result.items.map(it => ({
            menuItemId: it.menuItemId,
            itemName: it.itemName,
            quantity: it.quantity,
            price: it.price,
            note: it.note,
            options: { create: it.options },
          })),
        },
      },
      include: { items: { include: { options: true } } },
    })

    return NextResponse.json({
      id: order.id, status: order.status, totalPrice: order.totalPrice,
      tableNumber: order.tableNumber,
      items: order.items.map(i => ({
        itemName: i.itemName, quantity: i.quantity, price: i.price,
        note: i.note, options: i.options,
      })),
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create order', detail: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Apply the same to admin POST**

In `src/app/api/orders/route.ts`, keep the existing `GET` unchanged. Replace `POST` with the same logic as Step 1 **except**: drop `available: true` from the `menuItem.findMany` where-clause (staff may order unavailable items), and return the full `order` object via `include: { items: { include: { options: true, menuItem: true } } }` (matches current admin return shape) — i.e. `return NextResponse.json(order, { status: 201 })`. Keep the `getSession()` guard at the top.

- [ ] **Step 3: Verify**

Run: `npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/public/orders/route.ts src/app/api/orders/route.ts
git commit -m "feat: order creation validates + prices options server-side"
```

---

### Task 6: Include options in order detail + kitchen GETs

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts`
- Modify: `src/app/api/public/orders/[id]/route.ts`
- Modify: `src/app/api/public/kitchen/route.ts`

- [ ] **Step 1: Add `options` to each `items` include**

In each file's order/orders query, change `items: { include: { menuItem: true } }` (or its select) so the items also include `options: true`. Example:
```typescript
items: { include: { menuItem: true, options: true } }
```
For routes using `select`, add `options: { select: { groupName: true, choiceName: true, priceDelta: true } }` and keep existing selected fields.

- [ ] **Step 2: Verify**

Run: `npm run build`. Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orders/[id]/route.ts src/app/api/public/orders/[id]/route.ts src/app/api/public/kitchen/route.ts
git commit -m "feat: order detail + kitchen APIs return selected options"
```

---

### Task 7: Admin option-group + option-choice CRUD APIs

**Files:**
- Create: `src/app/api/option-groups/route.ts`
- Create: `src/app/api/option-groups/[id]/route.ts`
- Create: `src/app/api/option-choices/route.ts`
- Create: `src/app/api/option-choices/[id]/route.ts`

- [ ] **Step 1: option-groups collection route**

`src/app/api/option-groups/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { menuItemId, name, required, minSelect, maxSelect, order } = await request.json()
  if (!menuItemId || !name?.trim())
    return NextResponse.json({ error: 'ต้องระบุเมนูและชื่อกลุ่มตัวเลือก' }, { status: 400 })
  const group = await prisma.optionGroup.create({
    data: {
      menuItemId, name: name.trim(),
      required: !!required,
      minSelect: Number(minSelect) || 0,
      maxSelect: Math.max(1, Number(maxSelect) || 1),
      order: Number(order) || 0,
    },
    include: { choices: true },
  })
  return NextResponse.json(group, { status: 201 })
}
```

- [ ] **Step 2: option-groups item route**

`src/app/api/option-groups/[id]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.required !== undefined) data.required = !!body.required
  if (body.minSelect !== undefined) data.minSelect = Number(body.minSelect) || 0
  if (body.maxSelect !== undefined) data.maxSelect = Math.max(1, Number(body.maxSelect) || 1)
  if (body.order !== undefined) data.order = Number(body.order) || 0
  const group = await prisma.optionGroup.update({
    where: { id: Number(id) }, data, include: { choices: true },
  })
  return NextResponse.json(group)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.optionGroup.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: option-choices collection route**

`src/app/api/option-choices/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupId, name, priceDelta, order } = await request.json()
  if (!groupId || !name?.trim())
    return NextResponse.json({ error: 'ต้องระบุกลุ่มและชื่อตัวเลือก' }, { status: 400 })
  const choice = await prisma.optionChoice.create({
    data: {
      groupId, name: name.trim(),
      priceDelta: Number(priceDelta) || 0,
      order: Number(order) || 0,
    },
  })
  return NextResponse.json(choice, { status: 201 })
}
```

- [ ] **Step 4: option-choices item route**

`src/app/api/option-choices/[id]/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.priceDelta !== undefined) data.priceDelta = Number(body.priceDelta) || 0
  if (body.available !== undefined) data.available = !!body.available
  if (body.order !== undefined) data.order = Number(body.order) || 0
  const choice = await prisma.optionChoice.update({ where: { id: Number(id) }, data })
  return NextResponse.json(choice)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.optionChoice.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm run build`. Expected: compiles.
```bash
git add src/app/api/option-groups src/app/api/option-choices
git commit -m "feat: admin CRUD for option groups + choices"
```

---

## Phase 3 — Shared Frontend Building Blocks

### Task 8: Client cart helpers (TDD)

**Files:**
- Create: `src/lib/cart.ts`
- Test: `src/lib/cart.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/cart.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { lineKey, addLine, cartTotal, type CartState } from './cart'
import type { CartLine } from './types'

const base = (over: Partial<CartLine> = {}): CartLine => ({
  key: '', menuItemId: 1, name: 'A', basePrice: 100, quantity: 1, note: null,
  optionChoiceIds: [110, 100], choices: [], unitPrice: 130, ...over,
})

it('lineKey is order-independent for choice ids', () => {
  expect(lineKey(1, [100, 110], null)).toBe(lineKey(1, [110, 100], null))
})

it('lineKey separates by note', () => {
  expect(lineKey(1, [100], 'no veg')).not.toBe(lineKey(1, [100], null))
})

it('addLine merges identical lines by quantity', () => {
  let s: CartState = []
  s = addLine(s, base({ quantity: 1 }))
  s = addLine(s, base({ quantity: 2 }))
  expect(s).toHaveLength(1)
  expect(s[0].quantity).toBe(3)
})

it('cartTotal sums unitPrice * quantity', () => {
  const s: CartState = [base({ key: 'k', quantity: 2, unitPrice: 130 })]
  expect(cartTotal(s)).toBe(260)
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/cart.ts`**

```typescript
import type { CartLine } from './types'

export type CartState = CartLine[]

export function lineKey(menuItemId: number, choiceIds: number[], note: string | null): string {
  const ids = [...choiceIds].sort((a, b) => a - b).join(',')
  return `${menuItemId}|${ids}|${note ?? ''}`
}

export function addLine(state: CartState, line: CartLine): CartState {
  const key = line.key || lineKey(line.menuItemId, line.optionChoiceIds, line.note)
  const normalized = { ...line, key }
  const idx = state.findIndex(l => l.key === key)
  if (idx === -1) return [...state, normalized]
  const next = [...state]
  next[idx] = { ...next[idx], quantity: next[idx].quantity + normalized.quantity }
  return next
}

export function setQuantity(state: CartState, key: string, quantity: number): CartState {
  if (quantity <= 0) return state.filter(l => l.key !== key)
  return state.map(l => (l.key === key ? { ...l, quantity } : l))
}

export function removeLine(state: CartState, key: string): CartState {
  return state.filter(l => l.key !== key)
}

export function cartTotal(state: CartState): number {
  return state.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
}

export function cartCount(state: CartState): number {
  return state.reduce((sum, l) => sum + l.quantity, 0)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart.ts src/lib/cart.test.ts
git commit -m "feat: pure client cart helpers"
```

---

### Task 9: `ItemOptionSheet` component

**Files:**
- Create: `src/components/ItemOptionSheet.tsx`

- [ ] **Step 1: Implement the bottom-sheet**

A controlled component. Props:
```typescript
type Props = {
  item: MenuItemDTO | null          // null = closed
  onClose: () => void
  onAdd: (line: CartLine) => void
}
```
Behavior:
- Renders a fixed full-width bottom-sheet overlay (reuse existing dialog animation classes `scale-in` / `overlayIn`; sheet uses `.glass-panel` surface, slides from bottom).
- Header: item name + close (✕) button.
- For each `optionGroups` (sorted by `order`): section label = group name; if `required` show a `.badge` "ต้องระบุ"; helper text "กรุณาเลือก N ข้อ" (required, maxSelect 1) or "เลือกสูงสุด {maxSelect} ข้อ" (multi).
  - `maxSelect === 1` → radio inputs (single select; selecting replaces).
  - `maxSelect > 1` → checkbox inputs; disable unchecked boxes once `picks.length === maxSelect`.
  - Each row shows choice name (left) and `+฿{priceDelta}` (right, only if `priceDelta > 0`; show `฿0` muted otherwise to match reference). Disabled style when `available === false`.
- Note `<textarea class="input">` with placeholder "เช่น ไม่เอาผัก".
- Footer (sticky): quantity stepper (− N +, min 1) + primary button "ใส่ตะกร้า ฿{runningTotal}". Button disabled while any required group unsatisfied.
- Local state: `selected: Record<groupId, number[]>`, `qty`, `note`.
- Running unit price = `item.price + Σ priceDelta of selected`; button total = `unitPrice * qty`.
- On add: build `CartLine` (use `lineKey` from `src/lib/cart.ts`; snapshot `choices` from selected; `unitPrice`), call `onAdd`, then `onClose`. Reset local state when `item` changes.

Validation helper inside component:
```typescript
const requiredOk = item ? item.optionGroups.every(g => {
  const picks = selected[g.id] ?? []
  const min = g.required ? Math.max(1, g.minSelect) : g.minSelect
  return picks.length >= min && picks.length <= g.maxSelect
}) : false
```

Full reference implementation:
```tsx
'use client'
import { useEffect, useState } from 'react'
import type { MenuItemDTO, CartLine } from '@/lib/types'
import { lineKey } from '@/lib/cart'

type Props = { item: MenuItemDTO | null; onClose: () => void; onAdd: (line: CartLine) => void }

export default function ItemOptionSheet({ item, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Record<number, number[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => { setSelected({}); setQty(1); setNote('') }, [item?.id])

  if (!item) return null

  const toggle = (g: MenuItemDTO['optionGroups'][number], choiceId: number) => {
    setSelected(prev => {
      const cur = prev[g.id] ?? []
      if (g.maxSelect === 1) return { ...prev, [g.id]: [choiceId] }
      if (cur.includes(choiceId)) return { ...prev, [g.id]: cur.filter(id => id !== choiceId) }
      if (cur.length >= g.maxSelect) return prev
      return { ...prev, [g.id]: [...cur, choiceId] }
    })
  }

  const allChosen = item.optionGroups.flatMap(g =>
    (selected[g.id] ?? []).map(id => {
      const c = g.choices.find(x => x.id === id)!
      return { groupName: g.name, choiceName: c.name, priceDelta: c.priceDelta }
    }))
  const delta = allChosen.reduce((s, c) => s + c.priceDelta, 0)
  const unitPrice = item.price + delta
  const requiredOk = item.optionGroups.every(g => {
    const n = (selected[g.id] ?? []).length
    const min = g.required ? Math.max(1, g.minSelect) : g.minSelect
    return n >= min && n <= g.maxSelect
  })

  const add = () => {
    const choiceIds = Object.values(selected).flat()
    const trimmed = note.trim() || null
    onAdd({
      key: lineKey(item.id, choiceIds, trimmed),
      menuItemId: item.id, name: item.name, basePrice: item.price,
      quantity: qty, note: trimmed, optionChoiceIds: choiceIds,
      choices: allChosen, unitPrice,
    })
    onClose()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet scale-in" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="ปิด">✕</button>
          <span className="page-title" style={{ fontSize: 'var(--text-lg)' }}>{item.name}</span>
        </div>
        <div className="sheet-body">
          {item.optionGroups.map(g => {
            const picks = selected[g.id] ?? []
            return (
              <div key={g.id} className="opt-group">
                <div className="opt-group-head">
                  <span className="section-label" style={{ margin: 0 }}>{g.name}</span>
                  {g.required && <span className="badge badge-pending">ต้องระบุ</span>}
                </div>
                <p className="opt-hint">
                  {g.maxSelect === 1 ? 'กรุณาเลือก 1 ข้อ' : `เลือกสูงสุด ${g.maxSelect} ข้อ`}
                </p>
                {g.choices.map(c => {
                  const checked = picks.includes(c.id)
                  const blocked = !checked && g.maxSelect > 1 && picks.length >= g.maxSelect
                  return (
                    <label key={c.id} className={`opt-row${!c.available ? ' opt-row-off' : ''}`}>
                      <input
                        type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                        name={`g${g.id}`} checked={checked}
                        disabled={!c.available || blocked}
                        onChange={() => toggle(g, c.id)} />
                      <span className="opt-name">{c.name}</span>
                      <span className="opt-price">{c.priceDelta > 0 ? `+฿${c.priceDelta}` : '฿0'}</span>
                    </label>
                  )
                })}
              </div>
            )
          })}
          <div className="opt-group">
            <span className="section-label">รายละเอียดเพิ่มเติม</span>
            <textarea className="input" rows={2} placeholder="เช่น ไม่เอาผัก"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="sheet-foot">
          <div className="qty-stepper">
            <button className="btn-icon btn-ghost" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span className="qty-n">{qty}</span>
            <button className="btn-icon btn-ghost" onClick={() => setQty(q => q + 1)}>+</button>
          </div>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!requiredOk} onClick={add}>
            ใส่ตะกร้า ฿{unitPrice * qty}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add sheet styles to `globals.css`**

Append:
```css
/* ─── Bottom sheet ──────────────────────────────────────── */
.sheet-overlay {
  position: fixed; inset: 0; z-index: 60;
  background: oklch(0.17 0.012 50 / 0.45);
  display: flex; align-items: flex-end; justify-content: center;
  animation: overlayIn 0.18s ease-out both;
}
.sheet {
  width: 100%; max-width: 600px; max-height: 92dvh;
  background: var(--c-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  display: flex; flex-direction: column; overflow: hidden;
}
.sheet-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--c-border);
}
.sheet-body { overflow-y: auto; padding: 8px 16px 16px; }
.sheet-foot {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-top: 1px solid var(--c-border);
  background: var(--c-surface);
}
.opt-group { padding: 14px 0; border-bottom: 1px solid var(--c-border); }
.opt-group:last-child { border-bottom: none; }
.opt-group-head { display: flex; align-items: center; gap: 8px; }
.opt-hint { font-size: var(--text-xs); color: var(--c-text-3); margin: 2px 0 8px; }
.opt-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 0; cursor: pointer;
}
.opt-row input { width: 20px; height: 20px; accent-color: var(--c-primary); flex-shrink: 0; }
.opt-name { flex: 1; font-size: var(--text-base); color: var(--c-text); }
.opt-price { font-variant-numeric: tabular-nums; color: var(--c-text-2); font-weight: 600; }
.opt-row-off { opacity: 0.4; }
.qty-stepper { display: flex; align-items: center; gap: 4px; }
.qty-n { min-width: 28px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Verify + commit**

Run: `npm run build`. Expected: compiles.
```bash
git add src/components/ItemOptionSheet.tsx src/app/globals.css
git commit -m "feat: shared item option bottom-sheet"
```

---

### Task 10: `Cart` component

**Files:**
- Create: `src/components/Cart.tsx`

- [ ] **Step 1: Implement presentational cart**

```tsx
'use client'
import type { CartLine } from '@/lib/types'
import { cartTotal } from '@/lib/cart'

type Props = {
  lines: CartLine[]
  onQty: (key: string, qty: number) => void
  onRemove: (key: string) => void
}

export default function Cart({ lines, onQty, onRemove }: Props) {
  if (lines.length === 0)
    return <p style={{ color: 'var(--c-text-3)', textAlign: 'center', padding: '32px 0' }}>ยังไม่มีรายการในตะกร้า</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map(l => (
        <div key={l.key} className="glass-panel" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span className="price-tag">฿{l.unitPrice * l.quantity}</span>
          </div>
          {l.choices.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
              {l.choices.map((c, i) => (
                <li key={i}>{c.choiceName}{c.priceDelta > 0 ? ` (+฿${c.priceDelta})` : ''}</li>
              ))}
            </ul>
          )}
          {l.note && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)', marginTop: 4 }}>📝 {l.note}</p>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div className="qty-stepper">
              <button className="btn-icon btn-ghost" onClick={() => onQty(l.key, l.quantity - 1)}>−</button>
              <span className="qty-n">{l.quantity}</span>
              <button className="btn-icon btn-ghost" onClick={() => onQty(l.key, l.quantity + 1)}>+</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onRemove(l.key)}>ลบ</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', fontWeight: 700 }}>
        <span>รวม</span><span className="price-tag-lg">฿{cartTotal(lines)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run build`. Expected: compiles.
```bash
git add src/components/Cart.tsx && git commit -m "feat: shared cart component"
```

---

## Phase 4 — Customer & POS Pages

### Task 11: Rebuild `/q` customer ordering

**Files:**
- Modify: `src/app/q/page.tsx`

- [ ] **Step 1: Rebuild around shared blocks**

Read the existing `src/app/q/page.tsx` first to preserve: table param handling, status-tracking view after submit, shop name fetch, and toast patterns. Then restructure the ordering portion:

- Fetch `/api/public/menu` → `MenuCategoryDTO[]` (now includes `optionGroups`).
- State: `cart: CartState` (from `src/lib/cart.ts`), `sheetItem: MenuItemDTO | null`, `activeCat`, `view: 'menu' | 'cart' | 'tracking'`.
- Persist cart to `localStorage` keyed by `cart:{table}` (load on mount, save on change) so a refresh mid-order doesn't lose it.
- **Menu view:** category tabs using `.scroll-x` chips (`activeCat`); item rows (photo thumb, name, price, `+` button). Tapping a row OR `+`:
  - If item has `optionGroups.length > 0` → open `ItemOptionSheet`.
  - Else → `addLine` directly with a no-option `CartLine` (unitPrice = price).
- `ItemOptionSheet` `onAdd` → `setCart(addLine(cart, line))` + toast "เพิ่มลงตะกร้าแล้ว".
- Floating cart bar (fixed bottom) showing `cartCount` + `cartTotal` → switches to **cart view**.
- **Cart view:** `<Cart>` with `setQuantity` / `removeLine`; back to menu; "ยืนยันสั่ง" button.
- Submit: POST `/api/public/orders` with `{ tableNumber, items: cart.map(l => ({ menuItemId, quantity, note, optionChoiceIds })) }`. On success: clear cart + localStorage, switch to **tracking view** (reuse existing status tracking UI).
- Map raw menu JSON to `MenuItemDTO` (ensure `optionGroups` defaults to `[]`).

- [ ] **Step 2: Manual verify**

Run: `npm run dev`, open `http://localhost:3000/q?table=1`. Confirm: menu loads, tapping an item with options opens the sheet, required-group blocks add, options affect price, cart accumulates, distinct options create separate lines, submit creates an order, tracking shows.

- [ ] **Step 3: Commit**

```bash
git add src/app/q/page.tsx && git commit -m "feat: rebuild customer QR ordering with options + cart"
```

---

### Task 12: Rebuild `/orders/new` POS ordering

**Files:**
- Modify: `src/app/orders/new/page.tsx`

- [ ] **Step 1: Rebuild around shared blocks**

Read existing `src/app/orders/new/page.tsx` first to preserve: search box, table-number input, session/redirect handling, and the BottomNav. Then:
- Fetch menu from the admin menu source. If no admin endpoint returns options, reuse `/api/public/menu` (it is session-agnostic) for the option data; keep existing search filtering over the flattened items.
- Use the same `ItemOptionSheet` + `cart` (`src/lib/cart.ts`) + `Cart` component as `/q`.
- Cart held in component state (no localStorage needed for staff).
- Submit: POST `/api/orders` with `{ tableNumber, note, items: cart.map(l => ({ menuItemId, quantity, note, optionChoiceIds })) }`. On success → redirect to `/orders/{id}` (preserve existing post-submit navigation).

- [ ] **Step 2: Manual verify**

Run: `npm run dev`, log in, open `/orders/new`. Confirm options sheet works, cart submits, redirect to order detail.

- [ ] **Step 3: Commit**

```bash
git add src/app/orders/new/page.tsx && git commit -m "feat: rebuild POS ordering with options + cart"
```

---

## Phase 5 — Admin Menu Options + Display

### Task 13: Manage option groups/choices in `/menu`

**Files:**
- Modify: `src/app/menu/page.tsx`

- [ ] **Step 1: Add per-item option management**

Read existing `src/app/menu/page.tsx` first (item CRUD + image upload patterns). Add, for each menu item, an expandable "ตัวเลือก" section:
- Fetch each item's groups. Simplest: extend the admin menu fetch to include `optionGroups { choices }` (modify `/api/menu-items` GET include) OR lazily fetch per item via a new `GET /api/option-groups?menuItemId=`. Choose extending the existing menu-items GET include to avoid an extra endpoint.
- UI per group: name, "ต้องระบุ" toggle (`required`), `minSelect`/`maxSelect` number inputs, delete; list of choices (name + `priceDelta` + available toggle + delete) + "เพิ่มตัวเลือก".
- "เพิ่มกลุ่มตัวเลือก" button → POST `/api/option-groups` with `menuItemId`.
- Choice add/edit/delete → `/api/option-choices` (POST) and `/api/option-choices/[id]` (PATCH/DELETE).
- Group edit/delete → `/api/option-groups/[id]` (PATCH/DELETE).
- Reuse existing `.btn`, `.input`, `ConfirmModal` for deletes.

- [ ] **Step 2: If extending menu-items GET — modify include**

In `src/app/api/menu-items/route.ts` GET, add to the item include/select:
```typescript
optionGroups: {
  orderBy: { order: 'asc' },
  include: { choices: { orderBy: { order: 'asc' } } },
},
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`, open `/menu`. Add a group "ระดับความสุก" (required, max 1) with choices; add "ท็อปปิ้ง" (max 10) with priced choices. Reload `/q` and confirm they appear in the sheet.

- [ ] **Step 4: Commit**

```bash
git add src/app/menu/page.tsx src/app/api/menu-items/route.ts
git commit -m "feat: admin manages menu option groups + choices"
```

---

### Task 14: Show options in order detail + kitchen

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`
- Modify: `src/app/kitchen/page.tsx`

- [ ] **Step 1: Render `item.options` + note under each line**

In both pages, where each order item row is rendered, add beneath the item name (when `item.options?.length`):
```tsx
{item.options?.length > 0 && (
  <ul style={{ listStyle: 'none', margin: '2px 0 0 0', paddingLeft: 8,
               fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>
    {item.options.map((o, i) => (
      <li key={i}>• {o.choiceName}{o.priceDelta > 0 ? ` (+฿${o.priceDelta})` : ''}</li>
    ))}
  </ul>
)}
{item.note && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--c-text-3)' }}>📝 {item.note}</p>}
```
Update the local TS type for an order item to include `options?: { groupName: string; choiceName: string; priceDelta: number }[]` and `note?: string | null`. For kitchen, keep its existing light theme styles — only add the indented options/note list.

- [ ] **Step 2: Manual verify**

Run: `npm run dev`. Create an order with options via `/q`; open `/orders/{id}` and `/kitchen`; confirm options + notes show under each item, and the receipt/print view includes them.

- [ ] **Step 3: Commit**

```bash
git add src/app/orders/[id]/page.tsx src/app/kitchen/page.tsx
git commit -m "feat: show selected options + notes in order detail and kitchen"
```

---

## Phase 6 — Final Verification

### Task 15: Full walkthrough + build

- [ ] **Step 1: Run unit tests**

Run: `npm test`. Expected: all pricing + cart tests PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`. Expected: compiles with no type errors.

- [ ] **Step 3: End-to-end manual test**

1. `/menu` — create item with required doneness group + optional toppings (priced) + required rice variant.
2. `/q?table=5` — order it: required groups enforced, price updates live, add to cart, add a second config of same item (separate line), submit.
3. `/orders` + `/orders/{id}` — order shows with options + correct total.
4. `/kitchen` — shows options under each line.
5. `/orders/new` — staff places an equivalent order; redirect to detail works.

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "chore: menu options + delivery-app ordering flow complete"
```

---

## Notes for the implementer

- **Server is the source of truth for price.** Never persist a client-sent price; `priceOrderItems` recomputes from DB every time.
- **Snapshots:** `OrderItemOption` stores names + priceDelta at order time, mirroring the existing `itemName` snapshot pattern — deleting a menu option must never corrupt history.
- **Theme:** do not introduce new colors. Reuse the existing CSS variables and component classes (`.btn`, `.glass-panel`, `.badge`, `.price-tag`, `.input`, `.chip`, `.scroll-x`).
- **Not a git repo?** The environment reported this project is not a git repository. If `git` commands fail, skip every commit step and proceed; the code changes are what matter.
- **DB access:** Tasks 1 + manual verifications need `DATABASE_URL` (Supabase pooler) in `.env`. If unavailable, complete all code + `npm run build` + `npm test`, and defer `prisma db push` + manual runs to an environment with DB access.
