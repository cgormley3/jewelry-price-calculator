-- Ensure logo_url column exists on profiles (in case profiles was created before logo_url was added)
-- Run in Supabase SQL Editor if logo changes don't persist

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
