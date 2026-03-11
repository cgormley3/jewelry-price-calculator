-- Migration: Add subscriptions table for Vault+ Stripe subscriptions
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);

-- RLS: API uses service_role which bypasses RLS. No client access.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- No policies: table is only accessed via API with service_role key
