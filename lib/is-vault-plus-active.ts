/**
 * Vault+ access: Stripe subscription row must be active or trialing and not past period end.
 */
export function isVaultPlusSubscriptionActive(sub: {
  status?: string | null;
  current_period_end?: string | null;
} | null | undefined): boolean {
  if (!sub) return false;
  const st = String(sub.status || '').toLowerCase();
  if (st !== 'active' && st !== 'trialing') return false;
  const periodValid = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
  return periodValid;
}
