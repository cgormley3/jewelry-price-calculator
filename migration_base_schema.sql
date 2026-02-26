-- Base schema for Jewelry Price Calculator
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor
-- Then run migration_add_stones_column.sql and migration_add_tag_column.sql

-- metal_prices: stores fetched gold/silver/platinum/palladium spot prices
CREATE TABLE IF NOT EXISTS metal_prices (
  id INT PRIMARY KEY DEFAULT 1,
  gold NUMERIC DEFAULT 0,
  silver NUMERIC DEFAULT 0,
  platinum NUMERIC DEFAULT 0,
  palladium NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- inventory: vault items
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metals JSONB DEFAULT '[]',
  stones JSONB DEFAULT '[]',
  wholesale NUMERIC DEFAULT 0,
  retail NUMERIC DEFAULT 0,
  materials_at_making NUMERIC DEFAULT 0,
  labor_at_making NUMERIC DEFAULT 0,
  other_costs_at_making NUMERIC DEFAULT 0,
  stone_cost NUMERIC DEFAULT 0,
  stone_markup NUMERIC DEFAULT 1.5,
  overhead_cost NUMERIC DEFAULT 0,
  overhead_type TEXT DEFAULT 'flat',
  strategy TEXT DEFAULT 'A',
  multiplier NUMERIC DEFAULT 3,
  markup_b NUMERIC DEFAULT 1.8,
  notes TEXT DEFAULT '',
  hours NUMERIC DEFAULT 0,
  location TEXT DEFAULT 'Main Vault',
  tag TEXT DEFAULT 'other',
  status TEXT DEFAULT 'active',
  image_url TEXT
);

-- RLS: inventory - users can only access their own rows
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own inventory" ON inventory
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- metal_prices: no RLS needed (accessed only via service_role in API)
