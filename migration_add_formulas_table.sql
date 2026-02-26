-- Add formulas table for saved custom price formulas
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

CREATE TABLE IF NOT EXISTS formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formula_base JSONB NOT NULL,
  formula_wholesale JSONB NOT NULL,
  formula_retail JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own formulas" ON formulas
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_formulas_user_id ON formulas (user_id);
