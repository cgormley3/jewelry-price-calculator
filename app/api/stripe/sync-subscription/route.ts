import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getSubscriptionCurrentPeriodEndUnix } from '@/lib/stripe-subscription-period-end';

export const dynamic = 'force-dynamic';

/** Comma- or space-separated `price_...` ids (e.g. old + new after a price change). Empty = match any active/trialing sub. */
function vaultPlusPriceIdsFromEnv(): string[] {
  const raw = process.env.STRIPE_VAULT_PLUS_PRICE_ID?.trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Links an active Stripe subscription to the signed-in Supabase user by email.
 * Use when checkout succeeded in Stripe but `subscriptions` was never updated (webhook / client_reference_id issues).
 */
export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!stripeSecret || !supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { accessToken, userId } = body as { accessToken?: string; userId?: string };
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json({ error: userError?.message || 'Invalid or expired session' }, { status: 401 });
    }
    if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
    }

    const email = user.email?.trim();
    if (!email) {
      return NextResponse.json({ error: 'Your account has no email; cannot match Stripe customer.' }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecret);
    const escaped = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const { data: searchData } = await stripe.customers.search({
      query: `email:'${escaped}'`,
      limit: 10,
    });

    const customers = searchData || [];
    if (customers.length === 0) {
      return NextResponse.json({
        ok: false,
        synced: false,
        message:
          'No Stripe customer found with this account email. Use the same email in Stripe, or complete checkout from the app while signed in (so your user id is sent to Stripe).',
      });
    }

    type Candidate = {
      subscriptionId: string;
      customerId: string;
      periodEnd: string;
      status: string;
      priceIds: string[];
    };

    const allowedPriceIds = vaultPlusPriceIdsFromEnv();

    async function collectCandidates(requirePriceMatch: boolean): Promise<Candidate[]> {
      const out: Candidate[] = [];
      for (const c of customers) {
        if (c.deleted) continue;
        const custId = c.id;
        const subs = await stripe.subscriptions.list({
          customer: custId,
          status: 'all',
          limit: 20,
        });
        for (const sub of subs.data) {
          if (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'past_due') continue;
          const items = sub.items?.data || [];
          const priceIds = items.map((it) => it.price?.id).filter(Boolean) as string[];
          const matchesPrice =
            !requirePriceMatch ||
            allowedPriceIds.length === 0 ||
            items.some((it) => {
              const pid = it.price?.id?.toLowerCase();
              return pid && allowedPriceIds.includes(pid);
            });
          if (!matchesPrice) continue;
          const endUnix = getSubscriptionCurrentPeriodEndUnix(sub);
          const end = endUnix
            ? new Date(endUnix * 1000).toISOString()
            : new Date().toISOString();
          const st = sub.status;
          const statusRow =
            st === 'trialing' ? 'trialing' : st === 'past_due' ? 'past_due' : 'active';
          out.push({
            subscriptionId: sub.id,
            customerId: custId,
            periodEnd: end,
            status: statusRow,
            priceIds,
          });
        }
      }
      return out;
    }

    let candidates = await collectCandidates(true);

    /** Payment Link may use a new price id not yet in env — if exactly one paid sub exists for this email, link it. */
    if (candidates.length === 0 && allowedPriceIds.length > 0) {
      const anyPrice = await collectCandidates(false);
      const dedup = new Map<string, Candidate>();
      for (const x of anyPrice) dedup.set(x.subscriptionId, x);
      const loose = [...dedup.values()];
      if (loose.length === 1) {
        candidates = loose;
      } else if (loose.length > 1) {
        const seen = new Set<string>();
        for (const x of loose) for (const p of x.priceIds) seen.add(p);
        return NextResponse.json({
          ok: false,
          synced: false,
          message: `No subscription matched your configured prices (${allowedPriceIds.join(', ')}). This email has ${loose.length} active subscriptions with these price ids: ${[...seen].join(', ')}. Add the Vault+ price to STRIPE_VAULT_PLUS_PRICE_ID in Vercel (comma-separated) and redeploy, or remove extra Stripe subscriptions for this email.`,
        });
      }
    }

    if (candidates.length === 0) {
      const hint =
        allowedPriceIds.length > 0
          ? `No subscription on this email uses any of these prices: ${allowedPriceIds.join(', ')}. In Stripe → Products, open your Vault+ price and copy its Price id. Set STRIPE_VAULT_PLUS_PRICE_ID in Vercel (comma-separated). If you already paid, check Stripe → Customers that this email matches your login.`
          : 'No active, trialing, or past_due subscription found for this email in Stripe.';
      return NextResponse.json({
        ok: false,
        synced: false,
        message: hint,
      });
    }

    candidates.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
    const best = candidates[0]!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        stripe_customer_id: best.customerId,
        stripe_subscription_id: best.subscriptionId,
        status: best.status,
        current_period_end: best.periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      console.error('sync-subscription upsert:', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    const priceHint =
      best.priceIds.length > 0
        ? ` Stripe price id(s): ${best.priceIds.join(', ')}.`
        : '';
    return NextResponse.json({
      ok: true,
      synced: true,
      message: `Vault+ linked to your account. Refresh if the UI has not updated.${priceHint}`,
    });
  } catch (e: any) {
    console.error('sync-subscription error:', e);
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 });
  }
}
