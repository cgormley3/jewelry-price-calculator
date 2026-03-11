-- Migration: Dedupe subscriptions and enforce one row per user_id
-- Run in Supabase SQL Editor if you have duplicate subscription rows

-- 1. Remove duplicate rows: keep one per user_id (prefer row with stripe_subscription_id, then most recent)
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY (CASE WHEN stripe_subscription_id IS NOT NULL THEN 0 ELSE 1 END), updated_at DESC NULLS LAST
      ) AS rn
    FROM subscriptions
  ) t
  WHERE t.rn > 1
);

-- 2. Ensure UNIQUE constraint on user_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END $$;
