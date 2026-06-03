# Food Order — Handoff

ระบบจัดการออเดอร์สำหรับร้านอาหาร พนักงานใช้แอดมิน พร้อม QR ordering สำหรับลูกค้า

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.2 (App Router) |
| Runtime | React 19, TypeScript |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 7.6 + PrismaPg adapter |
| Deployment | Fly.io (Singapore `sin`) |
| Container | Docker (Node 22 Alpine, multi-stage) |
| QR Code | react-qr-code |
| Font | IBM Plex Sans Thai (Google Fonts) |

---

## Environment Variables

ดูค่าจริงใน `.env` ที่ root project

```
DATABASE_URL     — PostgreSQL connection string (Supabase)
DIRECT_URL       — ใช้ค่าเดียวกับ DATABASE_URL (bypass pgbouncer)
SESSION_SECRET   — ใช้เซ็น session cookie
ADMIN_PASSWORD   — รหัสผ่าน fallback ถ้า DB ไม่มี AppSettings
```

---

## Database Schema (Prisma)

```prisma
MenuCategory  id, name, order
MenuItem      id, name, price, categoryId, available, order, imageUrl?
Order         id, tableNumber?, status, totalPrice, note?, createdAt, updatedAt
OrderItem     id, orderId, menuItemId, quantity, price, note?
AppSettings   id, shopName, adminPassword?
```

**Order status flow:** `pending → preparing → completed`  (หรือ `→ cancelled` ได้ทุก step)

**Schema change:** แก้ไข `prisma/schema.prisma` แล้วรัน `npx prisma db push` หรือ deploy ขึ้น Fly (release command รันอัตโนมัติ)

---

## Pages & Routes

### Admin (ต้อง login)

| Path | ไฟล์ | หน้าที่ |
|---|---|---|
| `/` | `app/page.tsx` | Login ด้วยรหัสผ่านเดียว |
| `/dashboard` | `app/dashboard/page.tsx` | สรุปวันนี้ + กราฟ 7 วัน + top items |
| `/menu` | `app/menu/page.tsx` | จัดการหมวดหมู่ + เมนู + รูปภาพ |
| `/orders/new` | `app/orders/new/page.tsx` | สร้างออเดอร์ใหม่ (มี search) |
| `/orders` | `app/orders/page.tsx` | รายการออเดอร์ + filter สถานะ |
| `/orders/[id]` | `app/orders/[id]/page.tsx` | รายละเอียด + เปลี่ยนสถานะ + แก้ไข |
| `/qr` | `app/qr/page.tsx` | สร้าง QR code ต่อโต๊ะ + พิมพ์ |
| `/settings` | `app/settings/page.tsx` | แก้ชื่อร้าน + เปลี่ยนรหัสผ่าน |

### Public (ไม่ต้อง login)

| Path | ไฟล์ | หน้าที่ |
|---|---|---|
| `/q?table=X` | `app/q/page.tsx` | หน้าสั่งอาหาร QR สำหรับลูกค้า + ติดตามสถานะ |

---

## API Routes

### Admin API (ต้อง session cookie)

```
GET  /api/orders?today=true|days=N|status=X  — ดึงออเดอร์
POST /api/orders                              — สร้างออเดอร์
GET  /api/orders/[id]                         — รายละเอียดออเดอร์
PATCH /api/orders/[id]                        — แก้ไข (items/status/table/note)
DELETE /api/orders/[id]                       — ลบออเดอร์

GET  /api/menu-categories                     — ดึงหมวดหมู่ + items (ไม่ต้อง auth)
POST /api/menu-categories                     — สร้างหมวดหมู่
PATCH /api/menu-categories/[id]              — แก้ชื่อ
DELETE /api/menu-categories/[id]             — ลบ (cascade ลบ items ด้วย)

POST /api/menu-items                          — สร้าง item (รับ imageUrl ด้วย)
PATCH /api/menu-items/[id]                   — แก้ไข (spread body ลงใน data โดยตรง)
DELETE /api/menu-items/[id]                  — ลบ

GET   /api/settings                          — ดึง shopName
PATCH /api/settings                          — แก้ shopName / เปลี่ยน password

POST /api/auth                               — login → set cookie
DELETE /api/auth                             — logout → clear cookie
```

### Public API (ไม่ต้อง auth)

