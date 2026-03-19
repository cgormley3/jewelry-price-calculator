/**
 * Vault+ access: subscription must be active, trialing, or past_due (Stripe grace).
 * If `current_period_end` is missing, invalid, or **stale** (in the past) while status
 * is still active/trialing/past_due, we still allow access — Supabase rows often lag webhooks.
 */

/** Stripe statuses we treat as paid / entitled (past_due = payment retry window). */
const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isVaultPlusSubscriptionActive(sub: {
  status?: string | null;
  current_period_end?: unknown;
} | null | undefined): boolean {
  if (!sub) return false;
  const st = String(sub.status || '').toLowerCase().trim();
  if (!ACCESS_STATUSES.has(st)) return false;
  return true;
}

/** Human-readable reason when a row exists or not; for diagnostics only. */
export function vaultPlusAccessBlockReason(sub: {
  status?: string | null;
  current_period_end?: unknown;
} | null | undefined): string | null {
  if (!sub) {
    return 'No subscription row for this account’s user id. If you see a row in Supabase, compare `user_id` to your auth user id.';
  }
  const st = String(sub.status || '').toLowerCase().trim();
  if (!ACCESS_STATUSES.has(st)) {
    return `Subscription status is "${sub.status ?? 'unknown'}". The app treats active, trialing, and past_due as paid. Fix the row or run Stripe sync.`;
  }
  return null;
}
