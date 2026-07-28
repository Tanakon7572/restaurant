-- Run once in the Supabase SQL Editor, top to bottom, in one go.
--
-- Covers:
--   * an uploaded payment QR image, for shops with no PromptPay id
--   * fixed set menus built from ticked menu items
--
-- Safe to re-run: every statement is IF NOT EXISTS. Nothing is dropped and no
-- existing column is altered, so menu and order data are untouched.

-- ── Uploaded payment QR ─────────────────────────────────────────────────
-- Only used when promptPayId is empty: a generated PromptPay code carries the
-- amount, so it always wins over a static image.
ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "paymentQrUrl" TEXT;

-- ── Fixed set menus ─────────────────────────────────────────────────────
-- The MenuItem row is the set: its `price` is what the customer pays, and
-- `isSet` already exists from an earlier schema. `setCategoryIds` is left in
-- place but unused — sets store their parts, not a category link, so adding a
-- new topping can't silently change what a set contains.
ALTER TABLE "MenuItem"
  ADD COLUMN IF NOT EXISTS "isSet" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "setCategoryIds" INTEGER[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS "SetComponent" (
  "id"       SERIAL PRIMARY KEY,
  "setId"    INTEGER NOT NULL,
  "itemId"   INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "order"    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "SetComponent_setId_idx"  ON "SetComponent"("setId");
CREATE INDEX IF NOT EXISTS "SetComponent_itemId_idx" ON "SetComponent"("itemId");

-- Cascade both ways: deleting a set takes its parts list with it, and deleting
-- a menu item removes it from every set it appeared in. A set that quietly
-- lists a menu item nobody can order is worse than a shorter set.
ALTER TABLE "SetComponent" DROP CONSTRAINT IF EXISTS "SetComponent_setId_fkey";
ALTER TABLE "SetComponent" ADD CONSTRAINT "SetComponent_setId_fkey"
  FOREIGN KEY ("setId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SetComponent" DROP CONSTRAINT IF EXISTS "SetComponent_itemId_fkey";
ALTER TABLE "SetComponent" ADD CONSTRAINT "SetComponent_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
