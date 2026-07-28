-- Run once in the Supabase SQL Editor, after 2026-07-28-payment-qr-and-sets.sql.
--
-- Sets are now created in one step from a category marked as a set category,
-- with their own price and discount, instead of being converted from an
-- ordinary menu item after the fact.
--
-- Safe to re-run: both statements are IF NOT EXISTS. Existing sets keep
-- working — they simply have no discount recorded, which reads as "no markdown
-- to advertise" rather than as free.

ALTER TABLE "MenuCategory"
  ADD COLUMN IF NOT EXISTS "isSetCategory" BOOLEAN NOT NULL DEFAULT false;

-- `price` stays the figure customers are charged; this is only what it was
-- marked down from, so the menu can strike through the original.
ALTER TABLE "MenuItem"
  ADD COLUMN IF NOT EXISTS "setDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
