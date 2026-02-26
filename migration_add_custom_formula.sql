-- Add custom_formula column for custom pricing models
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor
-- REQUIRED: Run this migration before saving items with custom pricing strategies.

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS custom_formula JSONB DEFAULT NULL;

-- Optional: Add pricing_model_id for future reference to saved models
-- ALTER TABLE inventory ADD COLUMN IF NOT EXISTS pricing_model_id UUID REFERENCES pricing_models(id);
