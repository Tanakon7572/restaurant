# Food Order — Handoff

ระบบ POS จัดการออเดอร์สำหรับร้านอาหาร พนักงานใช้ผ่าน admin panel พร้อม QR ordering สำหรับลูกค้า และ Kitchen Display System

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.2 (App Router) |
| Runtime | React 19, TypeScript |
| Database | PostgreSQL via Supabase (`bcpzjtmvlnyxfrlpokza`, ap-northeast-1) |
| ORM | Prisma 7.6 + `@prisma/adapter-pg` (driver adapter, ไม่ใช้ binary engine) |
| Deployment | Vercel — `restaurant-lac-one.vercel.app` (Singapore sin1) |
| CI/CD | GitHub auto-deploy จาก `main` branch |
| Storage | Supabase Storage (อัปโหลดรูปเมนู) |
| QR Code | react-qr-code |
| Font | IBM Plex Sans Thai ผ่าน `next/font/google` (self-hosted, ไม่ใช้ @import) |

---

## Environment Variables

### Local (`.env`)

```
DATABASE_URL  = postgresql://postgres.bcpzjtmvlnyxfrlpokza:Ta-%4027032543@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
DIRECT_URL    = postgresql://postgres:Ta-%4027032543@db.bcpzjtmvlnyxfrlpokza.supabase.co:5432/postgres
SESSION_SECRET = food-order-secret-change-me-in-production
ADMIN_PASSWORD = admin1234
SUPABASE_URL   = https://bcpzjtmvlnyxfrlpokza.supabase.co
SUPABASE_SERVICE_ROLE_KEY = (ว่าง — ต้องใส่เพื่อเปิด image upload)
```

### Vercel Environment Variables (ต้องตั้งใน dashboard)

เหมือนกับ local ทุกตัว ยกเว้น `DIRECT_URL` ไม่จำเป็น (Vercel ใช้ pooler เท่านั้น)

> **สำคัญ:** `DATABASE_URL` ต้องชี้ไป **pooler port 6543** เท่านั้น  
> Vercel serverless ไม่สามารถเชื่อม Supabase direct port 5432 ได้

> **Image upload:** ต้องใส่ `SUPABASE_SERVICE_ROLE_KEY` ใน Vercel ก่อนจะใช้ได้  
> หา key ได้ที่ Supabase Dashboard → Project Settings → API → Service Role Key

### Password ของ Supabase DB

`Ta-@27032543` (URL-encoded เป็น `Ta-%4027032543` ใน connection string)

---

## Database Schema (Prisma)

```prisma
MenuCategory  id, name, order, createdAt
MenuItem      id, name, price, categoryId, available, order, imageUrl?, createdAt
Order         id, tableNumber?, status, totalPrice, note?, createdAt, updatedAt
OrderItem     id, orderId, menuItemId (nullable), itemName, quantity, price, note?
AppSettings   id, shopName, adminPassword?
```

### Order Status Flow

```
pending → preparing → completed
         ↘ cancelled (ได้ทุก step)
```

### Foreign Key Notes

- `OrderItem.menuItemId` เป็น `Int?` (nullable) — ลบ MenuItem ได้โดยไม่ error
- `onDelete: SetNull` — เมื่อลบ MenuItem, `menuItemId` จะเป็น `null`
- `itemName` บันทึกชื่อเมนูตอนสั่ง — ป้องกันข้อมูลหายเมื่อลบเมนู
- แสดงชื่อด้วย: `item.itemName || item.menuItem?.name || '(ลบแล้ว)'`

### Schema Changes

```bash
# แก้ schema แล้วรัน:
npx prisma db push        # push ไป Supabase
npx prisma generate       # regenerate types (ต้องรันถ้าเพิ่ม field ใหม่)
```

---

## Pages & Routes

### Admin (ต้อง session cookie)

| Path | ไฟล์ | หน้าที่ |
|---|---|---|
| `/` | `app/page.tsx` | Login ด้วยรหัสผ่านเดียว |
| `/dashboard` | `app/dashboard/page.tsx` | สรุปยอดขาย + period switcher (วันนี้/7วัน/30วัน) + top items |
| `/menu` | `app/menu/page.tsx` | จัดการหมวดหมู่ + เมนู + อัปโหลดรูป |
| `/orders/new` | `app/orders/new/page.tsx` | สร้างออเดอร์ใหม่ (มี search) |
| `/orders` | `app/orders/page.tsx` | รายการออเดอร์ + filter สถานะ + date range + CSV export |
| `/orders/[id]` | `app/orders/[id]/page.tsx` | รายละเอียด + เปลี่ยนสถานะ + แก้ไข + พิมพ์ใบเสร็จ |
| `/qr` | `app/qr/page.tsx` | สร้าง QR code ต่อโต๊ะ + พิมพ์ |
| `/settings` | `app/settings/page.tsx` | แก้ชื่อร้าน + เปลี่ยนรหัสผ่าน + ลิงก์ QR + ลิงก์ Kitchen Display |
| `/kitchen` | `app/kitchen/page.tsx` | Kitchen Display (light theme, เปิดแยก tab, ไม่ต้อง auth) |

