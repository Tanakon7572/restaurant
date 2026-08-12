# Sunmi V3 Mix Handheld POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POS run on a Sunmi V3 Mix handheld — receipts, kitchen tickets and the Z-report print to the device's built-in 58mm thermal head with no print dialog, and every screen is usable one-handed at 360 CSS px.

**Architecture:** Slips stop being "HTML only". A slip is described once as a **structured line list** (`src/lib/slipLines.ts`), which two renderers consume: the existing HTML renderer (`receipt.ts`, still used by desktop Chrome and as the fallback) and a new **print-job renderer** (`printJob.ts`) that emits a JSON command list. `printBridge.ts` picks the target at call time — if `window.SunmiPrinter` is injected by the Android wrapper, the JSON goes native; otherwise the browser print dialog runs exactly as it does today. The Android wrapper is a thin WebView app that draws each text command onto a 384px-wide `Bitmap` with Android's own text stack (so Thai vowels and tone marks stack correctly — no ESC/POS codepage) and hands it to `printBitmap`, using the SDK's `printQRCode` for the PromptPay code.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest for the pure renderers. Android wrapper: Kotlin, WebView, Sunmi Printer SDK (`SunmiPrinterService`), Gradle KTS, minSdk 24 / targetSdk 34.

**Working notes before you start:**
- **Task 0, before anything else:** `npm install && npx prisma generate` in the working copy — `node_modules/` is absent, so no test, typecheck or lint command below runs until this is done. Skipping `prisma generate` produces a cascade of fake `@prisma/client has no exported member PrismaClient` errors.
- Working copy is `/Users/tanakon/Downloads/restaurant-main 2` (the 29 Jul copy — newer than the 22 Jul `Downloads/restaurant-main` next to it) and it is **not a git repository**. There are no commit steps below. Each task ends with a verification checkpoint instead: `npm test` and `npx tsc --noEmit`. If you want commits, run `git init` first and commit at each checkpoint.
- **Deploying:** the git repo that actually deploys is `Tanakon7572/restaurant` (Vercel, from `main`). Do not run git in `/Users/tanakon/Documents/untitled folder 4/restaurant-main` — it is on iCloud and git hangs there. Clone fresh to `/tmp`, copy the changed files over from this working copy, commit and push from the clone.
- There is no Android SDK, Gradle or `adb` on this machine. Phase 2 produces **source you can open in Android Studio** — it is not built or installed here. Task 9 is an on-device checklist for whoever has the handheld.
- Read `node_modules/next/dist/docs/` before touching anything under `src/app/` — per `AGENTS.md`, this Next version has breaking changes from training data. Phases 1 and 2 touch almost no Next API surface; Phase 3 touches `viewport` config, which you must confirm against the local docs.

---

## File Structure

**Created:**
- `src/lib/slipLines.ts` — the `Slip*` data types (moved out of `receipt.ts`) plus `itemLines()`, the one place that decides how an order's items break into printable rows, including the set-price reconciliation rule. Pure; no HTML, no DOM.
- `src/lib/slipLines.test.ts` — Vitest cover for `itemLines()`, especially the set reconciliation branch.
- `src/lib/printJob.ts` — `PrintCmd` / `PrintJob` types and the builders `receiptJob()`, `kitchenTicketJob()`. Pure; the wire format between web and Android.
- `src/lib/printJob.test.ts` — Vitest cover for the builders.
- `src/lib/printBridge.ts` — `hasNativePrinter()` and `printSlipJob()`. The only module that knows a native printer might exist.
- `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties` — Gradle project scaffolding.
- `android/app/build.gradle.kts` — app module, Sunmi SDK dependency.
- `android/app/src/main/AndroidManifest.xml` — single activity, portrait, no title bar.
- `android/app/src/main/java/com/foodorder/pos/MainActivity.kt` — WebView host, JS interface registration.
- `android/app/src/main/java/com/foodorder/pos/PrinterBridge.kt` — binds `SunmiPrinterService`, parses the job JSON, drives the printer.
- `android/app/src/main/java/com/foodorder/pos/SlipRenderer.kt` — draws text/row/item/rule commands onto a 384px `Bitmap`.
- `android/app/src/main/res/values/strings.xml`, `android/app/src/main/res/xml/network_security_config.xml` — app name, and cleartext allowance for a LAN-hosted server.
- `android/README.md` — how to set the server URL, build, install and verify on the device.

**Modified:**
- `src/lib/receipt.ts` — imports types and `itemLines()` from `slipLines.ts`, re-exports the types so existing importers do not change, and renders rows instead of computing them.
- `src/app/checkout/page.tsx:96-99` — build a job alongside the HTML, print through the bridge.
- `src/app/orders/[id]/page.tsx:405-425` — same, for the kitchen ticket.
- `src/app/reports/page.tsx:36-60,242` — add `closeSlipJob()` next to `closeSlipHtml()`, print through the bridge.
- `src/app/globals.css:185-186` — raise `.btn-sm` / `.btn-xs` to thumb-sized minimums.
- `src/app/layout.tsx:23-26` — lock the viewport for kiosk use.

---

## Phase 1 — Web: one slip description, two renderers

### Task 1: Extract the slip line model

**Files:**
- Create: `src/lib/slipLines.ts`
- Create: `src/lib/slipLines.test.ts`
- Modify: `src/lib/receipt.ts:1-73`

- [ ] **Step 1: Write the failing test**

