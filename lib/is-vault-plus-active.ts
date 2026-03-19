/**
 * Vault+ access: subscription must be active, trialing, or past_due (Stripe grace),
 * and current_period_end must be missing, unparseable, or in the future.
 */

/** Stripe statuses we treat as paid / entitled (past_due = payment retry window). */
const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function parseSubscriptionPeriodEnd(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isVaultPlusSubscriptionActive(sub: {
  status?: string | null;
  current_period_end?: unknown;
} | null | undefined): boolean {
  if (!sub) return false;
  const st = String(sub.status || '').toLowerCase().trim();
  if (!ACCESS_STATUSES.has(st)) return false;
  const end = parseSubscriptionPeriodEnd(sub.current_period_end);
  if (end === null) return true;
  return end.getTime() > Date.now();
}

/** Human-readable reason when a row exists or not; for diagnostics only. */
export function vaultPlusAccessBlockReason(sub: {
  status?: string | null;
  current_period_end?: unknown;
} | null | undefined): string | null {
  if (!sub) {
    return 'No subscription row for this account’s user id. If you see a row in Supabase, compare `user_id` to your auth user id (Vault → Diagnose).';
  }
  const st = String(sub.status || '').toLowerCase().trim();
  if (!ACCESS_STATUSES.has(st)) {
    return `Subscription status is "${sub.status ?? 'unknown'}". The app treats active, trialing, and past_due as paid. Fix the row or run Stripe sync.`;
  }
  const end = parseSubscriptionPeriodEnd(sub.current_period_end);
  if (end === null) return null;
  if (end.getTime() <= Date.now()) {
    return `current_period_end (${String(sub.current_period_end)}) is in the past. Update from Stripe (webhook) or set a future date in Supabase.`;
  }
  return null;
}
