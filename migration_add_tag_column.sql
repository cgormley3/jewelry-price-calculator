-- Migration: Add tag column to inventory table
-- Allows users to categorize items as necklace, ring, bracelet, or other

ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'other';

-- Optional: Create index for filtering by tag
CREATE INDEX IF NOT EXISTS idx_inventory_tag ON inventory (tag);

-- Backfill existing rows with null tag to 'other'
UPDATE inventory
SET tag = 'other'
WHERE tag IS NULL;