Create `src/lib/slipLines.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { itemLines, type SlipItem } from './slipLines'

const plain: SlipItem = { itemName: 'ข้าวผัดกุ้ง', quantity: 2, price: 120 }

describe('itemLines', () => {
  it('emits one row per item with an extended price', () => {
    expect(itemLines([plain], true)).toEqual([
      { qty: '2×', name: 'ข้าวผัดกุ้ง', price: '240.00', indent: false },
    ])
  })

  it('drops the price column for kitchen tickets', () => {
    expect(itemLines([plain], false)).toEqual([
      { qty: '2×', name: 'ข้าวผัดกุ้ง', price: '', indent: false },
    ])
  })

  it('names a deleted menu item rather than printing a blank', () => {
    const gone: SlipItem = { itemName: '', quantity: 1, price: 50 }
    expect(itemLines([gone], true)[0].name).toBe('(ลบแล้ว)')
  })

  it('indents each chosen option under its item, priceless', () => {
    const withOption: SlipItem = {
      itemName: 'ชาเย็น', quantity: 1, price: 55,
      options: [{ groupName: 'ความหวาน', choiceName: 'หวานน้อย', priceDelta: 0 }],
    }
    expect(itemLines([withOption], true)).toEqual([
      { qty: '1×', name: 'ชาเย็น', price: '55.00', indent: false },
      { qty: '', name: '• หวานน้อย', price: '', indent: true },
    ])
  })

  it('prices each set part and reconciles when the parts do not sum to the set', () => {
    // Set sells for 150; parts are worth 100 + 80 = 180 on their own.
    const set: SlipItem = {
      itemName: 'เซ็ตคู่รัก', quantity: 1, price: 150,
      options: [
        { groupName: 'จานหลัก', choiceName: 'สเต๊กหมู', priceDelta: 0, unitPrice: 100 },
        { groupName: 'จานรอง', choiceName: 'สลัด', priceDelta: 0, unitPrice: 80 },
      ],
    }
    expect(itemLines([set], true)).toEqual([
      { qty: '1×', name: 'เซ็ตคู่รัก', price: '150.00', indent: false },
      { qty: '', name: '• สเต๊กหมู', price: '100.00', indent: true },
      { qty: '', name: '• สลัด', price: '80.00', indent: true },
      { qty: '', name: 'ราคาเซ็ต', price: '150.00', indent: true },
    ])
  })

  it('omits the reconciliation row when the parts already sum to the set price', () => {
    const set: SlipItem = {
      itemName: 'เซ็ตเดี่ยว', quantity: 1, price: 100,
      options: [{ groupName: 'จานหลัก', choiceName: 'ข้าวหมูกรอบ', priceDelta: 0, unitPrice: 100 }],
    }
    expect(itemLines([set], true).some(l => l.name === 'ราคาเซ็ต')).toBe(false)
  })

  it('carries a line note as its own indented row', () => {
    const noted: SlipItem = { itemName: 'ต้มยำ', quantity: 1, price: 90, note: 'ไม่ใส่ผักชี' }
    expect(itemLines([noted], true)[1]).toEqual({
      qty: '', name: '** ไม่ใส่ผักชี', price: '', indent: true,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/slipLines.test.ts`
Expected: FAIL — `Failed to resolve import "./slipLines"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/slipLines.ts`:

```ts
/**
 * A slip's item section, reduced to rows, before anything decides whether it
 * becomes HTML for a browser dialog or bitmap commands for the handheld's
 * built-in head. Both renderers read from here so a set can never reconcile
 * one way on paper and another way on screen.
 */

import { baht } from './print'

// Structural shapes only: these come off the API as JSON, where dates are
// strings, so nothing here may assume a Date instance.
export type SlipOption = {
  groupName: string; choiceName: string; priceDelta: number
  // Set parts only: what the part is worth on its own. Null for a chosen
  // option, whose price is already inside the line total.
  unitPrice?: number | null
}
export type SlipItem = {
  itemName: string; quantity: number; price: number
  note?: string | null; options?: SlipOption[]
}
export type SlipOrder = {
  id: number; dailyNumber?: number; tableNumber?: string | null
  customerName?: string | null; note?: string | null
  createdAt: string | Date; items: SlipItem[]
}
export type SlipBill = {
  id: number; tableNumber?: string | null
  subtotal: number; discount: number; discountNote?: string | null
  serviceCharge: number; vat: number; total: number
  method: string; received?: number | null; changeDue?: number | null
  createdAt: string | Date; orders: SlipOrder[]
}

/** One printable row. `price` is already formatted, or '' when there is none. */
export type SlipLine = { qty: string; name: string; price: string; indent: boolean }

/**
 * One row per line, then one per option beneath it.
 *
 * Options sit in rows of their own rather than inside the name cell so a set's
 * parts can carry a figure in the price column. A part's price is what it
 * costs on its own — the set is sold for whatever the shop set, which is not
 * always the sum — so when the two differ the set price is spelled out on a
 * closing row instead of leaving the customer to add up and disagree.
 */
export function itemLines(items: SlipItem[], withPrice: boolean): SlipLine[] {
  const out: SlipLine[] = []
  const sub = (name: string, price: string) =>
    out.push({ qty: '', name, price: withPrice ? price : '', indent: true })

  for (const i of items) {
    const options = i.options ?? []
    out.push({
      qty: `${i.quantity}×`,
      name: i.itemName || '(ลบแล้ว)',
      price: withPrice ? baht(i.price * i.quantity) : '',
      indent: false,
    })

    for (const o of options) {
      sub(`• ${o.choiceName}`, o.unitPrice != null ? baht(o.unitPrice * i.quantity) : '')
    }

    // The set's own price, with any chosen option stripped back out of it.
    const parts = options.filter(o => o.unitPrice != null)
    const partsSum = parts.reduce((s, o) => s + (o.unitPrice ?? 0), 0)
    const setPrice = i.price - options.reduce((s, o) => s + o.priceDelta, 0)
    if (withPrice && parts.length > 0 && partsSum !== setPrice) {
      sub('ราคาเซ็ต', baht(setPrice * i.quantity))
    }

    if (i.note) sub(`** ${i.note}`, '')
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/slipLines.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite `receipt.ts` to render from `itemLines`**

In `src/lib/receipt.ts`, replace lines 1-73 (the imports, the `Slip*` type block, and the whole `itemRows` function) with:

```ts
import { escapeHtml, baht } from './print'
import { itemLines, type SlipItem } from './slipLines'
import { METHOD_LABELS, type PaymentMethod } from './billing'
import type { ShopSettings } from './shopSettings'

// The slip data model lives in ./slipLines, where both renderers can reach it.
export type { SlipOption, SlipItem, SlipOrder, SlipBill } from './slipLines'

