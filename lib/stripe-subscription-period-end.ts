import type Stripe from 'stripe';

/**
 * Stripe's REST API still returns `current_period_end` (unix seconds) on subscriptions.
 * stripe-node v20+ types omit it on `Stripe.Subscription`; read it safely at runtime.
 */
export function getSubscriptionCurrentPeriodEndUnix(sub: Stripe.Subscription): number | undefined {
  const ts = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof ts === 'number' ? ts : undefined;
}
