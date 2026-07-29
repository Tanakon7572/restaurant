-- What a set part is worth on its own, so the receipt can print a figure
-- beside each one. Null for a chosen option, whose price is priceDelta.
-- Nullable with no default: existing rows are chosen options and stay null.

ALTER TABLE "OrderItemOption"
  ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION;