### Public (ไม่ต้อง login)

| Path | ไฟล์ | หน้าที่ |
|---|---|---|
| `/q?table=X` | `app/q/page.tsx` | หน้าสั่งอาหาร QR สำหรับลูกค้า + ติดตามสถานะ |
| `/kitchen` | `app/kitchen/page.tsx` | KDS — รายการออเดอร์สำหรับครัว (ไม่ต้อง auth) |

---

## API Routes

### Admin API (ต้อง session cookie)

```
GET    /api/orders?status=X&from=YYYY-MM-DD&to=YYYY-MM-DD   — ดึงออเดอร์ + date range
POST   /api/orders                                           — สร้างออเดอร์
GET    /api/orders/[id]                                      — รายละเอียด
PATCH  /api/orders/[id]                                      — แก้ไข (items/status/table/note)
DELETE /api/orders/[id]                                      — ลบ

GET    /api/menu-categories                                  — ดึงหมวดหมู่ + items (ไม่ต้อง auth)
POST   /api/menu-categories                                  — สร้าง
PATCH  /api/menu-categories/[id]                             — แก้ชื่อ
DELETE /api/menu-categories/[id]                             — ลบ (cascade ลบ items)

POST   /api/menu-items                                       — สร้าง (รับ imageUrl)
PATCH  /api/menu-items/[id]                                  — แก้ไข
DELETE /api/menu-items/[id]                                  — ลบ (ไม่ error แม้มี OrderItem)

GET    /api/settings                                         — ดึง shopName
PATCH  /api/settings                                         — แก้ shopName / เปลี่ยน password

POST   /api/auth                                             — login → set cookie
DELETE /api/auth                                             — logout → clear cookie

POST   /api/upload-image                                     — อัปโหลดรูปไป Supabase Storage
                                                             — ต้องมี SUPABASE_SERVICE_ROLE_KEY
```

### Public API (ไม่ต้อง auth)

```
GET    /api/public/menu                  — เมนูที่ available (มี imageUrl, cache 30s)
POST   /api/public/orders                — ลูกค้าสร้างออเดอร์
GET    /api/public/orders/[id]           — ลูกค้าเช็คสถานะ (limited fields)
GET    /api/public/kitchen               — pending+preparing orders สำหรับ KDS
PATCH  /api/public/kitchen               — อัปเดตสถานะ (preparing/completed) จาก KDS
```

---

## Auth System

- **Single admin** — ไม่มี roles, ไม่มี multi-user
- Session cookie: `food-order-session` = `base64("authenticated:{SESSION_SECRET}")`
- Password: เช็คจาก `AppSettings.adminPassword` ใน DB ก่อน → fallback `ADMIN_PASSWORD` env
- **Auto-migrate:** login ครั้งแรกด้วย env password → บันทึกลง DB อัตโนมัติ (`session.ts`)
- ไม่มี JWT, ไม่มี expiry (cookie maxAge 7 วัน)

---

## Design System

ไฟล์หลัก: `src/app/globals.css`

```
Theme    : Light warm — bg #faf9f7, card ขาว + shadow, accent terracotta
Colors   : OKLCH throughout (--c-bg, --c-surface, --c-primary, --c-text-1..3, etc.)
Primary  : oklch(0.40 0.160 44) — deep terracotta
Danger   : oklch(0.55 0.20 25)  — red
Font     : IBM Plex Sans Thai 300/400/500/600/700 (via next/font/google)
Cards    : .glass-panel — white bg + border + 4-level shadow system
Nav      : BottomNav 5 items (SVG icons, active pill at top, pending badge)
```

### CSS Variables หลัก

```css
--c-bg         /* page background */
--c-surface    /* card/panel background */
--c-border     /* border color */
--c-primary    /* terracotta accent */
--c-text-1     /* primary text */
--c-text-2     /* secondary text */
--c-text-3     /* muted/nav text */
--c-danger     /* red */
--font         /* IBM Plex Sans Thai stack */
--radius-sm/md/lg/xl  /* border radius */
--t-fast       /* transition duration */
```

### Shared Components

| Component | ไฟล์ | หน้าที่ |
|---|---|---|
| `BottomNav` | `components/BottomNav.tsx` | Nav 5 items + prefetch + pending badge (poll 30s) |
| `ConfirmModal` | `components/ConfirmModal.tsx` | Bottom sheet confirm dialog |

---

## Performance

