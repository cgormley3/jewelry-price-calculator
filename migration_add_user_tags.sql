-- Add user_tags table for persistent tag library per user
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

CREATE TABLE IF NOT EXISTS user_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag)
);

ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tags" ON user_tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags (user_id);
