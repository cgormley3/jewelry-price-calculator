-- Run this in Supabase SQL Editor to fix "Could not find the 'tag' column" error
-- Go to: https://app.supabase.com → Your Project → SQL Editor → New Query → Paste & Run

ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_inventory_tag ON inventory (tag);

UPDATE inventory SET tag = 'other' WHERE tag IS NULL;