- **Font:** `next/font/google` self-hosts IBM Plex Sans Thai — ไม่มี external request
- **Prefetch:** `router.prefetch()` สำหรับทุก nav item ตอน mount → navigation instant
- **Client cache:** `src/lib/cache.ts` — module-level Map cache
  - Dashboard: TTL 30s (key `dashboard:stats`)
  - Menu: TTL 60s (key `menu:categories`)
  - `invalidateCache(prefix)` เมื่อ mutate ข้อมูล

---

## Key Library Files

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/prisma.ts` | Prisma client singleton ใช้ pooler URL |
| `src/lib/session.ts` | Cookie auth + auto-migrate password to DB |
| `src/lib/cache.ts` | Client-side TTL cache (`fetchWithCache`, `getCache`, `setCache`, `invalidateCache`) |

---

## QR Ordering Flow (ลูกค้า)

1. Staff สร้าง QR ที่ Settings → ลิงก์ QR → `/qr`
2. ลูกค้าสแกน → `/q?table=5` → เลือกเมนู (มี search + รูป) → กด "ส่งออเดอร์"
3. ได้ **หมายเลขคิว** (= order ID) + เห็นสถานะ real-time (poll ทุก 5 วินาที)
4. กด **"สั่งเพิ่ม"** → กลับไปสั่งใหม่ → ได้ order ใหม่, เห็น order เก่าด้วย
5. Session orders เก็บใน `localStorage` key `food-order-session-{table}`

---

## Kitchen Display System (KDS)

- เปิดได้จาก Settings → ลิงก์ Kitchen Display (เปิด new tab)
- ไม่ต้อง login
- แสดง 2 column: **รอรับ** (pending) | **กำลังทำ** (preparing)
- Auto-refresh ทุก 15 วินาที
- เปลี่ยนสถานะ: pending → preparing → completed
- แสดงเวลาที่ผ่านมา (เตือนสีแดงเมื่อ > 15 นาที)
- Pulse dot แสดงเมื่อมีออเดอร์ใหม่

---

## Orders History & Export

- `/orders` มี period tabs: วันนี้ / 7 วัน / 30 วัน / กำหนดเอง
- Custom date range: `from` + `to` datepicker
- Summary bar: จำนวนออเดอร์ + ยอดรวม
- Export CSV: UTF-8 BOM (เปิดได้ใน Excel ไทย)

---

## Image Upload

- Menu page: `ImageInput` component — URL input หรืออัปโหลดจากเครื่อง
- API: `POST /api/upload-image` → Supabase Storage bucket `menu-images`
- ต้องตั้ง `SUPABASE_SERVICE_ROLE_KEY` ใน Vercel ก่อน
- ถ้าไม่ได้ตั้ง key → upload button จะ error 503

---

## Print Receipt

- `/orders/[id]` → ปุ่ม "ใบเสร็จ"
- เปิด popup window สไตล์ thermal receipt
- Print อัตโนมัติ + ปิด window หลัง print

---

## Deployment

```bash
# Deploy ผ่าน Git (auto-deploy)
git push origin main
# Vercel auto-deploy จาก GitHub: https://github.com/Tanakon7572/restaurant.git

# Dev local
npm run dev    # http://localhost:3000

# Build (Prisma generate รัน auto ใน build script)
npm run build

# อัปเดต schema
npx prisma db push
npx prisma generate
```

**Vercel config:**
- Region: Singapore (sin1)
- Build command: `prisma generate && next build`
- Framework: Next.js
- ไม่มี `output: 'standalone'` (Docker-only, breaks Vercel)

---

## Known Limitations

- **Image upload ยังไม่ active บน Vercel** — ต้องใส่ `SUPABASE_SERVICE_ROLE_KEY` ใน Vercel env
- **Supabase free tier cold start** — หลัง idle นาน DB อาจช้า 2-3 วินาที (แก้ด้วย UptimeRobot หรือ Supabase Pro)
- **Single admin** — ไม่รองรับ multi-user หรือ roles
- **QR session = localStorage** — ข้ามอุปกรณ์ไม่ได้, incognito = เริ่มใหม่
- **ไม่มี real-time push** — staff/kitchen ใช้ polling (15-30s)
- **Session ไม่มี server-side invalidation** — logout เครื่องหนึ่งไม่กระทบเครื่องอื่น

---

## Potential Next Steps

- [ ] **SUPABASE_SERVICE_ROLE_KEY** — ใส่ใน Vercel เพื่อเปิดใช้ image upload
- [ ] **Supabase cold start** — ตั้ง UptimeRobot ping ทุก 5 นาทีหรืออัปเกรด Pro
- [ ] **Multi-table view** — dashboard แสดง active orders ต่อโต๊ะ
- [ ] **Web Push Notifications** — แจ้งเตือน staff เมื่อมีออเดอร์ใหม่
- [ ] **SSE / WebSocket** — แทน polling สำหรับ KDS และ order status
- [ ] **Order archive** — เก็บ orders เก่า > 30 วัน แยก table
