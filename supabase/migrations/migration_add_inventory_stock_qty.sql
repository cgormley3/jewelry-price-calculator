-- How many identical units of this row are in stock (inventory tracking).
-- App and API clamp to 1…999999.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN inventory.stock_qty IS 'Number of units in stock for this vault row (default 1).';
