import type { SupabaseClient } from '@supabase/supabase-js';

export type SubscriptionGateFields = {
  status: string | null;
  current_period_end: unknown;
};

/**
 * Prefer the newest row when duplicates exist (`.single()` would error with 2+ rows).
 */
export async function fetchLatestSubscriptionForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionGateFields | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('subscriptions lookup:', error.message);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    status: row.status ?? null,
    current_period_end: row.current_period_end,
  };
}
