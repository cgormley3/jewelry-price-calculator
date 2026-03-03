-- Add time_entries table for per-item and global time tracking
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  duration_minutes NUMERIC NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own time entries" ON time_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_id_created_at ON time_entries (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_inventory_id ON time_entries (inventory_id);
