-- Run once in the Supabase SQL Editor, top to bottom, in one go.
--
-- Covers two rounds of work:
--   * payments, daily close, receipts, per-pool step toggles
--   * stored daily order numbers (previously derived from row position)
--
-- Safe to re-run: every statement is IF NOT EXISTS or idempotent, and the
-- backfill only touches rows that have no number yet. Nothing is dropped and
-- no existing column is altered, so menu and order data are untouched.

-- ── Signature step toggles ──────────────────────────────────────────────
ALTER TABLE "MenuCategory"
  ADD COLUMN IF NOT EXISTS "showCrustStep" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hiddenPoolCategoryIds" INTEGER[] NOT NULL DEFAULT '{}';

-- ── Receipt / tax / payment settings ────────────────────────────────────
ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "vatMode" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "serviceChargeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "promptPayId" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptHeader" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptWidth" INTEGER NOT NULL DEFAULT 58;

-- ── Bills ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Bill" (
  "id"            SERIAL PRIMARY KEY,
  "tableNumber"   TEXT,
  "subtotal"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountNote"  TEXT,
  "serviceCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vat"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "method"        TEXT NOT NULL DEFAULT 'cash',
  "received"      DOUBLE PRECISION,
  "changeDue"     DOUBLE PRECISION,
  "note"          TEXT,
  "voidedAt"      TIMESTAMP(3),
  "voidReason"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Bill_createdAt_idx" ON "Bill"("createdAt");

-- ── Daily close snapshot ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DayClose" (
  "dayKey"       TEXT PRIMARY KEY,
  "closedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "billCount"    INTEGER NOT NULL DEFAULT 0,
  "totalSales"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "countedCash"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"         TEXT
);

-- ── Orders → bills ──────────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "billId" INTEGER;
CREATE INDEX IF NOT EXISTS "Order_billId_idx" ON "Order"("billId");
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_billId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Stored daily order numbers ──────────────────────────────────────────
-- Nullable on purpose: Postgres treats NULLs as distinct, so the unique pair
-- below tolerates any row that somehow arrives without a number.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "dayKey" TEXT,
  ADD COLUMN IF NOT EXISTS "dailyNumber" INTEGER;

-- Backfill so numbers staff already saw (and printed) stay exactly the same:
-- rank by id within the Asia/Bangkok day, which is what the old code derived.
WITH unnumbered AS (
  SELECT "id", to_char("createdAt" + INTERVAL '7 hours', 'YYYY-MM-DD') AS "k"
  FROM "Order"
  WHERE "dailyNumber" IS NULL
),
-- Highest number already handed out per day, so a second run continues the
-- sequence instead of restarting it and colliding.
used AS (
  SELECT "dayKey" AS "k", MAX("dailyNumber") AS "m"
  FROM "Order"
  WHERE "dayKey" IS NOT NULL AND "dailyNumber" IS NOT NULL
  GROUP BY "dayKey"
),
numbered AS (
  SELECT
    u."id",
    u."k",
    COALESCE(used."m", 0)
      + ROW_NUMBER() OVER (PARTITION BY u."k" ORDER BY u."id") AS "n"
  FROM unnumbered u
  LEFT JOIN used ON used."k" = u."k"
)
UPDATE "Order" o
SET "dayKey" = numbered."k", "dailyNumber" = numbered."n"
FROM numbered
WHERE o."id" = numbered."id";

-- The counter the app increments. Seeded past every number already in use, so
-- the next order carries on rather than colliding with a backfilled one.
CREATE TABLE IF NOT EXISTS "DailyCounter" (
  "dayKey" TEXT PRIMARY KEY,
  "next"   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "DailyCounter" ("dayKey", "next")
SELECT "dayKey", MAX("dailyNumber")
FROM "Order"
WHERE "dayKey" IS NOT NULL AND "dailyNumber" IS NOT NULL
GROUP BY "dayKey"
ON CONFLICT ("dayKey") DO UPDATE
SET "next" = GREATEST("DailyCounter"."next", EXCLUDED."next");

CREATE UNIQUE INDEX IF NOT EXISTS "Order_dayKey_dailyNumber_key"
  ON "Order"("dayKey", "dailyNumber");
CREATE INDEX IF NOT EXISTS "Order_dayKey_idx" ON "Order"("dayKey");
