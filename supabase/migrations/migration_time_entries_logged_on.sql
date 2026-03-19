-- Optional calendar date for when work was performed (manual / backdated logs).
-- Run in Supabase SQL Editor if you already deployed time_entries.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS logged_on DATE;

COMMENT ON COLUMN time_entries.logged_on IS 'Calendar day the work was done; when null, UI uses created_at date.';

-- Backfill from existing rows (UTC date of created_at)
UPDATE time_entries
SET logged_on = ((created_at AT TIME ZONE 'UTC')::DATE)
WHERE logged_on IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_user_logged_on
  ON time_entries (user_id, logged_on DESC);
