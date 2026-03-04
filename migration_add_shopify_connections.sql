-- Migration: Add shopify_connections table for OAuth tokens
-- Run in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

CREATE TABLE IF NOT EXISTS shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shop_domain)
);

ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own shopify_connections"
  ON shopify_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
