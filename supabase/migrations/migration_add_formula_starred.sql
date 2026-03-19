-- Add is_starred to formulas table for favorite/default formula
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

ALTER TABLE formulas ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_formulas_user_starred ON formulas (user_id, is_starred) WHERE is_starred = true;