function thaiDateTime(at: string | Date): string {
  return new Date(at).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function itemRows(items: SlipItem[], withPrice: boolean): string {
  return itemLines(items, withPrice).map(l => `<tr>
      <td class="q">${escapeHtml(l.qty)}</td>
      <td${l.indent ? ' class="opt"' : ''}>${escapeHtml(l.name)}</td>
      ${withPrice ? `<td class="p">${escapeHtml(l.price)}</td>` : ''}
    </tr>`).join('')
}
```

Leave `moneyRow`, `receiptHtml` and `kitchenTicketHtml` (old lines 75-146) untouched.

> Note the behaviour change this makes deliberate: option rows are now escaped
> through the same path as item rows, and the indent moves from a nested `<td>`
> to the `opt` class on the name cell. The rendered slip is unchanged.

- [ ] **Step 6: Verify the whole suite and types still pass**

Run: `npm test`
Expected: PASS, all existing suites plus the 7 new tests.

Run: `npx tsc --noEmit`
Expected: no output.

---

### Task 2: The print job wire format

**Files:**
- Create: `src/lib/printJob.ts`
- Create: `src/lib/printJob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/printJob.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { receiptJob, kitchenTicketJob, type PrintCmd } from './printJob'
import { DEFAULT_SHOP_SETTINGS } from './shopSettings'
import type { SlipBill, SlipOrder } from './slipLines'

const settings = { ...DEFAULT_SHOP_SETTINGS, shopName: 'ครัวคุณแม่', receiptWidth: 58 }

const order: SlipOrder = {
  id: 7, dailyNumber: 12, tableNumber: 'A3', customerName: null, note: null,
  createdAt: '2026-08-11T03:00:00.000Z',
  items: [{ itemName: 'ผัดกะเพรา', quantity: 1, price: 80 }],
}

const bill: SlipBill = {
  id: 5, tableNumber: 'A3',
  subtotal: 80, discount: 0, serviceCharge: 0, vat: 0, total: 80,
  method: 'cash', received: 100, changeDue: 20,
  createdAt: '2026-08-11T03:05:00.000Z', orders: [order],
}

const texts = (cmds: PrintCmd[]) =>
  cmds.flatMap(c => (c.kind === 'text' ? [c.text] : c.kind === 'row' ? [c.left] : []))

describe('receiptJob', () => {
  it('carries the paper width from settings', () => {
    expect(receiptJob(bill, settings, null).widthMm).toBe(58)
  })

  it('leads with the shop name, centred and large', () => {
    const [first] = receiptJob(bill, settings, null).cmds
    expect(first).toEqual({ kind: 'text', text: 'ครัวคุณแม่', align: 'center', size: 'lg', bold: true })
  })

  it('prints the grand total as the largest row on the slip', () => {
    const total = receiptJob(bill, settings, null).cmds
      .find(c => c.kind === 'row' && c.left === 'รวมทั้งสิ้น')
    expect(total).toEqual({ kind: 'row', left: 'รวมทั้งสิ้น', right: '80.00', size: 'xl', bold: true })
  })

  it('shows cash received and change when the bill was paid in cash', () => {
    expect(texts(receiptJob(bill, settings, null).cmds)).toEqual(
      expect.arrayContaining(['รับเงิน', 'เงินทอน']),
    )
  })

  it('omits discount, service and VAT rows when they are zero', () => {
    const labels = texts(receiptJob(bill, settings, null).cmds)
    expect(labels).not.toEqual(expect.arrayContaining(['ส่วนลด']))
    expect(labels.some(l => l.startsWith('VAT'))).toBe(false)
  })

  it('appends a QR command only when a PromptPay payload is supplied', () => {
    expect(receiptJob(bill, settings, null).cmds.some(c => c.kind === 'qr')).toBe(false)
    const withQr = receiptJob(bill, settings, '00020101021229...6304ABCD').cmds
    expect(withQr.find(c => c.kind === 'qr')).toEqual({
      kind: 'qr', data: '00020101021229...6304ABCD', caption: 'สแกนเพื่อชำระเงิน',
    })
  })

  it('ends with a paper feed so the slip clears the head', () => {
    const cmds = receiptJob(bill, settings, null).cmds
    expect(cmds[cmds.length - 1]).toEqual({ kind: 'feed', lines: 4 })
  })
})

describe('kitchenTicketJob', () => {
  it('prints the daily order number at the largest size', () => {
    const cmds = kitchenTicketJob(order, 'ครัวคุณแม่', 58).cmds
    expect(cmds).toEqual(expect.arrayContaining([
      { kind: 'text', text: 'ออเดอร์ #12', align: 'center', size: 'xl', bold: true },
    ]))
  })

  it('never puts a price on a kitchen ticket', () => {
    const cmds = kitchenTicketJob(order, 'ครัวคุณแม่', 58).cmds
    const priced = cmds.filter(c => c.kind === 'item' && c.price !== '')
    expect(priced).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/printJob.test.ts`
Expected: FAIL — `Failed to resolve import "./printJob"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/printJob.ts`:

```ts
/**
 * A slip as commands rather than markup — the wire format the Android wrapper
 * reads. Kept deliberately dumb: no nesting, no styling beyond four sizes, so
 * the renderer on the far side is a loop and not a layout engine.
 *
 * Sizes map to points on the device, not to CSS. `md` is the body size.
 */

import { baht } from './print'
import { itemLines, type SlipBill, type SlipOrder } from './slipLines'
import { METHOD_LABELS, type PaymentMethod } from './billing'
import type { ShopSettings } from './shopSettings'

export type SlipAlign = 'left' | 'center' | 'right'
export type SlipSize = 'sm' | 'md' | 'lg' | 'xl'

export type PrintCmd =
  | { kind: 'text'; text: string; align?: SlipAlign; size?: SlipSize; bold?: boolean }
  | { kind: 'row'; left: string; right: string; size?: SlipSize; bold?: boolean }
  | { kind: 'item'; qty: string; name: string; price: string; indent: boolean }
  | { kind: 'rule' }
  | { kind: 'qr'; data: string; caption?: string }
  | { kind: 'feed'; lines: number }

export type PrintJob = { widthMm: number; cmds: PrintCmd[] }

function thaiDateTime(at: string | Date): string {
  return new Date(at).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const rule = (): PrintCmd => ({ kind: 'rule' })
const money = (left: string, value: number): PrintCmd =>
  ({ kind: 'row', left, right: baht(value) })

/** Multi-line shop header/footer text becomes one centred command per line. */
function lines(block: string, size: SlipSize = 'md'): PrintCmd[] {
  return block.split('\n').filter(l => l.trim() !== '')
    .map(l => ({ kind: 'text', text: l, align: 'center', size }) as PrintCmd)
}

function itemCmds(items: Parameters<typeof itemLines>[0], withPrice: boolean): PrintCmd[] {
  return itemLines(items, withPrice).map(l =>
    ({ kind: 'item', qty: l.qty, name: l.name, price: l.price, indent: l.indent }) as PrintCmd)
}

/**
 * Customer receipt. `qrPayload` is the raw PromptPay EMVCo string — the
 * printer draws the code itself, so nothing has to rasterise an SVG.
 */
export function receiptJob(
  bill: SlipBill, settings: ShopSettings, qrPayload: string | null,
): PrintJob {
  const items = bill.orders.flatMap(o => o.items)
  const method = METHOD_LABELS[bill.method as PaymentMethod] ?? bill.method
  const vatLabel = settings.vatMode === 'included'
    ? `VAT ${settings.vatRate}% (รวมในราคาแล้ว)`
    : `VAT ${settings.vatRate}%`

  const cmds: PrintCmd[] = [
    { kind: 'text', text: settings.shopName, align: 'center', size: 'lg', bold: true },
    ...(settings.receiptHeader ? lines(settings.receiptHeader) : []),
    rule(),
    { kind: 'row', left: `ใบเสร็จ #${bill.id}`, right: thaiDateTime(bill.createdAt), size: 'sm' },
    ...(bill.tableNumber ? [{ kind: 'row', left: 'โต๊ะ', right: bill.tableNumber } as PrintCmd] : []),
    { kind: 'row', left: 'ออเดอร์', right: bill.orders.map(o => `#${o.dailyNumber ?? o.id}`).join(' ') },
    rule(),
    ...itemCmds(items, true),
    rule(),
    money('รวมค่าอาหาร', bill.subtotal),
  ]

  if (bill.discount > 0) {
    cmds.push(money(`ส่วนลด${bill.discountNote ? ` (${bill.discountNote})` : ''}`, -bill.discount))
  }
  if (bill.serviceCharge > 0) {
    cmds.push(money(`ค่าบริการ ${settings.serviceChargeRate}%`, bill.serviceCharge))
  }
  if (bill.vat > 0) cmds.push(money(vatLabel, bill.vat))

  cmds.push(
    rule(),
    { kind: 'row', left: 'รวมทั้งสิ้น', right: baht(bill.total), size: 'xl', bold: true },
    rule(),
    { kind: 'row', left: 'ชำระโดย', right: method },
  )
  if (bill.received != null) cmds.push(money('รับเงิน', bill.received))
  if (bill.changeDue != null) cmds.push(money('เงินทอน', bill.changeDue))
  if (qrPayload) cmds.push({ kind: 'qr', data: qrPayload, caption: 'สแกนเพื่อชำระเงิน' })

  cmds.push(
    rule(),
    ...(settings.receiptFooter
      ? lines(settings.receiptFooter)
      : [{ kind: 'text', text: 'ขอบคุณที่ใช้บริการ', align: 'center' } as PrintCmd]),
    { kind: 'feed', lines: 4 },
  )
  return { widthMm: settings.receiptWidth, cmds }
}

/**
 * Kitchen ticket: no prices at all, big order number, options and notes shown
 * in full. What the line cook needs and nothing else.
 */
export function kitchenTicketJob(order: SlipOrder, shopName: string, widthMm: number): PrintJob {
  const cmds: PrintCmd[] = [
    { kind: 'text', text: shopName, align: 'center', bold: true },
    { kind: 'text', text: `ออเดอร์ #${order.dailyNumber ?? order.id}`, align: 'center', size: 'xl', bold: true },
    ...(order.tableNumber
      ? [{ kind: 'text', text: `โต๊ะ ${order.tableNumber}`, align: 'center', size: 'lg', bold: true } as PrintCmd]
      : []),
    ...(order.customerName
      ? [{ kind: 'text', text: order.customerName, align: 'center' } as PrintCmd]
      : []),
    { kind: 'text', text: thaiDateTime(order.createdAt), align: 'center', size: 'sm' },
    rule(),
    ...itemCmds(order.items, false),
  ]
  if (order.note) {
    cmds.push(rule(), { kind: 'text', text: `หมายเหตุ: ${order.note}`, bold: true })
  }
  cmds.push({ kind: 'feed', lines: 4 })
  return { widthMm, cmds }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/printJob.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Checkpoint**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type output.

---

### Task 3: The bridge that chooses a printer

**Files:**
- Create: `src/lib/printBridge.ts`

There is no unit test here on purpose: the module is four lines of branching over a global the test environment does not have, and asserting that a stub was called would test the stub. Task 9 verifies it on the device; Task 6 verifies the fallback in desktop Chrome.

- [ ] **Step 1: Write the implementation**

Create `src/lib/printBridge.ts`:

```ts
/**
 * One entry point for printing, two possible destinations.
 *
 * On a Sunmi handheld the wrapper app injects `window.SunmiPrinter`, and the
 * job goes straight to the built-in head — no dialog, no paper-size guessing.
 * Everywhere else (a desktop browser at the back office, a tablet on a
 * network printer) nothing changes: the existing hidden-iframe dialog runs.
 *
 * The HTML is passed as a thunk so the fallback markup is never built on the
 * handheld, where it would be thrown away.
 */

import { printSlip } from './print'
import type { PrintJob } from './printJob'

type NativePrinter = { print(job: string): void }

declare global {
  interface Window {
    SunmiPrinter?: NativePrinter
  }
}

export function hasNativePrinter(): boolean {
  return typeof window !== 'undefined' && typeof window.SunmiPrinter?.print === 'function'
}

export function printSlipJob(job: PrintJob, html: () => string): void {
  if (hasNativePrinter()) {
    try {
      window.SunmiPrinter!.print(JSON.stringify(job))
      return
    } catch (err) {
      // A dead printer service must not cost the cashier the slip: fall through
      // to the dialog rather than swallowing the print.
      console.error('native print failed, falling back to the browser dialog', err)
    }
  }
  printSlip(html(), job.widthMm)
}
```

- [ ] **Step 2: Checkpoint**

Run: `npx tsc --noEmit`
Expected: no output.

---

### Task 4: Route the customer receipt through the bridge

**Files:**
- Modify: `src/app/checkout/page.tsx:10,96-99`

- [ ] **Step 1: Add the imports**

In `src/app/checkout/page.tsx`, replace the line 10 import:

```ts
import { printSlip } from '@/lib/print'
```

with:

```ts
import { printSlipJob } from '@/lib/printBridge'
import { receiptJob } from '@/lib/printJob'
```

- [ ] **Step 2: Rewrite `printReceipt`**

Replace the whole `printReceipt` function (lines 92-99):

```ts
  function printReceipt(bill: SlipBill) {
    // The handheld draws the QR from the payload itself; the browser dialog
    // lifts the on-screen SVG instead, so the slip carries the exact code the
    // customer was shown.
    const payload = bill.method === 'promptpay' ? qrPayload : null
    printSlipJob(
      receiptJob(bill, settings, payload),
      () => {
        const qrSvg = bill.method === 'promptpay'
          ? document.querySelector('#promptpay-qr svg')?.outerHTML ?? null
          : null
        return receiptHtml(bill, settings, qrSvg)
      },
    )
  }
```

`qrPayload` is already computed in this component at line 81 and is in scope.

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no output. If it complains that `receiptHtml` is unused elsewhere, leave the import — it is used inside the thunk.

- [ ] **Step 4: Checkpoint**

Run: `npm test`
Expected: PASS.

---

### Task 5: Route the kitchen ticket and the Z-report through the bridge

**Files:**
- Modify: `src/app/orders/[id]/page.tsx:14,405-425`
- Modify: `src/app/reports/page.tsx:7,36-60,242`

- [ ] **Step 1: Kitchen ticket — swap the import**

In `src/app/orders/[id]/page.tsx`, replace the line 14 import:

```ts
import { printSlip } from '@/lib/print'
```

with:

```ts
import { printSlipJob } from '@/lib/printBridge'
import { kitchenTicketJob } from '@/lib/printJob'
```

- [ ] **Step 2: Kitchen ticket — build the order shape once, print twice**

Replace the body of `printKitchenTicket` (from `if (!order) return` through the closing `)` of the `printSlip` call) with:

```ts
    if (!order) return
    const slip = {
      id: order.id,
      dailyNumber: order.dailyNumber,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      note: order.note,
      createdAt: order.createdAt,
      items: order.items.map(i => ({
        itemName: i.itemName || i.menuItem?.name || '(ลบแล้ว)',
        quantity: i.quantity,
        price: i.price,
        note: i.note,
        options: i.options,
      })),
    }
    printSlipJob(
      kitchenTicketJob(slip, shopName, receiptWidth),
      () => kitchenTicketHtml(slip, shopName),
    )
```

- [ ] **Step 3: Kitchen ticket — make the paper width available**

This page currently only reads `shopName`. Find where `shopName` is loaded from settings in this component and load the width alongside it, defaulting the same way `DEFAULT_SHOP_SETTINGS` does:

```ts
  const [receiptWidth, setReceiptWidth] = useState(DEFAULT_SHOP_SETTINGS.receiptWidth)
```

and set it in the same `fetch('/api/settings')` handler that sets `shopName`:

```ts
      setReceiptWidth(data.receiptWidth ?? DEFAULT_SHOP_SETTINGS.receiptWidth)
```

Import the default if it is not already imported:

```ts
import { DEFAULT_SHOP_SETTINGS } from '@/lib/shopSettings'
```

- [ ] **Step 4: Z-report — swap the import**

In `src/app/reports/page.tsx`, replace the line 7 import:

```ts
import { printSlip, escapeHtml, baht } from '@/lib/print'
```

with:

```ts
import { escapeHtml, baht } from '@/lib/print'
import { printSlipJob } from '@/lib/printBridge'
import type { PrintCmd, PrintJob } from '@/lib/printJob'
```

- [ ] **Step 5: Z-report — add the job builder beside the HTML builder**

Directly after `closeSlipHtml` in `src/app/reports/page.tsx`, add:

```ts
// The same Z-report as `closeSlipHtml`, as commands for the handheld's head.
function closeSlipJob(r: Report, shopName: string, counted: number, widthMm: number): PrintJob {
  const diff = round2(counted - r.expectedCash)
  const row = (left: string, right: string): PrintCmd => ({ kind: 'row', left, right })
  const cmds: PrintCmd[] = [
    { kind: 'text', text: shopName, align: 'center', size: 'lg', bold: true },
    { kind: 'text', text: 'สรุปปิดรอบขาย', align: 'center', bold: true },
    { kind: 'text', text: r.date, align: 'center', size: 'sm' },
    { kind: 'rule' },
    row('จำนวนบิล', String(r.billCount)),
    row('ยอดขายรวม', baht(r.totalSales)),
    row('เฉลี่ยต่อบิล', baht(r.averageBill)),
    { kind: 'rule' },
    ...PAYMENT_METHODS.map(m =>
      row(`${METHOD_LABELS[m]} (${r.byMethod[m].count})`, baht(r.byMethod[m].amount))),
    { kind: 'rule' },
  ]
  if (r.discount > 0) cmds.push(row('ส่วนลดรวม', baht(r.discount)))
  if (r.serviceCharge > 0) cmds.push(row('ค่าบริการรวม', baht(r.serviceCharge)))
  if (r.vat > 0) cmds.push(row('VAT รวม', baht(r.vat)))
  cmds.push(
    row('บิลที่ยกเลิก', `${r.voided.count} (${baht(r.voided.amount)})`),
    row('ออเดอร์ที่ยกเลิก', String(r.cancelledOrders)),
    { kind: 'rule' },
    row('เงินสดที่ควรมี', baht(r.expectedCash)),
    row('เงินสดที่นับได้', baht(counted)),
    {
      kind: 'row', bold: true,
      left: diff === 0 ? 'ตรงพอดี' : diff > 0 ? 'เกิน' : 'ขาด',
      right: baht(Math.abs(diff)),
    },
    { kind: 'feed', lines: 4 },
  )
  return { widthMm, cmds }
}
```

- [ ] **Step 6: Z-report — print through the bridge**

At `src/app/reports/page.tsx:242`, replace:

```tsx
                  onClick={() => printSlip(closeSlipHtml(report, settings.shopName, Number(counted) || 0), settings.receiptWidth)}
```

with:

```tsx
                  onClick={() => {
                    const cash = Number(counted) || 0
                    printSlipJob(
                      closeSlipJob(report, settings.shopName, cash, settings.receiptWidth),
                      () => closeSlipHtml(report, settings.shopName, cash),
                    )
                  }}
```

- [ ] **Step 7: Checkpoint**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type output.

Run: `npm run lint`
Expected: no errors. `escapeHtml` must still be reported as used — it is, by `closeSlipHtml`.

---

### Task 6: Prove the fallback path is untouched

**Files:** none — this is a manual verification gate before the Android work starts.

- [ ] **Step 1: Start the app**

Run: `npm run dev`

- [ ] **Step 2: Check the receipt**

Open `http://localhost:3000/checkout` in desktop Chrome, take a table through to paid, press the print button.
Expected: the browser print dialog opens with the same 58mm slip as before this plan — shop name, items, options indented, total in the largest type. If a PromptPay bill, the QR is in the preview.

- [ ] **Step 3: Check the kitchen ticket and Z-report**

Open an order at `/orders/<id>` and print the kitchen ticket; open `/reports` and print the close slip.
Expected: both dialogs show the same slips as before.

- [ ] **Step 4: Confirm the bridge is dormant**

In the Chrome console run: `window.SunmiPrinter`
Expected: `undefined` — the desktop path never touches native code.

---

## Phase 2 — Android: the WebView wrapper

> **Read before starting:** the Sunmi Printer SDK artifact coordinates and
> service class names below follow Sunmi's published Android SDK. Confirm the
> current version and repository at <https://docs.sunmi.com/> before your first
> build — if the dependency does not resolve, that is the line to fix, not the
> Kotlin.

### Task 7: Gradle scaffolding and the WebView host

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle.properties`
- Create: `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/xml/network_security_config.xml`
- Create: `android/app/src/main/java/com/foodorder/pos/MainActivity.kt`

- [ ] **Step 1: Gradle project files**

`android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Sunmi publishes the printer SDK outside Maven Central.
        maven("https://jitpack.io")
    }
}
rootProject.name = "FoodOrderPOS"
include(":app")
```

`android/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
```

`android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

`android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.foodorder.pos"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.foodorder.pos"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // The POS server the wrapper loads. Change this, not the Kotlin.
        buildConfigField("String", "POS_URL", "\"https://your-pos.example.com\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    // Sunmi built-in printer. Verify the current coordinates in Sunmi's docs.
    implementation("com.sunmi:printerlibrary:1.0.18")
}
```

`android/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">Food Order POS</string>
</resources>
```

`android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Allows a plain-HTTP server on the shop's own LAN. Remove the domain
     entry once the POS is served over HTTPS. -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.0.0</domain>
    </domain-config>
</network-security-config>
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="false"
        android:label="@string/app_name"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/Theme.AppCompat.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 2: The activity**

`android/app/src/main/java/com/foodorder/pos/MainActivity.kt`:

```kotlin
package com.foodorder.pos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * The whole app: one full-screen WebView pointed at the POS, plus the printer
 * bridge the page calls as `window.SunmiPrinter.print(json)`.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var printer: PrinterBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        printer = PrinterBridge(this)
        printer.connect()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            // The POS keeps its offline queue in localStorage.
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Staff pinch-zooming the till by accident is worse than no zoom.
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.textZoom = 100

            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(printer, "SunmiPrinter")
        }
        setContentView(web)

        if (savedInstanceState == null) web.loadUrl(BuildConfig.POS_URL)
        else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // Back should walk the POS's own history, not drop staff to the launcher.
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        printer.disconnect()
        super.onDestroy()
    }
}
```

- [ ] **Step 3: Verify**

There is no Android toolchain on this machine, so nothing compiles here. Open `android/` in Android Studio; the project must sync without errors before Task 8. If `com.sunmi:printerlibrary` fails to resolve, fix the coordinates against Sunmi's docs and note the working version in `android/README.md`.

---

### Task 8: Render and print the job

**Files:**
- Create: `android/app/src/main/java/com/foodorder/pos/SlipRenderer.kt`
- Create: `android/app/src/main/java/com/foodorder/pos/PrinterBridge.kt`
- Create: `android/README.md`

- [ ] **Step 1: The renderer**

`android/app/src/main/java/com/foodorder/pos/SlipRenderer.kt`:

```kotlin
package com.foodorder.pos

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import org.json.JSONArray
import org.json.JSONObject

/**
 * Draws a slip's commands onto a bitmap the printer can take whole.
 *
 * Thai is drawn by Android's own text stack rather than sent as characters to
 * the print head: sara-am, tone marks and the two-level vowels stack correctly
 * here, and no printer codepage has to be guessed at. The cost is a raster
 * instead of text, which on a 58mm slip is under a second.
 */
object SlipRenderer {

    // 58mm of usable paper is 384 dots at the head's 203dpi; 80mm is 576.
    fun dotsFor(widthMm: Int): Int = if (widthMm >= 80) 576 else 384

    private const val PAD = 8f

    private fun sizePx(size: String?): Float = when (size) {
        "sm" -> 20f
        "lg" -> 32f
        "xl" -> 40f
        else -> 24f
    }

    private fun paintFor(size: String?, bold: Boolean): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        textSize = sizePx(size)
        typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    /**
     * Wrap `text` to `maxWidth` on whole words where it can, mid-word where it
     * cannot. Thai has no spaces, so the mid-word branch is the common one and
     * must not be treated as an edge case.
     */
    private fun wrap(text: String, paint: Paint, maxWidth: Float): List<String> {
        if (text.isEmpty()) return listOf("")
        if (paint.measureText(text) <= maxWidth) return listOf(text)

        val out = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            val fitted = paint.breakText(text, start, text.length, true, maxWidth, null)
            val hardEnd = start + fitted.coerceAtLeast(1)
            // Prefer the last space inside the run, if there is one worth using.
            val space = text.lastIndexOf(' ', hardEnd - 1)
            val end = if (space > start && hardEnd < text.length) space + 1 else hardEnd
            out.add(text.substring(start, end).trimEnd())
            start = end
        }
        return out
    }

    /**
     * Two passes over the same command list: measure to get the bitmap height,
     * then draw. `draw = null` means measure only.
     */
    private fun run(cmds: JSONArray, dots: Int, canvas: Canvas?): Int {
        val content = dots - PAD * 2
        var y = PAD

        for (i in 0 until cmds.length()) {
            val c = cmds.getJSONObject(i)
            when (c.optString("kind")) {
                "text" -> {
                    val p = paintFor(c.optString("size", "md"), c.optBoolean("bold"))
                    val align = c.optString("align", "left")
                    for (line in wrap(c.optString("text"), p, content)) {
                        y += -p.fontMetrics.top
                        canvas?.drawText(line, when (align) {
                            "center" -> PAD + (content - p.measureText(line)) / 2
                            "right" -> PAD + content - p.measureText(line)
                            else -> PAD
                        }, y, p)
                        y += p.fontMetrics.bottom + 2f
                    }
                }
                "row" -> {
                    val p = paintFor(c.optString("size", "md"), c.optBoolean("bold"))
                    val right = c.optString("right")
                    val rightW = p.measureText(right)
                    // The right cell never wraps — a total split over two lines
                    // is worse than a label clipped by a few dots.
                    val leftLines = wrap(c.optString("left"), p, content - rightW - 12f)
                    for ((n, line) in leftLines.withIndex()) {
                        y += -p.fontMetrics.top
                        canvas?.drawText(line, PAD, y, p)
                        if (n == 0) canvas?.drawText(right, PAD + content - rightW, y, p)
                        y += p.fontMetrics.bottom + 2f
                    }
                }
                "item" -> {
                    val p = paintFor("md", false)
                    val qty = c.optString("qty")
                    val price = c.optString("price")
                    val qtyW = 44f
                    val priceW = if (price.isEmpty()) 0f else p.measureText(price) + 8f
                    val indent = if (c.optBoolean("indent")) 16f else 0f
                    val nameX = PAD + qtyW + indent
                    val nameW = content - qtyW - indent - priceW
                    for ((n, line) in wrap(c.optString("name"), p, nameW).withIndex()) {
                        y += -p.fontMetrics.top
                        if (n == 0) {
                            if (qty.isNotEmpty()) canvas?.drawText(qty, PAD, y, p)
                            if (price.isNotEmpty()) {
                                canvas?.drawText(price, PAD + content - p.measureText(price), y, p)
                            }
                        }
                        canvas?.drawText(line, nameX, y, p)
                        y += p.fontMetrics.bottom + 2f
                    }
                }
                "rule" -> {
                    y += 6f
                    val p = Paint().apply {
                        color = Color.BLACK
                        strokeWidth = 2f
                        pathEffect = android.graphics.DashPathEffect(floatArrayOf(6f, 5f), 0f)
                    }
                    canvas?.drawLine(PAD, y, PAD + content, y, p)
                    y += 8f
                }
                // 'qr' and 'feed' are the printer's own commands, not drawn here.
            }
        }
        return (y + PAD).toInt()
    }

    /** Null when the command list draws nothing — an all-QR job, for instance. */
    fun render(cmds: JSONArray, widthMm: Int): Bitmap? {
        val dots = dotsFor(widthMm)
        val height = run(cmds, dots, null)
        if (height <= (PAD * 2).toInt()) return null
        val bmp = Bitmap.createBitmap(dots, height, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply { drawColor(Color.WHITE) }.also { run(cmds, dots, it) }
        return bmp
    }

    /** Split a job at each QR so text batches print as single bitmaps. */
    fun segments(cmds: JSONArray): List<Pair<String, Any>> {
        val out = mutableListOf<Pair<String, Any>>()
        var batch = JSONArray()
        for (i in 0 until cmds.length()) {
            val c = cmds.getJSONObject(i)
            when (c.optString("kind")) {
                "qr", "feed" -> {
                    if (batch.length() > 0) { out.add("draw" to batch); batch = JSONArray() }
                    out.add(c.optString("kind") to c)
                }
                else -> batch.put(c)
            }
        }
        if (batch.length() > 0) out.add("draw" to batch)
        return out
    }

    fun captionOf(cmd: JSONObject): String = cmd.optString("caption", "")
}
```

- [ ] **Step 2: The bridge**

`android/app/src/main/java/com/foodorder/pos/PrinterBridge.kt`:

```kotlin
package com.foodorder.pos

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.SunmiPrinterService
import org.json.JSONArray
import org.json.JSONObject

/**
 * What `window.SunmiPrinter` on the page actually reaches.
 *
 * The service binding is asynchronous and survives the whole session; a print
 * that arrives before the bind completes is refused loudly rather than
 * silently dropped, because a cashier who thinks a slip printed and finds it
 * did not is the failure that costs the shop money.
 */
class PrinterBridge(private val context: Context) {

    private var service: SunmiPrinterService? = null

    private val callback = object : InnerPrinterCallback() {
        override fun onConnected(s: SunmiPrinterService) {
            service = s
            runCatching { s.printerInit() }
        }
        override fun onDisconnected() {
            service = null
        }
    }

    fun connect() {
        runCatching { InnerPrinterManager.getInstance().bindService(context, callback) }
            .onFailure { Log.e(TAG, "printer bind failed", it) }
    }

    fun disconnect() {
        runCatching { InnerPrinterManager.getInstance().unBindService(context, callback) }
        service = null
    }

    /** Called from the page. `job` is a serialised PrintJob from printJob.ts. */
    @JavascriptInterface
    fun print(job: String) {
        val s = service
        if (s == null) {
            toast("เครื่องพิมพ์ยังไม่พร้อม")
            return
        }
        try {
            val parsed = JSONObject(job)
            val widthMm = parsed.optInt("widthMm", 58)
            val cmds = parsed.optJSONArray("cmds") ?: JSONArray()

            s.enterPrinterBuffer(true)
            for ((kind, payload) in SlipRenderer.segments(cmds)) {
                when (kind) {
                    "draw" -> SlipRenderer.render(payload as JSONArray, widthMm)
                        ?.let { s.printBitmap(it, null) }
                    "qr" -> {
                        val cmd = payload as JSONObject
                        s.setAlignment(1, null)
                        s.printQRCode(cmd.optString("data"), 6, 2, null)
                        s.lineWrap(1, null)
                        val caption = SlipRenderer.captionOf(cmd)
                        if (caption.isNotEmpty()) {
                            SlipRenderer.render(
                                JSONArray().put(
                                    JSONObject()
                                        .put("kind", "text")
                                        .put("text", caption)
                                        .put("align", "center"),
                                ),
                                widthMm,
                            )?.let { s.printBitmap(it, null) }
                        }
                        s.setAlignment(0, null)
                    }
                    "feed" -> s.lineWrap((payload as JSONObject).optInt("lines", 3), null)
                }
            }
            s.exitPrinterBuffer(true)
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            toast("พิมพ์ไม่สำเร็จ")
        }
    }

    private fun toast(msg: String) {
        android.os.Handler(context.mainLooper).post {
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    private companion object { const val TAG = "PrinterBridge" }
}
```

- [ ] **Step 3: The README**

`android/README.md`:

````markdown
# Food Order POS — Sunmi wrapper

A single-activity WebView that loads the POS and gives the page access to the
Sunmi handheld's built-in 58mm print head. Everything the staff see is the web
app; this project exists only so `window.SunmiPrinter.print(json)` reaches the
printer without a print dialog.

Target device: **Sunmi V3 Mix** (Android 13). Nothing here is device-specific
beyond the Sunmi printer SDK, so other V-series handhelds should work.

## Point it at your server

Edit `POS_URL` in `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "POS_URL", "\"https://your-pos.example.com\"")
```

If the server runs plain HTTP on the shop LAN, also put its address in
`app/src/main/res/xml/network_security_config.xml`. On HTTPS, delete that
domain entry.

## Build and install

```bash
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or open this folder in Android Studio and Run.

## If the SDK dependency will not resolve

`com.sunmi:printerlibrary` is published by Sunmi, not Maven Central, and the
version moves. Check <https://docs.sunmi.com/> for the current coordinates, or
drop Sunmi's `.aar` into `app/libs/` and swap the dependency for
`implementation(files("libs/<name>.aar"))`. Record whatever worked here.

## Kiosk mode

Sunmi devices ship with a device manager that can pin one app. Set Food Order
POS as the pinned app so staff cannot reach the launcher mid-service.

## The contract with the web app

The page sends a JSON `PrintJob` (see `src/lib/printJob.ts` in the web repo):

```json
{ "widthMm": 58, "cmds": [ { "kind": "text", "text": "ร้าน", "align": "center" } ] }
```

Command kinds: `text`, `row`, `item`, `rule`, `qr`, `feed`. Text is rasterised
by `SlipRenderer` using Android's font stack — Thai tone marks and stacked
vowels come out right, which they do not when characters are pushed to the head
through a codepage. QR codes use the printer's own `printQRCode`, so they stay
crisp.

If `window.SunmiPrinter` is missing, the web app falls back to the browser
print dialog on its own. Nothing in the page needs to know which device it is
on.
````

- [ ] **Step 4: Verify**

Sync and build in Android Studio. Expected: `assembleDebug` succeeds. Compile errors in `PrinterBridge.kt` almost certainly mean the SDK's class or method names differ from the version pinned here — fix against Sunmi's docs and update the README.

---

### Task 9: On-device verification

**Files:** none — run this with the handheld in hand.

- [ ] **Step 1: Bridge is live**

Install the APK, open the app, and connect Chrome DevTools over `chrome://inspect`. In the console run `window.SunmiPrinter`.
Expected: an object, not `undefined`.

- [ ] **Step 2: Kitchen ticket**

Open an order and print the kitchen ticket.
Expected: paper feeds with no dialog. Order number is the largest thing on the slip. **Check Thai carefully** — วรรณยุกต์ and สระบน must sit above their consonants, not beside them or clipped. Long item names wrap instead of being cut at the right edge.

- [ ] **Step 3: Cash receipt**

Take a table through checkout paying cash.
Expected: prices right-aligned in a straight column, `รวมทั้งสิ้น` largest, `รับเงิน` and `เงินทอน` present.

- [ ] **Step 4: PromptPay receipt with QR**

Set a PromptPay ID in `/settings`, then pay a bill by PromptPay.
Expected: a QR prints below the totals with `สแกนเพื่อชำระเงิน` under it. **Scan it with a real banking app** — the amount must match the bill exactly.

- [ ] **Step 5: A set item**

Print a receipt containing a set whose parts do not sum to the set price.
Expected: parts listed indented with their own prices, then a `ราคาเซ็ต` row.

- [ ] **Step 6: Z-report**

Close the day from `/reports` with a counted-cash figure.
Expected: the summary prints, and the last row reads ตรงพอดี / เกิน / ขาด correctly.

- [ ] **Step 7: Failure behaves**

Open the paper cover and press print.
Expected: a Thai toast, no crash. Close the cover, print again — it works without restarting the app.

- [ ] **Step 8: Offline**

Turn WiFi off, take an order, turn WiFi back on.
Expected: `OfflineBar` appears, the order queues, and it syncs on reconnect. (This exercises `src/lib/offlineQueue.ts` inside the WebView, where `domStorageEnabled` is what makes it work.)

---

## Phase 3 — Fit the 6" screen

### Task 10: Thumb-sized controls

**Files:**
- Modify: `src/app/globals.css:185-186`

On a handheld held in one hand, a 26px control is a mis-tap. The main `.btn` at 42px is close enough to leave alone; the two small variants are not.

- [ ] **Step 1: Raise the minimums**

Replace lines 185-186 of `src/app/globals.css`:

```css
.btn-sm { padding: 7px 14px; font-size: var(--text-sm); min-height: 34px; }
.btn-xs { padding: 4px 10px; font-size: var(--text-xs); border-radius: var(--radius-xs); min-height: 26px; }
```

with:

```css
/* Sized for a thumb on a 6" handheld, not a mouse. The visual weight stays
   small — the padding grows, the type does not. */
.btn-sm { padding: 9px 14px; font-size: var(--text-sm); min-height: 40px; }
.btn-xs { padding: 7px 10px; font-size: var(--text-xs); border-radius: var(--radius-xs); min-height: 34px; }
```

- [ ] **Step 2: Check nothing overflows**

Run: `npm run dev`

In Chrome DevTools device toolbar set a custom device of **360 × 780**. Walk `/orders/new`, `/orders/<id>`, `/checkout`, `/menu`, `/kitchen`, `/reports`.
Expected: no horizontal scrollbar on any page; no button row wrapping into an unusable stack; the `/reports` tables scroll horizontally inside their own container rather than pushing the page wide.

Record any page that fails as a follow-up — do not fix layout regressions inside this task.

---

### Task 11: Lock the viewport for kiosk use

**Files:**
- Modify: `src/app/layout.tsx:23-26`

- [ ] **Step 1: Confirm the API**

Read the viewport section of `node_modules/next/dist/docs/` before editing — per `AGENTS.md` this Next version may have changed the `Viewport` export. Confirm `width`, `initialScale`, `maximumScale`, `userScalable` and `viewportFit` are the current field names.

- [ ] **Step 2: Widen the export**

Replace lines 23-26 of `src/app/layout.tsx`:

```ts
export const viewport: Viewport = {
  // Match the POS canvas so the mobile status bar blends in
  themeColor: '#f5f6f8',
}
```

with:

```ts
export const viewport: Viewport = {
  // Match the POS canvas so the mobile status bar blends in
  themeColor: '#f5f6f8',
  width: 'device-width',
  initialScale: 1,
  // A pinch-zoom on a handheld till is always an accident — it leaves staff
  // on a half-scrolled screen mid-order. The trade against WCAG 1.4.4 is
  // deliberate: this is a pinned single-purpose device, and the type scale is
  // set for arm's length already.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}
```

- [ ] **Step 3: Checkpoint**

Run: `npm run dev`, load any page, and check the emitted `<meta name="viewport">` in DevTools.
Expected: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

---

## Done when

- `npm test` passes with the two new suites.
- Desktop Chrome prints all three slips through the dialog, unchanged from today.
- The Sunmi V3 Mix prints all three slips with no dialog, Thai renders correctly, and a real banking app scans the PromptPay QR for the right amount.
- Every screen works at 360 CSS px with no horizontal scroll and no control under 34px.
