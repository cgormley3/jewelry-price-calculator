-- Add day % change columns to metal_prices
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

ALTER TABLE metal_prices ADD COLUMN IF NOT EXISTS gold_pct NUMERIC;
ALTER TABLE metal_prices ADD COLUMN IF NOT EXISTS silver_pct NUMERIC;
ALTER TABLE metal_prices ADD COLUMN IF NOT EXISTS platinum_pct NUMERIC;
ALTER TABLE metal_prices ADD COLUMN IF NOT EXISTS palladium_pct NUMERIC;
