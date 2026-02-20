-- Migration: Add stones column to inventory table
-- This allows storing multiple gemstones with individual names, costs, and markups
-- The existing stone_cost and stone_markup columns remain for backward compatibility

-- Add the new stones column as JSONB (PostgreSQL) or JSON (other databases)
-- JSONB is preferred in PostgreSQL for better query performance
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS stones JSONB DEFAULT '[]'::jsonb;

-- Create an index on the stones column for better query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_inventory_stones ON inventory USING GIN (stones);

-- Optional: Migrate existing data from stone_cost/stone_markup to stones array
-- This converts old single-stone format to new array format
UPDATE inventory 
SET stones = CASE 
  WHEN stone_cost > 0 THEN 
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Stones',
        'cost', stone_cost,
        'markup', COALESCE(stone_markup, 1.5)
      )
    )
  ELSE '[]'::jsonb
END
WHERE stones IS NULL OR stones = '[]'::jsonb;

-- Verify the migration
-- SELECT id, name, stone_cost, stone_markup, stones FROM inventory LIMIT 10;
