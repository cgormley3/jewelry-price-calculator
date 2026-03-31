-- Run in Supabase SQL Editor after previous migrations.
-- Optional retail multiplier for findings/other (Formula A & B); original vault photo for re-crop.

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS findings_retail_multiplier NUMERIC;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_original_url TEXT;

COMMENT ON COLUMN inventory.findings_retail_multiplier IS 'Optional retail multiplier applied to findings/other dollars for Strategy A/B; NULL = use formula default (same total as legacy).';
COMMENT ON COLUMN inventory.image_original_url IS 'Full-resolution source image URL for re-crop; image_url remains the cropped square thumbnail.';