```
GET  /api/public/menu               — เมนูที่ available เท่านั้น (มี imageUrl)
POST /api/public/orders             — ลูกค้าสร้างออเดอร์
GET  /api/public/orders/[id]        — ลูกค้าเช็คสถานะ (limited fields)
```

---

## Auth System

- **Single admin** — ไม่มี roles, ไม่มี multi-user
- Session cookie: `food-order-session` = `base64("authenticated:{SESSION_SECRET}")`
- Password: เช็คจาก `AppSettings.adminPassword` ใน DB ก่อน, fallback `ADMIN_PASSWORD` env
- ไม่มี JWT, ไม่มี expiry (cookie maxAge 7 วัน)
- Logout แค่ลบ cookie ฝั่ง client ไม่มี server-side invalidation

---

## Design System

ไฟล์หลัก: `src/app/globals.css`

```
Theme    : Light warm — bg ขาว, card ขาว + shadow, accent terracotta
Colors   : OKLCH throughout (--c-bg, --c-surface, --c-primary, etc.)
Primary  : oklch(0.40 0.160 44) — deep terracotta
Font     : IBM Plex Sans Thai 300/400/500/600/700
Cards    : .glass-panel — white bg + border + shadow
Prices   : .price-tag / .price-tag-lg — terracotta, tabular-nums
Nav      : BottomNav 5 items (SVG icons, ไม่มี emoji)
```

### Shared Components

| Component | ไฟล์ | หน้าที่ |
|---|---|---|
| `BottomNav` | `components/BottomNav.tsx` | Nav 5 items (Dashboard/Menu/สั่ง/Orders/Settings) |
| `ConfirmModal` | `components/ConfirmModal.tsx` | Bottom sheet confirm dialog |

---

## QR Ordering Flow (ลูกค้า)

1. Staff สร้าง QR ที่ `/qr` → link เป็น `/q?table=5`
2. ลูกค้าสแกน → เลือกเมนู (มี search + รูป) → กด "ส่งออเดอร์"
3. ได้ **หมายเลขคิว** (= order ID) + เห็นสถานะ real-time (poll ทุก 5 วินาที)
4. กด **"สั่งเพิ่ม"** → กลับไปสั่งใหม่ → ได้ order ใหม่, เห็น order เก่าด้วย
5. Session orders เก็บใน `localStorage` key `food-order-session-{table}`

---

## Deployment

```bash
# Deploy ขึ้น Fly.io
fly deploy

# Release command รันอัตโนมัติใน fly.toml:
npx prisma db push --accept-data-loss
```

```bash
# Dev local
npm run dev       # http://localhost:3000

# อัปเดต schema
npx prisma db push
npx prisma generate  # ถ้า build ไม่เจอ types ใหม่
```

**Fly config:** `fly.toml` — app `ar-book`, region Singapore, shared-cpu-1x 512MB, auto stop/start

---

## Known Limitations

- **ไม่มี image upload** — `imageUrl` ต้องเป็น URL ภายนอก (เช่น Supabase Storage, imgbb)
- **Single admin** — ไม่รองรับ multi-user หรือ roles
- **QR session = localStorage** — ข้ามอุปกรณ์ไม่ได้, เปิด incognito ใหม่ = เริ่มใหม่
- **ไม่มี real-time push** — staff เห็นออเดอร์ใหม่ต้อง refresh หรือ poll เอง
- **ไม่มี archive** — orders ไม่มี expiry, ถ้าข้อมูลเยอะควรเพิ่ม index หรือ archiving
- **Session ไม่มี invalidation** — logout ที่เครื่องหนึ่งไม่กระทบเครื่องอื่น

---

## Potential Next Steps

- [ ] **Kitchen Display** — หน้าแสดง pending/preparing orders แบบ real-time (SSE หรือ polling)
- [ ] **Image upload** — อัปโหลดรูปจากเครื่องไปเก็บ Supabase Storage
- [ ] **Print receipt** — PDF หรือ thermal printer
- [ ] **Multi-table dashboard** — เห็น active orders ต่อโต๊ะในหน้าเดียว
- [ ] **Revenue export** — export CSV รายวัน/สัปดาห์
- [ ] **Push notifications** — แจ้งเตือนออเดอร์ใหม่บน staff device (Web Push API)
